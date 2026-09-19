import { useEffect, useState } from 'react'
import { Cycle } from './pages/Cycle.tsx'
import { Insights } from './pages/Insights.tsx'
import { Landing } from './pages/Landing.tsx'
import { Onboarding } from './pages/Onboarding.tsx'
import { Today } from './pages/Today.tsx'
import { loadCurrentUser, saveCurrentUser, type CurrentUser } from './session.ts'

const TABS = { today: 'Today', cycle: 'Cycle', insights: 'Insights' } as const
type Tab = keyof typeof TABS

// The tab lives in the URL hash so a refresh keeps you on the same screen.
const tabFromHash = (): Tab => (location.hash.slice(1) in TABS ? (location.hash.slice(1) as Tab) : 'today')

function App() {
  const [user, setUser] = useState<CurrentUser | null>(loadCurrentUser)
  const [onboarding, setOnboarding] = useState(false)
  const [tab, setTab] = useState<Tab>(tabFromHash)

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  function signIn(next: CurrentUser) {
    saveCurrentUser(next)
    setUser(next)
    setOnboarding(false)
    location.hash = 'today'
  }

  function switchUser() {
    saveCurrentUser(null)
    setUser(null)
    history.replaceState(null, '', location.pathname)
  }

  if (!user) {
    return (
      <main className="narrow">
        {onboarding
          ? <Onboarding onDone={signIn} onCancel={() => setOnboarding(false)} />
          : <Landing onStart={() => setOnboarding(true)} onSignedIn={signIn} />}
      </main>
    )
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-row">
          <span className="brand">HealthHer</span>
          <span className="user-chip">
            {user.firstName}{user.isDemo && <span className="demo-tag">demo</span>}
            <button type="button" className="link" onClick={switchUser}>Switch</button>
          </span>
        </div>
        <nav className="tabs">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <a key={t} href={`#${t}`} className={tab === t ? 'active' : ''} aria-current={tab === t ? 'page' : undefined}>
              {TABS[t]}
            </a>
          ))}
        </nav>
      </header>
      {/* key: remount pages when the user changes so nothing stale shows */}
      <main key={user.userId}>
        {tab === 'today' && <Today />}
        {tab === 'cycle' && <Cycle />}
        {tab === 'insights' && <Insights />}
      </main>
    </>
  )
}

export default App
