// Explore tab — raw daily series for each chart variable.
// Pure module: no Supabase calls. lib/explore/fetch.ts loads the data and
// feeds it in here.
//
// Every series is keyed by CHART date (YYYY-MM-DD), i.e. already shifted:
// training_stress for day D is plotted on D+1, because it acts on that
// night's sleep/recovery which is recorded on the wake date. late_kcal is
// computed per night and keyed by that night's wake date directly.

import type { DailyEntry } from '../types'
import { computeTrainingLoadHistory } from '../trainingLoad'
import { dayKeyFromTimestamp } from '../nutrition'
import { berlinWallClockToUtc } from '../berlinTime'

export const EXPLORE_VARIABLES = [
  'hrv',
  'rhr',
  'sleep_duration',
  'bedtime',
  'training_stress',
  'load_ratio',
  'late_kcal',
] as const
export type ExploreVariable = typeof EXPLORE_VARIABLES[number]

// Variables with the Oura cutoff: baseline values only count from
// OURA_START_DATE, and chart dates before it get no z-score, because the
// pre-Oura manual waking HRV / RHR aren't comparable with Oura's overnight
// measures. sleep_duration and bedtime are NOT here: Julie confirmed her
// pre-Oura values are accurate and consistent with Oura's, so they use their
// full history like the other variables.
export const OURA_VARIABLES: readonly ExploreVariable[] = ['hrv', 'rhr']

// Variables whose day-D value is plotted on D+1.
export const SHIFTED_VARIABLES: readonly ExploreVariable[] = ['training_stress']

export type ExploreSeries = Record<ExploreVariable, Record<string, number>>

// Late-eating window: food logged in the LATE_WINDOW_HOURS before bedtime.
export const LATE_WINDOW_HOURS = 3

// One logged meal reduced to what the late-eating measures need.
export interface MealLoad { loggedAt: string; kcal: number; carbs: number }

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

// ─── nightBedtime ─────────────────────────────────────────────────
// The bedtime instant of the night that ends on wakeDate. daily_entries
// stores bedtime as Berlin "HH:MM" on the wake-date row: 12:00 or later is
// the evening before, earlier is after midnight on the wake date.
export function nightBedtime(wakeDate: string, bedtime: string): Date | null {
  const h = Number(bedtime.split(':')[0])
  if (!Number.isFinite(h)) return null
  return berlinWallClockToUtc(h >= 12 ? addDays(wakeDate, -1) : wakeDate, bedtime.slice(0, 5))
}

// ─── mealDays / lateWindowLoad ────────────────────────────────────
// App days (05:00 Berlin boundary) with at least one meal logged.
export function mealDays(meals: MealLoad[]): Set<string> {
  return new Set(meals.filter(m => !Number.isNaN(Date.parse(m.loggedAt))).map(m => dayKeyFromTimestamp(m.loggedAt)))
}

// kcal and carbs of meals logged in [bedtime − LATE_WINDOW_HOURS, bedtime).
// null when the app day the night belongs to has no meals logged at all
// (not in loggedDays, from mealDays()) — a missing day, not a 0 kcal evening.
export function lateWindowLoad(meals: MealLoad[], bedtime: Date, loggedDays: Set<string>): { kcal: number; carbs: number } | null {
  if (!loggedDays.has(dayKeyFromTimestamp(bedtime.toISOString()))) return null
  const bedMs = bedtime.getTime()
  const fromMs = bedMs - LATE_WINDOW_HOURS * 3_600_000
  let kcal = 0, carbs = 0
  for (const m of meals) {
    const ms = Date.parse(m.loggedAt)
    if (ms >= fromMs && ms < bedMs) { kcal += m.kcal; carbs += m.carbs }
  }
  return { kcal, carbs }
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

// ─── buildExploreSeries ───────────────────────────────────────────
// entries: full daily_entries history (sessions attached) — load_ratio's
//   EWMA needs all of it to be correct.
// meals: meal_logs with their kcal and carbs (all logged_via types, photo
//   estimates included).
export function buildExploreSeries(entries: DailyEntry[], meals: MealLoad[]): ExploreSeries {
  const series = Object.fromEntries(EXPLORE_VARIABLES.map(v => [v, {}])) as ExploreSeries
  const loggedDays = mealDays(meals)

  for (const e of entries) {
    if (e.sleep.hrv != null)          series.hrv[e.date] = e.sleep.hrv
    if (e.sleep.rhr != null)          series.rhr[e.date] = e.sleep.rhr
    if (e.sleep.duration_min != null) series.sleep_duration[e.date] = e.sleep.duration_min
    if (e.sleep.bedtime != null) {
      const mins = bedtimeToMinutes(e.sleep.bedtime)
      if (mins != null) series.bedtime[e.date] = mins
      const bed = nightBedtime(e.date, e.sleep.bedtime)
      const load = bed && lateWindowLoad(meals, bed, loggedDays)
      if (load) series.late_kcal[e.date] = Math.round(load.kcal)
    }
  }

  // History is gap-filled from the first to last entry date (missing days =
  // 0 TSU), the same convention the EWMA uses. tsu there is computeDailyTSU().
  for (const h of computeTrainingLoadHistory(entries)) {
    series.training_stress[addDays(h.date, 1)] = h.tsu
    if (h.ratio != null) series.load_ratio[h.date] = h.ratio
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
