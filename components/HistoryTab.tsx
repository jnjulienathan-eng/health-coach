'use client'

interface Props {
  onSelectDate: (date: string) => void
}

export default function HistoryTab({ onSelectDate }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <span className="section-label" style={{ color: 'var(--color-text-dim)' }}>History</span>
      <p className="text-hint text-center">Full History tab — Phase 6</p>
    </div>
  )
}
