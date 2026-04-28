// GET  /api/scores?date=YYYY-MM-DD
// Returns stored behavior_score, outcome_score, and today's nutrition summary.
// Used by Dashboard to display authoritative stored scores + correct breakdown.
//
// POST /api/scores  { date: string }
// Recomputes behavior_score and outcome_score for the given date by reading
// daily_entries + daily_nutrition_summary (service-role), then writing back.
// Called after saveEntry() (from the client) and after each meal operation.

import { createClient } from '@supabase/supabase-js'
import { recomputeScores } from '@/lib/scores-server'
import { supaAdmin, nutritionUserId } from '@/lib/nutrition'

export async function GET(req: Request) {
  const url  = new URL(req.url)
  const date = url.searchParams.get('date')
  if (!date) return Response.json({ error: 'date is required' }, { status: 400 })

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const adminClient = supaAdmin()
  const nutUserId   = nutritionUserId()

  const [scoresResult, nutritionResult] = await Promise.all([
    anonClient
      .from('daily_entries')
      .select('behavior_score, outcome_score')
      .eq('user_id', 'julie')
      .eq('date', date)
      .maybeSingle(),
    adminClient
      .from('daily_nutrition_summary')
      .select('protein, fiber, meal_count')
      .eq('user_id', nutUserId)
      .eq('date', date)
      .maybeSingle(),
  ])

  const sr = scoresResult.data as Record<string, unknown> | null
  const nr = nutritionResult.data as Record<string, unknown> | null

  return Response.json({
    behavior_score: sr ? (sr.behavior_score as number | null) : null,
    outcome_score:  sr ? (sr.outcome_score  as number | null) : null,
    nutrition: nr ? {
      protein:    (nr.protein    as number | null) ?? null,
      fiber:      (nr.fiber      as number | null) ?? null,
      meal_count: (nr.meal_count as number | null) ?? null,
    } : null,
  })
}

export async function POST(req: Request) {
  let date: string | undefined
  try {
    const body = await req.json() as { date?: string }
    date = body.date
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!date || typeof date !== 'string') {
    return Response.json({ error: 'date is required' }, { status: 400 })
  }

  try {
    await recomputeScores(date)
    return Response.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('scores route error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
