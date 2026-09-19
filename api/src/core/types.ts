// Shared types for the cycle engine, plan generator and learning layer.
// Enum values match the MySQL ENUMs in database/healthher_01_schema.sql.

/** The five phases from data/phaseRules.json, plus the two no-cycle states. */
export type CyclePhase = 'MENSTRUAL' | 'FOLLICULAR' | 'OVULATORY' | 'EARLY_LUTEAL' | 'LATE_LUTEAL';
export type Phase = CyclePhase | 'SUPPRESSED' | 'UNKNOWN';
export type Regularity = 'REGULAR' | 'IRREGULAR' | 'UNKNOWN';
export type CycleWeek = 1 | 2 | 3 | 4;
export type Intensity = 'LOW' | 'MODERATE' | 'HIGH';

/** phaseRules.meta.intensityScale */
export type PhaseIntensity = 'deload' | 'moderate' | 'high' | 'peak';

/** Dates are ISO 'YYYY-MM-DD' strings everywhere, matching mysql2's dateStrings mode. */
export type IsoDate = string;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** Why a user gets a steady (phase-free) plan instead of phase timing. */
export type SteadyReason = 'BIRTH_CONTROL' | 'HIGH_VARIATION';

export interface CycleInput {
  lastPeriodStart: IsoDate | null;
  cycleLength: number;           // days, already resolved (see resolveCycleLength)
  periodLength: number;          // days, as she reported it (phases scale from phaseRules)
  regularity: Regularity;
  suppressed: boolean;           // hormonal birth control flattens the phases
  today: IsoDate;
  observedLengths?: number[];    // her completed cycle lengths, for variation
}

export interface CycleDay {
  day: number;                   // 1-based cycle day
  date: IsoDate;
  phase: Phase;
  week: CycleWeek;
  color: string;                 // from phaseRules (or steadyState)
  phaseIntensity: PhaseIntensity;
  uncertain: boolean;            // irregular cycles: close to a phase boundary
}

/** A phase (or steadyState) object from phaseRules.json, unchanged. */
export type PhaseDetails = Record<string, unknown> & { id: string; label: string; color: string };

export interface CycleState {
  phase: Phase;
  phaseDetails: PhaseDetails | null; // the phaseRules object for this phase, or steadyState
  cycleDay: number | null;       // null when there's no usable period date
  cycleWeek: CycleWeek | null;
  cycleLength: number;
  nextPeriodDate: IsoDate | null;
  daysUntilNextPeriod: number | null;
  cycleDayRange: [number, number] | null; // irregular only: the day could be anywhere in here
  possiblePhases: Phase[] | null;          // irregular only: phases that range covers
  stale: boolean;                // period date too old to trust; see prompt
  prompt: string | null;         // what to ask her when stale
  steadyReason: SteadyReason | null;
  variation: number | null;      // spread of her logged cycle lengths, in days
  confidence: number;            // 0-1, how sure we are about the phase
  confidenceLevel: ConfidenceLevel;
  notices: string[];             // health-adjacent copy from phaseRules, verbatim
  days: CycleDay[];              // the whole current cycle, day 1 to cycleLength
}
