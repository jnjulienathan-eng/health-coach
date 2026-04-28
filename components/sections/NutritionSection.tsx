'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { TrainingSession } from '@/lib/types'
import { MACRO_TARGETS } from '@/lib/types'
import Section from '@/components/ui/Section'
import MealLogger from '@/components/nutrition/MealLogger'

interface Props {
  currentDate: string
  sessions?: TrainingSession[]
}

// ─── API types ────────────────────────────────────────────────────────────
interface NutrientsPer100g {
  calories?: number | null
  protein?:  number | null
  carbs?:    number | null
  fat?:      number | null
  fiber?:    number | null
}

interface FoodItemLite {
  id: string
  name: string
  source: 'usda' | 'open_food_facts' | 'custom' | 'recipe' | 'recipe_deleted'
  fdc_id: string | null
  nutrients_per_100g: NutrientsPer100g
}

interface MealItem {
  id: string
  meal_log_id: string
  weight_grams: number
  food_items: FoodItemLite | FoodItemLite[] | null
}

interface MealLog {
  id: string
  logged_at: string
  name: string
  logged_via: string
  peak_glucose_mmol: number | null
  notes: string | null
  // Top-level fields for photo_estimate meals (null for item-based)
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  items: MealItem[]
}

interface DaySummary {
  calories: number | null
  protein:  number | null
  carbs:    number | null
  fat:      number | null
  fiber:    number | null
  meal_count: number | null
}

interface DayResponse {
  date: string
  meals: MealLog[]
  summary: DaySummary | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function getDailyCalorieTarget(sessions: TrainingSession[]): number {
  if (sessions.length === 0) return 1800
  const totalZone3 = sessions.reduce((sum, s) => sum + (s.zone3_plus_minutes ?? 0), 0)
  const sessionCount = sessions.length
  if (sessionCount >= 2 && totalZone3 >= 30) return 2500
  if (sessionCount >= 2 || totalZone3 >= 16) return 2300
  if (totalZone3 >= 6) return 2100
  return 1950
}

function pickFoodItem(it: MealItem): FoodItemLite | null {
  if (!it.food_items) return null
  return Array.isArray(it.food_items) ? it.food_items[0] ?? null : it.food_items
}

function macrosForItem(it: MealItem): { calories: number; protein: number; carbs: number; fat: number; fiber: number } {
  const fi = pickFoodItem(it)
  const n = fi?.nutrients_per_100g ?? {}
  const w = it.weight_grams || 0
  return {
    calories: ((n.calories ?? 0) * w) / 100,
    protein:  ((n.protein  ?? 0) * w) / 100,
    carbs:    ((n.carbs    ?? 0) * w) / 100,
    fat:      ((n.fat      ?? 0) * w) / 100,
    fiber:    ((n.fiber    ?? 0) * w) / 100,
  }
}

function macrosForMeal(m: MealLog) {
  if (m.logged_via === 'photo_estimate') {
    return {
      calories: m.calories ?? 0,
      protein:  m.protein_g ?? 0,
      carbs:    m.carbs_g   ?? 0,
      fat:      m.fat_g     ?? 0,
      fiber:    m.fiber_g   ?? 0,
    }
  }
  const t = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  for (const it of m.items) {
    const x = macrosForItem(it)
    t.calories += x.calories
    t.protein  += x.protein
    t.carbs    += x.carbs
    t.fat      += x.fat
    t.fiber    += x.fiber
  }
  return t
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin',
  })
}

function r(n: number): number { return Math.round(n) }

