import { useState } from 'react'
import type { CycleWeek, WeekPattern } from '../api.ts'
import { useWidth } from '../useWidth.ts'

// Her average energy per cycle week (bars) against the textbook value
// (a gray tick across each bar). One series plus a reference mark.
const H = 230
const M = { top: 28, right: 8, bottom: 44, left: 28 }
const PLOT_H = H - M.top - M.bottom
const MAX = 5
const BAR = 24
const TICK = 44

const y = (v: number) => M.top + PLOT_H - (v / MAX) * PLOT_H

/** Column with a 4px rounded top, square at the baseline. */
function barPath(cx: number, top: number, bottom: number) {
  const x0 = cx - BAR / 2
  const x1 = cx + BAR / 2
  const r = Math.min(4, (bottom - top) / 2)
  return `M${x0},${bottom} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x1 - r} Q${x1},${top} ${x1},${top + r} V${bottom} Z`
}

export function EnergyChart({ weeks, highlight }: { weeks: WeekPattern[]; highlight: CycleWeek | null }) {
  const [hover, setHover] = useState<number | null>(null)
  const [plotRef, W] = useWidth<HTMLDivElement>()
  const PLOT_W = W - M.left - M.right
  const band = PLOT_W / weeks.length
  const cx = (i: number) => M.left + band * i + band / 2
  const hovered = hover === null ? null : weeks[hover]

  return (
    <figure className="chart">
      <div className="legend" aria-hidden="true">
        <span><i className="key key-bar" /> You</span>
        <span><i className="key key-tick" /> Textbook</span>
      </div>

      <div className="chart-plot" ref={plotRef}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
          aria-label={`Your average energy by cycle week compared with the textbook. ${weeks
            .map((w) => `Week ${w.week}: you ${w.avgEnergy ?? 'no data'}, textbook ${w.textbookEnergy}`)
            .join('. ')}.`}>
          {[1, 2, 3, 4, 5].map((v) => (
            <g key={v}>
              <line className="grid" x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} />
              <text className="axis-label" x={M.left - 8} y={y(v)} dy="0.32em" textAnchor="end">{v}</text>
            </g>
          ))}
          <line className="baseline" x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} />

          {weeks.map((w, i) => {
            const labelTop = Math.min(y(w.avgEnergy ?? 0), y(w.textbookEnergy)) - 10
            return (
              <g key={w.week} className={hover !== null && hover !== i ? 'dim' : undefined}>
                {w.avgEnergy !== null && <path className="bar" d={barPath(cx(i), y(w.avgEnergy), y(0))} />}
                <line className="tick" x1={cx(i) - TICK / 2} x2={cx(i) + TICK / 2}
                  y1={y(w.textbookEnergy)} y2={y(w.textbookEnergy)} />
                {w.week === highlight && w.energyDelta !== null && (
                  <text className="direct-label" x={cx(i)} y={labelTop} textAnchor="middle">
                    {w.energyDelta > 0 ? '+' : '−'}{Math.abs(w.energyDelta).toFixed(1)} vs textbook
                  </text>
                )}
                <text className="axis-label strong" x={cx(i)} y={H - M.bottom + 18} textAnchor="middle">Week {w.week}</text>
                <text className="axis-label" x={cx(i)} y={H - M.bottom + 34} textAnchor="middle">{w.shortLabel}</text>
                <rect className="hit" x={M.left + band * i} y={M.top} width={band} height={PLOT_H}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
              </g>
            )
          })}
        </svg>

        {hovered && hover !== null && (
          <div className="tooltip" style={{
            left: `${(cx(hover) / W) * 100}%`,
            top: `${(Math.min(y(hovered.avgEnergy ?? 0), y(hovered.textbookEnergy)) / H) * 100}%`,
          }}>
            <strong>Week {hovered.week} · {hovered.label}</strong>
            <div className="tooltip-row"><i className="key key-bar" /> You <b>{hovered.avgEnergy?.toFixed(2) ?? '—'}</b></div>
            <div className="tooltip-row"><i className="key key-tick" /> Textbook <b>{hovered.textbookEnergy.toFixed(1)}</b></div>
            <div className="tooltip-note">{hovered.sessions} sessions logged</div>
          </div>
        )}
      </div>

      <details className="table-view">
        <summary>View as table</summary>
        <table>
          <thead>
            <tr><th>Week</th><th>Your energy</th><th>Textbook</th><th>Difference</th><th>Sessions</th></tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week}>
                <td>{w.week} · {w.label}</td>
                <td>{w.avgEnergy?.toFixed(2) ?? '—'}</td>
                <td>{w.textbookEnergy.toFixed(1)}</td>
                <td>{w.energyDelta === null ? '—' : `${w.energyDelta > 0 ? '+' : ''}${w.energyDelta.toFixed(2)}`}</td>
                <td>{w.sessions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
