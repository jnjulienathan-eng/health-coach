// GET  /api/health-appointments            — list all appointments (fetchHealthAppointments)
// POST /api/health-appointments             — { seed: true } to seed the 9 default
//                                              appointment rows (seedDefaultAppointments),
//                                              or { id, last_completed_date?, next_due_date?,
//                                              notes? } to update one appointment
//                                              (saveHealthAppointment)
//
// Service-role client — health_appointments' three dedicated read/write
// functions move off the browser-direct anon-key pattern. RLS fix,
// session 3. See BODYCIPHER.md.

import { NextRequest, NextResponse } from 'next/server'
import { supaAdmin } from '@/lib/nutrition'
import { fetchHealthAppointments, saveHealthAppointment, seedDefaultAppointments } from '@/lib/db'

// Force per-request execution, no caching at any layer — appointments
// change on save/seed and must always read fresh. Same convention as
// app/api/entries and app/api/goals (RLS fix session 2 bugfix note).
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const data = await fetchHealthAppointments(supaAdmin())
    return NextResponse.json(data)
  } catch (e) {
    console.error('GET /api/health-appointments failed:', e instanceof Error ? e.message : JSON.stringify(e))
    return NextResponse.json({ error: 'Failed to load health appointments' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const client = supaAdmin()

  try {
    if (body && typeof body === 'object' && (body as Record<string, unknown>).seed === true) {
      await seedDefaultAppointments(client)
      return NextResponse.json({ ok: true })
    }

    const { id, ...fields } = body as {
      id: string
      last_completed_date?: string | null
      next_due_date?: string | null
      notes?: string | null
    }
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    await saveHealthAppointment({ id, ...fields }, client)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('POST /api/health-appointments failed:', e instanceof Error ? e.message : JSON.stringify(e))
    return NextResponse.json({ error: 'Failed to save health appointment' }, { status: 500 })
  }
}
