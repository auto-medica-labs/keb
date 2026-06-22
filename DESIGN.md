---
version: beta
name: Keb
description: "Design system for Keb — a utilitarian, monochrome, and professional UI. All color tokens use the OKLCH color space. This document describes the reusable visual primitives: colors, typography, spacing, elevation, shapes, icons, animations, interactive states, and components. Panel/page layouts are intentionally omitted — they belong to each app that adopts this system."
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
  secondary-dark: oklch(0.269 0 0)
  secondary-foreground-dark: oklch(0.985 0 0)
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
---

# Keb — Design System

## Overview

The Keb design system is **utilitarian monochrome** — a tool-first interface that favors information density, clarity, and system-font reliability over visual decoration. The brand personality is **professional and precise**: it should feel like a power tool, not a toy. Every pixel serves a purpose. White space is tight, text sizing is small, and status feedback is immediate through color-coded indicators.

This document describes the reusable design primitives only — colors, typography, spacing, shapes, icons, animation, interactive states, and components. **Panel layouts and page structures are intentionally excluded** because each app that adopts this system has its own functionality and information architecture. The primitives here ensure visual consistency regardless of what your app does.

If you're adapting this system, pull tokens and component definitions directly from this document — do not approximate. The system font stack, the OKLCH grayscale palette, the compact spacings, and the specific component styling are what define the brand.

## Colors

Keb uses an **achromatic grayscale palette** built in the OKLCH color space, with zero chroma for all structural colors. Red is reserved exclusively for destructive actions and errors. This monochrome approach makes the interface recede, keeping the user's focus on content.

Light mode uses a **white-on-near-black** scheme. Dark mode inverts to a **near-black-on-white** scheme.

### CSS Custom Properties

These are the actual tokens in use. Set them on `:root` for light mode and `.dark` for dark mode. No `oklch-from` transforms are used in production — dark values are explicit.

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --radius: 0.625rem;
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
}
```

### Token Reference

| Token            | Light               | Dark                    | Purpose                          |
|------------------|---------------------|-------------------------|----------------------------------|
| background       | `oklch(1 0 0)`      | `oklch(0.145 0 0)`      | Page root (all surfaces rest on) |
| foreground       | `oklch(0.145 0 0)`  | `oklch(0.985 0 0)`      | Body text, headlines, labels     |
| card             | `oklch(1 0 0)`      | `oklch(0.205 0 0)`      | Elevated surfaces (header, footer, cards) |
| popover          | `oklch(1 0 0)`      | `oklch(0.205 0 0)`      | Floating surfaces (dropdowns, dialogs) |
| primary          | `oklch(0.205 0 0)`  | `oklch(0.922 0 0)`      | Primary action buttons           |
| secondary        | `oklch(0.97 0 0)`   | `oklch(0.269 0 0)`      | Secondary surface background     |
| muted            | `oklch(0.97 0 0)`   | `oklch(0.269 0 0)`      | Code blocks, timeline containers |
| muted-foreground | `oklch(0.556 0 0)`  | `oklch(0.708 0 0)`      | Captions, hints, metadata        |
| accent           | `oklch(0.97 0 0)`   | `oklch(0.269 0 0)`      | Hover backgrounds on list items  |
| destructive      | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` | Errors, destructive actions |
| border           | `oklch(0.922 0 0)`  | `oklch(1 0 0 / 10%)`    | Hairline dividers                |
| input            | `oklch(0.922 0 0)`  | `oklch(1 0 0 / 15%)`    | Input borders                    |
| ring             | `oklch(0.708 0 0)`  | `oklch(0.556 0 0)`      | Focus-visible outlines           |

### Semantic Color Usage

| Use            | Token         | Where                                                   |
|----------------|---------------|---------------------------------------------------------|
| Success/ok     | green-500     | Connected status dot, checkmarks, completion labels     |
| Warning        | amber-500     | Pending badges, caution notices                         |
| Error          | destructive   | Error text, destructive buttons, error state labels     |
| In-progress    | blue-400      | Progress indicators, running operation text             |

