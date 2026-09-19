// Loads a user's profile and sessions in the shapes the core modules take.
// No auth for the hackathon: the client names its user in the x-user-id
// header, and requests without one act as the demo user (Maya).
import type { NextFunction, Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2';
import { computeCycle } from './core/cycleEngine.ts';
import { learnedPattern, type LearnedPattern, type LoggedSession } from './core/learning.ts';
import type { Goal } from './core/planGenerator.ts';
import type { CycleInput, CycleState } from './core/types.ts';
import { pool } from './db.ts';

export const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@healthher.app';

export class NotFoundError extends Error {}

/** Today in the server's local timezone, as YYYY-MM-DD (matches MySQL CURDATE()). */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function demoUserId(): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT user_id FROM users WHERE email = ?', [DEMO_EMAIL]);
  if (!rows[0]) throw new NotFoundError(`Demo user ${DEMO_EMAIL} not found. Run database/healthher_02_seed.sql.`);
  return rows[0].user_id;
}

/** Express middleware: puts the requesting user's id on res.locals.userId. */
export async function resolveUser(req: Request, res: Response, next: NextFunction) {
  const header = req.header('x-user-id');
  res.locals.userId = header && /^\d+$/.test(header) ? Number(header) : await demoUserId();
  next();
}

export interface UserContext {
  userId: number;
  firstName: string;
  isDemo: boolean;
  today: string;
  goal: Goal;
  daysPerWeek: number;
  cycleId: number | null;
  cycleInput: CycleInput;
  cycle: CycleState;
  sessions: LoggedSession[];
  pattern: LearnedPattern;
}

export async function loadUser(userId: number, today = localToday()): Promise<UserContext> {
  const [profiles] = await pool.query<RowDataPacket[]>(
    `SELECT u.user_id, u.first_name, u.email, p.last_period_start_date, p.avg_cycle_length_days,
            p.avg_period_length_days, p.cycle_regularity, p.cycle_suppressed, p.goal, p.training_days_per_week,
            (SELECT c.cycle_id FROM cycles c WHERE c.user_id = u.user_id AND c.cycle_end_date IS NULL
             ORDER BY c.cycle_start_date DESC LIMIT 1) AS cycle_id
     FROM   users u JOIN cycle_profiles p ON p.user_id = u.user_id
     WHERE  u.user_id = ?`,
    [userId],
  );
  const profile = profiles[0];
  if (!profile) throw new NotFoundError(`No user ${userId} with a cycle profile. Start onboarding again.`);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT session_date AS sessionDate, cycle_day AS cycleDay, status,
            energy_level AS energy, perceived_effort AS effort, planned_intensity AS plannedIntensity
     FROM   session_logs WHERE user_id = ? ORDER BY session_date`,
    [userId],
  );

  const cycleInput: CycleInput = {
    lastPeriodStart: profile.last_period_start_date,
    cycleLength: profile.avg_cycle_length_days,
    periodLength: profile.avg_period_length_days,
    regularity: profile.cycle_regularity,
    suppressed: Boolean(profile.cycle_suppressed),
    today,
  };
  const cycle = computeCycle(cycleInput);
  const sessions = rows as LoggedSession[];

  return {
    userId,
    firstName: profile.first_name,
    isDemo: profile.email === DEMO_EMAIL,
    today,
    goal: profile.goal,
    daysPerWeek: profile.training_days_per_week,
    cycleId: profile.cycle_id,
    cycleInput,
    cycle,
    sessions,
    pattern: learnedPattern(sessions, today, cycle.confidence),
  };
}
