import { useState } from 'react'
import { resetDemo } from '../api.ts'
import type { CurrentUser } from '../session.ts'

export function Landing({ onStart, onSignedIn }: { onStart: () => void; onSignedIn: (user: CurrentUser) => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function seeDemo() {
    setLoading(true)
    setError(null)
    try {
      onSignedIn(await resetDemo())
    } catch (e) {
      setError((e as Error).message)
      setLoading(false)
    }
  }

  return (
    <div className="landing">
      <p className="eyebrow">HealthHer</p>
      <h1>Training that learns your cycle.</h1>
      <p className="lede">
        Fitness plans were built around men's physiology. HealthHer adapts your training to your cycle, then learns
        how <em>your</em> body actually responds instead of assuming the textbook.
      </p>

      <div className="landing-actions">
        <button className="btn btn-primary" onClick={onStart} disabled={loading}>Get started</button>
        <button className="btn btn-secondary" onClick={seeDemo} disabled={loading}>
          {loading ? 'Loading demo…' : 'See the demo'}
        </button>
      </div>
      <p className="muted small">
        The demo opens Maya's account: two full cycles of logged training, so you can see what the app has learned.
      </p>
      {error && <p className="error">Couldn't load the demo: {error}</p>}
    </div>
  )
}
