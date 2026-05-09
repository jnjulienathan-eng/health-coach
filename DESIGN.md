# DESIGN.md — BodyCipher Design System

> This file is the single source of truth for all visual and UX decisions in BodyCipher.
> Claude Code must read this file alongside BODYCIPHER.md before making any UI changes.
> Never override these values without explicit instruction from Julie.

---

## Brand Identity

BodyCipher is a deeply personal health coaching app built for one athletic woman. It is not a generic wellness product. The design should feel like a premium personal tool — warm, intelligent, and precise. The closest reference is Apple Health, but with more editorial confidence and personal warmth.

**Personality**: Personal · Warm · Data-forward · Intelligent  
**Not**: Corporate · Clinical · Generic · "AI app"  
**Tagline**: Decode your body.

---

## Color System

```css
:root {
  /* Core palette */
  --color-navy:        #001F3F;   /* Primary — headers, primary cards, active nav, save buttons, icon containers */
  --color-amber:       #FFBF00;   /* Accent — progress bars, active toggles, status highlights, active icons,
                                     score badges, chart fills above target, dots above HRV baseline */
  --color-background:  #F9F9F8;   /* App background — warm off-white, never pure white */
  --color-surface:     #FFFFFF;   /* Card surfaces — maximum lift against background */

  /* Text */
  --color-text-primary:   #001F3F;  /* Main text — same as navy */
  --color-text-secondary: #6F88AD;  /* Supporting text, metadata, labels */
  --color-text-muted:     #878686;  /* Placeholder text, inactive states */

  /* Borders */
  --color-border:         #C4C6CF;  /* Card borders, dividers */
  --color-border-subtle:  #E2E2E2;  /* Subtle separators inside accordions */

  /* Semantic status colours */
  --color-status-optimal:  #22C55E;  /* Green — HRV > 100, sleep quality high, history score 80+ */
  --color-status-good:     #84CC16;  /* Light green — HRV 80–100 */
  --color-status-moderate: #FFBF00;  /* Amber — HRV 60–80, history score 65–79 */
  --color-status-low:      #F97316;  /* Warning orange — HRV < 60, history score below 65 */
  --color-status-rest:     #94A3B8;  /* Grey — rest day */

  /* Chart-specific */
  --color-spectrum-start:  #A8C4D4;  /* Soft blue — left end of VO2 Max spectrum bar */
}
```

### Colour Role Clarity — Amber vs Orange

These are two distinct colours serving different purposes. Never conflate them.

| Colour | Hex | Role |
|---|---|---|
| **Amber** | `#FFBF00` | Accent, progress, active state — indicates engagement or above-target achievement |
| **Warning orange** | `#F97316` | Status alert — indicates low score, risk, or below-threshold state |

Amber is aspirational. Orange is a warning. A history score of 58 is orange. A progress bar fill is amber.

---

## Typography

All text uses **Manrope** exclusively. Import via Google Fonts.

```css
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
```

| Token | Size | Weight | Usage |
|---|---|---|---|
| `score-display` | 48px | 800 | Big metric numbers (HRV, sleep score, VO2 Max value) |
| `display-lg` | 40px | 800 | Hero greeting text |
| `headline-xl` | 32px | 700 | Section titles, Performance Goals header |
| `headline-lg` | 24px | 700 | Accordion headers, card titles |
| `body-lg` | 18px | 400 | Primary body text, coach insights, appointment names |
| `body-md` | 16px | 400 | Secondary body text, field values |
| `label-bold` | 14px | 700 | Category labels — ALWAYS uppercase, letter-spacing 0.05em |
| `label-sm` | 12px | 500 | Sub-labels, units (ms, mmol/L, kcal), due dates, spectrum band labels |

**Critical rule**: Text outside accordions must never fall below 16px. The previous design had illegible small text throughout — this must not recur. `label-sm` (12px) is only permitted for units, spectrum band labels, and health calendar due dates on the same line as an appointment name.

---

## Spacing

```css
:root {
  --space-unit:      8px;
  --space-xs:        8px;
  --space-sm:        12px;
  --space-md:        16px;   /* Standard gutter — content never touches screen edge */
  --space-lg:        20px;   /* Container padding */
  --space-xl:        24px;
  --space-2xl:       40px;   /* Section gap — between major logical sections */
}
```

---

## Border Radius

```css
:root {
  --radius-sm:   4px;    /* Subtle rounding — tags, badges, icon containers */
  --radius-md:   8px;    /* Default — most cards, icon container rounding */
  --radius-lg:   12px;   /* Primary cards, accordions */
  --radius-xl:   16px;   /* Hero cards */
  --radius-full: 9999px; /* Buttons, toggles, progress bars, pill elements */
}
```

