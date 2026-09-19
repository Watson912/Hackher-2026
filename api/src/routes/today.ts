import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { cycleWeekOf } from '../core/cycleEngine.ts';
import { sessionLoad, WEEKS, type LearnedPattern } from '../core/learning.ts';
import { computeNutrition } from '../core/nutrition.ts';
import {
  equipmentNotes, exerciseById, prescribeFor, type ExercisePlan, type PlannedSession,
} from '../core/planGenerator.ts';
import rules from '../core/rules.json' with { type: 'json' };
import type { CycleWeek, PhaseIntensity } from '../core/types.ts';
import { pool } from '../db.ts';
import { loadRoutine, refreshUpcomingPlan, saveRoutine } from '../planStore.ts';
import { loadUser, type UserContext } from '../users.ts';

export const todayRouter = Router();

const SESSION_COLUMNS = `session_log_id AS id, DATE_FORMAT(session_date, '%Y-%m-%d') AS date, cycle_day AS cycleDay,
  phase, session_type AS sessionType, planned_intensity AS intensity, planned_duration_min AS durationMin,
  focus, status, perceived_effort AS rpe, fatigue, actual_duration_min AS actualMin, session_load AS sessionLoad,
  plan_id AS planId`;

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

type SessionRow = RowDataPacket & { id: number; date: string; planId: number | null; durationMin: number | null };

async function findSession(id: string, userId: number): Promise<SessionRow | null> {
  const [rows] = await pool.query<SessionRow[]>(
    `SELECT ${SESSION_COLUMNS} FROM session_logs WHERE session_log_id = ? AND user_id = ?`,
    [id, userId],
  );
  return rows[0] ?? null;
}

/** The generator's full record of a session (textbook version, phase notes, citations) from plan_json. */
async function plannedSession(session: SessionRow): Promise<PlannedSession | null> {
  if (!session.planId) return null;
  const [plans] = await pool.query<RowDataPacket[]>('SELECT plan_json FROM training_plans WHERE plan_id = ?', [session.planId]);
  return plans[0]?.plan_json?.sessions?.find((s: { date: string }) => s.date === session.date) ?? null;
}

/** Her routine for a session: planned_exercises, or the plan record for sessions saved before it existed. */
async function routineFor(session: SessionRow): Promise<ExercisePlan[]> {
  const saved = await loadRoutine(session.id);
  if (saved.length) return saved;
  return (await plannedSession(session))?.exercises ?? [];
}

// While her period is late the plan assumes it starts tomorrow, so it has
// to be redone each day she's still waiting. Once a day per user is plenty.
const lateReplannedOn = new Map<number, string>();

todayRouter.get('/today', async (_req, res) => {
  let ctx = await loadUser(res.locals.userId);
  if (ctx.periodLate && lateReplannedOn.get(ctx.userId) !== ctx.today) {
    await refreshUpcomingPlan(ctx);
    lateReplannedOn.set(ctx.userId, ctx.today);
    ctx = await loadUser(ctx.userId);
  }
  const { days, ...cycle } = ctx.cycle;

  const [todayRows] = await pool.query<SessionRow[]>(
    `SELECT ${SESSION_COLUMNS} FROM session_logs WHERE user_id = ? AND session_date = ? ORDER BY session_log_id LIMIT 1`,
    [ctx.userId, ctx.today],
  );
  const [upcoming] = await pool.query<RowDataPacket[]>(
    `SELECT ${SESSION_COLUMNS} FROM session_logs
     WHERE user_id = ? AND session_date > ? AND status = 'PLANNED' ORDER BY session_date LIMIT 4`,
    [ctx.userId, ctx.today],
  );

  const session = todayRows[0] ?? null;
  let extra = null;
  if (session) {
    const planned = await plannedSession(session);
    const [logged] = await pool.query<RowDataPacket[]>(
      'SELECT exercise_id, load_kg, completed, rpe FROM exercise_logs WHERE session_log_id = ?',
      [session.id],
    );
    extra = {
      textbook: planned?.adjusted ? planned.textbook : null,
      exercises: await routineFor(session),
      lifts: Object.fromEntries(logged.map((l) => [l.exercise_id, {
        loadKg: l.load_kg === null ? null : Number(l.load_kg), completed: Boolean(l.completed), rpe: Number(l.rpe),
      }])),
      // The phase note and its sources (phaseRules.json, verbatim).
      note: planned ? { emphasis: planned.emphasis, autoregulation: planned.autoregulation, citations: planned.citations } : null,
    };
  }

  const nutrition = computeNutrition({ ...ctx.body, daysPerWeek: ctx.daysPerWeek, phase: ctx.cycle.phase });

  const adjustedWeek = (cycleDay: number | null) =>
    learns(ctx) && cycleDay !== null && ctx.pattern[cycleWeekOf(cycleDay)].adjustment !== 0;

  res.json({
    today: ctx.today,
    firstName: ctx.firstName,
    isDemo: ctx.isDemo,
    cycle,
    periodLate: ctx.periodLate,
    session: session && { ...session, ...extra },
    equipmentNotes: equipmentNotes(ctx.athlete.equipmentTier ?? 'FULL_GYM', ctx.goal, ctx.athlete.equipment),
    nutrition,
    upcoming: upcoming.map((s) => ({ ...s, adjusted: adjustedWeek(s.cycleDay) })),
    learning: learningStatus(ctx, ctx.cycle.cycleWeek),
  });
});

