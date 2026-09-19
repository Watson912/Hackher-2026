// Saves generated plans: one training_plans row per block and a PLANNED
// session_logs row per session. Upcoming PLANNED sessions are replaced
// every time, so the saved plan always reflects what the app knows now.
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { addDays } from './core/cycleEngine.ts';
import { generateWeek, planBlocks, type WeekPlan } from './core/planGenerator.ts';
import { pool } from './db.ts';
import type { UserContext } from './users.ts';

const HORIZON_DAYS = 13; // plan today plus the next two weeks

export async function refreshUpcomingPlan(ctx: UserContext): Promise<WeekPlan[]> {
  const { userId, today, cycleInput, goal, daysPerWeek, pattern, cycleId } = ctx;
  const plans = planBlocks(cycleInput, today, addDays(today, HORIZON_DAYS)).map((block) =>
    generateWeek({ cycle: cycleInput, weekStart: block.start, length: block.length, goal, daysPerWeek, pattern }),
  );

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Days she has already logged keep their log; everything planned from
    // today on is regenerated.
    await conn.query(`DELETE FROM session_logs WHERE user_id = ? AND status = 'PLANNED' AND session_date >= ?`, [userId, today]);
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
        await conn.query(
          `INSERT INTO session_logs
             (user_id, plan_id, session_date, cycle_day, phase, session_type, planned_intensity,
              planned_duration_min, focus, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PLANNED')`,
          [userId, planId, s.date, s.cycleDay, s.phase, s.sessionType, s.intensity, s.durationMin, s.focus],
        );
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
