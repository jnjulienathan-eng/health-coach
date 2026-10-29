// Explore coach — payload, cache and model call for POST /api/explore/coach.
// Server-only. The payload is built from the same loadExploreData() output
// and the same rollingAverage / findStretches the chart uses, so the coach
// sees exactly what is charted. The answer's JSON shape is enforced by
// structured outputs (output_config.format with COACH_OUTPUT_SCHEMAS) and
// parsed by parseCoachOutput(). One-tap answers are cached in explore_answers; custom
// questions and replies are stored but never served from cache.
// See BODYCIPHER.md → EXPLORE → Coach.

import { createHash, randomUUID } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExploreData } from './fetch'
import { EXPLORE_VARIABLES, OURA_VARIABLES, bedtimeMinutesToHHMM, lastMealMinutesToHHMM, type ExploreVariable } from './series'
import { OURA_START_DATE } from '../types'
import { rollingAverage, findStretches } from './trends'
import { buildCoachSystemPrompt, COACH_SYSTEM_PROMPT, COACH_TASKS, type CoachRequestType } from './coachPrompts'
import { describe } from './tagsDb'
import { TAG_LABEL_MAX, TAG_NOTE_MAX } from './tags'

export const COACH_MODEL = 'claude-sonnet-5-5'
// Ceilings the answers should never reach (the prompts ask for far less).
// An answer that does hit one is still shown, flagged cutShort, and logged.
export const COACH_MAX_TOKENS: Record<CoachRequestType, number> = { see: 800, next: 800, custom: 1500, reply: 1500 }
export const COACH_QUESTION_MAX = 500
// Earlier answer echoed back in a reply request — generous, but bounded.
const COACH_ANSWER_MAX = 4000
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

// Raw value (or average of raw values) in display units, as the readout
// shows it: ms / bpm / TSU as whole numbers, sleep as "h:mm", bedtime and
// last meal as Berlin "HH:MM" (same converters as the route's display),
// load ratio to 2 decimals.
function displayValue(v: ExploreVariable, value: number | null): number | string | null {
  if (value == null) return null
  switch (v) {
    case 'hrv':
    case 'rhr':
    case 'training_stress': return Math.round(value)
    case 'sleep_duration': {
      const m = Math.round(value)
      return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
    }
    case 'bedtime':         return bedtimeMinutesToHHMM(value)
    case 'last_meal':       return lastMealMinutesToHHMM(value)
    case 'load_ratio':      return round2(value)
  }
}

// ─── buildCoachPayload ────────────────────────────────────────────
// "see": selected variables only. "next" / "custom": all seven, with
// view.selected marking the current selection. Stretches are always the
// chart's, i.e. for the selected variables.
export function buildCoachPayload(data: ExploreData, type: CoachRequestType, selected: ExploreVariable[]) {
  const included: ExploreVariable[] = type === 'see' ? selected : [...EXPLORE_VARIABLES]
  // averages: the chart's 7-day average of dev (avg7_dev, and stretches).
  // rawAverages: the same centred window over raw values (avg7), so the
  // average reads in real units. Bedtime and last meal average their
  // encoded minutes, which don't wrap at midnight.
  // Coach only: HRV and RHR before OURA_START_DATE come from the old device
  // and aren't comparable, so they are treated as missing here — value,
  // avg7, avg7_dev and dev are null on those dates, and the real-unit avg7
  // around the cutoff averages Oura days only. The chart, readout and
  // stretches (from `averages`) are unchanged.
  const preOura = (v: ExploreVariable, date: string) => OURA_VARIABLES.includes(v) && date < OURA_START_DATE
  const averages: Partial<Record<ExploreVariable, (number | null)[]>> = {}
  const rawAverages: Partial<Record<ExploreVariable, (number | null)[]>> = {}
  for (const v of new Set([...included, ...selected])) {
    averages[v] = rollingAverage(data.dates.map(d => d.variables[v].z))
    rawAverages[v] = rollingAverage(data.dates.map(d => (preOura(v, d.date) ? null : d.variables[v].value)))
  }
  const injections = new Set(data.injectionDates)

  return {
    view: { start: data.startDate, end: data.endDate, selected, included },
    units: Object.fromEntries(included.map(v => [v, UNITS[v]])),
    days: data.dates.map((d, i) => ({
      date: d.date,
      sick: d.isSick,
      injection: injections.has(d.date),
      ...Object.fromEntries(included.map(v => [v, preOura(v, d.date) ? {
        value: null, avg7: null, avg7_dev: null, dev: null,
      } : {
        value: displayValue(v, d.variables[v].value),
        avg7: displayValue(v, rawAverages[v]?.[i] ?? null),
        avg7_dev: round2(averages[v]?.[i] ?? null),
        dev: round2(d.variables[v].z),
      }])),
    })),
    stretches: findStretches(data.dates.map(d => d.date), averages, selected)
      .map(s => ({ start: s.start, end: s.end, variables: selected })),
    tags: data.tags.map(t => ({
      label: t.label, start: t.start, end: t.end, source: t.source === 'manual' ? 'manual' : 'auto',
      note: t.note ?? null,
    })),
  }
}

