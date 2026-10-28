// Explore tab — robust z-scores per variable per chart date.
// Pure module: no Supabase calls.

import { OURA_START_DATE } from '../types'
import { EXPLORE_VARIABLES, OURA_VARIABLES, addDays, type ExploreSeries, type ExploreVariable } from './series'

// Baseline = the BASELINE_WINDOW_DAYS calendar days before the chart date
// (date itself excluded). A z-score needs at least BASELINE_MIN_VALUES of them.
export const BASELINE_WINDOW_DAYS = 28
export const BASELINE_MIN_VALUES = 20

// Scale factors that make MAD / mean absolute deviation consistent with
// a standard deviation for normally distributed data.
export const MAD_SCALE = 1.4826
export const MEAN_AD_SCALE = 1.2533

export interface ExploreDatePoint {
  date: string
  isSick: boolean
  values: Record<ExploreVariable, number | null>
  z: Record<ExploreVariable, number | null>
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// ─── robustZ ──────────────────────────────────────────────────────
// z = (value − median) / (1.4826 × MAD). If MAD is 0, the scale falls back
// to 1.2533 × mean absolute deviation from the median. If that is also 0,
// z is null.
export function robustZ(value: number, baseline: number[]): number | null {
  const med = median(baseline)
  const absDev = baseline.map(x => Math.abs(x - med))
  const mad = median(absDev)
  if (mad > 0) return (value - med) / (MAD_SCALE * mad)
  const meanAd = absDev.reduce((a, b) => a + b, 0) / absDev.length
  if (meanAd > 0) return (value - med) / (MEAN_AD_SCALE * meanAd)
  return null
}

// ─── normaliseExplore ─────────────────────────────────────────────
// series: shifted series from buildExploreSeries (full history).
// sickDates: daily_entries dates with is_sick = true. Sick chart dates keep
// their values and z-scores (drawn like any other day, flagged via isSick),
// but sick dates never count toward a baseline, so illness doesn't shift
// "usual".
export function normaliseExplore(
  chartDates: string[],
  series: ExploreSeries,
  sickDates: Set<string>,
): ExploreDatePoint[] {
  return chartDates.map(date => {
    const isSick = sickDates.has(date)
    const values = {} as Record<ExploreVariable, number | null>
    const z = {} as Record<ExploreVariable, number | null>

    for (const v of EXPLORE_VARIABLES) {
      const value = series[v][date] ?? null
      values[v] = value
      z[v] = null
      if (value == null) continue

      const ouraOnly = OURA_VARIABLES.includes(v)
      if (ouraOnly && date < OURA_START_DATE) continue

      const baseline: number[] = []
      for (let i = 1; i <= BASELINE_WINDOW_DAYS; i++) {
        const d = addDays(date, -i)
        if (sickDates.has(d)) continue
        if (ouraOnly && d < OURA_START_DATE) continue
        const x = series[v][d]
        if (x != null) baseline.push(x)
      }
      if (baseline.length < BASELINE_MIN_VALUES) continue

      z[v] = robustZ(value, baseline)
    }

    return { date, isSick, values, z }
  })
}
