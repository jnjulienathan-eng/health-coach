// Server-only: recomputes behavior_score and outcome_score for a given date
// by reading daily_entries + daily_nutrition_summary and writing back the result.
// Import only from API routes and server components — never from client components.

import { supabase, rowToEntry, loadSessionsForDates } from './db'
import { supaAdmin, nutritionUserId } from './nutrition'
import { behaviorScore, outcomeScore } from './scores'
import type { NutritionSummaryForScore } from './scores'

export async function recomputeScores(date: string): Promise<void> {
  const adminClient = supaAdmin()
  const nutUserId   = nutritionUserId()

  const [entryResult, nutritionResult, sessionsMap] = await Promise.all([
    supabase.from('daily_entries').select('*').eq('date', date).maybeSingle(),
    adminClient
      .from('daily_nutrition_summary')
      .select('protein, fiber, meal_count')
      .eq('user_id', nutUserId)
      .eq('date', date)
      .maybeSingle(),
    loadSessionsForDates([date]),
  ])

  if (entryResult.error || !entryResult.data) return

  const entry = rowToEntry(
    entryResult.data as Record<string, unknown>,
    sessionsMap[date] ?? [],
  )

  let nutritionSummary: NutritionSummaryForScore | null = null
  if (!nutritionResult.error && nutritionResult.data) {
    const nr = nutritionResult.data as Record<string, unknown>
    nutritionSummary = {
      protein:    (nr.protein    as number | null) ?? null,
      fiber:      (nr.fiber      as number | null) ?? null,
      meal_count: (nr.meal_count as number | null) ?? null,
    }
  }

  const bScore = behaviorScore(entry, nutritionSummary)
  const oScore = outcomeScore(entry)

  const { error } = await supabase
    .from('daily_entries')
    .update({ behavior_score: bScore, outcome_score: oScore })
    .eq('date', date)
    .eq('user_id', 'julie')

  if (error) console.error('recomputeScores update error:', JSON.stringify(error))
}
