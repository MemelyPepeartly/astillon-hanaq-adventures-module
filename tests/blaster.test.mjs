import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { BLAST_TIERS, FINALE, lineShapes, isBlastRooted } from "../dist/scripts/features/blaster-model.js";
import { createBlasterFeature } from "../dist/scripts/features/blaster.js";

const MODULE = "astillon-hanaq-adventures-module";
const origin = { x: 50, y: 50 };
const aim = { x: 150, y: 50 };
const points = [origin, aim, { x: 150, y: 150 }, { x: 250, y: 150 }, { x: 350, y: 150 }, { x: 350, y: 250 }, { x: 450, y: 250 }, { x: 550, y: 250 }];

test("two through eight waypoints retain native line geometry and full three-square width", () => {
  for (let count = 2; count <= 8; count++) {
    const shapes = lineShapes(points.slice(0, count), 100, 3);
    assert.equal(shapes.length, count - 1);
    assert.deepEqual(shapes.map(s => s.width), Array(count - 1).fill(300));
    assert.deepEqual(shapes.map(s => s.rotation), [0, 90, 0, 0, 90, 0, 0].slice(0, count - 1));
    assert.ok(shapes.every(s => s.length === 100 && s.type === "line"));
  }
  assert.throws(() => lineShapes([origin, origin], 100, 1), /different squares/);
  assert.throws(() => lineShapes([origin], 100, 1));
  assert.throws(() => lineShapes([...points, { x: 650, y: 250 }], 100, 1));
  assert.throws(() => lineShapes([{ x: NaN, y: 0 }, ...points.slice(1)], 100, 1), /Invalid/);
});

