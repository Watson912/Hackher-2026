import { describe, expect, it } from 'vitest';
import fixture from './fixtures/maya-sessions.json' with { type: 'json' };
import { byPhase, hardestWeeks, learnedPattern, plannedLoad, sessionLoad, type LoggedSession } from './learning.ts';

// Maya's real seed sessions, exported from the database (scripts/export-fixture.ts).
const maya = fixture.sessions as LoggedSession[];
const TODAY = '2026-09-19';

const logged = (week: 1 | 2 | 3 | 4, fatigues: number[], date = '2026-09-01'): LoggedSession[] =>
  fatigues.map((fatigue) => ({
    sessionDate: date,
    cycleDay: (week - 1) * 7 + 3,
    status: 'COMPLETED',
    fatigue,
    rpe: 5,
    durationMin: 50,
    plannedDurationMin: 50,
    plannedIntensity: 'MODERATE',
  }));

describe('learnedPattern on Maya', () => {
  const pattern = learnedPattern(maya, TODAY);

  it('finds her week 3 fatigue and dials it down by the full 20%', () => {
    expect(pattern[3]).toMatchObject({
      sessions: 10, avgFatigue: 4.6, textbookFatigue: 3, fatigueDelta: 1.6,
      completionPct: 80, confidence: 1, adjustment: -0.2,
    });
    expect(pattern[3].reason).toBe(
      "Your fatigue in week 3 has averaged 4.6 out of 7 vs the 3.0 the default expects, across 10 sessions, so you've made it 20% lighter.",
    );
  });

  it('leaves every other week on the default (gaps under the 1-point threshold)', () => {
    for (const w of [1, 2, 4] as const) {
      expect(pattern[w].adjustment, `week ${w}`).toBe(0);
      expect(pattern[w].reason).toBeNull();
      expect(Math.abs(pattern[w].fatigueDelta!)).toBeLessThan(1);
    }
  });

  it('matches the v_cycle_week_performance numbers from the database', () => {
    expect([1, 2, 3, 4].map((w) => pattern[w as 1].avgFatigue)).toEqual([4.25, 2.23, 4.6, 4.25]);
  });

  it('her hardest-feeling week is week 3, where the default expects week 4', () => {
    expect(hardestWeeks(pattern)).toEqual({ hers: 3, textbook: 4 });
  });

  it('session RPE agrees: week 3 sessions felt harder than planned, and carried more load', () => {
    expect(pattern[3].rpeDelta).toBeGreaterThan(2);
    expect(pattern[3].avgLoad!).toBeGreaterThan(pattern[3].plannedLoad!);
    expect(Math.abs(pattern[2].rpeDelta!)).toBeLessThan(0.5);
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
    expect(learnedPattern(logged(3, [7, 7]), TODAY)[3]).toMatchObject({ confidence: 0, adjustment: 0 });
  });

  it('ramps confidence from 3 to 6 sessions', () => {
    expect(learnedPattern(logged(3, [6, 6, 6]), TODAY)[3]).toMatchObject({ confidence: 0.5, adjustment: -0.1 });
    expect(learnedPattern(logged(3, [6, 6, 6, 6, 6, 6]), TODAY)[3]).toMatchObject({ confidence: 1, adjustment: -0.2 });
  });

  it('adds intensity when she is fresher than the default expects', () => {
    const week = learnedPattern(logged(1, [1, 1, 2, 2, 1, 2]), TODAY)[1];
    expect(week.adjustment).toBe(0.2);
    expect(week.reason).toContain("you've earned 20% more intensity");
  });

  it('scales down when the cycle engine is unsure of the phase', () => {
    expect(learnedPattern(maya, TODAY, 0.6)[3].adjustment).toBe(-0.12);
  });

  it('only counts sessions logged on or before asOf', () => {
    const later = logged(3, [7, 7, 7], '2026-10-01');
    expect(learnedPattern(later, TODAY)[3].sessions).toBe(0);
    expect(learnedPattern(later, '2026-10-01')[3].sessions).toBe(3);
  });

  it('a session with no fatigue rating counts for load but not for the plan', () => {
    const noRating = logged(3, [6, 6, 6]).map((s) => ({ ...s, fatigue: null }));
    expect(learnedPattern(noRating, TODAY)[3]).toMatchObject({ sessions: 0, adjustment: 0, avgLoad: 250 });
  });
});

describe('session load (Foster session-RPE)', () => {
  it('is RPE x minutes', () => {
    expect(sessionLoad(7, 60)).toBe(420);
    expect(sessionLoad(null, 60)).toBeNull();
    expect(plannedLoad({ plannedIntensity: 'HIGH', plannedDurationMin: 60 })).toBe(420);
  });

  it('summarises load and fatigue by phase', () => {
    const phases = byPhase(maya, TODAY, ['FOLLICULAR', 'EARLY_LUTEAL']);
    expect(phases[1].avgFatigue!).toBeGreaterThan(phases[0].avgFatigue!);
    expect(phases[1].avgLoad!).toBeGreaterThan(phases[1].plannedLoad!);
  });
});
