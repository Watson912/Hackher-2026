import { describe, expect, it } from 'vitest';
import {
  addDays, computeCycle, cycleWeekOf, daysBetween, phaseBands, phaseOnDay, resolveCycleLength,
} from './cycleEngine.ts';
import rules from './rules.json' with { type: 'json' };
import type { CycleInput, Phase } from './types.ts';

// Maya, the seed user: period started 2026-09-08, today is cycle day 12.
const maya: CycleInput = {
  lastPeriodStart: '2026-09-08',
  cycleLength: 29,
  periodLength: 5,
  regularity: 'REGULAR',
  suppressed: false,
  today: '2026-09-19',
};

describe('dates', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-09-28', 5)).toBe('2026-10-03');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // leap year
  });

  it('counts whole days between dates', () => {
    expect(daysBetween('2026-09-08', '2026-09-19')).toBe(11);
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30); // spans the DST change
  });

  it('rejects malformed dates', () => {
    expect(() => addDays('9/19/2026', 1)).toThrow(RangeError);
  });
});

describe('computeCycle: Maya on demo day', () => {
  const state = computeCycle(maya);

  it('puts her on cycle day 12, late follicular, week 2', () => {
    expect(state.cycleDay).toBe(12);
    expect(state.phase).toBe('FOLLICULAR');
    expect(state.cycleWeek).toBe(2);
    expect(state.late).toBe(false);
    expect(state.confidence).toBe(1);
  });

  it('predicts ovulation on day 15 and her next period on 2026-10-07', () => {
    expect(state.ovulationDay).toBe(15);
    expect(state.nextPeriodDate).toBe('2026-10-07');
  });

  it('maps every day of the cycle with consecutive dates', () => {
    expect(state.days).toHaveLength(29);
    expect(state.days[0]).toEqual({ day: 1, date: '2026-09-08', phase: 'MENSTRUAL', week: 1 });
    expect(state.days[28]).toEqual({ day: 29, date: '2026-10-06', phase: 'LUTEAL', week: 4 });
  });

  it('uses the same phase bands the seed data was logged with', () => {
    // healthher_02_seed.sql: 1-5 MENSTRUAL, 6-12 FOLLICULAR, 13-16 OVULATORY, 17+ LUTEAL
    const expected = (day: number): Phase =>
      day <= 5 ? 'MENSTRUAL' : day <= 12 ? 'FOLLICULAR' : day <= 16 ? 'OVULATORY' : 'LUTEAL';
    for (const d of state.days) expect(d.phase, `day ${d.day}`).toBe(expected(d.day));
  });
});

describe('computeCycle: edge cases', () => {
  it('is day 1 on the day her period starts', () => {
    const state = computeCycle({ ...maya, today: '2026-09-08' });
    expect(state.cycleDay).toBe(1);
    expect(state.phase).toBe('MENSTRUAL');
  });

  it('flags a late period, stays luteal and lowers confidence', () => {
    const state = computeCycle({ ...maya, today: '2026-10-10' }); // day 33 of 29
    expect(state.cycleDay).toBe(33);
    expect(state.late).toBe(true);
    expect(state.phase).toBe('LUTEAL');
    expect(state.cycleWeek).toBe(4);
    expect(state.confidence).toBe(0.5);
  });

  it('returns SUPPRESSED on every day for hormonal birth control', () => {
    const state = computeCycle({ ...maya, suppressed: true });
    expect(state.phase).toBe('SUPPRESSED');
    expect(state.ovulationDay).toBeNull();
    expect(state.confidence).toBe(1);
    expect(state.days.every((d) => d.phase === 'SUPPRESSED')).toBe(true);
  });

  it('returns UNKNOWN with no period date', () => {
    const state = computeCycle({ ...maya, lastPeriodStart: null });
    expect(state.phase).toBe('UNKNOWN');
    expect(state.cycleDay).toBeNull();
    expect(state.days).toEqual([]);
    expect(state.confidence).toBe(0);
  });

  it('rejects a period start in the future', () => {
    expect(() => computeCycle({ ...maya, lastPeriodStart: '2026-09-20' })).toThrow(RangeError);
  });

  it('widens the ovulatory window and lowers confidence for irregular cycles', () => {
    const regular = phaseBands(29, 5, 'REGULAR');
    const irregular = phaseBands(29, 5, 'IRREGULAR');
    expect(regular.ovulatoryEnd - regular.ovulatoryStart + 1).toBe(4);
    expect(irregular.ovulatoryEnd - irregular.ovulatoryStart + 1).toBe(8);
    expect(computeCycle({ ...maya, regularity: 'IRREGULAR' }).confidence).toBe(0.6);
    expect(computeCycle({ ...maya, regularity: 'UNKNOWN' }).confidence).toBe(0.8);
  });

  it('keeps the ovulatory window clear of the period on very short cycles', () => {
    const bands = phaseBands(15, 5, 'IRREGULAR');
    expect(bands.ovulatoryStart).toBeGreaterThan(5);
    expect(phaseOnDay(5, 5, bands)).toBe('MENSTRUAL');
    expect(phaseOnDay(6, 5, bands)).toBe('OVULATORY');
  });

  it('shifts ovulation later on long cycles', () => {
    const state = computeCycle({ ...maya, cycleLength: 35 });
    expect(state.ovulationDay).toBe(21);
    expect(state.phase).toBe('FOLLICULAR');
  });
});

describe('cycleWeekOf', () => {
  it('buckets by 7 days and folds days 29+ into week 4', () => {
    expect([1, 7, 8, 14, 15, 21, 22, 28, 29, 35].map(cycleWeekOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 4, 4]);
  });
});

describe('resolveCycleLength', () => {
  it('keeps the onboarding number until there are 2 completed cycles', () => {
    expect(resolveCycleLength(28, [])).toBe(28);
    expect(resolveCycleLength(28, [32])).toBe(28);
  });

  it('averages her last 3 completed cycles', () => {
    expect(resolveCycleLength(28, [31, 32])).toBe(32); // 31.5 rounds up
    expect(resolveCycleLength(28, [40, 30, 31, 32])).toBe(31);
  });
});

describe('rules.json', () => {
  it('has the textbook curve the seed data and queries are built against', () => {
    const weeks = rules.textbook.weeks;
    expect([weeks['1'], weeks['2'], weeks['3'], weeks['4']].map((w) => w.expectedEnergy))
      .toEqual([3.0, 4.5, 4.0, 2.5]);
  });

  it('has an entry for every phase the engine can return', () => {
    const phases: Phase[] = ['MENSTRUAL', 'FOLLICULAR', 'OVULATORY', 'LUTEAL', 'SUPPRESSED', 'UNKNOWN'];
    for (const p of phases) expect(rules.phases[p], p).toBeDefined();
  });
});
