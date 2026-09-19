import { useState, type MouseEvent } from 'react'
import type { TimelinePoint } from '../api.ts'
import { change, monthDay, pct } from '../format.ts'
import { useWidth } from '../useWidth.ts'

// How much lighter the app made her headline week, as her logs came in.
// A step line: the adjustment only changes when a new session lands.
const H = 180
const M = { top: 24, right: 44, bottom: 28, left: 36 }
const PLOT_H = H - M.top - M.bottom
const MAX = 20 // the learning cap, in percent

const dayNumber = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86_400_000

export function LearningTimeline({ points, week }: { points: TimelinePoint[]; week: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const [plotRef, W] = useWidth<HTMLDivElement>()
  const PLOT_W = W - M.left - M.right
  if (points.length < 2) return null

  const first = dayNumber(points[0].date)
  const span = dayNumber(points[points.length - 1].date) - first || 1
  const x = (date: string) => M.left + ((dayNumber(date) - first) / span) * PLOT_W
  const y = (adjustment: number) => M.top + PLOT_H - (Math.min(MAX, Math.abs(adjustment) * 100) / MAX) * PLOT_H

  // Step-after path: hold each value until the next point.
  const step = points
    .map((p, i) => (i === 0 ? `M${x(p.date)},${y(p.adjustment)}` : `H${x(p.date)} V${y(p.adjustment)}`))
    .join(' ')
  const area = `${step} V${y(0)} H${x(points[0].date)} Z`

  const last = points[points.length - 1]
  const firstChange = points.find((p) => p.adjustment !== 0)

  // Month ticks along the x axis.
  const months: string[] = []
  for (const p of points) {
    const m = p.date.slice(0, 7) + '-01'
    if (!months.includes(m) && dayNumber(m) >= first) months.push(m)
  }

  function onMove(e: MouseEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const px = M.left + ((e.clientX - box.left) / box.width) * PLOT_W
    let nearest = 0
    points.forEach((p, i) => {
      if (Math.abs(x(p.date) - px) < Math.abs(x(points[nearest].date) - px)) nearest = i
    })
    setHover(nearest)
  }

  const hovered = hover === null ? null : points[hover]

  return (
    <figure className="chart">
      <div className="chart-plot" ref={plotRef}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
          aria-label={`How much lighter week ${week} became as sessions were logged: from 0% on ${monthDay(points[0].date)} to ${pct(last.adjustment)} on ${monthDay(last.date)}.`}>
          {[0, 10, 20].map((v) => (
            <g key={v}>
              <line className={v === 0 ? 'baseline' : 'grid'} x1={M.left} x2={W - M.right} y1={y(v / 100)} y2={y(v / 100)} />
              <text className="axis-label" x={M.left - 8} y={y(v / 100)} dy="0.32em" textAnchor="end">{v}%</text>
            </g>
          ))}
          {months.map((m) => (
            <text key={m} className="axis-label" x={x(m)} y={H - 8} textAnchor="middle">
              {new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1).toLocaleDateString(undefined, { month: 'short' })}
            </text>
          ))}

          <path className="area" d={area} />
          <path className="line" d={step} />

          {firstChange && (
            <text className="direct-label" x={x(firstChange.date) + 6} y={y(firstChange.adjustment) - 10}>
              First adjustment
            </text>
          )}
          <circle className="dot" cx={x(last.date)} cy={y(last.adjustment)} r={5} />
          <text className="direct-label strong" x={x(last.date) + 10} y={y(last.adjustment)} dy="0.32em">
            {pct(last.adjustment)}
          </text>

          {hovered && (
            <>
              <line className="crosshair" x1={x(hovered.date)} x2={x(hovered.date)} y1={M.top} y2={y(0)} />
              <circle className="dot" cx={x(hovered.date)} cy={y(hovered.adjustment)} r={5} />
            </>
          )}
          <rect className="hit" x={M.left} y={M.top} width={PLOT_W} height={PLOT_H}
            onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>

        {hovered && hover !== null && (
          <div className="tooltip" style={{ left: `${(x(hovered.date) / W) * 100}%`, top: `${(y(hovered.adjustment) / H) * 100}%` }}>
            <strong>{monthDay(hovered.date)}</strong>
            <div className="tooltip-row">Week {week} <b>{hovered.adjustment === 0 ? 'textbook' : change(hovered.adjustment)}</b></div>
            <div className="tooltip-note">
              {hovered.sessions} week-{week} sessions logged · {Math.round(hovered.confidence * 100)}% confident
            </div>
          </div>
        )}
      </div>

      <details className="table-view">
        <summary>View as table</summary>
        <table>
          <thead><tr><th>Date</th><th>Week {week} sessions</th><th>Confidence</th><th>Adjustment</th></tr></thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}>
                <td>{monthDay(p.date)}</td>
                <td>{p.sessions}</td>
                <td>{Math.round(p.confidence * 100)}%</td>
                <td>{p.adjustment === 0 ? 'Textbook' : change(p.adjustment)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
