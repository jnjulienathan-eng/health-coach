import { describe, it, expect } from 'vitest'
import { berlinParts, berlinDate, berlinWallClockToUtc, atBerlinDate } from './berlinTime'
import { dayKeyFromTimestamp } from './nutrition'
import { lastMealToMinutes, lastMealMinutesToHHMM, buildExploreSeries } from './explore/series'

// DST changes in 2026: Sun 29 Mar 02:00 CET → 03:00 CEST (01:00Z),
// Sun 25 Oct 03:00 CEST → 02:00 CET (01:00Z).

function hhmm(iso: string): string {
  const p = berlinParts(new Date(iso))
  return `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`
}

describe('berlinParts / berlinDate — UTC instant → Berlin wall clock', () => {
  it.each([
    // October: summer time before, winter time after
    ['2026-10-24T17:44:00Z', '2026-10-24', '19:44'],
    ['2026-10-25T00:59:00Z', '2026-10-25', '02:59'], // last CEST minute
    ['2026-10-25T01:00:00Z', '2026-10-25', '02:00'], // repeated hour, now CET
    ['2026-10-25T18:44:00Z', '2026-10-25', '19:44'],
    ['2026-10-30T18:44:00Z', '2026-10-30', '19:44'], // the reported meal, done right
    // March: winter time before, summer time after
    ['2026-03-28T18:44:00Z', '2026-03-28', '19:44'],
    ['2026-03-29T00:59:00Z', '2026-03-29', '01:59'], // last CET minute
    ['2026-03-29T01:00:00Z', '2026-03-29', '03:00'], // clocks jump
    ['2026-03-29T17:44:00Z', '2026-03-29', '19:44'],
  ])('%s → %s %s', (iso, date, time) => {
    expect(berlinDate(new Date(iso))).toBe(date)
    expect(hhmm(iso)).toBe(time)
  })

  it('just before and after Berlin midnight on both sides of each change', () => {
    expect(berlinDate(new Date('2026-10-24T21:59:00Z'))).toBe('2026-10-24') // 23:59 CEST
    expect(berlinDate(new Date('2026-10-24T22:00:00Z'))).toBe('2026-10-25') // 00:00 CEST
    expect(berlinDate(new Date('2026-10-25T22:59:00Z'))).toBe('2026-10-25') // 23:59 CET
    expect(berlinDate(new Date('2026-10-25T23:00:00Z'))).toBe('2026-10-26') // 00:00 CET
    expect(berlinDate(new Date('2026-03-28T22:59:00Z'))).toBe('2026-03-28') // 23:59 CET
    expect(berlinDate(new Date('2026-03-28T23:00:00Z'))).toBe('2026-03-29') // 00:00 CET
    expect(berlinDate(new Date('2026-03-29T21:59:00Z'))).toBe('2026-03-29') // 23:59 CEST
    expect(berlinDate(new Date('2026-03-29T22:00:00Z'))).toBe('2026-03-30') // 00:00 CEST
  })
})

describe('berlinWallClockToUtc — Berlin wall clock → UTC instant', () => {
  it.each([
    ['2026-10-24', '19:44', '2026-10-24T17:44:00.000Z'],
    ['2026-10-24', '23:55', '2026-10-24T21:55:00.000Z'],
    ['2026-10-25', '19:44', '2026-10-25T18:44:00.000Z'],
    ['2026-10-25', '23:55', '2026-10-25T22:55:00.000Z'],
    ['2026-10-30', '19:44', '2026-10-30T18:44:00.000Z'],
    ['2026-03-28', '19:44', '2026-03-28T18:44:00.000Z'],
    ['2026-03-28', '23:55', '2026-03-28T22:55:00.000Z'],
    ['2026-03-29', '19:44', '2026-03-29T17:44:00.000Z'],
    ['2026-03-29', '23:55', '2026-03-29T21:55:00.000Z'],
    ['2026-03-29', '01:30', '2026-03-29T00:30:00.000Z'], // CET, just before the jump
    ['2026-03-29', '03:30', '2026-03-29T01:30:00.000Z'], // CEST, just after
    ['2026-10-25', '01:30', '2026-10-24T23:30:00.000Z'], // CEST, before the repeat
    ['2026-10-25', '03:30', '2026-10-25T02:30:00.000Z'], // CET, after the repeat
    ['2026-10-25', '00:00', '2026-10-24T22:00:00.000Z'],
    ['2026-10-26', '00:00', '2026-10-25T23:00:00.000Z'],
  ])('%s %s Berlin → %s', (date, time, iso) => {
    expect(berlinWallClockToUtc(date, time).toISOString()).toBe(iso)
  })

  it('repeated October hour resolves to the first (summer-time) occurrence', () => {
    expect(berlinWallClockToUtc('2026-10-25', '02:30').toISOString()).toBe('2026-10-25T00:30:00.000Z')
  })

  it('skipped March hour is read as minutes after 01:00 CET', () => {
    expect(berlinWallClockToUtc('2026-03-29', '02:30').toISOString()).toBe('2026-03-29T01:30:00.000Z')
  })

  it('keeps seconds and milliseconds', () => {
    expect(berlinWallClockToUtc('2026-10-30', '19:44:48.606').toISOString()).toBe('2026-10-30T18:44:48.606Z')
  })

  it('round-trips every 15 minutes across both change days', () => {
    for (const day of ['2026-03-28', '2026-03-29', '2026-03-30', '2026-10-24', '2026-10-25', '2026-10-26']) {
      for (let m = 0; m < 1440; m += 15) {
        const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
        if (day === '2026-03-29' && t >= '02:00' && t < '03:00') continue // doesn't exist
        const iso = berlinWallClockToUtc(day, t).toISOString()
        expect(berlinDate(new Date(iso))).toBe(day)
        expect(hhmm(iso)).toBe(t)
      }
    }
  })
})

