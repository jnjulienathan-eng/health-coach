// POST /api/explore/coach
// Coach answers about the Explore chart. Called only when Julie taps.
// Body: { type: 'see' | 'next' | 'custom' | 'reply', variables: ExploreVariable[],
//         endDate?: 'YYYY-MM-DD', question?: string (custom only),
//         reply?: string, replyTo?: { type, answer, question, period } (reply only) }
// → 200 { answer, question, period, tag, parsed, cutShort, cached }
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
  type CoachRequest, type ReplyContext, type OriginalCoachType,
} from '@/lib/explore/coach'
import type { CoachRequestType } from '@/lib/explore/coachPrompts'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const TYPES: CoachRequestType[] = ['see', 'next', 'custom', 'reply']
const ORIGINAL_TYPES: OriginalCoachType[] = ['see', 'next', 'custom']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// The answer being replied to, as the client echoes it back.
function parseReplyTo(x: unknown): ReplyContext | null {
  if (!x || typeof x !== 'object') return null
  const r = x as Record<string, unknown>
  if (!ORIGINAL_TYPES.includes(r.type as OriginalCoachType)) return null
  if (typeof r.answer !== 'string' || !r.answer.trim()) return null
  if (typeof r.question !== 'string' || !r.question.trim() || r.question.length > COACH_QUESTION_MAX) return null
  const p = r.period as Record<string, unknown> | null | undefined
  const period = p && typeof p.start === 'string' && typeof p.end === 'string' && DATE_RE.test(p.start) && DATE_RE.test(p.end)
    ? { start: p.start, end: p.end }
    : null
  return { type: r.type as OriginalCoachType, answer: r.answer, question: r.question.trim(), period }
}

export async function POST(req: Request) {
  let body: { type?: unknown; variables?: unknown; endDate?: unknown; question?: unknown; reply?: unknown; replyTo?: unknown }
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

  let request: CoachRequest
  if (type === 'reply') {
    const replyTo = parseReplyTo(body.replyTo)
    const reply = typeof body.reply === 'string' ? body.reply.trim() : ''
    if (!replyTo) return Response.json({ error: 'Invalid replyTo' }, { status: 400 })
    if (reply.length === 0 || reply.length > COACH_QUESTION_MAX) {
      return Response.json({ error: `Reply must be 1–${COACH_QUESTION_MAX} characters` }, { status: 400 })
    }
    request = { type, selected, replyTo, reply }
  } else {
    request = { type, selected, question: type === 'custom' ? question : undefined }
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
      { db: supaAdmin(), callModel: (t, system, user) => callCoachModel(anthropic, t, system, user) },
      data, request,
    )
    return Response.json(result)
  } catch (e) {
    const kind = classifyCoachError(e)
    console.error(`POST /api/explore/coach failed (${kind}):`, describe(e))
    return Response.json({ error: kind }, { status: kind === 'out_of_credit' ? 402 : 502 })
  }
}
