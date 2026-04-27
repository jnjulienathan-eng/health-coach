import type { TrainingSession, DailyEntry } from './types'

// ─── TSU computation ──────────────────────────────────────────────
export function computeDailyTSU(sessions: TrainingSession[]): number {
  return sessions.reduce((sum, s) => {
    const z3 = s.zone3_plus_minutes ?? 0
    return sum + (s.duration_min * 0.5) + (z3 * 2.0)
  }, 0)
}

// ─── Status label and colour from ratio ──────────────────────────
function statusFromRatio(ratio: number | null): { status: string; colour: string } {
  if (ratio === null) return { status: 'Not enough data', colour: 'var(--color-text-dim)' }
  if (ratio > 1.5)   return { status: 'Overreach risk',  colour: 'var(--color-danger)' }
  if (ratio >= 1.3)  return { status: 'Pushing hard',    colour: 'var(--color-amber)' }
  if (ratio >= 0.8)  return { status: 'Building well',   colour: 'var(--color-success)' }
  if (ratio >= 0.6)  return { status: 'Easy week',       colour: 'var(--color-training-easy)' }
  return               { status: 'Undertraining',         colour: 'var(--color-amber)' }
}

// ─── EWMA constants ───────────────────────────────────────────────
const ACUTE_DECAY  = 1 - 1 / 7
const CHRONIC_DECAY = 1 - 1 / 28

// ─── computeTrainingLoad ─────────────────────────────────────────
// Returns current acute/chronic loads and ratio using all provided entries.
export function computeTrainingLoad(entries: DailyEntry[]): {
  acute: number
  chronic: number
  ratio: number | null
  status: string
  colour: string
} {
  if (entries.length === 0) {
    const { status, colour } = statusFromRatio(null)
    return { acute: 0, chronic: 0, ratio: null, status, colour }
  }

  const sorted = [...entries].sort((a, b) => a.date < b.date ? -1 : 1)
  const allDates = filledDateRange(sorted[0].date, sorted[sorted.length - 1].date)
  const tsuByDate: Record<string, number> = {}
  for (const e of sorted) tsuByDate[e.date] = computeDailyTSU(e.training.sessions)

  let acute = 0, chronic = 0
  for (const date of allDates) {
    const tsu = tsuByDate[date] ?? 0
    acute   = tsu + ACUTE_DECAY  * acute
    chronic = tsu + CHRONIC_DECAY * chronic
  }

  const ratio = chronic > 0 ? acute / chronic : null
  const { status, colour } = statusFromRatio(ratio)
  return { acute: Math.round(acute * 10) / 10, chronic: Math.round(chronic * 10) / 10, ratio, status, colour }
}

// ─── computeTrainingLoadHistory ───────────────────────────────────
// Returns one entry per day across the provided window, with ratio and
// colour for each day. Used for the 30-day trend chart.
export function computeTrainingLoadHistory(entries: DailyEntry[]): Array<{
  date: string
  tsu: number
  acute: number
  chronic: number
  ratio: number | null
  status: string
  colour: string
}> {
  if (entries.length === 0) return []

  const sorted = [...entries].sort((a, b) => a.date < b.date ? -1 : 1)
  const allDates = filledDateRange(sorted[0].date, sorted[sorted.length - 1].date)
  const tsuByDate: Record<string, number> = {}
  for (const e of sorted) tsuByDate[e.date] = computeDailyTSU(e.training.sessions)

  const result: ReturnType<typeof computeTrainingLoadHistory> = []
  let acute = 0, chronic = 0
  for (const date of allDates) {
    const tsu = tsuByDate[date] ?? 0
    acute   = tsu + ACUTE_DECAY  * acute
    chronic = tsu + CHRONIC_DECAY * chronic
    const ratio = chronic > 0 ? acute / chronic : null
    const { status, colour } = statusFromRatio(ratio)
    result.push({
      date,
      tsu: Math.round(tsu * 10) / 10,
      acute:   Math.round(acute   * 10) / 10,
      chronic: Math.round(chronic * 10) / 10,
      ratio:   ratio !== null ? Math.round(ratio * 100) / 100 : null,
      status,
      colour,
    })
  }
  return result
}

// ─── filledDateRange ──────────────────────────────────────────────
// Returns every calendar date between startDate and endDate inclusive.
function filledDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const cur = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate   + 'T00:00:00Z')
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0])
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}
