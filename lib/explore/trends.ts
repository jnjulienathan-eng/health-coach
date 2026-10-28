// Explore tab — 7-day trend lines and "off together" stretches.
// Pure module, runs client-side on the /api/explore z-scores.

import type { ExploreVariable } from './series'
import { MAX_SELECTED_VARIABLES } from './highlights'

// Centred window: the date plus (ROLLING_WINDOW − 1) / 2 days either side.
export const ROLLING_WINDOW = 7
export const ROLLING_MIN_VALUES = 4
// A variable's 7-day average counts as unusual beyond ±STRETCH_Z.
export const STRETCH_Z = 0.8
export const STRETCH_MIN_DAYS = 3
export const STRETCH_MIN_VARIABLES = 2

export interface ExploreStretch {
  start: string
  end: string
}

// ─── rollingAverage ───────────────────────────────────────────────
// values: z-scores aligned to consecutive chart dates. For each index,
// the mean of the non-null values in the centred 7-day window. At the
// range edges only the part of the window inside the range is used. Null
// when fewer than ROLLING_MIN_VALUES values are available.
export function rollingAverage(values: (number | null)[]): (number | null)[] {
  const half = Math.floor(ROLLING_WINDOW / 2)
  return values.map((_, i) => {
    let sum = 0, count = 0
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      const v = values[j]
      if (v != null) { sum += v; count++ }
    }
    return count >= ROLLING_MIN_VALUES ? sum / count : null
  })
}

// ─── findStretches ────────────────────────────────────────────────
// dates: consecutive chart dates. averages: per variable, rollingAverage
// output aligned to dates. A date is flagged when at least
// STRETCH_MIN_VARIABLES selected variables have |average| > STRETCH_Z.
// Returns runs of at least STRETCH_MIN_DAYS consecutive flagged dates.
// Fewer than two selected variables → no stretches.
export function findStretches(
  dates: string[],
  averages: Partial<Record<ExploreVariable, (number | null)[]>>,
  selected: ExploreVariable[],
): ExploreStretch[] {
  const vars = [...new Set(selected)]
  if (vars.length > MAX_SELECTED_VARIABLES) {
    throw new RangeError(`findStretches: select at most ${MAX_SELECTED_VARIABLES} variables (got ${vars.length})`)
  }
  if (vars.length < STRETCH_MIN_VARIABLES) return []

  const flagged = dates.map((_, i) =>
    vars.filter(v => {
      const a = averages[v]?.[i]
      return a != null && Math.abs(a) > STRETCH_Z
    }).length >= STRETCH_MIN_VARIABLES,
  )

  const stretches: ExploreStretch[] = []
  let runStart = -1
  for (let i = 0; i <= dates.length; i++) {
    if (i < dates.length && flagged[i]) {
      if (runStart < 0) runStart = i
    } else if (runStart >= 0) {
      if (i - runStart >= STRETCH_MIN_DAYS) stretches.push({ start: dates[runStart], end: dates[i - 1] })
      runStart = -1
    }
  }
  return stretches
}
