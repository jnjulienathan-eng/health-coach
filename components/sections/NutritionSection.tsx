'use client'

import { useState } from 'react'
import type { NutritionData, MealMacros, BreakfastMeal } from '@/lib/types'
import { MACRO_TARGETS } from '@/lib/types'
import type { BreakfastTemplate } from '@/lib/db'
import Section from '@/components/ui/Section'

interface Props {
  data: NutritionData
  templates: BreakfastTemplate[]
  onChange: (data: NutritionData) => void
  onSave: () => void
  saving?: boolean
}

// ─── Compute daily totals ────────────────────────────────────────
function computeTotals(d: NutritionData): NutritionData {
  const meals: MealMacros[] = [
    d.pre_workout_snack,
    d.breakfast,
    d.lunch,
    d.dinner,
    d.incidentals,
  ]
  const sum = (k: keyof Pick<MealMacros, 'protein' | 'fiber' | 'fat' | 'carbs'>) =>
    meals.some((m) => m[k] != null)
      ? meals.reduce((acc, m) => acc + (m[k] ?? 0), 0)
      : null
  const sumCal = meals.some((m) => m.calories != null)
    ? meals.reduce((acc, m) => acc + (m.calories ?? 0), 0)
    : null

  return {
    ...d,
    total_protein: sum('protein'),
    total_fiber: sum('fiber'),
    total_fat: sum('fat'),
    total_carbs: sum('carbs'),
    total_calories: sumCal,
  }
}

// ─── Incidentals quick-add data ──────────────────────────────────
const INCIDENTAL_CHIPS: { label: string; macros: Partial<MealMacros> }[] = [
  { label: 'Dark chocolate (2 sq)',     macros: { description: 'Dark chocolate, 2 squares', protein: 1, fiber: 1, fat: 5, carbs: 7, calories: 55 } },
  { label: 'Choc blueberries (handful)', macros: { description: 'True Fruit chocolate blueberries, small handful', protein: 1, fiber: 1, fat: 4, carbs: 12, calories: 86 } },
  { label: 'Mixed nuts (handful)',       macros: { description: 'Mixed nuts, small handful', protein: 4, fiber: 2, fat: 14, carbs: 4, calories: 160 } },
  { label: 'Rye crackers (1–2)',        macros: { description: 'Rye crackers, 1-2 pieces', protein: 2, fiber: 2, fat: 1, carbs: 14, calories: 65 } },
  { label: 'Medjool date (1)',           macros: { description: 'Medjool date', protein: 0, fiber: 2, fat: 0, carbs: 18, calories: 66 } },
]

// Default breakfast templates (shown if Supabase returns none)
const DEFAULT_BREAKFAST_TEMPLATES: BreakfastTemplate[] = [
  { id: 'b1', name: 'Yogurt bowl',            protein: 22, fiber: 6, fat: 14, carbs: 28, calories: 330 },
  { id: 'b2', name: 'Chickpea pancake + sardines', protein: 40, fiber: 10, fat: 16, carbs: 30, calories: 420 },
  { id: 'b3', name: 'Cottage cheese pancakes', protein: 35, fiber: 3, fat: 10, carbs: 22, calories: 310 },
  { id: 'b4', name: 'Rice & natto bowl',       protein: 30, fiber: 5, fat: 12, carbs: 48, calories: 420 },
  { id: 'b5', name: 'Sourdough toast + egg',   protein: 18, fiber: 3, fat: 10, carbs: 32, calories: 290 },
]

