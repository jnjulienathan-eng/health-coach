// GET /api/nutrition/day?date=YYYY-MM-DD
//
// Returns all meal_logs for the given date (using the 05:00 Berlin
// boundary), each with its meal_log_items joined to food_items, plus the
// daily_nutrition_summary row.

import { NextRequest } from 'next/server'
import { supaAdmin, nutritionUserId, dayKeyFromTimestamp } from '@/lib/nutrition'

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date) return Response.json({ error: 'date is required (YYYY-MM-DD)' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })

  const supabase = supaAdmin()
  const userId = nutritionUserId()

  // Broad UTC window — filtered precisely in JS by 05:00 boundary.
  const startUtc = new Date(`${date}T00:00:00Z`)
  startUtc.setUTCDate(startUtc.getUTCDate() - 1)
  const endUtc = new Date(`${date}T00:00:00Z`)
  endUtc.setUTCDate(endUtc.getUTCDate() + 2)

  const [logsRes, summaryRes] = await Promise.all([
    supabase
      .from('meal_logs')
      .select('id, logged_at, name, logged_via, peak_glucose_mmol, notes')
      .eq('user_id', userId)
      .gte('logged_at', startUtc.toISOString())
      .lt('logged_at', endUtc.toISOString())
      .order('logged_at', { ascending: true }),
    supabase
      .from('daily_nutrition_summary')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle(),
  ])

  if (logsRes.error)    return Response.json({ error: logsRes.error.message }, { status: 500 })
  if (summaryRes.error) return Response.json({ error: summaryRes.error.message }, { status: 500 })

  const dayLogs = (logsRes.data ?? []).filter(l => dayKeyFromTimestamp(l.logged_at as string) === date)

  let mealsWithItems: Array<Record<string, unknown>> = dayLogs
  if (dayLogs.length > 0) {
    const logIds = dayLogs.map(l => l.id as string)
    const { data: items, error: itemsErr } = await supabase
      .from('meal_log_items')
      .select('id, meal_log_id, weight_grams, food_items(id, name, fdc_id, source, nutrients_per_100g)')
      .in('meal_log_id', logIds)
    if (itemsErr) return Response.json({ error: itemsErr.message }, { status: 500 })

    const byLog: Record<string, unknown[]> = {}
    for (const it of items ?? []) {
      const k = it.meal_log_id as string
      if (!byLog[k]) byLog[k] = []
      byLog[k].push(it)
    }
    mealsWithItems = dayLogs.map(l => ({ ...l, items: byLog[l.id as string] ?? [] }))
  }

  return Response.json({
    date,
    meals: mealsWithItems,
    summary: summaryRes.data ?? null,
  })
}
