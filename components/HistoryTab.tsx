'use client'

import { useEffect, useState } from 'react'
import { loadRecentCheckins } from '@/lib/db'
import type { CheckinRecord } from '@/lib/types'

interface Props {
  onSelectDate: (date: string) => void
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function isToday(dateStr: string) {
  return dateStr === new Date().toISOString().split('T')[0]
}

export default function HistoryTab({ onSelectDate }: Props) {
  const [checkins, setCheckins] = useState<CheckinRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRecentCheckins(30)
      .then(setCheckins)
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
        NO HISTORY YET
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-[10px] font-mono text-[#444] uppercase tracking-widest mb-4">
        History · last 30 days
      </h2>
      <div className="space-y-1.5">
        {checkins.map((c) => {
          const trainCount = c.training_sessions?.length ?? 0
          const protein = c.meals?.reduce((s, m) => s + (m.protein ?? 0), 0) ?? 0
          const today = isToday(c.date)

          return (
            <button
              key={c.date}
              type="button"
              onClick={() => onSelectDate(c.date)}
              className={`w-full p-3 border rounded-lg hover:bg-[#111111] transition-colors text-left ${
                today
                  ? 'bg-[#0f0f16] border-[#20203a]'
                  : 'bg-[#0f0f0f] border-[#1c1c1c] hover:border-[#202020]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[#777]">{formatDate(c.date)}</span>
                  {today && (
                    <span className="text-[9px] font-mono text-[#818cf8] bg-[#13133a] border border-[#25254a] px-1.5 py-0.5 rounded">
                      today
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-[#222]">›</span>
              </div>

              <div className="flex gap-4">
                {c.sleep?.hrv != null && (
                  <div>
                    <div className="text-[11px] font-mono text-[#4ade80]">{c.sleep.hrv}</div>
                    <div className="text-[9px] font-mono text-[#2a2a2a] uppercase">HRV</div>
                  </div>
                )}
                {c.sleep?.duration != null && (
                  <div>
                    <div className="text-[11px] font-mono text-[#60a5fa]">{c.sleep.duration}h</div>
                    <div className="text-[9px] font-mono text-[#2a2a2a] uppercase">Sleep</div>
                  </div>
                )}
                {c.feel?.energy != null && (
                  <div>
                    <div className="text-[11px] font-mono text-[#fbbf24]">{c.feel.energy}/5</div>
                    <div className="text-[9px] font-mono text-[#2a2a2a] uppercase">Energy</div>
                  </div>
                )}
                {c.feel?.mood != null && (
                  <div>
                    <div className="text-[11px] font-mono text-[#c084fc]">{c.feel.mood}/5</div>
                    <div className="text-[9px] font-mono text-[#2a2a2a] uppercase">Mood</div>
                  </div>
                )}
                {trainCount > 0 && (
                  <div>
                    <div className="text-[11px] font-mono text-[#a78bfa]">{trainCount}</div>
                    <div className="text-[9px] font-mono text-[#2a2a2a] uppercase">Sessions</div>
                  </div>
                )}
                {protein > 0 && (
                  <div>
                    <div className="text-[11px] font-mono text-[#888]">{Math.round(protein)}g</div>
                    <div className="text-[9px] font-mono text-[#2a2a2a] uppercase">Protein</div>
                  </div>
                )}
                {c.context?.flags?.length > 0 && (
                  <div className="ml-auto">
                    <div className="text-[9px] font-mono text-[#3a2a5a]">
                      {c.context.flags.slice(0, 2).join(' · ')}
                    </div>
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
