// GET /api/cgm/low-events-today
//
// Counts today's (Europe/Berlin, midnight-to-midnight — NOT the app's
// 05:00 nutrition day boundary, see lib/db.ts → getLowEventsToday for
// why) LibreView cgm_readings below the low-glucose threshold. Always
// reflects real "today", not the currently-navigated date — same
// always-live pattern as the GLP-1 card and Day Average row.
//
// Service-role client, same inline-query pattern as the rest of this
// file family. See BODYCIPHER.md DATA MODEL → cgm_readings.

import { NextResponse } from 'next/server'
import { supaAdmin } from '@/lib/nutrition'
import { getLowEventsToday } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const count = await getLowEventsToday(supaAdmin())
    return NextResponse.json({ count })
  } catch (e) {
    console.error('GET /api/cgm/low-events-today failed:', e instanceof Error ? e.message : JSON.stringify(e))
    return NextResponse.json({ error: 'Failed to load low events' }, { status: 500 })
  }
}
