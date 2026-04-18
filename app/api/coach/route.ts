import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import type { DailyEntry } from '@/lib/types'
import { zone3Intensity } from '@/lib/types'
import { rowToEntry } from '@/lib/db'

// ─── Julie's fixed health profile ─────────────────────────────────
const JULIE_PROFILE = `
JULIE'S HEALTH PROFILE
- Early 50s, perimenopause, Munich, Bavaria
- Athletic, data-driven, health-optimised
- Goal: gradual body recomposition via protein optimisation, fiber consistency, and sleep quality. Muscle preservation is the priority. Never recommend below 1700 kcal.
- HRV framework: >100ms = train hard | 80–100ms = moderate | 60–80ms = easy only | <60ms = rest
- HRV personal baseline: ~88ms | RHR baseline: ~52 bpm (flag if above 58 for 2+ days)
- Sleep target: 7h30–8h30 | Bedtime target: 21:45
- CALORIE AND MACRO TARGETS SCALE WITH TRAINING VOLUME:
  Rest day: 1800 kcal | protein 130g | carbs 160g | fat 65g | fiber 30–35g
  Light (walk/easy session): 1950 kcal | protein 132g | carbs 170g | fat 67g | fiber 30–35g
  Moderate (one solid session): 2100 kcal | protein 135g | carbs 180g | fat 70g | fiber 30–35g
  High (two sessions or one hard effort): 2300 kcal | protein 138g | carbs 195g | fat 72g | fiber 30–35g
  Very high (long endurance): 2500 kcal | protein 140g | carbs 210g | fat 75g | fiber 30–35g
  Flag: protein below 120g, fiber below 25g, fat above 90g
  Never flag calories unless asked — Julie does not overeat and logs imperfectly by design.
- Diet: whole food, largely dairy-free (exceptions: cottage cheese, occasional cheese, high-protein yogurt). Lower carb, not keto. Low sugar, alcohol-free, no processed food. Loves sardines, natto, fermented foods, seasonal produce.
- Cuisine profile: Japanese, Korean, Chinese, Thai, Vietnamese, Mediterranean, Middle Eastern, Indian (all regions). Never suggest German or Bavarian food.
- Foraging: actively forages Bärlauch, watercress, magnolia blossoms, mushrooms (trained), nettles. Wants to discover new forageable items.
- Morning stack: Creatine 5g, D3+K2, Zinc+Selenium, Glucosamine, Omega-3, Berberine, DIM
- Evening stack: Magnesium glycinate 200mg, L-Theanine
- Hormones: Progesterone 200mg evening, Estradiol 1 spray Lenzetto
- Training: Swim 50min, eGym 35min, Run 35min, Walk 75min. Cycling = transport only.
- Active calorie targets: 600 kcal intentional training, ~900 kcal total
- Cycle: currently irregular, recent cycles 54–80+ days. Luteal phase = lower HRV, poorer sleep, higher appetite, lower motivation. Acknowledge without over-attributing.
- Munich seasonal context: allergy season April–May, UV meaningful June–Sep
- Dietary coaching notes: low pre-workout protein → nudge cottage cheese. Berberine best timed with largest carb meal. Vitamin C within 1h of training boosts collagen synthesis. Natto days = double K2 benefit.
`.trim()

const CGM_INTERPRETATION = `
CGM DATA INTERPRETATION:
- Julie is metabolically healthy. Never flag values as concerning unless fasting glucose trends above 5.6 mmol/L for 3+ consecutive days.
- Peak glucose values are only meaningful in context of what was eaten. Read the meal description alongside the peak value. A 7.0 mmol/L after white rice is expected and unremarkable. A 7.0 after eggs and vegetables is notable and worth naming.
- Look for patterns across 30 days: which meal types correlate with higher peaks? Does training before eating reduce post-meal response? Does fasting glucose trend with sleep quality or cycle phase?
- Only surface a CGM insight when there is a genuine pattern — never on single data points. One spike means nothing. Three spikes after similar meals is a pattern worth naming explicitly.
- If CGM data is absent for a day or entirely, ignore it. Never prompt Julie to log it.
`.trim()

