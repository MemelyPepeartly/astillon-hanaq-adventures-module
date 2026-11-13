# Blaster: live-world acceptance

Target inspected: Foundry **14.370**, PF2e **8.7.0** at `bdea4f90b512ccaa13c7205c357e8863a451950d`, Summons Assistant source at `c99406b145280751898d315556252ea0d53c33db`. These are source/API pins, not a claim that a live world has been tested.

Build with `npm.cmd test`. The installable output is in `dist/`. No release, remote publish, or copy into a live Foundry installation is performed by the ordinary build. Test in a disposable world with compatible PF2e, Summons Assistant and its dependencies, Sequencer, and JB2A enabled.

## NPC and compendia

- Import **Blaster** as a fresh NPC from **Blaster — NPCs**; open its sheet and place an unlinked token. Confirm level 18, AC 41, HP 600, visible skills, three saves, strikes, and linked abilities with no console errors.
- Open the hype-thrall actor and support effects. Open Hype Fan, Ego Guard, and Paparazzo; ensure their distinct bundled portrait/token artwork resolves and links to all eleven macros open the intended macro.
- Import the macros to the hotbar. Existing world copies of other module macros/content must remain unchanged.
- On an existing Blaster with current HP, effects, custom artwork, and GM notes, run **Refresh Sheet Descriptions**. Only shipped ability descriptions should change; repeat it and confirm there are no further writes. Deleted abilities must not be recreated, and ambiguous duplicates must not be overwritten.
- Expand each charge's ability. Check that all six typed damage links and matching basic saves render, Dazzled and Stupefied 1 open the correct conditions, and the recharge die is rollable. Support links should open this module's correct effects. The manual Beam Clash die must not advance the animated contest. Native Strike controls still handle attack, MAP, and critical damage.
- Check the 0.10.7 layout: bold Frequency/Area/Requirements/Trigger labels above a horizontal rule, a short Effect, compact choices, and separately labeled Beam Clash outcomes. No long operating notes should appear above the rules in item GM-note blocks. Open the compendium actor's Notes tab for the operating reference. On a world actor, Refresh Sheet Descriptions must shorten the ability text without changing existing actor Notes or item GM notes. Confirm Bolster does not change the duration of higher temporary HP from another source.

## Native spells

- Freshly import Blaster: verify one Occult Innate Spells entry, DC 40, +32 spell attack, all six listed spells, correct heightened ranks and daily uses. Check Inner Radiance Torrent's casting variants and Chromatic Ray's clickable color outcomes; normal native spell controls must remain functional.
- Illusory Disguise is at will: use its spell-icon card without daily-use expenditure. Confirm the documented upstream innate-Cast limitation rather than inventing an unsupported at-will flag.
- Existing world actors are not silently replaced. Refresh Sheet Descriptions must still leave statistics, spell uses, and custom items intact and must not duplicate/import new spells.

## Immediate charged beams

- Use each charge tier: aim with one click from Blaster's center. Confirm one straight 120-foot Region is created, visible to player clients. Clicking nearby or beyond 120 feet changes direction only, not length.
- Undo with Backspace, cancel with Escape and right-click, and leave the scene mid-placement. None should leave Regions, pointer listeners, or consume the use.
- Clicking Blaster's center must not create a zero-length beam. Test horizontal, vertical, and diagonal aiming on different pixel-size grids. Length remains 120 feet and width remains 1/1/3 squares. A cancelled aim must leave existing areas unchanged.
- Invoke all charge tiers off-turn, with no combat, and repeatedly in one round. Legacy use/recharge flags must not block invocation; action costs and cooldown are GM-adjudicated. Advancing a turn while choosing points must not cancel placement, but moving/deleting Blaster, leaving the scene, or losing GM authority still must.
- Verify three-action full width is **three squares**, not three on each side. Attempt movement with drag, ruler, keyboard, and token configuration. It must be blocked until Blaster's next turn, but not after. Verify **Release Blast Root** allows a deliberate GM correction.
- Advance through a round boundary before Blaster's turn: root remains until that turn. End combat: root stops blocking. Out of combat, advance world time by six seconds.
- Verify each spectrum's damage and save links; apply saves/damage only once per target even if it occupies multiple segments. Apply the conditional riders manually only on a failed save.
- Clear areas with the cleanup macro. Other actors' Regions and another Blaster's areas must survive.

## Grand Finale warning and round boundary

