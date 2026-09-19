-- =====================================================================
-- HealthHer  |  One-off migration for a database created before
-- 2026-09-19 (session RPE / fatigue logging, routines, swaps, equipment)
-- ---------------------------------------------------------------------
-- Only needed if your database was built with an older
-- healthher_01_schema.sql and you want to keep the users in it. A fresh
-- install doesn't need this: run 01_schema then 02_seed as usual.
--
-- Run once, then re-run healthher_02_seed.sql (or press "See the demo")
-- so Maya gets her ratings.
-- =====================================================================

USE herbalance;

-- ---- session_logs: session RPE (CR-10, 0-10), Hooper fatigue, load ----
ALTER TABLE session_logs DROP CHECK chk_effort;
ALTER TABLE session_logs
    ADD COLUMN fatigue TINYINT UNSIGNED NULL AFTER perceived_effort,
    ADD COLUMN session_load INT UNSIGNED
        GENERATED ALWAYS AS (perceived_effort * actual_duration_min) STORED AFTER actual_duration_min,
    ADD CONSTRAINT chk_effort CHECK (perceived_effort IS NULL OR perceived_effort BETWEEN 0 AND 10),
    ADD CONSTRAINT chk_fatigue CHECK (fatigue IS NULL OR fatigue BETWEEN 1 AND 7);

-- ---- cycle_profiles: strength-training consistency ---------------------
ALTER TABLE cycle_profiles
    ADD COLUMN training_consistency ENUM('NEVER','RETURNING','STRUGGLING','CONSISTENT') NULL AFTER experience_level;

-- ---- cycle_profiles: the days she can train (0 = Sunday), e.g. '1,3,5' ---
ALTER TABLE cycle_profiles
    ADD COLUMN training_weekdays VARCHAR(13) NULL AFTER training_days_per_week;

-- ---- workouts and exercises she adds herself ----------------------------
ALTER TABLE session_logs
    ADD COLUMN user_added BOOLEAN NOT NULL DEFAULT FALSE AFTER focus;

-- ---- new tables (same definitions as healthher_01_schema.sql) ----------
CREATE TABLE IF NOT EXISTS planned_exercises (
    planned_exercise_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id             INT NOT NULL,
    session_log_id      INT NOT NULL,
    position            TINYINT UNSIGNED NOT NULL,
    exercise_id         VARCHAR(64) NOT NULL,
    swapped_from        VARCHAR(64) NULL,
    added_by_user       BOOLEAN NOT NULL DEFAULT FALSE,
    sets                TINYINT UNSIGNED NOT NULL,
    reps                VARCHAR(40) NOT NULL,
    target_rpe          TINYINT UNSIGNED NOT NULL,
    rest_sec            SMALLINT UNSIGNED NOT NULL,
    load_kg             DECIMAL(6,2) NULL,
    load_text           VARCHAR(160) NOT NULL,
    load_reason         VARCHAR(255) NULL,
    load_pct            DECIMAL(4,2) NULL,
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

CREATE TABLE IF NOT EXISTS exercise_swaps (
    user_id             INT NOT NULL,
    exercise_id         VARCHAR(64) NOT NULL,
    swap_to_id          VARCHAR(64) NOT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, exercise_id),
    CONSTRAINT fk_swap_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_equipment (
    user_id             INT NOT NULL,
    equipment           VARCHAR(40) NOT NULL,
    PRIMARY KEY (user_id, equipment),
    CONSTRAINT fk_equipment_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---- views that read the new columns -----------------------------------
CREATE OR REPLACE VIEW v_cycle_wheel AS
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

CREATE OR REPLACE VIEW v_phase_performance AS
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

CREATE OR REPLACE VIEW v_cycle_week_performance AS
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
