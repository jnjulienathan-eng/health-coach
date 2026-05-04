import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function getTodayBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}

export async function POST(req: NextRequest) {
  let tag: string | undefined
  try {
    const body = await req.json()
    tag = body.tag
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  let field: 'morning_stack_taken' | 'evening_stack_taken'
  if (tag === 'morning-supplements') {
    field = 'morning_stack_taken'
  } else if (tag === 'evening-supplements') {
    field = 'evening_stack_taken'
  } else {
    return NextResponse.json({ error: `Unknown tag: ${tag}` }, { status: 400 })
  }

  const today = getTodayBerlin()
  const supabase = supaAdmin()

  const { error } = await supabase
    .from('daily_entries')
    .upsert(
      { user_id: 'julie', date: today, [field]: true },
      { onConflict: 'user_id,date' }
    )

  if (error) {
    console.error(`supplement-confirm: failed to set ${field} for ${today}:`, error.message, error.code, error.details)
    return NextResponse.json({ error: 'Failed to update daily_entries' }, { status: 500 })
  }

  console.log(`supplement-confirm: ${field} = true for ${today}`)
  return NextResponse.json({ ok: true, field, date: today })
}
