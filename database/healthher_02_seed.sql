-- =====================================================================
-- HealthHer  |  Part 3: Data Layer  |  Seed data (MySQL 8.0+)
-- ---------------------------------------------------------------------
-- One demo user with a full history so the app never demos empty:
--
--   Maya Chen  <demo@healthher.app>
--   - 2 completed cycles + 1 in progress
--   - 11 weekly plans
--   - 43 logged sessions + 3 upcoming planned sessions
--
-- All dates are relative to CURDATE(), so the demo is always "today"
-- no matter which day you present on. Today lands on cycle day 12
-- (late follicular, high-energy week) which is the best state to show:
-- the wheel has two thirds of a cycle filled in, and there is a
-- session waiting to be logged.
--
-- The logged energy scores are deliberately shaped so Part 7 finds a
-- real pattern: the textbook says energy holds up through week 3
-- (days 15-21), but she crashes straight after ovulation, from day 17.
-- The learning layer turns that into an earlier deload. Run
-- healthher_03_queries.sql section 7 to see it.
--
-- Re-runnable: deletes the demo user first, cascades everything.
-- Run after healthher_01_schema.sql.
-- =====================================================================

USE herbalance;

-- dBeaver / Workbench ship with safe-update mode on, which blocks the
-- cleanup DELETE and the plan-linking UPDATE below.
SET SQL_SAFE_UPDATES = 0;


-- ---------------------------------------------------------------------
-- 0. Clean up any previous run (FK cascade clears all four tables)
-- ---------------------------------------------------------------------
DELETE FROM users WHERE email = 'demo@healthher.app';


-- ---------------------------------------------------------------------
-- 1. The user
-- ---------------------------------------------------------------------
INSERT INTO users
    (first_name, last_name, email, password, date_of_birth, height_cm,
     calorie_goal, protein_goal, carb_goal, fat_goal)
VALUES
    ('Maya', 'Chen', 'demo@healthher.app',
     '$2a$10$DEMOSEEDHASHDEMOSEEDHASHDEMOSEEDHASHDEMOSEEDHASHxx',
     '1999-04-12', 168.00,
     2200, 130.00, 240.00, 70.00);

SET @uid = LAST_INSERT_ID();


-- ---------------------------------------------------------------------
-- 2. Her profile  (what onboarding, Part 4, would have collected)
-- ---------------------------------------------------------------------
INSERT INTO cycle_profiles
    (user_id, last_period_start_date, avg_cycle_length_days, avg_period_length_days,
     cycle_regularity, birth_control, cycle_suppressed,
     goal, training_days_per_week, experience_level, onboarding_completed)
VALUES
    (@uid, CURDATE() - INTERVAL 11 DAY, 29, 5,
     'REGULAR', 'NONE', FALSE,
     'STRENGTH', 4, 'INTERMEDIATE', TRUE);


-- ---------------------------------------------------------------------
-- 3. Cycle history  (2 completed, 1 in progress)
-- ---------------------------------------------------------------------
INSERT INTO cycles
    (user_id, cycle_start_date, cycle_end_date, period_length_days, is_predicted, notes)
VALUES
    (@uid, CURDATE() - INTERVAL 70 DAY, CURDATE() - INTERVAL 42 DAY, 5, FALSE, '29 day cycle'),
    (@uid, CURDATE() - INTERVAL 41 DAY, CURDATE() - INTERVAL 12 DAY, 5, FALSE, '30 day cycle'),
    (@uid, CURDATE() - INTERVAL 11 DAY, NULL,                        5, FALSE, 'In progress');

SET @c1 = (SELECT cycle_id FROM cycles WHERE user_id = @uid AND cycle_start_date = CURDATE() - INTERVAL 70 DAY);
SET @c2 = (SELECT cycle_id FROM cycles WHERE user_id = @uid AND cycle_start_date = CURDATE() - INTERVAL 41 DAY);
SET @c3 = (SELECT cycle_id FROM cycles WHERE user_id = @uid AND cycle_start_date = CURDATE() - INTERVAL 11 DAY);


-- ---------------------------------------------------------------------
-- 4. Generated plans  (one per 7-day block, 11 weeks back to front)
--    These are shaped exactly like Part 2's rules-table output.
-- ---------------------------------------------------------------------
INSERT INTO training_plans
    (user_id, cycle_id, week_start_date, cycle_day_at_start, phase, goal, days_per_week,
     intensity_modifier, volume_modifier, nutrition_notes, plan_json, generated_by, confidence)
