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

## Nutrition section — architecture and locked decisions

This section was designed April 2026. Full design documents are in /docs:
- NUTRITION_DATA_MODEL.md
- NUTRITION_UX_FLOW.md

Read both before touching any nutrition code.

---

### New tables (already created in Supabase)

Six new tables are live. Do not run migrations for these — they already exist.

- `food_items` — personal ingredient library, cached from USDA or Open Food Facts
- `meal_logs` — one row per meal occasion
- `meal_log_items` — one row per ingredient per meal, weight in grams only
- `daily_nutrition_summary` — denormalized daily macro totals, upserted after every meal save/edit/delete
- `meal_templates` — named meal presets
- `meal_template_items` — ingredients and default weights inside a template

RLS is enabled on all six tables (policy: `auth.uid() = user_id`). The new
nutrition API routes use the Supabase **service-role key** server-side, which
bypasses RLS — the policies stay in place for any future browser-direct access
but don't block our server writes.

**FK migration applied April 26, 2026.** The four `user_id` foreign keys to
`auth.users(id)` were dropped — Julie's `NUTRITION_USER_ID` UUID isn't an
auth.users row (this app doesn't use Supabase Auth), and the FKs were the
cause of every food_items insert failing. Internal FKs
(`meal_log_items → meal_logs`, etc.) are intact.

```sql
alter table food_items              drop constraint if exists food_items_user_id_fkey;
alter table meal_logs               drop constraint if exists meal_logs_user_id_fkey;
alter table meal_templates          drop constraint if exists meal_templates_user_id_fkey;
alter table daily_nutrition_summary drop constraint if exists daily_nutrition_summary_user_id_fkey;
```

### Required Vercel environment variables

- `USDA_API_KEY` — USDA FoodData Central. Server-side only.
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role secret. Server-side only.
- `NUTRITION_USER_ID` — UUID used as `user_id` on every nutrition row. Read by
  `lib/nutrition.ts → nutritionUserId()`. Set per-environment (Production +
  Preview both required).

---

### Locked architecture decisions

**Everything is grams.** No servings, no ml, no other units. weight_grams is the only quantity field throughout.

**Macros are never stored at the ingredient level.** They are always computed as nutrients_per_100g × weight_grams / 100 at read time. Never store pre-computed macros in meal_log_items or meal_template_items.

**daily_nutrition_summary is the source of truth for the coach and dashboard.** After every meal save, edit, or delete, recompute the day's totals from meal_log_items joined to food_items and upsert into daily_nutrition_summary. The coach reads from daily_nutrition_summary — never runs join queries at load time. This replaces the current daily_entries.nutrition JSONB read for the coach.

**No fixed meal slots.** No breakfast / lunch / dinner / snack enum. Meals are free-form, ordered by logged_at timestamp.

**Meal names are auto-generated if blank.** Derive from logged_at time band — before 11:00 = "Morning meal", 11:00–15:00 = "Afternoon meal", 15:00–19:00 = "Evening meal", after 19:00 = "Night meal". Never store a blank name.

**Day boundary is 05:00.** Anything logged between 05:00 Monday and 04:59 Tuesday belongs to Monday. Apply this when computing the date for daily_nutrition_summary.

**USDA API key is in Vercel environment variables as USDA_API_KEY.** Reference as process.env.USDA_API_KEY in API routes. Never hardcode. Never expose to the browser — all USDA calls go through Next.js API routes, never directly from the client.

**USDA data is cached permanently.** On first selection of a USDA result, write to food_items. On subsequent uses, read from food_items. Never re-fetch a known fdc_id.

**Open Food Facts is used for barcode scanning only.** No API key required. Endpoint: world.openfoodfacts.org/api/v2/product/{barcode}. Same caching rule applies — write to food_items on first scan, read locally thereafter.

**Backward compatibility — clean break.** Existing daily_entries.nutrition JSONB data is not migrated. The coach reads daily_nutrition_summary for current data. Legacy daily_entries.nutrition data for dates before the cutover is ignored.

**Framer-motion is used for all nutrition UI animations.** Add as a dependency if not already present. See NUTRITION_UX_FLOW.md for specific animation requirements.

**html5-qrcode is used for barcode scanning.** Add as a dependency.

**Five macros are displayed everywhere consistently:** calories, protein, carbs, fat, fiber. In that order. Never show just four.

**No micronutrient UI in phase 1.** Micronutrient data is stored in nutrients_per_100g JSONB and available for future use, but nothing surfaces it in the UI yet.

**Templates have no meal type.** No breakfast/lunch/dinner assignment on templates. They are free-form.

**Template and log are fully independent once saved.** meal_logs has no FK back to meal_templates. Editing a template never affects historical logs.

---

### USDA API utility function

When fetching from USDA, map the nutrient array to this clean object before storing in nutrients_per_100g:

```
{
  calories: (nutrient id 1008, kcal),
  protein: (nutrient id 1003, g),
  carbs: (nutrient id 1005, g),
  fat: (nutrient id 1004, g),
  fiber: (nutrient id 1079, g)
}
```

Store the full USDA nutrient array as well under a raw key for future micronutrient use.

---

### daily_nutrition_summary upsert logic

After every meal_log save, edit, or delete:

1. Compute the date from logged_at using the 05:00 day boundary
2. Query all meal_log_items for that user_id and date, joined to food_items
3. Sum nutrients_per_100g × weight_grams / 100 for each nutrient across all items
4. Count distinct meal_log_ids for meal_count
5. Build logged_via_summary JSONB from the logged_via values on meal_logs for that date
6. Upsert into daily_nutrition_summary — insert if no row exists for that user/date, update if it does

---

### Build status (April 26, 2026)

All steps below are built and pushed on `claude/quizzical-lalande-dce194`.

1. ~~DB migration~~ — tables already live in Supabase
2. ~~API routes~~ — `app/api/nutrition/{search,food-item,meal,day,templates,barcode}/route.ts`
   plus shared helpers in `lib/nutrition.ts` (service-role client, 05:00
   Berlin day-key, `recomputeDailySummary`) and `lib/usda.ts` (nutrient parser)
3. ~~Nutrition day view~~ — `components/sections/NutritionSection.tsx`
   self-fetches `/api/nutrition/day`, sticky 5-macro bar, animated meal cards,
   per-meal CGM chip, expandable ingredient breakdown with delete-with-confirm
4. ~~Five-screen logging flow~~ — `components/nutrition/MealLogger.tsx`
   (menu / search / weight / building / confirm), inline ghost-text autocomplete
   on local results, debounced USDA search, live macro preview, pulse on add
5. ~~Template list + edit view~~ — same MealLogger, screen `templates` plus
   reuse of `building` in template-edit mode (driven by `editingTemplate`
   state); apply staggers items into the meal at 70 ms intervals using their
   existing enter animation
6. ~~Barcode scanning~~ — `ScreenScan` inside MealLogger, `html5-qrcode`
   dynamic-imported on entry, Open Food Facts via `/api/nutrition/barcode`,
   serving-size shortcut surfaced on Screen 3 if OFF returned one

### Known follow-ups (not done in this build)

- **Coach still reads `daily_entries.nutrition`** in `app/api/coach/route.ts`
  via `entry.nutrition.*`. Per the locked architecture decision the coach
  should read from `daily_nutrition_summary` instead. Switch when convenient
  — until then the coach sees no data for meals logged through the new flow.
- The legacy four-meal-slot UI inside `lib/db.ts → rowToEntry` and
  `lib/types.ts → NutritionData` still reads/writes the old `daily_entries.*`
  columns. The new section ignores them entirely; saves still go through but
  the values are blank. Cleanup is safe once the coach switch above lands.
- camera access requires HTTPS — works on Vercel preview/prod, not on
  `npm run dev` over plain http://localhost. Use `next dev --experimental-https`
  or Safari (which whitelists localhost) when testing the scan flow locally.


**Hydration section**
- Logs ml per day
- Passes through to Coach context

**Supplements section**
- Hormones (separate cards): Progesterone (mg, toggle), Estradiol (sprays, toggle)
- Morning stack (accordion, default collapsed "Not taken"): Creatine 5g, Vitamin D3+K2, Zinc+Selenium, Glucosamine, Omega-3, Berberine, DIM
- Evening stack (accordion, default collapsed "Not taken"): Magnesium glycinate 200mg, L-Theanine
- Accordion behaviour: collapsed = "Not taken" (grey) or "Taken" (green). Open = master "Take all" toggle at top + individual toggles. Master on = all on. Individual toggles controllable independently after master flipped. Morning and evening independent.
- DEFAULT STATE: everything OFF. User must actively confirm.
- NO cyclic supplements section. Ashwagandha and Phosphatidylserine removed entirely.

**Context section**
- Fields: cycle day (auto-counter with manual reset), symptoms (multi-select), travelling toggle, notes
- HRV score field: REMOVED. Do not re-add.

### Coach Tab

- 5 time-based modes: wakeup (<09:00), posttraining (09–12), afternoon (12–17), earlyevening (17–20), endofday (20+)
- 30-day context window (fetches last 30 days from Supabase on load)
- Returns JSON with 5 fields: recovery, training, nutrition, insight, question
- Null fields are hidden in UI (not shown as empty cards)
- CGM framework built in (optional, never affects scores if absent)
- Zone3+ framework built in
- Bavaria foraging calendar built in (max once/week, weekends weighted, near-Munich locations)
- Food creativity framework: Japanese/Korean/Chinese/Thai/Vietnamese/Mediterranean/Middle Eastern/Indian. NEVER German/Bavarian.
- Reactive chat available below briefing cards
- Coach header text is mode-aware

### Dashboard

- Behavior Score + Outcome Score displayed as large numbers
- Color: green ≥75, amber 50–74, red <50
- 7-day trend charts (TO BE EXTENDED TO 30 DAYS — pending)
- Scores currently below data inputs (TO BE MOVED ABOVE — pending)

### History Tab

- Chronological entries, expandable, color-coded scores

---

## SCORING MODEL (locked — do not change without explicit instruction)

### Behavior Score (what Julie controlled)

| Input | Weight | Notes |
|---|---|---|
| Nutrition targets hit (protein + fiber priority) | 30% | |
| Supplements confirmed (morning + evening + hormones) | 20% | |
| Training appropriate to HRV framework | 20% | See HRV framework below |
| Bedtime consistency (within 30 min of 21:45) | 15% | |
| Active calorie target reached (900 kcal total) | 15% | |

**Critical rule:** Empty or missing fields = N/A, not zero. Weight redistributes to remaining fields. Never penalise for unlogged optional data.

**HRV training appropriateness logic:**
- HRV >100 → trained hard (zone3+ ≥16 min or 2 sessions) = full score
- HRV >100 → trained moderate = partial score
- HRV >100 → rest or easy only = low score
- HRV 80–100 → trained moderate = full score
- HRV 80–100 → trained easy or rest = partial (not penalised, conservative is ok)
- HRV 80–100 → trained hard = partial penalty
- HRV 60–80 → trained easy only = full score
- HRV 60–80 → trained moderate or hard = penalty
- HRV <60 → rested = full score
- HRV <60 → any training = penalty
- HRV missing → weight redistributes out, no penalty
- Going easier than HRV recommends is NEVER penalised. Conservative decisions are rewarded.

### Outcome Score (what Julie's body did)

| Input | Weight | Notes |
|---|---|---|
| HRV vs 88ms baseline | 30% | |
| Sleep duration + Rested score | 30% | Target 7h30–8h30 |
| RHR vs 52 bpm baseline | 20% | Flag if >58 for 2+ days |
| CGM glucose score | 20% | Redistributes to 0% when no CGM data logged |

**CGM scoring logic:**
- Fasting glucose only logged: score on fasting alone. Target ≤4.8 mmol/L = full score. Scales down toward 5.6 (flag threshold).
- Fasting + meal peaks logged: fasting 40% / meal peaks 60% within CGM sub-score. Meal peak target <7.5 mmol/L. Penalty above 8.5. Average across all logged meals.
- Neither logged: CGM sub-score = 0%, weight redistributes to other outcome fields.
- Never penalise for missing meal peaks — they are optional.

---

## DATA MODEL (Supabase)

### `daily_entries` table
- `id`, `user_id`, `date`
- Sleep: `sleep_duration_min`, `hrv`, `rhr`, `bedtime`, `rested`, `nap_minutes`, `fasting_glucose_mmol`
- Training: `sessions` (JSONB array), `cycled_today`, `cycling_minutes`, `cycling_calories`
- Nutrition: `pre_workout_snack`, `breakfast`, `lunch`, `dinner`, `incidentals` (all JSONB with description, protein, fiber, fat, carbs, calories, peak_glucose_mmol)
- Hydration: `hydration_ml`
- Supplements: `morning_stack_taken`, `morning_exceptions`, `evening_stack_taken`, `evening_exceptions`, `progesterone_taken`, `progesterone_mg`, `estradiol_taken`, `estradiol_sprays`
- Context: `cycle_day`, `symptoms`, `travelling`, `notes`
- Scores: `behavior_score`, `outcome_score`

### `training_sessions` fields (within JSONB)
- `activity_type`, `duration_min`, `zone3_plus_minutes`, `active_calories`
- `avg_heart_rate`: REMOVED. Do not re-add.

### `user_profiles` table
- User preferences, macro targets, profile data

### `cycle_tracker` table
- Cycle day tracking

### RLS
- Enabled on all 4 tables. Policy: `user_id = 'julie'`

---

## BACKLOG

### Active bugs
1. **Coach "this afternoon" language** — earlyevening mode still says "this afternoon" in CoachTab.tsx header/description text.

### Features — near term (priority order)
1. **Switch Coach to read `daily_nutrition_summary`** — `app/api/coach/route.ts` still pulls `entry.nutrition.*` from the legacy `daily_entries.nutrition` JSONB. Until this is changed the coach sees no data for meals logged through the new ingredient flow. Pass `logged_via_summary` through too so the coach can calibrate confidence.
2. **Dashboard scores above data inputs** — move Behavior + Outcome scores to top of Today tab so progress is visible while logging.
3. **Dashboard 30-day window** — extend from 7 to 30 days to match Coach context.
4. **Coach refresh button** — manual refresh when new training logged mid-day, without full page reload.
5. **Behavior/Outcome score review + CGM scoring** — full audit of scoring model. Confirm empty fields treated as N/A not zero. Implement CGM sub-score logic (see scoring model above).
6. **CGM rolling average in Coach context** — compute 30-day rolling average glucose from history and inject into Coach context block.
7. **Food quality coaching** — one actionable nudge per day on ingredients to add/reduce (cholesterol, inflammation, micronutrients). Design TBD: daily tip vs weekly pattern view.
8. **Commit BODYCIPHER.md to the GitHub repo** — so Claude Code reads it at the start of every session.

### Features — later
1. **Responsive design / mobile layout** — proper mobile vs web layout differentiation.
2. **Apple Health XML import** — deferred indefinitely.
3. **Regression analysis** — needs 3+ months data. Revisit July 2026.
4. **Goals tab** — new tab for holistic health goal setting and tracking (e.g. VO2 max target, weight, body composition, biomarker trends). Design TBD — discuss before building.

### Removed / will not do
- Breakfast templates — removed, not working for Julie
- Cyclic supplements UI (Ashwagandha, Phosphatidylserine) — removed entirely
- Andreas secondary user — not interested
- avg_heart_rate in training — replaced by zone3_plus_minutes

---

## Goals Tab (BodyCipher Tab) — Specced 19 April 2026

### App identity

- **Name:** BodyCipher
- **Tagline:** decode your body
- **Tab name:** BodyCipher (the goals/home tab)

---

### Tab structure — three sections

#### Section 1: Hero

- Dynamic greeting generated via Anthropic API on tab load
- Context passed: time of day (morning/afternoon/evening), day of week, training logged today (yes/no), HRV band (high/moderate/low/rest). Never pass cycle day.
- Tone: witty but warm, occasionally deadpan, never cheesy, never generic fitness app energy. One sentence after "Good [time], Julie." Julie in green (#1D9E75).
- Two score cards side by side: Behavior (green, #E1F5EE background) and Outcome (blue, #E6F1FB background)
- Each card: label, score number, small progress ring with icon inside. No delta. No tagline on cards.
- Tapping either card navigates to Dashboard tab
- Score values pulled from same calculation as Dashboard, live

#### Section 2: Long-term goals

Section header: "Long-term goals"
Three cards, collapsed on tab, expand inline on tap

**Card 1 — VO2 Max**

**Collapsed state:** shows card title "VO₂ Max" and current value + unit (e.g. "36 ml/kg/min"), or "Not yet logged" if no data exists. Chevron indicates expandable. Tapping anywhere on the collapsed card expands it.

**Expanded state:**

- **Header row:** large bold current value + "ml/kg/min" unit on the left, tappable to open inline entry form. "Not yet logged" is equally tappable when no data exists. Next-tier badge pill on the right showing the next band above current value with arrow (e.g. "Superior →").

- **Spectrum bar:** full horizontal SVG gradient bar from muted blue-grey (left/poor) to deep green (right/superior). Five bands with labels and range text below the bar:
  - Poor: <23
  - Fair: 23–27
  - Good: 28–32
  - Excellent: 33–36
  - Superior: 37+
  
  Bar extends to 50+ on the right. Two markers: current value circle with value label above it, and a subtle target diamond at 40 labeled "target". Gradient uses CSS custom properties only.

- **Sparkline:** section header "Recent readings". SVG line chart, no axes, no grid lines. Glowy radiant green line achieved via SVG filter (feGaussianBlur + feMerge) or duplicate blurred path underneath main line, plus subtle gradient fill area beneath the line. Dots at each data point. Date labels below x-axis in month + year format (e.g. "Apr 2026"). Empty chart area with no placeholder text if no readings exist. Queries `biomarker_readings` for `marker = 'vo2_max'`, `user_id = 'julie'`, ordered ascending, limit 6.

- **Inline entry form:** opens inside the card when current value or "Not yet logged" is tapped. `e.stopPropagation()` on the tap handler to prevent card collapse. Two fields: value (numeric, ml/kg/min) and date (date picker, defaults to today). Save button inserts new row to `biomarker_readings` then refreshes both current value and sparkline. Cancel closes form without saving.

- **Data source:** manual entry. No finite ceiling — target is 40 now, will keep improving beyond that.

**Card 2 — Cardiovascular health**

- Pink heart icon next to card name
- Headline: LDL:HDL ratio (current 2.5 — Good)
- LDL spectrum: Optimal (<100) / Near optimal (100–129) / Borderline (130–159) / High (160+). Gradient left=green right=red. Current: 124 mg/dL.
- HDL spectrum: Low (<40) / Acceptable (40–59) / Protective (60+). Gradient reversed. Current: 50 mg/dL.
- Targets: LDL <100, HDL >60
- Sparkline: ratio trend over time. One data point Oct 2024: 2.48. Dashed risk threshold line at 3.5.
- Footer: "Last tested Oct 2024 · bloodwork overdue"
- Tapping LDL or HDL stat opens manual entry bottom sheet: value + date
- When new bloodwork logged, automatically updates health calendar bloodwork item
- Data source: manual entry after each blood test

**Card 3 — Glucose stability**

- Amber waveform icon next to card name
- Headline: 7-day rolling average of daily fasting glucose from context section entries. Current: 5.1 mmol/L.
- Secondary stat: HbA1c (current 5.2%) — tappable to update via bottom sheet: value + date
- Spectrum: Low (<4.0) / Optimal (4.0–5.4) / Good (5.5–6.0) / Watch (6.0+). Note displayed: "post-meal peaks up to 7.8 normal"
- Sparkline: 7 daily fasting readings across current week
- CGM toggle: on/off. When off — card goes greyed/dormant, sparkline replaced by "No active CGM sensor" + last snapshot date and value
- Data source: daily fasting glucose auto-computed from context section entries (7-day rolling average), HbA1c manual

#### Section 3: Health calendar

Section header: "Health calendar"

**Always visible (rolling booking cycle):**
- Dermatologist — every 6 months
- Dentist — every 6 months

**Surfaces 4 months before due, disappears once logged:**
- Gynaecologist — annual
- Full bloodwork — annual (covers lipids, thyroid panel, ferritin, D3). Logging here links to cardiovascular goal card.
- Breast scan — annual
- Thyroid scan — annual (ultrasound, history of nodules)
- Bone density scan — baseline, then every 2 years
- Colonoscopy — every 10 years, lowest visual weight
- Eye / optometrist — annual, low urgency

**Each item shows:**
- Coloured rounded square category icon
- Name and cadence
- Status: Done (green) / Overdue (red) / Due soon (amber) / Booked (green with date)
- When booked: shows appointment date e.g. "Derm · 3 May" with calendar icon
- Next due date when applicable

**Tapping any item opens bottom sheet:**
- Mark as done with date field
- Book appointment with date field
- Optional note field

**Status tiers:**
- Coming up — within 4 months, shows booked date if entered
- Due / overdue — most prominent
- All clear — item disappears until next cycle

---

### Visual design

- White cards on tertiary background
- Green (#3D9A6B / #1D9E75) for behavior/VO2, blue for outcome/LDL, amber for glucose, pink for cardiovascular icon
- Spectrum bands replace finite rings for all long-term goals
- Small coloured rounded square icons throughout
- Motivational footer quote at bottom of tab (fixed): "Small choices. Strong direction. You're becoming who you're building."
- BodyCipher wordmark at top of tab
- Logo asset to be swapped in when designed — placeholder text for now
- Overall feel: Muji meets Apple Health, warmer and more alive, not clinical

---

### Data connections

- Behavior and Outcome scores: pulled from Dashboard calculation, live
- VO2 max: manually logged
- LDL/HDL: manually logged after bloodwork, links to health calendar bloodwork item
- Glucose 7-day average: auto-computed from daily fasting glucose in context section
- HbA1c: manually logged
- Health calendar dates: manually entered
- CGM toggle: manual, persists across sessions

---

### Deferred

- Outlook calendar sync
- Apple Health VO2 max auto-sync
- Claude Design polish pass on icons and visual warmth

---

## PROCESS REMINDERS

- **Branch only.** Claude Code never pushes to main directly.
- **Review before merge.** Claude Code outputs plain-English change summary. Julie pastes it here. Claude gives go/no-go. Only then does Julie merge.
- **DB first.** SQL migrations always run in Supabase before code changes deploy.
- **No full rewrites.** Targeted edits only. If a full rewrite seems necessary, stop and explain why first.
