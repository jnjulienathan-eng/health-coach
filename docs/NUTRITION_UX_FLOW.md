# BodyCipher — Nutrition section UX flow

Design decisions captured April 2026. Updated April 27, 2026 to reflect recipe builder, My Library, photo estimation, Screen 1 redesign, inline peak glucose, macro override, and template removal.
Companion document to NUTRITION_DATA_MODEL.md.

---

## Design principles

- List model for logging. Ingredients added one at a time into a running list, confirmed all at once.
- Everything is grams. No servings, no units, no ml.
- Five macros everywhere: calories, protein, carbs, fat, fiber. That order. Never four.
- No fixed meal slots. Free-form, named however Julie wants.
- Meal names auto-generated from time band if blank. Never blank in the database.
- Recipes are food items. A batch-cooked dish is logged by weight just like any other ingredient.
- No micronutrient section in phase 1.
- Motion throughout via framer-motion. Every animation reflects something happening.

---

## Motion principles

- Bottom sheet on Screen 1 springs up on open.
- Ingredient rows slide into the meal list as added. Slide out and collapse when removed.
- Live macro numbers on Screen 3 roll smoothly as weight changes — not snapping.
- Meal total bar on Screen 4 pulses briefly each time a new ingredient lands.
- Recipe ingredients in the recipe builder update live per-serving preview as weights or servings change.
- Meal cards on the day view animate in on load.

---

## Screen 1 — Meal entry point

Bottom sheet slides up from the nutrition day view when Julie taps "Log a meal."

Four options:

**Add ingredients** — starts a blank meal. Optional free-text name field. If blank, meal is named from time band. Goes to Screen 2.

**Browse Library** — opens My Library (recipes only). See My Library screen below.

**Create a recipe** — opens the recipe builder in create mode. See recipe builder screens below.

**Estimate from photo or description** — opens the photo estimation screen. See below.

---

## Screen 2 — Ingredient search

Full screen. Keyboard up immediately, cursor in search field.

**Search behaviour:** Inline ghost-text autocomplete from personal food_items library (Tab or end-of-line ArrowRight accepts). Below, full results from two sources simultaneously:
- Personal food_items library: instant, local, no API call
- USDA FoodData Central: debounced 400ms, live API call

Results show ingredient name and compact macro line "per 100g: 97 kcal · 9g P · 4g C · 5g F · 2g Fi." Results tagged with source chip (Library / USDA).

**Local library results** show a pencil icon. Tapping it opens an inline macro-edit modal — Julie can correct any of the five macros. On save, PATCH /api/nutrition/food-item merges the overrides into nutrients_per_100g, preserving the raw USDA array. Corrections persist permanently for that food item.

**USDA results** pass through as-is. No deduplication applied.

**USDA caching:** First selection from USDA writes to food_items permanently. Subsequent uses read locally.

Scan icon in the search field opens Screen Scan (barcode).

A "Create a recipe" button below the search field (secondary, alongside scan icon) opens the recipe builder in meal context.

A "Browse Library" button is available when in meal context (not recipe context). Opening library from here returns to Screen 2 after recipe selection.

Tapping a result goes to Screen 3.

**Context routing:** Screen 2 accepts a `context` prop — 'meal' or 'recipe'. When context = 'recipe', selecting an ingredient returns to the recipe builder instead of the weight/meal flow.

---

## Screen 3 — Weight entry

Single-purpose screen.

- Ingredient name at top, large and clear.
- One large numeric input, numeric keyboard, gram label.
- Live macro preview: all five macros updating smoothly as weight changes (framer-motion).
- Serving shortcut chip if available — either from barcode scan (Open Food Facts serving size) or from recipe's default_serving_grams (e.g. "1 serving (340g)"). Tapping pre-fills weight. Always editable.

"Add to meal" button: adds ingredient to running list, returns to Screen 2. Nothing written to DB yet.

---

## Screen 4 — The building meal

Screen 2 plus a visible running ingredient list below the search field.

