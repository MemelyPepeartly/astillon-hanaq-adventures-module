# Blaster: live-world acceptance

Target inspected: Foundry **14.370**, PF2e **8.7.0** at `bdea4f90b512ccaa13c7205c357e8863a451950d`, Summons Assistant source at `c99406b145280751898d315556252ea0d53c33db`. These are source/API pins, not a claim that a live world has been tested.

Build with `npm.cmd test`. The installable output is in `dist/`. No release, remote publish, or copy into a live Foundry installation is performed by the ordinary build. Test in a disposable world with compatible PF2e, Summons Assistant and its dependencies, Sequencer, and JB2A enabled.

## NPC and compendia

- Import **Blaster** as a fresh NPC from **Blaster — NPCs**; open its sheet and place an unlinked token. Confirm level 18, AC 41, HP 330, visible skills, three saves, strikes, and linked abilities with no console errors.
- Open the hype-thrall actor and support effects. Ensure core artwork resolves and links to all eight macros open the intended macro.
- Import the macros to the hotbar. Existing world copies of other module macros/content must remain unchanged.
- On an existing Blaster with current HP, effects, custom artwork, and GM notes, run **Refresh Sheet Descriptions**. Only shipped ability descriptions should change; repeat it and confirm there are no further writes. Deleted abilities must not be recreated, and ambiguous duplicates must not be overwritten.
- Expand each charge's ability. Check that all six typed damage links and matching basic saves render, Dazzled and Stupefied 1 open the correct conditions, and the recharge die is rollable. Support links should open this module's correct effects. The manual Beam Clash die must not advance the animated contest. Native Strike controls still handle attack, MAP, and critical damage.
- Check the 0.10.7 layout: bold Frequency/Area/Requirements/Trigger labels above a horizontal rule, a short Effect, compact choices, and separately labeled Beam Clash outcomes. No long operating notes should appear above the rules in item GM-note blocks. Open the compendium actor's Notes tab for the operating reference. On a world actor, Refresh Sheet Descriptions must shorten the ability text without changing existing actor Notes or item GM notes. Confirm Bolster does not change the duration of higher temporary HP from another source.

## Connected blast

- Start combat on Blaster's turn. Use the one-action blast: click Blaster's square followed by four other squares. See a connecting preview at every click and four saved line Regions after the fifth. Confirm they are visible from a player client.
- Undo with Backspace, cancel with Escape and right-click, and leave the scene mid-placement. None should leave Regions, pointer listeners, or consume the use.
- Reject a starting point outside Blaster, consecutive duplicate points, and a path over the selected total length. Try diagonal turns and verify the scene's distance convention and coverage highlights.
- Confirm all modes share one use per round; one- and two-action variants work on later turns while the large blast recharges.
- Verify three-action full width is **three squares**, not three on each side. Attempt movement with drag, ruler, keyboard, and token configuration. It must be blocked until Blaster's next turn, but not after. Verify **Release Blast Root** allows a deliberate GM correction.
- Advance through a round boundary before Blaster's turn: root remains until that turn. End combat: root stops blocking. Out of combat, advance world time by six seconds.
- Verify each spectrum's damage and save links; apply saves/damage only once per target even if it occupies multiple segments. Apply the conditional riders manually only on a failed save.
- Clear areas with the cleanup macro. Other actors' Regions and another Blaster's areas must survive.

## Flash Mob

- As the active GM, summon one add within 30 feet on Blaster's turn. Ensure exactly one custom hype-thrall token appears, with 1 HP, helper summoner linkage and a one-minute expiration effect.
- Cancel the helper placement, then retry: cancellation must not consume the round's use. Verify a fourth simultaneous live add is refused; another Blaster's adds do not count toward this Blaster's limit.
- Confirm the add has no independent initiative. Command a living owned add within 60 feet; reject another Blaster's add, a dead add, an expired add, and an out-of-range add.
- Check inspire and guard appear on Blaster's prepared statistics, and bolster gives max(current temporary HP, 10), never additive stacking. Advance to Blaster's next turn and verify support removal, including remaining temporary HP originating from bolster.
- Advance one minute, including with automatic PF2e expired-effect removal disabled: the custom add disappears. Unrelated summons must survive.
- Disable Summons Assistant and verify the macro gives an actionable dependency warning without creating a substitute actor or token.

## Beam Clash: three browser clients

Use one GM, one owner of the blue actor, and one non-owner spectator, all viewing the same scene.

