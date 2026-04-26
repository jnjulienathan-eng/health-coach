# BodyCipher — Nutrition section data model

Design decisions captured April 2026. Updated April 26, 2026 to reflect recipe builder and photo estimation additions.
Companion document to NUTRITION_UX_FLOW.md.

---

## Design principles

- Ingredient-by-weight only. Everything is grams. No servings, no units, no ml.
- Macro totals are never stored at the ingredient level. Always computed from `nutrients_per_100g × weight_grams / 100`. No drift between stored totals and underlying ingredients.
- A denormalized daily summary is maintained for coach and dashboard reads. Recomputed and upserted after every meal save, edit, or delete. The coach never runs join queries at load time.
- No fixed meal slots. The four-slot convention is dropped. Julie logs as many meals as she wants, named however she wants, in the order they happen.
- No date entry. The app captures the timestamp automatically. Day boundary is 05:00 Europe/Berlin.
- Templates have no assigned meal type. A template is a named collection of ingredients with default weights.
- A recipe is a food item. Once built and activated, it appears in ingredient search like any other item and is logged by weight.

---

## Backward compatibility

A clean break at the point the new nutrition system went live. Existing `daily_entries.nutrition` JSONB data is not migrated. Historical data stays in `daily_entries` and is treated as legacy. New data goes entirely into the new tables.

The coach and dashboard reference `daily_nutrition_summary` for current data. Legacy `daily_entries.nutrition` data is ignored by all new code.

---

## Tables

### `meal_logs`

One row per meal occasion.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | text | Owner. Set to NUTRITION_USER_ID env var. |
| `logged_at` | timestamptz | Auto-set on save. Determines day and order. |
| `name` | text | Auto-generated from time band if blank. Never stored blank. |
| `logged_via` | text | See values below. |
| `peak_glucose_mmol` | numeric | Optional CGM reading for this meal. Nullable. |
| `notes` | text | Optional free text. Nullable. |
| `calories` | numeric | Nullable. Only populated when logged_via = 'photo_estimate'. |
| `protein_g` | numeric | Nullable. Only populated when logged_via = 'photo_estimate'. |
| `carbs_g` | numeric | Nullable. Only populated when logged_via = 'photo_estimate'. |
| `fat_g` | numeric | Nullable. Only populated when logged_via = 'photo_estimate'. |
| `fiber_g` | numeric | Nullable. Only populated when logged_via = 'photo_estimate'. |

`logged_via` values:
- `ingredients` — searched by name, selected from USDA or personal library, entered weight. Highest confidence.
- `barcode` — scanned a packaged product. Nutrient data from Open Food Facts.
- `photo_estimate` — Claude Vision estimated macros from a photo or description. Macros stored as top-level fields on this row, not via meal_log_items. Lower confidence.
- `manual_macros` — typed macro numbers directly.

**Photo estimate approach:** When logged_via = 'photo_estimate', there are no meal_log_items rows. The five macro fields on meal_logs itself (calories, protein_g, carbs_g, fat_g, fiber_g) hold the values. The daily_nutrition_summary recompute adds these directly to the running totals alongside item-based macros. This is the correct approach — do not create synthetic food_items entries for photo estimates.

`peak_glucose_mmol` is a single manually-entered value. If CGM integration becomes automatic, this migrates to a separate `cgm_readings` table with `meal_log_id` FK. That is a future decision.

---

### `food_items`

Julie's personal food library. Every ingredient or product ever used gets cached here. Nutrient data fetched once from the external source and stored permanently.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | text | Owner |
| `fdc_id` | text | USDA FoodData Central ID. Nullable — blank for OFF and custom items. |
| `name` | text | Display name |
| `nutrients_per_100g` | jsonb | Five macros + raw USDA array |
| `source` | text | 'usda' \| 'openfoodfacts' \| 'recipe' \| 'recipe_deleted' \| 'custom' |
| `use_count` | int | Incremented each time this item is logged. Drives autocomplete ranking. |
| `created_at` | timestamptz | Auto-set |

