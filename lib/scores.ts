import type { DailyEntry, TrainingSession } from './types'

// ─── Behavior Score (0–100) ───────────────────────────────────────
// What you controlled: nutrition, supplements, bedtime, training vs HRV, active calories
export function behaviorScore(entry: DailyEntry): number {
  const components: { score: number; weight: number }[] = []

  // 1. Nutrition — 30%: protein target 130g, fiber 30g
  const protein = entry.nutrition.total_protein
  const fiber   = entry.nutrition.total_fiber
  if (protein != null || fiber != null) {
    const parts: number[] = []
    if (protein != null) parts.push(Math.min(100, (protein / 130) * 100))
    if (fiber   != null) parts.push(Math.min(100, (fiber   / 30)  * 100))
    components.push({ score: parts.reduce((a, b) => a + b) / parts.length, weight: 30 })
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

  // 3. Bedtime consistency — 15%: target 21:45, within 30 min = 100, -1.1pt per extra minute
  const bedtime = entry.sleep.bedtime
  if (bedtime) {
    const [h, m] = bedtime.split(':').map(Number)
    const diff = Math.abs(h * 60 + m - (21 * 60 + 45))
    components.push({ score: Math.max(0, 100 - diff * 1.1), weight: 15 })
  }

  // 4. Training appropriate to HRV — 20%
  // Intensity bands (HR-based): easy < 130 | moderate 130–154 | hard 155+
  // Core principle: going easier than HRV recommends is never penalised.
  // Missing HRV → component weight redistributes out entirely (handled by guard below).
  function sessionIntensity(sess: TrainingSession): 'easy' | 'moderate' | 'hard' {
    const hr = sess.avg_heart_rate
    const t  = sess.activity_type.toLowerCase()
    if (hr != null) {
      if (hr >= 155) return 'hard'
      if (hr >= 130) return 'moderate'
      return 'easy'
    }
    // No HR logged: infer from type + duration
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
      // Full score: any session with HR 155+ or strength/swim/run ≥ 45 min
      // 70: moderate effort (sessions logged but below hard threshold)
      // 30: walk only or no sessions
      const meetsHard = sessions.some(sess => {
        const hr = sess.avg_heart_rate
        const t  = sess.activity_type.toLowerCase()
        return (hr != null && hr >= 155) ||
               ((t === 'strength' || t === 'egym' || t === 'swim' || t === 'run') && sess.duration_min >= 45)
      })
      const walkOnly = hasSessions && sessions.every(sess => sess.activity_type.toLowerCase() === 'walk')
      s = meetsHard ? 100 : (hasSessions && !walkOnly) ? 70 : 30

    } else if (hrv >= 80) {
      // Recommendation: moderate
      // Full score for HR 130–154, strength, or going easy (no penalty for under-training)
      // Penalty only for HR 170+
      const overExerted = sessions.some(sess => sess.avg_heart_rate != null && sess.avg_heart_rate >= 170)
      s = overExerted ? 30 : 100

    } else if (hrv >= 60) {
      // Recommendation: easy only
      // Full score for walk/easy/no sessions
      // 50 for moderate effort
      // Penalty for high intensity
      const hasHard     = sessions.some(sess => sessionIntensity(sess) === 'hard')
      const hasModerate = sessions.some(sess => sessionIntensity(sess) === 'moderate')
      s = hasHard ? 20 : hasModerate ? 50 : 100

    } else {
      // Recommendation: rest (HRV < 60)
      // Full score for no training; penalty scales with intensity logged
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
  const calSessions  = entry.training.sessions.filter(s => s.active_calories != null)
  const cyclingCal   = entry.training.cycling_calories ?? 0
  if (calSessions.length > 0 || cyclingCal > 0) {
    const total = calSessions.reduce((s, x) => s + (x.active_calories ?? 0), 0) + cyclingCal
    components.push({ score: Math.min(100, (total / 600) * 100), weight: 15 })
  }

  if (!components.length) return 0
  const totalW = components.reduce((s, c) => s + c.weight, 0)
  return Math.round(components.reduce((s, c) => s + c.score * c.weight, 0) / totalW)
}

// ─── Outcome Score (0–100) ────────────────────────────────────────
// What your body did: HRV vs baseline, sleep duration+rested, RHR vs baseline
export function outcomeScore(entry: DailyEntry): number {
  const components: { score: number; weight: number }[] = []

  // 1. HRV vs personal baseline ~88ms — 30%
  const hrv = entry.sleep.hrv
  if (hrv != null) {
    const s =
      hrv >= 100 ? 100 :
      hrv >= 88  ? 80 + ((hrv - 88)  / 12) * 20 :
      hrv >= 70  ? 50 + ((hrv - 70)  / 18) * 30 :
      hrv >= 50  ? 20 + ((hrv - 50)  / 20) * 30 :
      Math.max(0, hrv * 0.4)
    components.push({ score: s, weight: 30 })
  }

  // 2. Sleep duration + Rested score — 30%
  const dur    = entry.sleep.duration_min
  const rested = entry.sleep.rested
  if (dur != null || rested != null) {
    const parts: number[] = []
    if (dur != null) {
      const s =
        dur >= 450 && dur <= 510 ? 100 :
        dur >  510 && dur <= 570 ? 80  :
        dur >= 420 && dur <  450 ? 60 + ((dur - 420) / 30) * 40 :
        dur >  570               ? 60  :
        dur >= 390 && dur <  420 ? 30 + ((dur - 390) / 30) * 30 :
        Math.max(0, (dur / 390) * 30)
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
