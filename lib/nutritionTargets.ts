// ─── Fixed baseline targets ────────────────────────────────────────
export const BASE_TEE = 2300
export const TARGET_DEFICIT = 500
export const BASE_CAL_TARGET = 1800
export const PROTEIN_TARGET = 140
export const FIBER_TARGET = 35
export const FAT_TARGET = 60
export const CARB_TARGET = 175

// ─── Training-day adjustment ────────────────────────────────────────
export const TRAINING_OUTLIER_THRESHOLD_KCAL = 750
export const EXCESS_CREDIT_RATE = 0.5
export const CALORIE_CEILING = 2100

// ─── computeNutritionTargets ─────────────────────────────────────────
// Mostly-fixed daily targets. Only adjusts on days with genuinely high
// structured training load (todayTrainingKcal from training_sessions,
// not the noisy all-day Apple Watch active_calories figure).
export function computeNutritionTargets(todayTrainingKcal: number): {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  adjustment: {
    active: boolean
    addedKcal: number
    addedCarbs: number
  }
} {
  if (todayTrainingKcal <= TRAINING_OUTLIER_THRESHOLD_KCAL) {
    return {
      calories: BASE_CAL_TARGET,
      protein: PROTEIN_TARGET,
      carbs: CARB_TARGET,
      fat: FAT_TARGET,
      fiber: FIBER_TARGET,
      adjustment: { active: false, addedKcal: 0, addedCarbs: 0 },
    }
  }

  const excess = todayTrainingKcal - TRAINING_OUTLIER_THRESHOLD_KCAL
  const rawCredit = excess * EXCESS_CREDIT_RATE
  const addedKcal = Math.round(Math.min(rawCredit, CALORIE_CEILING - BASE_CAL_TARGET))
  const calories = BASE_CAL_TARGET + addedKcal
  const addedCarbs = Math.round(addedKcal / 4)
  const carbs = CARB_TARGET + addedCarbs

  return {
    calories,
    protein: PROTEIN_TARGET,
    carbs,
    fat: FAT_TARGET,
    fiber: FIBER_TARGET,
    adjustment: { active: true, addedKcal, addedCarbs },
  }
}
