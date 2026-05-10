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

function durationToHM(min: number | null): { h: string; m: string } {
  if (min == null) return { h: '', m: '' }
  return { h: String(Math.floor(min / 60)), m: String(min % 60) }
}

function hmToDuration(h: string, m: string): number | null {
  const hv = parseInt(h)
  const mv = parseInt(m)
  if (isNaN(hv) && isNaN(mv)) return null
  return (isNaN(hv) ? 0 : hv) * 60 + (isNaN(mv) ? 0 : mv)
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

function NumInput({
  value,
  onChange,
  placeholder = '—',
  width = 80,
}: {
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  width?: number
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      placeholder={placeholder}
      style={{
        width,
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
  )
}

export default function SleepSection({ data, onChange, onSave, saving }: Props) {
  const [localSaved, setLocalSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [closeTick, setCloseTick] = useState(0)
  const { h, m } = durationToHM(data.duration_min)
  const isComplete = data.hrv != null || data.duration_min != null

  const set = <K extends keyof SleepData>(k: K, v: SleepData[K]) => {
    setLocalSaved(false)
    setSaveError(false)
    onChange({ ...data, [k]: v })
  }

  const setDuration = (newH: string, newM: string) => {
    setLocalSaved(false)
    setSaveError(false)
    onChange({ ...data, duration_min: hmToDuration(newH, newM) })
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
      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        {data.duration_min != null && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--fs-label)', color: 'var(--color-text-secondary)', fontWeight: 'var(--fw-bold)', textTransform: 'uppercase' }}>Sleep</span>
            <span style={{ fontSize: 'var(--fs-label)', color: 'var(--color-text-primary)', fontWeight: 'var(--fw-semibold)' }}>{Math.floor(data.duration_min / 60)}h {data.duration_min % 60}m</span>
          </div>
        )}
        {data.hrv != null && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--fs-label)', color: 'var(--color-text-secondary)', fontWeight: 'var(--fw-bold)', textTransform: 'uppercase' }}>HRV</span>
            <span style={{ fontSize: 'var(--fs-label)', color: 'var(--color-text-primary)', fontWeight: 'var(--fw-semibold)' }}>{data.hrv}</span>
          </div>
        )}
        {data.rhr != null && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--fs-label)', color: 'var(--color-text-secondary)', fontWeight: 'var(--fw-bold)', textTransform: 'uppercase' }}>RHR</span>
            <span style={{ fontSize: 'var(--fs-label)', color: 'var(--color-text-primary)', fontWeight: 'var(--fw-semibold)' }}>{data.rhr}</span>
          </div>
        )}
        {data.rested != null && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--fs-label)', color: 'var(--color-text-secondary)', fontWeight: 'var(--fw-bold)', textTransform: 'uppercase' }}>Rested</span>
            <span style={{ fontSize: 'var(--fs-label)', color: 'var(--color-text-primary)', fontWeight: 'var(--fw-semibold)' }}>{data.rested}/5</span>
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

        {/* Bedtime */}
        <Field label="Bedtime">
          <input
            type="time"
            value={data.bedtime ?? '21:45'}
            onChange={(e) => set('bedtime', e.target.value || null)}
            style={{
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
        </Field>

        {/* Duration */}
        <Field label="Sleep duration">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <NumInput
              value={h === '' ? null : Number(h)}
              onChange={(v) => setDuration(v == null ? '' : String(v), m)}
              width={72}
              placeholder="—"
            />
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--fs-label)' }}>h</span>
            <NumInput
              value={m === '' ? null : Number(m)}
              onChange={(v) => setDuration(h, v == null ? '' : String(v))}
              width={72}
              placeholder="—"
            />
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--fs-label)' }}>min</span>
          </div>
        </Field>

        {/* HRV + RHR */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="HRV" unit="ms">
            <NumInput value={data.hrv} onChange={(v) => set('hrv', v)} />
          </Field>
          <Field label="RHR" unit="bpm">
            <NumInput value={data.rhr} onChange={(v) => set('rhr', v)} />
          </Field>
        </div>

        {/* Fasting glucose */}
        <Field label="Fasting glucose" unit="mmol/L">
          <NumInput
            value={data.fasting_glucose_mmol}
            onChange={(v) => set('fasting_glucose_mmol', v)}
            placeholder="—"
            width={80}
          />
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

        {/* Nap */}
        <Field label="Nap" unit="min">
          <NumInput value={data.nap_minutes} onChange={(v) => set('nap_minutes', v)} width={80} />
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
