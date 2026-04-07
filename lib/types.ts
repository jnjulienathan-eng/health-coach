// ─── Sleep ───────────────────────────────────────────────────────
export interface SleepData {
  bedtime: string | null          // "HH:MM" 24h
  duration_min: number | null     // total sleep in minutes
  hrv: number | null              // ms
  rhr: number | null              // bpm
  rested: number | null           // 1–5 tap scale
  nap_minutes: number | null      // daytime nap in minutes
}

// ─── Training ────────────────────────────────────────────────────
export type ActivityType = 'swim' | 'egym' | 'run' | 'walk'

export interface TrainingSession {
  id: string
  activity_type: string   // ActivityType for quick-add; any string for custom
  duration_min: number
  perceived_effort: number | null   // 1–5
  active_calories: number | null
}

export interface TrainingData {
  sessions: TrainingSession[]
  cycled_today: boolean
  cycling_minutes: number | null
}

// ─── Nutrition ───────────────────────────────────────────────────
export interface MealMacros {
  description: string
  protein: number | null
  fiber: number | null
  fat: number | null
  carbs: number | null
  calories: number | null
}

export interface BreakfastMeal extends MealMacros {
  template_name: string | null
}

export interface NutritionData {
  pre_workout_snack: MealMacros
  breakfast: BreakfastMeal
  lunch: MealMacros
  dinner: MealMacros
  incidentals: MealMacros
  total_protein: number | null
  total_fiber: number | null
  total_fat: number | null
  total_carbs: number | null
  total_calories: number | null
}

// ─── Supplements ─────────────────────────────────────────────────
export interface SupplementsData {
  morning_stack_taken: boolean
  morning_exceptions: string[]     // names of items NOT taken from morning stack
  evening_stack_taken: boolean
  evening_exceptions: string[]     // names of items NOT taken from evening stack
  progesterone_taken: boolean
  estradiol_taken: boolean
  ashwagandha_taken: boolean       // cyclic
  dim_taken: boolean               // cyclic
  phosphatidylserine_taken: boolean // cyclic
}

// ─── Context ─────────────────────────────────────────────────────
export type Symptom =
  | 'Congestion'
  | 'Headache'
  | 'Fatigue'
  | 'Nausea'
  | 'Cramps'
  | 'Bloating'
  | 'Other'

export interface ContextData {
  stress_level: number | null      // 1–5
  symptoms: Symptom[]
  travelling: boolean
  notes: string
}

// ─── Daily entry (maps to checkins table JSONB columns) ──────────
export interface DailyEntry {
  date: string                     // YYYY-MM-DD
  sleep: SleepData
  training: TrainingData
  nutrition: NutritionData
  supplements: SupplementsData
  context: ContextData
  hydration_ml: number | null
}

// ─── Defaults ────────────────────────────────────────────────────
export function emptySleep(): SleepData {
  return { bedtime: null, duration_min: null, hrv: null, rhr: null, rested: null, nap_minutes: null }
}

export function emptyTraining(): TrainingData {
  return { sessions: [], cycled_today: false, cycling_minutes: null }
}

export function emptyMeal(): MealMacros {
  return { description: '', protein: null, fiber: null, fat: null, carbs: null, calories: null }
}

export function emptyNutrition(): NutritionData {
  return {
    pre_workout_snack: emptyMeal(),
    breakfast: { ...emptyMeal(), template_name: null },
    lunch: emptyMeal(),
    dinner: emptyMeal(),
    incidentals: emptyMeal(),
    total_protein: null,
    total_fiber: null,
    total_fat: null,
    total_carbs: null,
    total_calories: null,
  }
}

export function emptySupplements(): SupplementsData {
  return {
    morning_stack_taken: false,
    morning_exceptions: [],
    evening_stack_taken: false,
    evening_exceptions: [],
    progesterone_taken: false,
    estradiol_taken: false,
    ashwagandha_taken: false,
    dim_taken: false,
    phosphatidylserine_taken: false,
  }
}

export function emptyContext(): ContextData {
  return { stress_level: null, symptoms: [], travelling: false, notes: '' }
}

export function emptyEntry(date: string): DailyEntry {
  return {
    date,
    sleep: emptySleep(),
    training: emptyTraining(),
    nutrition: emptyNutrition(),
    supplements: emptySupplements(),
    context: emptyContext(),
    hydration_ml: null,
  }
}

// ─── Score helpers ────────────────────────────────────────────────
export function scoreColor(score: number): string {
  if (score >= 75) return 'var(--color-success)'
  if (score >= 50) return 'var(--color-amber)'
  return 'var(--color-danger)'
}

export function scoreLabel(score: number): string {
  if (score >= 90) return 'Optimal'
  if (score >= 75) return 'Good'
  if (score >= 50) return 'OK'
  if (score >= 25) return 'Low'
  return 'Rest'
}

// ─── Macro targets ────────────────────────────────────────────────
export const MACRO_TARGETS = {
  protein:  { min: 130, max: 140, flagBelow: 120 },
  fiber:    { min: 30,  max: 35,  flagBelow: 25 },
  fat:      { min: 60,  max: 75,  flagAbove: 90 },
  carbs:    { min: 100, max: 130, flagAbove: 150 },
  calories: { min: 1700, max: 1800 },
} as const

// ─── HRV training zones ──────────────────────────────────────────
export function hrvZone(hrv: number): string {
  if (hrv > 100) return 'Train hard'
  if (hrv >= 80)  return 'Moderate training'
  if (hrv >= 60)  return 'Easy only'
  return 'Rest or gentle walk'
}
