# CLAUDE.md
_Instructions for Claude Code. Read this before touching anything._
_Companion to BODYCIPHER.md — that file covers what the app does. This file covers how to work._

---

## BEFORE YOU START

1. Read BODYCIPHER.md in the project root in full.
2. Read every file you plan to edit before writing a single line.
3. Never assume you know the current state of a file — always read it first.
4. If working on the nutrition section: the design lives in
   /docs/NUTRITION_DATA_MODEL.md and /docs/NUTRITION_UX_FLOW.md, the
   shipped code lives in components/nutrition/MealLogger.tsx,
   components/sections/NutritionSection.tsx, lib/nutrition.ts,
   lib/usda.ts, and app/api/nutrition/*. Read both the docs and the
   current code — the docs describe intent, the code is the truth.

---

## MANDATORY PROCESS

1. Push to a new branch only. Never push to main directly.
2. Make targeted, minimal edits. Never rewrite a file from scratch.
3. Commit and push after every completed task.
4. Ask before moving to the next task.
5. After all tasks: output a plain-English summary of every file changed
   and every line edited. Be specific — file name, what changed, why.
6. DB migrations always run in Supabase SQL editor BEFORE any code
   changes deploy. Never do them yourself. Flag if a migration is needed
   and wait.
7. Update BODYCIPHER.md, NUTRITION_DATA_MODEL.md, and NUTRITION_UX_FLOW.md
   to reflect any changes made — new fields, removed features, backlog
   updates, decisions taken. Do this before the plain-English summary.

---

## CSS

CSS custom properties only. No hardcoded hex values. No inline style values.

---

## THINGS THAT HAVE GONE WRONG — DO NOT REPEAT

### Full-file rewrites cause regressions
Rewriting a whole component to fix one thing has twice caused features
to silently revert. Targeted edits only. If a full rewrite seems
genuinely necessary, stop and explain why before proceeding.

### The Supabase env var bug
The correct env var is NEXT_PUBLIC_SUPABASE_ANON_KEY.
NOT NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY.
Using the wrong one causes silent data fetch failures with no error shown.
If data is mysteriously not loading, check this first.

### DB migration before code deployment
If a column is renamed or added in Supabase before the frontend code
deploying that change is live, any save during the deployment window
will crash. Always confirm the migration is complete and the code
change is deployed before testing.

### Missing fields after migration
After any DB migration that adds or renames a column, verify the new
field is wired all the way through: types → db/route helpers → API
route → component. Real precedents:
- April 18: peak_glucose_mmol missing from old NutritionSection — saves failed silently.
- April 26: auth.users FK constraints on nutrition tables rejected every
  food_items insert because NUTRITION_USER_ID isn't an auth row. Fix was
  to drop the FKs (see BODYCIPHER → "FK migration applied April 26, 2026").

### Supabase errors stringify to "[object Object]"
PostgrestError is a plain object ({message, code, details, hint}), not
a JS Error instance. `String(err)` collapses to "[object Object]".
In any try/catch around a Supabase call, walk the fields manually —
see app/api/nutrition/food-item/route.ts `describe()` for the canonical helper.

### framer-motion AnimatePresence with multiple conditional siblings
Using `<AnimatePresence mode="wait">` with several sibling conditionals
is flaky — exit/enter handoff can stall. Always render exactly one keyed
child via an IIFE switch. See MealLogger.tsx for the pattern.

### SSH auth only
GitHub authentication must use SSH: git@github.com:jnjulienathan-eng/health-coach.git
HTTPS token auth has failed repeatedly due to invisible characters when
pasting. Do not attempt HTTPS auth.

---

## FIELDS AND NAMING — GET THESE RIGHT

- `zone3_plus_minutes` — replaces avg_heart_rate. Do not re-add avg_heart_rate.
- `hrv` — lives in daily_entries (sleep section).
  hrv_score in ContextSection was removed. Do not re-add it.
- `fasting_glucose_mmol` — lives in daily_entries (sleep section).
- `sessions` — JSONB array in daily_entries.
  Each item: {activity_type, duration_min, zone3_plus_minutes, active_calories}

### Nutrition tables — eight live tables in Supabase

**food_items, meal_logs, meal_log_items, daily_nutrition_summary, meal_templates, meal_template_items** — built in Steps 1–6 (April 26). Access via lib/nutrition.ts (server-side admin client, day boundary, summary recompute) and lib/usda.ts (nutrient parser). Never call USDA from client-side code.

**recipes, recipe_ingredients** — added April 26, 2026. Store batch recipe definitions. A recipe produces a single food_items entry (source = 'recipe') once activated. Accessed via app/api/nutrition/recipe/route.ts.

**is_raw** — boolean field on recipes (DEFAULT false). When true: no cooking step, divisor for per-100g macro computation = sum of raw ingredient weights. total_cooked_grams is null for raw/assembled recipes. Activates as soon as ingredients are present.

**meal_logs top-level macro fields:** calories, protein_g, carbs_g, fat_g, fiber_g are nullable columns on meal_logs. They are ONLY populated when logged_via = 'photo_estimate'. All other logged_via types use meal_log_items rows instead. Do not populate these fields for ingredient-based or barcode-scanned meals.

**Photo estimation:** When logged_via = 'photo_estimate', no meal_log_items rows are created. Macros go into the top-level fields on meal_logs. The recomputeDailySummary function must add these directly to the running totals. Do NOT create synthetic food_items entries for photo estimates — that was the old incorrect approach.

**My Library:** Recipes only. The standalone templates screen has been replaced by a unified My Library screen showing only Recipes. Templates (meal_templates, meal_template_items) exist in the DB and API routes but are NOT surfaced in the UI. Do not re-add the Templates section to My Library.

**Screen 1** now has four options: Add ingredients / Browse Library / Create a recipe / Estimate from photo or description.

**Peak glucose:** The peak_glucose_mmol field is an inline editable field on each meal card in the day view. It is NOT part of any logging screen (not Screen 5, not the edit flow). PATCH /api/nutrition/meal updates it without recomputing the daily summary.

**Macro override:** PATCH /api/nutrition/food-item merges per-macro overrides into nutrients_per_100g JSONB, preserving the raw USDA array. Triggered by pencil icon on local library results in ScreenSearch.

- The old daily_entries.nutrition JSONB columns (pre_workout_snack, breakfast, lunch, dinner,
  incidentals + their macro fields) are legacy. Don't read or write them from new code.
- Coach **should** read from daily_nutrition_summary but **currently still reads
  daily_entries.nutrition** in app/api/coach/route.ts. This is backlog item #1.
  **Do not touch Coach at all until Goals tab / Training Load branch is merged to main.**
- RLS on the eight nutrition tables uses `auth.uid() = user_id`. We bypass it
  server-side with the service-role client in lib/nutrition.ts → supaAdmin().
- New nutrition rows use `user_id = process.env.NUTRITION_USER_ID`. Never hardcode.
  Read through lib/nutrition.ts → nutritionUserId().
- Required env vars (Vercel, both Production and Preview):
  USDA_API_KEY, SUPABASE_SERVICE_ROLE_KEY, NUTRITION_USER_ID, ANTHROPIC_API_KEY.
  All server-side only. Never reference in client components.
- food_items.source allowlist: 'usda' | 'openfoodfacts' | 'recipe' | 'recipe_deleted' | 'custom'

---

## NEVER DO THESE

- Never push directly to main
- Never rewrite a file from scratch without explicit instruction
- Never run Supabase SQL migrations (Julie does these manually)
- Never change JULIE_PROFILE without explicit instruction
- Never add German or Bavarian cuisine to Coach suggestions
- Never re-add avg_heart_rate to training sessions
- Never re-add hrv_score to ContextSection
- Never add calorie warnings or penalties to nutrition
- Never add cyclic supplements (Ashwagandha, Phosphatidylserine) — removed by design
- Never create synthetic food_items entries for photo-estimated meals — use top-level macro fields on meal_logs
- Never call the USDA API from client-side code — always go through /api/nutrition/search
- Never call the Anthropic API from client-side code — always go through /api/nutrition/estimate
- Never re-add the Templates section to My Library — meal_templates and meal_template_items exist in DB and API but the UI was removed by design
- Never touch app/api/coach/route.ts or any coach component until Goals tab / Training Load branch is merged to main
