'use client'

import { useState } from 'react'
import type { SleepData } from '@/lib/types'
import Section from '@/components/ui/Section'
import TapScale from '@/components/ui/TapScale'

interface Props {
  data: SleepData
  onChange: (data: SleepData) => void
  onSave: () => void
  saving?: boolean
}

function formatDuration(min: number | null): string {
  if (min == null) return '—'
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`
}

function Field({
  label,
  unit,
  children,
}: {
  label: string
  unit?: string
  children: React.ReactNode
}) {
  return (
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
        {label}
        {unit && (
          <span
            style={{
              fontWeight: 400,
              textTransform: 'none',
              marginLeft: 4,
              color: 'var(--color-text-dim)',
            }}
          >
            {unit}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// Read-only value for Oura-owned fields (written by syncOuraRange, never saved from here).
function ReadOnlyValue({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-body)', color: 'var(--color-text-primary)' }}>
      {children}
    </div>
  )
}

export default function SleepSection({ data, onChange, onSave, saving }: Props) {
  const [localSaved, setLocalSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [closeTick, setCloseTick] = useState(0)
  const isComplete = data.hrv != null || data.duration_min != null

  const set = <K extends keyof SleepData>(k: K, v: SleepData[K]) => {
    setLocalSaved(false)
    setSaveError(false)
    onChange({ ...data, [k]: v })
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

  // Collapsed summary shown in header
  const summary =
    isComplete ? (
      <div style={{ display: 'flex', gap: 'var(--space-sm)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        {data.duration_min != null && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Sleep</span>
            <span style={{ color: 'var(--color-text-dim)' }}>{Math.floor(data.duration_min / 60)}h {data.duration_min % 60}m</span>
          </div>
        )}
        {data.hrv != null && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>HRV</span>
            <span style={{ color: 'var(--color-text-dim)' }}>{data.hrv}</span>
          </div>
        )}
        {data.rhr != null && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>RHR</span>
            <span style={{ color: 'var(--color-text-dim)' }}>{data.rhr}</span>
          </div>
        )}
        {data.rested != null && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Rested</span>
            <span style={{ color: 'var(--color-text-dim)' }}>{data.rested}/5</span>
          </div>
        )}
      </div>
    ) : null

  return (
    <Section
      title="Sleep"
      isComplete={isComplete}
      rightSlot={summary}
      forceClose={closeTick}
      icon={
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M15 10.5A7 7 0 017.5 3a6.5 6.5 0 100 12A7 7 0 0115 10.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>

        {/* Oura-owned fields — read-only, synced from Oura (lib/oura.ts → syncOuraRange) */}
        <div
          style={{
            fontSize: 'var(--fs-label-sm)',
            color: 'var(--color-text-dim)',
            marginBottom: 'calc(-1 * var(--space-sm))',
          }}
        >
          From Oura
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
          <Field label="Bedtime">
            <ReadOnlyValue>{data.bedtime ? data.bedtime.slice(0, 5) : '—'}</ReadOnlyValue>
          </Field>
          <Field label="Sleep duration">
            <ReadOnlyValue>{formatDuration(data.duration_min)}</ReadOnlyValue>
          </Field>
        </div>

        {/* Total sleep (duration + nap) — read-only, only shown when a nap is logged */}
        {!!data.nap_minutes && (
          <Field label="Total sleep">
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-body)', color: 'var(--color-text-secondary)' }}>
              {(() => {
                const total = (data.duration_min ?? 0) + data.nap_minutes
                const th = Math.floor(total / 60)
                const tm = String(total % 60).padStart(2, '0')
                return `${th}h ${tm}m, incl. ${data.nap_minutes}m nap`
              })()}
            </div>
          </Field>
        )}

        {/* HRV + RHR — read-only, from Oura */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
          <Field label="HRV (overnight avg)" unit="ms">
            <ReadOnlyValue>{data.hrv ?? '—'}</ReadOnlyValue>
          </Field>
          <Field label="RHR (lowest overnight)" unit="bpm">
            <ReadOnlyValue>{data.rhr ?? '—'}</ReadOnlyValue>
          </Field>
        </div>

        {/* Nap — read-only, from Oura */}
        <Field label="Nap" unit="min">
          <ReadOnlyValue>{data.nap_minutes ?? '—'}</ReadOnlyValue>
        </Field>

        {/* Rested scale */}
        <Field label="Rested on waking">
          <TapScale
            value={data.rested}
            onChange={(v) => set('rested', v)}
            lowLabel="exhausted"
            highLabel="great"
          />
        </Field>

        {/* Save */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
          style={{
            background: saveError ? 'var(--color-danger)' : localSaved ? '#52B882' : undefined,
            marginTop: 4,
          }}
        >
          {saveError ? 'Save failed — retry' : localSaved ? '✓ Saved' : saving ? 'Saving…' : 'Save sleep'}
        </button>
      </div>
    </Section>
  )
}
