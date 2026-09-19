import { useState, type ReactNode } from 'react'
import { onboard, type BirthControl, type Goal, type OnboardingAnswers } from '../api.ts'
import type { CurrentUser } from '../session.ts'

const GOALS: { value: Goal; label: string; hint: string }[] = [
  { value: 'STRENGTH', label: 'Get stronger', hint: 'Lift heavier' },
  { value: 'MUSCLE_GAIN', label: 'Build muscle', hint: 'Size and shape' },
  { value: 'ENDURANCE', label: 'Endurance', hint: 'Run, ride, go longer' },
  { value: 'FAT_LOSS', label: 'Lose fat', hint: 'Lean out' },
  { value: 'GENERAL_FITNESS', label: 'Feel fit', hint: 'A bit of everything' },
]

const BIRTH_CONTROL: { value: BirthControl; label: string }[] = [
  { value: 'NONE', label: 'None' },
  { value: 'COMBINED_PILL', label: 'The pill' },
  { value: 'MINI_PILL', label: 'Mini pill' },
  { value: 'HORMONAL_IUD', label: 'Hormonal IUD' },
  { value: 'COPPER_IUD', label: 'Copper IUD' },
  { value: 'IMPLANT', label: 'Implant' },
  { value: 'INJECTION', label: 'Injection' },
  { value: 'RING', label: 'Ring or patch' },
]
const HORMONAL = (bc: BirthControl) => bc !== 'NONE' && bc !== 'COPPER_IUD'

function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const TODAY = localIso(new Date())
const daysAgo = (n: number) => localIso(new Date(Date.now() - n * 86_400_000))

type Draft = Omit<OnboardingAnswers, 'goal' | 'birthControl'> & { goal: Goal | null; birthControl: BirthControl | null }

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`choice${selected ? ' selected' : ''}`} aria-pressed={selected} onClick={onClick}>
      {children}
    </button>
  )
}

