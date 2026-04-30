'use client'

// Meal logging flow + template management, all hosted in one modal:
//   menu       → "add ingredients" or "use a template" (bottom sheet)
//   search     → ingredient autocomplete + USDA search (scan icon → scan)
//   scan       → live camera preview, html5-qrcode → Open Food Facts
//   weight     → weight entry with live macro preview
//   building   → running ingredient list + totals (also reused as the
//                template edit view when editingTemplate is non-null)
//   confirm    → optional peak glucose + notes + save-as-template
//   templates  → list of saved templates: use / edit / delete / new
//
// Mounted as the modal body inside NutritionSection. The menu screen is
// a short bottom sheet; the rest fill the sheet to near full height.

import { animate, AnimatePresence, motion, useAnimationControls } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// ─── Types (mirrors API responses) ────────────────────────────────────────
interface NutrientsPer100g {
  calories: number | null
  protein:  number | null
  carbs:    number | null
  fat:      number | null
  fiber:    number | null
  raw?:     unknown[]
}

interface FoodItem {
  id: string
  name: string
  fdc_id: string | null
  source: 'usda' | 'open_food_facts' | 'custom' | 'recipe' | 'recipe_deleted'
  nutrients_per_100g: NutrientsPer100g
}

interface SearchResult {
  source: 'local' | 'usda'
  food_item_id: string | null
  fdc_id: string | null
  name: string
  nutrients_per_100g: NutrientsPer100g
  use_count?: number
}

interface PendingItem {
  food_item: FoodItem
  weight_grams: number
  // For barcode-sourced items in Step 6 — surfaced as a tap-to-fill chip
  serving_grams?: number | null
  serving_label?: string | null
  // If editing an existing item in the meal, this is its index in items[]
  editIndex?: number | null
}

interface BuildingItem {
  food_item: FoodItem
  weight_grams: number
}

type Screen = 'menu' | 'search' | 'weight' | 'building' | 'confirm' | 'templates' | 'scan' | 'library' | 'recipeBuilder' | 'photoEstimate'

interface Props {
  onClose: () => void
  onSaved: () => void
  currentDate: string
  initialScreen?: Screen
  editingMeal?: EditingMealProp
}

// When editingTemplate is non-null the building screen behaves as the
// "Editing template" view from the spec: name input on top, save writes
// to meal_templates/meal_template_items, and the confirm screen is skipped.
interface EditingTemplate {
  id: string | null   // null = new template, string = editing existing
  name: string
}

// Passed from NutritionSection when the user taps "Edit meal" on a logged meal.
// Starts the logger at the building screen pre-populated with existing items.
interface EditingMealProp {
  id: string
  name: string
  notes: string | null
  items: Array<{
    food_item: {
      id: string
      name: string
      fdc_id: string | null
      source: 'usda' | 'open_food_facts' | 'custom' | 'recipe' | 'recipe_deleted'
      nutrients_per_100g: {
        calories: number | null
        protein:  number | null
        carbs:    number | null
        fat:      number | null
        fiber:    number | null
      }
    }
    weight_grams: number
  }>
}

// Shape returned by GET /api/nutrition/recipe
interface RecipeIngredientRow {
  id: string
  weight_grams: number
  food_items: FoodItem | FoodItem[] | null
}

interface RecipeRow {
  id: string
  name: string
  status: 'draft' | 'active'
  total_servings: number
  total_cooked_grams: number | null
  default_serving_grams: number | null
  is_raw: boolean
  food_item_id: string | null
  updated_at: string
  ingredients: RecipeIngredientRow[]
  food_items: FoodItem | FoodItem[] | null
}

// Shape returned by POST /api/nutrition/estimate
interface EstimateResult {
  meal_name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  confidence: 'high' | 'medium' | 'low'
}

// State for the recipe builder form
interface RecipeBuilderState {
  id: string | null
  name: string
  servings: string
  servingGrams: string
  cookedGrams: string
  isRaw: boolean
}

// Shape returned by GET /api/nutrition/templates
interface TemplateItemRow {
  id: string
  template_id: string
  default_weight_grams: number
  food_items: FoodItem | FoodItem[] | null
}
interface TemplateRow {
  id: string
  name: string
  notes: string | null
  use_count: number
  created_at: string
  items: TemplateItemRow[]
}

function pickFoodItemFromTemplate(it: TemplateItemRow): FoodItem | null {
  if (!it.food_items) return null
  return Array.isArray(it.food_items) ? it.food_items[0] ?? null : it.food_items
}

// ─── Helpers ──────────────────────────────────────────────────────────────
const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const

function macrosFor(n: NutrientsPer100g | null | undefined, w: number) {
  const out = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  if (!n) return out
  for (const k of MACRO_KEYS) {
    const v = n[k]
    if (typeof v === 'number') out[k] = (v * w) / 100
  }
  return out
}

function totalsFor(items: BuildingItem[]) {
  const t = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  for (const it of items) {
    const m = macrosFor(it.food_item.nutrients_per_100g, it.weight_grams)
    for (const k of MACRO_KEYS) t[k] += m[k]
  }
  return t
}

const r = (n: number) => Math.round(n)

// ─── AnimatedNumber: tweens a numeric display via framer-motion ──────────
function AnimatedNumber({ value, suffix = '', decimals = 0 }: { value: number; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(value)
  useEffect(() => {
    const from = prev.current
    const controls = animate(from, value, {
      duration: 0.25,
      ease: 'easeOut',
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = `${v.toFixed(decimals)}${suffix}`
      },
    })
    prev.current = value
    return () => controls.stop()
  }, [value, suffix, decimals])
  return <span ref={ref}>{value.toFixed(decimals)}{suffix}</span>
}

// ─── Five-macro inline row ────────────────────────────────────────────────
const MACRO_DISPLAY: Array<{ key: typeof MACRO_KEYS[number]; suffix: string }> = [
  { key: 'calories', suffix: ' kcal' },
  { key: 'protein',  suffix: 'g P'   },
  { key: 'carbs',    suffix: 'g C'   },
  { key: 'fat',      suffix: 'g F'   },
  { key: 'fiber',    suffix: 'g Fi'  },
]

