import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createBlasterBlastback } from "../dist/scripts/features/blaster-blastback.js";

const MODULE = "astillon-hanaq-adventures-module";
const FLAG = "blasterBlastbackPlans";
const MARKER = "blasterBlastback";
const copy = value => value === undefined ? undefined : structuredClone(value);
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const getPath = (object, path) => path.split(".").reduce((current, key) => current?.[key], object);

// V14 ForcedReplacement exposes the properties it replaces. Ordinary flag writes
// still merge objects, including nested dotted keys and -= deletion operators.
class ForcedReplacement {
  constructor(value) { Object.assign(this, copy(value)); }
  static create(value) { return new ForcedReplacement(value); }
}

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
  if (remove || last.startsWith("-=")) delete current[last.replace(/^-=/, "")];
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

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function setup(t, { inCombat = true, ownTurn = 2, currentTurn = 2 } = {}) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const callbacks = new Map();
  const messages = [], prompts = [], warnings = [], errors = [], enrichments = [], writes = [], deletions = [];
  const messageDocuments = new Collection();
  const flags = { [MODULE]: {} };
  const regions = new Collection();
  const tokens = new Collection();
  let unique = 0, selected, failNextPersist = false, dialogResult = { action: "cancel" }, dialogGate;
  const nextID = () => String(++unique).padStart(16, "0");
  const scene = {
    id: "scene", uuid: "Scene.scene", grid: { size: 100, distance: 5, units: "ft", type: 1 }, regions, tokens, flags,
    getFlag(scope, key) { return copy(getPath(flags[scope], key)); },
    async setFlag(scope, key, value) {
      writes.push({ type: "sceneFlag", scope, key, value: copy(value) });
      if (failNextPersist) { failNextPersist = false; throw new Error("simulated scene persistence failure"); }
      setPath(flags[scope] ??= {}, key, value);
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
      writes.push({ type: "regionCreate", sources: copy(sources) });
      return sources.map(source => {
        const data = copy(source);
        const id = data._id ?? nextID();
        const region = {
          ...data, id, _id: id, parent: scene,
          getFlag(scope, key) { return copy(getPath(this.flags?.[scope], key)); },
          toObject() { const { parent, getFlag, toObject, update, ...sourceData } = this; return copy(sourceData); },
          async update(changes) { writes.push({ type: "regionUpdate", updates: [{ _id: id, ...copy(changes) }] }); merge(this, changes); return this; },
        };
        regions.set(id, region);
        return region;
      });
    },
    async updateEmbeddedDocuments(type, updates) {
      assert.equal(type, "Region");
      writes.push({ type: "regionUpdate", updates: copy(updates) });
      return updates.map(update => {
        const region = regions.get(update._id);
        assert.ok(region, `Region ${update._id} must exist`);
        merge(region, update);
        return region;
      });
    },
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, "Region");
      deletions.push([...ids]);
      const removed = ids.map(id => regions.get(id)).filter(Boolean);
      for (const id of ids) regions.delete(id);
      return removed;
    },
  };
  function addBlaster(id = "blaster", actorId = id) {
    const actorFlags = { blasterRole: "blaster", blastUse: { readyRound: 99 } };
    const actor = {
      id: actorId, uuid: `Actor.${actorId}`, name: id, type: "npc", isOwner: true,
      items: new Collection(),
      system: { attributes: { hp: { value: 73, max: 330, temp: 12 } } },
      getFlag: (_scope, key) => copy(getPath(actorFlags, key)),
      getRollData: () => ({ actorId, level: 15, fromActor: true }),
      async update() { assert.fail("Blastback must never write actor HP or other actor data"); },
      async setFlag() { assert.fail("Blastback must never write actor flags"); },
      async createEmbeddedDocuments() { assert.fail("Blastback must not apply effects automatically"); },
      async updateEmbeddedDocuments() { assert.fail("Blastback must not update actor items"); },
    };
    const ability = {
      id: "BlasterBackAct01", uuid: `${actor.uuid}.Item.BlasterBackAct01`, name: "Blastback", type: "action", actor,
      slug: "blaster-blastback", system: { slug: "blaster-blastback", traits: { value: ["force", "magical"] } },
      getRollData: () => ({ actorId, level: 15, fromAbility: true }),
      getOriginData: () => ({ actor: actor.uuid, uuid: `${actor.uuid}.Item.BlasterBackAct01`, type: "action" }),
    };
    actor.items.set(ability.id, ability);
    actor.itemTypes = { action: [ability] };
    const document = {
      id, uuid: `Scene.scene.Token.${id}`, name: id, actor, parent: scene, isOwner: true,
      x: 0, y: 0, width: 1, height: 1, elevation: 0, actorId,
      getCenterPoint() { return { x: this.x + this.width * scene.grid.size / 2, y: this.y + this.height * scene.grid.size / 2 }; },
      getFlag: () => ({ combatId: "combat", round: 1, expires: 999 }),
      async update() { assert.fail("Blastback must not move or immobilize its owner"); },
      async setFlag() { assert.fail("Blastback must not set movement locks"); },
      async unsetFlag() { assert.fail("Blastback must not alter other features' movement locks"); },
    };
    const token = { id, name: id, document, actor, center: { x: 50, y: 50 }, actorFlags, ability };
    document.object = token;
    tokens.set(id, document);
    return token;
  }
  selected = addBlaster();
  const turns = [0, 1, 2, 3].map(index => ({ id: `combatant-${index}`, tokenId: index === ownTurn ? "blaster" : `other-${index}`, actor: index === ownTurn ? selected.actor : null }));
  const combat = {
    id: "combat", uuid: "Combat.combat", scene, sceneId: scene.id, started: true, round: 4, turn: currentTurn,
    turns, combatants: new Collection(turns.map(entry => [entry.id, entry])),
    get combatant() { return this.turns[this.turn]; },
  };
  const chat = {
    getSpeaker: ({ actor, token, scene: speakerScene } = {}) => ({ actor: actor?.id ?? token?.actor?.id, token: token?.id, scene: speakerScene?.id ?? token?.parent?.id }),
    async create(data, options) {
      assert.equal(options?.keepId, true, "Publication must preserve its durable message ID");
      assert.match(data._id, /^[a-zA-Z0-9]{16}$/);
      // keepId does not implement cross-client compare-and-swap. Expose each call.
      const document = { ...copy(data), id: data._id, getFlag(scope, key) { return copy(getPath(this.flags?.[scope], key)); } };
      messages.push(document);
      messageDocuments.set(document.id, document);
      return document;
    },
  };
  chat.implementation = chat;
  const enrichHTML = async (content, options) => {
    enrichments.push({ content, options });
    // Native PF2e immutable links can still acquire NPC elite/weak adjustments.
    // The final link must freeze this inflated formula back to the banked amount.
    const enriched = content.replace(/@Damage\[(\d+)\[force\]([^\]]*)\]/g, (_all, amount) =>
      `<a class="inline-roll roll damage-roll altered" data-damage-roll="${Number(amount) + 4}[force]" data-formula="${Number(amount) + 4}[force]" data-base-formula="${amount}[force]" data-tooltip="Base formula: ${amount}[force]"><i class="fas fa-dice-d20"></i><span class="label">${Number(amount) + 4} force</span></a>`);
    return enriched.replace(/@Check\[([^\]]+)\]/g, (_all, data) => `<a class="inline-check" data-pf2-check="reflex" data-check-data="${data}">DC 40 basic Reflex</a>`);
  };
  const globals = {
    document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLAnchorElement: dom.window.HTMLAnchorElement,
    Hooks: {
      on(name, callback) { const listeners = callbacks.get(name) ?? []; listeners.push(callback); callbacks.set(name, listeners); return callback; },
      off(name, callback) { callbacks.set(name, (callbacks.get(name) ?? []).filter(listener => listener !== callback)); },
    },
    ui: { notifications: { warn: text => warnings.push(text), error: text => errors.push(text), info() {} } },
    CONST: { REGION_VISIBILITY: { ALWAYS: 2 }, GRID_TYPES: { SQUARE: 1 }, DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2, OWNER: 3 } },
    game: {
      user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm", isGM: true } }, release: { generation: 14 },
      scenes: new Collection([[scene.id, scene]]), combats: new Collection(inCombat ? [[combat.id, combat]] : []), combat: inCombat ? combat : null,
      messages: messageDocuments, modules: new Map(), system: { id: "pf2e", version: "8.7.1" }, time: { worldTime: 100 },
      pf2e: { TextEditor: { enrichHTML } },
    },
    canvas: {
      ready: true, scene, level: { id: "ground" }, tokens: { controlled: [selected] },
      grid: { isSquare: true, size: 100, distance: 5, units: "ft" },
    },
    foundry: {
      data: { operators: { ForcedReplacement } },
      utils: { randomID: nextID, deepClone: copy, duplicate: copy, getProperty: getPath, setProperty: setPath, escapeHTML: value => String(value) },
      applications: {
        api: { DialogV2: { async wait(options) {
          prompts.push(options);
          if (dialogGate) await dialogGate.promise;
          const result = dialogResult;
          if (!result) return null;
          const button = options.buttons.find(entry => entry.action === result.action);
          assert.ok(button, `Dialog must offer the ${result.action} action`);
          return button.callback?.({}, { form: { elements: { bank: { value: String(result.bank ?? 0) } } } }) ?? result.action;
        } } },
        ux: { TextEditor: { enrichHTML } },
      },
      documents: { ChatMessage: chat },
    },
    ChatMessage: chat,
  };
  const original = Object.fromEntries(Object.keys(globals).map(key => [key, globalThis[key]]));
  Object.assign(globalThis, globals);
  t.mock.method(console, "error", () => {});
  t.after(() => {
    dialogGate?.resolve();
    dom.window.close();
    for (const key of Object.keys(globals)) {
      if (original[key] === undefined) delete globalThis[key];
      else globalThis[key] = original[key];
    }
  });
  const selectToken = () => selected;
  let feature = createBlasterBlastback(MODULE, { selectToken });
  const env = {
    get feature() { return feature; }, scene, combat, regions, tokens, flags, messages, messageDocuments, prompts, warnings, errors, enrichments, writes, deletions, callbacks, globals,
    get token() { return selected; },
    plan(id = selected.id) { return scene.getFlag(MODULE, `${FLAG}.${id}`); },
    addBlaster,
    select(token) { selected = token; globals.canvas.tokens.controlled = token ? [token] : []; },
    choose(action, bank) { dialogResult = { action, bank }; },
    holdDialog() { dialogGate = deferred(); },
    finishDialog(action = "cancel", bank) { dialogResult = { action, bank }; const gate = dialogGate; dialogGate = null; gate?.resolve(); },
    failPersist() { failNextPersist = true; },
    async emit(name, ...args) { await Promise.all((callbacks.get(name) ?? []).map(callback => callback(...args))); await setImmediate(); },
    async drain() { await feature.ready(); await setImmediate(); },
    async arm() { await feature.ready(); await feature.start(); },
    async damage(amount, changes = { "system.attributes.hp.value": 50 }, extra = {}) {
      await env.emit("updateActor", selected.actor, changes, { damageTaken: amount, ...extra }, "gm");
      await env.drain();
    },
    async advance(round, turn) {
      combat.round = round; combat.turn = turn;
      await env.emit("updateCombat", combat, { round, turn });
      await env.drain();
    },
    async time(value) {
      const previous = globals.game.time.worldTime;
      globals.game.time.worldTime = value;
      await env.emit("updateWorldTime", value, value - previous, {}, "gm");
      await env.drain();
    },
    async restart() { callbacks.clear(); feature = createBlasterBlastback(MODULE, { selectToken }); await feature.ready(); await setImmediate(); },
  };
  return env;
}

