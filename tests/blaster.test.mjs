import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { BLAST_TIERS, lineShapes, isBlastRooted } from "../dist/scripts/features/blaster-model.js";
import { createBlasterFeature } from "../dist/scripts/features/blaster.js";

const MODULE = "astillon-hanaq-adventures-module";
const points = [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 250, y: 150 }, { x: 350, y: 150 }];
test("five waypoints produce four native line shapes with three-square full width", () => {
  const shapes = lineShapes(points, 100, 3);
  assert.equal(shapes.length, 4);
  assert.deepEqual(shapes.map(s => s.width), [300, 300, 300, 300]);
  assert.deepEqual(shapes.map(s => s.rotation), [0, 90, 0, 0]);
  assert.ok(shapes.every(s => s.length === 100 && s.type === "line"));
  assert.throws(() => lineShapes([points[0], ...points.slice(0, 4)], 100, 1), /different squares/);
  assert.throws(() => lineShapes(points.slice(0, 4), 100, 1), /five/);
  assert.throws(() => lineShapes([{ x: NaN, y: 0 }, ...points.slice(1)], 100, 1), /Invalid/);
  assert.equal(BLAST_TIERS[2].dice, 9);
});

test("root survives intervening turns and round boundary but ends on next own turn", () => {
  const root = { combatId: "combat", round: 2, turn: 3, expires: 6 };
  const combat = { id: "combat", started: true, round: 2, turn: 3, combatant: { tokenId: "blaster" } };
  assert.equal(isBlastRooted(root, combat, "blaster", 0), true);
  combat.turn = 4; combat.combatant.tokenId = "player";
  assert.equal(isBlastRooted(root, combat, "blaster", 0), true);
  combat.round = 3; combat.turn = 0;
  assert.equal(isBlastRooted(root, combat, "blaster", 0), true);
  combat.turn = 3; combat.combatant.tokenId = "blaster";
  assert.equal(isBlastRooted(root, combat, "blaster", 0), false);
  assert.equal(isBlastRooted(root, null, "blaster", 0), false);
  assert.equal(isBlastRooted({ ...root, combatId: null }, null, "blaster", 6), false);
});

function setup(t, { charge = 3, mode = "fire", isGM = true } = {}) {
  const dom = new JSDOM("<!doctype html><body><canvas></canvas></body>");
  const view = dom.window.document.querySelector("canvas");
  view.getBoundingClientRect = () => ({ left: 0, top: 0, width: 2000, height: 1000 });
  const callbacks = new Map();
  const warnings = [], errors = [], messages = [], regions = [];
  const flags = { blasterRole: "blaster" };
  const tokenFlags = {};
  const actor = {
    uuid: "Actor.blaster", getFlag: (_m, key) => flags[key],
    setFlag: async (_m, key, value) => { flags[key] = value; },
    getRollData: () => ({}),
  };
  const tokenDoc = {
    id: "blaster", x: 0, y: 0, width: 1, height: 1, actor,
    getFlag: (_m, key) => tokenFlags[key],
    setFlag: async (_m, key, value) => { tokenFlags[key] = value; },
    unsetFlag: async (_m, key) => { delete tokenFlags[key]; },
  };
  const token = { id: "blaster", name: "Blaster", actor, document: tokenDoc };
  const scene = {
    id: "scene", tokens: new Map([[token.id, tokenDoc]]), regions,
    createEmbeddedDocuments: async (type, sources) => {
      assert.equal(type, "Region");
      const docs = sources.map((data, i) => ({ ...data, id: String(i), getFlag: (_m, key) => data.flags[MODULE]?.[key] }));
      regions.push(...docs); return docs;
    },
    deleteEmbeddedDocuments: async (_type, ids) => { for (const id of ids) { const i = regions.findIndex(r => r.id === id); if (i >= 0) regions.splice(i, 1); } },
  };
  scene.tokens[Symbol.iterator] = scene.tokens.values.bind(scene.tokens);
  tokenDoc.parent = scene;
  const combat = { id: "combat", started: true, scene, round: 1, turn: 0, combatant: { tokenId: "blaster" } };
  const globals = {
    document: dom.window.document, window: dom.window,
    Hooks: {
      on(name, fn) { const listeners = callbacks.get(name) ?? []; listeners.push(fn); callbacks.set(name, listeners); return fn; },
      off(name, fn) { callbacks.set(name, (callbacks.get(name) ?? []).filter(f => f !== fn)); },
    },
    ui: { notifications: { warn: text => warnings.push(text), info() {}, error: text => errors.push(text) } },
    CONST: { REGION_VISIBILITY: { ALWAYS: 2 } },
    game: {
      user: { id: "gm", isGM }, users: { activeGM: { id: "gm" } }, release: { generation: 14 },
      modules: new Map(), scenes: [scene], system: { id: "pf2e" }, combat, time: { worldTime: 0 },
      pf2e: { TextEditor: { enrichHTML: async s => s } },
    },
    canvas: {
      ready: true, scene, level: { id: "ground" }, regions: {}, tokens: { controlled: [token] },
      app: { canvas: view, screen: { width: 2000, height: 1000 } },
      stage: { toGlobal: p => p, toLocal: p => p, scale: { x: 1 } },
      grid: {
        isSquare: true, size: 100, units: "ft",
        getCenterPoint: p => ({ x: Math.floor(p.x / 100) * 100 + 50, y: Math.floor(p.y / 100) * 100 + 50 }),
        measurePath: path => ({ distance: path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - path[i].x, p.y - path[i].y) / 20, 0) }),
      },
    },
    foundry: {
      utils: { escapeHTML: s => s, randomID: () => "blast-1" },
      dice: { Roll: class { async evaluate() { this.total = 2; return this; } } },
      applications: { api: { DialogV2: { prompt: async () => ({ charge, mode }) } } },
      documents: { ChatMessage: { getSpeaker: () => ({}), implementation: { create: async data => { messages.push(data); return data; } } } },
    },
  };
  const prior = Object.fromEntries(Object.keys(globals).map(k => [k, globalThis[k]]));
  Object.assign(globalThis, globals);
  t.after(() => { for (const k of Object.keys(globals)) { if (prior[k] === undefined) delete globalThis[k]; else globalThis[k] = prior[k]; } dom.window.close(); });
  return {
    feature: createBlasterFeature(MODULE), warnings, errors, messages, regions, flags, tokenFlags, combat, scene, callbacks, globals,
    click(p) { view.dispatchEvent(new dom.window.MouseEvent("pointerdown", { clientX: p.x, clientY: p.y, button: 0, bubbles: true, cancelable: true })); },
    key(key) { dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true })); },
  };
}