const TRAINING_INTERPRETATION = `
TRAINING LOAD INTERPRETATION:
- Intensity is derived from Zone 3+ minutes (time above ~135 bpm): 0–5 min = Easy, 6–15 min = Moderate, 16+ min = Hard.
- Always report Zone 3+ minutes alongside the intensity label and give the number meaning: "22 Zone 3+ minutes is a genuine aerobic stimulus."
- Track weekly Zone 3+ minute totals across the 30-day window. Flag if the current week is significantly higher than the recent 4-week average — this is a load spike worth monitoring against next-day HRV.
- Strength sessions (eGym): Zone 3+ minutes expected to be 0–5. Do not penalise low numbers. Note if unusually high as it may indicate circuit-style effort.
- Correlate Zone 3+ weekly load with next-day HRV across history. If a pattern exists, name it explicitly: "Your HRV tends to drop the day after weeks above 90 Zone 3+ minutes."
- CRITICAL: If training sessions are already logged in TODAY'S DATA, they are completed activities. Never recommend training that has already been done. Acknowledge what was accomplished.
`.trim()

const FOOD_CREATIVITY = `
DINNER SUGGESTION FRAMEWORK (afternoon horizon only):
- Check the last 14 days of logged meal descriptions. Do not repeat any primary ingredient combination already used.
- Draw inspiration from: Japanese, Korean, Chinese, Thai, Vietnamese, Mediterranean, Middle Eastern, Indian (all regions). Never suggest German or Bavarian cuisine.
- Prioritise seasonal Bavarian produce but treat it creatively. Asparagus in April belongs in a Japanese dashi broth or a Korean doenjang dressing — not a German Hollandaise.
- Suggest a forageable ingredient at most once per week, weighted toward weekend days. When suggesting, always include one sentence on where to find it near Munich and what to look for.
- One genuinely surprising suggestion per afternoon. If it feels obvious, think again.
`.trim()

const BAVARIA_FORAGING_TEMPLATE = `
MUNICH/BAVARIA SEASONAL FORAGING (current month: {currentMonth}):
March–April: Bärlauch (wild garlic, riverbanks and beech forests, smells strongly of garlic — key ID aid), Scharbockskraut (lesser celandine, damp lawns, heart-shaped leaves, only before yellow flowers appear), Giersch (ground elder, everywhere as garden weed, young leaves, parsley-like flavour), Brennnessel (stinging nettles, young tops only), Magnolia blossoms (peak March–April).
May–June: Holunderblüten (elderflower, everywhere), Linden young leaves (mild, raw in salads, linden trees throughout Munich streets), Waldmeister (sweet woodruff, shaded forest floors, excellent in cold infusions or panna cotta), Sauerampfer (sorrel, meadows and riverbanks, sharp lemony, pairs with fish and eggs), Gänseblümchen (daisy, flowers and young leaves, meadows), Fichtenspitzen (spruce tips, citrusy and resinous, excellent in tempura or oil infusions).
July–August: Wild raspberries (forest edges toward the Foothills), Holunderbeeren (elderberries, always cook before eating), Hagebutten (rosehips, high Vitamin C).
September–November: Steinpilze, Pfifferlinge, Maronen (forests south toward the Alps — Julie is trained), Schlehen (sloe berries, after first frost, hedgerows, extraordinary in ferments), Kornelkirsche (cornelian cherry, Munich parks and hedges, tart and complex, excellent in savory sauces), Walnüsse (fallen walnuts, parks and roadsides).
Year-round: Löwenzahn (dandelion, young leaves, flowers, roots), Wacholder (juniper berries, Bavarian forests).
`.trim()

// ─── Coach mode type ──────────────────────────────────────────────
type CoachMode = 'wakeup' | 'posttraining' | 'afternoon' | 'earlyevening' | 'endofday'

// ─── Determine time-of-day mode ───────────────────────────────────
function parseHour(currentTime: string | undefined): number {
  if (!currentTime) return NaN
  const timeStr = currentTime.includes('T')
    ? currentTime.split('T')[1].substring(0, 5)
    : currentTime.substring(0, 5)
  return parseInt(timeStr.split(':')[0], 10)
}

