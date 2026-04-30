// app/api/health-import/route.ts
//
// Receives POST requests from the Health Auto Export iOS app and writes
// biometric data to Supabase.
//
// ⚠️  MIGRATIONS REQUIRED before this endpoint is live:
//   1. ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS source text;
//   2. ALTER TABLE daily_entries ADD COLUMN IF NOT EXISTS active_calories integer;
// Run both in the Supabase SQL editor before deploying.

import { NextRequest, NextResponse } from 'next/server'
import { supaAdmin } from '@/lib/nutrition'

// ── Workout name → activity_type mapping ────────────────────────────────────
const WORKOUT_TYPE_MAP: Record<string, string> = {
  'Outdoor Cycling': 'Cycling',
  'Indoor Cycling': 'Cycling',
  'Running': 'Run',
  'Outdoor Run': 'Run',
  'Indoor Run': 'Run',
  'Swimming': 'Swim',
  'Pool Swimming': 'Swim',
  'Open Water Swimming': 'Swim',
  'Strength Training': 'Strength',
  'Functional Strength Training': 'Strength',
  'HIIT': 'HIIT',
}

function extractDate(dateStr: string): string {
  // "2026-04-28 07:15:00 +0200" → "2026-04-28"
  return dateStr.substring(0, 10)
}

function kjToKcal(kj: number): number {
  return Math.round(kj / 4.184)
}

// ── Metric data point ────────────────────────────────────────────────────────
interface MetricPoint {
  date: string
  qty: number
  source?: string
}

interface Metric {
  name: string
  units: string
  data: MetricPoint[]
}

// ── Workout ──────────────────────────────────────────────────────────────────
interface EnergyField {
  qty: number
  units: string
}

interface Workout {
  id: string
  name: string
  start: string
  end: string
  duration: number
  activeEnergyBurned?: EnergyField
  heartRate?: { avg?: EnergyField }
}

