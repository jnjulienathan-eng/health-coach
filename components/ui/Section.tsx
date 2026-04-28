'use client'

import { useState, useId } from 'react'

interface SectionProps {
  title: string
  isComplete?: boolean
  isPartial?: boolean           // meals logged but targets not met — amber indicator
  defaultOpen?: boolean
  rightSlot?: React.ReactNode   // e.g. macro bars shown in header when collapsed
  children: React.ReactNode
}

export default function Section({
  title,
  isComplete = false,
  isPartial = false,
  defaultOpen = false,
  rightSlot,
  children,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={`section-header${open ? ' open' : ''}`}
      >
        <div className="flex items-center gap-2">
          <span className="section-label">{title}</span>
          {isComplete && <CheckIcon />}
          {!isComplete && isPartial && <PartialIcon />}
        </div>

        <div className="flex items-center gap-2">
          {!open && rightSlot}
          <ChevronIcon open={open} />
        </div>
      </button>

      {open && (
        <div id={id} className="section-body">
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
