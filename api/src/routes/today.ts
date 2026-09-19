import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../db.ts';
import { loadDemo } from '../demoUser.ts';

export const todayRouter = Router();

todayRouter.get('/today', async (_req, res) => {
  const { userId, today, cycle } = await loadDemo();
  const { days, ...state } = cycle;

  const [sessions] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM v_today_session WHERE user_id = ?',
    [userId],
  );

  res.json({ today, cycle: state, days, session: sessions[0] ?? null });
});