**Ingredient rows:** Name, weight in grams, five macro contributions. Tap to edit weight (returns to Screen 3 pre-filled). Trash bin to remove. Slide out and collapse on removal.

**Meal total bar** at bottom: cumulative five macros. Updates live. Pulses on new ingredient add.

**Two buttons above total bar:**
- "+ Add another" — returns to Screen 2
- "Save meal" — proceeds to Screen 5

When opened in template-edit mode (editingTemplate state non-null), header reads "Editing template" / "New template", a name input appears above the list, and save writes to meal_templates rather than opening Screen 5. This path is only reachable from code — the template UI is not surfaced in My Library.

---

## Screen 5 — Save confirmation

Lightweight confirmation before writing to DB.

Shows: meal name (editable, auto-filled from time band if blank), time, source info (ingredient count for item-based; "Claude estimate" badge + confidence level for photo estimates), five macro totals, optional notes.

Confirm writes:
- One meal_logs row (with logged_via, and macro fields if photo_estimate)
- N meal_log_items rows (ingredient-based only)
- Increments use_count on each food_items row used (ingredient-based only)
- Upserts daily_nutrition_summary for the date

Returns to day view with new meal card visible.

---

## Inline peak glucose

Peak glucose is NOT part of any logging screen. It lives on each meal card in the nutrition day view.

Every meal card has a persistent "Peak glucose" row below the macro line. Tapping anywhere on the row opens an inline edit: numeric input pre-filled with the current value (or blank if not set), mmol/L label, ✓ and ✕ buttons. On confirm, PATCH /api/nutrition/meal saves the value. On cancel, original value is restored. Does not trigger a daily_nutrition_summary recompute.

The meal card header also shows a CGM chip when peak_glucose_mmol is set.

---

## Photo estimation screen

Accessed from Screen 1 "Estimate from photo or description."

Two input methods, either or both usable:
- **Photo:** standard `<input type="file" accept="image/*" capture="environment">` — uses device camera or file picker. Do not use html5-qrcode here.
- **Description:** free-text textarea, e.g. "grilled salmon fillet approx 150g, roasted vegetables, small amount of rice."

"Estimate macros" button (disabled until at least one input present) sends to POST /api/nutrition/estimate. Shows a loading state while the Anthropic API call runs.

On response: navigates directly to Screen 5 in estimate-based mode with macros pre-filled. If the API returns an error, shows a clear message and allows retry.

API route returns: meal_name, calories, protein_g, carbs_g, fat_g, fiber_g, confidence ('high'|'medium'|'low'). If neither photo nor description provided, API returns a clear error.

---

## My Library screen

Single home for all saved recipes. Replaces the standalone templates screen.

**Access points:**
- Screen 1 "Browse Library" button
- Library icon button on the nutrition day view (alongside "+ Log a meal")

**Single section: Recipes**

- "New recipe" button at top — opens recipe builder in create mode
- One card per recipe, sorted by updated_at desc
- Draft recipes: amber "Incomplete — add cooked weight or mark as raw" chip. Not tappable for logging. Edit opens recipe builder pre-loaded. Delete with confirmation.
- Active recipes: name, recipe icon, per-serving macros if default_serving_grams set (else per-100g macros with "per 100g" label). Tap to use (goes to building screen with food_item added at default_serving_grams or 100g if not set). Edit opens recipe builder. Delete with confirmation.

Templates section removed by design. meal_templates and meal_template_items tables and API routes preserved in the database but not visible in My Library.

---

## Recipe builder screens

Accessed from: Screen 1 "Create a recipe", My Library recipe card Edit action, or "Create a recipe" button on Screen 2.

**Create mode:** blank form.
**Edit mode:** pre-loaded with existing recipe data.

