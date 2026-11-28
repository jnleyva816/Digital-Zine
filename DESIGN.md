# Folio design specification: Tactile Editorial Print

**Status: draft, decided with the owner on 26 Nov (DIG-147). Surfaces revised the same day: see `docs/decisions/0025-rounded-surfaces.md`.** Tokens below are the source for `src/app/globals.css`. Do not add colors, fonts, radii, or easing curves that are not listed here.

The product is a print zine for photographers. The interface should feel like paper and ink: warm surfaces, hairline rules, soft rounded corners, pill controls, a serif voice, and mono for the numbers a photographer cares about (film-simulation recipe settings, exposure data).

## Decisions

| Question | Decision |
| --- | --- |
| Dark mode | Darkroom follows the system (`prefers-color-scheme`). No toggle. |
| Fonts | Instrument Serif (display), Geist Sans (UI), Geist Mono (data). Replaces Georgia and Inter. |
| Accent | Vermilion only. No second accent. |
| Motion | Page-turn feel: 300 to 400 ms for surfaces, 150 to 200 ms for small controls. |
| Surfaces | Rounded corners on the scale under Layout, pill buttons and chips, hairline borders, soft shadows on lifted layers only. |
| Control edges | Inputs and secondary buttons use the `edge` token (3:1), not the decorative hairline (1.5:1). |

## Color

Contrast is WCAG 2.x, measured on the listed pair.

### Archival Paper (light)

| Token | Value | Use |
| --- | --- | --- |
| `paper-50` | `#fdfbf7` | Page background |
| `paper-100` | `#f7f3ea` | Raised surface, inputs |
| `paper-200` | `#ece4d3` | Sunken surface, hover |
| `paper-300` | `#ddd0b6` | Hairline borders (decorative: cards, dividers) |
| `edge` | `#8a7f72` | Borders of controls (inputs, secondary buttons, chips that carry state) |
| `ink-900` | `#161412` | Body text, headings |
| `ink-700` | `#3d3730` | Secondary text |
| `ink-500` | `#6e655b` | Muted text, captions |
| `vermilion-600` | `#b83d1b` | Accent for text, links, filled buttons |
| `vermilion-500` | `#d94e28` | Accent for large graphics and focus rings only |

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `ink-900` on `paper-50` | 17.78 | AAA |
| `ink-700` on `paper-50` | 11.37 | AAA |
| `ink-500` on `paper-50` | 5.53 | AA |
| `ink-500` on `paper-200` | 4.52 | AA, no margin: prefer `ink-700` on hover and sunken surfaces |
| `vermilion-600` on `paper-200` | 4.46 | Fails AA. Accent text never sits on `paper-200` |
| `edge` on `paper-50` / `paper-100` / `paper-200` | 3.79 / 3.54 / 3.10 | Passes 3:1 for control edges |
| `paper-300` on `paper-50` | 1.48 | Decorative only. Never the only cue for a control |
| `ink-500` on `paper-100` | 5.16 | AA |
| `vermilion-600` on `paper-50` | 5.46 | AA |
| `paper-50` on `vermilion-600` | 5.46 | AA (button label) |
| `vermilion-500` on `paper-50` | 4.01 | Fails AA for text. Never use it for text or button labels. |

### Darkroom (dark)

