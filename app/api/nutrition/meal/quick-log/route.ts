// /api/nutrition/meal/quick-log
//
// POST — log a meal directly with macro values, without going through the
// full meal-logger flow. Intended for MCP callers (Claude Desktop) that
// already know the macros and want to write to today's log instantly.
//
// Uses logged_via = 'photo_estimate' so top-level macro fields on meal_logs
// are included in recomputeDailySummary — no meal_log_items rows are created.

import { supaAdmin, nutritionUserId, dayKeyFromTimestamp, recomputeDailySummary } from '@/lib/nutrition'
import { recomputeScores } from '@/lib/scores-server'

interface QuickLogBody {
  name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
}

function describe(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>
    const parts = [
      typeof obj.message === 'string' ? obj.message : null,
      typeof obj.code    === 'string' ? `code=${obj.code}`       : null,
      typeof obj.details === 'string' ? `details=${obj.details}` : null,
      typeof obj.hint    === 'string' ? `hint=${obj.hint}`       : null,
    ].filter(Boolean) as string[]
    return parts.length > 0 ? parts.join(' | ') : JSON.stringify(e)
  }
  return String(e)
}

function fail(stage: string, e: unknown, status = 500) {
  return Response.json({ error: `${stage}: ${describe(e)}`, stage }, { status })
}

export async function POST(req: Request) {
  // ── Parse body ──────────────────────────────────────────────────────────
  let body: QuickLogBody
  try { body = await req.json() as QuickLogBody } catch (e) { return fail('parse-body', e, 400) }

  // ── Validate ────────────────────────────────────────────────────────────
  const name = (body.name ?? '').trim().slice(0, 40)
  if (!name) {
    return Response.json({ error: 'name is required' }, { status: 400 })
  }

  const macroFields = ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const
  for (const k of macroFields) {
    if (typeof body[k] !== 'number' || !Number.isFinite(body[k])) {
      return Response.json({ error: `${k} must be a finite number` }, { status: 400 })
    }
  }

  // ── Init client ─────────────────────────────────────────────────────────
  let supabase: ReturnType<typeof supaAdmin>, userId: string
  try {
    supabase = supaAdmin()
    userId = nutritionUserId()
  } catch (e) { return fail('init-client', e) }

  // ── Write meal_logs row ─────────────────────────────────────────────────
  const loggedAt = new Date().toISOString()

  const { data: log, error: logErr } = await supabase
    .from('meal_logs')
    .insert({
      user_id: userId,
      logged_at: loggedAt,
      name,
      logged_via: 'photo_estimate',
      calories: body.calories,
      protein_g: body.protein,
      carbs_g: body.carbs,
      fat_g: body.fat,
      fiber_g: body.fiber,
    })
    .select('id')
    .single()

  if (logErr) return fail('insert-meal-log', logErr)

  // ── Recompute summary and scores ────────────────────────────────────────
  const date = dayKeyFromTimestamp(loggedAt)
  try { await recomputeDailySummary(date) } catch (e) { return fail('recompute-summary', e) }
  try { await recomputeScores(date) } catch (e) { return fail('recompute-scores', e) }

  return Response.json({ ok: true, meal_log_id: log.id as string, date })
}
