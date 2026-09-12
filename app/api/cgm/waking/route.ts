// GET /api/cgm/waking?date=YYYY-MM-DD
//
// Reads daily_entries.wake_time for that date, then finds the nearest
// LibreView cgm_readings row to that wake time (via getNearestCgmReading
// in lib/db.ts). Returns { wakeTime, reading } — reading is null when
// there's no wake_time logged for that date, or nothing within the
// 120-minute match cap. The card shows a "No CGM data" empty state in
// either case — no manual-entry fallback (Sept 12, 2026,
// fasting-glucose-consolidation session).
//
// Service-role client, same inline-query pattern as /api/cgm. See
// BODYCIPHER.md DATA MODEL → cgm_readings / daily_entries.

import { NextRequest, NextResponse } from 'next/server'
import { supaAdmin } from '@/lib/nutrition'
import { getNearestCgmReading } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const date = url.searchParams.get('date')
  if (!date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 })
  }

  const client = supaAdmin()

  try {
    const { data, error } = await client
      .from('daily_entries')
      .select('wake_time')
      .eq('user_id', 'julie')
      .eq('date', date)
      .maybeSingle()
    if (error) throw error

    const wakeTime = (data as { wake_time: string | null } | null)?.wake_time ?? null
    if (!wakeTime) {
      return NextResponse.json({ wakeTime: null, reading: null })
    }

    const reading = await getNearestCgmReading(date, wakeTime, client)
    return NextResponse.json({ wakeTime, reading })
  } catch (e) {
    console.error('GET /api/cgm/waking failed:', e instanceof Error ? e.message : JSON.stringify(e))
    return NextResponse.json({ error: 'Failed to load waking glucose' }, { status: 500 })
  }
}