function getCoachMode(currentTime: string | undefined): CoachMode {
  if (!currentTime) return 'wakeup'
  const hour = parseHour(currentTime)
  if (isNaN(hour)) return 'wakeup'
  if (hour < 9)  return 'wakeup'
  if (hour < 12) return 'posttraining'
  if (hour < 17) return 'afternoon'
  if (hour < 20) return 'earlyevening'
  return 'endofday'
}

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
    ? t.sessions.map(sess => {
        const intensity = zone3Intensity(sess.zone3_plus_minutes)
        const zone3Str = sess.zone3_plus_minutes != null
          ? ` zone3+:${sess.zone3_plus_minutes}min(${intensity ?? '?'})`
          : ''
        return `${sess.activity_type} ${sess.duration_min}min${zone3Str}${sess.active_calories ? ` ${sess.active_calories}kcal` : ''}`
      }).join(' + ')
    : 'Rest'

  const meals: string[] = []
  if (n.pre_workout_snack.description) {
    const glucose = n.pre_workout_snack.peak_glucose_mmol != null ? ` [peak ${n.pre_workout_snack.peak_glucose_mmol}mmol]` : ''
    meals.push(`pre-workout: ${n.pre_workout_snack.description}${glucose}`)
  }
  if (n.breakfast.description) {
    const glucose = n.breakfast.peak_glucose_mmol != null ? ` [peak ${n.breakfast.peak_glucose_mmol}mmol]` : ''
    meals.push(`breakfast: ${n.breakfast.description}${glucose}`)
  }
  if (n.lunch.description) {
    const glucose = n.lunch.peak_glucose_mmol != null ? ` [peak ${n.lunch.peak_glucose_mmol}mmol]` : ''
    meals.push(`lunch: ${n.lunch.description}${glucose}`)
  }
  if (n.dinner.description) {
    const glucose = n.dinner.peak_glucose_mmol != null ? ` [peak ${n.dinner.peak_glucose_mmol}mmol]` : ''
    meals.push(`dinner: ${n.dinner.description}${glucose}`)
  }
  if (n.incidentals.description) {
    const glucose = n.incidentals.peak_glucose_mmol != null ? ` [peak ${n.incidentals.peak_glucose_mmol}mmol]` : ''
    meals.push(`incidentals: ${n.incidentals.description}${glucose}`)
  }

  const contextCd = (c as unknown as Record<string, unknown>).cycle_day
  const effectiveCd = cd ?? (typeof contextCd === 'number' ? contextCd : null)

  const fastingGlucose = s.fasting_glucose_mmol != null ? ` | Fasting glucose ${s.fasting_glucose_mmol}mmol/L` : ''

  const lines = [
    `Date: ${entry.date}`,
    `Sleep: ${durationH} | HRV ${s.hrv ?? '?'}ms | RHR ${s.rhr ?? '?'}bpm | Rested ${s.rested ?? '?'}/5 | Bedtime ${s.bedtime ?? '?'}${fastingGlucose}`,
    `Training: ${sessions}${t.cycled_today ? ` | Cycled${t.cycling_minutes ? ` ${t.cycling_minutes}min` : ''}` : ''}`,
    `Nutrition: protein ${n.total_protein ?? '?'}g | fiber ${n.total_fiber ?? '?'}g | fat ${n.total_fat ?? '?'}g | carbs ${n.total_carbs ?? '?'}g | ${n.total_calories ?? '?'}kcal`,
    meals.length ? `Meals: ${meals.join(' / ')}` : null,
    `Supplements: morning ${sup.morning_stack_taken ? '✓' : '✗'}${sup.morning_exceptions.length ? ` (skipped: ${sup.morning_exceptions.join(', ')})` : ''} | evening ${sup.evening_stack_taken ? '✓' : '✗'} | progesterone ${sup.progesterone_taken ? '✓' : '✗'} | estradiol ${sup.estradiol_taken ? '✓' : '✗'}`,
    `Context: cycle day ${effectiveCd ?? '?'}${c.symptoms.length ? ` | symptoms: ${c.symptoms.join(', ')}` : ''}${c.travelling ? ' | travelling' : ''}${c.notes ? ` | "${c.notes}"` : ''}`,
    `Hydration: ${entry.hydration_ml != null ? `${entry.hydration_ml}ml` : 'not logged'}`,
  ].filter(Boolean)

  return lines.join('\n')
}

