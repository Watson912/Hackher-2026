import { Router } from 'express';
import { addDays } from '../core/cycleEngine.ts';
import { generateWeek, planBlocks, type SessionSpec } from '../core/planGenerator.ts';
import type { Intensity } from '../core/types.ts';
import { loadUser } from '../users.ts';

export const wheelRouter = Router();

// Training load per session, 0-100, for the radial bars.
const LOAD: Record<Intensity, number> = { HIGH: 100, MODERATE: 65, LOW: 35 };
const load = (s: SessionSpec | null) => (s ? LOAD[s.intensity] : 0);

// Part 5: every day of her current cycle with her plan and the textbook
// plan, so the wheel can draw both rings.
wheelRouter.get('/wheel', async (_req, res) => {
  const { cycleInput, cycle, goal, daysPerWeek, pattern } = await loadUser(res.locals.userId);
  const { days, ...state } = cycle;
  if (!cycleInput.lastPeriodStart || days.length === 0) {
    res.json({ cycle: state, days: [] });
    return;
  }

  const start = cycleInput.lastPeriodStart;
  const end = addDays(start, cycleInput.cycleLength - 1);
  const sessions = new Map<string, { yours: SessionSpec; textbook: SessionSpec }>();
  for (const block of planBlocks(cycleInput, start, end)) {
    const plan = generateWeek({ cycle: cycleInput, weekStart: block.start, length: block.length, goal, daysPerWeek, pattern });
    for (const s of plan.sessions) {
      const { textbook, date, sessionType, intensity, durationMin, focus } = s;
      sessions.set(date, { yours: { sessionType, intensity, durationMin, focus }, textbook });
    }
  }

  res.json({
    cycle: state,
    days: days.map((d) => {
      const s = sessions.get(d.date) ?? null;
      return {
        ...d,
        isToday: d.day === cycle.cycleDay,
        yours: s?.yours ?? null,
        textbook: s?.textbook ?? null,
        load: load(s?.yours ?? null),
        textbookLoad: load(s?.textbook ?? null),
      };
    }),
  });
});
