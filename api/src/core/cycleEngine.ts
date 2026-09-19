// Part 1: the cycle engine. Pure functions, no database, no clock:
// `today` is always passed in so tests can pin dates.
import type { CycleDay, CycleInput, CycleState, CycleWeek, IsoDate, Phase, Regularity } from './types.ts';

const DAY_MS = 86_400_000;

// The luteal phase is the stable part of the cycle (~14 days), so ovulation
// is counted back from the end rather than forward from the period.
const LUTEAL_LENGTH = 14;

const BASE_CONFIDENCE: Record<Regularity, number> = {
  REGULAR: 1.0,
  UNKNOWN: 0.8,
  IRREGULAR: 0.6,
};
const LATE_CONFIDENCE_FACTOR = 0.5;

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

export interface PhaseBands {
  ovulationDay: number;
  ovulatoryStart: number;  // first OVULATORY day
  ovulatoryEnd: number;    // last OVULATORY day
}

/**
 * Where the ovulatory window sits. Regular cycles get a 4-day window
 * (ovulation -2 .. +1); irregular cycles get a wider 8-day window because
 * we're less sure when ovulation lands. The window never overlaps the period.
 */
export function phaseBands(cycleLength: number, periodLength: number, regularity: Regularity): PhaseBands {
  const ovulationDay = Math.max(periodLength + 2, cycleLength - LUTEAL_LENGTH);
  const [before, after] = regularity === 'IRREGULAR' ? [4, 3] : [2, 1];
  return {
    ovulationDay,
    ovulatoryStart: Math.max(periodLength + 1, ovulationDay - before),
    ovulatoryEnd: Math.min(cycleLength, ovulationDay + after),
  };
}

export function phaseOnDay(cycleDay: number, periodLength: number, bands: PhaseBands): Phase {
  if (cycleDay <= periodLength) return 'MENSTRUAL';
  if (cycleDay < bands.ovulatoryStart) return 'FOLLICULAR';
  if (cycleDay <= bands.ovulatoryEnd) return 'OVULATORY';
  return 'LUTEAL';
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

// ---- the engine --------------------------------------------------------

export function computeCycle(input: CycleInput): CycleState {
  const { lastPeriodStart, cycleLength, periodLength, regularity, suppressed, today } = input;

  if (!lastPeriodStart) {
    return {
      phase: 'UNKNOWN', cycleDay: null, cycleWeek: null, cycleLength,
      ovulationDay: null, nextPeriodDate: null, late: false,
      confidence: 0, days: [],
    };
  }

  const cycleDay = daysBetween(lastPeriodStart, today) + 1;
  if (cycleDay < 1) {
    throw new RangeError(`Last period start ${lastPeriodStart} is after today (${today})`);
  }

  const bands = phaseBands(cycleLength, periodLength, regularity);
  const phaseFor = (day: number): Phase =>
    suppressed ? 'SUPPRESSED' : phaseOnDay(day, periodLength, bands);

  const days: CycleDay[] = Array.from({ length: cycleLength }, (_, i) => ({
    day: i + 1,
    date: addDays(lastPeriodStart, i),
    phase: phaseFor(i + 1),
    week: cycleWeekOf(i + 1),
  }));

  // Past the expected length and no new period logged: she's late, or the
  // average is off. Stay in late luteal and say we're less sure.
  const late = cycleDay > cycleLength;
  const confidence = suppressed
    ? 1
    : BASE_CONFIDENCE[regularity] * (late ? LATE_CONFIDENCE_FACTOR : 1);

  return {
    phase: phaseFor(Math.min(cycleDay, cycleLength)),
    cycleDay,
    cycleWeek: cycleWeekOf(cycleDay),
    cycleLength,
    ovulationDay: suppressed ? null : bands.ovulationDay,
    nextPeriodDate: addDays(lastPeriodStart, cycleLength),
    late,
    confidence,
    days,
  };
}

/**
 * Cycle day, phase and week for any date, including future days the plan
 * generator needs. Past the expected cycle length it predicts the next cycle
 * (day 30 of a 29-day cycle becomes day 1) unless she is already late today,
 * in which case the days stay late luteal until she logs a period.
 */
export function dayInfo(input: CycleInput, date: IsoDate): CycleDay | null {
  const { lastPeriodStart, cycleLength, periodLength, regularity, suppressed, today } = input;
  if (!lastPeriodStart) return null;

  const rawDay = daysBetween(lastPeriodStart, date) + 1;
  if (rawDay < 1) return null;

  const lateToday = daysBetween(lastPeriodStart, today) + 1 > cycleLength;
  const day = rawDay <= cycleLength || lateToday ? rawDay : ((rawDay - 1) % cycleLength) + 1;

  const phase: Phase = suppressed
    ? 'SUPPRESSED'
    : phaseOnDay(Math.min(day, cycleLength), periodLength, phaseBands(cycleLength, periodLength, regularity));
  return { day, date, phase, week: cycleWeekOf(day) };
}
