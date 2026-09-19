import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { addDays, dayInfo } from '../core/cycleEngine.ts';
import { generateWeek, LEVELS, planBlocks, type ExercisePlan, type WeekPlan } from '../core/planGenerator.ts';
import type { PhaseIntensity } from '../core/types.ts';
import { pool } from '../db.ts';
import { loadUser } from '../users.ts';

export const plansRouter = Router();

// The plan for the 7 days starting at ?start (default today), with the
// textbook version of every session alongside hers. Not saved.
plansRouter.get('/plans/preview', async (req, res) => {
  const { today, goal, daysPerWeek, cycleInput, pattern, athlete } = await loadUser(res.locals.userId);
  const start = typeof req.query.start === 'string' ? req.query.start : today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    res.status(400).json({ error: 'start must be YYYY-MM-DD' });
    return;
  }
  res.json(generateWeek({ cycle: cycleInput, weekStart: start, goal, daysPerWeek, pattern, athlete }));
});

/** The heaviest level that appears most: what to call the week at a glance. */
function weekLevel(levels: PhaseIntensity[]): PhaseIntensity | null {
  if (!levels.length) return null;
  const count = (l: PhaseIntensity) => levels.filter((x) => x === l).length;
  return [...LEVELS].reverse().sort((a, b) => count(b) - count(a))[0];
}

// Plan view (SPEC.md): all four weeks of her saved plan, read back from the
// database (training_plans, session_logs, planned_exercises), with each
// week's intensity so the shape of the block shows at a glance.
plansRouter.get('/plan', async (_req, res) => {
  const ctx = await loadUser(res.locals.userId);
  const blocks = planBlocks(ctx.cycleInput, ctx.today, addDays(ctx.today, 28)).slice(0, 4);

  const [plans] = await pool.query<RowDataPacket[]>(
    `SELECT plan_id, DATE_FORMAT(week_start_date, '%Y-%m-%d') AS weekStart, plan_json
     FROM training_plans WHERE user_id = ? AND week_start_date IN (?)`,
    [ctx.userId, blocks.map((b) => b.start)],
  );
  // Every session in the four weeks, logged or planned, grouped by date.
  const lastDay = addDays(blocks.at(-1)!.start, blocks.at(-1)!.length - 1);
  const [sessions] = await pool.query<RowDataPacket[]>(
    `SELECT session_log_id AS id, DATE_FORMAT(session_date, '%Y-%m-%d') AS date, cycle_day AS cycleDay,
            phase, session_type AS sessionType, planned_intensity AS intensity, planned_duration_min AS durationMin,
            focus, status, perceived_effort AS rpe, fatigue, session_load AS sessionLoad
     FROM session_logs WHERE user_id = ? AND session_date BETWEEN ? AND ? ORDER BY session_date`,
    [ctx.userId, blocks[0].start, lastDay],
  );
  const sessionIds = sessions.map((s) => s.id as number);
  const [routine] = sessionIds.length ? await pool.query<RowDataPacket[]>(
    'SELECT session_log_id, prescription_json FROM planned_exercises WHERE session_log_id IN (?) ORDER BY session_log_id, position',
    [sessionIds],
  ) : [[]];
  const exercisesBySession = new Map<number, ExercisePlan[]>();
  for (const r of routine) {
    const e = typeof r.prescription_json === 'string' ? JSON.parse(r.prescription_json) : r.prescription_json;
    exercisesBySession.set(r.session_log_id, [...(exercisesBySession.get(r.session_log_id) ?? []), e]);
  }

  const weeks = blocks.map((block, i) => {
    const end = addDays(block.start, block.length - 1);
    const row = plans.find((p) => p.weekStart === block.start);
    const plan = row?.plan_json as WeekPlan | undefined;
    const planned = plan?.sessions ?? [];
    const levels = planned.map((s) => s.intensityLevel);
    const textbookLevels = planned.map((s) => s.textbook.intensityLevel);
    return {
      week: i + 1,
      start: block.start,
      end,
      cycleWeek: dayInfo(ctx.cycleInput, block.start)?.week ?? null,
      cycleDayAtStart: plan?.cycleDayAtStart ?? null,
      phase: plan?.phase ?? null,
      level: weekLevel(levels),
      textbookLevel: weekLevel(textbookLevels),
      volumeModifier: plan?.volumeModifier ?? null,
      adjustmentReason: plan?.adjustmentReason ?? null,
      sessions: sessions.filter((s) => s.date >= block.start && s.date <= end).map((s) => {
        // Sessions saved before routines were stored (or logged against an
        // older plan) show just what the session row says.
        const exercises = exercisesBySession.get(s.id) ?? [];
        const p = exercises.length ? planned.find((x) => x.date === s.date) : undefined;
        return { ...s, intensityLevel: p?.intensityLevel ?? null, adjusted: p?.adjusted ?? false, exercises };
      }),
    };
  });

  res.json({ today: ctx.today, steady: ctx.cycle.phase === 'SUPPRESSED', weeks });
});
