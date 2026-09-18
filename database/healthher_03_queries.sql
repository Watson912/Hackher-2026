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
       energy_level,
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

-- 6b. The three-tap log: completed / energy / effort.
-- UPDATE session_logs
-- SET    status              = 'COMPLETED',
--        energy_level        = 4,
--        perceived_effort    = 7,
--        actual_duration_min = 55,
--        logged_at           = NOW()
-- WHERE  session_log_id = ?;

-- 6c. Skipping is a log too, keep the row so Part 7 sees the gap.
-- UPDATE session_logs
-- SET    status = 'SKIPPED', energy_level = 2, logged_at = NOW()
-- WHERE  session_log_id = ?;


-- =====================================================================
-- PART 7  --  Insights
-- =====================================================================

-- 7a. Have we got enough data to say anything? (10+ logged sessions.)
SELECT COUNT(*) AS logged_sessions,
       COUNT(*) >= 10 AS insights_unlocked
FROM   session_logs
WHERE  user_id = @uid AND status <> 'PLANNED';


-- 7b. THE HEADLINE. Her energy by week of cycle against the textbook
--     curve. The textbook says energy rebounds the moment the period
--     ends and peaks in week 1. The seeded user peaks in week 2, a full
--     week later, which is the "your pattern is different" line.
SELECT w.cycle_week,
       w.sessions,
       w.avg_energy                                   AS your_energy,
       t.textbook_energy,
       ROUND(w.avg_energy - t.textbook_energy, 2)     AS difference,
       w.completion_pct
FROM   v_cycle_week_performance w
JOIN   (SELECT 1 AS cycle_week, 4.5 AS textbook_energy UNION ALL
        SELECT 2, 4.0 UNION ALL
        SELECT 3, 3.0 UNION ALL
        SELECT 4, 2.5 UNION ALL
        SELECT 5, 2.5) t ON t.cycle_week = w.cycle_week
WHERE  w.user_id = @uid
ORDER  BY w.cycle_week;


-- 7c. Same idea per phase, for the supporting bar chart.
SELECT phase,
       sessions_planned,
       sessions_completed,
       completion_pct,
       avg_energy,
       avg_effort,
       avg_minutes
FROM   v_phase_performance
WHERE  user_id = @uid
ORDER  BY FIELD(phase, 'MENSTRUAL','FOLLICULAR','OVULATORY','LUTEAL','SUPPRESSED','UNKNOWN');


-- 7d. The one-line callout: her peak week against the textbook's.
SELECT CONCAT('You actually peak in week ', peak.cycle_week,
              ', not week 1 like the textbook says')  AS headline,
       peak.cycle_week    AS your_peak_week,
       peak.avg_energy    AS your_peak_energy,
       1                  AS textbook_peak_week,
       wk1.avg_energy     AS your_week1_energy,
       peak.sessions      AS sessions_behind_it
FROM   (SELECT cycle_week, avg_energy, sessions
        FROM   v_cycle_week_performance
        WHERE  user_id = @uid
        ORDER  BY avg_energy DESC
        LIMIT  1) peak
CROSS  JOIN (SELECT avg_energy
             FROM   v_cycle_week_performance
             WHERE  user_id = @uid AND cycle_week = 1) wk1;


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
