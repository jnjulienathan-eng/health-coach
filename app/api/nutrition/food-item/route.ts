// POST /api/nutrition/food-item
//
// Idempotent food_items upsert. Used the first time an ingredient is
// selected from USDA, Open Food Facts, or entered manually. Returns the
// existing row if one already matches.
//
// Body: { fdc_id?: string|null, name: string,
//         nutrients_per_100g: object, source: 'usda'|'open_food_facts'|'custom' }

import { supaAdmin, nutritionUserId } from '@/lib/nutrition'

export async function POST(req: Request) {
  let body: {
    fdc_id?: string | null
    name?: string
    nutrients_per_100g?: Record<string, unknown>
    source?: 'usda' | 'open_food_facts' | 'custom'
  }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const name = (body.name ?? '').trim()
  const source = body.source ?? 'custom'
  const fdcId = body.fdc_id ?? null
  const nutrients = body.nutrients_per_100g ?? {}

  if (!name) return Response.json({ error: 'name is required' }, { status: 400 })
  if (!['usda', 'open_food_facts', 'custom'].includes(source)) {
    return Response.json({ error: 'invalid source' }, { status: 400 })
  }

  const supabase = supaAdmin()
  const userId = nutritionUserId()

  // ── If fdc_id present, look up by (user_id, fdc_id) ───────────────────
  if (fdcId) {
    const { data: existing, error: lookupErr } = await supabase
      .from('food_items')
      .select('*')
      .eq('user_id', userId)
      .eq('fdc_id', fdcId)
      .maybeSingle()

    if (lookupErr) return Response.json({ error: lookupErr.message }, { status: 500 })
    if (existing) return Response.json({ food_item: existing })
  } else {
    // No fdc_id — match on (user_id, name, source)
    const { data: existing, error: lookupErr } = await supabase
      .from('food_items')
      .select('*')
      .eq('user_id', userId)
      .eq('source', source)
      .ilike('name', name)
      .is('fdc_id', null)
      .maybeSingle()

    if (lookupErr) return Response.json({ error: lookupErr.message }, { status: 500 })
    if (existing) return Response.json({ food_item: existing })
  }

  // ── Insert ────────────────────────────────────────────────────────────
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

  if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })
  return Response.json({ food_item: inserted })
}
