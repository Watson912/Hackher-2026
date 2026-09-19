-- =====================================================================
-- HealthHer  |  Part 3: Data Layer  |  Schema (MySQL 8.0+)
-- ---------------------------------------------------------------------
-- Eight tables, built on top of the existing `users` table in schema.sql:
--
--   1. cycle_profiles    -> user profile    (cycle settings + training settings)
--   2. cycles            -> cycle history   (one row per menstrual cycle)
--   3. training_plans    -> generated plans (one row per week, Part 2 output)
--   4. session_logs      -> session logs    (one row per session, planned + logged:
--                                             session RPE, fatigue, minutes, load)
--   5. exercise_logs     -> lift logs       (one row per exercise she logs: weight + RPE)
--   6. planned_exercises -> her routine     (the exercises, sets, reps and suggested
--                                             load of every planned session)
--   7. exercise_swaps    -> her swaps       (exercises she swapped out, remembered)
--   8. user_equipment    -> her equipment   (the items she ticked in onboarding)
--
-- Run order in dBeaver:
--   1) schema.sql              (existing schema, creates `users`)
--   2) healthher_01_schema.sql (this file)
--   3) healthher_02_seed.sql   (demo user with 2 cycles of history)
--
-- Safe to re-run: drops and recreates only the eight HealthHer tables.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS herbalance
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE herbalance;


-- ---------------------------------------------------------------------
-- Dependency: `users` must exist. Same definition as schema.sql,
-- guarded with IF NOT EXISTS so this file can also run standalone.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    user_id       INT AUTO_INCREMENT PRIMARY KEY,

    first_name    VARCHAR(50) NOT NULL,
    last_name     VARCHAR(50),

    email         VARCHAR(255) NOT NULL UNIQUE,
    -- The `sub` claim from the Auth0 access token, e.g. 'auth0|abc123'. The
    -- API trusts this and nothing the client sends. NULL for seed/demo rows.
    auth0_sub     VARCHAR(255) NULL UNIQUE,
    -- Unused since Auth0: it holds credentials, this app never sees them.
    password      VARCHAR(255) NULL,

    date_of_birth DATE,
    height_cm     DECIMAL(5,2),

    calorie_goal  INT,
    protein_goal  DECIMAL(6,2),
    carb_goal     DECIMAL(6,2),
    fat_goal      DECIMAL(6,2),

    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;


-- ---------------------------------------------------------------------
-- Clean slate (views first, then children, then parents)
-- ---------------------------------------------------------------------
DROP VIEW  IF EXISTS v_today_session;
DROP VIEW  IF EXISTS v_cycle_wheel;
DROP VIEW  IF EXISTS v_phase_performance;
DROP VIEW  IF EXISTS v_cycle_week_performance;
DROP VIEW  IF EXISTS v_cycle_history;

DROP TABLE IF EXISTS user_equipment;
DROP TABLE IF EXISTS exercise_swaps;
DROP TABLE IF EXISTS planned_exercises;
DROP TABLE IF EXISTS exercise_logs;
DROP TABLE IF EXISTS session_logs;
DROP TABLE IF EXISTS training_plans;
DROP TABLE IF EXISTS cycles;
DROP TABLE IF EXISTS cycle_profiles;


