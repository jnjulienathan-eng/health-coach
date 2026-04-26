# BODYCIPHER
_Single source of truth. Read at the start of every Claude Code session. Update at the end of every session._
_Last updated: April 26, 2026_

---

## DEVELOPMENT RULES (mandatory)

1. Read this file fully before touching any code.
2. Never rewrite a file from scratch. Make only targeted, minimal edits.
3. CSS custom properties only — no hardcoded colours or inline style values.
4. Always push to a new branch, never directly to main.
5. After completing all tasks, output a plain-English summary of every file changed and every line edited.
6. Ask before moving to the next task.
7. DB migrations always run in Supabase SQL editor before any code changes deploy.
8. Commit and push after every task.

---

## PROJECT

**App:** BodyCipher — decode your body. Personal health coaching web app for Julie.
**Live:** https://health-coach-rho.vercel.app
**Local:** `/Users/julienathan/Documents/Northstar/health-coach`
**GitHub:** `git@github.com:jnjulienathan-eng/health-coach.git` (SSH)
**Stack:** Next.js + Supabase (West EU, `cprcamywvhtcboprtkjp.supabase.co`) + Vercel
**Key files:** `app/api/coach/route.ts`, `lib/db.ts`, `lib/types.ts`, `lib/scores.ts`
**Sections:** `components/sections/` — SleepSection, TrainingSection, NutritionSection, HydrationSection, SupplementsSection, ContextSection
**Other components:** `components/CoachTab.tsx`, `components/Dashboard.tsx`, `components/HistoryTab.tsx`

---

## JULIE'S PROFILE (never change without explicit instruction)

- Early 50s, perimenopause, Munich, Bavaria
- Athletic, data-driven, health-optimised. Metric units only.
- HRV baseline ~88ms | RHR baseline ~52 bpm
- Sleep target: 7h30–8h30 | Bedtime target: 21:45
- Protein target: 130–140g/day | Fiber: 30–35g
- Active calorie target: 600 kcal intentional training, ~900 kcal total
- Training: Swim 50min, eGym 35min, Run 35min, Walk 75min
- Diet: whole food, largely dairy-free (exceptions: cottage cheese, occasional cheese, high-protein yogurt). Lower carb, not keto. Alcohol-free. Loves sardines, natto, fermented foods.
- Cuisine: Japanese, Korean, Chinese, Thai, Vietnamese, Mediterranean, Middle Eastern, Indian. Never German/Bavarian.
- Cycle: currently irregular, recent cycles 54–80+ days

---

## CURRENT STATE — WHAT IS BUILT

### Today Tab

**Sleep section**
- Fields: duration (min), HRV (ms), RHR (bpm), bedtime, rested score (1–5), nap duration (min), fasting glucose (mmol/L, optional)
- All fields save to `daily_entries` in Supabase

**Training section**
- Multiple sessions per day supported
- Per session: activity type, duration (min), zone3+ minutes, active calories
- Zone3+ intensity classification: 0–5 = Easy, 6–15 = Moderate, 16+ = Hard
- Cycling logged separately (transport only): toggle + minutes + calories
- Active calorie target: 600 kcal intentional training
- `avg_heart_rate` field has been removed — replaced by `zone3_plus_minutes`

