import { describe, it, expect, vi } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExploreData } from './fetch'
import { EXPLORE_VARIABLES, addDays, type ExploreVariable } from './series'
import {
  buildCoachPayload, coachCacheKey, classifyCoachError, runCoach, coachPromptVersion, hashPayload,
  parseCoachOutput, callCoachModel, coachOutputSchema, COACH_OUTPUT_SCHEMAS, COACH_MODEL, COACH_MAX_TOKENS,
} from './coach'
import { buildCoachSystemPrompt, COACH_SYSTEM_PROMPT, COACH_TASKS } from './coachPrompts'

// 20 days ending 2026-10-28. HRV and RHR drift low together from day 10
// (a stretch), sleep is 7h30, bedtime 21:45, last meal 19:30.
export function syntheticData(): ExploreData {
  const start = '2026-10-09'
  const dates = Array.from({ length: 20 }, (_, i) => {
    const date = addDays(start, i)
    const low = i >= 10
    const variables = Object.fromEntries(EXPLORE_VARIABLES.map(v => [v, { value: null, display: null, z: null }])) as ExploreData['dates'][number]['variables']
    variables.hrv = { value: low ? 38 : 47, display: null, z: low ? -1.4 : 0.1 }
    variables.rhr = { value: low ? 56 : 50, display: null, z: low ? -1.2 : 0 }
    variables.sleep_duration = { value: 450, display: null, z: 0.2 }
    variables.bedtime = { value: 585, display: '21:45', z: 0 }
    variables.training_stress = { value: i % 2 ? 40 : 0, display: null, z: i % 2 ? 0.5 : -0.5 }
    variables.load_ratio = { value: 1.05, display: null, z: 0.1 }
    variables.last_meal = { value: 870, display: '19:30', z: null }
    return { date, isSick: i === 12, isTravelling: false, variables, daysSinceInjection: null }
  })
  return {
    startDate: start, endDate: addDays(start, 19), dates,
    injectionDates: [addDays(start, 3), addDays(start, 10), addDays(start, 17)],
    tags: [
      { id: 'x', label: 'Covid', start: addDays(start, 11), end: addDays(start, 16), source: 'manual', note: 'Tested positive on the 20th.' },
      { label: 'Travel', start: addDays(start, 18), end: addDays(start, 19), source: 'travel' },
    ],
  }
}

// In-memory stand-in for the explore_answers calls runCoach makes.
function fakeDb() {
  const rows = new Map<string, Record<string, unknown>>()
  const db = {
    from: () => ({
      select: () => {
        const filters: Record<string, unknown> = {}
        const q = {
          eq: (col: string, val: unknown) => { filters[col] = val; return q },
          maybeSingle: async () => ({ data: rows.get(filters.cache_key as string) ?? null, error: null }),
        }
        return q
      },
      insert: async (r: Record<string, unknown>) => { rows.set(r.cache_key as string, r); return { error: null } },
      upsert: async (r: Record<string, unknown>) => { rows.set(r.cache_key as string, r); return { error: null } },
    }),
  }
  return { db: db as unknown as SupabaseClient, rows }
}

