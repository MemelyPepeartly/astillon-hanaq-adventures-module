import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { createBlasterFinale } from "../dist/scripts/features/blaster-finale.js";
import { BLAST_MODES } from "../dist/scripts/features/blaster-model.js";

const MODULE = "astillon-hanaq-adventures-module";
const FLAG = "blasterFinalePlans";
const POINTS = [
  { x: 50, y: 50 }, { x: 2450, y: 50 }, { x: 2450, y: 150 }, { x: 2350, y: 150 },
  { x: 2350, y: 250 }, { x: 2250, y: 250 }, { x: 2250, y: 350 }, { x: 2150, y: 350 },
];
const copy = value => value === undefined ? undefined : structuredClone(value);
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const getPath = (object, path) => path.split(".").reduce((current, key) => current?.[key], object);

// The V14 operator exposes its contained properties and replaces the field whole.
// Native source: common/data/operators.mjs, ForcedReplacement.create.
class ForcedReplacement {
  constructor(value) { Object.assign(this, copy(value)); }
  static create(value) { return new ForcedReplacement(value); }
}

// Document.setFlag delegates to update, which merges objects and expands dotted keys.
function merge(target, value) {
  for (const [key, next] of Object.entries(value)) {
    if (key.startsWith("-=")) { delete target[key.slice(2)]; continue; }
    if (key.includes(".")) { setPath(target, key, next); continue; }
    if (next instanceof ForcedReplacement) target[key] = copy(next);
    else if (isObject(next)) {
      if (!isObject(target[key])) target[key] = {};
      merge(target[key], next);
    } else target[key] = copy(next);
  }
  return target;
}

function setPath(object, path, value, remove = false) {
  const keys = path.split(".");
  const last = keys.pop();
  let current = object;
  for (const key of keys) {
    if (!isObject(current[key])) current[key] = {};
    current = current[key];
  }
  if (remove) delete current[last];
  else if (value instanceof ForcedReplacement) current[last] = copy(value);
  else if (isObject(value)) {
    if (!isObject(current[last])) current[last] = {};
    merge(current[last], value);
  } else current[last] = copy(value);
  return object;
}

class Collection extends Map {
  get contents() { return [...this.values()]; }
  [Symbol.iterator]() { return this.values(); }
  find(predicate) { return this.contents.find(predicate); }
  filter(predicate) { return this.contents.filter(predicate); }
  map(callback) { return this.contents.map(callback); }
}