| Token | Value | Use |
| --- | --- | --- |
| `dark-900` | `#141210` | Page background |
| `dark-800` | `#1d1a17` | Raised surface |
| `dark-700` | `#2a2622` | Hairline borders, hover |
| `paper-100` | `#f7f3ea` | Body text |
| `dark-muted` | `#a39a8d` | Muted text |
| `vermilion-400` | `#ee6a43` | Accent in Darkroom (text, links, filled buttons) |
| `dark-edge` | `#7a7064` | Borders of controls in Darkroom |
| `error-dark` | `#f87171` | Error text and icons in Darkroom (proposed) |
| `warning-dark` | `#fbbf24` | Warning in Darkroom (proposed) |
| `success-dark` | `#4ade80` | Success in Darkroom (proposed) |

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `paper-100` on `dark-900` | 16.87 | AAA |
| `dark-muted` on `dark-900` | 6.73 | AA |
| `dark-muted` on `dark-800` | 6.24 | AA |
| `vermilion-400` on `dark-900` | 6.03 | AA |
| `dark-900` on `vermilion-400` | 6.03 | AA (button label) |
| `dark-edge` on `dark-900` / `dark-800` | 3.85 / 3.57 | Passes 3:1 for control edges |
| `dark-700` on `dark-900` | 1.24 | Decorative only |
| `error-dark` / `warning-dark` / `success-dark` on `dark-900` | 6.76 / 11.19 / 10.72 | AA (proposed values, owner to confirm) |

Light-mode state colors (error, warning, success) keep the existing values from `globals.css`. The Darkroom values above are proposals: `dc2626` on `dark-900` is only 3.87, so the light red cannot be reused.

## Typography

| Role | Family | Use |
| --- | --- | --- |
| Display | Instrument Serif | Page titles, zine titles, large numerals |
| UI | Geist Sans | Body, controls, navigation, forms |
| Data | Geist Mono | Recipe settings (grain, color chrome, white balance, tone), exposure data, handles, counts |

Load all three with `next/font` so they are self-hosted. Weights: Instrument Serif 400 and 400 italic only (it has no bold: never apply `font-bold` to it); Geist 400, 500, 600; Geist Mono 400, 500. Scale (rem, line height):

| Step | Size | Line | Family | Use |
| --- | --- | --- | --- | --- |
| `display` | 3.5 | 1.05 | Instrument Serif | Landing and public viewer title |
| `h1` | 2.25 | 1.1 | Instrument Serif | Page title |
| `h2` | 1.75 | 1.15 | Instrument Serif | Section title |
| `h3` | 1.25 | 1.3 | Geist Sans, 600 | Card title |
| `body` | 1 | 1.55 | Geist Sans | Default |
| `small` | 0.875 | 1.45 | Geist Sans | Secondary |
| `caption` | 0.75 | 1.4 | Geist Mono | Metadata, uppercase, 0.06em tracking |

Display sizes drop one step below 640 px. Body never goes below 1 rem on mobile.

## Layout

- **Grid:** 12 columns from 1024 px up, 4 columns below 640 px, 8 between. Gutter 1.5 rem, page margin 1 rem on mobile and 2 rem above.
- **Spacing:** a 4 px base. Allowed steps: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- **Measure:** reading text is capped at 65 characters.
- **Aspect ratios are locked:** a photo keeps its ratio in every container (no stretching, no crop unless the owner chose one). Zine pages keep the page ratio of their template.
- **Radius scale:** `radius-photo` 6 px (photos, thumbnails), `radius-control` 10 px (inputs, selects, segmented controls), `radius-card` 14 px (cards, panels), `radius-dialog` 18 px (dialogs, sheets, menus), `radius-pill` 999 px (buttons, chips, tags, switches, avatars). A photo never takes a larger radius than `radius-photo`, and a crop or frame the creator chose wins over it.
- **Borders:** 1 px `paper-300` (light) or `dark-700` (dark) on cards and dividers. Controls use `edge` or `dark-edge`. Emphasis rules are 2 px `ink-900`.
- **Shadow:** none at rest on cards and controls. Three soft shadows, all `rgb(22 20 18 / a)` (Darkroom: double `a`): `shadow-lift` `0 10px 24px` at 0.22 (photos being dragged, floating action bars), `shadow-float` `0 14px 30px` at 0.18 (menus, popovers), `shadow-modal` `0 30px 60px` at 0.3 (dialogs, sheets).
- **Focus:** a 2 px `vermilion-500` outline with a 2 px offset, never removed.

