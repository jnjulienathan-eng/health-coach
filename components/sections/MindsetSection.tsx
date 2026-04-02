'use client'

import Section from '@/components/ui/Section'
import ScoreRating from '@/components/ui/ScoreRating'
import type { MindsetData } from '@/lib/types'

interface Props {
  data: MindsetData
  onChange: (d: MindsetData) => void
}

function buildSummary(data: MindsetData) {
  const parts: string[] = []
  if (data.stress) parts.push(`Stress ${data.stress}`)
  if (data.focus) parts.push(`Focus ${data.focus}`)
  if (data.meditation_minutes) parts.push(`${data.meditation_minutes}min med`)
  return parts.join(' · ') || undefined
}

export default function MindsetSection({ data, onChange }: Props) {
  const set = <K extends keyof MindsetData>(k: K, v: MindsetData[K]) =>
    onChange({ ...data, [k]: v })

  return (
    <Section title="Mindset" summary={buildSummary(data)}>
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-2">
            Stress
          </label>
          <ScoreRating value={data.stress} onChange={(v) => set('stress', v)} />
        </div>
        <div>
          <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-2">
            Focus
          </label>
          <ScoreRating value={data.focus} onChange={(v) => set('focus', v)} />
        </div>
        <div>
          <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-1">
            Meditation
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={data.meditation_minutes ?? ''}
              onChange={(e) =>
                set(
                  'meditation_minutes',
                  e.target.value === '' ? null : parseInt(e.target.value)
                )
              }
              className="w-20 bg-[#0d0d0d] border border-[#1c1c1c] rounded px-2 py-1.5 text-xs font-mono text-[#d4d4d4] focus:outline-none focus:border-[#2a2a2a]"
              placeholder="—"
            />
            <span className="text-[10px] text-[#2a2a2a] font-mono">min</span>
          </div>
        </div>
      </div>
    </Section>
  )
}
