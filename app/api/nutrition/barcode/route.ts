// GET /api/nutrition/barcode?code=...
//
// Looks up a barcode via Open Food Facts (no key required) and returns a
// normalised payload the client can pass straight into /api/nutrition/food-item.
// Returns { product: null } gracefully when not found or nutrient data is too
// sparse to be useful.

import { NextRequest } from 'next/server'

interface OffNutriments {
  'energy-kcal_100g'?: number
  'energy-kcal'?: number
  proteins_100g?: number
  carbohydrates_100g?: number
  fat_100g?: number
  fiber_100g?: number
}

interface OffProduct {
  product_name?: string
  product_name_en?: string
  brands?: string
  nutriments?: OffNutriments
  serving_size?: string
  serving_quantity?: number | string
}

function pickName(p: OffProduct, code: string): string {
  return (p.product_name_en || p.product_name || (p.brands ? `${p.brands} (${code})` : code)).trim() || code
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get('code') ?? '').trim()
  if (!code) return Response.json({ error: 'code is required' }, { status: 400 })
  if (!/^\d{6,14}$/.test(code)) return Response.json({ product: null })

  let json: { status?: number; product?: OffProduct } | null = null
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return Response.json({ product: null })
    json = await res.json() as { status?: number; product?: OffProduct }
  } catch {
    return Response.json({ product: null })
  }

  if (!json || json.status !== 1 || !json.product) return Response.json({ product: null })

  const p = json.product
  const n = p.nutriments ?? {}

  const calories = n['energy-kcal_100g'] ?? n['energy-kcal'] ?? null
  const protein  = n.proteins_100g       ?? null
  const carbs    = n.carbohydrates_100g  ?? null
  const fat      = n.fat_100g            ?? null
  const fiber    = n.fiber_100g          ?? null

  // If we can't get even calories or protein, treat as unusable.
  if (calories == null && protein == null) {
    return Response.json({ product: null, reason: 'nutrient data incomplete' })
  }

  return Response.json({
    product: {
      barcode: code,
      name: pickName(p, code),
      source: 'open_food_facts' as const,
      nutrients_per_100g: { calories, protein, carbs, fat, fiber },
      serving_grams: num(p.serving_quantity),
      serving_label: p.serving_size ?? null,
    },
  })
}
