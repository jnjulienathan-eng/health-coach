'use client'

// Five-screen logging flow:
//   menu     → choose "add ingredients" or "use a template"
//   search   → ingredient autocomplete + USDA search
//   weight   → weight entry with live macro preview
//   building → running ingredient list + meal totals
//   confirm  → optional peak glucose + notes + save-as-template
//
// Mounted as the modal body inside NutritionSection. Screen 1 is a short
// bottom sheet; subsequent screens fill the sheet to near full height.

import { animate, AnimatePresence, motion, useAnimationControls } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'

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
  source: 'usda' | 'open_food_facts' | 'custom'
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

type Screen = 'menu' | 'search' | 'weight' | 'building' | 'confirm'

interface Props {
  onClose: () => void
  onSaved: () => void
  onOpenTemplates?: () => void
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
export default function MealLogger({ onClose, onSaved, onOpenTemplates }: Props) {
  const [screen, setScreen] = useState<Screen>('menu')
  const [mealName, setMealName] = useState('')
  const [items, setItems] = useState<BuildingItem[]>([])
  const [pending, setPending] = useState<PendingItem | null>(null)

  // Confirm-screen fields
  const [peakGlucose, setPeakGlucose] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  // Save state
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Lock body scroll while logger is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const fullSheet = screen !== 'menu'

  const goToSearch = () => setScreen('search')

  const onItemPicked = (food_item: FoodItem, defaults?: { serving_grams?: number | null; serving_label?: string | null; weight_grams?: number; editIndex?: number | null }) => {
    console.log('[MealLogger] 3 onItemPicked → setPending+setScreen("weight")', { food_item_id: food_item.id, name: food_item.name })
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
    setScreen('building')
  }

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const handleConfirm = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const body = {
        name: mealName,
        logged_at: new Date().toISOString(),
        logged_via: 'ingredients',
        peak_glucose_mmol: peakGlucose === '' ? null : Number(peakGlucose),
        notes: notes.trim() || null,
        items: items.map(it => ({ food_item_id: it.food_item.id, weight_grams: it.weight_grams })),
        save_as_template: saveAsTemplate,
        template_name: saveAsTemplate ? (templateName.trim() || mealName.trim() || null) : null,
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

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,40,30,0.4)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <motion.div
        initial={{ y: 240 }}
        animate={{ y: 0, height: fullSheet ? '92vh' : 'auto' }}
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
                    onUseTemplate={onOpenTemplates}
                    onClose={onClose}
                  />
                )
              case 'search':
                return (
                  <ScreenSearch
                    key="search"
                    hasItems={items.length > 0}
                    onPick={(food_item) => { console.log('[MealLogger] 2 ScreenSearch.onPick prop fired', { id: food_item.id }); onItemPicked(food_item) }}
                    onBack={() => setScreen(items.length > 0 ? 'building' : 'menu')}
                  />
                )
              case 'weight':
                return pending ? (
                  <ScreenWeight
                    key="weight"
                    pending={pending}
                    setPending={setPending}
                    onCommit={commitPending}
                    onBack={() => { setPending(null); setScreen(items.length > 0 ? 'building' : 'search') }}
                  />
                ) : null
              case 'building':
                return (
                  <ScreenBuilding
                    key="building"
                    mealName={mealName}
                    items={items}
                    onEdit={(idx) => onItemPicked(items[idx].food_item, {
                      weight_grams: items[idx].weight_grams,
                      editIndex: idx,
                    })}
                    onRemove={removeItem}
                    onAddAnother={goToSearch}
                    onSave={() => setScreen('confirm')}
                    onBack={() => setScreen('menu')}
                  />
                )
              case 'confirm':
                return (
                  <ScreenConfirm
                    key="confirm"
                    mealName={mealName}
                    setMealName={setMealName}
                    items={items}
                    peakGlucose={peakGlucose}
                    setPeakGlucose={setPeakGlucose}
                    notes={notes}
                    setNotes={setNotes}
                    saveAsTemplate={saveAsTemplate}
                    setSaveAsTemplate={setSaveAsTemplate}
                    templateName={templateName}
                    setTemplateName={setTemplateName}
                    saving={saving}
                    error={saveError}
                    onConfirm={handleConfirm}
                    onBack={() => setScreen('building')}
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
  mealName, setMealName, onAddIngredients, onUseTemplate, onClose,
}: {
  mealName: string
  setMealName: (s: string) => void
  onAddIngredients: () => void
  onUseTemplate?: () => void
  onClose: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ padding: 20, paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>Log a meal</span>
        <CloseButton onClick={onClose} />
      </div>

      <input
        type="text"
        value={mealName}
        onChange={(e) => setMealName(e.target.value)}
        placeholder="e.g. post-run, desk lunch (optional)"
        style={{
          padding: '10px 12px', fontSize: 14,
          color: 'var(--color-text-primary)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 8, outline: 'none',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
        <button
          type="button" onClick={onAddIngredients} className="btn-primary"
          style={{ padding: '14px 16px', textAlign: 'left' }}
        >
          Add ingredients
          <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginTop: 4 }}>
            Search by name or scan a barcode
          </div>
        </button>
        <button
          type="button"
          onClick={onUseTemplate}
          disabled={!onUseTemplate}
          className="btn-secondary"
          style={{ padding: '14px 16px', textAlign: 'left', opacity: onUseTemplate ? 1 : 0.5 }}
        >
          Use a template
          <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginTop: 4 }}>
            {onUseTemplate ? 'Pick from your saved meals' : 'Coming soon'}
          </div>
        </button>
      </div>
    </motion.div>
  )
}

