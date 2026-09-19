// Loads a user's profile and sessions in the shapes the core modules take.
// No auth for the hackathon: the client names its user in the x-user-id
// header, and requests without one act as the demo user (Maya).
import type { NextFunction, Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2';
import { computeCycle, holdIfLate } from './core/cycleEngine.ts';
import { learnedPattern, type LearnedPattern, type LoggedSession } from './core/learning.ts';
import { ageOn } from './core/nutrition.ts';
import type { Athlete, Goal, LiftHistory } from './core/planGenerator.ts';
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
  consistency: string | null;     // NEVER | RETURNING | STRUGGLING | CONSISTENT
  athlete: Athlete;               // weight and experience, for loads
  body: { heightCm: number | null; weightKg: number | null; goalWeightKg: number | null; age: number | null };
  cycleId: number | null;
  cycleInput: CycleInput;         // with a late period held (see holdIfLate)
  lastPeriodStart: string | null; // what she actually logged
  periodLate: { daysLate: number; dueDate: string } | null;
  cycle: CycleState;
  sessions: LoggedSession[];
  pattern: LearnedPattern;
}

/**
 * The days she can train, as sorted weekday numbers (0 = Sunday), or null
 * for no preference. Throws on anything else. Stored as '1,3,5'.
 */
export function parseWeekdays(value: unknown): number[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > 7
    || value.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new RangeError('weekdays must be a list of 1-7 days, 0 (Sunday) to 6 (Saturday)');
  }
  return [...new Set(value as number[])].sort((a, b) => a - b);
}

/** DECIMAL columns arrive as strings; NULL stays null. */
const toNumber = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function loadUser(userId: number, today = localToday()): Promise<UserContext> {
  const [profiles] = await pool.query<RowDataPacket[]>(
    `SELECT u.user_id, u.first_name, u.email, p.last_period_start_date, p.avg_cycle_length_days,
            p.avg_period_length_days, p.cycle_regularity, p.cycle_suppressed, p.goal, p.training_days_per_week, p.experience_level, p.weight_kg, p.goal_weight_kg, p.equipment_tier, p.training_consistency, p.training_weekdays,
            u.height_cm, DATE_FORMAT(u.date_of_birth, '%Y-%m-%d') AS date_of_birth,
            (SELECT c.cycle_id FROM cycles c WHERE c.user_id = u.user_id AND c.cycle_end_date IS NULL
             ORDER BY c.cycle_start_date DESC LIMIT 1) AS cycle_id
     FROM   users u JOIN cycle_profiles p ON p.user_id = u.user_id
     WHERE  u.user_id = ?`,
    [userId],
  );
  const profile = profiles[0];
  if (!profile) throw new NotFoundError(`No user ${userId} with a cycle profile. Start onboarding again.`);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DATE_FORMAT(session_date, '%Y-%m-%d') AS sessionDate, cycle_day AS cycleDay, phase, status,
            fatigue, perceived_effort AS rpe, actual_duration_min AS durationMin,
            planned_duration_min AS plannedDurationMin, planned_intensity AS plannedIntensity
     FROM   session_logs WHERE user_id = ? ORDER BY session_date`,
    [userId],
  );

  // Completed cycles, oldest first, so the engine can judge how much her length varies.
  // Every lift she has logged, newest first, for load progression.
  const [lifts] = await pool.query<RowDataPacket[]>(
    `SELECT exercise_id, DATE_FORMAT(log_date, '%Y-%m-%d') AS log_date, load_kg, load_pct, completed, rpe
     FROM exercise_logs WHERE user_id = ? ORDER BY log_date DESC, exercise_log_id DESC`,
    [userId],
  );
  const history: LiftHistory = {};
  for (const l of lifts) {
    (history[l.exercise_id] ??= []).push({
      date: l.log_date,
      loadKg: toNumber(l.load_kg),
      loadPct: toNumber(l.load_pct),
      completed: Boolean(l.completed),
      rpe: Number(l.rpe),
    });
  }

  // Her equipment checklist and remembered swaps.
  const [equipmentRows] = await pool.query<RowDataPacket[]>('SELECT equipment FROM user_equipment WHERE user_id = ?', [userId]);
  const [swapRows] = await pool.query<RowDataPacket[]>('SELECT exercise_id, swap_to_id FROM exercise_swaps WHERE user_id = ?', [userId]);

  const [lengths] = await pool.query<RowDataPacket[]>(
    `SELECT DATEDIFF(cycle_end_date, cycle_start_date) + 1 AS len FROM cycles
     WHERE user_id = ? AND cycle_end_date IS NOT NULL ORDER BY cycle_start_date`,
    [userId],
  );

  const logged: CycleInput = {
    lastPeriodStart: profile.last_period_start_date,
    cycleLength: profile.avg_cycle_length_days,
    periodLength: profile.avg_period_length_days,
    regularity: profile.cycle_regularity,
    suppressed: Boolean(profile.cycle_suppressed),
    today,
    observedLengths: lengths.map((r) => Number(r.len)),
  };
  // Past her expected length with no new period logged: hold on the last day.
  const late = holdIfLate(logged);
  const cycleInput = late.input;
  const cycle = computeCycle(cycleInput);
  const sessions = rows as LoggedSession[];

  return {
    userId,
    firstName: profile.first_name,
    isDemo: profile.email === DEMO_EMAIL,
    today,
    goal: profile.goal,
    daysPerWeek: profile.training_days_per_week,
    consistency: profile.training_consistency,
    athlete: {
      weightKg: toNumber(profile.weight_kg),
      experience: profile.experience_level,
      equipmentTier: profile.equipment_tier,
      equipment: equipmentRows.length ? equipmentRows.map((r) => r.equipment as string) : null,
      history,
      swaps: Object.fromEntries(swapRows.map((r) => [r.exercise_id, r.swap_to_id])),
      weekdays: profile.training_weekdays ? String(profile.training_weekdays).split(',').map(Number) : null,
    },
    body: {
      heightCm: toNumber(profile.height_cm),
      weightKg: toNumber(profile.weight_kg),
      goalWeightKg: toNumber(profile.goal_weight_kg),
      age: profile.date_of_birth ? ageOn(profile.date_of_birth, today) : null,
    },
    cycleId: profile.cycle_id,
    cycleInput,
    lastPeriodStart: logged.lastPeriodStart,
    periodLate: late.daysLate !== null ? { daysLate: late.daysLate, dueDate: late.dueDate! } : null,
    cycle,
    sessions,
    pattern: learnedPattern(sessions, today, cycle.confidence),
  };
}
