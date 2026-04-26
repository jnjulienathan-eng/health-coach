// POST /api/nutrition/food-item
//
// Idempotent food_items upsert. Used the first time an ingredient is
// selected from USDA, Open Food Facts, or entered manually. Returns the
// existing row if one already matches.
//
// Body: { fdc_id?: string|null, name: string,
//         nutrients_per_100g: object, source: 'usda'|'open_food_facts'|'custom' }

import { supaAdmin, nutritionUserId } from '@/lib/nutrition'

const TAG = '[api/nutrition/food-item]'

// Single-user app — surface the actual error to the client so failures
// in preview are diagnosable from the browser console.
function fail(stage: string, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e)
  const stack = e instanceof Error ? e.stack : undefined
  console.error(`${TAG} ${stage} failed:`, msg)
  if (stack) console.error(stack)
  return Response.json({ error: `${stage}: ${msg}`, stage }, { status })
}

export async function POST(req: Request) {
  // ── Parse body ──────────────────────────────────────────────────────────
  let body: {
    fdc_id?: string | null
    name?: string
    nutrients_per_100g?: Record<string, unknown>
    source?: 'usda' | 'open_food_facts' | 'custom'
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
  if (!['usda', 'open_food_facts', 'custom'].includes(source)) {
    return Response.json({ error: 'invalid source' }, { status: 400 })
  }

  // ── Env / client ────────────────────────────────────────────────────────
  // Surface the precise env var that's missing — these throws are the
  // most likely cause of an opaque 500 in a preview deploy.
  console.log(`${TAG} env check`, {
    NEXT_PUBLIC_SUPABASE_URL:    !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY:   !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NUTRITION_USER_ID_present:   !!process.env.NUTRITION_USER_ID,
    NUTRITION_USER_ID_len:       process.env.NUTRITION_USER_ID?.length ?? 0,
  })

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
