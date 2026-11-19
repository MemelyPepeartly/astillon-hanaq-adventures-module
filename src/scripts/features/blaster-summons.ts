import { BLASTER_THRALLS, thrallArtwork, thrallPickerContent } from "./blaster-thralls.js";
import { reconcileMobPool } from "./blaster-mob-pool.js";

const ASSISTANT = "pf2e-summons-assistant";
const CREATE_THRALL = "Compendium.pf2e.spells-srd.Item.1JaRoJvlf8EPvnnD";
const EXPIRATION_SLUG = "effect-thrall-expiration-date";
const SUPPORT_IDS = {
  inspire: "BlasterInspire01",
  guard: "BlasterGuard0001",
  tempHP: "BlasterTempHP001",
};
const AURA_IDS = { inspire: "BlasterAuraIns01", guard: "BlasterAuraGrd01", tempHP: "BlasterAuraBol01" };
const AURA_SLUGS = { inspire: "blaster-aura-inspire", guard: "blaster-aura-guard", tempHP: "blaster-aura-bolster" };

type Support = keyof typeof SUPPORT_IDS;
type Action = "flashMob" | "commandMob";
type Context = { token: any; actor: any };

/** GM-operated placement/support tools. Action costs are adjudicated at the table. */
export function createBlasterSummons(moduleId: string) {
  const pending = new Set<string>();
  const backgroundJobs = new Set<Promise<void>>();
  let supportCleanup = Promise.resolve();
  let registered = false;
  let cleaning = false;
  const poolSource = `${moduleId}.blasterMobPool`;
  const warn = (message: string) => { ui.notifications.warn(message); return false; };
  const flag = (document: any, key: string) => document?.getFlag(moduleId, key);
  const contents = (collection: any): any[] => Array.from(collection?.values?.() ?? collection ?? []);
  const tokenDocument = (value: any) => value?.document ?? value;
  const sceneTokens = () => contents(canvas.scene?.tokens);
  const allTokens = () => contents(game.scenes).flatMap((scene: any) => contents(scene.tokens));
  const itemUuid = (id: string) => `Compendium.${moduleId}.astillon-blaster-items.Item.${id}`;
  const isHype = (token: any) => flag(token?.actor, "blasterRole") === "hype-thrall";
  const auraKind = (item: any): Support | null => {
    const kind = flag(item, "blasterAura");
    return item?.type === "effect" && Object.prototype.hasOwnProperty.call(AURA_IDS, kind) ? kind : null;
  };
  const actors = () => new Map<string, any>([
    ...contents(game.actors).map((actor) => [actor.uuid, actor] as const),
    ...allTokens().filter((token) => token.actor).map((token) => [token.actor.uuid, token.actor] as const),
  ]);

  /** Resolve the actual summoning token, not a similarly named Blaster or a friendly token. */
  function auraOwner(actor: any): { ctx: Context; thrall: any } | null {
    const tokens = allTokens().filter((token) => token.actor?.uuid === actor?.uuid);
    if (tokens.length !== 1) return null;
    const thrall = tokens[0];
    const owner = flag(thrall, "blasterSummon");
    const token = allTokens().find((entry) => entry.uuid === owner?.ownerTokenUuid);
    const ctx = token?.actor ? { token, actor: token.actor } : null;
    return ctx && flag(ctx.actor, "blasterRole") === "blaster" &&
      allTokens().filter((entry) => entry.actor?.uuid === ctx.actor.uuid).length === 1 &&
      ctx.token.parent?.id === thrall.parent?.id && isOwnedThrall(thrall, ctx) && isLive(thrall) &&
      ctx.actor.signature && actor.getFlag(ASSISTANT, "summoner")?.signature === ctx.actor.signature
      ? { ctx, thrall } : null;
  }

  function stampSupport(source: any, ctx: Context, thrall: any) {
    const lifetime = flag(thrall, "blasterSummon");
    source.system.context = { ...(source.system.context ?? {}),
      origin: { actor: ctx.actor.uuid, token: ctx.token.uuid, item: null } };
    source.system.duration = { value: -1, unit: "unlimited", expiry: null, sustained: false };
    source.system.start = { value: game.time.worldTime, initiative: null };
    source.flags = { ...(source.flags ?? {}), [moduleId]: {
      ...(source.flags?.[moduleId] ?? {}), commandMobSource: {
        ownerActorUuid: ctx.actor.uuid, ownerTokenUuid: ctx.token.uuid, thrallUuid: thrall.uuid,
        nonce: lifetime.nonce, expiresAt: lifetime.expiresAt,
      },
    } };
  }

  function auraEmitter(item: any) {
    const aura = item?.flags?.pf2e?.aura;
    if (!aura || !Object.values(AURA_SLUGS).includes(aura.slug)) return null;
    const origin = actors().get(aura.origin);
    const expected = flag(item, "commandMobSource")?.auraEmitterUuid;
    return contents(origin?.items).find((entry) => {
      const kind = auraKind(entry);
      return kind && (!expected || entry.uuid === expected) && AURA_SLUGS[kind] === aura.slug &&
        !entry.isExpired && !entry.system.expired;
    }) ?? null;
  }

  function nativeContains(thrall: any, owner: any, kind: Support): boolean {
    return thrall.auras?.get(AURA_SLUGS[kind])?.containsToken(owner) === true;
  }

  /** Native Aura supplies geometry/entry/exit. Only validated received copies activate rules. */
  function prepareAura(item: any) {
    if (!item.actor || item.type !== "effect") return;
    if (auraKind(item)) {
      const owner = auraOwner(item.actor);
      if (!isCleanupGM() || !owner || contents(item.actor.items).some((entry) => auraKind(entry))) {
        warn("Apply Flash Mob auras to a living thrall placed by this Blaster's Flash Mob macro.");
        return false;
      }
      const source = item.toObject();
      stampSupport(source, owner.ctx, owner.thrall);
      item.updateSource({ system: source.system, flags: source.flags });
    } else if (Object.values(AURA_SLUGS).includes(item.flags?.pf2e?.aura?.slug)) {
      const emitter = auraEmitter(item);
      const owner = emitter && auraOwner(emitter.actor);
      // Recheck after PF2e's asynchronous compendium lookup, including stale entry events.
      const kind = emitter ? auraKind(emitter) : null;
      if (!owner || !kind || owner.ctx.actor.uuid !== item.actor.uuid ||
          item.sourceId !== `${emitter.actor.uuid}.Item.${SUPPORT_IDS[kind]}` ||
          !nativeContains(owner.thrall, owner.ctx.token, kind)) return false;
      const source = emitter.toObject();
      stampSupport(source, owner.ctx, owner.thrall);
      const marker = source.flags[moduleId].commandMobSource;
      const suffix = `${owner.thrall.id}-${marker.nonce}`;
      item.updateSource({
        [`flags.${moduleId}.commandMobSource`]: { ...marker, auraEmitterUuid: emitter.uuid },
        [`flags.${moduleId}.blasterReceiverSignature`]: owner.ctx.actor.signature,
        "system.rules": item.system.rules.map((rule: any) => rule.key === "FlatModifier"
          ? { ...rule, ignored: false, type: "untyped", slug: `${rule.slug}-${suffix}` } : rule),
        "system.duration": source.system.duration,
      });
    }
  }

  function context(input?: any): Context | null {
    if (!game.user?.isGM) { warn("Only a GM can use Blaster's mob actions."); return null; }
    // A single authenticated writer prevents two GM clients racing placement and pool updates.
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
    return { token, actor };
  }

  function stillCurrent(ctx: Context) {
    const active = ctx.actor.getActiveTokens();
    return game.user?.isGM && game.users?.activeGM?.id === game.user.id &&
      active.length === 1 && tokenDocument(active[0])?.uuid === ctx.token.uuid &&
      ctx.actor.isOwner && flag(ctx.actor, "blasterRole") === "blaster" &&
      canvas.scene?.id === ctx.token.parent.id && sceneTokens().some((token) => token.uuid === ctx.token.uuid);
  }

  function supportTiming(ctx: Context) {
    const combat = game.combat;
    const combatant = combat?.started && combat.scene?.id === ctx.token.parent.id
      ? contents(combat.combatants).find((entry) => entry.token?.uuid === ctx.token.uuid) : null;
    return {
      initiative: combatant?.initiative ?? null,
    };
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
    source.system.start = { value: game.time.worldTime, initiative: supportTiming(ctx).initiative };
    return source;
  }

  async function ensureReceivers(thrall: any, ctx: Context) {
    for (const id of Object.values(SUPPORT_IDS)) {
      if (thrall.actor.items.get(id)) continue;
      const source = await effectSource(id, ctx);
      source._id = id;
      await thrall.actor.createEmbeddedDocuments("Item", [source], { keepId: true });
    }
  }

  async function notifyAura(thrall: any) {
    for (const kind of Object.keys(AURA_IDS) as Support[]) {
      await thrall.auras?.get(AURA_SLUGS[kind])?.notifyActors?.();
    }
  }

  async function run(action: Action, input: any, perform: (ctx: Context) => Promise<boolean>) {
    const ctx = context(input);
    if (!ctx) return false;
    if (pending.has(ctx.token.uuid)) return warn("A mob action is already in progress for this Blaster.");
    pending.add(ctx.token.uuid);
    try { return await perform(ctx); }
    catch (error) {
      console.error(`${moduleId} | ${action}`, error);
      return warn("The mob action could not finish. Check the console and the scene before retrying.");
    } finally {
      pending.delete(ctx.token.uuid);
      if (registered) await queueSupportCleanup();
    }
  }

  async function flashMob(input?: any): Promise<boolean> {
    return run("flashMob", input, async (ctx) => {
      await ready();
      const api = (window as any)[ASSISTANT];
      if (!game.modules.get(ASSISTANT)?.active || typeof api?.summon !== "function") {
        return warn("Flash Mob requires an active PF2e Summons Assistant and its dependencies.");
      }
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
      if (!stillCurrent(ctx)) return warn("The scene, selected Blaster, or GM authority changed before placement.");
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
      // TCAL can overwrite actor update flags, and the helper restores summoner
      // linkage only AFTER adding effects. Recover our exact marked placement
      // without requiring a flag that failed post-processing may never have saved.
      const existing = new Set(allTokens().map((token) => token.uuid));
      const tokens = [...created.values()].filter((token) => {
        const marker = flag(token, "blasterSummon");
        const summoner = token.actor?.getFlag(ASSISTANT, "summoner");
        return existing.has(token.uuid) && token.parent?.id === ctx.token.parent.id &&
          token.actor?.type === "npc" && isHype(token) && flag(token.actor, "blasterVariant") === variant.key &&
          marker?.nonce === nonce && marker.ownerActorUuid === ctx.actor.uuid && marker.ownerTokenUuid === ctx.token.uuid &&
          (!summoner?.uuid || summoner.uuid === ctx.actor.uuid);
      });
      if (!tokens.length) {
        if (failure) console.debug(`${moduleId} | Flash Mob placement ended without a token`, failure);
        return warn("No hype thrall was placed. You can run Flash Mob again.");
      }
      let repairFailed = false;
      for (const token of tokens) {
        if (token.actor.getFlag(ASSISTANT, "summoner")?.uuid !== ctx.actor.uuid) {
          try { await token.actor.setFlag(ASSISTANT, "summoner", {
            uuid: ctx.actor.uuid, id: ctx.actor.id, signature: ctx.actor.signature,
          }); }
          catch (error) { repairFailed = true; console.error(`${moduleId} | Thrall owner-link repair`, error); }
        }
        // Placement may take time; the minute starts when a token actually exists.
        try { await token.setFlag(moduleId, "blasterSummon", {
          ...owner, createdAt: game.time.worldTime, expiresAt: game.time.worldTime + 60,
        }); }
        catch (error) { repairFailed = true; console.error(`${moduleId} | Thrall lifetime repair`, error); }
        try { await token.actor.update({ "system.attributes.hp.value": 1, "system.attributes.hp.max": 1, "system.attributes.hp.temp": 0 }); }
        catch (error) { repairFailed = true; console.error(`${moduleId} | Thrall HP repair`, error); }
        // Recover from the helper failing between placement and its itemsToAdd step.
        if (!contents(token.actor.items).some((item) => item.system?.slug === EXPIRATION_SLUG)) {
          try { await token.actor.createEmbeddedDocuments("Item", [expiry]); }
          catch (error) { repairFailed = true; console.error(`${moduleId} | Thrall expiration repair`, error); }
        }
        try {
          await ensureReceivers(token, ctx);
          if (!contents(token.actor.items).some((item) => auraKind(item))) {
            const source = await effectSource(AURA_IDS[variant.support], ctx);
            await token.actor.createEmbeddedDocuments("Item", [source]);
          }
          await notifyAura(token);
        } catch (error) { repairFailed = true; console.error(`${moduleId} | Thrall default aura repair`, error); }
      }
      if (failure) console.warn(`${moduleId} | Thrall placed; helper post-processing reported an error`, failure);
      if (repairFailed) {
        ui.notifications.warn("A thrall was placed, but its owner link, HP, expiration, or default aura could not be fully repaired. Inspect that token before summoning again; see the console.");
        return true; // Placement occurred: never report this as cancellation/no token.
      }
      ui.notifications.info(`Flash Mob: ${variant.name} summoned (1 action). No independent turn or attacks.`);
      return true;
    });
  }

  async function commandMob(input?: any): Promise<boolean> {
    return run("commandMob", input, async (ctx) => {
      await ready();
      const candidates = liveThralls(ctx).filter((token) => inRange(token, ctx));
      if (!candidates.length) return warn("This Blaster has no live hype thrall within 60 feet.");
      const escape = (value: string) => foundry.utils.escapeHTML(value);
      const choice = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Command Flash Mob — 1 action" }, rejectClose: false,
        content: `<p>Change one thrall's 60-foot aura for its remaining lifetime. Only its summoning Blaster benefits. Other thralls keep their modes, and their bonuses stack. Inspire and Guard require staying in the native aura area. Bolster adds 10 temporary HP once per thrall lifetime; spent HP never refill on re-entry or a mode change. Action costs are GM-adjudicated.</p>
          <div class="form-group"><label>Hype thrall</label><select name="thrallUuid">${candidates.map((token) =>
            `<option value="${escape(token.uuid)}">${escape(token.name)} (${escape(token.id)})</option>`).join("")}</select></div>
          <div class="form-group"><label>Support for Blaster</label><select name="support">
            <option value="inspire">Inspire: +1 stacking to attacks, damage, and fear saves</option>
            <option value="guard">Guard: +1 stacking to AC</option>
            <option value="tempHP">Bolster: +10 to the mob's temporary HP pool, once per thrall</option>
          </select></div>`,
        ok: { label: "Command", callback: (_event: any, button: any) => ({
          thrallUuid: button.form.elements.thrallUuid.value, support: button.form.elements.support.value,
        }) },
      });
      if (!choice) return false;
      if (!Object.prototype.hasOwnProperty.call(SUPPORT_IDS, choice.support)) return warn("Choose a valid support option.");
      const kind = choice.support as Support;
      const source = await effectSource(AURA_IDS[kind], ctx);
      // Serialize mode changes and cleanup. Never remove/recreate a native TempHP rule.
      const apply = supportCleanup.catch(() => {}).then(async () => {
        const thrall = liveThralls(ctx).find((token) => token.uuid === choice.thrallUuid && inRange(token, ctx));
        if (!stillCurrent(ctx) || !thrall) return warn("The selected Blaster, thrall, scene, or GM authority changed.");
        if (!auraOwner(thrall.actor)) return warn("The thrall's summoner link is missing or ambiguous. Summon it again with Flash Mob.");
        await ensureReceivers(thrall, ctx);
        const old = contents(thrall.actor.items).filter((item) => auraKind(item));
        if (old.length === 1 && auraKind(old[0]) === kind) return true;
        if (!stillCurrent(ctx) || !isOwnedThrall(thrall, ctx) || !isLive(thrall) || !inRange(thrall, ctx)) return warn("The selected thrall or GM authority changed before applying support.");
        stampSupport(source, ctx, thrall);
        const previous = old.map((item) => item.toObject());
        if (old.length) await thrall.actor.deleteEmbeddedDocuments("Item", old.map((item) => item.id));
        if (!stillCurrent(ctx) || !isOwnedThrall(thrall, ctx) || !isLive(thrall) || !inRange(thrall, ctx) || !auraOwner(thrall.actor)) {
          return warn("The selected thrall, scene, or GM authority changed while replacing its aura. Inspect the thrall before retrying.");
        }
        try {
          const effects = await thrall.actor.createEmbeddedDocuments("Item", [source]);
          if (!effects.length) throw new Error("The new aura was not created.");
        } catch (error) {
          if (stillCurrent(ctx) && isOwnedThrall(thrall, ctx) && isLive(thrall) && !contents(thrall.actor.items).some((item) => auraKind(item))) {
            await thrall.actor.createEmbeddedDocuments("Item", previous, { keepId: true });
          }
          throw error;
        }
        await notifyAura(thrall);
        ui.notifications.info("Command Flash Mob: this thrall's mode changed for its remaining lifetime.");
        return true;
      });
      supportCleanup = apply.then(() => {}, () => {});
      return apply;
    });
  }

  const isCleanupGM = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;

  const lifetimeKey = (thrall: any) => `${thrall.uuid}-${flag(thrall, "blasterSummon")?.nonce}`.replace(/[^a-zA-Z0-9_-]/g, "-");

  function receivedOwner(item: any) {
    const marker = flag(item, "commandMobSource");
    const thrall = allTokens().find((token) => token.uuid === marker?.thrallUuid);
    const owner = thrall && auraOwner(thrall.actor);
    return owner && owner.ctx.actor.uuid === item.actor.uuid &&
      marker.ownerTokenUuid === owner.ctx.token.uuid && marker.nonce === flag(thrall, "blasterSummon")?.nonce
      ? owner : null;
  }

  function hpObservation(actor: any) {
    const hp = actor._source?.system?.attributes?.hp ?? actor.system.attributes.hp;
    const ledger = flag(actor, "blasterMobPool");
    const externalId = ledger?.external?.tempSource;
    const external = externalId && actor.items.get(externalId);
    return { temp: hp.temp ?? 0, tempSource: hp.tempSource ?? hp.tempsource ?? null,
      externalSourceActive: externalId ? !!external && !external.isExpired && !external.system.expired : true };
  }

  function poolChanges(actor: any, result: ReturnType<typeof reconcileMobPool>) {
    return {
      // Foundry 14 recursively merges flags unless a replacement operator is explicit.
      [`flags.${moduleId}.blasterMobPool`]: foundry.data.operators.ForcedReplacement.create(result.ledger),
      "system.attributes.hp.temp": result.temp,
      // Empty string is a source-less pool; avoids colliding with native deletion sentinels.
      "system.attributes.hp.tempSource": result.tempSource ?? "",
    };
  }

  /** Damage and source replacement persist the spent ledger in the SAME actor update. */
  function observePool(actor: any, changed: any, options: any) {
    const previous = flag(actor, "blasterMobPool");
    if (!previous && !options?.blasterMobPoolUpdate) return;
    const read = (path: string) => Object.prototype.hasOwnProperty.call(changed, path)
      ? changed[path] : foundry.utils.getProperty(changed, path);
    const temp = read("system.attributes.hp.temp");
    const source = read("system.attributes.hp.tempSource");
    if (temp === undefined && source === undefined) return;
    const current = hpObservation(actor);
    // A native TempHP source expiring is not damage. Its remaining competitor may survive.
    const externalExpired = previous?.external?.tempSource && current.externalSourceActive === false &&
      previous.displayed.tempSource === previous.external.tempSource && Number(temp) === 0 &&
      source !== undefined && (typeof source !== "string" || !source) && !(options?.damageTaken > 0);
    const inputs = options?.blasterMobPoolUpdate ? poolInputs(actor) : null;
    const result = reconcileMobPool(previous, {
      ...current,
      temp: inputs ? current.temp : externalExpired ? previous.displayed.temp : temp === undefined ? current.temp : Number(temp),
      tempSource: inputs ? current.tempSource : externalExpired ? previous.displayed.tempSource :
        source === undefined ? current.tempSource : typeof source === "string" ? source : null,
    }, inputs?.live ?? Object.keys(previous.contributions), inputs?.grants ?? [], poolSource,
    inputs?.lifetimes ?? Object.keys(previous?.contributions ?? {}));
    for (const [path, value] of Object.entries(poolChanges(actor, result))) {
      delete changed[path];
      foundry.utils.setProperty(changed, path, value);
    }
  }

  function poolInputs(actor: any) {
    const received = contents(actor.items).filter((item) => item.flags?.pf2e?.aura &&
      flag(item, "blasterSupport") === "tempHP" && receivedOwner(item));
    const live = allTokens().filter((token) => {
      const owner = isHype(token) && auraOwner(token.actor);
      return owner && owner.ctx.actor.uuid === actor.uuid;
    }).map(lifetimeKey);
    const grants = received.map((item) => lifetimeKey(receivedOwner(item)!.thrall));
    // Death or a temporarily broken owner link forfeits remaining HP, never the spent tombstone.
    const lifetimes = allTokens().filter((token) => {
      const marker = flag(token, "blasterSummon");
      return isHype(token) && marker?.nonce && marker.ownerActorUuid === actor.uuid &&
        marker.expiresAt > game.time.worldTime;
    }).map(lifetimeKey);
    return { live, grants, lifetimes };
  }

  async function reconcilePools() {
    for (const actor of actors().values()) {
      if (!isCleanupGM()) return;
      const previous = flag(actor, "blasterMobPool");
      const { live, grants, lifetimes } = poolInputs(actor);
      if (!previous && !grants.length) continue;
      const current = hpObservation(actor);
      const result = reconcileMobPool(previous, current, live, grants, poolSource, lifetimes);
      if (JSON.stringify(previous) !== JSON.stringify(result.ledger) || current.temp !== result.temp ||
          (current.tempSource || null) !== result.tempSource) {
        await actor.update(poolChanges(actor, result), { blasterMobPoolUpdate: true });
      }
    }
  }

  async function expireSupport() {
    if (!isCleanupGM()) return;
    // Default embedded emitters need no creation hook; token linkage defines their lifetime.
    for (const actor of actors().values()) {
      const managed = allTokens().find((token) => token.actor?.uuid === actor.uuid && flag(token, "blasterSummon"));
      if (managed && pending.has(flag(managed, "blasterSummon").ownerTokenUuid)) continue;
      const ids = contents(actor.items).filter((item) => {
        const kind = auraKind(item);
        const marker = flag(item, "commandMobSource");
        if (kind) return (managed || marker) && (!auraOwner(actor) || item.isExpired || item.system.expired);
        if (!marker) return false; // Inert embedded receiver templates are never received benefits.
        const owner = receivedOwner(item);
        if (!owner) return true;
        if (pending.has(owner.ctx.token.uuid)) return false;
        // An awarded Bolster contribution lasts through this thrall's lifetime, even after switching modes.
        if (flag(item, "blasterSupport") === "tempHP") return false;
        const emitter = auraEmitter(item);
        const support = emitter && auraKind(emitter);
        if (!emitter || !support) return true;
        return canvas.ready && owner.ctx.token.parent?.id === canvas.scene?.id &&
          !nativeContains(owner.thrall, owner.ctx.token, support);
      }).map((item) => item.id);
      if (!isCleanupGM()) return;
      if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
    }
    await reconcilePools();
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

  function queueSupportCleanup() {
    supportCleanup = supportCleanup.catch(() => {}).then(() => expireSupport());
    return background(supportCleanup);
  }

  async function ready(): Promise<void> {
    if (!registered) {
      registered = true;
      // Hype thralls are support props, never autonomous combatants.
      Hooks.on("preCreateCombatant", (combatant: any) => {
        if (flag(combatant.actor ?? combatant.token?.actor, "blasterRole") === "hype-thrall") return false;
      });
      Hooks.on("combatTurnChange", () => queueSupportCleanup());
      Hooks.on("updateCombat", (combat: any, changed: any) => {
        if ("round" in changed || "turn" in changed) return queueSupportCleanup();
      });
      Hooks.on("deleteCombat", () => queueSupportCleanup());
      Hooks.on("preCreateItem", prepareAura);
      Hooks.on("preUpdateActor", observePool);
      // Hook callbacks deliberately do not return our queue: embedded deletion can
      // fire these while the queue is already running. Foundry hooks are synchronous.
      const itemChanged = (item: any) => {
        if (auraKind(item) || flag(item, "commandMobSource")?.auraEmitterUuid ||
            flag(item.actor, "blasterMobPool")) void queueSupportCleanup();
      };
      Hooks.on("createItem", itemChanged);
      Hooks.on("updateItem", itemChanged);
      Hooks.on("deleteItem", itemChanged);
      const actorChanged = (actor: any) => {
        if (["blaster", "hype-thrall"].includes(flag(actor, "blasterRole")) ||
            contents(actor?.items).some((item) => auraKind(item) || flag(item, "commandMobSource"))) void queueSupportCleanup();
      };
      Hooks.on("updateActor", actorChanged);
      Hooks.on("deleteActor", actorChanged);
      Hooks.on("deleteToken", (token: any) => actorChanged(token.actor));
      Hooks.on("updateToken", (token: any) => actorChanged(token.actor));
      Hooks.on("userConnected", () => { void queueSupportCleanup(); });
      Hooks.on("updateUser", () => { void queueSupportCleanup(); });
      const expireTimed = () => Promise.all([background(expireThralls()), queueSupportCleanup()]);
      Hooks.on("updateWorldTime", expireTimed);
      Hooks.on("canvasReady", expireTimed);
      background(expireThralls());
      queueSupportCleanup();
    }
    // Also allows callers/tests to await already queued cleanup without registering twice.
    while (backgroundJobs.size) await Promise.all([...backgroundJobs]);
  }

  return { flashMob, commandMob, ready };
}
