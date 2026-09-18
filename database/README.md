# HealthHer — Part 3: Data Layer

MySQL 8.0. Four tables on top of the existing `users` table, plus seed data
for one demo user with two cycles of history already logged.

## Run order (dBeaver: open file, pick the `herbalance` connection, Execute script / Alt+X)

| # | File | What it does |
|---|------|--------------|
| 1 | `schema.sql` | Existing schema. Creates `herbalance` + `users`. |
| 2 | `healthher_01_schema.sql` | The four HealthHer tables + 5 helper views. |
| 3 | `healthher_02_seed.sql` | Demo user Maya Chen with a full history. |
| 4 | `healthher_03_queries.sql` | Not required — the query cookbook for Parts 1–7. |

Steps 2 and 3 are safe to re-run. Step 2 drops and recreates only the four
HealthHer tables; step 3 deletes and re-inserts only `demo@healthher.app`.

## The four tables

| Table | One row per | Owned by |
|-------|-------------|----------|
| `cycle_profiles` | user | Part 4 writes it, Parts 1 & 2 read it |
| `cycles` | menstrual cycle | Part 1 |
| `training_plans` | generated week | Part 2 |
| `session_logs` | session (planned **and** logged) | Part 2 creates, Part 6 updates, Part 7 reads |

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

The logged energy scores are shaped so Part 7 finds a real pattern —
she peaks in cycle **week 2**, while the textbook curve peaks in week 1:

```
week 1   2.75   (textbook 4.5)   -1.75
week 2   4.54   (textbook 4.0)   +0.54   <- her peak
week 3   3.70   (textbook 3.0)   +0.70
week 4   2.25   (textbook 2.5)   -0.25
```

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
