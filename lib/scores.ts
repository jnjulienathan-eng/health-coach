import type { DailyEntry, TrainingSession } from './types'

export interface NutritionSummaryForScore {
  protein:    number | null
  fiber:      number | null
  meal_count: number | null
}

// ─── Behavior Score (0–100) ───────────────────────────────────────
// What you controlled: nutrition, supplements, bedtime, training vs HRV, active calories
export function behaviorScore(
  entry: DailyEntry,
  nutritionSummary?: NutritionSummaryForScore | null,
  bedtimeTarget: string = '21:45',
): number {
  const components: { score: number; weight: number }[] = []
  // Sick day: nutrition, bedtime-consistency, and active-calories components are
  // excluded entirely (weight redistributes to supplements + training-vs-HRV).
  // Training-vs-HRV is deliberately NOT gated by isSick — it scores normally.
  const isSick = entry.context.is_sick === true

  // 1. Nutrition — 30%: protein target 130g, fiber 30g
  // When nutritionSummary is provided, use daily_nutrition_summary data.
  // A day counts as logged if meal_count > 0. Falls back to legacy entry fields if
  // nutritionSummary is not provided (those fields are always null for new data).
  if (!isSick) {
    if (nutritionSummary != null) {
      if ((nutritionSummary.meal_count ?? 0) > 0) {
        const protein = nutritionSummary.protein
        const fiber   = nutritionSummary.fiber
        const parts: number[] = []
        if (protein != null) parts.push(Math.min(100, (protein / 130) * 100))
        if (fiber   != null) parts.push(Math.min(100, (fiber   / 30)  * 100))
        if (parts.length > 0) {
          components.push({ score: parts.reduce((a, b) => a + b) / parts.length, weight: 30 })
        }
      }
      // meal_count === 0 → nutrition N/A, weight redistributes to other components
    } else {
      const protein = entry.nutrition.total_protein
      const fiber   = entry.nutrition.total_fiber
      if (protein != null || fiber != null) {
        const parts: number[] = []
        if (protein != null) parts.push(Math.min(100, (protein / 130) * 100))
        if (fiber   != null) parts.push(Math.min(100, (fiber   / 30)  * 100))
        components.push({ score: parts.reduce((a, b) => a + b) / parts.length, weight: 30 })
      }
    }
  }

  // 2. Supplements — 20%: morning 40%, evening 30%, progesterone 15%, estradiol 15%
  const sup = entry.supplements
  if (sup.morning_stack_taken || sup.evening_stack_taken || sup.progesterone_taken || sup.estradiol_taken) {
    const s =
      (sup.morning_stack_taken ? 40 : 0) +
      (sup.evening_stack_taken ? 30 : 0) +
      (sup.progesterone_taken  ? 15 : 0) +
      (sup.estradiol_taken     ? 15 : 0)
    components.push({ score: s, weight: 20 })
  }

  // 3. Bedtime consistency — 15%: target = rolling 30-day avg (fallback 21:45), within 30 min = 100, -1.1pt per extra minute
  if (!isSick) {
    const bedtime = entry.sleep.bedtime
    if (bedtime) {
      const [h, m]   = bedtime.split(':').map(Number)
      const [th, tm] = bedtimeTarget.split(':').map(Number)
      const diff = Math.abs(h * 60 + m - (th * 60 + tm))
      components.push({ score: Math.max(0, 100 - diff * 1.1), weight: 15 })
    }
  }

  // 4. Training appropriate to HRV — 20%
  // Intensity derived from zone3_plus_minutes: 0–5 = easy, 6–15 = moderate, 16+ = hard
  // Core principle: going easier than HRV recommends is never penalised.
  // Missing HRV → component weight redistributes out entirely (handled by guard below).
  function sessionIntensity(sess: TrainingSession): 'easy' | 'moderate' | 'hard' {
    const z3 = sess.zone3_plus_minutes
    const t  = sess.activity_type.toLowerCase()
    if (z3 != null) {
      if (z3 >= 16) return 'hard'
      if (z3 >= 6)  return 'moderate'
      return 'easy'
    }
    // No zone3+ logged: infer from type + duration
    if (t === 'walk') return 'easy'
    const isIntenseType = t === 'strength' || t === 'egym' || t === 'swim' || t === 'run'
    if (isIntenseType && sess.duration_min >= 45) return 'hard'
    return 'moderate'
  }

  const hrv = entry.sleep.hrv
  if (hrv != null) {
    const sessions    = entry.training.sessions
    const hasSessions = sessions.length > 0
    let s: number

    if (hrv > 100) {
      // Recommendation: train hard
      const meetsHard = sessions.some(sess => sessionIntensity(sess) === 'hard')
      const walkOnly = hasSessions && sessions.every(sess => sess.activity_type.toLowerCase() === 'walk')
      s = meetsHard ? 100 : (hasSessions && !walkOnly) ? 70 : 30

    } else if (hrv >= 80) {
      // Recommendation: moderate — no penalty for under-training, only for going very hard
      const overExerted = sessions.some(sess => (sess.zone3_plus_minutes ?? 0) >= 30)
      s = overExerted ? 30 : 100

    } else if (hrv >= 60) {
      // Recommendation: easy only
      const hasHard     = sessions.some(sess => sessionIntensity(sess) === 'hard')
      const hasModerate = sessions.some(sess => sessionIntensity(sess) === 'moderate')
      s = hasHard ? 20 : hasModerate ? 50 : 100

    } else {
      // Recommendation: rest (HRV < 60)
      if (!hasSessions) {
        s = 100
      } else {
        const hasHard     = sessions.some(sess => sessionIntensity(sess) === 'hard')
        const hasModerate = sessions.some(sess => sessionIntensity(sess) === 'moderate')
        s = hasHard ? 10 : hasModerate ? 40 : 70
      }
    }

    components.push({ score: s, weight: 20 })
  }

  // 5. Active calories — 15%: target 600 kcal (sessions + cycling combined)
  if (!isSick) {
    const calSessions = entry.training.sessions.filter(s => s.active_calories != null)
    const cyclingCal  = entry.training.cycling_calories ?? 0
    if (calSessions.length > 0 || cyclingCal > 0) {
      const total = calSessions.reduce((s, x) => s + (x.active_calories ?? 0), 0) + cyclingCal
      components.push({ score: Math.min(100, (total / 600) * 100), weight: 15 })
    }
  }

  if (!components.length) return 0
  const totalW = components.reduce((s, c) => s + c.weight, 0)
  return Math.round(components.reduce((s, c) => s + c.score * c.weight, 0) / totalW)
}

