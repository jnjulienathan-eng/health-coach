// GET /api/entries/cycle-day
// Derives today's cycle day as (yesterday's stored cycle_day + 1), or null
// if yesterday has no valid cycle_day on file. Service-role.
// RLS fix, session 2. See BODYCIPHER.md.

import { NextResponse } from 'next/server'
import { supaAdmin } from '@/lib/nutrition'
import { deriveCycleDay } from '@/lib/db'

export async function GET() {
  // deriveCycleDay() never throws — resolves null on any query error.
  const cycleDay = await deriveCycleDay(supaAdmin())
  return NextResponse.json({ cycleDay })
}
