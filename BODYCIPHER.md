# BODYCIPHER
_Single source of truth. Read at the start of every Claude Code session. Update at the end of every session._
_Last updated: April 18, 2026_

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
- Meals: pre-workout snack, breakfast, lunch, dinner, incidentals
- Per meal: description field, photo upload (Claude vision macro estimation), macro fields (protein g, fiber g, fat g, carbs g, calories kcal), peak glucose mmol/L (optional, CGM)
- Breakfast: plain description + macro fields only — NO templates, NO special logic. Identical to lunch and dinner.
- Macro totals calculated and displayed
- Tiered daily targets based on training volume (rest/light/moderate/high/very high)
- Calorie warnings: NONE. Julie does not overeat and logs imperfectly by design.

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
1. **Dashboard scores above data inputs** — move Behavior + Outcome scores to top of Today tab so progress is visible while logging.
2. **Dashboard 30-day window** — extend from 7 to 30 days to match Coach context.
3. **Coach refresh button** — manual refresh when new training logged mid-day, without full page reload.
4. **Behavior/Outcome score review + CGM scoring** — full audit of scoring model. Confirm empty fields treated as N/A not zero. Implement CGM sub-score logic (see scoring model above).
5. **CGM rolling average in Coach context** — compute 30-day rolling average glucose from history and inject into Coach context block.
6. **Food quality coaching** — one actionable nudge per day on ingredients to add/reduce (cholesterol, inflammation, micronutrients). Design TBD: daily tip vs weekly pattern view.
7. **Commit BODYCIPHER.md to the GitHub repo** — so Claude Code reads it at the start of every session.

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

## PROCESS REMINDERS

- **Branch only.** Claude Code never pushes to main directly.
- **Review before merge.** Claude Code outputs plain-English change summary. Julie pastes it here. Claude gives go/no-go. Only then does Julie merge.
- **DB first.** SQL migrations always run in Supabase before code changes deploy.
- **No full rewrites.** Targeted edits only. If a full rewrite seems necessary, stop and explain why first.