test("arming exposes the four APIs and persists one harmless public-schema 100-foot ellipse", async t => {
  const env = setup(t);
  for (const name of ["start", "fire", "clear", "ready"]) assert.equal(typeof env.feature[name], "function");
  await env.arm();
  const plan = env.plan();
  assert.equal(plan.status, "charging");
  assert.equal(plan.bank, 0);
  assert.equal(plan.actorUuid, env.token.actor.uuid);
  assert.equal(plan.tokenId, env.token.id);
  assert.equal(plan.combatUuid, env.combat.uuid);
  assert.equal(plan.combatantId, env.combat.turns[2].id);
  assert.equal(plan.dueRound, 5);
  assert.equal(plan.claim, null);
  assert.equal(plan.snapshotDamage, null);
  assert.equal(plan.center, null);
  assert.equal(env.prompts.length, 0, "A fresh arm needs no redundant confirmation");
  assert.equal(env.messages.length, 0);
  assert.equal(env.regions.size, 1);
  const region = env.regions.contents[0];
  assert.deepEqual(plan.regionIDs, [region.id]);
  assert.deepEqual(region.shapes, [{ type: "ellipse", x: 50, y: 50, radiusX: 2000, radiusY: 2000, rotation: 0, hole: false, gridBased: false }]);
  assert.equal(region.visibility, CONST.REGION_VISIBILITY.ALWAYS);
  assert.equal(region.flags[MODULE][MARKER].tokenId, env.token.id);
  assert.equal(region.flags[MODULE][MARKER].actorUuid, env.token.actor.uuid);
  assert.equal(region.flags[MODULE][MARKER].id, plan.id);
  assert.equal(region.behaviors?.length ?? 0, 0);
  assert.deepEqual(env.errors, []);
});

