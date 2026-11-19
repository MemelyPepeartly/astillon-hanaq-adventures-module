import type { ModuleFeature } from "./feature.js";
import { BLAST_MODES, BLAST_TIERS, blastDamage, blastTraits, blastRiderLinks, lineShapes, type BlastMode, type Charge } from "./blaster-model.js";
import { blastChoiceContent, bindBlastChoices } from "./blaster-controls.js";
import { createBlasterSummons } from "./blaster-summons.js";
import { createBlastPicker } from "./blaster-placement.js";
import { createBlasterFinale } from "./blaster-finale.js";
import { createBlasterBlastback } from "./blaster-blastback.js";
import { createBlasterResolution } from "./blaster-resolution.js";
import { createBlasterRecoil } from "./blaster-recoil.js";

type BlastUse = { combatId: string | null; round: number; mode?: BlastMode; rechargeCombatId?: string | null; readyRound?: number; readyTime?: number };

export function createBlasterFeature(moduleId: string): ModuleFeature {
  const summons = createBlasterSummons(moduleId);
  let busy = false;
  const picker = createBlastPicker();
  const finale = createBlasterFinale(moduleId, { selectToken: selected, picker });
  const blastback = createBlasterBlastback(moduleId, { selectToken: selected });
  const resolution = createBlasterResolution(moduleId, { selectToken: selected });
  const recoil = createBlasterRecoil(moduleId, { selectToken: selected });
  const escape = (s: string) => foundry.utils.escapeHTML(s);
  const combatFor = (scene: any) => game.combat?.scene?.id === scene.id ? game.combat : null;
  const notifyError = (error: unknown) => {
    console.error(`${moduleId} | Blaster`, error);
    ui.notifications.error(error instanceof Error ? error.message : String(error));
  };

  function selected() {
    if (!game.user.isGM) throw new Error("Only the GM can operate Blaster's blast.");
    if (game.users.activeGM?.id !== game.user.id) throw new Error("Use the active GM client for Blaster's blast tools to prevent simultaneous duplicate uses.");
    if (game.system.id !== "pf2e") throw new Error("Blaster requires Pathfinder 2e.");
    if (!canvas.ready || !canvas.grid.isSquare) throw new Error("Open a scene with a square grid first.");
    if (Number(game.release?.generation) < 14 || !canvas.regions) throw new Error("Blaster's area tool requires Foundry V14.");
    const tokens = canvas.tokens.controlled;
    if (tokens.length !== 1 || tokens[0].actor?.getFlag(moduleId, "blasterRole") !== "blaster") {
      throw new Error("Select exactly one Blaster token from the shipped NPC compendium.");
    }
    if (!tokens[0].document.isOwner || !tokens[0].actor.isOwner) throw new Error("You must own the selected Blaster token and actor.");
    return tokens[0];
  }

  async function blast(preset: { charge?: Charge; mode?: BlastMode } = {}) {
    if (busy || picker.busy) return ui.notifications.warn("Finish or cancel the current blast first.");
    busy = true;
    try {
      const token = selected();
      const scene = canvas.scene;
      const defaultCharge = preset.charge ?? 1;
      const savedMode = token.actor.getFlag(moduleId, "blastUse")?.mode;
      const defaultMode = preset.mode ?? (Object.prototype.hasOwnProperty.call(BLAST_MODES, savedMode) ? savedMode : "fire");
      if (![1, 2, 3].includes(defaultCharge) || !Object.prototype.hasOwnProperty.call(BLAST_MODES, defaultMode)) throw new Error("Invalid blast preset.");
      const snapshot = { x: token.document.x, y: token.document.y };
      const validateToken = () => {
        if (selected() !== token || canvas.scene !== scene || token.document.parent !== scene || scene.tokens.get(token.id) !== token.document || token.document.x !== snapshot.x || token.document.y !== snapshot.y) {
          throw new Error("The scene or selected token changed during placement. Start the blast again.");
        }
      };
      const chosen = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Blaster · Charged Blast" },
        content: blastChoiceContent(defaultCharge, defaultMode),
        render: (_event: any, dialog: any) => bindBlastChoices(dialog?.element),
        ok: { label: "Aim blast", callback: (_event: Event, button: any) => ({ charge: Number(button.form.elements.charge.value), mode: button.form.elements.mode.value }) },
        rejectClose: false,
      });
      if (!chosen) return;
      const charge = chosen.charge as Charge;
      const mode = chosen.mode as BlastMode;
      if (![1, 2, 3].includes(charge) || !Object.prototype.hasOwnProperty.call(BLAST_MODES, mode)) throw new Error("Invalid blast selection.");
      validateToken();
      const tier = BLAST_TIERS[charge];
      const spectrum = BLAST_MODES[mode];
      const points = await picker.pick(token, { title: `${tier.name} · ${spectrum.label}`, pointCount: 2, range: tier.range, width: tier.width, color: spectrum.color, fixedLength: tier.range });
      validateToken();
      if (!points) return;
      const traits = blastTraits(mode).join(",");
      const blastId = foundry.utils.randomID();
      const data = lineShapes(points, canvas.grid.size, tier.width).map(shape => ({
        name: `${token.name} — ${tier.name} · ${spectrum.label}`, shapes: [shape],
        levels: canvas.level ? [canvas.level.id] : [], color: spectrum.color,
        highlightMode: "coverage", displayMeasurements: true,
        visibility: (globalThis as any).CONST.REGION_VISIBILITY.ALWAYS,
        ownership: { [game.user.id]: 3 },
        flags: { pf2e: { areaShape: "line" }, [moduleId]: { blast: { id: blastId, tokenId: token.id, actorUuid: token.actor.uuid, charge, mode } } },
      }));
      const recharge = charge === 3 ? await new foundry.dice.Roll("1d4").evaluate() : null;
      validateToken();
      // Combat timing is bookkeeping only; use the current combat after every placement await.
      const currentCombat = combatFor(scene);
      const combat = currentCombat?.started ? { id: currentCombat.id, round: currentCombat.round } : null;
      const previous = token.actor.getFlag(moduleId, "blastUse") as BlastUse | undefined;
      const use: BlastUse = { ...previous, combatId: combat?.id ?? null, round: combat?.round ?? 0, mode };
      if (recharge) {
        use.rechargeCombatId = combat?.id ?? null;
        use.readyRound = (combat?.round ?? 0) + recharge.total + 1;
        use.readyTime = game.time.worldTime + (recharge.total + 1) * 6;
      }
      const created = await scene.createEmbeddedDocuments("Region", data);
      try {
        await token.actor.setFlag(moduleId, "blastUse", use);
      } catch (error) {
        await scene.deleteEmbeddedDocuments("Region", created.map((r: any) => r.id));
        throw error;
      }
      const card = `<h3>${escape(token.name)} · ${tier.name} · ${spectrum.label}</h3><p>${charge} action${charge === 1 ? "" : "s"} · DC 40 · ${tier.range} ft line, ${tier.width} square${tier.width === 1 ? "" : "s"} wide</p><p>@Check[${spectrum.save}|dc:40|basic|traits:${traits}] @Damage[${blastDamage(tier.dice, tier.die, mode)}[${spectrum.damage}]|traits:${traits}|options:area-damage]</p><p>One save and one damage application per creature in the 120-foot line. Blaster is excluded. Resolve cover and line of effect normally. The map area is a visual guide, not automatic damage.</p><p>No automatic movement lock is applied; the GM adjudicates movement costs manually.</p>${blastRiderLinks(moduleId, mode)}${spectrum.rider ? `<p>After applying damage, target creatures with the same final save outcome and use @UUID[Compendium.${moduleId}.astillon-blaster-macros.Macro.BlasterResolve01]{Apply Blast Effect}. Use the degree after incapacitation adjustments.</p>` : ""}${recharge ? `<p>Standing Ovation recharge (reference): ${recharge.total} full rounds${combat ? `; available round ${use.readyRound} in this combat` : ""}. Adjudicate recharge from the sheet.</p>` : ""}`;
      const action = token.actor.items?.find?.((item: any) => item.slug === `blaster-charged-blast-${charge}`);
      const content = await game.pf2e.TextEditor.enrichHTML(card, { rollData: action?.getRollData() ?? token.actor.getRollData() });
      await foundry.documents.ChatMessage.implementation.create({
        speaker: foundry.documents.ChatMessage.getSpeaker({ token: token.document }), content,
        flags: { [moduleId]: { blast: { id: blastId, sceneId: scene.id, tokenId: token.id } } },
      });
      return created;
    } catch (error) { notifyError(error); }
    finally { busy = false; }
  }

  async function clearBlast() {
    try {
      const token = selected();
      const ids = canvas.scene.regions.filter((r: any) => r.getFlag(moduleId, "blast")?.tokenId === token.id).map((r: any) => r.id);
      if (ids.length) await canvas.scene.deleteEmbeddedDocuments("Region", ids);
      ui.notifications.info(`Cleared ${ids.length} Blaster area segment(s).`);
    } catch (error) { notifyError(error); }
  }

  async function refreshDescriptions() {
    try {
      const token = selected();
      const source = await foundry.utils.fromUuid(`Compendium.${moduleId}.astillon-blaster-actors.Actor.BlasterActor0001`);
      if (source?.type !== "npc") throw new Error("The Blaster compendium entry could not be loaded.");
      const actor = token.actor;
      const updates: { _id: string; "system.description.value": string }[] = [];
      let matched = 0;
      for (const original of source.items) {
        const candidates = actor.items.filter((item: any) => item.type === original.type && item.slug === original.slug);
        const current = candidates.find((item: any) => item.id === original.id) ?? (candidates.length === 1 ? candidates[0] : null);
        if (!current) continue;
        matched += 1;
        const description = original.toObject().system.description.value;
        if (current.system.description.value !== description) updates.push({ _id: current.id, "system.description.value": description });
      }
      if (!matched) throw new Error("No matching shipped Blaster abilities were found on the selected actor.");
      if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
      ui.notifications.info(`Updated ${updates.length} Blaster ability description(s). Stats, HP, artwork, effects, and other items were left unchanged.`);
      return updates.length;
    } catch (error) { notifyError(error); }
  }

  async function releaseRoot() {
    // Keep existing Release Blast Root macros compatible with legacy token flags.
    try { await selected().document.unsetFlag(moduleId, "blastRoot"); }
    catch (error) { notifyError(error); }
  }

  return {
    id: "blaster", api: { blast, clearBlast, releaseRoot, refreshDescriptions,
      markFinale: finale.mark, fireFinale: finale.fire, clearFinale: finale.clear,
      blastback: blastback.start, fireBlastback: blastback.fire, clearBlastback: blastback.clear,
      applyBlastEffect: resolution.applyEffect, counterblast: resolution.counterblast, upgradeSheet: resolution.upgradeSheet,
      recoilStride: recoil.arm,
      flashMob: summons.flashMob, commandMob: summons.commandMob, cancelPlacement: () => { picker.cancel(); recoil.cancel(); } },
    async ready() {
      recoil.ready();
      await Promise.all([summons.ready(), finale.ready(), blastback.ready()]);
    },
  };
}
