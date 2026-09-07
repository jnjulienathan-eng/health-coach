// GET /api/entries/sleep-logged?date=YYYY-MM-DD
// True if hrv or sleep_duration_min is set for that date — drives the
// "yesterday's sleep not logged" banner on the Today tab. Service-role.
// RLS fix, session 2. See BODYCIPHER.md.

import { NextRequest, NextResponse } from 'next/server'
import { supaAdmin } from '@/lib/nutrition'
import { isSleepLogged } from '@/lib/db'

export async function GET(req: NextRequest) {
  const url  = new URL(req.url)
  const date = url.searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 })

  // isSleepLogged() never throws — it resolves false on any query error,
  // same fallback the client used to get calling lib/db.ts directly.
  const logged = await isSleepLogged(date, supaAdmin())
  return NextResponse.json({ logged })
}
