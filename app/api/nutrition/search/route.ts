// GET /api/nutrition/search?q=...
//
// Returns combined results from Julie's local food_items library (instant)
// and USDA FoodData Central (live, server-side). Local results come first,
// ranked by use_count.

import { NextRequest } from 'next/server'
import { supaAdmin, nutritionUserId } from '@/lib/nutrition'
import { parseUsdaNutrients } from '@/lib/usda'

export interface SearchResult {
  source: 'local' | 'usda'
  food_item_id: string | null   // populated if already in food_items
  fdc_id: string | null
  name: string
  nutrients_per_100g: {
    calories: number | null
    protein:  number | null
    carbs:    number | null
    fat:      number | null
    fiber:    number | null
    raw?:     unknown[]
  }
  use_count?: number
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (!q) return Response.json({ results: [] })

  const supabase = supaAdmin()
  const userId = nutritionUserId()

  // ── Local library: case-insensitive name match, top by use_count ────────
  const { data: localRows, error: localErr } = await supabase
    .from('food_items')
    .select('id, fdc_id, name, nutrients_per_100g, use_count')
    .eq('user_id', userId)
    .ilike('name', `%${q}%`)
    .order('use_count', { ascending: false })
    .limit(20)

  if (localErr) {
    return Response.json({ error: localErr.message }, { status: 500 })
  }

  const local: SearchResult[] = (localRows ?? []).map(r => ({
    source: 'local',
    food_item_id: r.id as string,
    fdc_id: (r.fdc_id as string | null) ?? null,
    name: r.name as string,
    nutrients_per_100g: (r.nutrients_per_100g as SearchResult['nutrients_per_100g']) ?? {
      calories: null, protein: null, carbs: null, fat: null, fiber: null,
    },
    use_count: (r.use_count as number | null) ?? 0,
  }))

  // ── USDA: live API call ─────────────────────────────────────────────────
  const usda: SearchResult[] = []
  const apiKey = process.env.USDA_API_KEY
  if (apiKey) {
    try {
      const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&query=${encodeURIComponent(q)}&pageSize=10`
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (res.ok) {
        const json = await res.json() as { foods?: Array<{ fdcId?: number; description?: string; foodNutrients?: unknown[] }> }
        const seenFdcIds = new Set(local.map(l => l.fdc_id).filter(Boolean) as string[])
        for (const f of json.foods ?? []) {
          const fdcId = f.fdcId != null ? String(f.fdcId) : null
          if (fdcId && seenFdcIds.has(fdcId)) continue   // already in local results
          usda.push({
            source: 'usda',
            food_item_id: null,
            fdc_id: fdcId,
            name: f.description ?? 'Unnamed',
            nutrients_per_100g: parseUsdaNutrients(f.foodNutrients),
          })
        }
      }
    } catch {
      // USDA failure is non-fatal — local results still return.
    }
  }

  return Response.json({ results: [...local, ...usda] })
}
