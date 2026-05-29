# BODYCIPHER
_Single source of truth. Read at the start of every Claude Code session. Update at the end of every session._
_Last updated: May 27, 2026 (fix: vaccination card "Dose X of Y complete" label only shown when doses_in_series > 1)_

---

## DEVELOPMENT RULES (mandatory)

1. Read this file fully before touching any code.
2. Never rewrite a file from scratch. Make only targeted, minimal edits.
3. CSS custom properties only — no hardcoded colours or inline style values.
4. Always push to a new branch, never directly to main.
5. After completing all tasks, output a plain-English summary of every file changed and every line edited.
6. Ask before moving to the next task.
7. DB migrations always run in Supabase SQL editor before any code changes deploy. Never run them yourself — flag and wait.
8. Commit and push after every task.
9. Update this file (BODYCIPHER.md) to reflect any changes made — new fields, removed features, architectural changes, backlog updates. Do this before the plain-English summary.

---

## PROJECT

**App:** BodyCipher — decode your body. Personal health coaching web app for Julie.
**Live:** https://health-coach-rho.vercel.app
**Local:** `/Users/julienathan/Documents/Northstar/health-coach`
**GitHub:** `git@github.com:jnjulienathan-eng/health-coach.git` (SSH only — HTTPS has failed repeatedly)
**Stack:** Next.js (App Router) + Supabase (West EU, `cprcamywvhtcboprtkjp.supabase.co`) + Vercel + Anthropic API
**Key files:** `app/api/coach/route.ts`, `lib/db.ts`, `lib/types.ts`, `lib/scores.ts`, `lib/trainingLoad.ts`
**Scripts:** `scripts/generate-icon.mjs` — generates `public/apple-touch-icon.png` (180×180 PNG, dark bg + BodyCipher mark). Run with `node scripts/generate-icon.mjs` from the project root. Requires `sharp`.
**Sections:** `components/sections/` — SleepSection, TrainingSection, NutritionSection, HydrationSection, SupplementsSection, ContextSection
**Other components:** `components/CoachTab.tsx`, `components/DashboardTab.tsx` (not imported, preserved on disk), `components/HistoryTab.tsx` (not imported, preserved on disk), `components/GoalsTab.tsx` (not imported, preserved on disk), `components/SplashScreen.tsx`

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
- Cuisine: Japanese, Korean, Chinese, Thai, Vietnamese, Mediterranean, Middle Eastern, Indian. **Never German/Bavarian.**
- Cycle: currently irregular, recent cycles 54–80+ days

---

## CURRENT STATE — WHAT IS BUILT

### Navigation (4 tabs — restructured April 30, 2026)

| Index | Label | Component | Status |
|---|---|---|---|
| 0 | Today | Daily logging accordions (inline in app/page.tsx) | Live |
| 1 | Health Log | Hero card + appointment list (inline in app/page.tsx) | Live — design Step 5 complete |
| 2 | Coach | `CoachTab` | Live |
| 3 | Dashboard | Inline in app/page.tsx (charts + history list) | Live — design Step 6 complete |

Default active tab: 0 (Today). GoalsTab, DashboardTab, and HistoryTab components preserved on disk but removed from the tab bar and no longer imported in app/page.tsx.

### UI fixes (May 11, 2026 — BUGs 5, 6, 7)

- **BUG 5 — App icon:** `scripts/generate-icon.mjs` background colour updated from `#0a0a0a` to `#0B1120` (dark navy). `public/apple-touch-icon.png` regenerated.
- **BUG 6 — Hero greeting overflow:** `app/page.tsx` greeting `fontSize` changed from `var(--fs-display)` to `clamp(1.6rem, 5vw, 2.4rem)` so it scales down on long messages.
- **BUG 7 — Tab label:** Tab index 1 label changed from "Health Calendar" to "Health Log" in `app/page.tsx`.

### Today Tab (updated May 11, 2026 — UI polish fixes)

**UI fixes (May 11, 2026):**
- Score card bullet items: added `minWidth: 0` to the text span inside each bullet's flex row so long lines (e.g. "Nutrition: 126g protein, 60g fiber") wrap rather than overflow the card.
- Macro progress bar track: colour changed from `--color-primary-light` (light green) to `--color-navy-tint` (`#E8EEF7`, a very light blue tint of dark navy). New token `--color-navy-tint` added to `:root` in `globals.css`.
- Supplements StackAccordion "Taken" label: colour changed from `--color-status-optimal` (green) to `--color-navy` (dark navy). "Not taken" remains `--color-text-muted`.

### Today Tab (updated May 11, 2026 — hero photo added)

