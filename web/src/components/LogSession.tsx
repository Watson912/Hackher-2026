import { useState } from 'react'
import { post, type LogResult, type SessionStatus } from '../api.ts'

// Three taps: how it went, energy, effort. Skipped sessions stop after energy.
type Outcome = Exclude<SessionStatus, 'PLANNED'>
type Effort = 'EASIER' | 'RIGHT' | 'HARDER'

const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: 'COMPLETED', label: 'Done' },
  { value: 'PARTIAL', label: 'Cut short' },
  { value: 'SKIPPED', label: 'Skipped' },
]
const ENERGY = ['Drained', 'Low', 'OK', 'Good', 'Great']
const EFFORT: { value: Effort; label: string }[] = [
  { value: 'EASIER', label: 'Easier than planned' },
  { value: 'RIGHT', label: 'About right' },
  { value: 'HARDER', label: 'Harder than planned' },
]

export function LogSession({ sessionId, onLogged }: { sessionId: number; onLogged: (result: LogResult) => void }) {
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [energy, setEnergy] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(status: Outcome, energyLevel: number, effort: Effort | null) {
    setSaving(true)
    setError(null)
    try {
      onLogged(await post<LogResult>(`/sessions/${sessionId}/log`, { status, energy: energyLevel, effort }))
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  function pickEnergy(level: number) {
    setEnergy(level)
    if (outcome === 'SKIPPED') submit(outcome, level, null)
  }

  return (
    <div className="log" aria-busy={saving}>
      <div className="log-step">
        <span className="log-q">How did it go?</span>
        <div className="log-options">
          {OUTCOMES.map((o) => (
            <button key={o.value} type="button" className={outcome === o.value ? 'selected' : ''}
              disabled={saving} onClick={() => { setOutcome(o.value); setEnergy(null) }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {outcome && (
        <div className="log-step">
          <span className="log-q">Energy?</span>
          <div className="log-options energy">
            {ENERGY.map((label, i) => (
              <button key={label} type="button" className={energy === i + 1 ? 'selected' : ''}
                disabled={saving} onClick={() => pickEnergy(i + 1)} aria-label={`${i + 1} of 5, ${label}`}>
                <b>{i + 1}</b><small>{label}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {outcome && outcome !== 'SKIPPED' && energy !== null && (
        <div className="log-step">
          <span className="log-q">How hard did it feel?</span>
          <div className="log-options">
            {EFFORT.map((e) => (
              <button key={e.value} type="button" disabled={saving} onClick={() => submit(outcome, energy, e.value)}>
                {e.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {saving && <p className="muted small">Saving and updating your plan…</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
