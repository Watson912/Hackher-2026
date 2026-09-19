import { useEffect, useState } from 'react'
import { api, post, WEEKDAYS, type Settings as SettingsData } from '../api.ts'

// Settings: the days she can work out. Saving replans everything she hasn't
// logged yet, so the plan fits her week.

export function Settings({ onDone }: { onDone: () => void }) {
  const [days, setDays] = useState<number[] | null>(null)
  const [perWeek, setPerWeek] = useState<number | null>(null) // set when she hasn't picked days yet
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<SettingsData>('/settings').then(
      (s) => { setDays(s.weekdays ?? []); setPerWeek(s.weekdays ? null : s.daysPerWeek) },
      (e: Error) => setError(e.message),
    )
  }, [])

  const toggle = (day: number) => {
    setSaved(false)
    setDays((d) => (d!.includes(day) ? d!.filter((x) => x !== day) : [...d!, day]))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await post<SettingsData>('/settings', { weekdays: days })
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (error && days === null) return <p className="error">Couldn't load settings: {error}</p>
  if (days === null) return <p className="muted">Loading…</p>

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Settings</p>
        <h2>Workout days</h2>
        <p className="muted">Your plan only schedules workouts on these days.</p>
      </section>
      <section className="card">
        <div className="day-picker" role="group" aria-label="Workout days">
          {WEEKDAYS.map((w) => (
            <button key={w.day} type="button" aria-pressed={days.includes(w.day)} aria-label={w.long}
              className={days.includes(w.day) ? 'selected' : ''} onClick={() => toggle(w.day)}>
              {w.short}
            </button>
          ))}
        </div>
        <p className="muted small">
          {perWeek !== null && days.length === 0
            ? `No days picked yet: your ${perWeek} workouts are spread through the week.`
            : `${days.length} ${days.length === 1 ? 'day' : 'days'} a week`}
        </p>
        <div className="settings-actions">
          <button type="button" className="btn btn-primary" disabled={days.length === 0 || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onDone}>Back</button>
        </div>
        {saved && <p className="feedback">Saved. Your plan now fits these days.</p>}
        {error && <p className="error">{error}</p>}
      </section>
    </>
  )
}
