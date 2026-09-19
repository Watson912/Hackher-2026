// Part 2: the plan generator. Textbook layer (rules.json) plus personal
// layer (the learning adjustment for each cycle week). Every session keeps
// its textbook version so the UI can show "Textbook plan / Your plan".
import { addDays, computeCycle, dayInfo, daysBetween } from './cycleEngine.ts';
import { WEEKS, type LearnedPattern } from './learning.ts';
import rules from './rules.json' with { type: 'json' };
import type { CycleInput, CycleWeek, Intensity, IsoDate, Phase } from './types.ts';

export type Goal = 'STRENGTH' | 'MUSCLE_GAIN' | 'ENDURANCE' | 'FAT_LOSS' | 'GENERAL_FITNESS';
export type Slot = 'STRENGTH' | 'CARDIO' | 'MOBILITY';
export type SessionType = 'STRENGTH' | 'CARDIO_HIIT' | 'CARDIO_LISS' | 'MOBILITY' | 'SKILL' | 'REST';

export interface SessionSpec {
  sessionType: SessionType;
  intensity: Intensity;
  durationMin: number;
  focus: string;
}

export interface PlannedSession extends SessionSpec {
  date: IsoDate;
  cycleDay: number | null;
  phase: Phase;
  week: CycleWeek | null;
  slot: Slot;
  textbook: SessionSpec;          // what the plan would be with no learning
  adjustment: number;             // personal adjustment applied to this day
  adjusted: boolean;              // true when the session differs from textbook
}

export interface WeekPlan {
  weekStart: IsoDate;
  cycleDayAtStart: number | null;
  phase: Phase;                   // most common phase across the 7 days
  goal: Goal;
  daysPerWeek: number;
  textbookIntensityModifier: number;
  intensityModifier: number;      // final, after the personal layer
  personalAdjustment: number;     // intensityModifier - textbookIntensityModifier
  volumeModifier: number;
  nutritionNotes: string;
  adjustmentReason: string | null;
  confidence: number;             // the cycle engine's confidence
  sessions: PlannedSession[];
}

export interface PlanInput {
  cycle: CycleInput;              // cycle.today = the day the plan is generated
  weekStart: IsoDate;
  length?: number;                // days in the block, default 7 (see planBlocks)
  goal: Goal;
  daysPerWeek: number;
  pattern: LearnedPattern | null; // null = textbook only
}

type PhaseRule = { intensityModifier: number; volumeModifier: number; nutrition: string };

const round2 = (n: number) => Math.round(n * 100) / 100;
const roundTo5 = (n: number) => Math.max(15, Math.round(n / 5) * 5);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Late luteal (luteal days in week 4) gets its own deload rule. */
export function phaseRule(phase: Phase, week: CycleWeek | null): PhaseRule {
  if (phase === 'LUTEAL' && week === 4) return rules.phases.LUTEAL_LATE;
  return rules.phases[phase];
}

export function intensityFor(modifier: number): Intensity {
  if (modifier >= rules.intensityThresholds.HIGH) return 'HIGH';
  if (modifier >= rules.intensityThresholds.MODERATE) return 'MODERATE';
  return 'LOW';
}

function specFor(slot: Slot, intensityModifier: number, volumeModifier: number): SessionSpec {
  const intensity = slot === 'MOBILITY' ? 'LOW' : intensityFor(intensityModifier);
  const base = rules.sessions[slot][intensity];
  return {
    sessionType: base.type as SessionType,
    intensity,
    durationMin: roundTo5(base.minutes * volumeModifier),
    focus: base.focus,
  };
}

