'use client'

import { useState } from 'react'
import Section from '@/components/ui/Section'
import type { Meal, MealTemplate } from '@/lib/types'

interface Props {
  meals: Meal[]
  hydration_ml: number | null
  templates: MealTemplate[]
  onMealsChange: (meals: Meal[]) => void
  onHydrationChange: (v: number | null) => void
}

function newMeal(): Meal {
  return {
    id: crypto.randomUUID(),
    name: '',
    time: '',
    protein: null,
    fat: null,
    carbs: null,
    calories: null,
    fiber: null,
  }
}

function getTotals(meals: Meal[]) {
  return {
    protein: meals.reduce((s, m) => s + (m.protein ?? 0), 0),
    fat: meals.reduce((s, m) => s + (m.fat ?? 0), 0),
    carbs: meals.reduce((s, m) => s + (m.carbs ?? 0), 0),
    calories: meals.reduce((s, m) => s + (m.calories ?? 0), 0),
    fiber: meals.reduce((s, m) => s + (m.fiber ?? 0), 0),
  }
}

function MacroInput({
  label,
  unit = 'g',
  value,
  onChange,
}: {
  label: string
  unit?: string
  value: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <div>
      <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-1">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
          className="w-full bg-[#0d0d0d] border border-[#1c1c1c] rounded px-1.5 py-1.5 text-xs font-mono text-[#d4d4d4] focus:outline-none focus:border-[#2a2a2a]"
          placeholder="—"
        />
        <span className="text-[9px] text-[#252525] font-mono">{unit}</span>
      </div>
    </div>
  )
}

