import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { addDays, dayInfo, daysBetween, resolveCycleLength } from '../core/cycleEngine.ts';
import { pool } from '../db.ts';
import { refreshUpcomingPlan } from '../planStore.ts';
import { DEMO_EMAIL, loadUser, localToday, parseWeekdays } from '../users.ts';

export const userRouter = Router();

userRouter.get('/me', async (_req, res) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT u.user_id, u.first_name, u.last_name, u.email = ? AS is_demo,
            p.last_period_start_date, p.avg_cycle_length_days, p.avg_period_length_days,
            p.cycle_regularity, p.birth_control, p.cycle_suppressed,
            p.goal, p.training_days_per_week, p.experience_level, p.onboarding_completed,
            (SELECT COUNT(*) FROM cycles c        WHERE c.user_id = u.user_id)                          AS cycles,
            (SELECT COUNT(*) FROM training_plans t WHERE t.user_id = u.user_id)                         AS plans,
            (SELECT COUNT(*) FROM session_logs s  WHERE s.user_id = u.user_id AND s.status <> 'PLANNED') AS sessions_logged
     FROM   users u
     LEFT   JOIN cycle_profiles p ON p.user_id = u.user_id
     WHERE  u.user_id = ?`,
    [DEMO_EMAIL, res.locals.userId],
  );
  if (rows.length === 0) {
    res.status(404).json({ error: `User ${res.locals.userId} not found.` });
    return;
  }
  res.json(rows[0]);
});

// Settings: the days she can train. Changing them replans everything she
// hasn't logged yet, so the plan works around her week.
userRouter.get('/settings', async (_req, res) => {
  const ctx = await loadUser(res.locals.userId);
  res.json({ weekdays: ctx.athlete.weekdays ?? null, daysPerWeek: ctx.daysPerWeek });
});

userRouter.post('/settings', async (req, res) => {
  let weekdays: number[] | null;
  try {
    weekdays = parseWeekdays((req.body as { weekdays?: unknown }).weekdays);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }
  if (!weekdays) {
    res.status(400).json({ error: 'Pick at least one day' });
    return;
  }
  await pool.query(
    'UPDATE cycle_profiles SET training_weekdays = ?, training_days_per_week = ? WHERE user_id = ?',
    [weekdays.join(','), weekdays.length, res.locals.userId],
  );
  const ctx = await loadUser(res.locals.userId);
  await refreshUpcomingPlan(ctx);
  res.json({ weekdays, daysPerWeek: weekdays.length });
});

// "My period started": the contingency for a cycle that runs shorter or
// longer than her average. Closes the current cycle, starts a new one on
// that date, updates her average from her completed cycles, re-dates any
// sessions since then, and replans.
const MIN_GAP_DAYS = 18; // anything sooner is more likely a mistyped date than a new cycle

userRouter.post('/period', async (req, res) => {
  const date = (req.body as { date?: unknown }).date;
  const today = localToday();
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    return;
  }
  if (date > today) {
    res.status(400).json({ error: "That date hasn't happened yet" });
    return;
  }
  if (daysBetween(date, today) > 120) {
    res.status(400).json({ error: 'Pick a date in the last 120 days' });
    return;
  }

  const userId: number = res.locals.userId;
  const before = await loadUser(userId);
  const current = before.lastPeriodStart;
  if (current && date <= current) {
    res.status(400).json({ error: `Your last period is already logged from ${current}` });
    return;
  }
  if (current && daysBetween(current, date) < MIN_GAP_DAYS) {
    res.status(400).json({ error: `That's only ${daysBetween(current, date)} days after your last period started. Check the date?` });
    return;
  }

  const conn = await pool.getConnection();
  let cycleLength: number;
  try {
    await conn.beginTransaction();
    await conn.query(
      'UPDATE cycles SET cycle_end_date = ? WHERE user_id = ? AND cycle_end_date IS NULL AND cycle_start_date < ?',
      [addDays(date, -1), userId, date],
    );
    await conn.query(
      `INSERT INTO cycles (user_id, cycle_start_date, period_length_days, notes) VALUES (?, ?, 5, 'Logged in the app')`,
      [userId, date],
    );
    const [lengths] = await conn.query<RowDataPacket[]>(
      `SELECT DATEDIFF(cycle_end_date, cycle_start_date) + 1 AS len FROM cycles
       WHERE user_id = ? AND cycle_end_date IS NOT NULL ORDER BY cycle_start_date`,
      [userId],
    );
    // Her average follows her last three completed cycles once there are two.
    cycleLength = Math.min(45, Math.max(21, resolveCycleLength(before.cycleInput.cycleLength, lengths.map((r) => Number(r.len)))));
    await conn.query(
      'UPDATE cycle_profiles SET last_period_start_date = ?, avg_cycle_length_days = ? WHERE user_id = ?',
      [date, cycleLength, userId],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Sessions from that date on were dated against the old cycle: re-date them.
  const after = await loadUser(userId);
  const [sessions] = await pool.query<RowDataPacket[]>(
    `SELECT session_log_id AS id, DATE_FORMAT(session_date, '%Y-%m-%d') AS date FROM session_logs
     WHERE user_id = ? AND session_date >= ?`,
    [userId, date],
  );
  for (const s of sessions) {
    const info = dayInfo(after.cycleInput, s.date);
    if (info) await pool.query('UPDATE session_logs SET cycle_day = ?, phase = ? WHERE session_log_id = ?', [info.day, info.phase, s.id]);
  }
  await refreshUpcomingPlan(await loadUser(userId));

  res.json({
    cycleDay: after.cycle.cycleDay,
    cycleLength,
    previousLength: current ? daysBetween(current, date) : null,
  });
});
