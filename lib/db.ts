import { createClient } from '@supabase/supabase-js'
import type { DailyEntry, TrainingSession, Symptom, BiomarkerReading, HealthAppointment, GoalsData } from './types'
import { emptyEntry } from './types'
import { behaviorScore, outcomeScore } from './scores'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── rowToEntry: flat Supabase row + sessions → DailyEntry ────────
export function rowToEntry(row: Record<string, unknown>, sessions: TrainingSession[] = []): DailyEntry {
  const r = row
  return {
    date: r.date as string,
    sleep: {
      bedtime:              (r.bedtime              as string  | null) ?? null,
      duration_min:         (r.sleep_duration_min   as number  | null) ?? null,
      hrv:                  (r.hrv                  as number  | null) ?? null,
      rhr:                  (r.rhr                  as number  | null) ?? null,
      rested:               (r.rested               as number  | null) ?? null,
      nap_minutes:          (r.nap_minutes          as number  | null) ?? null,
      fasting_glucose_mmol: (r.fasting_glucose_mmol as number  | null) ?? null,
    },
    training: {
      sessions,
      cycled_today:     (r.cycled_today     as boolean | null) ?? false,
      cycling_minutes:  (r.cycling_minutes  as number  | null) ?? null,
      cycling_calories: (r.cycling_calories as number  | null) ?? null,
    },
    nutrition: {
      pre_workout_snack: {
        description:       (r.pre_workout_snack          as string) ?? '',
        protein:           (r.pre_workout_snack_protein  as number | null) ?? null,
        fiber:             (r.pre_workout_snack_fiber    as number | null) ?? null,
        fat:               (r.pre_workout_snack_fat      as number | null) ?? null,
        carbs:             (r.pre_workout_snack_carbs    as number | null) ?? null,
        calories:          (r.pre_workout_snack_calories as number | null) ?? null,
        peak_glucose_mmol: null,  // stored in JSONB — read automatically if present
      },
      breakfast: {
        template_name:     (r.breakfast_template    as string  | null) ?? null,
        description:       (r.breakfast_description as string) ?? '',
        protein:           (r.breakfast_protein     as number  | null) ?? null,
        fiber:             (r.breakfast_fiber       as number  | null) ?? null,
        fat:               (r.breakfast_fat         as number  | null) ?? null,
        carbs:             (r.breakfast_carbs       as number  | null) ?? null,
        calories:          (r.breakfast_calories    as number  | null) ?? null,
        peak_glucose_mmol: null,
      },
      lunch: {
        description:       (r.lunch_description as string) ?? '',
        protein:           (r.lunch_protein     as number | null) ?? null,
        fiber:             (r.lunch_fiber       as number | null) ?? null,
        fat:               (r.lunch_fat         as number | null) ?? null,
        carbs:             (r.lunch_carbs       as number | null) ?? null,
        calories:          (r.lunch_calories    as number | null) ?? null,
        peak_glucose_mmol: null,
      },
      dinner: {
        description:       (r.dinner_description as string) ?? '',
        protein:           (r.dinner_protein     as number | null) ?? null,
        fiber:             (r.dinner_fiber       as number | null) ?? null,
        fat:               (r.dinner_fat         as number | null) ?? null,
        carbs:             (r.dinner_carbs       as number | null) ?? null,
        calories:          (r.dinner_calories    as number | null) ?? null,
        peak_glucose_mmol: null,
      },
      incidentals: {
        description:       (r.incidentals_description as string) ?? '',
        protein:           (r.incidentals_protein     as number | null) ?? null,
        fiber:             (r.incidentals_fiber       as number | null) ?? null,
        fat:               (r.incidentals_fat         as number | null) ?? null,
        carbs:             (r.incidentals_carbs       as number | null) ?? null,
        calories:          (r.incidentals_calories    as number | null) ?? null,
        peak_glucose_mmol: null,
      },
      total_protein:  (r.total_protein  as number | null) ?? null,
      total_fiber:    (r.total_fiber    as number | null) ?? null,
      total_fat:      (r.total_fat      as number | null) ?? null,
      total_carbs:    (r.total_carbs    as number | null) ?? null,
      total_calories: (r.total_calories as number | null) ?? null,
    },
    supplements: {
      morning_stack_taken:      (r.morning_stack_taken      as boolean | null) ?? false,
      morning_exceptions:       [],   // no flat column — runtime-only
      evening_stack_taken:      (r.evening_stack_taken      as boolean | null) ?? false,
      evening_exceptions:       [],   // no flat column — runtime-only
      progesterone_taken:       (r.progesterone_taken       as boolean | null) ?? false,
      progesterone_mg:          (r.progesterone_mg          as number  | null) ?? null,
      estradiol_taken:          (r.estradiol_taken          as boolean | null) ?? false,
      estradiol_sprays:         (r.estradiol_sprays         as number  | null) ?? null,
      ashwagandha_taken:        (r.ashwagandha_taken        as boolean | null) ?? false,
      dim_taken:                (r.dim_taken                as boolean | null) ?? false,
      phosphatidylserine_taken: (r.phosphatidylserine_taken as boolean | null) ?? false,
    },
    context: {
      symptoms:   (r.symptoms   as Symptom[]) ?? [],
      travelling: (r.travelling as boolean | null) ?? false,
      notes:      (r.notes      as string) ?? '',
      // cycle_day persisted as top-level column, surfaced here for runtime use
      ...(r.cycle_day != null ? { cycle_day: r.cycle_day as number } : {}),
    } as DailyEntry['context'],
    hydration_ml: (r.hydration_ml as number | null) ?? null,
  }
}

