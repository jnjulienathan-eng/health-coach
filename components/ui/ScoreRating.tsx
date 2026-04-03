'use client'

interface ScoreRatingProps {
  value: number | null
  onChange: (v: number | null) => void
  max?: number
}

const active: Record<number, string> = {
  1: 'text-white border-[#3D9A6B] bg-[#3D9A6B]',
  2: 'text-white border-[#3D9A6B] bg-[#3D9A6B]',
  3: 'text-white border-[#3D9A6B] bg-[#3D9A6B]',
  4: 'text-white border-[#3D9A6B] bg-[#3D9A6B]',
  5: 'text-white border-[#3D9A6B] bg-[#3D9A6B]',
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
              : 'text-[#8FAA98] border-[#DCE8E0] bg-white hover:border-[#8FAA98] hover:text-[#5A7A66]'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}
