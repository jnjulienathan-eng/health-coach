'use client'

import { useState } from 'react'
import type { SupplementsData } from '@/lib/types'
import Section from '@/components/ui/Section'

// ─── Dose parsing ─────────────────────────────────────────────────
function parseDose(label: string): { name: string; dose: string | null } {
  const m = label.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  return m ? { name: m[1], dose: m[2] } : { name: label, dose: null }
}

// ─── Editable inline label (name + dose in parens) ────────────────
function EditableLabel({ label, textStyle }: { label: string; textStyle?: React.CSSProperties }) {
  const { name, dose } = parseDose(label)
  const [editing, setEditing] = useState(false)
  const [draftDose, setDraftDose] = useState(dose ?? '')
  const [savedDose, setSavedDose] = useState<string | null>(null)

  const displayLabel = savedDose !== null
    ? (savedDose ? `${name} (${savedDose})` : name)
    : label

  if (editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <span style={textStyle}>{name}</span>
        <input
          value={draftDose}
          onChange={(e) => setDraftDose(e.target.value)}
          placeholder="dose"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') { setSavedDose(draftDose); setEditing(false) }
            if (e.key === 'Escape') { setEditing(false) }
          }}
          style={{
            width: 72,
            fontSize: 13,
            padding: '1px 6px',
            border: '1px solid var(--color-primary)',
            borderRadius: 6,
            background: 'var(--color-bg)',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-sans)',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={() => { setSavedDose(draftDose); setEditing(false) }}
          style={{
            fontSize: 12,
            color: 'var(--color-primary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0 2px',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Done
        </button>
      </span>
    )
  }

  return (
    <span
      style={{ ...textStyle, cursor: 'pointer' }}
      onClick={() => { setDraftDose(savedDose ?? dose ?? ''); setEditing(true) }}
      title="Tap to edit dose"
    >
      {displayLabel}
    </span>
  )
}