describe('buildCoachPayload', () => {
  const sel: ExploreVariable[] = ['hrv', 'rhr']

  it('"see" includes only the selected variables, in display units', () => {
    const p = buildCoachPayload(syntheticData(), 'see', sel)
    expect(p.view.included).toEqual(sel)
    const day = p.days[0] as Record<string, unknown>
    expect(Object.keys(day)).toEqual(['date', 'sick', 'injection', 'hrv', 'rhr'])
    expect(day.hrv).toEqual({ value: 47, avg7: 47, avg7_dev: 0.1, dev: 0.1 })
  })

  it('avg7 is the centred 7-day average of raw values, in display units', () => {
    const p = buildCoachPayload(syntheticData(), 'next', ['hrv'])
    const day = (i: number) => p.days[i] as unknown as Record<string, { value: unknown; avg7: unknown; avg7_dev: unknown }>
    // Day 10 (19 Oct): window days 7–13 = 3 × 47 + 4 × 38 → 41.9 → 42 ms.
    expect(day(10).hrv.avg7).toBe(42)
    expect(day(10).hrv.avg7_dev).toBe(-0.76)
    expect(day(10).rhr.avg7).toBe(53)
    expect(day(10).sleep_duration.avg7).toBe('7:30')
    expect(day(10).bedtime.avg7).toBe('21:45')
    expect(day(10).last_meal.avg7).toBe('19:30')
    expect(day(10).load_ratio.avg7).toBe(1.05)
    // last_meal has no dev at all, but still has a real-unit average.
    expect(day(10).last_meal.avg7_dev).toBeNull()
  })

  it('"next" includes all seven and marks the selection', () => {
    const p = buildCoachPayload(syntheticData(), 'next', sel)
    expect(p.view.included).toEqual([...EXPLORE_VARIABLES])
    expect(p.view.selected).toEqual(sel)
    const day = p.days[0] as unknown as Record<string, { value: unknown; dev: unknown }>
    expect(day.sleep_duration.value).toBe('7:30')
    expect(day.bedtime.value).toBe('21:45')
    expect(day.last_meal.dev).toBeNull()
  })

  it('carries flags, the chart stretches and tags', () => {
    const p = buildCoachPayload(syntheticData(), 'see', sel)
    expect(p.days[3].injection).toBe(true)
    expect(p.days[12].sick).toBe(true)
    expect(p.stretches).toEqual([{ start: '2026-10-20', end: '2026-10-28', variables: sel }])
    expect(p.tags).toEqual([
      { label: 'Covid', start: '2026-10-20', end: '2026-10-25', source: 'manual', note: 'Tested positive on the 20th.' },
      { label: 'Travel', start: '2026-10-27', end: '2026-10-28', source: 'auto', note: null },
    ])
  })
})

describe('buildCoachPayload — Oura cutoff', () => {
  // 14–20 Sep: old-device HRV 80 / RHR 60 before 17 Sep, Oura HRV 45 /
  // RHR 50 from 17 Sep. Dev exists only on Oura days, as in normaliseExplore.
  function straddlingData(): ExploreData {
    const d = syntheticData()
    const dates = d.dates.slice(0, 7).map((x, i) => {
      const date = addDays('2026-09-14', i)
      const oura = date >= '2026-09-17'
      return {
        ...x, date, isSick: false,
        variables: {
          ...x.variables,
          hrv: { value: oura ? 45 : 80, display: null, z: oura ? -0.5 : null },
          rhr: { value: oura ? 50 : 60, display: null, z: oura ? 0.2 : null },
          sleep_duration: { value: oura ? 480 : 420, display: null, z: 0 },
        },
      }
    })
    return { ...d, startDate: '2026-09-14', endDate: '2026-09-20', dates, injectionDates: [], tags: [] }
  }
  const day = (p: ReturnType<typeof buildCoachPayload>, i: number) =>
    p.days[i] as unknown as Record<string, { value: unknown; avg7: unknown; avg7_dev: unknown; dev: unknown }>

  it('treats HRV and RHR before 17 Sep as missing', () => {
    const p = buildCoachPayload(straddlingData(), 'next', ['hrv'])
    for (const i of [0, 1, 2]) {
      expect(day(p, i).hrv).toEqual({ value: null, avg7: null, avg7_dev: null, dev: null })
      expect(day(p, i).rhr).toEqual({ value: null, avg7: null, avg7_dev: null, dev: null })
    }
  })

  it('averages Oura days only in a window that straddles 17 Sep', () => {
    const p = buildCoachPayload(straddlingData(), 'next', ['hrv'])
    // 17 Sep's window is 14–20 Sep: 3 old-device days + 4 Oura days. Only the
    // Oura days count, so avg7 is 45 ms / 50 bpm, not a blend with 80 / 60.
    expect(day(p, 3).hrv).toEqual({ value: 45, avg7: 45, avg7_dev: -0.5, dev: -0.5 })
    expect(day(p, 3).rhr).toEqual({ value: 50, avg7: 50, avg7_dev: 0.2, dev: 0.2 })
  })

  it('leaves the other variables, and the chart data, as they are', () => {
    const data = straddlingData()
    const p = buildCoachPayload(data, 'next', ['hrv'])
    // Sleep before 17 Sep keeps its value, and its avg7 mixes both sides
    // (3 × 7:00 + 4 × 8:00 → 7:34).
    expect(day(p, 0).sleep_duration.value).toBe('7:00')
    expect(day(p, 3).sleep_duration.avg7).toBe('7:34')
    // The data the chart reads is not modified.
    expect(data.dates[0].variables.hrv.value).toBe(80)
  })
})