function MacroLine({
  totals, animated = false, dim = false,
}: {
  totals: { calories: number; protein: number; carbs: number; fat: number; fiber: number }
  animated?: boolean
  dim?: boolean
}) {
  return (
    <div style={{
      display: 'flex', gap: 10, flexWrap: 'wrap',
      fontSize: 12, fontFamily: 'var(--font-mono)',
      color: dim ? 'var(--color-text-dim)' : 'var(--color-text-secondary)',
    }}>
      {MACRO_DISPLAY.map(({ key, suffix }) => {
        const value = totals[key]
        return (
          <span key={key}>
            {animated ? <AnimatedNumber value={value} suffix={suffix} /> : `${r(value)}${suffix}`}
          </span>
        )
      })}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────
export default function MealLogger({ onClose, onSaved, currentDate, initialScreen, editingMeal }: Props) {
  const [screen, setScreen] = useState<Screen>(editingMeal ? 'building' : (initialScreen ?? 'menu'))
  const [mealName, setMealName] = useState(editingMeal?.name ?? '')
  const [items, setItems] = useState<BuildingItem[]>((editingMeal?.items ?? []) as BuildingItem[])
  const [pending, setPending] = useState<PendingItem | null>(null)

  // Template-edit mode (null = logging a meal)
  const [editingTemplate, setEditingTemplate] = useState<EditingTemplate | null>(null)

  // Recipe builder mode (null = not building a recipe)
  const [editingRecipe, setEditingRecipe] = useState<RecipeBuilderState | null>(null)

  // Where to return when the user presses Back on the library screen
  const [libraryReturnScreen, setLibraryReturnScreen] = useState<'menu' | 'search'>('menu')

  // Confirm-screen fields
  const [notes, setNotes] = useState(editingMeal?.notes ?? '')

  // Save state
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Photo estimation result (non-null when coming from ScreenPhotoEstimate)
  const [estimateResult, setEstimateResult] = useState<EstimateResult | null>(null)

  // Lock body scroll while logger is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const fullSheet = screen !== 'menu'

  const goToSearch = () => setScreen('search')

  const onItemPicked = (food_item: FoodItem, defaults?: { serving_grams?: number | null; serving_label?: string | null; weight_grams?: number; editIndex?: number | null }) => {
    setPending({
      food_item,
      weight_grams: defaults?.weight_grams ?? defaults?.serving_grams ?? 100,
      serving_grams: defaults?.serving_grams ?? null,
      serving_label: defaults?.serving_label ?? null,
      editIndex: defaults?.editIndex ?? null,
    })
    setScreen('weight')
  }

  const commitPending = () => {
    if (!pending) return
    if (pending.editIndex != null) {
      setItems(prev => prev.map((it, i) => i === pending.editIndex
        ? { food_item: pending.food_item, weight_grams: pending.weight_grams }
        : it))
    } else {
      setItems(prev => [...prev, { food_item: pending.food_item, weight_grams: pending.weight_grams }])
    }
    setPending(null)
    setScreen(editingRecipe !== null ? 'recipeBuilder' : 'building')
  }

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const handleConfirm = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      if (editingMeal) {
        const res = await fetch('/api/nutrition/meal', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingMeal.id,
            name: mealName,
            notes: notes.trim() || null,
            items: items.map(it => ({ food_item_id: it.food_item.id, weight_grams: it.weight_grams })),
          }),
        })
        const j = await res.json()
        if (!res.ok || j.error) {
          setSaveError(j.error ?? 'Save failed')
          return
        }
        onSaved()
        return
      }
      const isEstimate = estimateResult !== null
      // Use currentDate (the date selected in the UI) with the current wall-clock
      // time. Without this, meals logged while viewing a past date would be saved
      // under today's date and then not appear in the refreshed past-date view.
      const loggedAt = `${currentDate}T${new Date().toISOString().slice(11)}`
      const body = isEstimate
        ? {
            name: mealName,
            logged_at: loggedAt,
            logged_via: 'photo_estimate' as const,
            notes: notes.trim() || null,
            calories: estimateResult.calories,
            protein_g: estimateResult.protein_g,
            carbs_g: estimateResult.carbs_g,
            fat_g: estimateResult.fat_g,
            fiber_g: estimateResult.fiber_g,
            items: [],
          }
        : {
            name: mealName,
            logged_at: loggedAt,
            logged_via: 'ingredients' as const,
            notes: notes.trim() || null,
            items: items.map(it => ({ food_item_id: it.food_item.id, weight_grams: it.weight_grams })),
          }
      const res = await fetch('/api/nutrition/meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok || j.error) {
        setSaveError(j.error ?? 'Save failed')
        return
      }
      onSaved()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ─── Template handlers ─────────────────────────────────────────────────
  // Stagger setItems with setTimeout so each row mounts at a different
  // tick — its initial enter animation fires individually and you get the
  // "assembling" feel the spec calls for, without bespoke animation code.
  const applyTemplate = (t: TemplateRow) => {
    const built: BuildingItem[] = t.items
      .map(it => {
        const fi = pickFoodItemFromTemplate(it)
        return fi ? { food_item: fi, weight_grams: it.default_weight_grams } : null
      })
      .filter((x): x is BuildingItem => x !== null)

    setMealName(t.name)
    setItems([])
    setEditingTemplate(null)
    setScreen('building')

    // Fire-and-forget use_count bump.
    fetch('/api/nutrition/templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, bump_use_count: true }),
    }).catch(() => {})

    built.forEach((bi, i) => {
      setTimeout(() => setItems(prev => [...prev, bi]), 80 + i * 70)
    })
  }

const startNewTemplate = () => {
    setEditingTemplate({ id: null, name: '' })
    setItems([])
    setMealName('')
    setScreen('building')
  }

  const startEditTemplate = (t: TemplateRow) => {
    const built: BuildingItem[] = t.items
      .map(it => {
        const fi = pickFoodItemFromTemplate(it)
        return fi ? { food_item: fi, weight_grams: it.default_weight_grams } : null
      })
      .filter((x): x is BuildingItem => x !== null)
    setEditingTemplate({ id: t.id, name: t.name })
    setItems(built)
    setScreen('building')
  }

  const saveTemplate = async () => {
    if (!editingTemplate) return
    setSaving(true)
    setSaveError(null)
    try {
      const name = editingTemplate.name.trim()
      if (!name) { setSaveError('Template name is required'); return }
      const itemsBody = items.map(it => ({
        food_item_id: it.food_item.id,
        default_weight_grams: it.weight_grams,
      }))
      const isNew = editingTemplate.id == null
      const res = await fetch('/api/nutrition/templates', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew
          ? { name, items: itemsBody }
          : { id: editingTemplate.id, name, items: itemsBody }),
      })
      const j = await res.json()
      if (!res.ok || j.error) { setSaveError(j.error ?? 'Save failed'); return }
      // Reset and return to library
      setItems([])
      setEditingTemplate(null)
      setScreen('library')
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ─── Recipe builder handlers ───────────────────────────────────────────
  // Wipes every piece of state the recipe builder reads so a fresh session
  // never inherits anything from a previous one (form fields, ingredients,
  // any lingering save error).
  const resetRecipeBuilderState = () => {
    setEditingRecipe(null)
    setItems([])
    setSaveError(null)
  }

  const startNewRecipe = () => {
    resetRecipeBuilderState()
    setEditingRecipe({ id: null, name: '', servings: '1', servingGrams: '', cookedGrams: '', isRaw: false })
    setScreen('recipeBuilder')
  }

  const startEditRecipe = (recipe: RecipeRow) => {
    const built: BuildingItem[] = (recipe.ingredients ?? [])
      .map(ri => {
        const fi = Array.isArray(ri.food_items) ? ri.food_items[0] ?? null : ri.food_items
        return fi ? { food_item: fi, weight_grams: ri.weight_grams } : null
      })
      .filter((x): x is BuildingItem => x !== null)
    resetRecipeBuilderState()
    setEditingRecipe({
      id: recipe.id,
      name: recipe.name,
      servings: String(recipe.total_servings),
      servingGrams: recipe.default_serving_grams != null ? String(recipe.default_serving_grams) : '',
      cookedGrams: recipe.total_cooked_grams != null ? String(recipe.total_cooked_grams) : '',
      isRaw: recipe.is_raw === true,
    })
    setItems(built)
    setScreen('recipeBuilder')
  }

  const saveRecipe = async () => {
    if (!editingRecipe) return
    setSaving(true)
    setSaveError(null)
    try {
      const name = editingRecipe.name.trim()
      if (!name) { setSaveError('Recipe name is required'); setSaving(false); return }
      const servings = parseInt(editingRecipe.servings, 10)
      if (!servings || servings < 1) { setSaveError('Total servings must be at least 1'); setSaving(false); return }
      // Raw / assembled recipes have no cooking step — cooked weight is
      // null, divisor on the API side is sum of ingredient weights.
      const cookedGrams = editingRecipe.isRaw
        ? null
        : (editingRecipe.cookedGrams.trim() ? Number(editingRecipe.cookedGrams) : null)
      const servingGrams = editingRecipe.servingGrams.trim() ? Number(editingRecipe.servingGrams) : null
      const payload = {
        name,
        total_servings: servings,
        default_serving_grams: servingGrams,
        total_cooked_grams: cookedGrams,
        is_raw: editingRecipe.isRaw,
        ingredients: items.map(it => ({ food_item_id: it.food_item.id, weight_grams: it.weight_grams })),
      }
      const isNew = editingRecipe.id == null
      const res = await fetch('/api/nutrition/recipe', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? payload : { id: editingRecipe.id, ...payload }),
      })
      const j = await res.json()
      if (!res.ok || j.error) { setSaveError(j.error ?? 'Save failed'); return }
      resetRecipeBuilderState()
      setScreen('library')
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,40,30,0.4)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        zIndex: 100,
        paddingBottom: 'calc(72px + env(safe-area-inset-bottom))',
      }}
    >
      <motion.div
        initial={{ y: 240 }}
        animate={{ y: 0, height: fullSheet ? 'calc(92vh - 72px - env(safe-area-inset-bottom))' : 'auto' }}
        transition={{ type: 'spring', damping: 26, stiffness: 240 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-surface)',
          width: '100%', maxWidth: 480,
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* AnimatePresence needs a single keyed child for reliable
            mode="wait" transitions; multiple sibling conditionals can
            stall the exit/enter handoff. */}
        <AnimatePresence mode="wait">
          {(() => {
            switch (screen) {
              case 'menu':
                return (
                  <ScreenMenu
                    key="menu"
                    mealName={mealName}
                    setMealName={setMealName}
                    onAddIngredients={goToSearch}
                    onBrowseLibrary={() => setScreen('library')}
                    onCreateRecipe={startNewRecipe}
                    onPhotoEstimate={() => setScreen('photoEstimate')}
                    onClose={onClose}
                  />
                )
              case 'search':
                return (
                  <ScreenSearch
                    key="search"
                    context={editingRecipe !== null ? 'recipe' : 'meal'}
                    hasItems={items.length > 0}
                    onPick={(food_item) => onItemPicked(food_item)}
                    onScan={() => setScreen('scan')}
                    onCreateRecipe={startNewRecipe}
                    onBrowseLibrary={editingRecipe === null ? () => {
                      setLibraryReturnScreen('search')
                      setScreen('library')
                    } : undefined}
                    onBack={() => {
                      if (editingRecipe !== null) setScreen('recipeBuilder')
                      else if (items.length > 0) setScreen('building')
                      else if (editingTemplate) setScreen('library')
                      else setScreen('menu')
                    }}
                  />
                )
              case 'scan':
                return (
                  <ScreenScan
                    key="scan"
                    onPick={(food_item, defaults) => onItemPicked(food_item, defaults)}
                    onBack={() => setScreen('search')}
                  />
                )
              case 'weight':
                return pending ? (
                  <ScreenWeight
                    key="weight"
                    pending={pending}
                    setPending={setPending}
                    onCommit={commitPending}
                    addLabel={editingRecipe !== null ? 'Add to recipe' : 'Add to meal'}
                    onBack={() => {
                      setPending(null)
                      setScreen(
                        editingRecipe !== null
                          ? (items.length > 0 ? 'recipeBuilder' : 'search')
                          : (items.length > 0 ? 'building' : 'search'),
                      )
                    }}
                  />
                ) : null
              case 'building':
                return (
                  <ScreenBuilding
                    key="building"
                    mealName={mealName}
                    items={items}
                    template={editingTemplate}
                    setTemplateName={(name) => setEditingTemplate(prev => prev ? { ...prev, name } : prev)}
                    saving={saving}
                    saveError={saveError}
                    onEdit={(idx) => onItemPicked(items[idx].food_item, {
                      weight_grams: items[idx].weight_grams,
                      editIndex: idx,
                    })}
                    onRemove={removeItem}
                    onAddAnother={goToSearch}
                    onSave={() => setScreen('confirm')}
                    onSaveTemplate={saveTemplate}
                    onBack={() => {
                      if (editingTemplate) {
                        setEditingTemplate(null)
                        setItems([])
                        setScreen('library')
                      } else if (editingMeal) {
                        onClose()
                      } else {
                        setScreen('menu')
                      }
                    }}
                  />
                )
              case 'confirm':
                return (
                  <ScreenConfirm
                    key="confirm"
                    mealName={mealName}
                    setMealName={setMealName}
                    items={items}
                    estimate={estimateResult ?? undefined}
                    notes={notes}
                    setNotes={setNotes}
                    saving={saving}
                    error={saveError}
                    onConfirm={handleConfirm}
                    onBack={() => estimateResult ? setScreen('photoEstimate') : setScreen('building')}
                  />
                )
              case 'library':
                return (
                  <ScreenLibrary
                    key="library"
                    onBack={() => {
                      if (initialScreen === 'library') onClose()
                      else setScreen(libraryReturnScreen)
                    }}
                    onNewRecipe={startNewRecipe}
                    onEditRecipe={startEditRecipe}
                    onUseRecipe={(foodItem, servingGrams) => {
                      const weight = servingGrams ?? 100
                      setItems(prev => [...prev, { food_item: foodItem, weight_grams: weight }])
                      setScreen('building')
                    }}
                  />
                )
              case 'recipeBuilder':
                return editingRecipe ? (
                  <ScreenRecipeBuilder
                    key="recipeBuilder"
                    recipeState={editingRecipe}
                    setRecipeState={setEditingRecipe}
                    items={items}
                    saving={saving}
                    saveError={saveError}
                    onEdit={(idx) => onItemPicked(items[idx].food_item, {
                      weight_grams: items[idx].weight_grams,
                      editIndex: idx,
                    })}
                    onRemove={removeItem}
                    onAddIngredient={() => setScreen('search')}
                    onSave={saveRecipe}
                    onBack={() => {
                      resetRecipeBuilderState()
                      setScreen('library')
                    }}
                  />
                ) : null
              case 'photoEstimate':
                return (
                  <ScreenPhotoEstimate
                    key="photoEstimate"
                    onBack={() => setScreen('menu')}
                    onEstimated={(result) => {
                      setEstimateResult(result)
                      setMealName(result.meal_name)
                      setScreen('confirm')
                    }}
                  />
                )
            }
          })()}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

