'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis,
  ReferenceLine,
  Tooltip,
} from 'recharts'
import { loadEntry, saveEntry, isSleepLogged, deriveCycleDay, loadRecentEntries, getGoalsData, getVo2SparklineData, saveVo2Reading, saveCardioReading, saveHealthAppointment, fetchHealthAppointments, seedDefaultAppointments, loadAllEntries } from '@/lib/db'
import { emptyEntry, scoreColor, scoreLabel } from '@/lib/types'
import type { DailyEntry, GoalsData, BiomarkerReading, HealthAppointment } from '@/lib/types'
import { computeTrainingLoad, computeTrainingLoadHistory } from '@/lib/trainingLoad'
import { behaviorScore, outcomeScore } from '@/lib/scores'
import SleepSection from '@/components/sections/SleepSection'
import TrainingSection from '@/components/sections/TrainingSection'
import NutritionSection from '@/components/sections/NutritionSection'
import HydrationSection from '@/components/sections/HydrationSection'
import SupplementsSection from '@/components/sections/SupplementsSection'
import ContextSection from '@/components/sections/ContextSection'
import CoachTab from '@/components/CoachTab'
import SplashScreen from '@/components/SplashScreen'

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
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
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
type Tab = 'today' | 'calendar' | 'coach' | 'dashboard'

// ─── Icons ───────────────────────────────────────────────────────
function IconBodyCipher({ active }: { active: boolean }) {
  const c = active ? 'var(--color-primary)' : 'var(--color-text-dim)'
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="7" stroke={c} strokeWidth="1.5" />
      <circle cx="11" cy="11" r="2.5" stroke={c} strokeWidth="1.5" />
      <path d="M11 4v3M11 15v3M4 11h3M15 11h3" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

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
  { id: 'today',    label: 'Today',           Icon: IconToday },
  { id: 'calendar', label: 'Health Calendar', Icon: IconToday },
  { id: 'coach',    label: 'Coach',           Icon: IconCoach },
  { id: 'dashboard',label: 'Dashboard',       Icon: IconDashboard },
]

// ─── Greeting (copied from GoalsTab) ─────────────────────────────

const GREETINGS = {
  wakeup: [
    "Morning. The data's ready when you are.",
    "Another day to collect evidence about yourself.",
    "Sleep's done. Now the interesting part.",
    "Good morning. The body kept score overnight — time to check.",
    "Early. Good. The day hasn't made any demands yet.",
    "Morning, Julie. The goals don't move. Neither do you, apparently. Time to fix that.",
    "The metrics are fresh. So are you, theoretically.",
    "Up before most of Munich. Noted.",
    "Morning. Let's see what last night's sleep bought you.",
    "Another loop around the sun begins. Make it count.",
  ],
  midmorning: [
    "The hard part of the day is either done or ahead of you. Either way, you're here.",
    "Mid-morning. Prime time for protein and decisions.",
    "The morning session is in the books, or it isn't. No judgment — there's still afternoon.",
    "Somewhere between the first coffee and lunch lies your best window. Use it.",
    "Your body is warm. Your options are open.",
    "The morning has happened. What did you make of it?",
    "Still before noon. The day is cooperative.",
    "Post-training window. Feed the work you did, or the work you're about to do.",
    "The muscle doesn't build itself. But you knew that.",
    "Mid-morning check-in. Everything on track, or are we course-correcting?",
  ],
  afternoon: [
    "Afternoon. The day is half-spent and entirely salvageable.",
    "Halfway through. The second half is where most people stop paying attention.",
    "Good afternoon. The boring middle of the day is where habits live.",
    "You've made it to afternoon without catastrophe. Respectable.",
    "The day is longer than it feels. There's still time.",
    "Afternoon slump is a myth you're not buying into.",
    "Mid-afternoon. The decisions you make now are the ones you'll be glad about tonight.",
    "Still plenty of day left. Don't coast.",
    "Afternoon. The goals are the same as this morning. The execution window is smaller.",
    "The day hasn't decided how it ends yet. You have some influence over that.",
  ],
  earlyevening: [
    "The active part of the day is winding down. Time to be deliberate about the rest.",
    "Evening approaching. What you do now sets up how tomorrow starts.",
    "The data for today is mostly written. A few chapters left.",
    "Early evening. The difference between a good day and a great one is often the last few hours.",
    "Getting close to the finish line. Don't trip at the end.",
    "Evening. Protein logged? Sleep coming? Good. Almost there.",
    "The day is entering its final stretch. Make the landing clean.",
    "The hard work is done. Now it's about protecting the recovery.",
    "Almost. Keep the consistency going through to the end.",
    "Evening wind-down. The choices in the next two hours matter more than they look.",
  ],
  endofday: [
    "Late. The day is essentially done. How did it go?",
    "Evening. The score is nearly final.",
    "The logs are mostly in. Rest is the next performance variable.",
    "Wind down well. Tomorrow is already being shaped.",
    "Almost time. Sleep is where the work gets processed.",
    "The day is closing. What it meant depends on what you did with it.",
    "Late evening. The only thing left to optimize is sleep.",
    "You made it to the end of another day. That's the minimum. What else?",
    "The body has been asked a lot today. Time to give it what it needs.",
    "Nearly done. The goal isn't perfection — it's consistency. One more day of it.",
  ],
}

function getGreeting(): string {
  const hour = new Date().getHours()
  let band: keyof typeof GREETINGS
  if (hour < 9) band = 'wakeup'
  else if (hour < 12) band = 'midmorning'
  else if (hour < 17) band = 'afternoon'
  else if (hour < 20) band = 'earlyevening'
  else band = 'endofday'
  const options = GREETINGS[band]
  return options[Math.floor(Math.random() * options.length)]
}

// ─── VO2 Max helpers (copied from GoalsTab) ───────────────────────

const VO2_SCALE_MAX = 50
const VO2_BANDS = [
  { label: 'Poor',      rangeLabel: '<23',   start: 0,  end: 23 },
  { label: 'Fair',      rangeLabel: '23–27', start: 23, end: 28 },
  { label: 'Good',      rangeLabel: '28–32', start: 28, end: 33 },
  { label: 'Excellent', rangeLabel: '33–36', start: 33, end: 37 },
  { label: 'Superior',  rangeLabel: '37–50', start: 37, end: 50 },
]

function vo2NextTier(value: number): string | null {
  if (value < 23) return 'Fair'
  if (value < 28) return 'Good'
  if (value < 33) return 'Excellent'
  if (value < 37) return 'Superior'
  return null
}

