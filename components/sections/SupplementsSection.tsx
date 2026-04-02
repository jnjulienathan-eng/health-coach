'use client'

import Section from '@/components/ui/Section'
import type { SupplementEntry } from '@/lib/types'

interface Props {
  supplements: SupplementEntry[]
  onChange: (supplements: SupplementEntry[]) => void
}

const UNITS = ['mg', 'mcg', 'g', 'IU', 'ml', 'drops', 'tablet', 'capsule']
const TIMINGS = ['Morning', 'Pre-workout', 'Post-workout', 'With meals', 'Evening', 'Night']

function newSupplement(): SupplementEntry {
  return { id: crypto.randomUUID(), name: '', dose: null, unit: 'mg', timing: 'Morning' }
}

function buildSummary(supplements: SupplementEntry[]) {
  if (!supplements.length) return undefined
  const names = supplements.slice(0, 3).map((s) => s.name || '?')
  const extra = supplements.length > 3 ? ` +${supplements.length - 3}` : ''
  return names.join(', ') + extra
}

export default function SupplementsSection({ supplements, onChange }: Props) {
  const add = () => onChange([...supplements, newSupplement()])
  const remove = (id: string) => onChange(supplements.filter((s) => s.id !== id))
  const update = (id: string, patch: Partial<SupplementEntry>) =>
    onChange(supplements.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  return (
    <Section title="Supplements" summary={buildSummary(supplements)}>
      <div className="space-y-2">
        {supplements.map((s) => (
          <div
            key={s.id}
            className="grid grid-cols-[1fr_56px_80px_88px_20px] gap-2 items-end"
          >
            <div>
              <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-1">
                Name
              </label>
              <input
                type="text"
                value={s.name}
                onChange={(e) => update(s.id, { name: e.target.value })}
                className="w-full bg-[#0d0d0d] border border-[#1c1c1c] rounded px-2 py-1.5 text-xs font-mono text-[#d4d4d4] focus:outline-none focus:border-[#2a2a2a]"
                placeholder="Name"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-1">
                Dose
              </label>
              <input
                type="number"
                min={0}
                value={s.dose ?? ''}
                onChange={(e) =>
                  update(s.id, {
                    dose: e.target.value === '' ? null : parseFloat(e.target.value),
                  })
                }
                className="w-full bg-[#0d0d0d] border border-[#1c1c1c] rounded px-2 py-1.5 text-xs font-mono text-[#d4d4d4] focus:outline-none focus:border-[#2a2a2a]"
                placeholder="—"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-1">
                Unit
              </label>
              <select
                value={s.unit}
                onChange={(e) => update(s.id, { unit: e.target.value })}
                className="w-full bg-[#0d0d0d] border border-[#1c1c1c] rounded px-2 py-1.5 text-xs font-mono text-[#d4d4d4] focus:outline-none focus:border-[#2a2a2a]"
              >
                {UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-1">
                Timing
              </label>
              <select
                value={s.timing}
                onChange={(e) => update(s.id, { timing: e.target.value })}
                className="w-full bg-[#0d0d0d] border border-[#1c1c1c] rounded px-2 py-1.5 text-xs font-mono text-[#d4d4d4] focus:outline-none focus:border-[#2a2a2a]"
              >
                {TIMINGS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => remove(s.id)}
              className="pb-0.5 text-[#2a2a2a] hover:text-[#f87171] text-xs transition-colors"
            >
              ✕
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={add}
          className="w-full py-2 border border-dashed border-[#1c1c1c] rounded text-xs text-[#2a2a2a] hover:text-[#444] hover:border-[#252525] transition-colors font-mono"
        >
          + add supplement
        </button>
      </div>
    </Section>
  )
}
