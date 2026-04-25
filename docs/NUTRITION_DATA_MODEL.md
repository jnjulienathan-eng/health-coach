# BodyCipher — Nutrition section data model

Design decisions captured April 2026. Pre-build phase. No code written yet.

---

## Design principles

- Ingredient-by-weight only. Everything is grams. No servings, no units, no ml. Water-based liquids are close enough to 1ml = 1g that the difference is nutritionally irrelevant.
- Macro totals are never stored at the ingredient level. They are always computed from `nutrients_per_100g × weight_grams / 100`. This keeps data clean and consistent — no drift between stored totals and underlying ingredients.
- A denormalized daily summary is maintained for coach and dashboard reads. Recomputed and upserted after every meal save, edit, or delete. The coach never runs join queries at load time.
- No fixed meal slots. The four-slot convention (breakfast / lunch / dinner / snack) is dropped. Julie logs as many meals as she wants, named however she wants, in the order they happen. Chronological order within a day is determined by `logged_at` timestamp.
- No date entry. The app captures the timestamp automatically. What counts as "today" is defined by a day-start boundary set in profile settings (e.g. 05:00) — anything logged between 05:00 Monday and 04:59 Tuesday belongs to Monday.
- Templates have no assigned meal type. A template is a named collection of ingredients with default weights. When and how it is used is up to Julie at logging time.

---

## Backward compatibility

A clean break is used at the point the new nutrition system goes live. Existing `daily_entries.nutrition` JSONB data is not migrated. Historical data from before the cutover stays in `daily_entries` and is treated as legacy. New data goes entirely into the new tables.

Reasons for clean break over migration:
- Historical entries have no ingredient breakdown — only macro totals of varying reliability.
- Some entries have Claude-estimated macros, some have self-entered macros, some have macros derived from separately developed recipes. Migrating this into an ingredient-level model would produce data that looks precise but isn't.
- Only a few weeks of history exist. The loss is minimal.

The coach and dashboard reference `daily_nutrition_summary` (new table) for current data. Legacy `daily_entries.nutrition` data for dates before the cutover can be read as a fallback if needed — but given the short history this may not be worth implementing.

---

## Tables

### `meal_logs`

One row per meal occasion. The user never enters a date — `logged_at` is set automatically to the current timestamp on save.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Auto-assigned. Primary key. |
| `user_id` | uuid | Owner of this row. |
| `logged_at` | timestamp | Auto-set on save. Determines order within a day and enables CGM correlation. |
| `name` | text | Auto-generated from time of day if left blank — "Morning meal", "Afternoon meal", "Evening meal". Never blank in the database. |
| `logged_via` | enum | How the meal was entered. See values below. |
| `peak_glucose_mmol` | numeric | Optional. Single CGM reading attached to this meal. Nullable. |
| `notes` | text | Optional. Free text. Nullable. |

`logged_via` values:
- `ingredients` — searched by name, selected from USDA or personal library, entered weight. Highest confidence.
- `barcode` — scanned a packaged product. Nutrient data from Open Food Facts. Variable quality.
- `photo_estimate` — Claude Vision estimated macros from a photo. Fallback option, lower confidence.
- `manual_macros` — typed macro numbers directly. Backward-compatible with current behaviour.

The coach uses `logged_via` distribution from `daily_nutrition_summary` to calibrate confidence in the day's nutrition numbers.

`peak_glucose_mmol` lives here for now as a single manually-entered value. If CGM integration becomes automatic and pulls a stream of readings, this migrates to a separate `cgm_readings` table with `meal_log_id` FK. That is a future decision — the field costs nothing here in the meantime.

---

### `food_items`

Julie's personal food library. Every ingredient or product ever used gets cached here. Nutrient data is fetched once from the external API and stored permanently — never re-fetched for a known item.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Auto-assigned. Primary key. |
| `user_id` | uuid | Owner of this row. |
| `fdc_id` | text | USDA FoodData Central ID. Nullable — blank for Open Food Facts and custom items. |
| `name` | text | Display name. "Full-fat Greek yogurt", "Gochujang", "Edamame". |
| `nutrients_per_100g` | jsonb | Calories, protein, carbs, fat, fiber — and anything else USDA returns. Stored as flexible key-value. |
| `source` | enum | `usda` / `open_food_facts` / `custom` |
| `use_count` | int | Incremented each time this item is logged. Drives autocomplete ranking. |
| `created_at` | timestamp | Auto-set. |

Nutrient data is not manually editable in phase 1. If the need arises this can be revisited — an `overridden` flag and editable `nutrients_per_100g` would be the path.

`food_items` is the hub of the model. Both `meal_log_items` and `meal_template_items` reference it. The same ingredient entry powers both actual logs and templates — nutrient data lives in one place only.

---

### `meal_log_items`

The bridge between a meal and its ingredients. One row per ingredient per meal.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Auto-assigned. Primary key. |
| `meal_log_id` | uuid | FK → `meal_logs.id` |
| `food_item_id` | uuid | FK → `food_items.id` |
| `weight_grams` | numeric | The only number Julie enters. Macros are computed from this, never stored. |

Intentionally minimal. Macro totals are derived at query time by multiplying `food_items.nutrients_per_100g` by `weight_grams / 100`.

Photo estimate compatibility: when a meal is logged via photo, a synthetic `food_items` entry is created (named e.g. "Photo estimate — dinner") with Claude's estimated macros expressed as if per-100g at a weight of 100g. One `meal_log_items` row points to it. The macro computation pipeline stays uniform across all `logged_via` types.