function fmtSparkDate(s: string): string {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function buildVo2Sparkline(readings: BiomarkerReading[]): {
  linePath: string
  fillPath: string
  points: { x: number; y: number; value: number; date: string }[]
} {
  const n = readings.length
  if (n === 0) return { linePath: '', fillPath: '', points: [] }

  const PAD_X = 22, PAD_Y = 8, W = 280, CHART_H = 48
  const xOf = (i: number) => n === 1 ? PAD_X : PAD_X + (i / (n - 1)) * (W - 2 * PAD_X)
  const vals = readings.map(r => r.value)
  const minVal = Math.min(...vals), maxVal = Math.max(...vals)
  const range = maxVal - minVal || 1
  const yOf = (v: number) => PAD_Y + CHART_H * (1 - (v - minVal) / range)

  const points = readings.map((r, i) => ({
    x: xOf(i), y: yOf(r.value), value: r.value, date: r.recorded_on,
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const bottom = PAD_Y + CHART_H
  const fillPath = n >= 2
    ? `${linePath} L${points[n - 1].x.toFixed(1)},${bottom} L${points[0].x.toFixed(1)},${bottom} Z`
    : ''

  return { linePath, fillPath, points }
}

// ─── Cardiovascular helpers (copied from GoalsTab) ────────────────

const LDL_SCALE_MAX = 200
const LDL_BANDS = [
  { label: 'Optimal',      rangeLabel: '<100',    start: 0,   end: 100 },
  { label: 'Near optimal', rangeLabel: '100–129', start: 100, end: 130 },
  { label: 'Borderline',   rangeLabel: '130–159', start: 130, end: 160 },
  { label: 'High',         rangeLabel: '160+',    start: 160, end: 200 },
]
const LDL_BAND_COLORS = [
  'var(--color-success)',
  'var(--color-amber)',
  'var(--color-amber)',
  'var(--color-danger)',
]
const HDL_SCALE_MAX = 100
const HDL_BANDS = [
  { label: 'Low',        rangeLabel: '<40',   start: 0,  end: 40  },
  { label: 'Acceptable', rangeLabel: '40–59', start: 40, end: 60  },
  { label: 'Protective', rangeLabel: '60+',   start: 60, end: 100 },
]
const HDL_BAND_COLORS = [
  'var(--color-danger)',
  'var(--color-amber)',
  'var(--color-success)',
]
const RATIO_SCALE_MAX = 5
const RATIO_THRESHOLD = 3.5

function ldlBandIndex(v: number): number {
  if (v < 100) return 0
  if (v < 130) return 1
  if (v < 160) return 2
  return 3
}

function hdlBandIndex(v: number): number {
  if (v < 40) return 0
  if (v < 60) return 1
  return 2
}

function ratioClass(r: number): { label: string; color: string } {
  if (r < 2.5) return { label: 'Optimal',    color: 'var(--color-success)' }
  if (r < 3.5) return { label: 'Good',       color: 'var(--color-success)' }
  if (r < 5)   return { label: 'Borderline', color: 'var(--color-amber)'   }
  return         { label: 'High Risk',  color: 'var(--color-danger)'  }
}

function pairCardioHistory(all: BiomarkerReading[]): { date: string; ratio: number }[] {
  const ldls = all.filter(b => b.marker === 'ldl').sort((a, b) => a.recorded_on.localeCompare(b.recorded_on))
  const hdls = all.filter(b => b.marker === 'hdl')
  if (ldls.length === 0 || hdls.length === 0) return []

  const used = new Set<string>()
  const pairs: { date: string; ratio: number }[] = []
  for (const ldl of ldls) {
    const t = new Date(ldl.recorded_on + 'T00:00:00').getTime()
    let best: BiomarkerReading | null = null
    let bestDiff = Infinity
    for (const h of hdls) {
      if (used.has(h.id)) continue
      const d = Math.abs(new Date(h.recorded_on + 'T00:00:00').getTime() - t)
      if (d < bestDiff) { bestDiff = d; best = h }
    }
    if (best) {
      used.add(best.id)
      pairs.push({ date: ldl.recorded_on, ratio: Number((ldl.value / best.value).toFixed(2)) })
    }
  }
  return pairs
}

function monthsSince(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
}

function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ─── Health Calendar helpers (copied from GoalsTab) ──────────────

const APPT_LABELS: Record<string, string> = {
  dentist:          'Dentist',
  dermatologist:    'Dermatologist',
  gynaecologist:    'Gynaecologist',
  full_bloodwork:   'Full Bloodwork',
  breast_scan:      'Breast Scan',
  thyroid_scan:     'Thyroid Scan',
  bone_density_scan: 'Bone Density Scan',
  colonoscopy:      'Colonoscopy',
  eye_optometrist:  'Eye & Optometrist',
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  const y  = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dy = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dy}T00:00`
}

function nextDueDateFromLast(lastCompleted: string | null, intervalMonths: number): Date | null {
  if (!lastCompleted) return null
  const d = new Date(lastCompleted + 'T00:00:00')
  d.setMonth(d.getMonth() + intervalMonths)
  return d
}

function fmtDueDate(rawStr: string | null, d: Date): string {
  const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  if (rawStr && rawStr.includes('T')) {
    const timePart = rawStr.slice(11, 16)
    if (timePart && timePart !== '00:00') return `${datePart}, ${timePart}`
  }
  return datePart
}

function fmtDate(s: string | null): string {
  if (!s) return 'Not set'
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Score card helpers (copied from DashboardTab) ────────────────

interface TodayScored {
  behavior_score: number | null
  outcome_score:  number | null
  nutrition: { protein: number | null; fiber: number | null; meal_count: number | null } | null
}

function getBehaviorBullets(
  entry: DailyEntry,
  nutrition?: TodayScored['nutrition'],
): { text: string; ok: boolean }[] {
  const bullets: { text: string; ok: boolean }[] = []
  const sup = entry.supplements

  const suppLogged = sup.morning_stack_taken || sup.evening_stack_taken || sup.progesterone_taken || sup.estradiol_taken
  if (suppLogged) {
    const parts = [
      sup.morning_stack_taken && 'AM',
      sup.evening_stack_taken && 'PM',
      sup.progesterone_taken && 'Prog',
      sup.estradiol_taken && 'E2',
    ].filter(Boolean).join(', ')
    bullets.push({ text: `Supplements taken (${parts})`, ok: true })
  } else {
    bullets.push({ text: 'Supplements not logged', ok: false })
  }

  if (entry.sleep.bedtime) {
    const [h, m] = entry.sleep.bedtime.split(':').map(Number)
    const diff = Math.abs(h * 60 + m - (21 * 60 + 45))
    if (diff <= 30) {
      bullets.push({ text: `Bedtime on target (${entry.sleep.bedtime})`, ok: true })
    } else {
      bullets.push({ text: `Bedtime off target (${entry.sleep.bedtime}, target 21:45)`, ok: false })
    }
  } else {
    bullets.push({ text: 'Bedtime not logged', ok: false })
  }

  if (nutrition != null && (nutrition.meal_count ?? 0) > 0) {
    const p = nutrition.protein
    const f = nutrition.fiber
    const parts = [
      p != null && `${Math.round(p)}g protein`,
      f != null && `${Math.round(f)}g fiber`,
    ].filter(Boolean).join(', ')
    const ok = (p == null || p >= 130) && (f == null || f >= 30)
    bullets.push({ text: `Nutrition: ${parts || 'logged'}`, ok })
  } else {
    bullets.push({ text: 'Nutrition not logged', ok: false })
  }

  return bullets
}

function getOutcomeBullets(entry: DailyEntry): { text: string; ok: boolean }[] {
  const bullets: { text: string; ok: boolean }[] = []

  if (entry.sleep.hrv != null) {
    const hrv = entry.sleep.hrv
    bullets.push({ text: `HRV ${hrv}ms — ${hrv >= 88 ? 'above baseline' : 'below baseline'}`, ok: hrv >= 88 })
  }

  if (entry.sleep.duration_min != null) {
    const h = Math.floor(entry.sleep.duration_min / 60)
    const m = entry.sleep.duration_min % 60
    const ok = entry.sleep.duration_min >= 450 && entry.sleep.duration_min <= 510
    bullets.push({ text: `Sleep ${h}h ${m}m — ${ok ? 'on target' : entry.sleep.duration_min < 450 ? 'below target' : 'over target'}`, ok })
  }

  if (entry.sleep.rested != null) {
    bullets.push({ text: `Rested ${entry.sleep.rested}/5`, ok: entry.sleep.rested >= 4 })
  }

  return bullets
}

function ScoreCard({ label, score, bullets }: { label: string; score: number; bullets?: { text: string; ok: boolean }[] }) {
  const color = scoreColor(score)
  const word  = scoreLabel(score)
  return (
    <div
      style={{
        flex: 1,
        textAlign: 'center',
        padding: '14px 8px 12px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
      }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 40, fontWeight: 700, color, lineHeight: 1 }}>
        {score}
      </div>
      <div style={{ fontSize: 11, fontWeight: 500, color, marginTop: 4 }}>{word}</div>
      <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginTop: 3 }}>
        {label}
      </div>
      {bullets && bullets.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border)', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {bullets.map((b, i) => (
            <div key={i} style={{ fontSize: 10, lineHeight: 1.4, color: b.ok ? 'var(--color-text-secondary)' : 'var(--color-text-dim)', display: 'flex', gap: 4 }}>
              <span style={{ flexShrink: 0 }}>{b.ok ? '✓' : '✗'}</span>
              <span>{b.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TrainingLoadCard({ status, colour, acute, chronic, ratio, daysOfData }: {
  status: string
  colour: string
  acute: number | null
  chronic: number | null
  ratio: number | null
  daysOfData: number
}) {
  const isBaseline = status === 'Establishing baseline'
  return (
    <div style={{
      flex: 1,
      textAlign: 'center',
      padding: '14px 8px 12px',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: colour }} />
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, color: colour, lineHeight: 1.3 }}>{status}</div>
      <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginTop: 3 }}>
        Training Load
      </div>
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border)', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {isBaseline ? (
          <div style={{ fontSize: 10, lineHeight: 1.4, color: 'var(--color-text-dim)' }}>
            Building baseline — check back in {Math.max(0, 28 - daysOfData)} days
          </div>
        ) : (
          <>
            <div style={{ fontSize: 10, lineHeight: 1.4, color: 'var(--color-text-secondary)' }}>· Acute (7d): {acute} TSU</div>
            <div style={{ fontSize: 10, lineHeight: 1.4, color: 'var(--color-text-secondary)' }}>· Chronic (28d): {chronic} TSU</div>
            <div style={{ fontSize: 10, lineHeight: 1.4, color: 'var(--color-text-secondary)' }}>· Ratio: {ratio?.toFixed(2) ?? '—'}</div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Dashboard chart helpers (copied from DashboardTab) ──────────

function chartDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
}

function durationToH(min: number | null): number | null {
  if (min == null) return null
  return Math.round((min / 60) * 10) / 10
}

const tooltipStyle = {
  background: 'var(--color-surface)',
  border: '1px solid #DCE8E0',
  borderRadius: 8,
  fontSize: 12,
  fontFamily: 'DM Mono, monospace',
  color: '#1A2E22',
}
const tooltipItemStyle  = { color: '#1A2E22' }
const tooltipLabelStyle = { color: '#5A7A66', marginBottom: 2 }

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '16px 16px 12px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-text-secondary)',
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

// ─── History helpers (copied from HistoryTab) ─────────────────────

function historyFormatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const isThisYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month:   'short',
    day:     'numeric',
    ...(isThisYear ? {} : { year: 'numeric' }),
  })
}

function activityEmoji(type: string): string {
  switch (type.toLowerCase()) {
    case 'run': case 'running': case 'outdoor run': case 'indoor run':
      return '🏃'
    case 'walk': case 'outdoor walk': case 'indoor walk':
      return '🚶'
    case 'cycling': case 'outdoor cycling': case 'indoor cycling':
      return '🚴'
    case 'swim': case 'swimming': case 'pool swimming': case 'open water swimming':
      return '🏊'
    case 'strength': case 'egym': case 'strength training': case 'functional strength training':
      return '🏋️'
    case 'rowing':    return '🚣'
    case 'elliptical': return '〇'
    case 'yoga': case 'pilates': return '🧘'
    case 'hiking':    return '🥾'
    case 'hiit':      return '⚡'
    default:          return '🏅'
  }
}

function durationStr(min: number | null): string {
  if (min == null) return '?'
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}m`
}

function ScorePill({ score, label }: { score: number; label: string }) {
  const color = scoreColor(score)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 44 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 400, color, lineHeight: 1 }}>
        {score}
      </span>
      <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginTop: 2 }}>
        {label}
      </span>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
      <span style={{ minWidth: 90, fontSize: 10, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-dim)', paddingTop: 1 }}>
        {label}
      </span>
      <span style={{ color: 'var(--color-text-primary)', lineHeight: 1.4 }}>{value}</span>
    </div>
  )
}

