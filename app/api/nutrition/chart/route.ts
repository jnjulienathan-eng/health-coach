// GET /api/nutrition/chart?days=30
// Returns daily protein + fiber totals from daily_nutrition_summary for charting.
// Uses the service-role admin client so RLS is bypassed server-side.
// Dates are returned as plain YYYY-MM-DD strings (slice of the Supabase date column)
// so callers can key a lookup map without passing anything through new Date().

import { supaAdmin, nutritionUserId } from '@/lib/nutrition'

export async function GET(req: Request) {
  const url  = new URL(req.url)
  const days = Math.min(parseInt(url.searchParams.get('days') ?? '31', 10), 90)

  const adminClient = supaAdmin()
  const nutUserId   = nutritionUserId()

  const { data, error } = await adminClient
    .from('daily_nutrition_summary')
    .select('date, protein, fiber')
    .eq('user_id', nutUserId)
    .order('date', { ascending: false })
    .limit(days)

  if (error) {
    console.error('nutrition chart route error:', JSON.stringify(error))
    return Response.json({ error: 'Failed to fetch nutrition chart data' }, { status: 500 })
  }

  const rows = (data ?? []) as Array<{ date: unknown; protein: unknown; fiber: unknown }>
  return Response.json(
    rows.map(r => ({
      // .slice(0, 10) guards against any timestamp suffix that could carry tz info
      date:    (r.date as string).slice(0, 10),
      protein: (r.protein as number | null) ?? null,
      fiber:   (r.fiber   as number | null) ?? null,
    }))
  )
}
