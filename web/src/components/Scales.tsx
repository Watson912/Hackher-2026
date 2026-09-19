import { CR10_ANCHORS, cr10Words, HOOPER_LABELS } from '../scales.ts'

// The two validated scales the app asks for, with their anchors shown.

export function Cr10Scale({ value, onChange, disabled, label }: {
  value: number | null
  onChange: (n: number) => void
  disabled?: boolean
  label: string
}) {
  return (
    <>
      <div className="rpe-scale" role="radiogroup" aria-label={label}>
        {Array.from({ length: 11 }, (_, n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} disabled={disabled}
            aria-label={`${n}${CR10_ANCHORS[n] ? `, ${CR10_ANCHORS[n]}` : ''}`}
            className={`${value === n ? 'selected' : ''}${CR10_ANCHORS[n] ? ' anchor' : ''}`} onClick={() => onChange(n)}>
            {n}
          </button>
        ))}
      </div>
      <div className="rpe-anchors" aria-hidden="true">
        {Object.entries(CR10_ANCHORS).map(([n, words]) => <span key={n}><b>{n}</b> {words}</span>)}
      </div>
      {value !== null && <p className="muted small">{value}: {cr10Words(value)}</p>}
    </>
  )
}

export function FatigueScale({ value, onChange, disabled }: { value: number | null; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="fatigue-scale" role="radiogroup" aria-label="Fatigue, Hooper Index, 1 to 7">
      {HOOPER_LABELS.map((words, i) => (
        <button key={words} type="button" role="radio" aria-checked={value === i + 1} disabled={disabled}
          className={value === i + 1 ? 'selected' : ''} onClick={() => onChange(i + 1)} aria-label={`${i + 1}, ${words}`}>
          <b>{i + 1}</b><small>{words}</small>
        </button>
      ))}
    </div>
  )
}
