# Folio design specification: Tactile Editorial Print

**Status: draft, decided with the owner on 26 Nov (DIG-147).** Tokens below are the source for `src/app/globals.css`. Do not add colors, fonts, radii, or easing curves that are not listed here.

The product is a print zine for photographers. The interface should feel like paper and ink: warm surfaces, hairline rules, square corners, a serif voice, and mono for the numbers a photographer cares about (film-simulation recipe settings, exposure data).

## Decisions

| Question | Decision |
| --- | --- |
| Dark mode | Darkroom follows the system (`prefers-color-scheme`). No toggle. |
| Fonts | Instrument Serif (display), Geist Sans (UI), Geist Mono (data). Replaces Georgia and Inter. |
| Accent | Vermilion only. No second accent. |
| Motion | Page-turn feel: 300 to 400 ms for surfaces, 150 to 200 ms for small controls. |
| Surfaces | Square corners, hairline borders, almost no shadow. |

## Color

Contrast is WCAG 2.x, measured on the listed pair.

### Archival Paper (light)

| Token | Value | Use |
| --- | --- | --- |
| `paper-50` | `#fdfbf7` | Page background |
| `paper-100` | `#f7f3ea` | Raised surface, inputs |
| `paper-200` | `#ece4d3` | Sunken surface, hover |
| `paper-300` | `#ddd0b6` | Hairline borders |
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

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `paper-100` on `dark-900` | 16.87 | AAA |
| `dark-muted` on `dark-900` | 6.73 | AA |
| `dark-muted` on `dark-800` | 6.24 | AA |
| `vermilion-400` on `dark-900` | 6.03 | AA |
| `dark-900` on `vermilion-400` | 6.03 | AA (button label) |

State colors (error, warning, success) keep the existing red and amber values from `globals.css` until the owner sets Darkroom variants.

## Typography

| Role | Family | Use |
| --- | --- | --- |
| Display | Instrument Serif | Page titles, zine titles, large numerals |
| UI | Geist Sans | Body, controls, navigation, forms |
| Data | Geist Mono | Recipe settings (grain, color chrome, white balance, tone), exposure data, handles, counts |

Load all three with `next/font` so they are self-hosted. Scale (rem, line height):

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
- **Radius:** 0 everywhere. Exception: avatars and the focus ring offset may be round.
- **Borders:** 1 px hairline in `paper-300` (light) or `dark-700` (dark). Emphasis rules are 2 px `ink-900`.
- **Shadow:** none by default. One allowed shadow for floating layers (menus, dialogs): `0 1px 0 var(--hairline), 0 8px 24px rgb(22 20 18 / 0.12)` (Darkroom: opacity 0.4).
- **Focus:** a 2 px `vermilion-500` outline with a 2 px offset, never removed.

## Motion

| Token | Curve | Duration | Use |
| --- | --- | --- | --- |
| `ease-paper` | `cubic-bezier(0.32, 0, 0.15, 1)` | 300 to 400 ms | Pages, drawers, dialogs, layout shifts |
| `ease-paper-quick` | `cubic-bezier(0.25, 0.1, 0.25, 1)` | 150 to 200 ms | Hover, press, focus, toggles |

- Slow start and soft settle, no overshoot or bounce.
- Move surfaces on `transform` and `opacity` only.
- `prefers-reduced-motion: reduce` replaces movement with an instant or 100 ms opacity change.
- Use `motion/react` (`AnimatePresence`, `layoutId`) for shared-element and page transitions. Check current API patterns with the Context7 MCP before writing it.

## Components

- Build on shadcn/ui (`npx shadcn@latest add <name>`, via the shadcn MCP). After installing a component, apply the tokens above: radius 0, hairline border, vermilion focus ring, the three fonts. The shadcn variables (`--background`, `--primary`, and so on) map to these tokens in `globals.css`.
- Primary button: `vermilion-600` fill, `paper-50` label (Darkroom: `vermilion-400` fill, `dark-900` label). Secondary: hairline border, no fill.
- Every control has a visible focus state, an accessible name, and a hit area of at least 44 px on touch.

## Open items

- Darkroom variants for the error, warning, and success colors.
- Whether the zine pages themselves get grain or texture (not decided; assume none).
- Replace the shadcn neutral variables and the broken `--font-sans: var(--font-sans)` line that `shadcn init` added to `globals.css`.
