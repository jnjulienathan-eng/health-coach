import type { DailyEntry, TrainingSession } from './types'

export interface NutritionSummaryForScore {
  protein:    number | null
  fiber:      number | null
  meal_count: number | null
}

// CGM component input for the Outcome Score. `fastingMmol` comes from
// getNearestCgmReading(date, wakeTime) — the same lookup the Glucose
// Stability card and Coach use, null when there's no wake_time logged or
// nothing within its match cap. `peaksLoggedCount` is the count of that
// date's meal_logs with a non-null peak_glucose_mmol; `spikeCount`/
// `severeSpikeCount` are the subsets above 7.5/8.5 mmol/L. A day with
// meals logged but no peak values entered has peaksLoggedCount 0, same as
// a day with no meals at all — both are "peaks not logged" here, matching
// the locked spec's "missing meal peaks never penalised."
export interface CgmScoreInput {
  fastingMmol:      number | null
  peaksLoggedCount: number
  spikeCount:       number
  severeSpikeCount: number
}

// Fasting-only band: ≤4.8 mmol/L = full credit, scaling down to 0 at 5.6.
// The locked spec ("scales down toward 5.6") doesn't state a floor beyond
// 5.6 — floored at 0 there rather than continuing to decline, matching
// the Math.max(0, ...) floor convention used by every other band in this
// file (HRV, RHR, sleep). Flag: this floor choice, not the 4.8/5.6
// anchors themselves, is a judgment call.
function cgmFastingScore(mmol: number): number {
  if (mmol <= 4.8) return 100
  if (mmol < 5.6)  return 100 - ((mmol - 4.8) / 0.8) * 100
  return 0
}

// Peaks band: 0 spikes (>7.5) = full credit. Each spike costs 20 points;
// each severe spike (>8.5, a subset of spikeCount) costs an additional 15,
// matching the locked spec's "penalty above 8.5." The per-spike point
// values are this session's judgment call — the locked spec names the
// 7.5/8.5 thresholds but not a scoring curve between them, and the task
// specifically asked for a spike *count* (same one "Meal Spikes Today"
// already uses), not a per-meal average of raw peak values.
function cgmPeaksScore(spikeCount: number, severeSpikeCount: number): number {
  if (spikeCount === 0) return 100
  return Math.max(0, 100 - spikeCount * 20 - severeSpikeCount * 15)
}

