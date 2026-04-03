'use client'

interface TapScaleProps {
  value: number | null
  onChange: (v: number | null) => void
  lowLabel: string    // e.g. "exhausted"
  highLabel: string   // e.g. "great"
}

export default function TapScale({ value, onChange, lowLabel, highLabel }: TapScaleProps) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            className={`tap-scale-btn${value === n ? ' selected' : ''}`}
          >
            {n}
          </button>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          fontSize: 11,
          color: 'var(--color-text-secondary)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <span>1 {lowLabel}</span>
        <span>5 {highLabel}</span>
      </div>
    </div>
  )
}
