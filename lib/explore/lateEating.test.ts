import { describe, it, expect, vi } from 'vitest'
import { emptyEntry, type DailyEntry } from '../types'
import {
  bedtimeDeviation, sleepGlucose, wakingGlucose, weightChange, buildLateEatingNights,
  groupSummary, kcalGroup, CGM_MIN_COVERAGE, type CgmPoint,
} from './lateEating'
import { mealLoadFromRow } from './meals'

// lib/oura.ts → lib/scores-server.ts → lib/db.ts opens a Supabase client on
// import; the mapping under test doesn't need it.
vi.mock('@/lib/scores-server', () => ({ recomputeScores: vi.fn() }))
const { lowestHrTimePct, mapOuraForDate } = await import('../oura')

// A night: Oura sleep on the wake-date row.
function night(wake: string, bedtime: string, wakeTime: string, extra: Partial<DailyEntry['sleep']> = {}): DailyEntry {
  const e = emptyEntry(wake)
  Object.assign(e.sleep, { bedtime, wake_time: wakeTime, hrv: 40, rhr: 50, deep_sleep_min: 80, lowest_hr_time_pct: 45 }, extra)
  return e
}

// CGM every 5 minutes from `fromIso` for `hours`, at a constant value.
function cgmRun(fromIso: string, hours: number, mmol: number): CgmPoint[] {
  const start = Date.parse(fromIso)
  return Array.from({ length: hours * 12 + 1 }, (_, i) => ({ at: new Date(start + i * 300_000).toISOString(), mmol }))
}

describe('bedtimeDeviation', () => {
  const prior = (wake: string, n: number, bedtime: string) => {
    const out: Record<string, string> = {}
    const d = new Date(wake + 'T00:00:00Z')
    for (let i = 1; i <= n; i++) {
      d.setUTCDate(d.getUTCDate() - 1)
      out[d.toISOString().slice(0, 10)] = bedtime
    }
    return out
  }

  it('is minutes from the median of the previous 14 nights', () => {
    expect(bedtimeDeviation('2026-10-20', { ...prior('2026-10-20', 14, '21:30'), '2026-10-20': '22:15' })).toBe(45)
    expect(bedtimeDeviation('2026-10-20', { ...prior('2026-10-20', 14, '21:30'), '2026-10-20': '21:00' })).toBe(-30)
  })

  it('works across midnight', () => {
    expect(bedtimeDeviation('2026-10-20', { ...prior('2026-10-20', 14, '23:30'), '2026-10-20': '00:15' })).toBe(45)
  })

  it('needs 7 prior nights', () => {
    expect(bedtimeDeviation('2026-10-20', { ...prior('2026-10-20', 6, '21:30'), '2026-10-20': '22:00' })).toBeNull()
    expect(bedtimeDeviation('2026-10-20', { ...prior('2026-10-20', 7, '21:30'), '2026-10-20': '22:00' })).toBe(30)
  })
})

describe('sleepGlucose / wakingGlucose', () => {
  const start = Date.parse('2026-10-20T20:00:00Z')
  const end = start + 8 * 3_600_000

  it('mean, peak and full coverage', () => {
    const r = cgmRun('2026-10-20T20:00:00Z', 8, 5).map(p => ({ ms: Date.parse(p.at), mmol: p.mmol }))
    r[10].mmol = 7.2
    const g = sleepGlucose(r, start, end)
    expect(g.coverage).toBe(1)
    expect(g.peak).toBe(7.2)
    expect(g.mean).toBeCloseTo(5, 0)
  })

  it('coverage counts filled 15-minute slots', () => {
    const r = cgmRun('2026-10-20T20:00:00Z', 4, 5).map(p => ({ ms: Date.parse(p.at), mmol: p.mmol }))
    expect(sleepGlucose(r, start, end).coverage).toBeCloseTo(17 / 32, 5) // 4h of 8h, plus the slot at 4:00
    expect(sleepGlucose([], start, end)).toEqual({ mean: null, peak: null, coverage: 0 })
  })

  it('waking glucose is the nearest reading within 120 minutes', () => {
    const r = [{ ms: end - 30 * 60_000, mmol: 5.1 }, { ms: end + 10 * 60_000, mmol: 5.4 }]
    expect(wakingGlucose(r, end)).toBe(5.4)
    expect(wakingGlucose([{ ms: end - 121 * 60_000, mmol: 5 }], end)).toBeNull()
  })
})

describe('weightChange', () => {
  it('compares with the latest reading up to 3 days before', () => {
    expect(weightChange('2026-10-20', { '2026-10-20': 63.4, '2026-10-18': 63.9, '2026-10-17': 64 })).toBe(-0.5)
    expect(weightChange('2026-10-20', { '2026-10-20': 63.4, '2026-10-16': 64 })).toBeNull()
    expect(weightChange('2026-10-20', { '2026-10-19': 64 })).toBeNull()
  })
})