test("normal tiers use 120 feet with unchanged damage and width, and Grand Finale has separate constants", () => {
  assert.deepEqual(Object.values(BLAST_TIERS).map(({ range, dice, width }) => ({ range, dice, width })), [
    { range: 120, dice: 4, width: 1 },
    { range: 120, dice: 9, width: 1 },
    { range: 120, dice: 18, width: 3 },
  ]);
  assert.deepEqual(FINALE, { name: "Grand Finale", pointCount: 8, range: 120, width: 3, dice: 24, dc: 40 });
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
    uuid: "Actor.blaster", isOwner: true, getFlag: (_m, key) => flags[key],
    setFlag: async (_m, key, value) => { flags[key] = value; },
    getRollData: () => ({}),
  };
  const tokenDoc = {
    id: "blaster", x: 0, y: 0, width: 1, height: 1, actor, isOwner: true,
    getCenterPoint() { return { x: this.x + this.width * canvas.grid.size / 2, y: this.y + this.height * canvas.grid.size / 2 }; },
    getFlag: (_m, key) => tokenFlags[key],
    setFlag: async (_m, key, value) => { tokenFlags[key] = value; },
    unsetFlag: async (_m, key) => { delete tokenFlags[key]; },
  };
  const token = { id: "blaster", name: "Blaster", actor, document: tokenDoc, get center() { return tokenDoc.getCenterPoint(); } };
  let regionId = 0;
  const scene = {
    id: "scene", tokens: new Map([[token.id, tokenDoc]]), regions,
    getFlag: () => undefined,
    createEmbeddedDocuments: async (type, sources) => {
      assert.equal(type, "Region");
      const docs = sources.map(data => ({ ...data, id: String(regionId++), getFlag: (_m, key) => data.flags[MODULE]?.[key] }));
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
        isSquare: true, size: 100, distance: 5, units: "ft",
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
  for (const [distance, target] of [["near", aim], ["beyond 120 feet", { x: 3650, y: 50 }]]) {
    test(`${charge} action tier auto-originates one fixed 120-foot line from a single ${distance} aim click`, async t => {
      const env = setup(t, { charge });
      const pending = env.feature.api.blast(); await setImmediate();
      const prompt = document.createElement("div");
      prompt.innerHTML = env.prompts[0].content;
      const options = [...prompt.querySelectorAll('select[name="charge"] option')];
      assert.equal(options.length, 3);
      assert.ok(options.every(option => option.textContent.includes("120 ft")));
      assert.doesNotMatch(prompt.textContent, /five clicks|four connected legs|80 ft/i);
      env.move(target);
      const preview = document.querySelector(".aha-blast-preview polyline");
      assert.equal(preview.getAttribute("stroke"), "#ff4433");
      assert.equal(Number(preview.getAttribute("stroke-width")), charge === 3 ? 300 : 100);
      const previewPoints = preview.getAttribute("points").trim().split(/\s+/).map(point => point.split(",").map(Number));
      assert.deepEqual(previewPoints, [[50, 50], [2450, 50]]);
      assert.equal(env.regions.length, 0);
      env.click(target);
      await pending;
      assert.deepEqual(env.warnings, []);
      assert.deepEqual(env.errors, []);
      assert.equal(env.regions.length, 1);
      const shape = env.regions[0].shapes[0];
      assert.equal(shape.length, 120 * canvas.grid.size / canvas.grid.distance);
      assert.equal(shape.width, charge === 3 ? 300 : 100);
      assert.equal(shape.rotation, 0);
      assert.equal(env.messages.length, 1);
      assert.ok(env.messages[0].content.includes(`${BLAST_TIERS[charge].dice}d6[fire]`));
      assert.match(env.messages[0].content, /120(?: ft|-foot)/);
      assert.equal(env.flags.blastUse.round, 1);
      assert.equal(env.flags.blastUse.readyRound, charge === 3 ? 4 : undefined);
      assert.equal(env.tokenFlags.blastRoot?.round, charge === 3 ? 1 : undefined);
      assert.equal(document.querySelector(".aha-blast-preview"), null);
      assert.equal(document.querySelector(".aha-blast-instructions"), null);
    });
  }
}

for (const distance of [5, 10]) {
  test(`diagonal aiming uses fixed pixel length on a ${distance}-foot grid independently of path measurement`, async t => {
    const env = setup(t);
    env.globals.canvas.grid.distance = distance;
    env.globals.canvas.grid.measurePath = () => ({ distance: 180 });
    const pending = env.feature.api.blast(); await setImmediate();
    env.click({ x: 150, y: 150 });
    await pending;
    assert.deepEqual(env.errors, []);
    assert.deepEqual(env.warnings, []);
    assert.equal(env.regions.length, 1);
    const shape = env.regions[0].shapes[0];
    assert.ok(Math.abs(shape.length - 120 * 100 / distance) < 0.000001);
    assert.equal(shape.rotation, 45);
    assert.equal(shape.width, 300);
  });
}

for (const centerSource of ["token", "document fallback"]) {
  test(`normal aim starts at the selected large token's ${centerSource} center`, async t => {
    const env = setup(t, { charge: 1 });
    const token = env.globals.canvas.tokens.controlled[0];
    Object.assign(token.document, { x: 200, y: 400, width: 2, height: 2 });
    if (centerSource === "document fallback") delete token.center;
    else Object.defineProperty(token, "center", { value: { x: 325, y: 525 } });
    const center = centerSource === "token" ? { x: 325, y: 525 } : { x: 300, y: 500 };
    const pending = env.feature.api.blast(); await setImmediate();
    env.move({ x: 650, y: 550 });
    const previewPoints = document.querySelector(".aha-blast-preview polyline").getAttribute("points").trim().split(/\s+/).map(point => point.split(",").map(Number));
    assert.deepEqual(previewPoints[0], [center.x, center.y]);
    assert.ok(Math.abs(Math.hypot(previewPoints[1][0] - center.x, previewPoints[1][1] - center.y) - 2400) < 0.000001);
    env.click({ x: 650, y: 550 });
    await pending;
    assert.deepEqual(env.errors, []);
    assert.equal(env.regions.length, 1);
  });
}

test("placement commits one region, one chat card and recharge metadata; clear removes only own blast areas", async t => {
  const env = setup(t, { mode: "humiliation" });
  const pending = env.feature.api.blast(); await setImmediate();
  env.click(aim);
  await pending;
  assert.deepEqual(env.errors, []);
  assert.equal(env.regions.length, 1);
  assert.ok(env.regions.every(r => r.shapes[0].width === 300 && r.flags.pf2e.areaShape === "line"));
  assert.equal(env.messages.length, 1);
  assert.match(env.messages[0].content, /16d6\[mental\]/);
  assert.match(env.messages[0].content, /@Check\[will/);
  assert.match(env.messages[0].content, /options:area-damage/);
  assert.match(env.messages[0].content, /@UUID\[Compendium\.pf2e\.conditionitems\.Item\.e1XGnhKNSQIm5IXg\]\{Stupefied 1\}/);
  assert.equal(env.flags.blastUse.readyRound, 4);
  assert.equal(env.tokenFlags.blastRoot.round, 1);
  assert.match(env.messages[0].content, /recharge \(reference\): 2 full rounds; available round 4/);
  assert.match(env.messages[0].content, /Adjudicate recharge from the sheet/);
  env.regions.push({ id: "other", getFlag: () => ({ tokenId: "other-token" }) });
  env.regions.push({ id: "finale", getFlag: (_m, key) => key === "blast" ? undefined : { tokenId: "blaster" } });
  await env.feature.api.clearBlast();
  assert.deepEqual(env.regions.map(r => r.id), ["other", "finale"]);
  const repeated = env.feature.api.blast(); await setImmediate();
  env.click(aim);
  await repeated;
  assert.deepEqual(env.errors, []);
  assert.equal(env.regions.length, 3);
  assert.equal(env.messages.length, 2);
});

for (const cancel of ["Escape", "right-click", "api"]) {
  test(`${cancel} cancels an aimed normal blast without metadata and removes preview listeners`, async t => {
    const env = setup(t);
    const pending = env.feature.api.blast(); await setImmediate();
    env.move({ x: 450, y: 350 });
    assert.ok(document.querySelector(".aha-blast-preview"));
    if (cancel === "Escape") env.key("Escape");
    else if (cancel === "right-click") env.click(aim, 2);
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
    env.click(aim);
    assert.equal(env.regions.length, 0);
  });
}

test("clicking the auto-origin does not commit a zero-length blast; scene teardown cancels aiming", async t => {
  const env = setup(t, { charge: 1 });
  const pending = env.feature.api.blast(); await setImmediate();
  env.click(origin);
  assert.ok(document.querySelector(".aha-blast-preview"));
  assert.equal(env.regions.length, 0);
  env.callbacks.get("canvasTearDown")[0](); await pending;
  assert.equal(env.regions.length, 0);
  assert.equal(env.flags.blastUse, undefined);
  assert.equal(document.querySelector(".aha-blast-preview"), null);
});

for (const charge of [1, 2, 3]) {
  for (const timing of ["off turn", "no combat"]) {
    test(`${charge} action blast can be used repeatedly ${timing}, ignoring previous use and recharge`, async t => {
      const env = setup(t, { charge });
      if (timing === "no combat") env.globals.game.combat = null;
      else env.combat.combatant.tokenId = "player";
      env.flags.blastUse = { combatId: "combat", round: 1, rechargeCombatId: "combat", readyRound: 99, readyTime: 9999 };
      for (let invocation = 1; invocation <= 2; invocation++) {
        const pending = env.feature.api.blast(); await setImmediate();
        assert.ok(document.querySelector(".aha-blast-preview"));
        env.click(aim);
        await pending;
        assert.deepEqual(env.errors, []);
        assert.equal(env.regions.length, invocation);
        assert.equal(env.messages.length, invocation);
      }
      assert.equal(env.flags.blastUse.combatId, timing === "no combat" ? null : "combat");
      assert.ok(env.regions.every(r => r.shapes[0].width === (charge === 3 ? 300 : 100)));
      assert.match(env.prompts[0].content, /Adjudicate action costs, frequency, and recharge from the sheet/);
      if (charge === 3) {
        assert.equal(env.tokenFlags.blastRoot.combatId, timing === "no combat" ? null : "combat");
        assert.equal(isBlastRooted(env.tokenFlags.blastRoot, env.globals.game.combat, "blaster", 0), true);
        if (timing === "no combat") assert.doesNotMatch(env.messages[0].content, /available round/);
      } else assert.equal(env.tokenFlags.blastRoot, undefined);
    });
  }
}

for (const change of ["turn", "round", "ended", "deleted", "replaced"]) {
  for (const phase of ["picking", "recharge roll"]) {
    test(`combat ${change} during ${phase} allows completion with current commit metadata`, async t => {
      const env = setup(t);
      let finishRoll;
      if (phase === "recharge roll") {
        env.globals.foundry.dice.Roll = class {
          async evaluate() { await new Promise(resolve => { finishRoll = resolve; }); this.total = 2; return this; }
        };
      }
      const pending = env.feature.api.blast(); await setImmediate();
      if (phase === "recharge roll") { env.click(aim); await setImmediate(); }
      if (change === "turn") { env.combat.turn = 1; env.combat.combatant.tokenId = "player"; }
      if (change === "round") { env.combat.round = 2; env.combat.turn = 1; env.combat.combatant.tokenId = "player"; }
      if (change === "ended") env.combat.started = false;
      if (change === "deleted") env.globals.game.combat = null;
      if (change === "replaced") env.globals.game.combat = { ...env.combat, id: "new-combat", round: 7, turn: 2 };
      env.globals.game.time.worldTime = 42;
      if (phase === "recharge roll") finishRoll();
      else env.click(aim);
      await pending;
      assert.deepEqual(env.errors, []);
      assert.equal(env.regions.length, 1);
      assert.equal(env.messages.length, 1);
      const current = env.globals.game.combat?.started ? env.globals.game.combat : null;
      assert.deepEqual(env.flags.blastUse, {
        combatId: current?.id ?? null, round: current?.round ?? 0, rechargeCombatId: current?.id ?? null,
        readyRound: (current?.round ?? 0) + 3, readyTime: 60,
      });
      assert.deepEqual(env.tokenFlags.blastRoot, {
        combatId: current?.id ?? null, round: current?.round ?? 0, turn: current?.turn ?? 0, expires: 48,
      });
      assert.ok(env.regions.every(r => r.shapes[0].width === 300 && r.flags.pf2e.areaShape === "line"));
    });
  }
}

const invalidations = [
  ["GM authority loss", env => { env.globals.game.user.isGM = false; }, /Only the GM/],
  ["active GM change", env => { env.globals.game.users.activeGM.id = "other-gm"; }, /active GM/],
  ["token ownership loss", env => { env.scene.tokens.get("blaster").isOwner = false; }, /must own/],
  ["actor ownership loss", env => { env.scene.tokens.get("blaster").actor.isOwner = false; }, /must own/],
  ["selection change", env => { env.globals.canvas.tokens.controlled = [{ ...env.globals.canvas.tokens.controlled[0], id: "another-blaster" }]; }, /scene or selected token changed/],
  ["token movement", env => { env.scene.tokens.get("blaster").x = 100; }, /scene or selected token changed/],
  ["token deletion", env => { env.scene.tokens.delete("blaster"); }, /scene or selected token changed/],
  ["scene change", env => { env.globals.canvas.scene = { id: "another-scene" }; }, /scene or selected token changed/],
];

for (const [label, invalidate, expected] of invalidations) {
  for (const phase of ["dialog", "placement", "recharge roll"]) {
    test(`${label} during ${phase} still aborts without spending or creating a blast`, async t => {
      const env = setup(t);
      t.mock.method(console, "error", () => {});
      let finishDialog, finishRoll;
      if (phase === "dialog") env.globals.foundry.applications.api.DialogV2.prompt = () => new Promise(resolve => { finishDialog = resolve; });
      if (phase === "recharge roll") env.globals.foundry.dice.Roll = class {
        async evaluate() { await new Promise(resolve => { finishRoll = resolve; }); this.total = 2; return this; }
      };
      const pending = env.feature.api.blast(); await setImmediate();
      if (phase === "recharge roll") { env.click(aim); await setImmediate(); }
      invalidate(env);
      if (phase === "dialog") finishDialog({ charge: 3, mode: "fire" });
      else if (phase === "recharge roll") finishRoll();
      else env.click(aim);
      await pending;
      assert.match(env.errors.at(-1), expected);
      assert.equal(env.regions.length, 0);
      assert.equal(env.messages.length, 0);
      assert.equal(env.flags.blastUse, undefined);
      assert.equal(env.tokenFlags.blastRoot, undefined);
      assert.equal(document.querySelector(".aha-blast-preview"), null);
    });
  }
}

test("non-GM cannot open the blast dialog", async t => {
  const env = setup(t, { isGM: false });
  t.mock.method(console, "error", () => {});
  await env.feature.api.blast();
  assert.match(env.errors.at(-1), /Only the GM/);
  assert.equal(env.prompts.length, 0);
});

test("busy guard rejects concurrent invocation but releases after cancellation", async t => {
  const env = setup(t);
  const pending = env.feature.api.blast(); await setImmediate();
  await env.feature.api.blast();
  assert.match(env.warnings.at(-1), /Finish or cancel/);
  assert.equal(env.prompts.length, 1);
  env.feature.api.cancelPlacement(); await pending;
  const retry = env.feature.api.blast(); await setImmediate();
  env.click(aim);
  await retry;
  assert.equal(env.regions.length, 1);
  assert.deepEqual(env.errors, []);
});

test("normal blasts and Finale share the picker busy guard and cancel API", async t => {
  const env = setup(t);
  const api = env.feature.api;
  for (const name of ["markFinale", "fireFinale", "clearFinale"]) assert.equal(typeof api[name], "function");
  const marked = api.markFinale(); await setImmediate();
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /0\/8 points/);
  await api.blast();
  assert.match(env.warnings.at(-1), /Finish or cancel/);
  assert.equal(env.prompts.length, 1);
  api.cancelPlacement();
  assert.equal(await marked, false);
  assert.equal(env.regions.length, 0);
  assert.equal(document.querySelector(".aha-blast-preview"), null);
  const normal = api.blast(); await setImmediate();
  assert.equal(await api.markFinale(), false);
  assert.match(env.warnings.at(-1), /Finish or cancel/);
  assert.equal(env.prompts.length, 2);
  env.click(aim); await normal;
  assert.equal(env.regions.length, 1);
  assert.deepEqual(env.errors, []);
});

test("actual movement hooks prevent rooted movement, allow GM forced moves, and clear on next own turn", async t => {
  const env = setup(t);
  await env.feature.ready();
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
  t.mock.method(console, "error", () => {});
  env.scene.tokens.get("blaster").actor.setFlag = async () => { throw new Error("simulated failed actor write"); };
  const pending = env.feature.api.blast(); await setImmediate();
  env.click(aim);
  await pending;
  assert.equal(env.regions.length, 0);
  assert.equal(env.tokenFlags.blastRoot, undefined);
  assert.equal(env.messages.length, 0);
  assert.match(env.errors.at(-1), /failed actor write/);
});

test("failed repeated blast preserves the previous root, use metadata and areas", async t => {
  const env = setup(t);
  t.mock.method(console, "error", () => {});
  const first = env.feature.api.blast(); await setImmediate();
  env.click(aim);
  await first;
  const previousRoot = structuredClone(env.tokenFlags.blastRoot);
  const previousUse = structuredClone(env.flags.blastUse);
  const previousRegions = [...env.regions];
  env.scene.tokens.get("blaster").actor.setFlag = async () => { throw new Error("simulated failed actor write"); };
  env.combat.turn = 1;
  env.combat.combatant.tokenId = "player";
  env.globals.game.time.worldTime = 3;
  const repeated = env.feature.api.blast(); await setImmediate();
  env.click(aim);
  await repeated;
  assert.match(env.errors.at(-1), /failed actor write/);
  assert.deepEqual(env.regions, previousRegions);
  assert.deepEqual(env.tokenFlags.blastRoot, previousRoot);
  assert.deepEqual(env.flags.blastUse, previousUse);
  assert.equal(isBlastRooted(env.tokenFlags.blastRoot, env.combat, "blaster", 3), true);
  assert.equal(env.messages.length, 1);
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