// ─── Screen 2: Search ─────────────────────────────────────────────────────
function ScreenSearch({
  hasItems, onPick, onBack,
}: {
  hasItems: boolean
  onPick: (food_item: FoodItem) => void
  onBack: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
    console.log('[MealLogger] 1 pickResult called', { source: r.source, name: r.name, food_item_id: r.food_item_id, fdc_id: r.fdc_id })
    if (r.food_item_id) {
      console.log('[MealLogger] 1a local path — calling onPick synchronously')
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
    console.log('[MealLogger] 1b USDA path — POSTing /api/nutrition/food-item')
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
      console.log('[MealLogger] 1c food-item response', { status: res.status, ok: res.ok })
      const j = await res.json() as { food_item?: FoodItem; error?: string }
      console.log('[MealLogger] 1d food-item body', j)
      if (!res.ok || !j.food_item) {
        setError(j.error ?? 'Could not save ingredient')
        return
      }
      onPick(j.food_item)
    } catch (e) {
      console.log('[MealLogger] 1e fetch threw', e)
      setError(e instanceof Error ? e.message : 'Could not save ingredient')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.18 }}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <Header
        title="Add ingredient"
        onBack={onBack}
        backLabel={hasItems ? 'Back to meal' : 'Cancel'}
      />

      <div style={{ padding: '8px 16px 12px' }}>
        <div style={{ position: 'relative' }}>
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
        {ghost && (
          <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 4 }}>
            Tab to autocomplete
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
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
          {results.map((r, i) => (
            <button
              key={`${r.source}-${r.fdc_id ?? r.food_item_id ?? i}`}
              type="button"
              onClick={() => pickResult(r)}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
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
          ))}
        </div>
      </div>
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

// ─── Screen 3: Weight entry ───────────────────────────────────────────────
function ScreenWeight({
  pending, setPending, onCommit, onBack,
}: {
  pending: PendingItem
  setPending: (p: PendingItem) => void
  onCommit: () => void
  onBack: () => void
}) {
  console.log('[MealLogger] 4 ScreenWeight render', { name: pending.food_item.name, weight: pending.weight_grams })
  useEffect(() => { console.log('[MealLogger] 5 ScreenWeight MOUNTED') }, [])
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
          {pending.editIndex != null ? 'Save changes' : 'Add to meal'}
        </button>
      </Footer>
    </motion.div>
  )
}

// ─── Screen 4: Building meal ──────────────────────────────────────────────
function ScreenBuilding({
  mealName, items, onEdit, onRemove, onAddAnother, onSave, onBack,
}: {
  mealName: string
  items: BuildingItem[]
  onEdit: (idx: number) => void
  onRemove: (idx: number) => void
  onAddAnother: () => void
  onSave: () => void
  onBack: () => void
}) {
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
        title={mealName.trim() ? `Building: ${mealName.trim()}` : 'Building meal'}
        onBack={onBack}
        backLabel="Cancel"
      />

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
            Meal total
          </span>
          <MacroLine totals={totals} animated />
        </motion.div>

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
            onClick={onSave}
            disabled={items.length === 0}
            className="btn-primary"
            style={{ flex: 1, opacity: items.length === 0 ? 0.5 : 1 }}
          >
            Save meal
          </button>
        </div>
      </Footer>
    </motion.div>
  )
}

// ─── Screen 5: Confirm ────────────────────────────────────────────────────
function ScreenConfirm({
  mealName, setMealName, items, peakGlucose, setPeakGlucose, notes, setNotes,
  saveAsTemplate, setSaveAsTemplate, templateName, setTemplateName,
  saving, error, onConfirm, onBack,
}: {
  mealName: string
  setMealName: (s: string) => void
  items: BuildingItem[]
  peakGlucose: string
  setPeakGlucose: (s: string) => void
  notes: string
  setNotes: (s: string) => void
  saveAsTemplate: boolean
  setSaveAsTemplate: (v: boolean) => void
  templateName: string
  setTemplateName: (s: string) => void
  saving: boolean
  error: string | null
  onConfirm: () => void
  onBack: () => void
}) {
  const totals = useMemo(() => totalsFor(items), [items])
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })

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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-secondary)' }}>
            <span>Ingredients</span><span style={{ fontFamily: 'var(--font-mono)' }}>{items.length}</span>
          </div>
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, marginTop: 4 }}>
            <MacroLine totals={totals} />
          </div>
        </div>

        <div>
          <FieldLabel>Peak glucose <span style={{ color: 'var(--color-text-dim)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></FieldLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              inputMode="decimal"
              step={0.1}
              min={3}
              max={15}
              value={peakGlucose}
              onChange={(e) => setPeakGlucose(e.target.value)}
              placeholder="—"
              style={{
                width: 96, padding: '10px 12px', fontSize: 14, fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-primary)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8, outline: 'none',
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>mmol/L</span>
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

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={saveAsTemplate}
              onChange={(e) => setSaveAsTemplate(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }}
            />
            <span style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>Save as template</span>
          </label>
          {saveAsTemplate && (
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={mealName.trim() || 'Template name'}
              style={{
                width: '100%', marginTop: 8,
                padding: '10px 12px', fontSize: 14,
                color: 'var(--color-text-primary)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8, outline: 'none',
              }}
            />
          )}
        </div>

        {error && (
          <div style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</div>
        )}
      </div>

      <Footer>
        <button
          type="button"
          onClick={onConfirm}
          disabled={saving || items.length === 0}
          className="btn-primary"
          style={{ width: '100%', opacity: saving || items.length === 0 ? 0.6 : 1 }}
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
      padding: 16, borderTop: '1px solid var(--color-border)',
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

