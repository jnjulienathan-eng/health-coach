'use client'

import Section from '@/components/ui/Section'
import type { ContextData } from '@/lib/types'

interface Props {
  data: ContextData
  onChange: (d: ContextData) => void
}

const FLAGS = [
  'Sick',
  'Stressed',
  'Travel',
  'Period',
  'PMS',
  'Poor sleep',
  'High workload',
  'Event / race',
  'Alcohol',
]

function buildSummary(data: ContextData) {
  const parts: string[] = []
  if (data.cycle_day) parts.push(`Day ${data.cycle_day}`)
  if (data.flags.length) parts.push(data.flags.join(', '))
  return parts.join(' · ') || undefined
}

export default function ContextSection({ data, onChange }: Props) {
  const toggleFlag = (flag: string) => {
    const flags = data.flags.includes(flag)
      ? data.flags.filter((f) => f !== flag)
      : [...data.flags, flag]
    onChange({ ...data, flags })
  }

  return (
    <Section title="Context" summary={buildSummary(data)}>
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-1">
            Cycle day
          </label>
          <input
            type="number"
            min={1}
            max={40}
            value={data.cycle_day ?? ''}
            onChange={(e) =>
              onChange({
                ...data,
                cycle_day: e.target.value === '' ? null : parseInt(e.target.value),
              })
            }
            className="w-20 bg-[#0d0d0d] border border-[#1c1c1c] rounded px-2 py-1.5 text-xs font-mono text-[#d4d4d4] focus:outline-none focus:border-[#2a2a2a]"
            placeholder="—"
          />
        </div>

        <div>
          <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-2">
            Flags
          </label>
          <div className="flex flex-wrap gap-1.5">
            {FLAGS.map((flag) => (
              <button
                key={flag}
                type="button"
                onClick={() => toggleFlag(flag)}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                  data.flags.includes(flag)
                    ? 'bg-[#17121f] text-[#c084fc] border border-[#3a2a5a]'
                    : 'bg-[#0d0d0d] text-[#2a2a2a] border border-[#181818] hover:border-[#222] hover:text-[#444]'
                }`}
              >
                {flag}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-1">
            Note
          </label>
          <textarea
            value={data.note}
            onChange={(e) => onChange({ ...data, note: e.target.value })}
            rows={2}
            className="w-full bg-[#0d0d0d] border border-[#1c1c1c] rounded px-2 py-1.5 text-xs text-[#666] focus:outline-none focus:border-[#2a2a2a] resize-none placeholder:text-[#1e1e1e]"
            placeholder="Context notes..."
          />
        </div>
      </div>
    </Section>
  )
}
