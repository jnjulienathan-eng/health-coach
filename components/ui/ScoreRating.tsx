'use client'

interface ScoreRatingProps {
  value: number | null
  onChange: (v: number | null) => void
  max?: number
}

const active: Record<number, string> = {
  1: 'text-[#f87171] border-[#f87171] bg-[#1a0f0f]',
  2: 'text-[#fb923c] border-[#fb923c] bg-[#1a120a]',
  3: 'text-[#fbbf24] border-[#fbbf24] bg-[#1a160a]',
  4: 'text-[#a3e635] border-[#a3e635] bg-[#111a0a]',
  5: 'text-[#4ade80] border-[#4ade80] bg-[#0a1a0f]',
}

export default function ScoreRating({ value, onChange, max = 5 }: ScoreRatingProps) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className={`w-8 h-8 rounded text-xs font-mono font-semibold border transition-all ${
            value === n
              ? active[n]
              : 'text-[#2a2a2a] border-[#1e1e1e] bg-[#0d0d0d] hover:border-[#2a2a2a] hover:text-[#444]'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}