---

## Elevation & Shadows

```css
:root {
  --shadow-card:  0px 4px 20px rgba(0, 0, 0, 0.04);   /* Standard card lift */
  --shadow-input: 0px 8px 32px rgba(0, 0, 0, 0.08);   /* Chat input bar, floating elements */
}
```

Cards use `--shadow-card` and a 1px `--color-border` border. Never use heavy drop shadows.

---

## Layout

- **Max width**: 448px (centered on larger screens)
- **Horizontal padding**: 20px — content never touches screen edge
- **Bottom nav height**: 64px — always fixed, always visible
- **Safe area**: Respect iOS safe area insets (`env(safe-area-inset-bottom)`) on nav and floating input bar
- **Responsive**: Mobile-first. All buttons full-width or properly wrapped — nothing overflows horizontally. This was a critical failure in the previous design.

---

## Components

### Score Card
Used in Dashboard for HRV, Sleep, Macros, Recovery.

```
┌─────────────────────┐
│ LABEL          ●    │  ← label-bold uppercase + status dot
│ 78             ms   │  ← score-display + label-sm unit
│ ● Optimal           │  ← status label in semantic colour
└─────────────────────┘
```

- Background: `--color-surface`
- Border: 1px `--color-border`
- Border radius: `--radius-lg`
- Shadow: `--shadow-card`
- Status dot and label use semantic status colours
- Cards sit in a 2-column grid

### Primary Insight Card (Coach tab / Training Load)
The hero element on the Coach screen and the Training Load card on Dashboard.

- Background: `--color-navy`
- Left border: 4px solid `--color-amber`
- Text: white
- Border radius: `--radius-xl`
- Contains: category label (amber, uppercase, `label-bold`), headline insight, supporting detail, optional progress bar in amber
- Sub-metric boxes inside the card: `--color-surface` at ~10% opacity, `--radius-lg`, showing ACUTE/CHRONIC labels and TSU values

### Accordion — Closed State

```
┌──────────────────────────────────┐
│ [■]  Section Title           ∨   │
│       Status summary text        │
└──────────────────────────────────┘
```

- `[■]` = navy rounded-square icon container (36×36px, `--radius-md`, `--color-navy` background, white or amber icon inside)
- Background: `--color-surface`
- Border: 1px `--color-border`
- Border radius: `--radius-lg`
- Title: `headline-lg`
- Status summary: `body-md` in `--color-text-secondary`
- Chevron: points **down** (∨) when closed; rotates **180°** (∧) when open — CSS transition, not a flip
- Never feels like a native HTML `<details>` element

### Accordion — Open State Interior
Field layout inside open accordions:

- Background: `--color-surface`
- Interior padding: 20px
- Field label: `label-bold` uppercase, `--color-text-secondary`, sits above input
- Input field: `body-lg`, full width, 1px `--color-border`, `--radius-md`, min-height 48px (tap target)
- Field gap: 16px between fields
- Side-by-side fields (e.g. HRV + Fasting Glucose): 2-column grid with equal width
- Slider: discrete stops, amber fill, visible tick marks, current value shown prominently in amber
- Save button: full width, `--color-navy` background, white text, `--radius-full`, height 52px

### Accordion — Training Tab Variant
Training tab accordions carry a visual accent to distinguish them from data-entry accordions:

- **Left border**: 4px solid `--color-amber` (vertical bar accent, full height of the closed accordion)
- All other closed-state rules apply as above

### Icon Container (Accordion Header)
Used on all accordion headers to the left of the section title:

- Size: 36×36px
- Background: `--color-navy`
- Border radius: `--radius-md` (rounded square, not a circle)
- Icon: white SVG or emoji, centered, ~20px
- Morning Stack uses a sun icon; Evening Stack uses a moon icon; training sections use activity icons

### Toggle Row (Supplements)

```
┌────────────────────────────────────┐
│ Supplement Name      [toggle]      │
│ dosage label                       │
└────────────────────────────────────┘
```

- Toggle active state: `--color-amber` background
- Toggle inactive state: `--color-border` background
- Name: `body-lg`
- Dosage: `label-sm` in `--color-text-secondary`
- Row height: 56px minimum (tap target)
- Divider: 1px `--color-border-subtle` between rows

### Slider Component
Used for: Sleep Quality (1–10), RPE

