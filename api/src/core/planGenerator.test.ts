import { describe, expect, it } from 'vitest';
import exercisesData from '../data/exercises.json' with { type: 'json' };
import phaseRules from '../data/phaseRules.json' with { type: 'json' };
import { dayInfo } from './cycleEngine.ts';
import fixture from './fixtures/maya-sessions.json' with { type: 'json' };
import { learnedPattern, type LoggedSession } from './learning.ts';
import {
  generatePlan, generateWeek, planBlocks, prescribe, roundLoad, shiftLevel, type Athlete, type Exercise, type PlanInput,
} from './planGenerator.ts';
import type { CycleInput } from './types.ts';

const cycle: CycleInput = {
  lastPeriodStart: '2026-09-08',
  cycleLength: 29,
  periodLength: 5,
  regularity: 'REGULAR',
  suppressed: false,
  today: '2026-09-19',
};
const maya: Athlete = { weightKg: 62, experience: 'INTERMEDIATE' };
const pattern = learnedPattern(fixture.sessions as LoggedSession[], '2026-09-19');
const WEEK_2_START = '2026-09-15'; // cycle day 8
const WEEK_3_START = '2026-09-22'; // cycle day 15
const base: PlanInput = { cycle, weekStart: WEEK_3_START, goal: 'STRENGTH', daysPerWeek: 4, pattern: null, athlete: maya };

const exercise = (id: string) => (exercisesData.exercises as Exercise[]).find((e) => e.id === id)!;

describe('phase intensity and volume from phaseRules', () => {
  it('week 2 is follicular peak, rolling into high at ovulation', () => {
    const plan = generateWeek({ ...base, weekStart: WEEK_2_START });
    expect(plan.sessions.map((s) => [s.cycleDay, s.phase, s.intensityLevel])).toEqual([
      [8, 'FOLLICULAR', 'peak'],
      [9, 'FOLLICULAR', 'peak'],
      [11, 'FOLLICULAR', 'peak'],
      [12, 'OVULATORY', 'high'],
    ]);
  });

  it('week 3 is high through ovulation and early luteal', () => {
    const plan = generateWeek(base);
    expect(plan.sessions.map((s) => [s.date, s.cycleDay, s.phase, s.intensityLevel])).toEqual([
      ['2026-09-22', 15, 'OVULATORY', 'high'],
      ['2026-09-23', 16, 'OVULATORY', 'high'],
      ['2026-09-25', 18, 'EARLY_LUTEAL', 'high'],
      ['2026-09-26', 19, 'EARLY_LUTEAL', 'high'],
    ]);
    expect(plan.sessions.map((s) => s.intensity)).toEqual(['HIGH', 'HIGH', 'HIGH', 'HIGH']);
  });

  it('late luteal cuts session count by its volumeModifier (4 x 0.75 = 3) and deloads', () => {
    const plan = generateWeek({ ...base, weekStart: '2026-09-29', length: 8 }); // days 22-29
    expect(plan.phase).toBe('LATE_LUTEAL');
    expect(plan.volumeModifier).toBe(0.75);
    expect(plan.sessions.map((s) => [s.cycleDay, s.intensityLevel])).toEqual([[22, 'high'], [24, 'high'], [26, 'deload']]);
  });

  it('never drops below two sessions a week', () => {
    const plan = generateWeek({ ...base, weekStart: '2026-09-29', length: 8, daysPerWeek: 2 }); // 2 x 0.75 = 1.5
    expect(plan.sessions).toHaveLength(2);
  });
});

