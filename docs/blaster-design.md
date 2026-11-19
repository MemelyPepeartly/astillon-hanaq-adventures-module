# Blaster: balance and source notes

Blaster is a unique level-18 extraplanar dream being, tagged with PF2e's native **dream** trait rather than human/humanoid. The 700-HP chassis and boosted damage are requested boss overrides, not a claim of standard level-18 balance. Dreamshell grants resistance to all damage at exact current-HP fractions: 10 at 75%, 15 at 50%, 20 at 25% (525/350/175 at 700 maximum). Healing reverses tiers; temporary HP do not count.

## Feed the Ego

Two actions consume one to three living Flash Mob thralls within 60 feet and line of effect. Each heals 40 HP, up to 120 HP. This trades support for healing; the GM removes the chosen thralls and applies the linked healing amount. No macro enforces the cost or selection.

## Creature-building benchmarks

The [GM Core creature-building rules](https://2e.aonprd.com/Rules.aspx?ID=2874), read on 2026-11-12, are the balance reference. These are encounter-design targets, not proof of play balance.

| Statistic | Selected | Level-18 comparison |
| --- | --- | --- |
| AC | 41 | Moderate 41 |
| HP | 700 | User-requested boss endurance override; increased from the original 330 |
| Fortitude / Reflex / Will | +30 / +33 / +27 | Moderate / high / low |
| Perception | +30 | Moderate |
| Ability save DC | 40 | High |
| Crystal Flechette | +35; 3d10+17 piercing; 60-foot increment | High accuracy; moderate damage, mean 33.5 |
| Backhand Rebuke | +33; 3d8+17 bludgeoning; reach 5 feet | Moderate accuracy; mean 30.5, below moderate damage |

The two ordinary Strikes retain normal MAP and no Curated Spectrum riders. The six native spells are unchanged. Charged Blast, Grand Finale, and the Beam Clash counterhit use Curated Spectrum; Blastback is always flat force damage.

| Charged Blast cost | Raw damage (mean) | Rider damage (mean) | Straight length / width |
| --- | --- | --- | --- |
| 1 action | 10d10 (55) | 7d10 (38.5) | 120 feet / 1 square |
| 2 actions | 14d8 (63) | 11d8 (49.5) | 120 feet / 1 square |
| 3 actions | 27d10 (148.5) | 24d10 (132) | 120 feet / 3 squares |

The blast table above is now a contract statement for this module revision, not a claim against historical benchmark equivalence. Runtime and acceptance checks validate shape, dice, and manual adjudication flow; they are not encounter-balance proof.

PF2e item frequency counters remain sheet guidance and do not create runtime gating. Macro invocation deliberately has no combat, turn, frequency, or recharge lock. All three immediate variants place one straight 120-foot line, aimed with one click from the selected token's center. The old five-waypoint activity is replaced by the separate delayed Grand Finale. Blaster is excluded from both abilities; overlapping Finale legs never multiply damage.

Raw fire, cold, electricity, and sonic use a DC 40 basic Reflex save. Condition-bearing modes now use three fewer dice than their base damage mode. Slowing Beam is a basic Fortitude save with one-round slow scaling (success 1, failure 2, critical failure 3). Hypno-Beam deals mental damage and uses a basic Will save with incapacitation (success fascinated 1 round, failure controlled 1 round, critical failure permanent). Resolve the final grade after incapacitation, then apply control manually after damage without transferring ownership. Fascinated hostility breaks and removal are still manual.

Grand Finale's bending path and selectable damage types offer more flexibility than a normal straight line. Playtesting should watch clustered encounters, a two-action blast followed by the accurate projectile Strike, and repeated targeting of weak Will defenses. Do not award damage once per segment.

## Grand Finale telegraph

The free-action Grand Finale marks eight clicked points (seven legs, each up to 120 feet), starting on Blaster, at the beginning of a round. Its three-square-wide warning persists at fixed scene coordinates, then resolves at the next **global round** boundary for 36d10 raw damage (mean 198), DC 40 basic Reflex; spectrum save/rider rules still apply. Condition-bearing modes use three fewer dice. This intentionally exceeds Standing Ovation in exchange for a full round of visible warning and the chance to move out. Keep reachable safe spaces when marking; this more powerful, potentially 840-foot path needs encounter playtesting.

The sheet's free-action frequency and trigger are GM-adjudicated. Without combat, marking is allowed but manual-only; Fire Grand Finale remains available at any time. The active GM schedules from the round when marking finishes. The saved path, spectrum, width, and damage do not follow later token movement. No HP changes are automatic; firing produces one actor-context save/damage card. Clearing or replacing a finale cannot remove another Blaster's Regions or normal charged beams. Refresh Sheet Descriptions cannot add the new action to a pre-existing actor.

## Reaction and support budget

Beam Clash costs Blaster's reaction and is usable once per round against a visible foe's incoming line or beam. Suspend that effect before resolution. Unmodified opposed d20 pairs move a track from 0 by one point toward the higher roller; ties do nothing. Red/Blaster wins at +3 and negates the effect against Blaster only, then enables the normal 2-action counterblast hit (14d8, or 11d8 for rider mode) via one GM-resolved explicit damage card. Blue wins at -3 and the incoming effect resolves against Blaster as a critical hit/critical failed save grade. Other targets are unaffected by the contest result. Rider grading follows failure grade unless a higher-level hypnotic incapacitation downgrade changes it to success. End cancels without a winner and leaves adjudication to the GM.

Flash Mob costs 1 action and creates a 1-HP, one-minute thrall within 30 feet with its signature aura already active. There is no living-thrall cap. Command costs 1 action and changes one thrall within 60 feet to another support mode for its remaining lifetime. Inspire and Guard stack +1 untyped modifiers from distinct sources. Bolster contributes +10 temporary HP once per thrall lifetime, spends FIFO, survives mode changes, and ends on death/expiry. It never refills on re-entry and competes by maximum with unrelated pools, capped at 999.

The [Hype Thrall source](../src/packs/astillon-blaster-actors.db/Flash%20Mob%20Hype%20Thrall.json) is a custom support minion derived from the assistant's built-in Thrall. It retains 1 HP, automatic-hit/failed-save defenses, undead immunities, flanking participation, and the ability to be pushed aside. Its level-18 entry is a scaling shell, not an independent level-18 enemy or a real bard; award no separate XP. It has no turns, Strikes, spells, reactions, or standard two-action minion turn. Support commands grant no movement. These disposable bodies and their flanking can still affect an encounter; include that utility in Blaster's overall playtest.

Hype Fan, Ego Guard, and Paparazzo have separate NPC sheets and transparent art, with default Inspire, Guard, and Bolster auras respectively. All retain all three mode choices. The radio picker, including random selection, passes exactly one actor UUID to Summons Assistant. Actor identity, scene, and authority are rechecked after asynchronous steps; turn changes never prevent invocation.

## Blastback bank model

Blastback is once per day (native sheet frequency, GM override available) and arms for 1 action and records native `damageTaken` after IWR, including temporary-HP damage. It does not infer HP deltas or prevent damage. Release occurs at the next own turn, or six world-time seconds without a matching active combat. The warning follows movement until release; the card freezes its center and exact force bank in a 100-foot radius. Native undo only reports restored ordinary HP; temporary-HP-only undo and manual edits need a manual bank adjustment. Explicit Edit / Fire / Clear controls remain available.

## GM-controlled timing and spells

Sheet costs, frequencies, and recharge are GM-adjudicated. No combat/turn/frequency invocation locks or movement vetoes are installed. Standing Ovation's 1d4 full-round recharge remains informational: round 4 plus a result of 1 means round 6. Aura support is tied to each thrall's remaining one-minute lifetime, not Blaster's next turn.

Command support is a native PF2e `Aura` on the chosen thrall, with a 60-foot radius and linked owner-only recipient effect. Its target predicate resolves the Summons Assistant owner's actor signature; `affects: all` does not mean all creatures benefit, because only the exact summoning Blaster matches that predicate. The emitter excludes itself. Native PF2e controls area containment and entry/exit. Inspire and Guard remove on exit; Bolster deliberately retains its lifetime ledger state outside the area and does not refill from re-entry.

Each thrall embeds its default aura plus three inert receiver templates. Aura effect UUIDs resolve to that emitter actor's embedded receiver, providing distinct native sources. `preCreateItem` validates source UUID, native containment, summoner signature, and owner linkage before enabling receiver rules and assigning per-emitter modifier slugs. The separate support-pack sources are intentionally active for manual GM drops on any actor. Manual items are excluded from module cleanup; manual aura targeting defaults to self/allies and remains editable. Inert templates exist only inside automatically summoned adds. Native aura recipients remain unlimited; primary-GM cleanup enforces the thrall lifetime. Bolster has no native TempHP rule: the atomic actor-update ledger preserves spending, unrelated pool expiry, and once-granted tombstones through revival or owner-link repair.

Aura data and lifecycle were checked against Foundry 14.370 and PF2e `d507983d7611aad7bee01b473ba918436c6ea380`: [Aura rule](https://github.com/foundryvtt/pf2e/blob/d507983d7611aad7bee01b473ba918436c6ea380/src/module/rules/rule-element/aura.ts), [native application](https://github.com/foundryvtt/pf2e/blob/d507983d7611aad7bee01b473ba918436c6ea380/src/module/actor/base.ts), and [area cleanup](https://github.com/foundryvtt/pf2e/blob/d507983d7611aad7bee01b473ba918436c6ea380/src/module/actor/helpers.ts). Contract tests are not live aura-rendering or multiplayer proof.

Occult innate spells add beam alternatives (8th-rank Inner Radiance Torrent, 7th-rank Chromatic Ray), spectacle/control (3rd-rank Hypnotize, 9th-rank Suggestion), and vanity/misdirection (2nd-rank Mirror Image three/day, 3rd-rank Illusory Disguise at will). Other finite spells are one/day. DC 40 and +32 spell attacks share the level-18 high spell benchmark. These spells do not inherit Charged Blast's custom path or Curated Spectrum. Hypnotize remains rank 3 because it has neither a heightening benefit nor incapacitation. Suggestion's rank 9 supports its multi-target heightening and level-appropriate incapacitation threshold. This expands versatility; it is not live encounter-balance proof.

## Verified source basis

Entourage/range update rechecked against Foundry **14.370** and PF2e **8.7.1** at `d507983d7611aad7bee01b473ba918436c6ea380`. The original implementation pins below remain historical references.

- Foundry [releases](https://foundryvtt.com/releases/) and [API](https://foundryvtt.com/api/) checked: stable **14.370**, API generation 14.
- PF2e **8.7.1**, verified 14.370, commit **d507983d7611aad7bee01b473ba918436c6ea380**. Source schema/migration version **0.961**.
- PF2e [NPC source](https://github.com/foundryvtt/pf2e/blob/d507983d7611aad7bee01b473ba918436c6ea380/src/module/actor/npc/data.ts), [creature source](https://github.com/foundryvtt/pf2e/blob/d507983d7611aad7bee01b473ba918436c6ea380/src/module/actor/creature/data.ts), and [base actor source](https://github.com/foundryvtt/pf2e/blob/d507983d7611aad7bee01b473ba918436c6ea380/src/module/actor/data/base.ts); same-type exemplar [Ulshuk](https://github.com/foundryvtt/pf2e/blob/d507983d7611aad7bee01b473ba918436c6ea380/packs/pf2e/myth-speaker-bestiary/book-3-titanbane/ulshuk.json).
- PF2e [action schema](https://github.com/foundryvtt/pf2e/blob/d507983d7611aad7bee01b473ba918436c6ea380/src/module/item/ability/data.ts), [effect schema](https://github.com/foundryvtt/pf2e/blob/d507983d7611aad7bee01b473ba918436c6ea380/src/module/item/effect/data.ts), and [NPC Strike schema](https://github.com/foundryvtt/pf2e/blob/d507983d7611aad7bee01b473ba918436c6ea380/src/module/item/melee/data.ts). Strikes use type melee and current range data for both melee and ranged attacks.
- Support rules follow [Courageous Anthem](https://github.com/foundryvtt/pf2e/blob/d507983d7611aad7bee01b473ba918436c6ea380/packs/pf2e/spell-effects/spell-effect-courageous-anthem.json), [FlatModifier](https://github.com/foundryvtt/pf2e/blob/d507983d7611aad7bee01b473ba918436c6ea380/src/module/rules/rule-element/flat-modifier.ts), and [TempHP](https://github.com/foundryvtt/pf2e/blob/d507983d7611aad7bee01b473ba918436c6ea380/src/module/rules/rule-element/temp-hp.ts). Only the requested modifiers are copied; no bard feats, extra sonic dice, or spellcasting are granted.
- PF2e Summons Assistant commit **c99406b145280751898d315556252ea0d53c33db**: [Thrall skeleton](https://github.com/ChasarooniZ/pf2e-summons-assistant/blob/c99406b145280751898d315556252ea0d53c33db/packs/pf2e-summons-assistant-actors/_source/Thrall_ISmLeI8zNc6YWysQ.json) and [necromancer integration](https://github.com/ChasarooniZ/pf2e-summons-assistant/blob/c99406b145280751898d315556252ea0d53c33db/scripts/specificClasses/necromancer.js). Actor trait thrall is intentionally retained for the helper's self:trait:thrall predicate, even though current PF2e lists thrall among action/spell traits rather than its creature-trait catalog.

## Stable content contract

Actor UUIDs use Compendium.astillon-hanaq-adventures-module.astillon-blaster-actors.Actor.ID; item UUIDs use Compendium.astillon-hanaq-adventures-module.astillon-blaster-items.Item.ID.

| Document | ID | Slug or actor role |
| --- | --- | --- |
| Blaster | BlasterActor0001 | blaster |
| Grand Finale (embedded free action) | BlasterFinaleAct | blaster-grand-finale |
| Mark / Fire / Clear Grand Finale macros | BlasterMark00001 / BlasterFire00001 / BlasterWipe00001 | markFinale / fireFinale / clearFinale |
| Flash Mob Hype Fan | BlasterThrall001 | hype-thrall / hype-fan |
| Flash Mob Ego Guard | BlasterThrall002 | hype-thrall / ego-guard |
| Flash Mob Paparazzo | BlasterThrall003 | hype-thrall / paparazzo |
| Command Flash Mob | BlasterCommand01 | blaster-command-flash-mob |
| Inspire | BlasterInspire01 | blaster-inspire |
| Guard | BlasterGuard0001 | blaster-guard |
| Bolster | BlasterTempHP001 | blaster-temp-hp |
| Inspire aura | BlasterAuraIns01 | blaster-aura-inspire |
| Guard aura | BlasterAuraGrd01 | blaster-aura-guard |
| Bolster aura | BlasterAuraBol01 | blaster-aura-bolster |
| Thrall expiration | BlasterExpiry001 | effect-thrall-expiration-date |

Actor roles are stored under flags.astillon-hanaq-adventures-module.blasterRole. Macro links resolve in astillon-blaster-macros to BlasterBlast0001, BlasterFlash0001, BlasterMobCmd001, BlasterClash0001, BlasterStop00001, BlasterClear0001, BlasterUnroot001, and BlasterText00001 (description-only refresh). Embedded Strike IDs are BlasterRange0001 and BlasterMelee0001.

Descriptions follow the [PF2e inline-automation style guide](https://github.com/foundryvtt/pf2e/wiki/Style-Guide#inline-automation): typed damage and area-damage options, basic saves, stable condition UUIDs, effect links, and non-damage dice. These formatting changes do not change the numbers above. Use only one spectrum row. The refresh macro updates matching action/Strike descriptions in a selected existing Blaster without replacing the actor; other data and unmatched/ambiguous items are preserved. Native template links are not substitutes for Grand Finale's eight-point path, and manual d20 links do not submit to Beam Clash's GM-controlled state.

### Historical ability formatting reference (0.10.7)

The 0.10.7 rewrite followed the [PF2e formatting guide](https://github.com/foundryvtt/pf2e/wiki/Style-Guide#formatting) and the [data-entry tool's header/outcome formatter](https://github.com/TikaelSol/PF2e-Foundry-Data-Entry/blob/b3328006e402d4aeb9196dad3f9ef2114e4c476e/dataEntry.py#L850). Native examples checked at PF2e `8b6df942c21d32ceb0894d48988a04d6f9c56d38` (8.7.0, Foundry 14.370): [ancient blue dragon](https://github.com/foundryvtt/pf2e/blob/8b6df942c21d32ceb0894d48988a04d6f9c56d38/packs/pf2e/pathfinder-bestiary/blue-dragon-ancient.json) (Breath Weapon, Storm Breath, Wing Deflection), [Shield Block](https://github.com/foundryvtt/pf2e/blob/8b6df942c21d32ceb0894d48988a04d6f9c56d38/packs/pf2e/feats/general/level-1/shield-block.json), and [Courageous Anthem's effect](https://github.com/foundryvtt/pf2e/blob/8b6df942c21d32ceb0894d48988a04d6f9c56d38/packs/pf2e/spell-effects/spell-effect-courageous-anthem.json).

- Setup labels precede a horizontal rule; the effect, option list, and outcomes are short and separately readable. Native action fields remain responsible for the action glyphs/costs.
- That release had six typed damage/save choices; 0.10.16 has eight. The separate Grand Finale path retains its custom placement macro; immediate Charged Blasts now use straight 120-foot beams.
- Module controls get a short, separated footer. Operational detail moves to the NPC's private Notes, **not** item GM notes: PF2e's item-summary template displays those inline above the ability, which would recreate the clutter.
- Refresh Sheet Descriptions updates only `system.description.value`. Existing actor private Notes and item GM notes remain untouched. The new compendium Notes remain available as the operating reference without overwriting campaign notes.
- In 0.10.7 only descriptions and actor private Notes changed; that historical preservation statement does not apply to 0.10.16. Readability tests bound paragraph/ability lengths and verify the headers, dividers, options, outcomes, and inline links.

The expiration effect has duration {value:1, unit:"minutes", expiry:"turn-start", sustained:false} and rules:[]. The runtime passes this cloned source through itemsToAdd, not the helper factory that generates attacks. It supplies context.origin actor/token as Blaster and helper summoner linkage {uuid,id,signature}; module owner data uses full actor/token UUIDs and a creation nonce. The helper's auto-expire setting defaults true; the module's marked-summon cleanup also enforces 60 world-time seconds. Do not pre-embed expiration, ownership, nonce, or helper world IDs in the reusable actor.

## Validation boundary

Placement recovery also accounts for [TCAL's replacement of actor update flags](https://github.com/ddbrown30/tcal/blob/82f0954d99531a2aec6ddbec678c27aa25a668ba/scripts/tcal.js#L25) and [Summons Assistant adding effects before restoring its summoner link](https://github.com/ChasarooniZ/pf2e-summons-assistant/blob/c99406b145280751898d315556252ea0d53c33db/scripts/summon.js#L134). A failed post-placement step must not be reported as cancellation: recover only an existing token matching this invocation's nonce, both owner UUIDs, scene, NPC role, and selected variant, reject a foreign helper owner, then restore missing summoner linkage before repairing HP/expiry. Independent repair failures are reported as a placed token requiring inspection, not as zero tokens placed.

Do not run or extend the legacy content/unit/mock suites. The project policy in [AGENTS.md](../AGENTS.md) permits functional testing only inside a real Foundry instance. Release compilation is packaging, not validation.

Native Regions visualize areas; save and damage cards use actor-context PF2e rolls and include Inspire modifiers automatically. Do not add support damage twice or per segment. **Apply Blast Effect** creates the selected native-condition wrapper after damage, with final incapacitation grading supplied by the GM and Blaster as origin. Finite wrappers last one round; permanent control is unlimited. Their in-memory GrantItem rules use verified condition IDs, because this module does not run PF2e's named-link compiler. Fascinated hostility breaks require manual wrapper removal. Thrall HP-zero support cleanup and 60-second token deletion are separate; remove a destroyed token as needed.

For existing world actors, `upgradeSheet` (Upgrade Existing Sheet) is the source-of-truth upgrade path: preserve wounds by default, optional full-heal, add new homebrew abilities, and update known module entries without overwriting art/custom edits/native spell-use counters. Refresh Sheet Descriptions remains description-only.