Fields in order:
1. **Recipe name** (text input, required)
2. **Total servings** (numeric, integer, min 1, required)
3. **Typical portion size — g** (numeric, optional, nullable — used for serving shortcut chip when logging)
4. **Raw / assembled toggle** (is_raw boolean). When off (default): cooked recipe mode. When on: raw/assembled mode — no cooking step, cooked weight field hidden, portion size auto-calculated.
5. **Ingredient list** — same UI as Screen 4 building list. Each ingredient: name, raw batch weight in grams, macro contribution to batch total. Trash to remove. "Add ingredient" opens Screen 2 with context = 'recipe' (returns selected item + weight here, not to meal flow).
6. **Total cooked weight — g** (numeric, optional — only shown when is_raw = false). Label: "Total cooked weight (g) — weigh the finished pot." Note below: "Leave blank now, add after cooking."

**Raw mode auto-portion:** When is_raw = true, portion size is auto-calculated as total ingredient weight / servings and pre-filled in the Typical portion size field. Julie can override. Auto-computation stops once she manually edits the field; resets if she changes the ingredient list or servings.

**Live per-serving macro preview** at bottom:
- Cooked mode with total_cooked_grams set: shows all five macros per serving, updating with framer-motion.
- Cooked mode without cooked weight: shows "Add cooked weight to see macros" instead of numbers.
- Raw mode with ingredients: shows all five macros per serving (divisor = sum of ingredient weights).
- Raw mode with no ingredients: shows "Add ingredients to see macros".

**Save behaviour:**
- Cooked mode, total_cooked_grams present → POST (create) or PUT (update). Recipe activates. food_items entry created/updated. Returns to My Library.
- Cooked mode, total_cooked_grams absent → saves as draft. Returns to My Library with amber chip.
- Raw mode, at least one ingredient → POST (create) or PUT (update). Recipe activates immediately. Returns to My Library.
- Raw mode, no ingredients → saves as draft.

**Draft workflow (cooked):** Julie can build the ingredient list while the pot is on the stove, save as draft, close. When the pot is done, she opens My Library, taps Edit on the draft, enters the cooked weight, saves. Recipe activates.

---

## Nutrition day view

Main nutrition tab screen.

**Date navigation:** left/right arrows at top. Today default. No calendar picker.

**Macro summary bar:** Always visible when scrolling. Five macros vs daily targets: "124 / 160g" format. Read from daily_nutrition_summary. No calorie warnings.

**Collapsed section header:** Shows protein · fiber · calories when data is present.

**Meal cards:** One per logged meal, sorted by logged_at. Shows: name, time, five macro totals, CGM chip if peak_glucose_mmol set. For photo-estimated meals, a "Claude estimate" badge.

Each meal card has a persistent "Peak glucose" row (see Inline peak glucose section above).

Tapping the header area expands the card: ingredient breakdown for ingredient-based meals, or macro totals with confidence label for photo-estimated meals. Edit and delete available from expanded view. Photo-estimated meals cannot be edited (no Edit button shown).

**Two persistent buttons at bottom:**
- "+ Log a meal" — opens Screen 1
- Library icon — opens My Library

---

## Barcode scanning

Scan icon in Screen 2 search field. Uses html5-qrcode (not for photo capture — that uses file input on photo estimation screen).

Flow: scan → Open Food Facts lookup → weight entry Screen 3 with serving chip if available → meal_log_items row as normal.

logged_via = 'barcode' on meal_logs. source = 'openfoodfacts' on food_items.

---

## Libraries

- framer-motion — motion throughout
- html5-qrcode — barcode scanning only (not photo capture)
- @anthropic-ai/sdk — used server-side in /api/nutrition/estimate only
- No other new dependencies

---

## API and infrastructure notes

**USDA FoodData Central:** Free, no rate limits. Called once per new ingredient then cached permanently. No deduplication — results returned as-is.

**Open Food Facts:** Free, no key. Called once per barcode then cached permanently.

**Anthropic API:** Used for photo/description macro estimation. Server-side only via /api/nutrition/estimate. Returns JSON macro estimate with confidence level.

**Supabase:** All nutrition queries are joins across small tables. daily_nutrition_summary pre-computes day totals for fast coach/dashboard reads.

---

## What is not yet designed

- Coach integration detail — daily_nutrition_summary replaces current daily_entries.nutrition read. Tracked as backlog item #1. Do not touch until Goals/Training Load branch is merged.
- Responsive / mobile layout details.
