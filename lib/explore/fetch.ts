// Explore tab — server-side data load. Server-only: uses the service-role
// client (supaAdmin). Loads daily_entries (full history, sessions attached),
// meal_logs (with kcal and carbs), glp1_injections dates and explore_tags, then runs
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
import { buildLateEatingNights, BEDTIME_MEDIAN_NIGHTS, WEIGHT_LOOKBACK_DAYS, type CgmPoint, type LateEatingData } from './lateEating'
import { OURA_START_DATE } from '../types'

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

// ─── Late eating view ─────────────────────────────────────────────
// Nights with wake dates from OURA_START_DATE to today (Berlin): entries
// (all, for the prior-14-night bedtime median), meals, LibreView CGM and
// morning weights. CGM is paged because PostgREST returns at most 1,000
// rows per request and readings come every ~5 minutes.
const CGM_PAGE = 1000

export async function loadLateEatingData(to: string = todayBerlin()): Promise<LateEatingData> {
  const client = supaAdmin()
  const from = OURA_START_DATE
  const dataFrom = addDays(from, -2)

  const loadCgm = async (): Promise<CgmPoint[]> => {
    const out: CgmPoint[] = []
    for (let page = 0; ; page++) {
      const { data, error } = await client
        .from('cgm_readings')
        .select('recorded_at, value_mmol')
        .eq('user_id', 'julie')
        .eq('source', 'LibreView')
        .gte('recorded_at', `${dataFrom}T00:00:00Z`)
        .order('recorded_at', { ascending: true })
        .range(page * CGM_PAGE, page * CGM_PAGE + CGM_PAGE - 1)
      if (error) throw error
      const rows = (data ?? []) as { recorded_at: string; value_mmol: number | string }[]
      for (const r of rows) out.push({ at: r.recorded_at, mmol: Number(r.value_mmol) })
      if (rows.length < CGM_PAGE) return out
    }
  }

  const [entries, meals, cgm, weightRes] = await Promise.all([
    loadAllEntries(client),
    loadMealLoads(client, dataFrom),
    loadCgm(),
    client
      .from('biomarker_readings')
      .select('recorded_on, value')
      .eq('user_id', 'julie')
      .eq('marker', 'weight')
      .gte('recorded_on', addDays(from, -WEIGHT_LOOKBACK_DAYS)),
  ])
  if (weightRes.error) throw weightRes.error

  const weightByDate: Record<string, number> = {}
  for (const r of (weightRes.data ?? []) as { recorded_on: string; value: number | string }[]) {
    weightByDate[String(r.recorded_on).slice(0, 10)] = Number(r.value)
  }
  const bedtimeFrom = addDays(from, -BEDTIME_MEDIAN_NIGHTS)
  return buildLateEatingNights({
    entries: entries.filter(e => e.date >= bedtimeFrom && e.date <= to),
    meals, cgm, weightByDate, from, to,
  })
}
