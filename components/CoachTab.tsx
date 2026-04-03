'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { DailyEntry } from '@/lib/types'

interface Props {
  today: DailyEntry
  cycleDay: number | null
  currentDate: string
}

interface Briefing {
  recovery: string
  training: string
  nutrition: string
  insight: string
  question: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const BRIEFING_LABELS: { key: keyof Briefing; label: string; emoji: string }[] = [
  { key: 'recovery',  label: 'Recovery',        emoji: '📊' },
  { key: 'training',  label: 'Training',         emoji: '🎯' },
  { key: 'nutrition', label: 'Nutrition focus',  emoji: '🥗' },
  { key: 'insight',   label: 'Insight',          emoji: '💡' },
  { key: 'question',  label: 'Coach asks',       emoji: '🤔' },
]

function hasSleepData(entry: DailyEntry): boolean {
  return entry.sleep.hrv != null || entry.sleep.duration_min != null
}

// ─── Mic icon ────────────────────────────────────────────────────
function MicIcon({ active }: { active: boolean }) {
  const c = active ? 'var(--color-danger)' : 'var(--color-text-secondary)'
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="7" y="1" width="6" height="10" rx="3" stroke={c} strokeWidth="1.5" />
      <path d="M4 9.5a6 6 0 0012 0" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="10" y1="15.5" x2="10" y2="18.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="7" y1="18.5" x2="13" y2="18.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ─── Send icon ───────────────────────────────────────────────────
function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2 9h14M9 2l7 7-7 7" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function CoachTab({ today, cycleDay, currentDate }: Props) {
  const [briefing,         setBriefing]         = useState<Briefing | null>(null)
  const [briefingLoading,  setBriefingLoading]  = useState(false)
  const [briefingError,    setBriefingError]    = useState<string | null>(null)
  const [chatMessages,     setChatMessages]     = useState<ChatMessage[]>([])
  const [chatInput,        setChatInput]        = useState('')
  const [chatLoading,      setChatLoading]      = useState(false)
  const [isListening,      setIsListening]      = useState(false)

  const chatEndRef    = useRef<HTMLDivElement>(null)
  const inputRef      = useRef<HTMLInputElement>(null)
  const hasFetched    = useRef(false)

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Generate morning briefing once on mount if sleep data exists
  const generateBriefing = useCallback(async () => {
    setBriefingLoading(true)
    setBriefingError(null)
    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'briefing',
          today,
          cycleDay,
          currentDate,
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setBriefing(json.briefing)
    } catch (e) {
      setBriefingError(e instanceof Error ? e.message : 'Failed to generate briefing')
    } finally {
      setBriefingLoading(false)
    }
  }, [today, cycleDay, currentDate])

  useEffect(() => {
    if (hasFetched.current) return
    if (!hasSleepData(today)) return
    hasFetched.current = true
    generateBriefing()
  }, [today, generateBriefing])