// ─── Load training sessions for a set of dates ────────────────────
async function loadSessionsForDates(dates: string[]): Promise<Record<string, TrainingSession[]>> {
  if (!dates.length) return {}
  const { data, error } = await supabase
    .from('training_sessions')
    .select('*')
    .in('date', dates)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Failed to load training_sessions:', JSON.stringify(error))
    return {}
  }

  const map: Record<string, TrainingSession[]> = {}
  for (const row of data ?? []) {
    const d = row.date as string
    if (!map[d]) map[d] = []
    map[d].push({
      id:                row.id                as string,
      activity_type:     row.activity_type     as string,
      duration_min:      row.duration_min      as number,
      zone3_plus_minutes: (row.zone3_plus_minutes as number | null) ?? null,
      active_calories:   (row.active_calories  as number | null) ?? null,
    })
  }
  return map
}

// ─── saveEntry ────────────────────────────────────────────────────
export async function saveEntry(entry: DailyEntry): Promise<void> {
  const cycleDay = (entry.context as unknown as Record<string, unknown>).cycle_day as number | undefined

  const flat = {
    user_id:    'julie',
    date:       entry.date,
    updated_at: new Date().toISOString(),

    // Sleep
    bedtime:              entry.sleep.bedtime,
    sleep_duration_min:   entry.sleep.duration_min,
    hrv:                  entry.sleep.hrv,
    rhr:                  entry.sleep.rhr,
    rested:               entry.sleep.rested,
    nap_minutes:          entry.sleep.nap_minutes ?? null,
    fasting_glucose_mmol: entry.sleep.fasting_glucose_mmol ?? null,

    // Training (cycled only — sessions go to training_sessions table)
    cycled_today:     entry.training.cycled_today,
    cycling_minutes:  entry.training.cycling_minutes,
    cycling_calories: entry.training.cycling_calories ?? null,

    // Nutrition
    pre_workout_snack:          entry.nutrition.pre_workout_snack.description || null,
    pre_workout_snack_protein:  entry.nutrition.pre_workout_snack.protein,
    pre_workout_snack_fiber:    entry.nutrition.pre_workout_snack.fiber,
    pre_workout_snack_fat:      entry.nutrition.pre_workout_snack.fat,
    pre_workout_snack_carbs:    entry.nutrition.pre_workout_snack.carbs,
    pre_workout_snack_calories: entry.nutrition.pre_workout_snack.calories,

    breakfast_template:    entry.nutrition.breakfast.template_name,
    breakfast_description: entry.nutrition.breakfast.description || null,
    breakfast_protein:     entry.nutrition.breakfast.protein,
    breakfast_fiber:       entry.nutrition.breakfast.fiber,
    breakfast_fat:         entry.nutrition.breakfast.fat,
    breakfast_carbs:       entry.nutrition.breakfast.carbs,
    breakfast_calories:    entry.nutrition.breakfast.calories,

    lunch_description: entry.nutrition.lunch.description || null,
    lunch_protein:     entry.nutrition.lunch.protein,
    lunch_fiber:       entry.nutrition.lunch.fiber,
    lunch_fat:         entry.nutrition.lunch.fat,
    lunch_carbs:       entry.nutrition.lunch.carbs,
    lunch_calories:    entry.nutrition.lunch.calories,

    dinner_description: entry.nutrition.dinner.description || null,
    dinner_protein:     entry.nutrition.dinner.protein,
    dinner_fiber:       entry.nutrition.dinner.fiber,
    dinner_fat:         entry.nutrition.dinner.fat,
    dinner_carbs:       entry.nutrition.dinner.carbs,
    dinner_calories:    entry.nutrition.dinner.calories,

    incidentals_description: entry.nutrition.incidentals.description || null,
    incidentals_protein:     entry.nutrition.incidentals.protein,
    incidentals_fiber:       entry.nutrition.incidentals.fiber,
    incidentals_fat:         entry.nutrition.incidentals.fat,
    incidentals_carbs:       entry.nutrition.incidentals.carbs,
    incidentals_calories:    entry.nutrition.incidentals.calories,

    total_protein:  entry.nutrition.total_protein,
    total_fiber:    entry.nutrition.total_fiber,
    total_fat:      entry.nutrition.total_fat,
    total_carbs:    entry.nutrition.total_carbs,
    total_calories: entry.nutrition.total_calories,

    // Supplements
    morning_stack_taken:      entry.supplements.morning_stack_taken,
    evening_stack_taken:      entry.supplements.evening_stack_taken,
    progesterone_taken:       entry.supplements.progesterone_taken,
    progesterone_mg:          entry.supplements.progesterone_mg,
    estradiol_taken:          entry.supplements.estradiol_taken,
    estradiol_sprays:         entry.supplements.estradiol_sprays,
    ashwagandha_taken:        entry.supplements.ashwagandha_taken,
    dim_taken:                entry.supplements.dim_taken,
    phosphatidylserine_taken: entry.supplements.phosphatidylserine_taken,

    // Context
    cycle_day:  cycleDay ?? null,
    travelling: entry.context.travelling,
    symptoms:   entry.context.symptoms,
    notes:      entry.context.notes || null,

    // Hydration
    hydration_ml: entry.hydration_ml ?? null,

    // Computed scores
    behavior_score: behaviorScore(entry),
    outcome_score:  outcomeScore(entry),
  }

  const { error: upsertError } = await supabase
    .from('daily_entries')
    .upsert(flat, { onConflict: 'user_id,date' })

  if (upsertError) {
    console.error('saveEntry upsert error:', JSON.stringify(upsertError))
    throw upsertError
  }

  // ── Training sessions: replace all for this date ───────────────
  const { error: deleteError } = await supabase
    .from('training_sessions')
    .delete()
    .eq('date', entry.date)
    .eq('user_id', 'julie')

  if (deleteError) {
    console.error('saveEntry delete sessions error:', JSON.stringify(deleteError))
    throw deleteError
  }

  if (entry.training.sessions.length > 0) {
    const { error: insertError } = await supabase
      .from('training_sessions')
      .insert(
        entry.training.sessions.map(s => ({
          user_id:            'julie',
          date:               entry.date,
          activity_type:      s.activity_type,
          duration_min:       s.duration_min,
          zone3_plus_minutes: s.zone3_plus_minutes ?? null,
          active_calories:    s.active_calories ?? null,
        }))
      )

    if (insertError) {
      console.error('saveEntry insert sessions error:', JSON.stringify(insertError))
      throw insertError
    }
  }
}

