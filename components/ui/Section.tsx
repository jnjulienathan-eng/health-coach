'use client'

import { useState, useId } from 'react'

interface SectionProps {
  title: string
  isComplete?: boolean
  isPartial?: boolean           // meals logged but targets not met — amber indicator
  defaultOpen?: boolean
  rightSlot?: React.ReactNode   // e.g. macro bars shown in header when collapsed
  icon?: React.ReactNode        // SVG icon for the navy rounded-square container
  accent?: boolean              // amber left-border accent (Training accordion)
  children: React.ReactNode
}

export default function Section({
  title,
  isComplete = false,
  isPartial = false,
  defaultOpen = false,
  rightSlot,
  icon,
  accent = false,
  children,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
        ...(accent ? { borderLeft: '3px solid var(--color-amber)' } : {}),
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          minHeight: 64,
          padding: '0 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          {icon && (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-navy)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#fff',
              }}
            >
              {icon}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontSize: 'var(--fs-body)',
                  fontWeight: 'var(--fw-semibold)',
                  color: 'var(--color-navy)',
                  lineHeight: 1.3,
                }}
              >
                {title}
              </span>
              {isComplete && <CheckIcon />}
              {!isComplete && isPartial && <PartialIcon />}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {!open && rightSlot}
          <ChevronIcon open={open} />
        </div>
      </button>

      {open && (
        <div
          id={id}
          style={{
            borderTop: '1px solid var(--color-border-subtle)',
            padding: 20,
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-label="Complete">
      <circle cx="7" cy="7" r="7" fill="var(--color-primary)" />
      <path
        d="M4 7l2 2 4-4"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PartialIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-label="In progress">
      <circle cx="7" cy="7" r="7" fill="var(--color-amber)" opacity="0.2" />
      <circle cx="7" cy="7" r="5" stroke="var(--color-amber)" strokeWidth="1.5" fill="none" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={`chevron${open ? ' open' : ''}`}
      style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