// One-tap answers: type + sorted selection + window end. Custom answers and
// replies get a unique key so each one is stored but never matched again.
export function coachCacheKey(type: CoachRequestType, selected: ExploreVariable[], endDate: string): string {
  const base = `${type}|${[...selected].sort().join(',')}|${endDate}`
  return type === 'custom' || type === 'reply' ? `${base}|${randomUUID()}` : base
}

// ─── Output schemas ───────────────────────────────────────────────
// Structured outputs (output_config.format, type json_schema) make the API
// return JSON in exactly these shapes. Claude Sonnet 5.5 supports them; it
// rejects forced tool_choice, so a forced tool isn't an option. Structured
// outputs don't support maxLength, so the 40 / 500 limits are stated in the
// descriptions and enforced in parseCoachOutput().
const DATE_SCHEMA = { type: 'string', format: 'date' }
const PERIOD_SCHEMA = {
  type: 'object',
  properties: { start: DATE_SCHEMA, end: DATE_SCHEMA },
  required: ['start', 'end'],
  additionalProperties: false,
}
export const COACH_OUTPUT_SCHEMAS = {
  // see / next / custom
  answer: {
    type: 'object',
    properties: {
      answer: { type: 'string' },
      question: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      period: { anyOf: [PERIOD_SCHEMA, { type: 'null' }] },
    },
    required: ['answer', 'question', 'period'],
    additionalProperties: false,
  },
  reply: {
    type: 'object',
    properties: {
      answer: { type: 'string' },
      tag: {
        anyOf: [
          {
            type: 'object',
            properties: {
              label: { type: 'string', description: `At most ${TAG_LABEL_MAX} characters.` },
              start: DATE_SCHEMA,
              end: DATE_SCHEMA,
              note: { type: 'string', description: `At most ${TAG_NOTE_MAX} characters.` },
            },
            required: ['label', 'start', 'end', 'note'],
            additionalProperties: false,
          },
          { type: 'null' },
        ],
      },
    },
    required: ['answer', 'tag'],
    additionalProperties: false,
  },
} as const

export function coachOutputSchema(type: CoachRequestType): Record<string, unknown> {
  return type === 'reply' ? COACH_OUTPUT_SCHEMAS.reply : COACH_OUTPUT_SCHEMAS.answer
}

// Prompt version: the model, the shared system prompt, the task block and
// the output schema. It is part of data_hash, so editing the prompt,
// switching the model or changing the schema makes cached answers miss.
export function coachPromptVersion(
  type: CoachRequestType,
  model: string = COACH_MODEL,
  systemPrompt: string = COACH_SYSTEM_PROMPT,
  task: string = COACH_TASKS[type],
  schema: Record<string, unknown> = coachOutputSchema(type),
): string {
  return createHash('sha256').update(`${model}\n${systemPrompt}\n${task}\n${JSON.stringify(schema)}`).digest('hex')
}

