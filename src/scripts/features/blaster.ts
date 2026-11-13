import type { ModuleFeature } from "./feature.js";
import { BLAST_MODES, BLAST_TIERS, isBlastRooted, lineShapes, type BlastMode, type Charge, type RootState } from "./blaster-model.js";
import { createBlasterSummons } from "./blaster-summons.js";
import { createBlastPicker } from "./blaster-placement.js";
import { createBlasterFinale } from "./blaster-finale.js";

type BlastUse = { combatId: string | null; round: number; rechargeCombatId?: string | null; readyRound?: number; readyTime?: number };

export function createBlasterFeature(moduleId: string): ModuleFeature {
  const summons = createBlasterSummons(moduleId);
  let busy = false;
  const picker = createBlastPicker();
  const finale = createBlasterFinale(moduleId, { selectToken: selected, picker });
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

  async function blast() {
    if (busy || picker.busy) return ui.notifications.warn("Finish or cancel the current blast first.");
    busy = true;
    try {
      const token = selected();
      const scene = canvas.scene;
      const snapshot = { x: token.document.x, y: token.document.y };
      const validateToken = () => {
        if (selected() !== token || canvas.scene !== scene || token.document.parent !== scene || scene.tokens.get(token.id) !== token.document || token.document.x !== snapshot.x || token.document.y !== snapshot.y) {
          throw new Error("The scene or selected token changed during placement. Start the blast again.");
        }
      };
      const chosen = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Blaster · Charged Blast" },
        content: `<p>Choose the charge and Curated Spectrum. One click chooses the direction of a straight 120-foot line from Blaster. The line always extends its full length; each creature saves once.</p><div class="form-group"><label>Charge</label><select name="charge">${Object.entries(BLAST_TIERS).map(([key, t]) => `<option value="${key}">${key} action${key === "1" ? "" : "s"}: ${t.name} — ${t.dice}d6, ${t.range} ft line, ${t.width} square wide</option>`).join("")}</select></div><div class="form-group"><label>Spectrum</label><select name="mode">${Object.entries(BLAST_MODES).map(([key, m]) => `<option value="${key}">${m.label}${m.penalty ? " (−2 dice; condition on failed save)" : ""}</option>`).join("")}</select></div><p>Three actions roots Blaster until his next turn and rolls a 1d4-round recharge for reference. Adjudicate action costs, frequency, and recharge from the sheet; the macro can be used at any time. Saves, damage and condition application are adjudicated normally.</p>`,
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
      const points = await picker.pick(token, { title: tier.name, pointCount: 2, range: tier.range, width: tier.width, color: spectrum.color, fixedLength: tier.range });
      validateToken();
      if (!points) return;
      const traits = ["magical", spectrum.damage, ...(mode === "dazzling" ? ["light"] : [])].join(",");
      const blastId = foundry.utils.randomID();
      const data = lineShapes(points, canvas.grid.size, tier.width).map(shape => ({
        name: `${token.name} — ${tier.name}`, shapes: [shape],
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
      const combat = currentCombat?.started ? { id: currentCombat.id, round: currentCombat.round, turn: currentCombat.turn } : null;
      const previous = token.actor.getFlag(moduleId, "blastUse") as BlastUse | undefined;
      const use: BlastUse = { ...previous, combatId: combat?.id ?? null, round: combat?.round ?? 0 };
      if (recharge) {
        use.rechargeCombatId = combat?.id ?? null;
        use.readyRound = (combat?.round ?? 0) + recharge.total + 1;
        use.readyTime = game.time.worldTime + (recharge.total + 1) * 6;
      }
      const root: RootState = { combatId: combat?.id ?? null, round: combat?.round ?? 0, turn: combat?.turn ?? 0, expires: game.time.worldTime + 6 };
      const previousRoot = token.document.getFlag(moduleId, "blastRoot") as RootState | undefined;
      const created = await scene.createEmbeddedDocuments("Region", data);
      try {
        if (charge === 3) await token.document.setFlag(moduleId, "blastRoot", root);
        await token.actor.setFlag(moduleId, "blastUse", use);
      } catch (error) {
        await scene.deleteEmbeddedDocuments("Region", created.map((r: any) => r.id));
        if (charge === 3) {
          if (previousRoot) await token.document.setFlag(moduleId, "blastRoot", previousRoot);
          else await token.document.unsetFlag(moduleId, "blastRoot");
        }
        throw error;
      }
      const card = `<h3>${escape(token.name)} · ${tier.name}</h3><p>${charge} action${charge === 1 ? "" : "s"} · ${spectrum.label} · DC 40 · ${tier.range} ft line, ${tier.width} square${tier.width === 1 ? "" : "s"} wide</p><p>@Check[${spectrum.save}|dc:40|basic|traits:${traits}] @Damage[${tier.dice - spectrum.penalty}d6[${spectrum.damage}]|traits:${traits}|options:area-damage]</p><p>One save and one damage application per creature in the 120-foot line. Blaster is excluded. Resolve cover and line of effect normally.</p>${spectrum.rider ? `<p>${spectrum.rider}</p>` : ""}${recharge ? `<p>Rooted until the start of Blaster's next turn (6 seconds outside combat). Standing Ovation recharge (reference): ${recharge.total} full rounds${combat ? `; available round ${use.readyRound} in this combat` : ""}. Adjudicate recharge from the sheet.</p>` : ""}`;
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
    try { await selected().document.unsetFlag(moduleId, "blastRoot"); }
    catch (error) { notifyError(error); }
  }

  function preventMovement(token: any, options: any) {
    if (options?.blasterForcedMovement && game.user.isGM) return;
    if (isBlastRooted(token.getFlag(moduleId, "blastRoot"), combatFor(token.parent), token.id, game.time.worldTime)) {
      ui.notifications.warn("Standing Ovation: Blaster cannot move until the start of his next turn. Use Release Blast Root for GM adjudication of forced movement.");
      return false;
    }
  }

  return {
    id: "blaster", api: { blast, clearBlast, releaseRoot, refreshDescriptions, markFinale: finale.mark, fireFinale: finale.fire, clearFinale: finale.clear, flashMob: summons.flashMob, commandMob: summons.commandMob, cancelPlacement: () => picker.cancel() },
    async ready() {
      const summonsReady = summons.ready();
      Hooks.on("preMoveToken", (token: any, _movement: any, options: any) => preventMovement(token, options));
      Hooks.on("preUpdateToken", (token: any, changed: any, options: any) => {
        if (["x", "y", "elevation", "level"].some(k => k in changed && changed[k] !== token[k])) return preventMovement(token, options);
      });
      const expire = async () => {
        if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
        for (const scene of game.scenes) for (const token of scene.tokens) {
          const root = token.getFlag(moduleId, "blastRoot");
          if (root && !isBlastRooted(root, combatFor(scene), token.id, game.time.worldTime)) await token.unsetFlag(moduleId, "blastRoot");
        }
      };
      for (const event of ["updateCombat", "deleteCombat", "updateWorldTime", "canvasReady"]) Hooks.on(event, () => void expire().catch(notifyError));
      await Promise.all([summonsReady, finale.ready()]);
    },
  };
}