// ─── Screen 1: Menu ───────────────────────────────────────────────────────
function ScreenMenu({
  mealName, setMealName, onAddIngredients, onBrowseLibrary, onCreateRecipe, onPhotoEstimate, onClose,
}: {
  mealName: string
  setMealName: (s: string) => void
  onAddIngredients: () => void
  onBrowseLibrary: () => void
  onCreateRecipe: () => void
  onPhotoEstimate: () => void
  onClose: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ padding: 20, paddingBottom: 'calc(32px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>Log a meal</span>
        <CloseButton onClick={onClose} />
      </div>

      <input
        type="text"
        value={mealName}
        onChange={(e) => setMealName(e.target.value)}
        placeholder="Meal name (optional — auto-filled from time of day)"
        style={{
          padding: '10px 12px', fontSize: 14,
          color: 'var(--color-text-primary)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 8, outline: 'none',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="button" onClick={onAddIngredients} className="btn-primary"
          style={{ padding: '14px 16px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <span>Add ingredients</span>
          <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, lineHeight: 1.3 }}>
            Search by name or scan a barcode
          </span>
        </button>
        <button
          type="button" onClick={onBrowseLibrary} className="btn-secondary"
          style={{ padding: '14px 16px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <span>Browse Library</span>
          <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, lineHeight: 1.3 }}>
            Your saved recipes and templates
          </span>
        </button>
        <button
          type="button" onClick={onCreateRecipe} className="btn-secondary"
          style={{ padding: '14px 16px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <span>Create a recipe</span>
          <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, lineHeight: 1.3 }}>
            Build a batch recipe by weight
          </span>
        </button>
        <button
          type="button" onClick={onPhotoEstimate} className="btn-secondary"
          style={{ padding: '14px 16px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <span>Estimate from photo or description</span>
          <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, lineHeight: 1.3 }}>
            Claude will estimate the macros
          </span>
        </button>
      </div>
    </motion.div>
  )
}

// ─── Screen 2: Search ─────────────────────────────────────────────────────
interface MacroEditFields {
  calories: string
  protein: string
  carbs: string
  fat: string
  fiber: string
}

function ScreenSearch({
  context = 'meal', hasItems, onPick, onScan, onCreateRecipe, onBrowseLibrary, onBack,
}: {
  context?: 'meal' | 'recipe'
  hasItems: boolean
  onPick: (food_item: FoodItem) => void
  onScan: () => void
  onCreateRecipe: () => void
  onBrowseLibrary?: () => void
  onBack: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Macro edit modal state
  const [editingResult, setEditingResult] = useState<SearchResult | null>(null)
  const [editFields, setEditFields] = useState<MacroEditFields>({ calories: '', protein: '', carbs: '', fat: '', fiber: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const openEdit = (r: SearchResult) => {
    const n = r.nutrients_per_100g
    setEditFields({
      calories: n.calories != null ? String(n.calories) : '',
      protein:  n.protein  != null ? String(n.protein)  : '',
      carbs:    n.carbs    != null ? String(n.carbs)    : '',
      fat:      n.fat      != null ? String(n.fat)      : '',
      fiber:    n.fiber    != null ? String(n.fiber)    : '',
    })
    setEditError(null)
    setEditingResult(r)
  }

  const closeEdit = () => { setEditingResult(null); setEditError(null) }

  const saveEdit = async () => {
    if (!editingResult?.food_item_id) return
    setEditSaving(true)
    setEditError(null)
    try {
      const toNum = (s: string) => s.trim() === '' ? undefined : Number(s)
      const res = await fetch('/api/nutrition/food-item', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingResult.food_item_id,
          calories: toNum(editFields.calories),
          protein:  toNum(editFields.protein),
          carbs:    toNum(editFields.carbs),
          fat:      toNum(editFields.fat),
          fiber:    toNum(editFields.fiber),
        }),
      })
      const j = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || j.error) { setEditError(j.error ?? 'Save failed'); return }
      // Update the local result list so the row reflects new values immediately
      setResults(prev => prev.map(r => {
        if (r.food_item_id !== editingResult.food_item_id) return r
        return {
          ...r,
          nutrients_per_100g: {
            ...r.nutrients_per_100g,
            ...(toNum(editFields.calories) !== undefined ? { calories: toNum(editFields.calories)! } : {}),
            ...(toNum(editFields.protein)  !== undefined ? { protein:  toNum(editFields.protein)!  } : {}),
            ...(toNum(editFields.carbs)    !== undefined ? { carbs:    toNum(editFields.carbs)!    } : {}),
            ...(toNum(editFields.fat)      !== undefined ? { fat:      toNum(editFields.fat)!      } : {}),
            ...(toNum(editFields.fiber)    !== undefined ? { fiber:    toNum(editFields.fiber)!    } : {}),
          },
        }
      }))
      closeEdit()
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setEditSaving(false)
    }
  }

  useEffect(() => { inputRef.current?.focus() }, [])

  // Debounce 400ms before search call. Local results return instantly from
  // the API since they don't touch USDA, but the input still feels right
  // with the same debounce.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/nutrition/search?q=${encodeURIComponent(query)}`)
        const j = await res.json() as { results?: SearchResult[]; error?: string }
        if (j.error) setError(j.error)
        else setResults(j.results ?? [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Search failed')
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  // Inline ghost-text autocomplete: if the top local result starts with the
  // query, show the rest as a faded suggestion behind the input. Tab or
  // ArrowRight-at-end accepts.
  const ghost = useMemo(() => {
    const q = query
    if (!q) return ''
    const localTop = results.find(r => r.source === 'local')
    if (!localTop) return ''
    const ql = q.toLowerCase()
    const nl = localTop.name.toLowerCase()
    if (nl.startsWith(ql) && nl.length > ql.length) return localTop.name.slice(q.length)
    return ''
  }, [query, results])

  const acceptGhost = () => {
    if (!ghost) return
    setQuery(prev => prev + ghost)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!ghost) return
    if (e.key === 'Tab') { e.preventDefault(); acceptGhost(); return }
    if (e.key === 'ArrowRight') {
      const el = e.currentTarget
      if (el.selectionStart === query.length && el.selectionEnd === query.length) {
        e.preventDefault()
        acceptGhost()
      }
    }
  }

  const pickResult = async (r: SearchResult) => {
    if (r.food_item_id) {
      // Already cached — fabricate a FoodItem shape from the row.
      onPick({
        id: r.food_item_id,
        name: r.name,
        fdc_id: r.fdc_id,
        source: r.source === 'local' ? 'custom' : 'usda',
        nutrients_per_100g: r.nutrients_per_100g,
      })
      return
    }
    // USDA hit — cache via /api/nutrition/food-item, then pick the returned row.
    try {
      const res = await fetch('/api/nutrition/food-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fdc_id: r.fdc_id,
          name: r.name,
          nutrients_per_100g: r.nutrients_per_100g,
          source: 'usda',
        }),
      })
      const j = await res.json() as { food_item?: FoodItem; error?: string }
      if (!res.ok || !j.food_item) {
        setError(j.error ?? 'Could not save ingredient')
        return
      }
      onPick(j.food_item)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save ingredient')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.18 }}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' }}
    >
      <Header
        title={context === 'recipe' ? 'Add to recipe' : 'Add ingredient'}
        onBack={onBack}
        backLabel={context === 'recipe' ? 'Back to recipe' : hasItems ? 'Back to meal' : 'Cancel'}
      />

      <div style={{ padding: '8px 16px 12px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            {/* Ghost text rendered behind the real input */}
            <div
              aria-hidden
              style={{
                position: 'absolute', inset: 0, padding: '12px 14px',
                fontSize: 16, color: 'transparent',
                fontFamily: 'var(--font-sans)', whiteSpace: 'pre',
                pointerEvents: 'none', overflow: 'hidden',
              }}
            >
              <span>{query}</span>
              <span style={{ color: 'var(--color-text-dim)' }}>{ghost}</span>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Search ingredients…"
              autoComplete="off"
              spellCheck={false}
              style={{
                width: '100%', padding: '12px 14px',
                fontSize: 16,
                color: 'var(--color-text-primary)',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                borderRadius: 8, outline: 'none',
                position: 'relative', zIndex: 1,
              }}
            />
          </div>
          <button
            type="button"
            onClick={onScan}
            aria-label="Scan barcode"
            style={{
              flexShrink: 0,
              width: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
            }}
          >
            <BarcodeIcon />
          </button>
        </div>
        {ghost && (
          <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 4 }}>
            Tab to autocomplete
          </div>
        )}
        {context === 'meal' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={onCreateRecipe}
              className="btn-secondary"
              style={{ fontSize: 12, padding: '6px 12px' }}
            >
              Create a recipe
            </button>
            {onBrowseLibrary && (
              <button
                type="button"
                onClick={onBrowseLibrary}
                className="btn-secondary"
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                Browse Library
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px calc(16px + env(safe-area-inset-bottom))' }}>
        {error && (
          <div style={{ fontSize: 12, color: 'var(--color-danger)', marginBottom: 8 }}>{error}</div>
        )}
        {searching && results.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-dim)', textAlign: 'center', padding: 16 }}>Searching…</div>
        )}
        {!searching && query && results.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-dim)', textAlign: 'center', padding: 16 }}>No results</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {results.map((r, i) => {
            const isLocal = r.source === 'local'
            return (
              <div
                key={`${r.source}-${r.fdc_id ?? r.food_item_id ?? i}`}
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  display: 'flex', alignItems: 'stretch',
                }}
              >
                <button
                  type="button"
                  onClick={() => pickResult(r)}
                  style={{
                    flex: 1, minWidth: 0,
                    padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
                    background: 'none', border: 'none', borderRadius: '10px 0 0 10px',
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.name}
                    </span>
                    <SourceBadge source={r.source} />
                  </div>
                  <PerHundredLine n={r.nutrients_per_100g} />
                </button>
                {isLocal && (
                  <button
                    type="button"
                    onClick={() => openEdit(r)}
                    aria-label="Edit macros"
                    style={{
                      flexShrink: 0, width: 36,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'none', border: 'none',
                      borderLeft: '1px solid var(--color-border)',
                      borderRadius: '0 10px 10px 0',
                      cursor: 'pointer', color: 'var(--color-text-dim)',
                    }}
                  >
                    <PencilIcon />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Macro edit modal overlay */}
      {editingResult && (
        <div
          onClick={closeEdit}
          style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--color-surface)',
              borderRadius: 14, padding: 20,
              width: '100%', maxWidth: 360,
              display: 'flex', flexDirection: 'column', gap: 14,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
              Edit macros — {editingResult.name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>per 100g</div>

            {([
              { key: 'calories' as const, label: 'Calories', suffix: 'kcal' },
              { key: 'protein'  as const, label: 'Protein',  suffix: 'g' },
              { key: 'carbs'    as const, label: 'Carbs',    suffix: 'g' },
              { key: 'fat'      as const, label: 'Fat',      suffix: 'g' },
              { key: 'fiber'    as const, label: 'Fiber',    suffix: 'g' },
            ]).map(({ key, label, suffix }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', width: 64 }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={editFields[key]}
                    onChange={e => setEditFields(prev => ({ ...prev, [key]: e.target.value }))}
                    style={{
                      flex: 1, padding: '8px 10px', fontSize: 14, fontFamily: 'var(--font-mono)',
                      color: 'var(--color-text-primary)',
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 6, outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--color-text-dim)', width: 28 }}>{suffix}</span>
                </div>
              </div>
            ))}

            {editError && (
              <div style={{ fontSize: 12, color: 'var(--color-danger)' }}>{editError}</div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={closeEdit}
                className="btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={editSaving}
                className="btn-primary"
                style={{ flex: 1, opacity: editSaving ? 0.6 : 1 }}
              >
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

function SourceBadge({ source }: { source: 'local' | 'usda' }) {
  const isLocal = source === 'local'
  return (
    <span style={{
      fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase',
      padding: '2px 6px', borderRadius: 4,
      color: isLocal ? 'var(--color-primary-dark)' : 'var(--color-text-dim)',
      background: isLocal ? 'var(--color-primary-light)' : 'transparent',
      border: isLocal ? 'none' : '1px solid var(--color-border)',
      flexShrink: 0,
    }}>
      {isLocal ? 'Library' : 'USDA'}
    </span>
  )
}

function PerHundredLine({ n }: { n: NutrientsPer100g }) {
  const fmt = (v: number | null | undefined, suffix: string) =>
    v == null ? '—' : `${r(v)}${suffix}`
  return (
    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)' }}>
      per 100g: {fmt(n.calories, ' kcal')} · {fmt(n.protein, 'g P')} · {fmt(n.carbs, 'g C')} · {fmt(n.fat, 'g F')} · {fmt(n.fiber, 'g Fi')}
    </div>
  )
}

// ─── Screen 2b: Barcode scan ──────────────────────────────────────────────
// html5-qrcode is loaded dynamically so it never runs during SSR.
const SCANNER_DIV_ID = 'meal-logger-scanner'

interface ScanProduct {
  barcode: string
  name: string
  source: 'open_food_facts'
  nutrients_per_100g: NutrientsPer100g
  serving_grams: number | null
  serving_label: string | null
}

function ScreenScan({
  onPick, onBack,
}: {
  onPick: (
    food_item: FoodItem,
    defaults: { serving_grams?: number | null; serving_label?: string | null; weight_grams?: number },
  ) => void
  onBack: () => void
}) {
  const [status, setStatus]   = useState<'idle' | 'scanning' | 'looking-up' | 'caching'>('scanning')
  const [error,  setError]    = useState<string | null>(null)
  const [hint,   setHint]     = useState<string>('Point the camera at a barcode')
  // Hold a ref to the scanner so the callback can stop it after a hit.
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null)
  // Guard against the library firing the success callback multiple times.
  const handledRef = useRef(false)

  const handleBarcode = useCallback(async (code: string) => {
    if (handledRef.current) return
    handledRef.current = true

    // Stop the camera before doing any network work — keeping it live
    // while we hit the API drains battery and double-fires the callback.
    try { await scannerRef.current?.stop() } catch {}
    setStatus('looking-up')
    setHint('Looking up barcode…')

    try {
      const r = await fetch(`/api/nutrition/barcode?code=${encodeURIComponent(code)}`)
      const j = await r.json() as { product: ScanProduct | null; reason?: string }
      if (!j.product) {
        setStatus('idle')
        setError(j.reason === 'nutrient data incomplete'
          ? 'Found this product but its nutrient data is too sparse to log. Search by name instead.'
          : `No product found for barcode ${code}. Try search instead.`)
        return
      }
      // Cache to food_items (idempotent — same barcode always returns the
      // same row by name+source match).
      setStatus('caching')
      setHint('Saving to library…')
      const cacheRes = await fetch('/api/nutrition/food-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fdc_id: null,
          name: j.product.name,
          nutrients_per_100g: j.product.nutrients_per_100g,
          source: 'open_food_facts',
        }),
      })
      const cacheJ = await cacheRes.json() as { food_item?: FoodItem; error?: string }
      if (!cacheRes.ok || !cacheJ.food_item) {
        setStatus('idle')
        setError(cacheJ.error ?? 'Could not save this barcode')
        return
      }
      onPick(cacheJ.food_item, {
        serving_grams: j.product.serving_grams,
        serving_label: j.product.serving_label,
        weight_grams: j.product.serving_grams ?? 100,
      })
    } catch (e) {
      setStatus('idle')
      setError(e instanceof Error ? e.message : 'Lookup failed')
    }
  }, [onPick])

  // Mount + lifecycle of the camera. Dynamic import so html5-qrcode
  // (which touches navigator.mediaDevices) never runs server-side.
  useEffect(() => {
    let stopped = false
    let scanner: import('html5-qrcode').Html5Qrcode | null = null

    ;(async () => {
      try {
        const mod = await import('html5-qrcode')
        if (stopped) return
        scanner = new mod.Html5Qrcode(SCANNER_DIV_ID)
        scannerRef.current = scanner as unknown as { stop: () => Promise<void>; clear: () => void }
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 140 } },
          (decoded) => { void handleBarcode(decoded) },
          () => { /* per-frame decode failures are normal — ignore */ },
        )
      } catch (e) {
        if (stopped) return
        const msg = e instanceof Error ? e.message : String(e)
        setError(/Permission|NotAllowed/i.test(msg)
          ? 'Camera access denied. Allow it in your browser settings, then try again.'
          : `Could not start camera: ${msg}`)
        setStatus('idle')
      }
    })()

    return () => {
      stopped = true
      if (scanner) {
        try { void scanner.stop().then(() => scanner?.clear()) } catch {}
      }
    }
  }, [handleBarcode])

  const retry = () => {
    handledRef.current = false
    setError(null)
    setStatus('scanning')
    setHint('Point the camera at a barcode')
    // Re-mount the effect by toggling state — simplest: full unmount via
    // onBack would also work, but staying on screen feels smoother.
    // Reusing the same scanner instance via .resume() is unreliable across
    // browsers; easiest is a full restart.
    ;(async () => {
      try {
        if (scannerRef.current) {
          await scannerRef.current.stop()
          scannerRef.current.clear()
          scannerRef.current = null
        }
        const mod = await import('html5-qrcode')
        const scanner = new mod.Html5Qrcode(SCANNER_DIV_ID)
        scannerRef.current = scanner as unknown as { stop: () => Promise<void>; clear: () => void }
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 140 } },
          (decoded) => { void handleBarcode(decoded) },
          () => {},
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(`Could not restart camera: ${msg}`)
        setStatus('idle')
      }
    })()
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.18 }}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <Header title="Scan barcode" onBack={onBack} backLabel="Cancel" />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 14, background: '#000' }}>
        <div
          id={SCANNER_DIV_ID}
          style={{
            width: '100%', maxWidth: 360,
            aspectRatio: '1 / 1',
            background: '#111',
            borderRadius: 12,
            overflow: 'hidden',
            position: 'relative',
          }}
        />
        <div style={{ fontSize: 12, color: '#fff', opacity: 0.85, textAlign: 'center', minHeight: 18 }}>
          {hint}
        </div>
        {status !== 'scanning' && status !== 'idle' && (
          <div style={{ fontSize: 11, color: '#fff', opacity: 0.7 }}>
            {status === 'looking-up' ? 'Open Food Facts…' : 'Caching to library…'}
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: 12, color: 'var(--color-danger)', marginBottom: 8 }}>{error}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onBack} className="btn-secondary" style={{ flex: 1 }}>
              Back to search
            </button>
            <button type="button" onClick={retry} className="btn-primary" style={{ flex: 1 }}>
              Try again
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}