VALUES
-- ---- cycle 1 -------------------------------------------------------
(@uid, @c1, CURDATE() - INTERVAL 70 DAY,  1, 'MENSTRUAL',  'STRENGTH', 4, 0.80, 0.75,
 'Iron-rich foods (red meat, lentils, spinach) to offset menstrual losses. Anti-inflammatory fats. Do not cut calories this week.',
 '{"phase":"MENSTRUAL","sessions":[{"day":1,"type":"MOBILITY","intensity":"LOW","min":30},{"day":2,"type":"CARDIO_LISS","intensity":"LOW","min":40},{"day":4,"type":"CARDIO_LISS","intensity":"LOW","min":40},{"day":6,"type":"STRENGTH","intensity":"MODERATE","min":55}]}',
 'RULES', 1.00),

(@uid, @c1, CURDATE() - INTERVAL 63 DAY,  8, 'FOLLICULAR', 'STRENGTH', 4, 1.00, 1.05,
 'Carb tolerance is highest now. Push carbs around training and add volume to protein. Best week to attempt progressive overload.',
 '{"phase":"FOLLICULAR","sessions":[{"day":1,"type":"STRENGTH","intensity":"MODERATE","min":55},{"day":2,"type":"CARDIO_HIIT","intensity":"HIGH","min":35},{"day":4,"type":"CARDIO_HIIT","intensity":"HIGH","min":35},{"day":5,"type":"STRENGTH","intensity":"HIGH","min":60}]}',
 'RULES', 1.00),

(@uid, @c1, CURDATE() - INTERVAL 56 DAY, 15, 'OVULATORY',  'STRENGTH', 4, 1.10, 1.00,
 'Peak strength window. Keep hydration and electrolytes up, ligaments are laxer so warm up longer before heavy lifts.',
 '{"phase":"OVULATORY","sessions":[{"day":1,"type":"STRENGTH","intensity":"HIGH","min":65},{"day":2,"type":"CARDIO_HIIT","intensity":"HIGH","min":35},{"day":4,"type":"CARDIO_LISS","intensity":"MODERATE","min":45},{"day":5,"type":"STRENGTH","intensity":"MODERATE","min":55}]}',
 'RULES', 1.00),

(@uid, @c1, CURDATE() - INTERVAL 49 DAY, 22, 'LUTEAL',     'STRENGTH', 4, 0.90, 0.90,
 'Metabolism runs slightly hotter, add roughly 100-200 kcal. Magnesium and complex carbs help with cravings and sleep.',
 '{"phase":"LUTEAL","sessions":[{"day":1,"type":"CARDIO_LISS","intensity":"MODERATE","min":45},{"day":2,"type":"STRENGTH","intensity":"MODERATE","min":55},{"day":4,"type":"MOBILITY","intensity":"LOW","min":30},{"day":5,"type":"STRENGTH","intensity":"LOW","min":45}]}',
 'RULES', 1.00),

(@uid, @c1, CURDATE() - INTERVAL 42 DAY, 29, 'LUTEAL',     'STRENGTH', 4, 0.75, 0.70,
 'Late luteal deload. Protein high, salt moderate to limit bloating. Expect lower energy, this is planned, not a setback.',
 '{"phase":"LUTEAL","sessions":[{"day":1,"type":"STRENGTH","intensity":"LOW","min":45},{"day":2,"type":"MOBILITY","intensity":"LOW","min":30},{"day":4,"type":"MOBILITY","intensity":"LOW","min":30},{"day":6,"type":"CARDIO_LISS","intensity":"LOW","min":40}]}',
 'RULES', 1.00),

-- ---- cycle 2 -------------------------------------------------------
(@uid, @c2, CURDATE() - INTERVAL 35 DAY,  7, 'FOLLICULAR', 'STRENGTH', 4, 1.00, 1.05,
 'Carb tolerance is highest now. Push carbs around training and add volume to protein. Best week to attempt progressive overload.',
 '{"phase":"FOLLICULAR","sessions":[{"day":1,"type":"STRENGTH","intensity":"MODERATE","min":55},{"day":2,"type":"CARDIO_HIIT","intensity":"HIGH","min":35},{"day":4,"type":"CARDIO_HIIT","intensity":"HIGH","min":35},{"day":5,"type":"STRENGTH","intensity":"HIGH","min":60}]}',
 'RULES', 1.00),

