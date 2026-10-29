import { describe, it, expect } from 'vitest'
import { deriveAutoTags, visibleAutoTags, validateTag, TAG_LABEL_MAX, TAG_NOTE_MAX, type ExploreTag } from './tags'

function days(spec: Record<string, { sick?: boolean; travel?: boolean }>) {
  return Object.entries(spec).map(([date, f]) => ({ date, isSick: !!f.sick, isTravelling: !!f.travel }))
}

describe('deriveAutoTags', () => {
  it('turns a single flagged day into a one-day tag', () => {
    expect(deriveAutoTags(days({ '2026-10-01': {}, '2026-10-02': { sick: true }, '2026-10-03': {} })))
      .toEqual([{ label: 'Sick', start: '2026-10-02', end: '2026-10-02', source: 'sick' }])
  })

  it('merges consecutive flagged days into one tag', () => {
    expect(deriveAutoTags(days({ '2026-10-02': { sick: true }, '2026-10-03': { sick: true }, '2026-10-04': { sick: true } })))
      .toEqual([{ label: 'Sick', start: '2026-10-02', end: '2026-10-04', source: 'sick' }])
  })

  it('keeps two separate runs apart (an unflagged day or a missing date breaks a run)', () => {
    const t = deriveAutoTags(days({
      '2026-10-01': { travel: true }, '2026-10-02': { travel: true }, '2026-10-03': {},
      '2026-10-04': { travel: true }, '2026-10-06': { travel: true },
    }))
    expect(t.map(x => [x.start, x.end])).toEqual([
      ['2026-10-01', '2026-10-02'], ['2026-10-04', '2026-10-04'], ['2026-10-06', '2026-10-06'],
    ])
    expect(t.every(x => x.source === 'travel' && x.label === 'Travel')).toBe(true)
  })

  it('gives sick and travel on the same days one tag each', () => {
    const t = deriveAutoTags(days({ '2026-10-10': { sick: true, travel: true }, '2026-10-11': { sick: true, travel: true } }))
    expect(t).toHaveLength(2)
    expect(t.map(x => x.source).sort()).toEqual(['sick', 'travel'])
    expect(t.every(x => x.start === '2026-10-10' && x.end === '2026-10-11')).toBe(true)
  })

  it('does not depend on input order', () => {
    expect(deriveAutoTags(days({ '2026-10-03': { sick: true }, '2026-10-02': { sick: true } })))
      .toEqual([{ label: 'Sick', start: '2026-10-02', end: '2026-10-03', source: 'sick' }])
  })
})

describe('visibleAutoTags', () => {
  const sick: ExploreTag = { label: 'Sick', start: '2026-10-20', end: '2026-10-26', source: 'sick' }
  const travel: ExploreTag = { label: 'Travel', start: '2026-10-01', end: '2026-10-03', source: 'travel' }

  it('hides an automatic tag when any manual tag overlaps any of its dates', () => {
    const covid: ExploreTag = { id: 'a', label: 'Covid', start: '2026-10-26', end: '2026-10-28', source: 'manual' }
    expect(visibleAutoTags([sick, travel], [covid])).toEqual([travel])
  })

  it('keeps it when the manual tag only touches neighbouring days', () => {
    const before: ExploreTag = { id: 'b', label: 'Trip', start: '2026-10-17', end: '2026-10-19', source: 'manual' }
    expect(visibleAutoTags([sick], [before])).toEqual([sick])
  })
})

describe('validateTag', () => {
  const today = '2026-10-28'
  const existing = [{ id: 'covid', label: 'Covid', start: '2026-10-20', end: '2026-10-26' }]
  const ok = { label: 'Holiday', start: '2026-10-01', end: '2026-10-05' }

  it('accepts a valid tag and trims the label', () => {
    expect(validateTag({ ...ok, label: '  Holiday  ' }, existing, today))
      .toEqual({ ok: true, value: { label: 'Holiday', start: '2026-10-01', end: '2026-10-05', note: null } })
  })

  it('accepts an optional note up to 500 characters, trimmed; empty is null', () => {
    expect(validateTag({ ...ok, note: '  Calm week, client away.  ' }, existing, today))
      .toMatchObject({ ok: true, value: { note: 'Calm week, client away.' } })
    expect(validateTag({ ...ok, note: '   ' }, existing, today)).toMatchObject({ ok: true, value: { note: null } })
    expect(validateTag({ ...ok, note: null }, existing, today)).toMatchObject({ ok: true, value: { note: null } })
    expect(validateTag({ ...ok, note: 'x'.repeat(TAG_NOTE_MAX) }, existing, today).ok).toBe(true)
    expect(validateTag({ ...ok, note: 'x'.repeat(TAG_NOTE_MAX + 1) }, existing, today)).toMatchObject({ ok: false, status: 400 })
    expect(validateTag({ ...ok, note: 42 }, existing, today)).toMatchObject({ ok: false, status: 400 })
  })

  it('needs a 1–40 character label after trimming', () => {
    expect(validateTag({ ...ok, label: '   ' }, existing, today)).toMatchObject({ ok: false, status: 400 })
    expect(validateTag({ ...ok, label: undefined }, existing, today)).toMatchObject({ ok: false, status: 400 })
    expect(validateTag({ ...ok, label: 'x'.repeat(TAG_LABEL_MAX) }, existing, today).ok).toBe(true)
    expect(validateTag({ ...ok, label: 'x'.repeat(TAG_LABEL_MAX + 1) }, existing, today)).toMatchObject({ ok: false, status: 400 })
  })

  it('needs valid dates', () => {
    expect(validateTag({ ...ok, start: '2026-02-30' }, existing, today)).toMatchObject({ ok: false, status: 400 })
    expect(validateTag({ ...ok, end: '28/10/2026' }, existing, today)).toMatchObject({ ok: false, status: 400 })
    expect(validateTag({ ...ok, start: undefined }, existing, today)).toMatchObject({ ok: false, status: 400 })
  })

  it('needs start on or before end', () => {
    expect(validateTag({ ...ok, start: '2026-10-06' }, existing, today)).toMatchObject({ ok: false, status: 400 })
    expect(validateTag({ ...ok, start: '2026-10-05' }, existing, today).ok).toBe(true)
  })

  it('does not allow an end after today', () => {
    expect(validateTag({ ...ok, start: '2026-10-28', end: '2026-10-28' }, [], today).ok).toBe(true)
    expect(validateTag({ ...ok, start: '2026-10-28', end: '2026-10-29' }, [], today)).toMatchObject({ ok: false, status: 400 })
  })

  it('returns 409 naming the overlapping manual tag', () => {
    const v = validateTag({ ...ok, start: '2026-10-25', end: '2026-10-27' }, existing, today)
    expect(v).toMatchObject({ ok: false, status: 409, overlap: { id: 'covid', label: 'Covid', start: '2026-10-20', end: '2026-10-26' } })
  })

  it('excludes the tag itself on PATCH', () => {
    expect(validateTag({ label: 'Covid', start: '2026-10-19', end: '2026-10-26' }, existing, today, 'covid').ok).toBe(true)
  })
})
