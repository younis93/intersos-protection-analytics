# PixelFX subset

Core, spawn/poof, critters/ghost, impacts/hit-spark and
transitions/burn-away effects, with their category helpers, from https://github.com/patch-gg/pixelfx
at commit a84159688af3ca37a4be05a0d422b94451b2e24e.

Vendored for offline desktop use. Local TypeScript declarations describe only
the API used by the Halloween game. LICENSE and NOTICE.md accompany the code.
No gallery fonts are included.

Local ghost adapter options (both default to true, preserving upstream output):
- `face: false` omits baked eyes/mouth so the game can draw target-aware features.
- `drift: false` anchors the body horizontally, retaining sheet lag, bobbing and motes.
The shared atlas uses both options; facing cannot translate the ghost's anchor.
