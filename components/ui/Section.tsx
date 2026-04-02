'use client'

import { useState } from 'react'

interface SectionProps {
  title: string
  summary?: string
  children: React.ReactNode
  defaultOpen?: boolean
}

export default function Section({ title, summary, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border border-[#1c1c1c] rounded-lg bg-[#101010] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#141414] transition-colors"
      >
        <span className="text-[10px] font-mono font-medium text-[#666] tracking-widest uppercase">
          {title}
        </span>
        <div className="flex items-center gap-3">
          {!open && summary && (
            <span className="text-[10px] text-[#383838] font-mono truncate max-w-[200px]">{summary}</span>
          )}
          <span className={`text-[#2a2a2a] text-[10px] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-[#181818]">
          {children}
        </div>
      )}
    </div>
  )
}
