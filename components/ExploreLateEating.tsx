'use client'

// Explore → Late eating view: kcal (or carbs) logged in the 3 hours before
// Oura bedtime against one overnight outcome at a time. Scatter with point
// colour = bedtime deviation (earlier blue, later orange, ±60 min) and
// hollow points on training nights; below it, nights under 200 kcal vs over
// 500 kcal with n, median and middle half. Data: GET /api/explore/late-eating
// (lib/explore/lateEating.ts). Filtering and grouping happen here. No coach
// in this view. See BODYCIPHER.md → EXPLORE → Late eating.

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  LATE_OUTCOMES, LOW_KCAL, HIGH_KCAL, MIN_GROUP_NIGHTS, groupSummary, kcalGroup,
  type LateEatingData, type LateEatingNight, type LateOutcome, type LateExclusion,
} from '@/lib/explore/lateEating'

type TrainingFilter = 'all' | 'rest' | 'training'
type Exposure = 'kcal' | 'carbs'

const OUTCOMES: Record<LateOutcome, { label: string; unit: string; decimals: number; signed?: boolean }> = {
  lowest_hr:          { label: 'Lowest HR',            unit: 'bpm',        decimals: 0 },
  lowest_hr_timing:   { label: 'Lowest HR timing',     unit: '% of night', decimals: 0 },
  hrv:                { label: 'HRV',                  unit: 'ms',         decimals: 0 },
  deep_sleep:         { label: 'Deep sleep',           unit: 'min',        decimals: 0 },
  sleep_glucose_mean: { label: 'Sleep glucose (mean)', unit: 'mmol/L',     decimals: 1 },
  sleep_glucose_peak: { label: 'Sleep glucose (peak)', unit: 'mmol/L',     decimals: 1 },
  waking_glucose:     { label: 'Waking glucose',       unit: 'mmol/L',     decimals: 1 },
  weight_change:      { label: 'Weight change',        unit: 'kg',         decimals: 1, signed: true },
}

const EXCLUSION_LABEL: Record<LateExclusion, string> = { oura: 'Oura', cgm: 'CGM', meals: 'no meals', sick: 'sick' }

// Bedtime deviation colour scale caps here (minutes).
const DEV_CAP = 60

// ─── Chart geometry ───────────────────────────────────────────────
const CHART_H = 260
const PAD_L = 44
const PAD_R = 10
const PAD_T = 10
const PAD_B = 34
const POINT_R = 5
const PICK_RADIUS = 24

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtShortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

function fmtOutcome(o: LateOutcome, v: number | null): string {
  if (v == null) return '—'
  const { decimals, signed } = OUTCOMES[o]
  const s = v.toFixed(decimals)
  return signed && v > 0 ? `+${s}` : s
}

function fmtDev(dev: number | null): string {
  if (dev == null) return 'no usual bedtime yet'
  if (dev === 0) return 'usual bedtime'
  return `${Math.abs(dev)} min ${dev > 0 ? 'later' : 'earlier'} than usual`
}

// Earlier → blue, usual → muted grey, later → orange, full colour at ±DEV_CAP.
function devColour(dev: number | null): string {
  if (dev == null) return 'var(--color-text-muted)'
  const pct = Math.round(Math.min(1, Math.abs(dev) / DEV_CAP) * 100)
  const end = dev < 0 ? 'var(--color-series-blue)' : 'var(--color-series-orange)'
  return `color-mix(in srgb, ${end} ${pct}%, var(--color-text-muted))`
}

