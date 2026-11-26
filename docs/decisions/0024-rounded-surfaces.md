# Rounded surfaces and soft shadows

Decided: owner, 26 Nov 2026, DIG-147. Changes the "Surfaces" line of `0023-design-language.md`; the rest of 0023 stands.

- Corners are rounded on the scale in `DESIGN.md` (6, 10, 14, 18 px, and pill). Buttons, chips, and tags are pills.
- Shadows are soft and used on lifted layers only (dragged photos, menus, dialogs). Cards stay flat with a hairline.
- Why: the owner prefers the look of the earlier mockups (Vision Board, Zines and Boards) to square corners and hairlines only.
- Control borders use a 3:1 `edge` color, because the 1.5:1 hairline does not meet WCAG for input edges.
