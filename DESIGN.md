# DESIGN.md — BodyCipher Design System

> This file is the single source of truth for all visual and UX decisions in BodyCipher.
> Claude Code must read this file alongside BODYCIPHER.md before making any UI changes.
> Never override these values without explicit instruction from Julie.
> The Stitch reference screens in /design/screens/ are visual reference only —
> they show component patterns, not the app's navigation structure.

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
  --color-status-optimal:  #22C55E;  /* Green — HRV > 100, sleep quality high, score 80+ */
  --color-status-good:     #84CC16;  /* Light green — HRV 80–100 */
  --color-status-moderate: #FFBF00;  /* Amber — HRV 60–80, score 65–79 */
  --color-status-low:      #F97316;  /* Warning orange — HRV < 60, score below 65 */
  --color-status-rest:     #94A3B8;  /* Grey — rest day */

  /* Chart-specific */
  --color-spectrum-start:  #A8C4D4;  /* Soft blue — left end of VO2 Max spectrum bar */

  /* Explore chart series — assigned by selection order, not by variable */
  --color-series-blue:     #2F6FDE;  /* 1st selected variable */
  --color-series-orange:   #F08A24;  /* 2nd selected — a series colour, NOT the warning orange */
  --color-series-green:    #2E9E5B;  /* 3rd selected — a series colour, NOT a status green */
}
```

### Amber vs Orange — never conflate these

| Colour | Hex | Role |
|---|---|---|
| **Amber** | `#FFBF00` | Accent · progress · active state · above-target achievement |
| **Warning orange** | `#F97316` | Status alert · low score · below-threshold state |

Amber is aspirational. Orange is a warning. A progress bar fill is amber. A history score of 58 is orange.

---

## Typography

All text uses **Manrope** exclusively. Import via Google Fonts.

```css
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
```

| Token | Size | Weight | Usage |
|---|---|---|---|
| `score-display` | 48px | 800 | Big metric numbers (VO2 Max value, compliance %) |
| `display-lg` | 40px | 800 | Hero section headlines |
| `headline-xl` | 32px | 700 | Page-level section titles |
| `headline-lg` | 24px | 700 | Accordion headers, card titles, history date |
| `body-lg` | 18px | 400 | Primary body text, coach insights, appointment names |
| `body-md` | 16px | 400 | Secondary body text, field values |
| `label-bold` | 14px | 700 | Category labels — ALWAYS uppercase, letter-spacing 0.05em |
| `label-sm` | 12px | 500 | Units (ms, mmol/L, kcal), spectrum band labels, calendar due dates |

**Critical rule**: Text outside accordions must never fall below 16px. `label-sm` at 12px is permitted only for units, spectrum band labels, and health calendar due dates on the same line as a larger element.

---

## Spacing

```css
:root {
  --space-unit:  8px;
  --space-xs:    8px;
  --space-sm:    12px;
  --space-md:    16px;   /* Standard gutter */
  --space-lg:    20px;   /* Container padding */
  --space-xl:    24px;
  --space-2xl:   40px;   /* Section gap — between major logical sections */
}
```

---

## Border Radius

```css
:root {
  --radius-sm:   4px;    /* Tags, badges */
  --radius-md:   8px;    /* Default cards, icon containers */
  --radius-lg:   12px;   /* Primary cards, accordions */
  --radius-xl:   16px;   /* Hero cards */
  --radius-full: 9999px; /* Buttons, toggles, progress bars, pill elements */
}
```

---

## Elevation & Shadows

```css
:root {
  --shadow-card:  0px 4px 20px rgba(0, 0, 0, 0.04);
  --shadow-input: 0px 8px 32px rgba(0, 0, 0, 0.08);
}
```

Cards use `--shadow-card` and a 1px `--color-border` border. Never use heavy drop shadows.

---

## Layout

