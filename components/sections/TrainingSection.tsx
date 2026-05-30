'use client'

import { useState } from 'react'
import type { TrainingData, TrainingSession } from '@/lib/types'
import { zone3Intensity } from '@/lib/types'
import Section from '@/components/ui/Section'

interface Props {
  data: TrainingData
  onChange: (data: TrainingData) => void
  onSave: () => void
  saving?: boolean
  basalCalories?: number | null
  activeCalories?: number | null
}

const ACTIVITIES: {
  type: string
  label: string
  emoji: string
  defaultMin: number
}[] = [
  { type: 'swim',    label: 'Swim',    emoji: '🏊', defaultMin: 50 },
  { type: 'egym',    label: 'eGym',    emoji: '🏋️', defaultMin: 35 },
  { type: 'run',     label: 'Run',     emoji: '🏃', defaultMin: 35 },
  { type: 'walk',    label: 'Walk',    emoji: '🚶', defaultMin: 75 },
  { type: 'Cycling', label: 'Cycling', emoji: '🚴', defaultMin: 45 },
]

const INTENSITY_COLORS: Record<string, string> = {
  Easy:     'var(--color-success)',
  Moderate: 'var(--color-amber)',
  Hard:     'var(--color-danger)',
}

function activityLabel(type: string) {
  return ACTIVITIES.find((a) => a.type === type)?.label ?? type
}

function activityEmoji(type: string): string {
  switch (type.toLowerCase()) {
    case 'run':
    case 'running':
    case 'outdoor run':
    case 'indoor run':
      return '🏃'
    case 'walk':
    case 'outdoor walk':
    case 'indoor walk':
      return '🚶'
    case 'cycling':
    case 'outdoor cycling':
    case 'indoor cycling':
      return '🚴'
    case 'swim':
    case 'swimming':
    case 'pool swimming':
    case 'open water swimming':
      return '🏊'
    case 'strength':
    case 'egym':
    case 'strength training':
    case 'functional strength training':
      return '🏋️'
    case 'rowing':
      return '🚣'
    case 'elliptical':
      return '〇'
    case 'yoga':
    case 'pilates':
      return '🧘'
    case 'hiking':
      return '🥾'
    case 'hiit':
      return '⚡'
    default:
      return '🏅'
  }
}

function formatStartTime(startTime: string | null | undefined): string | null {
  if (!startTime) return null
  try {
    // "2026-04-29 07:15:00 +0200" → ISO → local HH:MM
    const iso = startTime.replace(' ', 'T').replace(' ', '')
    const d = new Date(iso)
    if (isNaN(d.getTime())) return null
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  } catch {
    return null
  }
}

