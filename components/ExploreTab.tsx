'use client'

// Explore tab — normalised chart of up to three daily variables over the
// last 60 days: 7-day average trend lines over faint daily z-score dots,
// with dashed boxes around stretches where 2+ variables stay unusual
// together. Data: GET /api/explore (see BODYCIPHER.md → EXPLORE). Trends
// and stretches are computed here for the current selection. Selection
// resets to the default every time the tab mounts — no persistence.
// Phase 3 (coach questions) will sit below the count line.

import { useState, useEffect, useRef, useMemo } from 'react'
import type { ExploreData, ExploreDate } from '@/lib/explore/fetch'
import type { ExploreVariable } from '@/lib/explore/series'
import { MAX_SELECTED_VARIABLES } from '@/lib/explore/highlights'
import { rollingAverage, findStretches, STRETCH_Z, type ExploreStretch } from '@/lib/explore/trends'

const CHIPS: { key: ExploreVariable; label: string; note?: string }[] = [
  { key: 'hrv',             label: 'HRV' },
  { key: 'rhr',             label: 'RHR' },
  { key: 'sleep_duration',  label: 'Sleep duration' },
  { key: 'bedtime',         label: 'Bedtime' },
  { key: 'training_stress', label: 'Training stress', note: '(prev. day)' },
  { key: 'load_ratio',      label: 'Load ratio' },
  { key: 'last_meal',       label: 'Last meal',       note: '(prev. evening)' },
]
const CHIP_BY_KEY = Object.fromEntries(CHIPS.map(c => [c.key, c])) as Record<ExploreVariable, typeof CHIPS[number]>

const DEFAULT_SELECTION: ExploreVariable[] = ['hrv', 'last_meal', 'training_stress']

// Selection order → colour: first = blue, second = orange, third = green.
const SERIES_COLOURS = ['var(--color-series-blue)', 'var(--color-series-orange)', 'var(--color-series-green)']

// ─── Chart geometry ───────────────────────────────────────────────
const CHART_H = 250
const PAD_L = 48
const PAD_R = 8
const PAD_T = 14
const PAD_B = 22
const Z_MAX = 3.5
const Y_TICKS = [3, 2, 1, 0, -1, -2, -3]
const MAX_X_LABELS = 5

// ─── Formatting ───────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-10-27" → "27 Oct"
function fmtShortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

function fmtValue(v: ExploreVariable, p: ExploreDate['variables'][ExploreVariable]): string | null {
  if (p.value == null) return null
  switch (v) {
    case 'hrv':             return `${Math.round(p.value)} ms`
    case 'rhr':             return `${Math.round(p.value)} bpm`
    case 'sleep_duration':  return `${Math.floor(p.value / 60)}h ${Math.round(p.value % 60)}m`
    case 'bedtime':
    case 'last_meal':       return p.display
    case 'training_stress': return `${Math.round(p.value)}`
    case 'load_ratio':      return p.value.toFixed(2)
  }
}

