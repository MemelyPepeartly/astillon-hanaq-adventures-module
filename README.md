# Astillon Hanaq Adventures

![Foundry support](https://img.shields.io/badge/Foundry-v13--v14-informational)

Foundry VTT module content for Pathfinder 2e, including Astillon/Hanaq compendia and module-loaded utilities.

## Blaster

The **Blaster — NPCs**, **Blaster — Support Effects**, and **Blaster — Encounter Macros** compendia contain the complete level-18 encounter kit. Blaster is a theatrical, narcissistic artillery villain whose need for an audience is represented by fragile hype thralls. His NPC sheet includes strikes, charged blasts, Curated Spectrum, Flash Mob, and the Beam Clash reaction. Import Blaster as a **new NPC**, then drag the encounter macros to the hotbar. The new encounter tools target **Foundry V14 with PF2e 8.7**; existing module utilities retain their existing compatibility.

Blaster's portrait and prototype token both use the world asset `common/portraits/moon/blaster_portrait.png`. This is a reference to the existing Foundry data file, not an image bundled in the module.

**Updating an existing Blaster:** module updates refresh compendia, not actors already imported into a world. Select Blaster and run **Blaster — Refresh Sheet Descriptions** from the encounter macros compendium. It replaces only matching shipped ability description text; HP, statistics, artwork, effects, private item notes, and other items remain unchanged. Fresh imports already include the updated descriptions.

### Charged Blast

Select Blaster and run **Blaster — Charged Blast** as the active GM. Pick the charge and damage/effect mode, then **click once to aim** from Blaster. The preview and placed native line Region are always **120 feet long**, regardless of how close or far away the aiming click is. There is no waypoint sequence for these immediate beams. Escape or right-click cancels without creating an area.

| Actions | Mode | Damage | Length | Full width |
| --- | --- | --- | --- | --- |
| 1 | Snapshot | 4d6 | 120 feet | 1 square |
| 2 | Spotlight | 9d6 | 120 feet | 1 square |
| 3 | Standing Ovation | 18d6 | 120 feet | 3 squares |

The sheet's rules give all modes one shared use per round and Standing Ovation a **1d4-full-round recharge**. These are **GM-adjudicated, not macro locks**: Charged Blast can be invoked at any time, in or out of combat, including repeatedly in a round. The macro reports the recharge guidance and still applies the three-action movement root until Blaster's next turn (six world-time seconds outside combat); Release Blast Root remains available for GM correction.

Curated Spectrum selects fire, cold, electricity, or sonic with a DC 40 basic Reflex save. Dazzling light uses fire with two fewer damage dice and dazzles on a failed save; psychic humiliation uses mental damage with two fewer dice, a basic Will save, and stupefied 1 on a failed save. Conditions last one round. The chat card supplies PF2e save/damage links. Resolve saves, HP, condition application, cover, and line of effect normally; each creature is affected **once**, even where segments overlap, and Blaster is excluded. The tool does not debit PF2e actions automatically.

Each charge's sheet description also has six labeled save/damage rows using [PF2e inline syntax](https://github.com/foundryvtt/pf2e/wiki/Style-Guide#inline-automation). Choose one spectrum row and roll damage once. Condition and support-effect links open the referenced documents; they do not automatically apply or expire conditions. Recharge has an inline GM die, and Beam Clash has a clearly marked manual d20 fallback that does not advance the shared automated contest. Use the macro to aim these straight beams and preserve the selected full width.

The ability text uses native PF2e-style **Frequency**, **Requirements**, **Trigger**, and **Effect** labels, horizontal separators, compact spectrum/support choices, and separate Beam Clash outcomes. Long operating instructions live under **Foundry Operating Notes** on the compendium NPC's Notes tab, not in the ability summaries. Existing world Blasters get the shorter rules text by selecting their token and running **Blaster — Refresh Sheet Descriptions** after updating/reloading. This preserves their HP, statistics, artwork, effects, item GM notes, and actor Notes; consult the compendium Notes for the new operating reference. Newly summoned/imported hype thralls and support effects also use the concise source descriptions.

**Clear Blast Areas** removes only the selected Blaster's immediate beam areas, not Grand Finale's warning/fired path. **Release Blast Root** is a GM adjudication tool for forced movement or corrections; clearing areas does not refund a use or end the root. With multiple connected GMs, the blast and mob tools use Foundry's active GM to prevent concurrent uses.

### Grand Finale — delayed path

**Blaster — Mark Grand Finale** is a separate free-action tool. At the start of a round, choose a spectrum and click **eight points**, starting in Blaster's square. This makes seven connected legs, each up to **120 feet**, with a **three-square full width**. Backspace undoes a point; Escape/right-click cancels. The amber warning Regions are shared with the party and deal **no damage** while they reposition.

At the **start of the following global round**, the active GM resolves the saved path: its color changes to the chosen spectrum and one clickable **DC 40 basic save / 24d6 damage** card appears (22d6 for the condition-bearing spectra). The path stays fixed even if Blaster moves. Each creature is affected once across all seven legs; HP, saves, and riders remain manual. It costs no further action, root, or Charged Blast recharge when firing.

- **Fire Grand Finale** fires the saved path manually, including outside combat or as a GM timing override.
- **Clear Grand Finale** cancels the saved blast and removes only that Blaster's finale Regions.
- Completing a new mark replaces that Blaster's prior finale. Cancelling a new placement keeps the previous warning intact.
- Out-of-combat marking is manual-only; it does not silently arm itself when a later encounter starts.
- Reconnecting and duplicate combat hooks must not produce another firing card for an already resolved plan.

Fresh imports include the new free action. Existing world Blasters need **Grand Finale** copied from the updated compendium actor; Refresh Sheet Descriptions updates existing abilities only. Import the three new macros from **Blaster — Encounter Macros**.

### Flash Mob

Enable [PF2e Summons Assistant](https://github.com/ChasarooniZ/pf2e-summons-assistant) and its dependencies. **Blaster — Flash Mob** calls its public thrall summoning API, using this module's three custom thrall actors, the canonical Create Thrall identifier, summoner linkage, and compatible expiration effect. It does not impersonate a spell chat card or trigger a second summon. No independent fallback summon is created when the helper is missing.

The macro first opens a portrait-card picker for **Hype Fan**, **Ego Guard**, or **Paparazzo**, plus **Surprise Me** for a random choice. Each has its own themed NPC sheet and bundled transparent token/portrait. Pick a card, click **Place Thrall**, then select its map position through Summons Assistant. Cancel either step without spending the use. Their signature routines highlight Inspire, Guard, and Bolster respectively, but all three retain all three support choices; no bonus is granted just by summoning.

**Flash Mob and Command Flash Mob are GM tools usable at any time**, including outside combat, on another creature's turn, or repeatedly in the same round. They do not enforce the sheet's one-action/once-per-round rules; the GM adjudicates those. Flash Mob places one 1-HP add within 30 feet, up to three living owned thralls, with a one-minute lifetime and no independent turn. Command Flash Mob chooses a live owned add within 60 feet to Inspire (+1 status to attacks, damage, and fear saves), Guard (+1 status AC), or Bolster (10 non-stacking temporary HP). Support expires at Blaster's next turn, including later in the same round after an off-turn command; without an active encounter containing Blaster it lasts six world-time seconds. Reapplying the same support refreshes that module-owned effect without stacking copies or deleting unrelated temporary HP. Use unlinked NPC tokens if multiple Blasters are on the scene, since the helper selects an actor's first active token.

Support now uses **PF2e's native 60-foot auras**, centered on the commanded thrall. Only its summoning Blaster receives the linked benefit—not players, other thralls, or another Blaster. Inspire (green) and Guard (violet) apply while he remains in the area and disappear on exit. Bolster (magenta) grants temporary HP once; those HP remain after leaving, until the aura ends, and re-entry does not refill them. Removing, destroying, or expiring the thrall ends its support. No Advanced Macros or separate aura module is required.

Use **Command Thrall** for automatic placement of the aura effect, or drag **Aura: Flash Mob — Inspire / Guard / Bolster** from **Blaster — Support Effects** onto a living thrall created with Flash Mob. These aura items go on the **thrall**, not Blaster; PF2e applies the corresponding **Effect** item to Blaster. Fresh summons include clickable links in their routines. Existing Blasters can use **Refresh Sheet Descriptions**; existing world actors are not replaced. Reload clients after updating. Inactive/hidden scenes and native aura rendering still require the live-world checks in [Blaster acceptance](docs/blaster-acceptance.md).

### Signature spells

Blaster also has **Occult Innate Spells**, DC **40**, spell attack **+32**:

| Spell | Rank | Uses |
| --- | --- | --- |
| Inner Radiance Torrent | 8 | 1/day |
| Chromatic Ray | 7 | 1/day |
| Suggestion | 9 | 1/day |
| Hypnotize | 3 | 1/day |
| Mirror Image | 2 | 3/day |
| Illusory Disguise | 3 | At will |

These use native PF2e spell cards, damage, saves, casting variants, and heightened ranks. Their normal spell rules apply independently of Charged Blast and Curated Spectrum. Use the spell icon for Illusory Disguise's card without expending a daily use; PF2e's innate Cast button still tracks uses for non-cantrips. Freshly import Blaster for the complete spellcasting section, or copy that section/spells into an existing world actor. **Refresh Sheet Descriptions does not add missing spells or overwrite actor statistics.**

### Beam Clash

Enable **Sequencer** and either **JB2A Patreon** or **JB2A Free Content**, not both. As GM, select Blaster (red), target exactly one different character token (blue), and run **Beam Clash — Start**. Both tokens need actors, but the GM can start before the target's owner connects or is assigned. Viewers of that scene pan to frame both participants. Persistent red and blue beams meet at the middle, with raised, dice-icon **Roll d20** buttons visible to everyone. **GMs can roll either side**, including on behalf of the player; non-GM users can roll only a side whose actor they own. Other players see disabled controls. Accepted rolls show the die result and wait for the other side; duplicate submissions from the GM and player do not count twice.

Both beam settings default to **auto**. With Patreon enabled, this plays the native red/blue `Beam002_03` 30ft opener once, then loops only **1.5–2.1 seconds** of each clip: the fully extended beam, before its collapse. Those timings were selected by inspecting both exact 30fps videos in the [JB2A library](https://library.jb2a.com/#Ranged). A private module-owned Sequencer database wrapper adds internal-loop markers without changing JB2A's database or distributing its videos. Re-aiming after a score/position change and reconnecting to an advanced contest use the sustained segment directly. These ranged beams retain normal playback speed and native colors.

Without Patreon, auto uses the original `jb2a.energy_beam.normal.bluepink.03.30ft` beam, tinted red/blue, at **2× playback speed**. Enter that key explicitly for both settings if you prefer this fallback with Patreon too. Other custom keys remain supported at 2×, and the previous exact Beam002 reference paths resolve to the same inspected opener/loop behavior. If a client cannot register the optional opening wrapper, it plays the sustained segment directly. End and restart an existing clash after updating. The manifest does not recommend downloading a second, free JB2A collection alongside Patreon.

During the clash, `jb2a.static_electricity.02.dark_purple` surrounds the **selected** token (normally Blaster). It attaches to the token, follows its movement and size, and retains its normal speed. The electricity is independent of beam re-aiming, so rolls and score changes do not restart it. If that optional asset is unavailable, the GM gets a setup warning and the clash still runs without the overlay.

Each pair of unmodified d20 rolls moves the shared score one point toward the higher roller; ties do not move it. Red wins at +3, blue at −3. From a red lead of +2, blue needs five net wins. **Small circular indicators above each token** show the latest d20, its round, three lead pips, and pushes remaining to win. The completed pair stays visible until someone rolls the next round; then an unrolled opponent clearly shows “waiting.” Roll buttons remain underneath the tokens.

Beam Clash creates **no chat messages**—not for requests, dice, starting, stopping, or winning. The active GM rolls and adjudicates authenticated native User-flag updates, with three bounded request slots per user. Duplicate clicks, stale rounds, forged sender IDs, and claimed client totals cannot advance the contest. Scene flags restore the indicators after reconnecting. At victory the beams/electricity end, roll buttons hide, and the indicators plus the named winner remain visible. **Beam Clash — End** clears the result (or cancels an active clash); starting another clash replaces it. Removing a participant or leaving the scene also removes the local overlay. Existing chat history from older releases is not deleted. Reload all connected clients after upgrading so everybody uses the new chat-free request protocol.

The NPC reaction suspends a triggering line/beam attack: a red win negates that attack against Blaster only; a blue win resolves it normally. This reaction's trigger, reaction expenditure, and final damage are GM adjudication, not automatic interception of other modules' attacks. The macro is also usable as a general cinematic contest between other tokens. Animation keys can be changed under Module Settings; unavailable assets produce a setup warning before starting.

See [Blaster's design and balance notes](docs/blaster-design.md) and the [live-world acceptance checks](docs/blaster-acceptance.md). Automated tests use simulated Foundry documents and DOM; they do not constitute a multiplayer live-world acceptance test.

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

## Your Turn

Configure Settings includes GM-controlled **world settings** for Your Turn. **Your Turn Cut-In** is off by default; when the GM enables it, everyone sees the turn cards. Players do not see or control these settings. **Your Turn Scale** (0.5–1.5), **Your Turn Hold** (0.5–4 seconds), and portrait width are shared too. With the cut-in enabled, each change of combatant, round, or turn plays one announcement for every combatant, including characters a viewer does not own. The graphic sits on the lower right of the usable map, leaving the left side clear: jagged theme panels, a thick white outline around the portrait, the combatant's name in large italic type, and a smaller YOUR TURN strip. It does not take clicks. The portrait is the actor's Your Turn art, then the same flag on the token's base actor, then the actor image, then the token image. The color is the actor flag, then the base actor, then #2B8CFF.

On upgrading from per-user controls in Foundry V14, the primary GM who can configure settings seeds any missing world enable/scale/hold values from their own saved preferences. Existing world choices are never overwritten, including an explicit Off. Missing or invalid values use the defaults; no player's preference is used. Older per-user values remain stored but no longer control playback. Disabling the world toggle stops active and pending cut-ins on every connected client. Reload all clients after installing the update; thereafter setting changes are shared without another reload.

Owners and the GM get a Your Turn control on the actor sheet. It opens an editor with an image field, **Portrait placement**, a color, an optional **Sound stinger** path with its own audio browser, Preview, Stop preview, Save, and Cancel. The editor's **Preview stays visible** as a stationary composition until Stop preview, Save, Cancel/close, another preview, or a combat cut-in replaces it. It works even when automatic cut-ins are off and never advances combat or saves draft flags. Automatic combat cards and direct API previews retain their normal timed animation.

Use the arrow pad to move just the portrait by **10 px**, or **1 px with Shift**. Horizontal/vertical fields allow exact offsets from -1000 to 1000 px; positive values move right/down. Use the slider, percentage field, or −/+ buttons to scale the portrait from **25% to 300%** relative to the GM's default portrait width. The −/+ buttons change 5 percentage points (1 with Shift). Nudges and scaling update the currently open preview immediately without rebuilding the card or replaying its stinger. **Reset** restores 0/0/100% in the draft. The name banner and background stay fixed.

Save stores image, color, sound, and `yourTurnPortraitTransform` (`x`, `y`, `scale`) in one actor update; those adjustments apply to future turn cards for all viewers. Offsets are measured before the GM's overall cut-in scale. Cancel/close discards drafts. Token actors can inherit their base actor's placement; saving Reset explicitly overrides inherited placement with the defaults. Clearing either media path removes that flag; blank sound is silent. Existing actors without placement flags retain their current appearance.

The stinger plays once locally on each client showing the cut-in, after the portrait is ready, using Foundry's **Interface** audio volume and mute. It is not broadcast by every client. A playing clip continues to its natural end after the 2.6-second card disappears; the card timer does not truncate it. A replacement cut-in or explicit cancellation still stops the previous sound. A clip still waiting for audio unlock or loading when the card expires does not start belatedly. A missing/broken sound does not prevent the portrait from appearing. Preview is local; Stop preview, cancelling/closing that editor, or changing its sound path stops its preview without saving, even after its card has disappeared. The sound path must be available to connected clients through Foundry, like other media assets.

The GM can set **Your Turn Portrait Width (px)** under **Configure Settings → Astillon Hanaq Adventures**. This world-wide setting defaults to **400 px** (100–1000 px) at Your Turn Scale 1. It is an **exact target width, not a maximum**: a 64px image and a 1024px image both display at 600px when 600 is selected. There are no extra backdrop-width or height caps that silently cancel enlargement. Height follows the image's proportions, so tall art or large settings may extend outside the backdrop or viewport; reduce the width if desired. Portraits keep their center above the name banner, and opaque portraits retain their angular frame without cropping to fill it. The GM's overall cut-in scale also applies. Changes take effect on the next turn or Preview, including already cached art, without changing source images or actor flags. Transparent margins inside an uploaded image still count as part of that image's width.

At world startup, each client preloads the effective portraits for world actors, scene tokens (including unlinked overrides), and combatants, plus the seven shared animation images. Portrait work is limited to four concurrent preparations and duplicate requests share a cache. Actor/token changes warm new artwork. If a new portrait is not ready yet, playback waits for loading and decoding before starting its full 2.6-second timeline; obsolete turns are discarded. Invalid custom paths fall back to the actor/token art, then Foundry's generic portrait. Unopened compendia are not downloaded.

The editor uses Foundry's native FilePicker and the existing DialogV2 form. Browse, Preview, and placement controls do not submit the dialog; Save reads that specific editor and updates art, placement, color, and sound together. Two actor editors can be open without mixing drafts or moving each other's preview. Browser/save failures are reported instead of silently doing nothing. The startup preload can also be awaited explicitly with `await game.astillonHanaqAdventures["your-turn"].preload()`.

## Compatibility

Version 0.10.14 keeps editor previews visible while you work and adds per-actor portrait nudging, exact X/Y offsets, scale controls, and Reset. Adjustments update the held preview in place without replaying its sound and save atomically with art/color/sound. Automatic combat cards keep their normal timed animation; existing actors without placement flags look unchanged. Reload clients after updating. Automated tests and an isolated browser renderer/editor check pass; live Foundry multiplayer acceptance remains separate.

Version 0.10.13 lets a playing Your Turn stinger finish after its card disappears instead of stopping it at the 2.6-second visual timeout. Explicit stop/cancel, replacement, world disable, and scene teardown still clean up audio; delayed unlock/download cannot start a stale clip. Reload connected clients after updating. Automated audio-lifecycle checks pass; live listening remains separate.

Version 0.10.12 makes Your Turn enable, scale, hold, and portrait-width settings GM-controlled world settings. Enabling cut-ins shows them for everyone, regardless of old player preferences; disabling stops active and pending playback. Players retain their actor artwork/color/sound editor but no longer see the shared controls in Configure Settings. Foundry V14 upgrades carry over the primary GM's saved enable/scale/hold values only where no world choice exists. Reload all clients after updating. Build and automated contract tests pass; live GM/player verification remains on the acceptance checklist.

Version 0.10.11 adds native 60-foot Flash Mob auras and linked support effects that benefit only their summoning Blaster. Command Thrall activates an aura on the chosen thrall, and the three aura items can also be dragged onto living Flash Mob summons. Inspire and Guard follow area entry/exit; Bolster grants temporary HP once without refilling on re-entry. Effects end with their command or thrall, with cleanup after GM handover. No additional aura module is needed. Reload connected clients and use Refresh Sheet Descriptions for existing Blasters; fresh summons have the updated ability links. Automated validation passes; live-world aura rendering and multiplayer acceptance remain separate.

Version 0.10.10 replaces the immediate charged-blast path with a one-click straight 120-foot beam, adds the free-action eight-point Grand Finale warning that fires next round, adds six native occult spells, removes hard combat/turn/frequency/recharge macro gates, and repairs partial summon placement recovery. Import the three new Grand Finale macros. Existing world actors need the new spellcasting section and Grand Finale ability copied from a fresh compendium Blaster; Refresh Sheet Descriptions updates existing descriptions only. Reload connected clients after updating. Automated tests and isolated browser previews pass; multiplayer live-world acceptance remains separate.

Version 0.10.9 gives each charged-blast leg an independent 80-foot limit, adds optional per-actor Your Turn sound stingers, and bundles Hype Fan, Ego Guard, and Paparazzo sheets/artwork with a Flash Mob selection window. Existing Blasters can use Refresh Sheet Descriptions for the updated range text. Reload all connected clients after updating; new summons use the selected variant, while existing world actors and tokens are not replaced.

Version 0.10.8 sets the compendium Blaster's current and maximum HP to 600. Existing world actors need their HP changed separately; Refresh Sheet Descriptions deliberately does not change statistics.

Version 0.10.7 reorganizes Blaster's encounter descriptions into concise PF2e-style entries, preserving all mechanics and inline controls. It does not automatically replace existing world actor descriptions; use Refresh Sheet Descriptions.

Version 0.10.6 removes the portrait fit-down caps so the configured width enlarges every portrait to that width, including tall and low-resolution art.

Version 0.10.5 adds the GM-controlled world portrait width and resolution-independent, aspect-preserving portrait sizing for Your Turn cut-ins.

Version 0.10.4 fixes the missing opener by explicitly resolving the 30ft ranged asset, replaces Beam Clash chat output with circular token indicators, and changes the selected-token overlay to purple static electricity.

Version 0.10.3 introduced the Patreon Beam Clash opener/loop configuration, the original beam at 2×, the purple energy-strands overlay, and named participants in roll and victory messages.

Version 0.10.2 lets GMs roll either Beam Clash side, makes the on-map roll buttons more distinct, and automatically uses the requested native Patreon ranged beams with persistent playback.

Version 0.10.1 adds native clickable rolls and links to Blaster's descriptions, a description-only refresh macro for existing actors, and GM-started Beam Clash setup without an online-player prerequisite.

Version 0.10.0 adds Blaster's level-18 encounter, connected charged blasts, Summons Assistant support thralls, Beam Clash, startup flash-in artwork preloading, and repaired native portrait-editor controls. The Blaster encounter tools target Foundry V14/PF2e 8.7; live-world acceptance remains a separate check from the automated suite.

Version 0.9.6 anchors the full-height cut-in between the top of the page and the hotbar. Version 0.9.5 sizes the cut-in to the usable page height and tints the demo slices from the actor color. Version 0.9.4 plays the cinematic turn-intro slices on the demo's 2.6 second timeline. Version 0.9.3 keeps the cut-in at the size it was measured, enlarges the portrait, and makes YOUR TURN the banner headline. Version 0.9.2 gives the cut-in a real pixel size so the colored wedge, banner plate, and portrait are not collapsed. Version 0.9.1 draws the colored wedge and banner backing from the actor's theme color, and loads portraits through Foundry's file route. Version 0.9.0 replaces the sidebar card with a Persona-style map cut-in. Version 0.8.1 announces every combatant's turn to each client that has the banner enabled. Version 0.8.0 adds that optional banner. Version 0.7.0 updates Sarsaparilla and the racing macros to Foundry's `DialogV2` and native DOM APIs. Dice evaluation is asynchronous. Menacing supports V14's ID-keyed status registry and V13's array registry. Use a PF2e release compatible with your installed Foundry version.

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
