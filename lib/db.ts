import { createClient } from '@supabase/supabase-js'
import type { DailyEntry, TrainingSession, Symptom, BiomarkerReading, HealthAppointment, GoalsData, Glp1Injection, BodyCompositionData } from './types'
import { emptyEntry } from './types'

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
      apple_hrv_avg:        (r.apple_hrv_avg        as number  | null) ?? null,
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
      estradiol_am_taken:       (r.estradiol_am_taken       as boolean | null) ?? false,
      estradiol_am_sprays:      (r.estradiol_am_sprays      as number  | null) ?? null,
      estradiol_pm_taken:       (r.estradiol_pm_taken       as boolean | null) ?? false,
      estradiol_pm_sprays:      (r.estradiol_pm_sprays      as number  | null) ?? null,
      testosterone_taken:       (r.testosterone_taken       as boolean | null) ?? false,
      testosterone_pumps:       (r.testosterone_pumps       as number  | null) ?? null,
      ashwagandha_taken:        (r.ashwagandha_taken        as boolean | null) ?? false,
      dim_taken:                (r.dim_taken                as boolean | null) ?? false,
      phosphatidylserine_taken: (r.phosphatidylserine_taken as boolean | null) ?? false,
    },
    context: {
      symptoms:   (r.symptoms   as Symptom[]) ?? [],
      travelling: (r.travelling as boolean | null) ?? false,
      is_sick:    (r.is_sick    as boolean | null) ?? false,
      notes:      (r.notes      as string) ?? '',
      // cycle_day persisted as top-level column, surfaced here for runtime use
      ...(r.cycle_day != null ? { cycle_day: r.cycle_day as number } : {}),
    } as DailyEntry['context'],
    hydration_ml:        (r.hydration_ml        as number | null) ?? null,
    basal_calories:      (r.basal_calories      as number | null) ?? null,
    active_calories:     (r.active_calories     as number | null) ?? null,
    resting_hr_daytime:  (r.resting_hr_daytime  as number | null) ?? null,
    walking_hr_avg:      (r.walking_hr_avg      as number | null) ?? null,
    walking_running_km:  (r.walking_running_km  as number | null) ?? null,
  }
}

// ─── Load training sessions for a set of dates ────────────────────
export async function loadSessionsForDates(dates: string[]): Promise<Record<string, TrainingSession[]>> {
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
      start_time:        (row.start_time       as string | null) ?? null,
      external_id:       (row.external_id      as string | null) ?? null,
      source:            (row.source           as string | null) ?? null,
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
    // Webhook-owned fields: omit if null so saveEntry() never overwrites a
    // webhook-written value with null from stale in-memory state.
    ...(entry.sleep.duration_min != null ? { sleep_duration_min: entry.sleep.duration_min } : {}),
    hrv:                  entry.sleep.hrv,
    ...(entry.sleep.rhr != null ? { rhr: entry.sleep.rhr } : {}),
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
    estradiol_am_taken:       entry.supplements.estradiol_am_taken,
    estradiol_am_sprays:      entry.supplements.estradiol_am_sprays,
    estradiol_pm_taken:       entry.supplements.estradiol_pm_taken,
    estradiol_pm_sprays:      entry.supplements.estradiol_pm_sprays,
    testosterone_taken:       entry.supplements.testosterone_taken,
    testosterone_pumps:       entry.supplements.testosterone_pumps,
    ashwagandha_taken:        entry.supplements.ashwagandha_taken,
    dim_taken:                entry.supplements.dim_taken,
    phosphatidylserine_taken: entry.supplements.phosphatidylserine_taken,

    // Context
    cycle_day:  cycleDay ?? null,
    travelling: entry.context.travelling,
    is_sick:    entry.context.is_sick,
    symptoms:   entry.context.symptoms,
    notes:      entry.context.notes || null,

    // Hydration
    hydration_ml: entry.hydration_ml ?? null,

    // Scores are recomputed server-side via /api/scores after this save.
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
          start_time:         s.start_time ?? null,
          external_id:        s.external_id ?? null,
          source:             s.source ?? null,
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
      // 'visceral_fat_l' dropped from this filter — dead marker, rows retained
      // in the table but unread (see BODYCIPHER.md).
      .in('marker', ['vo2_max', 'ldl', 'hdl', 'hba1c', 'weight', 'body_fat_pct', 'waist_cm'])
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

  if (appointmentsRes.error) {
    console.error('getGoalsData: health_appointments query failed:', JSON.stringify(appointmentsRes.error))
  }
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
  if (error) {
    console.error('fetchHealthAppointments: query failed:', JSON.stringify(error))
    throw error
  }
  console.error('fetchHealthAppointments: returned', (data ?? []).length, 'rows')
  return (data ?? []) as import('./types').HealthAppointment[]
}