test("banks native post-resistance damage including temporary-HP-only loss without changing HP", async t => {
  const env = setup(t);
  await env.arm();
  const before = copy(env.token.actor.system.attributes.hp);
  await env.damage(17, { "system.attributes.hp.value": 66, "system.attributes.hp.temp": 2 });
  await env.damage(2, { "system.attributes.hp.temp": 0 });
  assert.equal(env.plan().bank, 19, "Use totalApplied, not net HP differences");
  assert.deepEqual(env.token.actor.system.attributes.hp, before);
  assert.equal(env.messages.length, 0);
});

test("native undo subtracts only its supplied damage amount, floors at zero, and ignores healing", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(30);
  await env.damage(-7, { "system.attributes.hp.value": 57 }, { damageUndo: true });
  assert.equal(env.plan().bank, 23);
  await env.damage(0, { "system.attributes.hp.temp": 12 }, { damageUndo: true });
  assert.equal(env.plan().bank, 23, "Native temp-HP-only undo supplies zero; do not infer another amount");
  await env.damage(-8);
  await env.damage(8, { "system.attributes.hp.value": 49 }, { damageUndo: true });
  assert.equal(env.plan().bank, 23, "Healing and undoing healing do not enter the bank");
  await env.damage(-100, { "system.attributes.hp.value": 149 }, { damageUndo: true });
  assert.equal(env.plan().bank, 0);
});

test("manual HP edits, flag updates, invalid numbers, and other actors do not infer damage", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(12);
  await env.emit("updateActor", env.token.actor, { "system.attributes.hp.value": 1 }, {}, "gm");
  await env.emit("updateActor", env.token.actor, { flags: { [MODULE]: { note: "own write" } } }, {}, "gm");
  await env.emit("updateActor", env.addBlaster("other").actor, { "system.attributes.hp.value": 1 }, { damageTaken: 99 }, "gm");
  for (const invalid of [0, NaN, Infinity, -Infinity, "15", undefined]) await env.damage(invalid);
  await env.drain();
  assert.equal(env.plan().bank, 12);
});

for (const scenario of ["no combat", "unstarted combat", "other scene", "not a combatant"]) {
  test(`arming is allowed with ${scenario} and uses six world seconds`, async t => {
    const env = setup(t, { inCombat: scenario !== "no combat" });
    if (scenario === "unstarted combat") env.combat.started = false;
    if (scenario === "other scene") { env.combat.scene = { id: "elsewhere" }; env.combat.sceneId = "elsewhere"; }
    if (scenario === "not a combatant") {
      env.combat.turns[2].tokenId = "different-token";
      env.combat.turns[2].actor = env.token.actor;
    }
    await env.arm();
    await env.damage(9);
    assert.equal(env.plan().status, "charging");
    assert.equal(env.plan().combatUuid, null);
    await env.time(105);
    assert.equal(env.messages.length, 0);
    await env.time(106);
    assert.equal(env.messages.length, 1);
  });
}

for (const [turn, dueRound] of [[0, 4], [2, 5], [3, 5]]) {
  test(`next own turn schedules from turn ${turn} to round ${dueRound} without an action gate`, async t => {
    const env = setup(t, { currentTurn: turn });
    await env.arm();
    await env.damage(11);
    assert.equal(env.plan().dueRound, dueRound);
    await env.advance(dueRound, 1);
    assert.equal(env.messages.length, 0, "Another combatant's turn cannot release Blastback");
    await env.advance(dueRound, 2);
    assert.equal(env.messages.length, 1);
  });
}

test("combat-backed charging ignores six-second expiry and manual fire is available early", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(13);
  await env.time(1000);
  assert.equal(env.messages.length, 0);
  await env.feature.fire();
  assert.equal(env.messages.length, 1);
});

test("movement follows the token, and firing snapshots its current center and exact flat damage", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(23);
  env.token.document.x = 500; env.token.document.y = 700;
  env.token.center = { x: 550, y: 750 };
  await env.emit("updateToken", env.token.document, { x: 500, y: 700 }, {}, "gm");
  await env.drain();
  assert.equal(env.regions.contents[0].shapes[0].x, 550);
  assert.equal(env.regions.contents[0].shapes[0].y, 750);
  await env.feature.fire();
  assert.equal(env.plan().snapshotDamage, 23);
  assert.deepEqual(env.plan().center, { x: 550, y: 750 });
  assert.equal(env.plan().status, "fired");
  assert.equal(env.messages.length, 1);
  const enrichment = env.enrichments[0];
  assert.match(enrichment.content, /@Damage\[23\[force\]\|[^\]]*immutable/);
  assert.match(enrichment.content, /@Check\[reflex\|dc:40\|basic/);
  assert.doesNotMatch(enrichment.content, /\d+d\d+/);
  assert.equal(enrichment.options.relativeTo, env.token.ability);
  assert.equal(enrichment.options.rollData.fromAbility, true);
  const holder = document.createElement("div");
  holder.innerHTML = env.messages[0].content;
  const links = holder.querySelectorAll("a[data-damage-roll]");
  assert.equal(links.length, 1);
  assert.equal(links[0].dataset.formula, "23[force]");
  assert.equal(links[0].dataset.damageRoll, "23[force]");
  assert.equal(links[0].hasAttribute("data-base-formula"), false);
  assert.equal(links[0].classList.contains("altered"), false);
  assert.doesNotMatch(links[0].dataset.tooltip ?? "", /base formula/i);
  assert.match(links[0].textContent, /23/);
  assert.match(env.messages[0].content, /exclud|except|other creatures/i);
  assert.equal(env.messages[0].speaker.actor, env.token.actor.id);
  assert.equal(env.messages[0].flags.pf2e.origin.actor, env.token.actor.uuid);
  const marker = env.messages[0].getFlag(MODULE, MARKER);
  assert.equal(marker.sourceAbilitySlug, "blaster-blastback");
  assert.equal(marker.actorUuid, env.token.actor.uuid);
  assert.equal(marker.snapshotDamage, 23);
  assert.deepEqual(marker.center, { x: 550, y: 750 });
});

test("native card enrichment uses the actor as fallback when no Blastback ability is embedded", async t => {
  const env = setup(t);
  env.token.actor.items.clear(); env.token.actor.itemTypes.action = [];
  await env.arm();
  await env.damage(18);
  await env.feature.fire();
  assert.equal(env.messages.length, 1);
  assert.equal(env.enrichments[0].options.relativeTo, env.token.actor);
  assert.equal(env.enrichments[0].options.rollData.fromActor, true);
});

