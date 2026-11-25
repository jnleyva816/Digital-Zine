# "Recipe" means a Fujifilm film-simulation recipe

Decided: owner, 18 Nov 2026, DIG-22, DIG-23.

- Never a food recipe. A recipe is the in-camera settings: film simulation, dynamic range, grain, Color Chrome and FX Blue, white balance with red and blue shift, highlight, shadow, color, sharpness, clarity, noise reduction, ISO, and exposure compensation.
- Fields use the camera's real options (selects and steps), defined in `src/lib/fuji-recipe.ts`.
- Each photo has its own recipe in `MediaAsset.recipe` (JSON). Saved recipes are 0015.
- Uploading a Fujifilm JPEG prefills a recipe from maker notes and asks the creator to name it before anything is saved. ISO and exposure compensation are not read. Fluorescent codes `0x301` and `0x302` map to Fluorescent 2 and 3; that numbering is not confirmed.
- Old food recipes are dropped: `parseRecipe` returns null for them and the API rejects them.