// ─── seedDefaultAppointments ─────────────────────────────────────
// Upserts default appointment rows, skipping any appointment_type that
// already exists for this user. Relies on the unique constraint on
// (user_id, appointment_type) — a concurrent/duplicate call is a
// harmless no-op rather than a duplicate insert.
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
  console.error('seedDefaultAppointments: attempting upsert, user_id=julie, row count=', defaults.length)
  const { error } = await supabase
    .from('health_appointments')
    .upsert(defaults.map(d => ({ ...d, user_id: 'julie' })), {
      onConflict: 'user_id,appointment_type',
      ignoreDuplicates: true,
    })
  if (error) {
    console.error('seedDefaultAppointments: upsert failed:', JSON.stringify(error))
    throw error
  }
  console.error('seedDefaultAppointments: upsert succeeded')
}

// ─── GLP-1 injections ─────────────────────────────────────────────
// Loads all rows (course is at most 24 injections — small table, no
// need to window the query). Ordered ascending by date for the grid.
export async function loadGlp1Injections(): Promise<Glp1Injection[]> {
  const { data, error } = await supabase
    .from('glp1_injections')
    .select('*')
    .eq('user_id', 'julie')
    .order('date', { ascending: true })
  if (error) {
    console.error('loadGlp1Injections: query failed:', JSON.stringify(error))
    throw error
  }
  return (data ?? []) as Glp1Injection[]
}