### Pair Color with Text

Never use color as the only indicator for status — always pair it with a text label (e.g., dot + "Connected" label, not just a green dot).

## Typography

Keb uses the **native system font stack** exclusively — no custom web fonts. This keeps the UI lightweight, ensures instant text rendering, and aligns with the tool-like, platform-native feel.

```css
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
--font-heading: var(--font-sans);
--font-mono: monospace;
```

### Font Scale

| Name          | Size  | Weight | Line Height | Usage                                  |
|---------------|-------|--------|-------------|----------------------------------------|
| title         | 18px  | 600    | 1.3         | Document titles, page headings         |
| subtitle      | 16px  | 600    | 1.3         | Section headers, secondary titles      |
| body          | 14px  | 400    | 1.6         | Prose, markdown content                |
| body-sm       | 13px  | 400    | 1.5         | Input values, compact text             |
| label         | 12px  | 500    | 1.4         | Input labels, button text, tab labels  |
| caption       | 11px  | 400    | 1.4         | Status text, timestamps, helper text   |
| status-label  | 11px  | 400    | 1.4         | Uppercase connection status (0.05em tracking) |
| code          | 12px  | 400    | 1.6         | Inline code, pre blocks                |

**Rule:** Don't exceed two font sizes on any single screen — the scale is intentionally flat.

### Text Truncation

Use `line-clamp-1` and `truncate` for single-line overflow. For ellipsis on elements that can't use those (e.g. inline spans), use `max-w-{n} truncate`.

## Layout & Spacing

### Spacing Scale

Keb uses a **4px half-step, 8px base step** system, adapted for compact UIs:

| Token | Value | Typical Use                    |
|-------|-------|--------------------------------|
| xs    | 4px   | Micro adjustments, tight gaps  |
| sm    | 6px   | Dense group gaps               |
| md    | 8px   | Element gaps (input ↔ button)  |
| lg    | 12px  | Section gaps, card body gaps   |
| xl    | 16px  | Base unit, content padding     |
| 2xl   | 24px  | Generous section separation    |

### Width Constraints

The design is optimized for **narrow viewports (350–500px)**. Keep panels compact. Use `flex-1` and `min-w-0` to let content shrink gracefully.

### Narrow Viewport Adaptation

For variable-width containers, use a `ResizeObserver` (not CSS media queries — the consumer controls width, not viewport). Example pattern:

```ts
const [isNarrow, setIsNarrow] = useState(false);
const ref = useRef<HTMLDivElement>(null);

useEffect(() => {
  const el = ref.current;
  if (!el) return;
  const observer = new ResizeObserver(([entry]) => {
    setIsNarrow(entry.contentRect.width < 500);
  });
  observer.observe(el);
  return () => observer.disconnect();
}, []);
```

## Elevation & Depth

Keb is **flat-layered**. Depth comes from borders and hairline rings, not drop shadows.

| Layer        | Treatment                                                     |
|--------------|---------------------------------------------------------------|
| Background   | `bg-background`. No depth cues.                               |
| Card         | `ring-1 ring-foreground/10` — subtle hairline outline.        |
| Popup/Dialog | `shadow-md ring-1 ring-foreground/10`.                        |
| Tooltip      | Solid `bg-foreground` with `text-background`. No shadow.      |
| Overlay      | `bg-black/10` semi-transparent backdrop, optional `backdrop-blur-xs`. |

## Shapes

Corner radii are based on `0.625rem` (10px):

```css
--radius: 0.625rem;
--radius-sm: calc(var(--radius) * 0.6);   /* 6px  */
--radius-md: calc(var(--radius) * 0.8);   /* 8px  */
--radius-lg: var(--radius);               /* 10px */
--radius-xl: calc(var(--radius) * 1.4);   /* 14px */
--radius-2xl: calc(var(--radius) * 1.8);  /* 18px */
--radius-3xl: calc(var(--radius) * 2.2);  /* 22px */
--radius-4xl: calc(var(--radius) * 2.6);  /* 26px */
```

