// /api/nutrition/recipe
//
// GET    — list recipes (draft + active) with their ingredients joined
//          to food_items, ordered by updated_at desc
// POST   — create a recipe. If total_cooked_grams is provided we compute
//          per-100g macros, write a food_items row (source = 'recipe')
//          and activate. Otherwise the recipe is saved as a draft.
// PUT    — update a recipe. Activates when cooked weight first arrives;
//          recomputes/upserts the linked food_items row when ingredients,
//          weight, or name change on an active recipe.
// DELETE — delete the recipe (cascades recipe_ingredients) and flip the
//          linked food_items row to source = 'recipe_deleted'. The
//          food_items row is never hard-deleted in case historical
//          meal_logs reference it.
//
// All writes go through supaAdmin() (service role, bypasses RLS) and use
// nutritionUserId() for ownership. Errors follow the food-item.ts pattern:
// stage-tagged JSON via fail() + describe() for PostgrestError shapes.

import { NextRequest } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { supaAdmin, nutritionUserId, MACRO_KEYS } from '@/lib/nutrition'

interface IngredientInput {
  food_item_id: string
  weight_grams: number
}

interface CreateBody {
  name?: string
  total_servings?: number
  total_cooked_grams?: number | null
  default_serving_grams?: number | null
  is_raw?: boolean
  ingredients?: IngredientInput[]
}

interface UpdateBody extends CreateBody {
  id?: string
}

// ─── Error helpers (mirror food-item.ts) ──────────────────────────────────
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

function validIngredients(items: unknown): items is IngredientInput[] {
  if (!Array.isArray(items)) return false
  return items.every(i =>
    i && typeof i === 'object'
    && typeof (i as IngredientInput).food_item_id === 'string'
    && typeof (i as IngredientInput).weight_grams === 'number'
    && (i as IngredientInput).weight_grams > 0,
  )
}

