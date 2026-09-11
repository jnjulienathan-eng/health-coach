// GET   /api/user-profile
// Returns { wearing_cgm } for user_id = 'julie'.
//
// PATCH /api/user-profile  { wearing_cgm: boolean }
// Upserts wearing_cgm for user_id = 'julie'. Returns the updated { wearing_cgm }.
//
// Service-role client, same pattern as /api/glp1 — user_profiles predates the
// current model and isn't wired into any browser-direct anon-key call site,
// so this route doesn't need to sidestep an existing exposure the way the RLS
// fix sessions did. See BODYCIPHER.md DATA MODEL → user_profiles and RLS.

import { NextRequest, NextResponse } from 'next/server'
import { supaAdmin } from '@/lib/nutrition'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Supabase/Postgres errors are plain objects ({ message, code, details, hint }),
// not Error instances — String(e) collapses them to "[object Object]". Walk the
// fields manually. See CLAUDE.md and app/api/nutrition/food-item/route.ts.
function describe(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>
    const parts = [
      typeof obj.message === 'string' ? obj.message : null,
      typeof obj.code === 'string' ? `code=${obj.code}` : null,
      typeof obj.details === 'string' ? `details=${obj.details}` : null,
      typeof obj.hint === 'string' ? `hint=${obj.hint}` : null,
    ].filter(Boolean) as string[]
    return parts.length > 0 ? parts.join(' | ') : JSON.stringify(e)
  }
  return String(e)
}

export async function GET() {
  const supabase = supaAdmin()
  const { data, error } = await supabase
    .from('user_profiles')
    .select('wearing_cgm')
    .eq('user_id', 'julie')
    .maybeSingle()

  if (error) {
    console.error('GET /api/user-profile: query failed:', describe(error))
    return NextResponse.json({ error: 'Failed to load user profile' }, { status: 500 })
  }
  return NextResponse.json({ wearing_cgm: (data?.wearing_cgm as boolean | undefined) ?? true })
}

export async function PATCH(req: NextRequest) {
  let body: { wearing_cgm?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body.wearing_cgm !== 'boolean') {
    return NextResponse.json({ error: 'wearing_cgm (boolean) is required' }, { status: 400 })
  }

  const supabase = supaAdmin()
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({ user_id: 'julie', wearing_cgm: body.wearing_cgm }, { onConflict: 'user_id' })
    .select('wearing_cgm')
    .single()

  if (error) {
    console.error('PATCH /api/user-profile: upsert failed:', describe(error))
    return NextResponse.json({ error: 'Failed to save user profile' }, { status: 500 })
  }
  return NextResponse.json({ wearing_cgm: data.wearing_cgm as boolean })
}