describe('prescriptions from intensityPrescriptions[intensity][category]', () => {
  const week3 = generateWeek(base);
  const strength = week3.sessions[0];

  it('a high compound lift is 4 x 5-6 at RPE 8 with 3 minutes rest', () => {
    const lift = strength.exercises[0];
    expect(lift.category).toBe('compound');
    expect(lift).toMatchObject({ sets: 4, reps: '5-6', rpe: 8, restSec: 180 });
  });

  it('a high conditioning session is intervals', () => {
    const cardio = week3.sessions[1];
    expect(cardio.slot).toBe('CARDIO');
    expect(cardio.sessionType).toBe('CARDIO_HIIT');
    expect(cardio.exercises[0]).toMatchObject({ sets: 6, reps: '60s hard / 90s easy', rpe: 8 });
  });

  it('a deload strength day is 2 sets at RPE 5', () => {
    const late = generateWeek({ ...base, weekStart: '2026-09-29', length: 8 });
    const deload = late.sessions[2];
    expect(deload.intensityLevel).toBe('deload');
    expect(deload.exercises.every((e) => e.sets === 2 && e.rpe === 5)).toBe(true);
  });
});

describe('exercise selection', () => {
  const plan = generatePlan({ cycle, goal: 'STRENGTH', daysPerWeek: 4, pattern: null, athlete: maya });
  const strengthDays = plan.flatMap((w) => w.sessions).filter((s) => s.slot === 'STRENGTH');

  it('balances a strength session across five different movement patterns', () => {
    for (const s of strengthDays) {
      const patterns = s.exercises.map((e) => e.pattern);
      expect(new Set(patterns).size, s.focus).toBe(patterns.length);
      expect(s.exercises.length, s.focus).toBe(5);
    }
  });

  it('opens with compound lifts and never repeats an exercise within a session', () => {
    for (const s of strengthDays) {
      expect(s.exercises.slice(0, 2).every((e) => e.category === 'compound'), s.focus).toBe(true);
      expect(new Set(s.exercises.map((e) => e.exerciseId)).size).toBe(s.exercises.length);
    }
  });

  it('only uses exercises tagged for her goal', () => {
    for (const s of strengthDays) {
      for (const e of s.exercises) expect(exercise(e.exerciseId).goals, e.name).toContain('strength');
    }
  });

  it('varies the day between sessions', () => {
    expect(new Set(strengthDays.map((s) => s.focus)).size).toBeGreaterThan(1);
  });

  it('falls back to general exercises when her goal has none for a pattern', () => {
    const endurance = generateWeek({ ...base, goal: 'ENDURANCE' });
    for (const s of endurance.sessions) {
      for (const e of s.exercises) {
        const goals = exercise(e.exerciseId).goals;
        expect(goals.includes('endurance') || goals.includes('general'), e.name).toBe(true);
      }
    }
  });

  it('lists swaps by name from the exercise library', () => {
    const squat = prescribe(exercise('back_squat'), 'high', maya);
    expect(squat.swaps).toEqual([
      { id: 'front_squat', name: 'Front Squat' },
      { id: 'hack_squat', name: 'Hack Squat' },
      { id: 'goblet_squat', name: 'Goblet Squat' },
    ]);
  });

  it('is deterministic: same inputs, same plan', () => {
    const again = generatePlan({ cycle, goal: 'STRENGTH', daysPerWeek: 4, pattern: null, athlete: maya });
    expect(again).toEqual(plan);
  });
});

