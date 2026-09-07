// GET  /api/glp1
// Returns all glp1_injections rows for user 'julie', oldest first.
//
// POST /api/glp1  { date: string; dose_mg?: number; notes?: string | null }
// Logs a new injection. injection_number is (highest existing) + 1 — tracks
// logging order, not chronological date order (relevant for backfilled dates).
//
// Service-role client — moves glp1_injections off the browser-direct anon-key
// pattern flagged by Supabase's "RLS Disabled in Public" warning. See
// BODYCIPHER.md RLS section. RLS itself is not enabled yet — that happens
// once this route is confirmed working on the branch preview.

import { NextRequest, NextResponse } from 'next/server'
import { supaAdmin } from '@/lib/nutrition'
import type { Glp1Injection } from '@/lib/types'

// See BODYCIPHER.md RLS fix session 2 bugfix note.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const supabase = supaAdmin()
  const { data, error } = await supabase
    .from('glp1_injections')
    .select('*')
    .eq('user_id', 'julie')
    .order('date', { ascending: true })

  if (error) {
    console.error('GET /api/glp1: query failed:', JSON.stringify(error))
    return NextResponse.json({ error: 'Failed to load injections' }, { status: 500 })
  }
  return NextResponse.json((data ?? []) as Glp1Injection[])
}

export async function POST(req: NextRequest) {
  let body: { date?: string; dose_mg?: number; notes?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.date || typeof body.date !== 'string') {
    return NextResponse.json({ error: 'date is required' }, { status: 400 })
  }

  const supabase = supaAdmin()

  const { data: maxRow, error: maxErr } = await supabase
    .from('glp1_injections')
    .select('injection_number')
    .eq('user_id', 'julie')
    .order('injection_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (maxErr) {
    console.error('POST /api/glp1: max lookup failed:', JSON.stringify(maxErr))
    return NextResponse.json({ error: 'Failed to log injection' }, { status: 500 })
  }
  const nextNumber = ((maxRow?.injection_number as number | undefined) ?? 0) + 1

  const { data, error } = await supabase
    .from('glp1_injections')
    .insert({
      user_id: 'julie',
      date: body.date,
      dose_mg: body.dose_mg ?? 2.5,
      injection_number: nextNumber,
      notes: body.notes ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('POST /api/glp1: insert failed:', JSON.stringify(error))
    return NextResponse.json({ error: 'Failed to log injection' }, { status: 500 })
  }
  return NextResponse.json(data as Glp1Injection)
}
