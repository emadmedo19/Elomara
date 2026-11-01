---
name: Bonyan Modern HOA
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#43474c'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#74777d'
  outline-variant: '#c3c7cd'
  surface-tint: '#4c6075'
  primary: '#000f1d'
  on-primary: '#ffffff'
  primary-container: '#0f2537'
  on-primary-container: '#788da3'
  inverse-primary: '#b3c9e0'
  secondary: '#006a61'
  on-secondary: '#ffffff'
  secondary-container: '#86f2e4'
  on-secondary-container: '#006f66'
  tertiary: '#1a0900'
  on-tertiary: '#ffffff'
  tertiary-container: '#3a1b00'
  on-tertiary-container: '#d17200'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cfe5fd'
  primary-fixed-dim: '#b3c9e0'
  on-primary-fixed: '#061d2f'
  on-primary-fixed-variant: '#34495c'
  secondary-fixed: '#89f5e7'
  secondary-fixed-dim: '#6bd8cb'
  on-secondary-fixed: '#00201d'
  on-secondary-fixed-variant: '#005049'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-hero:
    fontFamily: IBM Plex Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-hero-mobile:
    fontFamily: IBM Plex Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: IBM Plex Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: IBM Plex Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: IBM Plex Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: IBM Plex Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  label-currency:
    fontFamily: IBM Plex Sans
    fontSize: 13px
    fontWeight: '700'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-tablet: 1.5rem
  gutter-desktop: 2rem
  margin: 1rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system is tailored for premium residential property and homeowners association (HOA) management within the contemporary Egyptian real estate landscape. It addresses both property managers and residents who value financial transparency, architectural prestige, and frictionless community operations.

The aesthetic fuses **Modern Corporate Real Estate Precision** with **Subtle Levantine Luxury**:
- **Tone & Mood:** Authoritative, immaculate, reassuring, and dignified. It eliminates administrative anxiety around maintenance fees, reserve funds, and repair requests through structural clarity.
- **RTL-First Native Experience:** Complete architectural parity between Arabic and Latin scripts, prioritizing Arabic typography as the anchor of the user's spatial intuition.
- **Visual Tenets:** Generous breathing room, polished high-density financial data presentation, restrained architectural geometry, and tactfully applied micro-elevations reminiscent of high-end architectural portfolio prints.

## Colors

The palette leverages high-contrast architectural tones balanced by functional ledger accents:

- **Primary Canvas & Architectural Base:**
  - `Primary Navy` (`#0F2537`): Foundational brand color, used for top app bars, primary action buttons, structural headings, and master summaries.
  - `Deep Indigo Accent` (`#1E3A8A`): Secondary layer for interactive states, navigation indicators, and active selection perimeters.
- **Financial Status & Ledger Indicators:**
  - `Emerald / Teal` (`#059669` / `#0D9488`): Designates positive cash flows, settled dues, fully funded reserve targets, and approved facility tickets.
  - `Debt / Urgency Coral` (`#E11D48`): Flags overdue maintenance allocations, critical elevator/water pump outages, and pending fines.
  - `Amber / Pending` (`#D97706`): Flags upcoming collections, escrow holds, and in-review board resolutions.
- **Neutral Grounds & Surface Framework:**
  - `Canvas Background`: Pristine, glare-reducing Cool Slate (`#F8FAFC`).
  - `Card / Sheet Surface`: Pure White (`#FFFFFF`).
  - `Structural Border`: Micro-refined Slate Border (`#E2E8F0`).
  - `Subtext & Muted Metadata`: Neutral Slate (`#64748B`).

## Typography

The typographic hierarchy is built on **IBM Plex Sans** (with fallback to native Arabic variants such as IBM Plex Sans Arabic / Cairo), selected for its engineered balance between technical discipline and contemporary humanism:

- **Bilingual Typographic Harmony:** Font sizes maintain a slightly augmented vertical line-height multiplier (1.45–1.55x) to accommodate Arabic ascenders, descenders, and complex diacritics without clipping.
- **Financial & Ledger Numerals:** Numeric figures use tabular lining (`tnum`) to ensure numerical alignment across apartment ledgers, monthly contributions, and bank reconciliation lists.
- **Currency Styling (`ج.م` / EGP):** Egyptian Pound signs (`ج.م`) are anchored with the specialized `label-currency` token, scaled slightly smaller than the integer string, set with subtle horizontal padding, and tinted neutrally to let the amount lead visually.

## Layout & Spacing

Layouts follow a fluid, responsive structure designed specifically for mobile-first handheld workflows:

- **Grid Discipline:**
  - Mobile (≤640px): 4-column fluid layout with `1rem` margins and `1rem` gutters.
  - Tablet (641px–1024px): 8-column layout with `2rem` margins for dashboard split views (Resident Directory / Unit Ledger).
  - Desktop (>1024px): 12-column bounded layout maxing out at `1280px` centered canvas.
