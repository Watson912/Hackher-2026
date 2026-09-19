# HealthHer — Build Plan

## Mission

Fitness advice was built on male physiology, so women follow plans that ignore
the single biggest variable in how their body performs week to week. We're
building a training app that adapts to the menstrual cycle instead of pretending
it doesn't exist, and that **learns her actual pattern rather than assuming the
textbook one**.

## The core loop (what the demo has to prove)

```
 textbook rules ──► plan ──► she trains ──► she logs (energy, effort, done?)
        ▲                                              │
        └──── personal adjustment ◄── learned pattern ◄┘
```

Every part below exists to serve this loop. Other apps say they adapt to the
cycle. What sets us apart is that **her logs change her next plan**, and the app
can show what it learned and what it changed because of it.

**The demo moment:** "The textbook says you stay strong through week 3. Your
last two cycles say you crash right after ovulation, from day 17. So next
week we start your deload early." Then show the plan before and after. Maya
is on day 12, so this is her upcoming week.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | React + TypeScript (Vite). Replaces the current `frontend/` HTML/JS. |
| API | Node + Express + TypeScript, using `mysql2` to talk to the database |
| Database | MySQL 8, managed in DBeaver. The schema and seed in `database/` stay as they are. |
| Core logic | Pure TypeScript modules in the API with no framework and no DB calls: `cycleEngine.ts`, `planGenerator.ts`, `learning.ts`, and `rules.json`. Unit-tested with Vitest using hardcoded dates. |

The Spring backend in `backend/` is retired. Using TypeScript end to end means
one language, and the plan and learning types are shared between the API and
the UI.

**API surface (small on purpose):**
- `GET  /api/today`: Part 1's output plus today's session (`v_today_session`)
- `GET  /api/wheel`: the day map plus load (`v_cycle_wheel`), with the textbook load for the ghost ring
- `GET  /api/insights`: `learnedPattern()` plus the plan history (the ramp)
- `POST /api/sessions/:id/log`: the three-tap log; returns the feedback line
- `POST /api/onboarding`: writes `cycle_profiles` and generates the first plan
- `POST /api/plans/generate`: next week's plan (textbook plus personal layer)

## Shared definitions (fix these before building anything)

- **Cycle week.** `week = min(4, ceil(cycle_day / 7))`, the same bucketing as
  the `v_cycle_week_performance` view (days 29+ count as week 4). Learning and
  insights both group by cycle week, so "week 3" means the same thing on every
  screen.
- **Textbook pattern.** It is defined once, in the Part 2 rules JSON, as the
  expected energy (1–5) and intensity modifier for each cycle week. Part 7
  compares against those numbers, and the seed data is shaped against them.
  They must match the values in `database/README.md`
  (week 1: 3.0, week 2: 4.5, week 3: 4.0, week 4: 2.5). Energy is lowest on
  her period, peaks around ovulation, holds up through week 3, then dips.
- **Expected effort per planned intensity.** LOW → RPE 4, MODERATE → RPE 6,
  HIGH → RPE 8.

---

## Part 1: Cycle engine

Takes her last period start date and average cycle length. Outputs today's
phase, today's **cycle week**, and a day-by-day map of the whole cycle. Pure
logic: no UI and no database. Everything else depends on it, so it gets built
first and tested with hardcoded dates.

- **Birth control (`cycle_suppressed`):** returns phase `SUPPRESSED`, and the
  plan stays flat from week to week.
- **Irregular cycles:** wider phase bands and a lower `confidence`.
- **Learns her cycle length.** When there are at least 2 completed cycles in
  `cycles`, use her real average length instead of the number she entered at
  onboarding. This is the first, quiet piece of learning: the wheel stretches
  to fit her actual cycle.

**Output:** `{ phase, cycle_day, cycle_week, cycle_length_used, confidence, days: [...] }`

## Part 2: Plan generator (textbook layer + personal layer)

Takes the phase, cycle week, goal, days per week and the learned adjustments.
Produces the weekly training plan and the nutrition notes for that phase.

