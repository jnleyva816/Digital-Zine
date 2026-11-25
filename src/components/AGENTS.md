# src/components: notes

- Any `next/image` of a processed photo goes through `EditedPhoto` or `withSourceWidth`, which tags the address with the photo's width (`#sw=`). Otherwise small photos go black on sharp screens.
- `RecipeEditor` stores nothing until Save.
- `Windowed.tsx` swaps far-off cards for same-height placeholders (large boards, no virtualization dependency).
- Board views: every photo carries `data-flow` for the view transition (`src/lib/board-transition.ts`). Strip puts undated photos under "No date". The Caveat font is bundled in `assets/fonts/caveat`.
- Below 1024 px the board uses `MobileCard`, `MobileStrip`, and `PhotoSheet`, and every studio page has a bottom navigation from `StudioHeader` (`globals.css` pads the body for it). Component tests need a `matchMedia` stub that matches `max-width` to get the phone board.
- The studio header navigation is tight at 390 px: check a new link at phone width.
- `ZinePages` renders the list and `PhotoLightbox`, a native modal dialog, from data the page already has. Opening it puts `#page-N` in the URL with `pushState`; moving between photos uses `replaceState`; Back closes it.
- `SignInForm` accepts only same-origin relative `callbackUrl`s.
- The editor's PDF preview draws templates from `src/lib/pdf-templates/` as HTML, so templates stay free of hooks.
