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
      <div className="landing-glow" aria-hidden="true" />
      <p className="brand"><span className="brand-mark" aria-hidden="true" />HealthHer</p>
      <h1>Training that follows your cycle, and your data.</h1>
      <p className="lede">
        Fitness plans were built around men's physiology. HealthHer starts from your cycle, then learns what works
        for <em>you</em>.
      </p>

      <div className="landing-actions">
        <button className="btn btn-primary btn-big" onClick={onStart} disabled={loading}>Get started</button>
        <button className="btn btn-secondary btn-big" onClick={seeDemo} disabled={loading}>
          {loading ? 'Loading demo…' : 'See the demo'}
        </button>
      </div>
      {error && <p className="error">Couldn't load the demo: {error}</p>}
    </div>
  )
}