function setup(t, { mode = "fire", inCombat = true } = {}) {
  const callbacks = new Map();
  const messages = [], prompts = [], warnings = [], errors = [], enrichments = [], writes = [], deletions = [], picks = [];
  const messageDocuments = new Collection();
  const flags = { [MODULE]: {} };
  const regions = new Collection();
  const tokens = new Collection();
  let unique = 0, selected, failNextPersist = false, pickerResult = copy(POINTS), pickerWait, pickerRelease;
  const nextID = () => String(++unique).padStart(16, "0");
  const scene = {
    id: "scene", uuid: "Scene.scene", grid: { size: 100, distance: 5, units: "ft", type: 1 }, regions, tokens, flags,
    getFlag(scope, key) { return copy(getPath(flags[scope], key)); },
    async setFlag(scope, key, value) {
      writes.push({ type: "sceneFlag", scope, key, value: copy(value) });
      if (failNextPersist) { failNextPersist = false; throw new Error("simulated scene persistence failure"); }
      flags[scope] ??= {};
      setPath(flags[scope], key, value);
      return scene;
    },
    async unsetFlag(scope, key) {
      writes.push({ type: "sceneUnset", scope, key });
      setPath(flags[scope] ??= {}, key, undefined, true);
      return scene;
    },
    async update(changes) {
      writes.push({ type: "sceneUpdate", changes: copy(changes) });
      if (failNextPersist) { failNextPersist = false; throw new Error("simulated scene persistence failure"); }
      merge(scene, changes);
      return scene;
    },
    async createEmbeddedDocuments(type, sources) {
      assert.equal(type, "Region");
      return sources.map(source => {
        const data = copy(source);
        const id = data._id ?? nextID();
        const document = {
          ...data, id, _id: id, parent: scene,
          getFlag(scope, key) { return copy(getPath(this.flags?.[scope], key)); },
          toObject() { const { parent, getFlag, toObject, update, ...sourceData } = this; return copy(sourceData); },
          async update(changes) { merge(this, changes); return this; },
        };
        regions.set(id, document);
        return document;
      });
    },
    async updateEmbeddedDocuments(type, updates) {
      assert.equal(type, "Region");
      writes.push({ type: "regionUpdate", updates: copy(updates) });
      return updates.map(update => {
        const document = regions.get(update._id);
        assert.ok(document, `Region ${update._id} must exist`);
        merge(document, update);
        return document;
      });
    },
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, "Region");
      deletions.push([...ids]);
      const deleted = ids.map(id => regions.get(id)).filter(Boolean);
      for (const id of ids) regions.delete(id);
      return deleted;
    },
  };
  function addBlaster(id = "blaster", actorId = id) {
    const actorFlags = { blasterRole: "blaster", blastUse: { readyRound: 99 } };
    const tokenFlags = { blastRoot: { combatId: "combat", round: 1, expires: 999 } };
    const actor = {
      id: actorId, uuid: `Actor.${actorId}`, name: id, type: "npc", isOwner: true,
      items: [],
      system: { attributes: { hp: { value: 73, max: 330 } } },
      getFlag: (_scope, key) => copy(getPath(actorFlags, key)),
      getRollData: () => ({ actorId, level: 15 }),
      async update() { assert.fail("Grand Finale must never write actor HP or other actor data"); },
      async setFlag() { assert.fail("Grand Finale must not change recharge state"); },
      async createEmbeddedDocuments() { assert.fail("Grand Finale riders are manual"); },
      async updateEmbeddedDocuments() { assert.fail("Grand Finale riders are manual"); },
    };
    const document = {
      id, uuid: `Scene.scene.Token.${id}`, name: id, actor, parent: scene, isOwner: true,
      x: 0, y: 0, width: 1, height: 1, elevation: 0, actorId,
      getFlag: (_scope, key) => copy(getPath(tokenFlags, key)),
      async update() { assert.fail("Grand Finale must not move its owner"); },
      async setFlag() { assert.fail("Grand Finale must not change root state"); },
      async unsetFlag() { assert.fail("Grand Finale must not change root state"); },
    };
    const token = { id, name: id, document, actor, center: { x: 50, y: 50 } };
    document.object = token;
    tokens.set(id, document);
    return token;
  }
  selected = addBlaster();
  const combat = { id: "combat", uuid: "Combat.combat", scene, sceneId: scene.id, started: true, round: 4, turn: 2, combatant: { tokenId: "another" } };
  const picker = {
    busy: false,
    async pick(token, options) {
      picks.push({ token, options: copy(options) });
      this.busy = true;
      try {
        if (pickerWait) return await new Promise(resolve => { pickerRelease = resolve; });
        return copy(pickerResult);
      } finally { this.busy = false; }
    },
    cancel() { pickerRelease?.(null); },
  };
  const chat = {
    getSpeaker: ({ actor, token, scene: speakerScene } = {}) => ({ actor: actor?.id, token: token?.id, scene: speakerScene?.id }),
    async create(data, options) {
      assert.equal(options?.keepId, true, "Chat publication must preserve its stable persisted ID");
      assert.match(data._id, /^[a-zA-Z0-9]{16}$/);
      // Native keepId preserves an identifier; it is not a compare-and-swap lock.
      // Keep every create call visible so duplicate publication always fails tests.
      const document = { ...copy(data), id: data._id, getFlag(scope, key) { return copy(getPath(this.flags?.[scope], key)); } };
      messages.push(document);
      messageDocuments.set(document.id, document);
      return document;
    },
  };
  chat.implementation = chat;
  const globals = {
    Hooks: {
      on(name, callback) { const listeners = callbacks.get(name) ?? []; listeners.push(callback); callbacks.set(name, listeners); return callback; },
      off(name, callback) { callbacks.set(name, (callbacks.get(name) ?? []).filter(listener => listener !== callback)); },
    },
    ui: { notifications: { warn: text => warnings.push(text), error: text => errors.push(text), info() {} } },
    CONST: { REGION_VISIBILITY: { ALWAYS: 2 }, GRID_TYPES: { SQUARE: 1 } },
    game: {
      user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm", isGM: true } }, release: { generation: 14 },
      scenes: new Collection([[scene.id, scene]]), combats: new Collection(inCombat ? [[combat.id, combat]] : []), combat: inCombat ? combat : null,
      messages: messageDocuments, modules: new Map(), system: { id: "pf2e", version: "8.7.0" },
      pf2e: { TextEditor: { async enrichHTML(content, options) { enrichments.push({ content, options }); return `enriched:${content}`; } } },
    },
    canvas: {
      ready: true, scene, level: { id: "ground" }, tokens: { controlled: [selected] },
      grid: {
        isSquare: true, size: 100, distance: 5, units: "ft",
        getCenterPoint: point => ({ x: Math.floor(point.x / 100) * 100 + 50, y: Math.floor(point.y / 100) * 100 + 50 }),
        measurePath: points => ({ distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) / 20 }),
      },
    },
    foundry: {
      data: { operators: { ForcedReplacement } },
      utils: { randomID: nextID, deepClone: copy, duplicate: copy, getProperty: getPath, setProperty: setPath, escapeHTML: value => String(value) },
      applications: { api: { DialogV2: { async prompt(options) { prompts.push(options); return { mode }; } } }, ux: { TextEditor: { async enrichHTML(content, options) { enrichments.push({ content, options }); return `enriched:${content}`; } } } },
      documents: { ChatMessage: chat },
    },
    ChatMessage: chat,
  };
  const original = Object.fromEntries(Object.keys(globals).map(key => [key, globalThis[key]]));
  Object.assign(globalThis, globals);
  t.mock.method(console, "error", () => {});
  t.after(() => {
    picker.cancel();
    for (const key of Object.keys(globals)) {
      if (original[key] === undefined) delete globalThis[key];
      else globalThis[key] = original[key];
    }
  });
  const selectToken = () => selected;
  let feature = createBlasterFinale(MODULE, { selectToken, picker });
  return {
    get feature() { return feature; }, scene, combat, regions, tokens, flags, messages, messageDocuments, prompts, warnings, errors, enrichments, writes, deletions, picks, picker, callbacks, globals,
    get token() { return selected; },
    plan(id = selected.id) { return scene.getFlag(MODULE, `${FLAG}.${id}`); },
    addBlaster,
    select(token) { selected = token; globals.canvas.tokens.controlled = [token]; },
    setPoints(value) { pickerResult = copy(value); },
    holdPicker() { pickerWait = true; },
    finishPicker(value = POINTS) { pickerWait = false; assert.ok(pickerRelease, "Picker must have started"); pickerRelease(copy(value)); },
    failPersist() { failNextPersist = true; },
    async emit(name, ...args) { await Promise.all((callbacks.get(name) ?? []).map(callback => callback(...args))); await setImmediate(); },
    async drain() { await feature.ready(); await setImmediate(); },
    async restart() { callbacks.clear(); feature = createBlasterFinale(MODULE, { selectToken, picker }); await feature.ready(); await setImmediate(); },
  };
}

