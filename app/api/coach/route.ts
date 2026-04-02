import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export async function POST() {
  try {
    const since = new Date()
    since.setDate(since.getDate() - 7)
    const sinceStr = since.toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('checkins')
      .select('*')
      .gte('date', sinceStr)
      .order('date', { ascending: true })

    if (error) throw error

    const rows = data || []

    if (!rows.length) {
      return Response.json({
        coaching: 'No check-in data found for the last 7 days. Start logging daily to get coaching.',
      })
    }

    const formatted = rows
      .map((row) => {
        const sleep = (row.sleep as Record<string, unknown>) || {}
        const feel = (row.feel as Record<string, unknown>) || {}
        const mindset = (row.mindset as Record<string, unknown>) || {}
        const context = (row.context as Record<string, unknown>) || {}
        const sessions = (row.training_sessions as Record<string, unknown>[]) || []
        const meals = (row.meals as Record<string, unknown>[]) || []

        const proteinTotal = meals.reduce(
          (s: number, m) => s + ((m.protein as number) ?? 0),
          0
        )
        const caloriesTotal = meals.reduce(
          (s: number, m) => s + ((m.calories as number) ?? 0),
          0
        )
        const flags = (context.flags as string[]) || []
        const sessionStr = sessions.length
          ? sessions
              .map(
                (s) =>
                  `${s.type}${s.duration_minutes ? ` ${s.duration_minutes}min` : ''}${s.rpe ? ` RPE${s.rpe}` : ''}`
              )
              .join(', ')
          : 'Rest'

        return [
          `Date: ${row.date}`,
          `Sleep: ${sleep.duration ?? '?'}h | HRV ${sleep.hrv ?? '?'}ms | RHR ${sleep.rhr ?? '?'}bpm | Deep ${sleep.deep_sleep_minutes ?? '?'}min | Wakes ${sleep.wake_events ?? '?'} | Waking score ${sleep.waking_score ?? '?'}/5${sleep.note ? ` | "${sleep.note}"` : ''}`,
          `Feel: Energy ${feel.energy ?? '?'}/5 | Mood ${feel.mood ?? '?'}/5`,
          `Training: ${sessionStr}`,
          `Nutrition: ${proteinTotal.toFixed(0)}g protein | ${caloriesTotal.toFixed(0)} kcal${row.hydration_ml ? ` | ${row.hydration_ml}ml water` : ''}`,
          `Mindset: Stress ${mindset.stress ?? '?'}/5 | Focus ${mindset.focus ?? '?'}/5${mindset.meditation_minutes ? ` | ${mindset.meditation_minutes}min meditation` : ''}`,
          `Context: ${flags.length ? flags.join(', ') : 'none'}${context.cycle_day ? ` | Cycle day ${context.cycle_day}` : ''}${context.note ? ` | "${context.note}"` : ''}`,
        ].join('\n')
      })
      .join('\n\n')

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1200,
      messages: [
        {
          role: 'user',
          content: `You are a precision health coach. Analyze the last 7 days of client data and give specific, evidence-based coaching. Be direct and data-driven — no generic advice.

Address:
1. Sleep quality & HRV trends (what the numbers actually mean)
2. Recovery vs training load balance
3. Nutrition — is protein target (130–140g) being hit? Caloric adequacy?
4. Energy/mood patterns and what's driving them
5. One clear priority action for the coming days

Keep it concise, specific, and practical. Use the data.

--- Last 7 days ---

${formatted}`,
        },
      ],
    })

    const coaching =
      message.content[0].type === 'text' ? message.content[0].text : 'No response generated.'

    return Response.json({ coaching })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: msg }, { status: 500 })
  }
}
