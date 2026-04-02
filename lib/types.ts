export interface SleepData {
  duration: number | null
  hrv: number | null
  rhr: number | null
  deep_sleep_minutes: number | null
  wake_events: number | null
  respiration_rate: number | null
  waking_score: number | null
  note: string
}

export interface FeelData {
  energy: number | null
  mood: number | null
}

export interface TrainingSession {
  id: string
  type: string
  duration_minutes: number | null
  rpe: number | null
}

export interface Meal {
  id: string
  name: string
  time: string
  protein: number | null
  fat: number | null
  carbs: number | null
  calories: number | null
  fiber: number | null
}

export interface MealTemplate {
  id: string
  name: string
  protein: number | null
  fat: number | null
  carbs: number | null
  calories: number | null
  fiber: number | null
}

export interface SupplementEntry {
  id: string
  name: string
  dose: number | null
  unit: string
  timing: string
}

export interface MindsetData {
  stress: number | null
  focus: number | null
  meditation_minutes: number | null
}

export interface ContextData {
  cycle_day: number | null
  flags: string[]
  note: string
}

export interface CheckinRecord {
  date: string
  sleep: SleepData
  feel: FeelData
  training_sessions: TrainingSession[]
  meals: Meal[]
  hydration_ml: number | null
  supplements: SupplementEntry[]
  mindset: MindsetData
  context: ContextData
}

const emptySleep: SleepData = {
  duration: null,
  hrv: null,
  rhr: null,
  deep_sleep_minutes: null,
  wake_events: null,
  respiration_rate: null,
  waking_score: null,
  note: '',
}

const emptyFeel: FeelData = { energy: null, mood: null }

const emptyMindset: MindsetData = { stress: null, focus: null, meditation_minutes: null }

const emptyContext: ContextData = { cycle_day: null, flags: [], note: '' }

export function emptyCheckin(date: string): CheckinRecord {
  return {
    date,
    sleep: { ...emptySleep },
    feel: { ...emptyFeel },
    training_sessions: [],
    meals: [],
    hydration_ml: null,
    supplements: [],
    mindset: { ...emptyMindset },
    context: { ...emptyContext },
  }
}
