# Blaster: live-world acceptance

Target inspected: Foundry **14.370**, PF2e **8.7.1** at `d507983d7611aad7bee01b473ba918436c6ea380`, Summons Assistant source at `c99406b145280751898d315556252ea0d53c33db`.

**User policy:** Only exercise module functionality inside a real Foundry instance. Do not run unit/mock/content suites or synthetic browser previews. `npm.cmd run build` only packages the release; it is not proof of functionality. No real instance was available for 0.10.17.

## NPC and upgrade workflow

- Import **Blaster** as a fresh NPC from **Blaster — NPCs**; open its sheet and place an unlinked token. Confirm level 18, AC 41, HP 700, and current-HP resistance thresholds (10/15/20 at 525/350/175).
- Confirm native `dream`, no human/humanoid, and no sheet errors. Check 526/525, 351/350, and 176/175 HP boundaries, healing upward, and temporary HP exclusion.
- On an existing world Blaster with wounds/effects/custom art/native spell uses, run **Upgrade Existing Sheet** (`upgradeSheet`). Confirm default preserves wounds, optional full-heal is explicit, module homebrew abilities are added/updated, and art/custom/native spell-use tracking is untouched.
- Run **Refresh Sheet Descriptions** on that same actor. Confirm description-only writes: no stat/HP/effect/item-note/custom-item changes and no duplicated recreated deleted abilities.

## Charged Blast and mode outcomes

- Use each tier and confirm one-click 120-foot line placement with width 1/1/3 and base damage 10d10 / 14d8 / 27d10.
- Verify condition modes roll three fewer dice than the matching base tier.
- Validate **Slowing Beam**: basic Fortitude with one-round slowed by degree (success 1, failure 2, critical failure 3).
- Validate **Hypno-Beam**: mental basic Will + incapacitation, with outcomes success fascinated 1 round / failure controlled 1 round / critical failure permanent.
- Confirm final mode grade is resolved after incapacitation, then control is applied manually after damage, with no ownership transfer.
- Confirm fascinated hostility break and manual remove workflow remain manual-only.
- Invoke off-turn, out of combat, and repeatedly in a round: no combat/turn/frequency invocation lock should block use.

## Blastback bank

- Confirm Blastback has native once-per-day frequency, with GM override available. Arm **Blastback** (1 action) and verify bank capture uses native `damageTaken` after IWR, including temporary HP interactions.
- Confirm area is 100-foot radius, force, flat bank with DC 40 basic Reflex, and Blaster is excluded.
- In combat, verify release occurs once at Blaster's next own turn; out of combat verify six-world-second release.
- Re-run Start Blastback to inspect/adjust the bank; verify Fire Now and Clear, native ordinary-HP undo, and manual correction for temporary-HP-only undo. Move while charging: the warning follows without blocking movement.
- Confirm adjudication never infers banked damage from HP differences.

## Grand Finale path and fire

- Mark exactly eight points (first on Blaster) for seven legs up to 120 feet each and three-square width.
- Confirm warning path is visible, fixed in scene coordinates, and non-damaging while armed.
- On next global round boundary, verify one explicit card resolves at DC 40 basic save with 36d10 base damage (condition modes three fewer dice).
- Confirm each creature is resolved once across overlaps and Blaster is excluded.
- Validate **Fire Grand Finale** manual trigger, **Clear Grand Finale** cancellation, and that ordinary blast cleanup does not cancel pending Finale.

## Manual effects, healing, and sound

- Drag support effects/auras onto Blaster, a player, and an unrelated NPC as GM. Confirm they activate without role/owner-link/combat restrictions and survive module summon cleanup.
- Verify Feed the Ego's two-action entry and 40/80/120 HP links; destroy the corresponding adds manually.
- Use Upgrade Existing Sheet and confirm the requested Your Turn stinger is configured without changing other portrait options.

## Flash Mob and command auras

