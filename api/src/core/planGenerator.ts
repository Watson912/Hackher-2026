// Part 2: the plan generator. Deterministic: the same inputs always give the
// same plan.
//
// Textbook layer: each training day takes its phase's intensity (deload,
// moderate, high, peak) and volumeModifier from data/phaseRules.json, the
// prescription for that intensity x exercise category, and exercises from
// data/exercises.json filtered by her goal and balanced across movement
// patterns, from only the equipment she has. Personal layer: the learning
// adjustment for each cycle week moves that week one step along the intensity
// scale. Load layer: once she has logged an exercise, her last logged set sets
// the number on the bar (up, same or down), and the phase's loadPct scales it
// for the week. Every session keeps its textbook version so the UI can show
// "Textbook plan / Your plan".
import exercisesData from '../data/exercises.json' with { type: 'json' };
import phaseRules from '../data/phaseRules.json' with { type: 'json' };
import { addDays, computeCycle, dayInfo, daysBetween, phaseDetails } from './cycleEngine.ts';
import { WEEKS, type LearnedPattern } from './learning.ts';
import rules from './rules.json' with { type: 'json' };
import type { CycleInput, CycleWeek, Intensity, IsoDate, Phase, PhaseIntensity } from './types.ts';

export type Goal = 'STRENGTH' | 'MUSCLE_GAIN' | 'ENDURANCE' | 'FAT_LOSS' | 'GENERAL_FITNESS';
export type Experience = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type EquipmentTier = 'FULL_GYM' | 'DUMBBELLS_HOME' | 'BODYWEIGHT';
export type Slot = 'STRENGTH' | 'CARDIO' | 'MOBILITY';
export type SessionType = 'STRENGTH' | 'CARDIO_HIIT' | 'CARDIO_LISS' | 'MOBILITY' | 'SKILL' | 'REST';

// ---- the data files ------------------------------------------------------

type Category = 'compound' | 'accessory' | 'conditioning' | 'recovery';
type LoadType = 'bodyweight_multiple' | 'absolute_kg' | 'machine' | 'bodyweight_assisted' | 'bodyweight' | 'time';

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  pattern: string;
  category: Category;
  equipment: string[];
  difficulty: number;
  formCue: string;
  goals: string[];
  swaps: string[];
  loadBasis: { type: LoadType; novice: number | null; intermediate?: number };
}

interface Prescription { sets: number; reps: string; rpe: number; restSec: number; loadPct: number | null }

const EXERCISES = exercisesData.exercises as Exercise[];
const EXERCISE_BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));
const PRESCRIPTIONS = phaseRules.intensityPrescriptions as Record<PhaseIntensity, Record<Category, Prescription>>;
const REFERENCES = phaseRules.references as Record<string, Omit<Reference, 'key'>>;

/** The intensity scale from phaseRules.meta, lightest first. */
export const LEVELS = phaseRules.meta.intensityScale as PhaseIntensity[];

const TIER_KEY: Record<EquipmentTier, 'full_gym' | 'dumbbells_home' | 'bodyweight'> = {
  FULL_GYM: 'full_gym',
  DUMBBELLS_HOME: 'dumbbells_home',
  BODYWEIGHT: 'bodyweight',
};

/**
 * The equipment a tier allows. meta.equipmentTiers is written as sentences
 * ("Allowed equipment: dumbbell, kettlebell, ..."), so this reads the list
 * out of the text; null means every exercise.
 */
