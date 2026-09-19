import { useEffect, useState } from 'react'
import { api, type Me, type Today } from './api.ts'

function App() {
  const [me, setMe] = useState<Me | null>(null)
  const [today, setToday] = useState<Today | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Me>('/me').then(setMe, (e: Error) => setError(e.message))
    api<Today>('/today').then(setToday, (e: Error) => setError(e.message))
  }, [])

  return (
    <main>
      <h1>HealthHer</h1>
      <div className="card">
        {error && <p className="error">Couldn't reach the API: {error}</p>}
        {!error && !me && <p className="muted">Loading…</p>}
        {me && (
          <>
            <p>
              Hi {me.first_name}. The API and database are connected.
            </p>
            <dl>
              <dt>Last period</dt><dd>{me.last_period_start_date}</dd>
              <dt>Cycle length</dt><dd>{me.avg_cycle_length_days} days</dd>
              <dt>Goal</dt><dd>{me.goal}</dd>
              <dt>Training days</dt><dd>{me.training_days_per_week} / week</dd>
              <dt>History</dt>
              <dd>{me.cycles} cycles, {me.plans} plans, {me.sessions_logged} sessions logged</dd>
              {today && (
                <>
                  <dt>Today</dt>
                  <dd>
                    Day {today.cycle.cycleDay} of {today.cycle.cycleLength} · {today.cycle.phase.toLowerCase()} · week {today.cycle.cycleWeek}
                  </dd>
                  <dt>Session</dt>
                  <dd>
                    {today.session
                      ? `${today.session.focus} (${today.session.planned_intensity.toLowerCase()})`
                      : 'Rest day'}
                  </dd>
                </>
              )}
            </dl>
          </>
        )}
      </div>
    </main>
  )
}

export default App
