# HealthHer — Hackers 2026 @ GSU

A training app that adapts to the menstrual cycle and learns her actual
pattern. See [PLAN.md](PLAN.md).

## Layout

| Folder | What |
|--------|------|
| `web/` | React + TypeScript (Vite), port 5173 |
| `api/` | Node + Express + TypeScript, port 3001 |
| `api/src/core/` | Cycle engine, plan generator, learning layer (pure TS) |
| `database/` | MySQL schema, seed data (Maya Chen), query cookbook |

## Running it

1. Load the database in DBeaver, in the order given in [database/README.md](database/README.md).
2. Put your MySQL password in `api/.env` (copied from `api/.env.example`).
3. Install and start:

```bash
npm run install:all
```

```bash
npm run dev
```

Open http://localhost:5173.

## Demo

The start screen has two paths:

- **See the demo** reloads Maya from `database/healthher_02_seed.sql` so her
  dates line up with today (she is always on cycle day 12), then opens her
  account. Use this on stage: it also undoes anything logged in a rehearsal.
- **Get started** runs the 4-step onboarding and builds a real first plan for
  a new user. Use it to show judges the first-run experience.

**Switch** in the header goes back to the start screen.

Suggested 90-second run, as Maya:

1. **Today**: day 12, a heavy lift. The learning card says "Coming up: week 3
   is 20% lighter" and the next four sessions are tagged *adjusted*. Log the
   session in three taps and read the feedback line.
2. **Cycle**: the wheel. Pink bars are her plan and gray ticks are the textbook.
   They only part ways in week 3 (days 15-19).
3. **Insights**: "Week 3 hits you harder than the textbook says." Show the
   energy chart, flip the Textbook/Yours toggle, then the learning timeline.

Then onboard a new user to show the cold start: the plan follows the textbook
and Insights shows progress toward learning each week.