-- =====================================================================
-- 1. CYCLE_PROFILES  --  the user profile
-- One row per user. Everything Part 1 (cycle engine) and Part 2 (plan
-- generator) need as input, collected by Part 4 (onboarding).
-- =====================================================================
CREATE TABLE cycle_profiles (
    profile_id              INT AUTO_INCREMENT PRIMARY KEY,

    user_id                 INT NOT NULL UNIQUE,

    -- ---- cycle inputs (Part 1) ------------------------------------
    last_period_start_date  DATE,
    avg_cycle_length_days   TINYINT UNSIGNED NOT NULL DEFAULT 28,
    avg_period_length_days  TINYINT UNSIGNED NOT NULL DEFAULT 5,

    -- REGULAR   -> tight phase bands, high confidence
    -- IRREGULAR -> wider phase bands, lower confidence
    -- UNKNOWN   -> no history yet, fall back to the 28-day default
    cycle_regularity        ENUM('REGULAR','IRREGULAR','UNKNOWN')
                            NOT NULL DEFAULT 'UNKNOWN',

    birth_control           ENUM('NONE','COMBINED_PILL','MINI_PILL','HORMONAL_IUD',
                                 'COPPER_IUD','IMPLANT','INJECTION','RING','PATCH','OTHER')
                            NOT NULL DEFAULT 'NONE',

    -- TRUE when hormonal birth control flattens the natural phases.
    -- Part 1 then returns phase = 'SUPPRESSED' and the plan stays flat
    -- week to week. COPPER_IUD is non-hormonal, so it stays FALSE.
    cycle_suppressed        BOOLEAN NOT NULL DEFAULT FALSE,

    -- ---- training inputs (Part 2) ---------------------------------
    goal                    ENUM('STRENGTH','MUSCLE_GAIN','ENDURANCE','FAT_LOSS',
                                 'GENERAL_FITNESS')
                            NOT NULL DEFAULT 'GENERAL_FITNESS',

    training_days_per_week  TINYINT UNSIGNED NOT NULL DEFAULT 3,

    -- the days she can train, 0 = Sunday ... 6 = Saturday, e.g. '1,3,5'.
    -- NULL = no preference: sessions are spread evenly through the week.
    training_weekdays       VARCHAR(13) NULL,

    -- from "how much strength training experience do you have?", one level
    -- lower if she has never been consistent or is returning from a break
    experience_level        ENUM('BEGINNER','INTERMEDIATE','ADVANCED')
                            NOT NULL DEFAULT 'BEGINNER',

    -- "how consistent are you with strength training?" (onboarding)
    training_consistency    ENUM('NEVER','RETURNING','STRUGGLING','CONSISTENT') NULL,

    -- bodyweight, for barbell loads (exercises.json loadBasis). NULL means
    -- the plan shows an effort target instead of a number.
    weight_kg               DECIMAL(5,2) NULL,

    -- used only to set a fuelling range that keeps her recovering; the change
    -- it implies is capped at 0.5% of bodyweight a week (see nutrition.ts)
    goal_weight_kg          DECIMAL(5,2) NULL,

    -- what she can train with; the plan only uses exercises this allows
    -- (exercises.json meta.equipmentTiers). If she ticked items in
    -- onboarding, user_equipment overrides the tier's preset.
    equipment_tier          ENUM('FULL_GYM','DUMBBELLS_HOME','BODYWEIGHT')
                            NOT NULL DEFAULT 'FULL_GYM',

    onboarding_completed    BOOLEAN NOT NULL DEFAULT FALSE,

    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_profile_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,

    CONSTRAINT chk_cycle_length  CHECK (avg_cycle_length_days  BETWEEN 15 AND 60),
    CONSTRAINT chk_period_length CHECK (avg_period_length_days BETWEEN 1  AND 14),
    CONSTRAINT chk_training_days CHECK (training_days_per_week BETWEEN 1  AND 7)
) ENGINE=InnoDB;


-- =====================================================================
-- 2. CYCLES  --  the cycle history
-- One row per cycle. cycle_end_date IS NULL means the cycle is still
-- running (at most one of those per user). Part 1 reads this to compute
-- her real average instead of the number she guessed at onboarding.
-- =====================================================================
CREATE TABLE cycles (
    cycle_id            INT AUTO_INCREMENT PRIMARY KEY,

    user_id             INT NOT NULL,

    cycle_start_date    DATE NOT NULL,          -- day 1 = first day of period
    cycle_end_date      DATE NULL,              -- NULL while in progress

    period_length_days  TINYINT UNSIGNED,

    -- derived, never inserted: full length of a completed cycle
    cycle_length_days   INT AS (
                            CASE WHEN cycle_end_date IS NULL THEN NULL
                                 ELSE DATEDIFF(cycle_end_date, cycle_start_date) + 1
                            END
                        ) VIRTUAL,

    -- TRUE when the app predicted this cycle instead of her logging it
    is_predicted        BOOLEAN NOT NULL DEFAULT FALSE,

    notes               VARCHAR(500),

    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_cycle_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,

    CONSTRAINT uq_cycle_start UNIQUE (user_id, cycle_start_date),

    CONSTRAINT chk_cycle_dates CHECK (cycle_end_date IS NULL
                                      OR cycle_end_date > cycle_start_date)
) ENGINE=InnoDB;

CREATE INDEX idx_cycles_user_start ON cycles (user_id, cycle_start_date DESC);