export function hashPayload(type: CoachRequestType, payloadJson: string): string {
  return createHash('sha256').update(`${coachPromptVersion(type)}\n${payloadJson}`).digest('hex')
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

// ─── Output parsing ───────────────────────────────────────────────
// see / next / custom: {"answer", "question" | null, "period" | null}
// reply:               {"answer", "tag": {label, start, end, note} | null}
// Fields that don't fit the shape are dropped to null. If the JSON can't be
// parsed at all, the answer is the raw text (or, for JSON cut off mid-way,
// the "answer" string recovered from it) and there is no question or tag.
export interface CoachPeriod { start: string; end: string }
export interface CoachTagSuggestion { label: string; start: string; end: string; note: string }
export interface CoachOutput {
  answer: string
  question: string | null
  period: CoachPeriod | null
  tag: CoachTagSuggestion | null
  parsed: boolean
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const isDate = (x: unknown): x is string =>
  typeof x === 'string' && DATE_RE.test(x) && !Number.isNaN(Date.parse(x + 'T00:00:00Z'))

function asPeriod(x: unknown): CoachPeriod | null {
  if (!x || typeof x !== 'object') return null
  const { start, end } = x as Record<string, unknown>
  return isDate(start) && isDate(end) && start <= end ? { start, end } : null
}

function asTag(x: unknown): CoachTagSuggestion | null {
  const period = asPeriod(x)
  if (!period) return null
  const { label, note } = x as Record<string, unknown>
  const l = typeof label === 'string' ? label.trim().slice(0, TAG_LABEL_MAX) : ''
  if (!l) return null
  const n = typeof note === 'string' ? note.trim().slice(0, TAG_NOTE_MAX) : ''
  return { label: l, ...period, note: n }
}

export function parseCoachOutput(type: CoachRequestType, text: string): CoachOutput {
  const raw = text.trim()
  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    const obj = JSON.parse(unfenced.slice(unfenced.indexOf('{'), unfenced.lastIndexOf('}') + 1)) as Record<string, unknown>
    const answer = typeof obj.answer === 'string' ? obj.answer.trim() : ''
    if (!answer) throw new Error('no answer')
    if (type === 'reply') {
      return { answer, question: null, period: null, tag: asTag(obj.tag), parsed: true }
    }
    const question = typeof obj.question === 'string' && obj.question.trim() ? obj.question.trim() : null
    return { answer, question, period: question ? asPeriod(obj.period) : null, tag: null, parsed: true }
  } catch {
    // Truncated JSON: recover the answer string written so far.
    const m = unfenced.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)/)
    let answer = raw
    if (m) {
      try { answer = (JSON.parse(`"${m[1]}"`) as string).trim() || raw } catch { /* keep raw */ }
    }
    return { answer, question: null, period: null, tag: null, parsed: false }
  }
}

// ─── Model call ───────────────────────────────────────────────────
// Thinking off (between_tools — Sonnet 5.5 rejects "disabled") so the
// max_tokens budget goes to the answer, not to reasoning. between_tools is
// compatible with structured outputs (it only rules out xhigh / max effort,
// and the default effort is high). user: the data payload, plus the earlier
// exchange for a reply.
export interface CoachModelResult { text: string; cutShort: boolean }