// ─── loadEntry ────────────────────────────────────────────────────
export async function loadEntry(date: string): Promise<DailyEntry> {
  const [rowResult, sessionsMap] = await Promise.all([
    supabase.from('daily_entries').select('*').eq('date', date).maybeSingle(),
    loadSessionsForDates([date]),
  ])

  if (rowResult.error) throw rowResult.error
  if (!rowResult.data) return emptyEntry(date)
  return rowToEntry(rowResult.data as Record<string, unknown>, sessionsMap[date] ?? [])
}

// ─── loadAllEntries ───────────────────────────────────────────────
export async function loadAllEntries(): Promise<DailyEntry[]> {
  const { data, error } = await supabase
    .from('daily_entries')
    .select('*')
    .order('date', { ascending: false })

  if (error) throw error
  const rows = (data ?? []) as Record<string, unknown>[]
  const dates = rows.map(r => r.date as string)
  const sessionsMap = await loadSessionsForDates(dates)
  return rows.map(r => rowToEntry(r, sessionsMap[r.date as string] ?? []))
}

// ─── loadRecentEntries ────────────────────────────────────────────
export async function loadRecentEntries(days: number): Promise<DailyEntry[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('daily_entries')
    .select('*')
    .gte('date', sinceStr)
    .order('date', { ascending: false })

  if (error) throw error
  const rows = (data ?? []) as Record<string, unknown>[]
  const dates = rows.map(r => r.date as string)
  const sessionsMap = await loadSessionsForDates(dates)
  return rows.map(r => rowToEntry(r, sessionsMap[r.date as string] ?? []))
}

