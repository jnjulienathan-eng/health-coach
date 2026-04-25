# BodyCipher — Nutrition section UX flow

Design decisions captured April 2026. Pre-build phase. No code written yet.
Companion document to NUTRITION_DATA_MODEL.md.

---

## Design principles

- List model for logging. Ingredients are added one at a time into a running list, confirmed all at once. Like a shopping basket — browse and add, check out once.
- Everything is grams. No servings, no units, no ml.
- Five macros displayed everywhere: calories, protein, carbs, fat, fiber. Consistent across logging screens, meal cards, and day summary.
- No fixed meal slots. No breakfast / lunch / dinner / snack convention. Julie logs as many meals as she wants, named however she wants.
- Meal names auto-generated from time of day if left blank. Never blank in the database — "Morning meal", "Afternoon meal", "Evening meal" based on time bands from `logged_at`.
- Templates are a starting point, not a commitment. Every weight is editable after a template is applied.
- No micronutrient section in the UI in phase 1. Data is stored in `nutrients_per_100g` JSONB and available for future use.
- Motion throughout via `framer-motion`. The app should feel alive, not flat.

---

## Motion principles

`framer-motion` is used throughout the nutrition section. Motion reinforces function — every animation reflects something happening, not decoration.

Specific animations:
- Bottom sheet on Screen 1 springs up on open.
- Ingredient rows slide into the meal list on Screen 4 as they are added. Slide out and collapse when removed.
- Live macro numbers on Screen 3 roll smoothly as weight changes — not snapping to new values.
- Meal total bar on Screen 4 pulses briefly each time a new ingredient lands.
- Template ingredients on Screen 4 enter with a staggered entrance — one after another in quick succession, making the template feel assembled rather than dumped.
- Meal cards on the day view animate in on load.

---

## Screen 1 — Meal entry point

Bottom sheet slides up from the nutrition day view when Julie taps "Log a meal."

Two options:

**Add ingredients** — starts a blank meal. Optional free-text name field with placeholder "e.g. post-run, desk lunch." If left blank, the meal is named automatically from the time of day. Nothing else on this screen — no running meal list, there is nothing to show yet.

**Use a template** — opens the template list screen. Julie selects a template and drops directly into Screen 4 with ingredients pre-loaded at default weights.

---

## Screen 2 — Ingredient search

Full screen. Keyboard up immediately, cursor in search field.

**Search behaviour:** As Julie types, the field offers inline autocomplete based on her personal `food_items` library — type "goch" and "gochujang" completes in the field. Autocomplete ranking driven by `use_count`. Below the field, full search results appear simultaneously.

Results come from two sources:
- Personal `food_items` library: instant, local, no API call.
- USDA FoodData Central: debounced 400ms after typing starts, live API call to `api.nal.usda.gov/fdc/v1/foods/search`.

Results show ingredient name and compact macro line — "per 100g: 97 kcal · 9g P · 4g C · 5g F · 2g Fi."

No frequent foods section. No recent foods section. Search only.

Search handles Julie's full ingredient range — gochujang, miso, natto, tahini, edamame — USDA has strong coverage of whole foods, fermented foods, and Asian ingredients. No aggressive autocorrect.

Tapping a result goes to Screen 3.

**USDA caching:** The first time an ingredient is selected from USDA, its nutrient data is fetched and written to `food_items` in Supabase permanently. Every subsequent use reads from `food_items` locally. The USDA API is called at most once per ingredient, ever.

---

## Screen 3 — Weight entry

Single-purpose screen.

- Ingredient name at the top, large and clear.
- One large numeric input field, numeric keyboard, gram label.
- Live macro preview updates with every keystroke: calories, protein, carbs, fat, fiber. Numbers roll smoothly via framer-motion as weight changes.
- If item came from a barcode scan and Open Food Facts includes a serving size, a shortcut chip appears — "1 serving (30g)" — tapping it fills the weight field. Still editable.

Bottom: "Add to meal" button. Tapping adds the ingredient to the running meal list and returns to Screen 2, search field ready for the next ingredient. Nothing is written to the database yet.

---

## Screen 4 — The building meal

Screen 2 plus a visible running meal list below the search field.

**Ingredient rows:** Each ingredient shows name, weight in grams, and its macro contribution — calories, protein, carbs, fat, fiber. Two actions per row:
- Tap the row to edit weight — returns to Screen 3 with the field pre-filled.
- Trash bin icon on the right edge to remove immediately. Swipe-to-delete also available as an alternative gesture.

Rows animate in as ingredients are added (slide in). Animate out on removal (slide and collapse).

**Meal total bar** at the bottom: cumulative calories, protein, carbs, fat, fiber across all ingredients. Updates live. Pulses briefly when a new ingredient is added.

Two buttons above the total bar:
- "Add another ingredient" — returns to Screen 2.
- "Save meal" — proceeds to Screen 5.

---

## Screen 5 — Save confirmation

Lightweight confirmation before writing to the database.

Shows:
- Meal name (or auto-generated time-based name).
- Time logged.
- Ingredient count.
- Total macros: calories, protein, carbs, fat, fiber.
- Optional peak glucose field — one tap to enter a CGM value in mmol/L.
- Optional notes field — free text.
- "Save as template" option — prompts Julie to name the template, then writes to `meal_templates` and `meal_template_items` using current ingredients and weights as defaults. Meal log saves at the same time. Two separate database writes, one action.