test("a repeated macro inspects the bank; cancelling preserves the live plan and region", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(22);
  const before = env.plan();
  const regionIds = [...env.regions.keys()];
  await env.feature.start();
  assert.equal(env.prompts.length, 1);
  assert.deepEqual(new Set(env.prompts[0].buttons.map(button => button.action)), new Set(["save", "rearm", "clear", "cancel"]));
  assert.match(env.prompts[0].content, /name=["']bank["']/);
  assert.match(env.prompts[0].content, /22/);
  assert.deepEqual(env.plan(), before);
  assert.deepEqual([...env.regions.keys()], regionIds);
});

test("manual bank adjustment applies its delta to damage accrued while the dialog is open", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(20);
  env.holdDialog();
  const editing = env.feature.start();
  await setImmediate();
  await env.damage(7);
  env.finishDialog("save", 30);
  await editing;
  assert.equal(env.plan().bank, 37, "Add the GM's +10 adjustment to the current 27");
  assert.equal(env.regions.size, 1);
  assert.equal(env.messages.length, 0);
});

test("negative manual bank adjustments are rejected without silently replacing the charge", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(20);
  const before = env.plan();
  env.choose("save", -1);
  await env.feature.start();
  assert.deepEqual(env.plan(), before);
  assert.ok(env.errors.length + env.warnings.length > 0);
});

for (const [label, value] of [["blank", ""], ["whitespace", "   "], ["fractional", "1.5"], ["NaN", "NaN"], ["positive infinity", "Infinity"], ["negative infinity", "-Infinity"]]) {
  test(`a ${label} manual bank entry preserves the original charge`, async t => {
    const env = setup(t);
    await env.arm();
    await env.damage(20);
    const before = env.plan();
    env.choose("save", value);
    await env.feature.start();
    assert.deepEqual(env.plan(), before);
    assert.deepEqual([...env.regions.keys()], before.regionIDs);
    assert.equal(env.messages.length, 0);
    assert.ok(env.warnings.length + env.errors.length > 0);
  });
}

for (const adjusted of [5, 0]) {
  test(`a valid manual decrease to ${adjusted} keeps the same charge and schedule`, async t => {
    const env = setup(t);
    await env.arm();
    await env.damage(20);
    const before = env.plan();
    env.choose("save", adjusted);
    await env.feature.start();
    assert.deepEqual(env.plan(), { ...before, bank: adjusted });
    assert.deepEqual([...env.regions.keys()], before.regionIDs);
    assert.equal(env.messages.length, 0);
    assert.deepEqual(env.errors, []);
  });
}

test("explicit rearm zeroes the bank with a new identity and whole-plan replacement", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(20);
  const before = env.plan();
  await env.scene.setFlag(MODULE, `${FLAG}.blaster`, { legacyField: "must disappear" });
  env.choose("rearm");
  await env.feature.start();
  assert.equal(env.plan().bank, 0);
  assert.equal(env.plan().status, "charging");
  assert.notEqual(env.plan().id, before.id);
  assert.equal(env.plan().legacyField, undefined);
  assert.equal(env.plan().claim, null);
  assert.equal(env.regions.size, 1);
  assert.notDeepEqual(env.plan().regionIDs, before.regionIDs);
});

test("the repeated-macro clear choice deletes only its own warning and persisted plan", async t => {
  const env = setup(t);
  await env.arm();
  const [foreign] = await env.scene.createEmbeddedDocuments("Region", [{ name: "foreign", flags: {} }]);
  env.choose("clear");
  await env.feature.start();
  assert.equal(env.plan(), undefined);
  assert.deepEqual([...env.regions.keys()], [foreign.id]);
});

test("Clear Blastback ignores forged foreign region IDs and other Blasters' warnings", async t => {
  const env = setup(t);
  await env.arm();
  const first = env.token;
  const firstPlan = env.plan();
  const other = env.addBlaster("other");
  env.select(other);
  await env.feature.start();
  const otherPlan = env.plan();
  env.select(first);
  await env.scene.setFlag(MODULE, `${FLAG}.blaster`, { regionIDs: otherPlan.regionIDs });
  await env.feature.clear();
  assert.equal(env.plan(), undefined);
  assert.equal(env.plan("other").id, otherPlan.id);
  assert.deepEqual([...env.regions.keys()], otherPlan.regionIDs);
  assert.ok(env.deletions.flat().includes(firstPlan.regionIDs[0]));
  assert.equal(env.deletions.flat().includes(otherPlan.regionIDs[0]), false);
});

for (const change of ["selection", "scene", "actor", "ownership"]) {
  test(`an open bank dialog rejects a changed ${change}`, async t => {
    const env = setup(t);
    await env.arm();
    await env.damage(20);
    const original = env.token;
    env.holdDialog();
    const editing = env.feature.start();
    await setImmediate();
    if (change === "selection") env.select(env.addBlaster("other"));
    if (change === "scene") env.globals.canvas.scene = { id: "elsewhere" };
    if (change === "actor") {
      const replacement = { ...original.actor, id: "replacement", uuid: "Actor.replacement" };
      original.actor = replacement; original.document.actor = replacement;
    }
    if (change === "ownership") original.document.isOwner = false;
    env.finishDialog("save", 30);
    await editing;
    assert.equal(env.plan(original.id).bank, 20);
    assert.equal(env.messages.length, 0);
  });
}

test("moving while a bank dialog is open does not invalidate the GM's adjustment", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(20);
  env.holdDialog();
  const editing = env.feature.start();
  await setImmediate();
  env.token.document.x = 900; env.token.center = { x: 950, y: 50 };
  await env.emit("updateToken", env.token.document, { x: 900 }, {}, "gm");
  env.finishDialog("save", 25);
  await editing;
  await env.drain();
  assert.equal(env.plan().bank, 25);
  assert.equal(env.regions.contents[0].shapes[0].x, 950);
});

for (const invalid of ["player", "secondary GM", "token ownership", "actor ownership", "role", "detached token"]) {
  test(`arming refuses ${invalid} without creating state or warnings`, async t => {
    const env = setup(t);
    if (invalid === "player") env.globals.game.user.isGM = false;
    if (invalid === "secondary GM") env.globals.game.users.activeGM = { id: "other-gm", isGM: true };
    if (invalid === "token ownership") env.token.document.isOwner = false;
    if (invalid === "actor ownership") env.token.actor.isOwner = false;
    if (invalid === "role") env.token.actorFlags.blasterRole = "thrall";
    if (invalid === "detached token") env.tokens.delete(env.token.id);
    await env.arm();
    assert.equal(env.plan(), undefined);
    assert.equal(env.regions.size, 0);
    assert.equal(env.messages.length, 0);
  });
}

test("automatic and manual publication racing duplicate hooks publish at most one card", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(28);
  env.combat.round = 5;
  await Promise.all([
    env.feature.fire(),
    env.emit("combatTurnChange", env.combat, { round: 4 }, { round: 5 }),
    env.emit("updateCombat", env.combat, { round: 5, turn: 2 }),
    env.feature.fire(),
  ]);
  await env.drain();
  assert.equal(env.messages.length, 1);
  assert.equal(env.plan().status, "fired");
  assert.equal(env.plan().snapshotDamage, 28);
  await env.restart();
  await env.feature.ready();
  await env.feature.fire();
  assert.equal(env.messages.length, 1);
  assert.equal(env.callbacks.get("updateCombat").length, 1);
});

