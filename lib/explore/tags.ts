// Explore tab — tags on days or stretches. Pure module, client-safe.
// Manual tags are Julie's own labels (explore_tags table). Automatic tags
// are derived on every request from the Context toggles (is_sick,
// travelling) and never stored. An automatic tag is hidden when any manual
// tag overlaps any of its dates.

export type ExploreTagSource = 'manual' | 'sick' | 'travel'

export interface ExploreTag {
  id?: string               // manual tags only
  label: string
  start: string             // YYYY-MM-DD, inclusive
  end: string               // YYYY-MM-DD, inclusive
  source: ExploreTagSource
  note?: string | null      // manual tags only; Julie's context, read by the coach
}

export const TAG_LABEL_MAX = 40
export const TAG_NOTE_MAX = 500
export const AUTO_TAG_LABELS = { sick: 'Sick', travel: 'Travel' } as const

function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().split('T')[0]
}

export function tagsOverlap(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return a.start <= b.end && b.start <= a.end
}

// ─── deriveAutoTags ───────────────────────────────────────────────
// Each run of consecutive calendar dates with the flag on becomes one tag.
// A missing date (no daily_entries row) breaks a run.
export function deriveAutoTags(days: { date: string; isSick: boolean; isTravelling: boolean }[]): ExploreTag[] {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const tags: ExploreTag[] = []
  for (const source of ['sick', 'travel'] as const) {
    let run: { start: string; end: string } | null = null
    for (const d of sorted) {
      const on = source === 'sick' ? d.isSick : d.isTravelling
      if (on && run && nextDay(run.end) === d.date) { run.end = d.date; continue }
      if (run) tags.push({ label: AUTO_TAG_LABELS[source], start: run.start, end: run.end, source })
      run = on ? { start: d.date, end: d.date } : null
    }
    if (run) tags.push({ label: AUTO_TAG_LABELS[source], start: run.start, end: run.end, source })
  }
  return tags.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
}

// ─── visibleAutoTags ──────────────────────────────────────────────
export function visibleAutoTags(auto: ExploreTag[], manual: ExploreTag[]): ExploreTag[] {
  return auto.filter(a => !manual.some(m => tagsOverlap(a, m)))
}

// ─── validateTag ──────────────────────────────────────────────────
// Used by POST and PATCH (PATCH passes the stored tag merged with the
// patch, and its own id as excludeId). today = Berlin calendar date.
export type TagValidation =
  | { ok: true; value: { label: string; start: string; end: string; note: string | null } }
  | { ok: false; status: 400; error: string }
  | { ok: false; status: 409; error: string; overlap: { id: string; label: string; start: string; end: string } }

function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s)
}

export function validateTag(
  input: { label?: unknown; start?: unknown; end?: unknown; note?: unknown },
  manualTags: { id: string; label: string; start: string; end: string }[],
  today: string,
  excludeId?: string,
): TagValidation {
  const label = typeof input.label === 'string' ? input.label.trim() : ''
  if (label.length < 1 || label.length > TAG_LABEL_MAX) {
    return { ok: false, status: 400, error: `Label must be 1–${TAG_LABEL_MAX} characters.` }
  }
  // Optional note: trimmed; empty or missing is stored as null.
  if (input.note != null && typeof input.note !== 'string') {
    return { ok: false, status: 400, error: 'Note must be text.' }
  }
  const note = typeof input.note === 'string' && input.note.trim() !== '' ? input.note.trim() : null
  if (note != null && note.length > TAG_NOTE_MAX) {
    return { ok: false, status: 400, error: `Note must be at most ${TAG_NOTE_MAX} characters.` }
  }
  if (!isValidDate(input.start) || !isValidDate(input.end)) {
    return { ok: false, status: 400, error: 'Start and end must be valid dates.' }
  }
  const { start, end } = input
  if (start > end) return { ok: false, status: 400, error: 'Start must be on or before end.' }
  if (end > today) return { ok: false, status: 400, error: 'End cannot be after today.' }

  const clash = manualTags.find(t => t.id !== excludeId && tagsOverlap({ start, end }, t))
  if (clash) {
    return {
      ok: false, status: 409,
      error: `Overlaps "${clash.label}" (${clash.start} – ${clash.end}).`,
      overlap: { id: clash.id, label: clash.label, start: clash.start, end: clash.end },
    }
  }
  return { ok: true, value: { label, start, end, note } }
}
