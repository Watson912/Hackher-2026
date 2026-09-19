// Dates arrive as 'YYYY-MM-DD'. Parse as local dates so labels never shift a day.
function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const weekday = (date: string) => parse(date).toLocaleDateString(undefined, { weekday: 'short' })
export const monthDay = (date: string) => parse(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
export const longDate = (date: string) =>
  parse(date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })

export const pct = (adjustment: number) => `${Math.round(Math.abs(adjustment) * 100)}%`
export const titleCase = (s: string | null | undefined) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '')

/** "20% lighter" or "10% harder", for a learning adjustment. */
export const change = (adjustment: number) => `${pct(adjustment)} ${adjustment < 0 ? 'lighter' : 'harder'}`
