// Explore — meal_logs with their kcal, for late_kcal on the chart.
// mealLoadFromRow is pure; loadMealLoads reads Supabase (service role).

import type { SupabaseClient } from '@supabase/supabase-js'
import { macrosFor, nutritionUserId } from '../nutrition'
import type { MealLoad } from './series'

type NutrientsRow = { nutrients_per_100g: Record<string, unknown> | null }
export interface MealRow {
  logged_at: string
  logged_via: string | null
  calories: number | string | null
  // Supabase types an embedded one-to-one join as an array or an object.
  meal_log_items?: { weight_grams: number | string; food_items: NutrientsRow | NutrientsRow[] | null }[] | null
}

// Photo estimates carry their macros on the meal row; every other meal is
// the sum of its items (nutrients_per_100g × grams / 100), as in
// recomputeDailySummary().
export function mealLoadFromRow(row: MealRow): MealLoad {
  if (row.logged_via === 'photo_estimate') {
    return { loggedAt: row.logged_at, kcal: Number(row.calories) || 0 }
  }
  let kcal = 0
  for (const it of row.meal_log_items ?? []) {
    const fi = Array.isArray(it.food_items) ? it.food_items[0] : it.food_items
    kcal += macrosFor(fi?.nutrients_per_100g, Number(it.weight_grams) || 0).calories
  }
  return { loggedAt: row.logged_at, kcal }
}

// Meals logged on or after fromDate 00:00 UTC.
export async function loadMealLoads(client: SupabaseClient, fromDate: string): Promise<MealLoad[]> {
  const { data, error } = await client
    .from('meal_logs')
    .select('logged_at, logged_via, calories, meal_log_items(weight_grams, food_items(nutrients_per_100g))')
    .eq('user_id', nutritionUserId())
    .gte('logged_at', `${fromDate}T00:00:00Z`)
    .order('logged_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as MealRow[]).map(mealLoadFromRow)
}
