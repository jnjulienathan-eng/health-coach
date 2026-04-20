'use client'

import { useState, useEffect } from 'react'
import { getGoalsData, saveAppointment, getVo2SparklineData, saveVo2Reading } from '@/lib/db'
import type { GoalsData, HealthAppointment, BiomarkerReading } from '@/lib/types'
import { scoreColor } from '@/lib/types'

// ─── Helpers ──────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// Per spec: Optimal ≥75, Good 60–74, OK 45–59, Low <45
function goalScoreLabel(score: number): string {
  if (score >= 75) return 'Optimal'
  if (score >= 60) return 'Good'
  if (score >= 45) return 'OK'
  return 'Low'
}

function nextDueDate(lastVisit: string | null, intervalMonths: number | null): Date | null {
  if (!lastVisit || !intervalMonths) return null
  const d = new Date(lastVisit + 'T00:00:00')
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
  dentist:         'Dentist',
  dermatologist:   'Dermatologist',
  gynaecologist:   'Gynaecologist',
  full_bloodwork:  'Full Bloodwork',
  breast_scan:     'Breast Scan',
  thyroid_scan:    'Thyroid Scan',
  bone_density:    'Bone Density Scan',
  colonoscopy:     'Colonoscopy',
  eye_optometrist: 'Eye & Optometrist',
}

const ALWAYS_SHOW = ['dentist', 'dermatologist']