1. **Textbook layer.** A deterministic rules table in JSON keyed by
   phase/cycle week × goal. It gives the base intensity and volume modifiers,
   the session types and the expected energy. There is no LLM call, so it
   still works if the API is down during the demo.
2. **Personal layer.** Applies the adjustment for the current week (from the
   learning layer below) on top of the textbook modifier:
   `final_intensity = textbook_intensity + adjustment`.
   The generator then re-buckets sessions into LOW/MODERATE/HIGH, so a large
   enough shift visibly changes a session's intensity, not just a number.
3. **Say why.** Every plan carries `textbook_intensity`, `personal_adjustment`
   and a one-line `adjustment_reason`, for example: "Your energy in week 3 has
   averaged 2.9 vs the typical 4.0 across 10 sessions, so we've made this week
   20% lighter." The personal plan is only half of what we need to show; the
   difference from the textbook plan is the other half.

An LLM can later rewrite `adjustment_reason` in friendlier language, if there's
time. The numbers stay rule-based.

## Learning layer (new)

A single function that both Part 2 and Part 7 call:

```
learnedPattern(userId, asOfDate) -> {
  week: 1..4 -> {
    sessions,           // logged sessions in this bucket before asOfDate
    avg_energy,         // her average
    textbook_energy,    // from the rules JSON
    energy_delta,       // avg_energy - textbook_energy
    effort_delta,       // avg(RPE - expected RPE for planned intensity)
    completion_pct,
    confidence,         // min(1, sessions / 6); 0 below 3 sessions
    adjustment          // what Part 2 applies
  }
}
```