// Round a range out to "nice" tick steps.
function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (lo === hi) { lo -= 1; hi += 1 }
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw) ?? 10 * mag
  const start = Math.floor(lo / step) * step
  const ticks: number[] = []
  for (let t = start; t <= hi + step * 1e-9; t += step) ticks.push(Math.round(t * 1e6) / 1e6)
  if (ticks[ticks.length - 1] < hi) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(entries => setWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

// ─── Small controls ───────────────────────────────────────────────
export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'inline-flex', padding: 2, borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            style={{
              minHeight: 32, padding: '0 12px', border: 'none', borderRadius: 'var(--radius-full)', cursor: 'pointer',
              background: on ? 'var(--color-navy)' : 'transparent',
              color: on ? 'var(--color-surface)' : 'var(--color-text-secondary)',
              fontSize: 14, fontWeight: on ? 600 : 500, whiteSpace: 'nowrap',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Scatter ──────────────────────────────────────────────────────
function Scatter({ nights, exposure, outcome, selected, onSelect }: {
  nights: LateEatingNight[]          // only nights with a value for `outcome`
  exposure: Exposure
  outcome: LateOutcome
  selected: string | null
  onSelect: (wakeDate: string) => void
}) {
  const [wrapRef, width] = useWidth<HTMLDivElement>()
  const xs = nights.map(n => (exposure === 'kcal' ? n.lateKcal : n.lateCarbs))
  const ys = nights.map(n => n.outcomes[outcome] as number)
  const xTicks = niceTicks(0, Math.max(exposure === 'kcal' ? 500 : 50, ...xs))
  const yTicks = ys.length ? niceTicks(Math.min(...ys), Math.max(...ys)) : [0, 1]
  const plotW = Math.max(width - PAD_L - PAD_R, 1)
  const plotH = CHART_H - PAD_T - PAD_B
  const [x0, x1] = [xTicks[0], xTicks[xTicks.length - 1]]
  const [y0, y1] = [yTicks[0], yTicks[yTicks.length - 1]]
  const xOf = (x: number) => PAD_L + ((x - x0) / (x1 - x0 || 1)) * plotW
  const yOf = (y: number) => PAD_T + plotH - ((y - y0) / (y1 - y0 || 1)) * plotH

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left, py = e.clientY - rect.top
    let best: { d: number; date: string } | null = null
    nights.forEach((n, i) => {
      const d = Math.hypot(xOf(xs[i]) - px, yOf(ys[i]) - py)
      if (d <= PICK_RADIUS && (!best || d < best.d)) best = { d, date: n.wakeDate }
    })
    if (best) onSelect((best as { date: string }).date)
  }

  return (
    <div ref={wrapRef} style={{ width: '100%', height: CHART_H, userSelect: 'none', WebkitUserSelect: 'none' }}>
      {width > 0 && (
        <svg width={width} height={CHART_H} viewBox={`0 0 ${width} ${CHART_H}`} style={{ display: 'block', cursor: 'pointer' }} onPointerDown={pick}>
          {yTicks.map(t => (
            <g key={`y${t}`}>
              <line x1={PAD_L} x2={PAD_L + plotW} y1={yOf(t)} y2={yOf(t)} stroke="var(--color-border-subtle)" strokeWidth="1" />
              <text x={PAD_L - 6} y={yOf(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-text-muted)">{t}</text>
            </g>
          ))}
          {/* Group cut-offs on the kcal axis */}
          {exposure === 'kcal' && [LOW_KCAL, HIGH_KCAL].map(k => (
            <line key={`c${k}`} x1={xOf(k)} x2={xOf(k)} y1={PAD_T} y2={PAD_T + plotH} stroke="var(--color-text-secondary)" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="3 3" />
          ))}
          {xTicks.map((t, k) => (
            <text key={`x${t}`} x={xOf(t)} y={PAD_T + plotH + 16} textAnchor={k === 0 ? 'start' : k === xTicks.length - 1 ? 'end' : 'middle'} fontSize="11" fill="var(--color-text-muted)">{t}</text>
          ))}
          <text x={PAD_L + plotW / 2} y={CHART_H - 2} textAnchor="middle" fontSize="11" fill="var(--color-text-secondary)">
            {exposure === 'kcal' ? 'kcal' : 'carbs (g)'} in the 3 hours before bed
          </text>
          {nights.map((n, i) => {
            const colour = devColour(n.bedtimeDevMin)
            const on = n.wakeDate === selected
            return (
              <g key={n.wakeDate}>
                {on && <circle cx={xOf(xs[i])} cy={yOf(ys[i])} r={POINT_R + 4} fill="none" stroke="var(--color-text-primary)" strokeWidth="1.5" />}
                <circle
                  cx={xOf(xs[i])} cy={yOf(ys[i])} r={POINT_R}
                  fill={n.trained ? 'var(--color-surface)' : colour}
                  stroke={colour} strokeWidth={n.trained ? 2 : 1}
                />
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

// ─── Group comparison ─────────────────────────────────────────────
function GroupStrip({ values, lo, hi, faded }: { values: number[]; lo: number; hi: number; faded: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const s = groupSummary(values)
  const xOf = (v: number) => 6 + ((v - lo) / (hi - lo || 1)) * Math.max(width - 12, 1)
  return (
    <div ref={ref} style={{ width: '100%', height: 22 }}>
      {width > 0 && (
        <svg width={width} height={22} style={{ display: 'block', opacity: faded ? 0.4 : 1 }}>
          <line x1={6} x2={width - 6} y1={11} y2={11} stroke="var(--color-border-subtle)" strokeWidth="1" />
          {s.q1 != null && s.q3 != null && (
            <rect x={xOf(s.q1)} y={5} width={Math.max(xOf(s.q3) - xOf(s.q1), 2)} height={12} rx="3" fill="var(--color-navy-tint)" />
          )}
          {values.map((v, i) => <circle key={i} cx={xOf(v)} cy={11} r="3" fill="var(--color-text-secondary)" fillOpacity="0.6" />)}
          {s.median != null && <line x1={xOf(s.median)} x2={xOf(s.median)} y1={2} y2={20} stroke="var(--color-text-primary)" strokeWidth="2" />}
        </svg>
      )}
    </div>
  )
}

function GroupCard({ nights, outcome }: { nights: LateEatingNight[]; outcome: LateOutcome }) {
  const meta = OUTCOMES[outcome]
  const groups = [
    { key: 'low' as const, label: `Under ${LOW_KCAL} kcal` },
    { key: 'high' as const, label: `Over ${HIGH_KCAL} kcal` },
  ].map(g => ({ ...g, values: nights.filter(n => kcalGroup(n.lateKcal) === g.key).map(n => n.outcomes[outcome] as number) }))
  const all = groups.flatMap(g => g.values)
  const lo = all.length ? Math.min(...all) : 0
  const hi = all.length ? Math.max(...all) : 1
  const enough = groups.every(g => g.values.length >= MIN_GROUP_NIGHTS)
  const [low, high] = groups.map(g => groupSummary(g.values))
  const diff = enough && low.median != null && high.median != null ? high.median - low.median : null

  return (
    <div style={{ padding: 'var(--space-md)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>
        {meta.label} · {meta.unit}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        {groups.map(g => {
          const s = groupSummary(g.values)
          const tooFew = s.n < MIN_GROUP_NIGHTS
          return (
            <div key={g.key}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 'var(--space-sm)' }}>
                <span style={{ fontSize: 16, color: 'var(--color-text-primary)' }}>{g.label}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>n = {s.n}</span>
                <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 600, color: tooFew ? 'var(--color-text-muted)' : 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
                  {s.median == null ? '—' : fmtOutcome(outcome, s.median)}
                </span>
                {s.q1 != null && s.q3 != null && (
                  <span style={{ flexBasis: '100%', textAlign: 'right', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    middle half {fmtOutcome(outcome, s.q1)} – {fmtOutcome(outcome, s.q3)}
                  </span>
                )}
              </div>
              <GroupStrip values={g.values} lo={lo} hi={hi} faded={tooFew} />
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: 'var(--space-sm) 0 0' }}>
        {enough
          ? `Median difference (over ${HIGH_KCAL} − under ${LOW_KCAL}): ${fmtOutcome(outcome, diff)} ${meta.unit}`
          : `Too few nights to compare (each group needs ${MIN_GROUP_NIGHTS}).`}
      </p>
    </div>
  )
}

// ─── View ─────────────────────────────────────────────────────────
export default function ExploreLateEating() {
  const [data, setData] = useState<LateEatingData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [training, setTraining] = useState<TrainingFilter>('all')
  const [exposure, setExposure] = useState<Exposure>('kcal')
  const [outcome, setOutcome] = useState<LateOutcome>('lowest_hr')
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/explore/late-eating', { cache: 'no-store' })
      .then(async res => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? `Failed to load late-eating data: ${res.status}`)
        setData(body as LateEatingData)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load late-eating data'))
  }, [])

  const filtered = useMemo(() => (data?.nights ?? []).filter(n =>
    training === 'all' ? true : training === 'training' ? n.trained : !n.trained,
  ), [data, training])
  const withOutcome = useMemo(() => filtered.filter(n => n.outcomes[outcome] != null), [filtered, outcome])
  const excludedCounts = useMemo(() => {
    const c: Partial<Record<LateExclusion, number>> = {}
    for (const x of data?.excluded ?? []) c[x.reason] = (c[x.reason] ?? 0) + 1
    return c
  }, [data])
  const middle = withOutcome.filter(n => kcalGroup(n.lateKcal) == null).length
  const night = withOutcome.find(n => n.wakeDate === selected) ?? null

  const muted: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 400 }

  if (error) return <p style={{ fontSize: 14, color: 'var(--color-danger)', margin: 0 }}>{error}</p>
  if (!data) {
    return (
      <div style={{ paddingTop: 40, textAlign: 'center', fontSize: 10, letterSpacing: '0.2em', color: 'var(--color-text-dim)' }}>
        LOADING
      </div>
    )
  }

  const excludedText = (Object.keys(EXCLUSION_LABEL) as LateExclusion[])
    .filter(r => excludedCounts[r])
    .map(r => `${excludedCounts[r]} ${EXCLUSION_LABEL[r]}`)
    .join(' · ')

  return (
    <>
      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
        <Segmented
          label="Training"
          value={training}
          onChange={setTraining}
          options={[{ value: 'all', label: 'All' }, { value: 'rest', label: 'Rest days' }, { value: 'training', label: 'Training days' }]}
        />
        <Segmented
          label="Exposure"
          value={exposure}
          onChange={setExposure}
          options={[{ value: 'kcal', label: 'kcal' }, { value: 'carbs', label: 'Carbs' }]}
        />
      </div>

      {/* Outcome chips — one at a time */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
        {LATE_OUTCOMES.map(o => {
          const on = o === outcome
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => { setOutcome(o); setSelected(null) }}
              style={{
                padding: '6px 12px', minHeight: 34, borderRadius: 'var(--radius-full)',
                border: `1px solid ${on ? 'var(--color-navy)' : 'var(--color-border)'}`,
                background: 'var(--color-surface)',
                color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                fontSize: 14, fontWeight: on ? 600 : 500, cursor: 'pointer',
              }}
            >
              {OUTCOMES[o].label}
            </button>
          )
        })}
      </div>

      {/* Readout for the tapped night */}
      <div style={{ padding: 'var(--space-md)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)' }}>
        {!night ? (
          <p style={{ fontSize: 16, color: 'var(--color-text-secondary)', margin: 0 }}>Tap a point to see that night.</p>
        ) : (
          <>
            <div style={{ ...muted, marginBottom: 'var(--space-xs)' }}>
              Night to {fmtShortDate(night.wakeDate)} · bed {night.bedtime}{night.trained ? ' · training day' : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 16, color: 'var(--color-text-primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-sm)' }}>
                <span>Late food</span>
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{night.lateKcal} kcal · {night.lateCarbs} g carbs</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-sm)' }}>
                <span>{OUTCOMES[outcome].label}</span>
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtOutcome(outcome, night.outcomes[outcome])} {OUTCOMES[outcome].unit}</span>
              </div>
              <span style={muted}>{fmtDev(night.bedtimeDevMin)}</span>
            </div>
          </>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-md)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Earlier
          <span aria-hidden style={{ width: 56, height: 8, borderRadius: 'var(--radius-full)', background: 'linear-gradient(to right, var(--color-series-blue), var(--color-text-muted), var(--color-series-orange))' }} />
          Later bedtime (±{DEV_CAP} min)
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: 'var(--radius-full)', border: '2px solid var(--color-text-secondary)', boxSizing: 'border-box' }} />
          Training day
        </span>
      </div>

      <Scatter nights={withOutcome} exposure={exposure} outcome={outcome} selected={selected} onSelect={setSelected} />

      {/* Count line */}
      <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: 0 }}>
        {withOutcome.length} {withOutcome.length === 1 ? 'night' : 'nights'} · {middle} in {LOW_KCAL}–{HIGH_KCAL} kcal
        {excludedText && ` · left out: ${excludedText}`}
        {filtered.length > withOutcome.length && ` · ${filtered.length - withOutcome.length} without ${OUTCOMES[outcome].label.toLowerCase()}`}
      </p>

      <GroupCard nights={withOutcome} outcome={outcome} />

      <p style={{ ...muted, margin: 0 }}>
        Meals count by the time they were logged. Shows associations, not causes.
      </p>
    </>
  )
}
