// GET /api/oura/backfill — CRON_SECRET auth. Re-syncs 2026-09-17 → today
// (Berlin) via syncOuraRange(). Idempotent, so safe to re-run any time.
// Registered in vercel.json on a once-a-year schedule only so it shows up in
// Vercel → Settings → Cron Jobs, where Julie can trigger it with "Run".

import { NextRequest, NextResponse } from 'next/server'
import { berlinToday, describe, isAuthorizedCron, syncOuraRange } from '@/lib/oura'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

const BACKFILL_START = '2026-09-17'

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get('Authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const results = await syncOuraRange(BACKFILL_START, berlinToday())
    console.log('[oura/backfill]', JSON.stringify(results))
    return NextResponse.json({ range: [BACKFILL_START, berlinToday()], results })
  } catch (e) {
    console.error('[oura/backfill] failed:', describe(e))
    return NextResponse.json({ error: describe(e) }, { status: 500 })
  }
}
