// POST /api/scores  { date: string }
// Recomputes behavior_score and outcome_score for the given date by reading
// daily_entries + daily_nutrition_summary (service-role), then writing back.
// Called after saveEntry() (from the client) and after each meal operation.

import { recomputeScores } from '@/lib/scores-server'

export async function POST(req: Request) {
  let date: string | undefined
  try {
    const body = await req.json() as { date?: string }
    date = body.date
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!date || typeof date !== 'string') {
    return Response.json({ error: 'date is required' }, { status: 400 })
  }

  try {
    await recomputeScores(date)
    return Response.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('scores route error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