// ─── isSleepLogged ────────────────────────────────────────────────
export async function isSleepLogged(date: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('daily_entries')
    .select('hrv, sleep_duration_min')
    .eq('date', date)
    .maybeSingle()

  if (error || !data) return false
  const r = data as Record<string, unknown>
  return r.hrv != null || r.sleep_duration_min != null
}

// ─── deriveCycleDay ───────────────────────────────────────────────
export async function deriveCycleDay(): Promise<number | null> {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yStr = yesterday.toISOString().split('T')[0]

  const { data } = await supabase
    .from('daily_entries')
    .select('cycle_day')
    .eq('date', yStr)
    .maybeSingle()

  if (!data) return null
  const prev = (data as Record<string, unknown>).cycle_day
  if (typeof prev !== 'number' || prev <= 0) return null
  return prev + 1
}

// ─── Breakfast templates (hardcoded) ─────────────────────────────
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

// ─── getGoalsData ─────────────────────────────────────────────────
export async function getGoalsData(): Promise<GoalsData> {
  const today = new Date().toISOString().split('T')[0]
  const since7d = new Date()
  since7d.setDate(since7d.getDate() - 7)
  const since7dStr = since7d.toISOString().split('T')[0]

  const [scoresRes, biomarkersRes, glucoseRes, appointmentsRes] = await Promise.all([
    supabase
      .from('daily_entries')
      .select('behavior_score, outcome_score')
      .eq('user_id', 'julie')
      .eq('date', today)
      .maybeSingle(),
    supabase
      .from('biomarker_readings')
      .select('*')
      .eq('user_id', 'julie')
      .in('marker', ['vo2_max', 'ldl', 'hdl', 'hba1c'])
      .order('recorded_on', { ascending: false }),
    supabase
      .from('daily_entries')
      .select('fasting_glucose_mmol')
      .eq('user_id', 'julie')
      .gte('date', since7dStr)
      .lte('date', today)
      .order('date', { ascending: false }),
    supabase
      .from('health_appointments')
      .select('*')
      .eq('user_id', 'julie')
      .order('next_due_date', { ascending: true, nullsFirst: false }),
  ])

  const sr = scoresRes.data as Record<string, unknown> | null
  const todayScores = {
    behavior_score: sr ? (sr.behavior_score as number | null) : null,
    outcome_score:  sr ? (sr.outcome_score  as number | null) : null,
  }

  const biomarkers = (biomarkersRes.data ?? []) as BiomarkerReading[]

  const fastingGlucose7d = ((glucoseRes.data ?? []) as Record<string, unknown>[])
    .map(row => row.fasting_glucose_mmol as number | null)

  const appointments = (appointmentsRes.data ?? []) as HealthAppointment[]

  return { todayScores, biomarkers, fastingGlucose7d, appointments }
}

