-- =====================================================================
-- HealthHer  |  Part 3: Data Layer  |  Schema (MySQL 8.0+)
-- ---------------------------------------------------------------------
-- Four tables, built on top of the existing `users` table in schema.sql:
--
--   1. cycle_profiles   -> user profile    (cycle settings + training settings)
--   2. cycles           -> cycle history   (one row per menstrual cycle)
--   3. training_plans   -> generated plans (one row per week, Part 2 output)
--   4. session_logs     -> session logs    (one row per session, planned + logged)
--
-- Run order in dBeaver:
--   1) schema.sql              (existing schema, creates `users`)
--   2) healthher_01_schema.sql (this file)
--   3) healthher_02_seed.sql   (demo user with 2 cycles of history)
--
-- Safe to re-run: drops and recreates only the four HealthHer tables.
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
    password      VARCHAR(255) NOT NULL,

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

    experience_level        ENUM('BEGINNER','INTERMEDIATE','ADVANCED')
                            NOT NULL DEFAULT 'BEGINNER',

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

    phase                   ENUM('MENSTRUAL','FOLLICULAR','OVULATORY','LUTEAL',
                                 'SUPPRESSED','UNKNOWN')
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
    phase                   ENUM('MENSTRUAL','FOLLICULAR','OVULATORY','LUTEAL',
                                 'SUPPRESSED','UNKNOWN')
                            NOT NULL DEFAULT 'UNKNOWN',

    -- ---- what the plan asked for ----------------------------------
    session_type            ENUM('STRENGTH','CARDIO_HIIT','CARDIO_LISS',
                                 'MOBILITY','SKILL','REST') NOT NULL,
    planned_intensity       ENUM('LOW','MODERATE','HIGH') NOT NULL DEFAULT 'MODERATE',
    planned_duration_min    SMALLINT UNSIGNED,
    focus                   VARCHAR(120),

    -- ---- what actually happened (Part 6, three taps) --------------
    status                  ENUM('PLANNED','COMPLETED','PARTIAL','SKIPPED')
                            NOT NULL DEFAULT 'PLANNED',
    energy_level            TINYINT UNSIGNED,    -- 1-5, how she felt
    perceived_effort        TINYINT UNSIGNED,    -- RPE 1-10, how hard it was
    actual_duration_min     SMALLINT UNSIGNED,

    notes                   VARCHAR(500),
    logged_at               DATETIME NULL,       -- NULL until she logs it

    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_session_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_session_plan
        FOREIGN KEY (plan_id) REFERENCES training_plans(plan_id) ON DELETE SET NULL,

    CONSTRAINT chk_energy CHECK (energy_level     IS NULL OR energy_level     BETWEEN 1 AND 5),
    CONSTRAINT chk_effort CHECK (perceived_effort IS NULL OR perceived_effort BETWEEN 1 AND 10)
) ENGINE=InnoDB;

CREATE INDEX idx_sessions_user_date  ON session_logs (user_id, session_date DESC);
CREATE INDEX idx_sessions_user_phase ON session_logs (user_id, phase);


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
       s.energy_level,
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
       ROUND(AVG(energy_level), 2)                                AS avg_energy,
       ROUND(AVG(perceived_effort), 2)                            AS avg_effort,
       ROUND(AVG(actual_duration_min), 0)                         AS avg_minutes
FROM   session_logs
WHERE  status <> 'PLANNED'
GROUP  BY user_id, phase;


-- Part 7: the headline insight. Week of cycle, not phase, so the copy
-- can say "your energy crashes in week 3, a week earlier than typical".
CREATE VIEW v_cycle_week_performance AS
SELECT user_id,
       CEIL(cycle_day / 7)                                        AS cycle_week,
       COUNT(*)                                                   AS sessions,
       ROUND(AVG(energy_level), 2)                                AS avg_energy,
       ROUND(AVG(perceived_effort), 2)                            AS avg_effort,
       ROUND(100.0 * SUM(status = 'COMPLETED') / COUNT(*), 0)     AS completion_pct
FROM   session_logs
WHERE  status <> 'PLANNED'
  AND  cycle_day IS NOT NULL
GROUP  BY user_id, CEIL(cycle_day / 7);


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
