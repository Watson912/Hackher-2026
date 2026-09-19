import { describe, expect, it } from 'vitest';
import { dayInfo } from './cycleEngine.ts';
import fixture from './fixtures/maya-sessions.json' with { type: 'json' };
import { learnedPattern, type LoggedSession } from './learning.ts';
import { generateWeek, intensityFor, phaseRule } from './planGenerator.ts';
import type { CycleInput } from './types.ts';

const cycle: CycleInput = {
  lastPeriodStart: '2026-09-08',
  cycleLength: 29,
  periodLength: 5,
  regularity: 'REGULAR',
  suppressed: false,
  today: '2026-09-19',
};
const pattern = learnedPattern(fixture.sessions as LoggedSession[], '2026-09-19');
const WEEK_3_START = '2026-09-22'; // cycle day 15

describe('textbook layer', () => {
  const plan = generateWeek({ cycle, weekStart: WEEK_3_START, goal: 'STRENGTH', daysPerWeek: 4, pattern: null });

  it('schedules 4 sessions on the configured days', () => {
    expect(plan.sessions.map((s) => s.date)).toEqual(['2026-09-22', '2026-09-24', '2026-09-25', '2026-09-27']);
    expect(plan.sessions.map((s) => s.slot)).toEqual(['STRENGTH', 'CARDIO', 'STRENGTH', 'STRENGTH']);
  });

  it('follows the phase: heavy at ovulation, moderate in early luteal', () => {
    expect(plan.sessions.map((s) => [s.cycleDay, s.phase, s.intensity])).toEqual([
      [15, 'OVULATORY', 'HIGH'],
      [17, 'LUTEAL', 'MODERATE'],
      [18, 'LUTEAL', 'MODERATE'],
      [20, 'LUTEAL', 'MODERATE'],
    ]);
  });

  it('makes no personal changes without a learned pattern', () => {
    expect(plan.sessions.every((s) => !s.adjusted && s.adjustment === 0)).toBe(true);
    expect(plan.personalAdjustment).toBe(0);
    expect(plan.adjustmentReason).toBeNull();
  });

  it('picks the nutrition notes for the dominant phase', () => {
    expect(plan.phase).toBe('LUTEAL');
    expect(plan.nutritionNotes).toMatch(/Magnesium/);
  });

  it('deloads in late luteal and on her period', () => {
    // Block starts on day 27 and runs into the next predicted cycle (day 1 = 2026-10-07).
    const late = generateWeek({ cycle, weekStart: '2026-10-04', goal: 'STRENGTH', daysPerWeek: 3, pattern: null });
    expect(late.sessions.map((s) => [s.cycleDay, s.phase, s.intensity])).toEqual([
      [27, 'LUTEAL', 'LOW'],
      [29, 'LUTEAL', 'LOW'],
      [2, 'MENSTRUAL', 'LOW'],
    ]);
  });
});

describe('personal layer: Maya\'s week 3', () => {
  const plan = generateWeek({ cycle, weekStart: WEEK_3_START, goal: 'STRENGTH', daysPerWeek: 4, pattern });

  it('dials every week-3 session down one step', () => {
    expect(plan.sessions.map((s) => [s.textbook.intensity, s.intensity])).toEqual([
      ['HIGH', 'MODERATE'],
      ['MODERATE', 'LOW'],
      ['MODERATE', 'LOW'],
      ['MODERATE', 'LOW'],
    ]);
    expect(plan.sessions.every((s) => s.adjusted && s.adjustment === -0.2)).toBe(true);
  });

  it('shortens sessions too, and keeps the textbook version for the toggle', () => {
    const first = plan.sessions[0];
    expect(first.durationMin).toBeLessThan(first.textbook.durationMin);
    expect(first.textbook).toEqual({ sessionType: 'STRENGTH', intensity: 'HIGH', durationMin: 60, focus: 'Heavy compound lifts' });
  });

  it('says why', () => {
    expect(plan.personalAdjustment).toBe(-0.2);
    expect(plan.textbookIntensityModifier).toBe(0.95);
    expect(plan.intensityModifier).toBe(0.75);
    expect(plan.adjustmentReason).toContain('week 3');
    expect(plan.adjustmentReason).toContain('20% lighter');
  });

  it('leaves her week 2 alone, since it matches the textbook', () => {
    const week2 = generateWeek({ cycle, weekStart: '2026-09-15', goal: 'STRENGTH', daysPerWeek: 4, pattern });
    expect(week2.sessions.every((s) => !s.adjusted)).toBe(true);
    expect(week2.adjustmentReason).toBeNull();
  });
});

describe('other users', () => {
  it('keeps birth control users flat and ignores learning', () => {
    const plan = generateWeek({ cycle: { ...cycle, suppressed: true }, weekStart: WEEK_3_START, goal: 'STRENGTH', daysPerWeek: 4, pattern });
    expect(plan.sessions.every((s) => s.phase === 'SUPPRESSED' && s.intensity === 'MODERATE' && !s.adjusted)).toBe(true);
  });

  it('still produces a plan with no period date', () => {
    const plan = generateWeek({ cycle: { ...cycle, lastPeriodStart: null }, weekStart: WEEK_3_START, goal: 'ENDURANCE', daysPerWeek: 3, pattern });
    expect(plan.sessions).toHaveLength(3);
    expect(plan.phase).toBe('UNKNOWN');
    expect(plan.sessions[0].slot).toBe('CARDIO');
  });

  it('respects the training days setting', () => {
    for (const n of [1, 2, 3, 5, 6, 7]) {
      expect(generateWeek({ cycle, weekStart: WEEK_3_START, goal: 'GENERAL_FITNESS', daysPerWeek: n, pattern: null }).sessions).toHaveLength(n);
    }
  });
});

describe('helpers', () => {
  it('buckets modifiers into intensities', () => {
    expect([1.1, 1.0, 0.98, 0.9, 0.85, 0.8, 0.7].map(intensityFor))
      .toEqual(['HIGH', 'HIGH', 'HIGH', 'MODERATE', 'MODERATE', 'LOW', 'LOW']);
  });

  it('uses the late-luteal rule only in week 4', () => {
    expect(phaseRule('LUTEAL', 3).intensityModifier).toBe(0.9);
    expect(phaseRule('LUTEAL', 4).intensityModifier).toBe(0.75);
  });

  it('dayInfo stays late luteal when she is already late', () => {
    const late = { ...cycle, today: '2026-10-10' }; // day 33 of 29
    expect(dayInfo(late, '2026-10-12')).toMatchObject({ day: 35, phase: 'LUTEAL', week: 4 });
  });
});
