'use client'

import { useState } from 'react'
import type { SupplementsData } from '@/lib/types'
import Section from '@/components/ui/Section'

interface Props {
  data: SupplementsData
  onChange: (data: SupplementsData) => void
  onSave: () => void
  saving?: boolean
}

const MORNING_ITEMS = [
  'Creatine (5g)',
  'Vitamin D3 + K2',
  'Zinc + Selenium',
  'Glucosamine',
  'Omega-3',
  'Berberine',
  'DIM',
]

const EVENING_ITEMS = ['Magnesium glycinate (200mg)', 'L-Theanine']

// Label helper
function StackLabel({ text }: { text: string }) {
  return (
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
      {text}
    </div>
  )
}

// ─── Stack accordion ──────────────────────────────────────────────
function StackAccordion({
  label,
  items,
  stackTaken,
  exceptions,
  onChange,
}: {
  label: string
  items: string[]
  stackTaken: boolean
  exceptions: string[]
  onChange: (taken: boolean, exceptions: string[]) => void
}) {
  const [open, setOpen] = useState(false)

  // An item is "on" when stackTaken=true and it's not in exceptions
  const isItemOn = (item: string) => stackTaken && !exceptions.includes(item)
  // At least one item on → "Taken"
  const anyOn = stackTaken && exceptions.length < items.length

  const toggleItem = (item: string) => {
    const currentlyOn = isItemOn(item)
    if (currentlyOn) {
      // Turn off: add to exceptions
      const newExceptions = [...exceptions, item]
      // If all items are now off, reset stack
      if (newExceptions.length >= items.length) {
        onChange(false, [])
      } else {
        onChange(true, newExceptions)
      }
    } else {
      // Turn on: remove from exceptions, set stackTaken = true
      const newExceptions = exceptions.filter((e) => e !== item)
      onChange(true, newExceptions)
    }
  }

  const takeAll = () => {
    onChange(true, [])
  }

  const clearAll = () => {
    onChange(false, [])
  }

  const masterOn = stackTaken && exceptions.length === 0

  return (
    <div>
      {/* Collapsed bar */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '12px 14px',
          background: anyOn ? 'var(--color-primary-light)' : 'var(--color-surface)',
          border: `1.5px solid ${anyOn ? 'var(--color-primary)' : 'var(--color-border)'}`,
          borderRadius: open ? '10px 10px 0 0' : 10,
          cursor: 'pointer',
          transition: 'background 200ms, border-color 200ms',
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: anyOn ? 'var(--color-primary)' : 'var(--color-text-secondary)',
          }}
        >
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 12,
              color: anyOn ? 'var(--color-primary)' : 'var(--color-text-dim)',
              fontWeight: 500,
            }}
          >
            {anyOn ? 'Taken' : 'Not taken'}
          </span>
          <span
            style={{
              fontSize: 16,
              color: 'var(--color-text-dim)',
              transform: open ? 'rotate(90deg)' : 'none',
              transition: 'transform 200ms',
              lineHeight: 1,
            }}
          >
            ›
          </span>
        </div>
      </button>

      {/* Expanded panel */}
      {open && (
        <div
          style={{
            border: '1.5px solid var(--color-border)',
            borderTop: 'none',
            borderRadius: '0 0 10px 10px',
            overflow: 'hidden',
          }}
        >
          {/* Master toggle row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderBottom: '1px solid var(--color-border)',
              background: masterOn ? 'var(--color-primary-light)' : 'var(--color-bg)',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Take all
            </span>
            <input
              type="checkbox"
              checked={masterOn}
              onChange={(e) => {
                if (e.target.checked) takeAll()
                else clearAll()
              }}
              className="toggle"
              aria-label="Take all"
            />
          </div>

          {/* Individual items */}
          {items.map((item) => {
            const on = isItemOn(item)
            return (
              <div
                key={item}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '11px 14px',
                  borderBottom: '1px solid var(--color-border)',
                  background: on ? 'var(--color-surface)' : 'var(--color-bg)',
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    color: on ? 'var(--color-text-primary)' : 'var(--color-text-dim)',
                    textDecoration: on ? 'none' : 'line-through',
                  }}
                >
                  {item}
                </span>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleItem(item)}
                  className="toggle"
                  style={{ transform: 'scale(0.85)' }}
                  aria-label={`${item} taken`}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Hormone card ─────────────────────────────────────────────────
function HormoneCard({
  label,
  doseValue,
  doseMin,
  doseMax,
  doseStep,
  dosePlaceholder,
  doseUnit,
  onDoseChange,
  taken,
  onToggle,
}: {
  label: string
  doseValue: number | null
  doseMin: number
  doseMax: number
  doseStep: number
  dosePlaceholder: string
  doseUnit: string
  onDoseChange: (v: number | null) => void
  taken: boolean
  onToggle: (v: boolean) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        background: taken ? 'var(--color-primary-light)' : 'var(--color-surface)',
        border: `1px solid ${taken ? 'var(--color-primary)' : 'var(--color-border)'}`,
        borderRadius: 10,
        transition: 'background 200ms, border-color 200ms',
      }}
    >
      <div>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>
          {label}
        </div>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="number"
            min={doseMin}
            max={doseMax}
            step={doseStep}
            value={doseValue ?? ''}
            placeholder={dosePlaceholder}
            onChange={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value)
              onDoseChange(v)
            }}
            style={{
              width: 64,
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-primary)',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              padding: '2px 6px',
              outline: 'none',
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{doseUnit}</span>
        </div>
      </div>
      <input
        type="checkbox"
        checked={taken}
        onChange={(e) => onToggle(e.target.checked)}
        className="toggle"
        aria-label={`${label} taken`}
      />
    </div>
  )
}