## Motion

| Token | Curve | Duration | Use |
| --- | --- | --- | --- |
| `ease-paper` | `cubic-bezier(0.32, 0, 0.15, 1)` | 300 to 400 ms | Pages, drawers, dialogs, layout shifts |
| `ease-paper-quick` | `cubic-bezier(0.25, 0.1, 0.25, 1)` | 150 to 200 ms | Hover, press, focus, toggles |

- Slow start and soft settle, no overshoot or bounce.
- The card flip and the book page turn are surfaces: 400 ms on `ease-paper`, not the longer values in use today (flip 550 ms, book turn 450 ms).
- Move surfaces on `transform` and `opacity` only.
- `prefers-reduced-motion: reduce` replaces movement with an instant or 100 ms opacity change.
- Use `motion/react` (`AnimatePresence`, `layoutId`) for shared-element and page transitions. Check current API patterns with the Context7 MCP before writing it.

## Components

Build on shadcn/ui (`npx shadcn@latest add <name>`, via the shadcn MCP). After installing, apply the tokens: `--radius` 10 px with the scale above, `edge` borders, vermilion focus ring, the three fonts. The shadcn variables map as follows.

| shadcn variable | Archival Paper | Darkroom |
| --- | --- | --- |
| `--background` / `--foreground` | `paper-50` / `ink-900` | `dark-900` / `paper-100` |
| `--card`, `--popover` | `paper-100` | `dark-800` |
| `--muted` / `--muted-foreground` | `paper-200` / `ink-500` | `dark-700` / `dark-muted` |
| `--primary` / `--primary-foreground` | `vermilion-600` / `paper-50` | `vermilion-400` / `dark-900` |
| `--border` | `paper-300` | `dark-700` |
| `--input` | `edge` | `dark-edge` |
| `--ring` | `vermilion-500` | `vermilion-500` |
| `--destructive` | existing red | `error-dark` |

| Component | Spec |
| --- | --- |
| Button (primary) | Pill, 44 px high (40 px on desktop-only toolbars), 24 px side padding, Geist 600 at `small`. Fill `primary`, label `primary-foreground`. Hover darkens one step in 150 ms; press moves 1 px down. |
| Button (secondary) | Same size, `edge` border, no fill. Hover fills `paper-200`. |
| Button (ghost, icon) | 44 px hit area, no border until hover. |
| Input, select | `radius-control`, 44 px high, `paper-100` fill, `edge` border; focus swaps to the vermilion ring. Error: `error` border plus a text message, never color alone. |
| Chip, tag | Pill, 32 px high (44 px hit area when pressable), `paper-200` fill; selected is `ink-900` fill with `paper-50` label. |
| Card | `radius-card`, `paper-100` fill, 1 px `paper-300`, no shadow at rest. |
| Menu, popover | `radius-dialog`, `shadow-float`, items 44 px high. |
| Dialog, sheet | `radius-dialog`, `shadow-modal`, scrim `ink-900` at 45% (Darkroom 60%). |
| Segmented control, tab | `radius-control`, selected segment `paper-50` with 1 px `paper-300`. |
| Meter | 6 px high pill track `paper-200`, fill `ink-900`, `role="meter"` with a text value. |
| Toast | `radius-card`, `shadow-float`, appears with `ease-paper-quick`, stays 5 s, never the only error cue. |

Every control has a visible focus state, an accessible name, and a hit area of at least 44 px on touch.

## Open items

- Owner to confirm the proposed Darkroom error, warning, and success colors, and the `edge` and `dark-edge` values.
- Owner to confirm the radius scale (6, 10, 14, 18, pill) and the three shadows. They were taken from the earlier mockups, not designed fresh.
- Whether the zine pages themselves get grain or texture (not decided; assume none).
- Replace the shadcn neutral variables and the broken `--font-sans: var(--font-sans)` line that `shadcn init` added to `globals.css`.
