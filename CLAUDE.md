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
7. Update BODYCIPHER.md to reflect any changes made — new fields, removed features, backlog updates, decisions taken. Do this before the plain-English summary.

---

## CSS

CSS custom properties only. No hardcoded hex values. No inline style values.

---

## THINGS THAT HAVE GONE WRONG — DO NOT REPEAT

### Full-file rewrites cause regressions
Rewriting a whole component to fix one thing has twice caused features 
to silently revert (supplements defaulting back to "all on", breakfast 
templates reappearing after removal). Targeted edits only. If a full 
rewrite seems genuinely necessary, stop and explain why before proceeding.

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
field is wired all the way through to the UI: types → db/route helpers
→ the relevant API route → the component. Two real precedents:
- April 18: peak_glucose_mmol was missing from the (now-retired) old
  NutritionSection, so saves failed silently.
- April 26: the auth.users FK constraints on the nutrition tables
  rejected every food_items insert because NUTRITION_USER_ID isn't an
  auth row. The fix was an SQL migration to drop the FKs (see
  BODYCIPHER → "FK migration applied April 26, 2026").

### Supabase errors stringify to "[object Object]"
PostgrestError is a plain object ({message, code, details, hint}), not
a JS Error instance. `String(err)` collapses it to "[object Object]"
and you lose the actual reason. In any try/catch around a Supabase
call, walk the fields manually — see app/api/nutrition/food-item/route.ts
`describe()` for the canonical helper.

### framer-motion AnimatePresence with multiple conditional siblings
Using `<AnimatePresence mode="wait">` with several sibling conditionals
({a && <X/>}{b && <Y/>}…) is flaky — the exit/enter handoff can stall
and the incoming screen never mounts. Always render exactly one keyed
child via an IIFE switch (see MealLogger.tsx for the pattern).

### SSH auth only
GitHub authentication must use SSH: git@github.com:jnjulienathan-eng/health-coach.git
HTTPS token auth has failed repeatedly due to invisible characters when 
pasting. Do not attempt HTTPS auth.

---

## FIELDS AND NAMING — GET THESE RIGHT

- zone3_plus_minutes — replaces avg_heart_rate. Do not re-add avg_heart_rate.
- hrv — lives in daily_entries (sleep section). 
  hrv_score in ContextSection was removed. Do not re-add it.
- fasting_glucose_mmol — lives in daily_entries (sleep section).
- sessions — JSONB array in daily_entries. 
  Each item: {activity_type, duration_min, zone3_plus_minutes, active_calories}
- Nutrition is ingredient-level. Six new tables: food_items, meal_logs,
  meal_log_items, daily_nutrition_summary, meal_templates,
  meal_template_items. Access them through lib/nutrition.ts (server-side
  Supabase admin client + day-boundary + summary recompute) and
  lib/usda.ts (nutrient parser). Never call USDA from client-side code —
  go through /api/nutrition/search.
- The old daily_entries.nutrition JSONB columns (pre_workout_snack,
  breakfast, lunch, dinner, incidentals + their macro fields) are legacy.
  Don't read or write them from new code. The new nutrition section
  ignores them; saves still go through them via lib/db.ts but the values
  are blank. Cleanup is gated on backlog item #1.
- Coach **should** read from daily_nutrition_summary but **currently
  still reads daily_entries.nutrition** in app/api/coach/route.ts. This
  is backlog item #1 — until it lands, the coach sees no data for meals
  logged through the new flow. Don't write new code that reads
  daily_entries.nutrition; if you touch the coach, switch it.
- RLS on the six new nutrition tables uses `auth.uid() = user_id`. We
  bypass it server-side with the service-role client in lib/nutrition.ts
  → supaAdmin(). The four legacy tables (daily_entries, training_sessions,
  biomarker_readings, health_appointments) use 'julie' as a text user_id
  with RLS disabled — that's the existing convention there, don't change
  it without an explicit ask.
- New nutrition rows use `user_id = process.env.NUTRITION_USER_ID` (a
  UUID). Never hardcode 'julie' — or the UUID — in any new nutrition
  code or policy. Read it through lib/nutrition.ts → nutritionUserId().
- Required env vars (Vercel, both Production and Preview):
  USDA_API_KEY, SUPABASE_SERVICE_ROLE_KEY, NUTRITION_USER_ID. All
  server-side only. Never reference them in client components.

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
- Never add cyclic supplements (Ashwagandha, Phosphatidylserine) — 
  removed by design.
