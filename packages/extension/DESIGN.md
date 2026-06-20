---
version: alpha
name: Keb
description: "Keb is a Chrome side panel extension for building personal knowledge bases. The design is utilitarian, monochrome, and professional — prioritizing information density and clarity over visual flourish. All color tokens use the OKLCH color space."
colors:
  background: oklch(1 0 0)
  foreground: oklch(0.145 0 0)
  card: oklch(1 0 0)
  card-foreground: oklch(0.145 0 0)
  popover: oklch(1 0 0)
  popover-foreground: oklch(0.145 0 0)
  primary: oklch(0.205 0 0)
  primary-foreground: oklch(0.985 0 0)
  secondary: oklch(0.97 0 0)
  secondary-foreground: oklch(0.205 0 0)
  muted: oklch(0.97 0 0)
  muted-foreground: oklch(0.556 0 0)
  accent: oklch(0.97 0 0)
  accent-foreground: oklch(0.205 0 0)
  destructive: oklch(0.577 0.245 27.325)
  border: oklch(0.922 0 0)
  input: oklch(0.922 0 0)
  ring: oklch(0.708 0 0)
  background-dark: oklch(0.145 0 0)
  foreground-dark: oklch(0.985 0 0)
  card-dark: oklch(0.205 0 0)
  card-foreground-dark: oklch(0.985 0 0)
  primary-dark: oklch(0.922 0 0)
  primary-foreground-dark: oklch(0.205 0 0)
  muted-dark: oklch(0.269 0 0)
  muted-foreground-dark: oklch(0.708 0 0)
  accent-dark: oklch(0.269 0 0)
  accent-foreground-dark: oklch(0.985 0 0)
  destructive-dark: oklch(0.704 0.191 22.216)
  border-dark: oklch(1 0 0 / 10%)
  input-dark: oklch(1 0 0 / 15%)
  ring-dark: oklch(0.556 0 0)
typography:
  heading:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  caption:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.4
  code:
    fontFamily: monospace
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.6
  title:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.3
  subtitle:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.3
  status-label:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0.05em
rounded:
  sm: 6px
  md: 8px
  lg: 10px
  xl: 14px
  "2xl": 18px
  "3xl": 22px
  "4xl": 26px
  full: 9999px
spacing:
  base: 16px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  "2xl": 24px
  panel-padding: 16px
  header-padding-vertical: 10px
  header-padding-horizontal: 12px
  footer-padding-vertical: 6px
  footer-padding-horizontal: 12px
  tab-content-padding: 16px
components:
  button-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    padding: 10px 12px
    height: 32px
    typography: "{typography.label}"
  button-default-hover:
    backgroundColor: oklch(from oklch(0.205 0 0) calc(l * 0.8) c h)
  button-outline:
    backgroundColor: transparent
    textColor: "{colors.foreground}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    height: 32px
    typography: "{typography.label}"
  button-outline-hover:
    backgroundColor: "{colors.muted}"
  button-destructive:
    backgroundColor: oklch(from oklch(0.577 0.245 27.325) calc(l * 0.1) c h)
    textColor: "{colors.destructive}"
    rounded: "{rounded.lg}"
    height: 32px
    typography: "{typography.label}"
  button-destructive-hover:
    backgroundColor: oklch(from oklch(0.577 0.245 27.325) calc(l * 0.2) c h)
  button-primary-action:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    height: 36px
    padding: 10px 16px
    typography: "{typography.label}"
  input:
    backgroundColor: transparent
    textColor: "{colors.foreground}"
    borderColor: "{colors.input}"
    rounded: "{rounded.lg}"
    height: 32px
    padding: 8px 10px
    typography: "{typography.body-sm}"
    placeholderColor: "{colors.muted-foreground}"
  input-focus:
    borderColor: "{colors.ring}"
    ringColor: oklch(from oklch(0.708 0 0) l c h / 50%)
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    ringColor: oklch(from oklch(0.145 0 0) l c h / 10%)
    padding: 16px
  card-sm:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    padding: 12px
  badge-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.4xl}"
    height: 20px
    typography: "{typography.label}"
    fontSize: 12px
  badge-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.4xl}"
    height: 20px
    typography: "{typography.label}"
    fontSize: 12px
  tabs-trigger:
    textColor: oklch(0.145 0 0 / 60%)
    rounded: "{rounded.md}"
    typography: "{typography.label}"
  tabs-trigger-active:
    textColor: "{colors.foreground}"
    backgroundColor: "{colors.card}"
  tabs-trigger-line-active-indicator:
    backgroundColor: "{colors.foreground}"
    rounded: "{rounded.full}"
    height: 2px
  select-trigger:
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    height: 28px
    typography: "{typography.label}"
  select-popup:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.popover-foreground}"
    rounded: "{rounded.lg}"
    boxShadow: 0 4px 16px oklch(0 0 0 / 10%)
    ringColor: oklch(from oklch(0.145 0 0) l c h / 10%)
  tooltip:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    rounded: "{rounded.md}"
    padding: 6px 12px
    typography: "{typography.label}"
  alert-dialog:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.popover-foreground}"
    rounded: "{rounded.xl}"
    ringColor: oklch(from oklch(0.145 0 0) l c h / 10%)
    maxWidth: 320px
  separator:
    backgroundColor: "{colors.border}"
  scrollbar:
    thumbColor: "{colors.border}"
    trackWidth: 10px
