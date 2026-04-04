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
]

const EVENING_ITEMS = ['Magnesium glycinate (200mg)', 'L-Theanine']

const CYCLIC_ITEMS: { key: keyof SupplementsData; label: string; note: string }[] = [
  {
    key: 'ashwagandha_taken',
    label: 'Ashwagandha',
    note: 'Activate when taking',
  },
  {
    key: 'dim_taken',
    label: 'DIM',
    note: 'Not yet ordered — supports estrogen metabolism',
  },
  {
    key: 'phosphatidylserine_taken',
    label: 'Phosphatidylserine',
    note: 'On pause — retry when sleep stable 4+ weeks',
  },
]

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

export default function SupplementsSection({ data, onChange, onSave, saving }: Props) {
  const [localSaved, setLocalSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [showCyclic, setShowCyclic] = useState(false)

  const isComplete = data.morning_stack_taken || data.evening_stack_taken

  const change = (d: SupplementsData) => { setLocalSaved(false); setSaveError(false); onChange(d) }

  const toggleMorningException = (item: string) => {
    const exceptions = data.morning_exceptions.includes(item)
      ? data.morning_exceptions.filter((e) => e !== item)
      : [...data.morning_exceptions, item]
    change({ ...data, morning_exceptions: exceptions })
  }

  const toggleEveningException = (item: string) => {
    const exceptions = data.evening_exceptions.includes(item)
      ? data.evening_exceptions.filter((e) => e !== item)
      : [...data.evening_exceptions, item]
    change({ ...data, evening_exceptions: exceptions })
  }

  const confirmMorning = () => {
    change({ ...data, morning_stack_taken: true, morning_exceptions: [] })
  }

  const confirmEvening = () => {
    change({ ...data, evening_stack_taken: true, evening_exceptions: [] })
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
              label="Progesterone"
              dose="200mg"
              taken={data.progesterone_taken}
              onToggle={(v) => change({ ...data, progesterone_taken: v })}
            />
            <HormoneCard
              label="Estradiol"
              dose="1 spray Lenzetto"
              taken={data.estradiol_taken}
              onToggle={(v) => change({ ...data, estradiol_taken: v })}
            />
          </div>
        </div>

        {/* ── Morning stack ──────────────────────────────────────── */}
        <div>
          <StackLabel text="Morning stack" />
          {!data.morning_stack_taken ? (
            <button
              type="button"
              onClick={confirmMorning}
              className="btn-primary"
            >
              All taken ✓
            </button>
          ) : (
            <div
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              {MORNING_ITEMS.map((item) => {
                const skipped = data.morning_exceptions.includes(item)
                return (
                  <SupplementItem
                    key={item}
                    label={item}
                    taken={!skipped}
                    onToggle={() => toggleMorningException(item)}
                  />
                )
              })}
            </div>
          )}
          {data.morning_stack_taken && (
            <button
              type="button"
              onClick={() => change({ ...data, morning_stack_taken: false })}
              style={{
                marginTop: 6,
                fontSize: 12,
                color: 'var(--color-text-dim)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Undo
            </button>
          )}
        </div>

        {/* ── Evening stack ──────────────────────────────────────── */}
        <div>
          <StackLabel text="Evening stack" />
          {!data.evening_stack_taken ? (
            <button
              type="button"
              onClick={confirmEvening}
              className="btn-primary"
            >
              All taken ✓
            </button>
          ) : (
            <div
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              {EVENING_ITEMS.map((item) => {
                const skipped = data.evening_exceptions.includes(item)
                return (
                  <SupplementItem
                    key={item}
                    label={item}
                    taken={!skipped}
                    onToggle={() => toggleEveningException(item)}
                  />
                )
              })}
            </div>
          )}
          {data.evening_stack_taken && (
            <button
              type="button"
              onClick={() => change({ ...data, evening_stack_taken: false })}
              style={{
                marginTop: 6,
                fontSize: 12,
                color: 'var(--color-text-dim)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Undo
            </button>
          )}
        </div>

        {/* ── Cyclic supplements ─────────────────────────────────── */}
        <div>
          <button
            type="button"
            onClick={() => setShowCyclic((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              marginBottom: showCyclic ? 10 : 0,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-text-dim)',
              }}
            >
              Cyclic / inactive
            </span>
            <span
              style={{
                fontSize: 14,
                color: 'var(--color-text-dim)',
                transform: showCyclic ? 'rotate(90deg)' : 'none',
                transition: 'transform 200ms',
              }}
            >
              ›
            </span>
          </button>

          {showCyclic && (
            <div
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              {CYCLIC_ITEMS.map(({ key, label, note }) => (
                <CyclicItem
                  key={key}
                  label={label}
                  note={note}
                  active={data[key] as boolean}
                  onToggle={(v) => change({ ...data, [key]: v })}
                />
              ))}
            </div>
          )}
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
  dose,
  taken,
  onToggle,
}: {
  label: string
  dose: string
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
        <div style={{ marginTop: 2 }}>
          <EditableDose defaultDose={dose} />
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

// ─── Cyclic item ──────────────────────────────────────────────────
function CyclicItem({
  label,
  note,
  active,
  onToggle,
}: {
  label: string
  note: string
  active: boolean
  onToggle: (v: boolean) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: '1px solid var(--color-border)',
        background: active ? 'var(--color-primary-light)' : 'var(--color-bg)',
        gap: 12,
      }}
    >
      <div style={{ flex: 1 }}>
        <EditableLabel
          label={label}
          textStyle={{
            fontSize: 14,
            color: active ? 'var(--color-text-primary)' : 'var(--color-text-dim)',
            fontWeight: active ? 500 : 400,
          }}
        />
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-text-dim)',
            marginTop: 3,
            lineHeight: 1.4,
          }}
        >
          {note}
        </div>
      </div>
      <input
        type="checkbox"
        checked={active}
        onChange={(e) => onToggle(e.target.checked)}
        className="toggle"
        style={{ flexShrink: 0, transform: 'scale(0.85)', marginTop: 2 }}
        aria-label={`${label} active`}
      />
    </div>
  )
}
