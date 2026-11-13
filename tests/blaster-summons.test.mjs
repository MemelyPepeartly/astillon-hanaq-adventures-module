import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import test, { describe } from "node:test";
import { JSDOM } from "jsdom";
import { createBlasterSummons } from "../dist/scripts/features/blaster-summons.js";

const MODULE = "astillon-hanaq-adventures-module";
const HELPER = "pf2e-summons-assistant";
const CREATE_THRALL = "Compendium.pf2e.spells-srd.Item.1JaRoJvlf8EPvnnD";
const THRALL_ACTOR_FILES = [
  "Flash Mob Hype Thrall.json",
  "Flash Mob Ego Guard.json",
  "Flash Mob Paparazzo.json",
];
const EFFECT_IDS = {
  expiration: "BlasterExpiry001",
  inspire: "BlasterInspire01",
  guard: "BlasterGuard0001",
  tempHP: "BlasterTempHP001",
  auraInspire: "BlasterAuraIns01",
  auraGuard: "BlasterAuraGrd01",
  auraBolster: "BlasterAuraBol01",
};
const EFFECT_FILES = {
  expiration: "Effect Flash Mob Thrall Expiration.json",
  inspire: "Effect Flash Mob Inspire.json",
  guard: "Effect Flash Mob Guard.json",
  tempHP: "Effect Flash Mob Bolster.json",
  auraInspire: "Aura Flash Mob Inspire.json",
  auraGuard: "Aura Flash Mob Guard.json",
  auraBolster: "Aura Flash Mob Bolster.json",
};
const effectUuid = (kind) => `Compendium.${MODULE}.astillon-blaster-items.Item.${EFFECT_IDS[kind]}`;
const clone = (value) => structuredClone(value);
const flush = () => setImmediate();

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

class Collection extends Map {
  get contents() { return [...super.values()]; }
  [Symbol.iterator]() { return super.values(); }
  find(predicate) { return this.contents.find(predicate); }
  filter(predicate) { return this.contents.filter(predicate); }
  some(predicate) { return this.contents.some(predicate); }
  map(predicate) { return this.contents.map(predicate); }
}

function getProperty(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function setProperty(object, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  let target = object;
  for (const key of keys) target = target[key] ??= {};
  target[last] = value;
  return true;
}

function mergeObject(target, source, { inplace = true } = {}) {
  const result = inplace ? target : clone(target);
  for (const [key, value] of Object.entries(source)) {
    if (key.includes(".")) setProperty(result, key, clone(value));
    else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = mergeObject(result[key] ?? {}, value);
    } else result[key] = clone(value);
  }
  return result;
}

function packEffect(kind) {
  return JSON.parse(readFileSync(new URL(`../src/packs/astillon-blaster-items.db/${EFFECT_FILES[kind]}`, import.meta.url), "utf8"));
}

function packThralls() {
  const fixtures = THRALL_ACTOR_FILES.map((name) => JSON.parse(readFileSync(new URL(`../src/packs/astillon-blaster-actors.db/${name}`, import.meta.url), "utf8")));
  return fixtures.map((source) => {
    const variant = source.flags?.[MODULE]?.blasterVariant;
    return {
      id: source._id,
      name: source.name,
      variant,
      role: source.flags?.[MODULE]?.blasterRole,
      uuid: `Compendium.${MODULE}.astillon-blaster-actors.Actor.${source._id}`,
      img: source.img,
      source,
    };
  });
}

const THRALLS = packThralls();
const THRALLS_BY_VARIANT = new Map(THRALLS.map((entry) => [entry.variant, entry]));
const THRALLS_BY_UUID = new Map(THRALLS.map((entry) => [entry.uuid, entry]));

