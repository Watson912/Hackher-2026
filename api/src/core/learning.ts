// The learning layer: compares her logged sessions against the default
// pattern, per cycle week, and turns the gap into a plan adjustment.
//
// She logs two validated instruments per session (SPEC.md): session RPE on
// the Borg CR-10 scale, and the fatigue item of the Hooper Index (1-7).
// Session load is RPE x minutes (Foster's session-RPE method).
//
// Only fatigue moves the plan. It's rated independently of what was
// prescribed, so dialing a week down doesn't erase the evidence that moved
// it. Session RPE against the plan, and session load, are shown as a check.
import { cycleWeekOf } from './cycleEngine.ts';
import rules from './rules.json' with { type: 'json' };
import type { CycleWeek, Intensity, IsoDate, Phase } from './types.ts';

export type SessionStatus = 'PLANNED' | 'COMPLETED' | 'PARTIAL' | 'SKIPPED';

export interface LoggedSession {
  sessionDate: IsoDate;
  cycleDay: number | null;       // snapshotted when the session was planned
  phase?: Phase;                 // snapshotted too
  status: SessionStatus;
  fatigue: number | null;        // Hooper Index fatigue item, 1-7
  rpe: number | null;            // session RPE, Borg CR-10 0-10
  durationMin: number | null;    // what she actually did
  plannedDurationMin: number | null;
  plannedIntensity: Intensity;
}

export interface WeekPattern {
  week: CycleWeek;
  label: string;
  shortLabel: string;            // for chart axes
  sessions: number;              // logged sessions with a fatigue rating
  avgFatigue: number | null;
  textbookFatigue: number;
  fatigueDelta: number | null;   // avgFatigue - textbookFatigue (positive = more tired than expected)
  rpeDelta: number | null;       // avg(session RPE - planned RPE for that intensity)
  avgLoad: number | null;        // her session load, RPE x min, per session
  plannedLoad: number | null;    // planned RPE x planned min, for the same sessions
  completionPct: number | null;
  confidence: number;            // 0 below minSessions, full at fullConfidenceSessions
  adjustment: number;            // what the plan generator applies to this week
  reason: string | null;
}

export type LearnedPattern = Record<CycleWeek, WeekPattern>;

export const WEEKS: CycleWeek[] = [1, 2, 3, 4];

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Foster's session load: session RPE x minutes, in arbitrary units. */
export const sessionLoad = (rpe: number | null, minutes: number | null) =>
  rpe === null || minutes === null ? null : rpe * minutes;

/** What the plan meant the session to feel like: planned RPE x planned minutes. */
export const plannedLoad = (s: Pick<LoggedSession, 'plannedIntensity' | 'plannedDurationMin'>) =>
  s.plannedDurationMin === null ? null : rules.expectedEffort[s.plannedIntensity] * s.plannedDurationMin;

export function describeAdjustment(p: Pick<WeekPattern, 'week' | 'avgFatigue' | 'textbookFatigue' | 'sessions' | 'adjustment'>): string | null {
  if (p.adjustment === 0 || p.avgFatigue === null) return null;
  const pct = Math.round(Math.abs(p.adjustment) * 100);
  const change = p.adjustment < 0 ? `made it ${pct}% lighter` : `earned ${pct}% more intensity`;
  return `Your fatigue in week ${p.week} has averaged ${p.avgFatigue.toFixed(1)} out of 7 vs the ` +
    `${p.textbookFatigue.toFixed(1)} the default expects, across ${p.sessions} sessions, so you've ${change}.`;
}

const logged = (sessions: LoggedSession[], asOf: IsoDate) =>
  sessions.filter((s) => s.status !== 'PLANNED' && s.sessionDate <= asOf);

/**
 * What the app has learned from every session logged on or before `asOf`.
 * `part1Confidence` is the cycle engine's confidence: an irregular cycle
 * means we're less sure which week a session really fell in.
 */