// ─── Determine training tier for today ───────────────────────────
function getTrainingTier(sessions: DailyEntry['training']['sessions']): string {
  if (sessions.length === 0) return 'Rest day'
  const totalZone3 = sessions.reduce((sum, s) => sum + (s.zone3_plus_minutes ?? 0), 0)
  const sessionCount = sessions.length
  if (sessionCount >= 2 && totalZone3 >= 30) return 'Very high'
  if (sessionCount >= 2 || totalZone3 >= 16) return 'High'
  if (totalZone3 >= 6) return 'Moderate'
  return 'Light'
}

// ─── Build full context block ──────────────────────────────────────
function buildContext(
  history30: DailyEntry[],
  today: DailyEntry,
  cycleDay: number | null,
  currentDate: string,
  currentMonth: string,
): string {
  const BAVARIA_FORAGING = BAVARIA_FORAGING_TEMPLATE.replace('{currentMonth}', currentMonth)

  const historyStr = history30
    .filter(e => e.date !== today.date)
    .map(e => formatEntry(e))
    .join('\n\n')

  const tier = getTrainingTier(today.training.sessions)

  return [
    JULIE_PROFILE,
    '',
    CGM_INTERPRETATION,
    '',
    TRAINING_INTERPRETATION,
    '',
    FOOD_CREATIVITY,
    '',
    BAVARIA_FORAGING,
    '',
    `CURRENT CONTEXT`,
    `Date: ${currentDate} | Month: ${currentMonth} | Cycle day: ${cycleDay ?? '?'} | Training tier today: ${tier}`,
    `Current symptoms: ${today.context.symptoms.length ? today.context.symptoms.join(', ') : 'none'}`,
    '',
    `TODAY'S DATA`,
    formatEntry(today, cycleDay),
    '',
    `LAST 30 DAYS`,
    historyStr || '(no prior entries)',
  ].join('\n')
}

// ─── Fetch last 30 days + today from Supabase ─────────────────────
async function getCoachContext(
  userId: string | null,
  currentDate: string,
): Promise<{ history30: DailyEntry[]; todayEntry: DailyEntry | null }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
  )

  const since = new Date(currentDate + 'T00:00:00')
  since.setDate(since.getDate() - 30)
  const sinceStr = since.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('daily_entries')
    .select('*')
    .gte('date', sinceStr)
    .order('date', { ascending: false })

  if (error) throw error

  const history30: DailyEntry[] = (data || []).map((row) =>
    rowToEntry(row as Record<string, unknown>)
  )

  const todayEntry = history30.find(e => e.date === currentDate) ?? null

  void userId

  return { history30, todayEntry }
}