`food_items` is the hub. Both `meal_log_items` and `meal_template_items` and `recipe_ingredients` reference it. When a recipe is activated, a food_items row is created with source = 'recipe'. When a recipe is deleted, that row's source is set to 'recipe_deleted' so it no longer surfaces in search — the row is never hard-deleted in case it is referenced in historical meal_logs.

---

### `meal_log_items`

Bridge between a meal and its ingredients. One row per ingredient per meal. Not created for photo-estimated meals.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `meal_log_id` | uuid | FK → meal_logs.id |
| `food_item_id` | uuid | FK → food_items.id |
| `weight_grams` | numeric | The only number Julie enters. Macros computed from this, never stored. |

---

### `daily_nutrition_summary`

Denormalized daily macro totals. Upserted after every meal save, edit, or delete.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | text | Owner |
| `date` | date | Derived from logged_at using 05:00 Berlin boundary |
| `calories` | numeric | Total for the day |
| `protein` | numeric | Total grams |
| `carbs` | numeric | Total grams |
| `fat` | numeric | Total grams |
| `fiber` | numeric | Total grams |
| `meal_count` | int | Distinct meal_logs for the day |
| `logged_via_summary` | jsonb | e.g. `{ingredients: 2, photo_estimate: 1}` — used by coach to calibrate confidence |
| `updated_at` | timestamptz | Auto-updated on upsert |

**Upsert logic:**
1. Compute date from logged_at using 05:00 Berlin boundary
2. Sum nutrients_per_100g × weight_grams / 100 from all meal_log_items for that user/date, joined to food_items
3. Add top-level macro fields (calories, protein_g, carbs_g, fat_g, fiber_g) from meal_logs where logged_via = 'photo_estimate' for that user/date
4. Count distinct meal_log_ids for meal_count
5. Build logged_via_summary JSONB
6. Upsert into daily_nutrition_summary. Delete row if no meals remain for that date.

---

### `meal_templates`

Named meal presets. No meal type assigned.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | text | Owner |
| `name` | text | |
| `notes` | text | Optional. Nullable. |
| `use_count` | int | Incremented on use. Drives sort order. |
| `created_at` | timestamptz | Auto-set |

---

### `meal_template_items`

Ingredients and default weights inside a template.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `template_id` | uuid | FK → meal_templates.id |
| `food_item_id` | uuid | FK → food_items.id |
| `default_weight_grams` | numeric | Pre-filled weight when template applied. Always editable before confirming. |

Template edits do not affect historical logs. meal_logs has no FK back to meal_templates.

---

### `recipes`

Batch-cooked recipe definitions. A recipe becomes a food item once activated.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | text | Owner |
| `name` | text | e.g. "Lentil pilaf — Julie's recipe" |
| `total_servings` | integer | Whole batch makes this many portions. Min 1. |
| `total_cooked_grams` | numeric | Weight of the finished cooked pot in grams. Nullable — null = draft. |
| `default_serving_grams` | numeric | Optional typical portion weight. When set, shows shortcut chip on Screen 3. Nullable. |
| `food_item_id` | uuid | FK → food_items. Null when draft. Set when activated. |
| `status` | text | 'draft' \| 'active' |
| `created_at` | timestamptz | Auto-set |
| `updated_at` | timestamptz | Updated on every change |

**Draft state:** When total_cooked_grams is null, status = 'draft'. The recipe builder can be saved as a draft while the pot is still cooking. Draft recipes appear in My Library with an amber chip but do not appear in ingredient search.

**Activation:** When total_cooked_grams is set (either at creation or via edit), macros are computed and a food_items entry is created or updated. Status becomes 'active'. The recipe now appears in ingredient search.

