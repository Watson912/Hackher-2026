import { useEffect, useState } from 'react'
import { api, type Insights as InsightsData, type WeekPattern } from '../api.ts'
import { EnergyChart } from '../components/EnergyChart.tsx'
import { LearningTimeline } from '../components/LearningTimeline.tsx'
import { PlanCompare } from '../components/PlanCompare.tsx'
import { change, longDate } from '../format.ts'

function headlineText(w: WeekPattern): string {
  return w.energyDelta! < 0
    ? `Week ${w.week} hits you harder than the textbook says.`
    : `You're stronger in week ${w.week} than the textbook says.`
}

export function Insights() {
  const [data, setData] = useState<InsightsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<InsightsData>('/insights').then(setData, (e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="error">Couldn't load insights: {error}</p>
  if (!data) return <p className="muted">Loading…</p>

  const { headline, weeks, timeline, preview, nextAdjustedWeek, loggedSessions, learns, minSessions } = data

  if (!learns) {
    return (
      <section className="card">
        <h2>Consistent training, by design</h2>
        <p className="muted">
          On hormonal birth control there are no natural phases to learn from, so your plan stays steady week to week.
          Your energy and effort logs still show you how your training is going.
        </p>
      </section>
    )
  }

  if (!headline) {
    const ready = weeks.filter((w) => w.sessions >= minSessions)
    return (
      <>
        <section className="hero">
          <p className="eyebrow">What your body has shown so far</p>
          <h2>{ready.length === 0 ? 'Still learning your cycle' : 'So far, you match the textbook'}</h2>
          <p className="muted">
            {ready.length === 0
              ? `Once you've logged ${minSessions} sessions in a week of your cycle, that week starts shaping your plan. Every log counts.`
              : `Across ${loggedSessions} sessions, your weeks line up with the textbook, so your plan follows it. Keep logging and it will follow you.`}
          </p>
        </section>
        <section className="card">
          <h3>Progress by week of your cycle</h3>
          <ul className="week-progress">
            {weeks.map((w) => (
              <li key={w.week}>
                <span><b>Week {w.week}</b> <small className="muted">{w.shortLabel}</small></span>
                <div className="meter"><span style={{ width: `${Math.min(1, w.sessions / minSessions) * 100}%` }} /></div>
                <small className="muted">{Math.min(w.sessions, minSessions)}/{minSessions}</small>
              </li>
            ))}
          </ul>
        </section>
        {loggedSessions > 0 && (
          <section className="card">
            <h3>Your energy vs the textbook</h3>
            <p className="card-sub">Average energy (1–5) by week of your cycle</p>
            <EnergyChart weeks={weeks} highlight={null} />
          </section>
        )}
      </>
    )
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow">What your body showed</p>
        <h2>{headlineText(headline)}</h2>
        <p className="muted">
          Your energy in week {headline.week} ({headline.label.toLowerCase()}) averages{' '}
          <b>{headline.avgEnergy?.toFixed(1)}</b> out of 5. The textbook expects <b>{headline.textbookEnergy.toFixed(1)}</b>.
          {headline.effortDelta !== null && headline.effortDelta > 1 &&
            ` Sessions that week also felt ${headline.effortDelta.toFixed(1)} points harder than planned.`}
        </p>
      </section>

      <section className="card">
        <h3>Your energy vs the textbook</h3>
        <p className="card-sub">Average energy (1–5) by week of your cycle</p>
        <EnergyChart weeks={weeks} highlight={headline.week} />
      </section>

      {preview && nextAdjustedWeek && (
        <section className="card">
          <p className="eyebrow">What you changed</p>
          <h3>Week {nextAdjustedWeek.week} is now {change(headline.adjustment)}</h3>
          <p className="card-sub">Your next week {nextAdjustedWeek.week} starts {longDate(nextAdjustedWeek.start)}</p>
          <PlanCompare plan={preview} />
        </section>
      )}

      <section className="card">
        <p className="eyebrow">How you got here</p>
        <h3>From textbook to yours</h3>
        <p className="card-sub">How much your logs have adjusted week {headline.week}, one session at a time</p>
        <LearningTimeline points={timeline} week={headline.week} />
      </section>

      <p className="footnote muted">Based on {loggedSessions} logged sessions.</p>
    </>
  )
}
