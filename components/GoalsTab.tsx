'use client'

import { useState, useEffect } from 'react'
import { getGoalsData, saveAppointment } from '@/lib/db'
import type { GoalsData, HealthAppointment } from '@/lib/types'
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

// VO2 max bands for women 50–59 (scale max: 50 ml/kg/min)
const VO2_SCALE_MAX = 50
const VO2_BANDS = [
  { label: 'Poor',      min: 0,  max: 18, color: 'var(--color-danger)' },
  { label: 'Fair',      min: 19, max: 24, color: 'var(--color-amber)' },
  { label: 'Good',      min: 25, max: 30, color: 'var(--color-spectrum-good)' },
  { label: 'Excellent', min: 31, max: 37, color: 'var(--color-success)' },
  { label: 'Superior',  min: 38, max: 50, color: 'var(--color-primary-dark)' },
]

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

  // ── VO2 max marker position (% of bar width) ───────────────────
  function vo2MarkerPct(value: number): number {
    return Math.min(value, VO2_SCALE_MAX) / VO2_SCALE_MAX * 100
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
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
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
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-dim)' }}>
            Target: 40 ml/kg/min
          </span>
        </div>

        {vo2Max ? (
          <>
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 28, color: 'var(--color-text-primary)' }}>
                {vo2Max.value}
              </span>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 6 }}>
                ml/kg/min
              </span>
            </div>

            {/* Spectrum bar */}
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden' }}>
                {VO2_BANDS.map((band) => {
                  const width = ((band.max - band.min + 1) / VO2_SCALE_MAX) * 100
                  return (
                    <div key={band.label} style={{ flex: `0 0 ${width}%`, background: band.color }} />
                  )
                })}
              </div>
              {/* Vertical marker */}
              <div style={{
                position: 'absolute',
                top: 1,
                left: `${vo2MarkerPct(vo2Max.value)}%`,
                transform: 'translateX(-50%)',
                width: 3,
                height: 14,
                background: 'var(--color-text-primary)',
                borderRadius: 2,
                boxShadow: '0 0 0 2px var(--color-surface)',
              }} />
            </div>

            {/* Band labels */}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {VO2_BANDS.map(band => (
                <span
                  key={band.label}
                  style={{
                    fontSize: 9,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-text-dim)',
                    letterSpacing: '0.02em',
                  }}
                >
                  {band.label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>Not yet logged</div>
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
