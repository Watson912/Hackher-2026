import { loadCurrentUser, saveCurrentUser, type CurrentUser } from './session.ts'

// Thin wrapper around fetch. Vite proxies /api to the Express server, and
// every request names the current user so the API knows whose data to use.
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const user = loadCurrentUser()
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(user ? { 'x-user-id': String(user.userId) } : {}),
      ...init?.headers,
    },
  })
  const body = await res.json().catch(() => ({}))
  // The saved user no longer exists (e.g. the demo was reset, which re-creates
  // Maya with a new id): forget them and go back to the start screen.
  if (res.status === 404 && user && /^No user/.test(body.error ?? '')) {
    saveCurrentUser(null)
    location.hash = ''
    location.reload()
  }
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`)
  return body as T
}

export const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) })

export type Phase = 'MENSTRUAL' | 'FOLLICULAR' | 'OVULATORY' | 'EARLY_LUTEAL' | 'LATE_LUTEAL' | 'SUPPRESSED' | 'UNKNOWN'
export type CycleWeek = 1 | 2 | 3 | 4
export type Intensity = 'LOW' | 'MODERATE' | 'HIGH'
export type Goal = 'STRENGTH' | 'MUSCLE_GAIN' | 'ENDURANCE' | 'FAT_LOSS' | 'GENERAL_FITNESS'

export interface CycleState {
  phase: Phase
  cycleDay: number | null
  cycleWeek: CycleWeek | null
  cycleLength: number
  nextPeriodDate: string | null
  daysUntilNextPeriod: number | null
  /** The phaseRules.json phase object (or steadyState), unchanged. */
  phaseDetails: ({ id: string; label: string; color: string; hormoneState?: string } & Record<string, unknown>) | null
  stale: boolean
  prompt: string | null
  confidence: number
  confidenceLevel: 'high' | 'medium' | 'low'
  notices: string[]
}

export interface SessionSpec {
  sessionType: string
  intensity: Intensity
  durationMin: number
  focus: string
}

// ---- Today ---------------------------------------------------------------

export type SessionStatus = 'PLANNED' | 'COMPLETED' | 'PARTIAL' | 'SKIPPED'

export interface SessionRow {
  id: number
  date: string
  cycleDay: number | null
  phase: Phase
  sessionType: string
  intensity: Intensity
  durationMin: number | null
  focus: string | null
  status: SessionStatus
  rpe: number | null               // session RPE, Borg CR-10
  fatigue: number | null           // Hooper fatigue item, 1-7
  actualMin?: number | null
  sessionLoad: number | null       // RPE x minutes (Foster)
}

export interface Reference {
  key: string
  citation: string
  url?: string
  finding: string
  evidenceStrength: string
  honestCaveat: string
}

export interface LearningStatus {
  nextChange: { week: CycleWeek; adjustment: number; reason: string | null } | null
  week: CycleWeek
  sessions: number
  needed: number
  adjustment: number
  reason: string | null
  tunedPct: number
}

export interface Today {
  today: string
  firstName: string
  isDemo: boolean
  cycle: CycleState
  periodLate: { daysLate: number; dueDate: string } | null
  session: (SessionRow & {
    textbook: SessionSpec | null
    exercises: ExercisePlan[]
    lifts: Record<string, LoggedLift>   // by exercise id: what she logged today
    note: { emphasis: string | null; autoregulation: string | null; citations: Reference[] } | null
  }) | null
  equipmentNotes: string[]
  nutrition: Nutrition
  upcoming: (SessionRow & { adjusted: boolean })[]
  learning: LearningStatus | null
}

export interface ExercisePlan {
  exerciseId: string
  name: string
  pattern: string
  category: 'compound' | 'accessory' | 'conditioning' | 'recovery'
  sets: number
  reps: string
  rpe: number
  restSec: number
  loadKg: number | null
  load: string
  loadReason: string | null
  loadPct: number | null
  weighed: boolean
  formCue: string
  swaps: { id: string; name: string }[]
  swappedFrom: { id: string; name: string } | null
  added?: boolean                  // she added it herself
}

export interface LoggedLift {
  loadKg: number | null
  completed: boolean
  rpe: number                      // Borg CR-10, 0-10
}

export interface LiftResult {
  saved: LoggedLift
  next: { date: string; load: string; loadReason: string | null } | null
}

export interface Nutrition {
  notes: string[]                // phaseRules, verbatim
  calories: { min: number; max: number } | null
  proteinG: number | null
  proteinPerKg: number
  goal: { direction: 'down' | 'up'; kgPerWeek: number; capped: boolean; paused: boolean } | null
  missing: ('height' | 'weight' | 'age')[]
}

export interface LogResult {
  feedback: string
  planChanged: boolean
  load: number | null
  learning: LearningStatus | null
}

// ---- Wheel ---------------------------------------------------------------

export interface WheelDay {
  day: number
  date: string
  phase: Phase
  week: CycleWeek
  isToday: boolean
  yours: SessionSpec | null
  textbook: SessionSpec | null
  load: number
  textbookLoad: number
}

export interface Wheel {
  cycle: CycleState
  days: WheelDay[]
}

// ---- Insights ------------------------------------------------------------

export interface WeekPattern {
  week: CycleWeek
  label: string
  shortLabel: string
  sessions: number
  avgFatigue: number | null
  textbookFatigue: number
  fatigueDelta: number | null
  rpeDelta: number | null
  avgLoad: number | null
  plannedLoad: number | null
  completionPct: number | null
  confidence: number
  adjustment: number
  reason: string | null
}

export interface PlannedSession extends SessionSpec {
  date: string
  cycleDay: number | null
  phase: Phase
  week: CycleWeek | null
  slot: 'STRENGTH' | 'CARDIO' | 'MOBILITY'
  textbook: SessionSpec
  adjustment: number
  adjusted: boolean
}

export interface WeekPlan {
  weekStart: string
  cycleDayAtStart: number | null
  phase: Phase
  textbookIntensityModifier: number
  intensityModifier: number
  personalAdjustment: number
  nutritionNotes: string
  adjustmentReason: string | null
  sessions: PlannedSession[]
}

export interface TimelinePoint {
  date: string
  sessions: number
  confidence: number
  adjustment: number
}

export interface PhaseSummary {
  phase: Phase
  sessions: number
  avgFatigue: number | null
  avgRpe: number | null
  avgLoad: number | null
  plannedLoad: number | null
}

export interface Insights {
  today: string
  learns: boolean
  minSessions: number
  threshold: number
  loggedSessions: number
  weeks: WeekPattern[]
  phases: PhaseSummary[]
  hardest: { hers: CycleWeek | null; textbook: CycleWeek }
  headline: WeekPattern | null
  timeline: TimelinePoint[]
  nextAdjustedWeek: { start: string; week: CycleWeek } | null
  preview: WeekPlan | null
}

// ---- Accounts ------------------------------------------------------------

export type BirthControl = 'NONE' | 'COMBINED_PILL' | 'MINI_PILL' | 'HORMONAL_IUD' | 'COPPER_IUD'
  | 'IMPLANT' | 'INJECTION' | 'RING' | 'PATCH' | 'OTHER'

export interface OnboardingAnswers {
  firstName: string
  goal: Goal
  daysPerWeek: number
  birthControl: BirthControl
  lastPeriodStart: string | null
  cycleLength: number | null
  regularity: 'REGULAR' | 'IRREGULAR' | 'UNKNOWN'
  heightCm: number
  weightKg: number
  age: number
  goalWeightKg: number | null
  equipmentTier: EquipmentTier
  equipment: string[] | null        // her checklist, when it differs from the tier preset
  experience: Experience
  consistency: Consistency | null
  weekdays: number[] | null          // the days she can train, 0 = Sunday
}

export interface Settings {
  weekdays: number[] | null
  daysPerWeek: number
}

/** Monday first, as people read a week. 0 = Sunday, matching the API. */
export const WEEKDAYS: { day: number; short: string; long: string }[] = [
  { day: 1, short: 'Mon', long: 'Monday' }, { day: 2, short: 'Tue', long: 'Tuesday' },
  { day: 3, short: 'Wed', long: 'Wednesday' }, { day: 4, short: 'Thu', long: 'Thursday' },
  { day: 5, short: 'Fri', long: 'Friday' }, { day: 6, short: 'Sat', long: 'Saturday' },
  { day: 0, short: 'Sun', long: 'Sunday' },
]

export type Experience = 'NEW' | 'UNDER_1' | '1_2' | '2_4' | '4_PLUS'
export type Consistency = 'NEVER' | 'RETURNING' | 'STRUGGLING' | 'CONSISTENT'

export interface EquipmentOptions {
  items: string[]
  counts: Record<string, number>     // exercises that use each item
  presets: Record<EquipmentTier, string[]>
}

// ---- Plan ----------------------------------------------------------------

export type PhaseIntensity = 'deload' | 'moderate' | 'high' | 'peak'

export interface PlanView {
  today: string
  steady: boolean
  weeks: {
    week: number
    start: string
    end: string
    cycleWeek: CycleWeek | null
    cycleDayAtStart: number | null
    phase: Phase | null
    level: PhaseIntensity | null
    textbookLevel: PhaseIntensity | null
    volumeModifier: number | null
    adjustmentReason: string | null
    sessions: (SessionRow & { intensityLevel: PhaseIntensity | null; adjusted: boolean; exercises: ExercisePlan[] })[]
  }[]
}

export type EquipmentTier = 'FULL_GYM' | 'DUMBBELLS_HOME' | 'BODYWEIGHT'

export const resetDemo = () => post<CurrentUser>('/demo/reset', {})
export const onboard = (answers: OnboardingAnswers) => post<CurrentUser>('/onboarding', answers)