"Confirm" writes:
- One `meal_logs` row.
- N `meal_log_items` rows, one per ingredient.
- Increments `use_count` on each `food_items` row used.
- Upserts `daily_nutrition_summary` for today's date — recomputes all macro totals from the full day's `meal_log_items`.

Returns to the day view with the new meal card visible.

---

## Nutrition day view

Main nutrition tab screen.

**Date navigation:** Date at the top with left/right arrows to step between days. Today is the default on open. No calendar picker.

**Macro summary bar:** Always visible, even when scrolling. Shows five numbers vs daily targets from Julie's profile: calories, protein, carbs, fat, fiber. Format: "124 / 160g" per macro. Read from `daily_nutrition_summary`. No calorie warning states — calorie warnings are removed from BodyCipher.

**Meal cards:** One card per logged meal, sorted chronologically by `logged_at`. Each card shows:
- Meal name (or auto-generated time-based name).
- Time logged.
- Five macro totals for the meal: calories, protein, carbs, fat, fiber.
- CGM chip if `peak_glucose_mmol` is present — just the number in mmol/L. Not shown if no value recorded.

Tapping a card expands it to show the full ingredient breakdown — each ingredient, weight, and individual macro contribution. From expanded view Julie can edit the meal: tap an ingredient to adjust weight, tap trash to remove, tap "Add ingredient" to re-enter the logging flow at Screen 2. Any edit triggers a recompute and upsert of `daily_nutrition_summary`.

**Persistent "Log a meal" button** at the bottom, always accessible without scrolling up.

No micronutrient section. Data is stored and available for future surfacing.

---

## Template list screen

Accessed from Screen 1 via "Use a template."

A list of all saved templates, sorted by `use_count` descending — most used floats to the top over time without Julie managing order manually.

Each template card shows:
- Template name.
- Ingredient count.
- Total macros at default weights.

Three actions per template card:
- **Tap to use** — loads template into Screen 4 with ingredients pre-filled at default weights via staggered entrance animation. Increments `meal_templates.use_count`. From Screen 4 the experience is identical to manual logging.
- **Edit icon** — opens template in edit mode.
- **Trash bin** — delete with confirmation: "Delete [name]?" Yes / No.

**"New template" button** at the top — opens a blank edit view for building a template from scratch.

---

## Template edit view

Same ingredient list UI as Screen 4 but in edit mode, not logging mode.

Header clearly labelled "Editing template" — distinct from "Logging meal" so there is no confusion about what is being saved.

Julie can:
- Adjust default weights on any ingredient.
- Remove ingredients (trash bin per row).
- Add new ingredients via the same search flow as Screen 2.
- Rename the template.

Save writes changes back to `meal_templates` and `meal_template_items`. No meal log is created. No `daily_nutrition_summary` update triggered.

---

## Template creation paths

**From a logged meal (primary path):** "Save as template" on Screen 5 after logging. Names the template, writes to `meal_templates` and `meal_template_items` using actual logged weights as defaults. Meal log saves simultaneously. This is how the library grows naturally over time.

**From scratch:** "New template" button in the template list. Builds ingredient list using the same search flow. Writes directly to `meal_templates` and `meal_template_items`. No meal log created.

**By editing an existing template:** Via the template edit view.

---

## Barcode scanning

Accessed from Screen 2 — a scan icon in or alongside the search field.

Flow: scan barcode → product identified via Open Food Facts API (`world.openfoodfacts.org/api/v2/product/{barcode}`) → weight entry on Screen 3, with serving size shortcut chip if Open Food Facts includes one → stored value always in grams → same `meal_log_items` row as all other methods.

`logged_via = 'barcode'` on the `meal_logs` row.
`source = 'open_food_facts'` on the `food_items` row.

Data quality from Open Food Facts varies. UI handles missing nutrient fields gracefully — shows available values, leaves others blank rather than showing zero.

Library: `html5-qrcode` (confirmed for phase 1 — browser-based, no native code required, ~50KB gzipped).

---

## Libraries

- `framer-motion` — motion throughout the nutrition section.
- `html5-qrcode` — barcode scanning.
- No other new dependencies. Search UI, weight entry, and macro display built in plain React and Tailwind.

---

## API and infrastructure notes

**USDA FoodData Central:** Free, no rate limits, public domain data. Called once per new ingredient then cached in `food_items` permanently.

**Open Food Facts:** Free, no key required. Called once per barcode scan then cached in `food_items` permanently.

**Supabase:** All nutrition queries are joins across small tables. Fast at Julie's single-user scale. `daily_nutrition_summary` is upserted on every save so the coach and dashboard always read one pre-computed row — no join queries at load time.

---

## What is not yet designed

- Coach integration — `daily_nutrition_summary` replaces current `daily_entries.nutrition` JSONB read. Coach prompt structure unchanged, only the data source changes. `logged_via_summary` JSONB passed to coach for confidence calibration.
- Handling of historical `daily_entries.nutrition` data for dates before the cutover — clean break decided, legacy fallback read TBD.
- Responsive / mobile layout details.