describe('atBerlinDate — logging a meal on the viewed date at the current time', () => {
  it('today returns now unchanged', () => {
    const now = new Date('2026-10-30T18:44:48.606Z')
    expect(atBerlinDate('2026-10-30', now).toISOString()).toBe(now.toISOString())
  })

  it('back-dating across the October change keeps the Berlin clock time', () => {
    // Now 19:44 CET on 30 Oct; logging to 24 Oct (CEST) must be 19:44 CEST.
    const at = atBerlinDate('2026-10-24', new Date('2026-10-30T18:44:48.606Z'))
    expect(at.toISOString()).toBe('2026-10-24T17:44:48.606Z')
    expect(hhmm(at.toISOString())).toBe('19:44')
  })

  it('back-dating across the March change keeps the Berlin clock time', () => {
    // Now 19:44 CEST on 29 Mar; logging to 28 Mar (CET) must be 19:44 CET.
    const at = atBerlinDate('2026-03-28', new Date('2026-03-29T17:44:00Z'))
    expect(at.toISOString()).toBe('2026-03-28T18:44:00.000Z')
  })

  it('just after Berlin midnight stays on the viewed Berlin date', () => {
    // 00:30 CET on 26 Oct is still 25 Oct in UTC; logging to 26 Oct is now.
    const now = new Date('2026-10-25T23:30:00Z')
    expect(atBerlinDate('2026-10-26', now).toISOString()).toBe(now.toISOString())
    // 00:30 CEST on 30 Mar is 29 Mar 22:30 UTC.
    const now2 = new Date('2026-03-29T22:30:00Z')
    expect(atBerlinDate('2026-03-30', now2).toISOString()).toBe(now2.toISOString())
  })
})

describe('meal day and last-meal time across DST', () => {
  it.each([
    // meal just before Berlin midnight, both sides of both changes
    ['2026-10-24T21:55:00Z', '2026-10-24', '23:55'],
    ['2026-10-25T22:55:00Z', '2026-10-25', '23:55'],
    ['2026-03-28T22:55:00Z', '2026-03-28', '23:55'],
    ['2026-03-29T21:55:00Z', '2026-03-29', '23:55'],
    // after midnight but before 05:00 belongs to the previous app day
    ['2026-10-24T22:30:00Z', '2026-10-24', '00:30'],
    ['2026-10-25T23:30:00Z', '2026-10-25', '00:30'],
    ['2026-03-28T23:30:00Z', '2026-03-28', '00:30'],
    ['2026-03-29T22:30:00Z', '2026-03-29', '00:30'],
    // ordinary evenings
    ['2026-10-24T17:44:00Z', '2026-10-24', '19:44'],
    ['2026-10-30T18:44:00Z', '2026-10-30', '19:44'],
    ['2026-03-28T18:44:00Z', '2026-03-28', '19:44'],
    ['2026-03-29T17:44:00Z', '2026-03-29', '19:44'],
  ])('%s → app day %s, last meal %s', (iso, day, time) => {
    expect(dayKeyFromTimestamp(iso)).toBe(day)
    expect(lastMealMinutesToHHMM(lastMealToMinutes(iso))).toBe(time)
  })

  it('Explore last_meal for 30 Oct shows 19:44 for a meal eaten at 19:44 CET', () => {
    const series = buildExploreSeries([], ['2026-10-30T12:00:00Z', '2026-10-30T18:44:00Z'])
    expect(lastMealMinutesToHHMM(series.last_meal['2026-10-31'])).toBe('19:44')
  })
})
