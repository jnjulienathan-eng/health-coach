'use client'

import { useState, useEffect } from 'react'
import { loadAllEntries } from '@/lib/db'
import { behaviorScore, outcomeScore } from '@/lib/scores'
import { scoreColor, scoreLabel } from '@/lib/types'
import type { DailyEntry } from '@/lib/types'

interface Props {
  onSelectDate: (date: string) => void
}

// ─── Helpers ──────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const isThisYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month:   'short',
    day:     'numeric',
    ...(isThisYear ? {} : { year: 'numeric' }),
  })
}

function activityEmoji(type: string): string {
  switch (type.toLowerCase()) {
    case 'run':
    case 'running':
    case 'outdoor run':
    case 'indoor run':
      return '🏃'
    case 'walk':
    case 'outdoor walk':
    case 'indoor walk':
      return '🚶'
    case 'cycling':
    case 'outdoor cycling':
    case 'indoor cycling':
      return '🚴'
    case 'swim':
    case 'swimming':
    case 'pool swimming':
    case 'open water swimming':
      return '🏊'
    case 'strength':
    case 'egym':
    case 'strength training':
    case 'functional strength training':
      return '🏋️'
    case 'rowing':
      return '🚣'
    case 'elliptical':
      return '〇'
    case 'yoga':
    case 'pilates':
      return '🧘'
    case 'hiking':
      return '🥾'
    case 'hiit':
      return '⚡'
    default:
      return '🏅'
  }
}

