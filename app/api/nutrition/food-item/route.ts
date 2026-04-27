// POST /api/nutrition/food-item
//
// Idempotent food_items upsert. Used the first time an ingredient is
// selected from USDA, Open Food Facts, or entered manually. Returns the
// existing row if one already matches.
//
// Body: { fdc_id?: string|null, name: string,
//         nutrients_per_100g: object,
//         source: 'usda'|'open_food_facts'|'recipe'|'recipe_deleted'|'custom' }

import { supaAdmin, nutritionUserId } from '@/lib/nutrition'

// Supabase / Postgres errors come as plain objects (PostgrestError shape:
// { message, details, hint, code }) — not Error instances — so a naive
// String(e) collapses them to "[object Object]". Walk the common fields.
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

function fail(stage: string, e: unknown, status = 500) {
  return Response.json({ error: `${stage}: ${describe(e)}`, stage }, { status })
}

export async function PATCH(req: Request) {
  let body: {
    id?: string
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
    fiber?: number
  }
  try {
    body = await req.json()
  } catch (e) {
    return fail('parse-body', e, 400)
  }

  const { id } = body
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  let supabase, userId
  try {
    supabase = supaAdmin()
    userId = nutritionUserId()
  } catch (e) {
    return fail('init-client', e)
  }

  // Ownership check
  const { data: existing, error: lookupErr } = await supabase
    .from('food_items')
    .select('id, nutrients_per_100g')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (lookupErr) return fail('lookup', lookupErr)
  if (!existing) return Response.json({ error: 'food item not found' }, { status: 404 })

  // Merge macro overrides into existing JSONB, preserving other keys (e.g. raw)
  const existing_n = (existing.nutrients_per_100g as Record<string, unknown>) ?? {}
  const updated_n: Record<string, unknown> = { ...existing_n }
  if (typeof body.calories === 'number') updated_n.calories = body.calories
  if (typeof body.protein  === 'number') updated_n.protein  = body.protein
  if (typeof body.carbs    === 'number') updated_n.carbs    = body.carbs
  if (typeof body.fat      === 'number') updated_n.fat      = body.fat
  if (typeof body.fiber    === 'number') updated_n.fiber    = body.fiber

  try {
    const { error: updateErr } = await supabase
      .from('food_items')
      .update({ nutrients_per_100g: updated_n })
      .eq('id', id)
      .eq('user_id', userId)
    if (updateErr) return fail('update', updateErr)
    return Response.json({ ok: true })
  } catch (e) {
    return fail('update', e)
  }
}

export async function POST(req: Request) {
  let body: {
    fdc_id?: string | null
    name?: string
    nutrients_per_100g?: Record<string, unknown>
    source?: 'usda' | 'open_food_facts' | 'recipe' | 'recipe_deleted' | 'custom'
  }
  try {
    body = await req.json()
  } catch (e) {
    return fail('parse-body', e, 400)
  }

  const name = (body.name ?? '').trim()
  const source = body.source ?? 'custom'
  const fdcId = body.fdc_id ?? null
  const nutrients = body.nutrients_per_100g ?? {}

  if (!name) return Response.json({ error: 'name is required' }, { status: 400 })
  if (!['usda', 'open_food_facts', 'recipe', 'recipe_deleted', 'custom'].includes(source)) {
    return Response.json({ error: 'invalid source' }, { status: 400 })
  }

  let supabase, userId
  try {
    supabase = supaAdmin()
    userId = nutritionUserId()
  } catch (e) {
    return fail('init-client', e)
  }

  // ── Lookup ──────────────────────────────────────────────────────────────
  try {
    if (fdcId) {
      const { data: existing, error: lookupErr } = await supabase
        .from('food_items')
        .select('*')
        .eq('user_id', userId)
        .eq('fdc_id', fdcId)
        .maybeSingle()

      if (lookupErr) return fail('lookup-by-fdc', lookupErr)
      if (existing)  return Response.json({ food_item: existing })
    } else {
      const { data: existing, error: lookupErr } = await supabase
        .from('food_items')
        .select('*')
        .eq('user_id', userId)
        .eq('source', source)
        .ilike('name', name)
        .is('fdc_id', null)
        .maybeSingle()

      if (lookupErr) return fail('lookup-by-name', lookupErr)
      if (existing)  return Response.json({ food_item: existing })
    }
  } catch (e) {
    return fail('lookup', e)
  }

  // ── Insert ──────────────────────────────────────────────────────────────
  try {
    const { data: inserted, error: insertErr } = await supabase
      .from('food_items')
      .insert({
        user_id: userId,
        fdc_id: fdcId,
        name,
        nutrients_per_100g: nutrients,
        source,
        use_count: 0,
      })
      .select('*')
      .single()

    if (insertErr) return fail('insert', insertErr)
    return Response.json({ food_item: inserted })
  } catch (e) {
    return fail('insert', e)
  }
}
