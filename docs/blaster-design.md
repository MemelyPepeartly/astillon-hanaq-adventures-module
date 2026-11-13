# Blaster: balance and source notes

Blaster is a unique level-18 human artillery villain. His theatrical narcissism, calculated manipulation, callous treatment of followers, and fragile ego establish fictional Dark Triad characterization. Low Will makes ordinary Demoralize a useful counter; no additional ego subsystem or immunity exceptions are necessary.

## Creature-building benchmarks

The [GM Core creature-building rules](https://2e.aonprd.com/Rules.aspx?ID=2874), read on 2026-11-12, are the balance reference. These are encounter-design targets, not proof of play balance.

| Statistic | Selected | Level-18 comparison |
| --- | --- | --- |
| AC | 41 | Moderate 41 |
| HP | 330 | Just below moderate 331–339 |
| Fortitude / Reflex / Will | +30 / +33 / +27 | Moderate / high / low |
| Perception | +30 | Moderate |
| Ability save DC | 40 | High |
| Crystal Flechette | +35; 3d10+17 piercing; 60-foot increment | High accuracy; moderate damage, mean 33.5 |
| Backhand Rebuke | +33; 3d8+17 bludgeoning; reach 5 feet | Moderate accuracy; mean 30.5, below moderate damage |

The two ordinary Strikes provide options after or without Charged Blast, use the normal multiple-attack penalty, and receive no Curated Spectrum riders. Crystal Flechette is a physical projectile, so every actual blast remains selectable through Curated Spectrum.

| Charged Blast cost | Raw damage (mean) | Rider damage (mean) | Total path / width |
| --- | --- | --- | --- |
| 1 action | 4d6 (14) | 2d6 (7) | 60 feet / 1 square |
| 2 actions | 9d6 (31.5) | 7d6 (24.5) | 90 feet / 1 square |
| 3 actions | 18d6 (63) | 16d6 (56) | 120 feet / 3 squares |

GM Core Table 2–12 lists level-18 unlimited area damage as 9d6 (approximately 30) and limited area damage as 19d6 (approximately 67), based on a two-action activity. The one-action option is substantially lower; the reusable two-action option follows the unlimited benchmark. The three-action option stays below the limited benchmark, consumes the whole turn, roots Blaster until his next turn, and recharges only after 1d4 **full intervening rounds**: readyRound = firingRound + roll + 1. A round-4 shot with a roll of 1 becomes available in round 6. The lower modes remain usable on intervening rounds.

The three variants share one use per round and all carry flourish. PF2e item frequency counters alone do not synchronize separate action documents; runtime or the GM must enforce the shared limit. Clear Blast and Release Root never restore that use or recharge. Five waypoints make four segments with one combined length budget. Blaster is excluded; every other creature is affected at most once across the union of all segments.

Raw fire, cold, electricity, and sonic use a DC 40 basic Reflex save. Dazzling light is fire with two fewer dice and adds dazzled for 1 round only on a failure or critical failure. Psychic humiliation instead deals mental damage with two fewer dice, uses a DC 40 basic Will save, and adds stupefied 1 for 1 round only on a failure or critical failure. The reduced dice pay for the rider and flexible save/damage selection. All riders end at the start of Blaster's next turn.

Bending paths and selecting damage types offer more flexibility than a normal straight line. Playtesting should watch clustered encounters, a two-action blast followed by the accurate projectile Strike, and repeated targeting of weak Will defenses. Do not award damage once per segment.

## Reaction and support budget

Beam Clash costs Blaster's reaction and is usable once per round against a visible foe's incoming line or beam. Suspend that effect before resolution. Unmodified opposed d20 pairs move a track from 0 by one point toward the higher roller; ties do nothing. Red/Blaster wins at +3 and negates the effect against Blaster only. Blue wins at -3 and the effect resolves normally. Other targets are unaffected by the contest result. There is no reflected damage, free blast, extra action, or refunded reaction. End cancels without a winner and leaves adjudication to the GM. This adds a narrow defense, not another attack; an unbiased contest has a symmetric chance of either winner.

Flash Mob costs 1 action, creates one thrall within 30 feet, and is usable once per round with at most 3 live owned thralls. Command Flash Mob separately costs 1 action, is also usable once per round, and selects one live thrall within 60 feet to grant one benefit to Blaster. Summoning does not grant a free command. Inspire grants +1 status to attack/damage and fear saves, Guard grants +1 status AC, and Bolster grants 10 temporary HP once. The support effects end at the start of Blaster's next turn; status bonuses and temporary HP do not stack. There is no autonomous healing or recurring temporary-HP refresh.

The [Hype Thrall source](../src/packs/astillon-blaster-actors.db/Flash%20Mob%20Hype%20Thrall.json) is a custom support minion derived from the assistant's built-in Thrall. It retains 1 HP, automatic-hit/failed-save defenses, undead immunities, flanking participation, and the ability to be pushed aside. Its level-18 entry is a scaling shell, not an independent level-18 enemy or a real bard; award no separate XP. It has no turns, Strikes, spells, reactions, or standard two-action minion turn. Support commands grant no movement. These disposable bodies and their flanking can still affect an encounter; include that utility in Blaster's overall playtest.

## Verified source basis

- Foundry [releases](https://foundryvtt.com/releases/) and [API](https://foundryvtt.com/api/) checked: stable **14.370**, API generation 14.
- PF2e **8.7.0**, verified 14.370, commit **bdea4f90b512ccaa13c7205c357e8863a451950d**. Source schema/migration version **0.961**.
- PF2e [NPC source](https://github.com/foundryvtt/pf2e/blob/bdea4f90b512ccaa13c7205c357e8863a451950d/src/module/actor/npc/data.ts), [creature source](https://github.com/foundryvtt/pf2e/blob/bdea4f90b512ccaa13c7205c357e8863a451950d/src/module/actor/creature/data.ts), and [base actor source](https://github.com/foundryvtt/pf2e/blob/bdea4f90b512ccaa13c7205c357e8863a451950d/src/module/actor/data/base.ts); same-type exemplar [Ulshuk](https://github.com/foundryvtt/pf2e/blob/bdea4f90b512ccaa13c7205c357e8863a451950d/packs/pf2e/myth-speaker-bestiary/book-3-titanbane/ulshuk.json).
- PF2e [action schema](https://github.com/foundryvtt/pf2e/blob/bdea4f90b512ccaa13c7205c357e8863a451950d/src/module/item/ability/data.ts), [effect schema](https://github.com/foundryvtt/pf2e/blob/bdea4f90b512ccaa13c7205c357e8863a451950d/src/module/item/effect/data.ts), and [NPC Strike schema](https://github.com/foundryvtt/pf2e/blob/bdea4f90b512ccaa13c7205c357e8863a451950d/src/module/item/melee/data.ts). Strikes use type melee and current range data for both melee and ranged attacks.
- Support rules follow [Courageous Anthem](https://github.com/foundryvtt/pf2e/blob/bdea4f90b512ccaa13c7205c357e8863a451950d/packs/pf2e/spell-effects/spell-effect-courageous-anthem.json), [FlatModifier](https://github.com/foundryvtt/pf2e/blob/bdea4f90b512ccaa13c7205c357e8863a451950d/src/module/rules/rule-element/flat-modifier.ts), and [TempHP](https://github.com/foundryvtt/pf2e/blob/bdea4f90b512ccaa13c7205c357e8863a451950d/src/module/rules/rule-element/temp-hp.ts). Only the requested modifiers are copied; no bard feats, extra sonic dice, or spellcasting are granted.
- PF2e Summons Assistant commit **c99406b145280751898d315556252ea0d53c33db**: [Thrall skeleton](https://github.com/ChasarooniZ/pf2e-summons-assistant/blob/c99406b145280751898d315556252ea0d53c33db/packs/pf2e-summons-assistant-actors/_source/Thrall_ISmLeI8zNc6YWysQ.json) and [necromancer integration](https://github.com/ChasarooniZ/pf2e-summons-assistant/blob/c99406b145280751898d315556252ea0d53c33db/scripts/specificClasses/necromancer.js). Actor trait thrall is intentionally retained for the helper's self:trait:thrall predicate, even though current PF2e lists thrall among action/spell traits rather than its creature-trait catalog.

## Stable content contract

Actor UUIDs use Compendium.astillon-hanaq-adventures-module.astillon-blaster-actors.Actor.ID; item UUIDs use Compendium.astillon-hanaq-adventures-module.astillon-blaster-items.Item.ID.

| Document | ID | Slug or actor role |
| --- | --- | --- |
| Blaster | BlasterActor0001 | blaster |
| Flash Mob Hype Thrall | BlasterThrall001 | hype-thrall |
| Command Flash Mob | BlasterCommand01 | blaster-command-flash-mob |
| Inspire | BlasterInspire01 | blaster-inspire |
| Guard | BlasterGuard0001 | blaster-guard |
| Bolster | BlasterTempHP001 | blaster-temp-hp |
| Thrall expiration | BlasterExpiry001 | effect-thrall-expiration-date |

Actor roles are stored under flags.astillon-hanaq-adventures-module.blasterRole. Macro links resolve in astillon-blaster-macros to BlasterBlast0001, BlasterFlash0001, BlasterMobCmd001, BlasterClash0001, BlasterStop00001, BlasterClear0001, BlasterUnroot001, and BlasterText00001 (description-only refresh). Embedded Strike IDs are BlasterRange0001 and BlasterMelee0001.

Descriptions follow the [PF2e inline-automation style guide](https://github.com/foundryvtt/pf2e/wiki/Style-Guide#inline-automation): typed damage and area-damage options, basic saves, stable condition UUIDs, effect links, and non-damage dice. These formatting changes do not change the numbers above. Use only one spectrum row. The refresh macro updates matching action/Strike descriptions in a selected existing Blaster without replacing the actor; other data and unmatched/ambiguous items are preserved. Native template links are not substitutes for the four-segment path, and manual d20 links do not submit to Beam Clash's GM-controlled state.

### Ability formatting reference (0.10.7)

The rewrite follows the [PF2e formatting guide](https://github.com/foundryvtt/pf2e/wiki/Style-Guide#formatting) and the [data-entry tool's header/outcome formatter](https://github.com/TikaelSol/PF2e-Foundry-Data-Entry/blob/b3328006e402d4aeb9196dad3f9ef2114e4c476e/dataEntry.py#L850). Native examples checked at PF2e `8b6df942c21d32ceb0894d48988a04d6f9c56d38` (8.7.0, Foundry 14.370): [ancient blue dragon](https://github.com/foundryvtt/pf2e/blob/8b6df942c21d32ceb0894d48988a04d6f9c56d38/packs/pf2e/pathfinder-bestiary/blue-dragon-ancient.json) (Breath Weapon, Storm Breath, Wing Deflection), [Shield Block](https://github.com/foundryvtt/pf2e/blob/8b6df942c21d32ceb0894d48988a04d6f9c56d38/packs/pf2e/feats/general/level-1/shield-block.json), and [Courageous Anthem's effect](https://github.com/foundryvtt/pf2e/blob/8b6df942c21d32ceb0894d48988a04d6f9c56d38/packs/pf2e/spell-effects/spell-effect-courageous-anthem.json).

- Setup labels precede a horizontal rule; the effect, option list, and outcomes are short and separately readable. Native action fields remain responsible for the action glyphs/costs.
- Six typed damage/save choices remain on every charge. The bent line retains its custom placement macro; no cone or ordinary straight-line template replaces it.
- Module controls get a short, separated footer. Operational detail moves to the NPC's private Notes, **not** item GM notes: PF2e's item-summary template displays those inline above the ability, which would recreate the clutter.
- Refresh Sheet Descriptions updates only `system.description.value`. Existing actor private Notes and item GM notes remain untouched. The new compendium Notes remain available as the operating reference without overwriting campaign notes.
- Only descriptions and actor private Notes changed; all other JSON content is identical to 0.10.6. Readability tests bound paragraph/ability lengths and verify the headers, dividers, options, outcomes, and inline links.

The expiration effect has duration {value:1, unit:"minutes", expiry:"turn-start", sustained:false} and rules:[]. The runtime passes this cloned source through itemsToAdd, not the helper factory that generates attacks. It supplies context.origin actor/token as Blaster and helper summoner linkage {uuid,id,signature}; module owner data uses full actor/token UUIDs and a creation nonce. The helper's auto-expire setting defaults true; the module's marked-summon cleanup also enforces 60 world-time seconds. Do not pre-embed expiration, ownership, nonce, or helper world IDs in the reusable actor.

## Validation boundary

[Content tests](../tests/blaster-content.test.mjs) validate portable JSON sources, stable IDs/links, source-only schemas, stats, frequencies, damage/shape text, support rules, and the zero-attack thrall contract. Run node --test tests/blaster-content.test.mjs. These are static content and integration-contract checks, not a live Foundry import, sheet-open, combat-expiry, or balance test.

The runtime supplies native Region geometry and actor-enriched @Check/@Damage links; HP changes and riders remain manual. Runtime @Damage rolls use PF2e's actor modifier pipeline and collect Inspire automatically: inspect the damage preview and do not add its +1 twice. Only a raw/manual substitute roll outside that pipeline may need the single +1 damage bonus added manually, before basic-save adjustments and never per segment. PF2e frequency widgets do not themselves enforce costs, shared cooldowns, trigger legality, or Beam Clash suspension. Manual effects must be applied to Blaster with Blaster as origin for his turn-start expiry; the expiration marker belongs only on the thrall. Manual thrall placement with the assistant active also needs its summoner linkage, because its HP-zero/deletion hooks expect that data. At 0 HP a thrall is destroyed and excluded from commands and the live cap; remove its token. The helper's HP-zero hook only posts a notification, and the module's timed cleanup removes marked tokens at 60 seconds rather than immediately at 0 HP. Adjudicate unusual displacement and line-of-effect cases.
