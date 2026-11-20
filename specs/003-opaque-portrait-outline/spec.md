# Your Turn: opaque-only outline and painted exclusions

Requested 2026-11-19; target 0.10.23. Small feature delta to baseline FR-006/007.

## Contract

- Add **Outline opaque parts only** to the existing actor Your Turn editor. Off preserves appearance; on outlines alpha >= 250/255 instead of >= 16/255.
- Change outline-mask eligibility only, not original RGBA art. Translucent wind/glow/smoke stays visible; solid character parts retain the white outline. This is alpha-based, not semantic subject detection or white-background removal.
- Save boolean `yourTurnOpaqueOutline` atomically with other editor fields. Honor synthetic/base fallback and explicit false overrides. No migration or edits to other actors.
- Held preview swaps only decoded portrait art, preserving card, placement, color and sound. Fence stale loads against replacement, close, cancellation and newer drafts. Initial loading uses the latest toggle before display.
- Include mode in prepared/pending/queued-art cache keys; retain the shared 64-entry limit, idle queue and yielding processing. No new global scans or recurring jobs.
- Add a native dialog containing an outline-only paint canvas, brush size, Undo stroke, Clear mask, and optional painted-area overlay. Erase only the generated white layer, then composite original art unchanged.
- Apply returns a normalized mask to the parent editor draft; parent Save persists `yourTurnOutlineMask` atomically. Cancel either editor does not save. Masks are associated with the original image path and do not affect a different portrait/fallback image. Explicit null overrides inherited masks.
- Store bounded vector strokes (64 strokes, up to 128 points each), not encoded PNGs in actor flags. Pointer redraw is animation-frame-coalesced native canvas compositing; do not regenerate the pixel outline on each movement. Dispose listeners/capture/frame work when closed.

## Scope

`your-turn.ts`: alpha eligibility, subject/draft/flag propagation, keyed cache, editor/dialog integration. `your-turn-outline.ts`: normalized stroke data, outline-only compositing and DOM painter. `en.json`: labels. `module.css`: editor layout. Update baseline/context/release notes; no encounter changes.

## Evidence / explicit visual exception

The user authorized a visual check for this image: one local browser comparison using the actual module outline renderer and supplied WickerWind attachment. No unit tests, mocked Foundry suite, automated assertions or broad fixtures. This does not change the repository-wide default.

Alpha inspection confirms translucent pixels in the attachment. The linked Downloads file differs; use the displayed attachment for comparison. Do not edit or commit the artwork.

Visual comparison: inspected the actual compiled outline renderer and DOM painter in the authorized local browser preview. Opaque-only mode retains the character's outline and translucent wind; painting three outer leaf regions removes their white halos while keeping the leaves and main silhouette visible. This is rendering/UI evidence only, not native Foundry document-save or multiplayer proof.

Live Foundry editor/save/multiplayer: NOT RUN — no real Foundry instance. Unit/mock/content suites: not created or run. Packaging completed for 0.10.23; publication pending.