**Adjustment rule** (simple on purpose, so it's easy to explain to judges):

```
if |energy_delta| < 0.5:  adjustment = 0          // normal variation, stay textbook
else:                     adjustment = clamp(0.2 * energy_delta, -0.20, +0.20)
                                       * confidence * part1_confidence
```

Only energy moves the plan. Effort and completion are shown on the insights
screen as supporting evidence ("and your effort ran 2 points harder than
planned") but don't feed the formula. The seed data rates even easy sessions
as hard, so an effort term would dial down every low-energy week and blur the
one real difference.

- Below 3 logged sessions in a week bucket there is no adjustment, and she gets
  the textbook plan. That's the honest cold start.
- Confidence ramps up to full at 6 sessions per bucket, so the app is visibly
  more sure the more she logs.
- `asOfDate` matters. It lets us replay what the app knew at any point, which
  powers the learning timeline in Part 7 and keeps the seed data consistent.
- Suppressed (birth control) users: bucket by cycle week of the pill pack if
  known, or skip personal learning for v1.

**With the current seed data:** week 3 energy delta is −1.10, which gives
−0.20 (the full cap): week 3 is 20% lighter. Every other week is within ±0.25
of textbook, under the threshold, so it stays exactly textbook.

## Part 3: Data layer

Stores the user profile, cycle history, generated plans and session logs (four
tables, already built in `database/`), plus the seed data.

**Changes for the learning loop (as built):**
- No schema change. A generated plan's textbook modifier, personal adjustment
  and reason go in the existing `plan_json` column (the full `WeekPlan`), with
  `intensity_modifier` holding the final value.
- **The learning ramp is calculated, not seeded.** `/api/insights` replays
  `learnedPattern(asOf)` weekly over her logs: no adjustment through cycle 1,
  −0.17 once cycle 1's week 3 is logged, −0.2 from cycle 2 on. The seeded
  plans stay textbook, which is honest: the app was still learning then.
- The seed pattern must clearly **differ** from the textbook. It does: she
  crashes in week 3 (2.90 vs 4.0) and tracks textbook everywhere else. Keep it
  that way, because a seed user who matches the textbook kills the story.
- Optional: seed her completed cycles at around 31 days while onboarding says
  28, so Part 1's cycle-length learning shows up too.

## Part 4: Onboarding flow

Three or four screens: cycle info, goal, training days and birth control
status. Ends with the first plan generated. It's the first thing a judge sees,
so it needs to feel fast and not like a medical intake form.

- **Set up the learning promise here.** The last screen says something like:
  "We'll start with what research says about your cycle, then learn how *your*
  body actually responds. Most people see their plan personalize within 2
  cycles."

## Part 5: Cycle wheel (the hero visual)

A circular view of the cycle with training load mapped around it, today marked
and phases color coded. This is the screenshot for the pitch, so it gets a
dedicated polish pass (see build order).

- **Two rings:** a faint ghost ring for the textbook load and a solid ring for
  *her* plan. Where they diverge is the learning, visible at a glance. This is
  the strongest single image for the pitch.

## Part 6: Today view and session logging

Shows what she's doing today, then after the session a quick log of how it felt
(energy, effort, completed or not). Three taps maximum. This feeds the learning
layer.

- **Close the loop in the UI.** After she logs, show one line of feedback, for
  example: "Logged. That's 12 sessions in week 2, and your plan is 92% tuned to
  you." She should feel that logging does something.
- If today's session was adjusted, the card shows the reason:
  "Lighter than usual: your week 1 energy runs low."

## Part 7: Insights, "what we learned and what we changed"

After enough logged sessions, show her personal pattern next to the textbook
pattern, then show **the action taken because of it**.

1. **The pattern:** her energy curve vs the textbook curve by cycle week.
   "Your energy crashes right after ovulation, a week earlier than typical."
2. **The change:** "So we start your deload at day 17 instead of day 22, and
   lighten week 3 by 20%." Include a Textbook plan / Your plan toggle.
3. **The learning timeline:** the adjustment for each plan across her history
   (from `training_plans`). It's flat in cycle 1, ramping in cycle 2 and fully
   personal now. It proves the app learned over time instead of just showing
   a chart.
4. **Confidence:** "Based on 43 sessions across 3 cycles."

It needs the seed data for the demo.

---

## Build order (solo)

One person builds everything, so the order follows the demo path: get the
learning story working end to end before polishing anything. Each step leaves
something that could be demoed if time ran out right there.

**Must have: the learning story works**

0. ✅ **Scaffold.** Set up the Vite React TS app and the Express TS API, connect
   the API to MySQL, and check that one endpoint returns Maya's data.
1. ✅ **Shared definitions + rules JSON.** Fix the textbook numbers first.
2. ✅ **Part 1 cycle engine**, with a handful of hardcoded-date tests.
3. ✅ **Part 2 textbook layer.**
4. ✅ **Learning layer**, tested against the seed logs (expect week 1 to be
   dialed down).
5. ✅ **Part 2 personal layer.** Plans now carry textbook, adjustment and reason.
6. ✅ **Part 3:** no schema change needed (see Part 3). Endpoints are live:
   `/api/today`, `/api/insights`, `/api/plans/preview`.
7. **Part 7 insights**, including the pattern chart and "what we changed".
   This is the payoff screen, so it comes before anything else visual.

**Should have: the demo flows**

8. **Part 6 today view + three-tap logging** with the feedback line.
9. **Part 5 cycle wheel**, a basic version first: phases, today and load.
10. **Part 4 onboarding.**

**Nice to have: polish, in this order**

11. Wheel polish, including the textbook ghost ring. This is the pitch
    screenshot.
12. The learning timeline in Part 7.
13. Cycle-length learning in Part 1.
14. LLM-written `adjustment_reason`.

**Cut first if short on time:** the LLM layer, the learning timeline,
cycle-length learning, and birth-control learning. Keep the suppressed-phase
*plan* (flat plan), but skip learning for it.

## Demo script (about 90 seconds)

1. Onboarding: four quick taps ending in "we'll learn you".
2. Switch to Maya (the seed user). The wheel shows the textbook ghost ring vs
   her real ring.
3. Insights: "You crash a week earlier than the textbook", plus what we
   changed and the learning timeline.
4. Today: log a session in three taps and see "your plan is 92% tuned to you."
