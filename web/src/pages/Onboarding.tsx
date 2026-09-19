import { useEffect, useState, type ReactNode } from 'react'
import {
  api, onboard, WEEKDAYS, type BirthControl, type Consistency, type EquipmentOptions, type EquipmentTier, type Experience, type Goal,
} from '../api.ts'
import type { CurrentUser } from '../session.ts'

// Onboarding, one question per screen: a header with back and skip, a big
// question, tappable rows, and Next pinned to the bottom. Body stats share a
// screen so they read as ordinary stats (SPEC.md). It ends by building her
// first plan.

// ---- icons (24px, stroke) ---------------------------------------------------

const Icon = ({ children }: { children: ReactNode }) => (
  <svg className="ob-icon" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const ICONS: Record<Goal, ReactNode> = {
  STRENGTH: <Icon><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" /></Icon>,
  MUSCLE_GAIN: <Icon><circle cx="12" cy="12" r="9" /><path d="m8 13.5 4-4 4 4" /></Icon>,
  ENDURANCE: <Icon><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M10 2h4" /></Icon>,
  FAT_LOSS: <Icon><circle cx="12" cy="12" r="9" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /></Icon>,
  GENERAL_FITNESS: <Icon><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></Icon>,
}

// ---- answers ------------------------------------------------------------------

const GOALS: { value: Goal; label: string; hint: string }[] = [
  { value: 'STRENGTH', label: 'Lift heavier', hint: 'Get stronger on the big lifts' },
  { value: 'MUSCLE_GAIN', label: 'Build muscle', hint: 'More training volume' },
  { value: 'ENDURANCE', label: 'Build endurance', hint: 'Run, ride, go longer' },
  { value: 'FAT_LOSS', label: 'Conditioning', hint: 'Strength plus cardio' },
  { value: 'GENERAL_FITNESS', label: 'Feel fit overall', hint: 'A bit of everything' },
]

const EXPERIENCE: { value: Experience; label: string }[] = [
  { value: 'NEW', label: 'I am brand new to strength training' },
  { value: 'UNDER_1', label: 'Less than 1 year' },
  { value: '1_2', label: '1-2 years' },
  { value: '2_4', label: '2-4 years' },
  { value: '4_PLUS', label: '4+ years' },
]

const CONSISTENCY: { value: Consistency; label: string }[] = [
  { value: 'NEVER', label: "I've never had a consistent routine" },
  { value: 'RETURNING', label: "I'm returning from a break" },
  { value: 'STRUGGLING', label: 'I struggle with consistency' },
  { value: 'CONSISTENT', label: 'I strength train consistently' },
]

const TIERS: { value: EquipmentTier; label: string; hint: string }[] = [
  { value: 'FULL_GYM', label: 'A full gym', hint: 'Barbells, machines, cables' },
  { value: 'DUMBBELLS_HOME', label: 'Dumbbells at home', hint: 'Dumbbells, a bench, a mat' },
  { value: 'BODYWEIGHT', label: 'Bodyweight only', hint: 'No equipment needed' },
]

const BIRTH_CONTROL: { value: BirthControl; label: string }[] = [
  { value: 'NONE', label: 'None' },
  { value: 'COMBINED_PILL', label: 'The pill' },
  { value: 'MINI_PILL', label: 'Mini pill' },
  { value: 'HORMONAL_IUD', label: 'Hormonal IUD' },
  { value: 'COPPER_IUD', label: 'Copper IUD (non-hormonal)' },
  { value: 'IMPLANT', label: 'Implant' },
  { value: 'INJECTION', label: 'Injection' },
  { value: 'RING', label: 'Ring or patch' },
]
const HORMONAL = (bc: BirthControl) => bc !== 'NONE' && bc !== 'COPPER_IUD'

// The equipment checklist, grouped like a gym floor. Anything the library
// adds later lands in "Other".
const EQUIPMENT_GROUPS: { title: string; items: string[] }[] = [
  { title: 'Small weights', items: ['dumbbell', 'kettlebell', 'plate'] },
  { title: 'Bars & racks', items: ['barbell', 'trap_bar', 'squat_rack', 'pull_up_bar', 'dip_bars'] },
  { title: 'Benches & boxes', items: ['bench', 'adjustable_bench', 'hip_thrust_pad', 'nordic_bench', 'plyo_box'] },
  { title: 'Cable machines', items: ['cable_machine', 'rope_attachment'] },
  { title: 'Machines', items: ['leg_press_machine', 'hack_squat_machine', 'leg_curl_machine', 'leg_extension_machine', 'calf_machine',
    'seated_calf_machine', 'glute_machine', 'chest_press_machine', 'pec_deck_machine', 'shoulder_press_machine', 'row_machine', 'assist_machine'] },
  { title: 'Cardio', items: ['treadmill', 'stationary_bike', 'rowing_machine', 'stair_machine', 'track'] },
  { title: 'Floor', items: ['mat', 'ab_wheel'] },
]
const EQUIPMENT_NAMES: Record<string, string> = {
  dumbbell: 'Dumbbells', kettlebell: 'Kettlebells', plate: 'Weight plates', barbell: 'Barbell', trap_bar: 'Trap bar',
  squat_rack: 'Squat rack', pull_up_bar: 'Pull-up bar', dip_bars: 'Dip bars', bench: 'Flat bench', adjustable_bench: 'Adjustable bench',
  hip_thrust_pad: 'Hip thrust pad', nordic_bench: 'Nordic curl bench', plyo_box: 'Plyo box', cable_machine: 'Cable machine',
  rope_attachment: 'Rope attachment', leg_press_machine: 'Leg press', hack_squat_machine: 'Hack squat',
  leg_curl_machine: 'Leg curl', leg_extension_machine: 'Leg extension', calf_machine: 'Standing calf raise',
  seated_calf_machine: 'Seated calf raise', glute_machine: 'Glute machine', chest_press_machine: 'Chest press',
  pec_deck_machine: 'Pec deck', shoulder_press_machine: 'Shoulder press machine', row_machine: 'Seated row machine',
  assist_machine: 'Assisted pull-up / dip machine', treadmill: 'Treadmill', stationary_bike: 'Stationary bike',
  rowing_machine: 'Rowing machine', stair_machine: 'Stair climber', track: 'Running track or route', mat: 'Exercise mat',
  ab_wheel: 'Ab wheel',
}
const equipmentName = (id: string) => EQUIPMENT_NAMES[id] ?? id.replace(/_/g, ' ')

function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const TODAY = localIso(new Date())
const daysAgo = (n: number) => localIso(new Date(Date.now() - n * 86_400_000))

const inRange = (text: string, min: number, max: number) => {
  const n = Number(text)
  return text.trim() !== '' && Number.isFinite(n) && n >= min && n <= max
}
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

interface Draft {
  firstName: string
  goal: Goal | null
  experience: Experience | null
  consistency: Consistency | null
  heightCm: string
  weightKg: string
  age: string
  goalWeightKg: string
  equipmentTier: EquipmentTier | null
  equipment: string[] | null      // null = the tier's preset
  weekdays: number[]
  birthControl: BirthControl | null
  lastPeriodStart: string | null
  cycleLength: number | null
  regularity: 'REGULAR' | 'IRREGULAR'
}

// ---- building blocks ---------------------------------------------------------

function Row({ selected, onClick, icon, children, multi = false }: {
  selected: boolean; onClick: () => void; icon?: ReactNode; children: ReactNode; multi?: boolean
}) {
  return (
    <button type="button" role={multi ? 'checkbox' : 'radio'} aria-checked={selected}
      className={`ob-row${selected ? ' selected' : ''}`} onClick={onClick}>
      {icon}
      <span className="ob-row-text">{children}</span>
      <span className={multi ? 'ob-check' : 'ob-radio'} aria-hidden="true">
        {multi && selected && <svg viewBox="0 0 24 24" width="18" height="18"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
    </button>
  )
}

function NumberField({ label, unit, value, onChange, min, max, hint, autoFocus }: {
  label: string; unit: string; value: string; onChange: (v: string) => void; min: number; max: number; hint?: string; autoFocus?: boolean
}) {
  const invalid = value.trim() !== '' && !inRange(value, min, max)
  return (
    <label className="ob-field">
      <span>{label}</span>
      <span className="ob-input-unit">
        <input type="number" inputMode="decimal" min={min} max={max} value={value} aria-invalid={invalid} autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)} />
        <span>{unit}</span>
      </span>
      {invalid && <small className="ob-error">Enter a number from {min} to {max}.</small>}
      {hint && !invalid && <small className="ob-hint">{hint}</small>}
    </label>
  )
}

