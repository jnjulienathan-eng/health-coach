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
  --color-navy:        #001F3F;   /* Primary — headers, primary cards, active nav, save buttons */
  --color-amber:       #FFBF00;   /* Accent — progress bars, active toggles, status highlights, icons */
  --color-background:  #F9F9F8;   /* App background — warm off-white, never pure white */
  --color-surface:     #FFFFFF;   /* Card surfaces — maximum lift against background */

  /* Text */
  --color-text-primary:   #001F3F;  /* Main text — same as navy */
  --color-text-secondary: #6F88AD;  /* Supporting text, metadata, labels */
  --color-text-muted:     #878686;  /* Placeholder text, inactive states */

  /* Borders */
  --color-border:         #C4C6CF;  /* Card borders, dividers */
  --color-border-subtle:  #E2E2E2;  /* Subtle separators inside accordions */

  /* Semantic status colours — used for HRV states and metric cards */
  --color-status-optimal:  #22C55E;  /* Green — HRV > 100, sleep quality high */
  --color-status-good:     #84CC16;  /* Light green — HRV 80–100 */
  --color-status-moderate: #FFBF00;  /* Amber — HRV 60–80 */
  --color-status-low:      #F97316;  /* Orange — HRV < 60 */
  --color-status-rest:     #94A3B8;  /* Grey — rest day */
}
```



---

## Typography

All text uses **Manrope** exclusively. Import via Google Fonts.


```css
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
```



| Token | Size | Weight | Usage |
|---|---|---|---|
| `score-display` | 48px | 800 | Big metric numbers (HRV, sleep score) |
| `display-lg` | 40px | 800 | Hero greeting text |
| `headline-xl` | 32px | 700 | Section titles, Morning Briefing header |
| `headline-lg` | 24px | 700 | Accordion headers, card titles |
| `body-lg` | 18px | 400 | Primary body text, coach insights |
| `body-md` | 16px | 400 | Secondary body text, field values |
| `label-bold` | 14px | 700 | Category labels — ALWAYS uppercase, letter-spacing 0.05em |
| `label-sm` | 12px | 500 | Sub-labels, units (ms, mmol/L, kcal) |

**Critical rule**: Text outside accordions must never fall below 16px. The previous design had illegible small text throughout — this must not recur.

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
  --radius-sm:   4px;    /* Subtle rounding — tags, badges */
  --radius-md:   8px;    /* Default — most cards */
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

### Primary Insight Card (Coach tab)
The hero element on the Coach screen.

- Background: `--color-navy`
- Left border: 4px solid `--color-amber`
- Text: white
- Border radius: `--radius-xl`
- Contains: category label (amber, uppercase), headline insight, supporting detail, optional progress bar in amber

### Accordion — Closed State

```
┌──────────────────────────────────┐
│ [icon]  Section Title        ∨   │
│          Status summary text     │
└──────────────────────────────────┘
```


- Background: `--color-surface`
- Border: 1px `--color-border`
- Border radius: `--radius-lg`
- Title: `headline-lg`
- Status summary: `body-md` in `--color-text-secondary`
- Chevron rotates 180° when open (CSS transition)
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
5 tabs: Dashboard · Training · Nutrition · Supplements · Goals

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
- **Mark All Taken**: full width, `--color-navy`, white text, inside accordion header
- Never use half-width buttons that might overflow on small screens

---

## Contextual Hero Image Pattern (Dashboard)

The Dashboard tab shows a full-width hero image that reflects the training state of the day. This is a core BodyCipher pattern — the app should feel alive and personal, not like a data grid.

Image treatment:
- Full width, height ~240px
- Gradient overlay: `linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.5) 100%)`
- Greeting text and primary insight overlaid on image in white
- `border-radius: 0` — image bleeds to screen edges

### HRV Training States → Image Mood Mapping

| State | HRV Threshold | Image Mood | Keywords |
|---|---|---|---|
| Hard | > 100 | Energy, motion, dawn light | forest runner, sunrise trail, motion blur |
| Moderate | 80–100 | Focused, purposeful | calm lake morning, steady movement |
| Easy | 60–80 | Gentle, natural | soft light through trees, walking path |
| Rest | < 60 | Restorative, still | still water, misty dock, morning calm |
| No data | — | Neutral, warm | warm morning light, soft bokeh |

Source images from Unsplash API (free tier, 50 req/hour — more than sufficient for solo use). Search keyword maps to the mood column above.

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
- Never use text smaller than 16px outside of unit labels
- Never use fixed-width elements that cause horizontal overflow on iPhone
- Never use heavy box shadows
- Never stack more than 2 columns on mobile
- Never use pure black (#000000) anywhere
- Never add excessive rounded corners to every element — use the radius scale intentionally
- Never rewrite whole component files — always targeted edits
