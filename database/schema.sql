CREATE DATABASE IF NOT EXISTS herbalance;
USE herbalance;


-- =========================
-- USERS
-- =========================

CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,

    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50),

    email VARCHAR(255) NOT NULL UNIQUE,
    -- The `sub` claim from the Auth0 access token, e.g. 'auth0|abc123'. The
    -- API trusts this and nothing the client sends. NULL for seed/demo rows.
    auth0_sub VARCHAR(255) NULL UNIQUE,
    -- Unused since Auth0: it holds credentials, this app never sees them.
    password VARCHAR(255) NULL,

    date_of_birth DATE,

    height_cm DECIMAL(5,2),

    calorie_goal INT,
    protein_goal DECIMAL(6,2),
    carb_goal DECIMAL(6,2),
    fat_goal DECIMAL(6,2),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================
-- FOODS
-- Nutritional values per 100g
-- =========================

CREATE TABLE foods (
    food_id INT AUTO_INCREMENT PRIMARY KEY,

    name VARCHAR(150) NOT NULL,

    calories DECIMAL(8,2) NOT NULL,
    protein DECIMAL(8,2) DEFAULT 0,
    carbs DECIMAL(8,2) DEFAULT 0,
    fat DECIMAL(8,2) DEFAULT 0,

    serving_size_g DECIMAL(8,2) DEFAULT 100
);


-- =========================
-- FOOD LOGS
-- What the user actually eats
-- =========================

CREATE TABLE food_logs (
    food_log_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL,
    food_id INT NOT NULL,

    quantity_g DECIMAL(8,2) NOT NULL,

    meal_type ENUM(
        'BREAKFAST',
        'LUNCH',
        'DINNER',
        'SNACK'
    ) NOT NULL,

    eaten_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    FOREIGN KEY (food_id)
        REFERENCES foods(food_id)
);


-- =========================
-- MOOD / PSYCHOLOGY LOG
-- =========================

CREATE TABLE mood_logs (
    mood_log_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL,

    mood_level TINYINT,
    stress_level TINYINT,
    hunger_level TINYINT,
    craving_level TINYINT,

    eating_reason ENUM(
        'HUNGER',
        'CRAVING',
        'STRESS',
        'BOREDOM',
        'SOCIAL',
        'HABIT',
        'OTHER'
    ),

    notes VARCHAR(500),

    logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    CHECK (mood_level BETWEEN 1 AND 10),
    CHECK (stress_level BETWEEN 1 AND 10),
    CHECK (hunger_level BETWEEN 1 AND 10),
    CHECK (craving_level BETWEEN 1 AND 10)
);


-- =========================
-- WEIGHT HISTORY
-- =========================

CREATE TABLE weight_logs (
    weight_log_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL,

    weight_kg DECIMAL(5,2) NOT NULL,

    logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);


-- =========================
-- MENSTRUAL CYCLE LOG
-- Optional women's-health feature
-- =========================

CREATE TABLE cycle_logs (
    cycle_log_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL,

    log_date DATE NOT NULL,

    period_started BOOLEAN DEFAULT FALSE,
    period_ended BOOLEAN DEFAULT FALSE,

    flow_level ENUM(
        'NONE',
        'LIGHT',
        'MEDIUM',
        'HEAVY'
    ),

    cramps_level TINYINT,
    bloating_level TINYINT,
    energy_level TINYINT,

    notes VARCHAR(500),

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    CHECK (cramps_level BETWEEN 1 AND 10),
    CHECK (bloating_level BETWEEN 1 AND 10),
    CHECK (energy_level BETWEEN 1 AND 10)
);