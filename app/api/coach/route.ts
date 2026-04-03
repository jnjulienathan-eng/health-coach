import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import type { DailyEntry } from '@/lib/types'

// ─── Julie's fixed health profile ─────────────────────────────────
const JULIE_PROFILE = `
JULIE'S HEALTH PROFILE
- Early 50s, perimenopause, Munich, Bavaria
- Athletic, data-driven, health-optimised
- Goal: 5kg weight loss via protein optimisation, fiber consistency, and sleep quality — NOT aggressive calorie restriction. Muscle preservation is the priority. Never recommend below 1700 kcal.
- HRV framework: >100ms = train hard | 80–100ms = moderate training | 60–80ms = easy only | <60ms = rest or gentle walk
- HRV personal baseline: ~88ms | RHR baseline: ~52 bpm (flag above 58)
- Sleep target: 7h30–8h30 | Bedtime target: 21:45
- Macro targets: protein 130–140g (flag below 120g), fiber 30–35g (flag below 25g), fat 60–75g (flag above 90g), carbs 100–130g (flag above 150g), calories 1700–1800 kcal
- Diet: whole food focused, largely cow-dairy free (exceptions: cottage cheese, occasional cheese). Lower carb, not keto. Low sugar, alcohol-free, no processed foods. Loves sardines, natto, fermented foods, seasonal produce.
- Morning stack: Creatine 5g, Vitamin D3+K2, Zinc+Selenium, Glucosamine, Omega-3, Berberine
- Evening stack: Magnesium glycinate 200mg, L-Theanine
- Hormones (daily): Progesterone 200mg (evening), Estradiol 1 spray Lenzetto
- Cyclic supplements (currently inactive): Ashwagandha, DIM, Phosphatidylserine
- Training: Swim 50min, eGym 35min, Run 35min, Walk 75min intentional. Cycling = transport (I:SY ebike, not training).
- Active calorie targets: 600 kcal intentional training, ~900 kcal total
- Cycle: currently irregular, recent cycles 54–80+ days. Luteal phase (~days 15–end) = lower HRV, poorer sleep, higher appetite, lower motivation — acknowledge without over-attributing.
- Munich seasonal context: allergy season peaks April–May, UV meaningful June–Sep, Bavarian farmers markets have excellent seasonal produce
- Dietary notes for Coach: low pre-workout protein = nudge toward cottage cheese. Berberine best timed with largest carb meal. Vitamin C within 1h of training boosts collagen. Natto days = double K2.
`.trim()

// ─── Format a single day's entry compactly ────────────────────────
function formatEntry(entry: DailyEntry, cd?: number | null): string {
  const s = entry.sleep
  const t = entry.training
  const n = entry.nutrition
  const sup = entry.supplements
  const c = entry.context

  const durationH = s.duration_min != null
    ? `${Math.floor(s.duration_min / 60)}h${s.duration_min % 60 > 0 ? `${s.duration_min % 60}m` : ''}`
    : '?'

  const sessions = t.sessions.length
    ? t.sessions.map(sess =>
        `${sess.activity_type} ${sess.duration_min}min${sess.perceived_effort ? ` effort:${sess.perceived_effort}/5` : ''}${sess.active_calories ? ` ${sess.active_calories}kcal` : ''}`
      ).join(' + ')
    : 'Rest'

  const meals: string[] = []
  if (n.pre_workout_snack.description) meals.push(`pre-workout: ${n.pre_workout_snack.description}`)
  if (n.breakfast.description) meals.push(`breakfast: ${n.breakfast.description}`)
  if (n.lunch.description) meals.push(`lunch: ${n.lunch.description}`)
  if (n.dinner.description) meals.push(`dinner: ${n.dinner.description}`)
  if (n.incidentals.description) meals.push(`incidentals: ${n.incidentals.description}`)

  const contextCd = (c as unknown as Record<string, unknown>).cycle_day
  const effectiveCd = cd ?? (typeof contextCd === 'number' ? contextCd : null)

  const lines = [
    `Date: ${entry.date}`,
    `Sleep: ${durationH} | HRV ${s.hrv ?? '?'}ms | RHR ${s.rhr ?? '?'}bpm | Rested ${s.rested ?? '?'}/5 | Bedtime ${s.bedtime ?? '?'}`,
    `Training: ${sessions}${t.cycled_today ? ` | Cycled${t.cycling_minutes ? ` ${t.cycling_minutes}min` : ''}` : ''}`,
    `Nutrition: protein ${n.total_protein ?? '?'}g | fiber ${n.total_fiber ?? '?'}g | fat ${n.total_fat ?? '?'}g | carbs ${n.total_carbs ?? '?'}g | ${n.total_calories ?? '?'}kcal`,
    meals.length ? `Meals: ${meals.join(' / ')}` : null,
    `Supplements: morning ${sup.morning_stack_taken ? '✓' : '✗'}${sup.morning_exceptions.length ? ` (skipped: ${sup.morning_exceptions.join(', ')})` : ''} | evening ${sup.evening_stack_taken ? '✓' : '✗'} | progesterone ${sup.progesterone_taken ? '✓' : '✗'} | estradiol ${sup.estradiol_taken ? '✓' : '✗'}`,
    `Context: cycle day ${effectiveCd ?? '?'} | stress ${c.stress_level ?? '?'}/5${c.symptoms.length ? ` | symptoms: ${c.symptoms.join(', ')}` : ''}${c.travelling ? ' | travelling' : ''}${c.notes ? ` | "${c.notes}"` : ''}`,
  ].filter(Boolean)

  return lines.join('\n')
}

