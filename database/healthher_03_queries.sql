-- =====================================================================
-- HealthHer  |  Part 3: Data Layer  |  Query cookbook (MySQL 8.0+)
-- ---------------------------------------------------------------------
-- The exact statements each other part needs against these four tables.
-- Nothing here is required to set the database up; it is the contract
-- between the data layer and Parts 1, 2, 4, 5, 6 and 7. Copy them
-- straight into the Spring Boot repositories as @Query, or run them in
-- dBeaver to see the shape of the data.
--
-- Every block runs against the seeded demo user.
-- =====================================================================

USE herbalance;

SET @uid = (SELECT user_id FROM users WHERE email = 'demo@healthher.app');


-- =====================================================================
-- PART 1  --  Cycle engine inputs
-- =====================================================================

-- 1a. Everything the engine needs in one row: her settings, the cycle
--     she is in now, and today's cycle day.
SELECT p.avg_cycle_length_days,
       p.avg_period_length_days,
       p.cycle_regularity,
       p.birth_control,
       p.cycle_suppressed,
       c.cycle_id,
       c.cycle_start_date,
       DATEDIFF(CURDATE(), c.cycle_start_date) + 1 AS cycle_day_today
FROM   cycle_profiles p
LEFT   JOIN cycles c
       ON  c.user_id = p.user_id
       AND c.cycle_end_date IS NULL
WHERE  p.user_id = @uid;


-- 1b. Her measured average, which beats the number she guessed at
--     onboarding once there are two or more completed cycles.
--     stddev > 7 days is the usual cut-off for calling a cycle irregular.
SELECT COUNT(*)                          AS completed_cycles,
       ROUND(AVG(cycle_length_days), 1)  AS measured_avg_length,
       MIN(cycle_length_days)            AS shortest,
       MAX(cycle_length_days)            AS longest,
       ROUND(STDDEV_SAMP(cycle_length_days), 1) AS variability_days
FROM   cycles
WHERE  user_id = @uid
  AND  cycle_end_date IS NOT NULL;


-- 1c. Write back what the engine computed (run after every new cycle).
-- UPDATE cycle_profiles
-- SET    avg_cycle_length_days = 29,
--        cycle_regularity      = 'REGULAR',
--        last_period_start_date = CURDATE()
-- WHERE  user_id = @uid;


-- =====================================================================
-- PART 2  --  Plan generator
-- =====================================================================

-- 2a. This week's plan with its sessions.
SELECT p.plan_id,
       p.week_start_date,
       p.phase,
       p.goal,
       p.intensity_modifier,
       p.volume_modifier,
       p.nutrition_notes,
       s.session_date,
       s.cycle_day,
       s.session_type,
       s.planned_intensity,
       s.planned_duration_min,
       s.focus,
       s.status
FROM   training_plans p
LEFT   JOIN session_logs s ON s.plan_id = p.plan_id
WHERE  p.user_id = @uid
  AND  p.week_start_date = (SELECT MAX(week_start_date)
                            FROM   training_plans
                            WHERE  user_id = @uid
                              AND  week_start_date <= CURDATE())
ORDER  BY s.session_date;


-- 2b. The raw generator output, if the UI would rather render the JSON.
SELECT week_start_date, phase, plan_json
FROM   training_plans
WHERE  user_id = @uid
ORDER  BY week_start_date DESC
LIMIT  1;


-- 2c. Saving a freshly generated plan (idempotent per week).
-- INSERT INTO training_plans
--     (user_id, cycle_id, week_start_date, cycle_day_at_start, phase, goal,
--      days_per_week, intensity_modifier, volume_modifier, nutrition_notes,
--      plan_json, generated_by, confidence)
-- VALUES (@uid, @cycle_id, CURDATE(), 12, 'FOLLICULAR', 'STRENGTH',
--         4, 1.00, 1.05, 'Carbs high this week.', '{"sessions":[]}', 'RULES', 1.00)
-- ON DUPLICATE KEY UPDATE
--     phase = VALUES(phase), goal = VALUES(goal),
--     intensity_modifier = VALUES(intensity_modifier),
--     volume_modifier = VALUES(volume_modifier),
--     nutrition_notes = VALUES(nutrition_notes),
--     plan_json = VALUES(plan_json);