- **Max width**: 448px (centered on larger screens)
- **Horizontal padding**: 20px — content never touches screen edge
- **Bottom nav height**: 72px (with `env(safe-area-inset-bottom)`)
- **Safe area**: Respect iOS safe area insets on nav and floating elements
- **Responsive**: Mobile-first. All buttons full-width or properly wrapped. Nothing overflows horizontally.

---

## Navigation

The app has **4 tabs**. This is the authoritative structure. Do not add, remove, or rename tabs without explicit instruction.

| Index | Label | Content |
|---|---|---|
| 0 | Today | Date navigator · Greeting · Score cards · 6 logging accordions · Long-term goals section |
| 1 | Health Calendar | Health appointments list |
| 2 | Explore | Variable chips · Readout · Normalised z-score chart (60 days) · Count line · Tag list · Coach (replaced Coach, Oct 28, 2026) |
| 3 | Dashboard | Training Load card · Charts · History list |

**Tab bar visual rules:**
- Background: `--color-navy`
- Active tab: pill container, white background, navy text and icon
- Inactive tab: white icon and text at 60% opacity
- Fixed to bottom, respects iOS safe area
- Labels always visible — never icon-only

---

## Components

### Score Card
Used on the Today tab in a 3-card row: Behavior Score · Outcome Score · Training Load.

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
- Cards sit in a 3-column grid (equal width)
- Tapping Training Load score card → navigates to Dashboard, opens Training Load card expanded

### Accordion — Closed State (general)

```
┌──────────────────────────────────────┐
│ [■]  Section Title               ∨  │
│       Status summary text            │
└──────────────────────────────────────┘
```

- `[■]` = navy rounded-square icon container: 36×36px, `--radius-md`, `--color-navy` background, white or amber icon inside
- Background: `--color-surface`
- Border: 1px `--color-border`
- Border radius: `--radius-lg`
- Title: `headline-lg`
- Status summary: `body-md`, `--color-text-secondary`
- Chevron: points **down** (∨) when closed, rotates **180°** upward when open — `transform: rotate(180deg)`, `transition: transform 200ms ease`
- Never use a native HTML `<details>` element

### Accordion — Training Sessions (Today tab) — Accent Variant
Training accordions carry a left-side accent to distinguish them from data-entry accordions.

- **Left border**: 4px solid `--color-amber`, full height of the closed card
- All other closed-state rules apply as above

### Accordion — Open State Interior

- Interior padding: 20px
- Field label: `label-bold` uppercase, `--color-text-secondary`, above input
- Input field: `body-lg`, full width, 1px `--color-border`, `--radius-md`, min-height 48px (tap target)
- Field gap: 16px between fields
- Side-by-side fields: 2-column grid, equal width
- Save button: full width, `--color-navy`, white text, `--radius-full`, height 52px

### Icon Container (Accordion Header)

- Size: 36×36px
- Background: `--color-navy`
- Border radius: `--radius-md` — rounded square, not a circle
- Icon: white SVG or emoji, centred, ~20px
- Sleep → moon · Training → activity icon · Nutrition → fork · Supplements → sun (morning) / moon (evening) · Hydration → droplet · Context → calendar

### Primary Insight Card
Used for the Training Load card on the Dashboard (previously also the Coach tab hero, removed Oct 28, 2026).

- Background: `--color-navy`
- Left border: 4px solid `--color-amber`
- Text: white
- Border radius: `--radius-xl`
- Category label: `label-bold`, amber, uppercase
- Headline: `headline-lg` or `headline-xl`, white
- Supporting detail: `body-lg`, `--color-text-secondary` (muted blue-white)
- Optional progress bar: amber fill, white/translucent track, `--radius-full`

### Toggle Row (Supplements — inside Today tab accordion)

```
┌────────────────────────────────────┐
│ Supplement Name      [toggle]      │
│ dosage label                       │
└────────────────────────────────────┘
```

- Toggle active: `--color-amber` background
- Toggle inactive: `--color-border` background
- Name: `body-lg`
- Dosage: `label-sm`, `--color-text-secondary`
- Row min-height: 56px
- Divider: 1px `--color-border-subtle` between rows

