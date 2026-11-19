import { BLAST_MODES, BLAST_RIDER_EFFECTS, BLAST_TIERS, blastDamage, blastTraits,
  type BlastMode, type BlastOutcome } from "./blaster-model.js";
import { readBeamClash } from "./beam-clash-model.js";

const OUTCOMES = { criticalSuccess: "Critical success", success: "Success", failure: "Failure", criticalFailure: "Critical failure" };
const HOME_ITEMS = new Set(["BlasterShell0001", "BlasterSpectrum1", "BlasterBlastAct1", "BlasterBlastAct2",
  "BlasterBlastAct3", "BlasterFinaleAct", "BlasterFlashAct1", "BlasterCommand01", "BlasterClashAct1",
  "BlasterBackAct01", "BlasterHealAct01", "BlasterRange0001", "BlasterMelee0001"]);
const COUNTER_FLAG = "beamClashCounter";
// Module-scoped, not factory-scoped: repeated feature instances share one local
// writer while the durable Scene claim protects reloads and other GM clients.
const counterLatches = new Set<string>();

/** Explicit GM resolution tools: never intercept HP, grant ownership, or debit actions. */
export function createBlasterResolution(moduleId: string, { selectToken }: { selectToken: () => any }) {
  const busy = new Set<string>();
  const clone = <T>(value: T): T => foundry.utils.deepClone(value);
  const escape = (value: string) => foundry.utils.escapeHTML(value);
  const hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);
  const authority = () => !!game.user?.isGM && game.users?.activeGM?.id === game.user.id;
  const effectUuid = (mode: BlastMode, outcome: BlastOutcome) => {
    const id = BLAST_RIDER_EFFECTS[mode]?.[outcome];
    return id ? `Compendium.${moduleId}.astillon-blaster-items.Item.${id}` : null;
  };
  function assertAuthority() {
    if (!authority()) throw new Error("Use the active GM client for Blaster resolution.");
  }
  function assertScene(scene: any) {
    assertAuthority();
    if (!canvas.ready || canvas.scene !== scene || game.scenes?.get(scene.id) !== scene) throw new Error("The scene changed. Start again.");
  }
  function selection() {
    assertAuthority();
    const token = selectToken();
    const scene = canvas.scene;
    const actor = token?.actor;
    assertScene(scene);
    if (!actor?.uuid || token.document?.parent !== scene || scene.tokens.get(token.id) !== token.document ||
      token.document.actor !== actor || !token.document.isOwner || !actor.isOwner ||
      actor.getFlag(moduleId, "blasterRole") !== "blaster") throw new Error("Select an owned Blaster token in this scene.");
    return { scene, token, actor, actorUuid: actor.uuid };
  }
  function validate(context: ReturnType<typeof selection>) {
    const now = selection();
    if (now.scene !== context.scene || now.token !== context.token || now.actor !== context.actor || now.actorUuid !== context.actorUuid) {
      throw new Error("The selected Blaster or actor changed. Start again.");
    }
  }
  async function run<T>(name: string, action: () => Promise<T>): Promise<T | false> {
    if (busy.has(name)) { ui.notifications.warn(`Finish or cancel the current ${name} operation first.`); return false; }
    busy.add(name);
    try { return await action(); }
    catch (error) {
      console.error(`${moduleId} | ${name}`, error);
      ui.notifications.error(error instanceof Error ? error.message : String(error));
      return false;
    } finally { busy.delete(name); }
  }
  const options = (entries: [string, string][], selected: string) => entries.map(([value, label]) =>
    `<option value="${value}"${value === selected ? " selected" : ""}>${escape(label)}</option>`).join("");

  async function applyEffect() {
    return run("Apply Blast Effect", async () => {
      const context = selection();
      const targets = [...game.user.targets].map((token: any) => ({ token, actor: token.actor, uuid: token.actor?.uuid }));
      if (!targets.length) throw new Error("Target one or more creatures with the same final save outcome.");
      const validateTargets = () => {
        validate(context);
        const current = [...game.user.targets];
        if (current.length !== targets.length || targets.some(({ token, actor, uuid }) => !current.includes(token) ||
          !uuid || token.actor !== actor || actor.uuid !== uuid || token.document?.actor !== actor ||
          token.document.parent !== context.scene || context.scene.tokens.get(token.id) !== token.document ||
          !token.document.isOwner || !actor.isOwner)) throw new Error("The targeted creatures, scene, or ownership changed. Start again.");
      };
      validateTargets();
      const savedMode = context.actor.getFlag(moduleId, "blastUse")?.mode;
      const defaultMode = hasOwn(BLAST_RIDER_EFFECTS, savedMode) ? savedMode : "dazzling";
      const chosen = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Blaster · Apply Blast Effect" }, rejectClose: false,
        content: `<p>Apply damage first. Choose the <strong>final save degree after incapacitation</strong> for all targeted creatures. This applies the linked effect, not damage or ownership changes.</p>
          <div class="form-group"><label>Mode</label><select name="mode">${options(Object.keys(BLAST_RIDER_EFFECTS).map(mode => [mode, BLAST_MODES[mode as BlastMode].label]), defaultMode)}</select></div>
          <div class="form-group"><label>Final outcome</label><select name="outcome">${options(Object.entries(OUTCOMES), "failure")}</select></div>`,
        ok: { label: "Apply effect", callback: (_event: Event, button: any) => ({ mode: button.form.elements.mode.value, outcome: button.form.elements.outcome.value }) },
      });
      if (!chosen) return false;
      validateTargets();
      const { mode, outcome } = chosen as { mode: BlastMode; outcome: BlastOutcome };
      if (!hasOwn(BLAST_RIDER_EFFECTS, mode) || !hasOwn(OUTCOMES, outcome)) throw new Error("Invalid rider mode or save outcome.");
      const uuid = effectUuid(mode, outcome);
      if (!uuid) { ui.notifications.info("That final save outcome has no rider; nothing applied."); return { applied: 0, skipped: targets.length, mode, outcome }; }
      const source = await foundry.utils.fromUuid(uuid);
      validateTargets();
      if (source?.type !== "effect") throw new Error("The blast effect could not be loaded from the module compendium.");
      const applied = new Set<string>();
      for (const target of targets) {
        validateTargets();
        if (applied.has(target.uuid)) continue;
        const payload: any = clone(source.toObject());
        delete payload._id;
        const now = game.time.worldTime;
        if (!Number.isFinite(now)) throw new Error("A valid Foundry world time is required to apply the effect.");
        const combat = game.combat?.started && game.combat.scene?.id === context.scene.id ? game.combat : null;
        const combatant = combat?.turns?.find((entry: any) => entry.tokenId === context.token.id)
          ?? combat?.combatants?.find((entry: any) => entry.tokenId === context.token.id);
        payload.system.context = { ...(payload.system.context ?? {}), origin: { actor: context.actorUuid, token: context.token.document.uuid, item: null } };
        payload.system.start = { value: now, initiative: Number.isFinite(combatant?.initiative) ? combatant.initiative : null };
        // Preserve the pack's finite or unlimited duration and native GrantItem rules.
        payload.flags = { ...payload.flags, [moduleId]: { ...payload.flags?.[moduleId],
          blasterRiderSource: { sourceActorUuid: context.actorUuid, sourceTokenUuid: context.token.document.uuid, mode, outcome } } };
        const created = await target.actor.createEmbeddedDocuments("Item", [payload]);
        if (!created?.length) throw new Error(`The effect was not created. ${applied.size} earlier target(s) may already have it; inspect before retrying.`);
        applied.add(target.uuid);
      }
      ui.notifications.info(`Applied ${BLAST_MODES[mode].label} (${OUTCOMES[outcome]}) to ${applied.size} actor(s).`);
      return { applied: applied.size, skipped: 0, mode, outcome, effectUuid: uuid };
    });
  }

  async function counterblast() {
    return run("Counterblast", async () => {
      const scene = canvas.scene;
      assertScene(scene);
      const clash = readBeamClash(scene.getFlag(moduleId, "beamClash"));
      if (!clash || clash.sceneId !== scene.id || clash.status !== "finished" || clash.winner !== "red" || clash.score !== 3) throw new Error("Blaster must win a finished Beam Clash first.");
      const latch = `${moduleId}:${scene.id}:${clash.id}`;
      if (counterLatches.has(latch)) throw new Error("Counterblast publication is already in progress for this clash.");
      counterLatches.add(latch);
      try {
        const red = scene.tokens.get(clash.redTokenId), blue = scene.tokens.get(clash.blueTokenId);
        const redActor = red?.actor, blueActor = blue?.actor;
        const validateClash = () => {
          assertScene(scene);
          const latest = readBeamClash(scene.getFlag(moduleId, "beamClash"));
          if (!latest || latest.id !== clash.id || latest.revision !== clash.revision || latest.status !== "finished" || latest.winner !== "red" || latest.score !== 3 ||
            latest.redTokenId !== clash.redTokenId || latest.blueTokenId !== clash.blueTokenId ||
            scene.tokens.get(clash.redTokenId) !== red || scene.tokens.get(clash.blueTokenId) !== blue ||
            !redActor || !blueActor || red.actor !== redActor || blue.actor !== blueActor ||
            !red.isOwner || !redActor.isOwner || !blue.isOwner || !blueActor.isOwner ||
            redActor.getFlag(moduleId, "blasterRole") !== "blaster") throw new Error("The clash participants, result, scene, or ownership changed.");
        };
        const assertUnused = () => {
          if (scene.getFlag(moduleId, COUNTER_FLAG)?.clashId === clash.id) throw new Error("Counterblast already resolved or publication is uncertain. Inspect chat; this clash cannot publish again.");
        };
        validateClash(); assertUnused();
        const mode = await foundry.applications.api.DialogV2.prompt({
          window: { title: "Blaster · Counterblast" }, rejectClose: false,
          content: `<p>A free out-of-turn normal hit against <strong>${escape(blue.name)}</strong>: two-action strength, not a two-action cost. No attack or save roll.</p><div class="form-group"><label>Blast mode</label><select name="mode">${options(Object.entries(BLAST_MODES).map(([key, data]) => [key, data.label]), "fire")}</select></div>`,
          ok: { label: "Create counterblast card", callback: (_event: Event, button: any) => button.form.elements.mode.value },
        }) as BlastMode | null;
        if (!mode) return false;
        validateClash(); assertUnused();
        if (!hasOwn(BLAST_MODES, mode)) throw new Error("Invalid counterblast mode.");
        const higherLevel = Number(blueActor.level ?? blueActor.system.details.level.value) > Number(redActor.level ?? redActor.system.details.level.value);
        const outcome: BlastOutcome = mode === "hypnotic" && higherLevel ? "success" : "failure";
        const rider = effectUuid(mode, outcome);
        const claim = { clashId: clash.id, status: "publishing", messageId: foundry.utils.randomID(), claim: foundry.utils.randomID(), mode, outcome };
        // Durable claim BEFORE enrichment/publication. Even an uncertain acknowledgement
        // remains claimed; do not silently retry or let another instance duplicate it.
        await scene.setFlag(moduleId, COUNTER_FLAG, foundry.data.operators.ForcedReplacement.create(claim));
        const validateClaim = () => {
          validateClash();
          const marker = scene.getFlag(moduleId, COUNTER_FLAG);
          if (marker?.claim !== claim.claim || marker.clashId !== clash.id || marker.status !== "publishing") throw new Error("Counterblast publication claim changed.");
        };
        validateClaim();
        const tier = BLAST_TIERS[2], spectrum = BLAST_MODES[mode];
        const action = redActor.items.find((item: any) => item.slug === "blaster-charged-blast-2");
        const raw = `<h3>${escape(red.name)} · Counterblast · ${escape(spectrum.label)}</h3><p><strong>Target</strong> ${escape(blue.name)} only. Negate the incoming effect against ${escape(red.name)} only.</p>
          <p>@Damage[${blastDamage(tier.dice, tier.die, mode)}[${spectrum.damage}]|traits:${blastTraits(mode).join(",")}]</p>
          <p>Normal hit; no extra attack, saving throw, or action cost. Apply damage once to this foe, not an area.</p>
          ${rider ? `<p><strong>${OUTCOMES[outcome]} rider</strong> @UUID[${rider}]{Apply ${spectrum.label} effect}. After damage, select Blaster and target only ${escape(blue.name)}, then use @UUID[Compendium.${moduleId}.astillon-blaster-macros.Macro.BlasterResolve01]{Apply Blast Effect} with <strong>${OUTCOMES[outcome]}</strong>. ${mode === "hypnotic" && higherLevel ? "Incapacitation against this higher-level foe is already included; do not adjust again." : ""}</p>` : ""}`;
        const content = await game.pf2e.TextEditor.enrichHTML(raw, { rollData: action?.getRollData() ?? redActor.getRollData(), relativeTo: action ?? redActor });
        validateClaim();
        const message = await foundry.documents.ChatMessage.implementation.create({
          _id: claim.messageId, speaker: foundry.documents.ChatMessage.getSpeaker({ token: red }), content,
          flags: { [moduleId]: { counterblast: { clashId: clash.id, mode, outcome, riderUuid: rider, redTokenId: red.id, blueTokenId: blue.id } } },
        }, { keepId: true });
        if (!message) throw new Error("Counterblast publication is uncertain. Inspect chat history; no retry will occur.");
        validateClaim();
        await scene.setFlag(moduleId, COUNTER_FLAG, foundry.data.operators.ForcedReplacement.create({ ...claim, status: "posted" }));
        return { ok: true, clashId: clash.id, messageId: claim.messageId, mode, outcome };
      } finally { counterLatches.delete(latch); }
    });
  }

  function upgradePlan(source: any, actor: any) {
    const creates: any[] = [], updates: any[] = [];
    const shipped = source.items.filter((item: any) => HOME_ITEMS.has(item.id) && ["action", "melee"].includes(item.type));
    if (!shipped.some((item: any) => item.id === "BlasterShell0001") || !shipped.some((item: any) => item.id === "BlasterBackAct01")) throw new Error("The Blaster compendium is outdated; reload after updating the module.");
    const matched = new Set<string>();
    for (const original of shipped) {
      const byId = actor.items.get(original.id);
      const candidates = actor.items.filter((item: any) => item.type === original.type && item.slug === original.slug);
      if (byId && byId.type !== original.type) throw new Error(`A different item uses ${original.id}; resolve that conflict first.`);
      if (!byId && candidates.length > 1) throw new Error(`Ambiguous duplicate ability: ${original.name}. Resolve it before upgrading.`);
      const current = byId ?? candidates[0];
      const data: any = clone(original.toObject());
      if (!current) { creates.push(data); continue; }
      if (matched.has(current.id)) throw new Error("Two shipped abilities matched the same world item; inspect duplicates first.");
      matched.add(current.id);
      data.system.description.gm = current.system.description?.gm ?? "";
      if (data.system.frequency && current.system.frequency?.value !== undefined) data.system.frequency.value = current.system.frequency.value;
      updates.push({ _id: current.id, name: data.name, img: data.img, system: data.system });
    }
    return { creates, updates };
  }

  async function upgradeSheet() {
    return run("Upgrade Blaster Sheet", async () => {
      const context = selection();
      const source = await foundry.utils.fromUuid(`Compendium.${moduleId}.astillon-blaster-actors.Actor.BlasterActor0001`);
      validate(context);
      if (source?.type !== "npc") throw new Error("The Blaster compendium actor could not be loaded.");
      const preview = upgradePlan(source, context.actor);
      const answer = await foundry.applications.api.DialogV2.wait({
        window: { title: "Blaster · Upgrade Existing Sheet" }, rejectClose: false,
        content: `<p>Update ${preview.updates.length} known Blaster abilities and add ${preview.creates.length} missing abilities. Set maximum HP to <strong>700</strong> and replace human/humanoid traits with dream.</p><p>Preserve actor artwork, Notes, custom items, native spell uses, and ability GM notes. Apply Blaster's configured Your Turn sound stinger. Known homebrew ability mechanics are replaced with the new sheet.</p><label><input type="checkbox" name="fullHeal"> Fully heal to 700 HP</label><p>Unchecked: preserve existing wounds.</p>`,
        buttons: [
          { action: "confirm", label: "Upgrade sheet", default: true, callback: (_event: Event, button: any) => ({ fullHeal: button.form.elements.fullHeal.checked }) },
          { action: "cancel", label: "Cancel", callback: () => null },
        ],
      });
      if (!answer || typeof answer !== "object" || typeof answer.fullHeal !== "boolean") return false;
      validate(context);
      // Recompute after confirmation: preserve edits/use counters made while it was open.
      const plan = upgradePlan(source, context.actor);
      let added = 0, updated = 0;
      try {
        if (plan.updates.length) {
          const results = await context.actor.updateEmbeddedDocuments("Item", plan.updates);
          updated = results?.length ?? 0;
          if (updated !== plan.updates.length) throw new Error("Some ability updates were not confirmed.");
        }
        validate(context);
        if (plan.creates.length) {
          const results = await context.actor.createEmbeddedDocuments("Item", plan.creates, { keepId: true });
          added = results?.length ?? 0;
          if (added !== plan.creates.length) throw new Error("Some new abilities were not confirmed.");
        }
        validate(context);
        const raw = context.actor._source?.system ?? context.actor.system;
        const hp = raw.attributes.hp;
        if (!Number.isFinite(hp.max) || !Number.isFinite(hp.value)) throw new Error("Current HP cannot be read safely; inspect the actor.");
        const wounds = Math.max(0, hp.max - hp.value);
        const traits = [...new Set<string>((raw.traits.value as string[]).filter(trait => !["human", "humanoid"].includes(trait)))];
        if (!traits.includes("dream")) traits.push("dream");
        await context.actor.update({ "system.attributes.hp.max": 700,
          "system.attributes.hp.value": answer.fullHeal ? 700 : Math.max(0, 700 - wounds), "system.traits.value": traits,
          [`flags.${moduleId}.yourTurnSound`]: source.getFlag(moduleId, "yourTurnSound") ?? "" });
      } catch (error) {
        ui.notifications.warn(`Blaster upgrade may be partial (${updated} abilities updated, ${added} added). Inspect the actor before retrying.`);
        throw error;
      }
      ui.notifications.info(`Blaster upgraded: ${updated} abilities updated, ${added} added; 700 maximum HP (${answer.fullHeal ? "fully healed" : "wounds preserved"}).`);
      return { ok: true, added, updated, fullHeal: answer.fullHeal };
    });
  }
  return { applyEffect, counterblast, upgradeSheet };
}
