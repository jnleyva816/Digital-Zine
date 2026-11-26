# Design language: Tactile Editorial Print

Decided: owner, 26 Nov 2026, DIG-147. The tokens are in `DESIGN.md` (draft until the token ticket lands).

- Darkroom (dark) follows the system setting. There is no toggle.
- Fonts: Instrument Serif for display, Geist Sans for UI, Geist Mono for recipe settings and metadata. They replace Georgia and Inter.
- Vermilion is the only accent. `#d94e28` is not used for text (4.01:1 on paper); text and buttons use `#b83d1b`, or `#ee6a43` in Darkroom.
- Motion is page-turn: 300 to 400 ms for surfaces, 150 to 200 ms for small controls.
- Surfaces are square with hairline borders and almost no shadow.
- UI primitives come from shadcn/ui, restyled with these tokens. Dependencies added with it (`@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, `shadcn`) were approved here.
