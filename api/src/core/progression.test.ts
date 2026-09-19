// Equipment tiers and load progression (SPEC.md, "Equipment filtering" and
// "Load progression from history").
import { describe, expect, it } from 'vitest';
import exercisesData from '../data/exercises.json' with { type: 'json' };
import {
  allowedEquipment, equipmentNotes, exercisesFor, generatePlan, generateWeek, lastLiftBefore, prescribe, prescribeFor, weekdayOf,
  type Athlete, type Exercise, type LiftHistory, type PlanInput,
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
const base: PlanInput = { cycle, weekStart: '2026-09-22', goal: 'STRENGTH', daysPerWeek: 4, pattern: null, athlete: maya };
const exercise = (id: string) => (exercisesData.exercises as Exercise[]).find((e) => e.id === id)!;

describe('equipment tiers', () => {
  it("reads each tier's allowed equipment from exercises.json", () => {
    expect(allowedEquipment('FULL_GYM')).toBeNull();
    expect(allowedEquipment('DUMBBELLS_HOME')).toEqual(
      ['dumbbell', 'kettlebell', 'bench', 'adjustable_bench', 'plate', 'plyo_box', 'ab_wheel', 'mat', 'none']);
    expect(allowedEquipment('BODYWEIGHT')).toEqual(['none', 'mat', 'bench']);
  });

  it('filters the library to what she can actually do', () => {
    expect(exercisesFor('FULL_GYM')).toHaveLength(86);
    expect(exercisesFor('DUMBBELLS_HOME')).toHaveLength(44);
    expect(exercisesFor('BODYWEIGHT')).toHaveLength(18);
  });

  for (const tier of ['DUMBBELLS_HOME', 'BODYWEIGHT'] as const) {
    it(`only ever plans exercises her ${tier.toLowerCase()} equipment allows`, () => {
      const allowed = allowedEquipment(tier)!;
      const plan = generatePlan({ cycle, goal: 'STRENGTH', daysPerWeek: 4, pattern: null, athlete: { ...maya, equipmentTier: tier } });
      const used = plan.flatMap((w) => w.sessions.flatMap((s) => s.exercises.map((e) => exercise(e.exerciseId))));
      expect(used.length).toBeGreaterThan(0);
      for (const e of used) expect(e.equipment.every((item) => allowed.includes(item)), e.id).toBe(true);
    });
  }

  it('leaves pulling out instead of substituting a push, and says so', () => {
    const plan = generatePlan({ cycle, goal: 'STRENGTH', daysPerWeek: 4, pattern: null, athlete: { ...maya, equipmentTier: 'BODYWEIGHT' } });
    const patterns = plan.flatMap((w) => w.sessions.flatMap((s) => s.exercises.map((e) => e.pattern)));
    expect(patterns.some((p) => p.includes('pull'))).toBe(false);
    expect(equipmentNotes('BODYWEIGHT', 'STRENGTH')).toEqual([
      'Your plan has no pulling moves, since they need something to pull on. A doorway pull-up bar or a resistance band would fix that.',
      'Without added weight, strength progress will plateau quickly. A pair of adjustable dumbbells is the cheapest fix.',
    ]);
  });

  it('only warns about plateaus for bodyweight plus strength', () => {
    expect(equipmentNotes('BODYWEIGHT', 'GENERAL_FITNESS')).toHaveLength(1);
    expect(equipmentNotes('DUMBBELLS_HOME', 'STRENGTH')).toEqual([]);
    expect(equipmentNotes('FULL_GYM', 'STRENGTH')).toEqual([]);
  });
});

describe('load progression from her history', () => {
  const lift = (id: string, loadKg: number, rpe: number, date = '2026-09-15', completed = true, loadPct = 0.75): LiftHistory =>
    ({ [id]: [{ date, loadKg, loadPct, completed, rpe }] });
  const withHistory = (history: LiftHistory): Athlete => ({ ...maya, history });

  it('RPE 7 or less with every set done goes up 2.5 kg on a bar', () => {
    expect(prescribe(exercise('back_squat'), 'moderate', withHistory(lift('back_squat', 47.5, 6)), '2026-09-22'))
      .toMatchObject({ loadKg: 50, loadReason: 'Up from 47.5 kg, you rated that a 6' });
  });

  it('goes up one dumbbell size on dumbbell work', () => {
    expect(prescribe(exercise('incline_bench_press'), 'moderate', withHistory(lift('incline_bench_press', 9, 6)), '2026-09-22').loadKg)
      .toBe(10);
  });

  it('RPE 8 or 9 repeats the load', () => {
    expect(prescribe(exercise('back_squat'), 'moderate', withHistory(lift('back_squat', 47.5, 8)), '2026-09-22'))
      .toMatchObject({ loadKg: 47.5, loadReason: 'Same working weight as last time (47.5 kg), you rated that a 8' });
  });

  it('a missed set or RPE 10 drops about 10%', () => {
    expect(prescribe(exercise('conventional_deadlift'), 'moderate',
      withHistory(lift('conventional_deadlift', 60, 9, '2026-09-15', false)), '2026-09-22'))
      .toMatchObject({ loadKg: 55, loadReason: "Down from 60 kg, you didn't finish every set" });
    expect(prescribe(exercise('conventional_deadlift'), 'moderate', withHistory(lift('conventional_deadlift', 60, 10)), '2026-09-22'))
      .toMatchObject({ loadKg: 55, loadReason: 'Down from 60 kg, you rated that a 10' });
  });

  it('more than three weeks away drops about 5% to rebuild', () => {
    expect(prescribe(exercise('hip_thrust'), 'moderate', withHistory(lift('hip_thrust', 55, 7, '2026-08-20')), '2026-09-19'))
      .toMatchObject({ loadKg: 52.5, loadReason: 'Rebuilding after 4 weeks off: 5% under your last 55 kg' });
  });

  it('scales her working weight to the week: heavier at peak, lighter on a deload', () => {
    const history = withHistory(lift('back_squat', 47.5, 6)); // logged at moderate (0.75)
    expect(prescribe(exercise('back_squat'), 'peak', history, '2026-09-22'))   // 50 x 0.9 / 0.75 = 60
      .toMatchObject({ loadKg: 60, loadReason: "Up from 47.5 kg, you rated that a 6, then scaled up for this week's heavier phase" });
    expect(prescribe(exercise('back_squat'), 'deload', history, '2026-09-22')) // 50 x 0.6 / 0.75 = 40
      .toMatchObject({ loadKg: 40, loadReason: "Up from 47.5 kg, you rated that a 6, then scaled down for this week's lighter phase" });
  });

  it('uses the starting estimate the first time, and ignores a lift logged the same day', () => {
    expect(prescribe(exercise('back_squat'), 'high', maya, '2026-09-22')).toMatchObject({ loadKg: 52.5, loadReason: null });
    expect(prescribe(exercise('back_squat'), 'high', withHistory(lift('back_squat', 80, 5, '2026-09-22')), '2026-09-22').loadKg)
      .toBe(52.5);
  });

  it('picks the newest lift before the session date', () => {
    const history: LiftHistory = { back_squat: [
      { date: '2026-09-22', loadKg: 50, loadPct: 0.75, completed: true, rpe: 6 },
      { date: '2026-09-15', loadKg: 47.5, loadPct: 0.75, completed: true, rpe: 8 },
    ] };
    expect(lastLiftBefore(history, 'back_squat', '2026-09-22')?.loadKg).toBe(47.5);
    expect(lastLiftBefore(history, 'back_squat', '2026-09-23')?.loadKg).toBe(50);
    expect(lastLiftBefore(history, 'front_squat', '2026-09-23')).toBeNull();
  });

  it('machines keep the effort cue but remind her what she used last time', () => {
    expect(prescribe(exercise('leg_press'), 'moderate', withHistory(lift('leg_press', 80, 7)), '2026-09-22')).toMatchObject({
      loadKg: null, load: 'Pick a weight where 10-12 reps feels like RPE 7', loadReason: 'Last time: 80 kg at RPE 7',
    });
  });

  it('flags which exercises take a logged weight', () => {
    expect(['back_squat', 'goblet_squat', 'leg_press', 'plank', 'pull_up'].map((id) => prescribe(exercise(id), 'high', maya).weighed))
      .toEqual([true, true, true, false, false]);
  });

  it('the generator applies it to every lift she has a history for', () => {
    const history: LiftHistory = Object.fromEntries((exercisesData.exercises as Exercise[]).map((e) =>
      [e.id, [{ date: '2026-09-10', loadKg: 20, loadPct: 0.75, completed: true, rpe: 8 }]]));
    const plan = generateWeek({ ...base, athlete: withHistory(history) });
    const lifts = plan.sessions.flatMap((s) => s.exercises).filter((e) => e.loadKg !== null);
    expect(lifts.length).toBeGreaterThan(0);
    for (const e of lifts) expect(e.loadReason, e.name).toMatch(/^Same working weight as last time \(20 kg\)/);
  });
});

describe('her own equipment checklist', () => {
  it('overrides the tier preset, and always allows no-equipment moves', () => {
    const pool = exercisesFor('FULL_GYM', ['dumbbell', 'pull_up_bar']);
    expect(pool.length).toBeGreaterThan(0);
    for (const e of pool) expect(e.equipment.filter((i) => i !== 'assist_machine').every((i) => ['dumbbell', 'pull_up_bar', 'none'].includes(i)), e.id).toBe(true);
    expect(pool.some((e) => e.equipment.includes('pull_up_bar'))).toBe(true);
  });

  it('only plans what she ticked, and says so when pulling is impossible', () => {
    const plan = generatePlan({ cycle, goal: 'STRENGTH', daysPerWeek: 4, pattern: null, athlete: { ...maya, equipment: ['mat'] } });
    const used = plan.flatMap((w) => w.sessions.flatMap((s) => s.exercises.map((e) => exercise(e.exerciseId))));
    for (const e of used) expect(e.equipment.every((i) => ['mat', 'none'].includes(i)), e.id).toBe(true);
    expect(equipmentNotes('FULL_GYM', 'STRENGTH', ['mat'])).toHaveLength(2);
    expect(equipmentNotes('FULL_GYM', 'STRENGTH', ['barbell', 'pull_up_bar'])).toEqual([]);
  });
});

describe('remembered swaps', () => {
  const swapped: Athlete = { ...maya, swaps: { front_squat: 'goblet_squat' } };

  it('uses her pick and offers the way back', () => {
    const plan = prescribeFor(exercise('front_squat'), 'high', swapped, '2026-09-22');
    expect(plan.exerciseId).toBe('goblet_squat');
    expect(plan.swappedFrom).toEqual({ id: 'front_squat', name: 'Front Squat' });
    expect(plan.swaps.map((s) => s.id)).toContain('front_squat');
  });

  it('ignores a swap her equipment no longer allows, or one already in the session', () => {
    expect(prescribeFor(exercise('front_squat'), 'high', { ...swapped, swaps: { front_squat: 'hack_squat' }, equipmentTier: 'DUMBBELLS_HOME' }, '2026-09-22').exerciseId)
      .toBe('front_squat');
    expect(prescribeFor(exercise('front_squat'), 'high', swapped, '2026-09-22', new Set(['goblet_squat'])).exerciseId).toBe('front_squat');
  });

  it('only offers swaps she has the equipment for', () => {
    const home: Athlete = { ...maya, equipmentTier: 'DUMBBELLS_HOME' };
    const allowed = allowedEquipment('DUMBBELLS_HOME')!;
    for (const s of prescribeFor(exercise('goblet_squat'), 'high', home, '2026-09-22').swaps) {
      expect(exercise(s.id).equipment.every((i) => allowed.includes(i)), s.id).toBe(true);
    }
  });

  it('applies across the whole generated plan', () => {
    const plan = generatePlan({ cycle, goal: 'STRENGTH', daysPerWeek: 4, pattern: null, athlete: swapped });
    const ids = plan.flatMap((w) => w.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)));
    expect(ids).not.toContain('front_squat');
  });
});

