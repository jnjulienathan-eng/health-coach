'use client'

import { useState, useEffect } from 'react'
import { getGoalsData, saveHealthAppointment, fetchHealthAppointments, seedDefaultAppointments, getVo2SparklineData, saveVo2Reading, saveCardioReading, fetch30DayHistory } from '@/lib/db'
import type { GoalsData, HealthAppointment, BiomarkerReading, DailyEntry } from '@/lib/types'
import { scoreColor, hrvZone } from '@/lib/types'
import { computeTrainingLoad, computeTrainingLoadHistory, computeDailyTSU } from '@/lib/trainingLoad'

// ─── Helpers ──────────────────────────────────────────────────────

function getFallbackGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning, Julie'
  if (h < 17) return 'Good afternoon, Julie'
  return 'Good evening, Julie'
}

function getTimeOfDay(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

// Per spec: Optimal ≥75, Good 60–74, OK 45–59, Low <45
function goalScoreLabel(score: number): string {
  if (score >= 75) return 'Optimal'
  if (score >= 60) return 'Good'
  if (score >= 45) return 'OK'
  return 'Low'
}

function nextDueDateFromLast(lastCompleted: string | null, intervalMonths: number): Date | null {
  if (!lastCompleted) return null
  const d = new Date(lastCompleted + 'T00:00:00')
  d.setMonth(d.getMonth() + intervalMonths)
  return d
}

function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function fmtDate(s: string | null): string {
  if (!s) return 'Not set'
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Constants ────────────────────────────────────────────────────

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

// VO2 max bands (scale max: 50 ml/kg/min)
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

// Cardiovascular scales & bands
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

// Pair LDL & HDL readings by closest recorded_on date so we can build
// a ratio trend sparkline from historical bloodwork.
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

// ─── Component ────────────────────────────────────────────────────

interface Props {
  onNavigateDashboard: () => void
  today: DailyEntry
  currentDate: string
}

export default function GoalsTab({ onNavigateDashboard, today, currentDate }: Props) {
  const [data,              setData]              = useState<GoalsData | null>(null)
  const [loading,           setLoading]           = useState(true)
  const [greeting,          setGreeting]          = useState<string | null>(null)
  const [greetingLoading,   setGreetingLoading]   = useState(true)
  const [editingId,         setEditingId]         = useState<string | null>(null)
  const [editLastCompleted, setEditLastCompleted] = useState('')
  const [editNextDue,       setEditNextDue]       = useState('')
  const [editNotes,         setEditNotes]         = useState('')
  const [saving,            setSaving]            = useState(false)

  // Training Load
  const [trainingHistory, setTrainingHistory] = useState<ReturnType<typeof computeTrainingLoadHistory>>([])
  const [tlExpanded,      setTlExpanded]      = useState(false)

  // VO2 Max card
  const [vo2Expanded,        setVo2Expanded]        = useState(false)
  const [vo2Sparkline,       setVo2Sparkline]        = useState<BiomarkerReading[]>([])
  const [vo2SparklineLoaded, setVo2SparklineLoaded]  = useState(false)
  const [vo2EntryOpen,       setVo2EntryOpen]        = useState(false)
  const [vo2EntryValue,      setVo2EntryValue]       = useState('')
  const [vo2EntryDate,       setVo2EntryDate]        = useState('')
  const [vo2Saving,          setVo2Saving]           = useState(false)

  // Cardiovascular card
  const [cardioExpanded,  setCardioExpanded]  = useState(false)
  const [cardioEntryOpen, setCardioEntryOpen] = useState(false)
  const [cardioLdlValue,  setCardioLdlValue]  = useState('')
  const [cardioHdlValue,  setCardioHdlValue]  = useState('')
  const [cardioEntryDate, setCardioEntryDate] = useState('')
  const [cardioSaving,    setCardioSaving]    = useState(false)

  useEffect(() => {
    getGoalsData()
      .then(async d => {
        // Seed default appointments on first load if table is empty
        if (d.appointments.length === 0) {
          try {
            await seedDefaultAppointments()
            const fresh = await fetchHealthAppointments()
            d = { ...d, appointments: fresh }
          } catch (e) {
            console.error('GoalsTab seed appointments error:', e)
          }
        }
        setData(d)
        setLoading(false)
      })
      .catch(e => { console.error('GoalsTab load error:', e); setLoading(false) })
  }, [])

  // Fetch dynamic greeting from API
  useEffect(() => {
    const hrv = today.sleep.hrv
    const hrvBand = hrv != null ? hrvZone(hrv) : 'Unknown'
    const trainedToday = today.training.sessions.length > 0

    fetch('/api/goals/greeting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeOfDay:     getTimeOfDay(),
        hrvBand,
        trainedToday,
        proteinLogged: today.nutrition.total_protein ?? null,
        proteinTarget: 135,
        lastBedtime:   today.sleep.bedtime ?? null,
        sleepDuration: today.sleep.duration_min ?? null,
        rested:        today.sleep.rested ?? null,
      }),
    })
      .then(r => r.json())
      .then(({ greeting: g }) => {
        if (g) setGreeting(g)
        else setGreeting(getFallbackGreeting())
      })
      .catch(() => setGreeting(getFallbackGreeting()))
      .finally(() => setGreetingLoading(false))
  }, [currentDate, today.sleep.hrv, today.training.sessions.length])

  // Load 30-day history for Training Load computation
  useEffect(() => {
    fetch30DayHistory()
      .then(entries => setTrainingHistory(computeTrainingLoadHistory(entries)))
      .catch(e => console.error('Training load history error:', e))
  }, [])

  // ── Derived values ─────────────────────────────────────────────

  const behaviorScore = data?.todayScores.behavior_score ?? null
  const outcomeScore  = data?.todayScores.outcome_score  ?? null

  const latestBiomarker = (marker: string) =>
    data?.biomarkers.find(b => b.marker === marker) ?? null

  const vo2Max = latestBiomarker('vo2_max')
  const ldl    = latestBiomarker('ldl')
  const hdl    = latestBiomarker('hdl')
  const hba1c  = latestBiomarker('hba1c')

  const validGlucose = (data?.fastingGlucose7d ?? []).filter((v): v is number => v != null)
  const glucoseAvg   = validGlucose.length > 0
    ? validGlucose.reduce((a, b) => a + b, 0) / validGlucose.length
    : null

  // Training Load — derived from history (most recent point)
  const tlCurrent = trainingHistory.length > 0
    ? trainingHistory[trainingHistory.length - 1]
    : null
  const tlRatio   = tlCurrent?.ratio ?? null
  const tlStatus  = tlCurrent?.status ?? 'Not enough data'
  const tlColour  = tlCurrent?.colour ?? 'var(--color-text-dim)'

  const now = new Date()
  const fourMonthsOut = new Date(now)
  fourMonthsOut.setMonth(fourMonthsOut.getMonth() + 4)

  // All appointments shown; long-interval ones dimmed if far away and previously done
  const allAppts = [...(data?.appointments ?? [])].sort((a, b) => {
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

  // ── Appointment editing ────────────────────────────────────────

  function startEdit(appt: HealthAppointment) {
    setEditingId(appt.id)
    setEditLastCompleted(appt.last_completed_date ?? '')
    setEditNextDue(appt.next_due_date ?? '')
    setEditNotes(appt.notes ?? '')
  }

  async function handleMarkDone(appt: HealthAppointment) {
    const today = new Date().toISOString().split('T')[0]
    const nextDue = addMonths(today, appt.interval_months)
    setSaving(true)
    try {
      await saveHealthAppointment({ id: appt.id, last_completed_date: today, next_due_date: nextDue })
      const fresh = await fetchHealthAppointments()
      setData(prev => prev ? { ...prev, appointments: fresh } : prev)
      setEditingId(null)
    } catch (e) {
      console.error('Mark done error:', e)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAppt(appt: HealthAppointment) {
    setSaving(true)
    try {
      const nextDue = editNextDue || (editLastCompleted ? addMonths(editLastCompleted, appt.interval_months) : null)
      await saveHealthAppointment({
        id: appt.id,
        last_completed_date: editLastCompleted || null,
        next_due_date: nextDue,
        notes: editNotes || null,
      })
      const fresh = await fetchHealthAppointments()
      setData(prev => prev ? { ...prev, appointments: fresh } : prev)
      setEditingId(null)
    } catch (e) {
      console.error('Save appointment error:', e)
    } finally {
      setSaving(false)
    }
  }

  // ── VO2 Max card actions ───────────────────────────────────────

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
      setData(fresh)
      setVo2Sparkline(sparkline)
      setVo2SparklineLoaded(true)
      setVo2EntryOpen(false)
    } catch (err) {
      console.error('Save VO2 reading error:', err)
    } finally {
      setVo2Saving(false)
    }
  }

  // ── Cardiovascular card actions ────────────────────────────────

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
      setData(fresh)
      setCardioEntryOpen(false)
    } catch (err) {
      console.error('Save cardio reading error:', err)
    } finally {
      setCardioSaving(false)
    }
  }

  // ── Loading state ──────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{
        paddingTop: 80,
        textAlign: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.2em',
        color: 'var(--color-text-dim)',
      }}>
        LOADING
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 16 }}>

      {/* ── SECTION 1: Hero ──────────────────────────────────────── */}
      <div className="card" style={{ padding: '20px 16px' }}>

        {/* Dynamic greeting */}
        {greetingLoading ? (
          <div style={{
            height: 28,
            background: 'var(--color-border)',
            borderRadius: 6,
            marginBottom: 16,
            width: '70%',
            opacity: 0.6,
          }} />
        ) : (
          <div style={{
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: 16,
            lineHeight: 1.45,
          }}>
            {greeting ?? getFallbackGreeting()}
          </div>
        )}

        {/* Score cards — 3-col */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>

          <button
            type="button"
            onClick={onNavigateDashboard}
            style={{
              textAlign: 'left',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: '12px 10px',
              cursor: 'pointer',
            }}
          >
            <div className="section-label" style={{ color: 'var(--color-text-dim)', marginBottom: 5, fontSize: 9 }}>
              Behavior
            </div>
            {behaviorScore != null ? (
              <>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 700, lineHeight: 1, color: scoreColor(behaviorScore) }}>
                  {Math.round(behaviorScore)}
                </div>
                <div style={{ fontSize: 10, fontWeight: 500, color: scoreColor(behaviorScore), marginTop: 3 }}>
                  {goalScoreLabel(behaviorScore)}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 3 }}>—</div>
            )}
          </button>

          <button
            type="button"
            onClick={onNavigateDashboard}
            style={{
              textAlign: 'left',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: '12px 10px',
              cursor: 'pointer',
            }}
          >
            <div className="section-label" style={{ color: 'var(--color-text-dim)', marginBottom: 5, fontSize: 9 }}>
              Outcome
            </div>
            {outcomeScore != null ? (
              <>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 700, lineHeight: 1, color: scoreColor(outcomeScore) }}>
                  {Math.round(outcomeScore)}
                </div>
                <div style={{ fontSize: 10, fontWeight: 500, color: scoreColor(outcomeScore), marginTop: 3 }}>
                  {goalScoreLabel(outcomeScore)}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 3 }}>—</div>
            )}
          </button>

          <button
            type="button"
            onClick={onNavigateDashboard}
            style={{
              textAlign: 'left',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: '12px 10px',
              cursor: 'pointer',
            }}
          >
            <div className="section-label" style={{ color: 'var(--color-text-dim)', marginBottom: 5, fontSize: 9 }}>
              Training Load
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: tlColour, flexShrink: 0 }} />
              <div style={{ fontSize: 10, fontWeight: 600, color: tlColour, lineHeight: 1.3 }}>
                {tlStatus}
              </div>
            </div>
          </button>

        </div>

        {/* Tagline */}
        <div style={{
          marginTop: 14,
          fontSize: 12,
          color: 'var(--color-text-dim)',
          fontStyle: 'italic',
          lineHeight: 1.6,
        }}>
          Small choices. Strong direction. You&apos;re becoming who you&apos;re building.
        </div>

      </div>

      {/* ── SECTION 2: Long-term health goals ────────────────────── */}

      <div className="section-label" style={{ paddingLeft: 4, marginTop: 4 }}>
        Long-term Goals
      </div>

      {/* VO2 Max card */}
      <div className="card" style={{ padding: 0 }}>

        {/* ── Collapsed header (always visible) ─────────────────── */}
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

        {/* ── Expanded content ──────────────────────────────────── */}
        {vo2Expanded && (
          <div style={{ padding: '0 16px 16px' }}>

            {/* Header row: label + large value + next-tier badge */}
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

            {/* Inline entry form */}
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

            {/* Spectrum bar */}
            <div style={{ paddingRight: 8 }}>
              <svg viewBox="0 0 280 38" width="100%" style={{ display: 'block', overflow: 'visible' }}>
                <defs>
                  <linearGradient id="vo2BarGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%"   style={{ stopColor: 'var(--color-spectrum-start)' }} />
                    <stop offset="100%" style={{ stopColor: 'var(--color-spectrum-end)' }} />
                  </linearGradient>
                </defs>

                {/* Gradient bar */}
                <rect x="0" y="22" width="280" height="10" rx="5" fill="url(#vo2BarGrad)" />

                {/* Target marker at 40 — subtle diamond + label */}
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

                {/* Current value marker — circle with value above */}
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

              {/* Band labels.
                  minWidth: 0 overrides flex's default `min-width: auto` so narrow
                  bands (Excellent at 8%) can't widen to fit their text and push
                  Superior past the card's right edge. */}
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

            {/* Sparkline */}
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
        const ratioHistory = pairCardioHistory(data?.biomarkers ?? [])

        return (
          <div className="card" style={{ padding: 0 }}>

            {/* ── Header row (always visible, tap to expand) ─────── */}
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
                  <div style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>
                    LDL:HDL ratio
                  </div>
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

            {/* ── Expanded content ──────────────────────────────── */}
            {cardioExpanded && (
              <div style={{ padding: '0 16px 16px' }}>

                {/* Inline entry form */}
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

                {/* ── LDL spectrum ──────────────────────────────── */}
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

                {/* ── HDL spectrum ──────────────────────────────── */}
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

                {/* ── Ratio trend sparkline ─────────────────────── */}
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
                          x1={PAD_X}
                          y1={thresholdY}
                          x2={W - PAD_X}
                          y2={thresholdY}
                          stroke="var(--color-text-dim)"
                          strokeWidth="1"
                          strokeDasharray="3 3"
                        />
                        <text
                          x={W - PAD_X}
                          y={thresholdY - 3}
                          textAnchor="end"
                          fontSize="8"
                          style={{ fill: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}
                        >
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
                            <text
                              x={p.x}
                              y={p.y - 6}
                              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                              fontSize="10"
                              fontWeight="600"
                              style={{ fill: 'var(--color-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.06em' }}
                            >
                              {p.ratio.toFixed(2)}
                            </text>
                            <text
                              x={p.x}
                              y="72"
                              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                              fontSize="8"
                              style={{ fill: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}
                            >
                              {fmtSparkDate(p.date)}
                            </text>
                          </g>
                        ))}

                        {n === 1 && (
                          <text
                            x={W - PAD_X}
                            y="66"
                            textAnchor="end"
                            fontSize="9"
                            fontStyle="italic"
                            style={{ fill: 'var(--color-text-dim)' }}
                          >
                            next reading?
                          </text>
                        )}
                      </svg>
                    )
                  })()}
                </div>

                {/* Footer */}
                <div style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: '1px solid var(--color-border)',
                  textAlign: 'center',
                  fontSize: 12,
                  color: 'var(--color-text-dim)',
                }}>
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

                {/* Permanent entry point — always opens the entry form. */}
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

      {/* Glucose stability card */}
      <div className="card">
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
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 15,
                    color: 'var(--color-text-primary)',
                  }}>
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

      {/* Training Load card */}
      <div className="card" style={{ padding: 0 }}>
        <button
          type="button"
          onClick={() => setTlExpanded(prev => !prev)}
          style={{
            width: '100%', textAlign: 'left', background: 'none', border: 'none',
            cursor: 'pointer', padding: 16,
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: tlColour, flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>Training Load</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500, color: tlColour }}>{tlStatus}</span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={`chevron${tlExpanded ? ' open' : ''}`} style={{ flexShrink: 0 }}>
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {tlExpanded && (() => {
          const lastPoint = trainingHistory.length > 0 ? trainingHistory[trainingHistory.length - 1] : null
          const acute   = lastPoint?.acute   ?? 0
          const chronic = lastPoint?.chronic  ?? 0
          const ratio   = lastPoint?.ratio    ?? null

          // Spectrum bar: full scale 0–2.0, five zones
          const BAR_W = 280
          const ZONES = [
            { end: 0.6,  colour: 'var(--color-amber)' },
            { end: 0.8,  colour: 'var(--color-training-easy)' },
            { end: 1.3,  colour: 'var(--color-success)' },
            { end: 1.5,  colour: 'var(--color-amber)' },
            { end: 2.0,  colour: 'var(--color-danger)' },
          ]
          const SCALE_MAX = 2.0
          const ratioX = ratio != null ? Math.min(ratio, SCALE_MAX) / SCALE_MAX * BAR_W : null

          // 30-day chart
          const n = trainingHistory.length
          const PAD_X = 8, PAD_Y = 8, CHART_H = 44, CHART_W = 280
          const ratios = trainingHistory.map(p => p.ratio ?? 0)
          const maxR = Math.max(...ratios, 1.6)
          const xOf = (i: number) => n <= 1 ? PAD_X : PAD_X + (i / (n - 1)) * (CHART_W - 2 * PAD_X)
          const yOf = (v: number) => PAD_Y + CHART_H * (1 - v / maxR)
          const opt_y1 = yOf(1.3), opt_y2 = yOf(0.8)

          return (
            <div style={{ padding: '0 16px 16px' }}>

              {/* Acute / Chronic row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div style={{ textAlign: 'center', padding: '10px 8px', background: 'var(--color-bg)', borderRadius: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: 3 }}>
                    Acute (7d)
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {acute}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>TSU</div>
                </div>
                <div style={{ textAlign: 'center', padding: '10px 8px', background: 'var(--color-bg)', borderRadius: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: 3 }}>
                    Chronic (28d)
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {chronic}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>TSU</div>
                </div>
              </div>

              {/* Ratio + spectrum bar */}
              <div style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>Ratio (acute / chronic)</div>
                  {ratio != null && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: tlColour }}>
                      {ratio.toFixed(2)}
                    </div>
                  )}
                </div>

                <svg viewBox={`0 0 ${BAR_W} 30`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
                  {/* Zone bands */}
                  {(() => {
                    let x = 0
                    return ZONES.map((z, i) => {
                      const prev = i === 0 ? 0 : ZONES[i - 1].end
                      const w = (z.end - prev) / SCALE_MAX * BAR_W
                      const rect = <rect key={z.end} x={x} y="14" width={w} height="10" fill={z.colour} opacity="0.5"
                        rx={i === 0 ? 5 : 0}
                        style={{ borderRadius: i === ZONES.length - 1 ? '0 5px 5px 0' : '0' }}
                      />
                      x += w
                      return rect
                    })
                  })()}

                  {/* Zone dividers + scale labels */}
                  {[0.6, 0.8, 1.3, 1.5].map(v => {
                    const cx = v / SCALE_MAX * BAR_W
                    return (
                      <g key={v}>
                        <line x1={cx} y1="12" x2={cx} y2="24" stroke="var(--color-surface)" strokeWidth="1.5" />
                        <text x={cx} y="29" textAnchor="middle" fontSize="7" style={{ fill: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                          {v}
                        </text>
                      </g>
                    )
                  })}

                  {/* Current ratio pin */}
                  {ratioX != null && (
                    <>
                      <line x1={ratioX} y1="8" x2={ratioX} y2="14" stroke={tlColour} strokeWidth="1.5" />
                      <circle cx={ratioX} cy="5" r="4" fill={tlColour} />
                    </>
                  )}
                </svg>
              </div>

              {/* 30-day trend chart */}
              {trainingHistory.length >= 2 && (
                <div style={{ marginTop: 16 }}>
                  <div className="section-label" style={{ marginBottom: 8 }}>30-day trend</div>
                  <svg viewBox={`0 0 ${CHART_W} ${PAD_Y * 2 + CHART_H + 12}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
                    <defs>
                      <clipPath id="tlClip">
                        <rect x={PAD_X} y={PAD_Y} width={CHART_W - 2 * PAD_X} height={CHART_H} />
                      </clipPath>
                    </defs>

                    {/* Optimal zone shaded band */}
                    <rect
                      x={PAD_X} y={opt_y1}
                      width={CHART_W - 2 * PAD_X}
                      height={Math.max(0, opt_y2 - opt_y1)}
                      fill="var(--color-success)"
                      opacity="0.08"
                      clipPath="url(#tlClip)"
                    />

                    {/* Line segments coloured per-day status */}
                    {trainingHistory.slice(1).map((pt, i) => {
                      const prev = trainingHistory[i]
                      return (
                        <line
                          key={pt.date}
                          x1={xOf(i).toFixed(1)} y1={yOf(prev.ratio ?? 0).toFixed(1)}
                          x2={xOf(i + 1).toFixed(1)} y2={yOf(pt.ratio ?? 0).toFixed(1)}
                          stroke={pt.colour}
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      )
                    })}

                    {/* First and last date labels */}
                    {trainingHistory.length > 0 && (() => {
                      const first = trainingHistory[0]
                      const last  = trainingHistory[trainingHistory.length - 1]
                      const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      return (
                        <>
                          <text x={PAD_X} y={PAD_Y * 2 + CHART_H + 10} fontSize="8" textAnchor="start" style={{ fill: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                            {fmt(first.date)}
                          </text>
                          <text x={CHART_W - PAD_X} y={PAD_Y * 2 + CHART_H + 10} fontSize="8" textAnchor="end" style={{ fill: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                            {fmt(last.date)}
                          </text>
                        </>
                      )
                    })()}
                  </svg>
                </div>
              )}

            </div>
          )
        })()}
      </div>

      {/* ── SECTION 3: Health calendar ───────────────────────────── */}

      <div className="section-label" style={{ paddingLeft: 4, marginTop: 4 }}>
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
            ? new Date(appt.next_due_date + 'T00:00:00')
            : nextDueDateFromLast(appt.last_completed_date, appt.interval_months)
          const dueColor  = dueDate
            ? (dueDate <= fourMonthsOut ? 'var(--color-amber)' : 'var(--color-text-dim)')
            : 'var(--color-text-dim)'
          const dueLabel  = dueDate ? `Due: ${fmtMonthYear(dueDate)}` : 'Not scheduled'

          return (
            <div
              key={appt.id}
              className="card"
              style={{
                opacity: dimmed ? 0.5 : 1,
                padding: dimmed ? '10px 14px' : '14px 16px',
                transition: 'opacity 200ms',
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

              {/* Inline edit form */}
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
                      type="date"
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
                    disabled={saving}
                    style={{ height: 40, fontSize: 13 }}
                  >
                    {saving ? 'Saving…' : 'Mark as done today'}
                  </button>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleSaveAppt(appt)}
                      disabled={saving}
                      style={{ flex: 1, height: 40, fontSize: 13 }}
                    >
                      {saving ? 'Saving…' : 'Save'}
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
  )
}
