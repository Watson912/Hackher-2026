# CycleSync — Hackers 2026 @ GSU

A training app that adapts to the menstrual cycle and shifts toward the
pattern in her own logs. See [PLAN.md](PLAN.md).

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
- **Get started** runs onboarding (one question per screen: name, goal,
  experience, consistency, body stats, where you train, an equipment
  checklist, workout days, birth control, last period) and builds a real
  first plan for a new user. Use it to show judges the first-run experience.

**Settings** in the header changes her workout days; the plan reschedules
around them. **Switch** goes back to the start screen.

On Today she can **Change** the workout type (Squat and push, Hinge and
pull, Full body, Cardio, Mobility), **+ Add exercise** from anything her
equipment allows (and **Remove** what she added), or **Add a workout** on a
rest day. Anything she changes is kept when the plan is regenerated.

**Period started** (under the phase on Today) logs a new cycle whenever it
really starts, early or late. Past her expected day with nothing logged, the
app holds her on the last day of the cycle and shows "Period due N days ago"
instead of guessing a new cycle has begun. Logging updates her average cycle
length from her completed cycles and replans.

Suggested 90-second run, as Maya:

1. **Today**: day 12, a heavy lift, with the phase note and its sources.
   Each exercise shows its suggested load and why ("Up from 8 kg, you rated
   that a 6"). Tap **Swap** on one, then log the session in three taps: how it
   went, session RPE (Borg CR-10), fatigue (Hooper). The feedback line shows
   the session load (RPE × minutes).
2. **Plan**: the shape of the four weeks at a glance. Week 3 (days 15-21) is
   moderate where the textbook says high, with the reason.
3. **Cycle**: the wheel. Pink bars are her plan and gray ticks are the textbook.
   They only part ways in week 3.
4. **Insights**: "Your data suggests your hardest-feeling week is week 3, not
   week 4 as the default expects." Show the fatigue chart, the session load
   chart, the by-phase table, flip the Textbook/Yours toggle, then the
   learning timeline.

Then onboard a new user to show the cold start: the plan follows the textbook
and Insights shows progress toward learning each week.
