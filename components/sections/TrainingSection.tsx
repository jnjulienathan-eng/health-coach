'use client'

import Section from '@/components/ui/Section'
import type { TrainingSession } from '@/lib/types'

interface Props {
  sessions: TrainingSession[]
  onChange: (sessions: TrainingSession[]) => void
}

const TRAINING_TYPES = [
  'Strength', 'Run', 'Cycle', 'HIIT', 'Walk',
  'Yoga', 'Pilates', 'Swim', 'Mobility', 'Cardio', 'Other',
]

function newSession(): TrainingSession {
  return { id: crypto.randomUUID(), type: 'Strength', duration_minutes: null, rpe: null }
}

function buildSummary(sessions: TrainingSession[]) {
  if (!sessions.length) return undefined
  return sessions
    .map((s) => `${s.type}${s.duration_minutes ? ` ${s.duration_minutes}m` : ''}`)
    .join(', ')
}

export default function TrainingSection({ sessions, onChange }: Props) {
  const add = () => onChange([...sessions, newSession()])
  const remove = (id: string) => onChange(sessions.filter((s) => s.id !== id))
  const update = (id: string, patch: Partial<TrainingSession>) =>
    onChange(sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  return (
    <Section title="Training" summary={buildSummary(sessions)}>
      <div className="space-y-3">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="grid grid-cols-[1fr_72px_56px_20px] gap-2 items-end"
          >
            <div>
              <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-1">
                Type
              </label>
              <select
                value={session.type}
                onChange={(e) => update(session.id, { type: e.target.value })}
                className="w-full bg-[#0d0d0d] border border-[#1c1c1c] rounded px-2 py-1.5 text-xs font-mono text-[#d4d4d4] focus:outline-none focus:border-[#2a2a2a]"
              >
                {TRAINING_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-1">
                Min
              </label>
              <input
                type="number"
                min={0}
                value={session.duration_minutes ?? ''}
                onChange={(e) =>
                  update(session.id, {
                    duration_minutes: e.target.value === '' ? null : parseInt(e.target.value),
                  })
                }
                className="w-full bg-[#0d0d0d] border border-[#1c1c1c] rounded px-2 py-1.5 text-xs font-mono text-[#d4d4d4] focus:outline-none focus:border-[#2a2a2a]"
                placeholder="—"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-1">
                RPE
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={session.rpe ?? ''}
                onChange={(e) =>
                  update(session.id, {
                    rpe: e.target.value === '' ? null : parseInt(e.target.value),
                  })
                }
                className="w-full bg-[#0d0d0d] border border-[#1c1c1c] rounded px-2 py-1.5 text-xs font-mono text-[#d4d4d4] focus:outline-none focus:border-[#2a2a2a]"
                placeholder="—"
              />
            </div>
            <button
              type="button"
              onClick={() => remove(session.id)}
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
          + add session
        </button>
      </div>
    </Section>
  )
}
