import { useEffect, useState } from 'react'
import { api, post, type ExercisePlan, type LiftResult, type LoggedLift } from '../api.ts'
import { weekday } from '../format.ts'
import { cr10Words } from '../scales.ts'
import { Cr10Scale } from './Scales.tsx'

// Today's exercises, each with its own log: the weight she used, whether she
// finished every set, and her RPE on the Borg CR-10 scale. Her next load for
// that exercise comes from this log. One tap on Swap offers the exercise's
// swaps (only what her equipment allows); her pick is remembered.

/** The first part of a load reason ("Up from 8 kg"), without the detail. */
const shortReason = (reason: string) => reason.split(',')[0]

const prescription = (e: ExercisePlan) => {
  const work = /hold|min|s hard/.test(e.reps) ? `${e.sets} × ${e.reps}` : `${e.sets} × ${e.reps} reps`
  return `${work} · RPE ${e.rpe}`
}

function LiftForm({ sessionId, exercise, onSaved, initial }: {
  sessionId: number
  exercise: ExercisePlan
  initial: LoggedLift | null
  onSaved: (result: LiftResult) => void
}) {
  const [loadKg, setLoadKg] = useState(initial?.loadKg?.toString() ?? exercise.loadKg?.toString() ?? '')
  const [completed, setCompleted] = useState<boolean | null>(initial?.completed ?? null)
  const [rpe, setRpe] = useState<number | null>(initial?.rpe ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const weight = exercise.weighed && loadKg.trim() !== '' ? Number(loadKg) : null
      onSaved(await post<LiftResult>(`/sessions/${sessionId}/exercises/${exercise.exerciseId}`, {
        loadKg: weight, completed, rpe,
      }))
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="lift-form">
      {exercise.weighed && (
        <label className="lift-weight">
          <span>Weight used</span>
          <span className="input-unit">
            <input type="number" inputMode="decimal" min={0} max={500} step={0.5} value={loadKg}
              onChange={(e) => setLoadKg(e.target.value)} aria-label={`Weight used for ${exercise.name}, in kilograms`} />
            kg
          </span>
        </label>
      )}

      <div className="lift-q">
        <span>Finished every set?</span>
        <div className="log-options">
          <button type="button" className={completed === true ? 'selected' : ''} onClick={() => setCompleted(true)}>Yes</button>
          <button type="button" className={completed === false ? 'selected' : ''} onClick={() => setCompleted(false)}>No</button>
        </div>
      </div>

      <div className="lift-q">
        <span>How hard was it?</span>
        <Cr10Scale value={rpe} onChange={setRpe} label="Rating of perceived exertion, 0 to 10" />
      </div>

      <button type="button" className="btn btn-primary btn-small" disabled={completed === null || rpe === null || saving}
        onClick={save}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      {error && <p className="error small">{error}</p>}
    </div>
  )
}

function SwapPicker({ sessionId, exercise, onSwapped, onCancel }: {
  sessionId: number; exercise: ExercisePlan; onSwapped: () => void; onCancel: () => void
}) {
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function swap(to: string) {
    setSaving(to)
    setError(null)
    try {
      await post(`/sessions/${sessionId}/exercises/${exercise.exerciseId}/swap`, { to })
      onSwapped()
    } catch (e) {
      setError((e as Error).message)
      setSaving(null)
    }
  }
  return (
    <div className="swap-picker">
      <span className="muted small">Swap {exercise.name} for:</span>
      <div className="choices chips wrap-chips">
        {exercise.swaps.map((s) => (
          <button key={s.id} type="button" className="choice" disabled={saving !== null} onClick={() => swap(s.id)}>
            {saving === s.id ? 'Swapping…' : s.name}{s.id === exercise.swappedFrom?.id && <small> (original)</small>}
          </button>
        ))}
      </div>
      <button type="button" className="link" onClick={onCancel}>Cancel</button>
      {error && <p className="error small">{error}</p>}
    </div>
  )
}

