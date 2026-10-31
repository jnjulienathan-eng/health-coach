// Explore — Late eating view: food load in the 3 hours before Oura bedtime
// against that night's outcomes. Pure and client-safe (the group summary
// runs in the browser for the current filter). lib/explore/fetch.ts →
// loadLateEatingData() loads the inputs; GET /api/explore/late-eating
// serves the result. See BODYCIPHER.md → EXPLORE → Late eating.
//
// Each night is keyed by its wake date. A night is left out (with a
// reason) rather than estimated when its Oura sleep, meals or CGM are
// missing, or when it's a sick day.

import type { DailyEntry } from '../types'
import { dayKeyFromTimestamp } from '../nutrition'
import { berlinWallClockToUtc } from '../berlinTime'
import { addDays, bedtimeToMinutes, nightBedtime, lateWindowLoad, mealDays, type MealLoad } from './series'

export const BEDTIME_MEDIAN_NIGHTS = 14   // usual bedtime = median of the previous 14 nights
export const BEDTIME_MEDIAN_MIN = 7       // …needing at least 7 of them
export const CGM_SLOT_MINUTES = 15        // coverage = share of 15-minute slots with a reading
export const CGM_MIN_COVERAGE = 0.7
export const WAKING_MATCH_MINUTES = 120   // same cap as getNearestCgmReading()
export const WEIGHT_LOOKBACK_DAYS = 3     // weight change vs the latest reading up to 3 days before
export const LOW_KCAL = 200               // group "under 200 kcal"
export const HIGH_KCAL = 500              // group "over 500 kcal"
export const MIN_GROUP_NIGHTS = 8         // fewer nights than this → too few to compare

export const LATE_OUTCOMES = [
  'lowest_hr', 'lowest_hr_timing', 'hrv', 'deep_sleep',
  'sleep_glucose_mean', 'sleep_glucose_peak', 'waking_glucose', 'weight_change',
] as const
export type LateOutcome = typeof LATE_OUTCOMES[number]

export type LateExclusion = 'oura' | 'meals' | 'cgm' | 'sick'

export interface LateEatingNight {
  wakeDate: string
  bedtime: string                 // Berlin "HH:MM" (Oura)
  bedtimeDevMin: number | null    // minutes later (+) or earlier (−) than usual; null without 7 prior nights
  lateKcal: number
  lateCarbs: number
  trained: boolean                // a training session on the evening's app day
  outcomes: Record<LateOutcome, number | null>
}

export interface LateEatingData {
  from: string
  to: string
  nights: LateEatingNight[]
  excluded: { wakeDate: string; reason: LateExclusion }[]
}

export interface CgmPoint { at: string; mmol: number }

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const round1 = (x: number) => Math.round(x * 10) / 10

// ─── bedtimeDeviation ─────────────────────────────────────────────
// Bedtime minus the median bedtime of the previous BEDTIME_MEDIAN_NIGHTS
// wake dates, in minutes, on the noon-centred scale so 23:30 vs 00:15 is
// 45 minutes, not −1395.
export function bedtimeDeviation(wakeDate: string, bedtimeByDate: Record<string, string>): number | null {
  const today = bedtimeByDate[wakeDate] != null ? bedtimeToMinutes(bedtimeByDate[wakeDate]) : null
  if (today == null) return null
  const prior: number[] = []
  for (let i = 1; i <= BEDTIME_MEDIAN_NIGHTS; i++) {
    const b = bedtimeByDate[addDays(wakeDate, -i)]
    const m = b != null ? bedtimeToMinutes(b) : null
    if (m != null) prior.push(m)
  }
  if (prior.length < BEDTIME_MEDIAN_MIN) return null
  return Math.round(today - median(prior))
}

// ─── sleepGlucose ─────────────────────────────────────────────────
// Mean and peak of readings in [start, end], and coverage: the share of
// 15-minute slots across the window that hold at least one reading.
export function sleepGlucose(readings: { ms: number; mmol: number }[], startMs: number, endMs: number): {
  mean: number | null; peak: number | null; coverage: number
} {
  const slotMs = CGM_SLOT_MINUTES * 60_000
  const slots = Math.max(1, Math.ceil((endMs - startMs) / slotMs))
  const filled = new Set<number>()
  let sum = 0, n = 0, peak = -Infinity
  for (const r of readings) {
    if (r.ms < startMs || r.ms > endMs) continue
    filled.add(Math.min(slots - 1, Math.floor((r.ms - startMs) / slotMs)))
    sum += r.mmol; n++
    if (r.mmol > peak) peak = r.mmol
  }
  return { mean: n ? round1(sum / n) : null, peak: n ? round1(peak) : null, coverage: filled.size / slots }
}