| Level  | Value | Usage                          |
|--------|-------|--------------------------------|
| sm     | 6px   | Tabs, small elements           |
| md     | 8px   | Tooltips                       |
| lg     | 10px  | Buttons, inputs, selects       |
| xl     | 14px  | Cards, alert dialogs           |
| 4xl    | 26px  | Badges (pills)                 |
| full   | 9999px| Status dots                    |

**Rule:** All corners within a component group must be consistent. Buttons use `rounded-lg` (10px). Cards use `rounded-xl` (14px). Inputs and selects use `rounded-lg` (10px) to match buttons.

## Icons

Keb uses **lucide-react** exclusively.

### Size Reference

| Class     | Pixel | Common Uses                                    |
|-----------|-------|------------------------------------------------|
| `size-3`  | 12px  | Footer metrics, small indicators, tag icons    |
| `size-3.5`| 14px  | Icon-only buttons, navigation back arrows      |
| `size-4`  | 16px  | Tab icons, button icons, dialog close, select chevrons |
| `size-5`  | 20px  | Small logo                                      |
| `size-10` | 40px  | Large logo (auth screen)                        |

### Icon Usage Patterns

- **In buttons:** Pass as children. Use `data-icon="inline-start"` (before text) or `data-icon="inline-end"` (after text) attributes on the SVG. The button component adjusts padding accordingly.
- **Loading:** Swap to `Loader2` with `animate-spin`.
- **Spinning indicators:** Use `Cog` with `animate-spin` for background agent activity.
- **Glow:** Status dots use `shadow-[0_0_6px_var(--color-{color}-500)]`.

## Animations & Transitions

### Durations

All mount/unmount transitions use **100ms** with Tailwind's `animate-in`/`animate-out` utilities. Hover transitions use `transition-colors` (default ~150ms).

### Component Animations

| Component      | Animation                                                                     |
|----------------|-------------------------------------------------------------------------------|
| Alert dialog   | Overlay: fade-in/out. Content: fade-in + zoom-in-95 / fade-out + zoom-out-95. |
| Tooltip        | Fade-in + zoom-in-95 / fade-out + zoom-out-95. `data-open` / `data-closed`.  |
| Select popup   | Fade-in + zoom-in-95 / fade-out + zoom-out-95. Slide-in from trigger side.   |
| Button press   | `active:not-aria-[haspopup]:translate-y-px` (1px down).                      |
| Tabs underline | ::after pseudo-element, opacity transition (no slide animation).             |
| Status dot     | `connecting` state: `animate-pulse`.                                          |
| Hover          | `transition-colors` only — no transforms or scales on hover.                 |

**Rule:** No animations that delay user interaction. Only feedback (spin, pulse) and micro-transitions (hover, focus).

## Interactive States

| State           | Visual                                                                    |
|-----------------|---------------------------------------------------------------------------|
| Default         | Component's base styling.                                                 |
| Hover           | Darker/lighter `hover:bg-*`. Never scale or transform.                    |
| Focus-visible   | `focus-visible:ring-[3px] focus-visible:ring-ring/50` + border change.    |
| Active (click)  | `translate-y-px` (1px down). Skip on `aria-haspopup` elements.           |
| Disabled        | `opacity-50 pointer-events-none cursor-not-allowed`. Inputs: `bg-input/50` (light), `bg-input/80` (dark). |
| Loading         | Icon → `Loader2 animate-spin`. Button stays disabled.                    |

## Components

### Buttons

`<Button>` wraps `@base-ui/react/button`. Compact `h-8` default, `rounded-lg`, focus ring, 1px press-down.

**Variants:**

