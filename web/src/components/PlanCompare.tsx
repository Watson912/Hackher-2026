import { useState } from 'react'
import type { PlannedSession, WeekPlan } from '../api.ts'
import { phaseLabel, titleCase, weekday, monthDay } from '../format.ts'

type View = 'textbook' | 'yours'

function Row({ s, view }: { s: PlannedSession; view: View }) {
  const spec = view === 'yours' ? s : s.textbook
  const changed = view === 'yours' && s.adjusted
  return (
    <li className={`session-row${changed ? ' changed' : ''}`}>
      <div className="session-date">
        <span className="weekday">{weekday(s.date)}</span>
        <span className="muted">Day {s.cycleDay}</span>
      </div>
      <div className="session-body">
        <div className="session-focus">{spec.focus}</div>
        <div className="muted">{spec.durationMin} min · {phaseLabel(s.phase)}</div>
        {changed && (
          <div className="was">
            Textbook: <s>{s.textbook.focus}, {titleCase(s.textbook.intensity).toLowerCase()}, {s.textbook.durationMin} min</s>
          </div>
        )}
      </div>
      <span className={`pill pill-${spec.intensity.toLowerCase()}`}>{titleCase(spec.intensity)}</span>
    </li>
  )
}

export function PlanCompare({ plan }: { plan: WeekPlan }) {
  const [view, setView] = useState<View>('yours')
  const changed = plan.sessions.filter((s) => s.adjusted).length

  return (
    <div className="plan-compare">
      <div className="plan-header">
        <div>
          <div className="plan-title">Week of {monthDay(plan.weekStart)}</div>
          <div className="muted">Starts on cycle day {plan.cycleDayAtStart}</div>
        </div>
        <div className="segmented" role="tablist" aria-label="Plan version">
          {(['textbook', 'yours'] as View[]).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'active' : ''}
              onClick={() => setView(v)}>
              {v === 'textbook' ? 'Textbook' : 'Yours'}
            </button>
          ))}
        </div>
      </div>

      <ul className="session-list">
        {plan.sessions.map((s) => <Row key={s.date} s={s} view={view} />)}
      </ul>

      {view === 'yours' && plan.adjustmentReason && (
        <p className="reason">
          <strong>{changed} of {plan.sessions.length} sessions changed</strong>, based on your logs.
        </p>
      )}
      {view === 'textbook' && (
        <p className="reason muted">The standard plan for these days.</p>
      )}
    </div>
  )
}