describe('buildLateEatingNights', () => {
  // Night 24→25 Oct (CEST): bed 21:30 CEST = 19:30Z, wake 06:30 CET = 05:30Z.
  const base = night('2026-10-25', '21:30', '06:30')
  const meals = [
    { loggedAt: '2026-10-24T11:00:00Z', kcal: 600, carbs: 50 },
    { loggedAt: '2026-10-24T17:00:00Z', kcal: 550, carbs: 45 }, // 19:00 CEST, in
  ]
  const cgm = cgmRun('2026-10-24T19:00:00Z', 11, 5.2)

  it('builds a night with exposure and outcomes across the October change', () => {
    const d = buildLateEatingNights({
      entries: [base], meals, cgm, weightByDate: { '2026-10-25': 63.1, '2026-10-24': 63.4 },
      from: '2026-10-25', to: '2026-10-25',
    })
    expect(d.excluded).toEqual([])
    const n = d.nights[0]
    expect(n.lateKcal).toBe(550)
    expect(n.lateCarbs).toBe(45)
    expect(n.trained).toBe(false)
    expect(n.outcomes).toEqual({
      lowest_hr: 50, lowest_hr_timing: 45, hrv: 40, deep_sleep: 80,
      sleep_glucose_mean: 5.2, sleep_glucose_peak: 5.2, waking_glucose: 5.2, weight_change: -0.3,
    })
  })

  it('flags training on the evening’s app day', () => {
    const evening = emptyEntry('2026-10-24')
    evening.training.sessions = [{ id: 's', activity_type: 'run', duration_min: 35, zone3_plus_minutes: 10, active_calories: null }]
    const d = buildLateEatingNights({ entries: [base, evening], meals, cgm, weightByDate: {}, from: '2026-10-25', to: '2026-10-25' })
    expect(d.nights[0].trained).toBe(true)
  })

  it('leaves nights out with a reason instead of estimating', () => {
    const noOura = night('2026-10-21', '21:30', '06:30', { hrv: null })
    const sick = night('2026-10-22', '21:30', '06:30'); sick.context.is_sick = true
    const noMeals = night('2026-10-23', '21:30', '06:30')
    const noCgm = night('2026-10-25', '21:30', '06:30')
    const d = buildLateEatingNights({
      entries: [noOura, sick, noMeals, noCgm],
      meals: [...meals, { loggedAt: '2026-10-21T10:00:00Z', kcal: 400, carbs: 30 }],
      cgm: cgmRun('2026-10-24T19:30:00Z', 6, 5), // 6h of a 10h night
      weightByDate: {}, from: '2026-10-21', to: '2026-10-25',
    })
    expect(d.nights).toEqual([])
    expect(d.excluded).toEqual([
      { wakeDate: '2026-10-21', reason: 'oura' },
      { wakeDate: '2026-10-22', reason: 'sick' },
      { wakeDate: '2026-10-23', reason: 'meals' },
      { wakeDate: '2026-10-25', reason: 'cgm' },
    ])
    expect(CGM_MIN_COVERAGE).toBe(0.7)
  })

  it('a meal just before midnight counts for an after-midnight bedtime (March, CEST)', () => {
    const late = night('2026-03-30', '00:30', '07:30')
    const d = buildLateEatingNights({
      entries: [late],
      meals: [{ loggedAt: '2026-03-29T21:55:00Z', kcal: 250, carbs: 20 }], // 23:55 CEST
      cgm: cgmRun('2026-03-29T22:00:00Z', 8, 5),
      weightByDate: {}, from: '2026-03-30', to: '2026-03-30',
    })
    expect(d.nights[0].lateKcal).toBe(250)
  })
})

describe('groupSummary / kcalGroup', () => {
  it('median and quartiles', () => {
    expect(groupSummary([1, 2, 3, 4, 5])).toEqual({ n: 5, median: 3, q1: 2, q3: 4 })
    expect(groupSummary([])).toEqual({ n: 0, median: null, q1: null, q3: null })
  })

  it('groups under 200 and over 500 kcal; 200–500 in neither', () => {
    expect(kcalGroup(199)).toBe('low')
    expect(kcalGroup(200)).toBeNull()
    expect(kcalGroup(500)).toBeNull()
    expect(kcalGroup(501)).toBe('high')
  })
})

describe('mealLoadFromRow', () => {
  it('photo estimates use their own macros; other meals sum their items', () => {
    expect(mealLoadFromRow({ logged_at: 't', logged_via: 'photo_estimate', calories: '420', carbs_g: 30 }))
      .toEqual({ loggedAt: 't', kcal: 420, carbs: 30 })
    expect(mealLoadFromRow({
      logged_at: 't', logged_via: 'ingredients', calories: null, carbs_g: null,
      meal_log_items: [
        { weight_grams: 200, food_items: { nutrients_per_100g: { calories: 100, carbs: 10 } } },
        { weight_grams: 50, food_items: [{ nutrients_per_100g: { calories: '500', carbs: 40 } }] },
      ],
    })).toEqual({ loggedAt: 't', kcal: 450, carbs: 40 })
  })
})

describe('Oura sync: deep sleep and lowest-HR timing', () => {
  const period = {
    type: 'long_sleep', day: '2026-10-25',
    bedtime_start: '2026-10-24T21:30:00+02:00', bedtime_end: '2026-10-25T06:30:00+01:00', // 10h across the change
    total_sleep_duration: 30000, average_hrv: 41.6, lowest_heart_rate: 48, deep_sleep_duration: 4830,
    heart_rate: { interval: 300, timestamp: '2026-10-24T21:30:00+02:00', items: [60, null, 55, 48, 52, 48] },
  }

  it('lowest HR time is the first minimum, as % of the sleep period', () => {
    expect(lowestHrTimePct(period)).toBe(2.5) // 15 min of 600
    expect(lowestHrTimePct({ ...period, heart_rate: null })).toBeNull()
    expect(lowestHrTimePct({ ...period, heart_rate: { ...period.heart_rate, items: [null, null] } })).toBeNull()
  })

  it('maps deep sleep minutes and lowest-HR timing for the wake date', () => {
    const m = mapOuraForDate('2026-10-25', [period], [])
    expect(m.deep_sleep_min).toBe(81)
    expect(m.lowest_hr_time_pct).toBe(2.5)
    expect(m.bedtime).toBe('21:30')
    expect(m.wake_time).toBe('06:30')
  })
})
