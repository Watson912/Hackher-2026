import { describe, expect, it } from 'vitest';
import fixture from './fixtures/maya-sessions.json' with { type: 'json' };
import { learnedPattern, type LoggedSession } from './learning.ts';

// Maya's real seed sessions, exported from the database on 2026-09-19.
const maya = fixture.sessions as LoggedSession[];
const TODAY = '2026-09-19';

const logged = (week: 1 | 2 | 3 | 4, energies: number[], date = '2026-09-01'): LoggedSession[] =>
  energies.map((energy) => ({
    sessionDate: date,
    cycleDay: (week - 1) * 7 + 3,
    status: 'COMPLETED',
    energy,
    effort: 6,
    plannedIntensity: 'MODERATE',
  }));

describe('learnedPattern on Maya', () => {
  const pattern = learnedPattern(maya, TODAY);

  it('finds her week 3 crash and dials it down by the full 20%', () => {
    expect(pattern[3]).toMatchObject({
      sessions: 10, avgEnergy: 2.9, textbookEnergy: 4, energyDelta: -1.1,
      completionPct: 80, confidence: 1, adjustment: -0.2,
    });
    expect(pattern[3].reason).toBe(
      "Your energy in week 3 has averaged 2.9 vs the typical 4.0 across 10 sessions, so you've made it 20% lighter.",
    );
  });

  it('leaves every other week on textbook (gaps under the 0.5 threshold)', () => {
    for (const w of [1, 2, 4] as const) {
      expect(pattern[w].adjustment, `week ${w}`).toBe(0);
      expect(pattern[w].reason).toBeNull();
      expect(Math.abs(pattern[w].energyDelta!)).toBeLessThan(0.5);
    }
  });

  it('matches the v_cycle_week_performance numbers from the database', () => {
    expect([1, 2, 3, 4].map((w) => pattern[w as 1].avgEnergy)).toEqual([2.75, 4.54, 2.9, 2.25]);
  });

  it('reports effort as evidence without letting it move the plan', () => {
    expect(pattern[3].effortDelta).toBeGreaterThan(1.5); // sessions felt harder than planned
    expect(pattern[1].effortDelta).toBeGreaterThan(3);   // big, but week 1 stays textbook
    expect(pattern[1].adjustment).toBe(0);
  });

  it('ignores planned sessions she has not logged yet', () => {
    const planned = maya.filter((s) => s.status === 'PLANNED');
    expect(planned.length).toBe(3);
    expect(learnedPattern(planned, '2026-12-31')[3].sessions).toBe(0);
  });
});

describe('learning over time', () => {
  it('knows nothing before her first logged session', () => {
    const pattern = learnedPattern(maya, '2026-07-01');
    for (const w of [1, 2, 3, 4] as const) {
      expect(pattern[w].sessions).toBe(0);
      expect(pattern[w].adjustment).toBe(0);
    }
  });

  it('already spots week 3 after one cycle, with partial confidence', () => {
    // End of cycle 1: 5 week-3 sessions logged, confidence 5/6.
    const pattern = learnedPattern(maya, '2026-08-20');
    expect(pattern[3].sessions).toBe(5);
    expect(pattern[3].confidence).toBe(0.83);
    expect(pattern[3].adjustment).toBe(-0.17);
  });

  it('is fully confident after two cycles', () => {
    expect(learnedPattern(maya, '2026-09-10')[3].adjustment).toBe(-0.2);
  });
});

describe('learning rules', () => {
  it('does nothing below 3 sessions, however big the gap', () => {
    expect(learnedPattern(logged(3, [1, 1]), TODAY)[3]).toMatchObject({ confidence: 0, adjustment: 0 });
  });

  it('ramps confidence from 3 to 6 sessions', () => {
    expect(learnedPattern(logged(3, [2, 2, 2]), TODAY)[3]).toMatchObject({ confidence: 0.5, adjustment: -0.1 });
    expect(learnedPattern(logged(3, [2, 2, 2, 2, 2, 2]), TODAY)[3]).toMatchObject({ confidence: 1, adjustment: -0.2 });
  });

  it('adds intensity when she has more energy than the textbook expects', () => {
    const week = learnedPattern(logged(1, [5, 5, 5, 5, 4, 4]), TODAY)[1];
    expect(week.adjustment).toBe(0.2);
    expect(week.reason).toContain("you've earned 20% more intensity");
  });

  it('scales down when the cycle engine is unsure of the phase', () => {
    expect(learnedPattern(maya, TODAY, 0.6)[3].adjustment).toBe(-0.12);
  });

  it('only counts sessions logged on or before asOf', () => {
    const later = logged(3, [1, 1, 1], '2026-10-01');
    expect(learnedPattern(later, TODAY)[3].sessions).toBe(0);
    expect(learnedPattern(later, '2026-10-01')[3].sessions).toBe(3);
  });
});