test("only the active GM accrues and publishes; handover reconciles the due charge once", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(15);
  env.globals.game.users.activeGM = { id: "next-gm", isGM: true };
  await env.damage(10);
  assert.equal(env.plan().bank, 15);
  await env.advance(5, 2);
  assert.equal(env.messages.length, 0);
  env.globals.game.user = { id: "next-gm", isGM: true };
  await Promise.all([env.emit("userConnected", {}, true), env.emit("updateUser", {}, { active: true })]);
  await env.drain();
  assert.equal(env.messages.length, 1);
  await env.restart();
  assert.equal(env.messages.length, 1);
});

test("queued native damage losing GM authority makes no late write and reports its unsaved amount", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(15);
  const update = env.scene.updateEmbeddedDocuments;
  const gate = deferred();
  let entered = false;
  t.mock.method(env.scene, "updateEmbeddedDocuments", async function (...args) {
    // The Region write starts under the primary GM; hold its acknowledgement so
    // the damage hook queues behind it before this client loses authority.
    const result = await update.apply(this, args);
    entered = true;
    await gate.promise;
    return result;
  });
  env.token.document.x = 300;
  env.token.center = { x: 350, y: 50 };
  const moving = env.emit("updateToken", env.token.document, { x: 300 }, {}, "gm");
  await setImmediate();
  assert.equal(entered, true);
  const damage = env.emit("updateActor", env.token.actor, { "system.attributes.hp.value": 32 }, { damageTaken: 17 }, "gm");
  const writesBeforeHandover = env.writes.length;
  env.globals.game.users.activeGM = { id: "next-gm", isGM: true };
  gate.resolve();
  await Promise.all([moving, damage]);
  await env.drain();
  assert.equal(env.plan().bank, 15);
  assert.equal(env.writes.length, writesBeforeHandover, "The former primary GM must not persist queued damage");
  assert.equal(env.messages.length, 0);
  assert.match(env.warnings.join(" "), /authority changed/i);
  assert.match(env.warnings.join(" "), /\+17/);
  assert.match(env.warnings.join(" "), /inspect the bank.*active GM/i);
});

test("authority loss during held enrichment retains its claim without a card or unauthorized late write", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(20);
  const enrich = env.globals.game.pf2e.TextEditor.enrichHTML;
  const gate = deferred();
  let entered = false;
  t.mock.method(env.globals.game.pf2e.TextEditor, "enrichHTML", async (...args) => {
    entered = true;
    await gate.promise;
    return enrich(...args);
  });
  const firing = env.feature.fire();
  await setImmediate();
  assert.equal(entered, true);
  const claimed = env.plan();
  assert.equal(claimed.status, "publishing");
  assert.equal(claimed.snapshotDamage, 20);
  assert.ok(claimed.claim);
  const writesBeforeHandover = env.writes.length;
  env.globals.game.users.activeGM = { id: "next-gm", isGM: true };
  gate.resolve();
  await firing;
  await env.drain();
  assert.equal(env.messages.length, 0);
  assert.equal(env.writes.length, writesBeforeHandover);
  assert.deepEqual(env.plan(), claimed, "A former primary GM must not clear or replace the durable claim");
  env.globals.game.user = { id: "next-gm", isGM: true };
  await env.restart();
  await env.feature.fire();
  assert.equal(env.messages.length, 0);
  assert.deepEqual(env.plan(), claimed);
  assert.match(env.warnings.join(" "), /uncertain/i);
});

for (const outcome of ["reject", "undefined"]) {
  test(`${outcome} chat acknowledgement stays uncertain across hooks, reload, and manual fire`, async t => {
    const env = setup(t);
    await env.arm();
    await env.damage(24);
    let attempts = 0;
    t.mock.method(foundry.documents.ChatMessage.implementation, "create", async () => {
      attempts++;
      if (outcome === "reject") throw new Error("chat acknowledgement unavailable");
      return undefined;
    });
    await env.feature.fire();
    assert.equal(attempts, 1);
    assert.equal(env.plan().status, "publishing");
    assert.ok(env.plan().claim);
    assert.equal(env.plan().snapshotDamage, 24);
    await env.restart();
    await env.advance(5, 2);
    await env.feature.fire();
    assert.equal(attempts, 1);
    assert.equal(env.messages.length, 0);
    assert.match(env.warnings.join(" "), /uncertain|may have succeeded/i);
  });
}

test("a stored card whose acknowledgement was lost recovers from its stable ID without republishing", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(19);
  const create = foundry.documents.ChatMessage.implementation.create;
  let attempts = 0;
  t.mock.method(foundry.documents.ChatMessage.implementation, "create", async function (...args) {
    attempts++;
    await create.apply(this, args);
    throw new Error("stored card acknowledgement lost");
  });
  await env.feature.fire();
  assert.equal(env.messages.length, 1);
  assert.equal(env.plan().status, "publishing");
  await env.restart();
  assert.equal(env.plan().status, "fired");
  await env.feature.fire();
  assert.equal(attempts, 1);
});

test("a failed durable claim creates no card and can be safely retried", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(14);
  env.failPersist();
  await env.feature.fire();
  assert.equal(env.messages.length, 0);
  assert.equal(env.plan().status, "charging");
  await env.feature.fire();
  assert.equal(env.messages.length, 1);
});

test("a persisted claim with a lost acknowledgement blocks uncertain publication retries", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(16);
  const setFlag = env.scene.setFlag;
  let failed = false;
  t.mock.method(env.scene, "setFlag", async function (...args) {
    const result = await setFlag.apply(this, args);
    if (!failed && args[2].status === "publishing") { failed = true; throw new Error("claim acknowledgement lost"); }
    return result;
  });
  await env.feature.fire();
  assert.equal(env.plan().status, "publishing");
  assert.equal(env.messages.length, 0);
  await env.restart();
  await env.feature.fire();
  assert.equal(env.messages.length, 0);
});

test("failure to persist fired state recovers the existing card after reload", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(16);
  const setFlag = env.scene.setFlag;
  let failed = false;
  t.mock.method(env.scene, "setFlag", async function (...args) {
    if (!failed && args[2].status === "fired") { failed = true; throw new Error("final state save failed"); }
    return setFlag.apply(this, args);
  });
  await env.feature.fire();
  assert.equal(env.plan().status, "publishing");
  assert.equal(env.messages.length, 1);
  await env.restart();
  assert.equal(env.plan().status, "fired");
  await env.feature.fire();
  assert.equal(env.messages.length, 1);
});

