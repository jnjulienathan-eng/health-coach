// /api/nutrition/meal
//
// POST   — create meal_log + meal_log_items, bump food_items.use_count,
//          recompute daily_nutrition_summary, optionally save as template
// PUT    — replace items (and/or fields) on an existing meal, recompute summary
// DELETE — remove meal (cascades items), recompute summary

import { supaAdmin, nutritionUserId, dayKeyFromTimestamp, defaultMealName, recomputeDailySummary } from '@/lib/nutrition'

type LoggedVia = 'ingredients' | 'barcode' | 'photo_estimate' | 'manual_macros'

interface ItemInput {
  food_item_id: string
  weight_grams: number
}

interface CreateBody {
  name?: string | null
  logged_at?: string | null
  logged_via?: LoggedVia
  peak_glucose_mmol?: number | null
  notes?: string | null
  // Top-level macro fields — populated for logged_via='photo_estimate', null otherwise
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  items: ItemInput[]
  save_as_template?: boolean
  template_name?: string | null
  template_notes?: string | null
}

function validItems(items: unknown): items is ItemInput[] {
  if (!Array.isArray(items)) return false
  return items.every(i =>
    i && typeof i === 'object'
    && typeof (i as ItemInput).food_item_id === 'string'
    && typeof (i as ItemInput).weight_grams === 'number'
    && (i as ItemInput).weight_grams >= 0,
  )
}

// ─── POST ────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  let body: CreateBody
  try { body = await req.json() as CreateBody } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const isPhotoEstimate = body.logged_via === 'photo_estimate'
  if (!isPhotoEstimate && (!validItems(body.items) || body.items.length === 0)) {
    return Response.json({ error: 'items must be a non-empty array of {food_item_id, weight_grams}' }, { status: 400 })
  }
  if (isPhotoEstimate && body.items !== undefined && !validItems(body.items)) {
    return Response.json({ error: 'items must be an array of {food_item_id, weight_grams}' }, { status: 400 })
  }

  const supabase = supaAdmin()
  const userId = nutritionUserId()

  const loggedAt = body.logged_at ?? new Date().toISOString()
  const loggedVia: LoggedVia = body.logged_via ?? 'ingredients'
  const name = (body.name ?? '').trim() || defaultMealName(loggedAt)

  // ── Insert meal_logs row ───────────────────────────────────────────────
  const { data: log, error: logErr } = await supabase
    .from('meal_logs')
    .insert({
      user_id: userId,
      logged_at: loggedAt,
      name,
      logged_via: loggedVia,
      peak_glucose_mmol: body.peak_glucose_mmol ?? null,
      notes: body.notes ?? null,
      // Top-level macro fields for photo_estimate; null for item-based meals
      calories: isPhotoEstimate ? (body.calories ?? null) : null,
      protein_g: isPhotoEstimate ? (body.protein_g ?? null) : null,
      carbs_g: isPhotoEstimate ? (body.carbs_g ?? null) : null,
      fat_g: isPhotoEstimate ? (body.fat_g ?? null) : null,
      fiber_g: isPhotoEstimate ? (body.fiber_g ?? null) : null,
    })
    .select('*')
    .single()

  if (logErr) return Response.json({ error: logErr.message }, { status: 500 })

  // ── Insert meal_log_items (skipped for photo_estimate) ─────────────────
  if (!isPhotoEstimate) {
    const itemsRows = body.items.map(i => ({
      meal_log_id: log.id as string,
      food_item_id: i.food_item_id,
      weight_grams: i.weight_grams,
    }))
    const { error: itemsErr } = await supabase.from('meal_log_items').insert(itemsRows)
    if (itemsErr) return Response.json({ error: itemsErr.message }, { status: 500 })
  }

  // ── Increment use_count on each food_items row used ────────────────────
  if (!isPhotoEstimate) await bumpUseCounts(body.items.map(i => i.food_item_id))

  // ── Optional: save as template ─────────────────────────────────────────
  let templateId: string | null = null
  if (body.save_as_template) {
    const tName = (body.template_name ?? name).trim()
    const { data: tpl, error: tplErr } = await supabase
      .from('meal_templates')
      .insert({
        user_id: userId,
        name: tName || name,
        notes: body.template_notes ?? null,
        use_count: 0,
      })
      .select('*')
      .single()
    if (tplErr) return Response.json({ error: tplErr.message }, { status: 500 })
    templateId = tpl.id as string

    const tplItems = body.items.map(i => ({
      template_id: templateId as string,
      food_item_id: i.food_item_id,
      default_weight_grams: i.weight_grams,
    }))
    const { error: tplItemsErr } = await supabase.from('meal_template_items').insert(tplItems)
    if (tplItemsErr) return Response.json({ error: tplItemsErr.message }, { status: 500 })
  }

  // ── Recompute daily_nutrition_summary ──────────────────────────────────
  const date = dayKeyFromTimestamp(loggedAt)
  await recomputeDailySummary(date)

  return Response.json({ meal_log: log, template_id: templateId, date })
}