function EquipmentChecklist({ options, ticked, onChange }: {
  options: EquipmentOptions; ticked: string[]; onChange: (next: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const known = new Set(EQUIPMENT_GROUPS.flatMap((g) => g.items))
  const groups = [...EQUIPMENT_GROUPS, { title: 'Other', items: options.items.filter((i) => !known.has(i)) }]
    .map((g) => ({ ...g, items: g.items.filter((i) => options.items.includes(i)) }))
    .map((g) => ({ ...g, items: g.items.filter((i) => equipmentName(i).toLowerCase().includes(query.trim().toLowerCase())) }))
    .filter((g) => g.items.length)
  const toggle = (item: string) => onChange(ticked.includes(item) ? ticked.filter((i) => i !== item) : [...ticked, item])

  return (
    <div className="ob-equipment">
      <label className="ob-search">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m20 20-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        <input type="search" placeholder="Search for equipment" value={query} onChange={(e) => setQuery(e.target.value)}
          aria-label="Search for equipment" />
      </label>
      {groups.map((g) => {
        const all = g.items.every((i) => ticked.includes(i))
        return (
          <section key={g.title} className="ob-group">
            <div className="ob-group-head">
              <h3>{g.title}</h3>
              <button type="button" className="ob-link"
                onClick={() => onChange(all ? ticked.filter((i) => !g.items.includes(i)) : [...new Set([...ticked, ...g.items])])}>
                {all ? 'Clear' : 'Select all'}
              </button>
            </div>
            {g.items.map((item) => (
              <Row key={item} multi selected={ticked.includes(item)} onClick={() => toggle(item)}>
                <b>{equipmentName(item)}</b>
                <small>Used in {options.counts[item]} exercise{options.counts[item] === 1 ? '' : 's'}</small>
              </Row>
            ))}
          </section>
        )
      })}
      {groups.length === 0 && <p className="ob-hint">Nothing matches "{query}".</p>}
    </div>
  )
}

// ---- the flow -------------------------------------------------------------------

interface Step {
  header: string
  question: string
  subtitle?: string
  valid: boolean
  skip?: () => void            // present when the screen can be skipped
  body: ReactNode
}

export function Onboarding({ onDone, onCancel }: { onDone: (user: CurrentUser) => void; onCancel: () => void }) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [options, setOptions] = useState<EquipmentOptions | null>(null)
  const [a, setA] = useState<Draft>({
    firstName: '', goal: null, experience: null, consistency: null,
    heightCm: '', weightKg: '', age: '', goalWeightKg: '',
    equipmentTier: null, equipment: null, weekdays: [],
    birthControl: null, lastPeriodStart: null, cycleLength: 28, regularity: 'REGULAR',
  })
  const set = (patch: Partial<Draft>) => setA((prev) => ({ ...prev, ...patch }))
  const hormonal = a.birthControl !== null && HORMONAL(a.birthControl)

  // Each new screen starts at the top.
  useEffect(() => { document.querySelector('.ob')?.scrollTo(0, 0) }, [step])

  useEffect(() => {
    api<EquipmentOptions>('/equipment').then(setOptions, () => setOptions(null))
  }, [])

  const preset = (tier: EquipmentTier | null) => (options && tier ? options.presets[tier] : [])
  const ticked = a.equipment ?? preset(a.equipmentTier)
  const next = () => setStep((s) => s + 1)
  // Picking a single answer moves on by itself, like the reference design.
  const choose = (patch: Partial<Draft>) => { set(patch); window.setTimeout(next, 180) }

  const steps: Step[] = [
    {
      header: 'About you',
      question: 'What should we call you?',
      valid: a.firstName.trim() !== '',
      body: (
        <label className="ob-field">
          <span className="sr-only">First name</span>
          <input className="ob-text" autoFocus value={a.firstName} maxLength={50} placeholder="First name"
            onChange={(e) => set({ firstName: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && a.firstName.trim() && next()} />
        </label>
      ),
    },
    {
      header: 'Fitness goal',
      question: 'What is your top fitness goal?',
      valid: a.goal !== null,
      skip: () => { set({ goal: 'GENERAL_FITNESS' }); next() },
      body: (
        <div role="radiogroup" aria-label="Top fitness goal">
          {GOALS.map((g) => (
            <Row key={g.value} selected={a.goal === g.value} icon={ICONS[g.value]} onClick={() => choose({ goal: g.value })}>
              <b>{g.label}</b><small>{g.hint}</small>
            </Row>
          ))}
        </div>
      ),
    },
    {
      header: 'Fitness experience',
      question: 'How much strength training experience do you have?',
      valid: a.experience !== null,
      skip: () => { set({ experience: 'NEW' }); next() },
      body: (
        <div role="radiogroup" aria-label="Strength training experience">
          {EXPERIENCE.map((x) => (
            <Row key={x.value} selected={a.experience === x.value} onClick={() => choose({ experience: x.value })}>
              <b>{x.label}</b>
            </Row>
          ))}
        </div>
      ),
    },
    {
      header: 'Fitness habit',
      question: 'How consistent are you with strength training?',
      valid: a.consistency !== null,
      skip: () => { set({ consistency: null }); next() },
      body: (
        <div role="radiogroup" aria-label="Consistency">
          {CONSISTENCY.map((x) => (
            <Row key={x.value} selected={a.consistency === x.value} onClick={() => choose({ consistency: x.value })}>
              <b>{x.label}</b>
            </Row>
          ))}
        </div>
      ),
    },
    {
      header: 'Body stats',
      question: 'A few body stats',
      valid: inRange(a.heightCm, 120, 220) && inRange(a.weightKg, 30, 250) && inRange(a.age, 13, 90)
        && (a.goalWeightKg.trim() === '' || inRange(a.goalWeightKg, 30, 250)),
      body: (
        <div className="ob-stats">
          <NumberField label="Height" unit="cm" value={a.heightCm} onChange={(v) => set({ heightCm: v })} min={120} max={220} autoFocus />
          <NumberField label="Weight" unit="kg" value={a.weightKg} onChange={(v) => set({ weightKg: v })} min={30} max={250} />
          <NumberField label="Age" unit="years" value={a.age} onChange={(v) => set({ age: v })} min={13} max={90} />
          <NumberField label="Goal weight (optional)" unit="kg" value={a.goalWeightKg} onChange={(v) => set({ goalWeightKg: v })}
            min={30} max={250} />
        </div>
      ),
    },
    {
      header: 'Where you train',
      question: 'Where do you usually train?',
      valid: a.equipmentTier !== null,
      skip: () => { set({ equipmentTier: 'FULL_GYM', equipment: null }); next() },
      body: (
        <div role="radiogroup" aria-label="Where you train">
          {TIERS.map((t) => (
            <Row key={t.value} selected={a.equipmentTier === t.value}
              onClick={() => choose({ equipmentTier: t.value, equipment: null })}>
              <b>{t.label}</b><small>{t.hint}</small>
            </Row>
          ))}
        </div>
      ),
    },
    {
      header: 'Available equipment',
      question: 'What do you have?',
      subtitle: 'Untick anything you don\'t have.',
      valid: ticked.length > 0,
      skip: () => { set({ equipment: null }); next() },
      body: options
        ? <EquipmentChecklist options={options} ticked={ticked} onChange={(list) => set({ equipment: list })} />
        : <p className="ob-hint">Loading the equipment list…</p>,
    },
    {
      header: 'Schedule',
      question: 'Which days can you work out?',
      subtitle: 'You can change these any time in Settings.',
      valid: a.weekdays.length > 0,
      skip: () => { set({ weekdays: [1, 3, 5] }); next() },
      body: (
        <div role="group" aria-label="Workout days">
          {WEEKDAYS.map((w) => (
            <Row key={w.day} multi selected={a.weekdays.includes(w.day)}
              onClick={() => set({ weekdays: a.weekdays.includes(w.day) ? a.weekdays.filter((d) => d !== w.day) : [...a.weekdays, w.day] })}>
              <b>{w.long}</b>
            </Row>
          ))}
        </div>
      ),
    },
    {
      header: 'Your cycle',
      question: 'Are you on birth control?',
      valid: a.birthControl !== null,
      body: (
        <div role="radiogroup" aria-label="Birth control">
          {BIRTH_CONTROL.map((b) => (
            <Row key={b.value} selected={a.birthControl === b.value} onClick={() => choose({ birthControl: b.value })}>
              <b>{b.label}</b>
            </Row>
          ))}
        </div>
      ),
    },
    {
      header: 'Your cycle',
      question: 'When did your last period start?',
      subtitle: hormonal ? 'Optional on hormonal birth control.' : undefined,
      valid: hormonal || a.lastPeriodStart !== null,
      skip: hormonal ? () => { set({ lastPeriodStart: null }); finish() } : undefined,
      body: (
        <>
          <div role="radiogroup" aria-label="Last period start">
            {([['Today', 0], ['Yesterday', 1], ['About a week ago', 7], ['About two weeks ago', 14]] as const).map(([label, n]) => (
              <Row key={label} selected={a.lastPeriodStart === daysAgo(n)} onClick={() => set({ lastPeriodStart: daysAgo(n) })}>
                <b>{label}</b>
              </Row>
            ))}
          </div>
          <label className="ob-field">
            <span>Or pick the date</span>
            <input className="ob-text" type="date" max={TODAY} min={daysAgo(120)} value={a.lastPeriodStart ?? ''}
              onChange={(e) => set({ lastPeriodStart: e.target.value || null })} />
          </label>
          <div className="ob-field">
            <span>How long is your cycle, usually?</span>
            <div className="ob-stepper">
              <button type="button" aria-label="Shorter" disabled={a.cycleLength === null || a.cycleLength <= 21}
                onClick={() => setA((p) => ({ ...p, cycleLength: Math.max(21, (p.cycleLength ?? 28) - 1) }))}>−</button>
              <output>{a.cycleLength === null ? 'Not sure' : `${a.cycleLength} days`}</output>
              <button type="button" aria-label="Longer" disabled={a.cycleLength === null || a.cycleLength >= 45}
                onClick={() => setA((p) => ({ ...p, cycleLength: Math.min(45, (p.cycleLength ?? 28) + 1) }))}>+</button>
            </div>
            <Row multi selected={a.cycleLength === null} onClick={() => set({ cycleLength: a.cycleLength === null ? 28 : null })}>
              <b>I'm not sure</b><small>Start with 28 days and learn from my logs</small>
            </Row>
          </div>
          {a.cycleLength !== null && (
            <div className="ob-field">
              <span>Is it regular?</span>
              <div className="ob-segmented" role="radiogroup" aria-label="Regularity">
                <button type="button" role="radio" aria-checked={a.regularity === 'REGULAR'}
                  className={a.regularity === 'REGULAR' ? 'selected' : ''} onClick={() => set({ regularity: 'REGULAR' })}>Pretty regular</button>
                <button type="button" role="radio" aria-checked={a.regularity === 'IRREGULAR'}
                  className={a.regularity === 'IRREGULAR' ? 'selected' : ''} onClick={() => set({ regularity: 'IRREGULAR' })}>It varies</button>
              </div>
            </div>
          )}
        </>
      ),
    },
  ]

  const current = steps[step]
  const last = step === steps.length - 1

  async function finish() {
    setSaving(true)
    setError(null)
    const tier = a.equipmentTier ?? 'FULL_GYM'
    try {
      onDone(await onboard({
        firstName: a.firstName.trim(),
        goal: a.goal ?? 'GENERAL_FITNESS',
        experience: a.experience ?? 'NEW',
        consistency: a.consistency,
        heightCm: Number(a.heightCm),
        weightKg: Number(a.weightKg),
        age: Number(a.age),
        goalWeightKg: a.goalWeightKg.trim() === '' ? null : Number(a.goalWeightKg),
        equipmentTier: tier,
        equipment: a.equipment && !sameSet(a.equipment, preset(tier)) ? a.equipment : null,
        daysPerWeek: a.weekdays.length || 3,
        weekdays: a.weekdays.length ? a.weekdays : null,
        birthControl: a.birthControl!,
        lastPeriodStart: a.lastPeriodStart,
        cycleLength: a.cycleLength,
        regularity: a.cycleLength === null ? 'UNKNOWN' : a.regularity,
      }))
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="ob">
      <div className="ob-inner">
        <header className="ob-header">
          <button type="button" className="ob-round" aria-label="Back" disabled={saving}
            onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <span className="ob-title">{current.header}</span>
          {current.skip
            ? <button type="button" className="ob-skip" disabled={saving} onClick={current.skip}>Skip</button>
            : <span className="ob-skip-placeholder" />}
        </header>
        <div className="ob-progress" role="progressbar" aria-label={`Step ${step + 1} of ${steps.length}`}
          aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1}>
          <span style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>

        <div className="ob-body" key={step}>
          <h1 className="ob-question">{current.question}</h1>
          {current.subtitle && <p className="ob-subtitle">{current.subtitle}</p>}
          {current.body}
          {error && <p className="ob-error">{error}</p>}
        </div>

        <footer className="ob-footer">
          <button type="button" className="ob-next" disabled={!current.valid || saving}
            onClick={() => (last ? finish() : next())}>
            {last ? (saving ? 'Building your plan…' : 'Build my plan') : 'Next'}
          </button>
        </footer>
      </div>
    </div>
  )
}
