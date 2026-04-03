import { createClient } from '@supabase/supabase-js'
import type { DailyEntry } from './types'
import { emptyEntry } from './types'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
)

// Maps the JSONB checkins row → DailyEntry, filling missing fields with defaults.
function rowToEntry(row: Record<string, unknown>): DailyEntry {
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
}

export async function loadEntry(date: string): Promise<DailyEntry> {
  const { data, error } = await supabase
    .from('checkins')
    .select('*')
    .eq('date', date)
    .maybeSingle()

  if (error) throw error
  if (!data) return emptyEntry(date)
  return rowToEntry(data as Record<string, unknown>)
}

export async function saveEntry(entry: DailyEntry): Promise<void> {
  const { error } = await supabase.from('checkins').upsert(
    {
      date:        entry.date,
      sleep:       entry.sleep,
      training:    entry.training,
      nutrition:   entry.nutrition,
      supplements: entry.supplements,
      context:     entry.context,
      updated_at:  new Date().toISOString(),
    },
    { onConflict: 'date' }
  )
  if (error) {
    console.error('Supabase upsert error:', JSON.stringify(error))
    throw error
  }
}

export async function loadRecentEntries(days: number): Promise<DailyEntry[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('checkins')
    .select('*')
    .gte('date', sinceStr)
    .order('date', { ascending: false })

  if (error) throw error
  return (data || []).map((row) => rowToEntry(row as Record<string, unknown>))
}

// Check if a given date's sleep data has been logged
export async function isSleepLogged(date: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('checkins')
    .select('sleep')
    .eq('date', date)
    .maybeSingle()

  if (error || !data) return false
  const sleep = data.sleep as Record<string, unknown> | null
  if (!sleep) return false
  return sleep.hrv != null || sleep.duration_min != null
}

// Breakfast templates stored in meal_templates table
export interface BreakfastTemplate {
  id: string
  name: string
  protein: number | null
  fiber: number | null
  fat: number | null
  carbs: number | null
  calories: number | null
  description?: string
}

// Derive today's cycle day from yesterday's stored context.cycle_day + 1
export async function deriveCycleDay(): Promise<number | null> {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yStr = yesterday.toISOString().split('T')[0]

  const { data } = await supabase
    .from('checkins')
    .select('context')
    .eq('date', yStr)
    .maybeSingle()

  if (!data?.context) return null
  const ctx = data.context as Record<string, unknown>
  const prev = ctx.cycle_day
  if (typeof prev !== 'number' || prev <= 0) return null
  return prev + 1
}

export async function loadBreakfastTemplates(): Promise<BreakfastTemplate[]> {
  const { data, error } = await supabase
    .from('meal_templates')
    .select('*')
    .order('sort_order')

  if (error) throw error
  return (data || []) as BreakfastTemplate[]
}
