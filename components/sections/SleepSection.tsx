'use client'

import Section from '@/components/ui/Section'
import ScoreRating from '@/components/ui/ScoreRating'
import type { SleepData } from '@/lib/types'

interface Props {
  data: SleepData
  onChange: (d: SleepData) => void
}

function NumField({
  label,
  unit,
  value,
  onChange,
  step = 1,
  min = 0,
}: {
  label: string
  unit?: string
  value: number | null
  onChange: (v: number | null) => void
  step?: number
  min?: number
}) {
  return (
    <div>
      <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-1">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          step={step}
          min={min}
          value={value ?? ''}
          onChange={(e) =>
            onChange(e.target.value === '' ? null : parseFloat(e.target.value))
          }
          className="w-full bg-[#0d0d0d] border border-[#1c1c1c] rounded px-2 py-1.5 text-xs font-mono text-[#d4d4d4] focus:outline-none focus:border-[#2a2a2a] placeholder:text-[#1e1e1e]"
          placeholder="—"
        />
        {unit && (
          <span className="text-[10px] text-[#2a2a2a] font-mono whitespace-nowrap">{unit}</span>
        )}
      </div>
    </div>
  )
}

function buildSummary(data: SleepData) {
  const parts: string[] = []
  if (data.duration) parts.push(`${data.duration}h`)
  if (data.hrv) parts.push(`HRV ${data.hrv}`)
  if (data.rhr) parts.push(`RHR ${data.rhr}`)
  if (data.waking_score) parts.push(`Score ${data.waking_score}/5`)
  return parts.join(' · ') || undefined
}

export default function SleepSection({ data, onChange }: Props) {
  const set = <K extends keyof SleepData>(k: K, v: SleepData[K]) =>
    onChange({ ...data, [k]: v })

  return (
    <Section title="Sleep" summary={buildSummary(data)}>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <NumField
          label="Duration"
          unit="hrs"
          value={data.duration}
          onChange={(v) => set('duration', v)}
          step={0.25}
        />
        <NumField label="HRV" unit="ms" value={data.hrv} onChange={(v) => set('hrv', v)} />
        <NumField label="RHR" unit="bpm" value={data.rhr} onChange={(v) => set('rhr', v)} />
        <NumField
          label="Deep sleep"
          unit="min"
          value={data.deep_sleep_minutes}
          onChange={(v) => set('deep_sleep_minutes', v)}
        />
        <NumField
          label="Wake events"
          value={data.wake_events}
          onChange={(v) => set('wake_events', v)}
        />
        <NumField
          label="Resp. rate"
          unit="/min"
          value={data.respiration_rate}
          onChange={(v) => set('respiration_rate', v)}
          step={0.1}
        />
      </div>

      <div className="mb-4">
        <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-2">
          Waking score
        </label>
        <ScoreRating value={data.waking_score} onChange={(v) => set('waking_score', v)} />
      </div>

      <div>
        <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-1">
          Note
        </label>
        <textarea
          value={data.note}
          onChange={(e) => set('note', e.target.value)}
          rows={2}
          className="w-full bg-[#0d0d0d] border border-[#1c1c1c] rounded px-2 py-1.5 text-xs text-[#666] focus:outline-none focus:border-[#2a2a2a] resize-none placeholder:text-[#1e1e1e]"
          placeholder="Sleep notes..."
        />
      </div>
    </Section>
  )
}
