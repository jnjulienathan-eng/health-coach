'use client'

import { useState } from 'react'
import type { TrainingData, TrainingSession, ActivityType } from '@/lib/types'
import Section from '@/components/ui/Section'
import TapScale from '@/components/ui/TapScale'

interface Props {
  data: TrainingData
  onChange: (data: TrainingData) => void
  onSave: () => void
  saving?: boolean
}

const ACTIVITIES: {
  type: ActivityType
  label: string
  emoji: string
  defaultMin: number
}[] = [
  { type: 'swim', label: 'Swim',  emoji: '🏊', defaultMin: 50 },
  { type: 'egym', label: 'eGym',  emoji: '💪', defaultMin: 35 },
  { type: 'run',  label: 'Run',   emoji: '🏃', defaultMin: 35 },
  { type: 'walk', label: 'Walk',  emoji: '🚶', defaultMin: 75 },
]

function activityLabel(type: string) {
  return ACTIVITIES.find((a) => a.type === type)?.label ?? type
}
function activityEmoji(type: string) {
  return ACTIVITIES.find((a) => a.type === type)?.emoji ?? '🏋️'
}

export default function TrainingSection({ data, onChange, onSave, saving }: Props) {
  const [localSaved, setLocalSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customMin, setCustomMin] = useState<number>(30)
  const [customEffort, setCustomEffort] = useState<number | null>(null)
  const [customCal, setCustomCal] = useState<number | null>(null)

  const isComplete = data.sessions.length > 0 || data.cycled_today

  const change = (d: TrainingData) => { setLocalSaved(false); setSaveError(false); onChange(d) }

  const addSession = (type: ActivityType, defaultMin: number) => {
    const session: TrainingSession = {
      id: crypto.randomUUID(),
      activity_type: type,
      duration_min: defaultMin,
      perceived_effort: null,
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
      {data.sessions.length > 0 && data.cycled_today && ' · '}
      {data.cycled_today && '🚴'}
    </div>
  ) : null

  return (
    <Section title="Training" isComplete={isComplete} rightSlot={summary}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Quick-add row */}
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
              marginBottom: 10,
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
              style={{ background: showCustomForm ? 'var(--color-primary)' : undefined, color: showCustomForm ? '#fff' : undefined }}
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
              {/* Name + duration row */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 2 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 6 }}>Activity</div>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Yoga, Pilates…"
                    style={{ width: '100%', height: 44, padding: '0 12px', fontSize: 14, color: 'var(--color-text-primary)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, outline: 'none', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 6 }}>Minutes</div>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={customMin}
                    onChange={(e) => setCustomMin(e.target.value === '' ? 0 : parseInt(e.target.value))}
                    style={{ width: '100%', height: 44, padding: '0 10px', fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--color-text-primary)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 6 }}>Kcal</div>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={customCal ?? ''}
                    onChange={(e) => setCustomCal(e.target.value === '' ? null : parseInt(e.target.value))}
                    placeholder="—"
                    style={{ width: '100%', height: 44, padding: '0 10px', fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--color-text-primary)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Effort */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                  Effort <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--color-text-dim)' }}>optional</span>
                </div>
                <TapScale value={customEffort} onChange={setCustomEffort} lowLabel="easy" highLabel="max effort" />
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
                    perceived_effort: customEffort,
                    active_calories: customCal,
                  }
                  change({ ...data, sessions: [...data.sessions, session] })
                  setCustomName('')
                  setCustomMin(30)
                  setCustomEffort(null)
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

        {/* Cycling toggle */}
        <CyclingRow
          cycled={data.cycled_today}
          minutes={data.cycling_minutes}
          onCycledChange={(v) => change({ ...data, cycled_today: v })}
          onMinutesChange={(v) => change({ ...data, cycling_minutes: v })}
        />

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
  return (
    <div
      style={{
        background: 'var(--color-primary-light)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        padding: 14,
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
          <span
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: 'var(--color-text-primary)',
            }}
          >
            {activityLabel(session.activity_type)}
          </span>
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
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
              marginBottom: 6,
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
                height: 44,
                padding: '0 10px',
                fontFamily: 'var(--font-mono)',
                fontSize: 20,
                color: 'var(--color-text-primary)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                outline: 'none',
              }}
            />
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>min</span>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
              marginBottom: 6,
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
                height: 44,
                padding: '0 10px',
                fontFamily: 'var(--font-mono)',
                fontSize: 20,
                color: 'var(--color-text-primary)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                outline: 'none',
              }}
            />
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>kcal</span>
          </div>
        </div>
      </div>

      {/* Effort */}
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
            marginBottom: 8,
          }}
        >
          Perceived effort
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
        <TapScale
          value={session.perceived_effort}
          onChange={(v) => onChange({ perceived_effort: v })}
          lowLabel="easy"
          highLabel="max effort"
        />
      </div>
    </div>
  )
}

// ─── Cycling row ──────────────────────────────────────────────────
function CyclingRow({
  cycled,
  minutes,
  onCycledChange,
  onMinutesChange,
}: {
  cycled: boolean
  minutes: number | null
  onCycledChange: (v: boolean) => void
  onMinutesChange: (v: number | null) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>🚴</span>
        <span style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>Cycled today</span>
        <span
          style={{
            fontSize: 11,
            color: 'var(--color-text-dim)',
          }}
        >
          (transport)
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {cycled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              inputMode="numeric"
              value={minutes ?? ''}
              onChange={(e) =>
                onMinutesChange(e.target.value === '' ? null : parseInt(e.target.value))
              }
              placeholder="min"
              style={{
                width: 56,
                height: 36,
                padding: '0 8px',
                fontFamily: 'var(--font-mono)',
                fontSize: 15,
                color: 'var(--color-text-primary)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                outline: 'none',
                textAlign: 'center',
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>min</span>
          </div>
        )}
        <input
          type="checkbox"
          checked={cycled}
          onChange={(e) => onCycledChange(e.target.checked)}
          className="toggle"
          aria-label="Cycled today"
        />
      </div>
    </div>
  )
}
