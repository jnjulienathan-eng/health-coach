// /api/nutrition/recipe/quick-import
//
// POST — create a macro-only recipe in the Library without going through
// the full recipe-builder flow. Intended for external / MCP callers that
// already know the per-serving macros (e.g. from a label or estimate) and
// just want the item available in the search library.
//
// This route does NOT use recipe_ingredients rows — it computes
// nutrients_per_100g directly from the supplied per-serving macro values
// and default_serving_grams, then creates the food_items + recipes rows.
//
// ─── Authentication ──────────────────────────────────────────────────────
// TODO: add shared-secret header check here before any other logic.
//
//   const secret = req.headers.get('x-mcp-secret')
//   if (!secret || secret !== process.env.MCP_SECRET) {
//     return Response.json({ error: 'unauthorized' }, { status: 401 })
//   }
//
// MCP_SECRET must be set as a server-side env var in Vercel.
// ─────────────────────────────────────────────────────────────────────────

import { supaAdmin, nutritionUserId } from '@/lib/nutrition'
import { SupabaseClient } from '@supabase/supabase-js'

interface QuickImportBody {
  name: string
  default_serving_grams: number
  macros: {
    calories: number
    protein: number
    carbs: number
    fat: number
    fiber: number
  }
  ingredients_text?: string
}

// ─── Error helpers (mirror recipe/route.ts) ───────────────────────────────
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

// ─── DB migration required before deploying ───────────────────────────────
// The recipes table does not have an ingredients_text column yet. Run this
// in the Supabase SQL editor before deploying this route:
//
//   ALTER TABLE recipes ADD COLUMN IF NOT EXISTS ingredients_text text;
//
// Julie runs all migrations manually. Do not run this yourself.
// ─────────────────────────────────────────────────────────────────────────

// ─── POST ─────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  let body: QuickImportBody
  try { body = await req.json() as QuickImportBody } catch (e) { return fail('parse-body', e, 400) }

  // ── Validation ──────────────────────────────────────────────────────────
  const name = (body.name ?? '').trim()
  if (!name) {
    return Response.json({ error: 'name is required' }, { status: 400 })
  }

  const servingGrams = Number(body.default_serving_grams)
  if (!Number.isFinite(servingGrams) || servingGrams <= 0) {
    return Response.json({ error: 'default_serving_grams must be a number > 0' }, { status: 400 })
  }

  const m = body.macros
  if (!m || typeof m !== 'object') {
    return Response.json({ error: 'macros object is required' }, { status: 400 })
  }
  const macroKeys = ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const
  for (const k of macroKeys) {
    if (typeof m[k] !== 'number' || !Number.isFinite(m[k])) {
      return Response.json({ error: `macros.${k} must be a finite number` }, { status: 400 })
    }
  }

  // ── Compute nutrients_per_100g ───────────────────────────────────────────
  // Each macro is given per single serving (default_serving_grams).
  // Scale to per-100g: value / serving_grams * 100.
  const nutrients_per_100g: Record<string, number> = {}
  for (const k of macroKeys) {
    nutrients_per_100g[k] = (m[k] / servingGrams) * 100
  }

  // ── DB writes ────────────────────────────────────────────────────────────
  let supabase: SupabaseClient, userId: string
  try {
    supabase = supaAdmin()
    userId = nutritionUserId()
  } catch (e) { return fail('init-client', e) }

  // Step 1: food_items row (source = 'recipe', same as full recipe builder)
  const { data: fi, error: fiErr } = await supabase
    .from('food_items')
    .insert({
      user_id: userId,
      fdc_id: null,
      name,
      nutrients_per_100g,
      source: 'recipe',
      use_count: 0,
    })
    .select('id')
    .single()
  if (fiErr) return fail('insert-food-item', fiErr)
  const foodItemId = fi.id as string

  // Step 2: recipes row — is_raw = true (no cooking step for macro-only
  // imports), total_servings = 1, status = 'active' immediately since
  // nutrients_per_100g is already computed.
  const recipeInsert: Record<string, unknown> = {
    user_id: userId,
    name,
    total_servings: 1,
    total_cooked_grams: null,
    default_serving_grams: servingGrams,
    is_raw: true,
    food_item_id: foodItemId,
    status: 'active',
  }
  if (body.ingredients_text !== undefined) {
    recipeInsert.ingredients_text = body.ingredients_text
  }

  const { data: recipe, error: rErr } = await supabase
    .from('recipes')
    .insert(recipeInsert)
    .select('id')
    .single()
  if (rErr) return fail('insert-recipe', rErr)

  return Response.json({ ok: true, recipe_id: recipe.id as string })
}
