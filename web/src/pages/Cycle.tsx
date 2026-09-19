import { useEffect, useState } from 'react'
import { api, type Wheel } from '../api.ts'
import { CycleWheel } from '../components/CycleWheel.tsx'

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
        <h2>{data.cycle.cycleLength}-day cycle, mapped</h2>
        <p className="muted">
          Training load for every day of this cycle.{' '}
          {adjustedDays > 0
            ? `Your bars differ from the textbook ticks on ${adjustedDays} days: that's where your own logs changed the plan.`
            : 'Right now your plan follows the textbook. It will shift as your logs reveal your pattern.'}
        </p>
      </section>
      <section className="card">
        <CycleWheel cycle={data.cycle} days={data.days} />
      </section>
    </>
  )
}
