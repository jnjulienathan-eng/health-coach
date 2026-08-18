'use client'

import { useState } from 'react'
import { Syringe } from 'lucide-react'
import type { Glp1Injection } from '@/lib/types'
import Section from '@/components/ui/Section'

const COURSE_LENGTH = 24
const DEFAULT_DOSE_MG = 2.5

// ─── Date helpers (Europe/Berlin day boundary, UTC arithmetic — same
// pattern as getVo2SparklineData's date-window generation) ─────────
function getTodayBerlin(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })
}

function addDaysUTC(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function diffDaysUTC(aStr: string, bStr: string): number {
  const [ay, am, ad] = aStr.split('-').map(Number)
  const [by, bm, bd] = bStr.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000)
}

function mondayOfWeekUTC(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay() // 0 = Sun .. 6 = Sat
  dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -6 : 1 - dow))
  return dt.toISOString().slice(0, 10)
}

// ─── Shared status computation (used by both collapsed badge + grid) ──
interface Glp1Status {
  state: 'none' | 'taken' | 'due' | 'overdue'
  doseNumber: number       // highest injection_number on file, 0 if none
  latestDate: string | null
  nextDueDate: string | null
  daysUntilDue: number     // only meaningful for state === 'due'
}

function computeGlp1Status(injections: Glp1Injection[], today: string): Glp1Status {
  const doseNumber = injections.reduce((max, inj) => Math.max(max, inj.injection_number), 0)
  if (injections.length === 0) {
    return { state: 'none', doseNumber: 0, latestDate: null, nextDueDate: null, daysUntilDue: 0 }
  }
  const latestDate = injections.reduce((max, inj) => (inj.date > max ? inj.date : max), injections[0].date)
  const nextDueDate = addDaysUTC(latestDate, 7)
  const daysSinceLast = diffDaysUTC(today, latestDate)

  let state: Glp1Status['state']
  if (daysSinceLast > 7) state = 'overdue'
  else if (daysSinceLast === 0) state = 'taken'
  else state = 'due'

  return { state, doseNumber, latestDate, nextDueDate, daysUntilDue: Math.max(0, 7 - daysSinceLast) }
}

