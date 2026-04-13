'use client'

import { useState, useEffect } from 'react'
import type { TrainingSession } from '@/lib/types'
import Section from '@/components/ui/Section'

interface Props {
  data: number | null
  sessions: TrainingSession[]
  onChange: (hydration_ml: number | null) => void
  onSave: () => Promise<void>
  saving: boolean
}

// ─── Cup SVG ──────────────────────────────────────────────────────
function CupIcon({ filled, muted }: { filled: boolean; muted?: boolean }) {
  const fill   = filled ? 'var(--color-primary)' : 'none'
  const stroke = filled
    ? 'var(--color-primary)'
    : muted
      ? 'var(--color-border)'
      : 'var(--color-border)'

  return (
    <svg width="26" height="34" viewBox="0 0 26 34" fill="none" aria-hidden>
      {/* cup body — slight trapezoid */}
      <path
        d="M2 3 L24 3 L21 27 L5 27 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* base bar */}
      <line x1="5"  y1="30" x2="21" y2="30" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="3"  y1="33" x2="23" y2="33" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ─── HydrationSection ─────────────────────────────────────────────
export default function HydrationSection({ data, sessions, onChange, onSave, saving }: Props) {
  const isTrainingDay = sessions.length > 0
  const target        = isTrainingDay ? 3000 : 2500
  const targetCups    = isTrainingDay ? 6    : 5

  // Derive initial state from data prop
  const deriveCups  = (ml: number | null) => ml != null ? Math.min(Math.floor(ml / 500), 6) : 0
  const deriveExtra = (ml: number | null) => ml != null ? ml % 500 : 0

  const [cups,      setCups]      = useState(() => deriveCups(data))
  const [extraMl,   setExtraInput] = useState<string>(() => {
    const e = deriveExtra(data)
    return e > 0 ? String(e) : ''
  })
  const [saved,     setSaved]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Sync when data changes (e.g. day navigation)
  useEffect(() => {
    setCups(deriveCups(data))
    const e = deriveExtra(data)
    setExtraInput(e > 0 ? String(e) : '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const extraNum  = parseInt(extraMl, 10) || 0
  const totalMl   = cups * 500 + extraNum

  // Notify parent of new total
  const notify = (newCups: number, newExtra: number) => {
    const total = newCups * 500 + newExtra
    onChange(total > 0 ? total : null)
    setSaved(false)
  }

  const handleCupTap = (index: number) => {
    const cupNumber = index + 1
    // Tap the last filled cup → unfill it; otherwise fill up to this cup
    const newCups = cups === cupNumber ? cups - 1 : cupNumber
    setCups(newCups)
    notify(newCups, extraNum)
  }

  const handleExtraChange = (val: string) => {
    setExtraInput(val)
    const parsed = parseInt(val, 10)
    notify(cups, isNaN(parsed) || parsed < 0 ? 0 : parsed)
  }

  const totalColor =
    totalMl >= target ? 'var(--color-success)' :
    totalMl >= 1500   ? 'var(--color-amber)'   :
    'var(--color-danger)'

  const handleSave = async () => {
    setSaveError(null)
    try {
      await onSave()
      setSaved(true)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const targetMetLabel = !isTrainingDay && cups >= targetCups
    ? cups === 6 ? ' · bonus cup!' : ' · target met'
    : ''

  const summary = totalMl > 0 ? (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: 'var(--color-text-secondary)',
      }}
    >
      {cups} cups · {totalMl}ml
    </span>
  ) : null

  return (
    <Section title="Hydration" isComplete={totalMl > 0} rightSlot={summary}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Cup row + extra input ────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>

          {/* 6 cups */}
          <div style={{ display: 'flex', gap: 2, flex: 1 }}>
            {Array.from({ length: 6 }, (_, i) => {
              const filled  = i < cups
              const isBonus = !isTrainingDay && i === 5
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleCupTap(i)}
                  aria-label={`Cup ${i + 1}${filled ? ' (filled)' : ''}${isBonus ? ' bonus' : ''}`}
                  style={{
                    minWidth:  44,
                    minHeight: 44,
                    flex:      1,
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    background: 'none',
                    border:    'none',
                    cursor:    'pointer',
                    padding:   0,
                    opacity:   isBonus && !filled ? 0.3 : 1,
                  }}
                >
                  <CupIcon filled={filled} muted={isBonus && !filled} />
                </button>
              )
            })}
          </div>

          {/* Extra ml */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>+</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="2000"
              value={extraMl}
              onChange={(e) => handleExtraChange(e.target.value)}
              placeholder="0"
              aria-label="Extra ml beyond cups"
              style={{
                width:      58,
                height:     36,
                padding:    '0 8px',
                fontSize:   13,
                textAlign:  'right',
                color:      'var(--color-text-primary)',
                background: 'var(--color-bg)',
                border:     '1px solid var(--color-border)',
                borderRadius: 8,
                fontFamily: 'var(--font-mono)',
                outline:    'none',
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>ml</span>
          </div>
        </div>

        {/* ── Target hint ──────────────────────────────────────── */}
        <div style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>
          {targetCups} cups = {target}ml target
          {!isTrainingDay && (
            <span> · 6th cup is bonus</span>
          )}
        </div>

        {/* ── Total ────────────────────────────────────────────── */}
        <div
          style={{
            fontSize:    14,
            fontFamily:  'var(--font-mono)',
            color:       totalColor,
            fontWeight:  500,
          }}
        >
          {totalMl}ml / {target}ml
          {targetMetLabel && (
            <span style={{ fontWeight: 400, color: 'var(--color-text-dim)', marginLeft: 4 }}>
              {targetMetLabel}
            </span>
          )}
        </div>

        {/* ── Save button ──────────────────────────────────────── */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? 'Saving…' : 'Save hydration'}
        </button>

        {saveError && (
          <p style={{ fontSize: 13, color: 'var(--color-danger)', margin: 0 }}>
            {saveError}
          </p>
        )}

      </div>
    </Section>
  )
}