-- =====================================================================
-- 3. TRAINING_PLANS  --  the generated plans
-- One row per generated week. Stores the phase and goal it was built
-- for, the modifiers Part 2 applied, and the raw generator output as
-- JSON so a plan can be replayed exactly as she saw it.
-- =====================================================================
CREATE TABLE training_plans (
    plan_id                 INT AUTO_INCREMENT PRIMARY KEY,

    user_id                 INT NOT NULL,
    cycle_id                INT NULL,            -- cycle this week fell in

    week_start_date         DATE NOT NULL,       -- first day of the 7-day block
    cycle_day_at_start      SMALLINT UNSIGNED,   -- cycle day on week_start_date

    phase                   ENUM('MENSTRUAL','FOLLICULAR','OVULATORY','EARLY_LUTEAL','LATE_LUTEAL',
                                 'LUTEAL','SUPPRESSED','UNKNOWN')
                            NOT NULL DEFAULT 'UNKNOWN',

    goal                    ENUM('STRENGTH','MUSCLE_GAIN','ENDURANCE','FAT_LOSS',
                                 'GENERAL_FITNESS') NOT NULL,

    days_per_week           TINYINT UNSIGNED NOT NULL,

    -- what the phase did to the plan; 1.00 = baseline
    intensity_modifier      DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    volume_modifier         DECIMAL(3,2) NOT NULL DEFAULT 1.00,

    nutrition_notes         TEXT,

    -- full Part 2 output, kept verbatim
    plan_json               JSON,

    -- RULES = deterministic JSON rules table, LLM = natural-language layer
    generated_by            ENUM('RULES','LLM','MANUAL') NOT NULL DEFAULT 'RULES',

    -- how sure Part 1 was about the phase (drops for irregular cycles)
    confidence              DECIMAL(3,2) NOT NULL DEFAULT 1.00,

    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_plan_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_plan_cycle
        FOREIGN KEY (cycle_id) REFERENCES cycles(cycle_id) ON DELETE SET NULL,

    CONSTRAINT uq_plan_week UNIQUE (user_id, week_start_date),

    CONSTRAINT chk_confidence CHECK (confidence BETWEEN 0 AND 1)
) ENGINE=InnoDB;

CREATE INDEX idx_plans_user_week ON training_plans (user_id, week_start_date DESC);


-- =====================================================================
-- 4. SESSION_LOGS  --  the session logs
-- One row per session. Inserted as status = 'PLANNED' when the plan is
-- generated, then updated in place by Part 6 when she logs it.
-- cycle_day and phase are snapshotted here so Part 7 can group by phase
-- without re-running the cycle engine over her whole history.
-- =====================================================================
CREATE TABLE session_logs (
    session_log_id          INT AUTO_INCREMENT PRIMARY KEY,

    user_id                 INT NOT NULL,
    plan_id                 INT NULL,            -- plan this session came from

    session_date            DATE NOT NULL,

    -- ---- cycle context, snapshotted at generation time ------------
    cycle_day               SMALLINT UNSIGNED,
    phase                   ENUM('MENSTRUAL','FOLLICULAR','OVULATORY','EARLY_LUTEAL','LATE_LUTEAL',
                                 'LUTEAL','SUPPRESSED','UNKNOWN')
                            NOT NULL DEFAULT 'UNKNOWN',

    -- ---- what the plan asked for ----------------------------------
    session_type            ENUM('STRENGTH','CARDIO_HIIT','CARDIO_LISS',
                                 'MOBILITY','SKILL','REST') NOT NULL,
    planned_intensity       ENUM('LOW','MODERATE','HIGH') NOT NULL DEFAULT 'MODERATE',
    planned_duration_min    SMALLINT UNSIGNED,
    focus                   VARCHAR(120),
    user_added              BOOLEAN NOT NULL DEFAULT FALSE, -- she added or changed this workout; replanning keeps it

    -- ---- what actually happened (three taps; only status required) ----
    status                  ENUM('PLANNED','COMPLETED','PARTIAL','SKIPPED')
                            NOT NULL DEFAULT 'PLANNED',
    perceived_effort        TINYINT UNSIGNED,    -- session RPE, Borg CR-10 (0-10)
    fatigue                 TINYINT UNSIGNED,    -- Hooper Index fatigue item, 1-7
    actual_duration_min     SMALLINT UNSIGNED,
    -- Foster's session-RPE load: RPE x minutes, in arbitrary units
    session_load            INT UNSIGNED
                            GENERATED ALWAYS AS (perceived_effort * actual_duration_min) STORED,
    energy_level            TINYINT UNSIGNED,    -- legacy 1-5 score, no longer asked

    notes                   VARCHAR(500),
    logged_at               DATETIME NULL,       -- NULL until she logs it

    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_session_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_session_plan
        FOREIGN KEY (plan_id) REFERENCES training_plans(plan_id) ON DELETE SET NULL,

    CONSTRAINT chk_energy CHECK (energy_level     IS NULL OR energy_level     BETWEEN 1 AND 5),
    CONSTRAINT chk_effort CHECK (perceived_effort IS NULL OR perceived_effort BETWEEN 0 AND 10),
    CONSTRAINT chk_fatigue CHECK (fatigue IS NULL OR fatigue BETWEEN 1 AND 7)
) ENGINE=InnoDB;