test("explicit clear followed by arm is available after uncertain publication", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(16);
  const createMock = t.mock.method(foundry.documents.ChatMessage.implementation, "create", async () => { throw new Error("uncertain"); });
  await env.feature.fire();
  const previous = env.plan();
  await env.feature.clear();
  assert.equal(env.plan(), undefined);
  createMock.mock.restore();
  await env.feature.start();
  assert.equal(env.plan().status, "charging");
  assert.equal(env.plan().bank, 0);
  assert.notEqual(env.plan().id, previous.id);
  assert.notEqual(env.plan().messageId, previous.messageId);
});

test("token deletion removes its warning and state and prevents subsequent timed fire", async t => {
  const env = setup(t, { inCombat: false });
  await env.arm();
  await env.damage(8);
  env.tokens.delete(env.token.id);
  await env.emit("deleteToken", env.token.document, {}, "gm");
  await env.drain();
  assert.equal(env.plan(), undefined);
  assert.equal(env.regions.size, 0);
  await env.time(106);
  assert.equal(env.messages.length, 0);
});

test("deleting the bound combat clears its warning without publishing a stale blast", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(8);
  env.globals.game.combat = null;
  env.globals.game.combats.delete(env.combat.id);
  await env.emit("deleteCombat", env.combat, {}, "gm");
  await env.drain();
  assert.equal(env.plan(), undefined);
  assert.equal(env.regions.size, 0);
  await env.time(106);
  assert.equal(env.messages.length, 0);
});

test("clear invalidates an open bank dialog so a late save cannot resurrect its plan", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(20);
  env.holdDialog();
  const editing = env.feature.start();
  await setImmediate();
  await env.feature.clear();
  env.finishDialog("save", 50);
  await editing;
  await env.drain();
  assert.equal(env.plan(), undefined);
  assert.equal(env.regions.size, 0);
  assert.equal(env.messages.length, 0);
});

test("clear while warning creation is in flight cleans up only the newly created warning", async t => {
  const env = setup(t);
  await env.feature.ready();
  const [foreign] = await env.scene.createEmbeddedDocuments("Region", [{ name: "foreign", flags: {} }]);
  const create = env.scene.createEmbeddedDocuments;
  const gate = deferred();
  t.mock.method(env.scene, "createEmbeddedDocuments", async function (...args) { await gate.promise; return create.apply(this, args); });
  const arming = env.feature.start();
  await setImmediate();
  const clearing = env.feature.clear();
  gate.resolve();
  await Promise.all([arming, clearing]);
  await env.drain();
  assert.equal(env.plan(), undefined);
  assert.deepEqual([...env.regions.keys()], [foreign.id]);
  assert.equal(env.messages.length, 0);
});

test("clear during native enrichment cancels publication before creating a chat card", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(20);
  const enrich = env.globals.game.pf2e.TextEditor.enrichHTML;
  const gate = deferred();
  t.mock.method(env.globals.game.pf2e.TextEditor, "enrichHTML", async (...args) => { await gate.promise; return enrich(...args); });
  const firing = env.feature.fire();
  await setImmediate();
  const clearing = env.feature.clear();
  gate.resolve();
  await Promise.all([firing, clearing]);
  await env.drain();
  assert.equal(env.plan(), undefined);
  assert.equal(env.regions.size, 0);
  assert.equal(env.messages.length, 0);
});

test("ready is idempotent and drains fire jobs even when Foundry ignores hook return promises", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(20);
  const create = foundry.documents.ChatMessage.implementation.create;
  const gate = deferred();
  let entered = false;
  t.mock.method(foundry.documents.ChatMessage.implementation, "create", async function (...args) { entered = true; await gate.promise; return create.apply(this, args); });
  env.combat.round = 5;
  for (const callback of env.callbacks.get("updateCombat")) callback(env.combat, { round: 5, turn: 2 });
  await setImmediate();
  assert.equal(entered, true);
  let drained = false;
  const draining = env.feature.ready().then(() => { drained = true; });
  await setImmediate();
  assert.equal(drained, false);
  gate.resolve();
  await draining;
  assert.equal(env.messages.length, 1);
  assert.equal(env.plan().status, "fired");
  for (const listeners of env.callbacks.values()) assert.equal(listeners.length, 1);
});

test("the durable publishing claim, exact damage, and message ID are saved before chat creation", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(31);
  const create = foundry.documents.ChatMessage.implementation.create;
  t.mock.method(foundry.documents.ChatMessage.implementation, "create", async function (data, options) {
    const persisted = env.plan();
    assert.equal(persisted.status, "publishing");
    assert.ok(persisted.claim);
    assert.equal(persisted.snapshotDamage, 31);
    assert.equal(persisted.messageId, data._id);
    assert.deepEqual(persisted.center, { x: 50, y: 50 });
    return create.call(this, data, options);
  });
  await env.feature.fire();
  assert.equal(env.messages.length, 1);
  await env.damage(100);
  await env.damage(-31, {}, { damageUndo: true });
  assert.equal(env.plan().bank, 31);
  assert.equal(env.plan().snapshotDamage, 31);
  assert.equal(env.messages.length, 1);
});

test("outside-combat reload reconciles an expired charge once", async t => {
  const env = setup(t, { inCombat: false });
  await env.arm();
  await env.damage(6);
  env.globals.game.time.worldTime = 109;
  await env.restart();
  assert.equal(env.messages.length, 1);
  await env.restart();
  await env.time(110);
  assert.equal(env.messages.length, 1);
});

for (const change of ["missed", "rewound"]) {
  test(`a ${change} own turn enters recovery and requires manual release`, async t => {
    const env = setup(t);
    await env.arm();
    await env.damage(10);
    await env.advance(change === "missed" ? 6 : 3, 2);
    assert.equal(env.plan().status, "recovery");
    assert.equal(env.messages.length, 0);
    await env.advance(5, 2);
    assert.equal(env.messages.length, 0, "Replaying the original due turn cannot silently recover");
    await env.feature.fire();
    assert.equal(env.messages.length, 1);
    assert.equal(env.plan().snapshotDamage, 10);
  });
}

test("a removed combatant clears its bound charge and cannot transfer it to another combatant", async t => {
  const env = setup(t);
  await env.arm();
  const removed = env.combat.turns[2];
  env.combat.turns[2] = { id: "replacement-combatant", tokenId: env.token.id, actor: env.token.actor };
  env.combat.combatants.delete(removed.id);
  await env.emit("deleteCombatant", removed, {}, "gm");
  await env.drain();
  assert.equal(env.plan(), undefined);
  assert.equal(env.regions.size, 0);
  assert.equal(env.messages.length, 0);
});

test("deleting an unrelated combat leaves an outside-combat charge armed", async t => {
  const env = setup(t, { inCombat: false });
  await env.arm();
  const before = env.plan();
  await env.emit("deleteCombat", { id: "elsewhere", uuid: "Combat.elsewhere", scene: { id: "another-scene" } }, {}, "gm");
  await env.drain();
  assert.deepEqual(env.plan(), before);
  assert.equal(env.regions.size, 1);
});

