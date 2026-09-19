# HealthHer — Part 3: Data Layer

MySQL 8.0. Eight tables on top of the existing `users` table, plus seed data
for one demo user with two cycles of history already logged.

## Run order (dBeaver: open file, pick the `herbalance` connection, Execute script / Alt+X)

| # | File | What it does |
|---|------|--------------|
| 1 | `schema.sql` | Existing schema. Creates `herbalance` + `users`. |
| 2 | `healthher_01_schema.sql` | The eight HealthHer tables + 5 helper views. |
| 3 | `healthher_02_seed.sql` | Demo user Maya Chen with a full history. |
| 4 | `healthher_03_queries.sql` | Not required — the query cookbook for Parts 1–7. |
| – | `healthher_04_migrate_session_ratings.sql` | Only for a database built before 2026-09-19 that you want to keep: adds the new columns and tables in place. Then re-run step 3. |
| – | `healthher_05_auth0.sql` | Only for a database built before Auth0 was added: puts `auth0_sub` on `users`. A fresh run of step 1 already has it, and running this on top will fail with a duplicate column. |

Steps 2 and 3 are safe to re-run. Step 2 drops and recreates only the eight
HealthHer tables (so every onboarded user loses their profile); step 3 deletes
and re-inserts only `demo@healthher.app`.

From the `api` folder you can also run any of these without dBeaver:
`npx tsx scripts/run-sql.ts ../database/healthher_02_seed.sql`.

## The eight tables

| Table | One row per | Owned by |
|-------|-------------|----------|
| `cycle_profiles` | user | Part 4 writes it, Parts 1 & 2 read it |
| `cycles` | menstrual cycle | Part 1 |
| `training_plans` | generated week | Part 2 |
| `session_logs` | session (planned **and** logged) | Part 2 creates, Part 6 updates, Part 7 reads |
| `exercise_logs` | exercise she logged in a session: weight, every set done, RPE (Borg CR-10) | Today writes it, the plan generator reads her latest per exercise for the next load |
| `planned_exercises` | exercise in a planned session: sets, reps, target RPE, the suggested load and why | Written every time the plan is regenerated; Today and the Plan view read it |
| `exercise_swaps` | exercise she swapped out, and what she does instead | Today's Swap button writes it; the plan generator uses her pick in every future session |
| `user_equipment` | equipment item she ticked in onboarding | Onboarding writes it; no rows means the `equipment_tier` preset applies |

A logged session carries the two validated ratings the app asks for:
`perceived_effort` is session RPE on the Borg CR-10 scale (0–10) and
`fatigue` is the Hooper Index fatigue item (1–7). `session_load` is a
generated column, RPE × minutes (Foster's session-RPE method).

A session row is inserted as `status = 'PLANNED'` when the plan is generated,
then updated in place when she logs it. There is no separate "planned" table.

`session_logs.cycle_day` and `session_logs.phase` are snapshotted at generation
time so Part 7 can group by phase without re-running the cycle engine over
her whole history.

### Views (read-only, for the screens)

- `v_today_session` — Part 6's card
- `v_cycle_wheel` — Part 5, one row per day of the current cycle with a 0–100 `load_score`
- `v_phase_performance` — Part 7, her averages per phase
- `v_cycle_week_performance` — Part 7, her averages per week of cycle
- `v_cycle_history` — cycle lengths, already computed

## Seed data

`demo@healthher.app` / Maya Chen — 3 cycles (2 complete, 1 running), 11 weekly
plans, 43 logged sessions, 3 upcoming.

**All dates are relative to `CURDATE()`**, so the demo never goes stale. Today
always lands on cycle day 12 (late follicular): two thirds of the wheel is
filled in and there is a session waiting to be logged.

The logged ratings are shaped so Insights finds a real pattern. The default
expects her most fatigued in week 4 (the late luteal deload week); Maya's
fatigue peaks straight after ovulation, days 17-21, and those sessions felt
about 2.4 RPE points harder than planned. Every other week is within a point
of the default, so the one difference is unmistakable:

```
         fatigue (1-7)   default   difference
week 1   4.25            3.5       +0.75
week 2   2.23            2.5       -0.27
week 3   4.60            3.0       +1.60   <- her hardest-feeling week
week 4   4.25            4.5       -0.25
```

A week moves once it has 3 rated sessions and a gap of 1 point or more, so
week 3 is dialed down 20% and the rest stay on the default.

Today is cycle day 12, so the adjusted week (days 15-21) is her upcoming one.

Section 7 of `healthher_03_queries.sql` produces that table and the headline
string straight from the database.

## Edge cases the schema covers

- **Birth control** — `cycle_profiles.cycle_suppressed` is TRUE for hormonal
  methods, and `phase` carries a `'SUPPRESSED'` value so plans stay flat week
  to week. `COPPER_IUD` is non-hormonal, so it stays FALSE.
- **Irregular cycles** — `cycle_regularity` drives wider phase bands, and
  `training_plans.confidence` (0.00–1.00) records how sure Part 1 was.
- **Not enough history** — `cycle_regularity = 'UNKNOWN'` and `phase = 'UNKNOWN'`
  are valid; everything falls back to the 28-day default.

## Spring Boot notes

`application.properties` has `spring.jpa.hibernate.ddl-auto=validate`, so
Hibernate will check the entities against these tables at startup and refuse
to boot on a mismatch. When you write the `@Entity` classes:

- `cycles.cycle_length_days` is a **generated** column. Map it read-only:
  `@Column(insertable = false, updatable = false)`.
- `training_plans.plan_json` is a `JSON` column. Map as `String`, or add
  `@JdbcTypeCode(SqlTypes.JSON)`.
- `created_at` / `updated_at` are database-defaulted — also `insertable = false`.
