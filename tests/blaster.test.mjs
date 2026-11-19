import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { BLAST_MODES, BLAST_TIERS, FINALE, lineShapes } from "../dist/scripts/features/blaster-model.js";
import { createBlasterFeature } from "../dist/scripts/features/blaster.js";

const MODULE = "astillon-hanaq-adventures-module";
const DAMAGE = { 1: "6d8", 2: "14d8", 3: "27d10" };
const CONDITION_DAMAGE = { 1: "3d8", 2: "11d8", 3: "24d10" };
const MODES = {
  fire: { damage: "fire", save: "reflex", traits: "magical,fire", effects: [] },
  cold: { damage: "cold", save: "reflex", traits: "magical,cold", effects: [] },
  electricity: { damage: "electricity", save: "reflex", traits: "magical,electricity", effects: [] },
  sonic: { damage: "sonic", save: "reflex", traits: "magical,sonic", effects: [] },
  dazzling: { damage: "fire", save: "reflex", traits: "magical,fire,light", effects: [["Failure", "BlasterDazzle001"], ["Critical failure", "BlasterDazzle001"]] },
  humiliation: { damage: "mental", save: "will", traits: "magical,mental", effects: [["Failure", "BlasterStupor001"], ["Critical failure", "BlasterStupor001"]] },
  slowing: { damage: "cold", save: "fortitude", traits: "magical,cold", effects: [["Success", "BlasterSlow00001"], ["Failure", "BlasterSlow00002"], ["Critical failure", "BlasterSlow00003"]] },
  hypnotic: { damage: "mental", save: "will", traits: "magical,mental,visual,incapacitation", effects: [["Success", "BlasterFascin001"], ["Failure", "BlasterControl01"], ["Critical failure", "BlasterControl02"]] },
};
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

test("normal tiers use 6d8, 14d8 and 27d10 at 120 feet, and Grand Finale uses 36d10", () => {
  assert.deepEqual(Object.values(BLAST_TIERS).map(({ range, dice, die, width }) => ({ range, dice, die, width })), [
    { range: 120, dice: 6, die: 8, width: 1 },
    { range: 120, dice: 14, die: 8, width: 1 },
    { range: 120, dice: 27, die: 10, width: 3 },
  ]);
  assert.deepEqual(FINALE, { name: "Grand Finale", pointCount: 8, range: 120, width: 3, dice: 36, die: 10, dc: 40 });
  assert.deepEqual(Object.keys(BLAST_MODES).sort(), Object.keys(MODES).sort());
  for (const [mode, expected] of Object.entries(MODES)) {
    assert.equal(BLAST_MODES[mode].penalty, expected.effects.length ? 3 : 0, `${mode} condition tradeoff`);
  }
});

function setup(t, { charge = 3, mode = "fire", isGM = true } = {}) {
  const dom = new JSDOM("<!doctype html><body><canvas></canvas></body>");
  const view = dom.window.document.querySelector("canvas");
  view.getBoundingClientRect = () => ({ left: 0, top: 0, width: 2000, height: 1000 });
  const callbacks = new Map();
  const warnings = [], errors = [], messages = [], regions = [], prompts = [], measurements = [];
  const flags = { blasterRole: "blaster" };
  const tokenFlags = {};
  const tokenFlagWrites = [];
  const actor = {
    uuid: "Actor.blaster", isOwner: true, getFlag: (_m, key) => flags[key],
    setFlag: async (_m, key, value) => { flags[key] = value; },
    getRollData: () => ({}),
  };
  const tokenDoc = {
    id: "blaster", x: 0, y: 0, width: 1, height: 1, actor, isOwner: true,
    getCenterPoint() { return { x: this.x + this.width * canvas.grid.size / 2, y: this.y + this.height * canvas.grid.size / 2 }; },
    getFlag: (_m, key) => tokenFlags[key],
    setFlag: async (_m, key, value) => { tokenFlagWrites.push({ operation: "set", key, value }); tokenFlags[key] = value; },
    unsetFlag: async (_m, key) => { tokenFlagWrites.push({ operation: "unset", key }); delete tokenFlags[key]; },
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
      call(name, ...args) { return (callbacks.get(name) ?? []).every(fn => fn(...args) !== false); },
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
    feature: createBlasterFeature(MODULE), warnings, errors, messages, regions, flags, tokenFlags, tokenFlagWrites, combat, scene, callbacks, globals, prompts, measurements,
    click(p, button = 0) { view.dispatchEvent(new dom.window.MouseEvent("pointerdown", { clientX: p.x, clientY: p.y, button, bubbles: true, cancelable: true })); },
    move(p) { view.dispatchEvent(new dom.window.MouseEvent("pointermove", { clientX: p.x, clientY: p.y, bubbles: true })); },
    key(key) { dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true })); },
  };
}

