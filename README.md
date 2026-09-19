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

Open http://localhost:5173. You should see Maya's profile and history counts.
