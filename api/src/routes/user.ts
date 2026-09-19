import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../db.ts';
import { DEMO_EMAIL } from '../users.ts';

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
