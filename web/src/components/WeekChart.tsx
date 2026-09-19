import { useState } from 'react'
import { useWidth } from '../useWidth.ts'

// One number per cycle week (her bars) against a reference value (a gray
// tick across each bar): her fatigue vs the default, or her session load vs
// what was planned. One series plus a reference mark.

export interface WeekChartRow {
  key: number
  title: string          // "Week 3 · Ovulation into early luteal"
  label: string          // "Week 3"
  sublabel: string       // "Post-ovulation"
  yours: number | null
  reference: number | null
  sessions: number
}

const H = 230
const M = { top: 28, right: 8, bottom: 44, left: 36 }
const PLOT_H = H - M.top - M.bottom
const BAR = 24
const TICK = 44

/** Column with a 4px rounded top, square at the baseline. */
function barPath(cx: number, top: number, bottom: number) {
  const x0 = cx - BAR / 2
  const x1 = cx + BAR / 2
  const r = Math.min(4, (bottom - top) / 2)
  return `M${x0},${bottom} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x1 - r} Q${x1},${top} ${x1},${top + r} V${bottom} Z`
}

export function WeekChart({ rows, max, ticks, highlight, yoursLabel, referenceLabel, format, unit, describe }: {
  rows: WeekChartRow[]
  max: number
  ticks: number[]
  highlight: number | null
  yoursLabel: string
  referenceLabel: string
  format: (n: number) => string
  unit: string                           // for the aria label and table header, e.g. "fatigue (1-7)"
  describe?: (row: WeekChartRow) => string | null // direct label over the highlighted bar
}) {
  const [hover, setHover] = useState<number | null>(null)
  const [plotRef, W] = useWidth<HTMLDivElement>()
  const y = (v: number) => M.top + PLOT_H - (Math.min(v, max) / max) * PLOT_H
  const PLOT_W = W - M.left - M.right
  const band = PLOT_W / rows.length
  const cx = (i: number) => M.left + band * i + band / 2
  const hovered = hover === null ? null : rows[hover]
  const top = (r: WeekChartRow) => Math.min(y(r.yours ?? 0), y(r.reference ?? 0))

  return (
    <figure className="chart">
      <div className="legend" aria-hidden="true">
        <span><i className="key key-bar" /> {yoursLabel}</span>
        <span><i className="key key-tick" /> {referenceLabel}</span>
      </div>

      <div className="chart-plot" ref={plotRef}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
          aria-label={`Your ${unit} by cycle week compared with ${referenceLabel.toLowerCase()}. ${rows
            .map((r) => `${r.label}: you ${r.yours === null ? 'no data' : format(r.yours)}, ${referenceLabel.toLowerCase()} ${r.reference === null ? 'none' : format(r.reference)}`)
            .join('. ')}.`}>
          {ticks.map((v) => (
            <g key={v}>
              <line className="grid" x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} />
              <text className="axis-label" x={M.left - 8} y={y(v)} dy="0.32em" textAnchor="end">{v}</text>
            </g>
          ))}
          <line className="baseline" x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} />

          {rows.map((r, i) => {
            const label = r.key === highlight && describe ? describe(r) : null
            return (
              <g key={r.key} className={hover !== null && hover !== i ? 'dim' : undefined}>
                {r.yours !== null && <path className="bar" d={barPath(cx(i), y(r.yours), y(0))} />}
                {r.reference !== null && (
                  <line className="tick" x1={cx(i) - TICK / 2} x2={cx(i) + TICK / 2} y1={y(r.reference)} y2={y(r.reference)} />
                )}
                {label && <text className="direct-label" x={cx(i)} y={top(r) - 10} textAnchor="middle">{label}</text>}
                <text className="axis-label strong" x={cx(i)} y={H - M.bottom + 18} textAnchor="middle">{r.label}</text>
                <text className="axis-label" x={cx(i)} y={H - M.bottom + 34} textAnchor="middle">{r.sublabel}</text>
                <rect className="hit" x={M.left + band * i} y={M.top} width={band} height={PLOT_H}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
              </g>
            )
          })}
        </svg>

        {hovered && hover !== null && (
          <div className="tooltip" style={{ left: `${(cx(hover) / W) * 100}%`, top: `${(top(hovered) / H) * 100}%` }}>
            <strong>{hovered.title}</strong>
            <div className="tooltip-row"><i className="key key-bar" /> {yoursLabel} <b>{hovered.yours === null ? '—' : format(hovered.yours)}</b></div>
            <div className="tooltip-row"><i className="key key-tick" /> {referenceLabel} <b>{hovered.reference === null ? '—' : format(hovered.reference)}</b></div>
            <div className="tooltip-note">{hovered.sessions} sessions logged</div>
          </div>
        )}
      </div>

      <details className="table-view">
        <summary>View as table</summary>
        <table>
          <thead>
            <tr><th>Week</th><th>{yoursLabel}</th><th>{referenceLabel}</th><th>Difference</th><th>Sessions</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.title}</td>
                <td>{r.yours === null ? '—' : format(r.yours)}</td>
                <td>{r.reference === null ? '—' : format(r.reference)}</td>
                <td>{r.yours === null || r.reference === null ? '—' : `${r.yours > r.reference ? '+' : ''}${format(r.yours - r.reference)}`}</td>
                <td>{r.sessions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
