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

interface Props {
  today: DailyEntry
  currentDate: string
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
function ScoreCard({ label, score }: { label: string; score: number }) {
  const color = scoreColor(score)
  const word  = scoreLabel(score)
  return (
    <div
      style={{
        flex: 1,
        textAlign: 'center',
        padding: '24px 12px 20px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 16,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 64,
          fontWeight: 400,
          color,
          lineHeight: 1,
        }}
      >
        {score}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color,
          marginTop: 6,
        }}
      >
        {word}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--color-text-dim)',
          marginTop: 4,
        }}
      >
        {label}
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
  const [entries, setEntries] = useState<DailyEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRecentEntries(14)
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

  // 7 most recent days for charts (oldest→newest for left→right display)
  const chart7 = allEntries.slice(0, 7).reverse()

  const hasEnoughData = entriesWithData.length >= 2

  // Chart data arrays
  const hrvData = chart7.map(e => ({
    date:  chartDate(e.date),
    value: e.sleep.hrv,
  }))

  const sleepData = chart7.map(e => ({
    date:  chartDate(e.date),
    value: durationToH(e.sleep.duration_min),
  }))

  const proteinData = chart7.map(e => ({
    date:  chartDate(e.date),
    value: e.nutrition.total_protein != null ? Math.round(e.nutrition.total_protein) : null,
  }))

  const fiberData = chart7.map(e => ({
    date:  chartDate(e.date),
    value: e.nutrition.total_fiber != null ? Math.round(e.nutrition.total_fiber) : null,
  }))

  const trainingData = chart7.map(e => ({
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

      {/* ── Score cards ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12 }}>
        <ScoreCard label="Behavior" score={todayBehavior} />
        <ScoreCard label="Outcome"  score={todayOutcome}  />
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
          <ChartCard title="HRV — 7 days">
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
          <ChartCard title="Sleep — 7 days">
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
          <ChartCard title="Protein — 7 days">
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
          <ChartCard title="Fiber — 7 days">
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

          {/* Training load */}
          <ChartCard title="Training load — 7 days">
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
        </>
      )}
    </div>
  )
}
