// POST /api/explore/coach
// Coach answers about the Explore chart. Called only when Julie taps.
// Body: { type: 'see' | 'next' | 'custom', variables: ExploreVariable[],
//         endDate?: 'YYYY-MM-DD', question?: string (custom only) }
// → 200 { answer, cached }
// → 402 { error: 'out_of_credit' } | 4xx/5xx { error: 'coach_failed' | message }
// See BODYCIPHER.md → EXPLORE → Coach.

import Anthropic from '@anthropic-ai/sdk'
import { loadExploreData, todayBerlin } from '@/lib/explore/fetch'
import { EXPLORE_VARIABLES, type ExploreVariable } from '@/lib/explore/series'
import { MAX_SELECTED_VARIABLES } from '@/lib/explore/highlights'
import { describe } from '@/lib/explore/tagsDb'
import { supaAdmin } from '@/lib/nutrition'
import {
  runCoach, callCoachModel, classifyCoachError, COACH_QUESTION_MAX,
} from '@/lib/explore/coach'
import type { CoachRequestType } from '@/lib/explore/coachPrompts'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const TYPES: CoachRequestType[] = ['see', 'next', 'custom']

export async function POST(req: Request) {
  let body: { type?: unknown; variables?: unknown; endDate?: unknown; question?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const type = body.type as CoachRequestType
  if (!TYPES.includes(type)) return Response.json({ error: 'Unknown type' }, { status: 400 })

  const vars = Array.isArray(body.variables) ? body.variables : []
  if (vars.length > MAX_SELECTED_VARIABLES || vars.some(v => !EXPLORE_VARIABLES.includes(v as ExploreVariable))) {
    return Response.json({ error: 'Invalid variables' }, { status: 400 })
  }
  const selected = [...new Set(vars as ExploreVariable[])]
  if (type === 'see' && selected.length === 0) {
    return Response.json({ error: 'Select a variable first' }, { status: 400 })
  }

  const question = typeof body.question === 'string' ? body.question.trim() : ''
  if (type === 'custom' && (question.length === 0 || question.length > COACH_QUESTION_MAX)) {
    return Response.json({ error: `Question must be 1–${COACH_QUESTION_MAX} characters` }, { status: 400 })
  }

  // The window the chart showed; defaults to today (Berlin).
  const today = todayBerlin()
  const endDate = typeof body.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.endDate) && body.endDate <= today
    ? body.endDate
    : today

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('POST /api/explore/coach: ANTHROPIC_API_KEY is not set')
    return Response.json({ error: 'coach_failed' }, { status: 500 })
  }
  const anthropic = new Anthropic({ apiKey })

  try {
    const data = await loadExploreData(endDate)
    const result = await runCoach(
      { db: supaAdmin(), callModel: (t, p, q) => callCoachModel(anthropic, t, p, q) },
      data, type, selected, type === 'custom' ? question : undefined,
    )
    return Response.json(result)
  } catch (e) {
    const kind = classifyCoachError(e)
    console.error(`POST /api/explore/coach failed (${kind}):`, describe(e))
    return Response.json({ error: kind }, { status: kind === 'out_of_credit' ? 402 : 502 })
  }
}