- **RTL Geometric Inversion:** All spatial rules respect bi-directional flow. Start-margins, padding arrays, chevron pointers, and badge alignments invert naturally in Arabic locales without layout collapse.
- **Safe Area Insets:** Fixed bottom action buttons and floating modals maintain a compulsory baseline padding incorporating mobile system gestures (`env(safe-area-inset-bottom)` + `1rem`).

## Elevation & Depth

Visual hierarchy uses architectural layering rather than dramatic skeuomorphism:

- **Level 0 (Base Canvas):** `#F8FAFC`, flat ground representing the foundation plane.
- **Level 1 (Card & Module Containers):** `#FFFFFF` paired with an ultra-delicate outline (`1px solid #E2E8F0`) and an ambient, low-contrast diffuse shadow: `0px 2px 8px -2px rgba(15, 37, 55, 0.04), 0px 1px 3px 0px rgba(15, 37, 55, 0.02)`.
- **Level 2 (Dropdowns, Segment Selectors, Active Cards):** Lifted layer using `0px 8px 16px -4px rgba(15, 37, 55, 0.08), 0px 2px 4px -1px rgba(15, 37, 55, 0.03)` with border `#CBD5E1`.
- **Level 3 (Sticky Bottom Sheets, Quick Action Drawers):** Elevated sheet with top border highlight and backdrop blur: `0px -8px 24px 0px rgba(15, 37, 55, 0.12)`, backed by a `backdrop-filter: blur(8px)` with 40% `#0F2537` scrim for dialog backdrops.

## Shapes

The design system incorporates modern, welcoming curvature designed to soften multi-tenant administrative tasks:

- **Container Shapes (`rounded-2xl` / `1rem`):** Primary cards, balance breakdown blocks, and building notice boards adopt a smooth `16px` radius (`rounded-lg` in base scale), generating an approachable, contemporary finish.
- **Action Shapes (`rounded-xl` / `0.75rem`):** Input fields, interactive filter chips, and primary transaction buttons use `12px` radius.
- **System Tags & Status Pills (`rounded-full`):** Financial badges, unit indicator tags (e.g., `شقة ٤٠٢`), and status chips utilize fully circular ends (`9999px`) to visually segregate operational tags from interactive rectangular cards.

## Components

### Buttons
- **Primary Action (Payment, Submit Ticket):** Solid `#0F2537` background, white text, height `48px`, `12px` border radius, weighted bold font (`label-lg`). Hover/active transitions to `#1E3A8A`.
- **Secondary (Download Statement, Details):** `#FFFFFF` surface with `1px solid #E2E8F0` border, `#0F2537` text. Active state subtly darkens to `#F1F5F9`.
- **Urgent / Debt Settlement Action:** Solid `#E11D48` background with pure white typography for high-urgency delinquent dues payment.

### Cards & Ledger Blocks
- **Balance Card:** Dual-tone or high-relief white cards featuring top-border accent strips: Emerald (`#059669`) for positive treasury reserves; Coral (`#E11D48`) for outstanding dues.
- **Padding Hierarchy:** Inner card padding strictly clamped to `space-md` (`1rem`) on mobile, increasing to `space-lg` (`1.5rem`) on larger screens.

### Badges & Currency Tags
- **Currency Indicators:** Tactile tag styling pairing numerical sum with Arabic currency marker (`ج.م`).
  - *Paid / Current:* Emerald background tint (`rgba(5, 150, 105, 0.10)`), text `#059669`.
  - *Overdue / Unpaid:* Coral background tint (`rgba(225, 29, 72, 0.10)`), text `#E11D48`.
  - *Pending Verification:* Amber background tint (`rgba(217, 119, 6, 0.10)`), text `#D97706`.

### Form Fields & Inputs
- **Text & Numeric Inputs:** Minimalist `48px` input box, background `#FFFFFF`, border `1px solid #CBD5E1`.
- **Focus State:** `2px solid #0F2537` accompanied by `0px 0px 0px 3px rgba(15, 37, 55, 0.10)`. RTL alignment natively positions unit icons or helper tags (e.g., phone prefix `+20`) smoothly at the physical trailing end.

### Lists & Directories
- **Unit Resident Row:** Separated by discrete `1px` borders (`#F1F5F9`). Includes avatar/unit number badge on the physical right (in RTL), tenant name and occupancy status in center, and financial state chip on the physical left.

### Specialized Components
- **HOA Announcement Banner:** Muted Navy background (`#F8FAFC` base with `#0F2537` structural frame), featuring building maintenance alerts, emergency water shut-offs, and general assembly voting notifications.