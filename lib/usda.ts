// USDA FoodData Central nutrient mapping.
//
// USDA returns nutrients in two shapes depending on the endpoint and food
// type — the search endpoint mostly uses `{nutrientId, value}` while
// foundation/SR Legacy items often use `{nutrient: {id}, amount}`. Both are
// normalised here.

export const USDA_NUTRIENT_IDS = {
  calories: 1008,  // Energy, kcal
  protein:  1003,  // Protein, g
  carbs:    1005,  // Carbohydrate, by difference, g
  fat:      1004,  // Total lipid (fat), g
  fiber:    1079,  // Fiber, total dietary, g
} as const

export interface NutrientsPer100g {
  calories: number | null
  protein:  number | null
  carbs:    number | null
  fat:      number | null
  fiber:    number | null
  raw:      unknown[]
}

interface RawNutrient {
  nutrientId?: number
  nutrient?: { id?: number }
  value?: number
  amount?: number
}

function readId(n: RawNutrient): number | undefined {
  if (typeof n.nutrientId === 'number') return n.nutrientId
  if (n.nutrient && typeof n.nutrient.id === 'number') return n.nutrient.id
  return undefined
}

function readValue(n: RawNutrient): number | undefined {
  if (typeof n.value === 'number') return n.value
  if (typeof n.amount === 'number') return n.amount
  return undefined
}

export function parseUsdaNutrients(nutrients: unknown): NutrientsPer100g {
  const raw = Array.isArray(nutrients) ? (nutrients as unknown[]) : []
  const out: NutrientsPer100g = {
    calories: null,
    protein:  null,
    carbs:    null,
    fat:      null,
    fiber:    null,
    raw,
  }

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const n = item as RawNutrient
    const id = readId(n)
    const v  = readValue(n)
    if (id == null || v == null) continue

    if      (id === USDA_NUTRIENT_IDS.calories) out.calories = v
    else if (id === USDA_NUTRIENT_IDS.protein)  out.protein  = v
    else if (id === USDA_NUTRIENT_IDS.carbs)    out.carbs    = v
    else if (id === USDA_NUTRIENT_IDS.fat)      out.fat      = v
    else if (id === USDA_NUTRIENT_IDS.fiber)    out.fiber    = v
  }

  return out
}
