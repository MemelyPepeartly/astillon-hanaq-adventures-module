import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { readFileSync, readdirSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createBlasterResolution } from "../dist/scripts/features/blaster-resolution.js";

const MODULE = "astillon-hanaq-adventures-module";
const ACTOR_UUID = `Compendium.${MODULE}.astillon-blaster-actors.Actor.BlasterActor0001`;
const actorSource = JSON.parse(readFileSync(new URL("../src/packs/astillon-blaster-actors.db/Blaster.json", import.meta.url), "utf8"));
const effectDirectory = new URL("../src/packs/astillon-blaster-items.db/", import.meta.url);
const effectSources = readdirSync(effectDirectory).filter(file => file.endsWith(".json"))
  .map(file => JSON.parse(readFileSync(new URL(file, effectDirectory), "utf8")))
  .filter(source => source.flags?.[MODULE]?.blasterBlastEffect);
const copy = value => value === undefined ? undefined : structuredClone(value);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const getPath = (value, path) => path.split(".").reduce((next, key) => next?.[key], value);

class ForcedReplacement {
  constructor(value) { Object.assign(this, copy(value)); }
  static create(value) { return new ForcedReplacement(value); }
}

function merge(target, updates) {
  for (const [path, value] of Object.entries(updates)) {
    const parts = path.split(".");
    const key = parts.pop();
    let parent = target;
    for (const part of parts) parent = parent[part] ??= {};
    if (key.startsWith("-=")) delete parent[key.slice(2)];
    else if (value instanceof ForcedReplacement) parent[key] = copy(value);
    else if (object(value)) merge(parent[key] = object(parent[key]) ? parent[key] : {}, value);
    else parent[key] = copy(value);
  }
  return target;
}

