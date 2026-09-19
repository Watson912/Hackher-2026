import { useEffect, useState } from 'react'
import { Insights } from './pages/Insights.tsx'
import { Today } from './pages/Today.tsx'

const TABS = { today: 'Today', insights: 'Insights' } as const
type Tab = keyof typeof TABS

// The tab lives in the URL hash so a refresh keeps you on the same screen.
const tabFromHash = (): Tab => (location.hash.slice(1) in TABS ? (location.hash.slice(1) as Tab) : 'today')

function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash)

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <>
      <header className="topbar">
        <span className="brand">HealthHer</span>
        <nav className="tabs">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <a key={t} href={`#${t}`} className={tab === t ? 'active' : ''} aria-current={tab === t ? 'page' : undefined}>
              {TABS[t]}
            </a>
          ))}
        </nav>
      </header>
      <main>{tab === 'today' ? <Today /> : <Insights />}</main>
    </>
  )
}

export default App
