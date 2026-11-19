import { BLAST_MODES, BLAST_TIERS, blastDamage, blastRiderLinks, blastTraits, lineShapes, type BlastMode } from "./blaster-model.js";

/** GM opts into one recoil move; ordinary token movement is never intercepted or blocked. */
export function createBlasterRecoil(moduleId: string, { selectToken }: { selectToken: () => any }) {
  let registered = false;
  let choosing = false;
  let pending: { scene: any; token: any; actor: any; start: { x: number; y: number }; mode: BlastMode } | null = null;
  const cancel = () => { pending = null; };
  const report = (error: unknown) => {
    console.error(`${moduleId} | Recoil Stride`, error);
    ui.notifications.error(error instanceof Error ? error.message : String(error));
  };

  async function arm() {
    if (choosing) return;
    choosing = true;
    try {
      const token = selectToken(), scene = canvas.scene, actor = token.actor;
      const mode = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Blaster · Recoil Stride" }, rejectClose: false,
        content: `<p>Choose the short blast, then drag Blaster for his quickened Stride. A 15-foot, one-square-wide line fires backward from his departure point, opposite that move. Movement distance and action use are yours to adjudicate.</p>
          <label>Blast mode<select name="mode">${Object.entries(BLAST_MODES).map(([key, entry]) => `<option value="${key}">${entry.label} · ${blastDamage(BLAST_TIERS[1].dice, BLAST_TIERS[1].die, key as BlastMode)} ${entry.damage}</option>`).join("")}</select></label>
          <p>Escape after arming cancels the pending recoil. Ordinary moves do not fire blasts unless armed.</p>`,
        ok: { label: "Arm next move", callback: (_event: Event, button: any) => button.form.elements.mode.value },
      }) as BlastMode | null;
      if (!mode) return false;
      if (selectToken() !== token || canvas.scene !== scene || token.actor !== actor) throw new Error("Selection or scene changed; arm the move again.");
      if (!Object.prototype.hasOwnProperty.call(BLAST_MODES, mode)) throw new Error("Choose a blast mode.");
      pending = { scene, token: token.document, actor, start: token.document.getCenterPoint(), mode };
      ui.notifications.info("Recoil Stride armed: drag Blaster once. Escape cancels; no movement is locked.");
      return true;
    } catch (error) { report(error); return false; }
    finally { choosing = false; }
  }

  async function moved(token: any, changed: any) {
    const shot = pending;
    if (!shot || token !== shot.token || !("x" in changed || "y" in changed)) return;
    const end = token.getCenterPoint(), dx = end.x - shot.start.x, dy = end.y - shot.start.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) return;
    cancel();
    try {
      if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || canvas.scene !== shot.scene ||
          shot.scene.tokens.get(token.id) !== token || token.actor !== shot.actor) return;
      const length = 15 * shot.scene.grid.size / shot.scene.grid.distance;
      const points = [shot.start, { x: shot.start.x - dx / distance * length, y: shot.start.y - dy / distance * length }];
      const spectrum = BLAST_MODES[shot.mode], tier = BLAST_TIERS[1], id = foundry.utils.randomID();
      await shot.scene.createEmbeddedDocuments("Region", [{
        name: `${token.name} — Recoil Stride · ${spectrum.label}`,
        shapes: lineShapes(points, shot.scene.grid.size, 1), levels: canvas.level ? [canvas.level.id] : [],
        color: spectrum.color, highlightMode: "coverage", displayMeasurements: true,
        visibility: (globalThis as any).CONST.REGION_VISIBILITY.ALWAYS, ownership: { default: 2, [game.user.id]: 3 },
        flags: { pf2e: { areaShape: "line" }, [moduleId]: { blast: { id, tokenId: token.id, actorUuid: shot.actor.uuid, charge: 1, mode: shot.mode, recoil: true } } },
      }]);
      const traits = blastTraits(shot.mode).join(",");
      const action = shot.actor.items.find((item: any) => item.slug === "blaster-recoil-stride");
      const content = await game.pf2e.TextEditor.enrichHTML(
        `<h3>${foundry.utils.escapeHTML(token.name)} · Recoil Stride · ${spectrum.label}</h3><p>Quickened Stride: 15-foot line backward from the departure point, 1 square wide. No additional action or Charged Blast use.</p>
        <p>@Check[${spectrum.save}|dc:40|basic|traits:${traits}] @Damage[${blastDamage(tier.dice, tier.die, shot.mode)}[${spectrum.damage}]|traits:${traits}|options:area-damage]</p>
        <p>Blaster is excluded. Resolve damage once per creature, with normal cover and line of effect.</p>${blastRiderLinks(moduleId, shot.mode)}
        <p>After damage, use @UUID[Compendium.${moduleId}.astillon-blaster-macros.Macro.BlasterResolve01]{Apply Blast Effect} for riders. Clear Blast Areas also clears recoil lines.</p>`,
        { rollData: action?.getRollData() ?? shot.actor.getRollData(), relativeTo: action ?? shot.actor });
      await foundry.documents.ChatMessage.implementation.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ token }), content });
    } catch (error) { report(error); }
  }

  function ready() {
    if (registered) return;
    registered = true;
    Hooks.on("updateToken", (token: any, changed: any) => { void moved(token, changed); });
    Hooks.on("deleteToken", (token: any) => { if (pending?.token === token) cancel(); });
    Hooks.on("canvasTearDown", cancel);
    window.addEventListener("keydown", event => { if (event.key === "Escape") cancel(); });
  }
  return { arm, cancel, ready };
}
