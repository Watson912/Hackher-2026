import { useEffect, useState } from 'react'
import { api, type PhaseIntensity, type PlanView } from '../api.ts'
import { InfoHeading } from '../components/InfoHeading.tsx'
import { monthDay, phaseLabel, titleCase, weekday } from '../format.ts'

// Plan view (SPEC.md): all four weeks with the intensity label on each, so
// the shape of the block is visible at a glance. Read back from the saved
// plan in the database, including any exercises she swapped.

const LEVEL_LABEL: Record<PhaseIntensity, string> = { deload: 'Deload', moderate: 'Moderate', high: 'High', peak: 'Peak' }
const LEVEL_HEIGHT: Record<PhaseIntensity, number> = { deload: 1, moderate: 2, high: 3, peak: 4 }

type Week = PlanView['weeks'][number]

function weekTitle(w: Week) {
  const days = w.cycleDayAtStart !== null ? `Cycle days ${w.cycleDayAtStart}–${w.cycleDayAtStart + (Date.parse(w.end) - Date.parse(w.start)) / 86_400_000}` : `Week ${w.week}`
  return `${days} · ${monthDay(w.start)}–${monthDay(w.end)}`
}

function BlockShape({ weeks }: { weeks: Week[] }) {
  return (
    <div className="block-shape" role="img"
      aria-label={`The shape of your block: ${weeks.map((w) => `week ${w.week} ${w.level ?? 'no plan'}`).join(', ')}.`}>
      {weeks.map((w) => (
        <div key={w.week} className="block-col">
          <div className="block-bar-wrap">
            {w.textbookLevel && w.textbookLevel !== w.level && (
              <span className="block-tick" style={{ bottom: `${(LEVEL_HEIGHT[w.textbookLevel] / 4) * 100}%` }} title="Textbook" />
            )}
            <span className="block-bar" style={{
              height: `${((w.level ? LEVEL_HEIGHT[w.level] : 0) / 4) * 100}%`,
              background: w.phase ? `var(--phase-${w.phase.toLowerCase()}, var(--accent))` : 'var(--accent)',
            }} />
          </div>
          <b>{w.level ? LEVEL_LABEL[w.level] : '—'}</b>
          <small className="muted">{w.cycleWeek ? `Cycle wk ${w.cycleWeek}` : `Week ${w.week}`}</small>
        </div>
      ))}
    </div>
  )
}

function WeekCard({ w, today }: { w: Week; today: string }) {
  const [open, setOpen] = useState<number | null>(null)
  const current = today >= w.start && today <= w.end
  return (
    <section className={`card week-card${current ? ' current' : ''}`}>
      <div className="week-head">
        <div>
          <p className="eyebrow">{current ? 'This week' : `Week ${w.week}`}{w.phase && w.phase !== 'UNKNOWN' && <> · {phaseLabel(w.phase)}</>}</p>
          <h3>{weekTitle(w)}</h3>
        </div>
        {w.level && <span className={`pill pill-level-${w.level}`}>{LEVEL_LABEL[w.level]}</span>}
      </div>
      {w.adjustmentReason && (
        <p className="adjusted-note">Lighter than usual, based on your logs.</p>
      )}
      <ul className="plan-sessions">
        {w.sessions.map((s) => (
          <li key={s.id} className={s.date === today ? 'today' : undefined}>
            <button type="button" className="plan-session" aria-expanded={open === s.id} disabled={!s.exercises.length}
              onClick={() => setOpen(open === s.id ? null : s.id)}>
              <span className="weekday">{weekday(s.date)}</span>
              <span className="upcoming-focus">
                {s.focus}
                <small className="muted"> · {s.durationMin} min{s.cycleDay !== null && <> · day {s.cycleDay}</>}</small>
                {s.adjusted && <small className="adjusted-tag">adjusted</small>}
                {s.status !== 'PLANNED' && (
                  <small className={`status-tag status-${s.status.toLowerCase()}`}>
                    {s.status === 'COMPLETED' ? 'Done' : s.status === 'PARTIAL' ? 'Cut short' : 'Skipped'}
                  </small>
                )}
              </span>
              {s.intensityLevel
                ? <span className={`pill pill-level-${s.intensityLevel}`}>{LEVEL_LABEL[s.intensityLevel]}</span>
                : <span className={`pill pill-${s.intensity.toLowerCase()}`}>{titleCase(s.intensity)}</span>}
            </button>
            {open === s.id && (
              <ul className="plan-exercises">
                {s.exercises.map((e) => (
                  <li key={e.exerciseId}>
                    <span>{e.name}{e.swappedFrom && <small className="muted"> (your swap)</small>}</span>
                    <span className="muted small">{e.sets} × {e.reps}{e.loadKg !== null && <> · <b>{e.load}</b></>}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {w.sessions.length === 0 && <li className="muted small">No sessions saved for this week yet.</li>}
      </ul>
    </section>
  )
}

export function Plan() {
  const [data, setData] = useState<PlanView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<PlanView>('/plan').then(setData, (e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="error">Couldn't load your plan: {error}</p>
  if (!data) return <p className="muted">Loading…</p>

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Your plan</p>
        <InfoHeading level={2} title="Your next four weeks" label="your plan">
          <p>Taller means a harder week. {data.steady ? 'Your weeks follow a steady wave.' : 'Colors are your cycle phases.'} Tap a workout to see its exercises.</p>
        </InfoHeading>
        <BlockShape weeks={data.weeks} />
      </section>

      {data.weeks.map((w) => <WeekCard key={w.start} w={w} today={data.today} />)}
    </>
  )
}
