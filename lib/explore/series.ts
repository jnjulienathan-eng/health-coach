// Explore tab — raw daily series for each chart variable.
// Pure module: no Supabase calls. lib/explore/fetch.ts loads the data and
// feeds it in here.
//
// Every series is keyed by CHART date (YYYY-MM-DD), i.e. already shifted:
// training_stress and last_meal for day D are plotted on D+1, because they
// act on that night's sleep/recovery which is recorded on the wake date.

import type { DailyEntry } from '../types'
import { computeTrainingLoadHistory } from '../trainingLoad'
import { dayKeyFromTimestamp, berlinParts } from '../nutrition'

export const EXPLORE_VARIABLES = [
  'hrv',
  'rhr',
  'sleep_duration',
  'bedtime',
  'training_stress',
  'load_ratio',
  'last_meal',
] as const
export type ExploreVariable = typeof EXPLORE_VARIABLES[number]

// Oura-sourced variables: baseline values only count from OURA_START_DATE,
// and chart dates before it get no z-score (pre-Oura values were manual).
export const OURA_VARIABLES: readonly ExploreVariable[] = ['hrv', 'rhr', 'sleep_duration', 'bedtime']

// Variables whose day-D value is plotted on D+1.
export const SHIFTED_VARIABLES: readonly ExploreVariable[] = ['training_stress', 'last_meal']

export type ExploreSeries = Record<ExploreVariable, Record<string, number>>

// 05:00 Berlin — matches DAY_START_HOUR in lib/nutrition.ts.
const DAY_START_MINUTES = 5 * 60

// ─── Date helpers ─────────────────────────────────────────────────
export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split('T')[0]
}

// ─── bedtimeToMinutes ─────────────────────────────────────────────
// "HH:MM" → minutes since midnight shifted −720 mod 1440 (noon-centred),
// same convention as getBedtimeRolling30DayAvg() in lib/db.ts, so 23:30
// (690) sorts before 00:15 (735).
export function bedtimeToMinutes(bedtime: string): number | null {
  const [h, m] = bedtime.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return ((h * 60 + m) - 720 + 1440) % 1440
}

// ─── lastMealToMinutes ────────────────────────────────────────────
// ISO timestamp → minutes after 05:00 Berlin of its app day
// (21:00 → 960, 00:30 → 1170).
export function lastMealToMinutes(isoTs: string): number {
  const p = berlinParts(new Date(isoTs))
  return ((p.h * 60 + p.mi) - DAY_START_MINUTES + 1440) % 1440
}

// ─── Display helpers (inverse of the encodings above) ─────────────
function hhmm(minutesSinceMidnight: number): string {
  const m = ((Math.round(minutesSinceMidnight) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// Noon-centred bedtime minutes → "HH:MM".
export function bedtimeMinutesToHHMM(mins: number): string {
  return hhmm(mins + 720)
}

// Minutes after 05:00 Berlin → Berlin wall-clock "HH:MM".
export function lastMealMinutesToHHMM(mins: number): string {
  return hhmm(mins + DAY_START_MINUTES)
}

// ─── buildExploreSeries ───────────────────────────────────────────
// entries: full daily_entries history (sessions attached) — load_ratio's
//   EWMA needs all of it to be correct.
// mealLoggedAts: meal_logs.logged_at timestamps (all logged_via types,
//   photo estimates included).
export function buildExploreSeries(entries: DailyEntry[], mealLoggedAts: string[]): ExploreSeries {
  const series = Object.fromEntries(EXPLORE_VARIABLES.map(v => [v, {}])) as ExploreSeries

  for (const e of entries) {
    if (e.sleep.hrv != null)          series.hrv[e.date] = e.sleep.hrv
    if (e.sleep.rhr != null)          series.rhr[e.date] = e.sleep.rhr
    if (e.sleep.duration_min != null) series.sleep_duration[e.date] = e.sleep.duration_min
    if (e.sleep.bedtime != null) {
      const mins = bedtimeToMinutes(e.sleep.bedtime)
      if (mins != null) series.bedtime[e.date] = mins
    }
  }

  // History is gap-filled from the first to last entry date (missing days =
  // 0 TSU), the same convention the EWMA uses. tsu there is computeDailyTSU().
  for (const h of computeTrainingLoadHistory(entries)) {
    series.training_stress[addDays(h.date, 1)] = h.tsu
    if (h.ratio != null) series.load_ratio[h.date] = h.ratio
  }

  const latestByDay: Record<string, { ms: number; ts: string }> = {}
  for (const ts of mealLoggedAts) {
    const ms = new Date(ts).getTime()
    if (Number.isNaN(ms)) continue
    const day = dayKeyFromTimestamp(ts)
    if (!latestByDay[day] || ms > latestByDay[day].ms) latestByDay[day] = { ms, ts }
  }
  for (const [day, { ts }] of Object.entries(latestByDay)) {
    series.last_meal[addDays(day, 1)] = lastMealToMinutes(ts)
  }

  return series
}

// ─── computeInjectionInfo ─────────────────────────────────────────
// GLP-1 injection markers. Not a chart variable. daysSinceInjection is
// days since the most recent injection on or before the date (0 on the
// injection day), null if none in the preceding GLP1_LOOKBACK_DAYS.
export const GLP1_LOOKBACK_DAYS = 14

export function computeInjectionInfo(chartDates: string[], injectionDates: string[]): {
  injectionDatesInWindow: string[]
  daysSinceInjection: Record<string, number | null>
} {
  const sorted = [...new Set(injectionDates)].sort()
  const first = chartDates[0]
  const last = chartDates[chartDates.length - 1]
  const injectionDatesInWindow = chartDates.length === 0
    ? []
    : sorted.filter(d => d >= first && d <= last)

  const daysSinceInjection: Record<string, number | null> = {}
  for (const date of chartDates) {
    let latest: string | null = null
    for (const d of sorted) {
      if (d > date) break
      latest = d
    }
    if (latest == null) { daysSinceInjection[date] = null; continue }
    const days = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(latest + 'T00:00:00Z')) / 86_400_000)
    daysSinceInjection[date] = days <= GLP1_LOOKBACK_DAYS ? days : null
  }
  return { injectionDatesInWindow, daysSinceInjection }
}
