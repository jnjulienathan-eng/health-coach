// Europe/Berlin wall clock ↔ UTC instants.
// Pure and client-safe. The one place the app converts between Berlin local
// time and real instants. Always goes through Intl with the Europe/Berlin
// zone, never a fixed offset, so both DST changes (last Sunday of March,
// 02:00 → 03:00; last Sunday of October, 03:00 → 02:00) are handled.

const BERLIN = 'Europe/Berlin'

export interface BerlinParts { y: number; m: number; d: number; h: number; mi: number; s: number }

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: BERLIN,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
})

// Berlin wall-clock parts of an instant.
export function berlinParts(d: Date): BerlinParts {
  const parts: Record<string, string> = {}
  for (const p of partsFmt.formatToParts(d)) if (p.type !== 'literal') parts[p.type] = p.value
  return {
    y:  parseInt(parts.year,   10),
    m:  parseInt(parts.month,  10),
    d:  parseInt(parts.day,    10),
    h:  parseInt(parts.hour,   10) % 24,  // en-CA returns "24" at midnight in some envs
    mi: parseInt(parts.minute, 10),
    s:  parseInt(parts.second, 10),
  }
}

// Berlin calendar date (YYYY-MM-DD) of an instant; defaults to now.
export function berlinDate(d: Date = new Date()): string {
  const p = berlinParts(d)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

// Berlin offset from UTC in minutes at an instant (60 in winter, 120 in summer).
function berlinOffsetMinutes(ms: number): number {
  const p = berlinParts(new Date(ms))
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s)
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000)
}

// Berlin wall clock (date "YYYY-MM-DD" + time "HH:MM", "HH:MM:SS" or
// "HH:MM:SS.mmm") → the UTC instant it names.
// Tries the offsets in force 12h either side and keeps the one whose Berlin
// rendering round-trips. In the repeated October hour (02:00–02:59) the
// first, summer-time occurrence wins. A time in the skipped March hour
// (02:00–02:59) doesn't exist; it's read with the winter offset, i.e. as the
// same number of minutes after 01:00 CET (02:30 → 03:30 CEST).
export function berlinWallClockToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mi, secStr = '0'] = time.split(':')
  const sec = Number(secStr)
  const naiveMs = Date.UTC(y, m - 1, d, Number(hh), Number(mi), Math.floor(sec), Math.round((sec % 1) * 1000))
  const offsets = [...new Set([berlinOffsetMinutes(naiveMs - 12 * 3_600_000), berlinOffsetMinutes(naiveMs + 12 * 3_600_000)])]
    .sort((a, b) => b - a)
  for (const off of offsets) {
    const ms = naiveMs - off * 60_000
    const p = berlinParts(new Date(ms))
    if (p.y === y && p.m === m && p.d === d && p.h === Number(hh) && p.mi === Number(mi)) return new Date(ms)
  }
  return new Date(naiveMs - Math.min(...offsets) * 60_000)
}

// The instant on Berlin calendar date `date` at the same Berlin wall-clock
// time as `now`. Used to log a meal on the date being viewed at the current
// time of day. On today's date this is `now` itself.
export function atBerlinDate(date: string, now: Date = new Date()): Date {
  if (berlinDate(now) === date) return now
  const p = berlinParts(now)
  const ms = now.getTime() % 1000
  const time = `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}:${String(p.s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
  return berlinWallClockToUtc(date, time)
}