// ─── Screen 3: Weight entry ───────────────────────────────────────────────
function ScreenWeight({
  pending, setPending, onCommit, addLabel = 'Add to meal', onBack,
}: {
  pending: PendingItem
  setPending: (p: PendingItem) => void
  onCommit: () => void
  addLabel?: string
  onBack: () => void
}) {
  const macros = useMemo(
    () => macrosFor(pending.food_item.nutrients_per_100g, pending.weight_grams),
    [pending.food_item.nutrients_per_100g, pending.weight_grams],
  )

  const setWeight = (v: string) => {
    const n = v === '' ? 0 : Number(v)
    if (Number.isFinite(n) && n >= 0) setPending({ ...pending, weight_grams: n })
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.18 }}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <Header
        title={pending.editIndex != null ? 'Edit ingredient' : 'Add weight'}
        onBack={onBack}
      />

      <div style={{ padding: '4px 20px 16px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)', textAlign: 'center', marginTop: 8 }}>
          {pending.food_item.name}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <input
            type="number"
            inputMode="decimal"
            value={pending.weight_grams || ''}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="0"
            style={{
              width: 160, height: 64, padding: '0 12px',
              fontSize: 36, fontFamily: 'var(--font-mono)',
              textAlign: 'center',
              color: 'var(--color-text-primary)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 12, outline: 'none',
            }}
            autoFocus
          />
          <span style={{ fontSize: 18, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>g</span>
        </div>

        {pending.serving_grams != null && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => setPending({ ...pending, weight_grams: pending.serving_grams ?? 0 })}
              className="btn-template"
              style={{ minWidth: 'auto' }}
            >
              {pending.serving_label ? `1 serving (${pending.serving_grams}g) — ${pending.serving_label}` : `1 serving (${pending.serving_grams}g)`}
            </button>
          </div>
        )}

        <div style={{
          padding: 16,
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {([
            { label: 'Calories', value: macros.calories, suffix: ' kcal' },
            { label: 'Protein',  value: macros.protein,  suffix: 'g' },
            { label: 'Carbs',    value: macros.carbs,    suffix: 'g' },
            { label: 'Fat',      value: macros.fat,      suffix: 'g' },
            { label: 'Fiber',    value: macros.fiber,    suffix: 'g' },
          ]).map(({ label, value, suffix }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{label}</span>
              <span style={{ fontSize: 16, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                <AnimatedNumber value={value} suffix={suffix} />
              </span>
            </div>
          ))}
        </div>
      </div>

      <Footer>
        <button
          type="button"
          disabled={pending.weight_grams <= 0}
          onClick={onCommit}
          className="btn-primary"
          style={{ width: '100%', opacity: pending.weight_grams > 0 ? 1 : 0.5 }}
        >
          {pending.editIndex != null ? 'Save changes' : addLabel}
        </button>
      </Footer>
    </motion.div>
  )
}

// ─── Screen 4: Building meal (also reused for editing templates) ──────────
function ScreenBuilding({
  mealName, items, template, setTemplateName,
  saving, saveError,
  onEdit, onRemove, onAddAnother, onSave, onSaveTemplate, onBack,
}: {
  mealName: string
  items: BuildingItem[]
  template: EditingTemplate | null
  setTemplateName: (name: string) => void
  saving: boolean
  saveError: string | null
  onEdit: (idx: number) => void
  onRemove: (idx: number) => void
  onAddAnother: () => void
  onSave: () => void
  onSaveTemplate: () => void
  onBack: () => void
}) {
  const isTemplate = template != null
  const headerTitle = isTemplate
    ? (template.id == null ? 'New template' : 'Editing template')
    : (mealName.trim() ? `Building: ${mealName.trim()}` : 'Building meal')
  const totalsLabel = isTemplate ? 'Template total' : 'Meal total'
  const saveLabel   = isTemplate
    ? (saving ? 'Saving…' : (template.id == null ? 'Create template' : 'Save template'))
    : 'Save meal'
  const handleSave  = isTemplate ? onSaveTemplate : onSave
  const saveDisabled = items.length === 0 || (isTemplate && (saving || !template.name.trim()))
  const totals = useMemo(() => totalsFor(items), [items])
  const pulseControls = useAnimationControls()
  const prevCount = useRef(items.length)

  // Pulse meal-total bar whenever a new ingredient lands. Triggers framer
  // animation directly (no React state) so it's safe inside an effect.
  useEffect(() => {
    if (items.length > prevCount.current) pulseControls.start({ scale: [1, 1.04, 1] })
    prevCount.current = items.length
  }, [items.length, pulseControls])

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.18 }}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <Header
        title={headerTitle}
        onBack={onBack}
        backLabel="Cancel"
      />

      {isTemplate && (
        <div style={{ padding: '12px 16px 4px' }}>
          <FieldLabel>Template name</FieldLabel>
          <input
            type="text"
            value={template.name}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g. Post-run breakfast"
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14,
              color: 'var(--color-text-primary)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8, outline: 'none',
            }}
          />
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px' }}>
        {items.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-dim)', textAlign: 'center', padding: 32 }}>
            No ingredients yet.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <AnimatePresence initial={false}>
              {items.map((it, i) => {
                const m = macrosFor(it.food_item.nutrients_per_100g, it.weight_grams)
                return (
                  <motion.li
                    key={`${it.food_item.id}-${i}`}
                    layout
                    initial={{ opacity: 0, x: -12, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: 'auto' }}
                    exit={{ opacity: 0, x: -12, height: 0 }}
                    transition={{ duration: 0.18 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 10,
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 12px',
                    }}>
                      <button
                        type="button"
                        onClick={() => onEdit(i)}
                        style={{
                          flex: 1, minWidth: 0, textAlign: 'left',
                          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                          display: 'flex', flexDirection: 'column', gap: 4,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                          <span style={{
                            fontSize: 13, color: 'var(--color-text-primary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {it.food_item.name}
                          </span>
                          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                            {it.weight_grams}g
                          </span>
                        </div>
                        <MacroLine totals={m} dim />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(i)}
                        aria-label="Remove"
                        style={{
                          width: 32, height: 32, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--color-text-dim)',
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <Footer>
        <motion.div
          animate={pulseControls}
          transition={{ duration: 0.4 }}
          style={{
            background: 'var(--color-primary-light)',
            border: '1px solid var(--color-primary)',
            borderRadius: 10,
            padding: '10px 12px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-primary-dark)' }}>
            {totalsLabel}
          </span>
          <MacroLine totals={totals} animated />
        </motion.div>

        {isTemplate && saveError && (
          <div style={{ fontSize: 12, color: 'var(--color-danger)', marginBottom: 8 }}>{saveError}</div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onAddAnother}
            className="btn-secondary"
            style={{ flex: 1 }}
          >
            + Add another
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveDisabled}
            className="btn-primary"
            style={{ flex: 1, opacity: saveDisabled ? 0.5 : 1 }}
          >
            {saveLabel}
          </button>
        </div>
      </Footer>
    </motion.div>
  )
}

// ─── Templates: list view (use / edit / delete + new template) ───────────
function ScreenTemplates({
  onApply, onEdit, onNew, onBack,
}: {
  onApply: (t: TemplateRow) => void
  onEdit: (t: TemplateRow) => void
  onNew: () => void
  onBack: () => void
}) {
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/nutrition/templates')
      const j = await res.json() as { templates?: TemplateRow[]; error?: string }
      if (j.error) setError(j.error)
      else setTemplates(j.templates ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/nutrition/templates?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || (j as { error?: string }).error) {
        setError((j as { error?: string }).error ?? 'Delete failed')
        return
      }
      setConfirmDeleteId(null)
      await fetchTemplates()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.18 }}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <Header title="Templates" onBack={onBack} backLabel="Back" />

      <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onNew}
          className="btn-secondary"
          style={{ fontSize: 13, padding: '6px 12px' }}
        >
          + New template
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px' }}>
        {error && (
          <div style={{ fontSize: 12, color: 'var(--color-danger)', marginBottom: 8 }}>{error}</div>
        )}
        {loading && templates.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-dim)', textAlign: 'center', padding: 16 }}>
            Loading templates…
          </div>
        )}
        {!loading && templates.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--color-text-dim)', textAlign: 'center', padding: 32 }}>
            No templates yet — save one from a meal, or create one from scratch.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map(t => {
            const built = t.items
              .map(it => {
                const fi = pickFoodItemFromTemplate(it)
                return fi ? { food_item: fi, weight_grams: it.default_weight_grams } : null
              })
              .filter((x): x is BuildingItem => x !== null)
            const totals = totalsFor(built)
            const isConfirming = confirmDeleteId === t.id

            return (
              <div
                key={t.id}
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.name}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)', flexShrink: 0 }}>
                    {built.length} item{built.length === 1 ? '' : 's'} · used {t.use_count}×
                  </span>
                </div>

                <MacroLine totals={totals} dim />

                {isConfirming ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Delete &ldquo;{t.name}&rdquo;?</span>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      style={{ background: 'var(--color-danger)', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: '#fff' }}
                    >
                      Yes, delete
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => onEdit(t)}
                      style={{
                        background: 'none', border: '1px solid var(--color-border)',
                        borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(t.id)}
                      aria-label="Delete"
                      style={{
                        width: 28, height: 28,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'none', border: '1px solid var(--color-border)',
                        borderRadius: 6, cursor: 'pointer',
                        color: 'var(--color-text-dim)',
                      }}
                    >
                      <TrashIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => onApply(t)}
                      className="btn-primary"
                      style={{ fontSize: 12, padding: '4px 14px' }}
                    >
                      Use
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

// ─── My Library: recipes + templates unified screen ──────────────────────
function ScreenLibrary({
  onBack, onNewRecipe, onEditRecipe, onUseRecipe,
}: {
  onBack: () => void
  onNewRecipe: () => void
  onEditRecipe: (recipe: RecipeRow) => void
  onUseRecipe: (foodItem: FoodItem, servingGrams: number | null) => void
}) {
  const [recipes, setRecipes] = useState<RecipeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<{ type: 'recipe'; id: string } | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const recipeRes = await fetch('/api/nutrition/recipe')
      const recipeJ = await recipeRes.json() as { recipes?: RecipeRow[]; error?: string }
      if (recipeJ.error) setError(recipeJ.error)
      else setRecipes(recipeJ.recipes ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleDeleteRecipe = async (id: string) => {
    try {
      const res = await fetch(`/api/nutrition/recipe?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok || j.error) { setError(j.error ?? 'Delete failed'); return }
      setConfirmDeleteId(null)
      await fetchAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

const pickRecipeFoodItem = (recipe: RecipeRow): FoodItem | null => {
    if (!recipe.food_items) return null
    return Array.isArray(recipe.food_items) ? recipe.food_items[0] ?? null : recipe.food_items
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.18 }}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <Header title="My Library" onBack={onBack} backLabel="Back" />

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px calc(24px + env(safe-area-inset-bottom))' }}>
        {error && (
          <div style={{ fontSize: 12, color: 'var(--color-danger)', marginBottom: 8 }}>{error}</div>
        )}
        {loading && (
          <div style={{ fontSize: 12, color: 'var(--color-text-dim)', textAlign: 'center', padding: 16 }}>Loading…</div>
        )}

        {!loading && (
          <>
            {/* ── Recipes (hidden in template-only mode) ────────────── */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingTop: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-secondary)' }}>
                  Recipes
                </span>
                <button
                  type="button" onClick={onNewRecipe} className="btn-secondary"
                  style={{ fontSize: 12, padding: '5px 10px' }}
                >
                  + New recipe
                </button>
              </div>

              {recipes.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--color-text-dim)', textAlign: 'center', padding: 16 }}>
                  No recipes yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recipes.map(recipe => {
                    const isDraft = recipe.status === 'draft'
                    const foodItem = pickRecipeFoodItem(recipe)
                    const isConfirming = confirmDeleteId?.id === recipe.id && confirmDeleteId?.type === 'recipe'
                    const macros = foodItem?.nutrients_per_100g
                    const hasServing = (recipe.default_serving_grams ?? 0) > 0
                    const displayMacros = (hasServing && macros && recipe.default_serving_grams)
                      ? {
                          calories: ((macros.calories ?? 0) * recipe.default_serving_grams) / 100,
                          protein:  ((macros.protein  ?? 0) * recipe.default_serving_grams) / 100,
                          carbs:    ((macros.carbs    ?? 0) * recipe.default_serving_grams) / 100,
                          fat:      ((macros.fat      ?? 0) * recipe.default_serving_grams) / 100,
                          fiber:    ((macros.fiber    ?? 0) * recipe.default_serving_grams) / 100,
                        }
                      : macros
                        ? { calories: macros.calories ?? 0, protein: macros.protein ?? 0, carbs: macros.carbs ?? 0, fat: macros.fat ?? 0, fiber: macros.fiber ?? 0 }
                        : null

                    return (
                      <div
                        key={recipe.id}
                        style={{
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 10, padding: '10px 12px',
                          display: 'flex', flexDirection: 'column', gap: 8,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => !isDraft && foodItem && onUseRecipe(foodItem, recipe.default_serving_grams ?? null)}
                          disabled={isDraft || !foodItem}
                          style={{
                            background: 'none', border: 'none', padding: 0, textAlign: 'left',
                            cursor: isDraft || !foodItem ? 'default' : 'pointer', width: '100%',
                          }}
                        >
                          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {recipe.name}
                          </div>
                          {isDraft ? (
                            <span style={{
                              display: 'inline-block', marginTop: 4,
                              fontSize: 10, padding: '2px 7px', borderRadius: 4,
                              background: 'rgba(245,158,11,0.15)', color: '#d97706',
                              fontWeight: 500, letterSpacing: '0.04em',
                            }}>
                              Incomplete — add cooked weight or mark as raw
                            </span>
                          ) : displayMacros ? (
                            <div style={{ marginTop: 4 }}>
                              <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginBottom: 2 }}>
                                {hasServing ? `per serving (${recipe.default_serving_grams}g)` : 'per 100g'}
                              </div>
                              <MacroLine totals={displayMacros} dim />
                            </div>
                          ) : null}
                        </button>

                        {isConfirming ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Delete &ldquo;{recipe.name}&rdquo;?</span>
                            <button
                              type="button" onClick={() => setConfirmDeleteId(null)}
                              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                            >Cancel</button>
                            <button
                              type="button" onClick={() => handleDeleteRecipe(recipe.id)}
                              style={{ background: 'var(--color-danger)', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: '#fff' }}
                            >Yes, delete</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              type="button" onClick={() => onEditRecipe(recipe)}
                              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                            >Edit</button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId({ type: 'recipe', id: recipe.id })}
                              aria-label="Delete recipe"
                              style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--color-text-dim)' }}
                            ><TrashIcon /></button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </>
        )}
      </div>
    </motion.div>
  )
}

// ─── Recipe builder screen ────────────────────────────────────────────────
function ScreenRecipeBuilder({
  recipeState, setRecipeState,
  items, saving, saveError,
  onEdit, onRemove, onAddIngredient, onSave, onBack,
}: {
  recipeState: RecipeBuilderState
  setRecipeState: (s: RecipeBuilderState) => void
  items: BuildingItem[]
  saving: boolean
  saveError: string | null
  onEdit: (idx: number) => void
  onRemove: (idx: number) => void
  onAddIngredient: () => void
  onSave: () => void
  onBack: () => void
}) {
  // When isRaw, auto-compute portion size = total ingredient weight / servings.
  // Stop auto-computing once Julie manually edits the field; reset when isRaw
  // is toggled or a new recipe is started (component remounts).
  const [userEditedPortionSize, setUserEditedPortionSize] = useState(false)

  useEffect(() => {
    if (!recipeState.isRaw || userEditedPortionSize) return
    const s = parseInt(recipeState.servings, 10)
    if (!s || s < 1 || items.length === 0) return
    const totalWeight = items.reduce((sum, it) => sum + it.weight_grams, 0)
    const auto = Math.round(totalWeight / s)
    if (auto > 0) setRecipeState({ ...recipeState, servingGrams: String(auto) })
  // recipeState spread is intentional — only trigger on the fields that change
  // the computed value, not on servingGrams itself (would loop).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeState.isRaw, recipeState.servings, items, userEditedPortionSize])

  const batchTotals = useMemo(() => totalsFor(items), [items])
  const servings = parseInt(recipeState.servings, 10) || 0
  const cookedGrams = parseFloat(recipeState.cookedGrams) || 0
  // Raw recipes don't need a cooked weight — the per-serving preview
  // simply divides batch totals by servings since the divisor / batch
  // weight cancels out.
  const hasPreview = recipeState.isRaw
    ? servings > 0 && items.length > 0
    : cookedGrams > 0 && servings > 0 && items.length > 0

  const perServing = useMemo(() => {
    if (!hasPreview) return null
    const s = servings
    return {
      calories: batchTotals.calories / s,
      protein:  batchTotals.protein  / s,
      carbs:    batchTotals.carbs    / s,
      fat:      batchTotals.fat      / s,
      fiber:    batchTotals.fiber    / s,
    }
  }, [hasPreview, batchTotals, servings])

  const headerTitle = recipeState.id ? `Edit: ${recipeState.name || 'Recipe'}` : 'New recipe'
  // Raw recipes save as active so they need at least one ingredient.
  const saveDisabled = !recipeState.name.trim()
    || servings < 1
    || saving
    || (recipeState.isRaw && items.length === 0)

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.18 }}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <Header title={headerTitle} onBack={onBack} backLabel="Cancel" />

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 16px' }}>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Recipe name</FieldLabel>
          <input
            type="text"
            value={recipeState.name}
            onChange={(e) => setRecipeState({ ...recipeState, name: e.target.value })}
            placeholder="e.g. Lentil pilaf"
            autoFocus
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14,
              color: 'var(--color-text-primary)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8, outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div>
            <FieldLabel>Total servings</FieldLabel>
            <input
              type="number" inputMode="numeric" min={1} step={1}
              value={recipeState.servings}
              onChange={(e) => setRecipeState({ ...recipeState, servings: e.target.value })}
              placeholder="1"
              style={{
                width: 80, padding: '10px 12px', fontSize: 14, fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-primary)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8, outline: 'none',
              }}
            />
          </div>
          <div>
            <FieldLabel>
              Portion size — g{' '}
              <span style={{ color: 'var(--color-text-dim)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </FieldLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number" inputMode="decimal" min={1}
                value={recipeState.servingGrams}
                onChange={(e) => {
                  setUserEditedPortionSize(true)
                  setRecipeState({ ...recipeState, servingGrams: e.target.value })
                }}
                placeholder="—"
                style={{
                  width: 80, padding: '10px 12px', fontSize: 14, fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-primary)',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8, outline: 'none',
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>g</span>
            </div>
          </div>
        </div>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 16, cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={recipeState.isRaw}
            onChange={(e) => {
              setUserEditedPortionSize(false)
              setRecipeState({ ...recipeState, isRaw: e.target.checked })
            }}
            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--color-primary)' }}
          />
          <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
            No cooking — assembled from raw ingredients.
          </span>
        </label>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Ingredients</FieldLabel>
          {items.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <AnimatePresence initial={false}>
                {items.map((it, i) => {
                  const m = macrosFor(it.food_item.nutrients_per_100g, it.weight_grams)
                  return (
                    <motion.li
                      key={`${it.food_item.id}-${i}`}
                      layout
                      initial={{ opacity: 0, x: -12, height: 0 }}
                      animate={{ opacity: 1, x: 0, height: 'auto' }}
                      exit={{ opacity: 0, x: -12, height: 0 }}
                      transition={{ duration: 0.18 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 10,
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 12px',
                      }}>
                        <button
                          type="button" onClick={() => onEdit(i)}
                          style={{
                            flex: 1, minWidth: 0, textAlign: 'left',
                            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                            display: 'flex', flexDirection: 'column', gap: 4,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                            <span style={{ fontSize: 13, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {it.food_item.name}
                            </span>
                            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                              {it.weight_grams}g
                            </span>
                          </div>
                          <MacroLine totals={m} dim />
                        </button>
                        <button
                          type="button" onClick={() => onRemove(i)} aria-label="Remove"
                          style={{ width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)' }}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>
          )}
          <button
            type="button" onClick={onAddIngredient} className="btn-secondary"
            style={{ fontSize: 13, padding: '8px 14px' }}
          >
            + Add ingredient
          </button>
        </div>

        {!recipeState.isRaw && (
          <div style={{ marginBottom: 16 }}>
            <FieldLabel>
              Total cooked weight — g{' '}
              <span style={{ color: 'var(--color-text-dim)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </FieldLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number" inputMode="decimal" min={1}
                value={recipeState.cookedGrams}
                onChange={(e) => setRecipeState({ ...recipeState, cookedGrams: e.target.value })}
                placeholder="—"
                style={{
                  width: 120, padding: '10px 12px', fontSize: 14, fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-primary)',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8, outline: 'none',
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>g</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 4 }}>
              Weigh the finished pot. Leave blank now, add after cooking.
            </div>
          </div>
        )}

        {saveError && (
          <div style={{ fontSize: 12, color: 'var(--color-danger)' }}>{saveError}</div>
        )}
      </div>

      <Footer>
        <div style={{
          padding: '10px 12px', marginBottom: 10,
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
        }}>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: 6 }}>
            Per serving
          </div>
          {perServing ? (
            <MacroLine totals={perServing} animated />
          ) : (
            <div style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>
              Add cooked weight to see macros
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saveDisabled}
          className="btn-primary"
          style={{ width: '100%', opacity: saveDisabled ? 0.5 : 1 }}
        >
          {saving
            ? 'Saving…'
            : (recipeState.isRaw || recipeState.cookedGrams.trim())
              ? 'Save recipe'
              : 'Save as draft'}
        </button>
      </Footer>
    </motion.div>
  )
}

// ─── Photo estimation screen ──────────────────────────────────────────────
function ScreenPhotoEstimate({
  onBack,
  onEstimated,
}: {
  onBack: () => void
  onEstimated: (result: EstimateResult) => void
}) {
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canEstimate = !loading && (imageFile != null || description.trim().length > 0)

  const handleEstimate = async () => {
    if (!canEstimate) return
    setLoading(true)
    setError(null)
    try {
      let imageBase64 = ''
      let imageMimeType = ''
      if (imageFile) {
        imageMimeType = imageFile.type || 'image/jpeg'
        imageBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result as string
            // Strip the data URI prefix (data:<mime>;base64,)
            const comma = result.indexOf(',')
            resolve(comma >= 0 ? result.slice(comma + 1) : result)
          }
          reader.onerror = () => reject(new Error('Failed to read file'))
          reader.readAsDataURL(imageFile)
        })
      }

      const res = await fetch('/api/nutrition/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageBase64 || undefined,
          image_media_type: imageMimeType || undefined,
          description: description.trim() || undefined,
        }),
      })
      const j = await res.json() as EstimateResult & { error?: string }
      if (!res.ok || j.error) {
        setError(j.error ?? 'Estimation failed. Please try again.')
        return
      }
      onEstimated(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Estimation failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.18 }}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <Header title="Estimate from photo" onBack={onBack} backLabel="Cancel" />

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div>
          <FieldLabel>Photo <span style={{ color: 'var(--color-text-dim)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></FieldLabel>
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8, cursor: 'pointer',
              fontSize: 13, color: imageFile ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            }}
          >
            <CameraIcon />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {imageFile ? imageFile.name : 'Take or choose a photo'}
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={e => setImageFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {imageFile && (
            <button
              type="button"
              onClick={() => setImageFile(null)}
              style={{ marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--color-text-dim)', padding: 0 }}
            >
              Remove photo
            </button>
          )}
        </div>

        <div>
          <FieldLabel>Description <span style={{ color: 'var(--color-text-dim)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></FieldLabel>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            placeholder="e.g. grilled salmon fillet approx 150g, roasted vegetables, small amount of rice"
            style={{
              width: '100%', padding: '10px 12px', fontSize: 13,
              color: 'var(--color-text-primary)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8, outline: 'none', resize: 'none',
              fontFamily: 'var(--font-sans)',
            }}
          />
        </div>

        {error && (
          <div style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</div>
        )}

        <div style={{ fontSize: 11, color: 'var(--color-text-dim)', lineHeight: 1.5 }}>
          Claude will estimate macros from your photo and/or description. You can review and save on the next screen.
        </div>
      </div>

      <Footer>
        <button
          type="button"
          onClick={handleEstimate}
          disabled={!canEstimate}
          className="btn-primary"
          style={{ width: '100%', opacity: canEstimate ? 1 : 0.5 }}
        >
          {loading ? 'Estimating…' : 'Estimate macros'}
        </button>
      </Footer>
    </motion.div>
  )
}

function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M2 7a2 2 0 012-2h1.5l1-2h7l1 2H18a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="10" cy="11" r="3" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

// ─── Screen 5: Confirm ────────────────────────────────────────────────────
function ScreenConfirm({
  mealName, setMealName, items, estimate,
  notes, setNotes,
  saving, error, onConfirm, onBack,
}: {
  mealName: string
  setMealName: (s: string) => void
  items: BuildingItem[]
  estimate?: EstimateResult
  notes: string
  setNotes: (s: string) => void
  saving: boolean
  error: string | null
  onConfirm: () => void
  onBack: () => void
}) {
  const isEstimate = estimate != null
  const itemTotals = useMemo(() => totalsFor(items), [items])
  const estimateTotals = estimate
    ? { calories: estimate.calories, protein: estimate.protein_g, carbs: estimate.carbs_g, fat: estimate.fat_g, fiber: estimate.fiber_g }
    : null
  const totals = estimateTotals ?? itemTotals
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
  const canSave = !saving && (isEstimate || items.length > 0)

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.18 }}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <Header title="Confirm and save" onBack={onBack} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <FieldLabel>Meal name</FieldLabel>
          <input
            type="text"
            value={mealName}
            onChange={(e) => setMealName(e.target.value)}
            placeholder="Auto-named from time of day if blank"
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14,
              color: 'var(--color-text-primary)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8, outline: 'none',
            }}
          />
        </div>

        <div style={{
          padding: 14,
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-secondary)' }}>
            <span>Logged at</span><span style={{ fontFamily: 'var(--font-mono)' }}>{time}</span>
          </div>
          {isEstimate ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-secondary)' }}>
              <span>Source</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: 10, fontWeight: 500,
                  background: 'var(--color-amber-light, rgba(255,180,0,0.12))',
                  color: 'var(--color-amber)',
                  padding: '2px 6px', borderRadius: 999,
                }}>
                  Claude estimate
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)' }}>
                  {estimate!.confidence}
                </span>
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-secondary)' }}>
              <span>Ingredients</span><span style={{ fontFamily: 'var(--font-mono)' }}>{items.length}</span>
            </div>
          )}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, marginTop: 4 }}>
            <MacroLine totals={totals} />
          </div>
        </div>

        <div>
          <FieldLabel>Notes <span style={{ color: 'var(--color-text-dim)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></FieldLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything worth remembering…"
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14,
              color: 'var(--color-text-primary)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8, outline: 'none', resize: 'none',
              fontFamily: 'var(--font-sans)',
            }}
          />
        </div>

        {error && (
          <div style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</div>
        )}
      </div>

      <Footer>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canSave}
          className="btn-primary"
          style={{ width: '100%', opacity: canSave ? 1 : 0.6 }}
        >
          {saving ? 'Saving…' : 'Confirm and save'}
        </button>
      </Footer>
    </motion.div>
  )
}

// ─── Shared layout pieces ─────────────────────────────────────────────────
function Header({ title, onBack, backLabel = 'Back' }: { title: string; onBack: () => void; backLabel?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px', borderBottom: '1px solid var(--color-border)',
    }}>
      <button
        type="button" onClick={onBack}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-secondary)', fontSize: 13, padding: 0,
          fontFamily: 'var(--font-sans)',
        }}
      >
        ‹ {backLabel}
      </button>
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{title}</span>
      <span style={{ width: 40 }} aria-hidden />
    </div>
  )
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '16px 16px calc(16px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--color-border)',
      background: 'var(--color-surface)',
    }}>
      {children}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase',
      color: 'var(--color-text-secondary)', marginBottom: 6,
    }}>{children}</div>
  )
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} aria-label="Close"
      style={{
        width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--color-text-dim)', fontSize: 20, lineHeight: 1, padding: 0,
      }}
    >×</button>
  )
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4l1 8a1 1 0 001 1h2a1 1 0 001-1l1-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BarcodeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M3 4v12M5 4v12M7 4v12M9 4v12M11 4v12M13 4v12M15 4v12M17 4v12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

