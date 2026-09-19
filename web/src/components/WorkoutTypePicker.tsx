import { useState } from 'react'
import { post } from '../api.ts'

// Pick a workout type: switch today's workout, or add one on a rest day.
// Same intensity her cycle calls for either way.

const TYPES = [
  { id: 'squat_push', label: 'Squat and push' },
  { id: 'hinge_pull', label: 'Hinge and pull' },
  { id: 'full_body', label: 'Full body' },
  { id: 'cardio', label: 'Cardio' },
  { id: 'mobility', label: 'Mobility' },
] as const

export function WorkoutTypePicker({ sessionId, current, label, onDone }: {
  sessionId: number | null   // null = add a workout today
  current?: string | null    // today's focus, to mark the current type
  label: string
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function pick(type: string) {
    setSaving(type)
    setError(null)
    try {
      if (sessionId === null) await post('/workouts', { type })
      else await post(`/sessions/${sessionId}/type`, { type })
      setOpen(false)
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(null)
    }
  }

  if (!open) {
    return (
      <button type="button" className={sessionId === null ? 'btn btn-primary btn-small' : 'chip chip-button'} onClick={() => setOpen(true)}>
        {label}
      </button>
    )
  }

  return (
    <div className="type-picker">
      <div className="type-options">
        {TYPES.map((t) => (
          <button key={t.id} type="button" disabled={saving !== null || t.label === current}
            className={t.label === current ? 'selected' : ''} onClick={() => pick(t.id)}>
            {saving === t.id ? '…' : t.label}
          </button>
        ))}
      </div>
      <button type="button" className="link" onClick={() => setOpen(false)}>Cancel</button>
      {error && <p className="error small">{error}</p>}
    </div>
  )
}
