import { describe, it, expect } from 'vitest'
import { emptyEntry, type DailyEntry } from '../types'
import {
  EXPLORE_VARIABLES, addDays, bedtimeToMinutes, lastMealToMinutes, buildExploreSeries,
  computeInjectionInfo, bedtimeMinutesToHHMM, lastMealMinutesToHHMM, type ExploreSeries,
} from './series'
import { robustZ, normaliseExplore, MAD_SCALE, MEAN_AD_SCALE, BASELINE_WINDOW_DAYS, BASELINE_MIN_VALUES } from './normalise'
import { computeHighlights, OUTLIER_Z, COINCIDENCE_Z } from './highlights'
import { rollingAverage, findStretches } from './trends'

function emptySeries(): ExploreSeries {
  return Object.fromEntries(EXPLORE_VARIABLES.map(v => [v, {}])) as ExploreSeries
}

function entryWithSession(date: string, duration: number, z3: number): DailyEntry {
  const e = emptyEntry(date)
  e.training.sessions = [{ id: date, activity_type: 'run', duration_min: duration, zone3_plus_minutes: z3, active_calories: null }]
  return e
}

// Fills `days` days before `date` with values from `valueFor(i)` (i = 1..days).
function fillBefore(s: Record<string, number>, date: string, days: number, valueFor: (i: number) => number) {
  for (let i = 1; i <= days; i++) s[addDays(date, -i)] = valueFor(i)
}

describe('variable encoding', () => {
  it('bedtime is noon-centred so times either side of midnight compare correctly', () => {
    expect(bedtimeToMinutes('21:45')).toBe(585)
    expect(bedtimeToMinutes('23:30')).toBe(690)
    expect(bedtimeToMinutes('00:15')).toBe(735)
    expect(bedtimeToMinutes('00:15')!).toBeGreaterThan(bedtimeToMinutes('23:30')!)
  })

  it('last meal is minutes after 05:00 Berlin, wrapping past midnight', () => {
    expect(lastMealToMinutes('2026-07-10T19:00:00Z')).toBe(960)  // 21:00 CEST
    expect(lastMealToMinutes('2026-07-10T22:30:00Z')).toBe(1170) // 00:30 CEST
    expect(lastMealToMinutes('2026-12-10T20:00:00Z')).toBe(960)  // 21:00 CET
  })

  it('formats encoded minutes back to Berlin HH:MM', () => {
    expect(bedtimeMinutesToHHMM(690)).toBe('23:30')
    expect(bedtimeMinutesToHHMM(735)).toBe('00:15')
    expect(lastMealMinutesToHHMM(960)).toBe('21:00')
    expect(lastMealMinutesToHHMM(1170)).toBe('00:30')
  })
})

describe('buildExploreSeries', () => {
  it('shifts training_stress to D+1 and leaves load_ratio unshifted', () => {
    const s = buildExploreSeries([entryWithSession('2026-07-10', 60, 10)], [])
    expect(s.training_stress['2026-07-11']).toBe(50) // 60×0.5 + 10×2
    expect(s.training_stress['2026-07-10']).toBeUndefined()
    expect(s.load_ratio['2026-07-10']).toBeCloseTo(4) // first day: (50/7)/(50/28)
    expect(s.load_ratio['2026-07-11']).toBeUndefined()
  })

  it('fills rest days inside the entry range with 0 TSU', () => {
    const s = buildExploreSeries([entryWithSession('2026-07-10', 60, 0), emptyEntry('2026-07-12')], [])
    expect(s.training_stress['2026-07-12']).toBe(0) // 07-11 had no entry
    expect(s.training_stress['2026-07-13']).toBe(0)
  })

  it('takes the latest meal per app day, including after midnight, and shifts to D+1', () => {
    const s = buildExploreSeries([], [
      '2026-07-10T10:00:00Z',
      '2026-07-10T22:30:00Z', // 00:30 on 07-11 → app day 07-10
      '2026-07-10T19:00:00Z',
      '2026-07-11T17:00:00Z', // 19:00 → app day 07-11
    ])
    expect(s.last_meal['2026-07-11']).toBe(1170)
    expect(s.last_meal['2026-07-12']).toBe(840)
    expect(s.last_meal['2026-07-10']).toBeUndefined()
  })

  it('reads sleep fields from the wake date with no shift', () => {
    const e = emptyEntry('2026-10-01')
    e.sleep.hrv = 40; e.sleep.rhr = 50; e.sleep.duration_min = 450; e.sleep.bedtime = '22:10'; e.sleep.nap_minutes = 30
    const s = buildExploreSeries([e], [])
    expect(s.hrv['2026-10-01']).toBe(40)
    expect(s.rhr['2026-10-01']).toBe(50)
    expect(s.sleep_duration['2026-10-01']).toBe(450)
    expect(s.bedtime['2026-10-01']).toBe(610)
  })
})

