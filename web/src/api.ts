import { loadCurrentUser, type CurrentUser } from './session.ts'

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
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`)
  return body as T
}

export const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) })

export type Phase = 'MENSTRUAL' | 'FOLLICULAR' | 'OVULATORY' | 'LUTEAL' | 'SUPPRESSED' | 'UNKNOWN'
export type CycleWeek = 1 | 2 | 3 | 4
export type Intensity = 'LOW' | 'MODERATE' | 'HIGH'
export type Goal = 'STRENGTH' | 'MUSCLE_GAIN' | 'ENDURANCE' | 'FAT_LOSS' | 'GENERAL_FITNESS'

export interface CycleState {
  phase: Phase
  cycleDay: number | null
  cycleWeek: CycleWeek | null
  cycleLength: number
  ovulationDay: number | null
  nextPeriodDate: string | null
  late: boolean
  confidence: number
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
  energy: number | null
  effort: number | null
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
  session: (SessionRow & { textbook: SessionSpec | null; nutrition: string | null }) | null
  upcoming: (SessionRow & { adjusted: boolean })[]
  learning: LearningStatus | null
}

export interface LogResult {
  feedback: string
  planChanged: boolean
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
  avgEnergy: number | null
  textbookEnergy: number
  energyDelta: number | null
  effortDelta: number | null
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

export interface Insights {
  today: string
  learns: boolean
  minSessions: number
  loggedSessions: number
  weeks: WeekPattern[]
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
}

export const resetDemo = () => post<CurrentUser>('/demo/reset', {})
export const onboard = (answers: OnboardingAnswers) => post<CurrentUser>('/onboarding', answers)
