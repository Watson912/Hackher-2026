import { Router } from 'express';
import { generateWeek, planBlocks, type SessionSpec } from '../core/planGenerator.ts';
import type { PhaseIntensity } from '../core/types.ts';
import { loadUser } from '../users.ts';

export const wheelRouter = Router();

// Training load per session, 0-100, for the radial bars: the phaseRules intensity scale.
const LOAD: Record<PhaseIntensity, number> = { deload: 30, moderate: 55, high: 80, peak: 100 };
const load = (s: SessionSpec | null) => (s ? LOAD[s.intensityLevel] : 0);

// Part 5: every day of her current cycle with her plan and the textbook
// plan, so the wheel can draw both rings.
wheelRouter.get('/wheel', async (_req, res) => {
  const { cycleInput, cycle, goal, daysPerWeek, pattern, athlete } = await loadUser(res.locals.userId);
  const { days, ...state } = cycle;
  if (!cycleInput.lastPeriodStart || days.length === 0) {
    res.json({ cycle: state, days: [] });
    return;
  }

  // The current cycle, which may have wrapped past her logged period date.
  const start = days[0].date;
  const end = days[days.length - 1].date;
  const sessions = new Map<string, { yours: SessionSpec; textbook: SessionSpec }>();
  for (const block of planBlocks(cycleInput, start, end)) {
    const plan = generateWeek({ cycle: cycleInput, weekStart: block.start, length: block.length, goal, daysPerWeek, pattern, athlete });
    for (const s of plan.sessions) {
      const { textbook, date, sessionType, intensity, intensityLevel, durationMin, focus } = s;
      sessions.set(date, {
        yours: { sessionType, intensity, intensityLevel, durationMin, focus },
        textbook: { sessionType: textbook.sessionType, intensity: textbook.intensity, intensityLevel: textbook.intensityLevel, durationMin: textbook.durationMin, focus: textbook.focus },
      });
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