- Run Flash Mob repeatedly and confirm no hard 3-thrall runtime cap blocks invocation.
- Verify each summoned thrall is 1 HP, one-minute lifetime, and placed through the helper at 30 feet.
- Command one thrall and verify mode selection persists for that thrall's remaining lifetime unless explicitly changed.
- Before issuing any command, verify Hype Fan already emits Inspire, Ego Guard Guard, and Paparazzo Bolster. Each native aura is 60 feet and owner-only.
- Leave and re-enter with multiple emitters; distinct Inspire/Guard sources stack without duplicates. Kill/revive a Bolster thrall and repair an owner link: spent HP must never regenerate.
- Validate Inspire/Guard grant +1 untyped unique-per-emitter and stack across different emitters.
- Validate Bolster: aggregate +10 once per thrall lifetime with FIFO spent ledger, no re-entry refill, retains through mode changes until thrall death/expiry, maxes against external temp HP, and respects PF2e native 999 temp-HP ceiling.

## Beam Clash and counterblast

- Confirm clash remains zero-chatter except explicit GM-resolved damage cards.
- On clash loss, verify incoming effect resolves as critical-hit/critical-failed-save grade against Blaster.
- Confirm only the compact score/winner remains at the beam midpoint, with existing dice buttons and token indicators. No gamble panel, counterblast button, or replacement UI should appear.
- Confirm rider grade follows failure grade unless higher-level hypnotic incapacitation downgrades it to success.

## 0.10.19 — real Foundry only

- Spawn each variant without commanding it. Its signature native aura should already be active. Reload with old unexpired marked adds and confirm default-aura repair.
- Place Blaster inside three Inspire sources, then three Guard sources: Aura Totals should show +3 attacks/damage/fear saves and +3 AC respectively.
- Place him inside three fresh Bolster sources: 30 temporary HP. Spend 7, leave and re-enter: do not refill that damage. Remove a source and confirm only its remaining contribution disappears.
- Start Dark Triad as GM with a player connected: map/UI fade to black, transparent art spins slowly, red lightning plays behind it. GM Escape/End restores every client's view; player Escape only restores their own.

No real Foundry instance was available; these checks were not performed.

## Validation boundary

### 0.10.18 — real Foundry only

- Upgrade an existing Blaster: permanent native Quickened, Recoil Stride, and Fragile Ego should appear without changing wounds or custom items.
- Arm Recoil Stride, choose a mode, then drag once: a 15-foot, one-square-wide line should start at the departure point and extend opposite that move. Ordinary unarmed movement should do nothing. Escape cancels the pending recoil.
- Arm Blastback: inward blue energy strands should follow the token for all viewers. Switch Charge visual in the bank editor to complete strands and back; bank value must be unchanged.
- Release: the blue no-debris fireball should play six complete loops over the 100-foot radius, then fade out. Clear/rearm/reconnect must not leave old charge effects or replay past explosions.
- Resolve Fragile Ego manually for a successful Demoralize/Bon Mot or GM-judged humiliation: 30 mental feedback bypasses Dreamshell; Bruised Ego grants off-guard for one round.

No real Foundry instance was available during implementation; these functional checks were not performed.

- Release 0.10.17 was packaged only. No tests or simulated previews were run. Only functional checks in a real Foundry instance are permitted by the project policy.
- Live-world acceptance still requires manual GM/client verification for placement, ownership, timing, aura rendering, and multiplayer authority transfer.

## Evidence sources

- [Foundry V14 public API](https://foundryvtt.com/api/v14/)
- [Foundry line-shape schema](https://foundryvtt.com/api/v14/classes/foundry.data.LineShapeData.html)
- [PF2e native area placement](https://github.com/foundryvtt/pf2e/blob/d507983d7611aad7bee01b473ba918436c6ea380/src/module/item/helpers.ts)
- [PF2e actor/npc source model](https://github.com/foundryvtt/pf2e/blob/d507983d7611aad7bee01b473ba918436c6ea380/src/module/actor/npc/data.ts)
- [Summons Assistant public API](https://github.com/ChasarooniZ/pf2e-summons-assistant/blob/c99406b145280751898d315556252ea0d53c33db/scripts/api.js)
- [Summons Assistant summoning pipeline](https://github.com/ChasarooniZ/pf2e-summons-assistant/blob/c99406b145280751898d315556252ea0d53c33db/scripts/summon.js)
- [PF2e creature-building benchmarks](https://2e.aonprd.com/Rules.aspx?ID=2874)
- [Sequencer effect API: persistence and stretching](https://github.com/fantasycalendar/FoundryVTT-Sequencer/blob/d8529e70ac91cee705f3dd0803231ca1c147e1e3/docs/api/effect.md)
