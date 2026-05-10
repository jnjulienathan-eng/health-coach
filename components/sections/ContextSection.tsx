'use client'

import { useState } from 'react'
import type { ContextData, Symptom } from '@/lib/types'
import Section from '@/components/ui/Section'

interface Props {
  data: ContextData
  cycleDay: number | null
  onChange: (data: ContextData) => void
  onSave: () => void
  onResetCycle: () => void
  onCycleDayChange: (day: number | null) => void
  saving?: boolean
}

const SYMPTOMS: Symptom[] = [
  'Congestion',
  'Headache',
  'Fatigue',
  'Nausea',
  'Cramps',
  'Bloating',
  'Other',
]

export default function ContextSection({ data, cycleDay, onChange, onSave, onResetCycle, onCycleDayChange, saving }: Props) {
  const [localSaved, setLocalSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [closeTick, setCloseTick] = useState(0)

  const change = (d: ContextData) => { setLocalSaved(false); setSaveError(false); onChange(d) }

  const isComplete =
    data.notes.length > 0 || data.symptoms.length > 0

  const toggleSymptom = (s: Symptom) => {
    const symptoms = data.symptoms.includes(s)
      ? data.symptoms.filter((x) => x !== s)
      : [...data.symptoms, s]
    change({ ...data, symptoms })
  }

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
  const summary =
    cycleDay != null ? (
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--color-text-secondary)',
        }}
      >
        Day {cycleDay}
      </span>
    ) : null

  return (
    <Section
      title="Context"
      isComplete={isComplete}
      rightSlot={summary}
      forceClose={closeTick}
      icon={
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="2" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 2v4M12 2v4M2 9h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>

        {/* ── Cycle day ─────────────────────────────────────────── */}
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
            Cycle day
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {/* Editable cycle day number */}
            <input
              type="number"
              min={1}
              max={40}
              value={cycleDay ?? ''}
              placeholder="—"
              onChange={(e) => {
                const v = e.target.value === '' ? null : parseInt(e.target.value, 10)
                onCycleDayChange(v && v > 0 ? v : null)
              }}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 64,
                fontWeight: 400,
                lineHeight: 1,
                color: cycleDay != null ? 'var(--color-text-primary)' : 'var(--color-text-dim)',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                width: 120,
                padding: 0,
                MozAppearance: 'textfield',
              }}
            />

            {/* Reset button */}
            <button
              type="button"
              onClick={onResetCycle}
              style={{
                padding: 'var(--space-sm) var(--space-md)',
                background: 'var(--color-surface)',
                border: '1.5px solid var(--color-danger)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--fs-label)',
                fontWeight: 'var(--fw-semibold)',
                color: 'var(--color-danger)',
                cursor: 'pointer',
                lineHeight: 1.3,
                textAlign: 'center',
                maxWidth: 140,
              }}
            >
              Period started today
              <br />
              <span style={{ fontSize: 11, fontWeight: 400 }}>Reset to Day 1</span>
            </button>
          </div>
        </div>

        {/* ── Symptoms ───────────────────────────────────────────── */}
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
            Symptoms
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SYMPTOMS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleSymptom(s)}
                className={`symptom-tag${data.symptoms.includes(s) ? ' selected' : ''}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* ── Travelling ─────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 'var(--fs-body)', color: 'var(--color-text-primary)' }}>
            Travelling today
          </span>
          <input
            type="checkbox"
            checked={data.travelling}
            onChange={(e) => change({ ...data, travelling: e.target.checked })}
            className="toggle"
            aria-label="Travelling today"
          />
        </div>

        {/* ── Notes ──────────────────────────────────────────────── */}
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
            Notes
          </div>
          <textarea
            value={data.notes}
            onChange={(e) => change({ ...data, notes: e.target.value })}
            placeholder="Anything worth noting — what you ate out, how you felt, what helped or didn't…"
            rows={4}
            style={{
              width: '100%',
              padding: 'var(--space-sm) var(--space-md)',
              fontSize: 'var(--fs-body)',
              color: 'var(--color-text-primary)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              outline: 'none',
              resize: 'none',
              fontFamily: 'var(--font-sans)',
              lineHeight: 1.5,
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
          style={{ background: saveError ? 'var(--color-danger)' : localSaved ? '#52B882' : undefined }}
        >
          {saveError ? 'Save failed — retry' : localSaved ? '✓ Saved' : saving ? 'Saving…' : 'Save context'}
        </button>
      </div>
    </Section>
  )
}