test("blast chooser renders its saved mode, updates live, and commits the actual submitted selection", async t => {
  const env = setup(t);
  env.flags.blastUse = { combatId: "combat", round: 1, mode: "slowing", readyRound: 99 };
  env.globals.foundry.applications.api.DialogV2.prompt = async options => {
    env.prompts.push(options);
    const form = document.createElement("form");
    form.innerHTML = options.content;
    document.body.append(form);
    options.render(new window.Event("render"), { element: form });
    assert.equal(form.elements.charge.value, "2");
    assert.equal(form.elements.mode.value, "slowing");
    const summary = form.querySelector(".aha-blast-choice-preview");
    assert.match(summary.textContent, /11d8 cold/);
    assert.match(summary.textContent, /DC 40 basic fortitude/);
    form.elements.charge.value = "3";
    form.elements.charge.dispatchEvent(new window.Event("input", { bubbles: true }));
    assert.match(summary.textContent, /24d10 cold/);
    form.elements.mode.value = "hypnotic";
    form.elements.mode.dispatchEvent(new window.Event("change", { bubbles: true }));
    assert.match(summary.textContent, /Hypno-Beam: 24d10 mental/);
    assert.match(summary.textContent, /DC 40 basic will/);
    assert.match(summary.textContent, /permanently controlled until removed/);
    const choice = options.ok.callback(new window.Event("click"), { form });
    form.remove();
    return choice;
  };
  const pending = env.feature.api.blast({ charge: 2 }); await setImmediate();
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /Standing Ovation.*Hypno-Beam/);
  env.click(aim);
  await pending;
  assert.deepEqual(env.errors, []);
  assert.equal(env.regions[0].flags[MODULE].blast.mode, "hypnotic");
  assert.equal(env.regions[0].flags[MODULE].blast.charge, 3);
  assert.match(env.messages[0].content, /24d10\[mental\]/);
  assert.equal(env.flags.blastUse.mode, "hypnotic");
  assert.deepEqual(env.tokenFlagWrites, []);
});

for (const [label, savedMode, preset, expectedCharge, expectedMode] of [
  ["remembered mode", "hypnotic", {}, "1", "hypnotic"],
  ["explicit preset", "hypnotic", { charge: 3, mode: "cold" }, "3", "cold"],
  ["invalid legacy mode", "removed-mode", {}, "1", "fire"],
]) {
  test(`blast chooser uses ${label} defaults and cancellation leaves bookkeeping untouched`, async t => {
    const env = setup(t);
    const priorUse = { combatId: "combat", round: 1, mode: savedMode, readyRound: 99 };
    env.flags.blastUse = structuredClone(priorUse);
    env.globals.foundry.applications.api.DialogV2.prompt = async options => {
      const form = document.createElement("form");
      form.innerHTML = options.content;
      options.render(new window.Event("render"), { element: form });
      assert.equal(form.elements.charge.value, expectedCharge);
      assert.equal(form.elements.mode.value, expectedMode);
      return null;
    };
    await env.feature.api.blast(preset);
    assert.deepEqual(env.errors, []);
    assert.deepEqual(env.flags.blastUse, priorUse);
    assert.deepEqual(env.tokenFlagWrites, []);
    assert.equal(env.regions.length, 0);
    assert.equal(env.messages.length, 0);
  });
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
      assert.ok(options.every(option => option.textContent.includes(DAMAGE[option.value])));
      assert.match(prompt.textContent, /full 120-foot beam/);
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
      assert.ok(env.messages[0].content.includes(`${DAMAGE[charge]}[fire]`));
      assert.match(env.messages[0].content, /120(?: ft|-foot)/);
      assert.equal(env.flags.blastUse.round, 1);
      assert.equal(env.flags.blastUse.mode, "fire");
      assert.equal(env.flags.blastUse.readyRound, charge === 3 ? 4 : undefined);
      assert.deepEqual(env.tokenFlags, {});
      assert.deepEqual(env.tokenFlagWrites, []);
      assert.equal(document.querySelector(".aha-blast-preview"), null);
      assert.equal(document.querySelector(".aha-blast-instructions"), null);
    });
  }
}

