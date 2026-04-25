// Shared server-side helpers for the nutrition section.
//
// All six new tables (food_items, meal_logs, meal_log_items,
// daily_nutrition_summary, meal_templates, meal_template_items) are accessed
// through this module so the user_id resolution and day-boundary logic live
// in exactly one place. Swap to auth.uid() later by replacing nutritionUserId
// and supaAdmin with a cookie-based client.

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ─── Macro keys (canonical order: calories, protein, carbs, fat, fiber) ────
export const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const
export type MacroKey = typeof MACRO_KEYS[number]

export type Macros = Record<MacroKey, number>

export function emptyMacros(): Macros {
  return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
}

// ─── Server-side Supabase client (service role, bypasses RLS) ──────────────
let _admin: SupabaseClient | null = null

export function supaAdmin(): SupabaseClient {
  if (_admin) return _admin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _admin
}

export function nutritionUserId(): string {
  const id = process.env.NUTRITION_USER_ID
  if (!id) throw new Error('NUTRITION_USER_ID is not set')
  return id
}

// ─── Day boundary (05:00 Europe/Berlin) ────────────────────────────────────
const BERLIN = 'Europe/Berlin'
const DAY_START_HOUR = 5

function berlinParts(d: Date): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts: Record<string, string> = {}
  for (const p of fmt.formatToParts(d)) if (p.type !== 'literal') parts[p.type] = p.value
  return {
    y:  parseInt(parts.year,   10),
    m:  parseInt(parts.month,  10),
    d:  parseInt(parts.day,    10),
    h:  parseInt(parts.hour,   10) % 24,  // en-CA returns "24" at midnight in some envs
    mi: parseInt(parts.minute, 10),
    s:  parseInt(parts.second, 10),
  }
}

// Returns YYYY-MM-DD using the 05:00 Berlin day boundary.
export function dayKeyFromTimestamp(isoTs: string): string {
  const p = berlinParts(new Date(isoTs))
  // If local time is before 05:00, the day belongs to the previous calendar date.
  let y = p.y, m = p.m, d = p.d
  if (p.h < DAY_START_HOUR) {
    const prev = new Date(Date.UTC(y, m - 1, d))
    prev.setUTCDate(prev.getUTCDate() - 1)
    y = prev.getUTCFullYear()
    m = prev.getUTCMonth() + 1
    d = prev.getUTCDate()
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Auto-generated meal name based on Berlin local hour.
// Morning 05:00–10:59, Afternoon 11:00–14:59, Evening 15:00–18:59,
// Night 19:00–04:59.
export function defaultMealName(isoTs: string): string {
  const h = berlinParts(new Date(isoTs)).h
  if (h >= DAY_START_HOUR && h < 11) return 'Morning meal'
  if (h >= 11 && h < 15) return 'Afternoon meal'
  if (h >= 15 && h < 19) return 'Evening meal'
  return 'Night meal'
}

// ─── Macro computation from food_items + weight ────────────────────────────
export function macrosFor(nutrientsPer100g: Record<string, unknown> | null | undefined, weightGrams: number): Macros {
  const n = nutrientsPer100g ?? {}
  const out = emptyMacros()
  for (const k of MACRO_KEYS) {
    const v = n[k]
    if (typeof v === 'number') out[k] = (v * weightGrams) / 100
  }
  return out
}

function round1(n: number): number { return Math.round(n * 10) / 10 }

// ─── Recompute and upsert daily_nutrition_summary for one date ─────────────
export async function recomputeDailySummary(date: string): Promise<void> {
  const supabase = supaAdmin()
  const userId = nutritionUserId()

  // Query a broad UTC window so we capture every meal whose 05:00-Berlin
  // dayKey could land on `date`. Filter precisely in JS.
  const startUtc = new Date(`${date}T00:00:00Z`)
  startUtc.setUTCDate(startUtc.getUTCDate() - 1)
  const endUtc = new Date(`${date}T00:00:00Z`)
  endUtc.setUTCDate(endUtc.getUTCDate() + 2)

  const { data: logs, error: logsErr } = await supabase
    .from('meal_logs')
    .select('id, logged_at, logged_via')
    .eq('user_id', userId)
    .gte('logged_at', startUtc.toISOString())
    .lt('logged_at', endUtc.toISOString())

  if (logsErr) throw logsErr

  const dayLogs = (logs ?? []).filter(l => dayKeyFromTimestamp(l.logged_at as string) === date)

  if (dayLogs.length === 0) {
    await supabase
      .from('daily_nutrition_summary')
      .delete()
      .eq('user_id', userId)
      .eq('date', date)
    return
  }

  const logIds = dayLogs.map(l => l.id as string)
  const { data: items, error: itemsErr } = await supabase
    .from('meal_log_items')
    .select('weight_grams, food_items(nutrients_per_100g)')
    .in('meal_log_id', logIds)

  if (itemsErr) throw itemsErr

  const totals = emptyMacros()
  // Supabase types the embedded join as an array even for one-to-one FKs.
  type ItemRow = { weight_grams: number; food_items: { nutrients_per_100g: Record<string, unknown> } | { nutrients_per_100g: Record<string, unknown> }[] | null }
  for (const item of (items ?? []) as unknown as ItemRow[]) {
    const w = Number(item.weight_grams) || 0
    const fi = Array.isArray(item.food_items) ? item.food_items[0] : item.food_items
    const n = fi?.nutrients_per_100g ?? null
    const m = macrosFor(n, w)
    for (const k of MACRO_KEYS) totals[k] += m[k]
  }

  const loggedViaSummary: Record<string, number> = {}
  for (const log of dayLogs) {
    const k = (log.logged_via as string | null) ?? 'ingredients'
    loggedViaSummary[k] = (loggedViaSummary[k] ?? 0) + 1
  }

  const { error: upErr } = await supabase
    .from('daily_nutrition_summary')
    .upsert({
      user_id: userId,
      date,
      calories: round1(totals.calories),
      protein:  round1(totals.protein),
      carbs:    round1(totals.carbs),
      fat:      round1(totals.fat),
      fiber:    round1(totals.fiber),
      meal_count: dayLogs.length,
      logged_via_summary: loggedViaSummary,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,date' })

  if (upErr) throw upErr
}