export async function callCoachModel(
  client: Anthropic, type: CoachRequestType, system: string, user: string[],
): Promise<CoachModelResult> {
  const params = {
    model: COACH_MODEL,
    max_tokens: COACH_MAX_TOKENS[type],
    thinking: { type: 'between_tools' },
    output_config: { format: { type: 'json_schema', schema: coachOutputSchema(type) } },
    system,
    messages: [{ role: 'user', content: user.map(text => ({ type: 'text', text })) }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming
  const res = await client.messages.create(params)
  const text = res.content
    .map(b => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()
  if (!text) throw new Error(`Empty coach answer (stop_reason ${res.stop_reason})`)
  return { text, cutShort: res.stop_reason === 'max_tokens' }
}

// ─── runCoach ─────────────────────────────────────────────────────
// One-tap: a stored row with the same cache_key and data_hash is returned
// without calling the model; a stale hash calls the model and replaces the
// row. A cut-short one-tap answer is shown but not cached, so the next tap
// tries again. Custom and reply: always call the model, then store.
// explore_answers.answer holds the model's raw JSON text; it is parsed again
// on a cache hit.
export type OriginalCoachType = Exclude<CoachRequestType, 'reply'>

export interface ReplyContext {
  type: OriginalCoachType     // the answer being replied to
  answer: string
  question: string
  period: CoachPeriod | null
}

export type CoachRequest =
  | { type: OriginalCoachType; selected: ExploreVariable[]; question?: string }
  | { type: 'reply'; selected: ExploreVariable[]; replyTo: ReplyContext; reply: string }

export interface CoachDeps {
  db: SupabaseClient
  callModel: (type: CoachRequestType, system: string, user: string[]) => Promise<CoachModelResult>
}

export type CoachResponse = CoachOutput & { cutShort: boolean; cached: boolean }

export async function runCoach(deps: CoachDeps, data: ExploreData, req: CoachRequest): Promise<CoachResponse> {
  const { type } = req
  // Canonical order, so the same variables picked in another order hash
  // (and key) the same.
  const selected = EXPLORE_VARIABLES.filter(v => req.selected.includes(v))
  // A reply sends the same data payload as the answer it replies to.
  const payloadType = req.type === 'reply' ? req.replyTo.type : req.type
  const payloadJson = JSON.stringify(buildCoachPayload(data, payloadType, selected))
  const dataHash = hashPayload(type, payloadJson)
  const cacheKey = coachCacheKey(type, selected, data.endDate)

  if (type === 'see' || type === 'next') {
    const { data: row, error } = await deps.db
      .from('explore_answers')
      .select('answer, data_hash')
      .eq('user_id', COACH_USER)
      .eq('cache_key', cacheKey)
      .maybeSingle()
    if (error) console.error('explore coach cache read failed:', describe(error))
    else if (row && row.data_hash === dataHash) {
      const cached = parseCoachOutput(type, row.answer as string)
      if (!cached.parsed) console.warn(`explore coach cached answer not valid JSON, showing raw text (${type})`)
      return { ...cached, cutShort: false, cached: true }
    }
  }

  const system = req.type === 'custom'
    ? buildCoachSystemPrompt('custom', req.question)
    : buildCoachSystemPrompt(type)
  const user = req.type === 'reply'
    ? [payloadJson, JSON.stringify({
        earlier_answer: req.replyTo.answer.slice(0, COACH_ANSWER_MAX),
        your_question: req.replyTo.question,
        period: req.replyTo.period,
        julie_reply: req.reply,
      })]
    : [payloadJson]
  const { text, cutShort } = await deps.callModel(type, system, user)
  if (cutShort) console.warn(`explore coach answer cut short at max_tokens ${COACH_MAX_TOKENS[type]} (${type})`)
  const output = parseCoachOutput(type, text)
  if (!output.parsed) {
    console.warn(`explore coach answer not valid JSON, showing raw text (${type}): ${text.slice(0, 200)}`)
  }

  const question = req.type === 'custom' ? (req.question ?? '')
    : req.type === 'reply' ? req.reply
    : COACH_QUESTIONS[req.type]
  const record = {
    user_id: COACH_USER,
    cache_key: cacheKey,
    question,
    variables: selected,
    focus_date: data.endDate,
    data_hash: dataHash,
    answer: text,
    model: COACH_MODEL,
    created_at: new Date().toISOString(),
  }
  // A one-tap answer that was cut short or couldn't be parsed isn't cached,
  // so the next tap tries again.
  const oneTap = type === 'see' || type === 'next'
  if (!(oneTap && (cutShort || !output.parsed))) {
    const { error } = oneTap
      ? await deps.db.from('explore_answers').upsert(record, { onConflict: 'user_id,cache_key' })
      : await deps.db.from('explore_answers').insert(record)
    // A failed write still returns the answer — only the cache is lost.
    if (error) console.error('explore coach cache write failed:', describe(error))
  }

  return { ...output, cutShort, cached: false }
}