// ─── Behavior Score (0–100) ───────────────────────────────────────
// What you controlled: nutrition, supplements, bedtime, training vs readiness, active calories
export function behaviorScore(
  entry: DailyEntry,
  nutritionSummary?: NutritionSummaryForScore | null,
  bedtimeTarget: string = '21:45',
): number {
  const components: { score: number; weight: number }[] = []
  // Sick day: nutrition, bedtime-consistency, and active-calories components are
  // excluded entirely (weight redistributes to supplements + training-vs-readiness).
  // Training-vs-readiness is deliberately NOT gated by isSick — it scores normally.
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
  // Estradiol reverted to single AM-only dosing (Aug 2026): "estradiol confirmed"
  // is just estradiol_am_taken. estradiol_pm_taken is now a dead field (see
  // BODYCIPHER.md) and is no longer read here. estradiol_taken (retired) is
  // also no longer read here.
  // Testosterone is NOT folded into this locked 40/30/15/15 weighting — adding
  // a 5th bucket would mean re-deriving the split on a scoring model marked
  // "do not change without explicit instruction". Left out pending Julie's call.
  const sup = entry.supplements
  const estradiolConfirmed = sup.estradiol_am_taken
  if (sup.morning_stack_taken || sup.evening_stack_taken || sup.progesterone_taken || estradiolConfirmed) {
    const s =
      (sup.morning_stack_taken ? 40 : 0) +
      (sup.evening_stack_taken ? 30 : 0) +
      (sup.progesterone_taken  ? 15 : 0) +
      (estradiolConfirmed      ? 15 : 0)
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

  // 4. Training appropriate to readiness — 20%
  // Reads Oura daily readiness (entry.sleep.oura_readiness), not HRV — as of
  // Oct 3, 2026 hrv is Oura's overnight average, which the old absolute HRV
  // bands (>100/80–100/60–80/<60) don't fit. Same structure and outcomes as
  // the HRV logic it replaced, mapped onto readiness ≥85 / 70–84 / 60–69 / <60.
  // Intensity derived from zone3_plus_minutes: 0–5 = easy, 6–15 = moderate, 16+ = hard
  // Core principle: going easier than readiness recommends is never penalised.
  // Missing readiness → component weight redistributes out entirely (handled by guard below).
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

  const readiness = entry.sleep.oura_readiness
  if (readiness != null) {
    const sessions    = entry.training.sessions
    const hasSessions = sessions.length > 0
    let s: number

    if (readiness >= 85) {
      // Recommendation: train hard — but going easier is never penalised
      // (Oct 3, 2026 fix): hard = full, moderate = full, easy/rest = same
      // not-penalised treatment as the 70–84 band (100). The old HRV >100
      // band scored easy/rest as 30, which contradicted that rule. No
      // over-exertion penalty here, since hard is what's recommended.
      s = 100

    } else if (readiness >= 70) {
      // Recommendation: moderate — no penalty for under-training, only for going very hard
      const overExerted = sessions.some(sess => (sess.zone3_plus_minutes ?? 0) >= 30)
      s = overExerted ? 30 : 100

    } else if (readiness >= 60) {
      // Recommendation: easy only
      const hasHard     = sessions.some(sess => sessionIntensity(sess) === 'hard')
      const hasModerate = sessions.some(sess => sessionIntensity(sess) === 'moderate')
      s = hasHard ? 20 : hasModerate ? 50 : 100

    } else {
      // Recommendation: rest (readiness < 60)
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
export function outcomeScore(entry: DailyEntry, hrvBaseline: number = 45, sleepDebtMinutes: number = 0, cgm?: CgmScoreInput | null): number {
  const components: { score: number; weight: number }[] = []

  // 1. HRV vs personal baseline (rolling 28-day median, default 45ms) — 30%
  // Curve is proportional to the baseline (Oct 3, 2026, approved by Julie):
  // the old fixed-ms rungs (100/70/50) were tuned for waking HRV at a ~88
  // baseline and created a cliff just below baseline once hrv became Oura's
  // overnight average (~40–45 ms). Rungs at baseline × 1.14 / 0.80 / 0.57
  // reproduce the old curve at baseline 88.
  const hrv = entry.sleep.hrv
  if (hrv != null) {
    const b = hrvBaseline
    const s =
      hrv >= b * 1.14 ? 100 :
      hrv >= b        ? 80 + ((hrv - b) / (b * 0.14)) * 20 :
      hrv >= b * 0.80 ? 50 + ((hrv - b * 0.80) / (b * 0.20)) * 30 :
      hrv >= b * 0.57 ? 20 + ((hrv - b * 0.57) / (b * 0.23)) * 30 :
      Math.max(0, (20 * hrv) / (b * 0.57))
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

  // 4. CGM glucose — 20%. Fasting-only or peaks-only both score alone at
  // full weight when the other half is missing (same N/A-not-zero
  // mechanism as every other component here); fasting 40% / peaks 60%
  // when both are available; weight drops to 0% when neither is logged.
  // The locked spec only names the fasting-only and fasting+peaks cases —
  // scoring peaks alone (no fasting reading that day) at full weight
  // rather than excluding it is this session's extension of the same
  // "never penalise missing data" principle, not a stated case.
  if (cgm) {
    const fastingScore = cgm.fastingMmol != null ? cgmFastingScore(cgm.fastingMmol) : null
    const peaksScore = cgm.peaksLoggedCount > 0
      ? cgmPeaksScore(cgm.spikeCount, cgm.severeSpikeCount)
      : null

    let s: number | null = null
    if (fastingScore != null && peaksScore != null) s = fastingScore * 0.4 + peaksScore * 0.6
    else if (fastingScore != null) s = fastingScore
    else if (peaksScore != null) s = peaksScore

    if (s != null) components.push({ score: s, weight: 20 })
  }

  if (!components.length) return 0
  const totalW = components.reduce((s, c) => s + c.weight, 0)
  return Math.round(components.reduce((s, c) => s + c.score * c.weight, 0) / totalW)
}
