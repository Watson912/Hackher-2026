import { describe, expect, it } from 'vitest';
import phaseRules from '../data/phaseRules.json' with { type: 'json' };
import {
  addDays, bandOnDay, computeCycle, holdIfLate, confidenceLevel, cycleVariation, cycleWeekOf, dayInfo, daysBetween,
  phaseDetails, resolveCycleLength, scaledPhases,
} from './cycleEngine.ts';
import rules from './rules.json' with { type: 'json' };
import type { CycleInput, Phase } from './types.ts';

// Maya, the seed user: period started 2026-09-08, 29-day cycle, today is day 12.
const maya: CycleInput = {
  lastPeriodStart: '2026-09-08',
  cycleLength: 29,
  periodLength: 5,
  regularity: 'REGULAR',
  suppressed: false,
  today: '2026-09-19',
};
const flag = (id: string) => phaseRules.flags.find((f) => f.id === id)!.copy;
const bands = (n: number) => scaledPhases(n).map((b) => `${b.phase} ${b.start}-${b.end}`);

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

describe('phase bands from phaseRules, scaled to her cycle', () => {
  it('uses the raw dayRange values on a 28-day cycle', () => {
    expect(bands(28)).toEqual([
      'MENSTRUAL 1-5', 'FOLLICULAR 6-11', 'OVULATORY 12-16', 'EARLY_LUTEAL 17-23', 'LATE_LUTEAL 24-28',
    ]);
  });

  it('stretches a 32-day cycle with no orphan days', () => {
    expect(bands(32)).toEqual([
      'MENSTRUAL 1-6', 'FOLLICULAR 7-13', 'OVULATORY 14-18', 'EARLY_LUTEAL 19-26', 'LATE_LUTEAL 27-32',
    ]);
  });

  it('scales Maya\'s 29-day cycle', () => {
    expect(bands(29)).toEqual([
      'MENSTRUAL 1-5', 'FOLLICULAR 6-11', 'OVULATORY 12-17', 'EARLY_LUTEAL 18-24', 'LATE_LUTEAL 25-29',
    ]);
  });

  it('compresses a 21-day cycle', () => {
    expect(bands(21)).toEqual([
      'MENSTRUAL 1-4', 'FOLLICULAR 5-8', 'OVULATORY 9-12', 'EARLY_LUTEAL 13-17', 'LATE_LUTEAL 18-21',
    ]);
  });

  it('covers every day exactly once for every length from 21 to 45', () => {
    for (let n = 21; n <= 45; n++) {
      const b = scaledPhases(n);
      expect(b[0].start, `length ${n}`).toBe(1);
      expect(b.at(-1)!.end, `length ${n}`).toBe(n);
      for (let i = 1; i < b.length; i++) expect(b[i].start, `length ${n}`).toBe(b[i - 1].end + 1);
      expect(b.every((x) => x.end >= x.start), `length ${n}`).toBe(true);
    }
  });

  it('carries the phaseRules object, colour and intensity', () => {
    const band = bandOnDay(8, 28);
    expect(band.details).toBe(phaseRules.phases[1]);
    expect(band.details.color).toBe('#C9736A');
    expect(band.details.intensity).toBe('peak');
  });
});

describe('computeCycle: Maya on demo day', () => {
  const state = computeCycle(maya);

  it('puts her on cycle day 12, ovulatory, week 2', () => {
    expect(state.cycleDay).toBe(12);
    expect(state.phase).toBe('OVULATORY');
    expect(state.cycleWeek).toBe(2);
    expect(state.confidence).toBe(1);
    expect(state.confidenceLevel).toBe('high');
  });

  it('returns the phase object from phaseRules unchanged', () => {
    expect(state.phaseDetails).toBe(phaseRules.phases[2]);
    expect(state.phaseDetails?.label).toBe('Ovulatory');
  });

  it('predicts her next period on 2026-10-07, 18 days away', () => {
    expect(state.nextPeriodDate).toBe('2026-10-07');
    expect(state.daysUntilNextPeriod).toBe(18);
  });

  it('maps every day of the cycle with dates, colours and intensities', () => {
    expect(state.days).toHaveLength(29);
    expect(state.days[0]).toEqual({
      day: 1, date: '2026-09-08', phase: 'MENSTRUAL', week: 1, color: '#B3364A', phaseIntensity: 'moderate', uncertain: false,
    });
    expect(state.days[28]).toEqual({
      day: 29, date: '2026-10-06', phase: 'LATE_LUTEAL', week: 4, color: '#4F6FB3', phaseIntensity: 'deload', uncertain: false,
    });
  });

  it('has no notices on a regular cycle', () => {
    expect(state.notices).toEqual([]);
  });
});