// ─── MacroBar component ──────────────────────────────────────────
function MacroBar({
  label,
  value,
  target,
  flagBelow,
  flagAbove,
  unit = 'g',
}: {
  label: string
  value: number | null
  target: { min: number; max: number }
  flagBelow?: number
  flagAbove?: number
  unit?: string
}) {
  if (value == null) return null
  const pct = Math.min(100, (value / target.max) * 100)
  const isUnder = flagBelow != null && value < flagBelow
  const isOver  = flagAbove != null && value > flagAbove
  const fillClass = isUnder ? 'under' : isOver ? 'over' : 'on-track'

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
          fontSize: 12,
        }}
      >
        <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{label}</span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            color: isUnder
              ? 'var(--color-danger)'
              : isOver
              ? 'var(--color-amber)'
              : 'var(--color-success)',
          }}
        >
          {Math.round(value)}{unit}
          <span style={{ color: 'var(--color-text-dim)', fontFamily: 'var(--font-sans)' }}>
            {' / '}{target.min}–{target.max}{unit}
          </span>
        </span>
      </div>
      <div className="macro-bar-track">
        <div className={`macro-bar-fill ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── Meal row ────────────────────────────────────────────────────
function MealRow({
  label,
  meal,
  onChange,
  showEstimate = false,
  placeholder = 'What did you eat?',
}: {
  label: string
  meal: MealMacros
  onChange: (m: MealMacros) => void
  showEstimate?: boolean
  placeholder?: string
}) {
  const [estimating, setEstimating] = useState(false)

  const hasMacros =
    meal.protein != null || meal.fat != null || meal.carbs != null || meal.calories != null

  const estimate = async () => {
    if (!meal.description.trim()) return
    setEstimating(true)
    try {
      const res = await fetch('/api/macros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: meal.description }),
      })
      const macros = await res.json()
      if (!res.ok || macros.error) return
      onChange({ ...meal, ...macros })
    } catch {
      // silently fail — user can enter manually
    } finally {
      setEstimating(false)
    }
  }

  const setMacro = (k: keyof MealMacros, v: number | null | string) =>
    onChange({ ...meal, [k]: v })

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 16 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-text-secondary)',
          marginBottom: 8,
        }}
      >
        {label}
      </div>

      {/* Description */}
      <div style={{ display: 'flex', gap: 8, marginBottom: hasMacros ? 10 : 0 }}>
        <textarea
          value={meal.description}
          onChange={(e) => setMacro('description', e.target.value)}
          placeholder={placeholder}
          rows={2}
          style={{
            flex: 1,
            padding: '10px 12px',
            fontSize: 14,
            color: 'var(--color-text-primary)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            outline: 'none',
            resize: 'none',
            fontFamily: 'var(--font-sans)',
          }}
        />
        {showEstimate && (
          <button
            type="button"
            onClick={estimate}
            disabled={estimating || !meal.description.trim()}
            style={{
              flexShrink: 0,
              width: 52,
              background: 'var(--color-primary-light)',
              border: '1px solid var(--color-primary)',
              borderRadius: 8,
              fontSize: 11,
              color: 'var(--color-primary)',
              cursor: meal.description.trim() ? 'pointer' : 'not-allowed',
              fontWeight: 500,
              opacity: meal.description.trim() ? 1 : 0.4,
              padding: '0 4px',
              lineHeight: 1.3,
              textAlign: 'center',
            }}
          >
            {estimating ? '…' : 'Est-\nimate'}
          </button>
        )}
      </div>

      {/* Macros grid */}
      {hasMacros && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          {(
            [
              { key: 'protein',  label: 'P',  unit: 'g'   },
              { key: 'fiber',    label: 'F',  unit: 'g'   },
              { key: 'fat',      label: 'Fat', unit: 'g'  },
              { key: 'carbs',    label: 'C',  unit: 'g'   },
              { key: 'calories', label: 'Cal', unit: 'kcal' },
            ] as { key: keyof MealMacros; label: string; unit: string }[]
          ).map(({ key, label, unit }) => (
            <div key={key} style={{ textAlign: 'center' }}>
              <input
                type="number"
                inputMode="numeric"
                value={(meal[key] as number | null) ?? ''}
                onChange={(e) =>
                  setMacro(key, e.target.value === '' ? null : Number(e.target.value))
                }
                placeholder="—"
                style={{
                  width: '100%',
                  height: 36,
                  textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 14,
                  color: 'var(--color-text-primary)',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                  outline: 'none',
                  padding: 0,
                }}
              />
              <div
                style={{
                  fontSize: 9,
                  color: 'var(--color-text-dim)',
                  marginTop: 3,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                {label} {unit}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Show macros button if none */}
      {!hasMacros && meal.description && (
        <button
          type="button"
          onClick={() => onChange({ ...meal, protein: null, fiber: null, fat: null, carbs: null, calories: null })}
          style={{
            marginTop: 8,
            fontSize: 12,
            color: 'var(--color-primary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontFamily: 'var(--font-sans)',
          }}
        >
          + Add macros manually
        </button>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────
export default function NutritionSection({
  data,
  templates,
  onChange,
  onSave,
  saving,
}: Props) {
  const [localSaved, setLocalSaved] = useState(false)
  const [showIncidentals, setShowIncidentals] = useState(false)

  const effectiveTemplates =
    templates.length > 0 ? templates : DEFAULT_BREAKFAST_TEMPLATES

  const hasData =
    data.lunch.description ||
    data.dinner.description ||
    data.breakfast.description ||
    data.pre_workout_snack.description

  const updateMeal = (key: keyof NutritionData, meal: MealMacros | BreakfastMeal) => {
    const updated = computeTotals({ ...data, [key]: meal })
    onChange(updated)
  }

  const applyTemplate = (tmpl: BreakfastTemplate) => {
    const b: BreakfastMeal = {
      template_name: tmpl.name,
      description: tmpl.name,
      protein: tmpl.protein,
      fiber: tmpl.fiber,
      fat: tmpl.fat,
      carbs: tmpl.carbs,
      calories: tmpl.calories,
    }
    updateMeal('breakfast', b)
  }

  const addIncidental = (chip: { macros: Partial<MealMacros> }) => {
    const current = data.incidentals
    const merged: MealMacros = {
      description: [current.description, chip.macros.description]
        .filter(Boolean)
        .join(', '),
      protein:  (current.protein  ?? 0) + (chip.macros.protein  ?? 0),
      fiber:    (current.fiber    ?? 0) + (chip.macros.fiber    ?? 0),
      fat:      (current.fat      ?? 0) + (chip.macros.fat      ?? 0),
      carbs:    (current.carbs    ?? 0) + (chip.macros.carbs    ?? 0),
      calories: (current.calories ?? 0) + (chip.macros.calories ?? 0),
    }
    updateMeal('incidentals', merged)
  }

  const handleSave = async () => {
    await onSave()
    setLocalSaved(true)
    setTimeout(() => setLocalSaved(false), 2000)
  }

  // Collapsed summary: macro bars
  const summaryBars =
    data.total_protein != null ? (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {[
          { v: data.total_protein, t: MACRO_TARGETS.protein, flag: MACRO_TARGETS.protein.flagBelow },
          { v: data.total_fiber,   t: MACRO_TARGETS.fiber,   flag: MACRO_TARGETS.fiber.flagBelow },
        ].map((b, i) => {
          if (b.v == null) return null
          const isLow = b.flag != null && b.v < b.flag
          return (
            <div
              key={i}
              style={{
                width: 32,
                height: 4,
                borderRadius: 2,
                background: 'var(--color-primary-light)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, (b.v / b.t.max) * 100)}%`,
                  background: isLow ? 'var(--color-danger)' : 'var(--color-success)',
                  borderRadius: 2,
                }}
              />
            </div>
          )
        })}
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-text-secondary)',
          }}
        >
          {Math.round(data.total_protein ?? 0)}g P
        </span>
      </div>
    ) : null

  return (
    <Section title="Nutrition" isComplete={!!hasData} rightSlot={summaryBars}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Daily macro overview */}
        {data.total_protein != null && (
          <div
            style={{
              marginBottom: 20,
              padding: 14,
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <MacroBar
              label="Protein"
              value={data.total_protein}
              target={MACRO_TARGETS.protein}
              flagBelow={MACRO_TARGETS.protein.flagBelow}
            />
            <MacroBar
              label="Fiber"
              value={data.total_fiber}
              target={MACRO_TARGETS.fiber}
              flagBelow={MACRO_TARGETS.fiber.flagBelow}
            />
            <MacroBar
              label="Fat"
              value={data.total_fat}
              target={MACRO_TARGETS.fat}
              flagAbove={(MACRO_TARGETS.fat as { flagAbove?: number }).flagAbove}
            />
            <MacroBar
              label="Carbs"
              value={data.total_carbs}
              target={MACRO_TARGETS.carbs}
              flagAbove={(MACRO_TARGETS.carbs as { flagAbove?: number }).flagAbove}
            />
            {data.total_calories != null && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  paddingTop: 6,
                  borderTop: '1px solid var(--color-border)',
                }}
              >
                <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                  Total calories
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color:
                      data.total_calories < MACRO_TARGETS.calories.min
                        ? 'var(--color-danger)'
                        : data.total_calories > MACRO_TARGETS.calories.max
                        ? 'var(--color-amber)'
                        : 'var(--color-success)',
                  }}
                >
                  {data.total_calories} kcal
                  <span style={{ color: 'var(--color-text-dim)', fontFamily: 'var(--font-sans)' }}>
                    {' / '}{MACRO_TARGETS.calories.min}–{MACRO_TARGETS.calories.max}
                  </span>
                </span>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Pre-workout snack */}
          <MealRow
            label="Pre-workout snack"
            meal={data.pre_workout_snack}
            onChange={(m) => updateMeal('pre_workout_snack', m)}
            placeholder="Small snack before training…"
          />

          {/* Breakfast */}
          <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-text-secondary)',
                marginBottom: 10,
              }}
            >
              Breakfast
            </div>

            {/* Template picker */}
            {!data.breakfast.template_name && (
              <div className="scroll-row" style={{ marginBottom: 10 }}>
                {effectiveTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="btn-template"
                    style={{ minWidth: 110 }}
                  >
                    <span style={{ fontSize: 12 }}>{t.name}</span>
                    {t.protein != null && (
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--color-text-secondary)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {t.protein}g P
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {data.breakfast.template_name && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                  {data.breakfast.template_name}
                </span>
                <button
                  type="button"
                  onClick={() => updateMeal('breakfast', { ...data.breakfast, template_name: null, description: '' })}
                  style={{
                    fontSize: 12,
                    color: 'var(--color-primary)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Change
                </button>
              </div>
            )}

            {/* Macros if template selected */}
            {data.breakfast.template_name && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {(
                  [
                    { key: 'protein' as const,  label: 'P',    unit: 'g'    },
                    { key: 'fiber' as const,    label: 'F',    unit: 'g'    },
                    { key: 'fat' as const,      label: 'Fat',  unit: 'g'    },
                    { key: 'carbs' as const,    label: 'C',    unit: 'g'    },
                    { key: 'calories' as const, label: 'Cal',  unit: 'kcal' },
                  ]
                ).map(({ key, label, unit }) => (
                  <div key={key} style={{ textAlign: 'center' }}>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={(data.breakfast[key] as number | null) ?? ''}
                      onChange={(e) =>
                        updateMeal('breakfast', {
                          ...data.breakfast,
                          [key]: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      placeholder="—"
                      style={{
                        width: '100%',
                        height: 36,
                        textAlign: 'center',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 14,
                        color: 'var(--color-text-primary)',
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 6,
                        outline: 'none',
                        padding: 0,
                      }}
                    />
                    <div
                      style={{
                        fontSize: 9,
                        color: 'var(--color-text-dim)',
                        marginTop: 3,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {label} {unit}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lunch */}
          <MealRow
            label="Lunch"
            meal={data.lunch}
            onChange={(m) => updateMeal('lunch', m)}
            showEstimate
            placeholder="Describe what you had…"
          />

          {/* Dinner */}
          <MealRow
            label="Dinner"
            meal={data.dinner}
            onChange={(m) => updateMeal('dinner', m)}
            showEstimate
            placeholder="Describe what you had…"
          />

          {/* Incidentals */}
          <div style={{ paddingBottom: 4 }}>
            <button
              type="button"
              onClick={() => setShowIncidentals((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                marginBottom: showIncidentals ? 12 : 0,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Incidentals
              </span>
              {data.incidentals.calories != null && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--color-text-dim)',
                  }}
                >
                  +{data.incidentals.calories} kcal
                </span>
              )}
              <span
                style={{
                  fontSize: 14,
                  color: 'var(--color-text-dim)',
                  transform: showIncidentals ? 'rotate(90deg)' : 'none',
                  transition: 'transform 200ms',
                }}
              >
                ›
              </span>
            </button>

            {showIncidentals && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Quick-add chips */}
                <div className="scroll-row">
                  {INCIDENTAL_CHIPS.map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => addIncidental(chip)}
                      className="btn-template"
                      style={{ minWidth: 'auto', fontSize: 12 }}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                {/* Free text + macros */}
                <MealRow
                  label="Other incidentals"
                  meal={data.incidentals}
                  onChange={(m) => updateMeal('incidentals', m)}
                  placeholder="Snacks, treats, extras…"
                />
              </div>
            )}
          </div>
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
          style={{
            marginTop: 16,
            background: localSaved ? 'var(--color-primary-dark)' : undefined,
          }}
        >
          {localSaved ? '✓ Saved' : saving ? 'Saving…' : 'Save nutrition'}
        </button>
      </div>
    </Section>
  )
}
