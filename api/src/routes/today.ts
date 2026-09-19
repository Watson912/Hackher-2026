import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { cycleWeekOf } from '../core/cycleEngine.ts';
import { WEEKS, type LearnedPattern } from '../core/learning.ts';
import rules from '../core/rules.json' with { type: 'json' };
import type { CycleWeek, Intensity } from '../core/types.ts';
import { pool } from '../db.ts';
import { refreshUpcomingPlan } from '../planStore.ts';
import { loadUser, type UserContext } from '../users.ts';

export const todayRouter = Router();

const SESSION_COLUMNS = `session_log_id AS id, DATE_FORMAT(session_date, '%Y-%m-%d') AS date, cycle_day AS cycleDay,
  phase, session_type AS sessionType, planned_intensity AS intensity, planned_duration_min AS durationMin,
  focus, status, energy_level AS energy, perceived_effort AS effort, plan_id AS planId`;

/** How far the app has got learning her, as one number: average confidence across the 4 weeks. */
const tunedPct = (pattern: LearnedPattern) =>
  Math.round((WEEKS.reduce((sum, w) => sum + pattern[w].confidence, 0) / WEEKS.length) * 100);

const learns = (ctx: UserContext) => ctx.cycle.phase !== 'SUPPRESSED' && ctx.cycle.phase !== 'UNKNOWN';

function learningStatus(ctx: UserContext, week: CycleWeek | null) {
  if (!week || !learns(ctx)) return null;
  const w = ctx.pattern[week];
  // The next week of the cycle the app has changed, so Today can say so.
  const next = WEEKS.map((n) => ctx.pattern[(((week - 1 + n) % 4) + 1) as CycleWeek]).find((p) => p.adjustment !== 0 && p.week !== week);
  return {
    nextChange: next ? { week: next.week, adjustment: next.adjustment, reason: next.reason } : null,
    week,
    sessions: w.sessions,
    needed: rules.learning.minSessions,
    adjustment: w.adjustment,
    reason: w.reason,
    tunedPct: tunedPct(ctx.pattern),
  };
}

todayRouter.get('/today', async (_req, res) => {
  const ctx = await loadUser(res.locals.userId);
  const { days, ...cycle } = ctx.cycle;

  const [todayRows] = await pool.query<RowDataPacket[]>(
    `SELECT ${SESSION_COLUMNS} FROM session_logs WHERE user_id = ? AND session_date = ? ORDER BY session_log_id LIMIT 1`,
    [ctx.userId, ctx.today],
  );
  const [upcoming] = await pool.query<RowDataPacket[]>(
    `SELECT ${SESSION_COLUMNS} FROM session_logs
     WHERE user_id = ? AND session_date > ? AND status = 'PLANNED' ORDER BY session_date LIMIT 4`,
    [ctx.userId, ctx.today],
  );

  // The saved plan keeps the textbook version of each session and the
  // nutrition notes for the block.
  const session = todayRows[0] ?? null;
  let textbook = null;
  let nutrition: string | null = null;
  if (session?.planId) {
    const [plans] = await pool.query<RowDataPacket[]>('SELECT plan_json, nutrition_notes FROM training_plans WHERE plan_id = ?', [session.planId]);
    nutrition = plans[0]?.nutrition_notes ?? null;
    const planned = plans[0]?.plan_json?.sessions?.find((s: { date: string }) => s.date === ctx.today);
    if (planned?.adjusted) textbook = planned.textbook;
  }

  const adjustedWeek = (cycleDay: number | null) =>
    learns(ctx) && cycleDay !== null && ctx.pattern[cycleWeekOf(cycleDay)].adjustment !== 0;

  res.json({
    today: ctx.today,
    firstName: ctx.firstName,
    isDemo: ctx.isDemo,
    cycle,
    session: session && { ...session, textbook, nutrition },
    upcoming: upcoming.map((s) => ({ ...s, adjusted: adjustedWeek(s.cycleDay) })),
    learning: learningStatus(ctx, ctx.cycle.cycleWeek),
  });
});

const EFFORT_OFFSET = { EASIER: -2, RIGHT: 0, HARDER: 2 } as const;
type EffortAnswer = keyof typeof EFFORT_OFFSET;

// The three-tap log: how it went, energy, and effort relative to the plan.
todayRouter.post('/sessions/:id/log', async (req, res) => {
  const { status, energy, effort } = req.body as { status?: string; energy?: number; effort?: EffortAnswer | null };
  if (!status || !['COMPLETED', 'PARTIAL', 'SKIPPED'].includes(status)) {
    res.status(400).json({ error: 'status must be COMPLETED, PARTIAL or SKIPPED' });
    return;
  }
  if (!Number.isInteger(energy) || energy! < 1 || energy! > 5) {
    res.status(400).json({ error: 'energy must be 1-5' });
    return;
  }
  if (status !== 'SKIPPED' && (!effort || !(effort in EFFORT_OFFSET))) {
    res.status(400).json({ error: 'effort must be EASIER, RIGHT or HARDER' });
    return;
  }

  const userId: number = res.locals.userId;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${SESSION_COLUMNS} FROM session_logs WHERE session_log_id = ? AND user_id = ?`,
    [req.params.id, userId],
  );
  const session = rows[0];
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const before = await loadUser(userId);
  const rpe = status === 'SKIPPED' ? null
    : Math.min(10, Math.max(1, rules.expectedEffort[session.intensity as Intensity] + EFFORT_OFFSET[effort!]));
  const minutes = status === 'SKIPPED' ? null
    : status === 'PARTIAL' ? Math.round((session.durationMin ?? 0) / 2) : session.durationMin;

  await pool.query<ResultSetHeader>(
    `UPDATE session_logs SET status = ?, energy_level = ?, perceived_effort = ?, actual_duration_min = ?, logged_at = NOW()
     WHERE session_log_id = ? AND user_id = ?`,
    [status, energy, rpe, minutes, session.id, userId],
  );

  // Learn from it straight away, and replan what's coming.
  const after = await loadUser(userId);
  await refreshUpcomingPlan(after);

  const week = session.cycleDay ? cycleWeekOf(session.cycleDay) : null;
  let feedback = 'Logged.';
  let planChanged = false;
  if (week && after.cycle.phase !== 'SUPPRESSED' && after.cycle.phase !== 'UNKNOWN') {
    const was = before.pattern[week];
    const now = after.pattern[week];
    const change = `${Math.round(Math.abs(now.adjustment) * 100)}% ${now.adjustment < 0 ? 'lighter' : 'harder'}`;
    planChanged = was.adjustment !== now.adjustment;

    if (now.sessions < rules.learning.minSessions) {
      const left = rules.learning.minSessions - now.sessions;
      feedback = `Logged. ${left} more week-${week} session${left === 1 ? '' : 's'} and we'll start learning your week ${week}.`;
    } else if (planChanged && now.adjustment !== 0) {
      feedback = `Logged. We've updated your plan: week ${week} is now ${change} than the textbook.`;
    } else if (now.adjustment !== 0) {
      feedback = `Logged. That's ${now.sessions} week-${week} sessions, and it still points the same way: week ${week} stays ${change}.`;
    } else {
      feedback = `Logged. That's ${now.sessions} week-${week} sessions, and your week ${week} matches the textbook so far.`;
    }
  }

  res.json({ feedback, planChanged, learning: learningStatus(after, week) });
});