function EntryDetail({ entry }: { entry: DailyEntry }) {
  const s   = entry.sleep
  const t   = entry.training
  const n   = entry.nutrition
  const sup = entry.supplements
  const c   = entry.context

  const sleepParts = [
    s.duration_min != null ? durationStr(s.duration_min) : null,
    s.hrv    != null ? `HRV ${s.hrv}ms`        : null,
    s.rhr    != null ? `RHR ${s.rhr}bpm`       : null,
    s.rested != null ? `Rested ${s.rested}/5`  : null,
    s.bedtime        ? `Bed ${s.bedtime}`       : null,
  ].filter(Boolean).join(' · ')

  const trainParts = t.sessions.length > 0
    ? t.sessions.map(sess =>
        `${activityEmoji(sess.activity_type)} ${sess.activity_type} ${sess.duration_min}min${sess.zone3_plus_minutes != null ? ` z3+:${sess.zone3_plus_minutes}m` : ''}`
      ).join('  ')
    : null

  const nutParts = [
    n.total_protein  != null ? `Protein ${Math.round(n.total_protein)}g`   : null,
    n.total_fiber    != null ? `Fiber ${Math.round(n.total_fiber)}g`       : null,
    n.total_fat      != null ? `Fat ${Math.round(n.total_fat)}g`           : null,
    n.total_carbs    != null ? `Carbs ${Math.round(n.total_carbs)}g`       : null,
    n.total_calories != null ? `${Math.round(n.total_calories)}kcal`       : null,
  ].filter(Boolean).join(' · ')

  const supParts = [
    sup.morning_stack_taken ? 'AM ✓'   : null,
    sup.evening_stack_taken ? 'PM ✓'   : null,
    sup.progesterone_taken  ? 'Prog ✓' : null,
    sup.estradiol_taken     ? 'E2 ✓'   : null,
  ].filter(Boolean).join(' · ')

  const ctxParts = [
    (c as unknown as Record<string,unknown>).cycle_day != null
      ? `Day ${(c as unknown as Record<string,unknown>).cycle_day}`
      : null,
    c.symptoms.length > 0 ? c.symptoms.join(', ') : null,
    c.travelling           ? 'Travelling'          : null,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px 14px', background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)' }}>
      <DetailRow label="Sleep"    value={sleepParts || null} />
      <DetailRow label="Training" value={trainParts || (t.cycled_today ? '🚴 Cycled' : 'Rest day')} />
      <DetailRow label="Nutrition"    value={nutParts || null} />
      {supParts && <DetailRow label="Supplements" value={supParts} />}
      {ctxParts && <DetailRow label="Context"     value={ctxParts} />}
      {c.notes   && <DetailRow label="Notes"      value={`"${c.notes}"`} />}
    </div>
  )
}