test("a same-ID chat with another plan's marker cannot resolve an uncertain publication", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(18);
  let attempts = 0;
  t.mock.method(foundry.documents.ChatMessage.implementation, "create", async () => { attempts++; throw new Error("unknown publication"); });
  await env.feature.fire();
  const plan = env.plan();
  env.messageDocuments.set(plan.messageId, {
    id: plan.messageId,
    getFlag: () => ({ id: "different-plan", sceneId: env.scene.id, tokenId: plan.tokenId, actorUuid: plan.actorUuid }),
  });
  await env.restart();
  await env.feature.fire();
  assert.equal(env.plan().status, "publishing");
  assert.equal(attempts, 1);
});

test("malformed persisted state cannot publish or delete unrelated warning documents", async t => {
  const env = setup(t);
  const [foreign] = await env.scene.createEmbeddedDocuments("Region", [{ name: "foreign", flags: {} }]);
  await env.scene.setFlag(MODULE, `${FLAG}.blaster`, {
    id: "broken", tokenId: "blaster", actorUuid: env.token.actor.uuid, status: "charging", bank: NaN,
    regionIDs: [foreign.id], messageId: "broken-message", claim: null,
  });
  await env.feature.ready();
  await env.feature.start();
  await env.feature.fire();
  assert.equal(env.messages.length, 0);
  assert.deepEqual([...env.regions.keys()], [foreign.id]);
  assert.ok(env.warnings.length > 0);
  await env.feature.clear();
  assert.equal(env.plan(), undefined);
  assert.deepEqual([...env.regions.keys()], [foreign.id]);
});

test("a replaced token actor cannot release or collect damage for the previous owner", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(12);
  const previous = env.token.actor;
  const replacement = env.addBlaster("replacement").actor;
  env.token.actor = replacement;
  env.token.document.actor = replacement;
  await env.emit("updateActor", previous, { "system.attributes.hp.value": 1 }, { damageTaken: 40 }, "gm");
  await env.advance(5, 2);
  await env.feature.fire();
  assert.equal(env.messages.length, 0);
  assert.equal(env.plan(), undefined);
});

test("clear during automatic enrichment prevents an expired charge from publishing", async t => {
  const env = setup(t, { inCombat: false });
  await env.arm();
  await env.damage(20);
  const enrich = env.globals.game.pf2e.TextEditor.enrichHTML;
  const gate = deferred();
  let entered = false;
  t.mock.method(env.globals.game.pf2e.TextEditor, "enrichHTML", async (...args) => { entered = true; await gate.promise; return enrich(...args); });
  env.globals.game.time.worldTime = 106;
  const firing = env.emit("updateWorldTime", 106, 6, {}, "gm");
  await setImmediate();
  assert.equal(entered, true);
  const clearing = env.feature.clear();
  gate.resolve();
  await Promise.all([firing, clearing]);
  await env.drain();
  assert.equal(env.plan(), undefined);
  assert.equal(env.regions.size, 0);
  assert.equal(env.messages.length, 0);
});

test("clear cancels automatic release already queued behind a movement Region update", async t => {
  const env = setup(t, { inCombat: false });
  await env.arm();
  await env.damage(20);
  const update = env.scene.updateEmbeddedDocuments;
  const gate = deferred();
  let entered = false;
  t.mock.method(env.scene, "updateEmbeddedDocuments", async function (...args) {
    const result = await update.apply(this, args);
    entered = true;
    await gate.promise;
    return result;
  });
  env.token.document.x = 300;
  env.token.center = { x: 350, y: 50 };
  const moving = env.emit("updateToken", env.token.document, { x: 300 }, {}, "gm");
  await setImmediate();
  assert.equal(entered, true);
  env.globals.game.time.worldTime = 106;
  const automaticRelease = env.emit("updateWorldTime", 106, 6, {}, "gm");
  const clearing = env.feature.clear();
  gate.resolve();
  await Promise.all([moving, automaticRelease, clearing]);
  await env.drain();
  assert.equal(env.messages.length, 0, "The queued automatic job must observe Clear before entering publication");
  assert.equal(env.plan(), undefined);
  assert.equal(env.regions.size, 0);
});

test("the bank dialog Clear choice cancels the same plan after automatic publication has begun", async t => {
  const env = setup(t, { inCombat: false });
  await env.arm();
  await env.damage(20);
  env.holdDialog();
  const editing = env.feature.start();
  await setImmediate();
  assert.equal(env.prompts.length, 1);
  const enrich = env.globals.game.pf2e.TextEditor.enrichHTML;
  const gate = deferred();
  let entered = false;
  t.mock.method(env.globals.game.pf2e.TextEditor, "enrichHTML", async (...args) => {
    entered = true;
    await gate.promise;
    return enrich(...args);
  });
  env.globals.game.time.worldTime = 106;
  const automaticRelease = env.emit("updateWorldTime", 106, 6, {}, "gm");
  await setImmediate();
  assert.equal(entered, true);
  assert.equal(env.plan().status, "publishing");
  env.finishDialog("clear");
  await setImmediate();
  gate.resolve();
  await Promise.all([automaticRelease, editing]);
  await env.drain();
  assert.equal(env.messages.length, 0, "Clear remains valid for the same plan despite its charging-to-publishing transition");
  assert.equal(env.plan(), undefined);
  assert.equal(env.regions.size, 0);
});

test("automatic release while the inspection dialog is open prevents a late bank save", async t => {
  const env = setup(t, { inCombat: false });
  await env.arm();
  await env.damage(20);
  env.holdDialog();
  const editing = env.feature.start();
  await setImmediate();
  await env.time(106);
  assert.equal(env.messages.length, 1);
  env.finishDialog("save", 99);
  await editing;
  assert.equal(env.plan().status, "fired");
  assert.equal(env.plan().snapshotDamage, 20);
});

test("manual fire revalidates selection after asynchronous native enrichment", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(20);
  const original = env.token;
  const enrich = env.globals.game.pf2e.TextEditor.enrichHTML;
  const gate = deferred();
  t.mock.method(env.globals.game.pf2e.TextEditor, "enrichHTML", async (...args) => { await gate.promise; return enrich(...args); });
  const firing = env.feature.fire();
  await setImmediate();
  env.select(env.addBlaster("other"));
  gate.resolve();
  await firing;
  assert.equal(env.messages.length, 0);
  assert.equal(env.plan(original.id).status, "recovery");
  assert.equal(env.plan(original.id).bank, 20);
});