// ─── logGlp1Injection ─────────────────────────────────────────────
// injection_number is always (highest existing injection_number) + 1,
// regardless of whether `date` is today or a backfilled past date —
// it tracks logging order, not chronological dose order.
export async function logGlp1Injection(params: { date: string; dose_mg?: number; notes?: string | null }): Promise<Glp1Injection> {
  const { data: maxRow, error: maxErr } = await supabase
    .from('glp1_injections')
    .select('injection_number')
    .eq('user_id', 'julie')
    .order('injection_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxErr) throw maxErr
  const nextNumber = ((maxRow?.injection_number as number | undefined) ?? 0) + 1

  const { data, error } = await supabase
    .from('glp1_injections')
    .insert({
      user_id: 'julie',
      date: params.date,
      dose_mg: params.dose_mg ?? 2.5,
      injection_number: nextNumber,
      notes: params.notes ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Glp1Injection
}

// ─── getVo2SparklineData ──────────────────────────────────────────
export async function getVo2SparklineData(): Promise<BiomarkerReading[]> {
  const since = new Date()
  since.setDate(since.getDate() - 60)
  const sinceStr = since.toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('biomarker_readings')
    .select('*')
    .eq('user_id', 'julie')
    .eq('marker', 'vo2_max')
    .gte('recorded_on', sinceStr)
    .order('recorded_on', { ascending: true })

  if (error) throw error
  return (data ?? []) as BiomarkerReading[]
}

// ─── getBodyCompositionData ────────────────────────────────────────
// Body Composition card (v3). Two independent anchors:
//   - Anchor A: the earliest weight row ever recorded — feeds totalDelta
//     (headline "since Feb" number). Not date-windowed.
//   - Anchor B: the first date with BOTH a weight and a body_fat_pct
//     reading — feeds the fat/lean split, since fat mass can't be computed
//     before the first body-composition scan. Also not date-windowed — the
//     split always runs from the actual first paired reading, however old.
// Fat mass (weight × body_fat_pct / 100) is computed here and never stored;
// it only exists on dates where both a weight and a body_fat_pct row exist —
// never carried forward onto a date missing a body-fat reading.
// Chart series are the exception: those ARE windowed, to the trailing 60
// calendar days, at full density (one entry per day, null where no reading —
// same shape the Dashboard HrvChart already segments its polylines around).
export async function getBodyCompositionData(): Promise<BodyCompositionData> {
  const today = new Date()
  const windowStart = new Date(today)
  windowStart.setDate(windowStart.getDate() - 59)

  const [markersRes, earliestWeightRes, latestWeightRes] = await Promise.all([
    supabase
      .from('biomarker_readings')
      .select('*')
      .eq('user_id', 'julie')
      .in('marker', ['body_fat_pct', 'smm_kg', 'waist_cm'])
      .order('recorded_on', { ascending: true })
      .limit(500),
    supabase
      .from('biomarker_readings')
      .select('*')
      .eq('user_id', 'julie')
      .eq('marker', 'weight')
      .order('recorded_on', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('biomarker_readings')
      .select('*')
      .eq('user_id', 'julie')
      .eq('marker', 'weight')
      .order('recorded_on', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (markersRes.error) throw markersRes.error
  if (earliestWeightRes.error) throw earliestWeightRes.error
  if (latestWeightRes.error) throw latestWeightRes.error

  const markerRows  = (markersRes.data ?? []) as BiomarkerReading[]
  const bodyFatRows = markerRows.filter(r => r.marker === 'body_fat_pct')
  const smmRows     = markerRows.filter(r => r.marker === 'smm_kg')
  const waistRows   = markerRows.filter(r => r.marker === 'waist_cm')

  const anchorARow      = earliestWeightRes.data as BiomarkerReading | null
  const latestWeightRow = latestWeightRes.data as BiomarkerReading | null

  // Query 4: weight rows on the same dates as the body_fat_pct rows above —
  // this is what lets fat mass be computed without a per-date round trip.
  const bodyFatDates = bodyFatRows.map(r => r.recorded_on)
  const weightForBodyFatDatesRes = bodyFatDates.length > 0
    ? await supabase
        .from('biomarker_readings')
        .select('*')
        .eq('user_id', 'julie')
        .eq('marker', 'weight')
        .in('recorded_on', bodyFatDates)
    : { data: [] as BiomarkerReading[], error: null }

  if (weightForBodyFatDatesRes.error) throw weightForBodyFatDatesRes.error

  const weightByDate: Record<string, number> = {}
  for (const row of (weightForBodyFatDatesRes.data ?? []) as BiomarkerReading[]) {
    weightByDate[row.recorded_on] = row.value
  }
  const bodyFatByDate: Record<string, number> = {}
  for (const row of bodyFatRows) bodyFatByDate[row.recorded_on] = row.value
  const smmByDate: Record<string, number> = {}
  for (const row of smmRows) smmByDate[row.recorded_on] = row.value
  const waistByDate: Record<string, number> = {}
  for (const row of waistRows) waistByDate[row.recorded_on] = row.value

  const fatMassAt = (date: string) => weightByDate[date] * bodyFatByDate[date] / 100

  // Paired dates = dates with both a weight and a body_fat_pct reading, ascending.
  const pairedDates = bodyFatDates.filter(d => weightByDate[d] !== undefined).sort()
  const anchorBDate       = pairedDates[0] ?? null
  const latestPairedDate  = pairedDates[pairedDates.length - 1] ?? null

  const anchorA = anchorARow ? { date: anchorARow.recorded_on, value: anchorARow.value } : null
  const currentWeight     = latestWeightRow ? latestWeightRow.value : null
  const currentWeightDate = latestWeightRow ? latestWeightRow.recorded_on : null
  const totalDelta = (currentWeight != null && anchorA != null) ? currentWeight - anchorA.value : null

  let deltaFat: number | null = null
  let deltaWeight: number | null = null
  let deltaLeanWater: number | null = null
  let fatShare: number | null = null
  if (anchorBDate && latestPairedDate) {
    deltaFat = fatMassAt(latestPairedDate) - fatMassAt(anchorBDate)
    deltaWeight = weightByDate[latestPairedDate] - weightByDate[anchorBDate]
    deltaLeanWater = deltaWeight - deltaFat
    fatShare = deltaWeight !== 0 ? (deltaFat / deltaWeight) * 100 : null
  }
  const anchorB = anchorBDate ? { date: anchorBDate } : null

  const latestMuscle     = smmRows.length     > 0 ? { value: smmRows[smmRows.length - 1].value,         date: smmRows[smmRows.length - 1].recorded_on }     : null
  const latestBodyFatPct = bodyFatRows.length > 0 ? { value: bodyFatRows[bodyFatRows.length - 1].value, date: bodyFatRows[bodyFatRows.length - 1].recorded_on } : null
  const latestWaist      = waistRows.length   > 0 ? { value: waistRows[waistRows.length - 1].value,     date: waistRows[waistRows.length - 1].recorded_on }   : null

  // 60-day window, full density — one entry per calendar day, nulls left in
  // place for the component to segment around (no thinning, no smoothing).
  const chart1: BodyCompositionData['chart1'] = []
  const chart2: BodyCompositionData['chart2'] = []
  for (let i = 0; i < 60; i++) {
    const d = new Date(windowStart)
    d.setDate(d.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    const hasFatPair = weightByDate[dateStr] !== undefined && bodyFatByDate[dateStr] !== undefined
    chart1.push({
      date: dateStr,
      fatMass: hasFatPair ? fatMassAt(dateStr) : null,
      smmKg: smmByDate[dateStr] ?? null,
    })
    chart2.push({
      date: dateStr,
      waistCm: waistByDate[dateStr] ?? null,
    })
  }

  return {
    currentWeight,
    currentWeightDate,
    anchorA,
    totalDelta,
    anchorB,
    latestPairedDate,
    deltaFat,
    deltaWeight,
    deltaLeanWater,
    fatShare,
    latestMuscle,
    latestBodyFatPct,
    latestWaist,
    chart1,
    chart2,
  }
}

// ─── getVo2Rolling60DayAvg ────────────────────────────────────────
export async function getVo2Rolling60DayAvg(): Promise<number | null> {
  const since = new Date()
  since.setDate(since.getDate() - 60)
  const sinceStr = since.toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('biomarker_readings')
    .select('value')
    .eq('user_id', 'julie')
    .eq('marker', 'vo2_max')
    .gte('recorded_on', sinceStr)
  if (error) throw error
  const rows = (data ?? []) as { value: number }[]
  if (rows.length === 0) return null
  const avg = rows.reduce((sum, r) => sum + r.value, 0) / rows.length
  return parseFloat(avg.toFixed(1))
}

// ─── getHrvRolling28DayMedian ─────────────────────────────────────
// Personal HRV baseline: 28-day trailing MEDIAN of the manual `hrv`
// column (daily_entries.hrv), window ending at asOfDate inclusive
// (default = today in Europe/Berlin). Nulls skipped. Returns 88 (the
// historical default) when fewer than 14 non-null readings exist.
// Compute-not-store — no DB column. NOT computed from apple_hrv_avg.
export async function getHrvRolling28DayMedian(asOfDate?: string): Promise<number> {
  const endStr = asOfDate
    ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
  const start = new Date(endStr + 'T00:00:00Z')
  start.setUTCDate(start.getUTCDate() - 27) // 28 calendar days inclusive
  const startStr = start.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('daily_entries')
    .select('hrv')
    .eq('user_id', 'julie')
    .gte('date', startStr)
    .lte('date', endStr)
  if (error) throw error

  const values = ((data ?? []) as { hrv: number | null }[])
    .map(r => r.hrv)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b)

  if (values.length < 14) return 88

  const mid = Math.floor(values.length / 2)
  return values.length % 2 !== 0
    ? values[mid]
    : (values[mid - 1] + values[mid]) / 2
}

// ─── getBedtimeRolling30DayAvg ─────────────────────────────────────
// Rolling bedtime target: 30-day trailing circular average of the manual
// `bedtime` column (daily_entries.bedtime, HH:MM), window ending at
// asOfDate inclusive (default = today in Europe/Berlin). Nulls skipped.
// Returns '21:45' (the historical fixed target) when zero non-null
// bedtimes exist in the window. Compute-not-store — no DB column, no
// migration.
// Circular averaging: bedtimes cluster around midnight, so minutes are
// shifted -720 (centred on noon, where nobody's bedtime falls) before
// averaging to avoid the midnight-wraparound bug — e.g. 23:30 and 00:15
// must NOT average to ~11:52.
export async function getBedtimeRolling30DayAvg(asOfDate?: string): Promise<string> {
  const endStr = asOfDate
    ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
  const start = new Date(endStr + 'T00:00:00Z')
  start.setUTCDate(start.getUTCDate() - 29) // 30 calendar days inclusive
  const startStr = start.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('daily_entries')
    .select('bedtime')
    .eq('user_id', 'julie')
    .gte('date', startStr)
    .lte('date', endStr)
  if (error) throw error

  const values = ((data ?? []) as { bedtime: string | null }[])
    .map(r => r.bedtime)
    .filter((v): v is string => v != null)

  if (values.length === 0) return '21:45'

  const shifted = values.map(bedtime => {
    const [h, m] = bedtime.split(':').map(Number)
    return ((h * 60 + m) - 720 + 1440) % 1440
  })
  const avgShifted = shifted.reduce((a, b) => a + b, 0) / shifted.length
  const unshifted  = (Math.round(avgShifted) + 720) % 1440
  const h = Math.floor(unshifted / 60)
  const m = unshifted % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ─── getSleepDebtRolling7Day ────────────────────────────────────────
// 7-day trailing sleep debt: looks at the 7 days strictly BEFORE asOfDate
// (default = today in Europe/Berlin), not including asOfDate itself.
// For each of those days, skips it (counts neither deficit nor surplus) if
// sleep_duration_min is null or is_sick is true. For remaining days, adds
// max(0, 450 - effectiveDur) to a running total — days >= 450min contribute
// 0 (no negative debt, no banking of surplus). Returns 0 if fewer than 3
// qualifying days exist in the window. Compute-not-store — no DB column.
export async function getSleepDebtRolling7Day(asOfDate?: string): Promise<number> {
  const endStr = asOfDate
    ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
  const windowEnd = new Date(endStr + 'T00:00:00Z')
  windowEnd.setUTCDate(windowEnd.getUTCDate() - 1) // strictly before asOfDate
  const windowEndStr = windowEnd.toISOString().split('T')[0]
  const windowStart = new Date(endStr + 'T00:00:00Z')
  windowStart.setUTCDate(windowStart.getUTCDate() - 7)
  const windowStartStr = windowStart.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('daily_entries')
    .select('sleep_duration_min, nap_minutes, is_sick')
    .eq('user_id', 'julie')
    .gte('date', windowStartStr)
    .lte('date', windowEndStr)
  if (error) throw error

  const rows = (data ?? []) as { sleep_duration_min: number | null; nap_minutes: number | null; is_sick: boolean | null }[]
  const qualifying = rows.filter(r => r.sleep_duration_min != null && r.is_sick !== true)
  if (qualifying.length < 3) return 0

  return qualifying.reduce((sum, r) => {
    const effectiveDur = (r.sleep_duration_min ?? 0) + (r.nap_minutes ?? 0)
    return sum + Math.max(0, 450 - effectiveDur)
  }, 0)
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

// ─── saveHba1cReading ─────────────────────────────────────────────
export async function saveHba1cReading(value: number, recordedOn: string): Promise<void> {
  const { error } = await supabase
    .from('biomarker_readings')
    .insert({ user_id: 'julie', marker: 'hba1c', value, unit: '%', recorded_on: recordedOn })

  if (error) throw error
}

// ─── saveBodyScanReading ──────────────────────────────────────────
// Manual biomarker entry — upsert on (user_id, marker, recorded_on) so
// re-saving a value for a date that's already logged overwrites it instead
// of hitting the unique constraint. Not insert-only like saveVo2Reading, and
// not the select-then-conditional-upsert of the weight/body-fat/waist
// webhook — a plain upsert is correct here since the user is knowingly
// editing that date's value.
// 'body_fat_pct' | 'waist_cm' | 'visceral_fat_l' are legacy manual-entry
// markers from the pre-v3 Body Scan subsection (now webhook-only, see
// health-import route). 'smm_kg' (skeletal muscle mass) is manual-only —
// HealthKit has no corresponding type — and is the only marker the v3
// Body Composition card's Muscle tile writes through this function.
export async function saveBodyScanReading(
  marker: 'body_fat_pct' | 'waist_cm' | 'visceral_fat_l' | 'smm_kg',
  value: number,
  unit: string,
  recordedOn: string
): Promise<void> {
  const { error } = await supabase
    .from('biomarker_readings')
    .upsert(
      { user_id: 'julie', marker, value, unit, recorded_on: recordedOn },
      { onConflict: 'user_id,marker,recorded_on' }
    )

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
