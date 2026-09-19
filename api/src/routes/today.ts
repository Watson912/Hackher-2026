import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { computeCycle } from '../core/cycleEngine.ts';
import { pool } from '../db.ts';
import { DEMO_EMAIL } from './user.ts';

export const todayRouter = Router();

/** Today in the server's local timezone, as YYYY-MM-DD (matches MySQL CURDATE()). */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

todayRouter.get('/today', async (_req, res) => {
  const [profiles] = await pool.query<RowDataPacket[]>(
    `SELECT u.user_id, p.last_period_start_date, p.avg_cycle_length_days, p.avg_period_length_days,
            p.cycle_regularity, p.cycle_suppressed
     FROM   users u JOIN cycle_profiles p ON p.user_id = u.user_id
     WHERE  u.email = ?`,
    [DEMO_EMAIL],
  );
  const profile = profiles[0];
  if (!profile) {
    res.status(404).json({ error: 'No cycle profile for the demo user. Run database/healthher_02_seed.sql.' });
    return;
  }

  const today = localToday();
  const { days, ...cycle } = computeCycle({
    lastPeriodStart: profile.last_period_start_date,
    cycleLength: profile.avg_cycle_length_days,
    periodLength: profile.avg_period_length_days,
    regularity: profile.cycle_regularity,
    suppressed: Boolean(profile.cycle_suppressed),
    today,
  });

  const [sessions] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM v_today_session WHERE user_id = ?',
    [profile.user_id],
  );

  res.json({ today, cycle, days, session: sessions[0] ?? null });
});
