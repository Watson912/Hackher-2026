import { useEffect, useState } from 'react'
import { api, type Insights as InsightsData, type WeekPattern } from '../api.ts'
import { InfoHeading } from '../components/InfoHeading.tsx'
import { PlanCompare } from '../components/PlanCompare.tsx'
import { WeekChart, type WeekChartRow } from '../components/WeekChart.tsx'
import { change, longDate } from '../format.ts'

// Insights: which week of her cycle feels hardest, compared with the
// default, and what that changed in her plan. One chart, kept short.

const one = (n: number) => n.toFixed(1)

const fatigueRows = (weeks: WeekPattern[]): WeekChartRow[] => weeks.map((w) => ({
  key: w.week, title: `Week ${w.week} · ${w.label}`, label: `Week ${w.week}`, sublabel: w.shortLabel,
  yours: w.avgFatigue, reference: w.textbookFatigue, sessions: w.sessions,
}))

function FatigueChart({ weeks, highlight }: { weeks: WeekPattern[]; highlight: number | null }) {
  return (
    <section className="card">
      <InfoHeading title="How tired you feel, by week" label="this chart">
        <p>Pink bars are your average tiredness (1 to 7) each week of your cycle. Gray lines are what's typical.</p>
      </InfoHeading>
      <WeekChart rows={fatigueRows(weeks)} max={7} ticks={[1, 2, 3, 4, 5, 6, 7]} highlight={highlight}
        yoursLabel="You" referenceLabel="Typical" format={one} unit="tiredness (1 to 7)"
        describe={(r) => (r.yours === null || r.reference === null ? null
          : `${r.yours > r.reference ? '+' : '−'}${one(Math.abs(r.yours - r.reference))}`)} />
    </section>
  )
}

export function Insights() {
  const [data, setData] = useState<InsightsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<InsightsData>('/insights').then(setData, (e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="error">Couldn't load insights: {error}</p>
  if (!data) return <p className="muted">Loading…</p>

  const { headline, weeks, preview, nextAdjustedWeek, loggedSessions, learns, minSessions, hardest } = data

  if (!learns) {
    return (
      <section className="card">
        <h2>Steady training</h2>
        <p className="muted">On hormonal birth control your plan stays consistent week to week.</p>
      </section>
    )
  }

  if (!headline) {
    return (
      <>
        <section className="hero">
          <p className="eyebrow">Your insights</p>
          <h2>{loggedSessions === 0 ? 'Log a few workouts to see your pattern' : 'So far, you match the typical pattern'}</h2>
          <p className="muted">Each week of your cycle starts shaping your plan after {minSessions} logged workouts.</p>
        </section>
        {loggedSessions > 0 && <FatigueChart weeks={weeks} highlight={null} />}
      </>
    )
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Your data suggests</p>
        <h2>
          {hardest.hers !== null && hardest.hers !== hardest.textbook
            ? `Week ${hardest.hers} is your hardest week, not week ${hardest.textbook}.`
            : `Week ${headline.week} feels different for you.`}
        </h2>
        <p className="muted">So your week {headline.week} is now {change(headline.adjustment)}.</p>
      </section>

      <FatigueChart weeks={weeks} highlight={headline.week} />

      {preview && nextAdjustedWeek && (
        <section className="card">
          <p className="eyebrow">What changed</p>
          <h3>Your next week {nextAdjustedWeek.week}, from {longDate(nextAdjustedWeek.start)}</h3>
          <PlanCompare plan={preview} />
        </section>
      )}

      <p className="footnote muted">Based on the {loggedSessions} workouts you've logged. An experiment of one, run on your own numbers.</p>
    </>
  )
}
