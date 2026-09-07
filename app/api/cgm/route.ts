// GET /api/cgm
// Returns the most recent cgm_readings row for user 'julie', or null if
// none exist yet. Read-only — the write path lives in /api/health-import.
// cgm_readings is populated from Apple Health/HAE as one row per day (that
// day's running glucose average), not an intraday stream — see BODYCIPHER.md.
//
// Service-role client, same inline-query pattern as /api/glp1. See
// BODYCIPHER.md RLS section.

import { NextResponse } from 'next/server'
import { supaAdmin } from '@/lib/nutrition'
import type { CgmReading } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const supabase = supaAdmin()
  const { data, error } = await supabase
    .from('cgm_readings')
    .select('recorded_at, value_mmol, source')
    .eq('user_id', 'julie')
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('GET /api/cgm: query failed:', JSON.stringify(error))
    return NextResponse.json({ error: 'Failed to load CGM reading' }, { status: 500 })
  }
  return NextResponse.json((data ?? null) as CgmReading | null)
}