describe('computeCycle: cycle day is modulo her cycle length', () => {
  it('is day 1 on the day her period starts', () => {
    const state = computeCycle({ ...maya, today: '2026-09-08' });
    expect(state.cycleDay).toBe(1);
    expect(state.phase).toBe('MENSTRUAL');
    expect(state.daysUntilNextPeriod).toBe(29);
  });

  it('is day 29 the day before the next period', () => {
    const state = computeCycle({ ...maya, today: '2026-10-06' });
    expect(state.cycleDay).toBe(29);
    expect(state.phase).toBe('LATE_LUTEAL');
    expect(state.daysUntilNextPeriod).toBe(1);
  });

  it('wraps into the next cycle instead of calling her late', () => {
    const state = computeCycle({ ...maya, today: '2026-10-10' }); // 32 days after Sep 8
    expect(state.cycleDay).toBe(4);
    expect(state.phase).toBe('MENSTRUAL');
    expect(state.days[0].date).toBe('2026-10-07');   // the new cycle's day 1
    expect(state.nextPeriodDate).toBe('2026-11-05');
  });

  it('rejects a period start in the future', () => {
    expect(() => computeCycle({ ...maya, lastPeriodStart: '2026-09-20' })).toThrow(RangeError);
  });
});

describe('stale period date', () => {
  // Maya's cycle is 29 days, so more than 58 days since her period is stale.
  it('exactly two cycles ago is still used', () => {
    const state = computeCycle({ ...maya, today: '2026-11-05' }); // 58 days
    expect(state.stale).toBe(false);
    expect(state.cycleDay).toBe(1);
  });

  it('more than two cycles ago asks her to update instead of guessing', () => {
    const state = computeCycle({ ...maya, today: '2026-11-06' }); // 59 days
    expect(state.stale).toBe(true);
    expect(state.prompt).toMatch(/When did your last period start\?/);
    expect(state.phase).toBe('UNKNOWN');
    expect(state.cycleDay).toBeNull();
    expect(state.daysUntilNextPeriod).toBeNull();
    expect(state.days).toEqual([]);
    expect(state.confidenceLevel).toBe('low');
  });

  it('gives the plan generator no phase to guess from', () => {
    expect(dayInfo({ ...maya, today: '2026-11-06' }, '2026-11-07')).toBeNull();
  });
});

describe('birth control: steadyState instead of a phase', () => {
  const state = computeCycle({ ...maya, suppressed: true });

  it('returns SUPPRESSED with the steadyState object', () => {
    expect(state.phase).toBe('SUPPRESSED');
    expect(state.steadyReason).toBe('BIRTH_CONTROL');
    expect(state.phaseDetails).toBe(phaseRules.steadyState);
    expect(state.confidenceLevel).toBe('high');
  });

  it('maps the four-week blockSequence onto the days', () => {
    const intensities = [1, 8, 15, 22].map((d) => state.days[d - 1].phaseIntensity);
    expect(intensities).toEqual(['moderate', 'high', 'peak', 'deload']);
    expect(state.days.every((d) => d.phase === 'SUPPRESSED' && d.color === '#8C7E9C')).toBe(true);
  });

  it('works without a period date, and never goes stale', () => {
    expect(computeCycle({ ...maya, suppressed: true, lastPeriodStart: null }).phase).toBe('SUPPRESSED');
    expect(computeCycle({ ...maya, suppressed: true, today: '2026-12-31' }).stale).toBe(false);
  });
});

describe('irregular cycles', () => {
  it('reported irregular (or PCOS): low confidence, a day range, and the flag copy verbatim', () => {
    const state = computeCycle({ ...maya, regularity: 'IRREGULAR' });
    expect(state.cycleDay).toBe(12);
    expect(state.confidenceLevel).toBe('low');
    expect(state.cycleDayRange).toEqual([9, 15]);
    expect(state.possiblePhases).toEqual(['FOLLICULAR', 'OVULATORY']);
    expect(state.notices[0]).toBe(phaseRules.irregularHandling.flagCopy);
  });

  it('marks days near phase boundaries as uncertain', () => {
    const days = computeCycle({ ...maya, regularity: 'IRREGULAR' }).days;
    expect(days.find((d) => d.day === 11)?.uncertain).toBe(true);  // follicular ends on 11
    expect(days.find((d) => d.day === 21)?.uncertain).toBe(false); // mid early luteal
  });

  it('logged lengths varying by more than 7 days count as irregular', () => {
    const state = computeCycle({ ...maya, observedLengths: [25, 33] });
    expect(state.variation).toBe(8);
    expect(state.confidenceLevel).toBe('low');
    expect(state.cycleDayRange).toEqual([8, 16]); // widened by half the variation
  });

  it('exactly 7 days of variation is still regular', () => {
    expect(computeCycle({ ...maya, observedLengths: [26, 33] }).confidenceLevel).toBe('high');
  });

  it('more than 14 days of variation falls back to steadyState, with the flag copy', () => {
    const state = computeCycle({ ...maya, observedLengths: [24, 39] });
    expect(state.steadyReason).toBe('HIGH_VARIATION');
    expect(state.phase).toBe('SUPPRESSED');
    expect(state.notices).toContain(flag('high_variation'));
    expect(dayInfo({ ...maya, observedLengths: [24, 39] }, '2026-09-22')?.phase).toBe('SUPPRESSED');
  });

  it('"not sure" is medium confidence', () => {
    expect(computeCycle({ ...maya, regularity: 'UNKNOWN' }).confidenceLevel).toBe('medium');
  });
});

