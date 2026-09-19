// Part 1: the cycle engine. Pure functions, no database, no clock:
// `today` is always passed in so tests can pin dates. Phases, colours and
// health-adjacent copy all come from data/phaseRules.json.
import phaseRules from '../data/phaseRules.json' with { type: 'json' };
import type {
  ConfidenceLevel, CycleDay, CycleInput, CyclePhase, CycleState, CycleWeek, IsoDate, Phase, PhaseDetails,
  PhaseIntensity, Regularity, SteadyReason,
} from './types.ts';

const DAY_MS = 86_400_000;

// phaseRules dayRange values assume a 28-day cycle; they're scaled to hers.
const BASE_LENGTH = 28;

const BASE_CONFIDENCE: Record<Regularity, number> = {
  REGULAR: 1.0,
  UNKNOWN: 0.8,
  IRREGULAR: 0.6,
};

// Logged cycle lengths varying by more than this many days make phase
// estimates rough (treated as irregular); past the second, phase timing is
// dropped for a steady plan.
const IRREGULAR_VARIATION = 7;
const STEADY_VARIATION = 14;

// Irregular cycles: treat days within this share of the cycle (or half her
// variation, if bigger) of a phase boundary as uncertain.
const WIDEN_FRACTION = 0.1;

// A period date older than this many cycles is too stale to guess from.
const STALE_CYCLES = 2;
const STALE_PROMPT = 'When did your last period start? Update it so your plan lines up with where you are now.';

// ---- dates -------------------------------------------------------------

function toUtcMs(date: IsoDate): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`Expected a YYYY-MM-DD date, got "${date}"`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

// ---- phases ------------------------------------------------------------

/** Weeks 1-4 by 7-day blocks; days 29+ count as week 4. Matches v_cycle_week_performance. */
export function cycleWeekOf(cycleDay: number): CycleWeek {
  return Math.min(4, Math.max(1, Math.ceil(cycleDay / 7))) as CycleWeek;
}

export interface PhaseBand {
  phase: CyclePhase;
  details: PhaseDetails;          // the phaseRules phase object, unchanged
  start: number;
  end: number;
}

const toPhase = (id: string) => id.toUpperCase() as CyclePhase;

/**
 * The five phaseRules phases with their dayRange scaled to her cycle length.
 * Every boundary scales by length / 28 and the last phase always ends on her
 * last day, so a 32-day cycle stretches the bands instead of leaving orphan days.
 */
export function scaledPhases(cycleLength: number): PhaseBand[] {
  const phases = phaseRules.phases;
  let start = 1;
  return phases.map((details, i) => {
    const end = i === phases.length - 1
      ? cycleLength
      : Math.max(start, Math.round((details.dayRange[1] * cycleLength) / BASE_LENGTH));
    const band = { phase: toPhase(details.id), details: details as PhaseDetails, start, end };
    start = end + 1;
    return band;
  });
}

export function bandOnDay(cycleDay: number, cycleLength: number): PhaseBand {
  const bands = scaledPhases(cycleLength);
  return bands.find((b) => cycleDay >= b.start && cycleDay <= b.end) ?? bands[bands.length - 1];
}

/** The phaseRules object for a phase, or steadyState for SUPPRESSED. */
export function phaseDetails(phase: Phase): PhaseDetails | null {
  if (phase === 'SUPPRESSED') return phaseRules.steadyState as PhaseDetails;
  return (phaseRules.phases.find((p) => toPhase(p.id) === phase) as PhaseDetails | undefined) ?? null;
}

// ---- cycle length learning ---------------------------------------------

/**
 * Her real cycle length once there's enough history: the average of her
 * last 3 completed cycles, if she has at least 2. Otherwise the number she
 * gave at onboarding.
 */
export function resolveCycleLength(profileLength: number, completedLengths: number[]): number {
  if (completedLengths.length < 2) return profileLength;
  const recent = completedLengths.slice(-3);
  const avg = recent.reduce((sum, n) => sum + n, 0) / recent.length;
  return Math.min(60, Math.max(15, Math.round(avg)));
}

// ---- variation, confidence and flags -------------------------------------