describe('loads from loadBasis', () => {
  it('bodyweight_multiple: weight x multiplier x loadPct, rounded to 2.5 kg', () => {
    // 62 kg x 1.0 (intermediate) x 0.85 (high) = 52.7 -> 52.5
    expect(prescribe(exercise('back_squat'), 'high', maya)).toMatchObject({ loadKg: 52.5, load: '52.5 kg' });
    // novice multiplier 0.6: 62 x 0.6 x 0.85 = 31.6 -> 32.5
    expect(prescribe(exercise('back_squat'), 'high', { weightKg: 62, experience: 'BEGINNER' }).loadKg).toBe(32.5);
    // peak: 62 x 1.0 x 0.9 = 55.8 -> 55
    expect(prescribe(exercise('back_squat'), 'peak', maya).loadKg).toBe(55);
  });

  it('without her weight, shows an effort target instead of a number', () => {
    const lift = prescribe(exercise('back_squat'), 'high', { weightKg: null, experience: 'BEGINNER' });
    expect(lift.loadKg).toBeNull();
    expect(lift.load).toBe('Pick a weight where 5-6 reps feels like RPE 8');
  });

  it('absolute_kg: the novice value scaled by loadPct, rounded to a real dumbbell', () => {
    // goblet squat: 12 kg x 0.8 (high accessory) = 9.6 -> 10 kg dumbbell
    expect(prescribe(exercise('goblet_squat'), 'high', maya)).toMatchObject({ loadKg: 10, load: '10 kg' });
    // lateral raise: 4 kg x 0.6 (deload) = 2.4 -> 2 kg
    expect(prescribe(exercise('lateral_raise'), 'deload', maya).loadKg).toBe(2);
  });

  it('machines show reps and RPE, no number', () => {
    expect(prescribe(exercise('leg_press'), 'moderate', maya)).toMatchObject({
      loadKg: null, load: 'Pick a weight where 10-12 reps feels like RPE 7',
    });
  });

  it('assisted and bodyweight exercises show no number', () => {
    expect(prescribe(exercise('assisted_pull_up'), 'high', maya).load).toBe('Set the assistance so the last rep feels like RPE 8');
    expect(prescribe(exercise('pull_up'), 'high', maya)).toMatchObject({ loadKg: null, load: 'Bodyweight' });
  });

  it('time-based work shows a duration', () => {
    expect(prescribe(exercise('plank'), 'moderate', maya)).toMatchObject({ reps: '30 s hold', load: '30 s hold' });
    expect(prescribe(exercise('incline_treadmill_walk'), 'moderate', maya).load).toBe('20-30 min steady');
  });

  it('rounds dumbbells to sizes a gym stocks and bars to 2.5 kg', () => {
    expect(roundLoad(21.3, ['dumbbell'])).toBe(22.5);
    expect(roundLoad(13.1, ['dumbbell'])).toBe(14);
    expect(roundLoad(13.1, ['barbell'])).toBe(12.5);
  });
});

describe('phase notes and citations on every session', () => {
  const plan = generateWeek(base);

  it('carries the phase emphasis and autoregulation verbatim', () => {
    const ovulatory = phaseRules.phases.find((p) => p.id === 'ovulatory')!;
    expect(plan.sessions[0].emphasis).toBe(ovulatory.emphasis);
    expect(plan.sessions[0].autoregulation).toBe(ovulatory.autoregulation);
  });

  it('resolves citation keys to the full reference', () => {
    const cites = plan.sessions[0].citations;
    expect(cites.map((c) => c.key)).toEqual(['mcnulty2020', 'wojtys1998', 'colenso2023', 'accelerometry2026']);
    expect(cites[2].citation).toMatch(/^Colenso-Semple et al\. \(2023\)/);
    expect(cites[2].evidenceStrength).toBe('contested');
  });
});

describe('personal layer: Maya\'s week 3', () => {
  const plan = generateWeek({ ...base, pattern });

  it('moves every week-3 session one step down the intensity scale', () => {
    expect(plan.sessions.map((s) => [s.textbook.intensityLevel, s.intensityLevel])).toEqual([
      ['high', 'moderate'], ['high', 'moderate'], ['high', 'moderate'], ['high', 'moderate'],
    ]);
    expect(plan.sessions.every((s) => s.adjusted && s.adjustment === -0.2)).toBe(true);
  });

  it('keeps the textbook prescription alongside hers', () => {
    const first = plan.sessions[0];
    expect(first.textbook.exercises[0]).toMatchObject({ sets: 4, reps: '5-6', rpe: 8 });
    expect(first.exercises[0]).toMatchObject({ sets: 3, reps: '8-10', rpe: 7 });
    expect(first.exercises[0].exerciseId).toBe(first.textbook.exercises[0].exerciseId); // same movements, lighter
  });

  it('says why', () => {
    expect(plan.textbookIntensityModifier).toBe(0.85);
    expect(plan.intensityModifier).toBe(0.75);
    expect(plan.adjustmentReason).toContain('20% lighter');
  });

  it('leaves her week 2 alone, since it matches the textbook', () => {
    const week2 = generateWeek({ ...base, weekStart: WEEK_2_START, pattern });
    expect(week2.sessions.every((s) => !s.adjusted)).toBe(true);
    expect(week2.adjustmentReason).toBeNull();
  });
});