---

# Keb — Knowledge Bases

## Overview

Keb is a Chrome side panel extension that compiles URLs and web content into a personal, LLM-powered knowledge base. The design is **utilitarian monochrome** — a tool-first interface that favors information density, clarity, and system-font reliability over visual decoration. The UI feels like a developer dashboard: compact, no-nonsense, and optimized for the narrow constraints of a browser side panel (~350–500px wide).

The brand personality is **professional and precise**. It should feel like a power tool, not a toy. Every pixel serves a purpose. White space is tight, text sizing is small, and status feedback is immediate through color-coded indicators (green for connected, yellow for working, red for errors). The interface supports system dark mode automatically.

## Colors

Keb uses an **achromatic grayscale palette** built in the OKLCH color space, with zero chroma for all structural colors. Red is reserved exclusively for destructive actions and errors. This monochrome approach makes the interface recede, keeping the user's focus on content.

Light mode uses a **white-on-near-black** scheme. Dark mode inverts to a **near-black-on-white** scheme.

- **Background (`oklch(1 0 0)`):** Pure white page background. In dark mode, deep near-black (`oklch(0.145 0 0)`).
- **Foreground (`oklch(0.145 0 0)`):** Near-black for maximum readability on body text, headlines, and labels. In dark mode, near-white (`oklch(0.985 0 0)`).
- **Card (`oklch(1 0 0)`):** Pure white card surfaces create light-on-light containment. In dark mode, slightly lighter than background for the same effect.
- **Muted (`oklch(0.97 0 0)`):** Soft gray used for secondary surfaces, code blocks, and timeline panels. Its foreground (`oklch(0.556 0 0)`) is a medium gray for captions, hints, and metadata.
- **Border (`oklch(0.922 0 0)`):** Very light gray hairline dividers. In dark mode, transparent white (`oklch(1 0 0 / 10%)`) for subtle separation.
- **Destructive (`oklch(0.577 0.245 27.325)`):** A medium-saturation red used only for "Clear Workspace" actions, error messages, and the offline status. Tinted backgrounds at 10–20% opacity accompany destructive text.
- **Ring (`oklch(0.708 0 0)`):** Medium gray for focus-visible outlines on interactive elements, paired with 50% opacity ring.

### Status Indicators

Status follows a semaphore convention:

- **Connected:** Green dot with a glow (`shadow-[0_0_6px_var(--color-green-500)]`).
- **Disconnected:** Red dot with glow.
- **Connecting:** Yellow dot with glow and `animate-pulse`.
- **Reconnecting:** Red dot (same as disconnected).

### Accent Colors in Context

- **Amber** for "pending" warnings (repair badge, blocked URL hint).
- **Green** for completion states (done checkmarks, connected status).
- **Red** for errors, destructive actions, offline status.
- **Blue** for operational progress (adding URLs, running tools in the timeline).

## Typography

Keb uses the **native system font stack** exclusively — no custom web fonts are loaded. This keeps the extension lightweight, ensures instant text rendering, and aligns with the tool-like, platform-native feel.

The font stack is: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

