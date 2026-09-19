import { useState } from 'react'
import { post } from '../api.ts'

// "Period started": tells the app her cycle turned over, early or late, so
// her plan lines back up with her real cycle.

function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PeriodLogger({ onLogged, prominent = false }: { onLogged: () => void; prominent?: boolean }) {
  // Worked out once when the button mounts.
  const [{ today, yesterday }] = useState(() => {
    const now = new Date()
    const before = new Date(now)
    before.setDate(now.getDate() - 1)
    return { today: localIso(now), yesterday: localIso(before) }
  })
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(today)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await post('/period', { date })
      setOpen(false)
      onLogged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className={prominent ? 'btn btn-primary btn-small' : 'chip chip-button'} onClick={() => setOpen(true)}>
        Period started
      </button>
    )
  }

  return (
    <div className="period-logger">
      <span className="log-q">When did it start?</span>
      <div className="log-options">
        <button type="button" className={date === today ? 'selected' : ''} onClick={() => setDate(today)}>Today</button>
        <button type="button" className={date === yesterday ? 'selected' : ''} onClick={() => setDate(yesterday)}>Yesterday</button>
        <input type="date" className="date-input" max={today} value={date} aria-label="Pick the date"
          onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>
      <div className="settings-actions">
        <button type="button" className="btn btn-primary btn-small" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error && <p className="error small">{error}</p>}
    </div>
  )
}
