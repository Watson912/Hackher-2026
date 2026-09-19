import { useEffect, useState } from 'react'
import { api, type Me, type Today as TodayData } from '../api.ts'
import { titleCase } from '../format.ts'

// Placeholder until step 8 (today view + three-tap logging).
export function Today() {
  const [me, setMe] = useState<Me | null>(null)
  const [today, setToday] = useState<TodayData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Me>('/me').then(setMe, (e: Error) => setError(e.message))
    api<TodayData>('/today').then(setToday, (e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="error">Couldn't reach the API: {error}</p>
  if (!me || !today) return <p className="muted">Loading…</p>

  return (
    <section className="card">
      <p className="eyebrow">Hi {me.first_name}</p>
      <h2>Day {today.cycle.cycleDay} · {titleCase(today.cycle.phase)}</h2>
      <p className="muted">Week {today.cycle.cycleWeek} of your cycle</p>
      <dl>
        <dt>Today</dt>
        <dd>
          {today.session
            ? `${today.session.focus} (${titleCase(today.session.planned_intensity)})`
            : 'Rest day'}
        </dd>
        <dt>Goal</dt><dd>{me.goal && titleCase(me.goal)}, {me.training_days_per_week} days a week</dd>
        <dt>History</dt><dd>{me.cycles} cycles, {me.sessions_logged} sessions logged</dd>
      </dl>
    </section>
  )
}