- Discrete stops, not continuous
- Track: `--color-border`
- Fill: `--color-amber`
- Thumb: white circle with `--color-navy` border
- Current value shown prominently in `--color-amber` above thumb
- Tick marks visible at each stop

### Bottom Tab Bar
Current tabs: **Dashboard · Training · Nutrition · Supplements · Goals**

- Background: `--color-navy`
- Active tab: pill container, white background, navy text and icon
- Inactive tab: white icon and text at 60% opacity
- Fixed to bottom, respects iOS safe area
- Labels always visible (never icon-only)

### Floating Chat Input (Coach tab)
- Pinned to bottom above tab bar
- Pill-shaped container: `--color-surface`, `--shadow-input`
- Left icon: brain/coach icon in `--color-text-muted`
- Placeholder: "Ask Coach Anything" in `--color-text-muted`
- Send button: `--color-navy` circle, white arrow icon
- Full width minus 20px gutter each side

### Buttons
- **Primary**: full width, `--color-navy`, white text, `--radius-full`, height 52px, `label-bold`
- **Secondary**: full width, white background, `--color-navy` border, navy text, `--radius-full`, height 52px
- **Mark All Taken**: full width, `--color-navy`, white text, inside accordion header area above toggle rows
- Never use half-width buttons that might overflow on small screens

---

## Charts & Data Visualisation

### Two-Tone Bar Chart (Sleep, and any metric with a target threshold)

Used on the Sleep — 30 Days card and any other chart where a target line is meaningful.

```
 10 │
    │        ██░░
  7 │- - - - ██░░- - - - - target 7h30
    │  ████  ████  ████
    │  ████  ████  ████
  0 └──────────────────
```

- **Navy segment** (`--color-navy`): base portion of the bar, from 0 up to the target line
- **Amber segment** (`--color-amber`): portion of the bar *above* the target line only — not the full bar
- If a bar does not reach the target, it is entirely navy with no amber
- **Target line**: amber dashed horizontal (`--color-amber`, opacity 0.6), with label `label-sm` "target Xh30" positioned to the right or inline
- Y-axis: `label-sm`, `--color-text-muted`
- X-axis: day numbers, `label-sm`, `--color-text-muted`
- No background grid lines — only horizontal rule at y=0

### HRV Line Chart (HRV — 30 Days)

- Line: `--color-navy`, 2px stroke
- **Dots above baseline**: filled `--color-amber`
- **Dots below baseline**: filled `--color-navy`
- **Baseline**: amber dashed horizontal line (`--color-amber`, opacity 0.6) with label "baseline XXms" in `label-sm`
- Y-axis grid lines: 1px `--color-border-subtle`, horizontal only
- No fills under the line — line chart only, no area fill
- Dot radius: 5px

### Training Load Ratio Bar

Used inside the Training Load primary card.

- A single horizontal bar spanning the full card width
- Colour zones from left to right: yellow (low), grey (optimal), dark grey (high), peach/amber (overreach)
- Current ratio position: a small vertical tick marker in `--color-amber` or `--color-status-low` depending on zone
- Ratio value printed in `score-display` size at the right end, coloured to match the zone
- Numeric scale labels below (0.6, 0.8, 1.3, 1.5): `label-sm`, `--color-text-muted`

### VO2 Max Spectrum Bar

Used on the VO2 Max detail card inside Goals.

```
POOR   FAIR   GOOD   EXCELLENT   SUPERIOR   50+
[░░░░][░░░░░][░░░░░][░░░░░░░░░][▓▓▓▓◆▓▓▓][░░]
                                      ↑        
                               Current (36.2)  
                                         ↑     
                                    TARGET (40) 
```

