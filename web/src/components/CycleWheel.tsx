import { useState } from 'react'
import type { CycleState, Phase, WheelDay } from '../api.ts'
import { monthDay, phaseLabel, titleCase } from '../format.ts'
import { useWidth } from '../useWidth.ts'

// The cycle as a clock: day 1 at the top, running clockwise. Inner ring is
// the phase; radial bars are her training load, with a gray tick where the
// textbook plan would put it.
const PHASES: Phase[] = ['MENSTRUAL', 'FOLLICULAR', 'OVULATORY', 'EARLY_LUTEAL', 'LATE_LUTEAL']
const MAX_SIZE = 420
const GAP_DEG = 0.8 // surface gap between phase segments, in degrees

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

/** Annular sector from angle a0 to a1 (degrees, clockwise from 3 o'clock). */
function sector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const large = a1 - a0 > 180 ? 1 : 0
  const [x0, y0] = polar(cx, cy, r1, a0)
  const [x1, y1] = polar(cx, cy, r1, a1)
  const [x2, y2] = polar(cx, cy, r0, a1)
  const [x3, y3] = polar(cx, cy, r0, a0)
  return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, r, a0)
  const [x1, y1] = polar(cx, cy, r, a1)
  return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`
}

/** Runs of consecutive days in the same phase. */
function phaseRuns(days: WheelDay[]) {
  const runs: { phase: Phase; from: number; to: number }[] = []
  for (const d of days) {
    const last = runs[runs.length - 1]
    if (last && last.phase === d.phase) last.to = d.day
    else runs.push({ phase: d.phase, from: d.day, to: d.day })
  }
  return runs
}

export function CycleWheel({ cycle, days }: { cycle: CycleState; days: WheelDay[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const [ref, width] = useWidth<HTMLDivElement>(MAX_SIZE)
  const size = Math.min(width, MAX_SIZE)
  const c = size / 2
  const R = c - 30                 // outer edge of the load bars
  const rPhase0 = R * 0.5
  const rPhase1 = R * 0.6
  const rBar0 = R * 0.66
  const barLen = R - rBar0

  const n = days.length
  const step = 360 / n
  const start = (i: number) => -90 + i * step
  const mid = (i: number) => start(i) + step / 2
  const barHalf = step * 0.32
  const loadR = (load: number) => rBar0 + (barLen * load) / 100

  const hovered = hover === null ? null : days[hover]
  const todayIndex = days.findIndex((d) => d.isToday)

  return (
    <figure className="chart wheel">
      <div className="legend wrap" aria-hidden="true">
        {PHASES.map((p) => <span key={p}><i className={`key key-phase phase-${p.toLowerCase()}`} /> {phaseLabel(p)}</span>)}
        <span><i className="key key-bar" /> Your load</span>
        <span><i className="key key-tick" /> Textbook</span>
      </div>

      <div className="chart-plot wheel-plot" ref={ref}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
          aria-label={`Cycle wheel: day ${cycle.cycleDay} of ${n}, ${phaseLabel(cycle.phase)}. Training load for each day compared with the textbook; see the table below for details.`}>
          {/* phase ring, with a surface gap between phases */}
          {phaseRuns(days).map((run) => (
            <path key={run.from} className={`phase-arc phase-${run.phase.toLowerCase()}`}
              d={sector(c, c, rPhase0, rPhase1, start(run.from - 1) + GAP_DEG, start(run.to) - GAP_DEG)} />
          ))}
          {/* phase labels, outside the ring on each phase's midpoint */}
          {phaseRuns(days).map((run) => {
            const [x, y] = polar(c, c, R + 10, (start(run.from - 1) + start(run.to)) / 2)
            return (
              <text key={`l${run.from}`} className="axis-label strong" x={x} y={y} dy="0.32em"
                textAnchor={x < c - 4 ? 'end' : x > c + 4 ? 'start' : 'middle'}>
                {phaseLabel(run.phase)}
              </text>
            )
          })}

          {/* baseline circle for the bars */}
          <circle className="grid" cx={c} cy={c} r={rBar0} fill="none" />

          {days.map((d, i) => (
            <g key={d.day} className={hover !== null && hover !== i ? 'dim' : undefined}>
              {d.load > 0 && (
                <path className="bar" d={sector(c, c, rBar0, loadR(d.load), mid(i) - barHalf, mid(i) + barHalf)} />
              )}
              {d.textbookLoad > 0 && (
                <path className="tick" fill="none"
                  d={arc(c, c, loadR(d.textbookLoad), mid(i) - barHalf - 1.5, mid(i) + barHalf + 1.5)} />
              )}
            </g>
          ))}

          {/* day numbers at the start of each cycle week */}
          {days.filter((d) => (d.day - 1) % 7 === 0).map((d) => {
            const [x, y] = polar(c, c, rPhase0 - 10, mid(d.day - 1))
            return <text key={d.day} className="axis-label" x={x} y={y} dy="0.32em" textAnchor="middle">{d.day}</text>
          })}

          {/* today */}
          {todayIndex >= 0 && (() => {
            // A short spoke just outside the bars, so it never covers today's bar.
            const [x0, y0] = polar(c, c, R + 2, mid(todayIndex))
            const [x1, y1] = polar(c, c, R + 12, mid(todayIndex))
            const [dx, dy] = polar(c, c, R + 12, mid(todayIndex))
            return (
              <g className="today-marker">
                <line x1={x0} y1={y0} x2={x1} y2={y1} />
                <circle cx={dx} cy={dy} r={5} />
              </g>
            )
          })()}

          {/* centre */}
          <text className="wheel-day" x={c} y={c - 10} textAnchor="middle">
            {cycle.cycleDay !== null ? `Day ${cycle.cycleDay}` : '—'}
          </text>
          <text className="wheel-phase" x={c} y={c + 14} textAnchor="middle">{phaseLabel(cycle.phase)}</text>
          {cycle.nextPeriodDate && (
            <text className="axis-label" x={c} y={c + 34} textAnchor="middle">Next period {monthDay(cycle.nextPeriodDate)}</text>
          )}

          {/* hit targets: one full slice per day */}
          {days.map((d, i) => (
            <path key={`h${d.day}`} className="hit" d={sector(c, c, rPhase0, R, start(i), start(i + 1))}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          ))}
        </svg>

        {hovered && hover !== null && (() => {
          const [x, y] = polar(c, c, R, mid(hover))
          return (
            <div className="tooltip" style={{ left: x, top: y }}>
              <strong>Day {hovered.day} · {monthDay(hovered.date)}</strong>
              <div className="tooltip-note">{phaseLabel(hovered.phase)}, week {hovered.week}{hovered.isToday ? ' · today' : ''}</div>
              <div className="tooltip-row"><i className="key key-bar" /> You
                <b>{hovered.yours ? `${titleCase(hovered.yours.intensity)}, ${hovered.yours.durationMin} min` : 'Rest'}</b></div>
              <div className="tooltip-row"><i className="key key-tick" /> Textbook
                <b>{hovered.textbook ? `${titleCase(hovered.textbook.intensity)}, ${hovered.textbook.durationMin} min` : 'Rest'}</b></div>
            </div>
          )
        })()}
      </div>

      <details className="table-view">
        <summary>View as table</summary>
        <table>
          <thead><tr><th>Day</th><th>Phase</th><th>Your plan</th><th>Textbook</th></tr></thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day}>
                <td>{d.day}{d.isToday ? ' (today)' : ''}</td>
                <td>{phaseLabel(d.phase)}</td>
                <td>{d.yours ? `${d.yours.focus}, ${d.yours.intensity.toLowerCase()}, ${d.yours.durationMin} min` : 'Rest'}</td>
                <td>{d.textbook ? `${d.textbook.intensity.toLowerCase()}, ${d.textbook.durationMin} min` : 'Rest'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
