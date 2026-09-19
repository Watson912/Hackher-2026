import { useEffect, useState } from 'react'
import { api, type Wheel } from '../api.ts'
import { CycleWheel } from '../components/CycleWheel.tsx'
import { InfoHeading } from '../components/InfoHeading.tsx'

export function Cycle() {
  const [data, setData] = useState<Wheel | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Wheel>('/wheel').then(setData, (e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="error">Couldn't load your cycle: {error}</p>
  if (!data) return <p className="muted">Loading…</p>

  if (data.days.length === 0) {
    return (
      <section className="card">
        <h2>{data.cycle.phase === 'SUPPRESSED' ? 'No natural phases to map' : 'Add your period date'}</h2>
        <p className="muted">
          {data.cycle.phase === 'SUPPRESSED'
            ? 'Hormonal birth control keeps your hormones steady, so your plan stays consistent week to week instead of following a cycle.'
            : 'Log when your last period started to map your whole cycle here.'}
        </p>
      </section>
    )
  }

  const adjustedDays = data.days.filter((d) => d.load !== d.textbookLoad).length

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Your cycle</p>
        <h2>Your {data.cycle.cycleLength}-day cycle</h2>
        <p className="muted">How hard each day of your cycle trains.</p>
      </section>
      <section className="card">
        <InfoHeading title="How to read the wheel" label="the cycle wheel">
          <p>Day 1 is at the top. Longer pink bars are harder days. Gray ticks are the standard plan{adjustedDays > 0 ? ', so gaps show where your logs changed it' : ''}.</p>
        </InfoHeading>
        <CycleWheel cycle={data.cycle} days={data.days} />
      </section>
    </>
  )
}