**Nutrition section**
- Full ingredient-level food logging built and tested in preview. On branch `claude/quizzical-lalande-dce194` — do not merge to main until items 7–14 in build status are complete (see below).
- Eight Supabase tables live (six original + recipes + recipe_ingredients)
- Five-screen logging flow: bottom sheet → ingredient search → weight entry → building meal → save confirmation
- USDA FoodData Central integration (server-side only, cached to food_items on first use)
- Open Food Facts barcode scanning via html5-qrcode
- Template system: create, use, edit, delete. Sorted by use_count.
- Macro summary bar: consumed vs target for all 5 macros
- Meal cards with ingredient breakdown, edit and delete per ingredient
- framer-motion animations throughout
- daily_nutrition_summary upserted after every meal save/edit/delete
- Old daily_entries.nutrition JSONB fields are legacy — not used going forward
- Coach must switch to read from daily_nutrition_summary (backlog item #1)

**Still to build on this branch before merge:**
- Recipe builder (screens in MealLogger + API route)
- My Library screen (replaces standalone templates screen, adds recipes)
- Screen 1 redesign (4 options)
- Photo estimation screen + API route
- "Add another template" on Screen 4
- USDA deduplication

**Hydration section**
- Logs ml per day. Passes through to Coach context.

**Supplements section**
- Hormones: Progesterone (mg, toggle), Estradiol (sprays, toggle)
- Morning stack (accordion, default collapsed): Creatine 5g, Vitamin D3+K2, Zinc+Selenium, Glucosamine, Omega-3, Berberine, DIM
- Evening stack (accordion, default collapsed): Magnesium glycinate 200mg, L-Theanine
- DEFAULT STATE: everything OFF. User must actively confirm.
- NO cyclic supplements. Ashwagandha and Phosphatidylserine removed entirely.

**Context section**
- Fields: cycle day (auto-counter with manual reset), symptoms (multi-select), travelling toggle, notes
- HRV score field: REMOVED. Do not re-add.

### Coach Tab

- 5 time-based modes: wakeup (<09:00), posttraining (09–12), afternoon (12–17), earlyevening (17–20), endofday (20+)
- 30-day context window
- Returns JSON with 5 fields: recovery, training, nutrition, insight, question. Null fields hidden.
- CGM, Zone3+, foraging calendar, food creativity frameworks built in
- Reactive chat below briefing cards

### Dashboard

- Behavior Score + Outcome Score as large numbers. Color: green ≥75, amber 50–74, red <50.
- 7-day trend charts (TO BE EXTENDED TO 30 DAYS — pending)
- Scores below data inputs (TO BE MOVED ABOVE — pending)

### History Tab

- Chronological entries, expandable, color-coded scores

---

## Nutrition section — architecture and locked decisions

Full design documents in /docs — read both before touching any nutrition code:
- NUTRITION_DATA_MODEL.md
- NUTRITION_UX_FLOW.md

---

### Tables (all live in Supabase — do not re-run migrations)

- `food_items` — ingredient library. source: 'usda' | 'openfoodfacts' | 'recipe' | 'recipe_deleted' | 'custom'
- `meal_logs` — one row per meal. Top-level macro fields (calories, protein_g, carbs_g, fat_g, fiber_g) nullable — only populated when logged_via = 'photo_estimate'
- `meal_log_items` — one row per ingredient per meal
- `daily_nutrition_summary` — denormalized daily totals, coach reads this
- `meal_templates` — named meal presets
- `meal_template_items` — ingredients and default weights per template
- `recipes` — batch recipe definitions. status: 'draft' | 'active'
- `recipe_ingredients` — raw batch ingredient weights per recipe

RLS enabled on all eight tables. Nutrition API routes use service-role key (bypasses RLS server-side). The four `user_id` FK constraints to `auth.users` were dropped April 26 — NUTRITION_USER_ID is not an auth row.

### Required Vercel environment variables

- `USDA_API_KEY` — server-side only
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only
- `NUTRITION_USER_ID` — UUID for all nutrition rows, read via `nutritionUserId()` in lib/nutrition.ts
- `ANTHROPIC_API_KEY` — used by /api/nutrition/estimate for photo estimation, server-side only

---

### Locked architecture decisions

**Everything is grams.** No servings, no ml, no other units.

**Macros never stored at ingredient level.** Always computed as nutrients_per_100g × weight_grams / 100 at read time.

**daily_nutrition_summary is source of truth for coach and dashboard.** Upserted after every meal save/edit/delete. For photo-estimated meals (no items), add top-level macro fields on meal_logs directly to the totals. Coach never runs join queries at load time.

**No fixed meal slots.** Free-form, ordered by logged_at.

**Meal names auto-generated if blank.** before 11:00 = "Morning meal", 11:00–15:00 = "Afternoon meal", 15:00–19:00 = "Evening meal", after 19:00 = "Night meal".

**Day boundary is 05:00 Europe/Berlin.**

**USDA calls server-side only** via /api/nutrition/search. Never from client. Cached permanently in food_items on first use.

**USDA deduplication.** When search returns identical names, collapse to the entry with most complete nutrient data (all 5 macros non-zero). Prefer higher fdc_id if tied. Never surface duplicates to user.

**Open Food Facts for barcode scanning only.** Same caching rule. html5-qrcode for scanning only — not for photo capture.

**Photo-estimated meals use top-level macro fields on meal_logs.** logged_via = 'photo_estimate', no meal_log_items rows. daily_nutrition_summary recompute must handle this — sum from items where present, top-level fields where absent.

**Five macros everywhere:** calories, protein, carbs, fat, fiber. That order. Never four.

**No micronutrient UI in phase 1.** Data stored in nutrients_per_100g JSONB for future use.

**Templates free-form.** No meal type. Log and template independent once saved.

**Backward compatibility — clean break.** Legacy daily_entries.nutrition JSONB not migrated or read by new code.

---

### Recipe builder — locked decisions

**A recipe IS a food item.** Once active, it appears in ingredient search and is logged by weight like any other item.

**Raw ingredients, cooked weight.** Ingredients entered at raw batch weights. Total cooked weight (weighed after cooking) is the divisor for per-100g computation. Accounts for water evaporation.

**Macro computation:**
1. For each ingredient: `nutrients_per_100g × weight_grams / 100` → contribution
2. Sum all contributions → total batch macros
3. `per_100g = total_batch_macro / total_cooked_grams × 100`
4. Store in food_items.nutrients_per_100g with source = 'recipe'

**Draft state.** total_cooked_grams absent = status 'draft'. Draft recipes visible in My Library (amber chip) but not searchable for logging. Save draft while pot is cooking, edit later to add cooked weight and activate.

**Optional default serving weight.** Stored on recipe. When logging, Screen 3 shows shortcut chip "1 serving (Xg)" — identical to barcode serving chip.

**Editable.** Changing anything recomputes and updates the food_items entry. Historical logs unaffected.

**Deleted recipes.** food_items source set to 'recipe_deleted'. Row not hard-deleted.

**`recipes` table:** id, user_id, name, total_servings (int, min 1), total_cooked_grams (numeric, nullable), default_serving_grams (numeric, nullable), food_item_id (FK → food_items, null when draft), status ('draft'|'active'), created_at, updated_at.

**`recipe_ingredients` table:** id, recipe_id (FK CASCADE), food_item_id (FK RESTRICT), weight_grams (numeric > 0) — raw weight for whole batch.

---

### My Library

Single home for all saved content. Accessible from Screen 1 ("Browse Library") and from nutrition day view (library icon alongside "+ Log a meal").

Two sections:
- **Recipes** — draft (amber chip, not tappable) and active. Edit/delete per card. "New recipe" opens recipe builder.
- **Templates** — sorted by use_count. Use/edit/delete per card. "New template" opens building screen in template-edit mode.

---

### USDA API utility function

Map nutrient array to clean object before storing:
```
{
  calories: (nutrient id 1008, kcal),
  protein: (nutrient id 1003, g),
  carbs: (nutrient id 1005, g),
  fat: (nutrient id 1004, g),
  fiber: (nutrient id 1079, g)
}
```
Store full USDA array under raw key for future micronutrient use.

---

### daily_nutrition_summary upsert logic

After every meal_log save, edit, or delete:
1. Compute date from logged_at using 05:00 Berlin boundary
2. Sum nutrients_per_100g × weight_grams / 100 from meal_log_items joined to food_items for that date
3. Add top-level macro fields from meal_logs where logged_via = 'photo_estimate' for that date
4. Count distinct meal_log_ids for meal_count
5. Build logged_via_summary JSONB
6. Upsert into daily_nutrition_summary. Delete row if no meals remain.

---

### Build status

All on branch `claude/quizzical-lalande-dce194`.

1. ~~DB migration~~ — done
2. ~~API routes~~ — search, food-item, meal, day, templates, barcode — done
3. ~~Nutrition day view~~ — NutritionSection.tsx — done
4. ~~Five-screen logging flow~~ — MealLogger.tsx — done
5. ~~Template list + edit view~~ — inside MealLogger — done
6. ~~Barcode scanning~~ — ScreenScan, commit c4e11b1 — done

**Remaining before merge to main:**
7. Recipe API route — app/api/nutrition/recipe/route.ts
8. Photo estimation API route — app/api/nutrition/estimate/route.ts
9. My Library screen — inside MealLogger (absorbs templates screen)
10. Recipe builder screens — inside MealLogger
11. Screen 1 redesign — 4 options
12. Photo estimation screen — inside MealLogger
13. "Add another template" on Screen 4
14. USDA deduplication — in /api/nutrition/search

**Do not merge to main until 7–14 are complete and tested in preview.**

### Known follow-ups from Steps 1–6

- Coach still reads `daily_entries.nutrition` — switch to `daily_nutrition_summary` is backlog item #1
- Legacy meal-slot UI in lib/db.ts and lib/types.ts — safe to clean up once coach switch lands
- Camera requires HTTPS — works on Vercel preview/prod, not plain http://localhost

---

## SCORING MODEL (locked — do not change without explicit instruction)

### Behavior Score

| Input | Weight |
|---|---|
| Nutrition targets hit (protein + fiber priority) | 30% |
| Supplements confirmed (morning + evening + hormones) | 20% |
| Training appropriate to HRV framework | 20% |
| Bedtime consistency (within 30 min of 21:45) | 15% |
| Active calorie target reached (900 kcal total) | 15% |

**Critical rule:** Empty or missing fields = N/A, not zero. Weight redistributes. Never penalise for unlogged optional data.

**HRV training logic:**
- HRV >100 → hard (zone3+ ≥16 min or 2 sessions) = full | moderate = partial | easy/rest = low
- HRV 80–100 → moderate = full | easy/rest = partial (not penalised) | hard = partial penalty
- HRV 60–80 → easy = full | moderate/hard = penalty
- HRV <60 → rest = full | any training = penalty
- HRV missing → redistributes, no penalty
- Going easier than HRV recommends is NEVER penalised.

### Outcome Score

| Input | Weight |
|---|---|
| HRV vs 88ms baseline | 30% |
| Sleep duration + Rested score | 30% |
| RHR vs 52 bpm baseline | 20% |
| CGM glucose score | 20% (redistributes to 0% if no CGM) |

**CGM scoring:**
- Fasting only: target ≤4.8 mmol/L = full, scales down toward 5.6
- Fasting + peaks: fasting 40% / peaks 60%. Peak target <7.5 mmol/L, penalty above 8.5
- Neither: CGM sub-score = 0%, weight redistributes
- Never penalise for missing meal peaks

---

## DATA MODEL (Supabase)

### `daily_entries`
Sleep: sleep_duration_min, hrv, rhr, bedtime, rested, nap_minutes, fasting_glucose_mmol
Training: sessions (JSONB), cycled_today, cycling_minutes, cycling_calories
Nutrition columns: LEGACY — do not read or write from new code
Hydration: hydration_ml
Supplements: morning_stack_taken, morning_exceptions, evening_stack_taken, evening_exceptions, progesterone_taken, progesterone_mg, estradiol_taken, estradiol_sprays
Context: cycle_day, symptoms, travelling, notes
Scores: behavior_score, outcome_score

### sessions JSONB fields
activity_type, duration_min, zone3_plus_minutes, active_calories
avg_heart_rate: REMOVED. Do not re-add.

### Nutrition tables — see table list above under "Tables"

### `user_profiles` — preferences, macro targets
### `cycle_tracker` — cycle day tracking
### `biomarker_readings` — user_id, marker, value, unit, date

### RLS
- Nutrition tables: user_id = auth.uid() (bypassed server-side via service role)
- Legacy tables: user_id = 'julie' (text), RLS disabled — do not change

---

## BACKLOG

### Active bugs
1. **Coach "this afternoon" language** — earlyevening mode, CoachTab.tsx
2. **hrv_score field** — still in ContextSection.tsx, wrong field name on removal
3. **Coach training override not working** — sessions logged but coach still recommends training
4. **Coach calorie calc** — over-target when under
5. **Recovery and Training cards empty in evening mode**

### Pre-merge nutrition items (branch claude/quizzical-lalande-dce194)
1. **Recipe builder** — tables already created. Build API route + UI. Full spec above.
2. **My Library screen** — absorbs templates screen, adds recipes section
3. **Screen 1 redesign** — 4 options: Add ingredients / Browse Library / Create a recipe / Estimate from photo or description
4. **Photo estimation** — photoEstimate screen + /api/nutrition/estimate route. Top-level macro fields on meal_logs. ANTHROPIC_API_KEY server-side.
5. **"Add another template" on Screen 4** — appends second template ingredients to existing meal
6. **USDA deduplication** — collapse identical-name results in /api/nutrition/search

### Features — near term
1. **Switch Coach to daily_nutrition_summary** — app/api/coach/route.ts still reads legacy entry.nutrition.*. Pass logged_via_summary for confidence calibration.
2. **Coach redesign** — dedicated session. Training override, calorie calc, empty evening cards, language bugs, too generic. Reasoning across 30-day patterns.
3. **Accumulated training load** — third score. Acute (7-day) vs chronic (28-day) rolling stress, ratio flags overreach. Design in coach session before touching code.
4. **Dashboard scores above data inputs**
5. **Dashboard 30-day window**
6. **Coach refresh button**
7. **Behavior/Outcome score review + CGM scoring** — confirm empty = N/A not zero
8. **CGM rolling average in Coach context**
9. **Food quality coaching** — one nudge/day. Design TBD.

### Features — later
1. Responsive design / mobile layout
2. Apple Health XML import — deferred indefinitely
3. Regression analysis — revisit July 2026
4. Goals tab — specced below, not yet built

### Removed / will not do
- Breakfast templates
- Cyclic supplements (Ashwagandha, Phosphatidylserine)
- Andreas secondary user
- avg_heart_rate in training

---

## Goals Tab (BodyCipher Tab) — Specced 19 April 2026

### App identity
- Name: BodyCipher · Tagline: decode your body · Tab name: BodyCipher

### Section 1: Hero
- Dynamic API greeting on load. Context: time of day, day of week, training today (yes/no), HRV band. Never cycle day.
- Tone: witty but warm, occasionally deadpan, never cheesy. "Good [time], Julie." Julie in green (#1D9E75).
- Two score cards: Behavior (green #E1F5EE) and Outcome (blue #E6F1FB). Label, number, small progress ring. Tap navigates to Dashboard.

### Section 2: Long-term goals
Three collapsible cards.

**VO2 Max** — spectrum bar (Poor <23 / Fair 23–27 / Good 28–32 / Excellent 33–36 / Superior 37+), current value marker, target diamond at 40. Glowy sparkline. Inline entry form. Queries biomarker_readings, marker = 'vo2_max'.

**Cardiovascular health** — pink heart icon. LDL:HDL ratio headline. LDL and HDL spectrum bars. Sparkline with dashed threshold at 3.5. Manual entry bottom sheet.

**Glucose stability** — amber waveform icon. 7-day rolling fasting glucose average. HbA1c secondary stat. CGM toggle.

### Section 3: Health calendar
Always visible: Dermatologist (6-monthly), Dentist (6-monthly).
Surfaces 4 months before due: Gynaecologist, Full bloodwork, Breast scan, Thyroid scan, Bone density scan, Colonoscopy, Eye/optometrist.
Each item: status chip, next due date, bottom sheet to mark done / book.

### Visual design
White cards on tertiary background. Green/blue/amber/pink per card type. Spectrum bands throughout. Footer: "Small choices. Strong direction. You're becoming who you're building." Feel: Muji meets Apple Health.

---

## PROCESS REMINDERS

- **Branch only.** Never push to main directly.
- **Review before merge.** Claude Code outputs change summary → Julie pastes here → go/no-go → merge.
- **DB first.** Julie runs all SQL migrations manually in Supabase before code deploys.
- **No full rewrites.** Targeted edits only.
- **Update docs.** BODYCIPHER.md, NUTRITION_DATA_MODEL.md, and NUTRITION_UX_FLOW.md committed at end of every session touching nutrition code.
