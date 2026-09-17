# Astillon Hanaq Adventures

![Foundry support](https://img.shields.io/badge/Foundry-v13--v14-informational)

Foundry VTT module content for Pathfinder 2e, including Astillon/Hanaq compendia and module-loaded utilities.

## Menacing

Right-click a token, open its normal **Status Effects** palette, and click **Menacing** to toggle the JoJo symbol. It loops above the token's upper-right edge, follows its movement and size, and disappears when toggled off. Right-clicking the status also toggles it; it does not replace the token's large overlay icon.

This is purely cosmetic: it adds no PF2e condition, modifier, rule element, or actor effect. Its state belongs to the individual token, so two linked tokens of the same actor can differ. Foundry saves and synchronizes that state; connected clients and clients returning to a scene recreate the animation. Hidden, unseen, off-level, and detection-only tokens do not expose the artwork to players.

No additional Foundry modules are required. You can continue using JB2A and Sequencer alongside this feature.

The source animation is `src/assets/jojo_menace.gif`. The build produces a transparent PNG atlas and frame timings so Foundry can play every GIF frame on its canvas. The original GIF is included unchanged.

Optional macro/API usage:

```js
// Toggle the selected token.
await game.astillonHanaqAdventures.menacing.toggle();

// Explicitly enable or disable one token.
await game.astillonHanaqAdventures.menacing.toggle(token.document, true);
await game.astillonHanaqAdventures.menacing.toggle(token.document, false);
```

The GM or a token owner can toggle it. The token flag is `flags.astillon-hanaq-adventures-module.menacing`.

## Compatibility

Version 0.7.0 updates Sarsaparilla and the racing macros to Foundry's `DialogV2` and native DOM APIs. Dice evaluation is asynchronous. Menacing supports V14's ID-keyed status registry and V13's array registry. Use a PF2e release compatible with your installed Foundry version.

PF2e's V14 status-menu integration was checked against upstream commit [`d695228`](https://github.com/foundryvtt/pf2e/blob/d695228d8763839c8ddaa0166bee325a98c1d24f/src/module/canvas/status-effects.ts). PF2e handles its own conditions and rejects custom ActiveEffects, so Menacing uses a scoped status-control listener and a token flag. It does not patch PF2e classes.

Previously imported racing macros are world copies: import the updated versions from the compendium again. The Sarsaparilla macro delegates to module code and picks up its runtime changes automatically.

## Development

- `npm ci` installs development dependencies.
- `npm run typecheck` checks TypeScript.
- `npm test` builds and runs the automated regression tests without changing a Foundry installation.
- `npm run build` builds the installable module into `dist/`, including its animation assets and compendia.
- `npm run test:local` builds and copies the module into `%LOCALAPPDATA%\FoundryVTT\Data\modules\astillon-hanaq-adventures-module` on Windows.

In PowerShell environments that block npm.ps1, use `npm.cmd` instead of `npm`.

Automated tests exercise a simulated Foundry/PF2e environment; see [V14 acceptance checks](docs/v14-acceptance.md) for the checks that require a running world.

## Sarsaparilla Surprise

The Sarsaparilla feature lives in module runtime code, so its chat interactivity and socket-driven animations load for every connected client while the module is active.

Players can drag the `Sarsaparilla Surprise` macro from the `Astillon Player Macros` compendium to their hotbar, or create a hotbar macro with:

```js
game.astillonHanaqAdventures?.sarsaparilla.run();
```

## License

MIT License. Do what you will. PRs welcome.