test("mark persists eight points, seven harmless amber regions and no card; turn changes do not fire", async t => {
  const env = setup(t);
  await env.feature.ready();
  await env.feature.mark();
  const plan = env.plan();
  assert.ok(plan);
  assert.deepEqual(plan.points, POINTS);
  assert.equal(plan.width, 3);
  assert.equal(plan.gridSize, 100);
  assert.equal(plan.combatUuid, env.combat.uuid);
  assert.equal(plan.dueRound, 5);
  assert.equal(env.regions.size, 7);
  assert.deepEqual(env.picks[0].options, { title: "Grand Finale", pointCount: 8, range: 120, width: 3, color: "#ffbf00" });
  for (const region of env.regions) {
    assert.equal(region.visibility, CONST.REGION_VISIBILITY.ALWAYS);
    assert.equal(region.highlightMode, "coverage");
    assert.equal(region.ownership.default, 2);
    assert.equal(region.color, "#ffbf00");
    assert.equal(region.shapes[0].width, 300);
    assert.equal(region.flags.pf2e.areaShape, "line");
    assert.equal(region.behaviors?.length ?? 0, 0, "Warnings have no damage behaviors");
  }
  env.combat.turn = 3;
  env.combat.combatant.tokenId = "blaster";
  await env.emit("combatTurnChange", env.combat, {}, {});
  await env.emit("updateCombat", env.combat, { turn: 3 });
  await env.drain();
  assert.equal(env.messages.length, 0);
  assert.deepEqual(env.errors, []);
});

