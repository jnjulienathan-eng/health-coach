// Explore coach — payload, cache and model call for POST /api/explore/coach.
// Server-only. The payload is built from the same loadExploreData() output
// and the same rollingAverage / findStretches the chart uses, so the coach
// sees exactly what is charted. Answers are cached in explore_answers.
// See BODYCIPHER.md → EXPLORE → Coach.

import { createHash, randomUUID } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExploreData } from './fetch'
import { EXPLORE_VARIABLES, type ExploreVariable } from './series'
import { rollingAverage, findStretches } from './trends'
import { buildCoachSystemPrompt, type CoachRequestType } from './coachPrompts'
import { describe } from './tagsDb'

export const COACH_MODEL = 'claude-sonnet-5-5'
export const COACH_MAX_TOKENS: Record<CoachRequestType, number> = { see: 250, next: 250, custom: 800 }
export const COACH_QUESTION_MAX = 500
const COACH_USER = 'julie'

// The one-tap buttons' wording, stored as explore_answers.question.
export const COACH_QUESTIONS = { see: 'What do you see?', next: 'What should I chart next?' } as const

const UNITS: Record<ExploreVariable, string> = {
  hrv: 'ms',
  rhr: 'bpm',
  sleep_duration: 'h:mm',
  bedtime: 'HH:MM',
  training_stress: 'TSU',
  load_ratio: 'ratio',
  last_meal: 'HH:MM',
}

const round2 = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100)

// Value in display units: ms / bpm / TSU as whole numbers, sleep as "h:mm",
// bedtime and last meal as Berlin "HH:MM", load ratio to 2 decimals.
function displayValue(v: ExploreVariable, p: ExploreData['dates'][number]['variables'][ExploreVariable]): number | string | null {
  if (p.value == null) return null
  switch (v) {
    case 'hrv':
    case 'rhr':
    case 'training_stress': return Math.round(p.value)
    case 'sleep_duration': {
      const m = Math.round(p.value)
      return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
    }
    case 'bedtime':
    case 'last_meal':       return p.display
    case 'load_ratio':      return round2(p.value)
  }
}

// ─── buildCoachPayload ────────────────────────────────────────────
// "see": selected variables only. "next" / "custom": all seven, with
// view.selected marking the current selection. Stretches are always the
// chart's, i.e. for the selected variables.
export function buildCoachPayload(data: ExploreData, type: CoachRequestType, selected: ExploreVariable[]) {
  const included: ExploreVariable[] = type === 'see' ? selected : [...EXPLORE_VARIABLES]
  const averages: Partial<Record<ExploreVariable, (number | null)[]>> = {}
  for (const v of new Set([...included, ...selected])) {
    averages[v] = rollingAverage(data.dates.map(d => d.variables[v].z))
  }
  const injections = new Set(data.injectionDates)

  return {
    view: { start: data.startDate, end: data.endDate, selected, included },
    units: Object.fromEntries(included.map(v => [v, UNITS[v]])),
    days: data.dates.map((d, i) => ({
      date: d.date,
      sick: d.isSick,
      injection: injections.has(d.date),
      ...Object.fromEntries(included.map(v => [v, {
        value: displayValue(v, d.variables[v]),
        avg7: round2(averages[v]?.[i] ?? null),
        dev: round2(d.variables[v].z),
      }])),
    })),
    stretches: findStretches(data.dates.map(d => d.date), averages, selected)
      .map(s => ({ start: s.start, end: s.end, variables: selected })),
    tags: data.tags.map(t => ({
      label: t.label, start: t.start, end: t.end, source: t.source === 'manual' ? 'manual' : 'auto',
    })),
  }
}

// One-tap answers: type + sorted selection + window end. Custom answers get
// a unique key so each one is stored but never matched again.
export function coachCacheKey(type: CoachRequestType, selected: ExploreVariable[], endDate: string): string {
  const base = `${type}|${[...selected].sort().join(',')}|${endDate}`
  return type === 'custom' ? `${base}|${randomUUID()}` : base
}

export function hashPayload(payloadJson: string): string {
  return createHash('sha256').update(payloadJson).digest('hex')
}

// ─── Errors ───────────────────────────────────────────────────────
// The API reports an empty balance as a 400 invalid_request_error whose
// message says the credit balance is too low; there is no dedicated class.
export type CoachErrorType = 'out_of_credit' | 'coach_failed'

export function classifyCoachError(e: unknown): CoachErrorType {
  if (e instanceof Anthropic.APIError && (e.status === 400 || e.status === 402)
      && /credit balance/i.test(e.message)) {
    return 'out_of_credit'
  }
  return 'coach_failed'
}

// ─── Model call ───────────────────────────────────────────────────
// Thinking off (between_tools — Sonnet 5.5 rejects "disabled") so the
// small max_tokens budget goes to the answer, not to reasoning.
export async function callCoachModel(
  client: Anthropic, type: CoachRequestType, payloadJson: string, question?: string,
): Promise<string> {
  const params = {
    model: COACH_MODEL,
    max_tokens: COACH_MAX_TOKENS[type],
    thinking: { type: 'between_tools' },
    system: buildCoachSystemPrompt(type, question),
    messages: [{ role: 'user', content: payloadJson }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming
  const res = await client.messages.create(params)
  const text = res.content
    .map(b => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()
  if (!text) throw new Error(`Empty coach answer (stop_reason ${res.stop_reason})`)
  return text
}

// ─── runCoach ─────────────────────────────────────────────────────
// One-tap: a stored row with the same cache_key and data_hash is returned
// without calling the model; a stale hash calls the model and replaces the
// row. Custom: always calls the model, then stores the answer.
export interface CoachDeps {
  db: SupabaseClient
  callModel: (type: CoachRequestType, payloadJson: string, question?: string) => Promise<string>
}

export async function runCoach(
  deps: CoachDeps,
  data: ExploreData,
  type: CoachRequestType,
  selected: ExploreVariable[],
  question?: string,
): Promise<{ answer: string; cached: boolean }> {
  // Canonical order, so the same variables picked in another order hash
  // (and key) the same.
  selected = EXPLORE_VARIABLES.filter(v => selected.includes(v))
  const payloadJson = JSON.stringify(buildCoachPayload(data, type, selected))
  const dataHash = hashPayload(payloadJson)
  const cacheKey = coachCacheKey(type, selected, data.endDate)

  if (type !== 'custom') {
    const { data: row, error } = await deps.db
      .from('explore_answers')
      .select('answer, data_hash')
      .eq('user_id', COACH_USER)
      .eq('cache_key', cacheKey)
      .maybeSingle()
    if (error) console.error('explore coach cache read failed:', describe(error))
    else if (row && row.data_hash === dataHash) return { answer: row.answer as string, cached: true }
  }

  const answer = await deps.callModel(type, payloadJson, question)

  const record = {
    user_id: COACH_USER,
    cache_key: cacheKey,
    question: type === 'custom' ? (question ?? '') : COACH_QUESTIONS[type],
    variables: selected,
    focus_date: data.endDate,
    data_hash: dataHash,
    answer,
    model: COACH_MODEL,
    created_at: new Date().toISOString(),
  }
  const { error } = type === 'custom'
    ? await deps.db.from('explore_answers').insert(record)
    : await deps.db.from('explore_answers').upsert(record, { onConflict: 'user_id,cache_key' })
  // A failed write still returns the answer — only the cache is lost.
  if (error) console.error('explore coach cache write failed:', describe(error))

  return { answer, cached: false }
}