describe('coachCacheKey', () => {
  it('one-tap keys sort the selection; custom and reply keys are unique', () => {
    expect(coachCacheKey('see', ['rhr', 'hrv'], '2026-10-28')).toBe('see|hrv,rhr|2026-10-28')
    expect(coachCacheKey('custom', ['hrv'], '2026-10-28')).not.toBe(coachCacheKey('custom', ['hrv'], '2026-10-28'))
    expect(coachCacheKey('reply', ['hrv'], '2026-10-28')).not.toBe(coachCacheKey('reply', ['hrv'], '2026-10-28'))
  })
})

describe('buildCoachSystemPrompt', () => {
  it('appends the task block, and the question for custom', () => {
    expect(buildCoachSystemPrompt('see')).toContain('TASK: see')
    expect(buildCoachSystemPrompt('reply')).toContain('TASK: reply')
    const c = buildCoachSystemPrompt('custom', 'Why is my HRV low?')
    expect(c).toContain("Julie's question: Why is my HRV low?")
    expect(c).not.toContain('{QUESTION}')
  })
})

// A model stand-in that answers in the JSON format and counts its calls.
function fakeModel(extra: Record<string, unknown> = {}, cutShort = false) {
  const seen: { type: string; system: string; user: string[] }[] = []
  const callModel = async (type: string, system: string, user: string[]) => {
    seen.push({ type, system, user })
    return { text: JSON.stringify({ answer: `answer ${seen.length}`, question: null, period: null, ...extra }), cutShort }
  }
  return { callModel, seen }
}

describe('runCoach caching', () => {
  it('serves a one-tap answer from cache when the data hash matches', async () => {
    const { db } = fakeDb()
    const m = fakeModel()
    const data = syntheticData()
    expect(await runCoach({ db, ...m }, data, { type: 'see', selected: ['hrv', 'rhr'] })).toMatchObject({ answer: 'answer 1', cached: false })
    expect(await runCoach({ db, ...m }, data, { type: 'see', selected: ['rhr', 'hrv'] })).toMatchObject({ answer: 'answer 1', cached: true })
    expect(m.seen.length).toBe(1)
  })

  it('calls again and replaces the row when the data changes', async () => {
    const { db, rows } = fakeDb()
    const m = fakeModel()
    const data = syntheticData()
    await runCoach({ db, ...m }, data, { type: 'next', selected: ['hrv'] })
    data.dates[19].variables.hrv.value = 60
    expect(await runCoach({ db, ...m }, data, { type: 'next', selected: ['hrv'] })).toMatchObject({ answer: 'answer 2', cached: false })
    expect(rows.size).toBe(1)
    expect(JSON.parse(rows.get('next|hrv|2026-10-28')?.answer as string).answer).toBe('answer 2')
  })

  it('stores every custom answer but never serves one from cache', async () => {
    const { db, rows } = fakeDb()
    const m = fakeModel()
    const data = syntheticData()
    await runCoach({ db, ...m }, data, { type: 'custom', selected: ['hrv'], question: 'Q?' })
    expect(await runCoach({ db, ...m }, data, { type: 'custom', selected: ['hrv'], question: 'Q?' })).toMatchObject({ answer: 'answer 2', cached: false })
    expect(rows.size).toBe(2)
    expect([...rows.values()][0].question).toBe('Q?')
  })

  it('a cached answer keeps its question and period', async () => {
    const { db } = fakeDb()
    const m = fakeModel({ question: 'Anything different?', period: { start: '2026-10-10', end: '2026-10-16' } })
    const data = syntheticData()
    await runCoach({ db, ...m }, data, { type: 'see', selected: ['hrv'] })
    expect(await runCoach({ db, ...m }, data, { type: 'see', selected: ['hrv'] })).toMatchObject({
      cached: true, question: 'Anything different?', period: { start: '2026-10-10', end: '2026-10-16' },
    })
  })
})