function ExerciseRow({ index, sessionId, exercise, logged, onSwapped, editable }: {
  index: number; sessionId: number; exercise: ExercisePlan; logged: LoggedLift | null; onSwapped: () => void; editable: boolean
}) {
  const [open, setOpen] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [saved, setSaved] = useState<LoggedLift | null>(logged)
  const [next, setNext] = useState<LiftResult['next']>(null)

  return (
    <li className="exercise-row">
      <div className="exercise-head">
        <span className={`exercise-index${saved ? ' done' : ''}`} aria-hidden="true">{saved ? '✓' : index + 1}</span>
        <div className="exercise-main">
          <div className="exercise-name">{exercise.name}</div>
          <div className="muted small">{prescription(exercise)}</div>
        </div>
        <div className="exercise-load">{exercise.loadKg !== null ? exercise.load : null}</div>
      </div>
      {exercise.loadKg === null && exercise.load !== exercise.reps && <p className="muted small">{exercise.load}</p>}
      {exercise.swappedFrom && <p className="muted small">Swapped from {exercise.swappedFrom.name}</p>}
      {exercise.loadReason && <p className="load-reason" title={exercise.loadReason}>{shortReason(exercise.loadReason)}</p>}

      {saved && !open && (
        <p className="lift-saved">
          <span className="check-badge small-badge" aria-hidden="true">✓</span>
          {saved.loadKg !== null && <>{saved.loadKg} kg · </>}
          {saved.completed ? 'every set' : 'not every set'} · RPE {saved.rpe} ({cr10Words(saved.rpe)})
        </p>
      )}
      {saved && !open && next && (
        <p className="muted small">Next time ({weekday(next.date)}): <b>{next.load}</b></p>
      )}

      {open && (
        <LiftForm sessionId={sessionId} exercise={exercise} initial={saved}
          onSaved={(result) => { setSaved(result.saved); setNext(result.next); setOpen(false) }} />
      )}
      {swapping && <SwapPicker sessionId={sessionId} exercise={exercise} onSwapped={onSwapped} onCancel={() => setSwapping(false)} />}
      {!open && !swapping && (
        <div className="exercise-actions">
          <button type="button" className="link" onClick={() => setOpen(true)}>{saved ? 'Edit' : 'Log this exercise'}</button>
          {!saved && exercise.swaps.length > 0 && (
            <button type="button" className="link" onClick={() => setSwapping(true)}>Swap</button>
          )}
          {editable && exercise.added && (
            <button type="button" className="link" onClick={() => remove(sessionId, exercise.exerciseId).then(onSwapped)}>Remove</button>
          )}
        </div>
      )}
    </li>
  )
}

const remove = (sessionId: number, exerciseId: string) => api(`/sessions/${sessionId}/exercises/${exerciseId}`, { method: 'DELETE' })

interface LibraryItem { id: string; name: string; muscleGroup: string }

/** Add any exercise her equipment allows, searchable. */
function AddExercise({ sessionId, inSession, onAdded }: { sessionId: number; inSession: string[]; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [library, setLibrary] = useState<LibraryItem[] | null>(null)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && !library) api<LibraryItem[]>('/exercise-library').then(setLibrary, (e: Error) => setError(e.message))
  }, [open, library])

  async function add(id: string) {
    setSaving(id)
    setError(null)
    try {
      await post(`/sessions/${sessionId}/exercises`, { exerciseId: id })
      setOpen(false)
      setQuery('')
      onAdded()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(null)
    }
  }

  if (!open) {
    return <button type="button" className="add-exercise" onClick={() => setOpen(true)}>+ Add exercise</button>
  }

  const q = query.trim().toLowerCase()
  const matches = (library ?? []).filter((e) => !inSession.includes(e.id)
    && (!q || e.name.toLowerCase().includes(q) || e.muscleGroup.includes(q)))

  return (
    <div className="add-picker">
      <input className="add-search" autoFocus placeholder="Search exercises" value={query}
        onChange={(e) => setQuery(e.target.value)} aria-label="Search exercises" />
      {!library && !error && <p className="muted small">Loading…</p>}
      <ul className="add-list">
        {matches.slice(0, 40).map((e) => (
          <li key={e.id}>
            <button type="button" disabled={saving !== null} onClick={() => add(e.id)}>
              <span>{e.name}</span>
              <small>{saving === e.id ? 'Adding…' : e.muscleGroup.replace(/_/g, ' ')}</small>
            </button>
          </li>
        ))}
        {library && matches.length === 0 && <li className="muted small">Nothing matches "{query}".</li>}
      </ul>
      <button type="button" className="link" onClick={() => setOpen(false)}>Cancel</button>
      {error && <p className="error small">{error}</p>}
    </div>
  )
}

export function SessionExercises({ sessionId, exercises, lifts, onSwapped, editable }: {
  sessionId: number
  exercises: ExercisePlan[]
  lifts: Record<string, LoggedLift>
  onSwapped: () => void            // after a swap, add or remove: reload the day
  editable: boolean                // the workout isn't logged yet
}) {
  return (
    <>
      {exercises.length > 0 && (
        <ul className="exercise-list">
          {exercises.map((e, i) => (
            <ExerciseRow key={e.exerciseId} index={i} sessionId={sessionId} exercise={e} logged={lifts[e.exerciseId] ?? null}
              onSwapped={onSwapped} editable={editable} />
          ))}
        </ul>
      )}
      {editable && <AddExercise sessionId={sessionId} inSession={exercises.map((e) => e.exerciseId)} onAdded={onSwapped} />}
    </>
  )
}