const isInt = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const optional = (v: unknown) => v === null || v === undefined;

// The session log (SPEC.md): three taps, only "how did it go" required.
// Session RPE on the Borg CR-10 scale, the Hooper Index fatigue item (1-7),
// and minutes (defaults to the plan, halved when cut short). Session load =
// RPE x minutes (Foster), computed by the database.
todayRouter.post('/sessions/:id/log', async (req, res) => {
  const { status, rpe, fatigue, durationMin } = req.body as { status?: string; rpe?: number | null; fatigue?: number | null; durationMin?: number | null };
  if (!status || !['COMPLETED', 'PARTIAL', 'SKIPPED'].includes(status)) {
    res.status(400).json({ error: 'status must be COMPLETED, PARTIAL or SKIPPED' });
    return;
  }
  if (!optional(rpe) && !isInt(rpe, 0, 10)) {
    res.status(400).json({ error: 'rpe must be a whole number from 0 to 10 (Borg CR-10), or left out' });
    return;
  }
  if (!optional(fatigue) && !isInt(fatigue, 1, 7)) {
    res.status(400).json({ error: 'fatigue must be a whole number from 1 to 7 (Hooper), or left out' });
    return;
  }
  if (!optional(durationMin) && !isInt(durationMin, 1, 600)) {
    res.status(400).json({ error: 'durationMin must be 1-600 minutes, or left out' });
    return;
  }

  const userId: number = res.locals.userId;
  const session = await findSession(req.params.id, userId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const before = await loadUser(userId);
  const skipped = status === 'SKIPPED';
  const minutes = skipped ? null
    : !optional(durationMin) ? durationMin!
    : status === 'PARTIAL' ? Math.round((session.durationMin ?? 0) / 2) : session.durationMin;
  const sessionRpe = skipped || optional(rpe) ? null : rpe!;

  await pool.query<ResultSetHeader>(
    `UPDATE session_logs SET status = ?, perceived_effort = ?, fatigue = ?, actual_duration_min = ?, logged_at = NOW()
     WHERE session_log_id = ? AND user_id = ?`,
    [status, sessionRpe, fatigue ?? null, minutes, session.id, userId],
  );

  // Learn from it straight away, and replan what's coming.
  const after = await loadUser(userId);
  await refreshUpcomingPlan(after);

  // Short on purpose: only say more when her log changed her plan.
  const load = sessionLoad(sessionRpe, minutes);
  const week = session.cycleDay ? cycleWeekOf(session.cycleDay) : null;
  let feedback = 'Logged. Nice work.';
  let planChanged = false;
  if (week && learns(after)) {
    const now = after.pattern[week];
    planChanged = before.pattern[week].adjustment !== now.adjustment;
    if (planChanged && now.adjustment !== 0) {
      feedback = `Logged. You've changed your plan: week ${week} is now ${Math.round(Math.abs(now.adjustment) * 100)}% ${now.adjustment < 0 ? 'lighter' : 'harder'}.`;
    }
  }

  res.json({ feedback, planChanged, load, learning: learningStatus(after, week) });
});

// Log one exercise: the weight she used, whether she finished every set, and
// her RPE on the Borg CR-10 scale. Her next load for this exercise comes from
// this row, so the plan is regenerated straight away.
todayRouter.post('/sessions/:id/exercises/:exerciseId', async (req, res) => {
  const { loadKg, completed, rpe } = req.body as { loadKg?: number | null; completed?: boolean; rpe?: number };
  if (typeof completed !== 'boolean') {
    res.status(400).json({ error: 'completed must be true or false' });
    return;
  }
  if (!isInt(rpe, 0, 10)) {
    res.status(400).json({ error: 'rpe must be a whole number from 0 to 10 (Borg CR-10)' });
    return;
  }
  if (loadKg !== null && loadKg !== undefined && (typeof loadKg !== 'number' || !(loadKg >= 0 && loadKg <= 500))) {
    res.status(400).json({ error: 'loadKg must be between 0 and 500, or null' });
    return;
  }

  const userId: number = res.locals.userId;
  const session = await findSession(req.params.id, userId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // The prescription it was logged against, for its loadPct.
  const planned = (await routineFor(session)).find((e) => e.exerciseId === req.params.exerciseId);
  if (!planned) {
    res.status(400).json({ error: `${req.params.exerciseId} isn't in this session` });
    return;
  }

  await pool.query(
    `INSERT INTO exercise_logs (user_id, session_log_id, exercise_id, log_date, load_kg, load_pct, completed, rpe)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE load_kg = VALUES(load_kg), load_pct = VALUES(load_pct),
                             completed = VALUES(completed), rpe = VALUES(rpe)`,
    [userId, session.id, planned.exerciseId, session.date, loadKg ?? null, planned.loadPct, completed, rpe],
  );

  // Replan, then tell her what's next for this exercise.
  const plans = await refreshUpcomingPlan(await loadUser(userId));
  const nextSession = plans.flatMap((w) => w.sessions)
    .find((s) => s.date > session.date && s.exercises.some((e) => e.exerciseId === planned.exerciseId));
  const next = nextSession?.exercises.find((e) => e.exerciseId === planned.exerciseId);

  res.json({
    saved: { loadKg: loadKg ?? null, completed, rpe },
    next: next && nextSession ? { date: nextSession.date, load: next.load, loadReason: next.loadReason } : null,
  });
});

// Swap an exercise for one of its swaps (exercises.json). The swap is saved
// to this session's routine and remembered in exercise_swaps, so future
// sessions use her pick too. Swapping back to the original forgets it.
todayRouter.post('/sessions/:id/exercises/:exerciseId/swap', async (req, res) => {
  const { to } = req.body as { to?: string };
  const userId: number = res.locals.userId;
  const session = await findSession(req.params.id, userId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  const routine = await routineFor(session);
  const current = routine.find((e) => e.exerciseId === req.params.exerciseId);
  if (!current) {
    res.status(400).json({ error: `${req.params.exerciseId} isn't in this session` });
    return;
  }
  if (typeof to !== 'string' || !current.swaps.some((s) => s.id === to)) {
    res.status(400).json({ error: `Pick one of: ${current.swaps.map((s) => s.id).join(', ')}` });
    return;
  }
  const [logged] = await pool.query<RowDataPacket[]>(
    'SELECT 1 FROM exercise_logs WHERE session_log_id = ? AND exercise_id = ?', [session.id, current.exerciseId],
  );
  if (logged.length) {
    res.status(409).json({ error: "You've already logged this exercise today, so it stays." });
    return;
  }

  const ctx = await loadUser(userId);
  const original = current.swappedFrom?.id ?? current.exerciseId;
  const swaps = { ...ctx.athlete.swaps };
  if (to === original) delete swaps[original];
  else swaps[original] = to;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (to === original) {
      await conn.query('DELETE FROM exercise_swaps WHERE user_id = ? AND exercise_id = ?', [userId, original]);
    } else {
      await conn.query(
        `INSERT INTO exercise_swaps (user_id, exercise_id, swap_to_id) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE swap_to_id = VALUES(swap_to_id)`,
        [userId, original, to],
      );
    }
    // This session: re-prescribe the slot at the session's intensity.
    const level = ((await plannedSession(session))?.intensityLevel ?? 'moderate') as PhaseIntensity;
    const taken = new Set(routine.filter((e) => e !== current).map((e) => e.exerciseId));
    const replacement = prescribeFor(exerciseById(original)!, level, { ...ctx.athlete, swaps }, session.date, taken);
    await saveRoutine(conn, userId, session.id, routine.map((e) => (e === current ? replacement : e)));
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Replan: the generator applies her remembered swap to every future session.
  await refreshUpcomingPlan(await loadUser(userId));
  res.json({ ok: true, swappedTo: exerciseById(to)?.name ?? to, remembered: to !== original });
});