// ─── Macro summary bar ────────────────────────────────────────────────────
function MacroBar({
  label, value, target, flagBelow, flagAbove, unit = 'g',
}: {
  label: string
  value: number
  target: { min: number; max: number }
  flagBelow?: number
  flagAbove?: number
  unit?: string
}) {
  const pct = Math.min(100, (value / target.max) * 100)
  const isUnder = flagBelow != null && value > 0 && value < flagBelow
  const isOver  = flagAbove != null && value > flagAbove
  const fillClass = isUnder ? 'under' : isOver ? 'over' : 'on-track'
  const numColor =
    value === 0 ? 'var(--color-text-dim)'
    : isUnder ? 'var(--color-danger)'
    : isOver ? 'var(--color-amber)'
    : 'var(--color-success)'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, fontSize: 12 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', color: numColor }}>
          {r(value)}{unit}
          <span style={{ color: 'var(--color-text-dim)', fontFamily: 'var(--font-sans)' }}>
            {' / '}{target.max}{unit}
          </span>
        </span>
      </div>
      <div className="macro-bar-track">
        <div className={`macro-bar-fill ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── Meal card ────────────────────────────────────────────────────────────
function MealCard({
  meal, onDelete, onEdit, onGlucoseUpdate,
}: {
  meal: MealLog
  onDelete: () => void
  onEdit: () => void
  onGlucoseUpdate: (value: number | null) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [glucoseEditing, setGlucoseEditing] = useState(false)
  const [glucoseInput, setGlucoseInput] = useState('')
  const [glucoseSaving, setGlucoseSaving] = useState(false)
  const [glucoseError, setGlucoseError] = useState<string | null>(null)
  const totals = useMemo(() => macrosForMeal(meal), [meal])

  const saveGlucose = async () => {
    const numVal = glucoseInput.trim() === '' ? null : Number(glucoseInput)
    setGlucoseEditing(false)
    if (numVal === meal.peak_glucose_mmol) return
    setGlucoseSaving(true)
    setGlucoseError(null)
    try {
      const res = await fetch('/api/nutrition/meal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: meal.id, peak_glucose_mmol: numVal }),
      })
      const j = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || j.error) { setGlucoseError(j.error ?? 'Save failed'); return }
      onGlucoseUpdate(numVal)
    } catch (e) {
      setGlucoseError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setGlucoseSaving(false)
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none',
          padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {meal.name}
            </span>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)', marginTop: 2 }}>
              {formatTime(meal.logged_at)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
            {meal.logged_via === 'photo_estimate' && (
              <span
                title="Estimated by Claude"
                style={{
                  fontSize: 10, fontWeight: 500,
                  background: 'var(--color-amber-light, rgba(255,180,0,0.12))',
                  color: 'var(--color-amber)',
                  padding: '3px 7px', borderRadius: 999,
                }}
              >
                Claude estimate
              </span>
            )}
            {meal.peak_glucose_mmol != null && (
              <span
                title="Peak glucose"
                style={{
                  fontSize: 11, fontFamily: 'var(--font-mono)',
                  background: 'var(--color-primary-light)',
                  color: 'var(--color-primary-dark)',
                  padding: '3px 8px', borderRadius: 999, fontWeight: 500,
                }}
              >
                {meal.peak_glucose_mmol} mmol
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
          <span>{r(totals.calories)} kcal</span>
          <span>{r(totals.protein)}g P</span>
          <span>{r(totals.carbs)}g C</span>
          <span>{r(totals.fat)}g F</span>
          <span>{r(totals.fiber)}g Fi</span>
        </div>
      </button>

      {/* Inline peak glucose — always visible, below macro line */}
      <div
        onClick={(e) => {
          e.stopPropagation()
          if (!glucoseEditing) {
            setGlucoseInput(meal.peak_glucose_mmol != null ? String(meal.peak_glucose_mmol) : '')
            setGlucoseEditing(true)
          }
        }}
        style={{
          borderTop: '1px solid var(--color-border)', padding: '6px 14px',
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: glucoseEditing ? 'default' : 'pointer',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--color-text-dim)', minWidth: 82, flexShrink: 0 }}>Peak glucose</span>
        {glucoseEditing ? (
          <>
            <input
              type="number"
              inputMode="decimal"
              step={0.1}
              min={2}
              max={20}
              value={glucoseInput}
              onChange={e => setGlucoseInput(e.target.value)}
              onBlur={saveGlucose}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              style={{
                width: 68, padding: '3px 8px', fontSize: 13, fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-primary)',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 6, outline: 'none',
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>mmol/L</span>
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); saveGlucose() }}
              style={{ background: 'var(--color-primary)', border: 'none', borderRadius: 4, color: '#fff', padding: '2px 7px', fontSize: 12, cursor: glucoseSaving ? 'default' : 'pointer', lineHeight: 1.4, opacity: glucoseSaving ? 0.6 : 1 }}
            >✓</button>
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); setGlucoseEditing(false); setGlucoseError(null) }}
              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 4, color: 'var(--color-text-dim)', padding: '2px 6px', fontSize: 12, cursor: 'pointer', lineHeight: 1.4 }}
            >✕</button>
          </>
        ) : (
          <>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: meal.peak_glucose_mmol != null ? 'var(--color-text-primary)' : 'var(--color-text-dim)' }}>
              {meal.peak_glucose_mmol != null ? meal.peak_glucose_mmol : '—'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>mmol/L</span>
          </>
        )}
        {glucoseError && (
          <span style={{ fontSize: 11, color: 'var(--color-danger)', marginLeft: 4 }}>{glucoseError}</span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden', borderTop: '1px solid var(--color-border)' }}
          >
            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {meal.logged_via === 'photo_estimate' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 2 }}>
                    Claude estimate · macros only
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                    <span>{r(totals.calories)} kcal</span>
                    <span>{r(totals.protein)}g P</span>
                    <span>{r(totals.carbs)}g C</span>
                    <span>{r(totals.fat)}g F</span>
                    <span>{r(totals.fiber)}g Fi</span>
                  </div>
                </div>
              ) : (
                <>
                  {meal.items.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>No ingredients logged.</div>
                  )}
                  {meal.items.map(it => {
                    const fi = pickFoodItem(it)
                    const m = macrosForItem(it)
                    return (
                      <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {fi?.name ?? '—'}
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)', fontSize: 11, marginTop: 1 }}>
                            {r(it.weight_grams)}g
                          </div>
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {r(m.calories)} kcal · {r(m.protein)}P · {r(m.carbs)}C · {r(m.fat)}F · {r(m.fiber)}Fi
                        </div>
                      </div>
                    )
                  })}
                </>
              )}

              {meal.notes && (
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', borderTop: '1px solid var(--color-border)', paddingTop: 8, marginTop: 4 }}>
                  {meal.notes}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6, gap: 6 }}>
                {!confirmDelete && meal.logged_via !== 'photo_estimate' && (
                  <button
                    type="button"
                    onClick={onEdit}
                    style={{
                      background: 'none', border: '1px solid var(--color-border)',
                      color: 'var(--color-text-secondary)', borderRadius: 6,
                      padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                    }}
                  >
                    Edit meal
                  </button>
                )}
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    style={{
                      background: 'none', border: '1px solid var(--color-border)',
                      color: 'var(--color-danger)', borderRadius: 6,
                      padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                    }}
                  >
                    Delete meal
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Delete this meal?</span>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={onDelete}
                      style={{ background: 'var(--color-danger)', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: '#fff' }}
                    >
                      Yes, delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────
export default function NutritionSection({ currentDate, sessions = [] }: Props) {
  const [day, setDay] = useState<DayResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showLogger, setShowLogger] = useState(false)
  const [loggerInitialScreen, setLoggerInitialScreen] = useState<'menu' | 'library'>('menu')
  const [editingMealId, setEditingMealId] = useState<string | null>(null)

  const calorieTarget = getDailyCalorieTarget(sessions)

  const fetchDay = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/nutrition/day?date=${encodeURIComponent(currentDate)}`)
      const data = await res.json() as DayResponse | { error: string }
      if ('error' in data) {
        setError(data.error)
        setDay(null)
      } else {
        setDay(data)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setDay(null)
    } finally {
      setLoading(false)
    }
  }, [currentDate])

  useEffect(() => { fetchDay() }, [fetchDay])

  const totals: DaySummary = day?.summary ?? {
    calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, meal_count: 0,
  }

  const hasData    = (day?.meals.length ?? 0) > 0
  // Green checkmark only when both primary targets are hit; amber circle when logged but short.
  const targetsHit = hasData
    && (totals.protein ?? 0) >= MACRO_TARGETS.protein.min
    && (totals.fiber   ?? 0) >= MACRO_TARGETS.fiber.min
  const calorieTargetRange = { min: Math.round(calorieTarget * 0.9), max: calorieTarget }

  // Compact summary used in the collapsed Section header
  const summaryBars = totals.protein != null && totals.protein > 0 ? (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      <span style={{ color: 'var(--color-text-secondary)' }}>{r(totals.protein)}g P</span>
      <span style={{ color: 'var(--color-text-dim)' }}>· {r(totals.fiber ?? 0)}g Fi</span>
      <span style={{ color: 'var(--color-text-dim)' }}>· {r(totals.calories ?? 0)} kcal</span>
    </div>
  ) : null

  const handleEdit = (meal: MealLog) => {
    setEditingMealId(meal.id)
    setShowLogger(true)
  }

  const handleGlucoseUpdate = (id: string, value: number | null) => {
    setDay(prev => {
      if (!prev) return prev
      return { ...prev, meals: prev.meals.map(m => m.id === id ? { ...m, peak_glucose_mmol: value } : m) }
    })
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/nutrition/meal?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError((j as { error?: string }).error ?? 'Delete failed')
        return
      }
      await fetchDay()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <Section title="Nutrition" isComplete={targetsHit} isPartial={hasData && !targetsHit} rightSlot={summaryBars}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Macro summary bar */}
        <div
          style={{
            padding: 14,
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            display: 'flex', flexDirection: 'column', gap: 10,
            position: 'sticky', top: 0, zIndex: 5,
          }}
        >
          <MacroBar
            label="Protein"
            value={totals.protein ?? 0}
            target={MACRO_TARGETS.protein}
            flagBelow={MACRO_TARGETS.protein.flagBelow}
          />
          <MacroBar
            label="Fiber"
            value={totals.fiber ?? 0}
            target={MACRO_TARGETS.fiber}
            flagBelow={MACRO_TARGETS.fiber.flagBelow}
          />
          <MacroBar
            label="Carbs"
            value={totals.carbs ?? 0}
            target={MACRO_TARGETS.carbs}
            flagAbove={(MACRO_TARGETS.carbs as { flagAbove?: number }).flagAbove}
          />
          <MacroBar
            label="Fat"
            value={totals.fat ?? 0}
            target={MACRO_TARGETS.fat}
            flagAbove={(MACRO_TARGETS.fat as { flagAbove?: number }).flagAbove}
          />
          <MacroBar
            label="Calories"
            value={totals.calories ?? 0}
            target={calorieTargetRange}
            unit=" kcal"
          />
        </div>

        {/* Loading / error states */}
        {loading && !day && (
          <div style={{ fontSize: 12, color: 'var(--color-text-dim)', textAlign: 'center', padding: 12 }}>
            Loading…
          </div>
        )}
        {error && (
          <div style={{ fontSize: 12, color: 'var(--color-danger)', textAlign: 'center', padding: 8 }}>
            {error}
          </div>
        )}

        {/* Meal cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <AnimatePresence initial={false}>
            {(day?.meals ?? []).map(m => (
              <MealCard key={m.id} meal={m} onDelete={() => handleDelete(m.id)} onEdit={() => handleEdit(m)} onGlucoseUpdate={(v) => handleGlucoseUpdate(m.id, v)} />
            ))}
          </AnimatePresence>
          {!loading && (day?.meals.length ?? 0) === 0 && (
            <div style={{ fontSize: 12, color: 'var(--color-text-dim)', textAlign: 'center', padding: 16 }}>
              No meals logged yet.
            </div>
          )}
        </div>

        {/* Bottom action bar */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={() => { setLoggerInitialScreen('menu'); setShowLogger(true) }}
            className="btn-primary"
            style={{ flex: 1 }}
          >
            + Log a meal
          </button>
          <button
            type="button"
            onClick={() => { setLoggerInitialScreen('library'); setShowLogger(true) }}
            aria-label="My Library"
            style={{
              width: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8, cursor: 'pointer',
              color: 'var(--color-text-secondary)',
              flexShrink: 0,
            }}
          >
            <LibraryIcon />
          </button>
        </div>

        {showLogger && (() => {
          const editMeal = editingMealId ? (day?.meals ?? []).find(m => m.id === editingMealId) ?? null : null
          const editingMealProp = editMeal ? {
            id: editMeal.id,
            name: editMeal.name,
            notes: editMeal.notes,
            items: editMeal.items.flatMap(it => {
              const fi = pickFoodItem(it)
              if (!fi) return []
              return [{
                food_item: {
                  id: fi.id,
                  name: fi.name,
                  fdc_id: fi.fdc_id,
                  source: fi.source,
                  nutrients_per_100g: {
                    calories: fi.nutrients_per_100g.calories ?? null,
                    protein:  fi.nutrients_per_100g.protein  ?? null,
                    carbs:    fi.nutrients_per_100g.carbs    ?? null,
                    fat:      fi.nutrients_per_100g.fat      ?? null,
                    fiber:    fi.nutrients_per_100g.fiber    ?? null,
                  },
                },
                weight_grams: it.weight_grams,
              }]
            }),
          } : undefined
          return (
            <MealLogger
              onClose={() => { setShowLogger(false); setEditingMealId(null) }}
              onSaved={() => { setShowLogger(false); setEditingMealId(null); fetchDay() }}
              initialScreen={loggerInitialScreen}
              editingMeal={editingMealProp}
            />
          )
        })()}
      </div>
    </Section>
  )
}

function LibraryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="3" y="4" width="3" height="12" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="8" y="4" width="3" height="12" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M13 4l3 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
