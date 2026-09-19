// The learning layer: compares her logged sessions against the textbook
// curve, per cycle week, and turns the gap into a plan adjustment.
// Only energy moves the plan; effort and completion are evidence for the UI.
import { cycleWeekOf } from './cycleEngine.ts';
import rules from './rules.json' with { type: 'json' };
import type { CycleWeek, Intensity, IsoDate } from './types.ts';

export type SessionStatus = 'PLANNED' | 'COMPLETED' | 'PARTIAL' | 'SKIPPED';

export interface LoggedSession {
  sessionDate: IsoDate;
  cycleDay: number | null;       // snapshotted when the session was planned
  status: SessionStatus;
  energy: number | null;         // 1-5
  effort: number | null;         // RPE 1-10
  plannedIntensity: Intensity;
}

export interface WeekPattern {
  week: CycleWeek;
  label: string;
  sessions: number;              // logged sessions with an energy score
  avgEnergy: number | null;
  textbookEnergy: number;
  energyDelta: number | null;    // avgEnergy - textbookEnergy
  effortDelta: number | null;    // avg(RPE - expected RPE for the planned intensity)
  completionPct: number | null;
  confidence: number;            // 0 below minSessions, full at fullConfidenceSessions
  adjustment: number;            // what the plan generator adds to the phase modifier
  reason: string | null;
}

export type LearnedPattern = Record<CycleWeek, WeekPattern>;

export const WEEKS: CycleWeek[] = [1, 2, 3, 4];

const round2 = (n: number) => Math.round(n * 100) / 100;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function describeAdjustment(p: Pick<WeekPattern, 'week' | 'avgEnergy' | 'textbookEnergy' | 'sessions' | 'adjustment'>): string | null {
  if (p.adjustment === 0 || p.avgEnergy === null) return null;
  const pct = Math.round(Math.abs(p.adjustment) * 100);
  const change = p.adjustment < 0 ? `made it ${pct}% lighter` : `added ${pct}% more intensity`;
  return `Your energy in week ${p.week} has averaged ${p.avgEnergy.toFixed(1)} vs the typical ` +
    `${p.textbookEnergy.toFixed(1)} across ${p.sessions} sessions, so we've ${change}.`;
}

/**
 * What the app has learned from every session logged on or before `asOf`.
 * `part1Confidence` is the cycle engine's confidence: an irregular cycle
 * means we're less sure which week a session really fell in.
 */
export function learnedPattern(sessions: LoggedSession[], asOf: IsoDate, part1Confidence = 1): LearnedPattern {
  const { threshold, slope, maxAdjustment, minSessions, fullConfidenceSessions } = rules.learning;
  const logged = sessions.filter((s) => s.status !== 'PLANNED' && s.cycleDay !== null && s.sessionDate <= asOf);

  const pattern = {} as LearnedPattern;
  for (const week of WEEKS) {
    const inWeek = logged.filter((s) => cycleWeekOf(s.cycleDay!) === week);
    const energies = inWeek.flatMap((s) => (s.energy === null ? [] : [s.energy]));
    const efforts = inWeek.flatMap((s) => (s.effort === null ? [] : [s.effort - rules.expectedEffort[s.plannedIntensity]]));
    const textbook = rules.textbook.weeks[String(week) as '1' | '2' | '3' | '4'];

    const avgEnergy = avg(energies);
    const energyDelta = avgEnergy === null ? null : avgEnergy - textbook.expectedEnergy;
    const n = energies.length;
    const confidence = n < minSessions ? 0 : Math.min(1, n / fullConfidenceSessions);

    let adjustment = 0;
    if (energyDelta !== null && Math.abs(energyDelta) >= threshold) {
      const raw = Math.max(-maxAdjustment, Math.min(maxAdjustment, slope * energyDelta));
      adjustment = round2(raw * confidence * part1Confidence) || 0; // || 0 turns -0 into 0
    }

    const effortDelta = avg(efforts);
    const entry: WeekPattern = {
      week,
      label: textbook.label,
      sessions: n,
      avgEnergy: avgEnergy === null ? null : round2(avgEnergy),
      textbookEnergy: textbook.expectedEnergy,
      energyDelta: energyDelta === null ? null : round2(energyDelta),
      effortDelta: effortDelta === null ? null : round2(effortDelta),
      completionPct: inWeek.length ? Math.round((100 * inWeek.filter((s) => s.status === 'COMPLETED').length) / inWeek.length) : null,
      confidence: round2(confidence),
      adjustment,
      reason: null,
    };
    entry.reason = describeAdjustment(entry);
    pattern[week] = entry;
  }
  return pattern;
}
