import { useCallback, useEffect, useState } from 'react'
import { api, type LogResult, type Today as TodayData } from '../api.ts'
import { LogSession } from '../components/LogSession.tsx'
import { change, longDate, titleCase, weekday } from '../format.ts'

const PHASE_BLURB: Record<string, string> = {
  MENSTRUAL: 'Your period. Hormones are at their lowest, so the plan eases off.',
  FOLLICULAR: 'Estrogen is rising. A good window to push and progress.',
  OVULATORY: 'Around ovulation. Typically your strongest days.',
  LUTEAL: 'Progesterone is up. Energy often dips, so volume comes down.',
  SUPPRESSED: 'Hormonal birth control keeps things steady, so your training stays consistent.',
  UNKNOWN: 'Log your next period so we can line your plan up with your cycle.',
}

export function Today() {
  const [data, setData] = useState<TodayData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logResult, setLogResult] = useState<LogResult | null>(null)

  const load = useCallback(() => {
    api<TodayData>('/today').then(setData, (e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  if (error) return <p className="error">Couldn't load today: {error}</p>
  if (!data) return <p className="muted">Loading…</p>

  const { cycle, session, upcoming, learning } = data
  const hasCycleDay = cycle.cycleDay !== null
  const logged = session && session.status !== 'PLANNED'

  function onLogged(result: LogResult) {
    setLogResult(result)
    load()
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow">{longDate(data.today)}</p>
        <h2>
          {hasCycleDay
            ? <>Day {cycle.cycleDay} · {titleCase(cycle.phase)}</>
            : cycle.phase === 'SUPPRESSED' ? 'Steady training' : 'Welcome'}
        </h2>
        <p className="muted">{PHASE_BLURB[cycle.phase]}</p>
      </section>

      <section className="card today-card">
        <p className="eyebrow">Today's session</p>
        {!session && (
          <>
            <h3>Rest day</h3>
            <p className="muted">Recovery is part of the plan. A walk or some mobility is plenty.</p>
          </>
        )}
        {session && (
          <>
            <div className="today-session">
              <div>
                <h3>{session.focus}</h3>
                <p className="muted">{session.durationMin} min · {titleCase(session.sessionType.replace('_', ' '))}</p>
              </div>
              <span className={`pill pill-${session.intensity.toLowerCase()}`}>{titleCase(session.intensity)}</span>
            </div>

            {session.textbook && (
              <p className="adjusted-note">
                <b>Adjusted for you.</b> The textbook says {session.textbook.focus.toLowerCase()},{' '}
                {session.textbook.intensity.toLowerCase()}, {session.textbook.durationMin} min.{' '}
                {learning?.reason}
              </p>
            )}
            {session.nutrition && <p className="nutrition"><b>Fuel:</b> {session.nutrition}</p>}

            {!logged && <LogSession sessionId={session.id} onLogged={onLogged} />}
            {logged && (
              <div className="logged">
                <span className="check-badge" aria-hidden="true">✓</span>
                <div>
                  <b>{session.status === 'SKIPPED' ? 'Skipped' : session.status === 'PARTIAL' ? 'Cut short' : 'Done'}</b>
                  {' '}· energy {session.energy}/5
                  {logResult && <p className="feedback">{logResult.feedback}</p>}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {learning && (
        <section className="card learning-card">
          <p className="eyebrow">What we're learning</p>
          {learning.sessions < learning.needed ? (
            <>
              <h3>Learning your week {learning.week}</h3>
              <p className="muted">
                {learning.sessions} of {learning.needed} sessions logged. After {learning.needed}, we start comparing your
                week {learning.week} with the textbook.
              </p>
              <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={learning.needed} aria-valuenow={learning.sessions}>
                <span style={{ width: `${(learning.sessions / learning.needed) * 100}%` }} />
              </div>
            </>
          ) : (
            <>
              <h3>Your plan is {learning.tunedPct}% tuned to you</h3>
              <p className="muted">
                {learning.adjustment === 0
                  ? `Week ${learning.week} matches the textbook so far, across ${learning.sessions} sessions.`
                  : learning.reason}
              </p>
              {learning.nextChange && (
                <p className="adjusted-note">
                  <b>Coming up: week {learning.nextChange.week} is {change(learning.nextChange.adjustment)}.</b>{' '}
                  {learning.nextChange.reason}
                </p>
              )}
            </>
          )}
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="card">
          <p className="eyebrow">Coming up</p>
          <ul className="upcoming">
            {upcoming.map((s) => (
              <li key={s.id}>
                <span className="weekday">{weekday(s.date)}</span>
                <span className="upcoming-focus">
                  {s.focus}
                  {s.cycleDay !== null && <small className="muted"> · day {s.cycleDay}</small>}
                  {s.adjusted && <small className="adjusted-tag">adjusted</small>}
                </span>
                <span className={`pill pill-${s.intensity.toLowerCase()}`}>{titleCase(s.intensity)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