**Hero photo (May 11, 2026):**
Full-width hero container replaces the standalone date navigator and greeting. Sits at the very top of the Today tab, above the score cards.
- Height: 320px. Negative margins (`-20px` left/right/top) break out of the main container padding to reach full width.
- Background: random image selected on mount from 10 images in `/public/images/hero/`. Stored in `heroImage` state (useState initializer — runs once, does not change on re-render).
- Images: state-easy-blackforest, state-easy-bovic, state-easy-mushrooms, state-hard-iceland, state-moderate-scotland, state-moderate, state-nodata, state-rest-cat, state-rest-norway, state-rest. `state-easy.jpg` and `state-hard.jpg` deleted (removed from git).
- Gradient overlay: `linear-gradient(to bottom, transparent, rgba(11, 17, 32, 0.75))` — full hero height.
- Date navigator: same logic, restyled white text + white chevrons. `‹/›` disabled state uses `rgba(255,255,255,0.35)`.
- Greeting: same rotating message logic, restyled to `--fs-display` / `--fw-bold` / white, positioned at bottom of hero with `padding: 0 20px 20px`.
- Yesterday sleep banner: moved to below the hero (was between date nav and greeting). Gets `marginTop: 16` inline.
- Score cards: `marginTop: 16` added (was relying on greeting's `marginBottom`).

### Today Tab (updated May 10, 2026 — Long-term Goals cards design-aligned)

**Long-term Goals design pass (May 10, 2026):**
VO2 Max and Cardiovascular Health cards aligned to DESIGN.md tokens:
- VO2 Max status badge: amber filled pill (`--color-amber` bg, `--color-navy` text, `--radius-full`, `--fs-label`, `--fw-bold`, uppercase); removed green outline/arrow style
- VO2 Max spectrum bar: flat grey track (`--color-border`), amber fill from left to current value (`--color-amber`), simple navy vertical tick at target (40); removed gradient fill
- VO2 Max band labels: `--fs-label` (12px), `--color-text-secondary`; removed monospace/hardcoded sizes
- LDL and HDL spectrum bars: same flat grey + amber fill treatment; removed gradient fills
- LDL/HDL active band labels: amber colour + bold weight; inactive bands `--color-text-secondary`
- Log bloodwork button: `btn-primary` class (navy bg, white text, `--radius-lg`, height 52px, full width); was `btn-secondary`
- Overdue warning text: `--color-amber`, `--fs-label`, `--fw-bold`, uppercase; was `--color-danger`

### Today Tab (updated May 10, 2026 — accordion interior restyling complete)

**Accordion open/expanded state — design pass (May 10, 2026):**
All six Today tab accordions restyled to match DESIGN.md tokens:
- Field labels: `--fs-label` (12px), `--fw-bold` (700), `--ls-label-bold` (0.05em), uppercase, `--color-text-secondary`
- All text inputs, number inputs, textareas: `minHeight: 48px`, padding `--space-sm`/`--space-md`, `font-size: --fs-body` (16px), `border-radius: --radius-md`, `1px solid --color-border`
- Field container gap: `--space-md` (16px) throughout
- Save buttons: `btn-primary` class (height 52px, `--color-navy`, `--radius-lg` after globals.css update)
- `components/ui/Section.tsx` now accepts optional `forceClose?: number` prop — when incremented, closes the accordion
- Auto-close after successful save wired into all five save handlers (Sleep, Training, Hydration, Supplements, Context)
- `globals.css`: `btn-primary` border-radius updated from `--radius-md` to `--radius-lg`; toggle checked colour updated from `--color-navy` to `--color-amber` (per DESIGN.md Toggle Row spec)
- Supplement `StackAccordion`: redesigned to match DESIGN.md Toggle Row spec — supplement name `--fs-body`, dose `--fs-label-sm` below name, `--color-border-subtle` dividers, min-height 56px per row, amber toggle when checked
- `HormoneCard`: border highlights amber when taken (was primary-colour), background is always `--color-surface` (removed primary-light tint)
- NutritionSection: no save handler — no auto-close; macro summary card background changed from `--color-bg` to `--color-surface`

---

### Today Tab (updated April 30, 2026)

**Structure (top to bottom):**
1. **Hero container** (320px, full-width) — random background photo + gradient overlay + date navigator (white) + greeting (white, `--fs-display`, bottom of hero)
2. Yesterday sleep banner (conditional, below hero)
3. **Score cards row** — Behavior Score, Outcome Score, Training Load (detailed versions with bullet points; copied from DashboardTab; data fetched via `GET /api/scores` + `loadRecentEntries(30)`)
5. Daily logging accordions (Sleep, Training, Nutrition, Hydration, Supplements, Context) — unchanged
6. **Long-term Goals section** — VO2 Max (spectrum bar + sparkline), Cardiovascular Health (LDL/HDL spectrums + ratio trend), Glucose Stability (7-day fasting avg + HbA1c); copied from GoalsTab
7. Saved confirmation toast

All new state, effects, and handlers for the above sections live in `app/page.tsx` (`App` component). GoalsTab.tsx and DashboardTab.tsx are unchanged — copy only.

**Sleep section**
- Fields: duration (min), HRV (ms), RHR (bpm), bedtime, rested score (1–5), nap duration (min), fasting glucose (mmol/L, optional)
- All fields save to `daily_entries`

**Training section**
- Multiple sessions per day. Per session: activity type, duration (min), zone3+ minutes, active calories.
- Sessions stored in the `training_sessions` table (separate normalised table — NOT JSONB in daily_entries).
- Zone3+ intensity: 0–5 min = Easy, 6–15 = Moderate, 16+ = Hard
- Quick-add buttons: Swim, eGym, Run, Walk, Cycling. Cycling is a regular session type (for no-watch days) — no longer a separate transport toggle.
- "Cycled today (transport)" UI removed. `cycled_today`, `cycling_minutes`, `cycling_calories` columns remain in `daily_entries` and `TrainingData` for historical data compatibility — do not read or write from new code.
- Session cards show `start_time` as local "HH:MM" when present (populated by /api/health-import).
- Activity icons standardised across TrainingSection and HistoryTab (see ACTIVITY ICONS below).
- `avg_heart_rate` is permanently removed. Do not re-add.

**Nutrition section**
- Full ingredient-level food logging. Built and live on main.
- Eight Supabase tables: food_items, meal_logs, meal_log_items, daily_nutrition_summary, meal_templates, meal_template_items, recipes, recipe_ingredients.
- Five-screen logging flow: bottom sheet → search → weight entry → building meal → save confirmation.
- USDA FoodData Central integration (server-side only, cached to food_items on first use).
- Open Food Facts barcode scanning via html5-qrcode.
- Recipe builder: cooked and raw/assembled modes. Draft state for cooked recipes awaiting cooked weight.
- Photo estimation: Anthropic Vision, macros stored as top-level fields on meal_logs (logged_via = 'photo_estimate').
- My Library: recipes only. Templates tables and API routes preserved in DB, not surfaced in UI. Do not re-add templates to UI.
- Macro summary bar: consumed vs target for all 5 macros. Read from daily_nutrition_summary.
- Peak glucose: inline editable field on each meal card. PATCH /api/nutrition/meal. Not on any logging screen.
- Macro override: pencil icon on local library results. PATCH /api/nutrition/food-item.
- daily_nutrition_summary upserted after every meal save/edit/delete. Coach and Dashboard read from this.
- **Photo estimate meals are included in the summary:** `recomputeDailySummary` sums ingredient-based macros from `meal_log_items` then adds top-level macro fields (`calories`, `protein_g`, etc.) from `meal_logs` where `logged_via = 'photo_estimate'`. Both paths confirmed correct.
- **Nutrition accordion checkmark logic (updated April 28, 2026):** Green checkmark = protein ≥ 130g AND fiber ≥ 30g (both primary targets hit). Amber circle = meals logged but targets not fully met. No indicator = nothing logged. Reads from `daily_nutrition_summary` via the existing `day.summary` fetch. Implemented via `isPartial` prop on `components/ui/Section.tsx`.
- **Voice dictation on description field (Session F, May 10, 2026):** Mic icon button added to the Description label row in `ScreenPhotoEstimate`. Uses Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`). Tapping starts recognition; result appended to existing description text. Tapping again stops an active session. Button is hidden entirely if the browser does not support speech recognition. Recognizing state shown via amber icon colour. Implemented in `components/nutrition/MealLogger.tsx`.
- **Photo library picker (Session F, May 10, 2026):** `ImagePlus` button added alongside the existing camera button in `ScreenPhotoEstimate`. Camera button (`capture="environment"`) unchanged. Library button triggers a separate hidden `<input type="file" accept="image/*">` (no `capture` attribute) — opens the photo gallery on iOS, file picker on desktop. Both inputs share the same `imageFile` state and `setImageFile` handler. `lucide-react` package added as a dependency.
- **ScreenPhotoEstimate unified composer redesign (May 17, 2026):** The two separate Photo and Description sections replaced with a single composer card (`--color-surface`, `--radius-lg`, `--shadow-card`, `--space-md` padding). Card structure top-to-bottom: (1) photo thumbnail (max 180px, `object-fit: cover`, `--radius-md`, absolute-positioned × button to clear) — only rendered when `imageFile` is set; (2) auto-expanding textarea (rows 3 min, right-padding 44px) with mic button pinned inside bottom-right corner (same speech recognition logic); (3) toolbar row (1px `--color-border` top border) with camera icon label (44px, `capture="environment"` hidden input inside) and library icon button (44px, triggers `galleryInputRef`). No section labels. All state, handlers, hidden inputs, and the Estimate macros button are unchanged.
- **"Estimate with Claude" ingredient mode (May 17, 2026):** `ScreenSearch` (the "Add ingredient" screen reached via "+ Add another" from Building meal) now shows an "Estimate with Claude" `btn-secondary` button alongside "Create a recipe" and "Browse Library" when `context === 'meal'`. Tapping it sets `photoEstimateAsIngredient = true` and navigates to `photoEstimate` screen. `ScreenPhotoEstimate` gained two props: `ingredientMode?: boolean` and `onAddIngredient?: (item: BuildingItem) => void`. In ingredient mode, after the estimate API returns, an inline results step is shown (macro card with "Claude estimate · confidence" badge, "Per serving (100g)" breakdown) instead of navigating to ScreenConfirm. The "Add to meal" button POSTs to `/api/nutrition/food-item` with `source: 'ai_estimate'` and the estimated macros as `nutrients_per_100g`, then calls `onAddIngredient({ food_item, weight_grams: 100 })` which appends the item to `items[]` in the main component and navigates to `building`. Back on the results step clears `ingredientEstimate` and returns to the input step. Back on the input step returns to `search`. `/api/nutrition/food-item` POST route updated: `'ai_estimate'` added to the source type annotation and validation allowlist. `FoodItem.source` type updated in `MealLogger.tsx` (both the interface and `EditingMealProp` inline shape). `food_items.source` allowlist in BODYCIPHER.md: add `'ai_estimate'`. No weight entry screen for AI-estimated items — 100g weight is assumed and the math is correct (macros = nutrients_per_100g × 100 / 100).
- **Bug fix (May 18, 2026) — ai_estimate deduplication:** POST /api/nutrition/food-item was deduplicating `ai_estimate` items by name, returning a cached row with stale macros when the name matched a prior estimate (default name 'Estimated item' triggered this on every second photo-only estimate with no description). The review screen showed fresh `ingredientEstimate` values but `j.food_item` had the old nutrients, so the building screen and saved meal had wrong fiber and carbs. Fix: `ai_estimate` items skip the name-based lookup and always insert a fresh row. One-line change in `app/api/nutrition/food-item/route.ts`.
- Legacy daily_entries.nutrition JSONB fields are dead — do not read or write from any new code.

**Hydration section**
- Logs ml per day. Passes through to Coach context.

**Supplements section**
- Hormones: Progesterone (mg, toggle), Estradiol (sprays, toggle)
- Morning stack (accordion, default collapsed): Creatine 5g, Vitamin D3+K2, Zinc+Selenium, Glucosamine, Omega-3, Berberine, DIM
- Evening stack (accordion, default collapsed): Magnesium glycinate 200mg, L-Theanine
- **DEFAULT STATE: everything OFF.** User must actively confirm.
- NO cyclic supplements. Ashwagandha and Phosphatidylserine removed entirely. Do not re-add.

**Context section**
- Fields: cycle day (auto-counter with manual reset), symptoms (multi-select), travelling toggle, notes
- `hrv_score` field: REMOVED from ContextSection.tsx. Do not re-add.

---

### Coach Tab

- 5 time-based modes detected client-side from time of day:
  - wakeup: before 09:00
  - posttraining: 09:00–12:00
  - afternoon: 12:00–17:00
  - earlyevening: 17:00–20:00
  - endofday: 20:00+
- Returns JSON: {recovery, training, nutrition, insight, question}. Null fields hidden.
- Reactive chat below briefing cards.
- Model: claude-sonnet-4-20250514 · max_tokens 2000
- Coach reads from daily_nutrition_summary (service-role client). Legacy daily_entries.nutrition JSONB is not read.
- Training sessions loaded via loadSessionsForDates() in getCoachContext so today's sessions are visible to the coach.
- earlyevening mode populates recovery and training fields and uses "this evening" language.

---

### Dashboard (updated May 10, 2026 — design Step 6 complete — inlined in app/page.tsx)

**Score cards row removed** from Dashboard tab (April 30, 2026). Score cards remain on Today tab only.

- No score cards in Dashboard tab.
- 30-day trend charts: HRV, Sleep duration, Protein, Fiber, Training minutes.
- **Training Load expandable card (design Step 6):** Primary Insight Card shell — `--color-navy` background, `--radius-lg`, `--space-lg` padding, `--shadow-card`.
  - Collapsed: status label (18px/600/white) on left, zone-coloured 10px dot + ChevronDown SVG (18px, white 70%, rotates 180° on expand) on right. Zone colour computed via `zoneDisplayColor(ratio)` using design spec thresholds (not `tlResult.colour`).
  - Expanded: white 15% opacity divider, two sub-metric boxes (ACUTE TSU / CHRONIC TSU, white 8% bg), CSS linear-gradient ratio bar (0–0.6 amber / 0.6–0.8 #6DBF8A / 0.8–1.3 status-optimal / 1.3–1.5 amber / 1.5+ status-low), 3px×20px tick marker at current ratio, scale labels (0.6/0.8/1.3/1.5), ratio value (40px/800), 30-day trend SVG (amber line, white 8% optimal band). If fewer than 2 data points: "Not enough data yet" label.
  - Tapping the Training Load score card on the Today tab navigates to Dashboard and opens this card expanded via `trainingLoadExpanded` state. Manual toggle on the Dashboard card clears `trainingLoadExpanded` and resumes normal toggle behaviour.
- **Charts (design Step 6 + targeted fixes May 10, 2026):** HRV, Sleep, Protein, Fiber, Training minutes all use inline SVGs (no Recharts). Recharts dependency fully removed from Dashboard. ChartCard: `--shadow-card`, title 18px/700/`--color-text-primary`.
  - HRV line chart (160px SVG): navy polyline, amber dots above baseline / navy dots below, amber dashed baseline at 88ms, "baseline 88ms" label fixed at upper-right corner of SVG (y = SVG_PAD_T + 12, textAnchor end), horizontal grid lines, y-axis labels.
  - Sleep/Protein/Fiber/Training minutes bar charts (120px SVG, `BarChart2T`): two-tone bars (navy below target, amber above target), amber dashed target line. No right-side target text label on any chart.
  - Targets: Sleep 7.5h, Protein 130g, Fiber 30g, Training 60min.
- **Training Load collapsed state (May 10, 2026):** Left column shows "TRAINING LOAD" label (12px/700/0.05em/uppercase/amber) above status text (18px/600/white). Color dot + chevron remain on right.
- **30-day trend label (May 10, 2026):** "30-DAY TREND" heading (12px/700/0.05em/uppercase/white 60% opacity) added immediately above the 30-day trend SVG in expanded state.
- **History section appended below charts** (April 30, 2026): chronological entry list with expandable detail rows and "Edit this day →" link (navigates to Today tab for that date). Uses `loadAllEntries()` fetched once on mount via dedicated state (`historyEntries`, `historyLoading`, `historyError`).
- **History rows (design Step 6 + targeted fixes May 10, 2026):** HISTORY section label (14px/700/uppercase/letter-spacing 0.05em). Each row: `--shadow-card`, min-height 72px, date (24px/700), emojis (16px), BEHAV/OUTC columns. Chevron: ChevronDown SVG (not ChevronRight), hidden when row is expanded.
- Data source: `dashEntries` (already loaded by the Today tab's `loadRecentEntries(30)` effect) reused for HRV/sleep/training chart computation. `loadAllEntries()` added separately for the history list.
- **Protein and Fiber charts (updated May 1, 2026):** Read from `daily_nutrition_summary` via `GET /api/nutrition/chart?days=31` (service-role admin client, bypasses RLS). Stored in `nutritionSummaries` state as a `Record<string, { protein, fiber }>` keyed by plain YYYY-MM-DD strings using `.slice(0, 10)`. Chart arrays are built from an **independent 30-consecutive-date range** (`nutritionChart30`) ending at `currentDate`, not from `dashEntries`/`chart30` — so bars show even on dates where `daily_entries` has no row. Date generation uses `Date.UTC` arithmetic + `.toISOString().slice(0, 10)` with no local-timezone shift; map lookup is a direct string key comparison. Legacy `daily_entries.total_protein` / `total_fiber` columns are no longer read by the charts.
- DashboardTab.tsx no longer imported — content fully inlined in app/page.tsx. Component preserved on disk.

---

### Goals Tab (BodyCipher Tab) — NOT IN NAV (removed April 30, 2026)

**Hero section**
- Static rotating greeting. Client-side only — no API call. Picks randomly from a time-banded array (wakeup/midmorning/afternoon/earlyevening/endofday) matching the Coach tab's mode logic. Initialized once per session via `useState(() => getGreeting())`. API route `/api/goals/greeting` deleted.
- Three score cards in single row: Behavior, Outcome, Training Load — equal width, equal height, top-aligned. All tap → Dashboard.

**Long-term goals section**
Three collapsible cards:

- **VO2 Max** — spectrum bar (Poor <23 / Fair 23–27 / Good 28–32 / Excellent 33–36 / Superior 37+). Current value marker. Target at 40. Inline entry form. Reads from biomarker_readings (marker = 'vo2_max'). **Display value is a 30-day rolling average** (`getVo2Rolling30DayAvg()` in lib/db.ts), formatted to 1 decimal place via `parseFloat(avg.toFixed(1))`. Single latest reading is still used to pre-fill the manual entry form. **Sparkline** (`getVo2SparklineData()` in lib/db.ts): fetches up to 90 most-recent readings ordered descending, then reverses to chronological order for the SVG. (Bug fix May 11 2026: was ordered ascending .limit(6), silently cutting off all readings after the 6th oldest.) Date labels use decimation: `step = Math.ceil(points.length / 5)`, labels rendered at `i % step === 0` plus always the last index — keeps ~5–6 visible labels regardless of dataset size. Target tick label rendered at SVG y=44 (below the tick, 8px gap after tick end at y=36); spectrum bar SVG viewBox height extended from 38 to 50 to accommodate it. Date labels on sparkline split into two stacked `<text>` elements: month at y=63, day number at y=73 — halves horizontal label width to eliminate overlap.
- **Cardiovascular health** — LDL:HDL ratio headline, spectrum bars, sparkline. Manual entry bottom sheet. Reads from biomarker_readings.
- **Glucose stability** — Collapsed state: built and live. 🔍 CHECK: 7-day rolling fasting glucose average from daily_entries. CGM toggle. **Expanded state: designed but NOT YET BUILT.**

Glucose stability expanded state design (not yet built):
- Fasting glucose spectrum bar: Low <4.0 / Optimal 4.0–5.4 / Good 5.5–6.0 / Watch 6.0+. Marker at 7-day rolling average.
- HbA1c row: current value, status label, target <5.7%. "Log HbA1c" button → writes to biomarker_readings.
- CGM toggle: when off, card greys out with note "Enable CGM to track glucose."
- Build: targeted edit to GoalsTab.tsx only. No new API routes. No DB migrations.

**Health calendar section (design Step 5 complete — May 10, 2026; vaccinations section added — May 11, 2026)**
- **Hero card** at top of tab: navy card (`--color-navy`) with circular amber ring (80×80px SVG, 3px stroke, 70% opacity), type-specific icon (inline SVG, lucide-style, 28px), "UPCOMING EVENT" label, appointment name (24px, white), date (16px, 70% white), and amber days-remaining pill. Surfaces the single nearest appointment where `next_due_date` is not null. Days remaining computed in Europe/Berlin local date. Fallback: "All appointments up to date." on a navy card.
- **Appointment rows — State A (next_due_date not null):** `--color-surface` bg, 1px `--color-border` border, `--radius-lg`, `--shadow-card`, min-height 72px. Name (18px bold, `--color-text-primary`) on left with "Last done: DD Mon YYYY" below; due date (12px amber, nowrap) + ChevronDown (18px, muted) stacked on right.
- **Appointment rows — State B (next_due_date null):** Same card style, min-height 56px, single line: name (18px bold, navy) left + "Not scheduled" (16px muted) right. No chevron.
- **Expanded state:** 4px amber left border, 20px all-side padding. Field labels (14px, 700, uppercase, letter-spacing 0.05em). NEXT DUE sub-label "(Auto-computed, overridable)" at 12px muted. Inputs: 16px, 1px border, `--radius-md`, full width. Textarea: 3 rows, resize vertical. MARK AS DONE TODAY: full-width, navy, white, `--radius-full`, 52px. SAVE/CANCEL: equal flex, 44px, `--radius-full`.
- 9 default appointments seeded. Sorted by next_due_date ascending, nulls last.
- Dimming: appointments with interval_months > 6 are dimmed unless next_due_date is within 4 months or last_completed_date is null.
- Save/mark-done logic unchanged — visual restyling only.

---

### History Tab — NOT IN NAV (removed April 30, 2026)

- Chronological entries, expandable, color-coded scores. Component preserved on disk.
- History content is now inlined at the bottom of the Dashboard tab in app/page.tsx. HistoryTab.tsx is the source but is not imported.

---

## NUTRITION — DATA MODEL & LOCKED DECISIONS

### Design principles

- Ingredient-by-weight only. Everything is grams. No servings, no ml, no other units.
- Macro totals never stored at ingredient level — always computed as `nutrients_per_100g × weight_grams / 100` at read time.
- daily_nutrition_summary is the source of truth for Coach and Dashboard. Upserted after every meal save/edit/delete.
- No fixed meal slots. Free-form, ordered by logged_at.
- Meal names auto-generated if blank: before 11:00 = "Morning meal", 11:00–15:00 = "Afternoon meal", 15:00–19:00 = "Evening meal", after 19:00 = "Night meal".
- Day boundary: 05:00 Europe/Berlin.
- USDA calls server-side only via /api/nutrition/search. Cached permanently in food_items on first use. Results returned as-is — no deduplication.
- Five macros everywhere: calories, protein, carbs, fat, fiber. That order. Never four.
- No micronutrient UI in phase 1. Data preserved in nutrients_per_100g JSONB for future use.
- Clean break from legacy daily_entries.nutrition JSONB. Historical data not migrated. New data in new tables only.

### Tables

**`food_items`** — ingredient library.
- id (uuid PK), user_id (text), fdc_id (text, nullable), name (text), nutrients_per_100g (jsonb), source (text), use_count (int), created_at
- source allowlist: 'usda' | 'openfoodfacts' | 'recipe' | 'recipe_deleted' | 'custom' | 'ai_estimate'
- Macro overrides applied via PATCH /api/nutrition/food-item — merges into nutrients_per_100g, preserving raw USDA array.

**`meal_logs`** — one row per meal occasion.
- id, user_id, logged_at (timestamptz), name (text), logged_via (text), peak_glucose_mmol (numeric, nullable), notes (text, nullable)
- Top-level macro fields (calories, protein_g, carbs_g, fat_g, fiber_g): **nullable, only populated when logged_via = 'photo_estimate'**. Do not populate for ingredient-based or barcode meals.
- logged_via values: 'ingredients' | 'barcode' | 'photo_estimate' | 'manual_macros'

**`meal_log_items`** — one row per ingredient per meal. Not created for photo-estimated meals.
- id, meal_log_id (FK → meal_logs), food_item_id (FK → food_items), weight_grams (numeric)

**`daily_nutrition_summary`** — denormalized daily totals. Coach and Dashboard read from here.
- id, user_id, date (date), calories, protein, carbs, fat, fiber (all numeric), meal_count (int), logged_via_summary (jsonb, e.g. {ingredients: 2, photo_estimate: 1}), updated_at
- logged_via_summary used by Coach to calibrate confidence in nutrition advice.

**`meal_templates`** and **`meal_template_items`** — preserved in DB and API routes. Not surfaced in UI. Do not re-add to UI.

**`recipes`** — batch recipe definitions.
- id, user_id, name, total_servings (int), total_cooked_grams (numeric, nullable), default_serving_grams (numeric, nullable), is_raw (boolean DEFAULT false), food_item_id (FK → food_items, null when draft), status ('draft'|'active'), created_at, updated_at

**`recipe_ingredients`** — raw batch ingredient weights.
- id, recipe_id (FK CASCADE), food_item_id (FK RESTRICT), weight_grams (numeric > 0)

**RLS:** All eight tables have RLS enabled. Nutrition API routes use service-role key (bypasses RLS server-side). The four user_id FK constraints to auth.users were dropped April 26 — NUTRITION_USER_ID is not an auth row.

### Required environment variables (Vercel — both Production and Preview)

- `USDA_API_KEY` — server-side only
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only
- `NUTRITION_USER_ID` — UUID for all nutrition rows, read via `nutritionUserId()` in lib/nutrition.ts
- `ANTHROPIC_API_KEY` — used by /api/nutrition/estimate and /api/goals/greeting, server-side only
- `HEALTH_IMPORT_SECRET` — API key checked against `x-api-key` header on /api/health-import. Server-side only.
- `VAPID_PUBLIC_KEY` — server-side only. Used by web-push when sending notifications in Sessions 2–3.
- `VAPID_PRIVATE_KEY` — server-side only. Paired with VAPID_PUBLIC_KEY. Never expose client-side.
- `VAPID_EMAIL` — server-side only. Contact email passed to web-push setVapidDetails.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — client-side. Same value as VAPID_PUBLIC_KEY. Read by SwRegister.tsx when calling pushManager.subscribe().

### Recipe builder — locked decisions

A recipe IS a food item. Once active, appears in ingredient search and is logged by weight.

**Two modes:**
- **Cooked (is_raw = false, default):** requires total_cooked_grams before activation. Divisor = total_cooked_grams.
- **Raw/assembled (is_raw = true):** activates as soon as ingredients are present. Divisor = sum of raw ingredient weights. total_cooked_grams stays null.

**Macro computation:** sum(nutrients_per_100g × weight_grams / 100) for all ingredients → divide by divisor → multiply by 100 → store in food_items.nutrients_per_100g.

**Deleted recipes:** food_items source set to 'recipe_deleted'. Row never hard-deleted (preserves historical logs).

### daily_nutrition_summary upsert logic

After every meal_log save, edit, or delete:
1. Compute date from logged_at using 05:00 Berlin boundary
2. Sum nutrients_per_100g × weight_grams / 100 from meal_log_items joined to food_items for that user/date
3. Add top-level macro fields from meal_logs where logged_via = 'photo_estimate' for that date
4. Count distinct meal_log_ids for meal_count
5. Build logged_via_summary JSONB
6. Upsert into daily_nutrition_summary. Delete row if no meals remain.

### API routes

| Route | Method | Purpose |
|---|---|---|
| /api/nutrition/search | GET ?q= | Local food_items first (by use_count) + USDA. No deduplication. |
| /api/nutrition/food-item | POST | Idempotent upsert (first use of USDA/OFF item) |
| /api/nutrition/food-item | PATCH | Macro override — merges into nutrients_per_100g |
| /api/nutrition/meal | POST | Create meal_log + items. Bumps use_count. Upserts summary. |
| /api/nutrition/meal | PUT | Replace items wholesale. Re-upserts summary. |
| /api/nutrition/meal | PATCH | Update peak_glucose_mmol only. No summary recompute. |
| /api/nutrition/meal | DELETE | Delete meal_log (cascades). Re-upserts summary. |
| /api/nutrition/day | GET ?date= | Meals + items + food_items joined + peak_glucose + summary row. 05:00 boundary. |
| /api/nutrition/recipe | GET/POST/PUT/DELETE | Recipe CRUD. Handles cooked and raw modes. Creates/updates food_items entry. |
| /api/nutrition/estimate | POST | Anthropic Vision. image base64 + description → JSON macros + confidence. No DB write. |
| /api/nutrition/barcode | GET ?code= | Open Food Facts lookup. Null on not-found or sparse data. |
| /api/nutrition/templates | GET/POST/PUT/DELETE | Data preserved. UI hidden. Do not surface to user. |
| /api/nutrition/recipe/quick-import | POST | Create a macro-only recipe from per-serving macro values. Auth placeholder (x-mcp-secret / MCP_SECRET) to be added in a subsequent session. Requires `ALTER TABLE recipes ADD COLUMN IF NOT EXISTS ingredients_text text` migration. |

**ingredients_text display (added May 18, 2026):** `ingredients_text` (nullable text column on `recipes`) is now surfaced in the Library UI. GET /api/nutrition/recipe select includes `ingredients_text`. In the recipe card (list view): a single-line truncated preview renders below the macros row when `ingredients_text` is present and the recipe is not a draft. A chevron button (▼) at the card's right edge toggles an expanded detail section showing the full `ingredients_text` under an "Ingredients" label (`pre-wrap`, `--color-text-secondary`). Chevron rotates 180° when expanded. Only rendered when `ingredients_text` is non-null. In the recipe detail view (`ScreenRecipeBuilder`, opened via Edit): `ingredients_text` is threaded into `RecipeBuilderState` via `startEditRecipe` and rendered as a read-only `pre-wrap` block under a "INGREDIENTS" `FieldLabel`, above the save error and footer macros. Only rendered when non-null. Not editable — managed via the quick-import MCP route.

### Logging flow (built — do not redesign)

Screen 1 (bottom sheet): Add ingredients / Browse Library / Create a recipe / Estimate from photo or description
Screen 2: Search (ghost text autocomplete + USDA). Pencil icon on local results for macro override. Scan icon for barcode.
Screen 3: Weight entry. Live macro preview. Serving shortcut chip if available.
Screen 4: Building meal. Running ingredient list. Running macro total bar. Save meal.
Screen 5: Save confirmation. Meal name (editable), time, macros, notes. Confirm writes to DB.

Peak glucose: inline on meal card in day view. PATCH /api/nutrition/meal. Never on logging screens.

---

## TRAINING LOAD

### Computation (lib/trainingLoad.ts — pure module, no Supabase calls)

**Training Stress Unit (TSU) per session:**
`TSU = (duration_min × 0.5) + (zone3_plus_minutes × 2.0)`

For multiple sessions in a day: sum all TSUs. Rest days = 0.

**EWMA:**
- Acute (7-day): `acute_today = TSU_today + (1 - 1/7) × acute_yesterday`
- Chronic (28-day): `chronic_today = TSU_today + (1 - 1/28) × chronic_yesterday`
- Seed both at 0 if no prior data.

**Ratio:** acute / chronic. If chronic = 0, ratio = null. Show "Establishing baseline" until 28 days of data exist.

**Status bands:**
| Ratio | Status | Colour |
|---|---|---|
| < 0.6 | Undertraining | amber |
| 0.6–0.8 | Easy week | light green (#6DBF8A) |
| 0.8–1.3 | Building well | green |
| 1.3–1.5 | Pushing hard | amber |
| > 1.5 | Overreach risk | red |
| null | Establishing baseline | gray |

**Exported functions:**
- `computeDailyTSU(sessions: TrainingSession[]): number`
- `computeTrainingLoad(entries: DailyEntry[]): { acute, chronic, ratio, status, colour }`
- `computeTrainingLoadHistory(entries: DailyEntry[]): Array<{ date, ratio, status, colour }>`

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

**Critical rule:** Empty or missing fields = N/A, not zero. Weight redistributes to other components. Never penalise for unlogged optional data.

**Nutrition component source (updated April 28, 2026):** Behavior Score now reads nutrition from `daily_nutrition_summary` (not the legacy `daily_entries.nutrition` JSONB). A day counts as nutrition-logged if `meal_count > 0`. Score is recomputed server-side via `lib/scores-server.ts → recomputeScores(date)` which is called after every meal operation (POST/PUT/DELETE to `/api/nutrition/meal`) and after every `saveEntry()` save (fires `/api/scores` in the background). Key files: `lib/scores.ts` (`behaviorScore()` accepts optional `NutritionSummaryForScore`), `lib/scores-server.ts` (server-only recompute helper), `app/api/scores/route.ts` (POST endpoint).

**HRV training logic:**
- HRV >100 → hard (zone3+ ≥16 min or 2 sessions) = full | moderate = partial | easy/rest = low
- HRV 80–100 → moderate = full | easy/rest = partial (not penalised) | hard = partial penalty
- HRV 60–80 → easy = full | moderate/hard = penalty
- HRV <60 → rest = full | any training = penalty
- HRV missing → redistributes, no penalty
- Going easier than HRV recommends is **NEVER penalised.**

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
- Neither logged: CGM weight = 0%, redistributes to other components
- Missing meal peaks **never penalised**

---

## DATA MODEL (Supabase)

### `daily_entries`

Sleep: sleep_duration_min, hrv, rhr, bedtime, rested, nap_minutes, fasting_glucose_mmol
Training: cycled_today, cycling_minutes, cycling_calories (cycling transport only — training sessions in separate table), **active_calories** (integer, nullable — written by /api/health-import from Health Auto Export active_energy metric; migration: `ALTER TABLE daily_entries ADD COLUMN IF NOT EXISTS active_calories integer`), **basal_calories** (integer, nullable — written by /api/health-import from Health Auto Export basal_energy_burned metric; migration: `ALTER TABLE daily_entries ADD COLUMN IF NOT EXISTS basal_calories integer`)
**Health Auto Export → daily_entries mapping (as of May 29, 2026):**
- `resting_heart_rate` → `rhr` (integer, bpm)
- `sleep_analysis` → `sleep_duration_min` (integer, minutes) and `bedtime` (HH:MM string). HAE sends aggregated format — `totalSleep` is decimal hours (multiply × 60, round to integer); `inBedStart` is the sleep onset datetime ("YYYY-MM-DD HH:MM:SS +offset"), HH:MM portion extracted as bedtime. Both fields use COALESCE — only written if DB value is currently null (manual entry wins). Updated May 4, 2026.
- `active_energy` → `active_calories` (integer, kcal; converts kJ if needed)
- `basal_energy_burned` → `basal_calories` (integer, kcal; converts kJ if needed)
All four fields use COALESCE — only written if the DB value is currently null (manual entries always win).

**Health Auto Export → biomarker_readings mapping (as of May 4, 2026):**
- `vo2_max` → `biomarker_readings` with marker = `'vo2_max'`, unit = `'ml/kg/min'`. Inserted only if no existing row for that user_id + marker + recorded_on (23505 unique-violation = skip). No overwrite of existing values.
Nutrition columns: **LEGACY — do not read or write from new code**
Hydration: hydration_ml
Supplements: morning_stack_taken, morning_exceptions, evening_stack_taken, evening_exceptions, progesterone_taken, progesterone_mg, estradiol_taken, estradiol_sprays
Context: cycle_day, symptoms, travelling, notes
Scores: behavior_score, outcome_score

### `training_sessions` (separate normalised table — NOT JSONB in daily_entries)

Confirmed columns (verified April 28, 2026):
- id (uuid), user_id (text), date (date), created_at (timestamptz)
- activity_type (text), duration_min (integer), zone3_plus_minutes (integer)
- active_calories (integer), notes (text)
- avg_heart_rate (integer) — **column exists in DB but is unused. Do not read or write. Do not remove from DB (would require migration). Do not re-add to UI or types.**
- **source** (text, nullable) — set to 'health_auto_export' by /api/health-import. Mapped in `loadSessionsForDates`, included in `saveEntry` reinsert — survives the delete-reinsert save cycle. Migration: `ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS source text;`
- **start_time** (timestamptz, nullable) — populated from workout `start` field by /api/health-import. Displayed on session cards as local HH:MM. Mapped in `loadSessionsForDates`, included in `saveEntry` reinsert — survives the delete-reinsert save cycle.
- **external_id** (text, nullable) — Apple Health workout UUID. Sole duplicate-detection key used by /api/health-import. Mapped in `loadSessionsForDates`, included in `saveEntry` reinsert — survives the delete-reinsert save cycle. Requires column in DB: `ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS external_id text;`

### Activity icons (canonical mapping)

Used consistently in `TrainingSection.tsx` and `HistoryTab.tsx`:
Run / Outdoor Run / Indoor Run → 🏃 | Walk / Outdoor Walk / Indoor Walk → 🚶 | Cycling / Outdoor Cycling / Indoor Cycling → 🚴 | Swim → 🏊 | Strength / eGym → 🏋️ | Rowing → 🚣 | Elliptical → 〇 | Yoga / Pilates → 🧘 | Hiking → 🥾 | HIIT → ⚡ | anything else → 🏅

Sessions joined at read time via `loadSessionsForDates()` in lib/db.ts.

### `health_appointments`

- id (uuid PK), user_id (text DEFAULT 'julie'), appointment_type (text), interval_months (int, **nullable** — NOT NULL constraint dropped), last_completed_date (**text** — stores datetime-local strings directly, not date/timestamptz), next_due_date (**text** — same), notes (text), created_at, updated_at
- **New columns (migration applied before feature/vaccinations):** `category text` ('appointment' | 'vaccination'), `doses_in_series integer` (nullable), `doses_received integer` (nullable)
- **Date columns are text type** — avoids timezone truncation. Stores datetime-local strings directly.
- RLS disabled.
- 9 default appointment rows seeded on first load: dermatologist (6mo), dentist (6mo), gynaecologist (12mo), full_bloodwork (12mo), breast_scan (12mo), thyroid_scan (12mo), eye_optometrist (12mo), bone_density_scan (24mo), colonoscopy (120mo).
- 7 vaccination rows seeded (category = 'vaccination'): fsme, shingrix, flu, covid_booster, hepatitis_b, tetanus, typhoid.
- **Vaccination status logic (rendered in Health Calendar tab):** Seasonal suppression for flu/covid_booster in months Apr–Sep (shows "Next: Oct [year]"). Then: Overdue / Upcoming ≤42 days / Future scheduled / Protected (single-dose + last_completed + projected future) / Not scheduled fallback.
- **Dose progress label:** "Dose X of Y complete" sub-label on the vaccination card is only rendered when `doses_in_series > 1`. Null or 1 → label absent entirely. (Fix applied May 27, 2026.)
- **Health Calendar rendering:** All vaccination rows are split from appointment rows client-side using `category === 'vaccination'`. Vaccinations appear in a separate VACCINATIONS section below the appointments list. The hero card surfaces whichever item across both appointments and vaccinations has the nearest `next_due_date`; vaccination hero items render their name via VACC_LABELS, a Syringe icon, and their badge label via vaccinationStatus().

### `biomarker_readings`

- user_id, marker (text), value (numeric), unit (text), recorded_on (date)
- markers in use: 'vo2_max', 'ldl', 'hdl', 'hba1c'

### `push_subscriptions`

Stores Web Push device subscriptions for server-initiated notifications.
- id (uuid PK), user_id (text NOT NULL DEFAULT 'julie'), endpoint (text UNIQUE NOT NULL), p256dh (text NOT NULL), auth (text NOT NULL), created_at (timestamptz DEFAULT now())
- One row per device. Upserted on `endpoint` — re-subscribing from the same device updates the row rather than creating a duplicate.
- Written by `POST /api/notifications/subscribe` (service-role client, no RLS).
- **DB migration required before testing (run in Supabase SQL editor):**
  ```sql
  CREATE TABLE push_subscriptions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id text NOT NULL DEFAULT 'julie',
    endpoint text UNIQUE NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamptz DEFAULT now()
  );
  ```

### `user_profiles`

Preferences, macro targets.

### `cycle_tracker`

Cycle day tracking.

### Nutrition tables

See Nutrition section above. Eight tables: food_items, meal_logs, meal_log_items, daily_nutrition_summary, meal_templates, meal_template_items, recipes, recipe_ingredients.

### RLS

- Nutrition tables: user_id = auth.uid() (bypassed server-side via service role)
- Legacy tables (daily_entries, etc.): user_id = 'julie' (text), RLS disabled — do not change

---

## BACKLOG

### Active bugs (Coach)

All 7 known Coach bugs fixed in branch claude/coach-fix-1 (April 28, 2026):
1. ✅ Coach now reads from daily_nutrition_summary (service-role client) — legacy daily_entries.nutrition JSONB no longer read
2. ✅ Training override fixed — getCoachContext now calls loadSessionsForDates() so sessions populate DailyEntry.training.sessions
3. ✅ Calorie calc fixed — resolved as part of #1 (wrong data source was the cause)
4. ✅ earlyevening mode now returns recovery and training fields (not null)
5. ✅ earlyevening prompt now includes explicit LANGUAGE RULE: "this evening" not "this afternoon"
6. ✅ hrv_score was already removed from ContextSection.tsx — confirmed clean, no changes needed
7. ✅ Refresh button added to Coach header (RefreshIcon, re-calls generateBriefing)

Two follow-up bugs resolved (same branch, April 28, 2026):
A. ✅ Mode computed client-side in CoachTab.tsx using new Date().getHours() — fixes UTC vs local time mismatch that showed "posttraining" at 13:05 Munich time. Mode sent in request body; server uses client mode if provided.
B. ✅ afternoon mode now returns non-null recovery field (one sentence on HRV vs baseline and sleep quality). training remains null in afternoon mode by design.

### Meal save — past-date fix (April 30, 2026)

- **Branch:** `claude/meal-date-fix`
- **Bug:** `handleConfirm` in `MealLogger.tsx` always sent `logged_at: new Date().toISOString()` (today's wall-clock time). When the user was viewing a past date, the meal was saved under today's date but `fetchDay()` refreshed the past-date view — the meal silently disappeared.
- **Root cause of delay:** A previous fix attempt was committed to a feature branch (`claude/focused-bassi-ca8605`) that was never merged to `main`. The deployed app continued to run the unfixed code.
- **Fix:** `MealLogger` now accepts a required `currentDate: string` prop. `logged_at` is computed as `${currentDate}T${new Date().toISOString().slice(11)}` — the user-viewed date with the current wall-clock UTC time. `NutritionSection` passes `currentDate` through to `MealLogger`.

### Apple Touch Icon (branch: feat/splash-logo-scale, April 30, 2026)

- **File:** `public/apple-touch-icon.png` — 180×180 PNG, #0a0a0a background, BodyCipher mark centred with 24px padding.
- **Generated by:** `scripts/generate-icon.mjs` using the `sharp` library. Run `node scripts/generate-icon.mjs` from project root to regenerate. sharp must be installed (`npm install --os=darwin --cpu=arm64 sharp`).
- **Wired via:** `metadata.icons.apple` in `app/layout.tsx` — Next.js App Router emits `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />` automatically.
- **Purpose:** When Julie saves the app to her iPhone home screen, iOS uses this icon instead of a screenshot thumbnail.

### SplashScreen (branch: feature/splash-screen, April 30, 2026)

- **File:** `components/SplashScreen.tsx`
- **Wired into:** `app/page.tsx` — rendered as first child of outermost div, above all content and tab bar. `showSplash` state controls mount/unmount.
- **Timing:** 3000ms display → 400ms CSS fade-out → `onDismiss` called → component unmounts. Total visible duration ~3400ms. The 3000ms delay is intentional and easy to adjust by changing the `setTimeout` value in the `useEffect` inside `SplashScreen.tsx`.
- **Animations:** CSS keyframes only (no JS animation library). Body form reveals top-to-bottom via `clip-path: inset()`. ECG line draws via `stroke-dashoffset`. Amber dots fade/pulse in. Wordmark and tagline rise from opacity 0.

### Layout / safe-area fixes

- **Tab bar (April 29, 2026):** outer div in `app/page.tsx` uses `paddingBottom: calc(72px + env(safe-area-inset-bottom))`. Tab bar itself has `height: 72` + `paddingBottom: env(safe-area-inset-bottom)`.
- **MealLogger bottom sheets (April 29, 2026, revised April 30, 2026):** The overlay backdrop `div` in `MealLogger.tsx` now has `paddingBottom: calc(72px + env(safe-area-inset-bottom))` so the sheet sits above the tab bar entirely. Full-sheet height reduced from `92vh` to `calc(92vh - 72px - env(safe-area-inset-bottom))` so it does not overflow above the viewport. Internal padding on ScreenMenu, Footer, ScreenSearch, and ScreenLibrary adds spacing within the sheet. Root cause: `isolation: isolate` on `<main>` creates a sandboxed stacking context — anything inside main (including the sheet at z-index 100) paints below the tab bar nav (z-index 50) in the outer context. The fix is layout, not z-index.

### Push notifications — Session 1 complete (May 4, 2026, branch: claude/nervous-jackson-862730)

PWA foundation laid. Files created/changed:
- `public/manifest.json` — PWA manifest (standalone display, dark bg, green theme)
- `public/sw.js` — Service Worker: push event → showNotification; notificationclick → confirm POSTs /api/notifications/supplement-confirm, snooze closes notification
- `components/SwRegister.tsx` — client component: registers SW on load; if already granted, calls subscribeAndSend. Exports `enableNotifications()` named function — must be called from a user gesture (iOS requirement). `app/page.tsx` calls it from the Enable Notifications button.
- `app/layout.tsx` — manifest wired into metadata; SwRegister rendered in body
- `app/api/notifications/subscribe/route.ts` — POST handler, upserts into push_subscriptions
- `package.json` — web-push ^3.6.7 added

**Before testing:** run the push_subscriptions CREATE TABLE migration in Supabase, and add the five VAPID env vars to Vercel (see push_subscriptions table entry above and Required environment variables section).

### Push notifications — Session 2 complete (May 4, 2026, branch: claude/musing-knuth-cdd141)

Cron jobs and push-sending logic built. Files created/changed:
- `vercel.json` — two Vercel cron entries: `55 7 * * *` (07:55 UTC = 09:55 Berlin summer) → `/api/notifications/check-morning`; `0 19 * * *` (19:00 UTC = 21:00 Berlin summer) → `/api/notifications/check-evening`
- `app/api/notifications/check-morning/route.ts` — GET handler. Authenticated via `Authorization: Bearer {CRON_SECRET}` (Vercel auto-generates and auto-sends CRON_SECRET for cron requests). Gets today in Europe/Berlin timezone, queries `daily_entries.morning_stack_taken` for user_id='julie'. If already true → returns `{sent: false, reason: 'already logged'}`. Otherwise fetches all `push_subscriptions` rows and sends each a push notification via web-push with title "BodyCipher", body "Good morning — have you taken your morning supplements?", actions: confirm / snooze. Returns `{sent, failed}` counts.
- `app/api/notifications/check-evening/route.ts` — Identical pattern, checks `evening_stack_taken`, body "Evening check — have you taken your evening supplements?".

**Notification payload structure (both routes):**
```json
{
  "title": "BodyCipher",
  "body": "...",
  "actions": [
    { "action": "confirm", "title": "Yes, taken" },
    { "action": "snooze", "title": "Remind me later" }
  ]
}
```

**Authentication:** Vercel automatically injects `CRON_SECRET` into the environment and sends it as `Authorization: Bearer <secret>` on every cron request. No manual setup required — Vercel manages the secret.

### Push notifications — Session 3 complete (May 4, 2026, branch: claude/musing-knuth-cdd141)

Supplement confirm route built. All three sessions complete — push notification feature is fully live.

**Files created/changed:**
- `public/sw.js` — `confirm` action handler updated to send `{ tag: event.notification.tag }` as JSON body in the POST to `/api/notifications/supplement-confirm`. Previously sent no body.
- `app/api/notifications/check-morning/route.ts` — added `tag: 'morning-supplements'` to notification payload so sw.js can identify the source.
- `app/api/notifications/check-evening/route.ts` — added `tag: 'evening-supplements'` to notification payload.
- `app/api/notifications/supplement-confirm/route.ts` — POST handler: reads `tag` from request body, maps `'morning-supplements'` → `morning_stack_taken` and `'evening-supplements'` → `evening_stack_taken`, upserts `daily_entries` row for today in Europe/Berlin time with the correct field set to `true` (onConflict: `user_id,date` so it merges rather than replaces). Returns 400 for unknown tags, 500 on DB failure, 200 + `{ ok, field, date }` on success.

**Snooze behaviour:** entirely client-side — sw.js closes the notification and takes no further action. No server call on snooze.

**Full notifications API surface (all three sessions):**

| Route | Method | Purpose |
|---|---|---|
| /api/notifications/subscribe | POST | Upsert device push subscription into push_subscriptions |
| /api/notifications/check-morning | GET (cron) | 07:55 UTC — send morning push if morning_stack_taken not true |
| /api/notifications/check-evening | GET (cron) | 19:00 UTC — send evening push if evening_stack_taken not true |
| /api/notifications/supplement-confirm | POST (SW) | Mark morning or evening stack taken in daily_entries |

### Features — next

1. **Glucose Stability expanded card** — targeted edit to GoalsTab.tsx only. No migrations. No new routes. Design specced above under Goals Tab. 🔍 CHECK: Is this the agreed next task?
2. **Coach overhaul** — full redesign. See Coach section above for known bugs. Switch to daily_nutrition_summary. Incorporate Training Load context. 30-day pattern reasoning. Fix all bugs above.
3. **BODYCIPHER.md update via Claude Code** — Training Load spec, health_appointments schema, training_sessions table, Goals tab built state. (This document supersedes the need — but Claude Code must be told to read and maintain it.)

### Features — later

1. Dashboard scores above data inputs
2. Behavior/Outcome score review — confirm empty = N/A not zero
3. CGM rolling average in Coach context
4. Food quality coaching — one nudge/day. Design TBD.
5. Responsive design / mobile layout
6. Apple Health XML import — deferred indefinitely
7. Regression analysis — revisit July 2026

### Greeting — resolved (April 28, 2026)

Replaced Anthropic API greeting with static rotating list. Client-side only, instant, zero cost. 50 greetings across 5 time bands. API route deleted.

### Removed / will not do

- Breakfast templates
- Cyclic supplements (Ashwagandha, Phosphatidylserine)
- Andreas secondary user
- avg_heart_rate in training sessions
- Template UI in My Library (tables and API routes preserved in DB)
- USDA name deduplication
- Calorie warnings or penalties
- "Cycled today (transport)" UI toggle (removed April 29, 2026 — Cycling is now a regular quick-add session type)

---

## HOW JULIE USES THIS APP

Julie receives workouts auto-imported from Apple Health via the webhook, and then manually augments them — for example, adding Zone 3+ minutes. This means training session rows contain a mix of machine-written fields and human-written fields. Any code that touches training sessions must preserve both. It cannot assume that what the UI displays is everything the row contains.

Any save logic that deletes and rewrites session rows must carry forward every field the webhook can write — currently external_id, source, active_calories, and start_time — not just the fields the UI controls. If a new webhook field is added in future, this list must be updated and the save logic must be checked.

The same overwrite risk exists for daily_entries fields. Any field that the webhook can write — currently sleep_duration_min and rhr — must not be blindly overwritten by saveEntry() if the in-memory value is null. The fix is to omit null webhook-owned fields from the upsert payload rather than writing null over a real value. In lib/db.ts saveEntry(), sleep_duration_min and rhr use conditional spread: they are only included in the flat upsert object if the in-memory value is non-null.

---

## PROCESS REMINDERS

- **Branch only.** Never push to main directly.
- **Review before merge.** Claude Code outputs change summary → Julie pastes here → go/no-go → merge.
- **DB first.** Julie runs all SQL migrations manually in Supabase before code deploys.
- **No full rewrites.** Targeted edits only. If a full rewrite seems necessary, stop and explain why first.
- **Update this file.** BODYCIPHER.md committed at end of every session. This is the only source of truth — the separate NUTRITION_DATA_MODEL.md and NUTRITION_UX_FLOW.md files in /docs are now superseded by this document. Do not maintain them separately.