function HistoryRow({ entry, onSelectDate }: { entry: DailyEntry; onSelectDate: (date: string) => void }) {
  const [expanded, setExpanded] = useState(false)

  const bScore = behaviorScore(entry)
  const oScore = outcomeScore(entry)
  const hasSleep = entry.sleep.hrv != null || entry.sleep.duration_min != null

  const sessionIcons = entry.training.sessions.map(s => activityEmoji(s.activity_type)).join(' ')

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '14px 14px', background: 'none', border: 'none', cursor: 'pointer', gap: 12, textAlign: 'left' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>
            {historyFormatDate(entry.date)}
          </div>
          {(sessionIcons || entry.training.cycled_today) && (
            <div style={{ fontSize: 15, marginTop: 4, letterSpacing: 2 }}>
              {sessionIcons}
              {entry.training.cycled_today && ' 🚴'}
            </div>
          )}
        </div>
        {hasSleep ? (
          <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
            <ScorePill score={bScore} label="Behav" />
            <ScorePill score={oScore} label="Outc"  />
          </div>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--color-text-dim)', flexShrink: 0 }}>No sleep logged</span>
        )}
        <span style={{ fontSize: 16, color: 'var(--color-text-dim)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 200ms', flexShrink: 0 }}>
          ›
        </span>
      </button>
      {expanded && <EntryDetail entry={entry} />}
      {expanded && (
        <div style={{ padding: '8px 14px 12px', background: 'var(--color-bg)', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)' }}>
          <button
            type="button"
            onClick={() => onSelectDate(entry.date)}
            style={{ fontSize: 12, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', padding: 0 }}
          >
            Edit this day →
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main app ─────────────────────────────────────────────────────
export default function App() {
  const [showSplash,    setShowSplash]    = useState(true)
  const [activeTab,     setActiveTab]     = useState<Tab>('today')
  const [currentDate,   setCurrentDate]   = useState(todayStr())
  const [entry,         setEntry]         = useState<DailyEntry>(emptyEntry(todayStr()))
  const [loading,       setLoading]       = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [savedSection,  setSavedSection]  = useState<string | null>(null)
  const [cycleDay,      setCycleDay]      = useState<number | null>(null)
  const [showYesterday, setShowYesterday] = useState(false)
  const [skipYesterday, setSkipYesterday] = useState(false)
  const loadedDateRef = useRef<string | null>(null)

  // ── Score cards state (from DashboardTab) ───────────────────────
  const [todayScored,  setTodayScored]  = useState<TodayScored | null>(null)
  const [dashEntries,  setDashEntries]  = useState<DailyEntry[]>([])

  // ── Goals data + VO2 state (from GoalsTab) ───────────────────────
  const [goalsData,            setGoalsData]            = useState<GoalsData | null>(null)
  const [greeting]                                       = useState(() => getGreeting())
  const [vo2Expanded,          setVo2Expanded]          = useState(false)
  const [vo2Sparkline,         setVo2Sparkline]         = useState<BiomarkerReading[]>([])
  const [vo2SparklineLoaded,   setVo2SparklineLoaded]   = useState(false)
  const [vo2EntryOpen,         setVo2EntryOpen]         = useState(false)
  const [vo2EntryValue,        setVo2EntryValue]        = useState('')
  const [vo2EntryDate,         setVo2EntryDate]         = useState('')
  const [vo2Saving,            setVo2Saving]            = useState(false)

  // ── Cardio state (from GoalsTab) ─────────────────────────────────
  const [cardioExpanded,  setCardioExpanded]  = useState(false)
  const [cardioEntryOpen, setCardioEntryOpen] = useState(false)
  const [cardioLdlValue,  setCardioLdlValue]  = useState('')
  const [cardioHdlValue,  setCardioHdlValue]  = useState('')
  const [cardioEntryDate, setCardioEntryDate] = useState('')
  const [cardioSaving,    setCardioSaving]    = useState(false)

  // ── Health Calendar state (from GoalsTab) ─────────────────────────
  const [editingId,         setEditingId]         = useState<string | null>(null)
  const [editLastCompleted, setEditLastCompleted] = useState('')
  const [editNextDue,       setEditNextDue]       = useState('')
  const [editNotes,         setEditNotes]         = useState('')
  const [apptSaving,        setApptSaving]        = useState(false)

  // ── Dashboard + History state ──────────────────────────────────────
  const [dashTlExpanded,      setDashTlExpanded]      = useState(false)
  const [historyEntries,      setHistoryEntries]      = useState<DailyEntry[]>([])
  const [historyLoading,      setHistoryLoading]      = useState(true)
  const [historyError,        setHistoryError]        = useState<string | null>(null)
  // Keyed by YYYY-MM-DD — sourced from daily_nutrition_summary via /api/nutrition/chart.
  // Never derived from legacy daily_entries nutrition columns.
  const [nutritionSummaries,  setNutritionSummaries]  = useState<Record<string, { protein: number | null; fiber: number | null }>>({})

  const isToday = currentDate === todayStr()

  // Load entry for the current date.
  // Shows the loading spinner only when switching to a date not yet loaded —
  // silent re-fetches (same date, on focus, on tab re-select) keep existing
  // session data visible until the fresh data arrives.
  const loadDay = useCallback(async (date: string) => {
    const isNewDate = loadedDateRef.current !== date
    if (isNewDate) setLoading(true)
    try {
      const data = await loadEntry(date)
      // Auto-derive cycle day for today if not stored yet
      if (date === todayStr() && data.context.notes === '') {
        const derived = await deriveCycleDay()
        if (derived != null) setCycleDay(derived)
      } else {
        const cd = (data.context as unknown as Record<string, unknown>).cycle_day
        if (typeof cd === 'number') setCycleDay(cd)
      }
      loadedDateRef.current = date
      setEntry(data)
    } catch (e) {
      console.error('Failed to load entry:', e)
    } finally {
      if (isNewDate) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDay(currentDate)
  }, [currentDate, loadDay])

  // Silent re-fetch when the browser tab / app regains focus.
  // loadDay is a no-op loader (no spinner) when currentDate is already loaded.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadDay(currentDate)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [currentDate, loadDay])

  // Check if yesterday's sleep needs completing
  useEffect(() => {
    if (skipYesterday) return
    const yesterday = yesterdayStr()
    isSleepLogged(yesterday).then((logged) => {
      setShowYesterday(!logged)
    })
  }, [skipYesterday, savedSection])

  // Load recent entries + scores for Today tab score cards (from DashboardTab)
  useEffect(() => {
    Promise.all([
      loadRecentEntries(30),
      fetch(`/api/scores?date=${currentDate}`).then(r => r.json() as Promise<TodayScored>),
      fetch('/api/nutrition/chart?days=31').then(r => r.json() as Promise<Array<{ date: string; protein: number | null; fiber: number | null }>>),
    ])
      .then(([recent, scored, nutRows]) => {
        setDashEntries(recent)
        setTodayScored(scored)
        // Build a map keyed by plain YYYY-MM-DD string — no new Date() conversion so
        // there is no UTC-vs-Berlin timezone shift on the most-recent entries.
        const nutMap: Record<string, { protein: number | null; fiber: number | null }> = {}
        for (const row of nutRows) {
          nutMap[row.date.slice(0, 10)] = { protein: row.protein, fiber: row.fiber }
        }
        setNutritionSummaries(nutMap)
      })
      .catch(console.error)
  }, [currentDate])

  // Load goals data for long-term goals + health calendar (from GoalsTab)
  useEffect(() => {
    getGoalsData()
      .then(async d => {
        if (d.appointments.length === 0) {
          try {
            await seedDefaultAppointments()
            const fresh = await fetchHealthAppointments()
            d = { ...d, appointments: fresh }
          } catch (e) {
            console.error('Seed/fetch appointments error:', JSON.stringify(e))
          }
        }
        setGoalsData(d)
      })
      .catch(e => console.error('Goals data load error:', e))
  }, [])

  // Load all entries for History section in Dashboard tab (from HistoryTab)
  useEffect(() => {
    loadAllEntries()
      .then(setHistoryEntries)
      .catch(e => setHistoryError(e instanceof Error ? e.message : 'Failed to load history'))
      .finally(() => setHistoryLoading(false))
  }, [])

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
      // Recompute scores server-side (reads daily_nutrition_summary via service-role).
      fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: entryToSave.date }),
      }).catch(console.error)
      setSavedSection(sectionName)
      setTimeout(() => setSavedSection(null), 2000)
    } catch (e) {
      console.error('Failed to save:', JSON.stringify(e))
      throw e
    } finally {
      setSaving(false)
    }
  }

  const update = (patch: Partial<DailyEntry>) => {
    setEntry((prev) => ({ ...prev, ...patch }))
  }

  // ── Today tab — score card derived values (from DashboardTab) ───
  const scoreAllEntries = (() => {
    const without = dashEntries.filter(e => e.date !== currentDate)
    return [entry, ...without].sort((a, b) => (a.date < b.date ? 1 : -1))
  })()
  const todayBehavior = todayScored?.behavior_score ?? 0
  const todayOutcome  = todayScored?.outcome_score  ?? 0
  const scoreTlResult = computeTrainingLoad(scoreAllEntries)

  // ── Today tab — long-term goals derived values (from GoalsTab) ───
  const goalsLatestBiomarker = (marker: string) =>
    goalsData?.biomarkers.find(b => b.marker === marker) ?? null
  const vo2Max     = goalsLatestBiomarker('vo2_max')
  const ldl        = goalsLatestBiomarker('ldl')
  const hdl        = goalsLatestBiomarker('hdl')
  const hba1c      = goalsLatestBiomarker('hba1c')
  const validGlucose = (goalsData?.fastingGlucose7d ?? []).filter((v): v is number => v != null)
  const glucoseAvg = validGlucose.length > 0
    ? validGlucose.reduce((a, b) => a + b, 0) / validGlucose.length
    : null

  // ── VO2 Max card handlers (from GoalsTab) ─────────────────────────
  async function handleVo2Toggle() {
    if (vo2Expanded) {
      setVo2Expanded(false)
      setVo2EntryOpen(false)
      return
    }
    setVo2Expanded(true)
    if (!vo2SparklineLoaded) {
      try {
        const sparkline = await getVo2SparklineData()
        setVo2Sparkline(sparkline)
        setVo2SparklineLoaded(true)
      } catch (e) {
        console.error('VO2 sparkline load error:', e)
      }
    }
  }

  function openVo2Entry(e: React.MouseEvent) {
    e.stopPropagation()
    setVo2EntryValue(vo2Max ? String(vo2Max.value) : '')
    setVo2EntryDate(new Date().toISOString().split('T')[0])
    setVo2EntryOpen(true)
  }

  async function handleSaveVo2(e: React.MouseEvent) {
    e.stopPropagation()
    const val = parseFloat(vo2EntryValue)
    if (isNaN(val)) return
    setVo2Saving(true)
    try {
      await saveVo2Reading(val, vo2EntryDate)
      const [fresh, sparkline] = await Promise.all([
        getGoalsData(),
        getVo2SparklineData(),
      ])
      setGoalsData(fresh)
      setVo2Sparkline(sparkline)
      setVo2SparklineLoaded(true)
      setVo2EntryOpen(false)
    } catch (err) {
      console.error('Save VO2 reading error:', err)
    } finally {
      setVo2Saving(false)
    }
  }

  // ── Cardiovascular card handlers (from GoalsTab) ──────────────────
  function handleCardioToggle() {
    setCardioExpanded(prev => {
      if (prev) setCardioEntryOpen(false)
      return !prev
    })
  }

  function openCardioEntry(e: React.MouseEvent) {
    e.stopPropagation()
    setCardioLdlValue(ldl ? String(ldl.value) : '')
    setCardioHdlValue(hdl ? String(hdl.value) : '')
    setCardioEntryDate(new Date().toISOString().split('T')[0])
    setCardioEntryOpen(true)
    setCardioExpanded(true)
  }

  async function handleSaveCardio(e: React.MouseEvent) {
    e.stopPropagation()
    const ldlN = parseFloat(cardioLdlValue)
    const hdlN = parseFloat(cardioHdlValue)
    if (isNaN(ldlN) || isNaN(hdlN) || !cardioEntryDate) return
    setCardioSaving(true)
    try {
      await saveCardioReading(ldlN, hdlN, cardioEntryDate)
      const fresh = await getGoalsData()
      setGoalsData(fresh)
      setCardioEntryOpen(false)
    } catch (err) {
      console.error('Save cardio reading error:', err)
    } finally {
      setCardioSaving(false)
    }
  }

  // ── Health Calendar derived values (from GoalsTab) ───────────────
  const now = new Date()
  const fourMonthsOut = new Date(now)
  fourMonthsOut.setMonth(fourMonthsOut.getMonth() + 4)

  const allAppts = [...(goalsData?.appointments ?? [])].sort((a, b) => {
    if (!a.next_due_date && !b.next_due_date) return 0
    if (!a.next_due_date) return 1
    if (!b.next_due_date) return -1
    return a.next_due_date < b.next_due_date ? -1 : 1
  })

  function isApptDimmed(appt: HealthAppointment): boolean {
    if (appt.interval_months <= 6) return false
    if (!appt.last_completed_date) return false
    if (!appt.next_due_date) return true
    return new Date(appt.next_due_date + 'T00:00:00') > fourMonthsOut
  }

  // ── Health Calendar handlers (from GoalsTab) ──────────────────────
  function startEdit(appt: HealthAppointment) {
    setEditingId(appt.id)
    setEditLastCompleted(appt.last_completed_date ?? '')
    const nd = appt.next_due_date ?? ''
    setEditNextDue(nd ? (nd.includes('T') ? nd.slice(0, 16) : nd + 'T00:00') : '')
    setEditNotes(appt.notes ?? '')
  }

  async function handleMarkDone(appt: HealthAppointment) {
    const today = new Date().toISOString().split('T')[0]
    const nextDue = addMonths(today, appt.interval_months)
    setApptSaving(true)
    try {
      await saveHealthAppointment({ id: appt.id, last_completed_date: today, next_due_date: nextDue })
      const fresh = await fetchHealthAppointments()
      setGoalsData(prev => prev ? { ...prev, appointments: fresh } : prev)
      setEditingId(null)
    } catch (e) {
      console.error('Mark done error:', e)
    } finally {
      setApptSaving(false)
    }
  }

  async function handleSaveAppt(appt: HealthAppointment) {
    setApptSaving(true)
    try {
      const nextDue = editNextDue || (editLastCompleted ? addMonths(editLastCompleted, appt.interval_months) : null)
      await saveHealthAppointment({
        id: appt.id,
        last_completed_date: editLastCompleted || null,
        next_due_date: nextDue,
        notes: editNotes || null,
      })
      const fresh = await fetchHealthAppointments()
      setGoalsData(prev => prev ? { ...prev, appointments: fresh } : prev)
      setEditingId(null)
    } catch (e) {
      console.error('Save appointment error:', e)
    } finally {
      setApptSaving(false)
    }
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
      style={{ background: 'var(--color-bg)', paddingBottom: 'calc(72px + env(safe-area-inset-bottom))' }}
    >
      {showSplash && <SplashScreen onDismiss={() => setShowSplash(false)} />}

      {/* ── Content ────────────────────────────────────────────── */}
      <main
        className="mx-auto w-full"
        style={{ maxWidth: '480px', padding: '20px 20px 0', isolation: 'isolate' }}
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

            {/* Greeting (from GoalsTab) */}
            <div style={{
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              marginBottom: 16,
              lineHeight: 1.45,
            }}>
              {greeting}
            </div>

            {/* Score cards (from DashboardTab) */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 16 }}>
              <ScoreCard label="Behavior" score={todayBehavior} bullets={getBehaviorBullets(entry, todayScored?.nutrition)} />
              <ScoreCard label="Outcome"  score={todayOutcome}  bullets={getOutcomeBullets(entry)} />
              <TrainingLoadCard
                status={scoreTlResult.status}
                colour={scoreTlResult.colour}
                acute={scoreTlResult.acute}
                chronic={scoreTlResult.chronic}
                ratio={scoreTlResult.ratio}
                daysOfData={scoreAllEntries.length}
              />
            </div>

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
                  currentDate={currentDate}
                  sessions={entry.training.sessions}
                />
                <HydrationSection
                  data={entry.hydration_ml}
                  sessions={entry.training.sessions}
                  onChange={(hydration_ml) => update({ hydration_ml })}
                  onSave={() => save('hydration')}
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
                  onCycleDayChange={setCycleDay}
                  saving={saving}
                />
              </div>
            )}

            {/* Long-term Goals (from GoalsTab — VO2 Max, Cardiovascular, Glucose Stability) */}
            <div className="section-label" style={{ paddingLeft: 4, marginTop: 16 }}>
              Long-term Goals
            </div>

            {/* VO2 Max card */}
            <div className="card" style={{ padding: 0, marginTop: 8 }}>
              <button
                type="button"
                onClick={handleVo2Toggle}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M9 3v8M5 7C3 7.5 2 9 2 11a3 3 0 003 3h2V7M13 7c2 .5 3 2 3 4a3 3 0 01-3 3h-2V7"
                    stroke="var(--color-primary)"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  VO₂ Max
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                  {vo2Max ? `${vo2Max.value} ml/kg/min` : 'Not yet logged'}
                </span>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={`chevron${vo2Expanded ? ' open' : ''}`} style={{ flexShrink: 0 }}>
                  <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {vo2Expanded && (
                <div style={{ padding: '0 16px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: 4 }}>
                        VO₂ max
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <button
                          type="button"
                          onClick={openVo2Entry}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            fontFamily: 'var(--font-mono)',
                            fontSize: vo2Max ? 36 : 15,
                            fontWeight: 700,
                            lineHeight: 1,
                            color: vo2Max ? 'var(--color-text-primary)' : 'var(--color-text-dim)',
                          }}
                        >
                          {vo2Max ? vo2Max.value : 'Not yet logged'}
                        </button>
                        {vo2Max && <span style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>ml/kg/min</span>}
                      </div>
                    </div>
                    {vo2Max && vo2NextTier(vo2Max.value) && (
                      <div style={{
                        background: 'var(--color-primary-light)',
                        color: 'var(--color-primary-dark)',
                        borderRadius: 20,
                        padding: '4px 10px',
                        fontSize: 12,
                        fontWeight: 500,
                        border: '1px solid var(--color-primary)',
                        marginTop: 4,
                        flexShrink: 0,
                      }}>
                        {vo2NextTier(vo2Max.value)} →
                      </div>
                    )}
                  </div>

                  {vo2EntryOpen && (
                    <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                          <div className="section-label" style={{ marginBottom: 4 }}>Value (ml/kg/min)</div>
                          <input
                            type="number"
                            value={vo2EntryValue}
                            onChange={e => setVo2EntryValue(e.target.value)}
                            placeholder="e.g. 36"
                            onClick={e => e.stopPropagation()}
                            style={{ width: '100%', padding: '8px 10px' }}
                          />
                        </div>
                        <div>
                          <div className="section-label" style={{ marginBottom: 4 }}>Date</div>
                          <input
                            type="date"
                            value={vo2EntryDate}
                            onChange={e => setVo2EntryDate(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            style={{ width: '100%', padding: '8px 10px' }}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={handleSaveVo2}
                          disabled={vo2Saving}
                          style={{ flex: 1, height: 40, fontSize: 13 }}
                        >
                          {vo2Saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={e => { e.stopPropagation(); setVo2EntryOpen(false) }}
                          style={{ flex: 1, height: 40, fontSize: 13 }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ paddingRight: 8 }}>
                    <svg viewBox="0 0 280 38" width="100%" style={{ display: 'block', overflow: 'visible' }}>
                      <defs>
                        <linearGradient id="vo2BarGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%"   style={{ stopColor: 'var(--color-spectrum-start)' }} />
                          <stop offset="100%" style={{ stopColor: 'var(--color-spectrum-end)' }} />
                        </linearGradient>
                      </defs>
                      <rect x="0" y="22" width="280" height="10" rx="5" fill="url(#vo2BarGrad)" />
                      {(() => {
                        const cx = (40 / VO2_SCALE_MAX) * 280
                        return (
                          <>
                            <polygon
                              points={`${cx},${22 - 5} ${cx + 4},${27} ${cx},${32 + 5} ${cx - 4},${27}`}
                              fill="var(--color-text-primary)"
                              opacity="0.7"
                            />
                            <text x={cx} y="38" textAnchor="middle" fontSize="7" style={{ fill: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                              target
                            </text>
                          </>
                        )
                      })()}
                      {vo2Max && (() => {
                        const cx = Math.min(vo2Max.value, VO2_SCALE_MAX) / VO2_SCALE_MAX * 280
                        return (
                          <>
                            <line x1={cx} y1="16" x2={cx} y2="22" stroke="var(--color-primary)" strokeWidth="1.5" />
                            <circle cx={cx} cy="9" r="8" fill="var(--color-surface)" stroke="var(--color-primary)" strokeWidth="1.5" />
                            <text x={cx} y="12.5" textAnchor="middle" fontSize="8" fontWeight="600" style={{ fill: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>
                              {vo2Max.value}
                            </text>
                          </>
                        )
                      })()}
                    </svg>
                    <div style={{ display: 'flex', marginTop: 4 }}>
                      {VO2_BANDS.map((band, i) => {
                        const widthPct = ((band.end - band.start) / VO2_SCALE_MAX) * 100
                        const isLast = i === VO2_BANDS.length - 1
                        return (
                          <div key={band.label} style={{ flex: `0 0 ${widthPct}%`, minWidth: 0, textAlign: isLast ? 'right' : 'left' }}>
                            <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)', letterSpacing: '0.02em' }}>
                              {band.label}
                            </div>
                            <div style={{ fontSize: 8, color: 'var(--color-text-dim)', marginTop: 1 }}>
                              {band.rangeLabel}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <div className="section-label" style={{ marginBottom: 8 }}>Recent readings</div>
                    {(() => {
                      const { linePath, fillPath, points } = buildVo2Sparkline(vo2Sparkline)
                      return (
                        <svg viewBox="0 0 280 76" width="100%" style={{ display: 'block' }}>
                          <defs>
                            <filter id="vo2Glow" x="-30%" y="-80%" width="160%" height="260%">
                              <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
                              <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                              </feMerge>
                            </filter>
                            <linearGradient id="vo2FillGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%"   style={{ stopColor: 'var(--color-primary)', stopOpacity: 0.2 }} />
                              <stop offset="100%" style={{ stopColor: 'var(--color-primary)', stopOpacity: 0 }} />
                            </linearGradient>
                          </defs>
                          {points.length >= 2 && (
                            <>
                              <path d={fillPath} fill="url(#vo2FillGrad)" />
                              <path d={linePath} fill="none" stroke="var(--color-primary)" strokeWidth="4" opacity="0.55" filter="url(#vo2Glow)" />
                              <path d={linePath} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                            </>
                          )}
                          {points.map((p, i) => (
                            <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--color-primary)" />
                          ))}
                          {points.map((p, i) => (
                            <text
                              key={i}
                              x={p.x}
                              y="72"
                              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                              fontSize="8"
                              style={{ fill: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}
                            >
                              {fmtSparkDate(p.date)}
                            </text>
                          ))}
                        </svg>
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Cardiovascular health card */}
            {(() => {
              const ratio      = (ldl && hdl) ? ldl.value / hdl.value : null
              const rc         = ratio != null ? ratioClass(ratio) : null
              const ldlBandI   = ldl ? ldlBandIndex(ldl.value) : -1
              const hdlBandI   = hdl ? hdlBandIndex(hdl.value) : -1
              const ldlMarker  = ldlBandI >= 0 ? LDL_BAND_COLORS[ldlBandI] : 'var(--color-text-dim)'
              const hdlMarker  = hdlBandI >= 0 ? HDL_BAND_COLORS[hdlBandI] : 'var(--color-text-dim)'
              const dates      = [ldl?.recorded_on, hdl?.recorded_on].filter((d): d is string => !!d).sort()
              const mostRecent = dates.length ? dates[dates.length - 1] : null
              const overdue    = mostRecent ? monthsSince(mostRecent) > 6 : false
              const ratioHistory = pairCardioHistory(goalsData?.biomarkers ?? [])

              return (
                <div className="card" style={{ padding: 0, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={handleCardioToggle}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 16,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: 'var(--color-heart-pink-bg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                          <path
                            d="M9 15S2 10.5 2 6a4 4 0 018 0 4 4 0 018 0c0 4.5-7 9-7 9z"
                            fill="var(--color-heart-pink)"
                            stroke="var(--color-heart-pink)"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                          Cardiovascular health
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginTop: 2 }}>
                          {(ldl && hdl)
                            ? `LDL ${ldl.value} · HDL ${hdl.value} mg/dL`
                            : 'Not yet logged'}
                        </div>
                      </div>
                    </div>
                    {ratio != null && rc && (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>LDL:HDL ratio</div>
                        <div style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 28,
                          fontWeight: 700,
                          lineHeight: 1,
                          letterSpacing: '-0.06em',
                          color: rc.color,
                          marginTop: 2,
                        }}>
                          {ratio.toFixed(1)}
                        </div>
                        <div style={{ fontSize: 11, color: rc.color, marginTop: 2 }}>
                          {rc.label} <span style={{ fontSize: 9 }}>✦</span>
                        </div>
                      </div>
                    )}
                  </button>

                  {cardioExpanded && (
                    <div style={{ padding: '0 16px 16px' }}>
                      {cardioEntryOpen && (
                        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                            <div>
                              <div className="section-label" style={{ marginBottom: 4 }}>LDL (mg/dL)</div>
                              <input
                                type="number"
                                value={cardioLdlValue}
                                onChange={e => setCardioLdlValue(e.target.value)}
                                placeholder="e.g. 124"
                                onClick={e => e.stopPropagation()}
                                style={{ width: '100%', padding: '8px 10px' }}
                              />
                            </div>
                            <div>
                              <div className="section-label" style={{ marginBottom: 4 }}>HDL (mg/dL)</div>
                              <input
                                type="number"
                                value={cardioHdlValue}
                                onChange={e => setCardioHdlValue(e.target.value)}
                                placeholder="e.g. 50"
                                onClick={e => e.stopPropagation()}
                                style={{ width: '100%', padding: '8px 10px' }}
                              />
                            </div>
                            <div>
                              <div className="section-label" style={{ marginBottom: 4 }}>Date</div>
                              <input
                                type="date"
                                value={cardioEntryDate}
                                onChange={e => setCardioEntryDate(e.target.value)}
                                onClick={e => e.stopPropagation()}
                                style={{ width: '100%', padding: '8px 10px' }}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={handleSaveCardio}
                              disabled={cardioSaving}
                              style={{ flex: 1, height: 40, fontSize: 13 }}
                            >
                              {cardioSaving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={e => { e.stopPropagation(); setCardioEntryOpen(false) }}
                              style={{ flex: 1, height: 40, fontSize: 13 }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      <div style={{ paddingRight: 8 }}>
                        <button
                          type="button"
                          onClick={openCardioEntry}
                          style={{
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                            marginBottom: 8,
                            background: 'none',
                            border: 'none',
                            padding: '4px 0',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>LDL</span>
                          <span style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>
                            {ldl ? `${ldl.value} mg/dL · target <100` : 'Tap to log · target <100'}
                          </span>
                        </button>
                        <svg viewBox="0 0 280 38" width="100%" style={{ display: 'block', overflow: 'visible' }}>
                          <defs>
                            <linearGradient id="ldlBarGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%"   style={{ stopColor: 'var(--color-success)' }} />
                              <stop offset="50%"  style={{ stopColor: 'var(--color-spectrum-yellow)' }} />
                              <stop offset="75%"  style={{ stopColor: 'var(--color-amber)' }} />
                              <stop offset="100%" style={{ stopColor: 'var(--color-danger)' }} />
                            </linearGradient>
                          </defs>
                          <rect x="0" y="22" width="280" height="10" rx="5" fill="url(#ldlBarGrad)" />
                          {ldl && (() => {
                            const cx = Math.min(ldl.value, LDL_SCALE_MAX) / LDL_SCALE_MAX * 280
                            return (
                              <>
                                <line x1={cx} y1="16" x2={cx} y2="22" stroke={ldlMarker} strokeWidth="1.5" />
                                <circle cx={cx} cy="9" r="8" fill="var(--color-surface)" stroke={ldlMarker} strokeWidth="1.5" />
                                <text x={cx} y="12.5" textAnchor="middle" fontSize="8" fontWeight="600" style={{ fill: ldlMarker, fontFamily: 'var(--font-mono)' }}>
                                  {ldl.value}
                                </text>
                              </>
                            )
                          })()}
                        </svg>
                        <div style={{ display: 'flex', marginTop: 4 }}>
                          {LDL_BANDS.map((band, i) => {
                            const widthPct = ((band.end - band.start) / LDL_SCALE_MAX) * 100
                            const isLast = i === LDL_BANDS.length - 1
                            const active = i === ldlBandI
                            return (
                              <div key={band.label} style={{ flex: `0 0 ${widthPct}%`, minWidth: 0, textAlign: isLast ? 'right' : 'left' }}>
                                <div style={{
                                  fontSize: 9,
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: active ? 700 : 400,
                                  color: active ? LDL_BAND_COLORS[i] : 'var(--color-text-dim)',
                                  letterSpacing: '0.02em',
                                }}>
                                  {band.label}{active && ' ✦'}
                                </div>
                                <div style={{ fontSize: 8, color: 'var(--color-text-dim)', marginTop: 1 }}>
                                  {band.rangeLabel}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid var(--color-border)', margin: '16px 0' }} />

                      <div style={{ paddingRight: 8 }}>
                        <button
                          type="button"
                          onClick={openCardioEntry}
                          style={{
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                            marginBottom: 8,
                            background: 'none',
                            border: 'none',
                            padding: '4px 0',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>HDL</span>
                          <span style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>
                            {hdl ? `${hdl.value} mg/dL · target >60` : 'Tap to log · target >60'}
                          </span>
                        </button>
                        <svg viewBox="0 0 280 38" width="100%" style={{ display: 'block', overflow: 'visible' }}>
                          <defs>
                            <linearGradient id="hdlBarGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%"   style={{ stopColor: 'var(--color-danger)' }} />
                              <stop offset="35%"  style={{ stopColor: 'var(--color-amber)' }} />
                              <stop offset="55%"  style={{ stopColor: 'var(--color-spectrum-yellow)' }} />
                              <stop offset="100%" style={{ stopColor: 'var(--color-success)' }} />
                            </linearGradient>
                          </defs>
                          <rect x="0" y="22" width="280" height="10" rx="5" fill="url(#hdlBarGrad)" />
                          {hdl && (() => {
                            const cx = Math.min(hdl.value, HDL_SCALE_MAX) / HDL_SCALE_MAX * 280
                            return (
                              <>
                                <line x1={cx} y1="16" x2={cx} y2="22" stroke={hdlMarker} strokeWidth="1.5" />
                                <circle cx={cx} cy="9" r="8" fill="var(--color-surface)" stroke={hdlMarker} strokeWidth="1.5" />
                                <text x={cx} y="12.5" textAnchor="middle" fontSize="8" fontWeight="600" style={{ fill: hdlMarker, fontFamily: 'var(--font-mono)' }}>
                                  {hdl.value}
                                </text>
                              </>
                            )
                          })()}
                        </svg>
                        <div style={{ display: 'flex', marginTop: 4 }}>
                          {HDL_BANDS.map((band, i) => {
                            const widthPct = ((band.end - band.start) / HDL_SCALE_MAX) * 100
                            const isLast = i === HDL_BANDS.length - 1
                            const active = i === hdlBandI
                            return (
                              <div key={band.label} style={{ flex: `0 0 ${widthPct}%`, minWidth: 0, textAlign: isLast ? 'right' : 'left' }}>
                                <div style={{
                                  fontSize: 9,
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: active ? 700 : 400,
                                  color: active ? HDL_BAND_COLORS[i] : 'var(--color-text-dim)',
                                  letterSpacing: '0.02em',
                                }}>
                                  {band.label}{active && ' ✦'}
                                </div>
                                <div style={{ fontSize: 8, color: 'var(--color-text-dim)', marginTop: 1 }}>
                                  {band.rangeLabel}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid var(--color-border)', margin: '16px 0' }} />

                      <div>
                        <div className="section-label" style={{ marginBottom: 8 }}>Ratio trend</div>
                        {(() => {
                          const PAD_X = 22, PAD_Y = 12, W = 280, CHART_H = 48
                          const thresholdY = PAD_Y + CHART_H * (1 - RATIO_THRESHOLD / RATIO_SCALE_MAX)
                          const n = ratioHistory.length
                          const points = ratioHistory.map((p, i) => ({
                            x: n === 1 ? PAD_X : PAD_X + (i / Math.max(1, n - 1)) * (W - 2 * PAD_X),
                            y: PAD_Y + CHART_H * (1 - Math.min(p.ratio, RATIO_SCALE_MAX) / RATIO_SCALE_MAX),
                            ratio: p.ratio,
                            date: p.date,
                          }))
                          const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
                          const bottom = PAD_Y + CHART_H
                          const fillPath = n >= 2
                            ? `${linePath} L${points[n - 1].x.toFixed(1)},${bottom} L${points[0].x.toFixed(1)},${bottom} Z`
                            : ''
                          return (
                            <svg viewBox="0 0 280 76" width="100%" style={{ display: 'block', overflow: 'visible' }}>
                              <defs>
                                <filter id="ratioGlow" x="-30%" y="-80%" width="160%" height="260%">
                                  <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
                                  <feMerge>
                                    <feMergeNode in="blur" />
                                    <feMergeNode in="SourceGraphic" />
                                  </feMerge>
                                </filter>
                                <linearGradient id="ratioFillGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%"   style={{ stopColor: 'var(--color-primary)', stopOpacity: 0.2 }} />
                                  <stop offset="100%" style={{ stopColor: 'var(--color-primary)', stopOpacity: 0 }} />
                                </linearGradient>
                              </defs>
                              <line
                                x1={PAD_X} y1={thresholdY} x2={W - PAD_X} y2={thresholdY}
                                stroke="var(--color-text-dim)" strokeWidth="1" strokeDasharray="3 3"
                              />
                              <text x={W - PAD_X} y={thresholdY - 3} textAnchor="end" fontSize="8" style={{ fill: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                                3.5 risk threshold
                              </text>
                              {n >= 2 && (
                                <>
                                  <path d={fillPath} fill="url(#ratioFillGrad)" />
                                  <path d={linePath} fill="none" stroke="var(--color-primary)" strokeWidth="4" opacity="0.55" filter="url(#ratioGlow)" />
                                  <path d={linePath} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                                </>
                              )}
                              {points.map((p, i) => (
                                <g key={i}>
                                  <circle cx={p.x} cy={p.y} r="3" fill="var(--color-primary)" />
                                  <text x={p.x} y={p.y - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize="10" fontWeight="600" style={{ fill: 'var(--color-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.06em' }}>
                                    {p.ratio.toFixed(2)}
                                  </text>
                                  <text x={p.x} y="72" textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize="8" style={{ fill: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                                    {fmtSparkDate(p.date)}
                                  </text>
                                </g>
                              ))}
                              {n === 1 && (
                                <text x={W - PAD_X} y="66" textAnchor="end" fontSize="9" fontStyle="italic" style={{ fill: 'var(--color-text-dim)' }}>
                                  next reading?
                                </text>
                              )}
                            </svg>
                          )
                        })()}
                      </div>

                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)', textAlign: 'center', fontSize: 12, color: 'var(--color-text-dim)' }}>
                        {mostRecent ? (
                          <>
                            Last tested {fmtMonthYear(new Date(mostRecent + 'T00:00:00'))}
                            {overdue && (
                              <> · <span style={{ color: 'var(--color-danger)', fontWeight: 500 }}>bloodwork overdue</span></>
                            )}
                          </>
                        ) : (
                          'Not yet tested'
                        )}
                      </div>

                      {!cardioEntryOpen && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={openCardioEntry}
                          style={{ marginTop: 12, height: 40, fontSize: 13 }}
                        >
                          Log bloodwork
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Glucose Stability card */}
            <div className="card" style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M2 9c1-3 2-5 3-5s2 4 3 6 2 5 3 5 2-3 3-6"
                    stroke="var(--color-amber)"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Glucose Stability
                </span>
              </div>
              {(glucoseAvg != null || hba1c) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {glucoseAvg != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                        Fasting (7-day avg)
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 15,
                          color: glucoseAvg <= 4.8
                            ? 'var(--color-success)'
                            : glucoseAvg <= 5.6
                            ? 'var(--color-amber)'
                            : 'var(--color-danger)',
                        }}>
                          {glucoseAvg.toFixed(1)}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>mmol/L</span>
                      </div>
                    </div>
                  )}
                  {hba1c && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>HbA1c</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--color-text-primary)' }}>
                          {hba1c.value}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
                          {hba1c.unit ?? '%'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>
                  Start logging fasting glucose in the Sleep section
                </div>
              )}
            </div>

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

        {/* ── HEALTH CALENDAR TAB ──────────────────────────────── */}
        {activeTab === 'calendar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, paddingBottom: 16 }}>

            <div className="section-label" style={{ paddingLeft: 4, marginTop: 4, marginBottom: 8 }}>
              Health Calendar
            </div>

            {allAppts.length === 0 ? (
              <div className="card" style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>
                No appointments — loading…
              </div>
            ) : (
              allAppts.map(appt => {
                const dimmed    = isApptDimmed(appt)
                const isEditing = editingId === appt.id
                const dueDate   = appt.next_due_date
                  ? new Date(appt.next_due_date.includes('T') ? appt.next_due_date : appt.next_due_date + 'T00:00:00')
                  : nextDueDateFromLast(appt.last_completed_date, appt.interval_months)
                const dueColor  = dueDate
                  ? (dueDate <= fourMonthsOut ? 'var(--color-amber)' : 'var(--color-text-dim)')
                  : 'var(--color-text-dim)'
                const dueLabel  = dueDate ? `Due: ${fmtDueDate(appt.next_due_date, dueDate)}` : 'Not scheduled'

                return (
                  <div
                    key={appt.id}
                    className="card"
                    style={{
                      opacity: dimmed ? 0.5 : 1,
                      padding: dimmed ? '10px 14px' : '14px 16px',
                      transition: 'opacity 200ms',
                      marginBottom: 8,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => isEditing ? setEditingId(null) : startEdit(appt)}
                      style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ fontSize: dimmed ? 13 : 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                          {APPT_LABELS[appt.appointment_type] ?? appt.appointment_type}
                        </span>
                        <span style={{ fontSize: 12, color: dueColor, flexShrink: 0 }}>{dueLabel}</span>
                      </div>
                      {appt.last_completed_date && !isEditing && (
                        <div style={{ marginTop: 3, fontSize: 11, color: 'var(--color-text-dim)' }}>
                          Last done: {fmtDate(appt.last_completed_date)}
                        </div>
                      )}
                    </button>

                    {isEditing && (
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {APPT_LABELS[appt.appointment_type] ?? appt.appointment_type}
                        </div>

                        <div>
                          <div className="section-label" style={{ marginBottom: 4 }}>Last completed</div>
                          <input
                            type="date"
                            value={editLastCompleted}
                            onChange={e => {
                              setEditLastCompleted(e.target.value)
                              if (e.target.value) {
                                setEditNextDue(addMonths(e.target.value, appt.interval_months))
                              }
                            }}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 8 }}
                          />
                        </div>
                        <div>
                          <div className="section-label" style={{ marginBottom: 4 }}>Next due (auto-computed, overridable)</div>
                          <input
                            type="datetime-local"
                            value={editNextDue}
                            onChange={e => setEditNextDue(e.target.value)}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 8 }}
                          />
                        </div>
                        <div>
                          <div className="section-label" style={{ marginBottom: 4 }}>Notes</div>
                          <textarea
                            value={editNotes}
                            onChange={e => setEditNotes(e.target.value)}
                            rows={2}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, resize: 'vertical' }}
                          />
                        </div>

                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => handleMarkDone(appt)}
                          disabled={apptSaving}
                          style={{ height: 40, fontSize: 13 }}
                        >
                          {apptSaving ? 'Saving…' : 'Mark as done today'}
                        </button>

                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleSaveAppt(appt)}
                            disabled={apptSaving}
                            style={{ flex: 1, height: 40, fontSize: 13 }}
                          >
                            {apptSaving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setEditingId(null)}
                            style={{ flex: 1, height: 40, fontSize: 13 }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}

          </div>
        )}

        {/* ── COACH TAB ────────────────────────────────────────── */}
        {activeTab === 'coach' && (
          <CoachTab today={entry} cycleDay={cycleDay} currentDate={currentDate} />
        )}

        {/* ── DASHBOARD TAB ────────────────────────────────────── */}
        {activeTab === 'dashboard' && (() => {
          const allEntries = (() => {
            const without = dashEntries.filter(e => e.date !== currentDate)
            return [entry, ...without].sort((a, b) => (a.date < b.date ? 1 : -1))
          })()

          const entriesWithData = allEntries.filter(
            e => e.sleep.hrv != null || e.sleep.duration_min != null || e.sleep.rested != null
          )

          const chart30 = allEntries.slice(0, 30).reverse()
          const hasEnoughData = entriesWithData.length >= 2

          const tlResult  = computeTrainingLoad(allEntries)
          const tlHistory = computeTrainingLoadHistory(chart30)

          const CHART_H = 120
          const axisStyle = { fontSize: 10, fill: '#8FAA98', fontFamily: 'DM Mono, monospace' }

          const hrvData = chart30.map(e => ({ date: chartDate(e.date), value: e.sleep.hrv }))
          const sleepData = chart30.map(e => ({ date: chartDate(e.date), value: durationToH(e.sleep.duration_min) }))
          // Use daily_nutrition_summary (via nutritionSummaries map) so the charts
          // reflect the new ingredient-level logging system, not legacy daily_entries columns.
          // e.date is already a YYYY-MM-DD string from Supabase — looked up directly with
          // no new Date() conversion to avoid UTC-vs-Berlin timezone shift on recent entries.
          const proteinData = chart30.map(e => ({
            date: chartDate(e.date),
            value: nutritionSummaries[e.date]?.protein != null
              ? Math.round(nutritionSummaries[e.date].protein as number)
              : null,
          }))
          const fiberData = chart30.map(e => ({
            date: chartDate(e.date),
            value: nutritionSummaries[e.date]?.fiber != null
              ? Math.round(nutritionSummaries[e.date].fiber as number)
              : null,
          }))
          const trainingData = chart30.map(e => ({
            date: chartDate(e.date),
            value: e.training.sessions.length > 0
              ? e.training.sessions.reduce((sum, s) => sum + s.duration_min, 0)
              : null,
          }))

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 32 }}>

              {/* Header */}
              <div style={{ paddingTop: 8 }}>
                <h1 style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  Dashboard
                </h1>
                <p style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>
                  Today · {new Date(currentDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>

              {/* No data message */}
              {!hasEnoughData && (
                <div style={{ padding: '20px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📈</div>
                  <p style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500, marginBottom: 4 }}>
                    Keep logging — trends coming soon
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    Log sleep data on at least 2 days to see your 7-day trends.
                  </p>
                </div>
              )}

              {/* Trend charts */}
              {hasEnoughData && (
                <>
                  {/* Training Load expandable card */}
                  {(() => {
                    const n = tlHistory.length
                    const PAD_X = 8, PAD_Y = 8, CHART_W = 280, TL_H = 44
                    const maxR = Math.max(...tlHistory.map(p => p.ratio ?? 0), 1.6)
                    const xOf = (i: number) => n <= 1 ? PAD_X : PAD_X + (i / (n - 1)) * (CHART_W - 2 * PAD_X)
                    const yOf = (v: number) => PAD_Y + TL_H * (1 - v / maxR)
                    const opt_y1 = yOf(1.3), opt_y2 = yOf(0.8)

                    const BAR_W = 280
                    const ZONES = [
                      { end: 0.6,  colour: 'var(--color-amber)' },
                      { end: 0.8,  colour: 'var(--color-training-easy)' },
                      { end: 1.3,  colour: 'var(--color-success)' },
                      { end: 1.5,  colour: 'var(--color-amber)' },
                      { end: 2.0,  colour: 'var(--color-danger)' },
                    ]
                    const SCALE_MAX = 2.0
                    const ratioX = tlResult.ratio != null ? Math.min(tlResult.ratio, SCALE_MAX) / SCALE_MAX * BAR_W : null

                    return (
                      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }}>
                        <button
                          type="button"
                          onClick={() => setDashTlExpanded(prev => !prev)}
                          style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}
                        >
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: tlResult.colour, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                            Training Load
                          </span>
                          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500, color: tlResult.colour }}>{tlResult.status}</span>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={`chevron${dashTlExpanded ? ' open' : ''}`} style={{ flexShrink: 0 }}>
                            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>

                        {dashTlExpanded && (
                          <div style={{ padding: '0 16px 16px' }}>
                            {tlResult.status === 'Establishing baseline' ? (
                              <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 14 }}>
                                Building baseline — check back in {Math.max(0, 28 - allEntries.length)} days
                              </div>
                            ) : (
                              <>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                                  <div style={{ textAlign: 'center', padding: '8px', background: 'var(--color-bg)', borderRadius: 8 }}>
                                    <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: 2 }}>Acute (7d)</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)' }}>{tlResult.acute}</div>
                                    <div style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>TSU</div>
                                  </div>
                                  <div style={{ textAlign: 'center', padding: '8px', background: 'var(--color-bg)', borderRadius: 8 }}>
                                    <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: 2 }}>Chronic (28d)</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)' }}>{tlResult.chronic}</div>
                                    <div style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>TSU</div>
                                  </div>
                                </div>
                                <div style={{ marginBottom: 4 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                                    <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>Ratio</div>
                                    {tlResult.ratio != null && (
                                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: tlResult.colour }}>
                                        {tlResult.ratio.toFixed(2)}
                                      </div>
                                    )}
                                  </div>
                                  <svg viewBox={`0 0 ${BAR_W} 30`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
                                    {(() => {
                                      let x = 0
                                      return ZONES.map((z, i) => {
                                        const prev = i === 0 ? 0 : ZONES[i - 1].end
                                        const w = (z.end - prev) / SCALE_MAX * BAR_W
                                        const rect = <rect key={z.end} x={x} y="14" width={w} height="10" fill={z.colour} opacity="0.5" />
                                        x += w
                                        return rect
                                      })
                                    })()}
                                    {[0.6, 0.8, 1.3, 1.5].map(v => {
                                      const cx = v / SCALE_MAX * BAR_W
                                      return (
                                        <g key={v}>
                                          <line x1={cx} y1="12" x2={cx} y2="24" stroke="var(--color-surface)" strokeWidth="1.5" />
                                          <text x={cx} y="29" textAnchor="middle" fontSize="7" style={{ fill: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>{v}</text>
                                        </g>
                                      )
                                    })}
                                    {ratioX != null && (
                                      <>
                                        <line x1={ratioX} y1="8" x2={ratioX} y2="14" stroke={tlResult.colour} strokeWidth="1.5" />
                                        <circle cx={ratioX} cy="5" r="4" fill={tlResult.colour} />
                                      </>
                                    )}
                                  </svg>
                                </div>
                                {n >= 2 && (
                                  <div style={{ marginTop: 14 }}>
                                    <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginBottom: 6 }}>30-day trend</div>
                                    <svg viewBox={`0 0 ${CHART_W} ${PAD_Y * 2 + TL_H + 12}`} width="100%" style={{ display: 'block' }}>
                                      <defs>
                                        <clipPath id="dashTlClip">
                                          <rect x={PAD_X} y={PAD_Y} width={CHART_W - 2 * PAD_X} height={TL_H} />
                                        </clipPath>
                                      </defs>
                                      <rect x={PAD_X} y={opt_y1} width={CHART_W - 2 * PAD_X} height={Math.max(0, opt_y2 - opt_y1)} fill="var(--color-success)" opacity="0.08" clipPath="url(#dashTlClip)" />
                                      {tlHistory.slice(1).map((pt, i) => {
                                        const prev = tlHistory[i]
                                        return (
                                          <line key={pt.date}
                                            x1={xOf(i).toFixed(1)} y1={yOf(prev.ratio ?? 0).toFixed(1)}
                                            x2={xOf(i + 1).toFixed(1)} y2={yOf(pt.ratio ?? 0).toFixed(1)}
                                            stroke={pt.colour} strokeWidth="1.5" strokeLinecap="round"
                                          />
                                        )
                                      })}
                                    </svg>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* HRV */}
                  <ChartCard title="HRV — 30 days">
                    <ResponsiveContainer width="100%" height={CHART_H}>
                      <LineChart data={hrvData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <XAxis dataKey="date" tick={axisStyle} />
                        <YAxis tick={axisStyle} domain={['auto', 'auto']} />
                        <ReferenceLine y={88} stroke="#DCE8E0" strokeDasharray="4 2" />
                        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [`${v}ms`, 'HRV']} />
                        <Line type="monotone" dataKey="value" stroke="#3D9A6B" strokeWidth={2} dot={{ fill: '#3D9A6B', r: 3 }} connectNulls={false} />
                      </LineChart>
                    </ResponsiveContainer>
                    <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 4 }}>— baseline 88ms</div>
                  </ChartCard>

                  {/* Sleep duration */}
                  <ChartCard title="Sleep — 30 days">
                    <ResponsiveContainer width="100%" height={CHART_H}>
                      <BarChart data={sleepData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <XAxis dataKey="date" tick={axisStyle} />
                        <YAxis tick={axisStyle} domain={[0, 10]} />
                        <ReferenceLine y={7.5} stroke="#DCE8E0" strokeDasharray="4 2" />
                        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [`${v}h`, 'Sleep']} />
                        <Bar dataKey="value" fill="#3D9A6B" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 4 }}>— target 7h30</div>
                  </ChartCard>

                  {/* Protein */}
                  <ChartCard title="Protein — 30 days">
                    <ResponsiveContainer width="100%" height={CHART_H}>
                      <BarChart data={proteinData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <XAxis dataKey="date" tick={axisStyle} />
                        <YAxis tick={axisStyle} />
                        <ReferenceLine y={130} stroke="#DCE8E0" strokeDasharray="4 2" />
                        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [`${v}g`, 'Protein']} />
                        <Bar dataKey="value" radius={[3, 3, 0, 0]} fill="#3D9A6B" />
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 4 }}>— target 130g</div>
                  </ChartCard>

                  {/* Fiber */}
                  <ChartCard title="Fiber — 30 days">
                    <ResponsiveContainer width="100%" height={CHART_H}>
                      <BarChart data={fiberData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <XAxis dataKey="date" tick={axisStyle} />
                        <YAxis tick={axisStyle} />
                        <ReferenceLine y={30} stroke="#DCE8E0" strokeDasharray="4 2" />
                        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [`${v}g`, 'Fiber']} />
                        <Bar dataKey="value" fill="#3D9A6B" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 4 }}>— target 30g</div>
                  </ChartCard>

                  {/* Training minutes */}
                  <ChartCard title="Training minutes — 30 days">
                    <ResponsiveContainer width="100%" height={CHART_H}>
                      <BarChart data={trainingData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <XAxis dataKey="date" tick={axisStyle} />
                        <YAxis tick={axisStyle} />
                        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [`${v}min`, 'Training']} />
                        <Bar dataKey="value" fill="#3D9A6B" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 4 }}>Total training minutes per day</div>
                  </ChartCard>
                </>
              )}

              {/* History section */}
              <div>
                <div style={{ paddingTop: 8, paddingBottom: 8, borderTop: '1px solid var(--color-border)', marginTop: 8 }}>
                  <h2 style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                    History
                  </h2>
                  <p style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>
                    {historyLoading ? 'Loading…' : `${historyEntries.length} ${historyEntries.length === 1 ? 'day' : 'days'} logged`}
                  </p>
                </div>

                {historyError && (
                  <p style={{ fontSize: 14, color: 'var(--color-danger)' }}>{historyError}</p>
                )}

                {historyLoading ? (
                  <div style={{ paddingTop: 40, textAlign: 'center', fontSize: 10, letterSpacing: '0.2em', color: 'var(--color-text-dim)' }}>
                    LOADING
                  </div>
                ) : historyEntries.length === 0 ? (
                  <div style={{ padding: '40px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📓</div>
                    <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontWeight: 500 }}>No entries yet</p>
                    <p style={{ fontSize: 13, color: 'var(--color-text-dim)', marginTop: 4 }}>Start logging on the Today tab.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {historyEntries.map(e => (
                      <HistoryRow
                        key={e.date}
                        entry={e}
                        onSelectDate={(date) => { setCurrentDate(date); setActiveTab('today') }}
                      />
                    ))}
                  </div>
                )}
              </div>

            </div>
          )
        })()}


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
              onClick={() => {
                if (id === 'today' && activeTab === 'today') loadDay(currentDate)
                setActiveTab(id)
              }}
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
