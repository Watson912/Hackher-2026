import { describe, expect, it } from 'vitest';
import phaseRules from '../data/phaseRules.json' with { type: 'json' };
import { activityMultiplier, ageOn, bmr, computeNutrition, goalAdjustment, type NutritionInput } from './nutrition.ts';

// Maya: 62 kg, 168 cm, born 1999-04-12, so 27 on demo day; trains 4 days a week.
const maya: NutritionInput = { heightCm: 168, weightKg: 62, goalWeightKg: null, age: 27, daysPerWeek: 4, phase: 'OVULATORY' };
const notesFor = (id: string) => phaseRules.phases.find((p) => p.id === id)!.nutrition;

describe('energy', () => {
  it('uses the female Mifflin-St Jeor equation', () => {
    // 10 x 62 + 6.25 x 168 - 5 x 27 - 161 = 1374
    expect(bmr(62, 168, 27)).toBe(1374);
  });

  it('picks the activity multiplier from training days a week', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(activityMultiplier)).toEqual([1.2, 1.375, 1.375, 1.55, 1.55, 1.725, 1.725]);
  });

  it('shows a range around her need, never a single number', () => {
    const plan = computeNutrition(maya);
    expect(plan.bmr).toBe(1374);
    expect(plan.tdee).toBe(2130);                          // 1374 x 1.55
    expect(plan.calories).toEqual({ min: 2000, max: 2250 }); // +/- 5%, to the nearest 50
  });

  it('works out age from date of birth', () => {
    expect(ageOn('1999-04-12', '2026-09-19')).toBe(27);
    expect(ageOn('1999-09-20', '2026-09-19')).toBe(26); // birthday tomorrow
    expect(ageOn('1999-09-19', '2026-09-19')).toBe(27); // birthday today
  });
});

describe('protein', () => {
  it('is 1.6 g/kg outside the luteal phases', () => {
    expect(computeNutrition(maya)).toMatchObject({ proteinPerKg: 1.6, proteinG: 100 }); // 99.2 -> 100
  });

  it('is higher in both luteal phases, per their notes', () => {
    expect(computeNutrition({ ...maya, phase: 'EARLY_LUTEAL' })).toMatchObject({ proteinPerKg: 1.8, proteinG: 110 });
    expect(computeNutrition({ ...maya, phase: 'LATE_LUTEAL' })).toMatchObject({ proteinPerKg: 1.8, proteinG: 110 });
  });
});

describe('phase notes', () => {
  it('passes the phase nutrition strings through verbatim', () => {
    expect(computeNutrition(maya).notes).toEqual(notesFor('ovulatory'));
    expect(computeNutrition({ ...maya, phase: 'MENSTRUAL' }).notes).toEqual(notesFor('menstrual'));
  });

  it('has no notes for steady or unknown phases, since phaseRules has none', () => {
    expect(computeNutrition({ ...maya, phase: 'SUPPRESSED' }).notes).toEqual([]);
    expect(computeNutrition({ ...maya, phase: 'UNKNOWN' }).notes).toEqual([]);
  });
});

describe('goal weight', () => {
  it('a small change is spread over 12 weeks and not capped', () => {
    const goal = goalAdjustment(62, 61, 'OVULATORY')!;
    expect(goal).toMatchObject({ direction: 'down', requestedKgPerWeek: 0.08, kgPerWeek: 0.08, capped: false, paused: false });
  });

  it('a steep goal is capped at 0.5% of bodyweight a week, and the capped number is shown', () => {
    const goal = goalAdjustment(62, 55, 'OVULATORY')!; // 7 kg / 12 weeks = 0.58 kg a week
    expect(goal).toMatchObject({ requestedKgPerWeek: 0.58, kgPerWeek: 0.31, capped: true, dailyKcal: -341 });
    // 2130 - 341 = 1789 -> 1700-1900
    expect(computeNutrition({ ...maya, goalWeightKg: 55 }).calories).toEqual({ min: 1700, max: 1900 });
  });

  it('pauses any reduction on her period and in late luteal, per their notes', () => {
    for (const phase of ['MENSTRUAL', 'LATE_LUTEAL'] as const) {
      const plan = computeNutrition({ ...maya, goalWeightKg: 55, phase });
      expect(plan.goal).toMatchObject({ paused: true, dailyKcal: 0 });
      expect(plan.calories).toEqual({ min: 2000, max: 2250 });
    }
  });

  it('a goal above her weight adds a little, capped the same way', () => {
    expect(goalAdjustment(62, 70, 'FOLLICULAR')).toMatchObject({ direction: 'up', kgPerWeek: 0.31, capped: true, dailyKcal: 341 });
  });

  it('ignores a goal within half a kilo, or none', () => {
    expect(goalAdjustment(62, 62.3, 'OVULATORY')).toBeNull();
    expect(goalAdjustment(62, null, 'OVULATORY')).toBeNull();
  });
});

describe('missing body stats', () => {
  it('still gives the phase notes, and says what it needs for numbers', () => {
    const plan = computeNutrition({ ...maya, heightCm: null, age: null });
    expect(plan.calories).toBeNull();
    expect(plan.missing).toEqual(['height', 'age']);
    expect(plan.notes).toEqual(notesFor('ovulatory'));
    expect(plan.proteinG).toBe(100); // protein only needs weight
  });

  it('with nothing at all, notes only', () => {
    const plan = computeNutrition({ ...maya, heightCm: null, weightKg: null, age: null });
    expect(plan).toMatchObject({ calories: null, proteinG: null, missing: ['height', 'weight', 'age'] });
  });
});