describe('steady plans', () => {
  it('birth control without a period date runs the steadyState block: moderate, high, peak, deload', () => {
    const plan = generatePlan({
      cycle: { ...cycle, suppressed: true, lastPeriodStart: null }, goal: 'STRENGTH', daysPerWeek: 4, pattern, athlete: maya,
    });
    expect(plan).toHaveLength(4);
    expect(plan.map((w) => w.sessions[0].intensityLevel)).toEqual(['moderate', 'high', 'peak', 'deload']);
    expect(plan[0].sessions[0].emphasis).toBe(phaseRules.steadyState.planningApproach);
    expect(plan.flatMap((w) => w.sessions).every((s) => !s.adjusted)).toBe(true);
  });

  it('still produces a plan with no period date and no birth control', () => {
    const plan = generateWeek({ ...base, cycle: { ...cycle, lastPeriodStart: null } });
    expect(plan.phase).toBe('UNKNOWN');
    expect(plan.sessions.every((s) => s.intensityLevel === 'moderate')).toBe(true);
  });
});

describe('generatePlan: four weeks from where she is today', () => {
  const plan = generatePlan({ cycle, goal: 'STRENGTH', daysPerWeek: 4, pattern, athlete: maya });

  it('starts with the block containing today, then the next three', () => {
    expect(plan.map((w) => [w.weekStart, w.cycleDayAtStart])).toEqual([
      ['2026-09-15', 8], ['2026-09-22', 15], ['2026-09-29', 22], ['2026-10-07', 1],
    ]);
  });

  it('gives the next cycle\'s period week a moderate start', () => {
    expect(plan[3].phase).toBe('MENSTRUAL');
    expect(plan[3].sessions[0].intensityLevel).toBe('moderate');
  });
});

describe('helpers', () => {
  it('shifts along the intensity scale, one step per 0.1-0.2 of adjustment, clamped at the ends', () => {
    expect(shiftLevel('high', -0.2)).toBe('moderate');
    expect(shiftLevel('high', -0.1)).toBe('moderate');
    expect(shiftLevel('high', -0.04)).toBe('high');
    expect(shiftLevel('peak', 0.2)).toBe('peak');
    expect(shiftLevel('deload', -0.2)).toBe('deload');
    expect(shiftLevel('moderate', 0.2)).toBe('high');
  });

  it('dayInfo wraps into the next cycle after cycleLength days', () => {
    const later = { ...cycle, today: '2026-10-10' };
    expect(dayInfo(later, '2026-10-12')).toMatchObject({ day: 6, phase: 'FOLLICULAR', week: 1 });
  });
});

describe('planBlocks', () => {
  it('aligns blocks to cycle weeks, with an 8-day week 4 on a 29-day cycle', () => {
    expect(planBlocks(cycle, '2026-09-19', '2026-10-02')).toEqual([
      { start: '2026-09-15', length: 7 },
      { start: '2026-09-22', length: 7 },
      { start: '2026-09-29', length: 8 },
    ]);
  });

  it('rolls into the next predicted cycle', () => {
    expect(planBlocks(cycle, '2026-10-06', '2026-10-08')).toEqual([
      { start: '2026-09-29', length: 8 },
      { start: '2026-10-07', length: 7 },
    ]);
  });

  it('uses plain 7-day blocks without a period date', () => {
    expect(planBlocks({ ...cycle, lastPeriodStart: null }, '2026-09-19', '2026-09-30')).toEqual([
      { start: '2026-09-19', length: 7 },
      { start: '2026-09-26', length: 7 },
    ]);
  });
});