test("placement commits exactly four regions, one chat card and shared cooldown; clear removes only own areas", async t => {
  const env = setup(t, { mode: "humiliation" });
  const pending = env.feature.api.blast(); await setImmediate();
  env.click(points[0]); assert.equal(env.regions.length, 0);
  for (const p of points.slice(1)) env.click(p);
  await pending;
  assert.deepEqual(env.errors, []);
  assert.equal(env.regions.length, 4);
  assert.ok(env.regions.every(r => r.shapes[0].width === 300 && r.flags.pf2e.areaShape === "line"));
  assert.equal(env.messages.length, 1);
  assert.match(env.messages[0].content, /16d6\[mental\]/);
  assert.match(env.messages[0].content, /@Check\[will/);
  assert.match(env.messages[0].content, /options:area-damage/);
  assert.match(env.messages[0].content, /@UUID\[Compendium\.pf2e\.conditionitems\.Item\.e1XGnhKNSQIm5IXg\]\{Stupefied 1\}/);
  assert.equal(env.flags.blastUse.readyRound, 4);
  assert.equal(env.tokenFlags.blastRoot.round, 1);
  env.regions.push({ id: "other", getFlag: () => ({ tokenId: "other-token" }) });
  await env.feature.api.clearBlast();
  assert.deepEqual(env.regions.map(r => r.id), ["other"]);
  await env.feature.api.blast();
  assert.match(env.errors.at(-1), /already been used/);
});

test("cancel and undo leave no templates, cooldown or root and remove listeners", async t => {
  const env = setup(t);
  const pending = env.feature.api.blast(); await setImmediate();
  env.click(points[0]); env.click(points[1]); env.key("Backspace");
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /1\/5/);
  env.key("Escape"); await pending;
  assert.equal(env.regions.length, 0);
  assert.equal(env.flags.blastUse, undefined);
  assert.equal(env.tokenFlags.blastRoot, undefined);
  assert.equal(document.querySelector(".aha-blast-preview"), null);
  assert.equal(env.callbacks.get("canvasTearDown").length, 0);
});

test("invalid origin and overlong path are rejected; scene teardown cancels placement", async t => {
  const env = setup(t, { charge: 1 });
  const pending = env.feature.api.blast(); await setImmediate();
  env.click(points[2]); assert.match(env.warnings.at(-1), /first waypoint/);
  env.click(points[0]); env.click({ x: 1950, y: 50 });
  assert.match(env.warnings.at(-1), /cannot exceed/);
  env.callbacks.get("canvasTearDown")[0](); await pending;
  assert.equal(env.regions.length, 0);
});

test("changed turn aborts commit; non-GM cannot create blast", async t => {
  const env = setup(t);
  const pending = env.feature.api.blast(); await setImmediate();
  for (const p of points.slice(0, 4)) env.click(p);
  env.combat.turn = 1; env.click(points[4]); await pending;
  assert.match(env.errors.at(-1), /turn changed/);
  assert.equal(env.regions.length, 0);
  env.globals.game.user.isGM = false;
  await env.feature.api.blast(); assert.match(env.errors.at(-1), /Only the GM/);
});

