// Thin wrapper around fetch. Vite proxies /api to the Express server.
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`)
  return body as T
}

export interface Me {
  user_id: number
  first_name: string
  last_name: string | null
  email: string
  last_period_start_date: string | null
  avg_cycle_length_days: number | null
  goal: string | null
  training_days_per_week: number | null
  cycles: number
  plans: number
  sessions_logged: number
}

export type Phase = 'MENSTRUAL' | 'FOLLICULAR' | 'OVULATORY' | 'LUTEAL' | 'SUPPRESSED' | 'UNKNOWN'

export interface Today {
  today: string
  cycle: {
    phase: Phase
    cycleDay: number | null
    cycleWeek: 1 | 2 | 3 | 4 | null
    cycleLength: number
    ovulationDay: number | null
    nextPeriodDate: string | null
    late: boolean
    confidence: number
  }
  days: { day: number; date: string; phase: Phase; week: 1 | 2 | 3 | 4 }[]
  session: {
    session_type: string
    planned_intensity: 'LOW' | 'MODERATE' | 'HIGH'
    planned_duration_min: number | null
    focus: string | null
    status: string
  } | null
}
