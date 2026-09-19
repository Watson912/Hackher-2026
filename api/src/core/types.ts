// Shared types for the cycle engine, plan generator and learning layer.
// Enum values match the MySQL ENUMs in database/healthher_01_schema.sql.

export type Phase = 'MENSTRUAL' | 'FOLLICULAR' | 'OVULATORY' | 'LUTEAL' | 'SUPPRESSED' | 'UNKNOWN';
export type Regularity = 'REGULAR' | 'IRREGULAR' | 'UNKNOWN';
export type CycleWeek = 1 | 2 | 3 | 4;
export type Intensity = 'LOW' | 'MODERATE' | 'HIGH';

/** Dates are ISO 'YYYY-MM-DD' strings everywhere, matching mysql2's dateStrings mode. */
export type IsoDate = string;

export interface CycleInput {
  lastPeriodStart: IsoDate | null;
  cycleLength: number;           // days, already resolved (see resolveCycleLength)
  periodLength: number;          // days
  regularity: Regularity;
  suppressed: boolean;           // hormonal birth control flattens the phases
  today: IsoDate;
}

export interface CycleDay {
  day: number;                   // 1-based cycle day
  date: IsoDate;
  phase: Phase;
  week: CycleWeek;
}

export interface CycleState {
  phase: Phase;
  cycleDay: number | null;       // null when there's no period date
  cycleWeek: CycleWeek | null;
  cycleLength: number;
  ovulationDay: number | null;
  nextPeriodDate: IsoDate | null;
  late: boolean;                 // today is past the expected cycle length
  confidence: number;            // 0-1, how sure we are about the phase
  days: CycleDay[];              // the whole current cycle, day 1 to cycleLength
}