test("actual movement hooks prevent rooted movement, allow GM forced moves, and clear on next own turn", async t => {
  const env = setup(t);
  env.feature.ready(); await setImmediate();
  env.tokenFlags.blastRoot = { combatId: "combat", round: 1, turn: 0, expires: 6 };
  const token = env.scene.tokens.get("blaster");
  const preMove = env.callbacks.get("preMoveToken").at(-1);
  const preUpdate = env.callbacks.get("preUpdateToken").at(-1);
  assert.equal(preMove(token, {}, {}), false);
  assert.equal(preUpdate(token, { x: 100 }, {}), false);
  assert.equal(preUpdate(token, { rotation: 90 }, {}), undefined);
  assert.equal(preMove(token, {}, { blasterForcedMovement: true }), undefined);
  env.combat.round = 2; env.combat.combatant.tokenId = "player";
  assert.equal(preMove(token, {}, {}), false);
  env.combat.combatant.tokenId = "blaster";
  for (const hook of env.callbacks.get("updateCombat")) hook(env.combat, { round: 2, turn: 0 });
  await setImmediate();
  assert.equal(env.tokenFlags.blastRoot, undefined);
  assert.equal(preMove(token, {}, {}), undefined);
});

test("failed bookkeeping rolls back only just-created areas and never leaves Blaster rooted", async t => {
  const env = setup(t);
  env.scene.tokens.get("blaster").actor.setFlag = async () => { throw new Error("simulated failed actor write"); };
  const pending = env.feature.api.blast(); await setImmediate();
  for (const p of points) env.click(p);
  await pending;
  assert.equal(env.regions.length, 0);
  assert.equal(env.tokenFlags.blastRoot, undefined);
  assert.equal(env.messages.length, 0);
  assert.match(env.errors.at(-1), /failed actor write/);
});

test("refresh updates only matched ability descriptions, preserving actor state and custom items", async t => {
  const env = setup(t);
  const actor = env.scene.tokens.get("blaster").actor;
  actor.system = { attributes: { hp: { value: 103, max: 330 } } };
  actor.img = "custom-portrait.webp";
  actor.items = [
    { id: "same", slug: "blaster-charged-blast-1", type: "action", system: { description: { value: "old", gm: "GM note" }, rules: [{ key: "Note" }] } },
    { id: "remapped", slug: "blaster-beam-clash", type: "action", system: { description: { value: "old clash" } } },
    { id: "custom", slug: "custom-action", type: "action", system: { description: { value: "leave alone" } } },
    { id: "effect", slug: "blaster-inspire", type: "effect", system: { description: { value: "active effect" } } },
  ];
  const originals = [
    { id: "same", slug: "blaster-charged-blast-1", type: "action", toObject: () => ({ system: { description: { value: "@Damage[4d6[fire]]" } } }) },
    { id: "source-clash", slug: "blaster-beam-clash", type: "action", toObject: () => ({ system: { description: { value: "new clash" } } }) },
    { id: "missing", slug: "deleted-by-gm", type: "action", toObject: () => ({ system: { description: { value: "do not recreate" } } }) },
  ];
  const writes = [];
  foundry.utils.fromUuid = async uuid => {
    assert.equal(uuid, `Compendium.${MODULE}.astillon-blaster-actors.Actor.BlasterActor0001`);
    return { type: "npc", items: originals };
  };
  actor.updateEmbeddedDocuments = async (type, updates) => {
    assert.equal(type, "Item"); writes.push(updates);
    for (const update of updates) {
      assert.deepEqual(Object.keys(update), ["_id", "system.description.value"]);
      actor.items.find(i => i.id === update._id).system.description.value = update["system.description.value"];
    }
  };
  assert.equal(await env.feature.api.refreshDescriptions(), 2);
  assert.deepEqual(writes[0].map(i => i._id), ["same", "remapped"]);
  assert.equal(actor.items[0].system.description.gm, "GM note");
  assert.deepEqual(actor.items[0].system.rules, [{ key: "Note" }]);
  assert.equal(actor.items[2].system.description.value, "leave alone");
  assert.equal(actor.items[3].system.description.value, "active effect");
  assert.equal(actor.system.attributes.hp.value, 103);
  assert.equal(actor.img, "custom-portrait.webp");
  assert.equal(actor.items.length, 4);
  assert.equal(await env.feature.api.refreshDescriptions(), 0);
  assert.equal(writes.length, 1);
});

test("refresh refuses another actor and will not guess among duplicated ability slugs", async t => {
  const env = setup(t);
  t.mock.method(console, "error", () => {});
  const actor = env.scene.tokens.get("blaster").actor;
  actor.items = ["copy1", "copy2"].map(id => ({ id, slug: "blaster-beam-clash", type: "action", system: { description: { value: "customized" } } }));
  foundry.utils.fromUuid = async () => ({ type: "npc", items: [{ id: "original", slug: "blaster-beam-clash", type: "action" }] });
  actor.updateEmbeddedDocuments = async () => assert.fail("Must not update ambiguous or unrelated items");
  await env.feature.api.refreshDescriptions();
  assert.match(env.errors.at(-1), /No matching shipped/);
  env.flags.blasterRole = "hype-thrall";
  await env.feature.api.refreshDescriptions();
  assert.match(env.errors.at(-1), /Select exactly one Blaster/);
});