// ── Payload ──────────────────────────────────────────────────────────────────
interface ImportPayload {
  data?: {
    metrics?: Metric[]
    workouts?: Workout[]
  }
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.HEALTH_IMPORT_SECRET) {
    console.log('[health-import] 401: missing or invalid x-api-key')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body: ImportPayload = await req.json()
    const metrics: Metric[] = body?.data?.metrics ?? []
    const workouts: Workout[] = body?.data?.workouts ?? []

    const supabase = supaAdmin()
    let metricsImported = 0
    let workoutsImported = 0

    // ── METRICS → daily_entries ─────────────────────────────────────────────
    // Aggregate all data points by date first, then process each date once.
    type DayMetrics = {
      rhr?: number
      sleep_duration_min?: number
      bedtime?: string           // "HH:MM" 24h, extracted from sleep session start
      active_calories?: number
    }
    const byDate: Record<string, DayMetrics> = {}

    for (const metric of metrics) {
      for (const point of metric.data ?? []) {
        const date = extractDate(point.date)
        if (!byDate[date]) byDate[date] = {}

        if (metric.name === 'resting_heart_rate') {
          byDate[date].rhr = Math.round(point.qty)
        } else if (metric.name === 'sleep_analysis') {
          // HAE exports sleep_analysis with units 'hr' — convert to minutes
          const durationMin = metric.units === 'hr'
            ? Math.round(point.qty * 60)
            : Math.round(point.qty)
          byDate[date].sleep_duration_min = durationMin
          // Extract bedtime (HH:MM) from the session start timestamp
          const timePart = point.date.substring(11, 16)
          if (timePart && timePart.includes(':')) {
            byDate[date].bedtime = timePart
          }
        } else if (metric.name === 'active_energy') {
          const kcal = metric.units === 'kJ' ? kjToKcal(point.qty) : Math.round(point.qty)
          byDate[date].active_calories = kcal
        }
      }
    }

    for (const [date, incoming] of Object.entries(byDate)) {
      if (!Object.keys(incoming).length) continue

      // Fetch existing row to apply COALESCE: manual entries always win.
      const { data: existing } = await supabase
        .from('daily_entries')
        .select('rhr, sleep_duration_min, bedtime, active_calories')
        .eq('user_id', 'julie')
        .eq('date', date)
        .maybeSingle()

      const row = existing as Record<string, unknown> | null

      // Build upsert payload — only include fields that are currently null.
      const upsert: Record<string, unknown> = { user_id: 'julie', date }
      const written: string[] = []
      const skipped: string[] = []

      if (incoming.rhr !== undefined) {
        if (row?.rhr == null) {
          upsert.rhr = incoming.rhr
          written.push('rhr')
        } else {
          skipped.push('rhr (manual value exists)')
        }
      }

      if (incoming.sleep_duration_min !== undefined) {
        if (row?.sleep_duration_min == null) {
          upsert.sleep_duration_min = incoming.sleep_duration_min
          written.push('sleep_duration_min')
        } else {
          skipped.push('sleep_duration_min (manual value exists)')
        }
      }

      if (incoming.bedtime !== undefined) {
        if (row?.bedtime == null) {
          upsert.bedtime = incoming.bedtime
          written.push('bedtime')
        } else {
          skipped.push('bedtime (manual value exists)')
        }
      }

      if (incoming.active_calories !== undefined) {
        if (row?.active_calories == null) {
          upsert.active_calories = incoming.active_calories
          written.push('active_calories')
        } else {
          skipped.push('active_calories (manual value exists)')
        }
      }

      if (written.length === 0) {
        console.log(`[health-import] metrics ${date}: all fields already populated — skipped (${skipped.join(', ')})`)
        continue
      }

      const { error } = await supabase
        .from('daily_entries')
        .upsert(upsert, { onConflict: 'user_id,date' })

      if (error) {
        console.error(`[health-import] metrics ${date}: upsert failed —`, JSON.stringify(error))
        throw new Error(`daily_entries upsert failed for ${date}: ${error.message ?? JSON.stringify(error)}`)
      }

      metricsImported++
      console.log(`[health-import] metrics ${date}: wrote [${written.join(', ')}]${skipped.length ? ` — skipped [${skipped.join(', ')}]` : ''}`)
    }

    // ── WORKOUTS → training_sessions ────────────────────────────────────────
    for (const workout of workouts) {
      const date = extractDate(workout.start)
      const activityType = WORKOUT_TYPE_MAP[workout.name] ?? workout.name
      const durationMin = Math.round(workout.duration / 60)

      let calories: number | null = null
      if (workout.activeEnergyBurned) {
        const { qty, units } = workout.activeEnergyBurned
        calories = units === 'kJ' ? kjToKcal(qty) : Math.round(qty)
      }

      // Duplicate check: skip if external_id already exists.
      const { data: existing } = await supabase
        .from('training_sessions')
        .select('id')
        .eq('external_id', workout.id)
        .maybeSingle()

      if (existing) {
        console.log(`[health-import] Skipped duplicate: external_id already exists (${workout.id})`)
        continue
      }

      const { error } = await supabase
        .from('training_sessions')
        .insert({
          user_id:            'julie',
          date,
          activity_type:      activityType,
          duration_min:       durationMin,
          zone3_plus_minutes: 0,
          active_calories:    calories,
          source:             'health_auto_export',
          start_time:         workout.start,
          external_id:        workout.id,
        })

      if (error) {
        console.error(`[health-import] workout ${date} ${activityType}: insert failed —`, JSON.stringify(error))
        throw new Error(`training_sessions insert failed for ${date} ${activityType}: ${error.message ?? JSON.stringify(error)}`)
      }

      workoutsImported++
      console.log(`[health-import] workout ${date} ${activityType} ${durationMin}min ${calories != null ? calories + 'kcal' : 'no calories'}: imported`)
    }

    console.log(`[health-import] done — metrics: ${metricsImported} written, workouts: ${workoutsImported} written`)
    return NextResponse.json({ imported: { metrics: metricsImported, workouts: workoutsImported } })

  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('[health-import] 500:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