(@uid, @c2, CURDATE() - INTERVAL 28 DAY, 14, 'OVULATORY',  'STRENGTH', 4, 1.10, 1.00,
 'Peak strength window. Keep hydration and electrolytes up, ligaments are laxer so warm up longer before heavy lifts.',
 '{"phase":"OVULATORY","sessions":[{"day":1,"type":"STRENGTH","intensity":"HIGH","min":65},{"day":2,"type":"CARDIO_HIIT","intensity":"HIGH","min":35},{"day":4,"type":"CARDIO_LISS","intensity":"MODERATE","min":45},{"day":5,"type":"STRENGTH","intensity":"MODERATE","min":55}]}',
 'RULES', 1.00),

(@uid, @c2, CURDATE() - INTERVAL 21 DAY, 21, 'LUTEAL',     'STRENGTH', 4, 0.90, 0.90,
 'Metabolism runs slightly hotter, add roughly 100-200 kcal. Magnesium and complex carbs help with cravings and sleep.',
 '{"phase":"LUTEAL","sessions":[{"day":1,"type":"CARDIO_LISS","intensity":"MODERATE","min":45},{"day":2,"type":"MOBILITY","intensity":"LOW","min":30},{"day":4,"type":"STRENGTH","intensity":"LOW","min":45},{"day":5,"type":"STRENGTH","intensity":"LOW","min":45}]}',
 'RULES', 1.00),

(@uid, @c2, CURDATE() - INTERVAL 14 DAY, 28, 'LUTEAL',     'STRENGTH', 4, 0.75, 0.70,
 'Late luteal deload. Protein high, salt moderate to limit bloating. Expect lower energy, this is planned, not a setback.',
 '{"phase":"LUTEAL","sessions":[{"day":1,"type":"MOBILITY","intensity":"LOW","min":30},{"day":3,"type":"MOBILITY","intensity":"LOW","min":30},{"day":4,"type":"CARDIO_LISS","intensity":"LOW","min":40},{"day":6,"type":"CARDIO_LISS","intensity":"LOW","min":40}]}',
 'RULES', 1.00),

-- ---- cycle 3 (current) ---------------------------------------------
(@uid, @c3, CURDATE() - INTERVAL 7 DAY,   5, 'MENSTRUAL',  'STRENGTH', 4, 0.80, 0.75,
 'Iron-rich foods (red meat, lentils, spinach) to offset menstrual losses. Anti-inflammatory fats. Do not cut calories this week.',
 '{"phase":"MENSTRUAL","sessions":[{"day":1,"type":"CARDIO_LISS","intensity":"LOW","min":40},{"day":2,"type":"STRENGTH","intensity":"MODERATE","min":55},{"day":4,"type":"STRENGTH","intensity":"MODERATE","min":55},{"day":5,"type":"CARDIO_HIIT","intensity":"HIGH","min":35}]}',
 'RULES', 1.00),

(@uid, @c3, CURDATE(),                   12, 'FOLLICULAR', 'STRENGTH', 4, 1.00, 1.05,
 'Carb tolerance is highest now. Push carbs around training and add volume to protein. Best week to attempt progressive overload.',
 '{"phase":"FOLLICULAR","sessions":[{"day":1,"type":"STRENGTH","intensity":"HIGH","min":60},{"day":3,"type":"STRENGTH","intensity":"HIGH","min":65},{"day":4,"type":"CARDIO_HIIT","intensity":"HIGH","min":35},{"day":6,"type":"CARDIO_LISS","intensity":"MODERATE","min":45}]}',
 'RULES', 1.00);


-- ---------------------------------------------------------------------
-- 5. Session logs
--    cycle_day and phase are snapshotted per row.
--    Phase bands used: 1-5 MENSTRUAL, 6-12 FOLLICULAR,
--                      13-16 OVULATORY, 17+ LUTEAL.
--    plan_id is filled in by the UPDATE in section 6.
-- ---------------------------------------------------------------------
INSERT INTO session_logs
    (user_id, session_date, cycle_day, phase, session_type, planned_intensity,
     planned_duration_min, focus, status, energy_level, perceived_effort,
     actual_duration_min, notes, logged_at)