// VO2 max bands (scale max: 50 ml/kg/min)
const VO2_SCALE_MAX = 50
const VO2_BANDS = [
  { label: 'Poor',      rangeLabel: '<23',   start: 0,  end: 23 },
  { label: 'Fair',      rangeLabel: '23–27', start: 23, end: 28 },
  { label: 'Good',      rangeLabel: '28–32', start: 28, end: 33 },
  { label: 'Excellent', rangeLabel: '33–36', start: 33, end: 37 },
  { label: 'Superior',  rangeLabel: '37+',   start: 37, end: 50 },
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

// ─── Component ────────────────────────────────────────────────────

interface Props {
  onNavigateDashboard: () => void
}

export default function GoalsTab({ onNavigateDashboard }: Props) {
  const [data,          setData]          = useState<GoalsData | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [editingId,     setEditingId]     = useState<string | null>(null)
  const [editLastVisit, setEditLastVisit] = useState('')
  const [editNextBooked, setEditNextBooked] = useState('')
  const [saving,        setSaving]        = useState(false)

  // VO2 Max card
  const [vo2Expanded,        setVo2Expanded]        = useState(false)
  const [vo2Sparkline,       setVo2Sparkline]        = useState<BiomarkerReading[]>([])
  const [vo2SparklineLoaded, setVo2SparklineLoaded]  = useState(false)
  const [vo2EntryOpen,       setVo2EntryOpen]        = useState(false)
  const [vo2EntryValue,      setVo2EntryValue]       = useState('')
  const [vo2EntryDate,       setVo2EntryDate]        = useState('')
  const [vo2Saving,          setVo2Saving]           = useState(false)

  useEffect(() => {
    getGoalsData()
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { console.error('GoalsTab load error:', e); setLoading(false) })
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

  const today = new Date()
  const fourMonthsOut = new Date(today)
  fourMonthsOut.setMonth(fourMonthsOut.getMonth() + 4)

  const visibleAppts = (data?.appointments ?? []).filter(appt => {
    if (ALWAYS_SHOW.includes(appt.type)) return true
    if (!appt.last_visit) return true
    const due = nextDueDate(appt.last_visit, appt.interval_months)
    return !due || due <= fourMonthsOut
  })

  const sortedAppts = [...visibleAppts].sort((a, b) => {
    const aA = ALWAYS_SHOW.includes(a.type) ? 0 : 1
    const bA = ALWAYS_SHOW.includes(b.type) ? 0 : 1
    if (aA !== bA) return aA - bA
    const aD = nextDueDate(a.last_visit, a.interval_months)
    const bD = nextDueDate(b.last_visit, b.interval_months)
    if (!aD) return -1
    if (!bD) return 1
    return aD.getTime() - bD.getTime()
  })

  // ── Appointment editing ────────────────────────────────────────

  function startEdit(appt: HealthAppointment) {
    setEditingId(appt.id)
    setEditLastVisit(appt.last_visit ?? '')
    setEditNextBooked(appt.next_booked ?? '')
  }

  async function handleSaveAppt(appt: HealthAppointment) {
    setSaving(true)
    try {
      await saveAppointment(appt.id, {
        last_visit:   editLastVisit  || null,
        next_booked:  editNextBooked || null,
      })
      const updated = await getGoalsData()
      setData(updated)
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

        <div style={{
          fontSize: 20,
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          marginBottom: 16,
        }}>
          {getGreeting()}, Julie
        </div>

        {/* Score cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

          <button
            type="button"
            onClick={onNavigateDashboard}
            style={{
              textAlign: 'left',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: '14px 12px',
              cursor: 'pointer',
            }}
          >
            <div className="section-label" style={{ color: 'var(--color-text-dim)', marginBottom: 6 }}>
              Behavior Score
            </div>
            {behaviorScore != null ? (
              <>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 40,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: scoreColor(behaviorScore),
                }}>
                  {Math.round(behaviorScore)}
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: scoreColor(behaviorScore), marginTop: 4 }}>
                  {goalScoreLabel(behaviorScore)}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--color-text-dim)', marginTop: 4 }}>Not logged</div>
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
              padding: '14px 12px',
              cursor: 'pointer',
            }}
          >
            <div className="section-label" style={{ color: 'var(--color-text-dim)', marginBottom: 6 }}>
              Outcome Score
            </div>
            {outcomeScore != null ? (
              <>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 40,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: scoreColor(outcomeScore),
                }}>
                  {Math.round(outcomeScore)}
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: scoreColor(outcomeScore), marginTop: 4 }}>
                  {goalScoreLabel(outcomeScore)}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--color-text-dim)', marginTop: 4 }}>Not logged</div>
            )}
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
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M9 15S2 10.5 2 6a4 4 0 018 0 4 4 0 018 0c0 4.5-7 9-7 9z"
              stroke="var(--color-danger)"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Cardiovascular
          </span>
        </div>

        {(ldl || hdl) ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {ldl && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>LDL</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 15,
                    color: ldl.value < 3.0 ? 'var(--color-success)' : 'var(--color-danger)',
                  }}>
                    {ldl.value}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>mmol/L</span>
                  <span style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: ldl.value < 3.0 ? 'var(--color-success)' : 'var(--color-danger)',
                  }} />
                </div>
              </div>
            )}

            {hdl && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>HDL</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 15,
                    color: hdl.value > 1.2 ? 'var(--color-success)' : 'var(--color-danger)',
                  }}>
                    {hdl.value}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>mmol/L</span>
                  <span style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: hdl.value > 1.2 ? 'var(--color-success)' : 'var(--color-danger)',
                  }} />
                </div>
              </div>
            )}

            {ldl && hdl && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid var(--color-border)',
                paddingTop: 10,
              }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  LDL/HDL ratio
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--color-text-primary)' }}>
                  {(ldl.value / hdl.value).toFixed(1)}
                </span>
              </div>
            )}

          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>Not yet logged</div>
        )}
      </div>

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

      {/* ── SECTION 3: Health calendar ───────────────────────────── */}

      <div className="section-label" style={{ paddingLeft: 4, marginTop: 4 }}>
        Health Calendar
      </div>

      {sortedAppts.length === 0 ? (
        <div className="card" style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>
          No appointments to show
        </div>
      ) : (
        sortedAppts.map(appt => {
          const due         = nextDueDate(appt.last_visit, appt.interval_months)
          const isEditing   = editingId === appt.id
          const isColonoscopy = appt.type === 'colonoscopy'
          const dueColor    = appt.next_booked
            ? 'var(--color-success)'
            : due
            ? 'var(--color-amber)'
            : 'var(--color-text-dim)'
          const dueLabel    = appt.next_booked
            ? `Booked: ${fmtMonthYear(new Date(appt.next_booked + 'T00:00:00'))}`
            : due
            ? `Due: ${fmtMonthYear(due)}`
            : 'Not yet scheduled'

          return (
            <div
              key={appt.id}
              className="card"
              style={{
                opacity: isColonoscopy ? 0.6 : 1,
                padding: isColonoscopy ? '10px 14px' : '14px 16px',
              }}
            >
              <button
                type="button"
                onClick={() => isEditing ? setEditingId(null) : startEdit(appt)}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{
                    fontSize: isColonoscopy ? 13 : 14,
                    fontWeight: 500,
                    color: 'var(--color-text-primary)',
                  }}>
                    {APPT_LABELS[appt.type] ?? appt.type}
                  </span>
                  <span style={{ fontSize: 12, color: dueColor, flexShrink: 0 }}>
                    {dueLabel}
                  </span>
                </div>
                {appt.last_visit && !isEditing && (
                  <div style={{ marginTop: 3, fontSize: 11, color: 'var(--color-text-dim)' }}>
                    Last visit: {fmtDate(appt.last_visit)}
                  </div>
                )}
              </button>

              {/* Inline edit form */}
              {isEditing && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div className="section-label" style={{ marginBottom: 4 }}>Last visit</div>
                    <input
                      type="date"
                      value={editLastVisit}
                      onChange={e => setEditLastVisit(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8 }}
                    />
                  </div>
                  <div>
                    <div className="section-label" style={{ marginBottom: 4 }}>Next booked</div>
                    <input
                      type="date"
                      value={editNextBooked}
                      onChange={e => setEditNextBooked(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8 }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn-primary"
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
