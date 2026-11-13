import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { BLAST_TIERS, lineShapes, isBlastRooted } from "../dist/scripts/features/blaster-model.js";
import { createBlasterFeature } from "../dist/scripts/features/blaster.js";

const MODULE = "astillon-hanaq-adventures-module";
const points = [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 250, y: 150 }, { x: 350, y: 150 }];
const maximumLegPoints = [{ x: 50, y: 50 }, { x: 1650, y: 50 }, { x: 50, y: 50 }, { x: 1650, y: 50 }, { x: 50, y: 50 }];
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

test("all charge tiers allow 80 feet per leg while retaining damage and width", () => {
  assert.deepEqual(Object.values(BLAST_TIERS).map(({ range, dice, width }) => ({ range, dice, width })), [
    { range: 80, dice: 4, width: 1 },
    { range: 80, dice: 9, width: 1 },
    { range: 80, dice: 18, width: 3 },
  ]);
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
  const warnings = [], errors = [], messages = [], regions = [], prompts = [], measurements = [];
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
        measurePath: path => {
          assert.equal(path.length, 2, "Measure each leg independently through the public grid API");
          measurements.push(path);
          return { distance: Math.hypot(path[1].x - path[0].x, path[1].y - path[0].y) / 20 };
        },
      },
    },
    foundry: {
      utils: { escapeHTML: s => s, randomID: () => "blast-1" },
      dice: { Roll: class { async evaluate() { this.total = 2; return this; } } },
      applications: { api: { DialogV2: { prompt: async options => { prompts.push(options); return { charge, mode }; } } } },
      documents: { ChatMessage: { getSpeaker: () => ({}), implementation: { create: async data => { messages.push(data); return data; } } } },
    },
  };
  const prior = Object.fromEntries(Object.keys(globals).map(k => [k, globalThis[k]]));
  Object.assign(globalThis, globals);
  t.after(() => { for (const k of Object.keys(globals)) { if (prior[k] === undefined) delete globalThis[k]; else globalThis[k] = prior[k]; } dom.window.close(); });
  return {
    feature: createBlasterFeature(MODULE), warnings, errors, messages, regions, flags, tokenFlags, combat, scene, callbacks, globals, prompts, measurements,
    click(p, button = 0) { view.dispatchEvent(new dom.window.MouseEvent("pointerdown", { clientX: p.x, clientY: p.y, button, bubbles: true, cancelable: true })); },
    move(p) { view.dispatchEvent(new dom.window.MouseEvent("pointermove", { clientX: p.x, clientY: p.y, bubbles: true })); },
    key(key) { dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true })); },
  };
}

