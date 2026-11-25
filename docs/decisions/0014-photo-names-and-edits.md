# Photo names and edits

Decided: owner, 19 Nov 2026.

- Optional `MediaAsset.name`, kept apart from `originalName`. Shown on the board, the editor picker, alt text, and the card back. Public pages never fall back to the file name.
- Edits: ratios Original, 4:5, 1:1, 3:2, 2:3, 16:9; zoom 1 to 4 and drag; frames none, thin white, white mat, black, Polaroid; board card normal or large.
- Stored non-destructively in `MediaAsset.edit`. Edits show on the board, the editor, public pages, and the PDF, and published zines update right away.
- An unedited photo, and Reset, is a centred 4:5 crop.