function durationStr(min: number | null): string {
  if (min == null) return '?'
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}m`
}

// ─── Score pill ───────────────────────────────────────────────────
function ScorePill({ score, label }: { score: number; label: string }) {
  const color = scoreColor(score)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: 44,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 20,
          fontWeight: 400,
          color,
          lineHeight: 1,
        }}
      >
        {score}
      </span>
      <span
        style={{
          fontSize: 9,
          fontWeight: 500,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--color-text-dim)',
          marginTop: 2,
        }}
      >
        {label}
      </span>
    </div>
  )
}

// ─── Detail row (label + value) ───────────────────────────────────
function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
      <span
        style={{
          minWidth: 90,
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--color-text-dim)',
          paddingTop: 1,
        }}
      >
        {label}
      </span>
      <span style={{ color: 'var(--color-text-primary)', lineHeight: 1.4 }}>{value}</span>
    </div>
  )
}

// ─── Expanded detail panel ────────────────────────────────────────
function EntryDetail({ entry }: { entry: DailyEntry }) {
  const s   = entry.sleep
  const t   = entry.training
  const n   = entry.nutrition
  const sup = entry.supplements
  const c   = entry.context

  const sleepParts = [
    s.duration_min != null ? durationStr(s.duration_min) : null,
    s.hrv    != null ? `HRV ${s.hrv}ms`   : null,
    s.rhr    != null ? `RHR ${s.rhr}bpm`  : null,
    s.rested != null ? `Rested ${s.rested}/5` : null,
    s.bedtime        ? `Bed ${s.bedtime}` : null,
  ].filter(Boolean).join(' · ')

  const trainParts = t.sessions.length > 0
    ? t.sessions.map(sess =>
        `${activityEmoji(sess.activity_type)} ${sess.activity_type} ${sess.duration_min}min${sess.zone3_plus_minutes != null ? ` z3+:${sess.zone3_plus_minutes}m` : ''}`
      ).join('  ')
    : null

  const nutParts = [
    n.total_protein  != null ? `Protein ${Math.round(n.total_protein)}g`   : null,
    n.total_fiber    != null ? `Fiber ${Math.round(n.total_fiber)}g`       : null,
    n.total_fat      != null ? `Fat ${Math.round(n.total_fat)}g`           : null,
    n.total_carbs    != null ? `Carbs ${Math.round(n.total_carbs)}g`       : null,
    n.total_calories != null ? `${Math.round(n.total_calories)}kcal`       : null,
  ].filter(Boolean).join(' · ')

  const supParts = [
    sup.morning_stack_taken ? 'AM ✓' : null,
    sup.evening_stack_taken ? 'PM ✓' : null,
    sup.progesterone_taken  ? 'Prog ✓' : null,
    sup.estradiol_taken     ? 'E2 ✓'   : null,
  ].filter(Boolean).join(' · ')

  const ctxParts = [
    (c as unknown as Record<string,unknown>).cycle_day != null
      ? `Day ${(c as unknown as Record<string,unknown>).cycle_day}`
      : null,
    c.symptoms.length > 0  ? c.symptoms.join(', ')        : null,
    c.travelling           ? 'Travelling'                  : null,
  ].filter(Boolean).join(' · ')

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '12px 14px 14px',
        background: 'var(--color-bg)',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      <DetailRow label="Sleep"    value={sleepParts || null} />
      <DetailRow label="Training" value={trainParts || (t.cycled_today ? '🚴 Cycled' : 'Rest day')} />
      <DetailRow label="Nutrition" value={nutParts || null} />
      {supParts && <DetailRow label="Supplements" value={supParts} />}
      {ctxParts && <DetailRow label="Context"     value={ctxParts} />}
      {c.notes   && <DetailRow label="Notes"      value={`"${c.notes}"`} />}
    </div>
  )
}

// ─── History row ──────────────────────────────────────────────────
function HistoryRow({
  entry,
  onSelectDate,
}: {
  entry: DailyEntry
  onSelectDate: (date: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const bScore = behaviorScore(entry)
  const oScore = outcomeScore(entry)
  const hasSleep = entry.sleep.hrv != null || entry.sleep.duration_min != null

  const sessionIcons = entry.training.sessions
    .map(s => activityEmoji(s.activity_type))
    .join(' ')

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Row header — tap to expand */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '14px 14px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          gap: 12,
          textAlign: 'left',
        }}
      >
        {/* Date */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--color-text-primary)',
              lineHeight: 1.2,
            }}
          >
            {formatDate(entry.date)}
          </div>
          {(sessionIcons || entry.training.cycled_today) && (
            <div style={{ fontSize: 15, marginTop: 4, letterSpacing: 2 }}>
              {sessionIcons}
              {entry.training.cycled_today && ' 🚴'}
            </div>
          )}
        </div>

        {/* Scores — only if sleep is logged */}
        {hasSleep ? (
          <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
            <ScorePill score={bScore} label="Behav" />
            <ScorePill score={oScore} label="Outc"  />
          </div>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--color-text-dim)', flexShrink: 0 }}>
            No sleep logged
          </span>
        )}

        {/* Chevron */}
        <span
          style={{
            fontSize: 16,
            color: 'var(--color-text-dim)',
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 200ms',
            flexShrink: 0,
          }}
        >
          ›
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && <EntryDetail entry={entry} />}

      {/* Edit button — only in expanded state */}
      {expanded && (
        <div
          style={{
            padding: '8px 14px 12px',
            background: 'var(--color-bg)',
            display: 'flex',
            justifyContent: 'flex-end',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <button
            type="button"
            onClick={() => onSelectDate(entry.date)}
            style={{
              fontSize: 12,
              color: 'var(--color-primary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              padding: 0,
            }}
          >
            Edit this day →
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────
export default function HistoryTab({ onSelectDate }: Props) {
  const [entries, setEntries] = useState<DailyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    loadAllEntries()
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load history'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ paddingTop: 80, textAlign: 'center', fontSize: 10, letterSpacing: '0.2em', color: 'var(--color-text-dim)' }}>
        LOADING
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ paddingTop: 40, textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--color-danger)' }}>{error}</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 32 }}>

      {/* Header */}
      <div style={{ paddingTop: 8, paddingBottom: 8 }}>
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
          History
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>
          {entries.length} {entries.length === 1 ? 'day' : 'days'} logged
        </p>
      </div>

      {entries.length === 0 ? (
        <div
          style={{
            padding: '40px 16px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📓</div>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
            No entries yet
          </p>
          <p style={{ fontSize: 13, color: 'var(--color-text-dim)', marginTop: 4 }}>
            Start logging on the Today tab.
          </p>
        </div>
      ) : (
        entries.map(entry => (
          <HistoryRow
            key={entry.date}
            entry={entry}
            onSelectDate={onSelectDate}
          />
        ))
      )}
    </div>
  )
}