- Start from one selected token and one targeted player token. All viewers pan to frame both tokens. Verify actual installed JB2A assets play persistently, **red from selected / blue from target**, meeting at the midpoint.
- Repeat the start while only the GM is connected, including before blue has an assigned player owner. It must start without an ownership/connection error. The GM can roll both sides. Assign blue's Owner permission and connect that player; they can also roll blue in the existing clash.
- Verify the GM can click either side, while non-GM players can click only an actor they own (normally the blue player actor). Spectators see disabled controls. Check changing ownership updates the controls, and that a GM/owner race accepts only one roll for blue per round.
- Check the raised button faces, dice icon, large Roll d20 label, hover/pressed/keyboard-focus feedback, and readable submitted/result/locked states. Buttons must remain aligned while panning and zooming; token names must remain plain text.
- With only Patreon enabled and both beam settings set to auto, start a new clash: verify each native Beam002_03 30ft opener plays once, then the fully extended 1.5–2.1s segment loops at normal speed, without the 2.3s collapse. Score/position changes should enter the sustained segment directly instead of launching again. Restore an advanced clash after reconnecting and check the same behavior. The exact red/blue public previews were visually inspected: both are 1600×400, 30fps, 3.033s long. Native marker metadata ends at 3.033s on replacement/cleanup so an outro does not overlap the next beam.
- With free-only JB2A, or with both beam settings explicitly `jb2a.energy_beam.normal.bluepink.03.30ft`, verify the original sustained beam loops at 2× speed, tinted red and blue. Other explicit custom keys remain unchanged and run at 2×. The exact previous Beam002 file paths still map to their inspected native opener/loop. No Patreon binaries are bundled in this module.
- Verify `jb2a.static_electricity.02.dark_purple` surrounds only the selected token at normal speed, follows its movement/scale/visibility, and does not restart when a score changes. Re-aiming must not leave old beams or duplicate overlays behind. With the optional overlay unavailable, start should warn once but beams and rolls still work.
- Roll one side: wait for the other; do not advance score. Double-click, click from two owners, or repeat an old round request: accept only one roll per side per round.
- Verify ties keep the score, and opposing wins reverse it one step. From +2, five net blue wins reach −3. Circles above each token show d20 totals, round, three net-lead pips, and pushes remaining (red 1 / blue 5 at +2). The completed pair remains until the next roll; a pending opponent must not show an old die as its new result. Both threshold outcomes use the actual token's name, including renamed tokens and names with punctuation; HTML-like names must remain text. Beams/electricity end at victory and buttons hide; winner/loser indicators stay until GM End or a new clash.
- Start, roll several rounds (including the GM rolling both sides together), finish and cancel: no chat messages at all. Inspect that each User has at most control/red/blue request slots under this module's flags. Requests must require native updateUser origin matching that User, then current actor ownership/GM permission. Pending current-round rolls may recover after a GM reconnect, but old start/stop requests must never replay. Reload every client after upgrading; legacy chat requests are no longer consumed, and old chat history is preserved.
- Pan/zoom and move a token: buttons stay aligned and beam endpoints follow. End the clash while an animation asset is still loading: no orphan beam may appear afterward.
- Refresh a player client and switch away from then back to the scene: restore the current clash without resetting score. Disconnect the active GM and let a second GM take authority: pending requests must be handled once.
- End via macro (active and finished); delete either participant; delete the scene. Confirm beam, electricity, and indicator cleanup, including late-loading assets, and that unrelated Sequencer effects remain.
- Disable Sequencer or choose a nonexistent JB2A key: fail before starting with a useful setup warning. Other module features must still initialize.

## Evidence sources

- [Foundry V14 public API](https://foundryvtt.com/api/v14/)
- [Foundry line-shape schema](https://foundryvtt.com/api/v14/classes/foundry.data.LineShapeData.html)
- [PF2e native area placement](https://github.com/foundryvtt/pf2e/blob/bdea4f90b512ccaa13c7205c357e8863a451950d/src/module/item/helpers.ts)
- [Summons Assistant public API](https://github.com/ChasarooniZ/pf2e-summons-assistant/blob/c99406b145280751898d315556252ea0d53c33db/scripts/api.js)
- [Summons Assistant summoning pipeline](https://github.com/ChasarooniZ/pf2e-summons-assistant/blob/c99406b145280751898d315556252ea0d53c33db/scripts/summon.js)
- [PF2e creature-building benchmarks](https://2e.aonprd.com/Rules.aspx?ID=2874)
- [JB2A ranged-beam mappings](https://github.com/Jules-Bens-Aa/jb2a-databases/blob/17ee6e0d4ce579718e7a578f6cabc67b22d0c76c/jb2a_patreon/scripts/jb2a_sequencer.js)
- [Sequencer effect API: persistence and stretching](https://github.com/fantasycalendar/FoundryVTT-Sequencer/blob/d8529e70ac91cee705f3dd0803231ca1c147e1e3/docs/api/effect.md)
- [Sequencer internal-loop database markers](https://github.com/fantasycalendar/FoundryVTT-Sequencer/blob/d8529e70ac91cee705f3dd0803231ca1c147e1e3/docs/database-basics.md#internal-loops)
- [Inspected blue preview](https://library.jb2a.com/assets/Library/Generic/RangedSpell/Beam/Beam002_03_Regular_Blue_30ft_1600x400.webm) and [red preview](https://library.jb2a.com/assets/Library/Generic/RangedSpell/Beam/Beam002_03_Regular_Red_30ft_1600x400.webm) (analysis only; playback uses the installed JB2A files)