class Collection extends Map {
  get contents() { return [...this.values()]; }
  [Symbol.iterator]() { return this.values(); }
  find(predicate) { return this.contents.find(predicate); }
  filter(predicate) { return this.contents.filter(predicate); }
  map(callback) { return this.contents.map(callback); }
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function setup(t) {
  const dom = new JSDOM("<!doctype html><body></body>");
  t.after(() => dom.window.close());
  const writes = [], messages = [], prompts = [], confirmations = [], errors = [], warnings = [], enrichments = [], loads = [];
  const flags = {}, tokens = new Collection(), messageDocuments = new Collection();
  let sequence = 0, selected, choice = { mode: "slowing", outcome: "failure" }, confirmation = true;
  const nextID = () => String(++sequence).padStart(16, "0");
  function makeItem(source, actor = null) {
    const data = copy(source);
    const item = {
      id: data._id, uuid: actor ? `${actor.uuid}.Item.${data._id}` : `Compendium.${MODULE}.astillon-blaster-items.Item.${data._id}`,
      actor, _source: data,
      get name() { return data.name; }, get type() { return data.type; }, get slug() { return data.system?.slug; },
      get system() { return data.system; }, get flags() { return data.flags ?? {}; },
      toObject: () => copy(data), getFlag: (scope, key) => copy(getPath(data.flags?.[scope], key)),
      getRollData: () => ({ fromItem: data._id, actorId: actor?.id }),
      getOriginData: () => ({ actor: actor?.uuid, uuid: item.uuid, type: data.type }),
      async update(updates) { writes.push({ kind: "itemUpdate", actorId: actor?.id, id: item.id, updates: copy(updates) }); merge(data, updates); return item; },
    };
    return item;
  }
  function makeActor(id, source = { name: id, type: "npc", system: { details: { level: { value: 18 } }, attributes: { hp: { value: 100, max: 100, temp: 0 } } }, flags: {}, items: [] }) {
    const data = copy(source);
    data._id = id;
    const actor = {
      id, uuid: `Actor.${id}`, isOwner: true, _source: data, items: new Collection(),
      get name() { return data.name; }, get type() { return data.type; }, get system() { return data.system; },
      get flags() { return data.flags ?? {}; }, get img() { return data.img; },
      get level() { return data.system.details?.level?.value; },
      get itemTypes() { return Object.groupBy(actor.items.contents, item => item.type); },
      toObject: () => ({ ...copy(data), items: actor.items.map(item => item.toObject()) }),
      getFlag: (scope, key) => copy(getPath(data.flags?.[scope], key)), getRollData: () => ({ fromActor: id }),
      async setFlag(scope, key, value) { writes.push({ kind: "actorFlag", actorId: id, key, value: copy(value) }); merge(data, { [`flags.${scope}.${key}`]: value }); return actor; },
      async update(updates) { writes.push({ kind: "actorUpdate", actorId: id, updates: copy(updates) }); merge(data, updates); return actor; },
      async createEmbeddedDocuments(type, sources, options = {}) {
        assert.equal(type, "Item");
        writes.push({ kind: "itemCreate", actorId: id, sources: copy(sources), options: copy(options) });
        return sources.map(source => {
          const item = makeItem({ ...copy(source), _id: options.keepId && source._id ? source._id : nextID() }, actor);
          assert.equal(actor.items.has(item.id), false, "Embedded item ID must not replace an existing item");
          actor.items.set(item.id, item);
          return item;
        });
      },
      async updateEmbeddedDocuments(type, updates) {
        assert.equal(type, "Item");
        return Promise.all(updates.map(update => {
          const item = actor.items.get(update._id);
          assert.ok(item, `Item ${update._id} exists before updating`);
          return item.update(update);
        }));
      },
      async deleteEmbeddedDocuments(type, ids) {
        assert.equal(type, "Item");
        writes.push({ kind: "itemDelete", actorId: id, ids: [...ids] });
        const deleted = ids.map(itemId => actor.items.get(itemId));
        for (const itemId of ids) actor.items.delete(itemId);
        return deleted;
      },
    };
    for (const source of data.items ?? []) actor.items.set(source._id, makeItem(source, actor));
    return actor;
  }
  const scene = {
    id: "scene", uuid: "Scene.scene", tokens, regions: new Collection(),
    getFlag: (scope, key) => copy(getPath(flags[scope], key)),
    async setFlag(scope, key, value) { writes.push({ kind: "sceneFlag", key, value: copy(value) }); merge(flags[scope] ??= {}, { [key]: value }); return scene; },
    async unsetFlag(scope, key) { merge(flags[scope] ??= {}, { [`-=${key}`]: null }); return scene; },
    async update(updates) { writes.push({ kind: "sceneUpdate", updates: copy(updates) }); merge({ flags }, updates); return scene; },
  };
  function addToken(id, actor = makeActor(id)) {
    const document = { id, uuid: `Scene.scene.Token.${id}`, name: actor.name, parent: scene, actor, isOwner: true, x: 0, y: 0 };
    const token = { id, name: actor.name, actor, document };
    document.object = token;
    tokens.set(id, document);
    return token;
  }
  selected = addToken("blaster", makeActor("blaster", actorSource));
  const foe = addToken("foe");
  const sourceActor = makeActor("BlasterActor0001", actorSource);
  sourceActor.uuid = ACTOR_UUID;
  const sources = new Map([[ACTOR_UUID, sourceActor], ...effectSources.map(source => {
    const item = makeItem(source); return [item.uuid, item];
  })]);
  const globals = {
    document: dom.window.document, window: dom.window,
    ui: { notifications: { error: text => errors.push(text), warn: text => warnings.push(text), info() {} } },
    game: {
      user: { id: "gm", isGM: true, targets: new Set([foe]) }, users: { activeGM: { id: "gm", isGM: true } },
      system: { id: "pf2e", version: "8.7.1" }, release: { generation: 14 },
      scenes: new Collection([[scene.id, scene]]), messages: messageDocuments, time: { worldTime: 100 },
      combat: { id: "combat", round: 2, turn: 0, started: true, scene, combatant: { tokenId: selected.id, initiative: 25 }, turns: [{ tokenId: selected.id, initiative: 25 }] },
      pf2e: { TextEditor: { async enrichHTML(content, options) { enrichments.push({ content, options }); return content; } } },
    },
    canvas: { ready: true, scene, tokens: { controlled: [selected] } },
    foundry: {
      data: { operators: { ForcedReplacement } },
      utils: { randomID: nextID, deepClone: copy, duplicate: copy, getProperty: getPath, escapeHTML: value => String(value),
        async fromUuid(uuid) { loads.push(uuid); return sources.get(uuid) ?? null; } },
      applications: { api: { DialogV2: {
        async prompt(options) { prompts.push(options); return copy(choice); },
        async confirm(options) { confirmations.push(options); return confirmation; },
        async wait(options) { prompts.push(options); return copy(choice); },
      } } },
      documents: { ChatMessage: {
        getSpeaker: ({ actor, token } = {}) => ({ actor: actor?.id ?? token?.actor?.id, token: token?.id }),
        implementation: { async create(source, options) {
          const message = { ...copy(source), id: source._id ?? nextID() };
          writes.push({ kind: "chatCreate", source: copy(source), options: copy(options) });
          messages.push(message); messageDocuments.set(message.id, message); return message;
        } },
      } },
    },
  };
  const original = Object.fromEntries(Object.keys(globals).map(key => [key, globalThis[key]]));
  Object.assign(globalThis, globals);
  t.mock.method(console, "error", () => {});
  t.after(() => { for (const key of Object.keys(globals)) { if (original[key] === undefined) delete globalThis[key]; else globalThis[key] = original[key]; } });
  const makeFeature = () => createBlasterResolution(MODULE, { selectToken: () => selected });
  return {
    feature: makeFeature(), makeFeature, scene, flags, foe, sourceActor, sources, writes, messages, messageDocuments, prompts, confirmations, errors, warnings, enrichments, loads, globals, addToken, makeActor, makeItem,
    get token() { return selected; }, get actor() { return selected.actor; },
    select(token) { selected = token; globals.canvas.tokens.controlled = [token]; },
    choose(value) { choice = value; }, confirm(value) { confirmation = value; },
    clash(overrides = {}) {
      flags[MODULE] ??= {};
      flags[MODULE].beamClash = { version: 1, id: "clash-1", sceneId: scene.id, redTokenId: "blaster", blueTokenId: "foe", redFile: "red.webm", blueFile: "blue.webm", status: "finished", round: 3, score: 3, revision: 6, red: null, blue: null, lastRound: null, winner: "red", processed: [], ...overrides };
      return flags[MODULE].beamClash;
    },
  };
}

const RIDERS = {
  dazzling: { failure: "BlasterDazzle001", criticalFailure: "BlasterDazzle001" },
  humiliation: { failure: "BlasterStupor001", criticalFailure: "BlasterStupor001" },
  slowing: { success: "BlasterSlow00001", failure: "BlasterSlow00002", criticalFailure: "BlasterSlow00003" },
  hypnotic: { success: "BlasterFascin001", failure: "BlasterControl01", criticalFailure: "BlasterControl02" },
};

for (const [mode, outcomes] of Object.entries(RIDERS)) {
  for (const outcome of ["criticalSuccess", "success", "failure", "criticalFailure"]) {
    test(`applyEffect resolves the final ${mode} ${outcome} degree with native origin and duration`, async t => {
      const env = setup(t);
      env.choose({ mode, outcome });
      env.foe.actor.system.details.level.value = 30;
      const effectId = outcomes[outcome];
      const uuid = effectId && `Compendium.${MODULE}.astillon-blaster-items.Item.${effectId}`;
      const original = uuid && env.sources.get(uuid)?.toObject();
      if (effectId) assert.ok(original, `${effectId} must exist in the shipped pack`);
      const result = await env.feature.applyEffect();
      assert.deepEqual(env.errors, []);
      const writes = env.writes.filter(write => write.kind === "itemCreate");
      assert.equal(writes.length, effectId ? 1 : 0);
      if (!effectId) return;
      assert.equal(result.applied, 1);
      assert.equal(result.mode, mode);
      assert.equal(result.outcome, outcome, "The selected degree already includes incapacitation and must not be adjusted again");
      assert.ok(env.loads.includes(uuid));
      const effect = writes[0].sources[0];
      assert.equal(effect._id, undefined, "Compendium IDs must not be reused on target actors");
      assert.deepEqual(effect.system.rules, original.system.rules);
      assert.deepEqual(effect.system.duration, original.system.duration);
      assert.deepEqual(effect.system.duration, mode === "hypnotic" && outcome === "criticalFailure"
        ? { value: -1, unit: "unlimited", expiry: null, sustained: false }
        : { value: 1, unit: "rounds", expiry: "turn-start", sustained: false });
      assert.equal(effect.system.context.origin.actor, env.actor.uuid);
      assert.equal(effect.system.context.origin.token, env.token.document.uuid);
      assert.equal(effect.system.context.origin.item, null);
      assert.equal(effect.system.start.value, env.globals.game.time.worldTime);
      assert.equal(effect.system.start.initiative, 25);
      assert.deepEqual(env.sources.get(uuid).toObject(), original, "Origin and start must be stamped on a clone");
      assert.equal(env.foe.actor.system.attributes.hp.value, 100);
      assert.equal(env.messages.length, 0);
    });
  }
}

test("applyEffect deduplicates by actor UUID while preserving distinct synthetic actors sharing an ID", async t => {
  const env = setup(t);
  const shared = env.addToken("shared", env.foe.actor);
  const synthetic = env.addToken("synthetic", env.makeActor(env.foe.actor.id));
  synthetic.actor.uuid = `${synthetic.document.uuid}.Actor.${synthetic.actor.id}`;
  env.globals.game.user.targets = new Set([env.foe, shared, synthetic]);
  const result = await env.feature.applyEffect();
  assert.deepEqual(env.errors, []);
  assert.equal(result.applied, 2);
  assert.equal(env.foe.actor.items.size, 1);
  assert.equal(synthetic.actor.items.size, 1);
  assert.equal(env.writes.filter(write => write.kind === "itemCreate").length, 2);
});

const INVALIDATIONS = [
  ["GM authority", env => { env.globals.game.user.isGM = false; }],
  ["active GM", env => { env.globals.game.users.activeGM.id = "other-gm"; }],
  ["viewed scene", env => { env.globals.canvas.scene = { ...env.scene }; }],
  ["registered scene", env => { env.globals.game.scenes.set(env.scene.id, { ...env.scene }); }],
  ["source selection", env => { env.select(env.addToken("other-blaster", env.makeActor("other-blaster", actorSource))); }],
  ["source token identity", env => { env.scene.tokens.set(env.token.id, { ...env.token.document }); }],
  ["source actor identity", env => { const replacement = env.makeActor(env.actor.id, actorSource); env.token.actor = replacement; env.token.document.actor = replacement; }],
  ["target ownership", env => { env.foe.actor.isOwner = false; }],
  ["target token ownership", env => { env.foe.document.isOwner = false; }],
  ["target deletion", env => { env.scene.tokens.delete(env.foe.id); }],
  ["target actor identity", env => { const replacement = env.makeActor(env.foe.actor.id); env.foe.actor = replacement; env.foe.document.actor = replacement; }],
  ["target selection", env => { env.globals.game.user.targets = new Set(); }],
];

for (const [label, invalidate] of INVALIDATIONS) {
  for (const phase of ["dialog", "effect load"]) {
    test(`applyEffect revalidates ${label} after ${phase} before writing`, async t => {
      const env = setup(t);
      const gate = deferred();
      if (phase === "dialog") t.mock.method(foundry.applications.api.DialogV2, "prompt", () => gate.promise);
      else {
        const load = foundry.utils.fromUuid;
        t.mock.method(foundry.utils, "fromUuid", async uuid => { const document = await load(uuid); await gate.promise; return document; });
      }
      const pending = env.feature.applyEffect();
      await setImmediate();
      invalidate(env);
      gate.resolve({ mode: "slowing", outcome: "failure" });
      assert.equal(await pending, false);
      assert.equal(env.writes.length, 0);
      assert.equal(env.messages.length, 0);
    });
  }
}

for (const method of ["applyEffect", "counterblast", "upgradeSheet"]) {
  for (const cancelled of [null, "cancel"]) {
    test(`${method} cancellation ${String(cancelled)} causes no writes`, async t => {
      const env = setup(t);
      env.clash();
      env.choose(cancelled);
      const result = await env.feature[method]();
      assert.equal(result, false);
      assert.equal(env.writes.length, 0);
      assert.equal(env.messages.length, 0);
      if (cancelled === null) assert.deepEqual(env.errors, []);
    });
  }
}

for (const [mode, formula, damage, traits, effectId] of [
  ["fire", "14d8", "fire", "magical,fire", null],
  ["cold", "14d8", "cold", "magical,cold", null],
  ["electricity", "14d8", "electricity", "magical,electricity", null],
  ["sonic", "14d8", "sonic", "magical,sonic", null],
  ["dazzling", "11d8", "fire", "magical,fire,light", "BlasterDazzle001"],
  ["humiliation", "11d8", "mental", "magical,mental", "BlasterStupor001"],
  ["slowing", "11d8", "cold", "magical,cold", "BlasterSlow00002"],
  ["hypnotic", "11d8", "mental", "magical,mental,visual,incapacitation", "BlasterControl01"],
]) {
  test(`Counterblast publishes ${formula} ${mode} once and links its failure rider without a new save`, async t => {
    const env = setup(t);
    env.clash();
    env.choose(mode);
    const result = await env.feature.counterblast();
    assert.deepEqual(env.errors, []);
    assert.equal(result.ok, true);
    assert.equal(env.messages.length, 1);
    const card = env.messages[0].content;
    assert.ok(card.includes(`@Damage[${formula}[${damage}]|traits:${traits}`));
    assert.doesNotMatch(card, /@Check\[|@Attack\[/);
    assert.equal(env.foe.actor.system.attributes.hp.value, 100);
    const created = env.writes.filter(write => write.kind === "itemCreate");
    assert.equal(created.length, 0, "Riders are explicitly applied after damage with Apply Blast Effect");
    const metadata = env.messages[0].flags[MODULE].counterblast;
    assert.equal(metadata.outcome, "failure");
    if (effectId) {
      const uuid = `Compendium.${MODULE}.astillon-blaster-items.Item.${effectId}`;
      assert.ok(env.sources.has(uuid), "Rider must resolve to an actual shipped effect");
      assert.ok(card.includes(`@UUID[${uuid}]`));
      assert.equal(metadata.riderUuid, uuid);
      assert.match(card, /Failure rider/);
    } else assert.equal(metadata.riderUuid, null);
    const claimIndex = env.writes.findIndex(write => write.kind === "sceneFlag" && write.key === "beamClashCounter");
    const publicationIndex = env.writes.findIndex(write => ["chatCreate", "itemCreate"].includes(write.kind));
    assert.ok(claimIndex >= 0 && claimIndex < publicationIndex, "The durable claim must precede every external side effect");
    const writeCount = env.writes.length;
    await env.feature.counterblast();
    await env.makeFeature().counterblast();
    assert.equal(env.writes.length, writeCount, "A new feature instance must still observe the durable claim");
    assert.equal(env.messages.length, 1);
  });
}

for (const [level, effectId] of [[17, "BlasterControl01"], [18, "BlasterControl01"], [19, "BlasterFascin001"]]) {
  test(`Hypno-Beam Counterblast uses correct incapacitation rider against level ${level}`, async t => {
    const env = setup(t);
    env.actor.system.details.level.value = 18;
    env.foe.actor.system.details.level.value = level;
    env.clash();
    env.choose("hypnotic");
    assert.equal((await env.feature.counterblast()).ok, true);
    const metadata = env.messages[0].flags[MODULE].counterblast;
    assert.equal(metadata.riderUuid, `Compendium.${MODULE}.astillon-blaster-items.Item.${effectId}`);
    assert.equal(metadata.outcome, level > 18 ? "success" : "failure");
    if (level > 18) assert.match(env.messages[0].content, /already included; do not adjust again/);
    assert.equal(env.foe.actor.items.size, 0);
    assert.match(env.messages[0].content, /11d8\[mental\]/);
    assert.deepEqual(env.errors, []);
  });
}

for (const [label, overrides] of [
  ["active clash", { status: "active", score: 2, winner: null }],
  ["stopped clash", { status: "stopped", winner: null }],
  ["blue winner", { winner: "blue", score: -3 }],
  ["inconsistent winner", { winner: "red", score: -3 }],
  ["wrong scene", { sceneId: "another-scene" }],
  ["missing foe", { blueTokenId: "missing" }],
]) {
  test(`Counterblast rejects ${label} without publishing or claiming`, async t => {
    const env = setup(t);
    env.clash(overrides);
    env.choose("fire");
    assert.equal(await env.feature.counterblast(), false);
    assert.equal(env.writes.length, 0);
  });
}

test("Counterblast serializes concurrent requests before any claim or publication", async t => {
  const env = setup(t);
  env.clash();
  const gate = deferred();
  t.mock.method(foundry.applications.api.DialogV2, "prompt", () => gate.promise);
  const first = env.feature.counterblast();
  await setImmediate();
  const second = env.feature.counterblast();
  gate.resolve("fire");
  await Promise.all([first, second]);
  assert.equal(env.messages.length, 1);
});

test("overlapping resolution instances cannot overwrite claims and publish two Counterblasts", async t => {
  const env = setup(t);
  env.clash(); env.choose("fire");
  const save = env.scene.setFlag;
  const claims = [];
  t.mock.method(env.scene, "setFlag", async (...args) => {
    if (args[2].status === "publishing") {
      const gate = deferred(); claims.push(gate); await gate.promise;
    }
    return save(...args);
  });
  const chatGate = deferred();
  const create = foundry.documents.ChatMessage.implementation.create;
  t.mock.method(foundry.documents.ChatMessage.implementation, "create", async (...args) => {
    const message = await create(...args); await chatGate.promise; return message;
  });
  const first = env.feature.counterblast();
  const second = env.makeFeature().counterblast();
  await setImmediate();
  assert.ok(claims.length >= 1);
  claims[0].resolve();
  await setImmediate();
  // A broken per-instance guard lets B replace A's claim while A's chat write
  // is pending. A shared guard may reject B or queue it until A completes.
  claims[1]?.resolve();
  await setImmediate();
  chatGate.resolve();
  await Promise.all([first, second]);
  assert.equal(env.messages.length, 1);
});

for (const cancelled of [null, "cancel"]) {
  test(`Counterblast shares its dialog latch across instances and releases it after ${String(cancelled)}`, async t => {
    const env = setup(t);
    env.clash();
    const gate = deferred();
    let promptCount = 0;
    const prompt = t.mock.method(foundry.applications.api.DialogV2, "prompt", () => { promptCount++; return gate.promise; });
    const first = env.feature.counterblast();
    await setImmediate();
    assert.equal(await env.makeFeature().counterblast(), false);
    assert.equal(promptCount, 1, "The shared latch must be held before opening any second dialog");
    assert.equal(env.writes.length, 0);
    gate.resolve(cancelled);
    assert.equal(await first, false);
    assert.equal(env.writes.length, 0, "Cancellation must not create a durable claim");
    prompt.mock.restore();
    env.choose("fire");
    assert.equal((await env.makeFeature().counterblast()).ok, true, "Cancellation releases the shared latch for a fresh instance");
    assert.equal(env.messages.length, 1);
  });
}

for (const status of ["publishing", "posted", "failed", "unknown"]) {
  test(`any existing ${status} Counterblast marker blocks the same clash`, async t => {
    const env = setup(t);
    env.clash(); env.choose("fire");
    env.flags[MODULE].beamClashCounter = { clashId: "clash-1", status };
    assert.equal(await env.feature.counterblast(), false);
    assert.equal(env.writes.length, 0);
  });
}

for (const persisted of [false, true]) {
  test(`Counterblast failed claim ${persisted ? "after" : "before"} persistence preserves safe retry semantics`, async t => {
    const env = setup(t);
    env.clash(); env.choose("fire");
    const save = env.scene.setFlag;
    const mock = t.mock.method(env.scene, "setFlag", async (...args) => {
      if (persisted) await save(...args);
      throw new Error("claim acknowledgement failed");
    });
    assert.equal(await env.feature.counterblast(), false);
    assert.equal(env.messages.length, 0);
    mock.mock.restore();
    await env.makeFeature().counterblast();
    assert.equal(env.messages.length, persisted ? 0 : 1);
  });
}

for (const outcome of ["rejected", "stored then rejected", "undefined"]) {
  test(`Counterblast ${outcome} chat publication is never retried after reconnect`, async t => {
    const env = setup(t);
    env.clash(); env.choose("fire");
    const create = foundry.documents.ChatMessage.implementation.create;
    let attempts = 0;
    const mock = t.mock.method(foundry.documents.ChatMessage.implementation, "create", async (...args) => {
      attempts++;
      if (outcome === "stored then rejected") await create(...args);
      if (outcome === "undefined") return undefined;
      throw new Error("uncertain chat publication");
    });
    await env.feature.counterblast();
    await env.feature.counterblast();
    await env.makeFeature().counterblast();
    assert.equal(attempts, 1);
    mock.mock.restore();
    await env.makeFeature().counterblast();
    assert.equal(env.messages.length, outcome === "stored then rejected" ? 1 : 0);
  });
}

const CLASH_INVALIDATIONS = [
  ["GM authority", env => { env.globals.game.user.isGM = false; }],
  ["active GM", env => { env.globals.game.users.activeGM.id = "another-gm"; }],
  ["viewed scene", env => { env.globals.canvas.scene = { ...env.scene }; }],
  ["registered scene", env => { env.globals.game.scenes.set(env.scene.id, { ...env.scene }); }],
  ["source token", env => { env.scene.tokens.set(env.token.id, { ...env.token.document }); }],
  ["target token", env => { env.scene.tokens.set(env.foe.id, { ...env.foe.document }); }],
  ["target actor", env => { env.foe.document.actor = env.makeActor(env.foe.actor.id); }],
  ["target ownership", env => { env.foe.actor.isOwner = false; }],
  ["clash result", env => { env.flags[MODULE].beamClash.status = "stopped"; }],
  ["clash revision", env => { env.flags[MODULE].beamClash.revision++; }],
];

for (const [label, invalidate] of CLASH_INVALIDATIONS) {
  for (const phase of ["dialog", "claim", "enrichment", "chat publication"]) {
    test(`Counterblast revalidates ${label} after ${phase} without further writes`, async t => {
      const env = setup(t);
      env.clash(); env.choose("fire");
      const gate = deferred();
      if (phase === "dialog") t.mock.method(foundry.applications.api.DialogV2, "prompt", () => gate.promise);
      if (phase === "claim") {
        const save = env.scene.setFlag;
        t.mock.method(env.scene, "setFlag", async (...args) => { const saved = await save(...args); await gate.promise; return saved; });
      }
      if (phase === "enrichment") t.mock.method(game.pf2e.TextEditor, "enrichHTML", async content => { await gate.promise; return content; });
      if (phase === "chat publication") {
        const create = foundry.documents.ChatMessage.implementation.create;
        t.mock.method(foundry.documents.ChatMessage.implementation, "create", async (...args) => { const message = await create(...args); await gate.promise; return message; });
      }
      const pending = env.feature.counterblast();
      await setImmediate();
      const written = env.writes.length;
      invalidate(env);
      gate.resolve("fire");
      await pending;
      assert.equal(env.writes.length, written, "No further flag, chat, actor, or effect writes after invalidation");
      assert.equal(env.messages.length, phase === "chat publication" ? 1 : 0);
    });
  }
}

test("Counterblast final marker write failure still prevents every retry", async t => {
  const env = setup(t);
  env.clash(); env.choose("fire");
  const save = env.scene.setFlag;
  const mock = t.mock.method(env.scene, "setFlag", async (scope, key, value) => {
    if (value.status === "posted") throw new Error("final state failed");
    return save(scope, key, value);
  });
  assert.equal(await env.feature.counterblast(), false);
  assert.equal(env.messages.length, 1);
  mock.mock.restore();
  await env.makeFeature().counterblast();
  assert.equal(env.messages.length, 1);
});

test("a new clash can resolve after an earlier clash's durable marker", async t => {
  const env = setup(t);
  env.clash(); env.choose("fire");
  assert.equal((await env.feature.counterblast()).ok, true);
  env.clash({ id: "clash-2" });
  assert.equal((await env.makeFeature().counterblast()).ok, true);
  assert.equal(env.messages.length, 2);
});

test("applyEffect stops subsequent targets when ownership changes during an earlier target write", async t => {
  const env = setup(t);
  const next = env.addToken("next");
  env.globals.game.user.targets.add(next);
  const create = env.foe.actor.createEmbeddedDocuments;
  t.mock.method(env.foe.actor, "createEmbeddedDocuments", async (...args) => {
    const result = await create(...args);
    next.actor.isOwner = false;
    return result;
  });
  assert.equal(await env.feature.applyEffect(), false);
  assert.equal(env.foe.actor.items.size, 1);
  assert.equal(next.actor.items.size, 0);
  assert.equal(env.writes.filter(write => write.kind === "itemCreate").length, 1);
});

test("applyEffect outside combat stamps world time without a stale initiative", async t => {
  const env = setup(t);
  env.globals.game.combat = null;
  env.choose({ mode: "hypnotic", outcome: "criticalFailure" });
  assert.equal((await env.feature.applyEffect()).applied, 1);
  const effect = env.foe.actor.items.contents[0];
  assert.deepEqual(effect.system.start, { value: 100, initiative: null });
  assert.deepEqual(effect.system.duration, { value: -1, unit: "unlimited", expiry: null, sustained: false });
});

test("applyEffect real dialog callback selects a final degree without double incapacitation", async t => {
  const env = setup(t);
  env.actor.flags[MODULE].blastUse = { mode: "slowing" };
  env.foe.actor.system.details.level.value = 30;
  t.mock.method(foundry.applications.api.DialogV2, "prompt", async options => {
    const form = document.createElement("form"); form.innerHTML = options.content;
    assert.equal(form.elements.mode.value, "slowing");
    assert.deepEqual([...form.elements.mode.options].map(option => option.value), Object.keys(RIDERS));
    assert.match(form.textContent, /final save degree after incapacitation/);
    form.elements.mode.value = "hypnotic"; form.elements.outcome.value = "criticalFailure";
    return options.ok.callback(null, { form });
  });
  const result = await env.feature.applyEffect();
  assert.equal(result.outcome, "criticalFailure");
  assert.equal(result.effectUuid, `Compendium.${MODULE}.astillon-blaster-items.Item.BlasterControl02`);
  assert.equal(env.foe.actor.items.contents[0].system.duration.unit, "unlimited");
});

test("Counterblast real dialog callback commits its selected raw mode string", async t => {
  const env = setup(t); env.clash();
  t.mock.method(foundry.applications.api.DialogV2, "prompt", async options => {
    const form = document.createElement("form"); form.innerHTML = options.content;
    assert.match(form.textContent, /No attack or save roll/);
    form.elements.mode.value = "slowing";
    return options.ok.callback(null, { form });
  });
  const result = await env.feature.counterblast();
  assert.equal(result.ok, true);
  assert.equal(result.mode, "slowing");
  assert.match(env.messages[0].content, /11d8\[cold\]/);
  assert.equal(env.messages[0].flags[MODULE].counterblast.riderUuid, `Compendium.${MODULE}.astillon-blaster-items.Item.BlasterSlow00002`);
});

for (const fullHeal of [false, true]) {
  test(`upgradeSheet ${fullHeal ? "explicitly heals" : "preserves wounds"} while preserving custom content and native spell state`, async t => {
    const env = setup(t);
    const actor = env.actor;
    Object.assign(actor.system.attributes.hp, { value: 103, max: 330, temp: 17, tempSource: "custom-effect" });
    actor.system.traits.value = ["human", "humanoid", "fiend", "dream"];
    actor._source.img = "custom-portrait.webp";
    actor._source.name = "My Blaster";
    actor._source.prototypeToken = { texture: { src: "custom-token.webp" }, width: 2 };
    actor.system.attributes.ac.value = 51;
    actor.system.details.privateNotes = "Private table notes";
    actor._source.flags.custom = { keep: true };
    const custom = env.makeItem({ _id: "custom-action", name: "Custom move", type: "action", system: { slug: "custom-action", rules: [{ key: "Note", text: "keep" }] } }, actor);
    const effect = env.makeItem({ _id: "active-effect", name: "Active buff", type: "effect", system: { duration: { value: 3, unit: "rounds" } } }, actor);
    actor.items.set(custom.id, custom); actor.items.set(effect.id, effect);
    const retained = [custom.toObject(), effect.toObject()];
    const innate = actor.items.get("BlasterCasting01");
    innate.system.spelldc = { dc: 47, value: 39 };
    innate.system.slots = { slot3: { value: 0, max: 4 } };
    for (const spell of actor.items.filter(item => item.type === "spell")) {
      spell.system.location = { ...spell.system.location, value: "custom-native-entry", heightenedLevel: 9, uses: { value: 0, max: 7 } };
    }
    const nativeBefore = actor.items.filter(item => ["spell", "spellcastingEntry"].includes(item.type)).map(item => item.toObject());
    for (const spell of env.sourceActor.items.filter(item => item.type === "spell")) delete spell.system.location.uses;
    actor.items.get("BlasterBlastAct1").system.description.gm = "Keep ability GM notes";
    actor.items.delete("BlasterShell0001");
    env.choose({ fullHeal });
    const result = await env.feature.upgradeSheet();
    assert.deepEqual(env.errors, []);
    assert.equal(result.ok, true);
    assert.equal(result.added, 1);
    assert.equal(result.fullHeal, fullHeal);
    assert.deepEqual(actor.system.attributes.hp, { value: fullHeal ? 700 : 473, max: 700, temp: 17, tempSource: "custom-effect", details: "" });
    assert.deepEqual(actor.system.traits.value, ["fiend", "dream"]);
    assert.equal(actor.img, "custom-portrait.webp");
    assert.equal(actor.name, "My Blaster");
    assert.deepEqual(actor.toObject().prototypeToken, { texture: { src: "custom-token.webp" }, width: 2 });
    assert.equal(actor.system.attributes.ac.value, 51);
    assert.equal(actor.system.details.privateNotes, "Private table notes");
    assert.deepEqual(actor.flags.custom, { keep: true });
    assert.deepEqual([actor.items.get(custom.id).toObject(), actor.items.get(effect.id).toObject()], retained);
    assert.deepEqual(actor.items.filter(item => ["spell", "spellcastingEntry"].includes(item.type)).map(item => item.toObject()), nativeBefore);
    assert.equal(actor.items.get("BlasterBlastAct1").system.description.gm, "Keep ability GM notes");
    assert.ok(actor.items.get("BlasterShell0001"));
    const upgraded = actor.toObject();
    const again = await env.feature.upgradeSheet();
    assert.equal(again.ok, true);
    assert.equal(again.added, 0);
    assert.deepEqual(actor.toObject(), upgraded, "Repeated upgrade must not refill uses, heal wounds, or duplicate abilities");
  });
}

test("upgradeSheet matches a remapped unique slug without changing its ID", async t => {
  const env = setup(t);
  const original = env.actor.items.get("BlasterBlastAct1").toObject();
  env.actor.items.delete(original._id);
  const remapped = env.makeItem({ ...original, _id: "remapped-ability", name: "Old title" }, env.actor);
  env.actor.items.set(remapped.id, remapped);
  env.choose({ fullHeal: false });
  const result = await env.feature.upgradeSheet();
  assert.equal(result.ok, true);
  assert.equal(result.added, 0);
  assert.equal(env.actor.items.has(original._id), false);
  assert.equal(env.actor.items.get(remapped.id).name, original.name);
});

for (const hasStableId of [true, false]) {
  test(`upgradeSheet ${hasStableId ? "prefers the stable ID over" : "rejects"} ambiguous duplicate slugs`, async t => {
    const env = setup(t);
    const original = env.actor.items.get("BlasterBlastAct1").toObject();
    if (!hasStableId) env.actor.items.delete(original._id);
    for (const id of ["custom-copy-1", "custom-copy-2"]) {
      env.actor.items.set(id, env.makeItem({ ...original, _id: id, name: id }, env.actor));
    }
    env.choose({ fullHeal: false });
    const result = await env.feature.upgradeSheet();
    if (hasStableId) {
      assert.equal(result.ok, true);
      assert.equal(env.actor.items.get("custom-copy-1").name, "custom-copy-1");
      assert.equal(env.actor.items.get("custom-copy-2").name, "custom-copy-2");
    } else {
      assert.equal(result, false);
      assert.equal(env.writes.length, 0);
      assert.match(env.errors.at(-1), /Ambiguous duplicate/);
    }
  });
}

test("upgradeSheet recomputes wounds and ability GM notes after confirmation", async t => {
  const env = setup(t);
  Object.assign(env.actor.system.attributes.hp, { value: 103, max: 330 });
  const gate = deferred();
  t.mock.method(foundry.applications.api.DialogV2, "wait", () => gate.promise);
  const pending = env.feature.upgradeSheet();
  await setImmediate();
  env.actor.system.attributes.hp.value = 50;
  env.actor.items.get("BlasterBlastAct1").system.description.gm = "Edited while dialog open";
  gate.resolve({ fullHeal: false });
  assert.equal((await pending).ok, true);
  assert.equal(env.actor.system.attributes.hp.value, 420);
  assert.equal(env.actor.items.get("BlasterBlastAct1").system.description.gm, "Edited while dialog open");
});

for (const [label, invalidate] of INVALIDATIONS.slice(0, 7)) {
  for (const phase of ["source load", "confirmation", "item updates"]) {
    test(`upgradeSheet revalidates ${label} after ${phase} before further writes`, async t => {
      const env = setup(t);
      env.choose({ fullHeal: false });
      const gate = deferred();
      if (phase === "source load") {
        const load = foundry.utils.fromUuid;
        t.mock.method(foundry.utils, "fromUuid", async uuid => { const source = await load(uuid); await gate.promise; return source; });
      }
      if (phase === "confirmation") t.mock.method(foundry.applications.api.DialogV2, "wait", () => gate.promise);
      if (phase === "item updates") {
        const update = env.actor.updateEmbeddedDocuments;
        t.mock.method(env.actor, "updateEmbeddedDocuments", async (...args) => { const updated = await update(...args); await gate.promise; return updated; });
      }
      const pending = env.feature.upgradeSheet();
      await setImmediate();
      const written = env.writes.length;
      invalidate(env);
      gate.resolve({ fullHeal: false });
      assert.equal(await pending, false);
      assert.equal(env.writes.length, written);
    });
  }
}
