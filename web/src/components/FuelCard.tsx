import type { Nutrition } from '../api.ts'
import { InfoHeading } from './InfoHeading.tsx'

const kcal = (n: number) => n.toLocaleString()

// Today's fuel: a calorie range and a protein target. A range, never a
// single number, and no deficit or weight-loss framing.
export function FuelCard({ nutrition }: { nutrition: Nutrition | undefined }) {
  if (!nutrition?.calories && nutrition?.proteinG == null) return null
  const { calories, proteinG } = nutrition

  return (
    <section className="card fuel-card">
      <InfoHeading title={<span className="eyebrow">Fuel today</span>} label="your fuel range">
        <p>From your height, weight, age and training days. Aim to land in the range.</p>
      </InfoHeading>
      <div className="stat-tiles">
        {calories && (
          <div className="stat-tile">
            <b>{kcal(calories.min)}–{kcal(calories.max)}</b>
            <small>kcal</small>
          </div>
        )}
        {proteinG !== null && (
          <div className="stat-tile">
            <b>{proteinG} g</b>
            <small>protein</small>
          </div>
        )}
      </div>
    </section>
  )
}
