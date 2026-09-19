import { Router } from 'express';
import { addDays, daysBetween, dayInfo } from '../core/cycleEngine.ts';
import { learnedPattern, WEEKS, type WeekPattern } from '../core/learning.ts';
import { generateWeek, planBlocks } from '../core/planGenerator.ts';
import rules from '../core/rules.json' with { type: 'json' };
import { loadUser } from '../users.ts';

export const insightsRouter = Router();

// Part 7: what we learned, and what we changed because of it.
insightsRouter.get('/insights', async (_req, res) => {
  const { today, goal, daysPerWeek, cycleInput, cycle, sessions, pattern } = await loadUser(res.locals.userId);
  const weeks = WEEKS.map((w) => pattern[w]);
  const logged = sessions.filter((s) => s.status !== 'PLANNED');

  // The headline is the week that differs most from the textbook, among
  // weeks with enough sessions to trust and a gap big enough to act on.
  const trusted = weeks.filter((w) => w.sessions >= rules.learning.minSessions && w.energyDelta !== null
    && Math.abs(w.energyDelta) >= rules.learning.threshold);
  const headline: WeekPattern | null =
    [...trusted].sort((a, b) => Math.abs(b.energyDelta!) - Math.abs(a.energyDelta!))[0] ?? null;

  // How the app's read on the headline week built up, one point per week
  // from her first logged session to today.
  const timeline: { date: string; sessions: number; confidence: number; adjustment: number }[] = [];
  if (headline && logged.length) {
    const dates: string[] = [];
    for (let date = logged[0].sessionDate; daysBetween(date, today) > 0; date = addDays(date, 7)) dates.push(date);
    dates.push(today);
    for (const date of dates) {
      const w = learnedPattern(sessions, date, cycle.confidence)[headline.week];
      timeline.push({ date, sessions: w.sessions, confidence: w.confidence, adjustment: w.adjustment });
    }
  }

  // The next block where learning changes her plan: the start of the next
  // adjusted cycle week, or today if she's already in one.
  let nextAdjustedWeek: { start: string; week: number } | null = null;
  for (let i = 0; i < cycle.cycleLength && !nextAdjustedWeek; i++) {
    const info = dayInfo(cycleInput, addDays(today, i));
    if (!info || pattern[info.week].adjustment === 0) continue;
    const startsWeek = (info.day - 1) % 7 === 0 || i === 0;
    if (startsWeek) nextAdjustedWeek = { start: info.date, week: info.week };
  }

  const block = nextAdjustedWeek && planBlocks(cycleInput, nextAdjustedWeek.start, nextAdjustedWeek.start)[0];
  const preview = block
    ? generateWeek({ cycle: cycleInput, weekStart: block.start, length: block.length, goal, daysPerWeek, pattern })
    : null;

  const learns = cycle.phase !== 'SUPPRESSED' && cycle.phase !== 'UNKNOWN';
  res.json({
    today,
    learns,
    minSessions: rules.learning.minSessions,
    loggedSessions: logged.length,
    weeks,
    headline,
    timeline,
    nextAdjustedWeek,
    preview,
  });
});
