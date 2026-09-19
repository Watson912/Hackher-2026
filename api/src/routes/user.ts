import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../db.ts';

export const userRouter = Router();

// No auth for the hackathon: every request acts as the demo user.
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@healthher.app';

userRouter.get('/me', async (_req, res) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT u.user_id, u.first_name, u.last_name, u.email,
            p.last_period_start_date, p.avg_cycle_length_days, p.avg_period_length_days,
            p.cycle_regularity, p.birth_control, p.cycle_suppressed,
            p.goal, p.training_days_per_week, p.experience_level, p.onboarding_completed,
            (SELECT COUNT(*) FROM cycles c        WHERE c.user_id = u.user_id)                          AS cycles,
            (SELECT COUNT(*) FROM training_plans t WHERE t.user_id = u.user_id)                         AS plans,
            (SELECT COUNT(*) FROM session_logs s  WHERE s.user_id = u.user_id AND s.status <> 'PLANNED') AS sessions_logged
     FROM   users u
     LEFT   JOIN cycle_profiles p ON p.user_id = u.user_id
     WHERE  u.email = ?`,
    [DEMO_EMAIL],
  );
  if (rows.length === 0) {
    res.status(404).json({ error: `Demo user ${DEMO_EMAIL} not found. Run database/healthher_02_seed.sql.` });
    return;
  }
  res.json(rows[0]);
});