describe('cut-off answers', () => {
  it('uses the new ceilings', () => {
    expect(COACH_MAX_TOKENS).toEqual({ see: 800, next: 800, custom: 1500, reply: 1500 })
  })

  it('flags a cut-short answer, shows the text so far, and does not cache it', async () => {
    const { db, rows } = fakeDb()
    let calls = 0
    const callModel = async () => { calls++; return { text: '{"answer": "Your HRV climbed from 32 ms on 7 Oct to', cutShort: true } }
    const data = syntheticData()
    const r = await runCoach({ db, callModel }, data, { type: 'next', selected: ['hrv'] })
    expect(r).toMatchObject({ answer: 'Your HRV climbed from 32 ms on 7 Oct to', cutShort: true, parsed: false, question: null })
    expect(rows.size).toBe(0)
    await runCoach({ db, callModel }, data, { type: 'next', selected: ['hrv'] })
    expect(calls).toBe(2)
  })

  it('still stores a cut-short custom answer', async () => {
    const { db, rows } = fakeDb()
    const callModel = async () => ({ text: '{"answer": "Partly', cutShort: true })
    await runCoach({ db, callModel }, syntheticData(), { type: 'custom', selected: [], question: 'Q?' })
    expect(rows.size).toBe(1)
  })
})

describe('parseCoachOutput', () => {
  it('reads answer, question and period', () => {
    const t = JSON.stringify({ answer: ' HRV rose. ', question: 'Was that week calmer?', period: { start: '2026-10-10', end: '2026-10-16' } })
    expect(parseCoachOutput('see', t)).toEqual({
      answer: 'HRV rose.', question: 'Was that week calmer?', period: { start: '2026-10-10', end: '2026-10-16' }, tag: null, parsed: true,
    })
  })

  it('accepts JSON in code fences or with stray text around it', () => {
    expect(parseCoachOutput('next', '```json\n{"answer": "A", "question": null, "period": null}\n```').answer).toBe('A')
    expect(parseCoachOutput('next', 'Here you go: {"answer": "B", "question": null, "period": null}').answer).toBe('B')
  })

  it('drops a bad period, an empty question, and a period without a question', () => {
    expect(parseCoachOutput('see', JSON.stringify({ answer: 'A', question: 'Q?', period: { start: '2026-10-16', end: '2026-10-10' } })).period).toBeNull()
    expect(parseCoachOutput('see', JSON.stringify({ answer: 'A', question: 'Q?', period: { start: '10 Oct', end: '2026-10-16' } })).period).toBeNull()
    expect(parseCoachOutput('see', JSON.stringify({ answer: 'A', question: '  ', period: null })).question).toBeNull()
    expect(parseCoachOutput('see', JSON.stringify({ answer: 'A', question: null, period: { start: '2026-10-10', end: '2026-10-16' } })).period).toBeNull()
  })

  it('falls back to the raw text with no question when parsing fails', () => {
    expect(parseCoachOutput('see', 'Your HRV is in line with your usual.')).toEqual({
      answer: 'Your HRV is in line with your usual.', question: null, period: null, tag: null, parsed: false,
    })
    expect(parseCoachOutput('see', '{"question": "Q?"}')).toMatchObject({ answer: '{"question": "Q?"}', question: null, parsed: false })
  })

  it('reads a reply tag, trimming the label to 40 and the note to 500 characters', () => {
    const t = JSON.stringify({ answer: 'That fits.', tag: { label: 'L'.repeat(45), start: '2026-10-10', end: '2026-10-16', note: ' n '.repeat(300) } })
    const r = parseCoachOutput('reply', t)
    expect(r.tag?.label).toHaveLength(40)
    expect(r.tag?.note.length).toBeLessThanOrEqual(500)
    expect(r.question).toBeNull()
  })

  it('a reply tag with no label or bad dates becomes null', () => {
    expect(parseCoachOutput('reply', JSON.stringify({ answer: 'A', tag: { label: '', start: '2026-10-10', end: '2026-10-16', note: 'n' } })).tag).toBeNull()
    expect(parseCoachOutput('reply', JSON.stringify({ answer: 'A', tag: { label: 'L', start: '2026-10-16', end: '2026-10-10', note: 'n' } })).tag).toBeNull()
    expect(parseCoachOutput('reply', JSON.stringify({ answer: 'A', tag: null })).tag).toBeNull()
  })
})