function fmtTick(t: number): string {
  if (t === 0) return 'typical'
  return t > 0 ? `+${t}` : `−${Math.abs(t)}`
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

// Readout note from the variable's 7-day average on the selected date.
function weekNote(avg: number | null): string | null {
  if (avg == null) return null
  if (avg > STRETCH_Z) return ' · week above usual'
  if (avg < -STRETCH_Z) return ' · week below usual'
  return ' · week typical'
}

// Straight segments through one gap-free run of points — no smoothing,
// so the line never overshoots between days.
function linePath(pts: [number, number][]): string {
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

// ─── Small shared marks ───────────────────────────────────────────
function ColourSquare({ colour }: { colour: string | null }) {
  return (
    <span
      aria-hidden
      style={{
        width: 10, height: 10, flexShrink: 0, borderRadius: 2,
        background: colour ?? 'transparent',
        border: `1.5px solid ${colour ?? 'var(--color-text-muted)'}`,
      }}
    />
  )
}

// ─── Chart ────────────────────────────────────────────────────────
function ExploreChart({
  dates, selected, averages, stretches, injectionDates, selectedIdx, onSelect,
}: {
  dates: ExploreDate[]
  selected: ExploreVariable[]
  averages: Partial<Record<ExploreVariable, (number | null)[]>>   // aligned to dates
  stretches: ExploreStretch[]
  injectionDates: Set<string>
  selectedIdx: number
  onSelect: (i: number) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => setWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const n = dates.length
  const plotW = Math.max(width - PAD_L - PAD_R, 1)
  const plotH = CHART_H - PAD_T - PAD_B
  const colW = plotW / Math.max(n, 1)
  const xOf = (i: number) => PAD_L + (i + 0.5) * colW
  const yOf = (z: number) => PAD_T + plotH * (1 - (Math.max(-Z_MAX, Math.min(Z_MAX, z)) + Z_MAX) / (2 * Z_MAX))

  const pickAt = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || n === 0) return
    const i = Math.floor((clientX - rect.left - PAD_L) / colW)
    onSelect(Math.max(0, Math.min(n - 1, i)))
  }

  const labelIdx = n <= 1
    ? [0]
    : [...new Set(Array.from({ length: Math.min(MAX_X_LABELS, n) }, (_, k) => Math.round(k * (n - 1) / (Math.min(MAX_X_LABELS, n) - 1))))]

  return (
    <div ref={wrapRef} style={{ width: '100%', height: CHART_H, touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none' }}>
      {width > 0 && (
        <svg
          width={width} height={CHART_H} viewBox={`0 0 ${width} ${CHART_H}`}
          style={{ display: 'block', cursor: 'pointer' }}
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); pickAt(e.clientX) }}
          onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) pickAt(e.clientX) }}
        >
          <defs>
            <clipPath id="explore-plot">
              <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} />
            </clipPath>
          </defs>

          {/* Typical band −1 … +1 */}
          <rect x={PAD_L} y={yOf(1)} width={plotW} height={yOf(-1) - yOf(1)} fill="var(--color-navy-tint)" fillOpacity="0.7" />

          {/* Grid + y labels */}
          {Y_TICKS.map(t => (
            <g key={t}>
              <line x1={PAD_L} x2={PAD_L + plotW} y1={yOf(t)} y2={yOf(t)} stroke="var(--color-border-subtle)" strokeWidth="1" />
              <text x={PAD_L - 6} y={yOf(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-text-muted)">{fmtTick(t)}</text>
            </g>
          ))}

          {/* Selected-day marker */}
          {n > 0 && (
            <line x1={xOf(selectedIdx)} x2={xOf(selectedIdx)} y1={PAD_T} y2={PAD_T + plotH} stroke="var(--color-text-primary)" strokeOpacity="0.45" strokeWidth="1" />
          )}

          {/* Off-together stretches — dashed rounded boxes, full plot height,
              behind the dots and lines */}
          {stretches.map(s => {
            const a = dates.findIndex(d => d.date === s.start)
            const b = dates.findIndex(d => d.date === s.end)
            if (a < 0 || b < 0) return null
            return (
              <rect
                key={`s${s.start}`}
                x={PAD_L + a * colW + 1} y={PAD_T + 1}
                width={(b - a + 1) * colW - 2} height={plotH - 2}
                rx="6"
                fill="var(--color-text-secondary)" fillOpacity="0.06"
                stroke="var(--color-text-secondary)" strokeOpacity="0.8" strokeWidth="1" strokeDasharray="4 3"
              />
            )
          })}

          {/* Daily z-scores — faint dots */}
          {selected.map((v, si) => dates.map((d, i) => {
            const z = d.variables[v].z
            return z != null && (
              <circle key={`d${v}${d.date}`} cx={xOf(i)} cy={yOf(z)} r="2" fill={SERIES_COLOURS[si]} fillOpacity="0.35" />
            )
          }))}

          {/* 7-day average lines — gaps where the average is null */}
          <g clipPath="url(#explore-plot)">
            {selected.map((v, si) => {
              const colour = SERIES_COLOURS[si]
              const avg = averages[v] ?? []
              const runs: [number, number][][] = []
              let cur: [number, number][] = []
              dates.forEach((_, i) => {
                const a = avg[i]
                if (a == null) { if (cur.length) { runs.push(cur); cur = [] } }
                else cur.push([xOf(i), yOf(a)])
              })
              if (cur.length) runs.push(cur)
              return (
                <g key={v}>
                  {runs.map((pts, ri) => pts.length === 1
                    ? <circle key={ri} cx={pts[0][0]} cy={pts[0][1]} r="1.75" fill={colour} />
                    : <path key={ri} d={linePath(pts)} fill="none" stroke={colour} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  )}
                </g>
              )
            })}
          </g>

          {/* GLP-1 injections — downward triangles along the top edge */}
          {dates.map((d, i) => injectionDates.has(d.date) && (
            <polygon
              key={`i${d.date}`}
              points={`${xOf(i) - 4},${PAD_T - 10} ${xOf(i) + 4},${PAD_T - 10} ${xOf(i)},${PAD_T - 3}`}
              fill="var(--color-text-secondary)"
            />
          ))}

          {/* X labels — at most five */}
          {labelIdx.map((i, k) => (
            <text
              key={i}
              x={xOf(i)} y={CHART_H - 5}
              textAnchor={k === 0 ? 'start' : k === labelIdx.length - 1 ? 'end' : 'middle'}
              fontSize="11" fill="var(--color-text-muted)"
            >
              {fmtShortDate(dates[i].date)}
            </text>
          ))}
        </svg>
      )}
    </div>
  )
}

