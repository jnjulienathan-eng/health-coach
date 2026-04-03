'use client'

import { useState } from 'react'
import type { ContextData, Symptom } from '@/lib/types'
import Section from '@/components/ui/Section'
import TapScale from '@/components/ui/TapScale'

interface Props {
  data: ContextData
  cycleDay: number | null
  onChange: (data: ContextData) => void
  onSave: () => void
  onResetCycle: () => void
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

export default function ContextSection({ data, cycleDay, onChange, onSave, onResetCycle, saving }: Props) {
  const [localSaved, setLocalSaved] = useState(false)

  const isComplete =
    data.stress_level != null || data.notes.length > 0 || data.symptoms.length > 0

  const toggleSymptom = (s: Symptom) => {
    const symptoms = data.symptoms.includes(s)
      ? data.symptoms.filter((x) => x !== s)
      : [...data.symptoms, s]
    onChange({ ...data, symptoms })
  }

  const handleSave = async () => {
    await onSave()
    setLocalSaved(true)
    setTimeout(() => setLocalSaved(false), 2000)
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
    <Section title="Context" isComplete={isComplete} rightSlot={summary}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Cycle day ─────────────────────────────────────────── */}
        <div>
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
            Cycle day
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {/* Large cycle day number */}
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 64,
                fontWeight: 400,
                lineHeight: 1,
                color:
                  cycleDay != null ? 'var(--color-text-primary)' : 'var(--color-text-dim)',
              }}
            >
              {cycleDay != null ? cycleDay : '—'}
            </div>

            {/* Reset button */}
            <button
              type="button"
              onClick={onResetCycle}
              style={{
                padding: '10px 16px',
                background: 'var(--color-surface)',
                border: '1.5px solid var(--color-danger)',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
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

        {/* ── Stress ─────────────────────────────────────────────── */}
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
            Stress level
          </div>
          <TapScale
            value={data.stress_level}
            onChange={(v) => onChange({ ...data, stress_level: v })}
            lowLabel="calm"
            highLabel="overwhelmed"
          />
        </div>

        {/* ── Symptoms ───────────────────────────────────────────── */}
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
          <span style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>
            Travelling today
          </span>
          <input
            type="checkbox"
            checked={data.travelling}
            onChange={(e) => onChange({ ...data, travelling: e.target.checked })}
            className="toggle"
            aria-label="Travelling today"
          />
        </div>

        {/* ── Notes ──────────────────────────────────────────────── */}
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
            Notes
          </div>
          <textarea
            value={data.notes}
            onChange={(e) => onChange({ ...data, notes: e.target.value })}
            placeholder="Anything worth noting — what you ate out, how you felt, what helped or didn't…"
            rows={4}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: 14,
              color: 'var(--color-text-primary)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
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
          style={{ background: localSaved ? 'var(--color-primary-dark)' : undefined }}
        >
          {localSaved ? '✓ Saved' : saving ? 'Saving…' : 'Save context'}
        </button>
      </div>
    </Section>
  )
}