describe('reply flow', () => {
  const replyTo = {
    type: 'see' as const,
    answer: 'HRV climbed from 44 ms to 53 ms between 8 and 13 Oct.',
    question: 'Was anything different around 10–16 Oct?',
    period: { start: '2026-10-10', end: '2026-10-16' },
  }
  const reply = 'Stressful workshop was over and my client was on vacation, so I worked in peace on my own schedule.'

  it('sends the original data payload plus the earlier exchange, with the reply task', async () => {
    const { db } = fakeDb()
    const m = fakeModel({ tag: { label: 'Calm work week', start: '2026-10-10', end: '2026-10-16', note: 'Workshop done, client away; worked in peace on my own schedule.' } })
    const data = syntheticData()
    const r = await runCoach({ db, ...m }, data, { type: 'reply', selected: ['hrv', 'rhr'], replyTo, reply })
    const call = m.seen[0]
    expect(call.type).toBe('reply')
    expect(call.system).toContain('TASK: reply')
    expect(call.user[0]).toBe(JSON.stringify(buildCoachPayload(data, 'see', ['hrv', 'rhr'])))
    expect(JSON.parse(call.user[1])).toEqual({
      earlier_answer: replyTo.answer, your_question: replyTo.question, period: replyTo.period, julie_reply: reply,
    })
    expect(r.tag).toEqual({ label: 'Calm work week', start: '2026-10-10', end: '2026-10-16', note: 'Workshop done, client away; worked in peace on my own schedule.' })
    expect(r.question).toBeNull()
  })

  it('stores each reply with Julie\'s text and never serves one from cache', async () => {
    const { db, rows } = fakeDb()
    const m = fakeModel({ tag: null })
    const data = syntheticData()
    await runCoach({ db, ...m }, data, { type: 'reply', selected: ['hrv'], replyTo, reply })
    await runCoach({ db, ...m }, data, { type: 'reply', selected: ['hrv'], replyTo, reply })
    expect(m.seen.length).toBe(2)
    expect(rows.size).toBe(2)
    expect([...rows.values()].every(r => r.question === reply)).toBe(true)
  })
})

describe('prompt version in data_hash', () => {
  it('changes with the model, the system prompt or the task block', () => {
    const base = coachPromptVersion('see')
    expect(coachPromptVersion('see', COACH_MODEL, COACH_SYSTEM_PROMPT, COACH_TASKS.see)).toBe(base)
    expect(coachPromptVersion('see', 'claude-opus-5-5')).not.toBe(base)
    expect(coachPromptVersion('see', COACH_MODEL, COACH_SYSTEM_PROMPT + ' ')).not.toBe(base)
    expect(coachPromptVersion('see', COACH_MODEL, COACH_SYSTEM_PROMPT, COACH_TASKS.see + ' ')).not.toBe(base)
    expect(coachPromptVersion('next')).not.toBe(base)
    expect(coachPromptVersion('see', COACH_MODEL, COACH_SYSTEM_PROMPT, COACH_TASKS.see, { type: 'object' })).not.toBe(base)
  })

  it('a row cached under an older prompt or model misses', async () => {
    const { db, rows } = fakeDb()
    const m = fakeModel()
    const data = syntheticData()
    await runCoach({ db, ...m }, data, { type: 'see', selected: ['hrv'] })
    const row = rows.get('see|hrv|2026-10-28')!
    // Same payload hashed without the prompt version = what an old row holds.
    const payloadJson = JSON.stringify(buildCoachPayload(data, 'see', ['hrv']))
    expect(row.data_hash).toBe(hashPayload('see', payloadJson))
    row.data_hash = 'hash-from-an-older-prompt'
    expect(await runCoach({ db, ...m }, data, { type: 'see', selected: ['hrv'] })).toMatchObject({ answer: 'answer 2', cached: false })
    expect(m.seen.length).toBe(2)
  })
})

