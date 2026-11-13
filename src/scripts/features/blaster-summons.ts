import { BLASTER_THRALLS, thrallArtwork, thrallPickerContent } from "./blaster-thralls.js";

const ASSISTANT = "pf2e-summons-assistant";
const CREATE_THRALL = "Compendium.pf2e.spells-srd.Item.1JaRoJvlf8EPvnnD";
const EXPIRATION_SLUG = "effect-thrall-expiration-date";
const SUPPORT_IDS = {
  inspire: "BlasterInspire01",
  guard: "BlasterGuard0001",
  tempHP: "BlasterTempHP001",
};

type Support = keyof typeof SUPPORT_IDS;
type Action = "flashMob" | "commandMob";
type Context = { token: any; actor: any; combat: any; round: number; stamp: string };

/** Summons Assistant owns placement; this adapter owns Blaster's action limits and support. */
export function createBlasterSummons(moduleId: string) {
  const pending = new Set<string>();
  const backgroundJobs = new Set<Promise<void>>();
  // Retain successful uses even if persistence fails, to avoid offering a second summon.
  const used = new Map<string, string>();
  let supportCleanup = Promise.resolve();
  let registered = false;
  let cleaning = false;
  const warn = (message: string) => { ui.notifications.warn(message); return false; };
  const flag = (document: any, key: string) => document?.getFlag(moduleId, key);
  const contents = (collection: any): any[] => Array.from(collection?.values?.() ?? collection ?? []);
  const tokenDocument = (value: any) => value?.document ?? value;
  const sceneTokens = () => contents(canvas.scene?.tokens);
  const allTokens = () => contents(game.scenes).flatMap((scene: any) => contents(scene.tokens));
  const itemUuid = (id: string) => `Compendium.${moduleId}.astillon-blaster-items.Item.${id}`;
  const isHype = (token: any) => flag(token?.actor, "blasterRole") === "hype-thrall";

  function context(input?: any): Context | null {
    if (!game.user?.isGM) { warn("Only a GM can use Blaster's mob actions."); return null; }
    // A single authenticated writer prevents two GM clients racing the cap/use flag.
    if (game.users?.activeGM?.id !== game.user.id) {
      warn("Use the primary (active) GM to operate Blaster's mob actions."); return null;
    }
    if (game.system?.id !== "pf2e") { warn("Blaster's mob actions require PF2e."); return null; }
    const controlled = canvas.tokens?.controlled ?? [];
    const explicit = input?.token ?? input;
    if (!explicit && controlled.length !== 1) {
      warn("Select exactly one Blaster token."); return null;
    }
    const token = tokenDocument(explicit ?? controlled[0]);
    const actor = token?.actor;
    if (!token?.uuid || token.parent?.id !== canvas.scene?.id ||
        !sceneTokens().some((entry) => entry.uuid === token.uuid) ||
        !actor?.isOwner || flag(actor, "blasterRole") !== "blaster") {
      warn("Select an owned Blaster token in the current scene."); return null;
    }
    // The public helper always uses getActiveTokens()[0], with no token override.
    const active = actor.getActiveTokens();
    if (active.length !== 1 || tokenDocument(active[0])?.uuid !== token.uuid) {
      warn("Blaster has ambiguous active tokens. Use an unlinked Blaster token before summoning or commanding.");
      return null;
    }
    const combat = game.combat;
    if (!combat?.started || combat.scene?.id !== token.parent.id ||
        combat.combatant?.token?.uuid !== token.uuid) {
      warn("Use this one-action ability during the selected Blaster's combat turn."); return null;
    }
    return { token, actor, combat, round: combat.round, stamp: `${combat.uuid}:${combat.round}` };
  }

  function stillCurrent(ctx: Context) {
    const active = ctx.actor.getActiveTokens();
    return game.user?.isGM && game.users?.activeGM?.id === game.user.id &&
      active.length === 1 && tokenDocument(active[0])?.uuid === ctx.token.uuid &&
      ctx.actor.isOwner && flag(ctx.actor, "blasterRole") === "blaster" &&
      canvas.scene?.id === ctx.token.parent.id && sceneTokens().some((token) => token.uuid === ctx.token.uuid) &&
      game.combat?.uuid === ctx.combat.uuid && game.combat.started &&
      game.combat.round === ctx.round && game.combat.combatant?.token?.uuid === ctx.token.uuid;
  }

  function isOwnedThrall(token: any, ctx: Context) {
    const owner = flag(token, "blasterSummon");
    return isHype(token) && owner?.ownerActorUuid === ctx.actor.uuid &&
      owner?.ownerTokenUuid === ctx.token.uuid &&
      token.actor.getFlag(ASSISTANT, "summoner")?.uuid === ctx.actor.uuid;
  }

  function isLive(token: any) {
    const expiry = contents(token.actor?.items).find((item) => item.system?.slug === EXPIRATION_SLUG);
    return Number(token.actor?.system?.attributes?.hp?.value) > 0 &&
      Number(flag(token, "blasterSummon")?.expiresAt) > game.time.worldTime &&
      (!expiry || (!expiry.system.expired && !expiry.isExpired));
  }

  const liveThralls = (ctx: Context) => allTokens().filter((token) => isOwnedThrall(token, ctx) && isLive(token));
  function inRange(token: any, ctx: Context) {
    if (token.parent?.id !== ctx.token.parent.id || !token.object || !ctx.token.object) return false;
    const distance = ctx.token.object.distanceTo(token.object);
    return Number.isFinite(distance) && distance <= 60;
  }

  async function effectSource(id: string, ctx: Context) {
    const item = await foundry.utils.fromUuid(itemUuid(id));
    if (item?.type !== "effect") throw new Error(`Missing Blaster effect: ${id}`);
    const source = item.toObject();
    delete source._id;
    source.system.context = {
      ...(source.system.context ?? {}),
      origin: { actor: ctx.actor.uuid, token: ctx.token.uuid, item: null },
    };
    source.system.start = { value: game.time.worldTime, initiative: ctx.combat.combatant.initiative };
    return source;
  }

  async function recordUse(ctx: Context, action: Action) {
    used.set(`${ctx.token.uuid}:${action}`, ctx.stamp);
    await ctx.token.setFlag(moduleId, "blasterMobUses", {
      ...(flag(ctx.token, "blasterMobUses") ?? {}), [action]: ctx.stamp,
    });
  }

  async function run(action: Action, input: any, perform: (ctx: Context) => Promise<boolean>) {
    const ctx = context(input);
    if (!ctx) return false;
    if (pending.has(ctx.token.uuid)) return warn("A mob action is already in progress for this Blaster.");
    if (used.get(`${ctx.token.uuid}:${action}`) === ctx.stamp || flag(ctx.token, "blasterMobUses")?.[action] === ctx.stamp) {
      return warn("This Blaster has already used that action this round.");
    }
    pending.add(ctx.token.uuid);
    try { return await perform(ctx); }
    catch (error) {
      console.error(`${moduleId} | ${action}`, error);
      return warn("The mob action could not finish. Check the console and the scene before retrying.");
    } finally { pending.delete(ctx.token.uuid); }
  }

  async function flashMob(input?: any): Promise<boolean> {
    return run("flashMob", input, async (ctx) => {
      const api = (window as any)[ASSISTANT];
      if (!game.modules.get(ASSISTANT)?.active || typeof api?.summon !== "function") {
        return warn("Flash Mob requires an active PF2e Summons Assistant and its dependencies.");
      }
      if (liveThralls(ctx).length >= 3) return warn("This Blaster already has three live hype thralls.");
      const choice = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Flash Mob — Choose Your Entourage" },
        position: { width: 680 }, rejectClose: false,
        content: thrallPickerContent(moduleId),
        ok: { label: "Place Thrall · 1 Action", icon: "fa-solid fa-location-dot",
          callback: (_event: any, button: any) => button.form.elements.variant.value },
      });
      if (choice === null || choice === undefined) return false;
      const variant = choice === "random"
        ? BLASTER_THRALLS[Math.floor(Math.random() * BLASTER_THRALLS.length)]
        : BLASTER_THRALLS.find((entry) => entry.key === choice);
      if (!variant) return warn("Choose one of Blaster's three thrall variants.");
      const actorUuid = `Compendium.${moduleId}.astillon-blaster-actors.Actor.${variant.id}`;
      const template = await foundry.utils.fromUuid(actorUuid);
      if (template?.type !== "npc" || flag(template, "blasterRole") !== "hype-thrall" ||
          flag(template, "blasterVariant") !== variant.key) {
        return warn(`The ${variant.name} sheet is missing or outdated. Update the module's Blaster NPC pack.`);
      }
      const expiry = await effectSource("BlasterExpiry001", ctx);
      if (expiry.system.slug !== EXPIRATION_SLUG || expiry.system.rules?.length) {
        throw new Error("Hype thrall expiration must use the helper slug and grant no attacks.");
      }
      expiry.system.duration = { value: 1, unit: "minutes", expiry: "turn-start", sustained: false };
      if (!stillCurrent(ctx)) return warn("Blaster's turn changed before placement began; no use was spent.");
      if (liveThralls(ctx).length >= 3) return warn("This Blaster now has three live hype thralls; no use was spent.");
      const nonce = foundry.utils.randomID();
      const owner = {
        ownerActorUuid: ctx.actor.uuid, ownerTokenUuid: ctx.token.uuid, nonce, variant: variant.key,
        createdAt: game.time.worldTime, expiresAt: game.time.worldTime + 60,
      };
      const created = new Map<string, any>();
      const remember = (token: any) => {
        const marker = flag(token, "blasterSummon");
        if (marker?.nonce === nonce && marker.ownerActorUuid === ctx.actor.uuid && marker.ownerTokenUuid === ctx.token.uuid) {
          created.set(token.uuid, token);
        }
      };
      const hook = Hooks.on("createToken", remember);
      let failure: unknown;
      try {
        // Do not post a Create Thrall chat card: the helper's chat hook would summon twice.
        // summon() returns undefined even on success and can throw after creating a token.
        await api.summon({
          summonerActor: ctx.actor, itemUuid: CREATE_THRALL, summonType: "thrall",
          summonDetailsGroup: [{
            specific_uuids: [actorUuid],
            amount: 1, rank: 1, summonLevel: 18, noDefaultTraits: true,
            // Same public crosshair contract used by the helper's own range limiter.
            crosshairParameters: { location: {
              obj: ctx.token.object, limitMaxRange: 30, displayRangePoly: true,
            } },
            itemsToAdd: [expiry],
            modifications: {
              "system.attributes.hp.value": 1, "system.attributes.hp.max": 1,
              "system.attributes.hp.temp": 0,
              [`flags.${moduleId}.blasterRole`]: "hype-thrall",
              [`flags.${moduleId}.blasterVariant`]: variant.key,
              [`flags.${ASSISTANT}.summoner`]: { uuid: ctx.actor.uuid, id: ctx.actor.id, signature: ctx.actor.signature },
            },
            tokenModifications: {
              name: `Flash Mob ${variant.name}`, texture: { src: thrallArtwork(moduleId, variant.key) },
              actorLink: false, elevation: ctx.token.elevation, level: ctx.token.level,
              flags: { [moduleId]: { blasterSummon: owner } },
            },
          }],
          config: {},
        });
      } catch (error) { failure = error; }
      finally { Hooks.off("createToken", hook); }
      // Also recover creation when a hook was missed or helper post-processing failed.
      allTokens().forEach(remember);
      const tokens = [...created.values()].filter((token) => isOwnedThrall(token, ctx));
      if (!tokens.length) {
        if (failure) console.debug(`${moduleId} | Flash Mob placement ended without a token`, failure);
        return warn("No hype thrall was placed; Flash Mob is still available this round.");
      }
      // Charge before further writes: failure after successful placement must not allow duplicates.
      let persistenceFailed = false;
      try { await recordUse(ctx, "flashMob"); }
      catch (error) {
        persistenceFailed = true;
        console.error(`${moduleId} | Thrall placed but use flag could not be saved`, error);
      }
      for (const token of tokens) {
        // Placement may take time; the minute starts when a token actually exists.
        await token.setFlag(moduleId, "blasterSummon", {
          ...owner, createdAt: game.time.worldTime, expiresAt: game.time.worldTime + 60,
        });
        await token.actor.update({ "system.attributes.hp.value": 1, "system.attributes.hp.max": 1, "system.attributes.hp.temp": 0 });
        // Recover from the helper failing between placement and its itemsToAdd step.
        if (!contents(token.actor.items).some((item) => item.system?.slug === EXPIRATION_SLUG)) {
          await token.actor.createEmbeddedDocuments("Item", [expiry]);
        }
      }
      if (failure) console.warn(`${moduleId} | Thrall placed; helper post-processing reported an error`, failure);
      if (persistenceFailed) {
        return warn("Thrall placed, but Flash Mob's round use could not be saved. It remains spent on this client; check before reloading.");
      }
      ui.notifications.info(`Flash Mob: ${variant.name} summoned (1 action). No independent turn or attacks.`);
      return true;
    });
  }

  async function commandMob(input?: any): Promise<boolean> {
    return run("commandMob", input, async (ctx) => {
      const candidates = liveThralls(ctx).filter((token) => inRange(token, ctx));
      if (!candidates.length) return warn("This Blaster has no live hype thrall within 60 feet.");
      const escape = (value: string) => foundry.utils.escapeHTML(value);
      const choice = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Command Flash Mob — 1 action" }, rejectClose: false,
        content: `<p>Choose one of this Blaster's hype thralls within 60 feet. Support lasts until the start of Blaster's next turn.</p>
          <div class="form-group"><label>Hype thrall</label><select name="thrallUuid">${candidates.map((token) =>
            `<option value="${escape(token.uuid)}">${escape(token.name)} (${escape(token.id)})</option>`).join("")}</select></div>
          <div class="form-group"><label>Support for Blaster</label><select name="support">
            <option value="inspire">Inspire: +1 status to attacks, damage, and fear saves</option>
            <option value="guard">Guard: +1 status to AC</option>
            <option value="tempHP">Bolster: 10 temporary HP (does not stack)</option>
          </select></div>`,
        ok: { label: "Command", callback: (_event: any, button: any) => ({
          thrallUuid: button.form.elements.thrallUuid.value, support: button.form.elements.support.value,
        }) },
      });
      if (!choice) return false;
      if (!Object.prototype.hasOwnProperty.call(SUPPORT_IDS, choice.support)) return warn("Choose a valid support option.");
      const source = await effectSource(SUPPORT_IDS[choice.support as Support], ctx);
      const thrall = liveThralls(ctx).find((token) => token.uuid === choice.thrallUuid && inRange(token, ctx));
      if (!stillCurrent(ctx) || !thrall) return warn("The turn or selected thrall changed; no use was spent.");
      source.system.duration = { value: 1, unit: "rounds", expiry: "turn-start", sustained: false };
      source.flags = { ...(source.flags ?? {}), [moduleId]: {
        ...(source.flags?.[moduleId] ?? {}), commandMobSource: {
          ownerActorUuid: ctx.actor.uuid, ownerTokenUuid: ctx.token.uuid, combatUuid: ctx.combat.uuid,
          round: ctx.round, thrallUuid: thrall.uuid,
        },
      } };
      // PF2e's actual TempHP rule applies max(current, 10), records tempSource, and
      // clears only its own remaining HP on deletion. Never add directly to hp.temp.
      const effects = await ctx.actor.createEmbeddedDocuments("Item", [source]);
      if (!effects.length) return false;
      await recordUse(ctx, "commandMob");
      ui.notifications.info("Command Flash Mob: support applied to Blaster (1 action), until the start of its next turn.");
      return true;
    });
  }

  const isCleanupGM = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;

  async function expireSupport(combat: any, ended = false) {
    if (!isCleanupGM()) return;
    const actors = new Map<string, any>();
    for (const actor of contents(game.actors)) actors.set(actor.uuid, actor);
    for (const token of allTokens()) if (token.actor) actors.set(token.actor.uuid, token.actor);
    for (const actor of actors.values()) {
      const ids = contents(actor.items).filter((item) => {
        const source = flag(item, "commandMobSource");
        return source?.combatUuid === combat.uuid && (ended ||
          (source.ownerTokenUuid === combat.combatant?.token?.uuid && source.round < combat.round));
      }).map((item) => item.id);
      if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
    }
  }

  async function expireThralls() {
    if (!isCleanupGM() || cleaning) return;
    cleaning = true;
    try {
      for (const token of allTokens()) {
        const owner = flag(token, "blasterSummon");
        // Normally PF2e removes the expiration effect and the helper deletes the token.
        // Enforce the one-minute lifetime even with PF2e automatic effect removal disabled.
        if (isHype(token) && owner?.nonce && Number.isFinite(owner.expiresAt) &&
            owner.expiresAt <= game.time.worldTime && token.actor.getFlag(ASSISTANT, "summoner")?.uuid === owner.ownerActorUuid) {
          await token.delete();
        }
      }
    } finally { cleaning = false; }
  }

  function background(promise: Promise<void>) {
    const job = promise.catch((error) => console.warn(`${moduleId} | Mob expiry`, error));
    backgroundJobs.add(job);
    void job.then(() => backgroundJobs.delete(job));
    return job;
  }

  function queueSupportCleanup(combat: any, ended = false) {
    // Both combat hooks may fire for the same transition. Serialize deletion so
    // the second pass sees the first pass's result (including TempHP cleanup).
    const turn = { uuid: combat.uuid, round: combat.round, combatant: { token: { uuid: combat.combatant?.token?.uuid } } };
    supportCleanup = supportCleanup.catch(() => {}).then(() => expireSupport(turn, ended));
    return background(supportCleanup);
  }

  async function ready(): Promise<void> {
    if (!registered) {
      registered = true;
      // Hype thralls are support props, never autonomous combatants.
      Hooks.on("preCreateCombatant", (combatant: any) => {
        if (flag(combatant.actor ?? combatant.token?.actor, "blasterRole") === "hype-thrall") return false;
      });
      Hooks.on("combatTurnChange", (combat: any) => queueSupportCleanup(combat));
      Hooks.on("updateCombat", (combat: any, changed: any) => {
        if ("round" in changed || "turn" in changed) return queueSupportCleanup(combat);
      });
      Hooks.on("deleteCombat", (combat: any) => queueSupportCleanup(combat, true));
      Hooks.on("updateWorldTime", () => background(expireThralls()));
      Hooks.on("canvasReady", () => background(expireThralls()));
      background(expireThralls());
      if (game.combat) queueSupportCleanup(game.combat);
    }
    // Also allows callers/tests to await already queued cleanup without registering twice.
    while (backgroundJobs.size) await Promise.all([...backgroundJobs]);
  }

  return { flashMob, commandMob, ready };
}
