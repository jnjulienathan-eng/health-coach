# CLAUDE.md
_Instructions for Claude Code. Read this before touching anything._
_Companion to BODYCIPHER.md — that file covers what the app does. This file covers how to work._

---

## BEFORE YOU START

1. Read BODYCIPHER.md in the project root in full.
2. Read every file you plan to edit before writing a single line.
3. Never assume you know the current state of a file — always read it first.
4. If working on the nutrition section, also read /docs/NUTRITION_DATA_MODEL.md 
   and /docs/NUTRITION_UX_FLOW.md in full before touching anything.

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
After the April 18 DB migration, peak_glucose_mmol was missing from 
NutritionSection.tsx, causing save failures. After any migration, 
verify that all new fields are wired through: types.ts → db.ts → 
the relevant section component.

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
- Nutrition is now ingredient-level. Six new tables: food_items, meal_logs, 
  meal_log_items, daily_nutrition_summary, meal_templates, meal_template_items.
  The old daily_entries.nutrition JSONB fields are legacy — do not add to them.
  Coach reads from daily_nutrition_summary, not daily_entries.nutrition.
  All USDA API calls go through Next.js API routes using process.env.USDA_API_KEY.
  Never call USDA from client-side code.
- RLS on all 10 tables. Policy: auth.uid() = user_id.
  Never hardcode 'julie' as the user_id in any policy or query.

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
