// Part 3: nutrition. Pure functions, like the cycle engine.
//
// Daily energy: Mifflin-St Jeor BMR (female equation; the profile has no sex
// field and the app is built around the menstrual cycle) times an activity
// multiplier from training days per week, shown as a range, never a single
// number. Protein in g/kg, higher in the luteal phases. The phase's own
// nutrition notes from data/phaseRules.json go on top, word for word.
//
// Goal weight only nudges the range, and the change it implies is capped at
// 0.5% of bodyweight a week so she keeps recovering. No deficit targets and no
// weight-loss framing: the output is a fuelling range.
import { phaseDetails } from './cycleEngine.ts';
import type { Phase } from './types.ts';

export interface NutritionInput {
  heightCm: number | null;
  weightKg: number | null;
  goalWeightKg: number | null;
  age: number | null;
  daysPerWeek: number;
  phase: Phase;
}

export interface GoalAdjustment {
  direction: 'down' | 'up';
  requestedKgPerWeek: number;    // what reaching the goal over GOAL_WEEKS would need
  kgPerWeek: number;             // after the cap: this is the number to show
  capped: boolean;
  dailyKcal: number;             // applied to the range (0 while paused)
  paused: boolean;               // her phase notes say not to cut this week
}

export interface NutritionPlan {
  notes: string[];               // phaseRules nutrition strings, verbatim
  calories: { min: number; max: number } | null;
  proteinG: number | null;
  proteinPerKg: number;
  bmr: number | null;
  tdee: number | null;
  activityMultiplier: number;
  goal: GoalAdjustment | null;
  missing: ('height' | 'weight' | 'age')[];
}

const KCAL_PER_KG = 7700;
const GOAL_WEEKS = 12;            // spread a goal-weight change over three months...
const MAX_WEEKLY_CHANGE = 0.005;  // ...but never faster than 0.5% of bodyweight a week
const RANGE = 0.05;               // show +/- 5% around her estimated need

// Phases whose notes raise protein ("Increase protein slightly", "Protein stays high").
const HIGHER_PROTEIN: Phase[] = ['EARLY_LUTEAL', 'LATE_LUTEAL'];
const PROTEIN_PER_KG = 1.6;
const LUTEAL_PROTEIN_PER_KG = 1.8;

// Phases whose notes say not to eat less ("Do not under-eat...", "Do not cut
// calories this week"): any goal-weight reduction pauses here.
const NO_CUT: Phase[] = ['MENSTRUAL', 'LATE_LUTEAL'];

const round = (n: number, to: number) => Math.round(n / to) * to;

/** Mifflin-St Jeor, female: 10 x kg + 6.25 x cm - 5 x age - 161. */
export function bmr(weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
}

/** Standard activity multipliers, by training days per week. */
export function activityMultiplier(daysPerWeek: number): number {
  if (daysPerWeek <= 1) return 1.2;
  if (daysPerWeek <= 3) return 1.375;
  if (daysPerWeek <= 5) return 1.55;
  return 1.725;
}

/** Full years between a date of birth and today, both 'YYYY-MM-DD'. */
export function ageOn(dateOfBirth: string, today: string): number {
  const [by, bm, bd] = dateOfBirth.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export function goalAdjustment(weightKg: number, goalWeightKg: number | null, phase: Phase): GoalAdjustment | null {
  if (goalWeightKg === null || Math.abs(goalWeightKg - weightKg) < 0.5) return null;
  const direction = goalWeightKg < weightKg ? 'down' : 'up';
  const requested = Math.abs(goalWeightKg - weightKg) / GOAL_WEEKS;
  const cap = weightKg * MAX_WEEKLY_CHANGE;
  const kgPerWeek = Math.min(requested, cap);
  const paused = direction === 'down' && NO_CUT.includes(phase);
  const daily = Math.round((kgPerWeek * KCAL_PER_KG) / 7);
  return {
    direction,
    requestedKgPerWeek: Math.round(requested * 100) / 100,
    kgPerWeek: Math.round(kgPerWeek * 100) / 100,
    capped: requested > cap,
    dailyKcal: paused ? 0 : direction === 'down' ? -daily : daily,
    paused,
  };
}

export function computeNutrition(input: NutritionInput): NutritionPlan {
  const { heightCm, weightKg, goalWeightKg, age, daysPerWeek, phase } = input;
  const details = phaseDetails(phase) as { nutrition?: string[] } | null;
  const notes = details?.nutrition ?? [];
  const proteinPerKg = HIGHER_PROTEIN.includes(phase) ? LUTEAL_PROTEIN_PER_KG : PROTEIN_PER_KG;
  const multiplier = activityMultiplier(daysPerWeek);

  const missing: NutritionPlan['missing'] = [];
  if (heightCm === null) missing.push('height');
  if (weightKg === null) missing.push('weight');
  if (age === null) missing.push('age');

  const proteinG = weightKg === null ? null : round(weightKg * proteinPerKg, 5);
  if (missing.length) {
    return { notes, calories: null, proteinG, proteinPerKg, bmr: null, tdee: null, activityMultiplier: multiplier, goal: null, missing };
  }

  const base = bmr(weightKg!, heightCm!, age!);
  const tdee = base * multiplier;
  const goal = goalAdjustment(weightKg!, goalWeightKg, phase);
  const target = tdee + (goal?.dailyKcal ?? 0);

  return {
    notes,
    calories: { min: round(target * (1 - RANGE), 50), max: round(target * (1 + RANGE), 50) },
    proteinG,
    proteinPerKg,
    bmr: Math.round(base),
    tdee: Math.round(tdee),
    activityMultiplier: multiplier,
    goal,
    missing,
  };
}