// ─── Build full context block ──────────────────────────────────────
function buildContext(
  history7: DailyEntry[],
  today: DailyEntry,
  cycleDay: number | null,
  currentDate: string,
): string {
  const month = new Date(currentDate + 'T00:00:00').toLocaleString('en-US', { month: 'long' })

  const historyStr = history7
    .filter(e => e.date !== today.date)
    .map(e => formatEntry(e))
    .join('\n\n')

  return [
    JULIE_PROFILE,
    '',
    `CURRENT CONTEXT`,
    `Date: ${currentDate} | Month: ${month} | Cycle day: ${cycleDay ?? '?'}`,
    `Current symptoms: ${today.context.symptoms.length ? today.context.symptoms.join(', ') : 'none'}`,
    '',
    `TODAY'S DATA`,
    formatEntry(today, cycleDay),
    '',
    `LAST 7 DAYS`,
    historyStr || '(no prior entries)',
  ].join('\n')
}

// ─── Route handler ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
  )
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  try {
    const body = await req.json() as {
      type: 'briefing' | 'chat'
      today: DailyEntry
      cycleDay: number | null
      currentDate: string
      message?: string
      history?: Array<{ role: 'user' | 'assistant'; content: string }>
    }

    const { type, today, cycleDay, currentDate, message, history = [] } = body

    // Load last 7 days from Supabase
    const since = new Date(currentDate + 'T00:00:00')
    since.setDate(since.getDate() - 7)
    const sinceStr = since.toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('checkins')
      .select('*')
      .gte('date', sinceStr)
      .order('date', { ascending: false })

    if (error) throw error

    // Map rows to DailyEntry shape
    const { emptyEntry } = await import('@/lib/types')
    const history7: DailyEntry[] = (data || []).map((row) => {
      const date = row.date as string
      const base = emptyEntry(date)
      return {
        date,
        sleep:       { ...base.sleep,       ...(row.sleep       as object || {}) },
        training:    { ...base.training,    ...(row.training    as object || {}) },
        nutrition:   { ...base.nutrition,   ...(row.nutrition   as object || {}) },
        supplements: { ...base.supplements, ...(row.supplements as object || {}) },
        context:     { ...base.context,     ...(row.context     as object || {}) },
      }
    })

    const ctx = buildContext(history7, today, cycleDay, currentDate)

    if (type === 'briefing') {
      const prompt = `${ctx}

---

You are Julie's personal health coach. Based on today's sleep data and her recent history, generate a morning briefing.

Return ONLY valid JSON with exactly these five fields:
{
  "recovery": "One sentence with specific HRV number and comparison to her ~88ms baseline.",
  "training": "Specific directive based on HRV framework. Be concrete — name the activity and intensity. Not wishy-washy.",
  "nutrition": "One priority for today with a specific food suggestion. Based on recent macro gaps or patterns.",
  "insight": "Something genuinely interesting and specific to Julie's data, cycle phase, season, or perimenopause context. Never generic. Rotate topics — correlations, seasonal food, supplement timing, pattern she may not have noticed.",
  "question": "One question to deepen understanding. Something you're genuinely curious about given her data."
}

Rules: Direct and warm. Never generic. Never sycophantic. Use her actual numbers. No markdown formatting inside the JSON strings.`

      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      })

      const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
      // Extract JSON even if Claude wraps it in markdown
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      const briefing = jsonMatch ? JSON.parse(jsonMatch[0]) : { recovery: raw }

      return Response.json({ briefing })

    } else {
      // Reactive chat
      const systemPrompt = `You are Julie's personal health coach. You have full access to her health data and profile below. Answer her questions directly and specifically — use her actual data. Never give generic advice. Be like a brilliant, warm friend who has a PhD in sports medicine, nutrition, and women's health and has been paying close attention to her specifically.

${ctx}`

      const messages = [
        ...history,
        { role: 'user' as const, content: message ?? '' },
      ]

      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      })

      const response = msg.content[0].type === 'text' ? msg.content[0].text : 'No response generated.'
      return Response.json({ response })
    }

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: msg }, { status: 500 })
  }
}