export default function TrainingSection({ data, onChange, onSave, saving, basalCalories = null, activeCalories = null }: Props) {
  const [localSaved, setLocalSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [closeTick, setCloseTick] = useState(0)
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customMin, setCustomMin] = useState<number>(30)
  const [customZone3, setCustomZone3] = useState<number | null>(null)
  const [customCal, setCustomCal] = useState<number | null>(null)

  const isComplete = data.sessions.length > 0

  const change = (d: TrainingData) => { setLocalSaved(false); setSaveError(false); onChange(d) }

  const addSession = (type: string, defaultMin: number) => {
    const session: TrainingSession = {
      id: crypto.randomUUID(),
      activity_type: type,
      duration_min: defaultMin,
      zone3_plus_minutes: null,
      active_calories: null,
    }
    change({ ...data, sessions: [...data.sessions, session] })
  }

  const removeSession = (id: string) =>
    change({ ...data, sessions: data.sessions.filter((s) => s.id !== id) })

  const updateSession = (id: string, patch: Partial<TrainingSession>) =>
    change({
      ...data,
      sessions: data.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })

  const handleSave = async () => {
    setSaveError(false)
    try {
      await onSave()
      setLocalSaved(true)
      setCloseTick((t) => t + 1)
      setTimeout(() => setLocalSaved(false), 2000)
    } catch {
      setSaveError(true)
    }
  }

  // Collapsed summary
  const summary = isComplete ? (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: 'var(--color-text-secondary)',
      }}
    >
      {data.sessions.map((s) => activityEmoji(s.activity_type)).join(' ')}
    </div>
  ) : null

  return (
    <Section
      title="Training"
      isComplete={isComplete}
      rightSlot={summary}
      accent
      forceClose={closeTick}
      icon={
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M10 2L5 9h5l-1 7 6-8h-5l1-6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>

        {/* Energy strip */}
        {(() => {
          const total = (basalCalories != null && activeCalories != null) ? basalCalories + activeCalories : null
          const fmt = (n: number | null) => n != null ? n.toLocaleString() + ' kcal' : '—'
          return (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
              {([
                { label: 'Basal',  value: fmt(basalCalories) },
                { label: 'Active', value: fmt(activeCalories) },
                { label: 'Total',  value: fmt(total) },
              ] as { label: string; value: string }[]).map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 'var(--fs-label)', fontWeight: 'var(--fw-bold)', letterSpacing: 'var(--ls-label-bold)', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                    {label}
                  </span>
                  <span style={{ fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-bold)', color: 'var(--color-navy)' }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          )
        })()}

        {/* Quick-add row */}
        <div>
          <div
            style={{
              fontSize: 'var(--fs-label)',
              fontWeight: 'var(--fw-bold)',
              letterSpacing: 'var(--ls-label-bold)',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
              marginBottom: 'var(--space-xs)',
            }}
          >
            Add session
          </div>
          <div className="scroll-row">
            {ACTIVITIES.map(({ type, label, emoji, defaultMin }) => (
              <button
                key={type}
                type="button"
                onClick={() => addSession(type, defaultMin)}
                className="btn-template"
              >
                <span style={{ fontSize: 20 }}>{emoji}</span>
                <span style={{ fontSize: 12, marginTop: 2 }}>{label}</span>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--color-text-secondary)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {defaultMin}m
                </span>
              </button>
            ))}

            {/* Other + button */}
            <button
              type="button"
              onClick={() => setShowCustomForm((v) => !v)}
              className="btn-template"
              style={{ background: showCustomForm ? 'var(--color-navy)' : undefined, color: showCustomForm ? '#fff' : undefined }}
            >
              <span style={{ fontSize: 18 }}>＋</span>
              <span style={{ fontSize: 12, marginTop: 2 }}>Other</span>
            </button>
          </div>

          {/* Inline custom activity form */}
          {showCustomForm && (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                background: 'var(--color-primary-light)',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {/* Name + duration + kcal row */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 2 }}>
                  <div style={{ fontSize: 'var(--fs-label)', fontWeight: 'var(--fw-bold)', letterSpacing: 'var(--ls-label-bold)', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>Activity</div>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Yoga, Pilates…"
                    style={{ width: '100%', minHeight: 48, padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--fs-body)', color: 'var(--color-text-primary)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', outline: 'none', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 'var(--fs-label)', fontWeight: 'var(--fw-bold)', letterSpacing: 'var(--ls-label-bold)', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>Minutes</div>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={customMin}
                    onChange={(e) => setCustomMin(e.target.value === '' ? 0 : parseInt(e.target.value))}
                    style={{ width: '100%', minHeight: 48, padding: 'var(--space-sm) var(--space-md)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-body)', color: 'var(--color-text-primary)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 'var(--fs-label)', fontWeight: 'var(--fw-bold)', letterSpacing: 'var(--ls-label-bold)', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>Kcal</div>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={customCal ?? ''}
                    onChange={(e) => setCustomCal(e.target.value === '' ? null : parseInt(e.target.value))}
                    placeholder="—"
                    style={{ width: '100%', minHeight: 48, padding: 'var(--space-sm) var(--space-md)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-body)', color: 'var(--color-text-primary)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Zone 3+ minutes */}
              <div>
                <div style={{ fontSize: 'var(--fs-label)', fontWeight: 'var(--fw-bold)', letterSpacing: 'var(--ls-label-bold)', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>
                  Zone 3+ min <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--color-text-dim)' }}>optional</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={customZone3 ?? ''}
                    onChange={(e) => setCustomZone3(e.target.value === '' ? null : parseInt(e.target.value))}
                    placeholder="—"
                    min={0}
                    max={120}
                    style={{ width: 72, minHeight: 48, padding: 'var(--space-sm) var(--space-md)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-body)', color: 'var(--color-text-primary)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--fs-label)' }}>min</span>
                  {(() => {
                    const intensity = zone3Intensity(customZone3)
                    return intensity ? (
                      <span style={{ fontSize: 12, fontWeight: 500, color: INTENSITY_COLORS[intensity], marginLeft: 4 }}>
                        {intensity}
                      </span>
                    ) : null
                  })()}
                </div>
              </div>

              {/* Add button */}
              <button
                type="button"
                disabled={!customName.trim()}
                onClick={() => {
                  const session: TrainingSession = {
                    id: crypto.randomUUID(),
                    activity_type: customName.trim() || 'Other',
                    duration_min: customMin || 0,
                    zone3_plus_minutes: customZone3,
                    active_calories: customCal,
                  }
                  change({ ...data, sessions: [...data.sessions, session] })
                  setCustomName('')
                  setCustomMin(30)
                  setCustomZone3(null)
                  setCustomCal(null)
                  setShowCustomForm(false)
                }}
                className="btn-primary"
                style={{ opacity: customName.trim() ? 1 : 0.4 }}
              >
                Add session
              </button>
            </div>
          )}
        </div>

        {/* Session cards */}
        {data.sessions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', zIndex: 0 }}>
            {data.sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onChange={(patch) => updateSession(session.id, patch)}
                onRemove={() => removeSession(session.id)}
              />
            ))}
          </div>
        )}

        {/* Save */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
          style={{ background: saveError ? 'var(--color-danger)' : localSaved ? '#52B882' : undefined }}
        >
          {saveError ? 'Save failed — retry' : localSaved ? '✓ Saved' : saving ? 'Saving…' : 'Save training'}
        </button>
      </div>
    </Section>
  )
}

// ─── Session card ─────────────────────────────────────────────────
function SessionCard({
  session,
  onChange,
  onRemove,
}: {
  session: TrainingSession
  onChange: (patch: Partial<TrainingSession>) => void
  onRemove: () => void
}) {
  const INTENSITY_COLORS: Record<string, string> = {
    Easy:     'var(--color-navy)',
    Moderate: 'var(--color-amber)',
    Hard:     'var(--color-danger)',
  }

  const intensity = zone3Intensity(session.zone3_plus_minutes)

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-md)',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>{activityEmoji(session.activity_type)}</span>
          <div>
            <span
              style={{
                fontSize: 'var(--fs-body)',
                fontWeight: 'var(--fw-semibold)',
                color: 'var(--color-text-primary)',
              }}
            >
              {activityLabel(session.activity_type)}
            </span>
            {formatStartTime(session.start_time) && (
              <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 1 }}>
                {formatStartTime(session.start_time)}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove session"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-dim)',
            fontSize: 18,
            lineHeight: 1,
            padding: 4,
          }}
        >
          ×
        </button>
      </div>

      {/* Duration + Calories */}
      <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 'var(--fs-label)',
              fontWeight: 'var(--fw-bold)',
              letterSpacing: 'var(--ls-label-bold)',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
              marginBottom: 'var(--space-xs)',
            }}
          >
            Duration
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              inputMode="numeric"
              value={session.duration_min ?? ''}
              onChange={(e) =>
                onChange({
                  duration_min: e.target.value === '' ? 0 : parseInt(e.target.value),
                })
              }
              style={{
                width: 64,
                minHeight: 48,
                padding: 'var(--space-sm) var(--space-md)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--fs-body)',
                color: 'var(--color-text-primary)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                outline: 'none',
              }}
            />
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--fs-label)' }}>min</span>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 'var(--fs-label)',
              fontWeight: 'var(--fw-bold)',
              letterSpacing: 'var(--ls-label-bold)',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
              marginBottom: 'var(--space-xs)',
            }}
          >
            Calories
            <span
              style={{
                fontWeight: 400,
                textTransform: 'none',
                marginLeft: 4,
                color: 'var(--color-text-dim)',
              }}
            >
              optional
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              inputMode="numeric"
              value={session.active_calories ?? ''}
              onChange={(e) =>
                onChange({
                  active_calories: e.target.value === '' ? null : parseInt(e.target.value),
                })
              }
              placeholder="—"
              style={{
                width: 64,
                minHeight: 48,
                padding: 'var(--space-sm) var(--space-md)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--fs-body)',
                color: 'var(--color-text-primary)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                outline: 'none',
              }}
            />
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--fs-label)' }}>kcal</span>
          </div>
        </div>
      </div>

      {/* Zone 3+ minutes */}
      <div>
        <div
          style={{
            fontSize: 'var(--fs-label)',
            fontWeight: 'var(--fw-bold)',
            letterSpacing: 'var(--ls-label-bold)',
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
            marginBottom: 'var(--space-xs)',
          }}
        >
          Zone 3+ min
          <span
            style={{
              fontWeight: 400,
              textTransform: 'none',
              marginLeft: 4,
              color: 'var(--color-text-dim)',
            }}
          >
            optional
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="number"
            inputMode="numeric"
            value={session.zone3_plus_minutes ?? ''}
            onChange={(e) =>
              onChange({ zone3_plus_minutes: e.target.value === '' ? null : parseInt(e.target.value) })
            }
            placeholder="—"
            min={0}
            max={120}
            style={{
              width: 72,
              minHeight: 48,
              padding: 'var(--space-sm) var(--space-md)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--fs-body)',
              color: 'var(--color-text-primary)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              outline: 'none',
            }}
          />
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--fs-label)' }}>min</span>
          {intensity && (
            <span style={{ fontSize: 13, fontWeight: 500, color: INTENSITY_COLORS[intensity] }}>
              {intensity}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
