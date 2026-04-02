'use client'

import { useState, useEffect, useCallback } from 'react'
import { loadCheckin, saveCheckin, loadMealTemplates } from '@/lib/db'
import { emptyCheckin } from '@/lib/types'
import type { CheckinRecord, MealTemplate } from '@/lib/types'
import SleepSection from '@/components/sections/SleepSection'
import FeelSection from '@/components/sections/FeelSection'
import TrainingSection from '@/components/sections/TrainingSection'
import NutritionSection from '@/components/sections/NutritionSection'
import SupplementsSection from '@/components/sections/SupplementsSection'
import MindsetSection from '@/components/sections/MindsetSection'
import ContextSection from '@/components/sections/ContextSection'
import CoachTab from '@/components/CoachTab'
import DashboardTab from '@/components/DashboardTab'
import HistoryTab from '@/components/HistoryTab'

type Tab = 'today' | 'coach' | 'dashboard' | 'history'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function shiftDay(dateStr: string, delta: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().split('T')[0]
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'coach', label: 'Coach' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'history', label: 'History' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('today')
  const [currentDate, setCurrentDate] = useState(todayStr())
  const [checkin, setCheckin] = useState<CheckinRecord>(emptyCheckin(todayStr()))
  const [templates, setTemplates] = useState<MealTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

  const loadDay = useCallback(async (date: string) => {
    setLoading(true)
    setDirty(false)
    try {
      const data = await loadCheckin(date)
      setCheckin(data)
    } catch (e) {
      console.error('Failed to load checkin:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDay(currentDate)
  }, [currentDate, loadDay])

  useEffect(() => {
    loadMealTemplates().then(setTemplates).catch(console.error)
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveCheckin(checkin)
      setDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error('Failed to save:', e)
    } finally {
      setSaving(false)
    }
  }

  const update = (patch: Partial<CheckinRecord>) => {
    setCheckin((prev) => ({ ...prev, ...patch }))
    setDirty(true)
  }

  const isToday = currentDate === todayStr()

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-[#e0e0e0]">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-[#181818] bg-[#0d0d0d]">
        <div className="max-w-2xl mx-auto px-4 flex items-center justify-between h-11">
          <span className="text-[10px] font-mono text-[#2a2a2a] tracking-[0.2em] uppercase select-none">
            Northstar
          </span>
          <nav className="flex gap-0.5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-[11px] font-mono rounded transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[#181818] text-[#c0c0c0]'
                    : 'text-[#383838] hover:text-[#666]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        {/* TODAY TAB */}
        {activeTab === 'today' && (
          <>
            {/* Date navigator */}
            <div className="flex items-center justify-between mb-6">
              <button
                type="button"
                onClick={() => setCurrentDate(shiftDay(currentDate, -1))}
                className="w-8 h-8 flex items-center justify-center text-[#2a2a2a] hover:text-[#666] transition-colors text-lg"
              >
                ‹
              </button>
              <div className="text-center">
                <div className="text-sm font-medium text-[#c0c0c0] tracking-wide">
                  {formatDate(currentDate)}
                </div>
                {!isToday && (
                  <button
                    type="button"
                    onClick={() => setCurrentDate(todayStr())}
                    className="text-[10px] font-mono text-[#2a2a2a] hover:text-[#555] mt-0.5 transition-colors"
                  >
                    → today
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setCurrentDate(shiftDay(currentDate, 1))}
                disabled={isToday}
                className="w-8 h-8 flex items-center justify-center text-[#2a2a2a] hover:text-[#666] transition-colors disabled:opacity-20 text-lg"
              >
                ›
              </button>
            </div>

            {loading ? (
              <div className="py-20 text-center text-[10px] font-mono text-[#2a2a2a] tracking-widest animate-pulse">
                LOADING
              </div>
            ) : (
              <div className="space-y-2">
                <SleepSection
                  data={checkin.sleep}
                  onChange={(sleep) => update({ sleep })}
                />
                <FeelSection
                  data={checkin.feel}
                  onChange={(feel) => update({ feel })}
                />
                <TrainingSection
                  sessions={checkin.training_sessions}
                  onChange={(training_sessions) => update({ training_sessions })}
                />
                <NutritionSection
                  meals={checkin.meals}
                  hydration_ml={checkin.hydration_ml}
                  templates={templates}
                  onMealsChange={(meals) => update({ meals })}
                  onHydrationChange={(hydration_ml) => update({ hydration_ml })}
                />
                <SupplementsSection
                  supplements={checkin.supplements}
                  onChange={(supplements) => update({ supplements })}
                />
                <MindsetSection
                  data={checkin.mindset}
                  onChange={(mindset) => update({ mindset })}
                />
                <ContextSection
                  data={checkin.context}
                  onChange={(context) => update({ context })}
                />
              </div>
            )}

            {/* Save bar */}
            {!loading && (
              <div className="mt-6 flex items-center justify-end gap-3">
                {dirty && !saving && (
                  <span className="text-[10px] font-mono text-[#2a2a2a]">unsaved</span>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className={`px-5 py-2 text-xs font-mono rounded border transition-all ${
                    saved
                      ? 'bg-[#0f1a0f] text-[#4ade80] border-[#1a3a1a]'
                      : dirty
                      ? 'bg-[#0f0f18] text-[#818cf8] border-[#20203a] hover:bg-[#13131e]'
                      : 'bg-[#0d0d0d] text-[#252525] border-[#181818] cursor-not-allowed'
                  }`}
                >
                  {saving ? 'Saving...' : saved ? '✓ Saved' : dirty ? 'Save' : 'No changes'}
                </button>
              </div>
            )}
          </>
        )}

        {activeTab === 'coach' && <CoachTab />}

        {activeTab === 'dashboard' && <DashboardTab />}

        {activeTab === 'history' && (
          <HistoryTab
            onSelectDate={(date) => {
              setCurrentDate(date)
              setActiveTab('today')
            }}
          />
        )}
      </main>
    </div>
  )
}