describe('flags from logged cycle lengths', () => {
  it('three or more cycles under 21 days surfaces short_cycle verbatim', () => {
    expect(computeCycle({ ...maya, observedLengths: [20, 19, 20] }).notices).toContain(flag('short_cycle'));
    expect(computeCycle({ ...maya, observedLengths: [20, 19, 22] }).notices).not.toContain(flag('short_cycle'));
  });

  it('three or more cycles over 35 days surfaces long_cycle verbatim', () => {
    expect(computeCycle({ ...maya, observedLengths: [36, 38, 37] }).notices).toContain(flag('long_cycle'));
  });
});

describe('helpers', () => {
  it('measures variation between her shortest and longest cycle', () => {
    expect(cycleVariation([29, 30])).toBe(1);
    expect(cycleVariation([30])).toBeNull();
    expect(cycleVariation()).toBeNull();
  });

  it('labels confidence', () => {
    expect([1, 0.9, 0.8, 0.7, 0.6].map(confidenceLevel)).toEqual(['high', 'high', 'medium', 'medium', 'low']);
  });

  it('buckets weeks by 7 days and folds days 29+ into week 4', () => {
    expect([1, 7, 8, 14, 15, 21, 22, 28, 29, 35].map(cycleWeekOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 4, 4]);
  });

  it('looks up phase details for any phase', () => {
    expect(phaseDetails('EARLY_LUTEAL')?.label).toBe('Early Luteal');
    expect(phaseDetails('SUPPRESSED')?.id).toBe('steady');
    expect(phaseDetails('UNKNOWN')).toBeNull();
  });

  it('keeps the onboarding cycle length until there are 2 completed cycles, then averages the last 3', () => {
    expect(resolveCycleLength(28, [32])).toBe(28);
    expect(resolveCycleLength(28, [31, 32])).toBe(32);
    expect(resolveCycleLength(28, [40, 30, 31, 32])).toBe(31);
  });
});

describe('rules.json', () => {
  it('has the default fatigue curve the seed data and queries are built against', () => {
    const weeks = rules.textbook.weeks;
    expect([weeks['1'], weeks['2'], weeks['3'], weeks['4']].map((w) => w.expectedFatigue))
      .toEqual([3.5, 2.5, 3.0, 4.5]);
  });

  it('has phaseRules details for every phase the engine can return, except unknown', () => {
    const phases: Phase[] = ['MENSTRUAL', 'FOLLICULAR', 'OVULATORY', 'EARLY_LUTEAL', 'LATE_LUTEAL', 'SUPPRESSED'];
    for (const p of phases) expect(phaseDetails(p), p).not.toBeNull();
  });
});

describe('a period that comes late', () => {
  // Maya's 29-day cycle started 2026-09-08, so her next period is due 2026-10-07.
  const on = (today: string) => ({ ...maya, today });

  it('does nothing while she is still inside her cycle', () => {
    expect(holdIfLate(on('2026-10-06'))).toMatchObject({ daysLate: null, dueDate: null });
    expect(computeCycle(holdIfLate(on('2026-10-06')).input).cycleDay).toBe(29);
  });

  it('holds her on the last day (late luteal) instead of starting a new cycle', () => {
    const late = holdIfLate(on('2026-10-09')); // 3 days after it was due
    expect(late).toMatchObject({ daysLate: 3, dueDate: '2026-10-07' });
    const state = computeCycle(late.input);
    expect(state).toMatchObject({ cycleDay: 29, phase: 'LATE_LUTEAL', daysUntilNextPeriod: 1 });
  });

  it('plans as if the period starts tomorrow', () => {
    const late = holdIfLate(on('2026-10-09'));
    expect(dayInfo(late.input, '2026-10-10')).toMatchObject({ day: 1, phase: 'MENSTRUAL' });
  });

  it('hands over to the stale prompt after two cycle lengths', () => {
    const late = holdIfLate(on('2026-11-10'));
    expect(late.daysLate).toBeNull();
    expect(computeCycle(late.input).stale).toBe(true);
  });

  it('never holds on birth control', () => {
    expect(holdIfLate({ ...on('2026-10-09'), suppressed: true }).daysLate).toBeNull();
  });
});

describe('a period that comes early', () => {
  it('logging it on day 25 starts a new cycle and her average follows her logged cycles', () => {
    const next = { ...maya, lastPeriodStart: '2026-10-02', today: '2026-10-02' }; // 24-day cycle
    expect(computeCycle(next)).toMatchObject({ cycleDay: 1, phase: 'MENSTRUAL' });
    expect(resolveCycleLength(29, [29, 30, 24])).toBe(28);
  });
});