// ─── Tab ──────────────────────────────────────────────────────────
export default function ExploreTab() {
  const [data, setData] = useState<ExploreData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ExploreVariable[]>(DEFAULT_SELECTION)
  const [limitHit, setLimitHit] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/explore', { cache: 'no-store' })
      .then(async res => {
        if (!res.ok) throw new Error(`Failed to load Explore data: ${res.status}`)
        return res.json() as Promise<ExploreData>
      })
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load Explore data') })
    return () => { cancelled = true }
  }, [])

  const toggle = (v: ExploreVariable) => {
    if (selected.includes(v)) {
      setSelected(selected.filter(s => s !== v))
      setLimitHit(false)
    } else if (selected.length >= MAX_SELECTED_VARIABLES) {
      setLimitHit(true)
    } else {
      setSelected([...selected, v])
      setLimitHit(false)
    }
  }

  const dates = useMemo(() => data?.dates ?? [], [data])

  // 7-day averages of z, per selected variable, aligned to dates.
  const averages = useMemo(() => {
    const out: Partial<Record<ExploreVariable, (number | null)[]>> = {}
    for (const v of selected) out[v] = rollingAverage(dates.map(d => d.variables[v].z))
    return out
  }, [dates, selected])
  const stretches = useMemo(
    () => findStretches(dates.map(d => d.date), averages, selected),
    [dates, averages, selected],
  )
  const injectionDates = useMemo(() => new Set(data?.injectionDates ?? []), [data])

  const idx = selectedIdx ?? dates.length - 1
  const day = dates[idx]
  const inStretch = day != null && stretches.some(s => day.date >= s.start && day.date <= s.end)

  const header = day
    ? fmtShortDate(day.date)
      + (injectionDates.has(day.date) ? ' · injection' : '')
      + (inStretch ? ' · off together' : '')
      + (day.isSick ? ' · sick day' : '')
    : ''

  const muted: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 400 }
  const card: React.CSSProperties = {
    padding: 'var(--space-md)',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-card)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', paddingBottom: 'var(--space-md)' }}>

      {/* 1. Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Explore</h1>
        <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Last 60 days</span>
      </div>

      {/* 2. Chips */}
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
          {CHIPS.map(c => {
            const pos = selected.indexOf(c.key)
            const on = pos >= 0
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(c.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', minHeight: 34,
                  borderRadius: 'var(--radius-full)',
                  border: `1px solid ${on ? 'var(--color-navy)' : 'var(--color-border)'}`,
                  background: 'var(--color-surface)',
                  color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  fontSize: 14, fontWeight: on ? 600 : 500,
                  cursor: 'pointer',
                }}
              >
                <ColourSquare colour={on ? SERIES_COLOURS[pos] : null} />
                {c.label}
              </button>
            )
          })}
        </div>
        {limitHit && (
          <p style={{ ...muted, margin: 'var(--space-xs) 0 0' }}>Up to 3 variables. Remove one first.</p>
        )}
      </div>

      {error ? (
        <p style={{ fontSize: 14, color: 'var(--color-danger)', margin: 0 }}>{error}</p>
      ) : !data ? (
        <div style={{ paddingTop: 40, textAlign: 'center', fontSize: 10, letterSpacing: '0.2em', color: 'var(--color-text-dim)' }}>
          LOADING
        </div>
      ) : (
        <>
          {/* 4. Readout */}
          <div style={card}>
            {selected.length === 0 || !day ? (
              <p style={{ fontSize: 16, color: 'var(--color-text-secondary)', margin: 0 }}>Pick a variable to start.</p>
            ) : (
              <>
                <div style={{ ...muted, marginBottom: 'var(--space-xs)' }}>{header}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selected.map((v, si) => {
                    const value = fmtValue(v, day.variables[v])
                    const note = CHIP_BY_KEY[v].note
                    const week = weekNote(averages[v]?.[idx] ?? null)
                    return (
                      <div key={v} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-sm)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 16, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          <ColourSquare colour={SERIES_COLOURS[si]} />
                          {CHIP_BY_KEY[v].label}
                          {note && <span style={muted}>{note}</span>}
                        </span>
                        {/* Value stays on one line; the week note wraps under it when space is tight */}
                        <span style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'baseline', columnGap: 4, fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', textAlign: 'right' }}>
                          {value == null ? (
                            <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>No data</span>
                          ) : (
                            <>
                              <span style={{ whiteSpace: 'nowrap' }}>{value}</span>
                              {week && <span style={{ ...muted, whiteSpace: 'nowrap' }}>{week}</span>}
                            </>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* 5. Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden style={{ width: 14, borderTop: '2px solid var(--color-text-secondary)' }} />
              7-day average
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden style={{ width: 5, height: 5, borderRadius: 'var(--radius-full)', background: 'var(--color-text-secondary)', opacity: 0.45 }} />
              Daily value
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden style={{ width: 12, height: 10, borderRadius: 3, border: '1px dashed var(--color-text-secondary)' }} />
              Off together
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg aria-hidden width="10" height="8" viewBox="0 0 10 8"><polygon points="0,0 10,0 5,7" fill="var(--color-text-secondary)" /></svg>
              Injection
            </span>
          </div>

          {/* 6. Chart */}
          <ExploreChart
            dates={dates}
            selected={selected}
            averages={averages}
            stretches={stretches}
            injectionDates={injectionDates}
            selectedIdx={idx}
            onSelect={setSelectedIdx}
          />

          {/* 7. Count line — needs two variables for a stretch to exist */}
          {selected.length >= 2 && (
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: 0 }}>
              {plural(stretches.length, 'stretch', 'stretches')} off together in this window
            </p>
          )}

          {/* 8. Reserved for Phase 3 coach questions */}
        </>
      )}
    </div>
  )
}