- Bar spans from 0 to 50+ across the full card width
- Bands use a horizontal gradient from `--color-spectrum-start` (#A8C4D4) at the left through neutral to `--color-amber` at the right
- Band labels: POOR · FAIR · GOOD · EXCELLENT · SUPERIOR · 50+ in `label-sm`, `--color-text-muted`, spaced proportionally above or below the bar
- **Current value marker**: a distinct vertical tick or diamond icon (◆) sitting on the bar at the current value position; value label printed above in `body-md`, `--color-text-primary`
- **Target marker**: a separate smaller tick below the bar at target position (40), with label "TARGET (40)" in `label-sm`, `--color-amber`
- These two markers are visually distinct — never merge them into one
- Age-adjusted bands for Julie's age group: Poor <23, Fair 23–27, Good 28–32, Excellent 33–36, Superior 37+, bar extends to 50+
- Current value: 36 (Excellent); personal target: 40

### Sparkline / Trend Line (VO2 Max 7-Day Trend, etc.)

- Single line chart, no dots, no y-axis
- Line colour: `--color-navy`, 2px stroke
- Trend delta label: `label-bold` in `--color-status-optimal` if positive, `--color-status-low` if negative (e.g. "+1.2%")
- Title "7-Day Trend" in `label-bold`, `--color-text-primary`
- No background grid lines

---

## History Row

Used in the History tab. Each row represents one logged day.

```
┌──────────────────────────────────────────────────┐
│ Fri, May 8              BEHAV    OUTC         ›  │
│ 🚴 🏃 💧               94       88               │
└──────────────────────────────────────────────────┘
```

- **Date**: `headline-lg`, `--color-text-primary`, left-aligned
- **Activity emojis**: displayed below the date, small row
- **BEHAV / OUTC labels**: `label-bold` uppercase, `--color-text-secondary`, right section
- **Score values**: `headline-lg` or larger, coloured by threshold:
  - **80 and above** → `--color-status-optimal` (#22C55E, green)
  - **65–79** → `--color-status-moderate` (#FFBF00, amber)
  - **Below 65** → `--color-status-low` (#F97316, orange)
- **Chevron**: `--color-text-muted`, right edge
- Border: 1px `--color-border`
- Border radius: `--radius-lg`
- Background: `--color-surface`
- Shadow: `--shadow-card`
- Row min-height: 72px

---

## Health Calendar Row

Used in the Goals / Health Calendar section.

### Closed Row — Appointment Due or Upcoming

```
┌──────────────────────────────────────────────────┐
│ Gynaecologist           Due: 27 May 2026, 18:30  │
│ Last done: Apr 8, 2025                           │
└──────────────────────────────────────────────────┘
```

- **Appointment name**: `body-lg`, bold, `--color-text-primary`, left-aligned
- **Due date**: `label-sm` (12px), `--color-amber`, right-aligned, **single line, no wrapping**. Format: "Due: DD Mon YYYY, HH:MM". If space is tight, truncate to "Due: DD Mon YYYY" before wrapping — never wrap to a second line.
- **"Last done" text**: `body-md`, `--color-text-secondary`, below the name
- The name and due date must always fit on the same line. Reduce the due date to `label-sm` to ensure this.
- Border: 1px `--color-border`
- Border radius: `--radius-lg`
- Background: `--color-surface`
- Min-height: 72px

### Closed Row — Not Scheduled

```
┌──────────────────────────────────────────────────┐
│ Eye & Optometrist               Not scheduled    │
└──────────────────────────────────────────────────┘
```

- Name: `body-lg`, `--color-navy`
- "Not scheduled": `body-md`, `--color-text-muted`, right-aligned
- Single-line row, min-height 56px

### Expanded Row (Active / Editable State)

- Left border: 4px solid `--color-amber` (same accent pattern as Training accordions)
- Background: `--color-surface`
- Interior padding: 20px
- **LAST COMPLETED** field: date picker, `label-bold` uppercase field label, value in `body-lg`
- **NEXT DUE** field: labelled "(AUTO-COMPUTED, OVERRIDABLE)", date+time input, `body-lg`
- **NOTES** field: textarea, `body-md`, min 3 lines
- **MARK AS DONE TODAY**: full-width, `--color-navy`, white text, `--radius-full`, height 52px
- **SAVE / CANCEL**: secondary buttons below, equal width, `--radius-full`

---

## Long-Term Goals — Hero Card

Used at the top of the Goals tab before the metric list.

- Background: `--color-navy`
- Left border: 4px solid `--color-amber`
- Border radius: `--radius-xl`
- Section label: `label-bold` uppercase, `--color-text-secondary` (muted, above the headline)
- Headline: `headline-xl` or `display-lg`, white
- Supporting line: `body-lg`, `--color-text-secondary` (slightly muted white-blue)
- Progress bar at bottom: amber fill, `--radius-full`, full width, low-opacity white track

---

## Long-Term Goals — Metric Row

Used for VO2 Max, Cardiovascular Health, Glucose Stability list items.

```
┌──────────────────────────────────────────────────┐
│ [■]  VO2 Max                  36.2 ml/kg/min  ›  │
└──────────────────────────────────────────────────┘
```

- Icon container: navy rounded square (see Icon Container spec)
- Metric name: `body-lg`, bold, `--color-text-primary`
- Current value: `body-lg`, `--color-text-secondary`, right-aligned
- Status badge (where applicable): pill shape, `--color-amber` background, `--color-navy` text, `label-bold` uppercase (e.g. "OPTIMAL")
- Sub-label (e.g. "LDL 124 · HDL 50 MG/DL"): `label-sm`, `--color-text-muted`, below name
- Chevron: `--color-text-muted`
- No data state: italic `body-md` in `--color-text-muted` (e.g. "Start logging fasting glucose in the Sleep section")
- Border: 1px `--color-border`; Border radius: `--radius-lg`; Background: `--color-surface`; Shadow: `--shadow-card`

---

## Supplement Stack

### Accordion Header (Stack Level)

```
┌────────────────────────────────────────────────┐
│ [☀]  Morning Stack                         ∨  │
│       5 of 7 taken                             │
└────────────────────────────────────────────────┘
```

- Icon container: navy rounded square with sun (morning) or moon (evening) icon
- Chevron: points down (∨) when closed, rotates 180° up (∧) when open
- Status line: `body-md`, `--color-text-secondary`
- When expanded: "Mark All Taken" button appears at top of accordion body, full width, navy

### Toggle Rows (inside accordion)
See Toggle Row component above.

### Weekly Compliance Card
- Uses Primary Insight Card styling (navy background, amber left border)
- Compliance percentage: `score-display`
- Progress bar: amber fill, white/translucent track
- Insight text: `body-md`, white

---

## Contextual Hero Image Pattern (Dashboard)

The Dashboard tab shows a full-width hero image that reflects the training state of the day. All images are personal photos taken by Julie. The app should feel alive and personal, not like a data grid.

Image treatment:
- Full width, height ~240px
- Gradient overlay: `linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.5) 100%)`
- Greeting text and primary insight overlaid on image in white
- `border-radius: 0` — image bleeds to screen edges

### Hero Image Rotation

Images are stored in `/public/images/hero/`. On Dashboard load, read today's HRV value and randomly select one image from the matching state array. Selection is random on each load — do not cache the selection between sessions.

```javascript
const heroImages = {
  hard:     ["state-hard.jpg", "state-hard-iceland.jpg"],
  moderate: ["state-moderate.jpg", "state-moderate-scotland.jpg"],
  easy:     ["state-easy.jpg", "state-easy-blackforest.jpg", "state-easy-bovic.jpg", "state-easy-mushrooms.jpg"],
  rest:     ["state-rest.jpg", "state-rest-cat.jpg", "state-rest-norway.jpg"],
  nodata:   ["state-nodata.jpg"]
};
```

HRV threshold mapping:
- **hard** — HRV > 100
- **moderate** — HRV 80–100
- **easy** — HRV 60–80
- **rest** — HRV < 60
- **nodata** — no HRV logged today

---

## Supplement Stacks

### Morning Stack (default OFF, master toggle)
Creatine · Vitamin D3+K2 · Zinc+Selenium · Glucosamine · Omega-3 · Berberine · DIM

### Evening Stack (default OFF, master toggle)
Magnesium Glycinate · L-Theanine

### Cyclic Section (inactive, muted visual treatment)
Ashwagandha · Phosphatidylserine  
Displayed with reduced opacity and a "Paused" label. Not toggleable until activated.

---

## Coach Tab — Time Mode Headers

| Time | Mode | Header Label |
|---|---|---|
| Before 09:00 | Morning | Morning Briefing |
| 09:00–12:00 | Post-Training | Post-Training Recovery |
| 12:00–17:00 | Afternoon | Afternoon Check-in |
| 17:00–20:00 | Early Evening | Evening Wind-Down |
| After 20:00 | End of Day | End of Day Review |

---

## What Not To Do

- Never use Inter, Roboto, or system fonts — always Manrope
- Never use text smaller than 16px outside of unit labels (`label-sm` at 12px is permitted only for units, spectrum labels, and health calendar due dates)
- Never use fixed-width elements that cause horizontal overflow on iPhone
- Never use heavy box shadows
- Never stack more than 2 columns on mobile
- Never use pure black (#000000) anywhere
- Never add excessive rounded corners to every element — use the radius scale intentionally
- Never rewrite whole component files — always targeted edits
- Never conflate amber (#FFBF00) with warning orange (#F97316) — they are semantically distinct
- Never let a Health Calendar due date wrap to a second line — reduce to `label-sm` before allowing a wrap
- Never merge the current value marker and target marker on the VO2 Max spectrum bar — they must remain separate
- Never rotate a chevron on click instead of using a CSS transition — use `transform: rotate(180deg)` with `transition: transform 200ms ease`
- Never omit the amber left-border accent on Training tab accordions