- On round R, mark eight points (first on Blaster); reject a leg over 120 feet and accept seven 120-foot legs. Backspace/cancel/scene teardown remove preview/listeners without damaging or replacing the previous saved warning.
- Confirm seven amber, three-square-wide Regions are visible to all clients. The warning must not change HP, apply conditions, or prevent the party moving through/out of it. Move Blaster after marking: the warning stays fixed.
- Advance turns within round R: do not fire. Advance to round R+1: fire once at the global round boundary, not Blaster's turn, change the existing Regions to the selected spectrum color, and post one DC 40 basic-save / 24d6 card (22d6 for riders). Resolve each creature once even at overlaps.
- Fire manually before the due round or outside combat, then advance/reconnect: no second card. Outside-combat marking remains manual-only when a new encounter starts. Duplicate combat hooks and a second GM client must not duplicate resolution.
- Reconnect while armed, while firing, and after resolution; switch active GM and return to a different scene. Preserve the path/state and avoid duplicate cards. A failed/uncertain write must be recoverable or clearly reported, not silently replayed.
- Cancel with Clear Grand Finale, delete Blaster's token, or delete the associated combat. The pending plan must not fire later. Ordinary Clear Blast Areas must not cancel a pending Finale; Finale cleanup must not remove ordinary beams or another Blaster's Regions.
- Complete a new mark: replace only the owner's previous path. Fail scene-flag persistence deliberately: retain the prior plan and remove only newly created warning Regions. Confirm no chat/save action exists before firing.

## Flash Mob

- As the active GM, run Flash Mob on any turn and with no combat. Choose each portrait card on successive invocations and confirm the selected named sheet and matching token art are used. Test Surprise Me, keyboard selection, and cancelling the picker without spending the use. Summon one add within 30 feet. Ensure exactly one custom hype-thrall token appears, with 1 HP, helper summoner linkage and a one-minute expiration effect.
- Cancel the helper placement, then retry: cancellation must leave the tool usable. Verify a fourth simultaneous live add is refused; another Blaster's adds do not count toward this Blaster's limit.
- Advance the turn/round while the picker is open: placement must still succeed. Change the active GM, change scenes, delete the summoner, or reach the three-live cap instead: placement must stop safely. Old blasterMobUses flags must not block sequential invocations.
- Confirm all three variants share the live cap, expiry, and support eligibility. Their themed signature routines must not apply a bonus automatically or restrict the other two support choices.
- Confirm the add has no independent initiative. Command a living owned add within 60 feet; reject another Blaster's add, a dead add, an expired add, and an out-of-range add.
- Check inspire and guard appear on Blaster's prepared statistics, and bolster gives max(current temporary HP, 10), never additive stacking. Advance to Blaster's next turn and verify support removal, including remaining temporary HP originating from bolster.
- Command each support: verify its native 60-foot aura appears around the **thrall**, with green/violet/magenta accents, and its linked recipient effect appears only on the summoning Blaster. Put a player, another Blaster, and another thrall in the same area; none receive the benefit. Check walls/elevation using PF2e's native containment rules. This is a live Foundry check, not covered by the mocked area contract.
- Move Blaster outside and back into Inspire/Guard: their effects must remove and reapply without extending the original command expiry. Damage Bolster's temporary HP, leave, and re-enter: the remaining pool must not refill; Bolster stays until the aura ends. A new explicit command may refresh it.
- Drag each **Aura: Flash Mob** item onto a living summoned thrall without the command macro. Verify owner-only targeting and next-Blaster-turn/six-world-second expiry. Reject aura drops on Blaster, a player, an unlinked manually placed thrall, or a dead thrall. Plain recipient **Effect** items remain available for deliberate manual use.
- Delete the aura item, set its thrall to 0 HP, delete the thrall token, or remove its owner token: remove linked benefits (including remaining Bolster-owned HP) without touching unrelated effects or higher temporary HP. Repeat with PF2e automatic effect removal disabled and a second GM connected.
- Command before Blaster's turn, then enter his turn in the same round: support expires. Command during or after his turn: support lasts until his following turn. Outside combat (or with Blaster absent from the active encounter), advance six world-time seconds: remove only marked support, including remaining Bolster-owned HP. Reapply the same support in one round and verify there is one copy, Bolster refreshes to 10, and higher unrelated temporary HP survive.
- Advance one minute, including with automatic PF2e expired-effect removal disabled: the custom add disappears. Unrelated summons must survive.
- Disable Summons Assistant and verify the macro gives an actionable dependency warning without creating a substitute actor or token.
- Simulate helper failure after token creation but before its summoner flag/effects are written. The exact nonce-marked variant must be recognized as placed, receive its missing owner link and expiry, and count toward the cap. Wrong variants, foreign helper owners, and deleted tokens must not be adopted. If a repair write fails, the warning must acknowledge the existing token and other repairs must still be attempted.

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