function mostCommon<T>(xs: T[]): T {
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function generateWeek(input: PlanInput): WeekPlan {
  const { cycle, weekStart, length = 7, goal, daysPerWeek, pattern } = input;
  const state = computeCycle(cycle);

  // Learning only applies when there are natural phases to learn from.
  const learns = pattern !== null && state.phase !== 'SUPPRESSED' && state.phase !== 'UNKNOWN';

  const noCycle: Phase = cycle.suppressed ? 'SUPPRESSED' : 'UNKNOWN';
  const days = Array.from({ length }, (_, i) => {
    const date = addDays(weekStart, i);
    const info = dayInfo(cycle, date);
    return {
      date,
      cycleDay: info?.day ?? null,
      phase: (info?.phase ?? noCycle) as Phase,
      week: info?.week ?? null,
    };
  });

  const offsets = rules.trainingDays[String(Math.min(7, Math.max(1, daysPerWeek))) as '1'];
  const template = rules.goalTemplates[goal] as Slot[];

  const sessions: PlannedSession[] = offsets.filter((offset) => offset < length).map((offset, n) => {
    const day = days[offset];
    const slot = template[n % template.length];
    const rule = phaseRule(day.phase, day.week);
    const adjustment = learns && day.week ? pattern![day.week].adjustment : 0;

    const textbook = specFor(slot, rule.intensityModifier, rule.volumeModifier);
    const personal = specFor(slot, rule.intensityModifier + adjustment, rule.volumeModifier + adjustment);
    return {
      ...personal,
      date: day.date,
      cycleDay: day.cycleDay,
      phase: day.phase,
      week: day.week,
      slot,
      textbook,
      adjustment,
      adjusted: personal.intensity !== textbook.intensity || personal.durationMin !== textbook.durationMin,
    };
  });

  const rulesByDay = sessions.map((s) => phaseRule(s.phase, s.week));
  const textbookIntensity = round2(mean(rulesByDay.map((r) => r.intensityModifier)));
  const finalIntensity = round2(mean(rulesByDay.map((r, i) => r.intensityModifier + sessions[i].adjustment)));
  const finalVolume = round2(mean(rulesByDay.map((r, i) => r.volumeModifier + sessions[i].adjustment)));

  const weekPhase = mostCommon(days.map((d) => d.phase));
  const weekOfPhase = days.find((d) => d.phase === weekPhase)?.week ?? null;

  // One reason per learned cycle week this block actually changed.
  const touchedWeeks = WEEKS.filter((w) => sessions.some((s) => s.week === w && s.adjustment !== 0));
  const reasons = learns ? touchedWeeks.map((w) => pattern![w].reason).filter((r): r is string => r !== null) : [];

  return {
    weekStart,
    cycleDayAtStart: days[0].cycleDay,
    phase: weekPhase,
    goal,
    daysPerWeek: offsets.length,
    textbookIntensityModifier: textbookIntensity,
    intensityModifier: finalIntensity,
    personalAdjustment: round2(finalIntensity - textbookIntensity),
    volumeModifier: finalVolume,
    nutritionNotes: phaseRule(weekPhase, weekOfPhase).nutrition,
    adjustmentReason: reasons.length ? reasons.join(' ') : null,
    confidence: state.confidence,
    sessions,
  };
}

export interface PlanBlock {
  start: IsoDate;
  length: number;
}

/**
 * The plan blocks covering [from, to], aligned to cycle weeks (days 1-7,
 * 8-14, 15-21, 22-end) so every screen agrees on which days are trained.
 * The last block runs to the end of the cycle, so a 29-day cycle gets an
 * 8-day week 4. Without a period date, blocks are plain 7-day weeks.
 */
export function planBlocks(cycle: CycleInput, from: IsoDate, to: IsoDate): PlanBlock[] {
  const blocks: PlanBlock[] = [];
  let date = from;
  while (daysBetween(date, to) >= 0) {
    const info = dayInfo(cycle, date);
    let block: PlanBlock;
    if (!info || info.day > cycle.cycleLength) {
      block = { start: date, length: 7 };
    } else {
      const firstDay = (info.week - 1) * 7 + 1;
      const lastDay = info.week === 4 ? cycle.cycleLength : Math.min(firstDay + 6, cycle.cycleLength);
      block = { start: addDays(date, firstDay - info.day), length: lastDay - firstDay + 1 };
    }
    blocks.push(block);
    date = addDays(block.start, block.length);
  }
  return blocks;
}