---

### `daily_nutrition_summary`

Denormalized daily macro totals. Maintained for fast coach and dashboard reads. Upserted after every meal save, edit, or delete — always reflects the current state of the day's logging. The coach never needs to run join queries at load time.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Auto-assigned. Primary key. |
| `user_id` | uuid | Owner. |
| `date` | date | Calendar date derived from `logged_at` and the user's day-start boundary setting. |
| `calories` | numeric | Total for the day. |
| `protein` | numeric | Total for the day in grams. |
| `carbs` | numeric | Total for the day in grams. |
| `fat` | numeric | Total for the day in grams. |
| `fiber` | numeric | Total for the day in grams. |
| `meal_count` | int | Number of meals logged that day. |
| `logged_via_summary` | jsonb | Breakdown of logging methods — e.g. `{ingredients: 2, photo_estimate: 1}`. Used by the coach to calibrate confidence in the day's nutrition numbers. |
| `updated_at` | timestamp | Auto-updated on every upsert. |

One row per user per date. Upserted on every meal save, edit, or delete. Computed by summing `meal_log_items` joined to `food_items` for all meals on that date.

---

### `meal_templates`

Named meal presets. No meal type assigned — templates surface wherever Julie chooses to apply them.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Auto-assigned. Primary key. |
| `user_id` | uuid | Owner. |
| `name` | text | "Post-run breakfast", "Quick work lunch", etc. |
| `notes` | text | Optional context. Nullable. |
| `use_count` | int | Incremented each time this template is selected for logging. Drives sort order in the template list. |
| `created_at` | timestamp | Auto-set. |

Templates are creatable three ways:
1. "Save this meal as template" after logging — the primary path, grows the library organically.
2. Building from scratch via "New template" in the template list.
3. Editing an existing template.

---

### `meal_template_items`

The ingredients and default weights inside a template.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Auto-assigned. Primary key. |
| `template_id` | uuid | FK → `meal_templates.id` |
| `food_item_id` | uuid | FK → `food_items.id` |
| `default_weight_grams` | numeric | Pre-filled weight when template is applied. Always editable before confirming the log. |

When a template is applied, `default_weight_grams` values pre-fill editable fields in the logging flow. Nothing is written to `meal_log_items` until Julie confirms. Individual items can be excluded before confirming. The stored value after confirm is always the actual weight eaten, not the template default.

Editing a template after logging does not affect historical logs. Template and log are fully independent once the log is saved. `meal_logs` has no FK back to `meal_templates`.

---

## Relationships

```
meal_logs              ||--o{  meal_log_items          : contains
food_items             ||--o{  meal_log_items          : used_in
meal_templates         ||--o{  meal_template_items     : contains
food_items             ||--o{  meal_template_items     : used_in
```

`user_id` sits on `meal_logs`, `food_items`, `meal_templates`, and `daily_nutrition_summary` — the tables that originate data. The items tables inherit user ownership through their parent FK.

---

## External data sources

**USDA FoodData Central**
- REST API: `api.nal.usda.gov/fdc/v1/foods/search`
- Free, no rate limits, public domain data.
- Nutrient IDs are stable (protein = 1003, calories = 1008, etc.).
- A utility function maps USDA's nutrient array to a clean `{calories, protein, carbs, fat, fiber}` object for storage in `nutrients_per_100g`.
- Strong coverage of whole foods, fermented foods, Asian ingredients.
- Called at most once per ingredient — result cached in `food_items` permanently.
- Bulk importing the full dataset (~400,000 entries) is not the right approach. On-demand fetch and cache is correct for a personal app.

**Open Food Facts**
- REST API: `world.openfoodfacts.org/api/v2/product/{barcode}`
- Free, no key required, open source, community maintained.
- Used for barcode scanning of packaged products.
- Data quality varies — some entries complete, others sparse. UI handles missing fields gracefully.
- Called at most once per barcode — result cached in `food_items` permanently.

---

## Barcode scan flow

Scan → product identified via Open Food Facts → weight entry screen (serving size shortcut surfaced if available in product data) → stored value always in grams, never "1 serving" → same `meal_log_items` row as all other methods.

`logged_via = 'barcode'` on the `meal_logs` row.
`source = 'open_food_facts'` on the `food_items` row.

---

## Infrastructure notes

Supabase free tier: 500MB storage, 2GB bandwidth per month. Not a current concern at single-user scale. Monitor periodically via Supabase dashboard under Settings → Usage. Worth checking if new data-heavy features are added — particularly bulk data, image storage, or additional users.

---

## What is deferred

- Manual nutrient editing on `food_items` — revisit if the need arises. Would require an `overridden` flag and editable `nutrients_per_100g`.
- Automatic CGM integration — `peak_glucose_mmol` stays as a single manual field until CGM streams automatically, at which point a `cgm_readings` table with `meal_log_id` FK is the migration path.
- Micronutrient tracking UI — data is stored in `nutrients_per_100g` JSONB but not surfaced in phase 1. Requires supplement dosage data to be added to the data model before meaningful daily totals can be computed.
- Supplement dosage data model — needed before micronutrient totalling or flagging is meaningful.
- Regression analysis against HRV / sleep / glucose — needs 3+ months of clean data.

---

## What is not yet designed

- Coach integration detail — `daily_nutrition_summary` replaces current `daily_entries.nutrition` JSONB read. Coach prompt structure unchanged, only the data source changes.
- Responsive / mobile layout details.
