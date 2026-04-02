'use client'

import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { loadRecentCheckins } from '@/lib/db'
import type { CheckinRecord } from '@/lib/types'

const tooltipStyle = {
  contentStyle: {
    background: '#0f0f0f',
    border: '1px solid #1c1c1c',
    borderRadius: 4,
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#888',
  },
  labelStyle: { color: '#444' },
}

function Chart({
  title,
  data,
  dataKey,
  color,
  height = 100,
  domain,
  refLine,
}: {
  title: string
  data: Record<string, unknown>[]
  dataKey: string
  color: string
  height?: number
  domain?: [number, number]
  refLine?: number
}) {
  return (
    <div className="p-4 bg-[#0f0f0f] border border-[#1c1c1c] rounded-lg">
      <div className="text-[10px] font-mono text-[#333] uppercase tracking-widest mb-3">
        {title}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: '#2a2a2a', fontFamily: 'monospace' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: '#2a2a2a', fontFamily: 'monospace' }}
            tickLine={false}
            axisLine={false}
            domain={domain}
          />
          <Tooltip {...tooltipStyle} itemStyle={{ color }} />
          {refLine && (
            <ReferenceLine y={refLine} stroke="#1e1e1e" strokeDasharray="3 3" />
          )}
          <Line
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function MultiChart({
  title,
  data,
  lines,
  height = 100,
  domain,
}: {
  title: string
  data: Record<string, unknown>[]
  lines: { key: string; color: string; label: string }[]
  height?: number
  domain?: [number, number]
}) {
  return (
    <div className="p-4 bg-[#0f0f0f] border border-[#1c1c1c] rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-mono text-[#333] uppercase tracking-widest">{title}</div>
        <div className="flex gap-3">
          {lines.map((l) => (
            <div key={l.key} className="flex items-center gap-1">
              <div className="w-3 h-px" style={{ backgroundColor: l.color }} />
              <span className="text-[9px] font-mono text-[#2a2a2a]">{l.label}</span>
            </div>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: '#2a2a2a', fontFamily: 'monospace' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: '#2a2a2a', fontFamily: 'monospace' }}
            tickLine={false}
            axisLine={false}
            domain={domain}
          />
          <Tooltip {...tooltipStyle} />
          {lines.map((l) => (
            <Line
              key={l.key}
              dataKey={l.key}
              name={l.label}
              stroke={l.color}
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function DashboardTab() {
  const [checkins, setCheckins] = useState<CheckinRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRecentCheckins(14)
      .then((data) => setCheckins([...data].reverse()))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="py-20 text-center text-[10px] font-mono text-[#2a2a2a] tracking-widest animate-pulse">
        LOADING
      </div>
    )
  }

  if (!checkins.length) {
    return (
      <div className="py-20 text-center text-[10px] font-mono text-[#1e1e1e] tracking-widest">
        NO DATA YET
      </div>
    )
  }

  const chartData = checkins.map((c) => ({
    date: c.date.slice(5),
    hrv: c.sleep?.hrv ?? null,
    rhr: c.sleep?.rhr ?? null,
    sleep: c.sleep?.duration ?? null,
    energy: c.feel?.energy ?? null,
    mood: c.feel?.mood ?? null,
    stress: c.mindset?.stress ?? null,
  }))

  const recent = checkins.slice(-7)

  function avg(vals: (number | null | undefined)[]): string {
    const v = vals.filter((x): x is number => x != null)
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—'
  }

  const stats = [
    { label: 'Avg HRV', val: avg(recent.map((c) => c.sleep?.hrv)), unit: 'ms', color: '#4ade80' },
    { label: 'Avg sleep', val: avg(recent.map((c) => c.sleep?.duration)), unit: 'h', color: '#60a5fa' },
    { label: 'Avg energy', val: avg(recent.map((c) => c.feel?.energy)), unit: '/5', color: '#fbbf24' },
    { label: 'Avg RHR', val: avg(recent.map((c) => c.sleep?.rhr)), unit: 'bpm', color: '#a78bfa' },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-[10px] font-mono text-[#444] uppercase tracking-widest">
        Dashboard · last 14 days
      </h2>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-2">
        {stats.map(({ label, val, unit, color }) => (
          <div
            key={label}
            className="p-3 bg-[#0f0f0f] border border-[#1c1c1c] rounded-lg text-center"
          >
            <div className="text-base font-mono" style={{ color }}>
              {val}
              <span className="text-[9px] text-[#2a2a2a] ml-0.5">{unit}</span>
            </div>
            <div className="text-[9px] font-mono text-[#2a2a2a] uppercase tracking-wider mt-1">
              {label}
            </div>
          </div>
        ))}
      </div>

      <Chart
        title="HRV"
        data={chartData}
        dataKey="hrv"
        color="#4ade80"
        height={120}
      />

      <Chart
        title="Sleep duration (h)"
        data={chartData}
        dataKey="sleep"
        color="#60a5fa"
        domain={[4, 10]}
        refLine={8}
      />

      <MultiChart
        title="Energy & Mood"
        data={chartData}
        lines={[
          { key: 'energy', color: '#fbbf24', label: 'Energy' },
          { key: 'mood', color: '#c084fc', label: 'Mood' },
        ]}
        domain={[1, 5]}
      />

      <MultiChart
        title="RHR & Stress"
        data={chartData}
        lines={[
          { key: 'rhr', color: '#a78bfa', label: 'RHR' },
          { key: 'stress', color: '#f87171', label: 'Stress' },
        ]}
      />
    </div>
  )
}