/** Spread between her shortest and longest logged cycle, or null with fewer than two. */
export function cycleVariation(observedLengths: number[] = []): number | null {
  if (observedLengths.length < 2) return null;
  return Math.max(...observedLengths) - Math.min(...observedLengths);
}

/** Irregular if she says so, or if her logged lengths vary by more than a week. */
export function effectiveRegularity(input: CycleInput): Regularity {
  const variation = cycleVariation(input.observedLengths);
  return variation !== null && variation > IRREGULAR_VARIATION ? 'IRREGULAR' : input.regularity;
}

/** Why she gets a steady plan instead of phase timing, or null if she doesn't. */
export function steadyReasonFor(input: CycleInput): SteadyReason | null {
  if (input.suppressed) return 'BIRTH_CONTROL';
  const variation = cycleVariation(input.observedLengths);
  return variation !== null && variation > STEADY_VARIATION ? 'HIGH_VARIATION' : null;
}

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.9) return 'high';
  if (confidence >= 0.7) return 'medium';
  return 'low';
}

/** Her period date is more than two cycles old: ask her rather than guess. */
function isStale(input: CycleInput): boolean {
  if (!input.lastPeriodStart) return false;
  return daysBetween(input.lastPeriodStart, input.today) > STALE_CYCLES * input.cycleLength;
}

/** Days either side of a phase boundary that count as uncertain for irregular cycles. */
function uncertaintySpread(input: CycleInput): number {
  if (effectiveRegularity(input) !== 'IRREGULAR') return 0;
  const variation = cycleVariation(input.observedLengths) ?? 0;
  return Math.max(Math.round(input.cycleLength * WIDEN_FRACTION), Math.ceil(variation / 2));
}

const flagCopy = (id: string) => phaseRules.flags.find((f) => f.id === id)!.copy;

/**
 * The phaseRules flags that depend only on her logged cycle lengths, as
 * verbatim copy. persistent_low_energy needs session logs, so it lives with
 * insights, not here.
 */
export function cycleFlags(observedLengths: number[] = []): string[] {
  const variation = cycleVariation(observedLengths);
  const notices: string[] = [];
  if (observedLengths.filter((n) => n < 21).length >= 3) notices.push(flagCopy('short_cycle'));
  if (observedLengths.filter((n) => n > 35).length >= 3) notices.push(flagCopy('long_cycle'));
  if (variation !== null && variation > STEADY_VARIATION) notices.push(flagCopy('high_variation'));
  return notices;
}

// ---- days ----------------------------------------------------------------

/** Everything the wheel and the plan need about one day of her cycle. */
function describeDay(input: CycleInput, day: number, date: IsoDate): CycleDay {
  const week = cycleWeekOf(day);
  if (steadyReasonFor(input)) {
    const steady = phaseRules.steadyState;
    return {
      day, date, week, phase: 'SUPPRESSED', color: steady.color,
      phaseIntensity: steady.blockSequence[week - 1] as PhaseIntensity, uncertain: false,
    };
  }
  const band = bandOnDay(day, input.cycleLength);
  const spread = uncertaintySpread(input);
  return {
    day, date, week, phase: band.phase, color: band.details.color,
    phaseIntensity: band.details.intensity as PhaseIntensity,
    uncertain: spread > 0 && (day - band.start < spread || band.end - day < spread),
  };
}

/**
 * Cycle day, phase and week for any date, including future days the plan
 * generator needs. The cycle repeats every cycleLength days from her last
 * period start (day 30 of a 29-day cycle is day 1 of the next). Null when
 * there's no usable period date, so nothing guesses from a stale one.
 */
export function dayInfo(input: CycleInput, date: IsoDate): CycleDay | null {
  const { lastPeriodStart, cycleLength } = input;
  if (!lastPeriodStart) return null;
  if (!steadyReasonFor(input) && isStale(input)) return null;

  const daysSince = daysBetween(lastPeriodStart, date);
  if (daysSince < 0) return null;
  return describeDay(input, (daysSince % cycleLength) + 1, date);
}