**Editing:** Changing ingredients, weights, servings, or cooked weight recomputes and updates the linked food_items entry. Historical meal_logs are unaffected — macros were captured at logging time.

---

### `recipe_ingredients`

Raw ingredient weights for the whole batch. One row per ingredient per recipe.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `recipe_id` | uuid | FK → recipes.id. CASCADE delete. |
| `food_item_id` | uuid | FK → food_items.id. RESTRICT delete. |
| `weight_grams` | numeric | Raw weight for the **whole batch**. Not per serving. Min > 0. |

**Important:** weight_grams here is the raw pre-cooking weight for the full batch. This is different from meal_log_items where weight_grams is the cooked portion the user ate. The recipe macro formula accounts for this via total_cooked_grams.

**Macro computation from a recipe:**
1. For each ingredient: `food_items.nutrients_per_100g[macro] × weight_grams / 100` → ingredient contribution
2. Sum all contributions → total batch macros
3. `per_100g_macro = total_batch_macro / total_cooked_grams × 100`
4. Apply to all five macros (calories, protein, carbs, fat, fiber)
5. Store result in the linked food_items.nutrients_per_100g

---

## Relationships

```
meal_logs              ||--o{  meal_log_items          : contains
food_items             ||--o{  meal_log_items          : used_in
meal_templates         ||--o{  meal_template_items     : contains
food_items             ||--o{  meal_template_items     : used_in
recipes                ||--o{  recipe_ingredients      : contains
food_items             ||--o{  recipe_ingredients      : used_in
recipes                ||--o|  food_items              : produces
```

---

## External data sources

**USDA FoodData Central**
- REST API: `api.nal.usda.gov/fdc/v1/foods/search`
- Free, no rate limits, public domain data. Nutrient IDs are stable.
- Called at most once per ingredient — cached in food_items permanently.
- **Deduplication rule:** When search returns multiple results with identical names, collapse to the entry with the most complete nutrient data (all 5 macros present and non-zero). If tied, prefer the higher fdc_id (more recent). Never surface duplicate names to the user.

**Open Food Facts**
- REST API: `world.openfoodfacts.org/api/v2/product/{barcode}`
- Free, no key required. Used for barcode scanning only.
- Same caching rule — once per barcode.

**Anthropic API**
- Used by `/api/nutrition/estimate` for photo and description-based macro estimation.
- Model: claude-sonnet-4-20250514.
- ANTHROPIC_API_KEY server-side only, never in client bundle.
- Returns JSON: meal_name, calories, protein_g, carbs_g, fat_g, fiber_g, confidence ('high'|'medium'|'low').
- Result stored as top-level macro fields on meal_logs, logged_via = 'photo_estimate'. No meal_log_items created.

---

## Barcode scan flow

Scan → product identified via Open Food Facts → weight entry screen (serving size shortcut chip if available) → stored value always in grams → meal_log_items row as normal.

logged_via = 'barcode' on meal_logs. source = 'openfoodfacts' on food_items.

---

## Photo estimation flow

Photo and/or description → sent to /api/nutrition/estimate → Anthropic Vision returns macro estimate → macros stored as top-level fields on meal_logs (calories, protein_g, carbs_g, fat_g, fiber_g) → logged_via = 'photo_estimate' → no meal_log_items rows → daily_nutrition_summary upserted using top-level fields for this meal.

---

## Infrastructure notes

Supabase free tier: 500MB storage, 2GB bandwidth per month. Not a current concern at single-user scale.

---

## What is deferred

- Manual nutrient editing on food_items — would require an overridden flag and editable nutrients_per_100g
- Automatic CGM integration — peak_glucose_mmol stays as single manual field until CGM streams automatically
- Micronutrient tracking UI — data stored in nutrients_per_100g JSONB but not surfaced in phase 1
- Supplement dosage data model — needed before micronutrient totalling is meaningful
- Regression analysis against HRV / sleep / glucose — needs 3+ months clean data
