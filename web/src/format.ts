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
const PHASE_LABELS: Record<string, string> = {
  MENSTRUAL: 'Menstrual',
  FOLLICULAR: 'Follicular',
  OVULATORY: 'Ovulatory',
  EARLY_LUTEAL: 'Early Luteal',
  LATE_LUTEAL: 'Late Luteal',
  SUPPRESSED: 'Steady',
  UNKNOWN: 'Unknown',
}

/** Display name for a phase, matching the labels in phaseRules.json. */
export const phaseLabel = (phase: string | null | undefined) => (phase ? PHASE_LABELS[phase] ?? phase : '')

export const titleCase = (s: string | null | undefined) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '')

/** "20% lighter" or "10% harder", for a learning adjustment. */
export const change = (adjustment: number) => `${pct(adjustment)} ${adjustment < 0 ? 'lighter' : 'harder'}`