/**
 * A late period. Past her expected cycle length with no new period logged,
 * the cycle shouldn't wrap into a new one it can't see. Instead she stays on
 * the last day of this cycle (late luteal) and the plan assumes the period
 * starts tomorrow, re-checked every day, until she logs it. Once more than
 * two cycle lengths have gone by, the stale prompt takes over instead.
 */
export function holdIfLate(input: CycleInput): { input: CycleInput; daysLate: number | null; dueDate: IsoDate | null } {
  const { lastPeriodStart, cycleLength, today } = input;
  const none = { input, daysLate: null, dueDate: null };
  if (!lastPeriodStart || input.suppressed || steadyReasonFor(input) || isStale(input)) return none;
  const daysSince = daysBetween(lastPeriodStart, today);
  if (daysSince < cycleLength) return none;
  return {
    input: { ...input, lastPeriodStart: addDays(today, 1 - cycleLength) },
    daysLate: daysSince - cycleLength + 1,
    dueDate: addDays(lastPeriodStart, cycleLength),
  };
}

// ---- the engine --------------------------------------------------------

export function computeCycle(input: CycleInput): CycleState {
  const { lastPeriodStart, cycleLength, today, observedLengths } = input;
  const variation = cycleVariation(observedLengths);
  const steadyReason = steadyReasonFor(input);
  const steady = steadyReason !== null;
  const notices = cycleFlags(observedLengths);

  const noCycleDay = {
    cycleDay: null, cycleWeek: null, cycleLength, nextPeriodDate: null, daysUntilNextPeriod: null,
    cycleDayRange: null, possiblePhases: null, stale: false, prompt: null,
    variation, steadyReason, notices, days: [],
  };

  if (!lastPeriodStart) {
    // A steady plan without a period date is still a known state: flat
    // phases. Anyone else without a date is unknown.
    return steady
      ? { ...noCycleDay, phase: 'SUPPRESSED', phaseDetails: phaseDetails('SUPPRESSED'), confidence: 1, confidenceLevel: 'high' }
      : { ...noCycleDay, phase: 'UNKNOWN', phaseDetails: null, confidence: 0, confidenceLevel: 'low' };
  }

  const daysSince = daysBetween(lastPeriodStart, today);
  if (daysSince < 0) {
    throw new RangeError(`Last period start ${lastPeriodStart} is after today (${today})`);
  }
  if (!steady && isStale(input)) {
    return {
      ...noCycleDay, phase: 'UNKNOWN', phaseDetails: null, stale: true, prompt: STALE_PROMPT,
      confidence: 0, confidenceLevel: 'low',
    };
  }

  // Modulo: after cycleLength days her next cycle is assumed to have started.
  const cycleDay = (daysSince % cycleLength) + 1;
  const cycleStart = addDays(today, -(cycleDay - 1));
  const days = Array.from({ length: cycleLength }, (_, i) => describeDay(input, i + 1, addDays(cycleStart, i)));
  const current = days[cycleDay - 1];

  const regularity = effectiveRegularity(input);
  const confidence = steady ? 1 : BASE_CONFIDENCE[regularity];

  // Irregular cycles: show where the day could really be, and which phases that covers.
  let cycleDayRange: [number, number] | null = null;
  let possiblePhases: Phase[] | null = null;
  const spread = uncertaintySpread(input);
  if (!steady && spread > 0) {
    cycleDayRange = [Math.max(1, cycleDay - spread), Math.min(cycleLength, cycleDay + spread)];
    possiblePhases = [...new Set(days.slice(cycleDayRange[0] - 1, cycleDayRange[1]).map((d) => d.phase))];
  }

  return {
    phase: current.phase,
    phaseDetails: phaseDetails(current.phase),
    cycleDay,
    cycleWeek: current.week,
    cycleLength,
    nextPeriodDate: addDays(cycleStart, cycleLength),
    daysUntilNextPeriod: cycleLength - cycleDay + 1,
    cycleDayRange,
    possiblePhases,
    stale: false,
    prompt: null,
    steadyReason,
    variation,
    confidence,
    confidenceLevel: confidenceLevel(confidence),
    notices: regularity === 'IRREGULAR' && !steady ? [phaseRules.irregularHandling.flagCopy, ...notices] : notices,
    days,
  };
}