// ─── saveHealthAppointment ────────────────────────────────────────
export async function saveHealthAppointment(data: {
  id: string
  last_completed_date?: string | null
  next_due_date?: string | null
  notes?: string | null
}): Promise<void> {
  const { id, ...fields } = data
  const { error } = await supabase
    .from('health_appointments')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', 'julie')
  if (error) throw error
}

// ─── fetchHealthAppointments ──────────────────────────────────────
export async function fetchHealthAppointments() {
  const { data, error } = await supabase
    .from('health_appointments')
    .select('*')
    .eq('user_id', 'julie')
    .order('next_due_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as import('./types').HealthAppointment[]
}

// ─── seedDefaultAppointments ─────────────────────────────────────
// Inserts default appointment rows if the table is empty for this user.
export async function seedDefaultAppointments(): Promise<void> {
  const defaults = [
    { appointment_type: 'dermatologist',    interval_months: 6   },
    { appointment_type: 'dentist',          interval_months: 6   },
    { appointment_type: 'gynaecologist',    interval_months: 12  },
    { appointment_type: 'full_bloodwork',   interval_months: 12  },
    { appointment_type: 'breast_scan',      interval_months: 12  },
    { appointment_type: 'thyroid_scan',     interval_months: 12  },
    { appointment_type: 'eye_optometrist',  interval_months: 12  },
    { appointment_type: 'bone_density_scan', interval_months: 24 },
    { appointment_type: 'colonoscopy',      interval_months: 120 },
  ]
  const { error } = await supabase
    .from('health_appointments')
    .insert(defaults.map(d => ({ ...d, user_id: 'julie' })))
  if (error) throw error
}

// ─── getVo2SparklineData ──────────────────────────────────────────
export async function getVo2SparklineData(): Promise<BiomarkerReading[]> {
  const { data, error } = await supabase
    .from('biomarker_readings')
    .select('*')
    .eq('user_id', 'julie')
    .eq('marker', 'vo2_max')
    .order('recorded_on', { ascending: true })
    .limit(6)

  if (error) throw error
  return (data ?? []) as BiomarkerReading[]
}

// ─── saveVo2Reading ───────────────────────────────────────────────
export async function saveVo2Reading(value: number, date: string): Promise<void> {
  const { error } = await supabase
    .from('biomarker_readings')
    .insert({
      user_id:     'julie',
      marker:      'vo2_max',
      value,
      unit:        'ml/kg/min',
      recorded_on: date,
    })

  if (error) throw error
}

// ─── saveCardioReading ────────────────────────────────────────────
// Inserts LDL and HDL rows sharing one recorded_on date so the ratio
// trend sparkline can pair them cleanly.
export async function saveCardioReading(ldl: number, hdl: number, date: string): Promise<void> {
  const { error } = await supabase
    .from('biomarker_readings')
    .insert([
      { user_id: 'julie', marker: 'ldl', value: ldl, unit: 'mg/dL', recorded_on: date },
      { user_id: 'julie', marker: 'hdl', value: hdl, unit: 'mg/dL', recorded_on: date },
    ])

  if (error) throw error
}

// ─── fetch30DayHistory ────────────────────────────────────────────
// Returns 30 days of entries including training sessions, used for
// Training Load EWMA computation. Sessions are loaded via loadSessionsForDates.
export async function fetch30DayHistory(): Promise<DailyEntry[]> {
  return loadRecentEntries(30)
}

// ─── Breakfast templates (hardcoded) ─────────────────────────────
export async function loadBreakfastTemplates(): Promise<BreakfastTemplate[]> {
  return [
    { id: '1', name: 'Yogurt bowl',                 protein: 41, carbs: 55, fat: 36, fiber: 17, calories: 712 },
    { id: '2', name: 'Chickpea pancake + sardines', protein: 35, carbs: 28, fat: 12, fiber: 8,  calories: 360 },
    { id: '3', name: 'Cottage cheese pancakes',     protein: 32, carbs: 24, fat: 10, fiber: 2,  calories: 320 },
    { id: '4', name: 'Japanese rice & natto bowl',  protein: 35, carbs: 52, fat: 14, fiber: 6,  calories: 480 },
    { id: '5', name: 'Sourdough toast + egg',       protein: 18, carbs: 32, fat: 10, fiber: 3,  calories: 290 },
  ]
}
