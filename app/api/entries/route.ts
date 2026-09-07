// GET  /api/entries?date=YYYY-MM-DD   — single entry (loadEntry)
// GET  /api/entries?days=N            — entries from the last N days (loadRecentEntries)
// GET  /api/entries?all=true          — every entry (loadAllEntries)
// POST /api/entries                   — upsert entry + replace that date's
//                                        training_sessions (saveEntry)
//
// Service-role client — daily_entries and training_sessions (bundled into
// every read/write here via lib/db.ts's loadSessionsForDates) move off the
// browser-direct anon-key pattern. RLS fix, session 2. See BODYCIPHER.md.

import { NextRequest, NextResponse } from 'next/server'
import { supaAdmin } from '@/lib/nutrition'
import { loadEntry, loadRecentEntries, loadAllEntries, saveEntry } from '@/lib/db'
import type { DailyEntry } from '@/lib/types'

export async function GET(req: NextRequest) {
  const url  = new URL(req.url)
  const date = url.searchParams.get('date')
  const days = url.searchParams.get('days')
  const all  = url.searchParams.get('all')

  const client = supaAdmin()

  try {
    if (all === 'true') {
      return NextResponse.json(await loadAllEntries(client))
    }
    if (days) {
      const n = parseInt(days, 10)
      if (!Number.isFinite(n)) return NextResponse.json({ error: 'days must be a number' }, { status: 400 })
      return NextResponse.json(await loadRecentEntries(n, client))
    }
    if (date) {
      return NextResponse.json(await loadEntry(date, client))
    }
    return NextResponse.json({ error: 'date, days, or all is required' }, { status: 400 })
  } catch (e) {
    console.error('GET /api/entries failed:', e instanceof Error ? e.message : JSON.stringify(e))
    return NextResponse.json({ error: 'Failed to load entries' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let entry: DailyEntry
  try {
    entry = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!entry?.date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 })
  }

  try {
    await saveEntry(entry, supaAdmin())
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('POST /api/entries failed:', e instanceof Error ? e.message : JSON.stringify(e))
    return NextResponse.json({ error: 'Failed to save entry' }, { status: 500 })
  }
}
