// Explore tab — outliers and coincidences for the current selection.
// Pure module, runs client-side on the /api/explore response.

import type { ExploreVariable } from './series'

// Raised from 2 / 1 (Oct 2026): the originals flagged roughly a third of
// days on real data.
export const OUTLIER_Z = 2.5
export const COINCIDENCE_Z = 1.5
export const COINCIDENCE_MIN_VARIABLES = 2
export const MAX_SELECTED_VARIABLES = 3

export interface ExploreOutlier {
  date: string
  variable: ExploreVariable
  z: number
}

export interface ExploreCoincidence {
  date: string
  variables: { variable: ExploreVariable; z: number }[]
}

export interface ExploreHighlights {
  outliers: ExploreOutlier[]
  coincidences: ExploreCoincidence[]
  outlierCount: number
  coincidenceCount: number
}

// Outlier: a selected variable with |z| > OUTLIER_Z on a date.
// Coincidence: a date where ≥ COINCIDENCE_MIN_VARIABLES selected variables
// have |z| > COINCIDENCE_Z, any direction.
export function computeHighlights(
  points: { date: string; z: Partial<Record<ExploreVariable, number | null>> }[],
  selected: ExploreVariable[],
): ExploreHighlights {
  const vars = [...new Set(selected)]
  if (vars.length < 1 || vars.length > MAX_SELECTED_VARIABLES) {
    throw new RangeError(`computeHighlights: select 1–${MAX_SELECTED_VARIABLES} variables (got ${vars.length})`)
  }

  const outliers: ExploreOutlier[] = []
  const coincidences: ExploreCoincidence[] = []

  for (const p of points) {
    const elevated: { variable: ExploreVariable; z: number }[] = []
    for (const v of vars) {
      const z = p.z[v]
      if (z == null) continue
      if (Math.abs(z) > OUTLIER_Z) outliers.push({ date: p.date, variable: v, z })
      if (Math.abs(z) > COINCIDENCE_Z) elevated.push({ variable: v, z })
    }
    if (elevated.length >= COINCIDENCE_MIN_VARIABLES) coincidences.push({ date: p.date, variables: elevated })
  }

  return { outliers, coincidences, outlierCount: outliers.length, coincidenceCount: coincidences.length }
}