test("next global round fires once across duplicate hooks, independent of whose turn it is", async t => {
  const env = setup(t, { mode: "cold" });
  await env.feature.ready();
  await env.feature.mark();
  const before = env.regions.map(region => copy(region.shapes));
  env.combat.round = 5;
  env.combat.turn = 0;
  env.combat.combatant.tokenId = "someone-else";
  await Promise.all([
    env.emit("combatTurnChange", env.combat, { round: 4 }, { round: 5 }),
    env.emit("updateCombat", env.combat, { round: 5, turn: 0 }),
    env.emit("updateCombat", env.combat, { round: 5 }),
  ]);
  await env.drain();
  assert.equal(env.messages.length, 1);
  assert.match(env.messages[0].content, /24d6\[cold\]/);
  assert.match(env.messages[0].content, /@Damage\[24d6\[cold\]\|traits:magical,cold\|options:area-damage\]/);
  assert.match(env.messages[0].content, /@Check\[reflex\|dc:40\|basic\|traits:magical,cold\]/);
  assert.doesNotMatch(env.messages[0].content, /immutable|\[\[\/r /);
  assert.match(env.messages[0].content, /manual/i);
  assert.deepEqual(env.regions.map(region => copy(region.shapes)), before);
  assert.ok(env.regions.contents.every(region => region.color === BLAST_MODES.cold.color));
  assert.equal(env.enrichments.length, 1);
  assert.deepEqual(env.enrichments[0].options.rollData, env.token.actor.getRollData());
  assert.equal(env.enrichments[0].options.relativeTo, env.token.actor);
  assert.equal(env.token.actor.system.attributes.hp.value, 73);
  assert.deepEqual(env.token.actor.getFlag(MODULE, "blastUse"), { readyRound: 99 });
  assert.deepEqual(env.token.document.getFlag(MODULE, "blastRoot"), { combatId: "combat", round: 1, expires: 999 });
  await env.emit("updateCombat", env.combat, { round: 5, turn: 1 });
  await env.drain();
  assert.equal(env.messages.length, 1);
});

for (const mode of ["fire", "dazzling", "humiliation"]) {
  test(`manual fire outside combat uses ${mode} spectrum and manual riders without HP writes`, async t => {
    const env = setup(t, { inCombat: false, mode });
    await env.feature.ready();
    await env.feature.mark();
    assert.equal(env.plan().combatUuid, null);
    assert.match(env.prompts[0].content + env.regions.map(region => region.name).join(" "), /manual/i);
    await env.feature.fire();
    assert.equal(env.messages.length, 1);
    const spectrum = BLAST_MODES[mode];
    assert.match(env.messages[0].content, new RegExp(`${24 - spectrum.penalty}d6\\[${spectrum.damage}\\]`));
    assert.match(env.messages[0].content, new RegExp(`@Check\\[${spectrum.save}\\|dc:40\\|basic`));
    if (spectrum.rider) assert.ok(env.messages[0].content.includes(spectrum.rider));
    await env.feature.fire();
    assert.equal(env.messages.length, 1);
    assert.deepEqual(env.errors, []);
  });
}

test("native PF2e enrichment uses the Grand Finale action's roll data and relative context", async t => {
  const env = setup(t, { mode: "humiliation", inCombat: false });
  const actionRollData = { actorId: "blaster", itemId: "finale-action", level: 15 };
  const action = {
    id: "finale-action", slug: "blaster-grand-finale", type: "action", actor: env.token.actor,
    getRollData: () => actionRollData,
  };
  env.token.actor.items.push({ slug: "unrelated-action" }, action);
  await env.feature.mark();
  await env.feature.fire();
  assert.equal(env.messages.length, 1);
  assert.equal(env.enrichments.length, 1);
  assert.equal(env.enrichments[0].options.relativeTo, action);
  assert.deepEqual(env.enrichments[0].options.rollData, actionRollData);
  assert.match(env.enrichments[0].content, /@Damage\[22d6\[mental\]\|traits:magical,mental\|options:area-damage\]/);
  assert.match(env.enrichments[0].content, /@Check\[will\|dc:40\|basic\|traits:magical,mental\]/);
  assert.doesNotMatch(env.enrichments[0].content, /immutable|\[\[\/r /);
});

test("native PF2e enrichment falls back to actor context when Grand Finale has no action item", async t => {
  const env = setup(t, { inCombat: false });
  env.token.actor.items.push({ slug: "unrelated-action" });
  await env.feature.mark();
  await env.feature.fire();
  assert.equal(env.messages.length, 1);
  assert.equal(env.enrichments[0].options.relativeTo, env.token.actor);
  assert.deepEqual(env.enrichments[0].options.rollData, env.token.actor.getRollData());
  assert.match(env.enrichments[0].content, /@Damage\[24d6\[fire\]\|traits:magical,fire\|options:area-damage\]/);
});

test("cancelled replacement leaves the old plan and regions untouched", async t => {
  const env = setup(t);
  await env.feature.mark();
  const plan = env.plan();
  const ids = [...env.regions.keys()];
  env.setPoints(null);
  await env.feature.mark();
  assert.deepEqual(env.plan(), plan);
  assert.deepEqual([...env.regions.keys()], ids);
  assert.equal(env.messages.length, 0);
});

test("failed replacement persistence rolls back only newly created regions and preserves the old plan", async t => {
  const env = setup(t);
  await env.feature.mark();
  const plan = env.plan();
  const ids = [...env.regions.keys()];
  const [unrelated] = await env.scene.createEmbeddedDocuments("Region", [{ name: "unrelated", flags: { [MODULE]: { blaster: { tokenId: env.token.id } } } }]);
  env.failPersist();
  await env.feature.mark();
  assert.deepEqual(env.plan(), plan);
  assert.deepEqual([...env.regions.keys()], [...ids, unrelated.id]);
  assert.equal(env.messages.length, 0);
  assert.match(env.errors.join(" "), /persistence failure/);
});

test("first-plan persistence failure leaves no silent live warning", async t => {
  const env = setup(t);
  env.failPersist();
  await env.feature.mark();
  assert.equal(env.plan(), undefined);
  assert.equal(env.regions.size, 0);
  assert.equal(env.messages.length, 0);
  assert.match(env.errors.join(" "), /persistence failure/);
});

test("successful replacement removes only its own older regions and clear preserves unrelated areas", async t => {
  const env = setup(t);
  await env.feature.mark();
  const prior = env.plan();
  const [unrelated] = await env.scene.createEmbeddedDocuments("Region", [{ name: "normal blast", flags: { [MODULE]: { blaster: { tokenId: env.token.id } } } }]);
  await env.feature.mark();
  assert.notEqual(env.plan().id, prior.id);
  assert.equal(env.regions.size, 8);
  assert.ok(prior.regionIDs.every(id => !env.regions.has(id)));
  await env.feature.clear();
  assert.equal(env.plan(), undefined);
  assert.deepEqual([...env.regions.keys()], [unrelated.id]);
});

test("independent Blasters keep separate plans, and clearing one never deletes the other", async t => {
  const env = setup(t);
  const first = env.token;
  await env.feature.mark();
  const firstPlan = env.plan();
  const second = env.addBlaster("second");
  env.select(second);
  await env.feature.mark();
  const secondPlan = env.plan();
  assert.notEqual(firstPlan.id, secondPlan.id);
  assert.equal(env.regions.size, 14);
  env.select(first);
  await env.feature.clear();
  assert.equal(env.plan(first.id), undefined);
  assert.deepEqual(env.plan(second.id), secondPlan);
  assert.deepEqual([...env.regions.keys()], secondPlan.regionIDs);
  env.select(second);
  await env.feature.fire();
  assert.equal(env.messages.length, 1);
});

test("one Blaster's publication failure does not block another due plan on the same round hook", async t => {
  const env = setup(t);
  await env.feature.ready();
  const first = env.token;
  await env.feature.mark();
  const second = env.addBlaster("second");
  env.select(second);
  await env.feature.mark();
  const create = foundry.documents.ChatMessage.implementation.create;
  t.mock.method(foundry.documents.ChatMessage.implementation, "create", async function (data, options) {
    if (data.flags[MODULE].blasterFinale.tokenId === first.id) throw new Error("first Blaster publication failed");
    return create.call(this, data, options);
  });
  env.combat.round = 5;
  await env.emit("updateCombat", env.combat, { round: 5 });
  await env.drain();
  assert.equal(env.messages.length, 1);
  assert.equal(env.messages[0].flags[MODULE].blasterFinale.tokenId, second.id);
  assert.equal(env.plan(first.id).status, "publishing");
  assert.equal(env.plan(second.id).status, "fired");
});

test("owner token deletion cancels its persisted plan and only its own regions", async t => {
  const env = setup(t);
  await env.feature.ready();
  const first = env.token;
  await env.feature.mark();
  const second = env.addBlaster("second");
  env.select(second);
  await env.feature.mark();
  const secondPlan = env.plan();
  env.tokens.delete(first.id);
  await env.emit("deleteToken", first.document);
  await env.drain();
  assert.equal(env.plan(first.id), undefined);
  assert.deepEqual(env.plan(second.id), secondPlan);
  assert.deepEqual([...env.regions.keys()], secondPlan.regionIDs);
  assert.equal(env.messages.length, 0);
});

test("combat deletion cancels combat-bound plans but preserves manual-only plans", async t => {
  const env = setup(t);
  await env.feature.ready();
  const first = env.token;
  await env.feature.mark();
  env.globals.game.combat = null;
  env.globals.game.combats.clear();
  const second = env.addBlaster("manual");
  env.select(second);
  await env.feature.mark();
  const manual = env.plan();
  await env.emit("deleteCombat", env.combat);
  await env.drain();
  assert.equal(env.plan(first.id), undefined);
  assert.deepEqual(env.plan(second.id), manual);
  assert.deepEqual([...env.regions.keys()], manual.regionIDs);
});

test("reconnect rehydrates the pending plan and a fired plan never creates a second card", async t => {
  const env = setup(t);
  await env.feature.mark();
  await env.restart();
  assert.equal(env.messages.length, 0);
  env.combat.round = 5;
  await env.emit("updateCombat", env.combat, { round: 5, turn: 0 });
  await env.drain();
  assert.equal(env.messages.length, 1);
  const messageId = env.messages[0].id;
  await env.restart();
  await env.feature.ready();
  await env.feature.ready();
  assert.equal(env.messages.length, 1);
  assert.equal(env.messages[0].id, messageId);
  assert.equal(env.callbacks.get("updateCombat").length, 1);
});

test("reconnecting after the due round does not silently fire a missed finale", async t => {
  const env = setup(t);
  await env.feature.mark();
  env.combat.round = 8;
  await env.restart();
  await env.emit("updateCombat", env.combat, { round: 8, turn: 0 });
  await env.drain();
  assert.equal(env.messages.length, 0);
  assert.ok(env.warnings.length > 0, "An overdue plan must be visible for manual recovery");
  await env.feature.fire();
  assert.equal(env.messages.length, 1);
});

test("backward rounds and a later replay of the due round never fire a finished plan twice", async t => {
  const env = setup(t);
  await env.feature.ready();
  await env.feature.mark();
  env.combat.round = 5;
  await env.emit("updateCombat", env.combat, { round: 5 });
  await env.drain();
  assert.equal(env.messages.length, 1);
  for (const round of [3, 4, 5]) {
    env.combat.round = round;
    await env.emit("updateCombat", env.combat, { round });
    await env.drain();
  }
  await env.restart();
  assert.equal(env.messages.length, 1);
});

test("path and three-square width stay captured when the token and scene grid change", async t => {
  const env = setup(t, { mode: "electricity" });
  await env.feature.mark();
  const before = env.regions.map(region => copy(region.shapes));
  env.token.document.x = 1000;
  env.token.document.y = 1000;
  env.token.center = { x: 1050, y: 1050 };
  env.globals.canvas.grid.size = 200;
  env.scene.grid.size = 200;
  await env.feature.fire();
  assert.deepEqual(env.plan().points, POINTS);
  assert.equal(env.plan().width, 3);
  assert.equal(env.plan().gridSize, 100);
  assert.deepEqual(env.regions.map(region => copy(region.shapes)), before);
  assert.ok(env.regions.contents.every(region => region.shapes[0].width === 300));
  assert.ok(env.regions.contents.every(region => region.color === BLAST_MODES.electricity.color));
});

test("round changes during placement schedule from the successful commit round", async t => {
  const env = setup(t);
  await env.feature.ready();
  env.holdPicker();
  const marking = env.feature.mark();
  await setImmediate();
  env.combat.round = 7;
  await env.emit("updateCombat", env.combat, { round: 7, turn: 0 });
  env.finishPicker();
  await marking;
  assert.equal(env.plan().commitRound, 7);
  assert.equal(env.plan().dueRound, 8);
  assert.equal(env.messages.length, 0);
  await env.emit("updateCombat", env.combat, { round: 7, turn: 1 });
  await env.drain();
  assert.equal(env.messages.length, 0);
  env.combat.round = 8;
  await env.emit("updateCombat", env.combat, { round: 8, turn: 0 });
  await env.drain();
  assert.equal(env.messages.length, 1);
});

test("a changed token actor cannot fire a plan belonging to its previous actor", async t => {
  const env = setup(t);
  await env.feature.ready();
  await env.feature.mark();
  const replacement = { ...env.token.actor, id: "replacement", uuid: "Actor.replacement" };
  env.token.actor = replacement;
  env.token.document.actor = replacement;
  env.combat.round = 5;
  await env.emit("updateCombat", env.combat, { round: 5 });
  await env.drain();
  await env.feature.fire();
  assert.equal(env.messages.length, 0);
});

test("malformed persisted plans cannot publish cards or remove unrelated regions", async t => {
  const env = setup(t);
  const [unrelated] = await env.scene.createEmbeddedDocuments("Region", [{ name: "unrelated", flags: {} }]);
  await env.scene.setFlag(MODULE, FLAG, {
    bad: { id: "malformed", tokenId: "blaster", actorUuid: "Actor.blaster", points: [{ x: NaN, y: 1 }], regionIDs: [unrelated.id], mode: "fire", combatUuid: env.combat.uuid, dueRound: 5, status: "pending" },
    primitive: "invalid",
  });
  await env.feature.ready();
  env.combat.round = 5;
  await env.emit("updateCombat", env.combat, { round: 5 });
  await env.drain();
  assert.equal(env.messages.length, 0);
  assert.deepEqual([...env.regions.keys()], [unrelated.id]);
});

test("a rejected chat create is never retried automatically or manually after reconnect", async t => {
  const env = setup(t);
  await env.feature.mark();
  let attempts = 0;
  t.mock.method(foundry.documents.ChatMessage.implementation, "create", async () => {
    attempts++;
    throw new Error("chat acknowledgement unavailable");
  });
  await env.feature.fire();
  assert.equal(attempts, 1);
  assert.equal(env.plan().status, "publishing");
  assert.ok(env.plan().claim);
  assert.equal(env.messages.length, 0);
  await env.restart();
  env.combat.round = 5;
  await env.emit("updateCombat", env.combat, { round: 5 });
  await env.drain();
  await env.feature.fire();
  assert.equal(attempts, 1);
  assert.equal(env.messages.length, 0);
  assert.match(env.warnings.join(" "), /uncertain|may have succeeded/i);
  assert.match(env.warnings.join(" "), /inspect chat/i);
});

test("a stored chat with a lost acknowledgement is recovered without republishing", async t => {
  const env = setup(t);
  await env.feature.mark();
  const create = foundry.documents.ChatMessage.implementation.create;
  let attempts = 0;
  t.mock.method(foundry.documents.ChatMessage.implementation, "create", async function (...args) {
    attempts++;
    await create.apply(this, args);
    throw new Error("chat stored but acknowledgement lost");
  });
  await env.feature.fire();
  assert.equal(env.messages.length, 1);
  assert.equal(env.plan().status, "publishing");
  await env.restart();
  assert.equal(env.plan().status, "fired");
  await env.feature.fire();
  env.combat.round = 5;
  await env.emit("updateCombat", env.combat, { round: 5 });
  await env.drain();
  assert.equal(attempts, 1);
  assert.equal(env.messages.length, 1);
});

test("failed durable publication claim creates no card and can be safely retried", async t => {
  const env = setup(t);
  await env.feature.mark();
  env.failPersist();
  await env.feature.fire();
  assert.equal(env.messages.length, 0);
  assert.equal(env.plan().status, "pending");
  assert.ok(env.regions.contents.every(region => region.color === "#ffbf00"));
  await env.feature.fire();
  assert.equal(env.messages.length, 1);
});

test("a persisted claim with a rejected acknowledgement blocks all uncertain retries", async t => {
  const env = setup(t);
  await env.feature.mark();
  const setFlag = env.scene.setFlag;
  let rejected = false;
  t.mock.method(env.scene, "setFlag", async function (scope, key, value) {
    const result = await setFlag.call(this, scope, key, value);
    if (!rejected && value.status === "publishing") {
      rejected = true;
      throw new Error("claim stored but acknowledgement lost");
    }
    return result;
  });
  await env.feature.fire();
  assert.equal(env.plan().status, "publishing");
  assert.equal(env.messages.length, 0);
  await env.restart();
  await env.feature.fire();
  assert.equal(env.messages.length, 0);
  assert.match(env.warnings.join(" "), /uncertain/i);
});

test("failed final-state persistence recovers from the existing stable chat ID", async t => {
  const env = setup(t);
  await env.feature.mark();
  const setFlag = env.scene.setFlag;
  let rejected = false;
  t.mock.method(env.scene, "setFlag", async function (scope, key, value) {
    if (!rejected && value.status === "fired") {
      rejected = true;
      throw new Error("final-state persistence failed");
    }
    return setFlag.call(this, scope, key, value);
  });
  await env.feature.fire();
  assert.equal(env.messages.length, 1);
  assert.equal(env.plan().status, "publishing");
  await env.restart();
  assert.equal(env.plan().status, "fired");
  await env.feature.fire();
  assert.equal(env.messages.length, 1);
});

test("a replacement stored before persistence rejects restores the previous plan and regions", async t => {
  const env = setup(t);
  await env.feature.mark();
  const prior = env.plan();
  const ids = [...env.regions.keys()];
  const setFlag = env.scene.setFlag;
  let rejected = false;
  t.mock.method(env.scene, "setFlag", async function (...args) {
    const result = await setFlag.apply(this, args);
    if (!rejected) { rejected = true; throw new Error("replacement stored but acknowledgement lost"); }
    return result;
  });
  await env.feature.mark();
  assert.deepEqual(env.plan(), prior);
  assert.deepEqual([...env.regions.keys()], ids);
  assert.equal(env.messages.length, 0);
});

test("only the elected active GM fires; handover reconciles the due pending plan once", async t => {
  const env = setup(t);
  await env.feature.ready();
  await env.feature.mark();
  env.globals.game.users.activeGM = { id: "next-gm", isGM: true };
  env.combat.round = 5;
  await env.emit("updateCombat", env.combat, { round: 5 });
  await env.drain();
  assert.equal(env.messages.length, 0);
  env.globals.game.user = { id: "next-gm", isGM: true };
  await Promise.all([env.emit("userConnected", {}, true), env.emit("updateUser", {}, { active: true })]);
  await env.drain();
  assert.equal(env.messages.length, 1);
  await env.restart();
  assert.equal(env.messages.length, 1);
});

test("rewinding a pending plan requires manual recovery even if its due round is replayed", async t => {
  const env = setup(t);
  await env.feature.ready();
  await env.feature.mark();
  env.combat.round = 3;
  await env.emit("updateCombat", env.combat, { round: 3 });
  await env.drain();
  assert.equal(env.plan().status, "recovery");
  env.combat.round = 5;
  await env.emit("updateCombat", env.combat, { round: 5 });
  await env.drain();
  assert.equal(env.messages.length, 0);
  await env.feature.fire();
  assert.equal(env.messages.length, 1);
});

test("Clear Finale cancels an open replacement picker and clears only the selected plan", async t => {
  const env = setup(t, { inCombat: false });
  await env.feature.mark();
  env.holdPicker();
  const marking = env.feature.mark();
  await setImmediate();
  assert.equal(env.picker.busy, true);
  await env.feature.clear();
  await marking;
  assert.equal(env.picker.busy, false);
  assert.equal(env.plan(), undefined);
  assert.equal(env.regions.size, 0);
});

test("token deletion cancels an open picker without committing a warning", async t => {
  const env = setup(t);
  await env.feature.ready();
  env.holdPicker();
  const marking = env.feature.mark();
  await setImmediate();
  env.tokens.delete(env.token.id);
  await env.emit("deleteToken", env.token.document);
  await marking;
  await env.drain();
  assert.equal(env.plan(), undefined);
  assert.equal(env.regions.size, 0);
  assert.equal(env.messages.length, 0);
});

test("an overlong leg is rejected before creating warning regions", async t => {
  const env = setup(t);
  const invalid = copy(POINTS);
  invalid[7] = { x: 4750, y: 350 };
  env.setPoints(invalid);
  await env.feature.mark();
  assert.equal(env.plan(), undefined);
  assert.equal(env.regions.size, 0);
  assert.match(env.errors.join(" "), /120 feet/);
});

test("finite waypoint coordinates whose leg length overflows are rejected before warning creation", async t => {
  const env = setup(t);
  const invalid = copy(POINTS);
  invalid[0] = { x: 1e308, y: 1e308 };
  invalid[1] = { x: -1e308, y: -1e308 };
  assert.ok(invalid.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
  assert.equal(Math.hypot(invalid[1].x - invalid[0].x, invalid[1].y - invalid[0].y), Infinity);
  env.setPoints(invalid);
  await env.feature.mark();
  assert.equal(env.plan(), undefined);
  assert.equal(env.regions.size, 0);
  assert.equal(env.messages.length, 0);
  assert.ok(env.errors.length > 0);
});

test("reconnected persisted plans with overflowing leg distances are ignored with one warning", async t => {
  const env = setup(t);
  await env.feature.mark();
  const malformed = env.plan();
  malformed.points[0] = { x: 1e308, y: 1e308 };
  malformed.points[1] = { x: -1e308, y: -1e308 };
  await env.scene.setFlag(MODULE, `${FLAG}.blaster`, malformed);
  env.combat.round = malformed.dueRound;
  await env.restart();
  await env.emit("updateCombat", env.combat, { round: malformed.dueRound });
  await env.emit("combatTurnChange", env.combat);
  await env.drain();
  assert.equal(env.messages.length, 0);
  assert.equal(env.regions.size, 7);
  assert.equal(env.warnings.length, 1);
  assert.match(env.warnings[0], /malformed Grand Finale state/);
  await env.feature.fire();
  assert.equal(env.messages.length, 0);
});

test("ready drains fire jobs even though Foundry hooks do not await returned promises", async t => {
  const env = setup(t);
  await env.feature.ready();
  await env.feature.mark();
  const create = foundry.documents.ChatMessage.implementation.create;
  let release;
  t.mock.method(foundry.documents.ChatMessage.implementation, "create", async function (...args) {
    await new Promise(resolve => { release = resolve; });
    return create.apply(this, args);
  });
  env.combat.round = 5;
  for (const callback of env.callbacks.get("updateCombat")) callback(env.combat, { round: 5 });
  await setImmediate();
  assert.equal(typeof release, "function");
  let drained = false;
  const draining = env.feature.ready().then(() => { drained = true; });
  await setImmediate();
  assert.equal(drained, false);
  release();
  await draining;
  assert.equal(env.messages.length, 1);
  assert.equal(env.plan().status, "fired");
});

test("scheduling uses the round after warning documents finish creating", async t => {
  const env = setup(t);
  const create = env.scene.createEmbeddedDocuments;
  let release;
  t.mock.method(env.scene, "createEmbeddedDocuments", async function (...args) {
    await new Promise(resolve => { release = resolve; });
    return create.apply(this, args);
  });
  const marking = env.feature.mark();
  await setImmediate();
  assert.equal(typeof release, "function");
  env.combat.round = 6;
  release();
  await marking;
  assert.equal(env.plan().commitRound, 6);
  assert.equal(env.plan().dueRound, 7);
  assert.equal(env.messages.length, 0);
});

test("manual fire racing both round hooks shares the same serialized publication", async t => {
  const env = setup(t);
  await env.feature.ready();
  await env.feature.mark();
  env.combat.round = 5;
  await Promise.all([
    env.feature.fire(),
    env.emit("combatTurnChange", env.combat, { round: 4 }, { round: 5 }),
    env.emit("updateCombat", env.combat, { round: 5 }),
    env.feature.fire(),
  ]);
  await env.drain();
  assert.equal(env.messages.length, 1);
  assert.equal(env.plan().status, "fired");
});

test("replacing stale malformed state uses whole-plan replacement without preserving unknown fields", async t => {
  const env = setup(t);
  await env.scene.setFlag(MODULE, `${FLAG}.blaster`, { legacyField: "must disappear", status: "old", claim: { malformed: true } });
  await env.feature.mark();
  assert.equal(env.plan().legacyField, undefined);
  assert.equal(env.plan().status, "pending");
  assert.equal(env.plan().claim, null);
  assert.equal(env.regions.size, 7);
  assert.deepEqual(env.errors, []);
});

test("a round change during the first Scene save reschedules from the committed round", async t => {
  const env = setup(t);
  await env.feature.ready();
  const setFlag = env.scene.setFlag;
  let release, held = false;
  t.mock.method(env.scene, "setFlag", async function (...args) {
    if (!held) { held = true; await new Promise(resolve => { release = resolve; }); }
    return setFlag.apply(this, args);
  });
  const marking = env.feature.mark();
  await setImmediate();
  assert.equal(typeof release, "function");
  env.combat.round = 7;
  for (const callback of env.callbacks.get("updateCombat")) callback(env.combat, { round: 7 });
  release();
  await marking;
  await env.drain();
  assert.equal(env.plan().commitRound, 7);
  assert.equal(env.plan().dueRound, 8);
  assert.equal(env.messages.length, 0);
});

test("undefined chat creation remains uncertain and cannot be retried", async t => {
  const env = setup(t);
  await env.feature.mark();
  let attempts = 0;
  t.mock.method(foundry.documents.ChatMessage.implementation, "create", async () => { attempts++; return undefined; });
  await env.feature.fire();
  assert.equal(env.plan().status, "publishing");
  assert.equal(env.messages.length, 0);
  assert.match(env.errors.join(" "), /returned no document/);
  await env.restart();
  await env.feature.fire();
  assert.equal(attempts, 1);
});

for (const change of ["rewound", "advanced", "deleted"]) {
  test(`automatic publication revalidates combat ${change} during region activation`, async t => {
    const env = setup(t);
    await env.feature.ready();
    await env.feature.mark();
    const update = env.scene.updateEmbeddedDocuments;
    t.mock.method(env.scene, "updateEmbeddedDocuments", async function (...args) {
      const result = await update.apply(this, args);
      if (change === "deleted") {
        env.globals.game.combat = null;
        env.globals.game.combats.clear();
        for (const callback of env.callbacks.get("deleteCombat")) callback(env.combat);
      } else env.combat.round = change === "rewound" ? 3 : 6;
      return result;
    });
    env.combat.round = 5;
    await env.emit("updateCombat", env.combat, { round: 5 });
    await env.drain();
    assert.equal(env.messages.length, 0);
    if (change === "deleted") {
      assert.equal(env.plan(), undefined);
      assert.equal(env.regions.size, 0);
    } else assert.equal(env.plan().status, "recovery");
  });
}
