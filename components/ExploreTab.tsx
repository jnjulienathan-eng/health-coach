'use client'

// Explore tab — normalised chart of up to three daily variables over the
// last 60 days. Data: GET /api/explore (see BODYCIPHER.md → EXPLORE).
// Highlights are computed here for the current selection. Selection resets
// to the default every time the tab mounts — no persistence.
// Phase 3 (coach questions) will sit below the count line.

import { useState, useEffect, useRef, useMemo } from 'react'
import type { ExploreData, ExploreDate } from '@/lib/explore/fetch'
import type { ExploreVariable } from '@/lib/explore/series'
import { computeHighlights, OUTLIER_Z, MAX_SELECTED_VARIABLES } from '@/lib/explore/highlights'

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
const SMOOTHING = 0.12   // Catmull-Rom tension — light smoothing

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

// Lightly smoothed path through one gap-free run of points.
function smoothPath(pts: [number, number][]): string {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) * SMOOTHING
    const c1y = p1[1] + (p2[1] - p0[1]) * SMOOTHING
    const c2x = p2[0] - (p3[0] - p1[0]) * SMOOTHING
    const c2y = p2[1] - (p3[1] - p1[1]) * SMOOTHING
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
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
  dates, selected, injectionDates, outlierKeys, coincidenceDates, selectedIdx, onSelect,
}: {
  dates: ExploreDate[]
  selected: ExploreVariable[]
  injectionDates: Set<string>
  outlierKeys: Set<string>          // `${date}|${variable}`
  coincidenceDates: Set<string>
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

          {/* Coincidence days — amber column, behind everything */}
          {dates.map((d, i) => coincidenceDates.has(d.date) && (
            <rect key={`c${d.date}`} x={PAD_L + i * colW} y={PAD_T} width={colW} height={plotH} fill="var(--color-amber)" fillOpacity="0.22" />
          ))}

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

          {/* Series — gaps where z is null, never interpolated across */}
          <g clipPath="url(#explore-plot)">
            {selected.map((v, si) => {
              const colour = SERIES_COLOURS[si]
              const runs: [number, number][][] = []
              let cur: [number, number][] = []
              dates.forEach((d, i) => {
                const z = d.variables[v].z
                if (z == null) { if (cur.length) { runs.push(cur); cur = [] } }
                else cur.push([xOf(i), yOf(z)])
              })
              if (cur.length) runs.push(cur)
              return (
                <g key={v}>
                  {runs.map((pts, ri) => pts.length === 1
                    ? <circle key={ri} cx={pts[0][0]} cy={pts[0][1]} r="1.75" fill={colour} />
                    : <path key={ri} d={smoothPath(pts)} fill="none" stroke={colour} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  )}
                </g>
              )
            })}
          </g>

          {/* Outlier dots — outside the clip so edge-clamped dots stay whole */}
          {selected.map((v, si) => dates.map((d, i) => {
            const z = d.variables[v].z
            return z != null && outlierKeys.has(`${d.date}|${v}`) && (
              <circle key={`o${v}${d.date}`} cx={xOf(i)} cy={yOf(z)} r="3.5" fill={SERIES_COLOURS[si]} />
            )
          }))}

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

  const zPoints = useMemo(
    () => (data?.dates ?? []).map(d => ({
      date: d.date,
      z: Object.fromEntries(Object.entries(d.variables).map(([k, p]) => [k, p.z])) as Partial<Record<ExploreVariable, number | null>>,
    })),
    [data],
  )
  const highlights = useMemo(
    () => (selected.length > 0 && zPoints.length > 0 ? computeHighlights(zPoints, selected) : null),
    [zPoints, selected],
  )
  const outlierKeys = useMemo(() => new Set(highlights?.outliers.map(o => `${o.date}|${o.variable}`) ?? []), [highlights])
  const coincidenceDates = useMemo(() => new Set(highlights?.coincidences.map(c => c.date) ?? []), [highlights])
  const injectionDates = useMemo(() => new Set(data?.injectionDates ?? []), [data])

  const dates = data?.dates ?? []
  const idx = selectedIdx ?? dates.length - 1
  const day = dates[idx]

  const header = day
    ? fmtShortDate(day.date)
      + (injectionDates.has(day.date) ? ' · injection' : '')
      + (coincidenceDates.has(day.date) ? ' · two variables off together' : '')
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
                    const p = day.variables[v]
                    const value = fmtValue(v, p)
                    const note = CHIP_BY_KEY[v].note
                    return (
                      <div key={v} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-sm)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 16, color: 'var(--color-text-primary)' }}>
                          <ColourSquare colour={SERIES_COLOURS[si]} />
                          {CHIP_BY_KEY[v].label}
                          {note && <span style={muted}>{note}</span>}
                        </span>
                        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', textAlign: 'right' }}>
                          {value == null ? (
                            <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>No data</span>
                          ) : (
                            <>
                              {value}
                              {p.z == null
                                ? <span style={muted}> · not enough history yet</span>
                                : Math.abs(p.z) > OUTLIER_Z && <span style={muted}> · outlier</span>}
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
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-amber)', opacity: 0.5 }} />
              Off together
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: 'var(--radius-full)', background: 'var(--color-text-secondary)' }} />
              Outlier
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
            injectionDates={injectionDates}
            outlierKeys={outlierKeys}
            coincidenceDates={coincidenceDates}
            selectedIdx={idx}
            onSelect={setSelectedIdx}
          />

          {/* 7. Count line */}
          {highlights && (
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: 0 }}>
              {plural(highlights.coincidenceCount, 'coincidence day', 'coincidence days')}
              {' · '}
              {plural(highlights.outlierCount, 'outlier', 'outliers')} in this window
            </p>
          )}

          {/* 8. Reserved for Phase 3 coach questions */}
        </>
      )}
    </div>
  )
}