// ─── PUT (edit meal) ─────────────────────────────────────────────────────
interface UpdateBody {
  id: string
  name?: string | null
  peak_glucose_mmol?: number | null
  notes?: string | null
  items?: ItemInput[]   // if provided, replaces existing items wholesale
}

export async function PUT(req: Request) {
  let body: UpdateBody
  try { body = await req.json() as UpdateBody } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 })

  const supabase = supaAdmin()
  const userId = nutritionUserId()

  // ── Load existing meal (need logged_at for date recompute + ownership check) ──
  const { data: existing, error: loadErr } = await supabase
    .from('meal_logs')
    .select('*')
    .eq('id', body.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (loadErr) return Response.json({ error: loadErr.message }, { status: 500 })
  if (!existing) return Response.json({ error: 'meal not found' }, { status: 404 })

  // ── Update meal_logs (only fields that were sent) ──────────────────────
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = (body.name ?? '').trim() || defaultMealName(existing.logged_at as string)
  if (body.peak_glucose_mmol !== undefined) updates.peak_glucose_mmol = body.peak_glucose_mmol
  if (body.notes !== undefined) updates.notes = body.notes
  if (Object.keys(updates).length > 0) {
    const { error: upErr } = await supabase.from('meal_logs').update(updates).eq('id', body.id)
    if (upErr) return Response.json({ error: upErr.message }, { status: 500 })
  }

  // ── Replace items if provided ──────────────────────────────────────────
  if (body.items !== undefined) {
    if (!validItems(body.items)) {
      return Response.json({ error: 'items must be array of {food_item_id, weight_grams}' }, { status: 400 })
    }
    const { error: delErr } = await supabase.from('meal_log_items').delete().eq('meal_log_id', body.id)
    if (delErr) return Response.json({ error: delErr.message }, { status: 500 })

    if (body.items.length > 0) {
      const rows = body.items.map(i => ({
        meal_log_id: body.id,
        food_item_id: i.food_item_id,
        weight_grams: i.weight_grams,
      }))
      const { error: insErr } = await supabase.from('meal_log_items').insert(rows)
      if (insErr) return Response.json({ error: insErr.message }, { status: 500 })

      await bumpUseCounts(body.items.map(i => i.food_item_id))
    }
  }

  // ── Recompute summary ──────────────────────────────────────────────────
  const date = dayKeyFromTimestamp(existing.logged_at as string)
  await recomputeDailySummary(date)

  return Response.json({ ok: true, date })
}

// ─── DELETE ──────────────────────────────────────────────────────────────
export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  const supabase = supaAdmin()
  const userId = nutritionUserId()

  // Need logged_at to know which date's summary to refresh.
  const { data: existing, error: loadErr } = await supabase
    .from('meal_logs')
    .select('logged_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (loadErr) return Response.json({ error: loadErr.message }, { status: 500 })
  if (!existing) return Response.json({ ok: true })   // already gone

  const { error: delErr } = await supabase
    .from('meal_logs')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (delErr) return Response.json({ error: delErr.message }, { status: 500 })

  const date = dayKeyFromTimestamp(existing.logged_at as string)
  await recomputeDailySummary(date)
  return Response.json({ ok: true, date })
}

// ─── PATCH (update a single field without recomputing summary) ───────────
export async function PATCH(req: Request) {
  let body: { id?: string; peak_glucose_mmol?: number | null }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 })

  const supabase = supaAdmin()
  const userId = nutritionUserId()

  const { data: existing, error: loadErr } = await supabase
    .from('meal_logs')
    .select('id')
    .eq('id', body.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (loadErr) return Response.json({ error: loadErr.message }, { status: 500 })
  if (!existing) return Response.json({ error: 'meal not found' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (body.peak_glucose_mmol !== undefined) updates.peak_glucose_mmol = body.peak_glucose_mmol
  if (Object.keys(updates).length === 0) return Response.json({ ok: true })

  const { error: upErr } = await supabase
    .from('meal_logs').update(updates).eq('id', body.id).eq('user_id', userId)
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 })
  return Response.json({ ok: true })
}

// ─── Helpers ─────────────────────────────────────────────────────────────
async function bumpUseCounts(foodItemIds: string[]): Promise<void> {
  if (foodItemIds.length === 0) return
  const supabase = supaAdmin()
  const userId = nutritionUserId()

  // Count how many times each id appears in this batch.
  const counts: Record<string, number> = {}
  for (const id of foodItemIds) counts[id] = (counts[id] ?? 0) + 1

  // Read current use_count for each id, then write back. Single-user app, no
  // contention, so a read-modify-write loop is fine here.
  const { data: rows, error } = await supabase
    .from('food_items')
    .select('id, use_count')
    .eq('user_id', userId)
    .in('id', Object.keys(counts))

  if (error || !rows) return

  await Promise.all(rows.map(r => {
    const id = r.id as string
    const next = ((r.use_count as number | null) ?? 0) + (counts[id] ?? 0)
    return supabase.from('food_items').update({ use_count: next }).eq('id', id)
  }))
}