function StatusBadge({ status }: { status: Glp1Status }) {
  const { bg, fg, label } = (() => {
    switch (status.state) {
      case 'overdue': return { bg: 'var(--color-danger)', fg: '#fff', label: 'Overdue' }
      case 'taken':   return { bg: 'var(--color-success)', fg: '#fff', label: 'Taken this week' }
      case 'due':     return { bg: 'var(--color-amber)', fg: 'var(--color-navy)', label: `Due in ${status.daysUntilDue}d` }
      default:        return { bg: 'var(--color-border)', fg: 'var(--color-text-secondary)', label: 'Not started' }
    }
  })()
  return (
    <span
      style={{
        background: bg,
        color: fg,
        fontSize: 'var(--fs-label)',
        fontWeight: 'var(--fw-bold)',
        letterSpacing: 'var(--ls-label-bold)',
        textTransform: 'uppercase',
        borderRadius: 'var(--radius-full)',
        padding: '3px 10px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

// ─── 28-day grid (4 weeks, Monday-start, ending in today's week) ──
function InjectionGrid({ injections, status, today }: { injections: Glp1Injection[]; status: Glp1Status; today: string }) {
  const gridStart = addDaysUTC(mondayOfWeekUTC(today), -21)
  const days = Array.from({ length: 28 }, (_, i) => addDaysUTC(gridStart, i))
  const injectedDates = new Set(injections.map((inj) => inj.date))
  const monthName = new Date(today + 'T00:00:00').toLocaleDateString('en-US', { month: 'long' })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-sm)' }}>
        <span style={{ fontSize: 'var(--fs-label)', fontWeight: 'var(--fw-bold)', letterSpacing: 'var(--ls-label-bold)', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
          Last 4 Weeks
        </span>
        <span style={{ fontSize: 'var(--fs-label)', fontWeight: 'var(--fw-bold)', color: 'var(--color-text-secondary)' }}>
          {monthName}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 'var(--fs-label-sm)', color: 'var(--color-text-muted)' }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {days.map((date) => {
          const injected = injectedDates.has(date)
          const isToday = date === today
          const isDue = status.nextDueDate === date && !injected
          const isOverdueDay = isDue && status.nextDueDate! < today

          let border = 'none'
          if (!injected) {
            if (isDue && isOverdueDay) border = '2px solid var(--color-danger)'
            else if (isDue) border = '2px solid var(--color-amber)'
            else if (isToday) border = '2px solid var(--color-navy)'
          }

          const dayNum = Number(date.slice(8, 10))

          return (
            <div
              key={date}
              style={{
                position: 'relative',
                aspectRatio: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
                background: injected ? 'var(--color-navy)' : 'transparent',
                border,
                boxSizing: 'border-box',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--fs-label-sm)',
                  fontWeight: injected ? 'var(--fw-bold)' : 'var(--fw-medium)',
                  color: injected ? '#fff' : 'var(--color-text-secondary)',
                }}
              >
                {dayNum}
              </span>
              {injected && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: 3,
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: 'var(--color-amber)',
                  }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)', marginTop: 'var(--space-sm)' }}>
        <LegendItem swatchStyle={{ background: 'var(--color-navy)' }} label="Injected" />
        <LegendItem swatchStyle={{ border: '2px solid var(--color-amber)', boxSizing: 'border-box' }} label="Due" />
        <LegendItem swatchStyle={{ border: '2px solid var(--color-navy)', boxSizing: 'border-box' }} label="Today" />
      </div>
    </div>
  )
}

function LegendItem({ swatchStyle, label }: { swatchStyle: React.CSSProperties; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, height: 12, borderRadius: 'var(--radius-sm)', flexShrink: 0, ...swatchStyle }} />
      <span style={{ fontSize: 'var(--fs-label-sm)', color: 'var(--color-text-secondary)' }}>{label}</span>
    </div>
  )
}

interface Props {
  injections: Glp1Injection[]
  onLog: (params: { date: string; dose_mg?: number }) => Promise<void>
}

export default function Glp1Section({ injections, onLog }: Props) {
  const today = getTodayBerlin()
  const status = computeGlp1Status(injections, today)
  const atCap = status.doseNumber >= COURSE_LENGTH
  const loggedToday = injections.some((inj) => inj.date === today)

  const [logging, setLogging] = useState(false)
  const [logError, setLogError] = useState(false)
  const [showDifferentDate, setShowDifferentDate] = useState(false)
  const [draftDate, setDraftDate] = useState(today)
  const [draftDose, setDraftDose] = useState(String(DEFAULT_DOSE_MG))

  const handleLogToday = async () => {
    setLogError(false)
    setLogging(true)
    try {
      await onLog({ date: today })
    } catch {
      setLogError(true)
    } finally {
      setLogging(false)
    }
  }

  const handleLogDifferentDate = async () => {
    setLogError(false)
    setLogging(true)
    try {
      const dose = draftDose === '' ? undefined : Number(draftDose)
      await onLog({ date: draftDate, dose_mg: dose })
      setShowDifferentDate(false)
      setDraftDate(today)
      setDraftDose(String(DEFAULT_DOSE_MG))
    } catch {
      setLogError(true)
    } finally {
      setLogging(false)
    }
  }

  const summary = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <StatusBadge status={status} />
      <span style={{ fontSize: 'var(--fs-label-sm)', color: 'var(--color-text-secondary)' }}>
        Dose {status.doseNumber} of {COURSE_LENGTH}
      </span>
    </div>
  )

  return (
    <Section
      title="GLP-1"
      rightSlot={summary}
      icon={<Syringe size={18} color="#fff" />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <InjectionGrid injections={injections} status={status} today={today} />

        <button
          type="button"
          onClick={handleLogToday}
          disabled={logging || atCap || loggedToday}
          className="btn-primary"
          style={{
            opacity: atCap || loggedToday ? 0.5 : 1,
            background: logError ? 'var(--color-danger)' : undefined,
          }}
        >
          {logError
            ? 'Save failed — retry'
            : atCap
              ? 'Course complete'
              : loggedToday
                ? 'Logged today ✓'
                : logging
                  ? 'Logging…'
                  : 'Log injection — today'}
        </button>

        {!atCap && !showDifferentDate && (
          <button
            type="button"
            onClick={() => setShowDifferentDate(true)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 'var(--fs-body)',
              color: 'var(--color-text-secondary)',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            Log a different date →
          </button>
        )}

        {showDifferentDate && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', padding: 'var(--space-md)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <div>
              <label style={{ fontSize: 'var(--fs-label)', fontWeight: 'var(--fw-bold)', letterSpacing: 'var(--ls-label-bold)', textTransform: 'uppercase', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
                Date
              </label>
              <input
                type="date"
                value={draftDate}
                max={today}
                onChange={(e) => setDraftDate(e.target.value)}
                style={{ width: '100%', minHeight: 48, fontSize: 'var(--fs-body)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-sm)', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 'var(--fs-label)', fontWeight: 'var(--fw-bold)', letterSpacing: 'var(--ls-label-bold)', textTransform: 'uppercase', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
                Dose (mg)
              </label>
              <input
                type="number"
                step="0.25"
                min="0"
                value={draftDose}
                onChange={(e) => setDraftDose(e.target.value)}
                style={{ width: '100%', minHeight: 48, fontSize: 'var(--fs-body)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-sm)', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button
                type="button"
                onClick={() => setShowDifferentDate(false)}
                className="btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogDifferentDate}
                disabled={logging || !draftDate}
                className="btn-primary"
                style={{ flex: 1 }}
              >
                {logging ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}

// ─── Refill warning sub-card — always visible, rendered by the parent
// directly below <Glp1Section>, not inside it ──────────────────────
export function Glp1RefillCard({ injections }: { injections: Glp1Injection[] }) {
  const highest = injections.reduce((max, inj) => Math.max(max, inj.injection_number), 0)
  const dosesLeft = Math.max(0, COURSE_LENGTH - highest)
  const urgent = dosesLeft <= 4

  return (
    <div
      style={{
        background: urgent ? 'var(--color-danger)' : 'var(--color-navy)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-card)',
        padding: 'var(--space-lg)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-md)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 'var(--fs-label-bold)',
              fontWeight: 'var(--fw-label-bold)',
              letterSpacing: 'var(--ls-label-bold)',
              textTransform: 'uppercase',
              color: urgent ? '#fff' : 'var(--color-amber)',
              marginBottom: 6,
            }}
          >
            {urgent ? 'Refill Reminder — Call Now' : 'Refill Reminder'}
          </div>
          <div style={{ fontSize: 'var(--fs-headline-lg)', fontWeight: 'var(--fw-headline-lg)', color: '#fff', marginBottom: 4 }}>
            Call endocrinologist
          </div>
          <div style={{ fontSize: 'var(--fs-body-md)', color: 'rgba(255,255,255,0.75)' }}>
            Pen runs out at dose 24 — call by dose 20
          </div>
        </div>
        <span
          style={{
            background: 'var(--color-amber)',
            color: 'var(--color-navy)',
            fontSize: 'var(--fs-label-bold)',
            fontWeight: 'var(--fw-label-bold)',
            borderRadius: 'var(--radius-full)',
            padding: '6px 12px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {dosesLeft} doses left
        </span>
      </div>
    </div>
  )
}