VALUES
-- Cycle 1 (started 70 days ago)
  (@uid, CURDATE() - INTERVAL 69 DAY, 2, 'MENSTRUAL', 'MOBILITY', 'LOW', 30, 'Mobility + breath work', 'COMPLETED', 2, 9, 30, NULL, TIMESTAMP(CURDATE() - INTERVAL 69 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 68 DAY, 3, 'MENSTRUAL', 'CARDIO_LISS', 'LOW', 40, 'Easy zone 2 walk/jog', 'COMPLETED', 3, 8, 40, NULL, TIMESTAMP(CURDATE() - INTERVAL 68 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 66 DAY, 5, 'MENSTRUAL', 'CARDIO_LISS', 'LOW', 40, 'Easy zone 2 walk/jog', 'COMPLETED', 3, 8, 40, NULL, TIMESTAMP(CURDATE() - INTERVAL 66 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 65 DAY, 6, 'FOLLICULAR', 'STRENGTH', 'MODERATE', 55, 'Full body strength - rebuild', 'COMPLETED', 3, 8, 55, NULL, TIMESTAMP(CURDATE() - INTERVAL 65 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 63 DAY, 8, 'FOLLICULAR', 'STRENGTH', 'MODERATE', 55, 'Full body strength - rebuild', 'COMPLETED', 4, 7, 55, NULL, TIMESTAMP(CURDATE() - INTERVAL 63 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 62 DAY, 9, 'FOLLICULAR', 'CARDIO_HIIT', 'HIGH', 35, 'Intervals 6x400m', 'COMPLETED', 4, 7, 35, NULL, TIMESTAMP(CURDATE() - INTERVAL 62 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 60 DAY, 11, 'FOLLICULAR', 'CARDIO_HIIT', 'HIGH', 35, 'Intervals 6x400m', 'COMPLETED', 5, 7, 35, NULL, TIMESTAMP(CURDATE() - INTERVAL 60 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 59 DAY, 12, 'FOLLICULAR', 'STRENGTH', 'HIGH', 60, 'Lower body strength - heavy', 'COMPLETED', 5, 7, 60, NULL, TIMESTAMP(CURDATE() - INTERVAL 59 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 57 DAY, 14, 'OVULATORY', 'STRENGTH', 'HIGH', 65, 'Upper body strength - peak load', 'COMPLETED', 5, 7, 65, NULL, TIMESTAMP(CURDATE() - INTERVAL 57 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 56 DAY, 15, 'OVULATORY', 'CARDIO_HIIT', 'HIGH', 35, 'Sprint intervals', 'COMPLETED', 5, 7, 35, 'Best session of the month', TIMESTAMP(CURDATE() - INTERVAL 56 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 54 DAY, 17, 'LUTEAL', 'CARDIO_LISS', 'MODERATE', 45, 'Steady state 45 min', 'COMPLETED', 3, 8, 45, 'Flat after a great week', TIMESTAMP(CURDATE() - INTERVAL 54 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 53 DAY, 18, 'LUTEAL', 'STRENGTH', 'MODERATE', 55, 'Full body strength - volume', 'PARTIAL', 2, 9, 35, 'Weights felt twice as heavy, dropped the last block', TIMESTAMP(CURDATE() - INTERVAL 53 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 51 DAY, 20, 'LUTEAL', 'STRENGTH', 'MODERATE', 55, 'Full body strength - volume', 'COMPLETED', 2, 9, 55, NULL, TIMESTAMP(CURDATE() - INTERVAL 51 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 50 DAY, 21, 'LUTEAL', 'CARDIO_LISS', 'MODERATE', 45, 'Steady state 45 min', 'COMPLETED', 3, 8, 45, NULL, TIMESTAMP(CURDATE() - INTERVAL 50 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 48 DAY, 23, 'LUTEAL', 'MOBILITY', 'LOW', 30, 'Yoga + mobility', 'PARTIAL', 3, 8, 15, 'Cut it short, energy tanked', TIMESTAMP(CURDATE() - INTERVAL 48 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 47 DAY, 24, 'LUTEAL', 'STRENGTH', 'LOW', 45, 'Light technique work', 'COMPLETED', 2, 9, 45, NULL, TIMESTAMP(CURDATE() - INTERVAL 47 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 45 DAY, 26, 'LUTEAL', 'STRENGTH', 'LOW', 45, 'Light technique work', 'COMPLETED', 2, 9, 45, NULL, TIMESTAMP(CURDATE() - INTERVAL 45 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 44 DAY, 27, 'LUTEAL', 'MOBILITY', 'LOW', 30, 'Yoga + mobility', 'SKIPPED', 2, NULL, NULL, 'Too wiped out, called it', TIMESTAMP(CURDATE() - INTERVAL 44 DAY, '19:30:00')),
-- Cycle 2 (started 41 days ago)
  (@uid, CURDATE() - INTERVAL 40 DAY, 2, 'MENSTRUAL', 'MOBILITY', 'LOW', 30, 'Mobility + breath work', 'COMPLETED', 2, 9, 30, NULL, TIMESTAMP(CURDATE() - INTERVAL 40 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 39 DAY, 3, 'MENSTRUAL', 'CARDIO_LISS', 'LOW', 40, 'Easy zone 2 walk/jog', 'COMPLETED', 4, 7, 40, NULL, TIMESTAMP(CURDATE() - INTERVAL 39 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 37 DAY, 5, 'MENSTRUAL', 'CARDIO_LISS', 'LOW', 40, 'Easy zone 2 walk/jog', 'COMPLETED', 3, 8, 40, NULL, TIMESTAMP(CURDATE() - INTERVAL 37 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 36 DAY, 6, 'FOLLICULAR', 'STRENGTH', 'MODERATE', 55, 'Full body strength - rebuild', 'COMPLETED', 2, 9, 55, NULL, TIMESTAMP(CURDATE() - INTERVAL 36 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 34 DAY, 8, 'FOLLICULAR', 'STRENGTH', 'MODERATE', 55, 'Full body strength - rebuild', 'COMPLETED', 4, 7, 55, NULL, TIMESTAMP(CURDATE() - INTERVAL 34 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 33 DAY, 9, 'FOLLICULAR', 'CARDIO_HIIT', 'HIGH', 35, 'Intervals 6x400m', 'COMPLETED', 4, 7, 35, NULL, TIMESTAMP(CURDATE() - INTERVAL 33 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 31 DAY, 11, 'FOLLICULAR', 'CARDIO_HIIT', 'HIGH', 35, 'Intervals 6x400m', 'COMPLETED', 5, 7, 35, NULL, TIMESTAMP(CURDATE() - INTERVAL 31 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 30 DAY, 12, 'FOLLICULAR', 'STRENGTH', 'HIGH', 60, 'Lower body strength - heavy', 'COMPLETED', 5, 7, 60, NULL, TIMESTAMP(CURDATE() - INTERVAL 30 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 28 DAY, 14, 'OVULATORY', 'STRENGTH', 'HIGH', 65, 'Upper body strength - peak load', 'COMPLETED', 5, 7, 65, 'Hit a PR on squats, felt unstoppable', TIMESTAMP(CURDATE() - INTERVAL 28 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 27 DAY, 15, 'OVULATORY', 'CARDIO_HIIT', 'HIGH', 35, 'Sprint intervals', 'COMPLETED', 5, 7, 35, NULL, TIMESTAMP(CURDATE() - INTERVAL 27 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 25 DAY, 17, 'LUTEAL', 'CARDIO_LISS', 'MODERATE', 45, 'Steady state 45 min', 'COMPLETED', 3, 8, 45, NULL, TIMESTAMP(CURDATE() - INTERVAL 25 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 24 DAY, 18, 'LUTEAL', 'STRENGTH', 'MODERATE', 55, 'Full body strength - volume', 'COMPLETED', 2, 9, 55, 'Same crash as last month, right after the PR week', TIMESTAMP(CURDATE() - INTERVAL 24 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 22 DAY, 20, 'LUTEAL', 'STRENGTH', 'MODERATE', 55, 'Full body strength - volume', 'COMPLETED', 2, 9, 55, NULL, TIMESTAMP(CURDATE() - INTERVAL 22 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 21 DAY, 21, 'LUTEAL', 'CARDIO_LISS', 'MODERATE', 45, 'Steady state 45 min', 'PARTIAL', 2, 9, 25, 'Legs heavy, stopped early', TIMESTAMP(CURDATE() - INTERVAL 21 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 19 DAY, 23, 'LUTEAL', 'MOBILITY', 'LOW', 30, 'Yoga + mobility', 'COMPLETED', 3, 8, 30, NULL, TIMESTAMP(CURDATE() - INTERVAL 19 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 18 DAY, 24, 'LUTEAL', 'STRENGTH', 'LOW', 45, 'Light technique work', 'SKIPPED', 2, NULL, NULL, 'Too wiped out, called it', TIMESTAMP(CURDATE() - INTERVAL 18 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 16 DAY, 26, 'LUTEAL', 'STRENGTH', 'LOW', 45, 'Light technique work', 'COMPLETED', 2, 9, 45, NULL, TIMESTAMP(CURDATE() - INTERVAL 16 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 15 DAY, 27, 'LUTEAL', 'MOBILITY', 'LOW', 30, 'Yoga + mobility', 'PARTIAL', 2, 9, 15, 'Cut it short, energy tanked', TIMESTAMP(CURDATE() - INTERVAL 15 DAY, '19:30:00')),
-- Cycle 3 - current, in progress (started 11 days ago, today = cycle day 12)
  (@uid, CURDATE() - INTERVAL 10 DAY, 2, 'MENSTRUAL', 'MOBILITY', 'LOW', 30, 'Mobility + breath work', 'COMPLETED', 2, 9, 30, NULL, TIMESTAMP(CURDATE() - INTERVAL 10 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 9 DAY, 3, 'MENSTRUAL', 'CARDIO_LISS', 'LOW', 40, 'Easy zone 2 walk/jog', 'COMPLETED', 3, 8, 40, NULL, TIMESTAMP(CURDATE() - INTERVAL 9 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 7 DAY, 5, 'MENSTRUAL', 'CARDIO_LISS', 'LOW', 40, 'Easy zone 2 walk/jog', 'COMPLETED', 3, 8, 40, NULL, TIMESTAMP(CURDATE() - INTERVAL 7 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 6 DAY, 6, 'FOLLICULAR', 'STRENGTH', 'MODERATE', 55, 'Full body strength - rebuild', 'COMPLETED', 3, 8, 55, NULL, TIMESTAMP(CURDATE() - INTERVAL 6 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 4 DAY, 8, 'FOLLICULAR', 'STRENGTH', 'MODERATE', 55, 'Full body strength - rebuild', 'COMPLETED', 4, 7, 55, NULL, TIMESTAMP(CURDATE() - INTERVAL 4 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 3 DAY, 9, 'FOLLICULAR', 'CARDIO_HIIT', 'HIGH', 35, 'Intervals 6x400m', 'COMPLETED', 4, 7, 35, NULL, TIMESTAMP(CURDATE() - INTERVAL 3 DAY, '19:30:00')),
  (@uid, CURDATE() - INTERVAL 1 DAY, 11, 'FOLLICULAR', 'CARDIO_HIIT', 'HIGH', 35, 'Intervals 6x400m', 'COMPLETED', 5, 7, 35, NULL, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '19:30:00')),
-- Upcoming, not logged yet: today's session is what Part 6 opens on.
  (@uid, CURDATE(),                  12, 'FOLLICULAR', 'STRENGTH',    'HIGH', 60, 'Lower body strength - heavy',   'PLANNED', NULL, NULL, NULL, NULL, NULL),
  (@uid, CURDATE() + INTERVAL 2 DAY, 14, 'OVULATORY',  'STRENGTH',    'HIGH', 65, 'Upper body strength - peak load','PLANNED', NULL, NULL, NULL, NULL, NULL),
  (@uid, CURDATE() + INTERVAL 3 DAY, 15, 'OVULATORY',  'CARDIO_HIIT', 'HIGH', 35, 'Sprint intervals',               'PLANNED', NULL, NULL, NULL, NULL, NULL);


-- ---------------------------------------------------------------------
-- 6. Link every session to the plan week it belongs to
-- ---------------------------------------------------------------------
UPDATE session_logs s
JOIN   training_plans p
       ON  p.user_id = s.user_id
       AND s.session_date >= p.week_start_date
       AND s.session_date <  p.week_start_date + INTERVAL 7 DAY
SET    s.plan_id = p.plan_id
WHERE  s.user_id = @uid;


-- ---------------------------------------------------------------------
-- 7. Sanity check (should print 1 / 3 / 11 / 46 and 0 orphans)
-- ---------------------------------------------------------------------
SELECT 'profiles' AS table_name, COUNT(*) AS rows_seeded FROM cycle_profiles WHERE user_id = @uid
UNION ALL SELECT 'cycles',        COUNT(*) FROM cycles         WHERE user_id = @uid
UNION ALL SELECT 'plans',         COUNT(*) FROM training_plans WHERE user_id = @uid
UNION ALL SELECT 'sessions',      COUNT(*) FROM session_logs   WHERE user_id = @uid
UNION ALL SELECT 'orphan sessions (want 0)',
                                  COUNT(*) FROM session_logs   WHERE user_id = @uid AND plan_id IS NULL;