### Slider Component
Used for Sleep Quality (1–10) and RPE.

- Discrete stops, not continuous
- Track: `--color-border`
- Fill: `--color-amber`
- Thumb: white circle, `--color-navy` border
- Current value shown in `--color-amber` above thumb
- Tick marks at each stop

### Buttons

- **Primary**: full width, `--color-navy`, white text, `--radius-full`, height 52px, `label-bold`
- **Secondary**: full width, white background, `--color-navy` border, navy text, `--radius-full`, height 52px
- **Mark All Taken** (Supplements): full width, `--color-navy`, white text, inside accordion header area
- Never half-width buttons — they overflow on small screens

### Floating Chat Input (Coach tab — removed Oct 28, 2026; reference only)

- Pinned to bottom above tab bar
- Pill-shaped container: `--color-surface`, `--shadow-input`
- Left icon: coach icon in `--color-text-muted`
- Placeholder: "Ask Coach Anything" in `--color-text-muted`
- Send button: `--color-navy` circle, white arrow
- Full width minus 20px gutter each side

---

## Charts & Data Visualisation

### Two-Tone Bar Chart
Used on the Sleep — 30 Days chart (Dashboard tab) and any chart with a target threshold.

```
 10 │
    │        ██░░
  7 │ - - - -██░░- - - -  target 7h30
    │  ████  ████  ████
  0 └──────────────────
```

- **Navy segment** (`--color-navy`): bar from 0 up to the target value
- **Amber segment** (`--color-amber`): portion of bar *above* the target only — not the full bar
- If a bar does not reach target, it is entirely navy — no amber
- **Target line**: amber dashed horizontal, `--color-amber` at 60% opacity, `label-sm` label right-aligned or inline
- Y-axis: `label-sm`, `--color-text-muted`
- X-axis: day numbers, `label-sm`, `--color-text-muted`
- No background grid lines — only a horizontal rule at y=0

### HRV Line Chart (Dashboard tab — HRV — 30 Days)

- Line: `--color-navy`, 2px stroke
- **Dots above baseline**: filled `--color-amber`
- **Dots below baseline**: filled `--color-navy`
- **Baseline**: amber dashed horizontal, `--color-amber` at 60% opacity, labelled "baseline XXms" in `label-sm`
- Horizontal grid lines: 1px `--color-border-subtle`
- No area fill — line and dots only
- Dot radius: 5px

### Training Load Ratio Bar (Dashboard tab — inside Primary Insight Card)

- Single horizontal bar, full card width
- Colour zones left to right: amber (undertraining) → light green (easy) → green (building) → amber (pushing hard) → orange/red (overreach)
- Current position: small vertical tick marker coloured to match the zone
- Ratio value: `score-display` sized, right-aligned, zone colour
- Scale labels below bar (0.6, 0.8, 1.3, 1.5): `label-sm`, `--color-text-muted`

### VO2 Max Spectrum Bar (Today tab — Long-term Goals section)

```
POOR   FAIR   GOOD   EXCELLENT   SUPERIOR   50+
[░░░░][░░░░░][░░░░░][░░░░░░░░░][▓▓▓◆▓▓▓▓][░░]
                                      ↑
                               Current (36.2)
                                         ↑
                                    TARGET (40)
```