describe('her chosen training days', () => {
  const mwf: Athlete = { ...maya, weekdays: [1, 3, 5] };
  const plan = generatePlan({ cycle, goal: 'STRENGTH', daysPerWeek: 3, pattern: null, athlete: mwf });

  it('only schedules on the days she picked', () => {
    const days = plan.flatMap((w) => w.sessions.map((s) => weekdayOf(s.date)));
    expect(days.length).toBeGreaterThan(0);
    for (const d of days) expect([1, 3, 5]).toContain(d);
  });

  it('drops a day in a lighter phase, never adds one', () => {
    const deload = plan.find((w) => w.phase === 'LATE_LUTEAL')!;
    expect(deload.sessions).toHaveLength(2); // 3 days x 0.75 volume
    for (const w of plan) expect(w.sessions.length).toBeLessThanOrEqual(4); // an 8-day block can hold one extra Mon/Wed/Fri
  });

  it('respects a single free day', () => {
    const once = generatePlan({ cycle, goal: 'STRENGTH', daysPerWeek: 1, pattern: null, athlete: { ...maya, weekdays: [6] } });
    for (const w of once) for (const s of w.sessions) expect(weekdayOf(s.date)).toBe(6);
  });

  it('weekdayOf reads the calendar', () => {
    expect(weekdayOf('2026-09-19')).toBe(6); // a Saturday
    expect(weekdayOf('2026-09-21')).toBe(1);
  });
});
