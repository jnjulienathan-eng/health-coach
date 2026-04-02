import { createClient } from '@supabase/supabase-js'
import type { CheckinRecord, MealTemplate } from './types'
import { emptyCheckin } from './types'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
)

function rowToCheckin(row: Record<string, unknown>, date: string): CheckinRecord {
  const base = emptyCheckin(date)
  return {
    date: row.date as string,
    sleep: (row.sleep as CheckinRecord['sleep']) || base.sleep,
    feel: (row.feel as CheckinRecord['feel']) || base.feel,
    training_sessions: (row.training_sessions as CheckinRecord['training_sessions']) || [],
    meals: (row.meals as CheckinRecord['meals']) || [],
    hydration_ml: (row.hydration_ml as number | null) ?? null,
    supplements: (row.supplements as CheckinRecord['supplements']) || [],
    mindset: (row.mindset as CheckinRecord['mindset']) || base.mindset,
    context: (row.context as CheckinRecord['context']) || base.context,
  }
}

export async function loadCheckin(date: string): Promise<CheckinRecord> {
  const { data, error } = await supabase
    .from('checkins')
    .select('*')
    .eq('date', date)
    .maybeSingle()

  if (error) throw error
  if (!data) return emptyCheckin(date)
  return rowToCheckin(data, date)
}

export async function saveCheckin(record: CheckinRecord): Promise<void> {
  const { error } = await supabase.from('checkins').upsert(
    {
      date: record.date,
      sleep: record.sleep,
      feel: record.feel,
      training_sessions: record.training_sessions,
      meals: record.meals,
      hydration_ml: record.hydration_ml,
      supplements: record.supplements,
      mindset: record.mindset,
      context: record.context,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'date' }
  )
  if (error) throw error
}

export async function loadRecentCheckins(days: number): Promise<CheckinRecord[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('checkins')
    .select('*')
    .gte('date', sinceStr)
    .order('date', { ascending: false })

  if (error) throw error
  return (data || []).map((row) => rowToCheckin(row, row.date))
}

export async function loadMealTemplates(): Promise<MealTemplate[]> {
  const { data, error } = await supabase
    .from('meal_templates')
    .select('*')
    .order('sort_order')

  if (error) throw error
  return (data || []) as MealTemplate[]
}
