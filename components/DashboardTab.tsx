'use client'

import { useState, useEffect } from 'react'
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis,
  ReferenceLine,
  Tooltip,
} from 'recharts'
import { loadRecentEntries } from '@/lib/db'
import { behaviorScore, outcomeScore } from '@/lib/scores'
import { scoreColor, scoreLabel } from '@/lib/types'
import type { DailyEntry } from '@/lib/types'
import { computeTrainingLoad, computeTrainingLoadHistory } from '@/lib/trainingLoad'

interface Props {
  today: DailyEntry
  currentDate: string
}

// ─── Score bullet helpers ──────────────────────────────────────────
function getBehaviorBullets(entry: DailyEntry): { text: string; ok: boolean }[] {
  const bullets: { text: string; ok: boolean }[] = []
  const sup = entry.supplements

  // Supplements
  const suppLogged = sup.morning_stack_taken || sup.evening_stack_taken || sup.progesterone_taken || sup.estradiol_taken
  if (suppLogged) {
    const parts = [
      sup.morning_stack_taken && 'AM',
      sup.evening_stack_taken && 'PM',
      sup.progesterone_taken && 'Prog',
      sup.estradiol_taken && 'E2',
    ].filter(Boolean).join(', ')
    bullets.push({ text: `Supplements taken (${parts})`, ok: true })
  } else {
    bullets.push({ text: 'Supplements not logged', ok: false })
  }

  // Bedtime
  if (entry.sleep.bedtime) {
    const [h, m] = entry.sleep.bedtime.split(':').map(Number)
    const diff = Math.abs(h * 60 + m - (21 * 60 + 45))
    if (diff <= 30) {
      bullets.push({ text: `Bedtime on target (${entry.sleep.bedtime})`, ok: true })
    } else {
      bullets.push({ text: `Bedtime off target (${entry.sleep.bedtime}, target 21:45)`, ok: false })
    }
  } else {
    bullets.push({ text: 'Bedtime not logged', ok: false })
  }

  // Nutrition
  const p = entry.nutrition.total_protein
  const f = entry.nutrition.total_fiber
  if (p != null || f != null) {
    const parts = [
      p != null && `${Math.round(p)}g protein`,
      f != null && `${Math.round(f)}g fiber`,
    ].filter(Boolean).join(', ')
    const ok = (p == null || p >= 130) && (f == null || f >= 30)
    bullets.push({ text: `Nutrition: ${parts}`, ok })
  } else {
    bullets.push({ text: 'Nutrition not logged', ok: false })
  }

  return bullets
}

function getOutcomeBullets(entry: DailyEntry): { text: string; ok: boolean }[] {
  const bullets: { text: string; ok: boolean }[] = []

  if (entry.sleep.hrv != null) {
    const hrv = entry.sleep.hrv
    bullets.push({ text: `HRV ${hrv}ms — ${hrv >= 88 ? 'above baseline' : 'below baseline'}`, ok: hrv >= 88 })
  }

  if (entry.sleep.duration_min != null) {
    const h = Math.floor(entry.sleep.duration_min / 60)
    const m = entry.sleep.duration_min % 60
    const ok = entry.sleep.duration_min >= 450 && entry.sleep.duration_min <= 510
    bullets.push({ text: `Sleep ${h}h ${m}m — ${ok ? 'on target' : entry.sleep.duration_min < 450 ? 'below target' : 'over target'}`, ok })
  }

  if (entry.sleep.rested != null) {
    bullets.push({ text: `Rested ${entry.sleep.rested}/5`, ok: entry.sleep.rested >= 4 })
  }

  return bullets
}

// ─── Helpers ──────────────────────────────────────────────────────
function chartDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
}

function durationToH(min: number | null): number | null {
  if (min == null) return null
  return Math.round((min / 60) * 10) / 10
}