for (const charge of [1, 2, 3]) {
  for (const [mode, expected] of Object.entries(MODES)) {
    test(`${charge} action ${mode} blast never writes a movement lock and explains manual adjudication`, async t => {
      const env = setup(t, { charge, mode });
      await env.feature.ready();
      const pending = env.feature.api.blast(); await setImmediate();
      env.click(aim);
      await pending;
      assert.deepEqual(env.errors, []);
      assert.equal(env.regions.length, 1);
      assert.equal(env.messages.length, 1);
      assert.equal(env.regions[0].flags[MODULE].blast.mode, mode);
      const card = env.messages[0].content;
      const damage = expected.effects.length ? CONDITION_DAMAGE[charge] : DAMAGE[charge];
      assert.ok(card.includes(`@Damage[${damage}[${expected.damage}]|traits:${expected.traits}|options:area-damage]`));
      assert.ok(card.includes(`@Check[${expected.save}|dc:40|basic|traits:${expected.traits}]`));
      assert.equal(env.flags.blastUse.mode, mode);
      for (const [outcome, effectId] of expected.effects) {
        assert.ok(card.includes(`@UUID[Compendium.${MODULE}.astillon-blaster-items.Item.${effectId}]{${outcome} effect}`));
      }
      assert.equal((card.match(/astillon-blaster-items\.Item\./g) ?? []).length, expected.effects.length);
      if (expected.effects.length) {
        assert.ok(card.includes(`@UUID[Compendium.${MODULE}.astillon-blaster-macros.Macro.BlasterResolve01]{Apply Blast Effect}`));
        assert.match(card, /After applying damage/);
      } else assert.doesNotMatch(card, /Apply Blast Effect/);
      if (mode === "slowing") {
        assert.match(card, /Success: slowed 1\. Failure: slowed 2\. Critical failure: slowed 3/);
        assert.match(card, /Lasts 1 round; critical success has no effect/);
      }
      if (mode === "hypnotic") {
        assert.match(card, /Success: fascinated for 1 round\. Failure: controlled for 1 round/);
        assert.match(card, /Critical failure: permanently controlled until removed/);
        assert.match(card, /normal fascinated hostility breaks still apply/);
        assert.match(card, /degree after incapacitation adjustments/);
      }
      assert.deepEqual(env.tokenFlags, {});
      assert.deepEqual(env.tokenFlagWrites, []);
      for (const content of [env.prompts[0].content, env.messages[0].content]) {
        assert.match(content, /no automatic movement lock/i);
        assert.match(content, /adjudicat.*movement|movement.*adjudicat/i);
        assert.doesNotMatch(content, /roots Blaster|Rooted until|cannot move until/i);
      }
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
  assert.match(env.messages[0].content, /24d10\[mental\]/);
  assert.match(env.messages[0].content, /@Check\[will/);
  assert.match(env.messages[0].content, /options:area-damage/);
  assert.ok(env.messages[0].content.includes(`@UUID[Compendium.${MODULE}.astillon-blaster-items.Item.BlasterStupor001]{Failure effect}`));
  assert.equal(env.flags.blastUse.mode, "humiliation");
  assert.equal(env.flags.blastUse.readyRound, 4);
  assert.deepEqual(env.tokenFlags, {});
  assert.deepEqual(env.tokenFlagWrites, []);
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
    assert.deepEqual(env.tokenFlags, {});
    assert.deepEqual(env.tokenFlagWrites, []);
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
      assert.match(env.prompts[0].content, /Action costs, frequency, and recharge remain GM-adjudicated/);
      assert.deepEqual(env.tokenFlags, {});
      assert.deepEqual(env.tokenFlagWrites, []);
      if (charge === 3 && timing === "no combat") assert.doesNotMatch(env.messages[0].content, /available round/);
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
        readyRound: (current?.round ?? 0) + 3, readyTime: 60, mode: "fire",
      });
      assert.deepEqual(env.tokenFlags, {});
      assert.deepEqual(env.tokenFlagWrites, []);
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
  ["same-id token replacement", env => { env.scene.tokens.set("blaster", { ...env.scene.tokens.get("blaster") }); }, /scene or selected token changed/],
  ["scene change", env => { env.globals.canvas.scene = { id: "another-scene" }; }, /scene or selected token changed/],
  ["same-id scene replacement", env => { env.globals.canvas.scene = { ...env.scene }; }, /scene or selected token changed/],
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
      assert.deepEqual(env.tokenFlags, {});
      assert.deepEqual(env.tokenFlagWrites, []);
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

for (const timing of ["combat", "outside combat"]) {
  test(`movement stays unrestricted with an active legacy root ${timing}`, async t => {
    const env = setup(t);
    if (timing === "outside combat") env.globals.game.combat = null;
    const legacyRoot = { combatId: timing === "combat" ? "combat" : null, round: 1, turn: 0, expires: 6 };
    env.tokenFlags.blastRoot = legacyRoot;
    await env.feature.ready();
    const pending = env.feature.api.blast(); await setImmediate();
    env.click(aim);
    await pending;
    assert.equal(env.regions.length, 1);
    assert.equal(env.messages.length, 1);
    const token = env.scene.tokens.get("blaster");
    const changed = { x: 100, y: 200, elevation: 10, level: "roof" };
    assert.equal(Hooks.call("preMoveToken", token, { destination: changed }, {}), true);
    assert.equal(Hooks.call("preUpdateToken", token, changed, {}), true);
    Object.assign(token, changed);
    assert.deepEqual({ x: token.x, y: token.y, elevation: token.elevation, level: token.level }, changed);
    assert.deepEqual(env.callbacks.get("preMoveToken") ?? [], []);
    assert.deepEqual(env.callbacks.get("preUpdateToken") ?? [], []);
    assert.deepEqual(env.tokenFlags.blastRoot, legacyRoot);
    assert.deepEqual(env.tokenFlagWrites, []);
    assert.deepEqual(env.warnings, []);
    assert.deepEqual(env.errors, []);
  });
}

test("public API preserves Release Blast Root for legacy macros and clears only the legacy flag", async t => {
  const env = setup(t);
  for (const name of ["blast", "clearBlast", "releaseRoot", "refreshDescriptions", "markFinale", "fireFinale", "clearFinale", "blastback", "fireBlastback", "clearBlastback", "applyBlastEffect", "counterblast", "upgradeSheet", "flashMob", "commandMob", "cancelPlacement"]) {
    assert.equal(typeof env.feature.api[name], "function", `${name} remains exposed`);
  }
  env.tokenFlags.blastRoot = { combatId: "combat", round: 1, turn: 0, expires: 6 };
  env.tokenFlags.unrelated = { keep: true };
  await env.feature.api.releaseRoot();
  assert.deepEqual(env.tokenFlags, { unrelated: { keep: true } });
  assert.deepEqual(env.tokenFlagWrites, [{ operation: "unset", key: "blastRoot" }]);
  await env.feature.api.releaseRoot();
  assert.deepEqual(env.tokenFlags, { unrelated: { keep: true } });
  assert.deepEqual(env.errors, []);
});

test("failed bookkeeping rolls back only just-created areas without writing token flags", async t => {
  const env = setup(t);
  t.mock.method(console, "error", () => {});
  env.scene.tokens.get("blaster").actor.setFlag = async () => { throw new Error("simulated failed actor write"); };
  const pending = env.feature.api.blast(); await setImmediate();
  env.click(aim);
  await pending;
  assert.equal(env.regions.length, 0);
  assert.deepEqual(env.tokenFlags, {});
  assert.deepEqual(env.tokenFlagWrites, []);
  assert.equal(env.messages.length, 0);
  assert.match(env.errors.at(-1), /failed actor write/);
});

test("failed repeated blast preserves legacy flags, previous use metadata and areas without root rollback", async t => {
  const env = setup(t);
  t.mock.method(console, "error", () => {});
  const legacyRoot = { combatId: "combat", round: 1, turn: 0, expires: 6 };
  env.tokenFlags.blastRoot = legacyRoot;
  const first = env.feature.api.blast(); await setImmediate();
  env.click(aim);
  await first;
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
  assert.deepEqual(env.tokenFlags.blastRoot, legacyRoot);
  assert.deepEqual(env.tokenFlagWrites, []);
  assert.deepEqual(env.flags.blastUse, previousUse);
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
    { id: "same", slug: "blaster-charged-blast-1", type: "action", toObject: () => ({ system: { description: { value: "@Damage[6d8[fire]]" } } }) },
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
