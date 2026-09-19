import { useLayoutEffect, useRef, useState } from 'react'

/** Tracks an element's rendered width so SVG charts can draw at true pixel size. */
export function useWidth<T extends HTMLElement>(fallback = 440) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}