describe('robustZ', () => {
  it('uses 1.4826 × MAD when MAD > 0', () => {
    const baseline = [1, 2, 3, 4, 5] // median 3, MAD 1
    expect(robustZ(6, baseline)).toBeCloseTo(3 / MAD_SCALE)
  })

  it('falls back to 1.2533 × mean absolute deviation when MAD is 0', () => {
    const baseline = [...Array(15).fill(10), ...Array(5).fill(20)] // median 10, MAD 0, meanAD 2.5
    expect(robustZ(15, baseline)).toBeCloseTo(5 / (MEAN_AD_SCALE * 2.5))
  })

  it('returns null when both deviations are 0', () => {
    expect(robustZ(15, Array(20).fill(10))).toBeNull()
  })
})

describe('normaliseExplore', () => {
  const date = '2026-10-25'

  it('needs at least 20 baseline values in the 28 prior days', () => {
    const s = emptySeries()
    fillBefore(s.training_stress, date, BASELINE_MIN_VALUES - 1, i => i)
    s.training_stress[date] = 100
    expect(normaliseExplore([date], s, new Set())[0].z.training_stress).toBeNull()

    s.training_stress[addDays(date, -BASELINE_MIN_VALUES)] = 5
    expect(normaliseExplore([date], s, new Set())[0].z.training_stress).not.toBeNull()
  })

  it('ignores values outside the 28-day window and the date itself', () => {
    const s = emptySeries()
    fillBefore(s.training_stress, date, 40, i => i)
    s.training_stress[date] = 100
    const z = normaliseExplore([date], s, new Set())[0].z.training_stress
    const window = Array.from({ length: BASELINE_WINDOW_DAYS }, (_, k) => k + 1)
    expect(z).toBeCloseTo(robustZ(100, window)!)
  })

  it('applies the Oura cutoff to hrv and rhr only — not sleep_duration, bedtime or others', () => {
    const s = emptySeries()
    // 2026-10-05: window 09-07..10-04 — only 18 days on/after 2026-09-17.
    const d = '2026-10-05'
    const cutoff = ['hrv', 'rhr'] as const
    const fullHistory = ['sleep_duration', 'bedtime', 'training_stress'] as const
    for (const v of [...cutoff, ...fullHistory]) {
      fillBefore(s[v], d, 28, i => 40 + (i % 5))
      s[v][d] = 60
    }
    const p = normaliseExplore([d], s, new Set())[0]
    for (const v of cutoff) {
      expect(p.z[v]).toBeNull()
      expect(p.values[v]).toBe(60)
    }
    for (const v of fullHistory) expect(p.z[v]).not.toBeNull()

    // A pre-Oura chart date: hrv / rhr keep their value but get no z-score;
    // sleep_duration and bedtime get one from their pre-Oura history.
    const pre = '2026-09-16'
    for (const v of ['hrv', 'rhr', 'sleep_duration', 'bedtime'] as const) {
      fillBefore(s[v], pre, 28, i => 50 + (i % 3))
      s[v][pre] = 55
    }
    const q = normaliseExplore([pre], s, new Set())[0]
    for (const v of cutoff) {
      expect(q.values[v]).toBe(55)
      expect(q.z[v]).toBeNull()
    }
    expect(q.z.sleep_duration).not.toBeNull()
    expect(q.z.bedtime).not.toBeNull()
  })

  it('draws sick chart dates but leaves them out of later baselines', () => {
    const s = emptySeries()
    fillBefore(s.hrv, date, 28, i => 40 + (i % 5))
    s.hrv[date] = 60
    const healthy = normaliseExplore([date], s, new Set())[0]

    // The sick date itself keeps its value and z-score.
    const sickChart = normaliseExplore([date], s, new Set([date]))[0]
    expect(sickChart.isSick).toBe(true)
    expect(sickChart.values.hrv).toBe(60)
    expect(sickChart.z.hrv).toBeCloseTo(healthy.z.hrv!)

    // The next day's baseline skips the sick date: 19 healthy days + the
    // sick day would be 20 values (enough for a z) only if it counted.
    const s2 = emptySeries()
    fillBefore(s2.hrv, date, 19, i => 40 + (i % 5))
    s2.hrv[date] = 60
    const next = addDays(date, 1)
    s2.hrv[next] = 45
    expect(normaliseExplore([next], s2, new Set())[0].z.hrv).not.toBeNull()
    expect(normaliseExplore([next], s2, new Set([date]))[0].z.hrv).toBeNull()

    // 9 sick baseline days → 19 values left → no z.
    const sick = new Set(Array.from({ length: 9 }, (_, k) => addDays(date, -(k + 1))))
    expect(normaliseExplore([date], s, sick)[0].z.hrv).toBeNull()
  })
})

