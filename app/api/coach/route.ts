import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import type { DailyEntry } from '@/lib/types'
import { rowToEntry } from '@/lib/db'

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
    `Hydration: ${entry.hydration_ml != null ? `${entry.hydration_ml}ml` : 'not logged'}`,
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

// ─── Fetch last 7 days + today from Supabase ─────────────────────
async function getCoachContext(
  userId: string | null,
  currentDate: string,
): Promise<{ history7: DailyEntry[]; todayEntry: DailyEntry | null }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
  )

  const since = new Date(currentDate + 'T00:00:00')
  since.setDate(since.getDate() - 7)
  const sinceStr = since.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('daily_entries')
    .select('*')
    .gte('date', sinceStr)
    .order('date', { ascending: false })

  if (error) throw error

  const history7: DailyEntry[] = (data || []).map((row) =>
    rowToEntry(row as Record<string, unknown>)
  )

  const todayEntry = history7.find(e => e.date === currentDate) ?? null

  // userId reserved for future per-user filtering
  void userId

  return { history7, todayEntry }
}

// ─── Determine time-of-day mode ───────────────────────────────────
type CoachMode = 'morning' | 'midday' | 'evening'

function getCoachMode(currentTime: string | undefined): CoachMode {
  if (!currentTime) return 'morning'
  const timeStr = currentTime.includes('T')
    ? currentTime.split('T')[1].substring(0, 5)
    : currentTime.substring(0, 5)
  const hour = parseInt(timeStr.split(':')[0], 10)
  if (isNaN(hour)) return 'morning'
  if (hour < 10) return 'morning'
  if (hour < 17) return 'midday'
  return 'evening'
}

function parseHour(currentTime: string | undefined, fallback: number): number {
  if (!currentTime) return fallback
  const timeStr = currentTime.includes('T')
    ? currentTime.split('T')[1].substring(0, 5)
    : currentTime.substring(0, 5)
  const h = parseInt(timeStr.split(':')[0], 10)
  return isNaN(h) ? fallback : h
}

