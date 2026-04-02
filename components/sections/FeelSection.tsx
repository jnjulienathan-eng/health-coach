'use client'

import Section from '@/components/ui/Section'
import ScoreRating from '@/components/ui/ScoreRating'
import type { FeelData } from '@/lib/types'

interface Props {
  data: FeelData
  onChange: (d: FeelData) => void
}

function buildSummary(data: FeelData) {
  const parts: string[] = []
  if (data.energy) parts.push(`Energy ${data.energy}`)
  if (data.mood) parts.push(`Mood ${data.mood}`)
  return parts.join(' · ') || undefined
}

export default function FeelSection({ data, onChange }: Props) {
  return (
    <Section title="Feel" summary={buildSummary(data)}>
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-2">
            Energy
          </label>
          <ScoreRating
            value={data.energy}
            onChange={(v) => onChange({ ...data, energy: v })}
          />
        </div>
        <div>
          <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-2">
            Mood
          </label>
          <ScoreRating
            value={data.mood}
            onChange={(v) => onChange({ ...data, mood: v })}
          />
        </div>
      </div>
    </Section>
  )
}