export default function SupplementsSection({ data, onChange, onSave, saving }: Props) {
  const [localSaved, setLocalSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const isComplete = data.morning_stack_taken || data.evening_stack_taken

  const change = (d: SupplementsData) => { setLocalSaved(false); setSaveError(false); onChange(d) }

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
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--color-text-secondary)',
      }}
    >
      {[
        data.morning_stack_taken && 'AM ✓',
        data.evening_stack_taken && 'PM ✓',
        data.progesterone_taken && 'Prog ✓',
        data.estradiol_taken && 'E2 ✓',
      ]
        .filter(Boolean)
        .join(' · ')}
    </span>
  ) : null

  return (
    <Section title="Supplements" isComplete={isComplete} rightSlot={summary}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Hormone toggles ────────────────────────────────────── */}
        <div>
          <StackLabel text="Hormones" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <HormoneCard
              label="Progesterone mg"
              doseValue={data.progesterone_mg}
              doseMin={0}
              doseMax={400}
              doseStep={25}
              dosePlaceholder="200"
              doseUnit="mg"
              onDoseChange={(v) => change({ ...data, progesterone_mg: v })}
              taken={data.progesterone_taken}
              onToggle={(v) => change({ ...data, progesterone_taken: v })}
            />
            <HormoneCard
              label="Estradiol sprays"
              doseValue={data.estradiol_sprays}
              doseMin={0}
              doseMax={10}
              doseStep={1}
              dosePlaceholder="1"
              doseUnit="sprays"
              onDoseChange={(v) => change({ ...data, estradiol_sprays: v })}
              taken={data.estradiol_taken}
              onToggle={(v) => change({ ...data, estradiol_taken: v })}
            />
          </div>
        </div>

        {/* ── Morning stack ──────────────────────────────────────── */}
        <div>
          <StackLabel text="Morning stack" />
          <StackAccordion
            label="Morning stack"
            items={MORNING_ITEMS}
            stackTaken={data.morning_stack_taken}
            exceptions={data.morning_exceptions}
            onChange={(taken, exceptions) =>
              change({ ...data, morning_stack_taken: taken, morning_exceptions: exceptions })
            }
          />
        </div>

        {/* ── Evening stack ──────────────────────────────────────── */}
        <div>
          <StackLabel text="Evening stack" />
          <StackAccordion
            label="Evening stack"
            items={EVENING_ITEMS}
            stackTaken={data.evening_stack_taken}
            exceptions={data.evening_exceptions}
            onChange={(taken, exceptions) =>
              change({ ...data, evening_stack_taken: taken, evening_exceptions: exceptions })
            }
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
          {saveError ? 'Save failed — retry' : localSaved ? '✓ Saved' : saving ? 'Saving…' : 'Save supplements'}
        </button>
      </div>
    </Section>
  )
}
