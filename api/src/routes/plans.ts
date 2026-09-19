import { Router } from 'express';
import { generateWeek } from '../core/planGenerator.ts';
import { loadDemo } from '../demoUser.ts';

export const plansRouter = Router();

// Part 2: the plan for the 7 days starting at ?start (default today), with
// the textbook version of every session alongside hers. Not saved.
plansRouter.get('/plans/preview', async (req, res) => {
  const { today, goal, daysPerWeek, cycleInput, pattern } = await loadDemo();
  const start = typeof req.query.start === 'string' ? req.query.start : today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    res.status(400).json({ error: 'start must be YYYY-MM-DD' });
    return;
  }
  res.json(generateWeek({ cycle: cycleInput, weekStart: start, goal, daysPerWeek, pattern }));
});
