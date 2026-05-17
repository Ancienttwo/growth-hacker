# Growth Hacker Design System

This file is the design source of truth for the dashboard. Runtime tokens live in `apps/web/src/styles.css`; this document explains how to use them.

## Product Surface

Growth Hacker is an operator dashboard for Xiaohongshu publishing, content operations, runtime jobs, and Hermes agent work. The UI should feel like a dense workbench: quiet, scannable, and fast to operate. Avoid marketing-page composition, decorative hero sections, and large illustrative filler.

## Runtime Contract

- Source of truth: `apps/web/src/styles.css`.
- Tailwind mode: Tailwind v4 with `@theme inline`.
- Component library: shadcn `radix-nova` components with Radix primitives.
- Token rule: components should use semantic classes such as `bg-popover`, `border-input`, `text-muted-foreground`, `ring-ring`, and `font-heading`.
- Do not add one-off component colors when a semantic token exists. Add or change a semantic token first.

## Color Tokens

Core surface:

| Token | Current value | Use |
| --- | --- | --- |
| `--background` | `oklch(0.985 0.002 250)` | Main app canvas |
| `--foreground` | `oklch(0.18 0.006 250)` | Primary text |
| `--card` | `oklch(1 0 0)` | Panels and cards |
| `--card-foreground` | `oklch(0.18 0.006 250)` | Text inside cards |
| `--popover` | `oklch(1 0 0)` | Menus, select lists, sheets, floating surfaces |
| `--popover-foreground` | `oklch(0.18 0.006 250)` | Text inside floating surfaces |

Interaction:

| Token | Current value | Use |
| --- | --- | --- |
| `--primary` | `oklch(0.38 0.07 178)` | Primary actions and active affordances |
| `--primary-foreground` | `oklch(0.985 0.002 250)` | Text on primary actions |
| `--secondary` | `oklch(0.94 0.012 178)` | Low-emphasis action fills |
| `--secondary-foreground` | `oklch(0.24 0.035 178)` | Text on secondary fills |
| `--accent` | `oklch(0.94 0.012 178)` | Hover and selected item backgrounds |
| `--accent-foreground` | `oklch(0.24 0.035 178)` | Text on accent backgrounds |
| `--destructive` | `oklch(0.56 0.18 28)` | Destructive and error states |
| `--ring` | `oklch(0.56 0.065 178)` | Focus rings |

Neutral structure:

| Token | Current value | Use |
| --- | --- | --- |
| `--muted` | `oklch(0.955 0.003 250)` | Subtle fills, inactive pills |
| `--muted-foreground` | `oklch(0.48 0.01 250)` | Secondary text and metadata |
| `--input` | `oklch(0.88 0.004 250)` | Input/select borders |
| `--border` | `oklch(0.88 0.004 250)` | Dividers and panel borders |

Navigation:

| Token | Current value | Use |
| --- | --- | --- |
| `--sidebar` | `oklch(0.18 0.006 250)` | Left rail background |
| `--sidebar-foreground` | `oklch(0.96 0.002 250)` | Left rail text/icons |
| `--sidebar-primary` | `oklch(0.52 0.08 178)` | Brand mark and active rail anchors |
| `--sidebar-primary-foreground` | `oklch(0.98 0.002 250)` | Text/icons on sidebar primary |
| `--sidebar-accent` | `oklch(0.27 0.01 250)` | Rail hover and selected backgrounds |
| `--sidebar-accent-foreground` | `oklch(0.98 0.002 250)` | Text/icons on sidebar accent |
| `--sidebar-border` | `oklch(0.28 0.01 250)` | Rail dividers |
| `--sidebar-ring` | `oklch(0.56 0.065 178)` | Rail focus rings |

Charts:

Use `--chart-1` through `--chart-5` for data visualization only. Do not reuse chart colors as UI accents unless the component is a chart legend or chart control.

## Typography

- Font family: `Geist Variable`.
- Headings: use `font-heading`, medium to bold weight, tight line height.
- Body: use the default sans stack from `--font-sans`.
- Monospace: use `"SF Mono", ui-monospace, Menlo, Consolas, monospace`.
- Letter spacing stays `0`; do not use negative tracking.
- Dashboard headings should be compact. Reserve hero-scale type for actual hero screens, which this product should rarely need.

## Shape And Spacing

- Base radius: `--radius: 0.5rem`.
- Semantic radii exposed to Tailwind: `sm`, `md`, `lg`, `xl`.
- Cards and panels should usually be `8px` radius or less unless inherited from shadcn primitives.
- Avoid cards inside cards. Use cards for repeated entities, modals, and framed tools only.
- Preserve stable dimensions for controls, icon buttons, status badges, masonry items, and toolbar elements so hover/state changes do not shift layout.

## Interaction Rules

- Menus, selects, sheets, popovers, and tooltips must use `bg-popover` with `text-popover-foreground`.
- Inputs and selects use `border-input`; passive dividers use `border-border`.
- Focus states use `focus-visible:ring-ring` or `focus-visible:border-ring`.
- Icon buttons use lucide icons. Do not replace familiar icons with text labels when the icon is clear.
- Touch targets should be at least `44px` on mobile surfaces; compact desktop controls may be smaller when they are not the primary mobile target.

## Visual Direction

- Default mood: operational, calm, high-signal.
- Palette: neutral light surfaces with restrained teal-green action color and a dark neutral rail.
- Avoid dominant purple/blue gradients, beige/brown themes, decorative orbs, bokeh blobs, and stock-like placeholders.
- Use screenshots, covers, charts, or actual product artifacts when imagery is needed.

## Implementation Checklist

Before shipping visual work:

- `bun --filter @growth-hacker/web build`
- `bun --filter @growth-hacker/web typecheck`
- Confirm generated CSS contains `bg-popover`, `border-input`, `text-muted-foreground`, and `font-heading` when those classes are used.
- Check one narrow viewport and one desktop viewport for text overflow, menu background, and toolbar wrapping.
