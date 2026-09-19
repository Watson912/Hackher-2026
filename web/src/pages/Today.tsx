import { useCallback, useEffect, useState } from 'react'
import { api, type LogResult, type Today as TodayData } from '../api.ts'
import { FuelCard } from '../components/FuelCard.tsx'
import { InfoHeading } from '../components/InfoHeading.tsx'
import { LogSession } from '../components/LogSession.tsx'
import { PeriodLogger } from '../components/PeriodLogger.tsx'
import { SessionExercises } from '../components/SessionExercises.tsx'
import { change, longDate, phaseLabel, titleCase, weekday } from '../format.ts'

// Today: her workout, built from her onboarding answers and where she is in
// her cycle. Swap anything, log it when she's done. Kept short on purpose.

/** Today's place in her cycle as a ring, in the phase's color. */
function CycleRing({ day, length, phase }: { day: number; length: number; phase: string }) {
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <svg className="cycle-ring" viewBox="0 0 84 84" width="84" height="84" role="img" aria-label={`Day ${day} of ${length}`}>
      <circle cx="42" cy="42" r={r} className="ring-track" />
      <circle cx="42" cy="42" r={r} className="ring-fill" style={{ stroke: `var(--phase-${phase.toLowerCase()}, var(--accent))` }}
        strokeDasharray={`${(day / length) * c} ${c}`} transform="rotate(-90 42 42)" />
      <text x="42" y="42" className="ring-day">{day}</text>
      <text x="42" y="58" className="ring-of">of {length}</text>
    </svg>
  )
}

const dayOfMonth = (date: string) => Number(date.slice(8))

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

  const { cycle, session, upcoming, learning, periodLate } = data
  const hasCycleDay = cycle.cycleDay !== null
  const logged = session && session.status !== 'PLANNED'
  const next = learning?.nextChange

  function onLogged(result: LogResult) {
    setLogResult(result)
    load()
  }

  return (
    <>
      <section className="hero today-hero">
        <div>
          <p className="eyebrow">{longDate(data.today)}</p>
          <h2>{hasCycleDay ? phaseLabel(cycle.phase) : cycle.phase === 'SUPPRESSED' ? 'Steady training' : 'Welcome'}</h2>
          {cycle.stale && <p className="muted">{cycle.prompt}</p>}
          {periodLate && (
            <p className="late-note">Period due {periodLate.daysLate === 1 ? 'yesterday' : `${periodLate.daysLate} days ago`}</p>
          )}
          {!cycle.stale && !periodLate && cycle.daysUntilNextPeriod !== null && (
            <p className="muted">Next period in about {cycle.daysUntilNextPeriod} days</p>
          )}
          {cycle.phase !== 'SUPPRESSED' && (
            <div className="hero-action"><PeriodLogger onLogged={load} prominent={periodLate !== null || cycle.stale} /></div>
          )}
        </div>
        {hasCycleDay && <CycleRing day={cycle.cycleDay!} length={cycle.cycleLength} phase={cycle.phase} />}
      </section>

      <section className="card today-card">
        <p className="eyebrow">Today's workout</p>
        {!session && (
          <>
            <h3>Rest day</h3>
            <p className="muted">A walk or some mobility is plenty.</p>
          </>
        )}
        {session && (
          <>
            <div className="today-session">
              <div>
                <InfoHeading title={session.focus} label="today's workout">
                  <p>Built from your answers and where you are in your cycle. Tap <b>Swap</b> to change an exercise.</p>
                </InfoHeading>
                <p className="session-meta">
                  <span className="chip">
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                    {session.durationMin} min
                  </span>
                </p>
              </div>
              <span className={`pill pill-${session.intensity.toLowerCase()}`}>{titleCase(session.intensity)}</span>
            </div>

            {session.textbook && <p className="adjusted-note">Lighter than usual, based on your logs.</p>}

            <SessionExercises key={session.id} sessionId={session.id} exercises={session.exercises} lifts={session.lifts} onSwapped={load} />
            {data.equipmentNotes.map((note) => <p key={note} className="muted small equipment-note">{note}</p>)}

            {!logged && <LogSession sessionId={session.id} plannedMin={session.durationMin} onLogged={onLogged} />}
            {logged && (
              <div className="logged">
                <span className="check-badge" aria-hidden="true">✓</span>
                <div>
                  <b>{session.status === 'SKIPPED' ? 'Skipped' : session.status === 'PARTIAL' ? 'Cut short' : 'Done'}</b>
                  {logResult && <p className="feedback">{logResult.feedback}</p>}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="card">
          <p className="eyebrow">Coming up</p>
          {next && <p className="muted small">Week {next.week} is {change(next.adjustment)}, based on your logs.</p>}
          <ul className="upcoming">
            {upcoming.map((s) => (
              <li key={s.id}>
                <span className="date-badge"><small>{weekday(s.date)}</small><b>{dayOfMonth(s.date)}</b></span>
                <span className="upcoming-focus">{s.focus}</span>
                <span className={`pill pill-${s.intensity.toLowerCase()}`}>{titleCase(s.intensity)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <FuelCard nutrition={data.nutrition} />
    </>
  )
}