// ─── Build mode-specific briefing prompt ─────────────────────────
function buildBriefingPrompt(
  ctx: string,
  mode: CoachMode,
  today: DailyEntry,
  currentDate: string,
): string {
  if (mode === 'wakeup') {
    return `${ctx}

---

You are Julie's personal health coach. It is WAKE-UP time (before 09:00) — generate a sleep and recovery briefing with today's training recommendation.

WAKEUP RULES:
- Analyse last night's sleep: duration, HRV vs baseline (88ms), RHR vs baseline (52 bpm), rested score, bedtime vs target (21:45), fasting glucose if logged.
- Apply HRV framework strictly for training recommendation. Never recommend full rest unless HRV < 50ms or she is sick.
- Look across 30-day history for correlations: HRV vs cycle day, HRV vs previous day's Zone 3+ minutes, sleep quality vs bedtime, fasting glucose trends. Surface one genuinely interesting pattern if it exists. Never generic.
- Do NOT mention nutrition, supplements, or anything other than sleep, recovery, and today's training recommendation.
- Question: one thing you're genuinely curious about given her data.

Return ONLY valid JSON with exactly these five fields:
{
  "recovery": "Sleep analysis with specific numbers — HRV vs 88ms baseline, RHR vs 52 bpm, duration vs 7h30–8h30 target, rested score, bedtime. Include fasting glucose if logged.",
  "training": "Specific training recommendation based on HRV framework. Name the activity and intensity. Never recommend full rest unless HRV < 50ms or sick.",
  "nutrition": null,
  "insight": "One genuinely interesting pattern or correlation from 30-day history. Never generic. null if nothing genuine to say.",
  "question": "One question you're genuinely curious about given her data."
}

Rules: Direct and warm. Never generic. Use her actual numbers. No markdown inside JSON strings.`
  }

  if (mode === 'posttraining') {
    const hasTrainingLogged = today.training.sessions.length > 0
    const hasNutritionLogged = !!(today.nutrition.breakfast.description || today.nutrition.pre_workout_snack.description)

    return `${ctx}

---

You are Julie's personal health coach. It is POST-TRAINING time (09:00–11:59) — morning nutrition guidance based on what has happened.

POSTTRAINING RULES:
- CRITICAL: Check TODAY'S DATA training sessions. If sessions are logged, they are COMPLETED. Acknowledge what was done. Never recommend training already logged.
- Today's training logged: ${hasTrainingLogged ? today.training.sessions.map(s => `${s.activity_type} ${s.duration_min}min${s.zone3_plus_minutes != null ? ` (zone3+: ${s.zone3_plus_minutes}min)` : ''}`).join(', ') : 'none yet'}.
- Check today's nutrition. ${hasNutritionLogged ? 'Meals already logged — comment on what has been eaten and what macro gaps remain.' : 'No meals logged yet — give specific food recommendation based on what was trained (or not). If trained hard (16+ zone3+ min): prioritise protein and carbs for recovery. If easy or no training: lighter protein focus.'}
- Check if morning supplements logged. If not, brief reminder.
- No calorie warnings. Julie does not overeat.
- Set recovery to null unless something notable from sleep worth carrying forward.

Return ONLY valid JSON with exactly these five fields:
{
  "recovery": null,
  "training": "Acknowledge completed sessions by name. Brief note on load. If no training yet and it is a training day, gentle nudge.",
  "nutrition": "Specific post-training food recommendation or current day macro gap analysis. Name actual foods.",
  "insight": "Supplement reminder if morning stack not taken, otherwise a brief useful observation. One sentence.",
  "question": null
}

Rules: Direct and warm. Use her actual numbers. No markdown inside JSON strings.`
  }

  if (mode === 'afternoon') {
    const dayOfWeek = new Date(currentDate + 'T00:00:00').getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    return `${ctx}

---

You are Julie's personal health coach. It is AFTERNOON (12:00–16:59) — hydration, supplement reminder, movement nudge if needed, creative dinner suggestion.

AFTERNOON RULES:
- Hydration: check today's logged hydration. If below 1500ml, nudge to drink before dinner. Weave naturally.
- Supplements: if morning_stack_taken is false, remind once. Keep brief.
- Movement: if no training logged and no cycling, gentle nudge to move. If training is already logged, acknowledge and skip.
- Dinner suggestion: apply FOOD_CREATIVITY framework. Check the last 14 days of logged meals in the data. One surprising, seasonal, creative suggestion. Include preparation approach, not just ingredient. This is the most important part of the afternoon briefing.
- Foraging: it is ${isWeekend ? 'a weekend' : 'a weekday'} — ${isWeekend ? 'consider a forageable suggestion if relevant to the season.' : 'skip foraging suggestion today (weekday).'}
- Set recovery and question to null.

Return ONLY valid JSON with exactly these five fields:
{
  "recovery": null,
  "training": null,
  "nutrition": "One surprising, creative dinner suggestion. Seasonal. Not from recent meal history. Include preparation approach and why it works nutritionally. If weekend, optionally include a forageable ingredient with where to find it near Munich.",
  "insight": "Hydration note if behind. Supplement reminder if morning stack not taken. Combined into one natural sentence.",
  "question": null
}

Rules: Dinner suggestion must feel genuinely creative — not obvious. Use her actual hydration data. No markdown inside JSON strings.`
  }

  if (mode === 'earlyevening') {
    return `${ctx}

---

You are Julie's personal health coach. It is EARLY EVENING (17:00–19:59) — supplement and hormone check, hydration close-out.

EARLYEVENING RULES:
- Check progesterone and estradiol logged. If not, remind.
- Check evening stack logged. If not, remind.
- Check hydration. If below 2000ml on rest day or 2500ml on training day (check today's sessions), flag.
- Maximum 3 sentences total. No nutrition advice. No training advice.
- Set recovery, training, question to null.

Return ONLY valid JSON with exactly these five fields:
{
  "recovery": null,
  "training": null,
  "nutrition": null,
  "insight": "Supplement check (progesterone, estradiol, evening stack) and hydration close-out. Max 3 sentences combined.",
  "question": null
}

Rules: Brief. Use her actual logged data. No markdown inside JSON strings.`
  }

  // endofday
  const tier = getTrainingTier(today.training.sessions)
  const napLine = today.sleep.nap_minutes != null
    ? `Julie napped for ${today.sleep.nap_minutes} minutes today.`
    : ''

  return `${ctx}${napLine ? `\nRECOVERY NOTE: ${napLine}` : ''}

---

You are Julie's personal health coach. It is END OF DAY (20:00+) — full day retrospective and 30-day pattern analysis.

ENDOFDAY RULES:
- Review today fully: sleep quality, training load (Zone 3+ minutes total and intensity), nutrition against tiered targets, supplements, hydration, fasting glucose and meal peaks if logged.
- Today's training tier is: ${tier}. Use the matching calorie and macro targets from JULIE'S HEALTH PROFILE — not generic targets.
- Apply CGM_INTERPRETATION framework. Surface patterns if present across 30 days. Never flag absence of CGM data.
- Apply TRAINING_INTERPRETATION framework. Report Zone 3+ minutes, weekly total vs recent 4-week average.
- Look across 30-day history for one genuinely interesting observation — a pattern, correlation, or trend worth naming. This is the most important field. Never generic.
- Bedtime nudge: it is after 20:00 — include target bedtime (21:45) naturally in the insight.
- Set question to null.

Return ONLY valid JSON with exactly these five fields:
{
  "recovery": "Sleep quality review with actual numbers. HRV and RHR vs baselines. Fasting glucose if logged.",
  "training": "Today's training review — Zone 3+ minutes and intensity label. Weekly Zone 3+ total and comparison to recent average. What it means for tomorrow.",
  "nutrition": "Full day nutrition review against today's tiered targets (${tier}). Call out protein and fiber gaps. Supplement adherence if incomplete. Hydration.",
  "insight": "The single most interesting pattern from 30-day history. Plus bedtime nudge (target: 21:45). Never generic.",
  "question": null
}

Rules: Reflective and warm. Use her actual numbers. No markdown inside JSON strings.`
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
    const currentMonth = new Date(currentDate + 'T00:00:00').toLocaleString('en-US', { month: 'long' })

    const { history30 } = await getCoachContext(null, currentDate)

    const ctx = buildContext(history30, today, cycleDay, currentDate, currentMonth)
    const mode = getCoachMode(currentTime)

    if (type === 'briefing') {
      const prompt = buildBriefingPrompt(ctx, mode, today, currentDate)

      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      })

      const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      const briefing = jsonMatch ? JSON.parse(jsonMatch[0]) : { recovery: raw }

      return Response.json({ briefing, mode })

    } else {
      // Reactive chat — mode-aware system prompt
      const napNote = today.sleep.nap_minutes != null
        ? ` Julie napped for ${today.sleep.nap_minutes} minutes today — include in recovery context.`
        : ''
      const modeContext = mode === 'wakeup'
        ? 'It is WAKE-UP time. Focus on sleep, recovery, and training recommendation. Do not reference today\'s nutrition totals — the day has just started.'
        : mode === 'posttraining'
        ? 'It is POST-TRAINING time. Morning tone. Reference what was trained and what she should eat. Check if training is already logged before making recommendations.'
        : mode === 'afternoon'
        ? 'It is AFTERNOON. Reference what she has logged so far today. Dinner suggestions welcome.'
        : mode === 'earlyevening'
        ? `It is EARLY EVENING. Brief and practical. Supplement and hydration focus.${napNote}`
        : `It is END OF DAY. Reflective tone. The full day is visible — reference totals and gaps freely.${napNote}`

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