// ─── GET ──────────────────────────────────────────────────────────────────
export async function GET() {
  let supabase: SupabaseClient, userId: string
  try {
    supabase = supaAdmin()
    userId = nutritionUserId()
  } catch (e) { return fail('init-client', e) }

  const { data: recipes, error: rErr } = await supabase
    .from('recipes')
    .select('id, name, total_servings, total_cooked_grams, default_serving_grams, is_raw, food_item_id, status, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (rErr) return fail('list-recipes', rErr)
  if (!recipes || recipes.length === 0) return Response.json({ recipes: [] })

  const recipeIds = recipes.map(r => r.id as string)
  const { data: items, error: iErr } = await supabase
    .from('recipe_ingredients')
    .select('id, recipe_id, weight_grams, food_items(id, name, fdc_id, source, nutrients_per_100g)')
    .in('recipe_id', recipeIds)

  if (iErr) return fail('list-ingredients', iErr)

  const byRecipe: Record<string, unknown[]> = {}
  for (const it of items ?? []) {
    const k = it.recipe_id as string
    if (!byRecipe[k]) byRecipe[k] = []
    byRecipe[k].push(it)
  }

  const out = recipes.map(r => ({ ...r, ingredients: byRecipe[r.id as string] ?? [] }))
  return Response.json({ recipes: out })
}

// ─── POST ─────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  let body: CreateBody
  try { body = await req.json() as CreateBody } catch (e) { return fail('parse-body', e, 400) }

  const name = (body.name ?? '').trim()
  const totalServings = Number(body.total_servings)
  if (!name) return Response.json({ error: 'name is required' }, { status: 400 })
  if (!Number.isInteger(totalServings) || totalServings < 1) {
    return Response.json({ error: 'total_servings must be an integer >= 1' }, { status: 400 })
  }

  const isRaw = body.is_raw === true
  // Raw / assembled recipes have no cooking step, so cooked weight is
  // meaningless — store null regardless of what the client sent.
  const totalCookedGrams = isRaw ? null : (body.total_cooked_grams ?? null)
  if (totalCookedGrams != null && (typeof totalCookedGrams !== 'number' || totalCookedGrams <= 0)) {
    return Response.json({ error: 'total_cooked_grams must be > 0 if provided' }, { status: 400 })
  }
  const defaultServingGrams = body.default_serving_grams ?? null
  if (defaultServingGrams != null && (typeof defaultServingGrams !== 'number' || defaultServingGrams <= 0)) {
    return Response.json({ error: 'default_serving_grams must be > 0 if provided' }, { status: 400 })
  }

  if (body.ingredients !== undefined && !validIngredients(body.ingredients)) {
    return Response.json({ error: 'ingredients must be an array of {food_item_id, weight_grams>0}' }, { status: 400 })
  }
  const ingredients = body.ingredients ?? []

  let supabase: SupabaseClient, userId: string
  try {
    supabase = supaAdmin()
    userId = nutritionUserId()
  } catch (e) { return fail('init-client', e) }

  // Raw recipes activate as soon as there's at least one ingredient (batch
  // weight = sum of raw ingredient weights). Cooked recipes need the
  // cooked-pot weight before macros can be computed.
  const rawBatchGrams = ingredients.reduce((s, i) => s + i.weight_grams, 0)
  const willActivate = ingredients.length > 0
    && (isRaw ? rawBatchGrams > 0 : (totalCookedGrams != null && totalCookedGrams > 0))
  let foodItemId: string | null = null

  if (willActivate) {
    const divisor = isRaw ? rawBatchGrams : totalCookedGrams!
    const per100g = await computePer100g(supabase, ingredients, divisor)
    if (per100g instanceof Response) return per100g

    const { data: fi, error: fiErr } = await supabase
      .from('food_items')
      .insert({
        user_id: userId,
        fdc_id: null,
        name,
        nutrients_per_100g: per100g,
        source: 'recipe',
        use_count: 0,
      })
      .select('id')
      .single()
    if (fiErr) return fail('insert-food-item', fiErr)
    foodItemId = fi.id as string
  }

  const status = willActivate ? 'active' : 'draft'
  const { data: recipe, error: rErr } = await supabase
    .from('recipes')
    .insert({
      user_id: userId,
      name,
      total_servings: totalServings,
      total_cooked_grams: totalCookedGrams,
      default_serving_grams: defaultServingGrams,
      is_raw: isRaw,
      food_item_id: foodItemId,
      status,
    })
    .select('*')
    .single()
  if (rErr) return fail('insert-recipe', rErr)

  if (ingredients.length > 0) {
    const rows = ingredients.map(i => ({
      recipe_id: recipe.id as string,
      food_item_id: i.food_item_id,
      weight_grams: i.weight_grams,
    }))
    const { error: iErr } = await supabase.from('recipe_ingredients').insert(rows)
    if (iErr) return fail('insert-ingredients', iErr)
  }

  return Response.json({ recipe })
}

