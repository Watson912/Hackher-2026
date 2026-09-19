// Saves the four-week plan: one training_plans row per block and a PLANNED
// session_logs row per session. Upcoming PLANNED sessions are replaced
// every time, so the saved plan always reflects what the app knows now.
//
// Every planned session's exercises go in planned_exercises: her routine,
// with the load the app suggests and why. Today and the Plan view read it.
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { generatePlan, type ExercisePlan, type WeekPlan } from './core/planGenerator.ts';
import { pool } from './db.ts';
import type { UserContext } from './users.ts';

/** Writes (or rewrites) one session's exercises, in order. */
export async function saveRoutine(conn: PoolConnection, userId: number, sessionId: number, exercises: ExercisePlan[]) {
  await conn.query('DELETE FROM planned_exercises WHERE session_log_id = ?', [sessionId]);
  for (const [i, e] of exercises.entries()) {
    await conn.query(
      `INSERT INTO planned_exercises
         (user_id, session_log_id, position, exercise_id, swapped_from, added_by_user, sets, reps, target_rpe, rest_sec,
          load_kg, load_text, load_reason, load_pct, prescription_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, sessionId, i + 1, e.exerciseId, e.swappedFrom?.id ?? null, e.added ?? false, e.sets, e.reps, e.rpe, e.restSec,
        e.loadKg, e.load.slice(0, 160), e.loadReason?.slice(0, 255) ?? null, e.loadPct, JSON.stringify(e)],
    );
  }
}

/** A session's saved exercises, in order (the routine as she'll see it). */
export async function loadRoutine(sessionId: number): Promise<ExercisePlan[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT prescription_json FROM planned_exercises WHERE session_log_id = ? ORDER BY position',
    [sessionId],
  );
  return rows.map((r) => (typeof r.prescription_json === 'string' ? JSON.parse(r.prescription_json) : r.prescription_json));
}

export async function refreshUpcomingPlan(ctx: UserContext): Promise<WeekPlan[]> {
  const { userId, today, cycleInput, goal, daysPerWeek, pattern, athlete, cycleId } = ctx;
  const plans = generatePlan({ cycle: cycleInput, goal, daysPerWeek, pattern, athlete });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Days she has already logged (the session, or any lift in it), or
    // changed herself (added a workout or exercises, or switched the type),
    // keep what they have; everything else planned from today on is regenerated.
    await conn.query(
      `DELETE FROM session_logs
       WHERE user_id = ? AND status = 'PLANNED' AND session_date >= ? AND user_added = FALSE
         AND session_log_id NOT IN (SELECT session_log_id FROM exercise_logs WHERE user_id = ?)`,
      [userId, today, userId],
    );
    const [loggedRows] = await conn.query<RowDataPacket[]>(
      `SELECT DATE_FORMAT(session_date, '%Y-%m-%d') AS d FROM session_logs WHERE user_id = ? AND session_date >= ?`,
      [userId, today],
    );
    const logged = new Set(loggedRows.map((r) => r.d as string));

    for (const plan of plans) {
      const [result] = await conn.query<ResultSetHeader>(
        `INSERT INTO training_plans
           (user_id, cycle_id, week_start_date, cycle_day_at_start, phase, goal, days_per_week,
            intensity_modifier, volume_modifier, nutrition_notes, plan_json, generated_by, confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RULES', ?)
         ON DUPLICATE KEY UPDATE
           plan_id = LAST_INSERT_ID(plan_id), cycle_id = VALUES(cycle_id),
           cycle_day_at_start = VALUES(cycle_day_at_start), phase = VALUES(phase), goal = VALUES(goal),
           days_per_week = VALUES(days_per_week), intensity_modifier = VALUES(intensity_modifier),
           volume_modifier = VALUES(volume_modifier), nutrition_notes = VALUES(nutrition_notes),
           plan_json = VALUES(plan_json), confidence = VALUES(confidence)`,
        [userId, cycleId, plan.weekStart, plan.cycleDayAtStart, plan.phase, plan.goal, plan.daysPerWeek,
          plan.intensityModifier, plan.volumeModifier, plan.nutritionNotes, JSON.stringify(plan), plan.confidence],
      );
      const planId = result.insertId;

      for (const s of plan.sessions) {
        if (s.date < today || logged.has(s.date)) continue;
        const [session] = await conn.query<ResultSetHeader>(
          `INSERT INTO session_logs
             (user_id, plan_id, session_date, cycle_day, phase, session_type, planned_intensity,
              planned_duration_min, focus, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PLANNED')`,
          [userId, planId, s.date, s.cycleDay, s.phase, s.sessionType, s.intensity, s.durationMin, s.focus],
        );
        await saveRoutine(conn, userId, session.insertId, s.exercises);
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return plans;
}