// ─── Score card ───────────────────────────────────────────────────
function ScoreCard({ label, score, bullets }: { label: string; score: number; bullets?: { text: string; ok: boolean }[] }) {
  const color = scoreColor(score)
  const word  = scoreLabel(score)
  return (
    <div
      style={{
        flex: 1,
        textAlign: 'center',
        padding: '14px 8px 12px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
      }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 40, fontWeight: 700, color, lineHeight: 1 }}>
        {score}
      </div>
      <div style={{ fontSize: 11, fontWeight: 500, color, marginTop: 4 }}>{word}</div>
      <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginTop: 3 }}>
        {label}
      </div>
      {bullets && bullets.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border)', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {bullets.map((b, i) => (
            <div key={i} style={{ fontSize: 10, lineHeight: 1.4, color: b.ok ? 'var(--color-text-secondary)' : 'var(--color-text-dim)', display: 'flex', gap: 4 }}>
              <span style={{ flexShrink: 0 }}>{b.ok ? '✓' : '✗'}</span>
              <span>{b.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Training Load status card ────────────────────────────────────
function TrainingLoadCard({ status, colour }: { status: string; colour: string }) {
  return (
    <div style={{
      flex: 1,
      textAlign: 'center',
      padding: '14px 8px 12px',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: colour }} />
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, color: colour, lineHeight: 1.3 }}>{status}</div>
      <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginTop: 3 }}>
        Training Load
      </div>
    </div>
  )
}

// ─── Chart card ───────────────────────────────────────────────────
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '16px 16px 12px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-text-secondary)',
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

// ─── Tooltip style shared across all charts ───────────────────────
const tooltipStyle = {
  background: 'var(--color-surface)',
  border: '1px solid #DCE8E0',
  borderRadius: 8,
  fontSize: 12,
  fontFamily: 'DM Mono, monospace',
  color: '#1A2E22',
}
const tooltipItemStyle = { color: '#1A2E22' }
const tooltipLabelStyle = { color: '#5A7A66', marginBottom: 2 }