// ─── PUT ──────────────────────────────────────────────────────────────────
export async function PUT(req: Request) {
  let body: UpdateBody
  try { body = await req.json() as UpdateBody } catch (e) { return fail('parse-body', e, 400) }
  if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 })

  let supabase: SupabaseClient, userId: string
  try {
    supabase = supaAdmin()
    userId = nutritionUserId()
  } catch (e) { return fail('init-client', e) }

  const { data: existing, error: lookupErr } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', body.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (lookupErr) return fail('lookup', lookupErr)
  if (!existing) return Response.json({ error: 'recipe not found' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const n = (body.name ?? '').trim()
    if (!n) return Response.json({ error: 'name cannot be empty' }, { status: 400 })
    updates.name = n
  }
  if (body.total_servings !== undefined) {
    const ts = Number(body.total_servings)
    if (!Number.isInteger(ts) || ts < 1) {
      return Response.json({ error: 'total_servings must be an integer >= 1' }, { status: 400 })
    }
    updates.total_servings = ts
  }
  if (body.is_raw !== undefined) {
    if (typeof body.is_raw !== 'boolean') {
      return Response.json({ error: 'is_raw must be a boolean' }, { status: 400 })
    }
    updates.is_raw = body.is_raw
  }
  // Effective is_raw — used to validate / null-out cooked weight below.
  const effIsRaw = (updates.is_raw as boolean | undefined) ?? (existing.is_raw as boolean | undefined) ?? false
  if (body.total_cooked_grams !== undefined) {
    const v = body.total_cooked_grams
    if (v != null && (typeof v !== 'number' || v <= 0)) {
      return Response.json({ error: 'total_cooked_grams must be > 0 if provided' }, { status: 400 })
    }
    updates.total_cooked_grams = effIsRaw ? null : v
  } else if (effIsRaw && existing.total_cooked_grams != null) {
    // Switched into raw mode — clear any stale cooked weight so the row
    // can't drift back to mixed state.
    updates.total_cooked_grams = null
  }
  if (body.default_serving_grams !== undefined) {
    const v = body.default_serving_grams
    if (v != null && (typeof v !== 'number' || v <= 0)) {
      return Response.json({ error: 'default_serving_grams must be > 0 if provided' }, { status: 400 })
    }
    updates.default_serving_grams = v
  }
  if (body.ingredients !== undefined && !validIngredients(body.ingredients)) {
    return Response.json({ error: 'ingredients must be an array of {food_item_id, weight_grams>0}' }, { status: 400 })
  }

  // Wholesale-replace recipe_ingredients up front so the activation /
  // recompute paths below see the new ingredient set.
  if (body.ingredients !== undefined) {
    const { error: delErr } = await supabase
      .from('recipe_ingredients')
      .delete()
      .eq('recipe_id', body.id)
    if (delErr) return fail('delete-ingredients', delErr)

    if (body.ingredients.length > 0) {
      const rows = body.ingredients.map(i => ({
        recipe_id: body.id as string,
        food_item_id: i.food_item_id,
        weight_grams: i.weight_grams,
      }))
      const { error: insErr } = await supabase.from('recipe_ingredients').insert(rows)
      if (insErr) return fail('insert-ingredients', insErr)
    }
  }

  // Effective values after this PUT.
  const effName     = (updates.name as string | undefined) ?? (existing.name as string)
  const effCooked   = effIsRaw
                        ? null
                        : ((body.total_cooked_grams !== undefined
                            ? body.total_cooked_grams
                            : (existing.total_cooked_grams as number | null)) ?? null)
  const wasActive   = (existing.status as string) === 'active'
  // Whether the recipe has the inputs needed to compute macros. For raw
  // recipes that's just having ingredients (batch weight = sum). For cooked
  // recipes we still need a positive cooked weight too — that's checked
  // after we load the ingredient list below.

  // Pull the current ingredient list up front — needed both to decide
  // activation for raw recipes and to recompute macros below.
  const { data: ings, error: ingsErr } = await supabase
    .from('recipe_ingredients')
    .select('food_item_id, weight_grams')
    .eq('recipe_id', body.id)
  if (ingsErr) return fail('load-ingredients', ingsErr)
  const ingList = (ings ?? []).map(r => ({
    food_item_id: r.food_item_id as string,
    weight_grams: Number(r.weight_grams),
  }))
  const rawBatchGrams = ingList.reduce((s, i) => s + i.weight_grams, 0)

  const hasComputeInputs = ingList.length > 0
    && (effIsRaw ? rawBatchGrams > 0 : (effCooked != null && effCooked > 0))
  const willBeActive = hasComputeInputs

  const willActivate    = !wasActive && willBeActive
  // Raw mode toggling on/off changes the divisor, so always recompute.
  const isRawToggled    = body.is_raw !== undefined && body.is_raw !== existing.is_raw
  const macrosNeedRecompute = wasActive && willBeActive
                              && (body.ingredients !== undefined
                                  || body.total_cooked_grams !== undefined
                                  || isRawToggled)
  const nameNeedsSync   = wasActive && willBeActive && updates.name !== undefined

  if (willActivate || macrosNeedRecompute || nameNeedsSync) {
    if (willActivate) {
      // Need ingredients to compute macros — without them we can't activate.
      if (ingList.length === 0) {
        return Response.json({ error: 'cannot activate a recipe with no ingredients' }, { status: 400 })
      }
      const divisor = effIsRaw ? rawBatchGrams : effCooked!
      const per100g = await computePer100g(supabase, ingList, divisor)
      if (per100g instanceof Response) return per100g

      const { data: fi, error: fiErr } = await supabase
        .from('food_items')
        .insert({
          user_id: userId,
          fdc_id: null,
          name: effName,
          nutrients_per_100g: per100g,
          source: 'recipe',
          use_count: 0,
        })
        .select('id')
        .single()
      if (fiErr) return fail('insert-food-item', fiErr)

      updates.food_item_id = fi.id as string
      updates.status = 'active'
    } else if ((macrosNeedRecompute || nameNeedsSync) && existing.food_item_id) {
      const fiUpdates: Record<string, unknown> = {}
      if (macrosNeedRecompute) {
        if (ingList.length === 0) {
          // Active recipe with no ingredients left — zero out the macros
          // rather than divide by something meaningless.
          fiUpdates.nutrients_per_100g = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
        } else {
          const divisor = effIsRaw ? rawBatchGrams : effCooked!
          const per100g = await computePer100g(supabase, ingList, divisor)
          if (per100g instanceof Response) return per100g
          fiUpdates.nutrients_per_100g = per100g
        }
      }
      if (nameNeedsSync) fiUpdates.name = effName

      const { error: fiUpErr } = await supabase
        .from('food_items')
        .update(fiUpdates)
        .eq('id', existing.food_item_id as string)
        .eq('user_id', userId)
      if (fiUpErr) return fail('update-food-item', fiUpErr)
    }
  }

  updates.updated_at = new Date().toISOString()

  const { error: upErr } = await supabase
    .from('recipes')
    .update(updates)
    .eq('id', body.id)
    .eq('user_id', userId)
  if (upErr) return fail('update-recipe', upErr)

  return Response.json({ ok: true, activated: willActivate })
}

