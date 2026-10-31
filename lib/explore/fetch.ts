// Explore tab — server-side data load. Server-only: uses the service-role
// client (supaAdmin). Loads daily_entries (full history, sessions attached),
// meal_logs (with kcal), glp1_injections dates and explore_tags, then runs
// the pure lib/explore functions. Trends and stretches are NOT computed
// here — the client computes them for its current selection.

import { loadAllEntries } from '../db'
import { supaAdmin } from '../nutrition'
import {
  EXPLORE_VARIABLES, addDays, buildExploreSeries, computeInjectionInfo,
  bedtimeMinutesToHHMM, type ExploreVariable,
} from './series'
import { loadMealLoads } from './meals'
import { normaliseExplore, BASELINE_WINDOW_DAYS } from './normalise'
import { deriveAutoTags, visibleAutoTags, tagsOverlap, type ExploreTag } from './tags'
import { loadManualTags } from './tagsDb'

// Number of chart dates, ending today (Berlin).
export const EXPLORE_WINDOW_DAYS = 60

export interface ExploreVariablePoint {
  value: number | null      // hrv ms, rhr bpm, sleep minutes, TSU, ratio, kcal; bedtime encoded minutes
  display: string | null    // "HH:MM" Berlin for bedtime; null for the others
  z: number | null
}

export interface ExploreDate {
  date: string
  isSick: boolean
  isTravelling: boolean
  variables: Record<ExploreVariable, ExploreVariablePoint>
  daysSinceInjection: number | null
}

export interface ExploreData {
  startDate: string
  endDate: string
  dates: ExploreDate[]
  injectionDates: string[]
  // Manual tags plus visible automatic tags overlapping the window, by start.
  tags: ExploreTag[]
}

export function todayBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}

function displayFor(v: ExploreVariable, value: number | null): string | null {
  if (value == null) return null
  if (v === 'bedtime') return bedtimeMinutesToHHMM(value)
  return null
}

export async function loadExploreData(endDate: string = todayBerlin()): Promise<ExploreData> {
  const client = supaAdmin()
  const startDate = addDays(endDate, -(EXPLORE_WINDOW_DAYS - 1))
  const chartDates = Array.from({ length: EXPLORE_WINDOW_DAYS }, (_, i) => addDays(startDate, i))

  // Meals: the earliest baseline night ends on startDate − 28, and its
  // evening is the day before, so meals from startDate − 29 are needed. One
  // extra UTC day of margin covers the time zone and the 05:00 boundary.
  const mealsFrom = addDays(startDate, -(BASELINE_WINDOW_DAYS + 2))

  const [entries, meals, injRes, manualTags] = await Promise.all([
    loadAllEntries(client),
    loadMealLoads(client, mealsFrom),
    client
      .from('glp1_injections')
      .select('date')
      .eq('user_id', 'julie'),
    loadManualTags(client),
  ])
  if (injRes.error) throw injRes.error

  const injectionDatesAll = ((injRes.data ?? []) as { date: string }[]).map(r => r.date)
  const sickDates = new Set(entries.filter(e => e.context.is_sick === true).map(e => e.date))
  const travelDates = new Set(entries.filter(e => e.context.travelling === true).map(e => e.date))

  const series = buildExploreSeries(entries, meals)
  const points = normaliseExplore(chartDates, series, sickDates)
  const { injectionDatesInWindow, daysSinceInjection } = computeInjectionInfo(chartDates, injectionDatesAll)

  const dates: ExploreDate[] = points.map(p => {
    const variables = {} as Record<ExploreVariable, ExploreVariablePoint>
    for (const v of EXPLORE_VARIABLES) {
      variables[v] = { value: p.values[v], display: displayFor(v, p.values[v]), z: p.z[v] }
    }
    return {
      date: p.date, isSick: p.isSick, isTravelling: travelDates.has(p.date),
      variables, daysSinceInjection: daysSinceInjection[p.date],
    }
  })

  // Automatic tags come from the full history so a run that started
  // before the window keeps its real start date.
  const autoTags = deriveAutoTags(entries.map(e => ({
    date: e.date, isSick: e.context.is_sick === true, isTravelling: e.context.travelling === true,
  })))
  const window = { start: startDate, end: endDate }
  const tags: ExploreTag[] = [...manualTags, ...visibleAutoTags(autoTags, manualTags)]
    .filter(t => tagsOverlap(t, window))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))

  return { startDate, endDate, dates, injectionDates: injectionDatesInWindow, tags }
}