- **Headings (`title`, `subtitle`):** 600 weight at 18px and 16px respectively. Used for document titles, browse detail headings, and section headers. Tight line-height (1.3) for density.
- **Body text (`body`):** 400 weight at 14px and 1.6 line-height for readable prose in markdown content. The `body-sm` variant (13px) is used for inputs and compact text.
- **Labels (`label`):** 500 weight at 12px with normal letter-spacing. Applied to input labels, button text, tab triggers, and select items.
- **Captions (`caption`):** 11px for status text, footer metrics, helper text below inputs, and timestamps.
- **Status labels (`status-label`):** 11px uppercase with 0.05em tracking for connection status text in the header.
- **Code (`code`):** Browser default monospace at 12px for inline code and pre-formatted blocks.

### Markdown Content

Rendered markdown (in query results and browse detail) uses the system font stack at 14px with 1.6 line-height. Headings descend from 18px → 16px → 14px (h1 → h2 → h3). Links use the primary color with underline. Code blocks use a muted background with monospace font.

## Layout & Spacing

Keb lives in a Chrome side panel — a narrow, tall viewport. The layout follows a **vertical stack** pattern.

### Structure (top-to-bottom)

1. **Header** (shrink-0): Logo, title, workspace selector (local mode) or username badge (hosted mode), help icon, settings icon, connection status dot + label. 10px vertical padding, 12px horizontal.
2. **Tabs** (fills available space): Three-tab navigation — Consult, Add Knowledge, Browse. Uses the "line" variant with an underline active indicator. Each tab is `flex-1` with `gap-1.5`, 12px horizontal padding.
3. **Content** (fills remainder): Tab-specific panels with 16px padding.
4. **Footer** (shrink-0): Doc/concept count, pending repair badge, agent status indicator. 6px vertical padding, 12px horizontal, with a top border separating it from content.

### Spacing Scale

Keb uses a **4px half-step, 8px base step** spacing system adapted for the compact side panel:

- Base unit: 16px (`base`, `xl`)
- Tight group gaps: 6px (`sm`)
- Element gaps: 8px (`md`)
- Section gaps: 12px (`lg`)
- Content padding: 16px (`panel-padding`, `tab-content-padding`)
- Micro adjustments: 4px (`xs`)

### Narrow Panel Adaptation

The header collapses the title from "Keb — Knowledge Bases" to "Keb" below 500px width (detected via `ResizeObserver`). The workspace selector shrinks to `w-32`.

## Elevation & Depth

Keb uses a **flat-layered** elevation model. Depth is conveyed through borders and subtle rings rather than drop shadows.

- **Background layer:** The page root (`bg-background`). No depth cues.
- **Card layer:** A subtle `ring-1 ring-foreground/10` creates a hairline outline around card surfaces, distinguishing them from the background without shadow.
- **Floating layer (popups, dialogs):** Use `shadow-md` (4px vertical offset, medium blur) with `ring-1 ring-foreground/10` for select dropdowns. Alert dialogs center over a semi-transparent black backdrop (`bg-black/10`) with optional `backdrop-blur-xs`.
- **Tooltips:** Solid foreground-colored background with no shadow — high contrast against content.
- **Bottom status bar:** Separated by `border-t` — no elevation, just a dividing line.

## Shapes

Corner radii are **generous but consistent**, based on a `10px` base radius:

| Level  | Value  | Usage                                       |
| ------ | ------ | ------------------------------------------- |
| `sm`   | 6px    | Tabs, small elements                        |
| `md`   | 8px    | Tooltips, small popups                      |
| `lg`   | 10px   | Buttons, inputs, selects, scrollbar corners |
| `xl`   | 14px   | Cards, alert dialog popups                  |
| `4xl`  | 26px   | Badge pills                                 |
| `full` | 9999px | Status dots                                 |

All corners within a component group are consistent. Buttons use `rounded-lg` (10px). Cards use `rounded-xl` (14px). Inputs and selects use `rounded-lg` (10px) to match buttons.

## Components

### Buttons

Buttons have a compact `h-8` default with `10px` corner radius. A subtle `1px` translate-down on `:active` gives tactile feedback. Focus-visible shows a ring outline.

