// GET /api/cgm-import
//
// Scheduled connector (Vercel Cron, three times/day — see vercel.json) that
// pulls the LibreView/LibreLinkUp intraday glucose stream via
// libre-link-unofficial-api and writes it into cgm_readings under
// source = 'LibreView', alongside the existing daily-average HAE feed
// (source = 'GlucosePhone'). See BODYCIPHER.md DATA MODEL → cgm_readings.
//
// CRON_SECRET bearer-token auth, same pattern as
// app/api/notifications/check-morning|check-evening.
//
// Each run pulls history() — the full ~11h40m / ~5min-cadence reading window
// — and upserts every reading, relying on the existing (user_id, recorded_at)
// unique constraint to dedupe. Runs overlap by design (three ~11h40m pulls,
// 8h apart) so most readings are re-submitted several times before aging out
// of the window; ignoreDuplicates + a returning select is what lets this
// route report real new-vs-duplicate counts instead of just a success flag.

import { NextRequest, NextResponse } from 'next/server'
import { LibreLinkClient } from 'libre-link-unofficial-api'
import { supaAdmin } from '@/lib/nutrition'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Abbott's server-enforced minimum LibreLinkUp app version. The library's own
// hardcoded default (4.7.0) is already below what Abbott currently accepts —
// omitting this causes every call past login() (fetchConnections/history/
// fetchReading) to fail with a 403 / {status: 920, data: {minimumVersion}}.
// Abbott can raise this again at any time — if this route starts failing
// with that shape of 403, start here: bump LLU_VERSION to whatever
// data.minimumVersion reports.
const LLU_VERSION = '4.16.0'

function parseFactoryTimestamp(raw: string): string | null {
  // FactoryTimestamp arrives as "M/D/YYYY h:mm:ss AM/PM" with no timezone
  // marker, but was confirmed (Session A, Task 3 investigation) to be the
  // sensor's true UTC time — the same reading's Timestamp field runs ~2h
  // ahead, consistent with a Berlin/CEST device-local adjustment, and is
  // deliberately not used here. Parsed manually with Date.UTC rather than
  // `new Date(raw)` so this doesn't silently depend on the server runtime's
  // ambient timezone actually being UTC.
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i.exec(raw.trim())
  if (!m) return null
  const [, mo, d, y, hRaw, min, sec, ampm] = m
  let hour = parseInt(hRaw, 10) % 12
  if (ampm.toUpperCase() === 'PM') hour += 12
  const ms = Date.UTC(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10), hour, parseInt(min, 10), parseInt(sec, 10))
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString()
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = process.env.LIBRE_LINK_EMAIL
  const password = process.env.LIBRE_LINK_PASSWORD
  if (!email || !password) {
    console.error('[cgm-import] LIBRE_LINK_EMAIL/LIBRE_LINK_PASSWORD not set')
    return NextResponse.json({ error: 'LibreView credentials not configured' }, { status: 500 })
  }

  const client = new LibreLinkClient({ email, password, lluVersion: LLU_VERSION })

  let history: Awaited<ReturnType<typeof client.history>>
  try {
    await client.login()
    history = await client.history()
  } catch (err) {
    console.error('[cgm-import] LibreView auth/fetch failed:', err)
    return NextResponse.json({ error: 'LibreView auth/fetch failed' }, { status: 502 })
  }

  const rows: Array<{ user_id: string; recorded_at: string; value_mmol: number; source: string }> = []
  let missingFactoryTimestamp = 0

  for (const reading of history) {
    const rawTimestamp = reading._raw.FactoryTimestamp
    const recordedAt = rawTimestamp ? parseFactoryTimestamp(rawTimestamp) : null
    if (!recordedAt) {
      // Explicitly not falling back to Timestamp — Julie asked to be told if
      // this ever happens rather than have it silently substitute the
      // locale-shifted field.
      missingFactoryTimestamp++
      continue
    }
    rows.push({
      user_id: 'julie',
      recorded_at: recordedAt,
      value_mmol: parseFloat(reading.mmol),
      source: 'LibreView',
    })
  }

  if (missingFactoryTimestamp > 0) {
    console.warn(`[cgm-import] ${missingFactoryTimestamp} reading(s) had no usable FactoryTimestamp — skipped, NOT falling back to Timestamp`)
  }

  if (rows.length === 0) {
    const summary = { fetched: history.length, inserted: 0, duplicatesSkipped: 0, missingFactoryTimestamp }
    console.log(`[cgm-import] ${JSON.stringify(summary)}`)
    return NextResponse.json(summary)
  }

  const supabase = supaAdmin()
  const { data: insertedRows, error } = await supabase
    .from('cgm_readings')
    .upsert(rows, { onConflict: 'user_id,recorded_at', ignoreDuplicates: true })
    .select('recorded_at')

  if (error) {
    console.error('[cgm-import] upsert failed:', JSON.stringify(error))
    return NextResponse.json({ error: 'Failed to write cgm_readings' }, { status: 500 })
  }

  const inserted = insertedRows?.length ?? 0
  const duplicatesSkipped = rows.length - inserted
  const summary = { fetched: history.length, inserted, duplicatesSkipped, missingFactoryTimestamp }

  console.log(`[cgm-import] ${JSON.stringify(summary)}`)
  return NextResponse.json(summary)
}