for (const charge of [1, 2, 3]) {
  test(`${charge} action tier accepts four 80-foot legs totaling 320 feet with valid hover feedback`, async t => {
    const env = setup(t, { charge });
    const pending = env.feature.api.blast(); await setImmediate();
    const prompt = document.createElement("div");
    prompt.innerHTML = env.prompts[0].content;
    const options = [...prompt.querySelectorAll('select[name="charge"] option')];
    assert.equal(options.length, 3);
    assert.ok(options.every(option => option.textContent.includes("80 ft per leg")));
    assert.match(prompt.textContent, /Five clicks create four connected legs, each up to 80 ft/);
    env.click(maximumLegPoints[0]);
    for (const [i, point] of maximumLegPoints.slice(1).entries()) {
      env.move(point);
      assert.equal(document.querySelector(".aha-blast-preview polyline").getAttribute("stroke"), "#ff4433");
      assert.match(document.querySelector(".aha-blast-instructions").textContent, /80 ft per leg · Next leg: 80\/80 ft/);
      env.click(point);
      if (i < 3) assert.match(document.querySelector(".aha-blast-instructions").textContent, /Last leg: 80\/80 ft/);
    }
    await pending;
    assert.deepEqual(env.warnings, []);
    assert.deepEqual(env.errors, []);
    assert.equal(env.regions.length, 4);
    assert.deepEqual(env.regions.map(r => r.shapes[0].length / 20), [80, 80, 80, 80]);
    assert.equal(env.regions.reduce((total, r) => total + r.shapes[0].length / 20, 0), 320);
    assert.ok(env.measurements.length > 0);
    assert.ok(env.measurements.every(path => path.length === 2));
    assert.ok(env.regions.every(r => r.shapes[0].width === (charge === 3 ? 300 : 100)));
    assert.equal(env.messages.length, 1);
    assert.ok(env.messages[0].content.includes(`${BLAST_TIERS[charge].dice}d6[fire]`));
    assert.equal(env.flags.blastUse.round, 1);
    assert.equal(env.flags.blastUse.readyRound, charge === 3 ? 4 : undefined);
    assert.equal(env.tokenFlags.blastRoot?.round, charge === 3 ? 1 : undefined);
  });

  test(`${charge} action tier rejects an 85-foot last leg even after three short legs`, async t => {
    const env = setup(t, { charge });
    const pending = env.feature.api.blast(); await setImmediate();
    for (const point of points.slice(0, 4)) env.click(point);
    const tooFar = { x: 1950, y: 150 };
    env.move(tooFar);
    assert.equal(document.querySelector(".aha-blast-preview polyline").getAttribute("stroke"), "#ff2222");
    assert.match(document.querySelector(".aha-blast-instructions").textContent, /Next leg: 85\/80 ft/);
    env.click(tooFar);
    assert.equal(env.warnings.at(-1), "Each leg cannot exceed 80 ft.");
    assert.match(document.querySelector(".aha-blast-instructions").textContent, /4\/5 points/);
    assert.equal(env.regions.length, 0);
    assert.equal(env.flags.blastUse, undefined);
    assert.equal(env.tokenFlags.blastRoot, undefined);
    env.click(points[4]); await pending;
    assert.deepEqual(env.errors, []);
    assert.equal(env.regions.length, 4);
  });
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
  env.click(maximumLegPoints[0]); env.click(maximumLegPoints[1]);
  env.move({ x: 1750, y: 50 });
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /Next leg: 5\/80 ft/);
  env.key("Backspace");
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /1\/5/);
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /Next leg: 85\/80 ft/);
  assert.equal(document.querySelector(".aha-blast-preview polyline").getAttribute("stroke"), "#ff2222");
  env.move(maximumLegPoints[1]);
  assert.equal(document.querySelector(".aha-blast-preview polyline").getAttribute("stroke"), "#ff4433");
  env.key("Backspace");
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /0\/5.*Click Blaster's square first/);
  env.click(maximumLegPoints[1]);
  assert.match(env.warnings.at(-1), /first waypoint/);
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /0\/5/);
  env.click(maximumLegPoints[0]); env.click(maximumLegPoints[1]);
  env.key("Escape"); await pending;
  assert.equal(env.regions.length, 0);
  assert.equal(env.flags.blastUse, undefined);
  assert.equal(env.tokenFlags.blastRoot, undefined);
  assert.equal(document.querySelector(".aha-blast-preview"), null);
  assert.equal(document.querySelector(".aha-blast-instructions"), null);
  assert.equal(env.callbacks.get("canvasTearDown").length, 0);
  assert.equal(env.callbacks.get("canvasPan").length, 0);
});

for (const cancel of ["right-click", "api"]) {
  test(`${cancel} cancels a path exceeding 80 feet in total without spending the blast`, async t => {
    const env = setup(t);
    const pending = env.feature.api.blast(); await setImmediate();
    for (const point of maximumLegPoints.slice(0, 3)) env.click(point);
    assert.match(document.querySelector(".aha-blast-instructions").textContent, /3\/5/);
    if (cancel === "right-click") env.click(maximumLegPoints[2], 2);
    else env.feature.api.cancelPlacement();
    await pending;
    assert.deepEqual(env.errors, []);
    assert.equal(env.regions.length, 0);
    assert.equal(env.flags.blastUse, undefined);
    assert.equal(env.tokenFlags.blastRoot, undefined);
    assert.equal(document.querySelector(".aha-blast-preview"), null);
    assert.equal(document.querySelector(".aha-blast-instructions"), null);
    assert.equal(env.callbacks.get("canvasTearDown").length, 0);
    assert.equal(env.callbacks.get("canvasPan").length, 0);
  });
}

test("invalid origin and overlong leg are rejected; scene teardown cancels placement", async t => {
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