CREATE INDEX idx_sessions_user_date  ON session_logs (user_id, session_date DESC);
CREATE INDEX idx_sessions_user_phase ON session_logs (user_id, phase);


-- =====================================================================
-- 5. EXERCISE_LOGS  --  what she actually lifted
-- One row per exercise she logs in a session: the weight she used, whether
-- she finished every set, and her RPE on the Borg CR-10 scale (0-10). The
-- plan generator reads her most recent row for an exercise to set the next
-- load. load_pct is the phase's loadPct the lift was prescribed at, so the
-- next session can scale her working weight to a lighter or heavier week.
-- =====================================================================
CREATE TABLE exercise_logs (
    exercise_log_id     INT AUTO_INCREMENT PRIMARY KEY,

    user_id             INT NOT NULL,
    session_log_id      INT NOT NULL,
    exercise_id         VARCHAR(64) NOT NULL,   -- exercises.json id
    log_date            DATE NOT NULL,

    load_kg             DECIMAL(6,2) NULL,      -- NULL for bodyweight, time or machine work she didn't weigh
    load_pct            DECIMAL(4,2) NULL,      -- phase loadPct it was prescribed at
    completed           BOOLEAN NOT NULL,       -- every set and rep done
    rpe                 TINYINT UNSIGNED NOT NULL, -- Borg CR-10, 0-10

    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_exlog_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_exlog_session
        FOREIGN KEY (session_log_id) REFERENCES session_logs(session_log_id) ON DELETE CASCADE,

    CONSTRAINT uq_exlog_session_exercise UNIQUE (session_log_id, exercise_id),
    CONSTRAINT chk_exlog_rpe CHECK (rpe BETWEEN 0 AND 10),
    CONSTRAINT chk_exlog_load CHECK (load_kg IS NULL OR load_kg BETWEEN 0 AND 500)
) ENGINE=InnoDB;

CREATE INDEX idx_exlog_user_exercise ON exercise_logs (user_id, exercise_id, log_date DESC);


-- =====================================================================
-- 6. PLANNED_EXERCISES  --  her routine
-- The exercises of every planned session, in order, with the sets, reps,
-- RPE target and the load the app suggests (load_reason says why, from her
-- exercise_logs). Written whenever the plan is regenerated; Today and the
-- Plan view read from here. prescription_json keeps the full prescription
-- (form cue, swap options) the app shows.
-- =====================================================================
CREATE TABLE planned_exercises (
    planned_exercise_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id             INT NOT NULL,
    session_log_id      INT NOT NULL,
    position            TINYINT UNSIGNED NOT NULL,  -- order in the session, from 1
    exercise_id         VARCHAR(64) NOT NULL,       -- exercises.json id
    swapped_from        VARCHAR(64) NULL,           -- the exercise the plan picked, if she swapped it
    added_by_user       BOOLEAN NOT NULL DEFAULT FALSE, -- she added it herself; replanning keeps the session

    sets                TINYINT UNSIGNED NOT NULL,
    reps                VARCHAR(40) NOT NULL,       -- reps, a hold, or a duration
    target_rpe          TINYINT UNSIGNED NOT NULL,
    rest_sec            SMALLINT UNSIGNED NOT NULL,
    load_kg             DECIMAL(6,2) NULL,          -- suggested weight; NULL = effort cue instead
    load_text           VARCHAR(160) NOT NULL,      -- what the app shows: "50 kg", an effort cue...
    load_reason         VARCHAR(255) NULL,          -- "Up from 47.5 kg, you rated that a 6"
    load_pct            DECIMAL(4,2) NULL,          -- the phase loadPct it was prescribed at
    prescription_json   JSON NOT NULL,

    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_planex_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_planex_session
        FOREIGN KEY (session_log_id) REFERENCES session_logs(session_log_id) ON DELETE CASCADE,

    CONSTRAINT uq_planex_session_exercise UNIQUE (session_log_id, exercise_id),
    CONSTRAINT uq_planex_session_position UNIQUE (session_log_id, position)
) ENGINE=InnoDB;