- Bar spans full card width from 0 to 50+
- Horizontal gradient: `--color-spectrum-start` (#A8C4D4) at left → neutral → `--color-amber` at right
- Band labels: POOR · FAIR · GOOD · EXCELLENT · SUPERIOR · 50+ in `label-sm`, `--color-text-muted`, spaced proportionally
- **Current value marker**: distinct tick or diamond (◆) on the bar at the current position; value label in `body-md`, `--color-text-primary`
- **Target marker**: separate smaller tick *below* the bar at target position (40); labelled "TARGET (40)" in `label-sm`, `--color-amber`
- Current and target markers are always visually distinct — never merge them
- Age-adjusted bands: Poor <23 · Fair 23–27 · Good 28–32 · Excellent 33–36 · Superior 37+ · bar extends to 50+
- Current value: 36 (Excellent) · Personal target: 40
- Display value is 30-day rolling average, formatted to 1 decimal (e.g. 36.0, 36.2)

### Sparkline / Trend Line

- Single line, no dots, no y-axis
- Line: `--color-navy`, 2px stroke
- Trend delta label: `label-bold`, `--color-status-optimal` if positive, `--color-status-low` if negative
- Title ("7-Day Trend"): `label-bold`, `--color-text-primary`
- No background grid lines

---

## Today Tab — Section Details

### Logging Accordions (6 sections)
Rendered in order: Sleep · Training · Nutrition · Hydration · Supplements · Context

Each uses the standard Accordion — Closed State spec above, with the appropriate icon container.
Training accordion uses the Accent Variant (amber left border).
Supplements accordion shows sub-accordions for Morning Stack and Evening Stack inside when expanded.

### Long-Term Goals Section (bottom of Today tab)
Three collapsible cards stacked vertically.

**VO2 Max card:**
- Collapsed: metric name + 30-day rolling average + status badge pill (`--color-amber` background, `--color-navy` text, `label-bold` uppercase, `--radius-full`)
- Expanded: `score-display` value + VO2 Max spectrum bar + sparkline + inline entry form

**Cardiovascular Health card:**
- Collapsed: LDL:HDL ratio headline + status badge
- Expanded: LDL/HDL spectrum bars + ratio trend sparkline + manual entry bottom sheet

**Glucose Stability card:**
- Collapsed: 7-day fasting glucose average (mmol/L), or italic `body-md` prompt in `--color-text-muted` if no data
- Expanded state: designed but not yet built — do not implement until explicitly instructed

---

## Health Calendar Tab

### Appointment Row — Closed, Due or Upcoming

```
┌──────────────────────────────────────────────────┐
│ Gynaecologist           Due: 27 May 2026, 18:30  │
│ Last done: Apr 8, 2025                           │
└──────────────────────────────────────────────────┘
```

- **Name**: `body-lg`, bold, `--color-text-primary`, left
- **Due date**: `label-sm` (12px), `--color-amber`, right — **single line, no wrapping ever**. Format: "Due: DD Mon YYYY, HH:MM". Truncate time before wrapping if space is tight.
- **Last done**: `body-md`, `--color-text-secondary`, below name
- Border: 1px `--color-border` · Border radius: `--radius-lg` · Background: `--color-surface` · Min-height: 72px

### Appointment Row — Closed, Not Scheduled

```
┌──────────────────────────────────────────────────┐
│ Eye & Optometrist               Not scheduled    │
└──────────────────────────────────────────────────┘
```

- Name: `body-lg`, `--color-navy`
- "Not scheduled": `body-md`, `--color-text-muted`, right-aligned
- Single-line row, min-height 56px

### Appointment Row — Expanded (Editable)

- Left border: 4px solid `--color-amber`
- Interior padding: 20px
- **LAST COMPLETED**: date-time field, `label-bold` uppercase field label
- **NEXT DUE**: sublabel "(AUTO-COMPUTED, OVERRIDABLE)", date-time input
- **NOTES**: textarea, `body-md`, min 3 lines
- **MARK AS DONE TODAY**: full-width, `--color-navy`, white, `--radius-full`, height 52px
- **SAVE / CANCEL**: secondary buttons, equal width, `--radius-full`

---

## Explore Tab (replaced Coach, Oct 28, 2026)

Full layout and behaviour: BODYCIPHER.md → EXPLORE → UI.

- **Chips:** pill (`--radius-full`), 1px `--color-border`, and a 10px colour square that is filled with the series colour when selected and an empty muted outline when not. A selected chip has a `--color-navy` border and primary text.
- **Series colours:** `--color-series-blue` → `-orange` → `-green` in selection order. When one is removed, the rest move up.
- **Readout:** a standard card with a muted date header (date · tags · injection · off together), and rows at 16px with the value right-aligned.
  - **Notes** are 12px muted: "(prev. day)" after the name, and under the value on its own right-aligned line "in line with last month", "above last month", "below last month" or "not enough history yet". The variable name never wraps.
  - **Tag controls:**
    - a small row at the bottom of the card, above a 1px `--color-border-subtle` divider;
    - text links at 14px/600 in `--color-text-primary` — "Add tag", "Rename Sick", "Edit", "Delete" — with the destructive confirm "Delete" in `--color-danger`;
    - an existing manual tag shows as "Covid · 20–26 Oct" in `--color-text-secondary`.
  - **Inline tag form:** a 12px/600 secondary field label above each field. Inputs are 16px (no iOS zoom), min-height 40px, 1px `--color-border`, `--radius-md`. Start / End dates sit in a 2-column grid. Save / Cancel are text links. Errors are 14px `--color-danger` under the form.
- **Legend** (12px `--color-text-secondary`, above the chart): a short 2px line "7-day average", a faint dot "Daily value", a small dashed rounded box "Off together", a downward triangle "Injection".
- **Chart** (redesign, Oct 28, 2026):
  - 250px tall z-score chart, fixed −3.5…+3.5, with a typical band −1…+1 in `--color-navy-tint` and 1px `--color-border-subtle` grid lines.
  - **Trend lines:** each variable is a 2px solid line of its 7-day average in its series colour, drawn as straight segments with gaps.
  - **Daily dots:** daily values are faint dots (2px radius, 35% opacity) in the same colour, behind the line.
  - **Off together:** stretches are rounded rectangles (6px radius) with a dashed `--color-text-secondary` outline and a very light fill, full plot height, behind dots and lines. There is no amber shading and there are no outlier dots on this chart any more.
  - **Injection triangles** use `--color-text-secondary`.
  - **Tag lane** (badge design, Oct 28, 2026 — it replaced the labelled tag bars, which were unreadable at about 5px per day on a 375px phone), along the top of the chart above the injection triangles:
    - **Numbering:** tags are numbered 1, 2, 3… by start date (manual before automatic on ties). The same numbers appear in the tag list.
    - **Lines:** a 2px line across each tag's dates — solid `--color-text-primary` for manual tags, dashed `--color-text-secondary` for automatic tags (Sick / Travel).
    - **Badges:** a 14px round badge centred over each line, with a 9px/700 number. Manual tags are filled `--color-text-primary` with `--color-surface` text; automatic tags are outlined (surface fill, 1px `--color-text-secondary` stroke and text).
    - **Stacking and spacing:** overlapping tags stack in a second row. Badges shift sideways so none overlap (16px between centres).
    - **Tagged days:** a faint `--color-text-secondary` band (about 7% opacity) across the full plot height, behind stretch boxes, dots and lines.
    - **Interaction:** badges are not separately tappable; a tap selects the nearest day.
- **Tag list** (below the count line, hidden with no tags):
  - **Heading:** "Tags in this window", 14px/600 `--color-text-secondary`.
  - **Rows:** full-width buttons, min-height 36px, with a 1px `--color-border-subtle` divider. Each row has the badge, the label at 14px primary, " (from toggle)" at 12px muted for automatic tags, and the date range right-aligned at 14px secondary.
  - **Tapping a row** selects the tag's first day in the window.
- **Coach** (Phase 3, Oct 29, 2026), below the tag list:
  - **One-tap buttons:** "What do you see?" and "What should I chart next?", stacked, full width. Secondary style: `--color-surface` background, 1px `--color-navy` border, navy text, `--radius-full`, 52px. The label is 16px/600 in sentence case, since these are questions, not category labels. Loading reads "Thinking…"; disabled controls sit at 50% opacity.
  - **Question box:** a pill (`--radius-full`, 1px `--color-border`, `--shadow-input`) with a 16px input ("Ask about this chart") and a 44px `--color-navy` round send button with a white arrow — the old floating chat input's look, inline.
  - **Answers:** a standard card per answer type, with a 14px/600 `--color-text-secondary` heading and the answer as `body-lg` (18px) plain text. A greyed answer uses `--color-text-muted` and a 12px muted note "Based on the previous view".
  - **Errors:** 14px `--color-danger` under the controls.

## Coach Tab — REMOVED (Oct 28, 2026)

The specs below (Briefing Cards, Time Mode Headers) and the Floating Chat Input describe the deleted Coach tab and are kept for reference only.

### Briefing Cards
Use Primary Insight Card styling for each non-null coach field (Recovery · Training · Nutrition · Insight).

- Category label (amber, uppercase, `label-bold`) identifies the card type
- Time mode header displayed above the cards (see table below)

### Time Mode Headers

| Time | Mode | Header |
|---|---|---|
| Before 09:00 | wakeup | Morning Briefing |
| 09:00–12:00 | posttraining | Post-Training Recovery |
| 12:00–17:00 | afternoon | Afternoon Check-in |
| 17:00–20:00 | earlyevening | Evening Wind-Down |
| After 20:00 | endofday | End of Day Review |

---

## Dashboard Tab

### Training Load Card (top of Dashboard)
Uses Primary Insight Card styling. Two states:

**Collapsed:**
- Status label + coloured dot + chevron (rotates 180° when expanded)

**Expanded:**
- Acute TSU + Chronic TSU as sub-metric boxes (white/semi-transparent on navy)
- Ratio bar (see Training Load Ratio Bar spec)
- 30-day trend line with shaded optimal band (0.8–1.3)

### Chart Section
Stacked vertically: HRV — 30 Days · Sleep — 30 Days · Protein — 30 Days · Fiber — 30 Days

See Two-Tone Bar Chart and HRV Line Chart specs above.

### History Rows (bottom of Dashboard)

```
┌──────────────────────────────────────────────────┐
│ Fri, May 8              BEHAV    OUTC         ›  │
│ 🚴 🏃 💧               94       88               │
└──────────────────────────────────────────────────┘
```

- **Date**: `headline-lg`, `--color-text-primary`, left
- **Activity emojis**: small row below the date
- **BEHAV / OUTC labels**: `label-bold` uppercase, `--color-text-secondary`
- **Score values**: `headline-lg`, coloured by threshold:
  - **80 and above** → `--color-status-optimal` (green)
  - **65–79** → `--color-status-moderate` (amber)
  - **Below 65** → `--color-status-low` (orange)
- Chevron: `--color-text-muted`, right edge
- Border: 1px `--color-border` · Border radius: `--radius-lg` · Shadow: `--shadow-card` · Min-height: 72px

---

## What Not To Do

- Never use Inter, Roboto, or system fonts — always Manrope
- Never use text below 16px outside of units, spectrum labels, and calendar due dates
- Never use fixed-width elements that cause horizontal overflow on iPhone
- Never use heavy box shadows
- Never stack more than 2 columns on mobile
- Never use pure black (#000000) anywhere
- Never use hardcoded colour values — always CSS custom properties
- Never conflate amber (#FFBF00) with warning orange (#F97316) — they are semantically distinct
- Never rewrite whole component files — targeted edits only
- Never let a Health Calendar due date wrap to a second line
- Never merge the current value marker and target marker on the VO2 Max spectrum bar
- Never swap chevron icons on click — use `transform: rotate(180deg)` with a CSS transition
- Never omit the amber left-border accent on the Training accordion
- Never add a 5th tab, rename existing tabs, or restructure navigation without explicit instruction
- Never treat the Stitch reference screens as the navigation specification — they are component visual reference only