// ─── DELETE ───────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  let supabase: SupabaseClient, userId: string
  try {
    supabase = supaAdmin()
    userId = nutritionUserId()
  } catch (e) { return fail('init-client', e) }

  const { data: existing, error: lookupErr } = await supabase
    .from('recipes')
    .select('id, food_item_id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (lookupErr) return fail('lookup', lookupErr)
  if (!existing) return Response.json({ ok: true })   // already gone

  // Recipe row first — recipe_ingredients cascade with it.
  const { error: delErr } = await supabase
    .from('recipes')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (delErr) return fail('delete-recipe', delErr)

  // Soft-delete the linked food_items row by flipping source. Historical
  // meal_logs may still reference this row, so never hard-delete it.
  if (existing.food_item_id) {
    const { error: fiErr } = await supabase
      .from('food_items')
      .update({ source: 'recipe_deleted' })
      .eq('id', existing.food_item_id as string)
      .eq('user_id', userId)
    if (fiErr) return fail('soft-delete-food-item', fiErr)
  }

  return Response.json({ ok: true })
}

// ─── Macro computation ────────────────────────────────────────────────────
// per_100g[m] = sum(food.nutrients_per_100g[m] × weight_grams / 100)
//                / total_cooked_grams × 100
async function computePer100g(
  supabase: SupabaseClient,
  ingredients: IngredientInput[],
  totalCookedGrams: number,
): Promise<Record<string, number> | Response> {
  const ids = Array.from(new Set(ingredients.map(i => i.food_item_id)))
  const { data: rows, error: nErr } = await supabase
    .from('food_items')
    .select('id, nutrients_per_100g')
    .in('id', ids)
  if (nErr) return fail('load-nutrients', nErr)

  const byId: Record<string, Record<string, unknown>> = {}
  for (const r of rows ?? []) {
    byId[r.id as string] = (r.nutrients_per_100g as Record<string, unknown>) ?? {}
  }

  const totals: Record<string, number> = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  for (const ing of ingredients) {
    const n = byId[ing.food_item_id] ?? {}
    for (const k of MACRO_KEYS) {
      const v = n[k]
      if (typeof v === 'number') totals[k] += (v * ing.weight_grams) / 100
    }
  }

  const per100g: Record<string, number> = {}
  for (const k of MACRO_KEYS) {
    per100g[k] = (totals[k] / totalCookedGrams) * 100
  }
  return per100g
}