// Reading nearest the wake instant, within WAKING_MATCH_MINUTES.
export function wakingGlucose(readings: { ms: number; mmol: number }[], wakeMs: number): number | null {
  let best: { d: number; mmol: number } | null = null
  for (const r of readings) {
    const d = Math.abs(r.ms - wakeMs)
    if (!best || d < best.d) best = { d, mmol: r.mmol }
  }
  return best && best.d <= WAKING_MATCH_MINUTES * 60_000 ? round1(best.mmol) : null
}

// Weight on wakeDate minus the latest reading in the WEIGHT_LOOKBACK_DAYS before.
export function weightChange(wakeDate: string, weightByDate: Record<string, number>): number | null {
  const w = weightByDate[wakeDate]
  if (w == null) return null
  for (let i = 1; i <= WEIGHT_LOOKBACK_DAYS; i++) {
    const prev = weightByDate[addDays(wakeDate, -i)]
    if (prev != null) return round1(w - prev)
  }
  return null
}

// ─── buildLateEatingNights ────────────────────────────────────────
// entries: daily_entries with sessions (any order; the prior 14 nights'
//   bedtimes are needed for the deviation). meals: from the evening before
//   `from`. cgm: LibreView readings covering the nights. weightByDate:
//   morning weight (kg) by date. Nights with wake date in [from, to].
export function buildLateEatingNights(input: {
  entries: DailyEntry[]
  meals: MealLoad[]
  cgm: CgmPoint[]
  weightByDate: Record<string, number>
  from: string
  to: string
}): LateEatingData {
  const { entries, meals, weightByDate, from, to } = input
  const byDate = new Map(entries.map(e => [e.date, e]))
  const bedtimeByDate: Record<string, string> = {}
  for (const e of entries) if (e.sleep.bedtime) bedtimeByDate[e.date] = e.sleep.bedtime
  const loggedDays = mealDays(meals)
  const cgm = input.cgm
    .map(r => ({ ms: Date.parse(r.at), mmol: Number(r.mmol) }))
    .filter(r => !Number.isNaN(r.ms) && Number.isFinite(r.mmol))
    .sort((a, b) => a.ms - b.ms)

  const nights: LateEatingNight[] = []
  const excluded: LateEatingData['excluded'] = []

  for (const e of [...entries].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const date = e.date
    if (date < from || date > to) continue
    const s = e.sleep
    const bed = s.bedtime ? nightBedtime(date, s.bedtime) : null
    const wake = s.wake_time ? berlinWallClockToUtc(date, s.wake_time.slice(0, 5)) : null
    if (!bed || !wake || wake <= bed || s.hrv == null || s.rhr == null) {
      excluded.push({ wakeDate: date, reason: 'oura' })
      continue
    }
    if (e.context.is_sick === true) {
      excluded.push({ wakeDate: date, reason: 'sick' })
      continue
    }
    const load = lateWindowLoad(meals, bed, loggedDays)
    if (!load) {
      excluded.push({ wakeDate: date, reason: 'meals' })
      continue
    }
    const glucose = sleepGlucose(cgm, bed.getTime(), wake.getTime())
    if (glucose.coverage < CGM_MIN_COVERAGE) {
      excluded.push({ wakeDate: date, reason: 'cgm' })
      continue
    }

    const eveningDay = dayKeyFromTimestamp(bed.toISOString())
    nights.push({
      wakeDate: date,
      bedtime: s.bedtime!.slice(0, 5),
      bedtimeDevMin: bedtimeDeviation(date, bedtimeByDate),
      lateKcal: Math.round(load.kcal),
      lateCarbs: Math.round(load.carbs),
      trained: (byDate.get(eveningDay)?.training.sessions.length ?? 0) > 0,
      outcomes: {
        lowest_hr: s.rhr,
        lowest_hr_timing: s.lowest_hr_time_pct,
        hrv: s.hrv,
        deep_sleep: s.deep_sleep_min,
        sleep_glucose_mean: glucose.mean,
        sleep_glucose_peak: glucose.peak,
        waking_glucose: wakingGlucose(cgm, wake.getTime()),
        weight_change: weightChange(date, weightByDate),
      },
    })
  }
  return { from, to, nights, excluded }
}

// ─── groupSummary ─────────────────────────────────────────────────
// n, median and quartiles (linear interpolation) of one group's values.
export interface GroupSummary { n: number; median: number | null; q1: number | null; q3: number | null }

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function groupSummary(values: number[]): GroupSummary {
  if (values.length === 0) return { n: 0, median: null, q1: null, q3: null }
  const s = [...values].sort((a, b) => a - b)
  return { n: s.length, median: quantile(s, 0.5), q1: quantile(s, 0.25), q3: quantile(s, 0.75) }
}

// Which comparison group a night's late load falls in (by kcal).
export function kcalGroup(kcal: number): 'low' | 'high' | null {
  if (kcal < LOW_KCAL) return 'low'
  if (kcal > HIGH_KCAL) return 'high'
  return null
}
