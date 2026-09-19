import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Router } from 'express';
import mysql, { type ResultSetHeader } from 'mysql2/promise';
import { daysBetween } from '../core/cycleEngine.ts';
import { pool } from '../db.ts';
import { refreshUpcomingPlan } from '../planStore.ts';
import { demoUserId, loadUser, localToday } from '../users.ts';

export const accountRouter = Router();

const SEED_FILE = new URL('../../../database/healthher_02_seed.sql', import.meta.url);

const GOALS = ['STRENGTH', 'MUSCLE_GAIN', 'ENDURANCE', 'FAT_LOSS', 'GENERAL_FITNESS'] as const;
const BIRTH_CONTROL = ['NONE', 'COMBINED_PILL', 'MINI_PILL', 'HORMONAL_IUD', 'COPPER_IUD',
  'IMPLANT', 'INJECTION', 'RING', 'PATCH', 'OTHER'] as const;
const REGULARITY = ['REGULAR', 'IRREGULAR', 'UNKNOWN'] as const;
// Copper IUD is the one non-hormonal method, so her natural phases still run.
const NON_HORMONAL = new Set(['NONE', 'COPPER_IUD']);

class BadRequest extends Error {}

// The "see the demo" button: reload Maya from the seed file so her dates
// line up with today, then save her upcoming plan with learning applied.
accountRouter.post('/demo/reset', async (_req, res) => {
  const sql = await readFile(SEED_FILE, 'utf8');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'herbalance',
    multipleStatements: true,
  });
  try {
    await conn.query(sql);
  } finally {
    await conn.end();
  }

  const ctx = await loadUser(await demoUserId());
  await refreshUpcomingPlan(ctx);
  res.json({ userId: ctx.userId, firstName: ctx.firstName, isDemo: true });
});

interface OnboardingBody {
  firstName?: unknown;
  goal?: unknown;
  daysPerWeek?: unknown;
  birthControl?: unknown;
  lastPeriodStart?: unknown;
  cycleLength?: unknown;       // null = "not sure"
  regularity?: unknown;
}

function pick<T extends readonly string[]>(value: unknown, options: T, field: string): T[number] {
  if (typeof value !== 'string' || !options.includes(value)) throw new BadRequest(`${field} must be one of ${options.join(', ')}`);
  return value as T[number];
}

accountRouter.post('/onboarding', async (req, res) => {
  const body = req.body as OnboardingBody;
  const today = localToday();
  let input;
  try {
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim().slice(0, 50) : '';
    if (!firstName) throw new BadRequest('firstName is required');

    const daysPerWeek = Number(body.daysPerWeek);
    if (!Number.isInteger(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7) throw new BadRequest('daysPerWeek must be 1-7');

    const birthControl = pick(body.birthControl, BIRTH_CONTROL, 'birthControl');
    const suppressed = !NON_HORMONAL.has(birthControl);

    let lastPeriodStart: string | null = null;
    if (body.lastPeriodStart !== null && body.lastPeriodStart !== undefined && body.lastPeriodStart !== '') {
      if (typeof body.lastPeriodStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.lastPeriodStart)) {
        throw new BadRequest('lastPeriodStart must be YYYY-MM-DD');
      }
      const ago = daysBetween(body.lastPeriodStart, today);
      if (ago < 0) throw new BadRequest('lastPeriodStart cannot be in the future');
      if (ago > 120) throw new BadRequest('lastPeriodStart must be within the last 120 days');
      lastPeriodStart = body.lastPeriodStart;
    } else if (!suppressed) {
      throw new BadRequest('lastPeriodStart is required unless on hormonal birth control');
    }

    const unsureLength = body.cycleLength === null || body.cycleLength === undefined;
    const cycleLength = unsureLength ? 28 : Number(body.cycleLength);
    if (!Number.isInteger(cycleLength) || cycleLength < 21 || cycleLength > 45) throw new BadRequest('cycleLength must be 21-45');

    input = {
      firstName,
      goal: pick(body.goal, GOALS, 'goal'),
      daysPerWeek,
      birthControl,
      suppressed,
      lastPeriodStart,
      cycleLength,
      regularity: unsureLength ? 'UNKNOWN' : pick(body.regularity ?? 'REGULAR', REGULARITY, 'regularity'),
    };
  } catch (err) {
    if (err instanceof BadRequest) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  const conn = await pool.getConnection();
  let userId: number;
  try {
    await conn.beginTransaction();
    // No login for the hackathon: a placeholder email keeps users.email unique.
    const [user] = await conn.query<ResultSetHeader>(
      `INSERT INTO users (first_name, email, password) VALUES (?, ?, 'no-login')`,
      [input.firstName, `guest-${randomUUID()}@healthher.app`],
    );
    userId = user.insertId;

    await conn.query(
      `INSERT INTO cycle_profiles
         (user_id, last_period_start_date, avg_cycle_length_days, avg_period_length_days, cycle_regularity,
          birth_control, cycle_suppressed, goal, training_days_per_week, experience_level, onboarding_completed)
       VALUES (?, ?, ?, 5, ?, ?, ?, ?, ?, 'BEGINNER', TRUE)`,
      [userId, input.lastPeriodStart, input.cycleLength, input.regularity, input.birthControl,
        input.suppressed, input.goal, input.daysPerWeek],
    );

    if (input.lastPeriodStart) {
      await conn.query(
        `INSERT INTO cycles (user_id, cycle_start_date, period_length_days, notes) VALUES (?, ?, 5, 'From onboarding')`,
        [userId, input.lastPeriodStart],
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Her first plan: textbook only, since there's nothing to learn from yet.
  await refreshUpcomingPlan(await loadUser(userId, today));
  res.status(201).json({ userId, firstName: input.firstName, isDemo: false });
});