function setup(t) {
  const dom = new JSDOM("<!doctype html><body></body>");
  const callbacks = new Map();
  let nextId = 0;
  const calls = { helper: [], dialogs: [], chat: [], loads: [], warnings: [], errors: [], actorUpdates: [], itemCreates: [], itemDeletes: [] };
  const state = { helperBehavior: null, dialogBehavior: null, choice: undefined, flashMobVariant: undefined, emitCreation: true };
  const Hooks = {
    on(name, callback) {
      const id = ++nextId;
      const entries = callbacks.get(name) ?? new Map();
      entries.set(id, callback);
      callbacks.set(name, entries);
      return id;
    },
    off(name, callbackOrId) {
      const entries = callbacks.get(name);
      for (const [id, callback] of entries ?? []) if (id === callbackOrId || callback === callbackOrId) entries.delete(id);
    },
  };
  const emit = async (name, ...args) => {
    const results = await Promise.all([...(callbacks.get(name)?.values() ?? [])].map((callback) => callback(...args)));
    await flush();
    return results;
  };
  const scene = { id: "scene1", uuid: "Scene.scene1", documentName: "Scene", tokens: new Collection() };
  const game = {
    user: { id: "gm1", isGM: true }, users: { activeGM: { id: "gm1" } },
    system: { id: "pf2e" }, release: { generation: 14 }, time: { worldTime: 100 },
    modules: new Map([[HELPER, { active: true }]]),
    scenes: new Collection([[scene.id, scene]]), actors: new Collection(),
    combat: null, combats: new Collection(),
    settings: { get: () => true }, i18n: { localize: (key) => key },
    pf2e: { TextEditor: { enrichHTML: async (value) => value } },
  };
  const canvas = { ready: true, scene, tokens: { controlled: [], placeables: [], get: (id) => scene.tokens.get(id)?.object } };
  const allDocuments = new Map([[scene.uuid, scene]]);
  const packDocuments = new Map();
  for (const kind of Object.keys(EFFECT_IDS)) {
    const source = packEffect(kind);
    const doc = { ...clone(source), id: source._id, uuid: effectUuid(kind), documentName: "Item", slug: source.system.slug, toObject: () => clone(source) };
    packDocuments.set(doc.uuid, doc);
  }
  packDocuments.set(CREATE_THRALL, { uuid: CREATE_THRALL, documentName: "Item", type: "spell", name: "Create Thrall", getFlag() {} });
  for (const fixture of THRALLS) {
    const actorDoc = flagDocument({ ...clone(fixture.source), _id: fixture.id, id: fixture.id, uuid: fixture.uuid, documentName: "Actor" });
    packDocuments.set(actorDoc.uuid, actorDoc);
  }
  game.packs = new Map([[`${MODULE}.astillon-blaster-items`, {
    getDocument: async (id) => packDocuments.get(`Compendium.${MODULE}.astillon-blaster-items.Item.${id}`),
    getIndex: async () => [...packDocuments.values()].filter((doc) => doc.documentName === "Item"),
  }]]);

  function flagDocument(object) {
    object.flags ??= {};
    object.getFlag = (scope, key) => getProperty(object.flags[scope], key);
    object.setFlag = async (scope, key, value) => {
      object.flags[scope] ??= {};
      setProperty(object.flags[scope], key, clone(value));
      return object;
    };
    object.unsetFlag = async (scope, key) => {
      const parts = key.split(".");
      const last = parts.pop();
      const target = parts.length ? getProperty(object.flags[scope], parts.join(".")) : object.flags[scope];
      if (target) delete target[last];
      return object;
    };
    return object;
  }

  function actor({ id = `actor${++nextId}`, uuid = `Actor.${id}`, role = "blaster", hp = 100, temp = 0 } = {}) {
    const result = flagDocument({
      id, uuid, name: role === "blaster" ? "Blaster" : "Hype Thrall", type: "npc", documentName: "Actor", isOwner: true,
      signature: uuid, flags: { [MODULE]: { blasterRole: role }, pf2e: { rollOptions: { all: { "self:trait:thrall": role === "hype-thrall" } } } },
      system: { attributes: { hp: { value: hp, max: hp, temp } }, details: { alliance: "opposition", level: { value: 20 } }, traits: { value: role === "hype-thrall" ? ["thrall"] : [] } },
      items: new Collection(), prototypeToken: { name: "Blaster" },
      getActiveTokens() { return canvas.tokens.placeables.filter((token) => token.actor === this); },
      getRollData() { return {}; },
      async update(changes) { calls.actorUpdates.push({ actor: this, changes: clone(changes) }); mergeObject(this, changes); return this; },
      async createEmbeddedDocuments(type, sources) {
        assert.equal(type, "Item");
        const created = [];
        for (const source of sources) {
          const data = clone(source);
          const item = flagDocument({ ...data, id: `effect${++nextId}`, documentName: "Item", actor: this, parent: this,
            get isExpired() { return !!this.system.expired; },
            get sourceId() { return this._stats?.duplicateSource ?? this._stats?.compendiumSource ?? null; },
            toObject() { return clone({ ...data, system: this.system, flags: this.flags }); },
            updateSource(changes) { mergeObject(this, changes); },
            async delete() { return result.deleteEmbeddedDocuments("Item", [this.id]); },
          });
          item._id = item.id;
          item.uuid = `${this.uuid}.Item.${item.id}`;
          item.slug = item.system.slug;
          item.rollOptionSlug = item.system.slug?.replace(/^(?:[a-z]+-)?(?:effect|stance)-/, "");
          item.system.start = { value: game.time.worldTime, initiative: game.combat?.combatant?.initiative ?? null };
          if ([...(callbacks.get("preCreateItem")?.values() ?? [])].some(callback => callback(item, data, {}, game.user.id) === false)) continue;
          calls.itemCreates.push({ actor: this, sources: [item.toObject()] });
          this.items.set(item.id, item);
          allDocuments.set(item.uuid, item);
          // PF2e TempHP's onCreate upgrades only, and records which effect supplied the HP.
          for (const rule of item.system.rules ?? []) if (rule.key === "TempHP" && Number(rule.value) > this.system.attributes.hp.temp) {
            this.system.attributes.hp.temp = Number(rule.value);
            this.system.attributes.hp.tempSource = item.id;
          }
          created.push(item);
          await emit("createItem", item, {}, game.user.id);
        }
        if (created.some(item => item.getFlag(MODULE, "blasterAura"))) await applyAuras();
        return created;
      },
      async deleteEmbeddedDocuments(type, ids) {
        assert.equal(type, "Item");
        calls.itemDeletes.push({ actor: this, ids: [...ids] });
        const removed = [];
        for (const id of ids) {
          const item = this.items.get(id);
          if (!item) continue;
          this.items.delete(id);
          allDocuments.delete(item.uuid);
          if (this.system.attributes.hp.tempSource === id) {
            this.system.attributes.hp.temp = 0;
            delete this.system.attributes.hp.tempSource;
          }
          removed.push(item);
          await emit("deleteItem", item, { parent: this });
        }
        return removed;
      },
    });
    Object.defineProperty(result, "itemTypes", { get: () => ({ effect: result.items.filter((item) => item.type === "effect") }) });
    Object.defineProperty(result, "isDead", { get: () => result.system.attributes.hp.value <= 0 });
    game.actors.set(id, result);
    allDocuments.set(uuid, result);
    return result;
  }

  function token({ actor: tokenActor = actor(), id = `token${++nextId}`, distance = 20, flags = {}, actorLink = false, name = tokenActor.name, texture = null } = {}) {
    const doc = flagDocument({
      id, _id: id, uuid: `${scene.uuid}.Token.${id}`, name, documentName: "Token", actor: tokenActor,
      actorId: tokenActor.id, actorLink, isOwner: true, parent: scene, scene, flags: clone(flags), x: 0, y: 0, width: 1, height: 1,
      texture: texture ? clone(texture) : { src: tokenActor.img ?? "" },
      async update(changes) { mergeObject(this, changes); return this; },
      async delete() { scene.tokens.delete(this.id); canvas.tokens.placeables = canvas.tokens.placeables.filter((entry) => entry.document !== this); await emit("deleteToken", this); return this; },
    });
    const object = { id, document: doc, actor: tokenActor, name: doc.name, distance, center: { x: 50, y: 50 },
      distanceTo(other) { return other.distance; }, isOwner: true,
    };
    doc.object = object;
    tokenActor.token = doc;
    scene.tokens.set(id, doc);
    canvas.tokens.placeables.push(object);
    allDocuments.set(doc.uuid, doc);
    return object;
  }

  const selected = token({ actor: actor({ id: "blaster1" }), id: "blasterToken1" });
  canvas.tokens.controlled = [selected];
  const combatant = { id: "combatant1", tokenId: selected.id, token: selected.document, actor: selected.actor, actorId: selected.actor.id, initiative: 30 };
  const combat = { id: "combat1", uuid: "Combat.combat1", scene, sceneId: scene.id, started: true, active: true, round: 1, turn: 0, combatant,
    combatants: new Collection([[combatant.id, combatant]]), turns: [combatant], current: { round: 1, turn: 0, tokenId: selected.id }, previous: {},
  };
  game.combat = combat;
  game.combats.set(combat.id, combat);
  game.combats.active = combat;
  selected.actor.combatant = combatant;

  function ownThrall({ owner = selected, hp = 1, distance = 20, expired = false, helperOwner = owner.actor.uuid, role = "hype-thrall" } = {}) {
    const thrallActor = actor({ role, hp });
    thrallActor.flags[HELPER] = { summoner: { uuid: helperOwner, id: owner.actor.id, signature: owner.actor.signature } };
    const expiry = flagDocument({ ...packEffect("expiration"), id: `expiry${++nextId}`, isExpired: expired, actor: thrallActor, parent: thrallActor });
    expiry.system.expired = expired;
    thrallActor.items.set(expiry.id, expiry);
    return token({ actor: thrallActor, distance, flags: { [MODULE]: { blasterSummon: {
      ownerActorUuid: owner.actor.uuid, ownerTokenUuid: owner.document.uuid, nonce: `nonce${++nextId}`,
      createdAt: game.time.worldTime - 5, expiresAt: expired ? game.time.worldTime - 1 : game.time.worldTime + 55,
    } } } });
  }

  // Contract fixture for PF2e 8b6df942 ActorPF2e.applyAreaEffects/checkAreaEffects:
  // signature predicates, source-ID dedupe, native aura origin flags, unlimited
  // recipient duration, and removeOnExit. This is not live canvas/wall rendering.
  async function applyAuras() {
    for (const target of scene.tokens) {
      for (const effect of [...target.actor.items.contents]) {
        const aura = effect.flags?.pf2e?.aura;
        if (!aura?.removeOnExit) continue;
        const origin = scene.tokens.find(token => token.actor.uuid === aura.origin);
        const emitter = origin?.actor.items.find(item => item.system.rules?.some(rule => rule.key === "Aura" && rule.slug === aura.slug));
        if (!emitter || origin.object.distance > 60) await target.actor.deleteEmbeddedDocuments("Item", [effect.id]);
      }
      for (const origin of scene.tokens) {
        for (const emitter of origin.actor.items) {
          for (const rule of emitter.system.rules ?? []) {
            if (rule.key !== "Aura" || emitter.isExpired || origin.hidden || origin.object.distance > rule.radius) continue;
            for (const entry of rule.effects) {
              if (!entry.includesSelf && origin.actor === target.actor) continue;
              const options = new Set([`target:signature:${target.actor.signature}`]);
              const predicates = entry.predicate.map(value => value.replace("{actor|flags.pf2e-summons-assistant.summoner.signature}", origin.actor.getFlag(HELPER, "summoner")?.signature));
              if (!predicates.every(value => options.has(value))) continue;
              if (target.actor.items.some(item => item.sourceId === entry.uuid)) continue;
              const source = packDocuments.get(entry.uuid).toObject();
              source.flags = { ...(source.flags ?? {}), pf2e: { aura: { slug: rule.slug, origin: origin.actor.uuid, removeOnExit: entry.removeOnExit } } };
              source._stats = { duplicateSource: entry.uuid };
              source.system.duration = { value: -1, unit: "unlimited", expiry: null, sustained: false };
              source.system.context = { origin: { actor: origin.actor.uuid, token: origin.uuid, item: null } };
              await target.actor.createEmbeddedDocuments("Item", [source]);
            }
          }
        }
      }
    }
  }

  async function place(payload) {
    const details = payload.summonDetailsGroup[0];
    const source = packDocuments.get(details.specific_uuids[0]);
    assert.ok(source, "specific_uuids[0] must resolve to a fixture actor");
    assert.equal(source.documentName, "Actor");
    // The real helper mutates these inputs and returns undefined even after success.
    details.itemsToAdd.unshift({ name: "Summon Owner", type: "effect", system: { slug: "summon-owner", rules: [], duration: { unit: "unlimited", value: -1 } } });
    const thrallActor = actor({ role: source.getFlag(MODULE, "blasterRole") ?? "hype-thrall", hp: source.system?.attributes?.hp?.value ?? 1 });
    thrallActor.name = source.name;
    thrallActor.img = source.img;
    thrallActor.flags[MODULE] = clone(source.flags?.[MODULE] ?? {});
    thrallActor.prototypeToken = clone(source.prototypeToken ?? { name: source.name });
    mergeObject(thrallActor, details.modifications ?? {});
    delete details.modifications?.["system.traits.value"];
    const summoned = token({
      actor: thrallActor,
      flags: details.tokenModifications.flags,
      actorLink: details.tokenModifications.actorLink,
      name: details.tokenModifications.name,
      texture: details.tokenModifications.texture,
    });
    if (state.emitCreation) await emit("createToken", summoned.document, {}, game.user.id);
    await thrallActor.createEmbeddedDocuments("Item", details.itemsToAdd);
    await thrallActor.setFlag(HELPER, "summoner", { uuid: payload.summonerActor.uuid, id: payload.summonerActor.id, signature: payload.summonerActor.signature });
    return undefined;
  }

  const helper = { async summon(payload) {
    const details = payload.summonDetailsGroup.map(({ crosshairParameters, ...group }) => ({
      ...clone(group), crosshairParameters,
    }));
    calls.helper.push({ payload, details });
    if (state.helperBehavior) return await state.helperBehavior(payload, place);
    return await place(payload);
  } };
  const DialogV2 = { async prompt(options) {
    calls.dialogs.push(options);
    if (state.dialogBehavior) return await state.dialogBehavior(options);
    if (state.choice === null) return null;
    const form = dom.window.document.createElement("form");
    form.innerHTML = options.content;
    for (const radio of form.querySelectorAll('input[type="radio"][name="variant"]')) {
      radio.checked = radio.value === (state.flashMobVariant ?? THRALLS[0].variant);
    }
    for (const select of form.querySelectorAll("select")) {
      select.value = /support|command|mode/i.test(select.name) ? state.choice.support : state.choice.thrallUuid;
    }
    const button = { form };
    return options.ok.callback(new dom.window.Event("click"), button);
  } };
  const fromUuid = async (uuid) => {
    calls.loads.push(uuid);
    return allDocuments.get(uuid) ?? packDocuments.get(uuid) ?? null;
  };
  const ChatMessage = { getSpeaker: ({ token: doc }) => ({ token: doc.id, actor: doc.actor.id, scene: scene.id }), create: async (data) => { calls.chat.push(data); return data; } };
  const globals = {
    window: dom.window, document: dom.window.document, Hooks, game, canvas, fromUuid,
    ui: { notifications: { warn: (message) => calls.warnings.push(message), error: (message) => calls.errors.push(message), info() {} } },
    foundry: { utils: { randomID: () => `nonce${++nextId}`, deepClone: clone, duplicate: clone, getProperty, setProperty, mergeObject,
      escapeHTML: (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"), fromUuid },
      applications: { api: { DialogV2 } }, documents: { ChatMessage } },
    ChatMessage,
  };
  dom.window[HELPER] = helper;
  const originals = new Map(Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  t.after(async () => {
    // Repeated ready() waits for the registered feature's tracked background work.
    // Do not register hooks solely for teardown in tests that never called ready().
    if (callbacks.has("updateWorldTime")) await api.ready();
    dom.window.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const api = createBlasterSummons(MODULE);
  const uses = () => selected.document.getFlag(MODULE, "blasterMobUses");
  return { api, calls, state, emit, callbacks, game, canvas, scene, combat, selected, actor, token, ownThrall, uses, packDocuments, place, applyAuras };
}

describe("Blaster summons integration", { concurrency: 1 }, () => {
  test("Flash Mob uses the real public helper contract and detects its undefined-return success", async (t) => {
    const env = setup(t);
    for (const fixture of THRALLS) assert.equal(fixture.id.length, 16);
    assert.equal(await env.api.flashMob(), true);
    assert.equal(env.calls.helper.length, 1);
    const { payload, details: [group] } = env.calls.helper[0];
    const selected = THRALLS_BY_VARIANT.get(THRALLS[0].variant);
    assert.equal(payload.summonerActor, env.selected.actor);
    assert.equal(payload.itemUuid, CREATE_THRALL);
    assert.equal(payload.summonType, "thrall");
    assert.deepEqual(group.specific_uuids, [selected.uuid]);
    assert.equal(group.amount, 1);
    assert.equal(group.tokenModifications.actorLink, false);
    assert.equal(group.crosshairParameters.location.obj, env.selected);
    assert.equal(group.crosshairParameters.location.limitMaxRange, 30);
    const marker = group.tokenModifications.flags[MODULE].blasterSummon;
    assert.equal(marker.ownerActorUuid, env.selected.actor.uuid);
    assert.equal(marker.ownerTokenUuid, env.selected.document.uuid);
    assert.ok(marker.nonce);
    assert.equal(marker.expiresAt - marker.createdAt, 60);
    assert.deepEqual(group.modifications[`flags.${HELPER}.summoner`], {
      uuid: env.selected.actor.uuid, id: env.selected.actor.id, signature: env.selected.actor.signature,
    });
    const expiration = group.itemsToAdd.find((item) => item.system.slug === "effect-thrall-expiration-date");
    assert.ok(expiration);
    assert.equal(expiration.system.duration.value, 1);
    assert.equal(expiration.system.duration.unit, "minutes");
    assert.equal(expiration.system.rules.some((rule) => rule.key === "Strike"), false);
    const summoned = env.scene.tokens.find((token) => token.id !== env.selected.id);
    assert.ok(summoned);
    assert.equal(summoned.name, group.tokenModifications.name);
    assert.equal(summoned.texture.src, selected.img);
    assert.equal(summoned.actor.getFlag(MODULE, "blasterVariant"), selected.variant);
    assert.notEqual(summoned.actor.uuid, group.specific_uuids[0]);
    assert.equal(env.calls.chat.some((message) => JSON.stringify(message.flags ?? {}).includes(CREATE_THRALL)), false);
    assert.equal(env.callbacks.get("createToken")?.size ?? 0, 0);
  });

  for (const fixture of THRALLS) {
    test(`Flash Mob picker selects ${fixture.variant} through the DialogV2 radio callback`, async (t) => {
      const env = setup(t);
      env.state.dialogBehavior = async (options) => {
        const form = globalThis.document.createElement("form");
        form.innerHTML = options.content;
        for (const radio of form.querySelectorAll('input[type="radio"][name="variant"]')) radio.checked = radio.value === fixture.variant;
        return options.ok.callback(new globalThis.window.Event("click"), { form });
      };
      assert.equal(await env.api.flashMob(), true);
      const [{ details: [group] }] = env.calls.helper;
      assert.deepEqual(group.specific_uuids, [fixture.uuid]);
      const summoned = env.scene.tokens.find((token) => token.id !== env.selected.id);
      assert.ok(summoned);
      assert.equal(summoned.name, group.tokenModifications.name);
      assert.equal(summoned.texture.src, `modules/${MODULE}/assets/blaster-thralls/${fixture.variant}.png`);
      assert.equal(summoned.actor.getFlag(MODULE, "blasterVariant"), fixture.variant);
    });
  }

  test("Flash Mob allows the random picker option and resolves to one supported actor UUID", async (t) => {
    const env = setup(t);
    t.mock.method(Math, "random", () => 0.99);
    env.state.flashMobVariant = "random";
    assert.equal(await env.api.flashMob(), true);
    const [{ details: [group] }] = env.calls.helper;
    assert.equal(THRALLS_BY_UUID.has(group.specific_uuids[0]), true);
  });

  test("Flash Mob cancel in the picker spends nothing", async (t) => {
    const env = setup(t);
    env.state.dialogBehavior = async () => null;
    assert.equal(await env.api.flashMob(), false);
    assert.equal(env.calls.helper.length, 0);
  });

  for (const invalid of ["missing doc", "wrong role", "wrong variant"]) {
    test(`Flash Mob rejects an invalid picker-backed actor fixture: ${invalid}`, async (t) => {
      const env = setup(t);
      const fixture = THRALLS_BY_VARIANT.get("ego-guard");
      env.state.flashMobVariant = fixture.variant;
      const packed = env.packDocuments.get(fixture.uuid);
      if (invalid === "missing doc") env.packDocuments.delete(fixture.uuid);
      if (invalid === "wrong role") packed.flags[MODULE].blasterRole = "blaster";
      if (invalid === "wrong variant") packed.flags[MODULE].blasterVariant = "hype-fan";
      assert.equal(await env.api.flashMob(), false);
      assert.equal(env.calls.helper.length, 0);
    });
  }

  for (const change of ["gm", "cap"]) {
    test(`Flash Mob revalidates ${change} after waiting on the picker`, async (t) => {
      const env = setup(t);
      env.state.dialogBehavior = async (options) => {
        if (change === "gm") env.game.users.activeGM.id = "otherGM";
        if (change === "cap") { env.ownThrall(); env.ownThrall(); env.ownThrall(); }
        const form = globalThis.document.createElement("form");
        form.innerHTML = options.content;
        for (const radio of form.querySelectorAll('input[type="radio"][name="variant"]')) radio.checked = radio.value === THRALLS[0].variant;
        return options.ok.callback(new globalThis.window.Event("click"), { form });
      };
      assert.equal(await env.api.flashMob(), false);
      assert.equal(env.calls.helper.length, 0);
    });
  }

  test("Flash Mob allows round changes while the picker is open", async (t) => {
    const env = setup(t);
    env.state.dialogBehavior = async (options) => {
      env.combat.round = 2;
      const form = globalThis.document.createElement("form");
      form.innerHTML = options.content;
      for (const radio of form.querySelectorAll('input[type="radio"][name="variant"]')) radio.checked = radio.value === THRALLS[0].variant;
      return options.ok.callback(new globalThis.window.Event("click"), { form });
    };
    assert.equal(await env.api.flashMob(), true);
    assert.equal(env.calls.helper.length, 1);
  });

  for (const invalid of ["not GM", "secondary GM", "not PF2e", "no selected token", "multiple controlled tokens", "wrong role", "ambiguous actor tokens"]) {
    test(`Flash Mob refuses ${invalid} without invoking the helper`, async (t) => {
      const env = setup(t);
      if (invalid === "not GM") env.game.user.isGM = false;
      if (invalid === "secondary GM") env.game.users.activeGM.id = "otherGM";
      if (invalid === "not PF2e") env.game.system.id = "dnd5e";
      if (invalid === "no selected token") env.canvas.tokens.controlled = [];
      if (invalid === "multiple controlled tokens") env.canvas.tokens.controlled.push(env.token());
      if (invalid === "wrong role") env.selected.actor.flags[MODULE].blasterRole = "hype-thrall";
      if (invalid === "ambiguous actor tokens") env.token({ actor: env.selected.actor });
      assert.equal(await env.api.flashMob(), false);
      assert.equal(env.calls.helper.length, 0);
    });
  }

  for (const mode of ["no combat", "unstarted combat", "unrelated combat"]) {
    test(`Flash Mob can run with ${mode}`, async (t) => {
      const env = setup(t);
      if (mode === "no combat") env.game.combat = null;
      if (mode === "unstarted combat") env.combat.started = false;
      if (mode === "unrelated combat") {
        env.combat.scene = { id: "other-scene" };
        env.combat.sceneId = "other-scene";
      }
      assert.equal(await env.api.flashMob(), true);
    });
  }

  test("explicit TokenDocument input is supported and a missing dependency cannot create a fallback summon", async (t) => {
    const env = setup(t);
    env.canvas.tokens.controlled = [];
    env.game.modules.get(HELPER).active = false;
    assert.equal(await env.api.flashMob({ token: env.selected.document }), false);
    assert.equal(env.scene.tokens.size, 1);
    assert.equal(env.calls.helper.length, 0);
    env.game.modules.get(HELPER).active = true;
    assert.equal(await env.api.flashMob(env.selected.document), true);
  });

  test("a second active token appearing while the expiration effect loads prevents placement", async (t) => {
    const env = setup(t);
    const expiry = env.packDocuments.get(effectUuid("expiration"));
    const original = expiry.toObject;
    expiry.toObject = () => {
      env.token({ actor: env.selected.actor });
      return original();
    };
    assert.equal(await env.api.flashMob(), false);
    assert.equal(env.calls.helper.length, 0);
  });

  test("simultaneous clicks share a per-Blaster lock while sequential summons remain available until cap", async (t) => {
    const env = setup(t);
    const started = deferred();
    const finish = deferred();
    env.state.helperBehavior = async (payload, place) => { started.resolve(); await finish.promise; return place(payload); };
    const first = env.api.flashMob();
    await started.promise;
    assert.equal(await env.api.flashMob(), false);
    assert.equal(env.calls.helper.length, 1);
    finish.resolve();
    assert.equal(await first, true);
    assert.equal(await createBlasterSummons(MODULE).flashMob(), true);
    assert.equal(await env.api.flashMob(), true);
    assert.equal(await env.api.flashMob(), false);
    assert.equal(env.calls.helper.length, 3);
  });

  test("the helper's null-token cancellation bug releases the lock", async (t) => {
    t.mock.method(console, "debug", () => {});
    const env = setup(t);
    env.state.helperBehavior = async () => { throw new TypeError("Cannot read properties of null (reading 'actor')"); };
    assert.equal(await env.api.flashMob(), false);
    assert.equal(env.callbacks.get("createToken")?.size ?? 0, 0);
    env.state.helperBehavior = null;
    assert.equal(await env.api.flashMob(), true);
    assert.equal(env.calls.helper.length, 2);
  });

  test("an undefined helper return without a created token is cancellation, not success", async (t) => {
    const env = setup(t);
    env.state.helperBehavior = async () => undefined;
    assert.equal(await env.api.flashMob(), false);
    env.state.helperBehavior = null;
    assert.equal(await env.api.flashMob(), true);
  });

  test("a created token is still treated as success when helper post-processing later throws", async (t) => {
    t.mock.method(console, "warn", () => {});
    const env = setup(t);
    env.state.helperBehavior = async (payload, place) => {
      await place(payload);
      throw new Error("Helper post-summon failed after placement");
    };
    assert.equal(await env.api.flashMob(), true);
    assert.equal(await env.api.flashMob(), true);
    assert.equal(env.calls.helper.length, 2);
  });

  test("partial helper placement repair still recognizes the placed nonce-marked token", async (t) => {
    const env = setup(t);
    let summoned;
    env.state.helperBehavior = async (payload) => {
      const details = payload.summonDetailsGroup[0];
      const partialActor = env.actor({ role: "hype-thrall", hp: 20 });
      mergeObject(partialActor, details.modifications);
      delete partialActor.flags?.[HELPER];
      partialActor.system.attributes.hp.value = 20;
      summoned = env.token({ actor: partialActor, flags: details.tokenModifications.flags });
      await env.emit("createToken", summoned.document, {}, env.game.user.id);
      throw new Error("Helper failed before adding its expiration effect");
    };
    assert.equal(await env.api.flashMob(), true);
    assert.ok(summoned);
    assert.equal(summoned.actor.getFlag(HELPER, "summoner")?.uuid, env.selected.actor.uuid);
    assert.equal(summoned.actor.getFlag(MODULE, "blasterVariant"), THRALLS[0].variant);
    assert.ok(summoned.actor.items.find((item) => item.system.slug === "effect-thrall-expiration-date"));
    assert.equal(summoned.actor.system.attributes.hp.value, 1);
    env.state.helperBehavior = null;
    assert.equal(await env.api.flashMob(), true);
  });

  test("scene token lookup recovers a successful summon when the creation hook is missed", async (t) => {
    const env = setup(t);
    env.state.emitCreation = false;
    assert.equal(await env.api.flashMob(), true);
  });

  test("an unrelated token created during placement cannot turn cancellation into success", async (t) => {
    const env = setup(t);
    env.state.helperBehavior = async () => {
      const unrelated = env.ownThrall();
      await env.emit("createToken", unrelated.document, {}, env.game.user.id);
    };
    assert.equal(await env.api.flashMob(), false);
  });

  test("the three-thrall limit counts only live summons owned by this Blaster", async (t) => {
    const env = setup(t);
    env.ownThrall(); env.ownThrall(); env.ownThrall();
    assert.equal(await env.api.flashMob(), false);
    assert.equal(env.calls.helper.length, 0);
    const own = env.scene.tokens.find((doc) => doc.actor.getFlag(MODULE, "blasterRole") === "hype-thrall");
    own.actor.system.attributes.hp.value = 0;
    const other = env.token({ actor: env.actor({ id: "otherBlaster" }) });
    env.ownThrall({ owner: other }); env.ownThrall({ expired: true });
    assert.equal(await env.api.flashMob(), true);
  });

  test("a shared actor id cannot impersonate another synthetic Blaster's summoner UUID", async (t) => {
    const env = setup(t);
    env.selected.actor.uuid = "Scene.scene1.Token.blasterToken1.Actor.sharedActor";
    const other = env.token({ actor: env.actor({ id: env.selected.actor.id, uuid: "Scene.scene1.Token.other.Actor.sharedActor" }) });
    env.ownThrall({ owner: other }); env.ownThrall({ owner: other }); env.ownThrall({ owner: other });
    assert.equal(await env.api.flashMob(), true);
  });

  test("helper mutation does not contaminate subsequent effect payloads", async (t) => {
    const env = setup(t);
    assert.equal(await env.api.flashMob(), true);
    assert.equal(await env.api.flashMob(), true);
    const [first, second] = env.calls.helper;
    assert.notEqual(first.payload.summonDetailsGroup[0].itemsToAdd, second.payload.summonDetailsGroup[0].itemsToAdd);
    assert.deepEqual(second.details[0].itemsToAdd.map((item) => item.system.slug), first.details[0].itemsToAdd.map((item) => item.system.slug));
  });

  test("legacy blasterMobUses flags do not block Flash Mob or Command Mob", async (t) => {
    const env = setup(t);
    await env.selected.document.setFlag(MODULE, "blasterMobUses", { flashMob: "Combat.old:1", commandMob: "Combat.old:1" });
    assert.equal(await env.api.flashMob(), true);
    const thrall = env.ownThrall();
    env.state.choice = { thrallUuid: thrall.document.uuid, support: "guard" };
    assert.equal(await env.api.commandMob(), true);
  });

  test("Flash Mob recovery rejects foreign helper-link thralls and wrong-variant placed actors", async (t) => {
    const env = setup(t);
    env.state.helperBehavior = async (payload) => {
      const details = payload.summonDetailsGroup[0];
      const good = env.actor({ role: "hype-thrall", hp: 20 });
      mergeObject(good, details.modifications);
      good.flags[HELPER] = { summoner: { uuid: "Actor.foreign" } };
      env.token({ actor: good, flags: details.tokenModifications.flags });

      const wrongVariant = env.actor({ role: "hype-thrall", hp: 20 });
      mergeObject(wrongVariant, details.modifications);
      wrongVariant.flags[MODULE].blasterVariant = "not-a-pack-variant";
      delete wrongVariant.flags?.[HELPER];
      env.token({ actor: wrongVariant, flags: details.tokenModifications.flags });
      await env.emit("createToken", wrongVariant.token, {}, env.game.user.id);
    };
    assert.equal(await env.api.flashMob(), false);
    assert.equal(env.calls.warnings.some((msg) => msg.includes("No hype thrall was placed")), true);
  });

  test("Flash Mob warns as placed when helper-link repair fails but still attempts HP/expiry repair", async (t) => {
    const env = setup(t);
    let summoned;
    let setFlagAttempts = 0;
    env.state.helperBehavior = async (payload) => {
      const details = payload.summonDetailsGroup[0];
      const partialActor = env.actor({ role: "hype-thrall", hp: 20 });
      mergeObject(partialActor, details.modifications);
      delete partialActor.flags?.[HELPER];
      partialActor.setFlag = async () => { setFlagAttempts += 1; throw new Error("setFlag failed"); };
      summoned = env.token({ actor: partialActor, flags: details.tokenModifications.flags });
      await env.emit("createToken", summoned.document, {}, env.game.user.id);
      throw new Error("helper follow-up failed");
    };
    assert.equal(await env.api.flashMob(), true);
    assert.ok(summoned);
    assert.equal(setFlagAttempts > 0, true);
    assert.equal(summoned.actor.system.attributes.hp.value, 1);
    assert.ok(summoned.actor.items.find((item) => item.system.slug === "effect-thrall-expiration-date"));
    assert.equal(env.calls.warnings.some((msg) => msg.includes("A thrall was placed") && msg.includes("could not be fully repaired")), true);
  });

  test("Command Mob chooses a specific own thrall and applies the actual Inspire effect to Blaster", async (t) => {
    const env = setup(t);
    const first = env.ownThrall();
    const selectedThrall = env.ownThrall({ distance: 60 });
    env.state.choice = { thrallUuid: selectedThrall.document.uuid, support: "inspire" };
    assert.equal(await env.api.commandMob(), true);
    assert.equal(env.calls.dialogs.length, 1);
    assert.match(env.calls.dialogs[0].content, new RegExp(first.document.uuid.replaceAll(".", "\\.")));
    const created = env.calls.itemCreates.find((entry) => entry.actor === env.selected.actor)?.sources[0];
    assert.ok(created);
    assert.deepEqual(created.system.rules, packEffect("inspire").system.rules);
    assert.equal(created.system.duration.value, 1);
    assert.equal(created.system.duration.unit, "rounds");
    assert.equal(created.system.context.origin.actor, env.selected.actor.uuid);
    assert.equal(created.flags[MODULE].commandMobSource.thrallUuid, selectedThrall.document.uuid);
    assert.equal(created.flags[MODULE].commandMobSource.combatUuid, env.combat.uuid);
    assert.equal(created.flags[MODULE].commandMobSource.round, env.combat.round);
    assert.equal(created.flags[MODULE].commandMobSource.turn, env.combat.turn);
    assert.equal(created.flags[MODULE].commandMobSource.expiresAt, null);
    assert.equal(env.selected.actor.items.size, 1);
    assert.equal(selectedThrall.actor.items.size, 2);
    const emitter = selectedThrall.actor.items.find(item => item.getFlag(MODULE, "blasterAura") === "inspire");
    assert.deepEqual(emitter.system.rules, packEffect("auraInspire").system.rules);
    assert.equal(created.flags[MODULE].commandMobSource.auraEmitterUuid, emitter.uuid);
    assert.equal(await env.api.commandMob(), true);
  });

  for (const change of ["cancel", "range", "ownership", "dead"]) {
    test(`Command Mob revalidates ${change} after its dialog and does not apply invalid support`, async (t) => {
      const env = setup(t);
      const thrall = env.ownThrall();
      env.state.dialogBehavior = async () => {
        if (change === "cancel") return null;
        if (change === "range") thrall.distance = 65;
        if (change === "ownership") thrall.actor.flags[HELPER].summoner.uuid = "Actor.someoneElse";
        if (change === "dead") thrall.actor.system.attributes.hp.value = 0;
        return { thrallUuid: thrall.document.uuid, support: "guard" };
      };
      assert.equal(await env.api.commandMob(), false);
      assert.equal(env.calls.dialogs.length, 1);
      assert.equal(env.calls.itemCreates.length, 0);
    });
  }

  test("Command Mob allows round changes while the dialog is open", async (t) => {
    const env = setup(t);
    const thrall = env.ownThrall();
    env.state.dialogBehavior = async () => {
      env.combat.round = 2;
      return { thrallUuid: thrall.document.uuid, support: "guard" };
    };
    assert.equal(await env.api.commandMob(), true);
  });

  test("out-of-range and foreign summons are absent from the command choices", async (t) => {
    const env = setup(t);
    const own = env.ownThrall();
    const far = env.ownThrall({ distance: 65 });
    const other = env.token({ actor: env.actor({ id: "otherBlaster" }) });
    const foreign = env.ownThrall({ owner: other });
    env.state.choice = { thrallUuid: own.document.uuid, support: "guard" };
    assert.equal(await env.api.commandMob(), true);
    const content = env.calls.dialogs[0].content;
    assert.equal(content.includes(far.document.uuid), false);
    assert.equal(content.includes(foreign.document.uuid), false);
    assert.deepEqual(env.calls.itemCreates.find(entry => entry.actor === own.actor).sources[0].system.rules, packEffect("auraGuard").system.rules);
    assert.deepEqual(env.calls.itemCreates.find(entry => entry.actor === env.selected.actor).sources[0].system.rules, packEffect("guard").system.rules);
  });

  test("a forged dialog choice cannot command another Blaster's otherwise valid thrall", async (t) => {
    const env = setup(t);
    env.ownThrall();
    const other = env.token({ actor: env.actor({ id: "otherBlaster" }) });
    const foreign = env.ownThrall({ owner: other });
    env.state.dialogBehavior = async () => ({ thrallUuid: foreign.document.uuid, support: "guard" });
    assert.equal(await env.api.commandMob(), false);
    assert.equal(env.calls.itemCreates.length, 0);
  });

  test("a pending command dialog prevents duplicate commands and concurrent Flash Mob", async (t) => {
    const env = setup(t);
    const thrall = env.ownThrall();
    const started = deferred();
    const finish = deferred();
    env.state.dialogBehavior = async () => { started.resolve(); return finish.promise; };
    const command = env.api.commandMob();
    await started.promise;
    assert.equal(await env.api.commandMob(), false);
    assert.equal(await env.api.flashMob(), false);
    finish.resolve({ thrallUuid: thrall.document.uuid, support: "guard" });
    assert.equal(await command, true);
    assert.equal(env.calls.dialogs.length, 1);
    assert.equal(env.calls.helper.length, 0);
  });

  test("Temp HP support keeps the pack's rule and never stacks over a larger existing pool", async (t) => {
    const env = setup(t);
    const thrall = env.ownThrall();
    env.selected.actor.system.attributes.hp.temp = 15;
    env.selected.actor.system.attributes.hp.tempSource = "existingOtherEffect";
    env.state.choice = { thrallUuid: thrall.document.uuid, support: "tempHP" };
    assert.equal(await env.api.commandMob(), true);
    assert.deepEqual(env.calls.itemCreates.find(entry => entry.actor === env.selected.actor).sources[0].system.rules, packEffect("tempHP").system.rules);
    assert.equal(env.selected.actor.system.attributes.hp.temp, 15);
    assert.equal(env.selected.actor.system.attributes.hp.tempSource, "existingOtherEffect");
    assert.equal(env.calls.actorUpdates.some((entry) => JSON.stringify(entry.changes).includes('"temp"')), false);
  });

  test("ready registers once, blocks autonomous thrall turns, and enforces the minute lifetime", async (t) => {
    const env = setup(t);
    const thrall = env.ownThrall();
    env.api.ready();
    env.api.ready();
    assert.equal(env.callbacks.get("preCreateCombatant").size, 1);
    assert.deepEqual(await env.emit("preCreateCombatant", { actor: thrall.actor }), [false]);
    assert.deepEqual(await env.emit("preCreateCombatant", { actor: env.selected.actor }), [undefined]);
    env.game.time.worldTime += 54;
    await env.emit("updateWorldTime", env.game.time.worldTime);
    assert.equal(env.scene.tokens.has(thrall.id), true);
    env.game.time.worldTime += 1;
    await env.emit("updateWorldTime", env.game.time.worldTime);
    assert.equal(env.scene.tokens.has(thrall.id), false);
    assert.equal(env.scene.tokens.has(env.selected.id), true);
  });

  test("repeated ready waits for an already running expiry deletion", async (t) => {
    const env = setup(t);
    const thrall = env.ownThrall({ expired: true });
    const started = deferred();
    const finish = deferred();
    const originalDelete = thrall.document.delete;
    thrall.document.delete = async () => {
      started.resolve();
      await finish.promise;
      return originalDelete.call(thrall.document);
    };
    const initial = env.api.ready();
    await started.promise;
    let drained = false;
    const drain = env.api.ready().then(() => { drained = true; });
    await Promise.resolve();
    assert.equal(drained, false);
    finish.resolve();
    await Promise.all([initial, drain]);
    assert.equal(env.scene.tokens.has(thrall.id), false);
    assert.equal(drained, true);
  });

  test("support survives another creature's turn and expires at the start of Blaster's next turn", async (t) => {
    const env = setup(t);
    env.api.ready();
    const thrall = env.ownThrall();
    env.state.choice = { thrallUuid: thrall.document.uuid, support: "tempHP" };
    assert.equal(await env.api.commandMob(), true);
    assert.equal(env.selected.actor.system.attributes.hp.temp, 10);
    const blasterCombatant = env.combat.combatant;
    env.combat.turn = 1;
    env.combat.combatant = { id: "other", tokenId: "other", actor: env.actor() };
    await env.emit("updateCombat", env.combat, { turn: 1 }, {}, env.game.user.id);
    assert.equal(env.selected.actor.items.size, 1);
    env.combat.round = 2;
    env.combat.turn = 0;
    env.combat.combatant = blasterCombatant;
    await env.emit("updateCombat", env.combat, { round: 2, turn: 0 }, {}, env.game.user.id);
    assert.equal(env.selected.actor.items.size, 0);
    assert.equal(env.selected.actor.system.attributes.hp.temp, 0);
  });

  test("combatTurnChange and updateCombat together delete support only once", async (t) => {
    const env = setup(t);
    env.api.ready();
    const thrall = env.ownThrall();
    env.state.choice = { thrallUuid: thrall.document.uuid, support: "guard" };
    assert.equal(await env.api.commandMob(), true);
    env.combat.round = 2;
    await Promise.all([
      env.emit("combatTurnChange", env.combat, {}, {}),
      env.emit("updateCombat", env.combat, { round: 2 }, {}, env.game.user.id),
    ]);
    assert.equal(env.calls.itemDeletes.filter((entry) => entry.actor === env.selected.actor).length, 1);
  });

  test("off-turn summon and command are allowed; support expires on Blaster's next turn in the same round", async t => {
    const env = setup(t);
    const blasterTurn = env.combat.combatant;
    env.combat.combatant = { token: { uuid: "Scene.scene1.Token.other" }, initiative: 40 };
    assert.equal(await env.api.flashMob(), true);
    const thrall = env.scene.tokens.find(token => token.actor.getFlag(MODULE, "blasterRole") === "hype-thrall");
    env.state.choice = { thrallUuid: thrall.uuid, support: "tempHP" };
    assert.equal(await env.api.commandMob(), true);
    const created = env.calls.itemCreates.find(entry => entry.actor === env.selected.actor).sources[0];
    assert.equal(created.system.start.initiative, blasterTurn.initiative);
    assert.equal(created.flags[MODULE].commandMobSource.turn, 0);
    assert.equal(env.selected.actor.system.attributes.hp.temp, 10);
    await env.api.ready();
    assert.equal(env.selected.actor.items.size, 1);
    env.combat.turn = 1;
    env.combat.combatant = blasterTurn;
    await env.emit("combatTurnChange", env.combat, {}, {});
    await env.api.ready();
    assert.equal(env.selected.actor.items.size, 0);
    assert.equal(env.selected.actor.system.attributes.hp.temp, 0);
  });

  for (const timing of ["no combat", "unstarted", "unrelated scene", "not a combatant"]) {
    test(`Command Mob uses a six-world-second fallback with ${timing}`, async t => {
      const env = setup(t);
      const thrall = env.ownThrall();
      if (timing === "no combat") env.game.combat = null;
      if (timing === "unstarted") env.combat.started = false;
      if (timing === "unrelated scene") env.combat.scene = { id: "other-scene" };
      if (timing === "not a combatant") env.combat.combatants.clear();
      env.state.choice = { thrallUuid: thrall.document.uuid, support: "tempHP" };
      assert.equal(await env.api.commandMob(), true);
      const source = env.calls.itemCreates.find(entry => entry.actor === env.selected.actor).sources[0];
      assert.deepEqual(source.system.duration, { value: 1, unit: "rounds", expiry: "turn-start", sustained: false });
      assert.equal(source.system.start.initiative, null);
      assert.equal(source.flags[MODULE].commandMobSource.combatUuid, null);
      assert.equal(source.flags[MODULE].commandMobSource.expiresAt, 106);
      const unrelated = await env.selected.actor.createEmbeddedDocuments("Item", [packEffect("guard")]);
      await env.api.ready();
      env.game.time.worldTime = 105;
      await env.emit("updateWorldTime", 105);
      assert.equal(env.selected.actor.system.attributes.hp.temp, 10);
      env.game.time.worldTime = 106;
      await env.emit("updateWorldTime", 106);
      await env.api.ready();
      assert.equal(env.selected.actor.system.attributes.hp.temp, 0);
      assert.deepEqual(env.selected.actor.items.contents.map(item => item.id), [unrelated[0].id]);
    });
  }

  test("repeated Bolster refreshes its own HP without stacking effects or clearing a higher unrelated pool", async t => {
    const env = setup(t);
    const thrall = env.ownThrall();
    env.state.choice = { thrallUuid: thrall.document.uuid, support: "tempHP" };
    assert.equal(await env.api.commandMob(), true);
    const firstSource = env.selected.actor.system.attributes.hp.tempSource;
    env.selected.actor.system.attributes.hp.temp = 4;
    assert.equal(await env.api.commandMob(), true);
    assert.equal(env.selected.actor.items.size, 1);
    assert.equal(env.selected.actor.system.attributes.hp.temp, 10);
    assert.notEqual(env.selected.actor.system.attributes.hp.tempSource, firstSource);
    env.selected.actor.system.attributes.hp.temp = 20;
    env.selected.actor.system.attributes.hp.tempSource = "unrelated-higher-source";
    assert.equal(await env.api.commandMob(), true);
    assert.equal(env.selected.actor.items.size, 1);
    assert.equal(env.selected.actor.system.attributes.hp.temp, 20);
    assert.equal(env.selected.actor.system.attributes.hp.tempSource, "unrelated-higher-source");
    await env.api.ready();
    env.combat.round = 2;
    await env.emit("combatTurnChange", env.combat, {}, {});
    await env.api.ready();
    assert.equal(env.selected.actor.items.size, 0);
    assert.equal(env.selected.actor.system.attributes.hp.temp, 20);
    assert.equal(env.selected.actor.system.attributes.hp.tempSource, "unrelated-higher-source");
  });

  test("native aura signature targets only the summoner, never another Blaster, player, or thrall", async t => {
    const env = setup(t);
    const thrall = env.ownThrall();
    const otherBlaster = env.token({ actor: env.actor({ id: "blaster2" }) });
    const player = env.token({ actor: env.actor({ role: "player" }) });
    const otherThrall = env.ownThrall();
    env.state.choice = { thrallUuid: thrall.document.uuid, support: "guard" };
    assert.equal(await env.api.commandMob(), true);
    assert.equal(env.selected.actor.items.some(item => item.sourceId === effectUuid("guard")), true);
    for (const token of [otherBlaster, player, thrall, otherThrall]) {
      assert.equal(token.actor.items.some(item => item.sourceId === effectUuid("guard")), false);
    }
  });

  for (const support of ["inspire", "guard"]) {
    test(`${support} removes on native exit and re-enters without extending the command`, async t => {
      const env = setup(t);
      const thrall = env.ownThrall();
      env.state.choice = { thrallUuid: thrall.document.uuid, support };
      await env.api.commandMob();
      const first = env.selected.actor.items.contents[0];
      const timing = clone(first.flags[MODULE].commandMobSource);
      thrall.distance = 65;
      await env.applyAuras();
      assert.equal(env.selected.actor.items.size, 0);
      env.game.time.worldTime += 2;
      thrall.distance = 60;
      await env.applyAuras();
      const second = env.selected.actor.items.contents[0];
      assert.notEqual(first.id, second.id);
      assert.deepEqual(second.flags[MODULE].commandMobSource, timing);
      assert.equal(second.system.start.value, 100);
    });
  }

  test("Bolster retains its pool on exit and never refills on re-entry", async t => {
    const env = setup(t);
    const thrall = env.ownThrall();
    env.state.choice = { thrallUuid: thrall.document.uuid, support: "tempHP" };
    await env.api.commandMob();
    const granted = env.selected.actor.system.attributes.hp.tempSource;
    env.selected.actor.system.attributes.hp.temp = 3;
    thrall.distance = 70;
    await env.applyAuras();
    assert.equal(env.selected.actor.system.attributes.hp.temp, 3);
    thrall.distance = 20;
    await env.applyAuras();
    assert.equal(env.selected.actor.system.attributes.hp.temp, 3);
    assert.equal(env.selected.actor.system.attributes.hp.tempSource, granted);
    assert.equal(env.selected.actor.items.size, 1);
  });

  for (const removal of ["aura", "thrall token", "owner token", "zero HP", "owner link", "expired", "ended combat"]) {
    test(`retained Bolster cleans up after ${removal}, without waiting for native exit`, async t => {
      const env = setup(t);
      const thrall = env.ownThrall();
      env.state.choice = { thrallUuid: thrall.document.uuid, support: "tempHP" };
      await env.api.commandMob();
      const emitter = thrall.actor.items.find(item => item.getFlag(MODULE, "blasterAura"));
      if (removal === "aura") await emitter.delete();
      if (removal === "thrall token") await thrall.document.delete();
      if (removal === "owner token") await env.selected.document.delete();
      if (removal === "zero HP") {
        thrall.actor.system.attributes.hp.value = 0;
        await env.emit("updateActor", thrall.actor, { "system.attributes.hp.value": 0 });
      }
      if (removal === "owner link") {
        thrall.actor.flags[HELPER].summoner.uuid = "Actor.foreign";
        await env.emit("updateActor", thrall.actor, { flags: thrall.actor.flags });
      }
      if (removal === "expired") {
        emitter.system.expired = true;
        await env.emit("updateItem", emitter, {});
      }
      if (removal === "ended combat") {
        env.combat.started = false;
        await env.emit("deleteCombat", env.combat);
      }
      await env.api.ready();
      assert.equal(env.selected.actor.items.size, 0);
      assert.equal(env.selected.actor.system.attributes.hp.temp, 0);
    });
  }

  test("manual aura drop stamps the owner's turn and applies only its linked benefit", async t => {
    const env = setup(t);
    const thrall = env.ownThrall();
    env.combat.combatant = { token: { uuid: "Scene.scene1.Token.other" }, initiative: 40 };
    await env.api.ready();
    const [emitter] = await thrall.actor.createEmbeddedDocuments("Item", [packEffect("auraGuard")]);
    assert.equal(emitter.system.context.origin.actor, env.selected.actor.uuid);
    assert.equal(emitter.system.start.initiative, 30);
    assert.equal(emitter.flags[MODULE].commandMobSource.ownerTokenUuid, env.selected.document.uuid);
    assert.equal(env.selected.actor.items.size, 1);
    env.combat.turn = 1;
    env.combat.combatant = env.combat.turns[0];
    await env.emit("combatTurnChange", env.combat, {}, {});
    await env.api.ready();
    assert.equal(env.selected.actor.items.size, 0);
    assert.equal(thrall.actor.items.some(item => item.getFlag(MODULE, "blasterAura")), false);
  });

  test("manual aura drops reject wrong actors, broken owner signatures, and dead thralls", async t => {
    const env = setup(t);
    const dead = env.ownThrall({ hp: 0 });
    const broken = env.ownThrall();
    delete broken.actor.flags[HELPER].summoner.signature;
    const unlinked = env.token({ actor: env.actor({ role: "hype-thrall" }) });
    const player = env.actor({ role: "player" });
    await env.api.ready();
    for (const actor of [env.selected.actor, player, dead.actor, broken.actor, unlinked.actor]) {
      assert.deepEqual(await actor.createEmbeddedDocuments("Item", [packEffect("auraInspire")]), []);
    }
    assert.equal(env.calls.itemCreates.length, 0);
  });

  test("late native entry from a removed emitter cannot grant a dangling effect", async t => {
    const env = setup(t);
    const thrall = env.ownThrall();
    env.state.choice = { thrallUuid: thrall.document.uuid, support: "tempHP" };
    await env.api.commandMob();
    const late = env.selected.actor.items.contents[0].toObject();
    delete late.flags[MODULE]; // Native entry has only pf2e.aura until preCreateItem.
    await thrall.actor.items.find(item => item.getFlag(MODULE, "blasterAura")).delete();
    await env.api.ready();
    assert.deepEqual(await env.selected.actor.createEmbeddedDocuments("Item", [late]), []);
    assert.equal(env.selected.actor.system.attributes.hp.temp, 0);
  });

  test("late native entry after world-time expiry is rejected before the cleanup hook runs", async t => {
    const env = setup(t);
    env.game.combat = null;
    const thrall = env.ownThrall();
    env.state.choice = { thrallUuid: thrall.document.uuid, support: "tempHP" };
    await env.api.commandMob();
    await env.api.ready();
    const late = env.selected.actor.items.contents[0].toObject();
    delete late.flags[MODULE];
    env.game.time.worldTime = 106;
    assert.deepEqual(await env.selected.actor.createEmbeddedDocuments("Item", [late]), []);
    assert.equal(env.calls.itemCreates.filter(entry => entry.actor === env.selected.actor).length, 1);
  });

  test("only the primary GM cleans retained benefits and a handover reconciles them", async t => {
    const env = setup(t);
    const thrall = env.ownThrall();
    env.state.choice = { thrallUuid: thrall.document.uuid, support: "tempHP" };
    await env.api.commandMob();
    await env.api.ready();
    env.game.users.activeGM.id = "anotherGM";
    thrall.actor.system.attributes.hp.value = 0;
    await env.emit("updateActor", thrall.actor, {});
    await env.api.ready();
    assert.equal(env.selected.actor.items.size, 1);
    env.game.users.activeGM.id = env.game.user.id;
    await env.emit("userConnected", { id: "anotherGM" }, false);
    await env.api.ready();
    assert.equal(env.selected.actor.items.size, 0);
    assert.equal(env.selected.actor.system.attributes.hp.temp, 0);
  });

  test("same support on a different thrall replaces only this owner's emitter and recipient", async t => {
    const env = setup(t);
    const first = env.ownThrall();
    const second = env.ownThrall();
    const other = env.token({ actor: env.actor({ id: "secondBlaster" }) });
    const foreign = env.ownThrall({ owner: other });
    await env.api.ready();
    const [foreignEmitter] = await foreign.actor.createEmbeddedDocuments("Item", [packEffect("auraBolster")]);
    env.state.choice = { thrallUuid: first.document.uuid, support: "tempHP" };
    await env.api.commandMob();
    env.selected.actor.system.attributes.hp.temp = 2;
    env.state.choice.thrallUuid = second.document.uuid;
    await env.api.commandMob();
    await env.api.ready();
    assert.equal(first.actor.items.some(item => item.getFlag(MODULE, "blasterAura")), false);
    assert.equal(second.actor.items.some(item => item.getFlag(MODULE, "blasterAura")), true);
    assert.equal(foreign.actor.items.has(foreignEmitter.id), true);
    assert.equal(other.actor.system.attributes.hp.temp, 10);
    assert.equal(env.selected.actor.system.attributes.hp.temp, 10);
    assert.equal(env.selected.actor.items.size, 1);
  });

  for (const action of ["flashMob", "commandMob"]) {
    for (const change of ["scene", "actor ownership", "GM"]) {
      test(`${action} still rejects ${change} changes while its dialog is open`, async t => {
        const env = setup(t);
        const thrall = env.ownThrall();
        env.state.dialogBehavior = async () => {
          if (change === "scene") env.canvas.scene = { id: "elsewhere", tokens: new Collection() };
          if (change === "actor ownership") env.selected.actor.isOwner = false;
          if (change === "GM") env.game.user.isGM = false;
          return action === "flashMob" ? "hype-fan" : { thrallUuid: thrall.document.uuid, support: "guard" };
        };
        assert.equal(await env.api[action](), false);
        assert.equal(env.calls.helper.length, 0);
        assert.equal(env.calls.itemCreates.length, 0);
      });
    }
  }

  test("recovered placement counts toward the cap and receives timed cleanup", async t => {
    const env = setup(t);
    env.ownThrall(); env.ownThrall();
    let recovered;
    env.state.helperBehavior = async payload => {
      const details = payload.summonDetailsGroup[0];
      const partial = env.actor({ role: "hype-thrall", hp: 20 });
      mergeObject(partial, details.modifications);
      delete partial.flags[HELPER];
      recovered = env.token({ actor: partial, flags: details.tokenModifications.flags });
      await env.emit("createToken", recovered.document, {}, env.game.user.id);
      throw new Error("Placed before helper owner linkage");
    };
    assert.equal(await env.api.flashMob(), true);
    assert.equal(await env.api.flashMob(), false);
    assert.equal(env.calls.helper.length, 1);
    assert.match(env.calls.warnings.at(-1), /three live/);
    await env.api.ready();
    env.game.time.worldTime += 60;
    await env.emit("updateWorldTime", env.game.time.worldTime);
    await env.api.ready();
    assert.equal(env.scene.tokens.has(recovered.id), false);
    assert.equal(env.scene.tokens.has(env.selected.id), true);
  });
});