test("movement during native enrichment releases from the new center without locking the token", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(20);
  const enrich = env.globals.game.pf2e.TextEditor.enrichHTML;
  const gate = deferred();
  t.mock.method(env.globals.game.pf2e.TextEditor, "enrichHTML", async (...args) => { await gate.promise; return enrich(...args); });
  const firing = env.feature.fire();
  await setImmediate();
  env.token.document.x = 1200; env.token.document.y = 200;
  env.token.center = { x: 1250, y: 250 };
  gate.resolve();
  await firing;
  assert.equal(env.messages.length, 1);
  assert.deepEqual(env.plan().center, { x: 1250, y: 250 });
});

for (const linkCount of [0, 2]) {
  test(`${linkCount} enriched damage links stop chat creation and leave a recoverable bank`, async t => {
    const env = setup(t);
    await env.arm();
    await env.damage(20);
    t.mock.method(env.globals.game.pf2e.TextEditor, "enrichHTML", async () => '<a data-damage-roll="24[force]">24 force</a>'.repeat(linkCount));
    await env.feature.fire();
    assert.equal(env.messages.length, 0);
    assert.equal(env.plan().status, "recovery");
    assert.equal(env.plan().claim, null);
    assert.ok(env.errors.length > 0);
  });
}

test("failed rearm persistence retains the prior bank and only its previous warning", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(20);
  const before = env.plan();
  env.choose("rearm");
  env.failPersist();
  await env.feature.start();
  assert.deepEqual(env.plan(), before);
  assert.deepEqual([...env.regions.keys()], before.regionIDs);
  assert.equal(env.messages.length, 0);
});

test("failed warning cleanup leaves durable clearing state that ready can finish", async t => {
  const env = setup(t);
  await env.arm();
  const remove = env.scene.deleteEmbeddedDocuments;
  let failed = false;
  t.mock.method(env.scene, "deleteEmbeddedDocuments", async function (...args) {
    if (!failed) { failed = true; throw new Error("Region cleanup unavailable"); }
    return remove.apply(this, args);
  });
  await env.feature.clear();
  assert.equal(env.plan().status, "clearing");
  assert.equal(env.messages.length, 0);
  await env.restart();
  assert.equal(env.plan(), undefined);
  assert.equal(env.regions.size, 0);
});

test("publication cutoff freezes the bank before delayed enrichment and ignores subsequent damage", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(20);
  const enrich = env.globals.game.pf2e.TextEditor.enrichHTML;
  const gate = deferred();
  let entered = false;
  t.mock.method(env.globals.game.pf2e.TextEditor, "enrichHTML", async (...args) => { entered = true; await gate.promise; return enrich(...args); });
  const firing = env.feature.fire();
  await setImmediate();
  assert.equal(entered, true);
  assert.equal(env.plan().status, "publishing");
  assert.equal(env.plan().snapshotDamage, 20);
  const laterDamage = env.emit("updateActor", env.token.actor, { "system.attributes.hp.value": 1 }, { damageTaken: 72 }, "gm");
  gate.resolve();
  await Promise.all([firing, laterDamage]);
  await env.drain();
  assert.equal(env.plan().bank, 20);
  assert.equal(env.plan().snapshotDamage, 20);
  assert.equal(env.messages.length, 1);
  assert.equal(env.messages[0].getFlag(MODULE, MARKER).snapshotDamage, 20);
});

test("native damage queued before Fire finishes saving before the release snapshot is taken", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(10);
  const setFlag = env.scene.setFlag;
  const gate = deferred();
  let entered = false;
  t.mock.method(env.scene, "setFlag", async function (...args) {
    const value = args[2];
    if (!entered && value?.status === "charging" && value.bank === 27) {
      entered = true;
      await gate.promise;
    }
    return setFlag.apply(this, args);
  });
  const damage = env.emit("updateActor", env.token.actor, { "system.attributes.hp.value": 46 }, { damageTaken: 17 }, "gm");
  await setImmediate();
  assert.equal(entered, true);
  assert.equal(env.plan().bank, 10, "The native damage write is still awaiting persistence");
  const firing = env.feature.fire();
  await setImmediate();
  assert.equal(env.messages.length, 0);
  assert.equal(env.plan().status, "charging");
  gate.resolve();
  await Promise.all([damage, firing]);
  await env.drain();
  assert.equal(env.plan().bank, 27);
  assert.equal(env.plan().snapshotDamage, 27);
  assert.equal(env.plan().status, "fired");
  assert.equal(env.messages.length, 1);
  assert.equal(env.messages[0].getFlag(MODULE, MARKER).snapshotDamage, 27);
  const holder = document.createElement("div");
  holder.innerHTML = env.messages[0].content;
  assert.equal(holder.querySelector("a[data-damage-roll]").dataset.formula, "27[force]");
});

test("movement during the Region publication update refreshes the final center without a movement lock", async t => {
  const env = setup(t);
  await env.arm();
  await env.damage(20);
  const update = env.scene.updateEmbeddedDocuments;
  let moved = false;
  t.mock.method(env.scene, "updateEmbeddedDocuments", async function (...args) {
    const result = await update.apply(this, args);
    if (!moved) {
      moved = true;
      env.token.document.x = 400; env.token.document.y = 600;
      env.token.center = { x: 450, y: 650 };
    }
    return result;
  });
  await env.feature.fire();
  assert.equal(moved, true);
  assert.equal(env.messages.length, 1);
  assert.equal(env.plan().status, "fired");
  assert.deepEqual(env.plan().center, { x: 450, y: 650 });
  assert.deepEqual(env.messages[0].getFlag(MODULE, MARKER).center, { x: 450, y: 650 });
  assert.equal(env.regions.contents[0].shapes[0].x, 450);
  assert.equal(env.regions.contents[0].shapes[0].y, 650);
  assert.deepEqual(env.errors, []);
});

test("Region membership token hooks and unchanged reconciliation do not rewrite warning Regions", async t => {
  const env = setup(t);
  await env.arm();
  const writesBefore = env.writes.filter(write => write.type === "regionUpdate").length;
  await env.emit("updateToken", env.token.document, { _regions: env.plan().regionIDs }, {}, "gm");
  await env.emit("updateUser", {}, { active: true });
  await env.emit("canvasReady", env.globals.canvas);
  await env.drain();
  assert.equal(env.writes.filter(write => write.type === "regionUpdate").length, writesBefore);
});

test("reload removes a tagged orphan warning while retaining untagged Regions", async t => {
  const env = setup(t);
  const [orphan, foreign] = await env.scene.createEmbeddedDocuments("Region", [
    { name: "orphan", flags: { [MODULE]: { [MARKER]: { id: "orphan-plan", tokenId: env.token.id, actorUuid: env.token.actor.uuid, status: "warning" } } } },
    { name: "foreign", flags: {} },
  ]);
  await env.feature.ready();
  assert.equal(env.regions.has(orphan.id), false);
  assert.equal(env.regions.has(foreign.id), true);
  assert.equal(env.messages.length, 0);
});
