// GET /api/goals
// Today's behavior/outcome scores, biomarker readings, 7-day fasting
// glucose, and the health_appointments list — one call, same shape
// getGoalsData() has always returned. Service-role.
//
// getGoalsData() reads daily_entries, biomarker_readings, and
// health_appointments together in one function — this route necessarily
// moves all three onto the service-role client, not just daily_entries.
// health_appointments' own dedicated read/write functions
// (saveHealthAppointment, fetchHealthAppointments, seedDefaultAppointments)
// are untouched — those are session 3's scope, not this route's.
// RLS fix, session 2. See BODYCIPHER.md.

import { NextResponse } from 'next/server'
import { supaAdmin } from '@/lib/nutrition'
import { getGoalsData } from '@/lib/db'

export async function GET() {
  try {
    const data = await getGoalsData(supaAdmin())
    return NextResponse.json(data)
  } catch (e) {
    console.error('GET /api/goals failed:', e instanceof Error ? e.message : JSON.stringify(e))
    return NextResponse.json({ error: 'Failed to load goals data' }, { status: 500 })
  }
}