export function allowedEquipment(tier: EquipmentTier): string[] | null {
  const text: string = exercisesData.meta.equipmentTiers[TIER_KEY[tier]];
  if (/^All exercises/i.test(text)) return null;
  return text
    .replace(/^Allowed equipment:\s*/i, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\.\s*$/, '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Every equipment item the library uses, for the onboarding checklist. */
export const EQUIPMENT_ITEMS: string[] = [...new Set(EXERCISES.flatMap((e) => e.equipment))].sort();

/**
 * Only the exercises she can do with her equipment: every item an exercise
 * needs must be allowed. `custom` is the list she ticked in onboarding; it
 * wins over the tier's preset when she has one.
 */
export function exercisesFor(tier: EquipmentTier = 'FULL_GYM', custom?: string[] | null): Exercise[] {
  const allowed = custom?.length ? [...new Set([...custom, 'none'])] : allowedEquipment(tier);
  return allowed ? EXERCISES.filter((e) => needs(e).every((item) => allowed.includes(item))) : EXERCISES;
}

/**
 * What an exercise really needs. exercises.json lists Pull-Up as
 * [pull_up_bar, assist_machine] and Assisted Dip as [assist_machine,
 * dip_bars], but the assist machine is the easier option, not a requirement
 * (a band does the same job), so a bar on its own is enough.
 */
const needs = (e: Exercise) => (e.equipment.length > 1 ? e.equipment.filter((item) => item !== 'assist_machine') : e.equipment);

const poolFor = (athlete: Athlete) => exercisesFor(athlete.equipmentTier, athlete.equipment);

/**
 * The two gaps in the library the spec asks the app to say out loud rather
 * than paper over: no pulling movements without equipment, and strength
 * work that will stall without added load.
 */
export function equipmentNotes(tier: EquipmentTier, goal: Goal, custom?: string[] | null): string[] {
  const pool = exercisesFor(tier, custom);
  const notes: string[] = [];
  if (!pool.some((e) => e.pattern.includes('pull'))) {
    notes.push('Your plan has no pulling moves, since they need something to pull on. A doorway pull-up bar or a resistance band would fix that.');
  }
  const loadable = pool.some((e) => e.loadBasis.type === 'bodyweight_multiple' || e.loadBasis.type === 'absolute_kg');
  if (!loadable && GOAL_TAG[goal] === 'strength') {
    notes.push('Without added weight, strength progress will plateau quickly. A pair of adjustable dumbbells is the cheapest fix.');
  }
  return notes;
}

/** Our goals, in the exercise library's vocabulary. */
const GOAL_TAG: Record<Goal, string> = {
  STRENGTH: 'strength',
  MUSCLE_GAIN: 'strength',
  ENDURANCE: 'endurance',
  FAT_LOSS: 'leaner',
  GENERAL_FITNESS: 'general',
};

/** Session intensity for the database, the learning layer and the pills in the UI. */
const TO_INTENSITY: Record<PhaseIntensity, Intensity> = { deload: 'LOW', moderate: 'MODERATE', high: 'HIGH', peak: 'HIGH' };

// ---- output shapes ---------------------------------------------------------

export interface Reference {
  key: string;
  citation: string;
  url?: string;
  finding: string;
  evidenceStrength: string;
  honestCaveat: string;
}

export interface ExercisePlan {
  exerciseId: string;
  name: string;
  pattern: string;
  category: Category;
  sets: number;
  reps: string;                   // reps, a hold, or a duration
  rpe: number;
  restSec: number;
  loadKg: number | null;          // null when there's no number to show
  load: string;                   // what to show: "37.5 kg", an effort cue, "Bodyweight"...
  loadReason: string | null;      // why the number changed, from her last logged set
  loadPct: number | null;         // the phase loadPct this was prescribed at (logged with it)
  weighed: boolean;               // true when she can log a weight for it
  formCue: string;
  swaps: { id: string; name: string }[];      // what she can swap to with her equipment
  swappedFrom: { id: string; name: string } | null; // the exercise the plan picked, when she swapped it
  added?: boolean;                // she added it to the session herself
}

export interface SessionSpec {
  sessionType: SessionType;
  intensity: Intensity;
  intensityLevel: PhaseIntensity;
  durationMin: number;
  focus: string;
}

export interface PlannedSession extends SessionSpec {
  date: IsoDate;
  cycleDay: number | null;
  phase: Phase;
  week: CycleWeek | null;
  slot: Slot;
  exercises: ExercisePlan[];
  emphasis: string | null;        // phaseRules, verbatim
  autoregulation: string | null;  // phaseRules, verbatim
  citations: Reference[];
  textbook: SessionSpec & { exercises: ExercisePlan[] };
  adjustment: number;             // personal adjustment applied to this day
  adjusted: boolean;              // true when the session differs from textbook
}

export interface WeekPlan {
  weekStart: IsoDate;
  cycleDayAtStart: number | null;
  phase: Phase;                   // most common phase across the block
  goal: Goal;
  daysPerWeek: number;            // sessions this block, after the volume modifier
  textbookIntensityModifier: number; // average compound load % the textbook prescribes
  intensityModifier: number;         // same, after the personal layer
  personalAdjustment: number;
  volumeModifier: number;
  nutritionNotes: string;
  adjustmentReason: string | null;
  confidence: number;             // the cycle engine's confidence
  sessions: PlannedSession[];
}

/** Her most recent logged set of an exercise (exercise_logs). */
export interface LastLift {
  date: IsoDate;
  loadKg: number | null;
  loadPct: number | null;         // what it was prescribed at
  completed: boolean;
  rpe: number;                    // Borg CR-10, 0-10
}

/** Logged lifts per exercise id, newest first. */
export type LiftHistory = Record<string, LastLift[]>;

export interface Athlete {
  weightKg: number | null;        // null: effort targets instead of numbers
  experience: Experience;
  equipmentTier?: EquipmentTier;  // default full gym
  equipment?: string[] | null;    // the items she ticked; overrides the tier preset
  history?: LiftHistory;          // her logged lifts, for load progression
  swaps?: Record<string, string>; // exercises she swapped out, and what she swapped them to
  weekdays?: number[] | null;     // the days she can train, 0 = Sunday; null = spread evenly
}

export interface PlanInput {
  cycle: CycleInput;              // cycle.today = the day the plan is generated
  weekStart: IsoDate;
  length?: number;                // days in the block, default 7 (see planBlocks)
  weekIndex?: number;             // position in a multi-week plan (steady block without a period date)
  goal: Goal;
  daysPerWeek: number;
  pattern: LearnedPattern | null; // null = textbook only
  athlete?: Athlete;
}

const NO_ATHLETE: Athlete = { weightKg: null, experience: 'BEGINNER' };

// ---- helpers ---------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100;
const roundTo5 = (n: number) => Math.max(15, Math.round(n / 5) * 5);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function mostCommon<T>(xs: T[]): T {
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** The phase's nutrition notes from phaseRules, joined for the plan record (steady/unknown have none). */
function nutritionNotes(phase: Phase): string {
  const details = phaseDetails(phase) as { nutrition?: string[] } | null;
  return (details?.nutrition ?? []).join(' ');
}

/** Move along the intensity scale: a learning adjustment of 0.1 or more is one step. */
export function shiftLevel(level: PhaseIntensity, adjustment: number): PhaseIntensity {
  const steps = Math.sign(adjustment) * Math.round(Math.abs(adjustment) / 0.2);
  const i = Math.min(LEVELS.length - 1, Math.max(0, LEVELS.indexOf(level) + steps));
  return LEVELS[i];
}

/** A phase's volumeModifier; steady and unknown days train at full volume. */
function volumeModifier(phase: Phase): number {
  const details = phaseDetails(phase) as { volumeModifier?: number } | null;
  return details?.volumeModifier ?? 1;
}

// ---- loads ---------------------------------------------------------------

// Dumbbell sizes a typical gym stocks, in kg.
const DUMBBELLS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40, 42.5, 45, 47.5, 50,
];

/** Round to what she can actually load: 2.5 kg on a bar, the nearest real dumbbell otherwise. */
export function roundLoad(kg: number, equipment: string[]): number {
  if (equipment.includes('dumbbell') || equipment.includes('kettlebell')) {
    return DUMBBELLS.reduce((best, d) => (Math.abs(d - kg) < Math.abs(best - kg) ? d : best));
  }
  return Math.round(kg / 2.5) * 2.5;
}

// ---- load progression ------------------------------------------------------

const REBUILD_AFTER_DAYS = 21;

/** The most recent logged set before a given day (so a lift logged today doesn't rewrite today's plan). */
export function lastLiftBefore(history: LiftHistory | undefined, exerciseId: string, date: IsoDate): LastLift | null {
  return history?.[exerciseId]?.find((lift) => lift.date < date) ?? null;
}

/**
 * One step up: the next dumbbell size, or 2.5 kg on a bar. The spec allows
 * 1-2.5 kg for upper-body lifts, but 2.5 kg is the smallest jump on a
 * standard bar, and bar loads round to 2.5 kg anyway.
 */
function stepUp(exercise: Exercise, kg: number): number {
  if (exercise.equipment.includes('dumbbell') || exercise.equipment.includes('kettlebell')) {
    return DUMBBELLS.find((d) => d > kg) ?? kg + 2.5;
  }
  return kg + 2.5;
}

const kgText = (kg: number) => `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`;

/**
 * Her next working weight from her last logged set (spec, "Load progression
 * from history"): RPE 7 or less and every set done goes up a step, RPE 8-9
 * repeats, a missed set or RPE 10 drops about 10%, and more than three weeks
 * away drops about 5% to rebuild. The phase's loadPct then scales it for the
 * week, so a deload week is lighter without losing her working weight.
 */
export function progressLoad(exercise: Exercise, loadPct: number, last: LastLift, date: IsoDate): { kg: number; reason: string } {
  const from = kgText(last.loadKg!);
  const days = daysBetween(last.date, date);
  let working = last.loadKg!;
  let reason: string;
  if (days > REBUILD_AFTER_DAYS) {
    working *= 0.95;
    reason = `Rebuilding after ${Math.floor(days / 7)} weeks off: 5% under your last ${from}`;
  } else if (!last.completed || last.rpe >= 10) {
    working *= 0.9;
    reason = last.completed ? `Down from ${from}, you rated that a 10` : `Down from ${from}, you didn't finish every set`;
  } else if (last.rpe <= 7) {
    working = stepUp(exercise, working);
    reason = `Up from ${from}, you rated that a ${last.rpe}`;
  } else {
    reason = `Same working weight as last time (${from}), you rated that a ${last.rpe}`;
  }
  const then = last.loadPct ?? loadPct;
  // The number on the bar also follows the week's intensity; say so, so a
  // rebuild in a heavy week or a step up in a deload week still makes sense.
  if (loadPct < then) reason += ", then scaled down for this week's lighter phase";
  if (loadPct > then) reason += ", then scaled up for this week's heavier phase";
  return { kg: roundLoad((working * loadPct) / then, exercise.equipment), reason };
}

// Holds for time-based core work (plank, hollow hold). The prescription's
// rep range doesn't apply to a hold, so these scale with intensity instead.
const HOLD: Record<PhaseIntensity, string> = { deload: '20 s hold', moderate: '30 s hold', high: '40 s hold', peak: '45 s hold' };

export function prescribe(exercise: Exercise, level: PhaseIntensity, athlete: Athlete, date = '9999-12-31'): ExercisePlan {
  const rx = PRESCRIPTIONS[level][exercise.category];
  const basis = exercise.loadBasis;
  const effortCue = `Pick a weight where ${rx.reps} reps feels like RPE ${rx.rpe}`;
  const last = lastLiftBefore(athlete.history, exercise.id, date);
  let reps = rx.reps;
  let loadKg: number | null = null;
  let loadReason: string | null = null;
  let load: string;

  const loadable = basis.type === 'bodyweight_multiple' || basis.type === 'absolute_kg';
  if (loadable && last?.loadKg && rx.loadPct) {
    // Her own history beats the starting estimate.
    const next = progressLoad(exercise, rx.loadPct, last, date);
    return finish(next.kg, `${next.kg} kg`, next.reason);
  }

  switch (basis.type) {
    case 'bodyweight_multiple': {
      const multiple = athlete.experience === 'BEGINNER' ? basis.novice : basis.intermediate ?? basis.novice;
      if (athlete.weightKg && multiple && rx.loadPct) {
        loadKg = roundLoad(athlete.weightKg * multiple * rx.loadPct, exercise.equipment);
        load = `${loadKg} kg`;
      } else {
        load = effortCue;
      }
      break;
    }
    case 'absolute_kg':
      if (basis.novice && rx.loadPct) {
        loadKg = roundLoad(basis.novice * rx.loadPct, exercise.equipment);
        load = `${loadKg} kg`;
      } else {
        load = effortCue;
      }
      break;
    case 'machine':
      load = effortCue;
      if (last?.loadKg) loadReason = `Last time: ${kgText(last.loadKg)} at RPE ${last.rpe}`;
      break;
    case 'bodyweight_assisted':
      load = `Set the assistance so the last rep feels like RPE ${rx.rpe}`;
      break;
    case 'bodyweight':
      load = 'Bodyweight';
      break;
    case 'time':
      if (exercise.category === 'compound' || exercise.category === 'accessory') reps = HOLD[level];
      load = reps;
      break;
  }

  return finish(loadKg, load, loadReason);

  function finish(kg: number | null, text: string, why: string | null): ExercisePlan {
    return {
      exerciseId: exercise.id,
      name: exercise.name,
      pattern: exercise.pattern,
      category: exercise.category,
      sets: rx.sets,
      reps,
      rpe: rx.rpe,
      restSec: rx.restSec,
      loadKg: kg,
      load: text,
      loadReason: why,
      loadPct: rx.loadPct,
      weighed: loadable || basis.type === 'machine',
      formCue: exercise.formCue,
      swaps: exercise.swaps.flatMap((id) => {
        const swap = EXERCISE_BY_ID.get(id);
        return swap ? [{ id, name: swap.name }] : [];
      }),
      swappedFrom: null,
    };
  }
}

// ---- choosing exercises -------------------------------------------------

// Movement patterns for strength days, rotated so consecutive sessions hit
// different patterns and no session is all pushing or all pulling. The first
// two slots prefer compound lifts.
const STRENGTH_DAYS: { focus: string; patterns: string[] }[] = [
  { focus: 'Squat and push', patterns: ['squat', 'horizontal_push', 'horizontal_pull', 'lunge', 'anti_extension'] },
  { focus: 'Hinge and pull', patterns: ['hinge', 'vertical_pull', 'vertical_push', 'isolation', 'carry'] },
  { focus: 'Full body', patterns: ['squat', 'vertical_push', 'hinge', 'horizontal_pull', 'anti_rotation'] },
];
const COMPOUND_SLOTS = 2;

function candidates(pool: Exercise[], goalTag: string, test: (e: Exercise) => boolean): Exercise[] {
  const forGoal = pool.filter((e) => test(e) && e.goals.includes(goalTag));
  return forGoal.length ? forGoal : pool.filter((e) => test(e) && e.goals.includes('general'));
}

/** Deterministic pick: rotate through the candidates so the same slot varies from session to session. */
function pick(pool: Exercise[], rotation: number, used: Set<string>): Exercise | null {
  const free = pool.filter((e) => !used.has(e.id));
  if (!free.length) return null;
  return free[rotation % free.length];
}

function chooseStrength(pool: Exercise[], goalTag: string, experience: Experience, rotation: number): { focus: string; exercises: Exercise[] } {
  const day = STRENGTH_DAYS[rotation % STRENGTH_DAYS.length];
  const used = new Set<string>();
  const chosen: Exercise[] = [];
  day.patterns.forEach((pattern, slot) => {
    // No candidates (e.g. no pulling moves without equipment): skip the slot rather than substitute a push.
    const lifts = candidates(pool, goalTag, (e) => e.pattern === pattern && (e.category === 'compound' || e.category === 'accessory'));
    // The first slots prefer compound lifts and the rest prefer accessories,
    // so a session has two heavy lifts, not five. Beginners start with the
    // easier options.
    const wantCompound = slot < COMPOUND_SLOTS;
    const ordered = [...lifts].sort((a, b) =>
      (Number((b.category === 'compound') === wantCompound) - Number((a.category === 'compound') === wantCompound))
      || (experience === 'BEGINNER' ? a.difficulty - b.difficulty : 0)
      || a.id.localeCompare(b.id));
    // Only fall back to the other category when her goal has nothing in the preferred one.
    const preferred = ordered.filter((e) => (e.category === 'compound') === wantCompound);
    const options = preferred.length ? preferred : ordered;
    const exercise = pick(options, Math.floor(rotation / STRENGTH_DAYS.length), used);
    if (exercise) {
      used.add(exercise.id);
      chosen.push(exercise);
    }
  });
  return { focus: day.focus, exercises: chosen };
}

function chooseSingle(pool: Exercise[], goalTag: string, category: Category, rotation: number): Exercise {
  const options = candidates(pool, goalTag, (e) => e.category === category).sort((a, b) => a.id.localeCompare(b.id));
  return options[rotation % options.length];
}

/** Rough session length: warm-up plus work and rest for every set. */
function estimateMinutes(plans: ExercisePlan[]): number {
  let seconds = 8 * 60;
  for (const p of plans) {
    const minutes = /(\d+)(?:-(\d+))?\s*min/.exec(p.reps);
    const intervals = /(\d+)s hard \/ (\d+)s easy/.exec(p.reps);
    if (minutes) seconds += Number(minutes[2] ?? minutes[1]) * 60;
    else if (intervals) seconds += p.sets * (Number(intervals[1]) + Number(intervals[2]));
    else seconds += p.sets * (45 + p.restSec);
  }
  return roundTo5(seconds / 60);
}

interface SessionBuild { spec: SessionSpec; exercises: ExercisePlan[] }

/**
 * Prescribe an exercise the way she'll see it: her remembered swap applied
 * (if she has the kit for it and it isn't already in the session), and swap
 * options limited to what her equipment allows.
 */
export function prescribeFor(exercise: Exercise, level: PhaseIntensity, athlete: Athlete, date: IsoDate, taken = new Set<string>()): ExercisePlan {
  const pool = poolFor(athlete);
  const inPool = new Set(pool.map((e) => e.id));
  const swapTo = athlete.swaps?.[exercise.id];
  const chosen = swapTo && inPool.has(swapTo) && !taken.has(swapTo) ? EXERCISE_BY_ID.get(swapTo)! : exercise;
  const plan = prescribe(chosen, level, athlete, date);
  const options = new Map(plan.swaps.filter((s) => inPool.has(s.id)).map((s) => [s.id, s]));
  if (chosen !== exercise) {
    plan.swappedFrom = { id: exercise.id, name: exercise.name };
    options.delete(exercise.id);
    options.set(exercise.id, { id: exercise.id, name: exercise.name }); // always offer the way back
  }
  plan.swaps = [...options.values()].filter((s) => s.id !== chosen.id && !taken.has(s.id));
  return plan;
}

/** The exercise library entry for an id. */
export const exerciseById = (id: string) => EXERCISE_BY_ID.get(id) ?? null;

function buildSession(slot: Slot, level: PhaseIntensity, goal: Goal, athlete: Athlete, rotation: number, date: IsoDate): SessionBuild {
  const goalTag = GOAL_TAG[goal];
  const pool = poolFor(athlete);
  if (slot === 'STRENGTH') {
    const { focus, exercises } = chooseStrength(pool, goalTag, athlete.experience, rotation);
    const taken = new Set(exercises.map((e) => e.id));
    const plans = exercises.map((e) => {
      const plan = prescribeFor(e, level, athlete, date, new Set([...taken].filter((id) => id !== e.id)));
      taken.add(plan.exerciseId);
      return plan;
    });
    return { spec: { sessionType: 'STRENGTH', intensity: TO_INTENSITY[level], intensityLevel: level, durationMin: estimateMinutes(plans), focus }, exercises: plans };
  }
  if (slot === 'CARDIO') {
    const exercise = chooseSingle(pool, goalTag, 'conditioning', rotation);
    const plan = prescribeFor(exercise, level, athlete, date);
    const hard = level === 'high' || level === 'peak';
    return {
      spec: { sessionType: hard ? 'CARDIO_HIIT' : 'CARDIO_LISS', intensity: TO_INTENSITY[level], intensityLevel: level, durationMin: estimateMinutes([plan]), focus: exercise.name },
      exercises: [plan],
    };
  }
  const exercise = chooseSingle(pool, goalTag, 'recovery', rotation);
  const plan = prescribeFor(exercise, level, athlete, date);
  return {
    spec: { sessionType: 'MOBILITY', intensity: 'LOW', intensityLevel: level, durationMin: 25, focus: exercise.name },
    exercises: [plan],
  };
}

// ---- workouts she picks herself ------------------------------------------

/** The workout types she can switch a day to, or add on a rest day. */
export const WORKOUT_TYPES = [
  { id: 'squat_push', label: 'Squat and push' },
  { id: 'hinge_pull', label: 'Hinge and pull' },
  { id: 'full_body', label: 'Full body' },
  { id: 'cardio', label: 'Cardio' },
  { id: 'mobility', label: 'Mobility' },
] as const;
export type WorkoutType = (typeof WORKOUT_TYPES)[number]['id'];

/**
 * One workout of the type she picked, at the given intensity, from her
 * equipment and goal. Deterministic for a date, like the rest of the plan.
 */
export function buildWorkout(type: WorkoutType, level: PhaseIntensity, goal: Goal, athlete: Athlete, date: IsoDate): SessionBuild {
  const seed = Math.max(0, daysBetween('2020-01-01', date));
  const strengthDay = ['squat_push', 'hinge_pull', 'full_body'].indexOf(type);
  if (strengthDay >= 0) return buildSession('STRENGTH', level, goal, athlete, strengthDay + STRENGTH_DAYS.length * seed, date);
  return buildSession(type === 'cardio' ? 'CARDIO' : 'MOBILITY', level, goal, athlete, seed, date);
}

const resolveCitations = (keys: string[] | undefined): Reference[] =>
  (keys ?? []).flatMap((key) => (REFERENCES[key] ? [{ key, ...REFERENCES[key] }] : []));

// ---- the generator ---------------------------------------------------------

/** Day of the week for an ISO date, 0 = Sunday. */
export const weekdayOf = (date: IsoDate) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Pick `count` of the items, evenly spaced and always including the first. */
function spread<T>(items: T[], count: number): T[] {
  if (count >= items.length) return items;
  return Array.from({ length: count }, (_, j) => items[Math.floor((j * items.length) / count)]);
}

export function generateWeek(input: PlanInput): WeekPlan {
  const { cycle, weekStart, length = 7, weekIndex = 0, goal, daysPerWeek, pattern, athlete = NO_ATHLETE } = input;
  const state = computeCycle(cycle);

  // Learning only applies when there are natural phases to learn from.
  const learns = pattern !== null && state.phase !== 'SUPPRESSED' && state.phase !== 'UNKNOWN';

  // Days with no cycle position: steady block if she gets a steady plan, unknown otherwise.
  const steadyLevel = phaseRules.steadyState.blockSequence[weekIndex % 4] as PhaseIntensity;
  const noCycle: Phase = state.steadyReason ? 'SUPPRESSED' : 'UNKNOWN';
  const days = Array.from({ length }, (_, i) => {
    const date = addDays(weekStart, i);
    const info = dayInfo(cycle, date);
    return {
      date,
      cycleDay: info?.day ?? null,
      phase: (info?.phase ?? noCycle) as Phase,
      week: info?.week ?? null,
      level: info?.phaseIntensity ?? (noCycle === 'SUPPRESSED' ? steadyLevel : 'moderate'),
    };
  });

  const weekPhase = mostCommon(days.map((d) => d.phase));

  // Session count follows the phase's volume, never below two a week (or
  // below what she's free for). With chosen days, sessions only land on
  // those weekdays; a lighter week drops some, spread across the week.
  const volume = volumeModifier(weekPhase);
  const sessionsFor = (days: number) => Math.min(7, Math.max(2, Math.round(Math.min(7, Math.max(1, days)) * volume)));
  let offsets: number[];
  if (athlete.weekdays?.length) {
    const free = days.flatMap((d, i) => (athlete.weekdays!.includes(weekdayOf(d.date)) ? [i] : []));
    offsets = spread(free, Math.min(free.length, sessionsFor(athlete.weekdays.length)));
  } else {
    offsets = rules.trainingDays[String(sessionsFor(daysPerWeek)) as '1'].filter((offset) => offset < length);
  }
  const template = rules.goalTemplates[goal] as Slot[];

  // Rotation counters keep exercise choice varied but deterministic across blocks.
  const blockSeed = Math.max(0, daysBetween('2020-01-01', weekStart)) >> 3;

  const sessions: PlannedSession[] = offsets.map((offset, n) => {
    const day = days[offset];
    const slot = template[n % template.length];
    const adjustment = learns && day.week ? pattern![day.week].adjustment : 0;
    const personalLevel = shiftLevel(day.level, adjustment);
    const rotation = blockSeed + n;

    const textbook = buildSession(slot, day.level, goal, athlete, rotation, day.date);
    const personal = personalLevel === day.level ? textbook : buildSession(slot, personalLevel, goal, athlete, rotation, day.date);
    const details = phaseDetails(day.phase) as {
      emphasis?: string; autoregulation?: string; planningApproach?: string; citations?: string[];
    } | null;

    return {
      ...personal.spec,
      date: day.date,
      cycleDay: day.cycleDay,
      phase: day.phase,
      week: day.week,
      slot,
      exercises: personal.exercises,
      emphasis: details?.emphasis ?? details?.planningApproach ?? null,
      autoregulation: details?.autoregulation ?? null,
      citations: resolveCitations(details?.citations),
      textbook: { ...textbook.spec, exercises: textbook.exercises },
      adjustment,
      adjusted: personalLevel !== day.level,
    };
  });

  const compoundPct = (level: PhaseIntensity) => PRESCRIPTIONS[level].compound.loadPct ?? 0;
  const textbookIntensity = round2(mean(sessions.map((s) => compoundPct(s.textbook.intensityLevel))));
  const finalIntensity = round2(mean(sessions.map((s) => compoundPct(s.intensityLevel))));

  // One reason per learned cycle week this block actually changed.
  const touchedWeeks = WEEKS.filter((w) => sessions.some((s) => s.week === w && s.adjusted));
  const reasons = learns ? touchedWeeks.map((w) => pattern![w].reason).filter((r): r is string => r !== null) : [];

  return {
    weekStart,
    cycleDayAtStart: days[0].cycleDay,
    phase: weekPhase,
    goal,
    daysPerWeek: sessions.length,
    textbookIntensityModifier: textbookIntensity,
    intensityModifier: finalIntensity,
    personalAdjustment: round2(finalIntensity - textbookIntensity),
    volumeModifier: volume,
    nutritionNotes: nutritionNotes(weekPhase),
    adjustmentReason: reasons.length ? reasons.join(' ') : null,
    confidence: state.confidence,
    sessions,
  };
}

export interface PlanBlock {
  start: IsoDate;
  length: number;
}

/**
 * The plan blocks covering [from, to], aligned to cycle weeks (days 1-7,
 * 8-14, 15-21, 22-end) so every screen agrees on which days are trained.
 * The last block runs to the end of the cycle, so a 29-day cycle gets an
 * 8-day week 4. Without a period date, blocks are plain 7-day weeks.
 */
export function planBlocks(cycle: CycleInput, from: IsoDate, to: IsoDate): PlanBlock[] {
  const blocks: PlanBlock[] = [];
  let date = from;
  while (daysBetween(date, to) >= 0) {
    const info = dayInfo(cycle, date);
    let block: PlanBlock;
    if (!info) {
      block = { start: date, length: 7 };
    } else {
      const firstDay = (info.week - 1) * 7 + 1;
      const lastDay = info.week === 4 ? cycle.cycleLength : Math.min(firstDay + 6, cycle.cycleLength);
      block = { start: addDays(date, firstDay - info.day), length: lastDay - firstDay + 1 };
    }
    blocks.push(block);
    date = addDays(block.start, block.length);
  }
  return blocks;
}

/**
 * The four-week plan, starting with the block she's in today so it's usable
 * the day she signs up.
 */
export function generatePlan(input: Omit<PlanInput, 'weekStart' | 'length' | 'weekIndex'>, weeks = 4): WeekPlan[] {
  const today = input.cycle.today;
  return planBlocks(input.cycle, today, addDays(today, weeks * 7))
    .slice(0, weeks)
    .map((block, weekIndex) => generateWeek({ ...input, weekStart: block.start, length: block.length, weekIndex }));
}