// ─── Main component ───────────────────────────────────────────────
export default function DashboardTab({ today, currentDate }: Props) {
  const [entries,     setEntries]     = useState<DailyEntry[]>([])
  const [loading,     setLoading]     = useState(true)
  const [tlExpanded,  setTlExpanded]  = useState(false)

  useEffect(() => {
    loadRecentEntries(30)
      .then(setEntries)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Merge today's live entry into history, replacing stale version if present
  const allEntries = (() => {
    const without = entries.filter(e => e.date !== currentDate)
    return [today, ...without].sort((a, b) => a.date < b.date ? 1 : -1)
  })()

  // Only entries with at least some sleep data logged
  const entriesWithData = allEntries.filter(
    e => e.sleep.hrv != null || e.sleep.duration_min != null || e.sleep.rested != null
  )

  const todayBehavior = behaviorScore(today)
  const todayOutcome  = outcomeScore(today)

  // 30 most recent days for charts (oldest→newest for left→right display)
  const chart30 = allEntries.slice(0, 30).reverse()

  const hasEnoughData = entriesWithData.length >= 2

  // Training Load computation from full history
  const tlResult   = computeTrainingLoad(allEntries)
  const tlHistory  = computeTrainingLoadHistory(chart30)

  // Chart data arrays
  const hrvData = chart30.map(e => ({
    date:  chartDate(e.date),
    value: e.sleep.hrv,
  }))

  const sleepData = chart30.map(e => ({
    date:  chartDate(e.date),
    value: durationToH(e.sleep.duration_min),
  }))

  const proteinData = chart30.map(e => ({
    date:  chartDate(e.date),
    value: e.nutrition.total_protein != null ? Math.round(e.nutrition.total_protein) : null,
  }))

  const fiberData = chart30.map(e => ({
    date:  chartDate(e.date),
    value: e.nutrition.total_fiber != null ? Math.round(e.nutrition.total_fiber) : null,
  }))

  const trainingData = chart30.map(e => ({
    date:  chartDate(e.date),
    value: e.training.sessions.length > 0
      ? e.training.sessions.reduce((sum, s) => sum + s.duration_min, 0)
      : null,
  }))

  const CHART_H = 120
  const axisStyle = {
    fontSize: 10,
    fill: '#8FAA98',
    fontFamily: 'DM Mono, monospace',
  }

  if (loading) {
    return (
      <div style={{ paddingTop: 80, textAlign: 'center', fontSize: 10, letterSpacing: '0.2em', color: 'var(--color-text-dim)' }}>
        LOADING
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 32 }}>

      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{ paddingTop: 8 }}>
        <h1
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
            marginBottom: 4,
          }}
        >
          Dashboard
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>
          Today · {new Date(currentDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* ── Score cards — 3-col ───────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8 }}>
        <ScoreCard label="Behavior" score={todayBehavior} bullets={getBehaviorBullets(today)} />
        <ScoreCard label="Outcome"  score={todayOutcome}  bullets={getOutcomeBullets(today)} />
        <TrainingLoadCard status={tlResult.status} colour={tlResult.colour} />
      </div>

      {/* ── No data message ───────────────────────────────────────── */}
      {!hasEnoughData && (
        <div
          style={{
            padding: '20px 16px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📈</div>
          <p style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500, marginBottom: 4 }}>
            Keep logging — trends coming soon
          </p>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Log sleep data on at least 2 days to see your 7-day trends.
          </p>
        </div>
      )}

      {/* ── Trend charts ──────────────────────────────────────────── */}
      {hasEnoughData && (
        <>
          {/* HRV */}
          <ChartCard title="HRV — 30 days">
            <ResponsiveContainer width="100%" height={CHART_H}>
              <LineChart data={hrvData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" tick={axisStyle} />
                <YAxis tick={axisStyle} domain={['auto', 'auto']} />
                <ReferenceLine y={88} stroke="#DCE8E0" strokeDasharray="4 2" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [`${v}ms`, 'HRV']} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#3D9A6B"
                  strokeWidth={2}
                  dot={{ fill: '#3D9A6B', r: 3 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 4 }}>
              — baseline 88ms
            </div>
          </ChartCard>

          {/* Sleep duration */}
          <ChartCard title="Sleep — 30 days">
            <ResponsiveContainer width="100%" height={CHART_H}>
              <BarChart data={sleepData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" tick={axisStyle} />
                <YAxis tick={axisStyle} domain={[0, 10]} />
                <ReferenceLine y={7.5} stroke="#DCE8E0" strokeDasharray="4 2" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [`${v}h`, 'Sleep']} />
                <Bar dataKey="value" fill="#3D9A6B" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 4 }}>
              — target 7h30
            </div>
          </ChartCard>

          {/* Protein */}
          <ChartCard title="Protein — 30 days">
            <ResponsiveContainer width="100%" height={CHART_H}>
              <BarChart data={proteinData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" tick={axisStyle} />
                <YAxis tick={axisStyle} />
                <ReferenceLine y={130} stroke="#DCE8E0" strokeDasharray="4 2" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [`${v}g`, 'Protein']} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]} fill="#3D9A6B" />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 4 }}>
              — target 130g
            </div>
          </ChartCard>

          {/* Fiber */}
          <ChartCard title="Fiber — 30 days">
            <ResponsiveContainer width="100%" height={CHART_H}>
              <BarChart data={fiberData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" tick={axisStyle} />
                <YAxis tick={axisStyle} />
                <ReferenceLine y={30} stroke="#DCE8E0" strokeDasharray="4 2" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [`${v}g`, 'Fiber']} />
                <Bar dataKey="value" fill="#3D9A6B" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 4 }}>
              — target 30g
            </div>
          </ChartCard>

          {/* Training minutes */}
          <ChartCard title="Training minutes — 30 days">
            <ResponsiveContainer width="100%" height={CHART_H}>
              <BarChart data={trainingData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" tick={axisStyle} />
                <YAxis tick={axisStyle} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [`${v}min`, 'Training']} />
                <Bar dataKey="value" fill="#3D9A6B" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 4 }}>
              Total training minutes per day
            </div>
          </ChartCard>

          {/* Training Load expandable card */}
          {(() => {
            const n = tlHistory.length
            const PAD_X = 8, PAD_Y = 8, CHART_W = 280, TL_H = 44
            const maxR = Math.max(...tlHistory.map(p => p.ratio ?? 0), 1.6)
            const xOf = (i: number) => n <= 1 ? PAD_X : PAD_X + (i / (n - 1)) * (CHART_W - 2 * PAD_X)
            const yOf = (v: number) => PAD_Y + TL_H * (1 - v / maxR)
            const opt_y1 = yOf(1.3), opt_y2 = yOf(0.8)

            const BAR_W = 280
            const ZONES = [
              { end: 0.6,  colour: 'var(--color-amber)' },
              { end: 0.8,  colour: 'var(--color-training-easy)' },
              { end: 1.3,  colour: 'var(--color-success)' },
              { end: 1.5,  colour: 'var(--color-amber)' },
              { end: 2.0,  colour: 'var(--color-danger)' },
            ]
            const SCALE_MAX = 2.0
            const ratioX = tlResult.ratio != null ? Math.min(tlResult.ratio, SCALE_MAX) / SCALE_MAX * BAR_W : null

            return (
              <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }}>
                <button
                  type="button"
                  onClick={() => setTlExpanded(prev => !prev)}
                  style={{
                    width: '100%', textAlign: 'left', background: 'none', border: 'none',
                    cursor: 'pointer', padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                >
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: tlResult.colour, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                    Training Load
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500, color: tlResult.colour }}>{tlResult.status}</span>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={`chevron${tlExpanded ? ' open' : ''}`} style={{ flexShrink: 0 }}>
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {tlExpanded && (
                  <div style={{ padding: '0 16px 16px' }}>
                    {/* Acute / Chronic row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                      <div style={{ textAlign: 'center', padding: '8px', background: 'var(--color-bg)', borderRadius: 8 }}>
                        <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: 2 }}>Acute (7d)</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)' }}>{tlResult.acute}</div>
                        <div style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>TSU</div>
                      </div>
                      <div style={{ textAlign: 'center', padding: '8px', background: 'var(--color-bg)', borderRadius: 8 }}>
                        <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: 2 }}>Chronic (28d)</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)' }}>{tlResult.chronic}</div>
                        <div style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>TSU</div>
                      </div>
                    </div>

                    {/* Ratio + spectrum bar */}
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                        <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>Ratio</div>
                        {tlResult.ratio != null && (
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: tlResult.colour }}>
                            {tlResult.ratio.toFixed(2)}
                          </div>
                        )}
                      </div>
                      <svg viewBox={`0 0 ${BAR_W} 30`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
                        {(() => {
                          let x = 0
                          return ZONES.map((z, i) => {
                            const prev = i === 0 ? 0 : ZONES[i - 1].end
                            const w = (z.end - prev) / SCALE_MAX * BAR_W
                            const rect = <rect key={z.end} x={x} y="14" width={w} height="10" fill={z.colour} opacity="0.5" />
                            x += w
                            return rect
                          })
                        })()}
                        {[0.6, 0.8, 1.3, 1.5].map(v => {
                          const cx = v / SCALE_MAX * BAR_W
                          return (
                            <g key={v}>
                              <line x1={cx} y1="12" x2={cx} y2="24" stroke="var(--color-surface)" strokeWidth="1.5" />
                              <text x={cx} y="29" textAnchor="middle" fontSize="7" style={{ fill: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>{v}</text>
                            </g>
                          )
                        })}
                        {ratioX != null && (
                          <>
                            <line x1={ratioX} y1="8" x2={ratioX} y2="14" stroke={tlResult.colour} strokeWidth="1.5" />
                            <circle cx={ratioX} cy="5" r="4" fill={tlResult.colour} />
                          </>
                        )}
                      </svg>
                    </div>

                    {/* 30-day trend */}
                    {n >= 2 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginBottom: 6 }}>30-day trend</div>
                        <svg viewBox={`0 0 ${CHART_W} ${PAD_Y * 2 + TL_H + 12}`} width="100%" style={{ display: 'block' }}>
                          <defs>
                            <clipPath id="dashTlClip">
                              <rect x={PAD_X} y={PAD_Y} width={CHART_W - 2 * PAD_X} height={TL_H} />
                            </clipPath>
                          </defs>
                          <rect x={PAD_X} y={opt_y1} width={CHART_W - 2 * PAD_X} height={Math.max(0, opt_y2 - opt_y1)} fill="var(--color-success)" opacity="0.08" clipPath="url(#dashTlClip)" />
                          {tlHistory.slice(1).map((pt, i) => {
                            const prev = tlHistory[i]
                            return (
                              <line key={pt.date}
                                x1={xOf(i).toFixed(1)} y1={yOf(prev.ratio ?? 0).toFixed(1)}
                                x2={xOf(i + 1).toFixed(1)} y2={yOf(pt.ratio ?? 0).toFixed(1)}
                                stroke={pt.colour} strokeWidth="1.5" strokeLinecap="round"
                              />
                            )
                          })}
                        </svg>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