| Variant      | Default                                            | Hover                   | Usage                        |
|--------------|----------------------------------------------------|-------------------------|------------------------------|
| `default`    | `bg-primary text-primary-foreground`               | `hover:bg-primary/80`   | Primary actions              |
| `outline`    | `border-border bg-background`                      | `hover:bg-muted`        | Secondary, cancel            |
| `secondary`  | `bg-secondary text-secondary-foreground`            | `hover:bg-secondary/80` | Alternative emphasis         |
| `ghost`      | `hover:bg-muted` (no default border/background)     | `hover:bg-muted`        | Icon-only buttons            |
| `destructive`| `bg-destructive/10 text-destructive`                | `hover:bg-destructive/20`| Danger actions               |
| `link`       | `text-primary underline-offset-4`                   | `hover:underline`       | Text-only links              |

**Sizes:**

| Size        | Height | Typical Use                   |
|-------------|--------|-------------------------------|
| `xs`        | 24px   | Inline, very compact          |
| `sm`        | 28px   | Compact secondary             |
| `default`   | 32px   | Primary action buttons        |
| `lg`        | 36px   | Full-width form submit        |
| `icon`      | 32px   | Icon-only (same as default h) |
| `icon-xs`   | 24px   | Tiny icon buttons             |
| `icon-sm`   | 28px   | Small icon buttons            |
| `icon-lg`   | 36px   | Large icon buttons            |

### Inputs

`<Input>` wraps `@base-ui/react/input`. Compact `h-8`, `rounded-lg`, transparent background.

| State      | Visual                                                      |
|------------|-------------------------------------------------------------|
| Default    | `border-input bg-transparent`                               |
| Focus      | `border-ring ring-[3px] ring-ring/50`                       |
| Placeholder| `text-muted-foreground`                                     |
| Disabled   | `bg-input/50 opacity-50 cursor-not-allowed`                 |
| Invalid    | `border-destructive ring-destructive/20`                    |
| Helper text| `text-[10px] text-muted-foreground` below the input         |

### Tabs

Uses `@base-ui/react/tabs`. Keb uses the **line variant** (no background on tab list).

**Line variant behavior:**
- TabsList: `variant="line"` removes the default muted background. Gets `rounded-none`.
- Inactive tab: `text-foreground/60`.
- Active tab: `text-foreground` with a 2px underline bar (`::after`) via `after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100`.
- Hover: `hover:text-foreground`.
- Each tab: `flex-1 gap-1.5 rounded-none py-2.5 text-xs font-medium`.

**Default variant** (background pill style): Available for non-primary tab groups. Uses `bg-muted rounded-lg p-[3px]`.

### Selects

`<Select>` wraps `@base-ui/react/select`.

- Trigger: Default `h-8`, compact variant `h-7`. `rounded-lg border-input`.
- Popup: `bg-popover text-popover-foreground rounded-lg shadow-md ring-1 ring-foreground/10`. Animate in with fade + zoom.
- Item: `rounded-md py-1 pr-8 pl-1.5 text-sm`. Hover: `focus:bg-accent`. Selected: CheckIcon.

### Cards

`<Card>` with `rounded-xl ring-1 ring-foreground/10 bg-card text-card-foreground`.

| Size      | Padding (x) | Gap  | Footer padding |
|-----------|-------------|------|----------------|
| `default` | `px-4`      | `gap-4` | `p-4`        |
| `sm`      | `px-3`      | `gap-3` | `p-3`        |

CardFooter: `border-t bg-muted/50 rounded-b-xl`.

### Badges

`<Badge>` with `h-5 rounded-full` (pill shape using the 4xl token).

| Variant      | Visual                                                     |
|--------------|------------------------------------------------------------|
| `default`    | `bg-primary text-primary-foreground`                       |
| `secondary`  | `bg-secondary text-secondary-foreground`                   |
| `destructive`| `bg-destructive/10 text-destructive`                       |
| `outline`    | `border-border text-foreground`                            |
| `ghost`      | `hover:bg-muted`                                           |
| `link`       | `text-primary underline-offset-4 hover:underline`          |

