'use client'

import { useState, useEffect, useCallback } from 'react'
import { loadEntry, saveEntry, isSleepLogged, loadBreakfastTemplates, deriveCycleDay } from '@/lib/db'
import type { BreakfastTemplate } from '@/lib/db'
import { emptyEntry } from '@/lib/types'
import type { DailyEntry } from '@/lib/types'
import SleepSection from '@/components/sections/SleepSection'
import TrainingSection from '@/components/sections/TrainingSection'
import NutritionSection from '@/components/sections/NutritionSection'
import SupplementsSection from '@/components/sections/SupplementsSection'
import ContextSection from '@/components/sections/ContextSection'
import CoachTab from '@/components/CoachTab'
import DashboardTab from '@/components/DashboardTab'
import HistoryTab from '@/components/HistoryTab'

// ─── Date utilities ───────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function yesterdayStr() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

function shiftDay(dateStr: string, delta: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().split('T')[0]
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const isThisYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    ...(isThisYear ? {} : { year: 'numeric' }),
  })
}

// ─── Types ────────────────────────────────────────────────────────
type Tab = 'today' | 'coach' | 'dashboard' | 'history'

// ─── Icons ───────────────────────────────────────────────────────
function IconToday({ active }: { active: boolean }) {
  const c = active ? 'var(--color-primary)' : 'var(--color-text-dim)'
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="3" y="5" width="16" height="14" rx="2" stroke={c} strokeWidth="1.5" />
      <path d="M7 3v4M15 3v4M3 10h16" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconCoach({ active }: { active: boolean }) {
  const c = active ? 'var(--color-primary)' : 'var(--color-text-dim)'
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path
        d="M4 4h14a1 1 0 011 1v9a1 1 0 01-1 1H7l-4 3V5a1 1 0 011-1z"
        stroke={c}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconDashboard({ active }: { active: boolean }) {
  const c = active ? 'var(--color-primary)' : 'var(--color-text-dim)'
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="3" y="13" width="4" height="6" rx="1" stroke={c} strokeWidth="1.5" />
      <rect x="9" y="9"  width="4" height="10" rx="1" stroke={c} strokeWidth="1.5" />
      <rect x="15" y="5" width="4" height="14" rx="1" stroke={c} strokeWidth="1.5" />
    </svg>
  )
}

function IconHistory({ active }: { active: boolean }) {
  const c = active ? 'var(--color-primary)' : 'var(--color-text-dim)'
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="8" stroke={c} strokeWidth="1.5" />
      <path d="M11 7v4l3 2" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const TABS: { id: Tab; label: string; Icon: React.FC<{ active: boolean }> }[] = [
  { id: 'today',     label: 'Today',     Icon: IconToday },
  { id: 'coach',     label: 'Coach',     Icon: IconCoach },
  { id: 'dashboard', label: 'Dashboard', Icon: IconDashboard },
  { id: 'history',   label: 'History',   Icon: IconHistory },
]

// ─── Main app ─────────────────────────────────────────────────────
export default function App() {
  const [activeTab,     setActiveTab]     = useState<Tab>('today')
  const [currentDate,   setCurrentDate]   = useState(todayStr())
  const [entry,         setEntry]         = useState<DailyEntry>(emptyEntry(todayStr()))
  const [templates,     setTemplates]     = useState<BreakfastTemplate[]>([])
  const [loading,       setLoading]       = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [savedSection,  setSavedSection]  = useState<string | null>(null)
  const [cycleDay,      setCycleDay]      = useState<number | null>(null)
  const [showYesterday, setShowYesterday] = useState(false)
  const [skipYesterday, setSkipYesterday] = useState(false)

  const isToday = currentDate === todayStr()

  // Load entry for the current date
  const loadDay = useCallback(async (date: string) => {
    setLoading(true)
    try {
      const data = await loadEntry(date)
      // Auto-derive cycle day for today if not stored yet
      if (date === todayStr() && data.context.stress_level == null && data.context.notes === '') {
        const derived = await deriveCycleDay()
        if (derived != null) setCycleDay(derived)
      } else {
        const cd = (data.context as unknown as Record<string, unknown>).cycle_day
        if (typeof cd === 'number') setCycleDay(cd)
      }
      setEntry(data)
    } catch (e) {
      console.error('Failed to load entry:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDay(currentDate)
  }, [currentDate, loadDay])

  // Load breakfast templates once
  useEffect(() => {
    loadBreakfastTemplates().then(setTemplates).catch(console.error)
  }, [])

  // Check if yesterday's sleep needs completing
  useEffect(() => {
    if (skipYesterday) return
    const yesterday = yesterdayStr()
    isSleepLogged(yesterday).then((logged) => {
      setShowYesterday(!logged)
    })
  }, [skipYesterday, savedSection])

  // Save a section of the entry — always merges cycleDay into context JSONB
  const save = async (sectionName: string) => {
    setSaving(true)
    try {
      const entryToSave: DailyEntry = {
        ...entry,
        context: {
          ...entry.context,
          // Persist cycle day alongside other context fields
          ...( cycleDay != null ? { cycle_day: cycleDay } as Record<string, unknown> : {} ),
        } as DailyEntry['context'],
      }
      await saveEntry(entryToSave)
      setSavedSection(sectionName)
      setTimeout(() => setSavedSection(null), 2000)
    } catch (e) {
      console.error('Failed to save:', e)
    } finally {
      setSaving(false)
    }
  }

  const update = (patch: Partial<DailyEntry>) => {
    setEntry((prev) => ({ ...prev, ...patch }))
  }

  const resetCycleDay = async () => {
    setCycleDay(1)
    const updated = { ...entry, context: { ...entry.context } }
    ;(updated.context as Record<string, unknown>).cycle_day = 1
    setEntry(updated as DailyEntry)
    try {
      await saveEntry(updated as DailyEntry)
    } catch (e) {
      console.error('Failed to save cycle reset:', e)
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--color-bg)', paddingBottom: '72px' }}
    >
      {/* ── Content ────────────────────────────────────────────── */}
      <main
        className="mx-auto w-full"
        style={{ maxWidth: '480px', padding: '20px 20px 0' }}
      >

        {/* ── TODAY TAB ────────────────────────────────────────── */}
        {activeTab === 'today' && (
          <>
            {/* Date navigator */}
            <div
              className="flex items-center justify-between mb-5"
              style={{ minHeight: '48px' }}
            >
              <button
                type="button"
                onClick={() => setCurrentDate(shiftDay(currentDate, -1))}
                aria-label="Previous day"
                style={{
                  width: 36, height: 36,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-text-dim)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 20,
                }}
              >
                ‹
              </button>

              <div className="text-center flex-1">
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    color: 'var(--color-text-primary)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {formatDate(currentDate)}
                </div>
                {!isToday && (
                  <button
                    type="button"
                    onClick={() => setCurrentDate(todayStr())}
                    style={{
                      fontSize: 11,
                      color: 'var(--color-primary)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      marginTop: 2,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    → today
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setCurrentDate(shiftDay(currentDate, 1))}
                disabled={isToday}
                aria-label="Next day"
                style={{
                  width: 36, height: 36,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: isToday ? 'var(--color-border)' : 'var(--color-text-dim)',
                  background: 'none', border: 'none',
                  cursor: isToday ? 'default' : 'pointer',
                  fontSize: 20,
                }}
              >
                ›
              </button>
            </div>

            {/* Yesterday sleep banner */}
            {showYesterday && !skipYesterday && (
              <div className="yesterday-prompt">
                <div>
                  <div className="section-label" style={{ color: 'var(--color-primary)' }}>
                    Complete yesterday&apos;s sleep
                  </div>
                  <div className="text-hint" style={{ marginTop: 2 }}>
                    Log last night&apos;s data to close out {formatDate(yesterdayStr())}
                  </div>
                </div>
                <div className="flex items-center gap-2" style={{ flexShrink: 0, marginLeft: 12 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentDate(yesterdayStr())
                    }}
                    style={{
                      padding: '6px 14px',
                      background: 'var(--color-primary)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Log
                  </button>
                  <button
                    type="button"
                    onClick={() => setSkipYesterday(true)}
                    aria-label="Dismiss"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-dim)',
                      cursor: 'pointer',
                      fontSize: 18,
                      lineHeight: 1,
                      padding: '2px 4px',
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            {/* Sections */}
            {loading ? (
              <div
                className="animate-pulse"
                style={{
                  paddingTop: 80,
                  textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.2em',
                  color: 'var(--color-text-dim)',
                }}
              >
                LOADING
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SleepSection
                  data={entry.sleep}
                  onChange={(sleep) => update({ sleep })}
                  onSave={() => save('sleep')}
                  saving={saving}
                />
                <TrainingSection
                  data={entry.training}
                  onChange={(training) => update({ training })}
                  onSave={() => save('training')}
                  saving={saving}
                />
                <NutritionSection
                  data={entry.nutrition}
                  templates={templates}
                  onChange={(nutrition) => update({ nutrition })}
                  onSave={() => save('nutrition')}
                  saving={saving}
                />
                <SupplementsSection
                  data={entry.supplements}
                  onChange={(supplements) => update({ supplements })}
                  onSave={() => save('supplements')}
                  saving={saving}
                />
                <ContextSection
                  data={entry.context}
                  cycleDay={cycleDay}
                  onChange={(context) => update({ context })}
                  onSave={() => save('context')}
                  onResetCycle={resetCycleDay}
                  saving={saving}
                />
              </div>
            )}

            {/* Saved confirmation */}
            {savedSection && (
              <div
                style={{
                  position: 'fixed',
                  bottom: 88,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'var(--color-primary)',
                  color: '#fff',
                  padding: '8px 20px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 500,
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                ✓ Saved
              </div>
            )}
          </>
        )}

        {/* ── COACH TAB ────────────────────────────────────────── */}
        {activeTab === 'coach' && <CoachTab />}

        {/* ── DASHBOARD TAB ────────────────────────────────────── */}
        {activeTab === 'dashboard' && <DashboardTab />}

        {/* ── HISTORY TAB ──────────────────────────────────────── */}
        {activeTab === 'history' && (
          <HistoryTab
            onSelectDate={(date) => {
              setCurrentDate(date)
              setActiveTab('today')
            }}
          />
        )}
      </main>

      {/* ── Bottom tab bar ───────────────────────────────────────── */}
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 72,
          background: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'stretch',
          zIndex: 50,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {TABS.map(({ id, label, Icon }) => {
          const active = activeTab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: active ? 'var(--color-primary)' : 'var(--color-text-dim)',
                transition: 'color 150ms',
              }}
            >
              <Icon active={active} />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: active ? 500 : 400,
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '0.02em',
                }}
              >
                {label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
