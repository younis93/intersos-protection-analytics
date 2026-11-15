# PixelFX subset

Core, spawn/poof, critters/ghost, critters/bat, critters/eyeball, critters/flying-skull, impacts/hit-spark and
transitions/burn-away effects, with their category helpers, from https://github.com/patch-gg/pixelfx
at commit a84159688af3ca37a4be05a0d422b94451b2e24e.

Vendored for offline desktop use. Local TypeScript declarations describe only
the API used by the Halloween game. LICENSE and NOTICE.md accompany the code.
No gallery fonts are included.

`heart-pickup.png` is the cropped first frame of PixelFX's `pickups/heart-pickup` from the same commit. It contains the heart sprite from the front layer with additive lighting disabled.

Local ghost adapter options (both default to true, preserving upstream output):
- `face: false` omits baked eyes/mouth so the game can draw target-aware features.
- `drift: false` anchors the body horizontally, retaining sheet lag, bobbing and motes.
The shared atlas uses both options; facing cannot translate the ghost's anchor.

The combat bat removes baked horizontal drift. The eyeball looks to the right in the atlas so mirroring can direct its gaze toward the mage.