// ─── Outcome Score (0–100) ────────────────────────────────────────
// What your body did: HRV vs baseline, sleep duration+rested, RHR vs baseline
export function outcomeScore(entry: DailyEntry, hrvBaseline: number = 88, sleepDebtMinutes: number = 0): number {
  const components: { score: number; weight: number }[] = []

  // 1. HRV vs personal baseline (rolling 28-day median, default 88ms) — 30%
  const hrv = entry.sleep.hrv
  if (hrv != null) {
    const s =
      hrv >= 100 ? 100 :
      hrv >= hrvBaseline  ? 80 + ((hrv - hrvBaseline)  / 12) * 20 :
      hrv >= 70  ? 50 + ((hrv - 70)  / 18) * 30 :
      hrv >= 50  ? 20 + ((hrv - 50)  / 20) * 30 :
      Math.max(0, hrv * 0.4)
    components.push({ score: s, weight: 30 })
  }

  // 2. Sleep duration + Rested score — 30%
  // Effective sleep = night sleep + naps (naps only pad an existing night's
  // figure — they never manufacture a sleep entry when duration_min is null).
  // Sick day: duration sub-component excluded entirely — same null-duration
  // mechanism as an unlogged day. Rested still scores normally in this slot.
  const dur    = entry.context.is_sick === true ? null : entry.sleep.duration_min
  const rested = entry.sleep.rested
  if (dur != null || rested != null) {
    const parts: number[] = []
    if (dur != null) {
      const effectiveDur = dur + (entry.sleep.nap_minutes ?? 0)
      // 7-day rolling sleep debt forgiveness: overage past 510min is offset by
      // trailing deficit. Floor depends on which side of 570 the raw duration
      // started on: overage within (510, 570] can be forgiven all the way to
      // 510 (full/optimal band); overage beyond 570 floors at 570 instead of
      // 510 — no amount of debt can push a >570min day into the full/optimal
      // band. No debt (the common case) leaves band selection byte-identical
      // to pre-forgiveness scoring — this only ever helps, never worsens.
      const forgivenessFloor = effectiveDur > 570 ? 570 : 510
      const adjustedDur = effectiveDur > 510 && sleepDebtMinutes > 0
        ? Math.min(570, Math.max(forgivenessFloor, effectiveDur - sleepDebtMinutes))
        : effectiveDur
      const s =
        adjustedDur >= 450 && adjustedDur <= 510 ? 100 :
        adjustedDur >  510 && adjustedDur <= 570 ? 80  :
        adjustedDur >= 420 && adjustedDur <  450 ? 60 + ((adjustedDur - 420) / 30) * 40 :
        adjustedDur >  570                       ? 60  :
        adjustedDur >= 390 && adjustedDur <  420 ? 30 + ((adjustedDur - 390) / 30) * 30 :
        Math.max(0, (adjustedDur / 390) * 30)
      parts.push(s)
    }
    if (rested != null) parts.push((rested / 5) * 100)
    components.push({ score: parts.reduce((a, b) => a + b) / parts.length, weight: 30 })
  }

  // 3. RHR vs personal baseline ~52bpm — 20%
  const rhr = entry.sleep.rhr
  if (rhr != null) {
    const s =
      rhr <= 50 ? 100 :
      rhr <= 54 ? 80 + ((54 - rhr) / 4)  * 20 :
      rhr <= 58 ? 50 + ((58 - rhr) / 4)  * 30 :
      rhr <= 65 ? 20 + ((65 - rhr) / 7)  * 30 :
      Math.max(0, 20 - (rhr - 65) * 2)
    components.push({ score: Math.max(0, s), weight: 20 })
  }

  // CGM (20%) omitted until CGM section is built; weight redistributes to logged metrics

  if (!components.length) return 0
  const totalW = components.reduce((s, c) => s + c.weight, 0)
  return Math.round(components.reduce((s, c) => s + c.score * c.weight, 0) / totalW)
}