### Separator

`<Separator>`. Horizontal: `h-px w-full bg-border`. Vertical: `w-px self-stretch bg-border`.

### Alert Dialog

Wraps `@base-ui/react/alert-dialog`.

- Overlay: `bg-black/10` with optional `backdrop-blur-xs`. Fade in/out.
- Content: `max-w-xs rounded-xl bg-popover text-popover-foreground ring-1 ring-foreground/10 p-4`. Fade + zoom in/out.
- Footer: `bg-muted/50 border-t rounded-b-xl`. Cancel (outline) + confirm (destructive) buttons.
- Title: `font-heading text-base font-medium`.
- Description: `text-sm text-balance text-muted-foreground`.

### Tooltip

Wraps `@base-ui/react/tooltip`.

- Background: `bg-foreground text-background`.
- Shape: `rounded-md px-3 py-1.5 text-xs`.
- Offset: 4px from trigger.
- Arrow: `size-2.5 bg-foreground` rotated 45°.
- Animation: fade + zoom in/out.
- Max width: `max-w-xs`.

### Scroll Areas

Wraps `@base-ui/react/scroll-area`.

- Track width: `w-2.5` (vertical), `h-2.5` (horizontal).
- Thumb: `rounded-full bg-border`.
- Auto-scrolling: Use a wrapper that calls `viewport.scrollTop = viewport.scrollHeight` on a trigger variable.

### Markdown Content

Rendered via `markdown-it` with `breaks: true, linkify: true, typographer: true`. Style via a `.markdown-content` class:

- h1: `text-lg font-semibold mt-3 mb-1.5`
- h2: `text-base font-semibold mt-3 mb-1.5`
- h3: `text-sm font-semibold mt-2.5 mb-1`
- h4-h6: `text-sm font-medium mt-2 mb-1`
- p: `mb-2 last:mb-0`
- ul: `list-disc pl-5 mb-2 space-y-0.5`
- ol: `list-decimal pl-5 mb-2 space-y-0.5`
- blockquote: `border-l-2 border-muted-foreground/30 pl-3 italic text-muted-foreground my-2`
- code (inline): `bg-muted rounded px-1 py-0.5 text-[12px] font-mono`
- pre: `bg-muted rounded-md p-2.5 my-2 overflow-x-auto text-[12px] leading-relaxed`
- a: `text-primary underline underline-offset-2`
- hr: `my-3 border-border`
- table: `w-full text-[12px] border-collapse my-2` with `border-border` on cells
- th: `border border-border bg-muted px-2 py-1 text-left font-semibold`
- td: `border border-border px-2 py-1`

Reset first/last child margins: `& > *:first-child { margin-top: 0 }` / `& > *:last-child { margin-bottom: 0 }`.

## Do's and Don'ts

- Do maintain an achromatic palette — color should be meaningful (green=ok, red=error, amber=warning, blue=in-progress), not decorative.
- Do use compact spacing — every pixel counts, especially in narrow viewports.
- Do use sentence case for button text ("Fetch & Add", not "fetch and add").
- Do use system fonts exclusively — no custom web fonts.
- Do apply a `1px` active press-down on buttons.
- Do use `border` and `ring` for depth — save shadows for floating elements (popups, dialogs).
- Do pair status colors with text labels — never rely on color alone.
- Don't use drop shadows on structural surfaces — use `ring-1 ring-foreground/10` instead.
- Don't mix corner radius styles within the same component group.
- Don't exceed two font sizes on any single screen.
- Don't disable dark mode — ship both themes from day one.
- Don't use border-radius larger than `xl` (14px) on containers — save `4xl` for badges, `full` for status dots.
- Don't add animations that delay interaction — only use them for feedback (spin, pulse) and micro-transitions.