// ─── Editable dose (for HormoneCard's separate dose prop) ─────────
function EditableDose({ defaultDose }: { defaultDose: string }) {
  const [editing, setEditing] = useState(false)
  const [draftDose, setDraftDose] = useState(defaultDose)
  const [savedDose, setSavedDose] = useState<string | null>(null)

  if (editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <input
          value={draftDose}
          onChange={(e) => setDraftDose(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') { setSavedDose(draftDose); setEditing(false) }
            if (e.key === 'Escape') { setEditing(false) }
          }}
          style={{
            width: 100,
            fontSize: 12,
            padding: '1px 6px',
            border: '1px solid var(--color-primary)',
            borderRadius: 6,
            background: 'var(--color-bg)',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-sans)',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={() => { setSavedDose(draftDose); setEditing(false) }}
          style={{
            fontSize: 12,
            color: 'var(--color-primary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0 2px',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Done
        </button>
      </span>
    )
  }

  return (
    <span
      style={{ fontSize: 12, color: 'var(--color-text-secondary)', cursor: 'pointer' }}
      onClick={() => { setDraftDose(savedDose ?? defaultDose); setEditing(true) }}
      title="Tap to edit dose"
    >
      {savedDose ?? defaultDose}
    </span>
  )
}

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

// ─── Stack accordion ─────────────────────────────────────────────
function StackAccordion({
  items,
  masterOn,
  exceptions,
  onMasterToggle,
  onItemToggle,
}: {
  items: string[]
  masterOn: boolean
  exceptions: string[]
  onMasterToggle: (on: boolean) => void
  onItemToggle: (item: string) => void
}) {
  const [open, setOpen] = useState(false)
  const anyOn = masterOn && items.some((item) => !exceptions.includes(item))

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <span style={{ fontSize: 13, color: anyOn ? 'var(--color-success)' : 'var(--color-text-dim)' }}>
          {anyOn ? 'Taken' : 'Not taken'}
        </span>
        <span
          style={{
            fontSize: 14,
            color: 'var(--color-text-dim)',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 200ms',
          }}
        >
          ›
        </span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--color-border)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
              Take all
            </span>
            <input
              type="checkbox"
              checked={masterOn}
              onChange={(e) => onMasterToggle(e.target.checked)}
              className="toggle"
              aria-label="Take all"
            />
          </div>
          {items.map((item, idx) => {
            const on = masterOn && !exceptions.includes(item)
            const skipped = masterOn && exceptions.includes(item)
            return (
              <div
                key={item}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderBottom: idx < items.length - 1 ? '1px solid var(--color-border)' : 'none',
                  background: on ? 'var(--color-surface)' : 'var(--color-bg)',
                }}
              >
                <EditableLabel
                  label={item}
                  textStyle={{
                    fontSize: 14,
                    color: skipped ? 'var(--color-text-dim)' : 'var(--color-text-primary)',
                    textDecoration: skipped ? 'line-through' : 'none',
                  }}
                />
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onItemToggle(item)}
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

export default function SupplementsSection({ data, onChange, onSave, saving }: Props) {
  const [localSaved, setLocalSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const isComplete = data.morning_stack_taken || data.evening_stack_taken

  const change = (d: SupplementsData) => { setLocalSaved(false); setSaveError(false); onChange(d) }

  const toggleMorningItem = (item: string) => {
    const on = data.morning_stack_taken && !data.morning_exceptions.includes(item)
    if (on) {
      change({ ...data, morning_exceptions: [...data.morning_exceptions, item] })
    } else if (data.morning_stack_taken) {
      change({ ...data, morning_exceptions: data.morning_exceptions.filter((e) => e !== item) })
    } else {
      change({ ...data, morning_stack_taken: true, morning_exceptions: MORNING_ITEMS.filter((i) => i !== item) })
    }
  }

  const toggleEveningItem = (item: string) => {
    const on = data.evening_stack_taken && !data.evening_exceptions.includes(item)
    if (on) {
      change({ ...data, evening_exceptions: [...data.evening_exceptions, item] })
    } else if (data.evening_stack_taken) {
      change({ ...data, evening_exceptions: data.evening_exceptions.filter((e) => e !== item) })
    } else {
      change({ ...data, evening_stack_taken: true, evening_exceptions: EVENING_ITEMS.filter((i) => i !== item) })
    }
  }

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
            items={MORNING_ITEMS}
            masterOn={data.morning_stack_taken}
            exceptions={data.morning_exceptions}
            onMasterToggle={(on) => change({ ...data, morning_stack_taken: on, morning_exceptions: [] })}
            onItemToggle={toggleMorningItem}
          />
        </div>

        {/* ── Evening stack ──────────────────────────────────────── */}
        <div>
          <StackLabel text="Evening stack" />
          <StackAccordion
            items={EVENING_ITEMS}
            masterOn={data.evening_stack_taken}
            exceptions={data.evening_exceptions}
            onMasterToggle={(on) => change({ ...data, evening_stack_taken: on, evening_exceptions: [] })}
            onItemToggle={toggleEveningItem}
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

// ─── Supplement item row ──────────────────────────────────────────
function SupplementItem({
  label,
  taken,
  onToggle,
}: {
  label: string
  taken: boolean
  onToggle: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: '1px solid var(--color-border)',
        background: taken ? 'var(--color-surface)' : 'var(--color-bg)',
      }}
    >
      <EditableLabel
        label={label}
        textStyle={{
          fontSize: 14,
          color: taken ? 'var(--color-text-primary)' : 'var(--color-text-dim)',
          textDecoration: taken ? 'none' : 'line-through',
        }}
      />
      <input
        type="checkbox"
        checked={taken}
        onChange={onToggle}
        className="toggle"
        style={{ transform: 'scale(0.85)' }}
        aria-label={`${label} taken`}
      />
    </div>
  )
}
