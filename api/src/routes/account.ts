import { readFile } from 'node:fs/promises';
import { Router } from 'express';
import mysql, { type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { bearer, fetchProfile } from '../auth.ts';
import { daysBetween } from '../core/cycleEngine.ts';
import { allowedEquipment, EQUIPMENT_ITEMS, exercisesFor } from '../core/planGenerator.ts';
import { pool } from '../db.ts';
import { refreshUpcomingPlan } from '../planStore.ts';
import { demoUserId, loadUser, localToday, parseWeekdays } from '../users.ts';

export const accountRouter = Router();

const SEED_FILE = new URL('../../../database/healthher_02_seed.sql', import.meta.url);

const GOALS = ['STRENGTH', 'MUSCLE_GAIN', 'ENDURANCE', 'FAT_LOSS', 'GENERAL_FITNESS'] as const;
const BIRTH_CONTROL = ['NONE', 'COMBINED_PILL', 'MINI_PILL', 'HORMONAL_IUD', 'COPPER_IUD',
  'IMPLANT', 'INJECTION', 'RING', 'PATCH', 'OTHER'] as const;
const REGULARITY = ['REGULAR', 'IRREGULAR', 'UNKNOWN'] as const;
const EQUIPMENT = ['FULL_GYM', 'DUMBBELLS_HOME', 'BODYWEIGHT'] as const;
const EXPERIENCE = ['NEW', 'UNDER_1', '1_2', '2_4', '4_PLUS'] as const;
const CONSISTENCY = ['NEVER', 'RETURNING', 'STRUGGLING', 'CONSISTENT'] as const;
const LEVEL = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;

/**
 * Years of strength training sets her level (it picks the novice or
 * intermediate starting loads in exercises.json). If she has never trained
 * consistently or is coming back from a break, start one level lower: her
 * logged lifts take over after the first session anyway.
 */
function experienceLevel(years: (typeof EXPERIENCE)[number], consistency: (typeof CONSISTENCY)[number] | null) {
  const base = years === '4_PLUS' ? 2 : years === '1_2' || years === '2_4' ? 1 : 0;
  const down = consistency === 'NEVER' || consistency === 'RETURNING' ? 1 : 0;
  return LEVEL[Math.max(0, base - down)];
}
// Copper IUD is the one non-hormonal method, so her natural phases still run.
const NON_HORMONAL = new Set(['NONE', 'COPPER_IUD']);

class BadRequest extends Error {}

// The "see the demo" button: reload Maya from the seed file so her dates
// line up with today, then save her upcoming plan with learning applied.
accountRouter.post('/demo/reset', async (req, res) => {
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

  // Re-seeding rebuilds Maya's row, which drops the auth0_sub link. Point it
  // back at whoever is signed in, so the next request resolves to her.
  const userId = await demoUserId();
  await pool.query('UPDATE users SET auth0_sub = ? WHERE user_id = ?', [req.auth!.payload.sub, userId]);

  const ctx = await loadUser(userId);
  await refreshUpcomingPlan(ctx);
  res.json({ userId: ctx.userId, firstName: ctx.firstName, isDemo: true });
});

// The equipment checklist for onboarding: every item the exercise library
// uses, and what each tier preset ticks (exercises.json meta.equipmentTiers).
accountRouter.get('/equipment', (_req, res) => {
  const items = EQUIPMENT_ITEMS.filter((item) => item !== 'none');
  const preset = (tier: (typeof EQUIPMENT)[number]) => (allowedEquipment(tier) ?? items).filter((item) => item !== 'none');
  // How many exercises each item appears in, so the checklist can say what it unlocks.
  const counts = Object.fromEntries(items.map((item) => [item, exercisesFor('FULL_GYM').filter((e) => e.equipment.includes(item)).length]));
  res.json({ items, counts, presets: Object.fromEntries(EQUIPMENT.map((tier) => [tier, preset(tier)])) });
});

interface OnboardingBody {
  firstName?: unknown;
  goal?: unknown;
  daysPerWeek?: unknown;
  birthControl?: unknown;
  lastPeriodStart?: unknown;
  cycleLength?: unknown;       // null = "not sure"
  regularity?: unknown;
  heightCm?: unknown;
  weightKg?: unknown;
  age?: unknown;
  goalWeightKg?: unknown;      // optional
  equipmentTier?: unknown;
  equipment?: unknown;         // optional checklist of exercises.json equipment ids
  experience?: unknown;        // years of strength training, optional (skip = NEW)
  consistency?: unknown;       // optional
  weekdays?: unknown;          // the days she can train, 0 = Sunday; optional
}

/** A number within [min, max], or a clear 400. Optional fields may be null/absent. */
function measure(value: unknown, field: string, min: number, max: number, optional = false): number | null {
  if (optional && (value === null || value === undefined || value === '')) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new BadRequest(`${field} must be between ${min} and ${max}`);
  return Math.round(n * 10) / 10;
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

    let weekdays: number[] | null;
    try {
      weekdays = parseWeekdays(body.weekdays);
    } catch (err) {
      throw new BadRequest((err as Error).message);
    }
    const daysPerWeek = weekdays ? weekdays.length : Number(body.daysPerWeek);
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

    const age = measure(body.age, 'age', 13, 90)!;
    const years = pick(body.experience ?? 'NEW', EXPERIENCE, 'experience');
    const consistency = body.consistency === null || body.consistency === undefined ? null : pick(body.consistency, CONSISTENCY, 'consistency');
    let equipment: string[] = [];
    if (body.equipment !== null && body.equipment !== undefined) {
      if (!Array.isArray(body.equipment) || body.equipment.some((e) => typeof e !== 'string' || !EQUIPMENT_ITEMS.includes(e))) {
        throw new BadRequest(`equipment must be a list of: ${EQUIPMENT_ITEMS.join(', ')}`);
      }
      equipment = [...new Set(body.equipment as string[])];
    }
    input = {
      firstName,
      heightCm: measure(body.heightCm, 'heightCm', 120, 220)!,
      weightKg: measure(body.weightKg, 'weightKg', 30, 250)!,
      goalWeightKg: measure(body.goalWeightKg, 'goalWeightKg', 30, 250, true),
      // Only her age is asked for; store a date of birth that gives that age today.
      dateOfBirth: `${Number(today.slice(0, 4)) - age}${today.slice(4).replace('-02-29', '-02-28')}`,
      equipmentTier: pick(body.equipmentTier ?? 'FULL_GYM', EQUIPMENT, 'equipmentTier'),
      goal: pick(body.goal ?? 'GENERAL_FITNESS', GOALS, 'goal'),
      experienceLevel: experienceLevel(years, consistency),
      consistency,
      equipment,
      daysPerWeek,
      weekdays,
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

  // The account belongs to the Auth0 identity that asked for it. Her email
  // comes from Auth0, not the form, so it can't be claimed by typing it.
  const sub = req.auth!.payload.sub!;
  const profile = await fetchProfile(bearer(req));
  const email = profile.email ?? `${sub.replace(/[^a-zA-Z0-9]/g, '-')}@users.healthher.app`;

  // auth0_sub is UNIQUE: say so plainly rather than failing on the insert.
  const [existing] = await pool.query<RowDataPacket[]>('SELECT user_id FROM users WHERE auth0_sub = ?', [sub]);
  if (existing[0]) {
    res.status(409).json({ error: 'This login already has an account.' });
    return;
  }

  const conn = await pool.getConnection();
  let userId: number;
  try {
    await conn.beginTransaction();
    const [user] = await conn.query<ResultSetHeader>(
      `INSERT INTO users (first_name, email, auth0_sub, date_of_birth, height_cm) VALUES (?, ?, ?, ?, ?)`,
      [input.firstName, email, sub, input.dateOfBirth, input.heightCm],
    );
    userId = user.insertId;

    await conn.query(
      `INSERT INTO cycle_profiles
         (user_id, last_period_start_date, avg_cycle_length_days, avg_period_length_days, cycle_regularity,
          birth_control, cycle_suppressed, goal, training_days_per_week, training_weekdays, experience_level,
          training_consistency, weight_kg, goal_weight_kg, equipment_tier, onboarding_completed)
       VALUES (?, ?, ?, 5, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [userId, input.lastPeriodStart, input.cycleLength, input.regularity, input.birthControl,
        input.suppressed, input.goal, input.daysPerWeek, input.weekdays?.join(',') ?? null, input.experienceLevel, input.consistency,
        input.weightKg, input.goalWeightKg, input.equipmentTier],
    );

    for (const item of input.equipment) {
      await conn.query('INSERT INTO user_equipment (user_id, equipment) VALUES (?, ?)', [userId, item]);
    }

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