-- =====================================================================
-- PART 4  --  Onboarding writes
-- =====================================================================

-- 4a. Save the profile the four onboarding screens collected.
-- INSERT INTO cycle_profiles
--     (user_id, last_period_start_date, avg_cycle_length_days, avg_period_length_days,
--      cycle_regularity, birth_control, cycle_suppressed,
--      goal, training_days_per_week, experience_level, onboarding_completed)
-- VALUES (@uid, '2026-09-07', 29, 5, 'REGULAR', 'NONE', FALSE,
--         'STRENGTH', 4, 'INTERMEDIATE', TRUE)
-- ON DUPLICATE KEY UPDATE
--     last_period_start_date = VALUES(last_period_start_date),
--     avg_cycle_length_days  = VALUES(avg_cycle_length_days),
--     birth_control          = VALUES(birth_control),
--     cycle_suppressed       = VALUES(cycle_suppressed),
--     goal                   = VALUES(goal),
--     training_days_per_week = VALUES(training_days_per_week),
--     onboarding_completed   = TRUE;

-- 4b. Open her first cycle from the date she gave.
-- INSERT INTO cycles (user_id, cycle_start_date, period_length_days, is_predicted)
-- VALUES (@uid, '2026-09-07', 5, FALSE)
-- ON DUPLICATE KEY UPDATE period_length_days = VALUES(period_length_days);


-- =====================================================================
-- PART 5  --  Cycle wheel
-- =====================================================================

-- 5a. Day-by-day ring for the current cycle: one row per day of the
--     cycle so far, with load and phase for the colour bands.
SELECT session_date,
       cycle_day,
       phase,
       session_type,
       planned_intensity,
       load_score,
       status,
       fatigue,
       session_load,
       session_date = CURDATE() AS is_today
FROM   v_cycle_wheel
WHERE  user_id = @uid
  AND  cycle_id = (SELECT cycle_id FROM cycles
                   WHERE user_id = @uid AND cycle_end_date IS NULL)
ORDER  BY cycle_day;

-- 5b. Where the marker goes, and how big the ring is.
SELECT DATEDIFF(CURDATE(), c.cycle_start_date) + 1 AS cycle_day_today,
       p.avg_cycle_length_days                     AS ring_size_days,
       ROUND(360.0 * (DATEDIFF(CURDATE(), c.cycle_start_date))
             / p.avg_cycle_length_days, 1)         AS today_angle_deg
FROM   cycles c
JOIN   cycle_profiles p ON p.user_id = c.user_id
WHERE  c.user_id = @uid AND c.cycle_end_date IS NULL;


-- =====================================================================
-- PART 6  --  Today view and session logging
-- =====================================================================

-- 6a. Today's card.
SELECT * FROM v_today_session WHERE user_id = @uid;

-- 6b. The three-tap log: how it went / session RPE (Borg CR-10, 0-10) /
--     fatigue (Hooper, 1-7). Only status is required. session_load
--     (RPE x minutes) fills itself in.
-- UPDATE session_logs
-- SET    status              = 'COMPLETED',
--        perceived_effort    = 7,
--        fatigue             = 3,
--        actual_duration_min = 55,
--        logged_at           = NOW()
-- WHERE  session_log_id = ?;

-- 6c. Skipping is a log too, keep the row so Part 7 sees the gap.
-- UPDATE session_logs
-- SET    status = 'SKIPPED', fatigue = 5, logged_at = NOW()
-- WHERE  session_log_id = ?;

-- 6d. Today's routine: the exercises, sets, reps and suggested load
--     (with the reason), in order.
SELECT pe.position, pe.exercise_id, pe.swapped_from, pe.sets, pe.reps, pe.target_rpe,
       pe.load_text, pe.load_reason
FROM   planned_exercises pe
JOIN   session_logs s ON s.session_log_id = pe.session_log_id
WHERE  s.user_id = @uid AND s.session_date = CURDATE()
ORDER  BY pe.position;

