import { useEffect, useState, type ReactNode } from 'react'
import { Cycle } from './pages/Cycle.tsx'
import { Insights } from './pages/Insights.tsx'
import { Landing } from './pages/Landing.tsx'
import { Onboarding } from './pages/Onboarding.tsx'
import { Plan } from './pages/Plan.tsx'
import { Settings } from './pages/Settings.tsx'
import { Today } from './pages/Today.tsx'
import { loadCurrentUser, saveCurrentUser, type CurrentUser } from './session.ts'

const TABS = { today: 'Today', plan: 'Plan', cycle: 'Cycle', insights: 'Insights' } as const
type Tab = keyof typeof TABS | 'settings'

// The tab lives in the URL hash so a refresh keeps you on the same screen.
const tabFromHash = (): Tab => {
  const hash = location.hash.slice(1)
  return hash in TABS || hash === 'settings' ? (hash as Tab) : 'today'
}

// 24px line icons for the tab bar and header.
const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)
const ICONS: Record<keyof typeof TABS | 'settings' | 'switch', ReactNode> = {
  today: icon(<><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" /></>),
  plan: icon(<><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>),
  cycle: icon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5A8.5 8.5 0 0 1 20.5 12H12Z" /></>),
  insights: icon(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>),
  settings: icon(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>),
  switch: icon(<><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></>),
}

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
          <span className="brand"><span className="brand-mark" aria-hidden="true" />HealthHer</span>
          <span className="user-chip">
            <span className="avatar" aria-hidden="true">{user.firstName.charAt(0).toUpperCase()}</span>
            <span className="user-name">{user.firstName}</span>
            {user.isDemo && <span className="demo-tag">demo</span>}
            <a href="#settings" className={`icon-btn${tab === 'settings' ? ' active' : ''}`} aria-label="Settings" title="Settings">
              {ICONS.settings}
            </a>
            <button type="button" className="icon-btn" onClick={switchUser} aria-label="Switch user" title="Switch user">
              {ICONS.switch}
            </button>
          </span>
        </div>
      </header>
      {/* key: remount pages when the user changes so nothing stale shows */}
      <main key={user.userId} className="app-main">
        {tab === 'today' && <Today />}
        {tab === 'plan' && <Plan />}
        {tab === 'cycle' && <Cycle />}
        {tab === 'insights' && <Insights />}
        {tab === 'settings' && <Settings onDone={() => { location.hash = 'today' }} />}
      </main>
      <nav className="tabbar" aria-label="Sections">
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map((t) => (
          <a key={t} href={`#${t}`} className={tab === t ? 'active' : ''} aria-current={tab === t ? 'page' : undefined}>
            {ICONS[t]}
            <span>{TABS[t]}</span>
          </a>
        ))}
      </nav>
    </>
  )
}

export default App