  // ── Voice input ──────────────────────────────────────────────────
  const startListening = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      alert('Voice input is not supported in this browser. Try Chrome or Safari.')
      return
    }
    const recognition = new SR()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onstart = () => setIsListening(true)
    recognition.onend   = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      const transcript: string = e.results[0][0].transcript
      setChatInput((prev) => (prev ? prev + ' ' + transcript : transcript))
      inputRef.current?.focus()
    }

    recognition.start()
  }

  // ── Send chat message ────────────────────────────────────────────
  const sendMessage = async () => {
    const msg = chatInput.trim()
    if (!msg || chatLoading) return

    const newHistory: ChatMessage[] = [...chatMessages, { role: 'user', content: msg }]
    setChatMessages(newHistory)
    setChatInput('')
    setChatLoading(true)

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'chat',
          today,
          cycleDay,
          currentDate,
          message: msg,
          history: chatMessages, // history before this message
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setChatMessages([...newHistory, { role: 'assistant', content: json.response }])
    } catch (e) {
      setChatMessages([
        ...newHistory,
        { role: 'assistant', content: `Error: ${e instanceof Error ? e.message : 'Something went wrong'}` },
      ])
    } finally {
      setChatLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  const sleepLogged = hasSleepData(today)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 32 }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ paddingTop: 8 }}>
        <h1
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
            marginBottom: 4,
          }}
        >
          Coach
        </h1>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          {sleepLogged
            ? 'Morning briefing based on last night\'s sleep data.'
            : 'Log today\'s sleep data to receive your morning briefing.'}
        </p>
      </div>

      {/* ── Morning briefing ────────────────────────────────────── */}
      {!sleepLogged ? (
        <div
          style={{
            padding: '20px 16px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>😴</div>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
            No sleep data logged yet.
          </p>
          <p style={{ fontSize: 13, color: 'var(--color-text-dim)', marginTop: 4 }}>
            Switch to Today → Sleep to log last night&apos;s data.
          </p>
        </div>
      ) : briefingLoading ? (
        <div
          style={{
            padding: '32px 16px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              border: '2.5px solid var(--color-primary-light)',
              borderTopColor: 'var(--color-primary)',
              borderRadius: '50%',
              animation: 'spin 0.7s linear infinite',
              margin: '0 auto 12px',
            }}
          />
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
            Generating your briefing…
          </p>
        </div>
      ) : briefingError ? (
        <div
          style={{
            padding: '20px 16px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
          }}
        >
          <p style={{ fontSize: 14, color: 'var(--color-danger)', marginBottom: 12 }}>
            {briefingError}
          </p>
          <button type="button" onClick={generateBriefing} className="btn-secondary" style={{ width: 'auto', padding: '8px 16px' }}>
            Retry
          </button>
        </div>
      ) : briefing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {BRIEFING_LABELS.map(({ key, label, emoji }) => (
            <div
              key={key}
              style={{
                padding: '16px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-secondary)',
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>{emoji}</span>
                <span>{label}</span>
              </div>
              <p
                style={{
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: 'var(--color-text-primary)',
                  margin: 0,
                }}
              >
                {briefing[key]}
              </p>
            </div>
          ))}

          {/* Regenerate button */}
          <button
            type="button"
            onClick={() => {
              hasFetched.current = false
              setBriefing(null)
              generateBriefing()
            }}
            style={{
              fontSize: 13,
              color: 'var(--color-text-dim)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'center',
              padding: '4px 0',
            }}
          >
            Regenerate briefing
          </button>
        </div>
      ) : null}

      {/* ── Divider ─────────────────────────────────────────────── */}
      <div style={{ height: 1, background: 'var(--color-border)' }} />

      {/* ── Chat ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
          }}
        >
          Ask your coach
        </div>

        {/* Chat history */}
        {chatMessages.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '86%',
                    padding: '10px 14px',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: msg.role === 'user'
                      ? 'var(--color-primary)'
                      : 'var(--color-surface)',
                    border: msg.role === 'user'
                      ? 'none'
                      : '1px solid var(--color-border)',
                    color: msg.role === 'user' ? '#fff' : 'var(--color-text-primary)',
                    fontSize: 14,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {chatLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  style={{
                    padding: '12px 16px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '16px 16px 16px 4px',
                    display: 'flex',
                    gap: 4,
                    alignItems: 'center',
                  }}
                >
                  {[0, 1, 2].map((n) => (
                    <div
                      key={n}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--color-text-dim)',
                        animation: `pulse 1.2s ease-in-out ${n * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        )}

        {/* Input row */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="Ask anything about your data…"
            style={{
              flex: 1,
              height: 44,
              padding: '0 12px',
              fontSize: 14,
              color: 'var(--color-text-primary)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              outline: 'none',
              fontFamily: 'var(--font-sans)',
            }}
          />

          {/* Mic button */}
          <button
            type="button"
            onClick={startListening}
            aria-label={isListening ? 'Listening…' : 'Voice input'}
            style={{
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isListening ? 'var(--color-primary-light)' : 'var(--color-surface)',
              border: `1px solid ${isListening ? 'var(--color-danger)' : 'var(--color-border)'}`,
              borderRadius: 10,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <MicIcon active={isListening} />
          </button>

          {/* Send button */}
          <button
            type="button"
            onClick={sendMessage}
            disabled={!chatInput.trim() || chatLoading}
            aria-label="Send"
            style={{
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: chatInput.trim() && !chatLoading ? 'var(--color-primary)' : 'var(--color-border)',
              border: 'none',
              borderRadius: 10,
              cursor: chatInput.trim() && !chatLoading ? 'pointer' : 'default',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
          >
            <SendIcon />
          </button>
        </div>

        {/* Suggested starters — only when no chat yet */}
        {chatMessages.length === 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              'Should I train today?',
              "What's my fiber looking like?",
              'What should I eat for dinner?',
              'Why do I feel flat?',
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => { setChatInput(q); inputRef.current?.focus() }}
                style={{
                  padding: '7px 12px',
                  fontSize: 13,
                  color: 'var(--color-primary)',
                  background: 'var(--color-primary-light)',
                  border: '1px solid var(--color-primary)',
                  borderRadius: 20,
                  cursor: 'pointer',
                  lineHeight: 1.3,
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
