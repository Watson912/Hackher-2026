import { useState } from 'react'
import { post, type LogResult, type SessionStatus } from '../api.ts'
import { Cr10Scale, FatigueScale } from './Scales.tsx'

// The session log (SPEC.md): three taps, no free text, nothing required
// beyond how it went. 1) how it went, 2) session RPE on the Borg CR-10
// scale, 3) fatigue on the Hooper Index, which saves. Minutes default to
// the plan (half if cut short) and can be nudged. Session load = RPE x minutes.
type Outcome = Exclude<SessionStatus, 'PLANNED'>

const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: 'COMPLETED', label: 'Done' },
  { value: 'PARTIAL', label: 'Cut short' },
  { value: 'SKIPPED', label: 'Skipped' },
]

export function LogSession({ sessionId, plannedMin, onLogged }: {
  sessionId: number
  plannedMin: number | null
  onLogged: (result: LogResult) => void
}) {
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [minutes, setMinutes] = useState<number | null>(plannedMin)
  const [rpe, setRpe] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pickOutcome(o: Outcome) {
    setOutcome(o)
    setMinutes(o === 'PARTIAL' && plannedMin ? Math.round(plannedMin / 2) : plannedMin)
    if (o === 'SKIPPED') setRpe(null)
  }

  async function save(fatigue: number | null) {
    if (!outcome) return
    setSaving(true)
    setError(null)
    try {
      onLogged(await post<LogResult>(`/sessions/${sessionId}/log`, {
        status: outcome,
        rpe: outcome === 'SKIPPED' ? null : rpe,
        fatigue,
        durationMin: outcome === 'SKIPPED' ? null : minutes,
      }))
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  const skipped = outcome === 'SKIPPED'

  return (
    <div className="log" aria-busy={saving}>
      <div className="log-step">
        <span className="log-q"><span className="step-num">1</span> How did it go?</span>
        <div className="log-options">
          {OUTCOMES.map((o) => (
            <button key={o.value} type="button" className={outcome === o.value ? 'selected' : ''}
              disabled={saving} onClick={() => pickOutcome(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
        {outcome && !skipped && minutes !== null && (
          <div className="minutes">
            <span className="muted small">Minutes trained</span>
            <div className="stepper small-stepper">
              <button type="button" aria-label="5 minutes less" disabled={saving || minutes <= 5}
                onClick={() => setMinutes(Math.max(5, minutes - 5))}>−</button>
              <output>{minutes} min</output>
              <button type="button" aria-label="5 minutes more" disabled={saving || minutes >= 240}
                onClick={() => setMinutes(Math.min(240, minutes + 5))}>+</button>
            </div>
          </div>
        )}
      </div>

      {outcome && !skipped && (
        <div className="log-step">
          <span className="log-q"><span className="step-num">2</span> How hard was it?</span>
          <Cr10Scale value={rpe} onChange={setRpe} disabled={saving} label="Session RPE, Borg CR-10, 0 to 10" />
        </div>
      )}

      {outcome && (
        <div className="log-step">
          <span className="log-q">
            <span className="step-num">{skipped ? 2 : 3}</span> How tired do you feel?
          </span>
          <FatigueScale value={null} onChange={(n) => save(n)} disabled={saving} />
          <button type="button" className="link" disabled={saving} onClick={() => save(null)}>Skip and save</button>
        </div>
      )}

      {saving && <p className="muted small">Saving…</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
