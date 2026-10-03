// GET /api/oura/backfill — CRON_SECRET auth. Re-syncs OURA_START_DATE
// (2026-09-17) → today (Berlin) via syncOuraRange(), then recomputes stored
// scores for EVERY date in that range (not only dates whose inputs changed),
// so stored scores reflect the current scoring model. Dates before
// OURA_START_DATE keep their stored scores (forward-only). Idempotent, so
// safe to re-run any time.
// Registered in vercel.json on a once-a-year schedule only so it shows up in
// Vercel → Settings → Cron Jobs, where Julie can trigger it with "Run".

import { NextRequest, NextResponse } from 'next/server'
import { berlinToday, describe, isAuthorizedCron, recomputeScoresForRange, syncOuraRange } from '@/lib/oura'
import { OURA_START_DATE } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

const BACKFILL_START = OURA_START_DATE

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get('Authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const today = berlinToday()
    const results = await syncOuraRange(BACKFILL_START, today)
    const done = new Set(results.filter(r => r.scoresRecomputed).map(r => r.date))
    const scores = await recomputeScoresForRange(BACKFILL_START, today, done)
    const scoreFailures = scores.filter(r => !r.recomputed)
    console.log('[oura/backfill]', JSON.stringify({ results, scoresRecomputed: scores.length - scoreFailures.length, scoreFailures }))
    return NextResponse.json({ range: [BACKFILL_START, today], results, scoresRecomputed: scores.length - scoreFailures.length, scoreFailures })
  } catch (e) {
    console.error('[oura/backfill] failed:', describe(e))
    return NextResponse.json({ error: describe(e) }, { status: 500 })
  }
}