-- 6e. Her lift history for one exercise, newest first: what the next
--     suggested load is worked out from.
SELECT log_date, load_kg, completed, rpe
FROM   exercise_logs
WHERE  user_id = @uid AND exercise_id = 'back_squat'
ORDER  BY log_date DESC;


-- =====================================================================
-- PART 7  --  Insights
-- =====================================================================

-- 7a. Have we got enough data to say anything? (10+ logged sessions.)
SELECT COUNT(*) AS logged_sessions,
       COUNT(*) >= 10 AS insights_unlocked
FROM   session_logs
WHERE  user_id = @uid AND status <> 'PLANNED';


-- 7b. THE HEADLINE. Her fatigue (Hooper, 1-7) by week of cycle against
--     the default curve (same numbers as api/src/core/rules.json). The
--     default expects her most fatigued in week 4, the late luteal
--     deload week. The seeded user is most fatigued in week 3, straight
--     after ovulation: that's the "your hardest week is somewhere else"
--     line. Session load is Foster's RPE x minutes.
SELECT w.cycle_week,
       w.sessions,
       w.avg_fatigue                                  AS your_fatigue,
       t.default_fatigue,
       ROUND(w.avg_fatigue - t.default_fatigue, 2)    AS difference,
       w.avg_session_rpe,
       w.avg_session_load,
       w.completion_pct
FROM   v_cycle_week_performance w
JOIN   (SELECT 1 AS cycle_week, 3.5 AS default_fatigue UNION ALL
        SELECT 2, 2.5 UNION ALL
        SELECT 3, 3.0 UNION ALL
        SELECT 4, 4.5) t ON t.cycle_week = w.cycle_week
WHERE  w.user_id = @uid
ORDER  BY w.cycle_week;


-- 7c. Same idea per phase, for the supporting bar chart.
SELECT phase,
       sessions_planned,
       sessions_completed,
       completion_pct,
       avg_fatigue,
       avg_session_rpe,
       avg_session_load,
       avg_minutes
FROM   v_phase_performance
WHERE  user_id = @uid
ORDER  BY FIELD(phase, 'MENSTRUAL','FOLLICULAR','OVULATORY','EARLY_LUTEAL','LATE_LUTEAL','SUPPRESSED','UNKNOWN');


-- 7d. The one-line callout: her hardest-feeling week (highest average
--     fatigue) next to the week the default expects to feel hardest (4).
SELECT CONCAT('Your hardest-feeling week is week ', h.cycle_week,
              CASE WHEN h.cycle_week = 4 THEN ', the same as the default'
                   ELSE ', not week 4 as the default expects' END,
              ' (fatigue ', h.avg_fatigue, ' of 7)') AS headline,
       h.cycle_week, h.avg_fatigue, h.avg_session_rpe, h.avg_session_load,
       h.sessions AS sessions_behind_it
FROM   v_cycle_week_performance h
WHERE  h.user_id = @uid AND h.sessions >= 3
ORDER  BY h.avg_fatigue DESC, h.cycle_week
LIMIT  1;


-- 7e. Where plans fall apart, so the generator can back off there.
SELECT phase,
       cycle_day,
       COUNT(*)                  AS times_planned,
       SUM(status = 'SKIPPED')   AS times_skipped
FROM   session_logs
WHERE  user_id = @uid AND status <> 'PLANNED'
GROUP  BY phase, cycle_day
HAVING times_skipped > 0
ORDER  BY cycle_day;


-- =====================================================================
-- UTILITIES
-- =====================================================================

-- Close the current cycle and open the next one (she logs a new period).
-- UPDATE cycles SET cycle_end_date = CURDATE() - INTERVAL 1 DAY
-- WHERE user_id = @uid AND cycle_end_date IS NULL;
-- INSERT INTO cycles (user_id, cycle_start_date, period_length_days)
-- VALUES (@uid, CURDATE(), 5);

-- Wipe one user's HealthHer data but keep the account.
-- DELETE FROM session_logs   WHERE user_id = @uid;
-- DELETE FROM training_plans WHERE user_id = @uid;
-- DELETE FROM cycles         WHERE user_id = @uid;
-- DELETE FROM cycle_profiles WHERE user_id = @uid;