describe('computeHighlights', () => {
  const points = [
    { date: '2026-10-01', z: { hrv: 2.8, rhr: -0.5, bedtime: null } },
    { date: '2026-10-02', z: { hrv: -1.7, rhr: 1.6, bedtime: 0.2 } },
    { date: '2026-10-03', z: { hrv: 0.1, rhr: -2.6, bedtime: -1.8 } },
  ]

  it('flags outliers above |z| 2.5 and coincidences of 2+ variables above |z| 1.5', () => {
    const h = computeHighlights(points, ['hrv', 'rhr', 'bedtime'])
    expect(h.outliers.map(o => [o.date, o.variable])).toEqual([['2026-10-01', 'hrv'], ['2026-10-03', 'rhr']])
    expect(h.coincidences.map(c => c.date)).toEqual(['2026-10-02', '2026-10-03'])
    expect(h.coincidences[1].variables.map(v => v.variable)).toEqual(['rhr', 'bedtime'])
    expect(h.outlierCount).toBe(2)
    expect(h.coincidenceCount).toBe(2)
  })

  it('outlier boundary: |z| 2.5 is not an outlier, just above it is', () => {
    expect(OUTLIER_Z).toBe(2.5)
    const h = computeHighlights([
      { date: '2026-10-01', z: { hrv: 2.5 } },
      { date: '2026-10-02', z: { hrv: -2.5 } },
      { date: '2026-10-03', z: { hrv: 2.51 } },
      { date: '2026-10-04', z: { hrv: -2.51 } },
    ], ['hrv'])
    expect(h.outliers.map(o => o.date)).toEqual(['2026-10-03', '2026-10-04'])
  })

  it('coincidence boundary: two variables at |z| 1.5 do not count, just above does', () => {
    expect(COINCIDENCE_Z).toBe(1.5)
    const h = computeHighlights([
      { date: '2026-10-01', z: { hrv: 1.5, rhr: -1.5 } },
      { date: '2026-10-02', z: { hrv: 1.51, rhr: -1.51 } },
      { date: '2026-10-03', z: { hrv: 1.51, rhr: 1.5 } },
    ], ['hrv', 'rhr'])
    expect(h.coincidences.map(c => c.date)).toEqual(['2026-10-02'])
  })

  it('only looks at selected variables', () => {
    const h = computeHighlights(points, ['hrv'])
    expect(h.outlierCount).toBe(1)
    expect(h.coincidenceCount).toBe(0)
  })

  it('requires 1–3 selected variables', () => {
    expect(() => computeHighlights(points, [])).toThrow(RangeError)
    expect(() => computeHighlights(points, ['hrv', 'rhr', 'bedtime', 'last_meal'])).toThrow(RangeError)
  })
})

