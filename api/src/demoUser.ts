// Loads the demo user's profile and sessions in the shapes the core modules
// take. No auth for the hackathon: every request acts as the demo user.
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

export interface DemoContext {
  userId: number;
  today: string;
  goal: Goal;
  daysPerWeek: number;
  cycleInput: CycleInput;
  cycle: CycleState;
  sessions: LoggedSession[];
  pattern: LearnedPattern;
}

export async function loadDemo(today = localToday()): Promise<DemoContext> {
  const [profiles] = await pool.query<RowDataPacket[]>(
    `SELECT u.user_id, p.last_period_start_date, p.avg_cycle_length_days, p.avg_period_length_days,
            p.cycle_regularity, p.cycle_suppressed, p.goal, p.training_days_per_week
     FROM   users u JOIN cycle_profiles p ON p.user_id = u.user_id
     WHERE  u.email = ?`,
    [DEMO_EMAIL],
  );
  const profile = profiles[0];
  if (!profile) throw new NotFoundError(`No cycle profile for ${DEMO_EMAIL}. Run database/healthher_02_seed.sql.`);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT session_date AS sessionDate, cycle_day AS cycleDay, status,
            energy_level AS energy, perceived_effort AS effort, planned_intensity AS plannedIntensity
     FROM   session_logs WHERE user_id = ? ORDER BY session_date`,
    [profile.user_id],
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
    userId: profile.user_id,
    today,
    goal: profile.goal,
    daysPerWeek: profile.training_days_per_week,
    cycleInput,
    cycle,
    sessions,
    pattern: learnedPattern(sessions, today, cycle.confidence),
  };
}