export function Onboarding({ onDone, onCancel }: { onDone: (user: CurrentUser) => void; onCancel: () => void }) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [a, setA] = useState<Draft>({
    firstName: '',
    goal: null,
    daysPerWeek: 4,
    birthControl: null,
    lastPeriodStart: null,
    cycleLength: 28,
    regularity: 'REGULAR',
  })
  const set = (patch: Partial<Draft>) => setA((prev) => ({ ...prev, ...patch }))
  const hormonal = a.birthControl !== null && HORMONAL(a.birthControl)

  const steps = [
    {
      title: 'Let\'s get to know you',
      valid: a.firstName.trim() !== '' && a.goal !== null,
      body: (
        <>
          <label className="field">
            <span>What should we call you?</span>
            <input autoFocus value={a.firstName} maxLength={50} placeholder="First name"
              onChange={(e) => set({ firstName: e.target.value })} />
          </label>
          <div className="field">
            <span>What's your main goal?</span>
            <div className="choices two-col">
              {GOALS.map((g) => (
                <Choice key={g.value} selected={a.goal === g.value} onClick={() => set({ goal: g.value })}>
                  <b>{g.label}</b><small>{g.hint}</small>
                </Choice>
              ))}
            </div>
          </div>
        </>
      ),
    },
    {
      title: 'Are you on birth control?',
      subtitle: 'Hormonal birth control smooths out your natural phases, so we train you consistently instead.',
      valid: a.birthControl !== null,
      body: (
        <div className="choices two-col">
          {BIRTH_CONTROL.map((b) => (
            <Choice key={b.value} selected={a.birthControl === b.value} onClick={() => set({ birthControl: b.value })}>
              <b>{b.label}</b>
            </Choice>
          ))}
        </div>
      ),
    },
    {
      title: 'Tell us about your cycle',
      subtitle: hormonal ? 'Optional on hormonal birth control. Skip it if you don\'t get a regular bleed.' : undefined,
      valid: hormonal || a.lastPeriodStart !== null,
      body: (
        <>
          <div className="field">
            <span>When did your last period start?</span>
            <div className="choices chips">
              {[['Today', 0], ['Yesterday', 1], ['A week ago', 7], ['Two weeks ago', 14]].map(([label, n]) => (
                <Choice key={label} selected={a.lastPeriodStart === daysAgo(n as number)}
                  onClick={() => set({ lastPeriodStart: daysAgo(n as number) })}>
                  {label}
                </Choice>
              ))}
            </div>
            <input type="date" max={TODAY} min={daysAgo(120)} value={a.lastPeriodStart ?? ''}
              onChange={(e) => set({ lastPeriodStart: e.target.value || null })} />
          </div>
          <div className="field">
            <span>How long is your cycle, usually?</span>
            <div className="stepper">
              <button type="button" aria-label="Shorter" disabled={a.cycleLength === null || a.cycleLength <= 21}
                onClick={() => setA((p) => ({ ...p, cycleLength: Math.max(21, (p.cycleLength ?? 28) - 1) }))}>−</button>
              <output>{a.cycleLength === null ? 'Not sure' : `${a.cycleLength} days`}</output>
              <button type="button" aria-label="Longer" disabled={a.cycleLength === null || a.cycleLength >= 45}
                onClick={() => setA((p) => ({ ...p, cycleLength: Math.min(45, (p.cycleLength ?? 28) + 1) }))}>+</button>
            </div>
            <label className="check">
              <input type="checkbox" checked={a.cycleLength === null}
                onChange={(e) => set({ cycleLength: e.target.checked ? null : 28 })} />
              I'm not sure. Start with 28 and learn it from my periods.
            </label>
          </div>
          {a.cycleLength !== null && (
            <div className="field">
              <span>Is it regular?</span>
              <div className="choices chips">
                <Choice selected={a.regularity === 'REGULAR'} onClick={() => set({ regularity: 'REGULAR' })}>Pretty regular</Choice>
                <Choice selected={a.regularity === 'IRREGULAR'} onClick={() => set({ regularity: 'IRREGULAR' })}>It varies</Choice>
              </div>
            </div>
          )}
        </>
      ),
    },
    {
      title: 'How many days a week can you train?',
      subtitle: 'We\'ll place your hardest sessions where your cycle supports them.',
      valid: true,
      body: (
        <div className="choices days">
          {[2, 3, 4, 5, 6].map((n) => (
            <Choice key={n} selected={a.daysPerWeek === n} onClick={() => set({ daysPerWeek: n })}>
              <b>{n}</b><small>days</small>
            </Choice>
          ))}
        </div>
      ),
    },
  ]

  const current = steps[step]
  const last = step === steps.length - 1

  async function finish() {
    setSaving(true)
    setError(null)
    try {
      onDone(await onboard({
        ...a,
        firstName: a.firstName.trim(),
        goal: a.goal!,
        birthControl: a.birthControl!,
        lastPeriodStart: a.lastPeriodStart,
        regularity: a.cycleLength === null ? 'UNKNOWN' : a.regularity,
      }))
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="onboarding">
      <div className="progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
        {steps.map((_, i) => <span key={i} className={i <= step ? 'done' : ''} />)}
      </div>

      <div className="step">
        <h2>{current.title}</h2>
        {current.subtitle && <p className="muted">{current.subtitle}</p>}
        {current.body}
      </div>

      {last && (
        <p className="promise">
          We'll start with what research says about your cycle, then learn how <em>your</em> body actually responds.
          Most people see their plan personalize within two cycles.
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <div className="step-actions">
        <button type="button" className="btn btn-ghost" disabled={saving}
          onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}>
          Back
        </button>
        <button type="button" className="btn btn-primary" disabled={!current.valid || saving}
          onClick={() => (last ? finish() : setStep(step + 1))}>
          {last ? (saving ? 'Building your plan…' : 'Build my plan') : 'Continue'}
        </button>
      </div>
    </div>
  )
}