-- =====================================================================
-- 7. EXERCISE_SWAPS  --  swaps she made, remembered
-- When she swaps an exercise, every future session uses her pick instead
-- (if her equipment allows it). Swapping back deletes the row.
-- =====================================================================
CREATE TABLE exercise_swaps (
    user_id             INT NOT NULL,
    exercise_id         VARCHAR(64) NOT NULL,       -- what the plan picks
    swap_to_id          VARCHAR(64) NOT NULL,       -- what she does instead
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, exercise_id),
    CONSTRAINT fk_swap_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;


-- =====================================================================
-- 8. USER_EQUIPMENT  --  the equipment she has
-- One row per exercises.json equipment item she ticked in onboarding.
-- No rows means the equipment_tier preset applies.
-- =====================================================================
CREATE TABLE user_equipment (
    user_id             INT NOT NULL,
    equipment           VARCHAR(40) NOT NULL,       -- exercises.json equipment id, e.g. squat_rack

    PRIMARY KEY (user_id, equipment),
    CONSTRAINT fk_equipment_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;


-- =====================================================================
-- VIEWS  --  read-only helpers so the other parts do not hand-write joins
-- =====================================================================

-- Part 6: what she is doing today.
CREATE VIEW v_today_session AS
SELECT s.session_log_id,
       s.user_id,
       s.session_date,
       s.cycle_day,
       s.phase,
       s.session_type,
       s.planned_intensity,
       s.planned_duration_min,
       s.focus,
       s.status,
       p.plan_id,
       p.nutrition_notes
FROM   session_logs s
LEFT   JOIN training_plans p ON p.plan_id = s.plan_id
WHERE  s.session_date = CURDATE();


-- Part 5: every logged/planned session of the current cycle, with a
-- 0-100 training load per day to map around the wheel.
CREATE VIEW v_cycle_wheel AS
SELECT s.user_id,
       c.cycle_id,
       s.session_date,
       s.cycle_day,
       s.phase,
       s.session_type,
       s.planned_intensity,
       s.status,
       s.fatigue,
       s.perceived_effort,
       s.session_load,
       CASE s.planned_intensity WHEN 'HIGH' THEN 100
                                WHEN 'MODERATE' THEN 65
                                ELSE 30 END AS load_score
FROM   session_logs s
JOIN   cycles c
       ON  c.user_id = s.user_id
       AND s.session_date >= c.cycle_start_date
       AND (c.cycle_end_date IS NULL OR s.session_date <= c.cycle_end_date);


-- Part 7: her actual numbers per phase.
CREATE VIEW v_phase_performance AS
SELECT user_id,
       phase,
       COUNT(*)                                                   AS sessions_planned,
       SUM(status = 'COMPLETED')                                  AS sessions_completed,
       ROUND(100.0 * SUM(status = 'COMPLETED') / COUNT(*), 0)     AS completion_pct,
       ROUND(AVG(fatigue), 2)                                     AS avg_fatigue,
       ROUND(AVG(perceived_effort), 2)                            AS avg_session_rpe,
       ROUND(AVG(session_load), 0)                                AS avg_session_load,
       ROUND(AVG(actual_duration_min), 0)                         AS avg_minutes
FROM   session_logs
WHERE  status <> 'PLANNED'
GROUP  BY user_id, phase;


-- Part 7: the headline insight. Week of cycle, not phase, so the copy
-- can say "your hardest-feeling week is week 3, not week 4". Days 29+
-- fold into week 4, same as the cycle engine.
CREATE VIEW v_cycle_week_performance AS
SELECT user_id,
       LEAST(4, CEIL(cycle_day / 7))                              AS cycle_week,
       COUNT(*)                                                   AS sessions,
       ROUND(AVG(fatigue), 2)                                     AS avg_fatigue,
       ROUND(AVG(perceived_effort), 2)                            AS avg_session_rpe,
       ROUND(AVG(session_load), 0)                                AS avg_session_load,
       ROUND(100.0 * SUM(status = 'COMPLETED') / COUNT(*), 0)     AS completion_pct
FROM   session_logs
WHERE  status <> 'PLANNED'
  AND  cycle_day IS NOT NULL
GROUP  BY user_id, LEAST(4, CEIL(cycle_day / 7));


-- Part 1 / Part 7: cycle history with lengths already computed.
CREATE VIEW v_cycle_history AS
SELECT c.cycle_id,
       c.user_id,
       c.cycle_start_date,
       c.cycle_end_date,
       c.cycle_length_days,
       c.period_length_days,
       c.is_predicted,
       CASE WHEN c.cycle_end_date IS NULL
            THEN DATEDIFF(CURDATE(), c.cycle_start_date) + 1
       END AS current_cycle_day
FROM   cycles c;