export function learnedPattern(sessions: LoggedSession[], asOf: IsoDate, part1Confidence = 1): LearnedPattern {
  const { threshold, slope, maxAdjustment, minSessions, fullConfidenceSessions } = rules.learning;
  const done = logged(sessions, asOf).filter((s) => s.cycleDay !== null);

  const pattern = {} as LearnedPattern;
  for (const week of WEEKS) {
    const inWeek = done.filter((s) => cycleWeekOf(s.cycleDay!) === week);
    const fatigues = inWeek.flatMap((s) => (s.fatigue === null ? [] : [s.fatigue]));
    const rpeDeltas = inWeek.flatMap((s) => (s.rpe === null ? [] : [s.rpe - rules.expectedEffort[s.plannedIntensity]]));
    const loads = inWeek.flatMap((s) => {
      const load = sessionLoad(s.rpe, s.durationMin);
      const planned = plannedLoad(s);
      return load === null || planned === null ? [] : [{ load, planned }];
    });
    const textbook = rules.textbook.weeks[String(week) as '1' | '2' | '3' | '4'];

    const avgFatigue = avg(fatigues);
    const fatigueDelta = avgFatigue === null ? null : avgFatigue - textbook.expectedFatigue;
    const n = fatigues.length;
    const confidence = n < minSessions ? 0 : Math.min(1, n / fullConfidenceSessions);

    // More tired than the default expects = lighter; fresher = heavier.
    let adjustment = 0;
    if (fatigueDelta !== null && Math.abs(fatigueDelta) >= threshold) {
      const raw = Math.max(-maxAdjustment, Math.min(maxAdjustment, -slope * fatigueDelta));
      adjustment = round2(raw * confidence * part1Confidence) || 0; // || 0 turns -0 into 0
    }

    const rpeDelta = avg(rpeDeltas);
    const avgLoad = avg(loads.map((l) => l.load));
    const avgPlanned = avg(loads.map((l) => l.planned));
    const entry: WeekPattern = {
      week,
      label: textbook.label,
      shortLabel: textbook.shortLabel,
      sessions: n,
      avgFatigue: avgFatigue === null ? null : round2(avgFatigue),
      textbookFatigue: textbook.expectedFatigue,
      fatigueDelta: fatigueDelta === null ? null : round2(fatigueDelta),
      rpeDelta: rpeDelta === null ? null : round2(rpeDelta),
      avgLoad: avgLoad === null ? null : Math.round(avgLoad),
      plannedLoad: avgPlanned === null ? null : Math.round(avgPlanned),
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

/**
 * The week that feels hardest, hers vs the default's (SPEC.md, Insights):
 * hers is the week with the highest average fatigue among weeks with enough
 * sessions to trust, the default's is the week the textbook expects to be
 * most fatiguing (the late luteal deload week).
 */
export function hardestWeeks(pattern: LearnedPattern): { hers: CycleWeek | null; textbook: CycleWeek } {
  const trusted = WEEKS.map((w) => pattern[w]).filter((w) => w.sessions >= rules.learning.minSessions && w.avgFatigue !== null);
  const hers = [...trusted].sort((a, b) => b.avgFatigue! - a.avgFatigue! || a.week - b.week)[0]?.week ?? null;
  const textbook = [...WEEKS].sort((a, b) => pattern[b].textbookFatigue - pattern[a].textbookFatigue)[0];
  return { hers, textbook };
}

export interface PhaseSummary {
  phase: Phase;
  sessions: number;
  avgFatigue: number | null;
  avgRpe: number | null;
  avgLoad: number | null;
  plannedLoad: number | null;
}

/** Session load and fatigue by cycle phase (the phase each session was planned in). */
export function byPhase(sessions: LoggedSession[], asOf: IsoDate, phases: Phase[]): PhaseSummary[] {
  const done = logged(sessions, asOf);
  return phases.map((phase) => {
    const inPhase = done.filter((s) => s.phase === phase);
    const fatigues = inPhase.flatMap((s) => (s.fatigue === null ? [] : [s.fatigue]));
    const rpes = inPhase.flatMap((s) => (s.rpe === null ? [] : [s.rpe]));
    const loads = inPhase.flatMap((s) => {
      const load = sessionLoad(s.rpe, s.durationMin);
      const planned = plannedLoad(s);
      return load === null || planned === null ? [] : [{ load, planned }];
    });
    const f = avg(fatigues);
    const r = avg(rpes);
    const l = avg(loads.map((x) => x.load));
    const p = avg(loads.map((x) => x.planned));
    return {
      phase,
      sessions: inPhase.length,
      avgFatigue: f === null ? null : round1(f),
      avgRpe: r === null ? null : round1(r),
      avgLoad: l === null ? null : Math.round(l),
      plannedLoad: p === null ? null : Math.round(p),
    };
  });
}
