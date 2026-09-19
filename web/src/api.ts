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