- **Default:** Solid primary background (near-black light, near-white dark). Used for primary actions (Fetch & Add, Ask, Sign In).
- **Outline:** Transparent background with border. Used for secondary actions and modal cancellations.
- **Destructive:** Transparent red-tinted background. Used only for "Clear Workspace" and similar danger zones.
- **Ghost:** No border or background, only hover state. Used for icon-only buttons (settings, help).
- **Link:** Text-only underlined button.

### Inputs

Compact `h-8` text inputs with `10px` corner radius and transparent background. On focus, the border transitions to the ring color with a 3px ring glow at 50% opacity. Helper text below inputs uses 10px muted caption text. Disabled inputs get a transparent tinted background and reduced opacity.

### Tabs

The main tab navigation uses the "line" variant: tabs have no border or background in their default state. The active tab is indicated by a 2px underline bar that animates via `opacity` transitions. Active tab text uses full foreground color; inactive tabs use `text-foreground/60`. Hover transitions to full foreground.

### Cards

Cards use `rounded-xl` (14px) with a subtle hairline ring. They have a header → content → footer structure. On the Browse page, document list items are plain `rounded-md` rows with `hover:bg-accent` — no card wrapper. The `sm` card variant reduces padding from 16px to 12px.

### Badges

Compact `h-5` pill badges with `rounded-4xl` (26px). Used for tags in browse detail views and for the pending repair indicator in the footer. The pending badge uses `text-amber-500` with an underline to signal interactivity.

### Selects

Compact (`h-7`) select triggers for workspace switching in the header. Uses a chevron icon. The popup menu has a subtle shadow and ring with `rounded-lg`. Items highlight on hover/focus with accent background.

### Alert Dialogs

Centered modal overlay with `rounded-xl`, max-width 320px. A semi-transparent backdrop with optional blur. The footer is has a tinted background (`bg-muted/50`) with cancel (outline) and confirm (destructive) buttons side by side.

### Tooltips

Foreground-colored background with white text. Positioned with a 4px offset. Includes a small arrow indicator. Animated with fade-in + zoom-in.

### Scroll Areas

Custom thin scrollbar (10px track width) with `bg-border` thumb. The thumb is rounded-full. Used in Browse (long lists), Add/Query (streaming operation timelines), and anywhere content overflows.

### Markdown Content

Rendered via `markdown-it` with `breaks`, `linkify`, and `typographer` enabled. Styling is defined in a `.markdown-content` CSS layer:

- Headings descend from 18px h1 → 14px h4+ with semibold/medium weight.
- Lists use standard disc/decimal bullets with compact spacing.
- Blockquotes have a left border in muted-foreground at 30% opacity.
- Code blocks have a muted background, monospace font at 12px.
- Tables have full-width, bordered cells with muted header row.
- Links are primary-colored with underline.

### Operation Timeline (Add/Query)

The streaming operation timeline shows tool execution events and text deltas interleaved. Tool entries display with icon prefixes: green checkmark for completion, wrench icon for execution starts/ends. Text deltas are separated by bottom borders and rendered as full markdown. The timeline lives in a contained area with a status header ("Compiling — keep this tab open until done" or "Complete!").

## Do's and Don'ts

- Do maintain an achromatic palette — color should be meaningful (green=ok, red=error, amber=warning, blue=in-progress), not decorative.
- Do use compact spacing — the side panel is narrow; every pixel counts.
- Do keep button text in sentence case ("Fetch & Add", "Clear Workspace", not "fetch and add").
- Do use system fonts exclusively — no custom web fonts that delay rendering or bloat the extension.
- Do apply a `1px` active-state press-down on buttons for tactile feedback.
- Don't use drop shadows on structural surfaces — use hairline rings (`ring-1 ring-foreground/10`) instead.
- Don't mix corner radius styles within the same component group.
- Don't exceed two font sizes on any single screen — the scale is intentionally flat.
- Don't use color as the only indicator for status — pair it with text labels (e.g., "connected" / "disconnected").
- Don't disable dark mode support — both themes must be maintained as CSS custom properties.
- Don't add animations that delay user interaction — only use them for feedback (spin, pulse) and micro-transitions (hover, focus).
- Don't use border-radius larger than `xl` (14px) on containers — save `4xl` for badges and `full` for status dots.