describe('structured outputs', () => {
  // Every object must list all its properties as required and set
  // additionalProperties: false; maxLength / minLength aren't supported.
  function checkSchema(node: unknown, path = '$'): string[] {
    if (!node || typeof node !== 'object') return []
    const n = node as Record<string, unknown>
    const problems: string[] = []
    if ('maxLength' in n || 'minLength' in n) problems.push(`${path}: string length constraint`)
    if (n.type === 'object') {
      if (n.additionalProperties !== false) problems.push(`${path}: additionalProperties must be false`)
      const props = Object.keys((n.properties ?? {}) as object)
      if (JSON.stringify([...(n.required as string[] ?? [])].sort()) !== JSON.stringify([...props].sort())) {
        problems.push(`${path}: required must list every property`)
      }
    }
    for (const [k, v] of Object.entries(n)) {
      if (Array.isArray(v)) v.forEach((x, i) => problems.push(...checkSchema(x, `${path}.${k}[${i}]`)))
      else if (v && typeof v === 'object') problems.push(...checkSchema(v, `${path}.${k}`))
    }
    return problems
  }

  it('the schemas use only supported features', () => {
    expect(checkSchema(COACH_OUTPUT_SCHEMAS.answer)).toEqual([])
    expect(checkSchema(COACH_OUTPUT_SCHEMAS.reply)).toEqual([])
  })

  it('see / next / custom use the answer schema; reply uses the reply schema', () => {
    for (const t of ['see', 'next', 'custom'] as const) expect(coachOutputSchema(t)).toBe(COACH_OUTPUT_SCHEMAS.answer)
    expect(coachOutputSchema('reply')).toBe(COACH_OUTPUT_SCHEMAS.reply)
    expect(Object.keys(COACH_OUTPUT_SCHEMAS.answer.properties)).toEqual(['answer', 'question', 'period'])
    expect(Object.keys(COACH_OUTPUT_SCHEMAS.reply.properties)).toEqual(['answer', 'tag'])
  })

  it('callCoachModel sends the schema, thinking between_tools and the ceiling', async () => {
    const sent: Record<string, unknown>[] = []
    const client = {
      messages: {
        create: async (params: Record<string, unknown>) => {
          sent.push(params)
          return { content: [{ type: 'text', text: '{"answer":"A","question":null,"period":null}' }], stop_reason: 'end_turn' }
        },
      },
    } as unknown as Anthropic
    for (const t of ['see', 'next', 'custom', 'reply'] as const) {
      expect(await callCoachModel(client, t, 'system', ['payload'])).toEqual({
        text: '{"answer":"A","question":null,"period":null}', cutShort: false,
      })
    }
    sent.forEach((p, i) => {
      const t = (['see', 'next', 'custom', 'reply'] as const)[i]
      expect(p.model).toBe(COACH_MODEL)
      expect(p.max_tokens).toBe(COACH_MAX_TOKENS[t])
      expect(p.thinking).toEqual({ type: 'between_tools' })
      expect(p.output_config).toEqual({ format: { type: 'json_schema', schema: coachOutputSchema(t) } })
      expect(p.tool_choice).toBeUndefined()
    })
  })

  it('logs and does not cache a one-tap answer that still is not JSON', async () => {
    const { db, rows } = fakeDb()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const callModel = async () => ({ text: 'Your HRV was well above your usual. Was anything different?', cutShort: false })
    const r = await runCoach({ db, callModel }, syntheticData(), { type: 'see', selected: ['hrv'] })
    expect(r).toMatchObject({ answer: 'Your HRV was well above your usual. Was anything different?', question: null, parsed: false })
    expect(rows.size).toBe(0)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not valid JSON'))
    warn.mockRestore()
  })
})

describe('classifyCoachError', () => {
  it('recognises the credit-balance 400 as out_of_credit', () => {
    const err = Anthropic.APIError.generate(
      400,
      { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } },
      undefined,
      new Headers(),
    )
    expect(err).toBeInstanceOf(Anthropic.BadRequestError)
    expect(classifyCoachError(err)).toBe('out_of_credit')
  })

  it('treats other failures as coach_failed', () => {
    const other = Anthropic.APIError.generate(
      400, { type: 'error', error: { type: 'invalid_request_error', message: 'max_tokens: too large' } }, undefined, new Headers(),
    )
    const overloaded = Anthropic.APIError.generate(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, undefined, new Headers())
    expect(classifyCoachError(other)).toBe('coach_failed')
    expect(classifyCoachError(overloaded)).toBe('coach_failed')
    expect(classifyCoachError(new Error('network'))).toBe('coach_failed')
  })
})