// ─── Build mode-specific briefing prompt ─────────────────────────
function buildBriefingPrompt(
  ctx: string,
  mode: CoachMode,
  today: DailyEntry,
  currentDate: string,
  currentTime: string | undefined,
): string {
  if (mode === 'morning') {
    return `${ctx}

---

You are Julie's personal health coach. It is MORNING — generate a forward-looking briefing for today.

MORNING RULES:
- DO NOT mention today's protein, fiber, or calorie totals. The day has just started. Nutrition field = what to eat TODAY based on recent macro gaps, not what has been logged.
- Training: apply HRV framework strictly. Recommend full rest ONLY if HRV < 50ms OR she is sick. HRV 50–80ms = recommend easy movement, NOT rest. If cycle day > 60 AND HRV is low, note that hormonal fluctuation (not fitness) is likely the cause and encourage gentle movement anyway.
- Nutrition: give specific food recommendations for the day ahead based on RECENT MACRO GAPS from the 7-day history. Name actual foods. Example: "Your fiber has been low this week — prioritise lentils or chickpeas at lunch."
- Hydration: check yesterday's hydration in LAST 7 DAYS. If it was below 1500ml, note it as a likely contributor to any HRV or RHR anomalies today. Regardless, remind her to start with 500ml of water before coffee — weave this into the insight or nutrition field naturally.
- Insight: something genuinely interesting from her data, cycle phase, season, or perimenopause context. Never generic. Rotate topics — correlations, seasonal food, supplement timing, patterns she may not have noticed.
- Question: one question you're genuinely curious about given her data.

Return ONLY valid JSON with exactly these five fields:
{
  "recovery": "One sentence with specific HRV number and comparison to her ~88ms baseline.",
  "training": "Specific directive based on HRV framework. Name the activity and intensity. Only recommend full rest if HRV < 50ms or she is sick — otherwise suggest easy movement.",
  "nutrition": "One specific food priority for the day ahead based on recent macro gaps. Name actual foods. Do NOT reference today's logged totals.",
  "insight": "Something genuinely interesting and specific to Julie's data, cycle phase, season, or perimenopause context. Never generic.",
  "question": "One question to deepen understanding. Something you're genuinely curious about given her data."
}

Rules: Direct and warm. Never generic. Never sycophantic. Use her actual numbers. No markdown formatting inside the JSON strings.`
  }

  if (mode === 'midday') {
    const dayOfWeek = new Date(currentDate + 'T00:00:00').getDay() // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const hour = parseHour(currentTime, 12)
    const isBefore14 = hour < 14
    const hasTraining = today.training.sessions.length > 0
    const needsTrainingNudge = isWeekend && isBefore14 && !hasTraining

    return `${ctx}

---

You are Julie's personal health coach. It is MIDDAY — provide a brief course-correction check-in.

MIDDAY RULES:
- Keep to 3–4 sentences TOTAL across all non-null fields. Be brief.
- Supplement check: if morning_stack_taken is false (✗), remind her to take her morning stack — she has a watch reminder but often takes it late.
- Nutrition: identify the single most important macro gap to close this afternoon with a specific food suggestion.
- Hydration: check today's hydration in TODAY'S DATA. If it is below 1000ml and it is after 12:00, add a nudge — "You're behind on water — aim for at least 500ml before dinner." Weave into insight or nutrition field.
- Training: ${needsTrainingNudge ? 'It is a weekend and no training session has been logged yet and it is before 14:00 — give a gentle encouraging push to get out and move.' : 'Set training to null — no training nudge needed right now.'}
- Set recovery and question to null.

Return ONLY valid JSON with exactly these five fields:
{
  "recovery": null,
  "training": ${needsTrainingNudge ? '"Gentle weekend training nudge — no session logged yet, encourage her to get out and move."' : 'null'},
  "nutrition": "The most important macro gap to close this afternoon. One specific food suggestion.",
  "insight": "Supplement reminder if morning stack not taken, otherwise a brief useful observation. One sentence.",
  "question": null
}

Rules: Brief and direct. 3–4 sentences total across all non-null fields. No markdown formatting inside the JSON strings.`
  }

  // evening
  const hour = parseHour(currentTime, 18)
  const afterEight = hour >= 20

  return `${ctx}

---

You are Julie's personal health coach. It is EVENING — provide a reflective close-of-day review.

EVENING RULES:
- Full day review against targets. Now appropriate to note gaps in protein (target 130–140g), fiber (target 30–35g), supplements.
- Hydration: include today's hydration in the review. Hydration target is 3000ml on training days, 2500ml on rest days (check training sessions in TODAY'S DATA). Flag gently if below target — include in the nutrition field.
- ${afterEight ? 'It is after 20:00 — include a bedtime nudge in the insight field: her target is 21:45.' : 'Note anything worth carrying into tomorrow.'}
- Note anything worth carrying into tomorrow.
- Set question to null.

Return ONLY valid JSON with exactly these five fields:
{
  "recovery": "Brief note on today's sleep/recovery quality and how the day went, or null if nothing notable.",
  "training": "Today's training review — did she hit her targets? Any note for tomorrow's session.",
  "nutrition": "Full day nutrition review against targets. Call out protein, fiber, fat gaps. Note supplement adherence if incomplete.",
  "insight": "${afterEight ? 'Include bedtime nudge (target: 21:45). ' : ''}Something worth carrying into tomorrow — a pattern, adjustment, or context note.",
  "question": null
}

Rules: Reflective and warm. Use her actual numbers. No markdown formatting inside the JSON strings.`
}

// ─── Route handler ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  try {
    const body = await req.json() as {
      type: 'briefing' | 'chat'
      today: DailyEntry
      cycleDay: number | null
      currentDate: string
      currentTime?: string
      message?: string
      history?: Array<{ role: 'user' | 'assistant'; content: string }>
    }

    const { type, today, cycleDay, currentDate: currentDateRaw, currentTime, message, history = [] } = body
    const currentDate = currentDateRaw ?? new Date().toISOString().split('T')[0]

    const { history7 } = await getCoachContext(null, currentDate)

    const ctx = buildContext(history7, today, cycleDay, currentDate)
    const mode = getCoachMode(currentTime)

    if (type === 'briefing') {
      const prompt = buildBriefingPrompt(ctx, mode, today, currentDate, currentTime)

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
      // Reactive chat — mode-aware system prompt
      const modeContext = mode === 'morning'
        ? 'It is MORNING. Focus on what she should do today. Do not reference today\'s nutrition totals — the day has just started.'
        : mode === 'midday'
        ? 'It is MIDDAY. Course-correction tone. Reference what she has logged so far today.'
        : 'It is EVENING. Reflective tone. The full day is visible — reference totals and gaps freely.'

      const systemPrompt = `You are Julie's personal health coach. You have full access to her health data and profile below. Answer her questions directly and specifically — use her actual data. Never give generic advice. Be like a brilliant, warm friend who has a PhD in sports medicine, nutrition, and women's health and has been paying close attention to her specifically.

${modeContext}

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
    console.error('Coach API error:', e)
    const msg = e instanceof Error
      ? e.message
      : (typeof e === 'object' && e !== null && 'message' in e)
        ? String((e as Record<string, unknown>).message)
        : String(e)
    return Response.json({ error: msg }, { status: 500 })
  }
}