export default function NutritionSection({
  meals,
  hydration_ml,
  templates,
  onMealsChange,
  onHydrationChange,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)

  const totals = getTotals(meals)
  const proteinPct = Math.min(100, (totals.protein / 135) * 100)
  const proteinColor =
    totals.protein >= 130 ? '#4ade80' : totals.protein >= 100 ? '#fbbf24' : '#f87171'

  const add = () => {
    const m = newMeal()
    onMealsChange([...meals, m])
    setExpandedId(m.id)
  }

  const addFromTemplate = (tmpl: MealTemplate) => {
    const m: Meal = {
      id: crypto.randomUUID(),
      name: tmpl.name,
      time: '',
      protein: tmpl.protein,
      fat: tmpl.fat,
      carbs: tmpl.carbs,
      calories: tmpl.calories,
      fiber: tmpl.fiber,
    }
    onMealsChange([...meals, m])
    setShowTemplates(false)
  }

  const remove = (id: string) => onMealsChange(meals.filter((m) => m.id !== id))
  const update = (id: string, patch: Partial<Meal>) =>
    onMealsChange(meals.map((m) => (m.id === id ? { ...m, ...patch } : m)))

  const summaryStr =
    meals.length > 0
      ? `${totals.protein.toFixed(0)}g P · ${totals.calories.toFixed(0)} kcal`
      : undefined

  return (
    <Section title="Nutrition" summary={summaryStr}>
      {/* Running totals */}
      {meals.length > 0 && (
        <div className="mb-4 p-3 bg-[#0a0a0a] rounded border border-[#181818]">
          <div className="mb-3">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[10px] font-mono text-[#3a3a3a] uppercase tracking-wider">
                Protein
              </span>
              <span className="text-[10px] font-mono" style={{ color: proteinColor }}>
                {totals.protein.toFixed(0)}g &nbsp;/&nbsp; 130–140g
              </span>
            </div>
            <div className="h-0.5 bg-[#181818] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${proteinPct}%`, backgroundColor: proteinColor }}
              />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: 'Fat', val: totals.fat, unit: 'g' },
              { label: 'Carbs', val: totals.carbs, unit: 'g' },
              { label: 'kcal', val: totals.calories, unit: '' },
              { label: 'Fiber', val: totals.fiber, unit: 'g' },
            ].map(({ label, val, unit }) => (
              <div key={label}>
                <div className="text-[11px] font-mono text-[#888]">
                  {val.toFixed(0)}
                  <span className="text-[9px] text-[#333] ml-0.5">{unit}</span>
                </div>
                <div className="text-[9px] font-mono text-[#2a2a2a] uppercase tracking-wider mt-0.5">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meal list */}
      <div className="space-y-1.5 mb-3">
        {meals.map((meal) => (
          <div key={meal.id} className="border border-[#181818] rounded">
            <button
              type="button"
              onClick={() => setExpandedId(expandedId === meal.id ? null : meal.id)}
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[#111111] transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-[#777] truncate">{meal.name || 'Meal'}</span>
                {meal.time && (
                  <span className="text-[10px] text-[#2a2a2a] font-mono flex-shrink-0">
                    {meal.time}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                {meal.protein !== null && (
                  <span className="text-[10px] font-mono text-[#4a4a4a]">
                    {meal.protein}g P
                  </span>
                )}
                {meal.calories !== null && (
                  <span className="text-[10px] font-mono text-[#383838]">
                    {meal.calories} kcal
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    remove(meal.id)
                  }}
                  className="text-[#1e1e1e] hover:text-[#f87171] text-xs transition-colors"
                >
                  ✕
                </button>
              </div>
            </button>

            {expandedId === meal.id && (
              <div className="px-3 pb-3 pt-2 border-t border-[#181818]">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={meal.name}
                      onChange={(e) => update(meal.id, { name: e.target.value })}
                      className="w-full bg-[#0d0d0d] border border-[#1c1c1c] rounded px-2 py-1.5 text-xs font-mono text-[#d4d4d4] focus:outline-none focus:border-[#2a2a2a]"
                      placeholder="Meal name"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-1">
                      Time
                    </label>
                    <input
                      type="time"
                      value={meal.time}
                      onChange={(e) => update(meal.id, { time: e.target.value })}
                      className="w-full bg-[#0d0d0d] border border-[#1c1c1c] rounded px-2 py-1.5 text-xs font-mono text-[#d4d4d4] focus:outline-none focus:border-[#2a2a2a]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  <MacroInput
                    label="Protein"
                    value={meal.protein}
                    onChange={(v) => update(meal.id, { protein: v })}
                  />
                  <MacroInput
                    label="Fat"
                    value={meal.fat}
                    onChange={(v) => update(meal.id, { fat: v })}
                  />
                  <MacroInput
                    label="Carbs"
                    value={meal.carbs}
                    onChange={(v) => update(meal.id, { carbs: v })}
                  />
                  <MacroInput
                    label="kcal"
                    unit="kcal"
                    value={meal.calories}
                    onChange={(v) => update(meal.id, { calories: v })}
                  />
                  <MacroInput
                    label="Fiber"
                    value={meal.fiber}
                    onChange={(v) => update(meal.id, { fiber: v })}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Template picker */}
      {showTemplates && templates.length > 0 && (
        <div className="mb-3 border border-[#181818] rounded overflow-hidden">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => addFromTemplate(t)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#111111] transition-colors border-b border-[#141414] last:border-0"
            >
              <span className="text-xs text-[#777]">{t.name}</span>
              <span className="text-[10px] font-mono text-[#383838]">
                {t.protein}g P · {t.calories} kcal
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Add buttons */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={add}
          className="flex-1 py-2 border border-dashed border-[#1c1c1c] rounded text-xs text-[#2a2a2a] hover:text-[#444] hover:border-[#252525] transition-colors font-mono"
        >
          + add meal
        </button>
        {templates.length > 0 && (
          <button
            type="button"
            onClick={() => setShowTemplates(!showTemplates)}
            className="px-3 py-2 border border-[#1c1c1c] rounded text-xs text-[#2a2a2a] hover:text-[#444] hover:border-[#252525] transition-colors font-mono"
          >
            {showTemplates ? 'hide' : 'templates'}
          </button>
        )}
      </div>

      {/* Hydration */}
      <div>
        <label className="block text-[10px] text-[#444] font-mono uppercase tracking-wider mb-1">
          Hydration
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step={100}
            value={hydration_ml ?? ''}
            onChange={(e) =>
              onHydrationChange(e.target.value === '' ? null : parseInt(e.target.value))
            }
            className="w-28 bg-[#0d0d0d] border border-[#1c1c1c] rounded px-2 py-1.5 text-xs font-mono text-[#d4d4d4] focus:outline-none focus:border-[#2a2a2a]"
            placeholder="—"
          />
          <span className="text-[10px] text-[#2a2a2a] font-mono">ml</span>
          {hydration_ml ? (
            <span className="text-[10px] text-[#3a3a3a] font-mono">
              {(hydration_ml / 1000).toFixed(1)} L
            </span>
          ) : null}
        </div>
      </div>
    </Section>
  )
}
