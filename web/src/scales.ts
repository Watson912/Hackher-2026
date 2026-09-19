// The two validated scales the app asks for (SPEC.md). Both always show
// their anchors: a bare number picker without anchors isn't RPE.

// Borg CR-10 anchors, as the spec lists them.
export const CR10_ANCHORS: Record<number, string> = { 0: 'Nothing at all', 2: 'Easy', 5: 'Hard', 7: 'Very hard', 10: 'Maximal' }

/** A CR-10 rating in words: its anchor, or the two anchors it sits between. */
export function cr10Words(rpe: number) {
  if (CR10_ANCHORS[rpe]) return CR10_ANCHORS[rpe]
  const below = [7, 5, 2, 0].find((a) => a < rpe)!
  const above = [2, 5, 7, 10].find((a) => a > rpe)!
  return `between ${CR10_ANCHORS[below].toLowerCase()} and ${CR10_ANCHORS[above].toLowerCase()}`
}

// Hooper Index items are rated 1-7, from "very, very low" to "very, very high".
export const HOOPER_LABELS = ['Very, very low', 'Very low', 'Low', 'Average', 'High', 'Very high', 'Very, very high']
