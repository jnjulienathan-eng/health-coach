'use client'

import { useState } from 'react'

export default function CoachTab() {
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState('')
  const [error, setError] = useState('')

  const getCoaching = async () => {
    setLoading(true)
    setError('')
    setResponse('')
    try {
      const res = await fetch('/api/coach', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to get coaching')
      setResponse(data.coaching)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[10px] font-mono text-[#555] uppercase tracking-widest">
            AI Coach
          </h2>
          <p className="text-[10px] text-[#2a2a2a] font-mono mt-1">
            Analysis based on last 7 days of data
          </p>
        </div>
        <button
          type="button"
          onClick={getCoaching}
          disabled={loading}
          className="px-4 py-2 bg-[#0f0f18] border border-[#252538] text-xs font-mono text-[#818cf8] rounded hover:bg-[#13131e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Analyzing...' : 'Get coaching'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-[#150f0f] border border-[#2a1515] rounded text-xs text-[#f87171] font-mono">
          {error}
        </div>
      )}

      {loading && (
        <div className="py-12 text-center">
          <div className="text-[10px] font-mono text-[#2a2a2a] tracking-widest animate-pulse">
            ANALYZING
          </div>
        </div>
      )}

      {response && !loading && (
        <div className="p-4 bg-[#0f0f0f] border border-[#1c1c1c] rounded-lg">
          <div className="text-[10px] font-mono text-[#383838] uppercase tracking-widest mb-3">
            Coach response
          </div>
          <div className="text-xs text-[#999] leading-6 whitespace-pre-wrap">
            {response}
          </div>
        </div>
      )}

      {!response && !loading && !error && (
        <div className="py-20 text-center text-[#1e1e1e] text-[10px] font-mono tracking-widest">
          NO DATA — CLICK TO ANALYZE
        </div>
      )}
    </div>
  )
}