describe('rollingAverage', () => {
  it('averages a centred 7-day window', () => {
    const vals = Array.from({ length: 11 }, (_, i) => i)
    expect(rollingAverage(vals)[5]).toBe(5)  // mean of 2..8
    const spike = [0, 0, 0, 7, 0, 0, 0, 0, 0, 0]
    expect(rollingAverage(spike)[0]).toBeCloseTo(7 / 4)  // window 0..3
    expect(rollingAverage(spike)[6]).toBeCloseTo(7 / 7)  // window 3..9
    expect(rollingAverage(spike)[7]).toBe(0)             // window 4..9 — spike out of range
  })

  it('skips nulls', () => {
    expect(rollingAverage([1, null, 3, null, 5, null, 7])[3]).toBe(4)
  })

  it('needs at least 4 values in the window', () => {
    expect(rollingAverage([1, null, 3, null, 5, null, null])[3]).toBeNull()  // 3 values
    expect(rollingAverage([1, null, 3, null, 5, null, 7])[3]).not.toBeNull() // 4 values
  })

  it('uses the partial window at the edges with the same minimum', () => {
    const vals = [1, 2, 3, 4, 5, 6, 7, 8]
    const avg = rollingAverage(vals)
    expect(avg[0]).toBeCloseTo(2.5)  // 1..4
    expect(avg[7]).toBeCloseTo(6.5)  // 5..8
    expect(rollingAverage([1, 2, null, 4, 5, 6, 7])[0]).toBeNull() // only 3 in 0..3
  })
})

describe('findStretches', () => {
  const dates = Array.from({ length: 10 }, (_, i) => addDays('2026-10-01', i))
  const flat = (v: number) => Array(10).fill(v)
  const at = (on: number[], high: number, low = 0) => dates.map((_, i) => (on.includes(i) ? high : low))

  it('flags only beyond ±0.8, in either direction', () => {
    expect(findStretches(dates, { hrv: flat(0.8), rhr: flat(-0.8) }, ['hrv', 'rhr'])).toEqual([])
    expect(findStretches(dates, { hrv: flat(0.81), rhr: flat(-0.81) }, ['hrv', 'rhr']))
      .toEqual([{ start: dates[0], end: dates[9] }])
  })

  it('needs at least 3 consecutive flagged days', () => {
    expect(findStretches(dates, { hrv: at([2, 3], 1), rhr: at([2, 3], -1) }, ['hrv', 'rhr'])).toEqual([])
    expect(findStretches(dates, { hrv: at([2, 3, 4], 1), rhr: at([2, 3, 4], -1) }, ['hrv', 'rhr']))
      .toEqual([{ start: dates[2], end: dates[4] }])
  })

  it('splits a run broken by one unflagged day', () => {
    const on = [0, 1, 2, 4, 5, 6]
    expect(findStretches(dates, { hrv: at(on, 1), rhr: at(on, 1) }, ['hrv', 'rhr']))
      .toEqual([{ start: dates[0], end: dates[2] }, { start: dates[4], end: dates[6] }])
  })

  it('needs two of the selected variables, and nulls never count', () => {
    const h = at([1, 2, 3], 1)
    expect(findStretches(dates, { hrv: h, rhr: h.map(() => null), bedtime: h }, ['hrv', 'rhr'])).toEqual([])
    expect(findStretches(dates, { hrv: h, rhr: flat(0), bedtime: h }, ['hrv', 'rhr', 'bedtime']))
      .toEqual([{ start: dates[1], end: dates[3] }])
  })

  it('returns none with one variable selected', () => {
    expect(findStretches(dates, { hrv: flat(2) }, ['hrv'])).toEqual([])
  })
})

describe('computeInjectionInfo', () => {
  it('lists injections in the window and counts days since, up to 14', () => {
    const chart = ['2026-10-01', '2026-10-02', '2026-10-16', '2026-10-17']
    const { injectionDatesInWindow, daysSinceInjection } = computeInjectionInfo(chart, ['2026-09-20', '2026-10-02'])
    expect(injectionDatesInWindow).toEqual(['2026-10-02'])
    expect(daysSinceInjection['2026-10-01']).toBe(11)
    expect(daysSinceInjection['2026-10-02']).toBe(0)
    expect(daysSinceInjection['2026-10-16']).toBe(14)
    expect(daysSinceInjection['2026-10-17']).toBeNull()
  })
})
