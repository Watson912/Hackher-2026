import { useEffect, useId, useState, type ReactNode } from 'react'

// A heading with an ⓘ button beside it. Tapping the button opens a short,
// plain-language explanation right under the heading (inline, so it works
// on a phone and never gets clipped). Tap again, the close button or Escape
// closes it.
export function InfoHeading({
  level = 3,
  title,
  label,
  children,
}: {
  level?: 2 | 3
  title: ReactNode
  label: string // what the explanation is about, for screen readers
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const Heading = level === 2 ? 'h2' : 'h3'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <div className="info-heading">
        <Heading>{title}</Heading>
        <button
          type="button"
          className={`info-btn${open ? ' open' : ''}`}
          aria-label={open ? `Hide explanation of ${label}` : `Explain ${label}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
        >
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="10" cy="6.2" r="1.1" fill="currentColor" />
            <path d="M10 9v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {open && (
        <div id={panelId} className="info-panel" role="note">
          <div className="info-body">{children}</div>
          <button type="button" className="info-close" onClick={() => setOpen(false)}>Got it</button>
        </div>
      )}
    </>
  )
}
