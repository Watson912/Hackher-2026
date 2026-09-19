import { useAuth0 } from '@auth0/auth0-react'
import { useState } from 'react'
import { resetDemo } from '../api.ts'
import type { CurrentUser } from '../session.ts'

export function Landing({ onStart, onSignedIn }: { onStart: () => void; onSignedIn: (user: CurrentUser) => void }) {
  // Auth0 knows who she is; the HealthHer account she trains under is still
  // created by onboarding below.
  const { isAuthenticated, user: account, loginWithRedirect, logout } = useAuth0()
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

      {/* Both paths below call an API that now requires a verified token, so
          signing in comes first rather than failing with a 401. */}
      <div className="landing-actions">
        {isAuthenticated ? (
          <>
            <button className="btn btn-primary btn-big" onClick={onStart} disabled={loading}>Get started</button>
            <button className="btn btn-secondary btn-big" onClick={seeDemo} disabled={loading}>
              {loading ? 'Loading demo…' : 'See the demo'}
            </button>
          </>
        ) : (
          <button className="btn btn-primary btn-big" onClick={() => loginWithRedirect()}>
            Log in or sign up
          </button>
        )}
      </div>
      {isAuthenticated && (
        <p className="muted">
          Signed in as {account?.email ?? account?.name}.{' '}
          <button type="button" className="link" onClick={() => logout({ logoutParams: { returnTo: location.origin } })}>
            Log out
          </button>
        </p>
      )}
      {error && <p className="error">Couldn't load the demo: {error}</p>}
    </div>
  )
}
