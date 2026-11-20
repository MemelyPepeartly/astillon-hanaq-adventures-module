# Astillon Hanaq Adventures

![Foundry support](https://img.shields.io/badge/Foundry-v13--v14-informational)

Foundry VTT module content for Pathfinder 2e, including Astillon/Hanaq compendia and module-loaded utilities.

For development, start with [current project context](docs/project-state.md), the [constitution](.specify/memory/constitution.md), and [Spec Kit workflow](docs/development-workflow.md). The [baseline specification](specs/001-module-baseline/spec.md) maps current features and preserves the distinction between shipped behavior and live verification.

## Blaster

The **Blaster — NPCs**, **Blaster — Support Effects**, and **Blaster — Encounter Macros** compendia contain the complete level-18 encounter kit. Blaster is a theatrical, narcissistic artillery villain whose need for an audience is represented by fragile hype thralls. His NPC sheet includes strikes, charged blasts, Curated Spectrum, Flash Mob, and the Beam Clash reaction. Import Blaster as a **new NPC**, then drag the encounter macros to the hotbar. The new encounter tools target **Foundry V14 with PF2e 8.7**; existing module utilities retain their existing compatibility.

Blaster's portrait and prototype token both use the world asset `common/portraits/moon/blaster_portrait.png`. This is a reference to the existing Foundry data file, not an image bundled in the module.

**Updating an existing Blaster:** module updates refresh compendia, not actors already imported into a world. Use **Blaster — Upgrade Existing Sheet** (`upgradeSheet`) for mechanics/content upgrades on existing world actors; by default it preserves wounds and leaves art/custom/native spell uses untouched. **Blaster — Refresh Sheet Descriptions** remains description-only and replaces matching shipped description text without changing HP, statistics, effects, notes, or other items. Fresh imports already include the updated data.

### Blaster 0.10.19

The current encounter kit deliberately increases boss endurance and damage beyond the original level-18 baseline; live encounter balance still needs playtesting.

- **Runtime/source pin:** Foundry `14.370`, PF2e `8.7.1`, source commit `d507983d7611aad7bee01b473ba918436c6ea380`.
- **Core chassis:** HP 700 and current-HP resistance thresholds of 10/15/20 at 525/350/175. `dream` remains native extraplanar.
- **Main blasts:** 120-foot straight line, width 1/1/3, with base damage 10d10 / 14d8 / 27d10.
- **Condition modes:** roll three fewer dice than the matching base blast.
- **Slowing Beam mode:** basic Fortitude; success slow 1 (1 round), failure slow 2 (1 round), critical failure slow 3 (1 round).
- **Hypnotic mode:** mental basic Will with incapacitation; success fascinated 1 round, failure controlled 1 round, critical failure permanent. Resolve the final grade after incap, then apply the manual control tool after damage. Do not transfer ownership. Fascinated hostility-break/manual-remove behavior stays manual.
- **Grand Finale:** eight clicked points (seven 120-foot legs), width 3, base damage 36d10 (condition modes still three fewer dice).
- **Invocation gates:** no automatic combat/turn/frequency invocation locks.
- **Blastback:** once-per-day, one-action arm, native `damageTaken` bank after IWR (including temp HP interactions), 100-foot radius force, flat bank with DC 40 basic Reflex, Blaster excluded, expiry at next own turn or six world seconds, with manual editor/fire/clear controls and documented manual undo quirks (do not infer HP differences).
- **Beam Clash:** loss takes incoming critical-hit/critical-failed-save grade; win negates only against Blaster and enables the normal 2-action counterblast hit (14d8 or 11d8 rider). GM resolves via one explicit counterblast damage card; otherwise keep zero chat chatter. Rider grade follows failure grade unless higher-level hypnotic incapacitation downgrades it to success.
- **Flash Mob:** no 3-thrall runtime cap; each thrall remains 1 HP/1 minute with 30-foot helper placement and default 60-foot native owner-only aura support.
- **Command behavior:** one thrall mode for that thrall's remaining lifetime. Inspire/Guard are +1 untyped, unique per emitter, and can stack across emitters.
- **Bolster behavior:** +10 per active source, accumulated into one pool. Damage spends sources FIFO; leaving/re-entry never regenerates spent HP. Inactive sources preserve only their unspent balance.
- **Existing actors:** use **NEW Upgrade Existing Sheet** (`upgradeSheet`) to upgrade known module content while preserving wounds by default (optional full-heal). Art/custom/native spell uses stay untouched. New imports are already correct.
- **Descriptions only:** **Refresh Sheet Descriptions** remains description-only.

### Charged Blast

Select Blaster and run **Blaster — Charged Blast** as the active GM. Pick the charge and damage/effect mode, then **click once to aim** from Blaster. The preview and placed native line Region are always **120 feet long**, regardless of how close or far away the aiming click is. There is no waypoint sequence for these immediate beams. Escape or right-click cancels without creating an area.

| Actions | Mode | Damage | Length | Full width |
| --- | --- | --- | --- | --- |
| 1 | Snapshot | 10d10 | 120 feet | 1 square |
| 2 | Spotlight | 14d8 | 120 feet | 1 square |
| 3 | Standing Ovation | 27d10 | 120 feet | 3 squares |

Action/frequency/recharge text on the sheet remains **GM-adjudicated guidance, not runtime locks**. Charged Blast can be invoked in or out of combat, off-turn, and repeatedly in a round. The macro does not enforce combat/turn/frequency invocation gates.

Curated Spectrum selects fire, cold, electricity, or sonic with a DC 40 basic Reflex save. Condition-bearing modes roll **three fewer dice** than the matching base blast. **Slowing Beam** uses a basic Fortitude save (success slowed 1, failure slowed 2, critical failure slowed 3; one round each). **Hypno-Beam** uses mental damage, a basic Will save, and incapacitation (success fascinated 1 round, failure controlled 1 round, critical failure permanent). Resolve final grade after incapacitation, then apply manual control after damage; do not transfer ownership. Fascinated hostility-break and manual remove remain manual. The chat card supplies PF2e save/damage links. Resolve saves, HP, condition application, cover, and line of effect normally; each creature is affected **once**, even where segments overlap, and Blaster is excluded. The tool does not debit PF2e actions automatically.

Each charge's sheet description also has eight labeled save/damage rows using [PF2e inline syntax](https://github.com/foundryvtt/pf2e/wiki/Style-Guide#inline-automation). Choose one spectrum row and roll damage once. Condition and support-effect links open the referenced documents; they do not automatically apply or expire conditions. Beam Clash has a clearly marked manual d20 fallback that does not advance the shared automated contest. Use the macro to aim these straight beams and preserve the selected full width.

The ability text uses native PF2e-style **Frequency**, **Requirements**, **Trigger**, and **Effect** labels, horizontal separators, compact spectrum/support choices, and separate Beam Clash outcomes. Long operating instructions live under **Foundry Operating Notes** on the compendium NPC's Notes tab, not in the ability summaries. Existing world Blasters get the shorter rules text by selecting their token and running **Blaster — Refresh Sheet Descriptions** after updating/reloading. This preserves their HP, statistics, artwork, effects, item GM notes, and actor Notes; consult the compendium Notes for the new operating reference. Newly summoned/imported hype thralls and support effects also use the concise source descriptions.

**Clear Blast Areas** removes only the selected Blaster's immediate beam areas, not Grand Finale's warning/fired path. With multiple connected GMs, the blast and mob tools use Foundry's active GM to prevent concurrent uses.

### Permanent quickened, recoil, and ego weakness

**Self-Propelled Superstar** grants permanent native Quickened, with its extra action usable for Strike or Stride. The extra Stride includes a **15-foot backward line**, one square wide, using Snapshot damage and any Curated Spectrum mode. This does not spend another action, the ordinary Charged Blast use, or recharge.

Run **Blaster — Recoil Stride**, choose the mode, then drag Blaster normally. The macro uses that one move's direction and places the line behind the departure point. Escape cancels; unarmed movement never fires automatically. Movement distance, costs, and trigger legality remain GM-adjudicated. Clear Blast Areas also clears recoil lines.

**Fragile Ego:** once per round, successful Demoralize, Bon Mot, or convincing public humiliation (GM judgment) deals **30 mental feedback damage ignoring Dreamshell** and leaves Blaster **off-guard for one round**. Exposing his lies or turning his fans against him can qualify. Apply the damage manually and drag **Effect: Blaster — Bruised Ego** onto him; the triggering action also resolves normally.

### Feed the Ego and turn stinger

**Feed the Ego** costs two actions: destroy up to three living Flash Mob thralls within 60 feet and line of effect to heal **40 HP each**, up to **120 HP**. Remove the chosen adds and click the corresponding healing amount on Blaster's sheet. Consumed adds lose their support.

Blaster's Your Turn sound is configured to `common/sound-effects/combat/blaster-yeahs/Random%20Screams_5.mp3`. Fresh imports include it; **Upgrade Existing Sheet** adds the heal and applies this stinger to an existing Blaster. Other Your Turn settings are preserved.

### Blastback

Charging uses **jb2a.energy_strands.in.blue.01.0**, attached to Blaster so it follows movement. Run Start Blastback again to open the bank editor; its **Charge visual** dropdown switches immediately to the larger **jb2a.energy_strands.complete.blue.01**, or back, for everyone viewing the scene. The visual choice does not change the damage bank, and closing the editor keeps it. On release, **jb2a.fireball.loop_no_debris.blue** plays **six times**, sized to the 100-foot blast radius, then fades out. Sequencer and the matching installed JB2A assets are cosmetic dependencies; missing assets never block the ability.

**Start Blastback** arms a one-action charge, **once per day**. Use its native sheet frequency to track the daily use; GM override macros remain available. Blaster takes damage normally; native PF2e damage after resistance, including temporary-HP damage, accumulates in its bank. A 100-foot-radius warning follows his movement. At his next turn—or after six world-time seconds without a matching active combat—the charge releases a **flat force-damage card equal to the bank**, DC 40 basic Reflex, excluding Blaster. HP application is manual.

Run Start again to inspect or edit the bank; **Fire Blastback** overrides timing and **Clear Blastback** cancels it. Manual HP edits are not inferred. Native undo only reports restored ordinary HP, so temporary-HP-only undo needs a manual bank adjustment. Uncertain chat publication is never retried automatically; inspect chat before explicitly rearming.

### Grand Finale — delayed path

**Blaster — Mark Grand Finale** is a separate free-action tool. At the start of a round, choose a spectrum and click **eight points**, starting in Blaster's square. This makes seven connected legs, each up to **120 feet**, with a **three-square full width**. Backspace undoes a point; Escape/right-click cancels. The amber warning Regions are shared with the party and deal **no damage** while they reposition.

At the **start of the following global round**, the active GM resolves the saved path: its color changes to the chosen spectrum and one clickable **DC 40 basic save / 36d10 damage** card appears (condition-bearing spectra use three fewer dice). The path stays fixed even if Blaster moves. Each creature is affected once across all seven legs; HP, saves, and riders remain manual. It costs no further action when firing.

- **Fire Grand Finale** fires the saved path manually, including outside combat or as a GM timing override.
- **Clear Grand Finale** cancels the saved blast and removes only that Blaster's finale Regions.
- Completing a new mark replaces that Blaster's prior finale. Cancelling a new placement keeps the previous warning intact.
- Out-of-combat marking is manual-only; it does not silently arm itself when a later encounter starts.
- Reconnecting and duplicate combat hooks must not produce another firing card for an already resolved plan.

Fresh imports include Grand Finale. On an existing Blaster, **Upgrade Existing Sheet** adds missing homebrew abilities; Refresh Sheet Descriptions does not. Import Mark / Fire / Clear Grand Finale from **Blaster — Encounter Macros**.

### Flash Mob

Enable [PF2e Summons Assistant](https://github.com/ChasarooniZ/pf2e-summons-assistant) and its dependencies. **Blaster — Flash Mob** calls its public thrall summoning API, using this module's three custom thrall actors, the canonical Create Thrall identifier, summoner linkage, and compatible expiration effect. It does not impersonate a spell chat card or trigger a second summon. No independent fallback summon is created when the helper is missing.

The macro opens a portrait-card picker for **Hype Fan**, **Ego Guard**, or **Paparazzo**, plus **Surprise Me**. Each has its own NPC sheet and bundled transparent token/portrait. Choose a card, click **Place Thrall**, then choose its map position through Summons Assistant. Its signature aura starts automatically: Hype Fan **Inspire**, Ego Guard **Guard**, Paparazzo **Bolster**. All variants can switch to another mode through Command Flash Mob.

**Flash Mob and Command Flash Mob are GM tools usable at any time**, outside combat, off-turn, and repeatedly in a round. The GM adjudicates action economy. Flash Mob places one 1-HP add within 30 feet, lasting one minute, without an independent turn or a living-thrall cap. Command Flash Mob changes one live owned add within 60 feet to another mode for its remaining lifetime. Other thralls are unaffected. Use unlinked NPC tokens if multiple Blasters are on the scene; the helper selects an actor's first active token.

Support uses **native 60-foot aura containment** and one **Aura Totals** effect on the recipient. Every active qualifying source counts: three Inspire auras give **+3 attacks/damage/fear saves**, three Guards give **+3 AC**, and three fresh Bolsters give **30 temporary HP**. Values update on movement, mode change, death, and removal. Bolster tracks spending per source: leaving suspends its unspent contribution; re-entry restores only that remainder, never spent HP. No shared receiver UUID can suppress additional aura sources. Unexpired older marked adds have their default aura repaired on reload.

Use **Command Thrall** to change an automatically summoned add's support. The support compendium's **Aura** and **Effect** items are freely draggable onto any actor by the GM, including Blaster, players, or unrelated NPCs. Manual auras default to the bearer and allies; manual Inspire/Guard effects activate immediately and stack as separate copies. A manually placed Bolster **aura** participates in the same cumulative pool; a directly dropped Bolster **effect** uses ordinary PF2e temporary HP. Edit the radius, targeting, duration, or values freely; module summon cleanup does not remove manual placements. Automatic adds keep their owner-only stacking support and one-minute lifetime.

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

Beam Clash creates **no chat chatter** for requests, dice, start, stop, or victory. Its compact score/named-winner label stays at the beam midpoint; d20 buttons, circles, pips, and animations are unchanged. There is no on-map gamble panel or counterblast button. The counterblast API remains available for explicit GM invocation; no replacement UI is added.

The reaction is a gamble: losing makes the incoming effect a **critical hit or critically failed save** against Blaster. Winning negates it against Blaster only and grants a **free out-of-turn normal hit at two-action strength** against the opponent: 14d8 raw or 11d8 with a rider, with no further attack/save roll or action cost. Riders use failure, except Hypno-Beam against a higher-level foe uses success. Other targets resolve normally. Trigger legality and incoming damage remain GM-adjudicated; the macro does not intercept other modules' attacks. General cinematic contests between non-Blaster tokens remain available with the same compact controls.

See [Blaster's design and balance notes](docs/blaster-design.md) and the [live-world acceptance checks](docs/blaster-acceptance.md). Automated tests use simulated Foundry documents and DOM; they do not constitute a multiplayer live-world acceptance test.

## Dark Triad cutscene

Import **Dark Triad — Start Cutscene** and **Dark Triad — End Cutscene** from the encounter macros pack. As GM, Start fades the map and Foundry UI to black over **eight seconds**, revealing `common/monsters/dark_triad.png` rotating once per minute over `jb2a.call_lightning.low_res.red`. It stays on screen until End (or GM Escape), then fades back to the unchanged map. Player Escape is a local-only escape hatch.

From 0.10.22, the image rotates in the opposite direction; its speed, fade, lightning, and thunder are unchanged.

The cutscene also loops `common/sound-effects/unsorted/Thunderstorm_SFX.mp3` beneath the visuals, with Foundry's native low-pass filter at intensity 6 for a muffled rumble. It fades in over eight seconds and out over 1.5 seconds when dismissed. Each viewer hears one local copy at 70% volume through their **Environment** channel, respecting their volume and mute controls. Browser audio must be unlocked by a user gesture; ending the cutscene cancels delayed playback. Other sounds and scene filters are unchanged. Missing audio does not interrupt the visuals.

The cutscene is shared through a GM-owned world setting and rendered locally with Sequencer screen-space effects above the UI; it creates no map tiles or camera changes. Sequencer, the lightning asset, image, and thunder paths must be available to clients. No private JB2A assets or sound files are bundled.

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

**Outline control:** enable **Outline opaque parts only** in an actor's Your Turn editor to keep the white outline on solid artwork while translucent glows/wind remain visible without an outline. It defaults off. For opaque leaves or other details, choose **Paint outline exclusions**, brush over unwanted white areas, and use **Undo stroke** or **Clear mask** as needed. **Apply to draft**, then **Save** in the main editor. Painting erases only the white outline, never the portrait. Masks apply only to their image path; another image or fallback art does not inherit unrelated brush marks. Both outline settings are actor-specific and update a held preview without replaying its sound.

Configure Settings includes GM-controlled **world settings** for Your Turn. **Your Turn Cut-In** is off by default; when the GM enables it, everyone sees the turn cards. Players do not see or control these settings. **Your Turn Scale** (0.5–1.5), **Your Turn Hold** (0.5–4 seconds), and portrait width are shared too. With the cut-in enabled, each change of combatant, round, or turn plays one announcement for every combatant, including characters a viewer does not own. The graphic sits on the lower right of the usable map, leaving the left side clear: jagged theme panels, a thick white outline around the portrait, the combatant's name in large italic type, and a smaller YOUR TURN strip. It does not take clicks. The portrait is the actor's Your Turn art, then the same flag on the token's base actor, then the actor image, then the token image. The color is the actor flag, then the base actor, then #2B8CFF.

On upgrading from per-user controls in Foundry V14, the primary GM who can configure settings seeds any missing world enable/scale/hold values from their own saved preferences. Existing world choices are never overwritten, including an explicit Off. Missing or invalid values use the defaults; no player's preference is used. Older per-user values remain stored but no longer control playback. Disabling the world toggle stops active and pending cut-ins on every connected client. Reload all clients after installing the update; thereafter setting changes are shared without another reload.

Owners and the GM get a Your Turn control on the actor sheet. It opens an editor with an image field, **Portrait placement**, a color, an optional **Sound stinger** path with its own audio browser, Preview, Stop preview, Save, and Cancel. The editor's **Preview stays visible** as a stationary composition until Stop preview, Save, Cancel/close, another preview, or a combat cut-in replaces it. It works even when automatic cut-ins are off and never advances combat or saves draft flags. Automatic combat cards and direct API previews retain their normal timed animation.

Use the arrow pad to move just the portrait by **10 px**, or **1 px with Shift**. Horizontal/vertical fields allow exact offsets from -1000 to 1000 px; positive values move right/down. Use the slider, percentage field, or −/+ buttons to scale the portrait from **25% to 300%** relative to the GM's default portrait width. The −/+ buttons change 5 percentage points (1 with Shift). Nudges and scaling update the currently open preview immediately without rebuilding the card or replaying its stinger. **Reset** restores 0/0/100% in the draft. The name banner and background stay fixed.

With Preview open, moving within the **Color** picker updates the backing, highlight shards, and Your Turn strip continuously—there is no need to close the picker or click Preview again. This is a local draft only: it does not restart the card/audio or write actor flags until Save. Cancel discards it, and another actor editor or combat card is not recolored. Color changes made while portrait loading is pending are retained for that preview.

Save stores image, color, sound, and `yourTurnPortraitTransform` (`x`, `y`, `scale`) in one actor update; those adjustments apply to future turn cards for all viewers. Offsets are measured before the GM's overall cut-in scale. Cancel/close discards drafts. Token actors can inherit their base actor's placement; saving Reset explicitly overrides inherited placement with the defaults. Clearing either media path removes that flag; blank sound is silent. Existing actors without placement flags retain their current appearance.

The stinger plays once locally on each client showing the cut-in, after the portrait is ready, using Foundry's **Interface** audio volume and mute. It is not broadcast by every client. A playing clip continues to its natural end after the 2.6-second card disappears; the card timer does not truncate it. A replacement cut-in or explicit cancellation still stops the previous sound. A clip still waiting for audio unlock or loading when the card expires does not start belatedly. A missing/broken sound does not prevent the portrait from appearing. Preview is local; Stop preview, cancelling/closing that editor, or changing its sound path stops its preview without saving, even after its card has disappeared. The sound path must be available to connected clients through Foundry, like other media assets.

The GM can set **Your Turn Portrait Width (px)** under **Configure Settings → Astillon Hanaq Adventures**. This world-wide setting defaults to **400 px** (100–1000 px) at Your Turn Scale 1. It is an **exact target width, not a maximum**: a 64px image and a 1024px image both display at 600px when 600 is selected. There are no extra backdrop-width or height caps that silently cancel enlargement. Height follows the image's proportions, so tall art or large settings may extend outside the backdrop or viewport; reduce the width if desired. Portraits keep their center above the name banner, and opaque portraits retain their angular frame without cropping to fill it. The GM's overall cut-in scale also applies. Changes take effect on the next turn or Preview, including already cached art, without changing source images or actor flags. Transparent margins inside an uploaded image still count as part of that image's width.

Automatic portrait preparation runs only while Your Turn is enabled, prioritizes the current combat and scene, and defers other world portraits to bounded background work. It does not instantiate every inactive scene's synthetic actors. Outline work yields to the browser and prepared images use a bounded cache. Only relevant artwork changes warm new images. If a new portrait is not ready yet, playback waits for loading and decoding before starting its full 2.6-second timeline; obsolete turns are discarded. Invalid custom paths fall back to the actor/token art, then Foundry's generic portrait. Manual editor previews remain available when automatic cut-ins are disabled. Unopened compendia are not downloaded.

The editor uses Foundry's native FilePicker and the existing DialogV2 form. Browse, Preview, and placement controls do not submit the dialog; Save reads that specific editor and updates art, placement, color, and sound together. Two actor editors can be open without mixing drafts or moving each other's preview. Browser/save failures are reported instead of silently doing nothing. The startup preload can also be awaited explicitly with `await game.astillonHanaqAdventures["your-turn"].preload()`.

## Compatibility

Version 0.10.24 bounds Your Turn and outline-painter dialogs to the viewport and scrolls their content while keeping native Save/Apply/Cancel actions outside the scroll area. Reload clients and reopen the editor. No data migration or sheet reimport; no new tests/fixtures ran, and the layout correction has not been exercised in live Foundry.

Version 0.10.23 adds opaque-only outlines and a bounded outline-exclusion painter in Your Turn. Reload clients, then configure each portrait as desired; no sheet reimport. The requested WickerWind comparison was visually checked using the actual compiled renderer/painter in a local browser. No unit/mock/content suites ran; native Foundry save/multiplayer behavior remains unverified.

Version 0.10.22 adopts pinned Spec Kit 1.4.3 with a module constitution, baseline/context/architecture/performance docs, and policy-specific workflow skills/templates. Both CI paths now package without automated tests. It also reverses the Dark Triad image spin. Reload clients for the visual change; no sheet reimport. No tests or simulated previews were run, and live functionality remains unverified.

Version 0.10.21 addresses startup and token-operation performance: aura reconciliation is batched and scene-scoped with one provider snapshot per pass; unrelated token edits no longer trigger world-wide scans; portrait preparation is deferred and bounded; Blastback movement updates target only the affected charge. Aura stacking and manual GM effects remain supported. Update and reload every client. Release packaging only; no tests, simulated previews, or live Foundry performance measurements were run.

Version 0.10.20 adds globally triggered, locally filtered looping thunder to the Dark Triad cutscene. Update the module and reload; existing Start/End macros automatically use the sound. Release packaging only; audio and multiplayer functionality have not been tested in a real Foundry instance.

Version 0.10.19 repairs default aura activation, totals all overlapping support sources (including cumulative temporary HP), and adds the Dark Triad Start/End cutscene macros. Existing marked adds are repaired on reload. No tests or simulated previews were run; functional confirmation requires a real Foundry instance.

Version 0.10.18 adds permanent Quickened, the arm-next-move Recoil Stride macro, Fragile Ego and its off-guard effect, live-swappable Blastback charging visuals, and the six-loop blue explosion. Update/reload, import Recoil Stride, and run Upgrade Existing Sheet to add the new abilities to a world copy. Packaging only; functionality has not been tested in a real Foundry instance.

Version 0.10.17 adds Feed the Ego, raises Snapshot to 10d10 (7d10 with riders), makes Blastback once per day on the sheet, sets Blaster's Your Turn stinger, allows unrestricted GM effect/aura drops, and restores compact Beam Clash UI. Only release packaging is performed; no automated suites or simulated previews are run. Functional validation requires a real Foundry instance.

Version 0.10.16 updates Blaster's active contract to Foundry 14.370 / PF2e 8.7.1 (`d507983d7611aad7bee01b473ba918436c6ea380`), including the 700-HP chassis with current-HP resistance thresholds, updated blast/finale damage values, condition-mode behavior, Blastback bank flow, Beam Clash counterblast/loss grading, Flash Mob no-cap lifetime-mode rules, and the **Upgrade Existing Sheet** macro for existing actors while keeping **Refresh Sheet Descriptions** description-only.

Entries below 0.10.16 are preserved historical release notes and may conflict with the current Blaster mechanics.

Version 0.10.15 updates the held preview's backing and highlight colors on continuous color-picker input, without waiting for picker dismissal or another Preview click. Updates are draft-only, retain the same card/audio, honor editor ownership, and preserve the latest choice during portrait loading. Reload clients after updating. Automated tests and browser-fixture input/render checks pass; actual OS-picker dragging in live Foundry remains a manual acceptance check.

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
- Build/compile only for an authorized release; compilation is not functionality testing.
- Automated test suites are not part of this workflow. Only test actual module functionality in a real Foundry instance; see [project rules](AGENTS.md).
- `npm run build` builds the installable module into `dist/`, including its animation assets and compendia.
- `npm run test:local` builds and copies the module into `%LOCALAPPDATA%\FoundryVTT\Data\modules\astillon-hanaq-adventures-module` on Windows.

In PowerShell environments that block npm.ps1, use `npm.cmd` instead of `npm`.

The existing automated suites and older test-result notes are historical and must not be run or extended under the current policy. Use only relevant authorized [real Foundry acceptance scenarios](docs/v14-acceptance.md). See [Spec Kit setup](.specify/README.md) and [the development workflow](docs/development-workflow.md); no automated-testing or simulated-preview phase is part of that workflow.

## Sarsaparilla Surprise

The Sarsaparilla feature lives in module runtime code, so its chat interactivity and socket-driven animations load for every connected client while the module is active.

Players can drag the `Sarsaparilla Surprise` macro from the `Astillon Player Macros` compendium to their hotbar, or create a hotbar macro with:

```js
game.astillonHanaqAdventures?.sarsaparilla.run();
```

## License

MIT License. Do what you will. PRs welcome.
