import { describe, it, expect } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExploreData } from './fetch'
import { EXPLORE_VARIABLES, addDays, type ExploreVariable } from './series'
import { buildCoachPayload, coachCacheKey, classifyCoachError, runCoach, coachPromptVersion, hashPayload, COACH_MODEL } from './coach'
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
    tags: [{ id: 'x', label: 'Covid', start: addDays(start, 11), end: addDays(start, 16), source: 'manual' }],
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
    expect(p.tags).toEqual([{ label: 'Covid', start: '2026-10-20', end: '2026-10-25', source: 'manual' }])
  })
})

describe('coachCacheKey', () => {
  it('one-tap keys sort the selection; custom keys are unique', () => {
    expect(coachCacheKey('see', ['rhr', 'hrv'], '2026-10-28')).toBe('see|hrv,rhr|2026-10-28')
    expect(coachCacheKey('custom', ['hrv'], '2026-10-28')).not.toBe(coachCacheKey('custom', ['hrv'], '2026-10-28'))
  })
})

describe('buildCoachSystemPrompt', () => {
  it('appends the task block, and the question for custom', () => {
    expect(buildCoachSystemPrompt('see')).toContain('TASK: see')
    const c = buildCoachSystemPrompt('custom', 'Why is my HRV low?')
    expect(c).toContain("Julie's question: Why is my HRV low?")
    expect(c).not.toContain('{QUESTION}')
  })
})

describe('runCoach caching', () => {
  it('serves a one-tap answer from cache when the data hash matches', async () => {
    const { db } = fakeDb()
    let calls = 0
    const deps = { db, callModel: async () => { calls++; return `answer ${calls}` } }
    const data = syntheticData()
    expect(await runCoach(deps, data, 'see', ['hrv', 'rhr'])).toEqual({ answer: 'answer 1', cached: false })
    expect(await runCoach(deps, data, 'see', ['rhr', 'hrv'])).toEqual({ answer: 'answer 1', cached: true })
    expect(calls).toBe(1)
  })

  it('calls again and replaces the row when the data changes', async () => {
    const { db, rows } = fakeDb()
    let calls = 0
    const deps = { db, callModel: async () => { calls++; return `answer ${calls}` } }
    const data = syntheticData()
    await runCoach(deps, data, 'next', ['hrv'])
    data.dates[19].variables.hrv.value = 60
    expect(await runCoach(deps, data, 'next', ['hrv'])).toEqual({ answer: 'answer 2', cached: false })
    expect(rows.size).toBe(1)
    expect(rows.get('next|hrv|2026-10-28')?.answer).toBe('answer 2')
  })

  it('stores every custom answer but never serves one from cache', async () => {
    const { db, rows } = fakeDb()
    let calls = 0
    const deps = { db, callModel: async () => { calls++; return `answer ${calls}` } }
    const data = syntheticData()
    await runCoach(deps, data, 'custom', ['hrv'], 'Q?')
    expect(await runCoach(deps, data, 'custom', ['hrv'], 'Q?')).toEqual({ answer: 'answer 2', cached: false })
    expect(rows.size).toBe(2)
    expect([...rows.values()][0].question).toBe('Q?')
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
  })

  it('a row cached under an older prompt or model misses', async () => {
    const { db, rows } = fakeDb()
    let calls = 0
    const deps = { db, callModel: async () => { calls++; return `answer ${calls}` } }
    const data = syntheticData()
    await runCoach(deps, data, 'see', ['hrv'])
    const row = rows.get('see|hrv|2026-10-28')!
    // Same payload hashed without the prompt version = what an old row holds.
    const payloadJson = JSON.stringify(buildCoachPayload(data, 'see', ['hrv']))
    expect(row.data_hash).toBe(hashPayload('see', payloadJson))
    row.data_hash = 'hash-from-an-older-prompt'
    expect(await runCoach(deps, data, 'see', ['hrv'])).toEqual({ answer: 'answer 2', cached: false })
    expect(calls).toBe(2)
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
