import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test, { describe } from "node:test";
import { JSDOM } from "jsdom";
import { createBeamClashFeature } from "../dist/scripts/features/beam-clash.js";
import {
  acceptBeamRoll, beamMeetingPoint, canSubmitBeamRoll, readBeamClash,
} from "../dist/scripts/features/beam-clash-model.js";

const MODULE = "astillon-hanaq-adventures-module";
const ROOT = ".astillon-beam-clash";
const RED_FILE = "jb2a.test.beam.red";
const BLUE_FILE = "jb2a.test.beam.blue";
const FREE_DEFAULT_FILE = "jb2a.energy_beam.normal.bluepink.03.30ft";
const flush = async () => { await setImmediate(); await setImmediate(); };

function state(overrides = {}) {
  return {
    version: 1, id: "clash-1", sceneId: "scene-1", redTokenId: "red-token", blueTokenId: "blue-token",
    redFile: RED_FILE, blueFile: BLUE_FILE, status: "active", round: 1, score: 0, revision: 0,
    red: null, blue: null, lastRound: null, winner: null, processed: [], ...overrides,
  };
}

const submission = (requestId, total, authorId = "gm") => ({ requestId, authorId, total });

describe("beam clash rules", () => {
  test("only GMs roll red and only non-GM owners roll blue", () => {
    const actor = { testUserPermission: (user, permission) => permission === "OWNER" && user.owns === true };
    assert.equal(canSubmitBeamRoll("red", { isGM: true }, actor), true);
    assert.equal(canSubmitBeamRoll("red", { isGM: false, owns: true }, actor), false);
    assert.equal(canSubmitBeamRoll("blue", { isGM: true, owns: true }, actor), false);
    assert.equal(canSubmitBeamRoll("blue", { isGM: false, owns: true }, actor), true);
    assert.equal(canSubmitBeamRoll("blue", { isGM: false, owns: false }, actor), false);
    assert.equal(canSubmitBeamRoll("blue", { isGM: false, owns: true }, null), false);
    assert.equal(canSubmitBeamRoll("red", null, actor), false);
  });

  test("a round waits for both dice, ties advance without changing score, and saved input is immutable", () => {
    const initial = state({ score: 1 });
    const first = acceptBeamRoll(initial, "blue", 1, submission("blue-1", 12, "owner"));
    assert.equal(first.round, 1);
    assert.equal(first.score, 1);
    assert.equal(first.blue.total, 12);
    assert.equal(initial.blue, null);
    assert.deepEqual(initial.processed, []);
    const tied = acceptBeamRoll(first, "red", 1, submission("red-1", 12));
    assert.equal(tied.round, 2);
    assert.equal(tied.score, 1);
    assert.equal(tied.red, null);
    assert.equal(tied.blue, null);
    assert.deepEqual(tied.lastRound, { round: 1, red: submission("red-1", 12), blue: submission("blue-1", 12, "owner") });
    assert.deepEqual(tied.processed, ["blue-1", "red-1"]);
  });

  for (const [winner, red, blue, expectedScore] of [["red", 20, 1, 3], ["blue", 1, 20, -3]]) {
    test(`${winner} wins only upon reaching ${expectedScore}`, () => {
      let current = state();
      for (let round = 1; round <= 3; round++) {
        current = acceptBeamRoll(current, "red", round, submission(`red-${round}`, red));
        current = acceptBeamRoll(current, "blue", round, submission(`blue-${round}`, blue, "owner"));
        assert.equal(current.status, round === 3 ? "finished" : "active");
      }
      assert.equal(current.score, expectedScore);
      assert.equal(current.winner, winner);
      assert.equal(acceptBeamRoll(current, "red", current.round, submission("after-end", 20)), null);
    });
  }

  test("duplicate, stale, invalid, stopped and non-d20 submissions cannot advance a clash", () => {
    const first = acceptBeamRoll(state(), "red", 1, submission("accepted", 8));
    assert.equal(acceptBeamRoll(first, "red", 1, submission("another-red", 20)), null);
    assert.equal(acceptBeamRoll(first, "blue", 1, submission("accepted", 20, "owner")), null);
    assert.equal(acceptBeamRoll(first, "blue", 2, submission("future", 20, "owner")), null);
    assert.equal(acceptBeamRoll(state({ status: "stopped" }), "red", 1, submission("stopped", 20)), null);
    for (const total of [0, 21, -1, NaN, Infinity, 1.5, "20"]) {
      assert.equal(acceptBeamRoll(state(), "red", 1, submission("bad", total)), null);
    }
    assert.equal(acceptBeamRoll(state(), "green", 1, submission("bad-side", 20)), null);
  });

  test("reconnect flag validation rejects incompatible and malformed state", () => {
    assert.equal(readBeamClash(state()).id, "clash-1");
    for (const value of [null, {}, state({ version: 0 }), state({ round: 0 }), state({ revision: -1 }),
      state({ redTokenId: "blue-token" }), state({ score: 3 }), state({ processed: [9] }),
      state({ blue: submission("bad", 21) }), state({ sceneId: "" })]) {
      assert.equal(readBeamClash(value), null);
    }
  });

  test("the meeting point moves toward the losing token and stays between the two", () => {
    const red = { x: 100, y: 80 };
    const blue = { x: 700, y: 380 };
    assert.deepEqual(beamMeetingPoint(red, blue, 0), { x: 400, y: 230 });
    assert.deepEqual(beamMeetingPoint(red, blue, 1), { x: 500, y: 280 });
    assert.deepEqual(beamMeetingPoint(red, blue, -1), { x: 300, y: 180 });
    assert.deepEqual(beamMeetingPoint(red, blue, 99), blue);
    assert.deepEqual(beamMeetingPoint(red, blue, -99), red);
  });
});

function collection(entries) {
  const result = new Map(entries.map((entry) => [entry.id, entry]));
  Object.defineProperty(result, "contents", { get: () => [...result.values()] });
  result.find = (predicate) => result.contents.find(predicate);
  result.filter = (predicate) => result.contents.filter(predicate);
  result.some = (predicate) => result.contents.some(predicate);
  return result;
}

function setup(t, { initial = null, userId = "gm", activeGM = "gm", dependencies = true, ready = true } = {}) {
  const dom = new JSDOM("<!doctype html><html><body><canvas id='board'></canvas></body></html>", { pretendToBeVisual: true });
  const callbacks = new Map();
  const hooks = {
    on(name, callback) {
      const listeners = callbacks.get(name) ?? [];
      listeners.push(callback);
      callbacks.set(name, listeners);
      return callback;
    },
    off(name, callback) { callbacks.set(name, (callbacks.get(name) ?? []).filter((entry) => entry !== callback)); },
  };
  const emit = (name, ...args) => (callbacks.get(name) ?? []).map((callback) => callback(...args));
  const warnings = [];
  const writes = [];
  const plays = [];
  const ends = [];
  const dice = [];
  const totals = [];
  const rollControl = { gate: null };
  const chatControl = { gate: null };
  const effectLoading = { deferred: false, complete: [] };
  const pans = [];
  const settings = new Map([["beamClashRedFile", RED_FILE], ["beamClashBlueFile", BLUE_FILE]]);
  const registrations = new Map();
  const users = collection([
    { id: "gm", isGM: true, active: true, name: "GM" },
    { id: "gm-two", isGM: true, active: true, name: "Other GM" },
    { id: "owner", isGM: false, active: true, name: "Owner" },
    { id: "outsider", isGM: false, active: true, name: "Observer" },
  ]);
  users.activeGM = users.get(activeGM) ?? null;
  const blueActor = { id: "blue-actor", testUserPermission: (user, permission) => permission === "OWNER" && ["owner", "gm", "gm-two"].includes(user.id) };
  const redActor = { id: "red-actor", testUserPermission: (user) => user.isGM };
  let flag = initial ? structuredClone(initial) : null;
  const scene = {
    id: "scene-1", grid: { size: 100 }, dimensions: { width: 2000, height: 1200 },
    getFlag(scope, key) { assert.equal(scope, MODULE); return key === "beamClash" ? flag : null; },
    async setFlag(scope, key, value) {
      assert.equal(scope, MODULE);
      assert.equal(key, "beamClash");
      flag = structuredClone(value);
      writes.push(structuredClone(value));
      emit("updateScene", scene, { flags: { [MODULE]: { beamClash: flag } } }, {}, game.user.id);
      return scene;
    },
    async unsetFlag(scope, key) { return this.setFlag(scope, key, null); },
  };
  function token(id, x, actor, name) {
    const document = {
      id, x, y: 200, width: 1, height: 1, name, actor, parent: scene, hidden: false,
      getCenterPoint() { return { x: this.x + 50, y: this.y + 50 }; },
    };
    const object = {
      id, name, document, actor, w: 100, h: 100, isVisible: true,
      get center() { return { x: document.x + 50, y: document.y + 50 }; },
      get x() { return document.x; }, get y() { return document.y; },
    };
    document.object = object;
    return object;
  }
  const red = token("red-token", 100, redActor, "Red");
  const blue = token("blue-token", 700, blueActor, "Blue");
  scene.tokens = collection([red.document, blue.document]);
  for (const user of users.values()) user.targets = new Set([blue]);
  const messages = collection([]);
  const game = {
    user: users.get(userId), users, scenes: collection([scene]), messages,
    modules: new Map([["sequencer", { active: dependencies }], ["JB2A_DnD5e", { active: dependencies }]]),
    settings: {
      register(_scope, key, configuration) { registrations.set(key, configuration); if (!settings.has(key)) settings.set(key, configuration.default); },
      get(_scope, key) { return settings.get(key); },
    },
  };
  const board = dom.window.document.querySelector("canvas");
  board.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 });
  const canvas = {
    ready: true, scene, dimensions: { size: 100, width: 2000, height: 1200 }, screenDimensions: [1200, 800],
    stage: { scale: { x: 1, y: 1 }, toGlobal: (point) => ({ ...point }) },
    app: { view: board, canvas: board, renderer: { screen: { width: 1200, height: 800 }, view: board } },
    tokens: { controlled: [red], placeables: [red, blue], get: (id) => scene.tokens.get(id)?.object },
    async animatePan(options) { pans.push(options); },
  };
  let nextMessage = 0;
  function message(request, authorId, { id = `request-${++nextMessage}`, origin = authorId, emitCreate = true } = {}) {
    const document = {
      id, author: { id: authorId }, _stats: { lastModifiedBy: origin },
      flags: { [MODULE]: { beamClashRequest: request } },
      getFlag(scope, key) { return this.flags[scope]?.[key]; },
    };
    messages.set(id, document);
    if (emitCreate) emit("createChatMessage", document, {}, origin);
    return document;
  }
  class Roll {
    constructor(formula) { this.formula = formula; dice.push(this); }
    async evaluate(options) {
      this.options = options;
      if (rollControl.gate) await rollControl.gate;
      this.total = totals.shift() ?? 10;
      return this;
    }
    async toMessage() {}
  }
  class Sequence {
    constructor() { this.effects = []; }
    effect() { this.current = { sceneId: canvas.scene.id }; this.effects.push(this.current); return this; }
    file(file) { this.current.file = file; return this; }
    atLocation(location) { this.current.location = structuredClone(location); return this; }
    stretchTo(target) { this.current.target = structuredClone(target); return this; }
    name(name) { this.current.name = name; return this; }
    persist(value = true) { this.current.persist = value; return this; }
    temporary(value = true) { this.current.temporary = value; return this; }
    tint(color) { this.current.tint = color; return this; }
    async play(options) {
      const invocation = { effects: [], options };
      plays.push(invocation);
      const complete = () => {
        invocation.effects = this.effects.filter((effect) => !emit("preCreateSequencerEffect", effect).includes(false));
      };
      if (effectLoading.deferred) await new Promise((resolve) => effectLoading.complete.push(() => { complete(); resolve(); }));
      else complete();
    }
  }
  const Sequencer = {
    Database: {
      entryExists: (key) => [RED_FILE, BLUE_FILE, FREE_DEFAULT_FILE].includes(key),
      getEntry: (key) => [RED_FILE, BLUE_FILE, FREE_DEFAULT_FILE].includes(key) ? { file: `${key}.webm` } : false,
      getAllFileEntries: () => [RED_FILE, BLUE_FILE, FREE_DEFAULT_FILE],
    },
    EffectManager: { async endEffects(filter, broadcast) { ends.push({ filter, broadcast }); } },
  };
  const rafs = new Map();
  let nextFrame = 0;
  const nativeSetTimeout = globalThis.setTimeout;
  const timers = new Set();
  const globals = {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element,
    Hooks: hooks, game, canvas, ui: { notifications: { warn: (text) => warnings.push(text), error: (text) => warnings.push(text), info() {} } },
    Sequence: dependencies ? Sequence : undefined, Sequencer: dependencies ? Sequencer : undefined,
    requestAnimationFrame: (callback) => { rafs.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: (id) => rafs.delete(id),
    setTimeout: (callback, duration, ...args) => {
      const timer = nativeSetTimeout(callback, duration, ...args);
      timers.add(timer);
      return timer;
    },
    foundry: {
      utils: { randomID: () => `generated-${++nextMessage}` }, dice: { Roll },
      documents: { ChatMessage: { implementation: { async create(data) {
        const request = data.flags?.[MODULE]?.beamClashRequest;
        if (!request) return { id: `result-${++nextMessage}`, author: game.user };
        const authorId = game.user.id;
        if (chatControl.gate) await chatControl.gate;
        return message(request, authorId);
      } } } },
    },
  };
  const originals = new Map(Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  const feature = createBeamClashFeature(MODULE);
  feature.init();
  if (ready) feature.ready();
  t.after(async () => {
    emit("canvasTearDown", canvas);
    for (const timer of timers) clearTimeout(timer);
    for (const complete of effectLoading.complete.splice(0)) complete();
    await flush();
    dom.window.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  function request(side, authorId, extras = {}, options = {}) {
    return message({ version: 1, action: "roll", sceneId: scene.id, clashId: flag?.id, round: flag?.round, side, ...extras }, authorId, options);
  }
  function startRequest(authorId, extras = {}, options = {}) {
    return message({
      version: 1, action: "start", sceneId: scene.id, clashId: flag?.id ?? null,
      redTokenId: red.id, blueTokenId: blue.id, redFile: RED_FILE, blueFile: BLUE_FILE, ...extras,
    }, authorId, options);
  }
  return {
    dom, feature, emit, warnings, writes, plays, ends, dice, totals, pans, settings, registrations,
    game, canvas, scene, red, blue, messages, message, request, startRequest, rollControl, chatControl, effectLoading, getState: () => flag,
    button: (side) => dom.window.document.querySelector(`${ROOT} [data-side='${side}']`),
    roots: () => [...dom.window.document.querySelectorAll(ROOT)],
  };
}

describe("beam clash document and canvas lifecycle", { concurrency: 1 }, () => {
  test("a solo connected GM can stage a clash while the blue actor's owner is offline", async (t) => {
    const env = setup(t);
    for (const user of env.game.users.values()) user.active = user.id === "gm";
    assert.deepEqual(env.game.users.contents.filter((user) => user.active).map((user) => user.id), ["gm"]);
    await env.feature.api.start();
    await flush();
    assert.equal(env.messages.size, 1);
    assert.equal(env.writes.length, 1);
    assert.equal(env.getState().status, "active");
    assert.deepEqual(env.warnings, []);
    assert.equal(env.button("red").disabled, false);
    assert.equal(env.button("blue").disabled, true);
  });

  test("a clash can be staged before ownership is assigned and its later-connected owner can roll blue", async (t) => {
    const env = setup(t);
    const gm = env.game.users.get("gm");
    const owner = env.game.users.get("owner");
    for (const user of env.game.users.values()) user.active = user.id === gm.id;
    env.blue.actor.testUserPermission = () => false;
    await env.feature.api.start();
    await flush();
    assert.equal(env.getState().status, "active");
    assert.deepEqual(env.warnings, []);

    env.game.user = owner;
    env.emit("updateActor", env.blue.actor);
    assert.equal(env.button("blue").disabled, true);
    assert.equal(await env.feature.api.roll("blue"), null, "unassigned players still cannot submit blue rolls");
    assert.equal(env.messages.size, 1);
    assert.equal(env.dice.length, 0);

    env.blue.actor.testUserPermission = (user, permission) => user.id === owner.id && permission === "OWNER";
    owner.active = true;
    env.emit("updateActor", env.blue.actor);
    env.emit("userConnected", owner, true);
    assert.equal(env.button("red").disabled, true);
    assert.equal(env.button("blue").disabled, false);
    const rollRequest = await env.feature.api.roll("blue");
    await flush();
    assert.ok(rollRequest, "the newly assigned owner can submit through the public API");
    assert.equal(env.dice.length, 0, "a player client never adjudicates its own request");

    // Deliver that same native document to the GM client's hook.
    env.game.user = gm;
    env.totals.push(15);
    env.emit("createChatMessage", rollRequest, {}, owner.id);
    await flush();
    assert.deepEqual(env.getState().blue, submission(rollRequest.id, 15, owner.id));
    assert.equal(env.getState().red, null);
    assert.equal(env.getState().round, 1);
    assert.equal(env.dice.length, 1);
  });

  test("non-GMs cannot start through the API or forged native start intents", async (t) => {
    const env = setup(t, { userId: "owner" });
    assert.equal(await env.feature.api.start(), null);
    assert.equal(env.messages.size, 0);
    assert.match(env.warnings[0], /Only a GM can start/i);

    env.game.user = env.game.users.get("gm");
    env.startRequest("owner", { userId: "gm" });
    env.startRequest("gm", {}, { origin: "owner" });
    await flush();
    assert.equal(env.writes.length, 0);
    assert.equal(env.getState(), null);
  });

  for (const side of ["red", "blue"]) {
    test(`a ${side} token without an actor is rejected by both the caller and GM authority`, async (t) => {
      const env = setup(t);
      env[side].document.actor = null;
      env[side].actor = null;
      assert.equal(await env.feature.api.start(), null);
      await flush();
      assert.equal(env.messages.size, 0);
      assert.equal(env.warnings.length, 1);
      assert.equal(env.writes.length, 0);

      env.startRequest("gm");
      await flush();
      assert.equal(env.writes.length, 0, "a direct start intent cannot bypass actor validation");
      assert.equal(env.getState(), null);
    });
  }

  test("optional dependencies are silent on load and missing keys produce an actionable start warning", async (t) => {
    const env = setup(t, { dependencies: false });
    assert.equal(env.feature.id, "beamClash");
    assert.equal(env.registrations.size, 2);
    assert.equal(env.warnings.length, 0);
    await env.feature.api.start();
    assert.equal(env.writes.length, 0);
    assert.match(env.warnings[0], /Sequencer.*reload/i);
  });

  test("an unavailable configured animation is rejected before creating shared state", async (t) => {
    const env = setup(t);
    env.settings.set("beamClashRedFile", "jb2a.not-installed");
    await env.feature.api.start();
    assert.equal(env.messages.size, 0);
    assert.equal(env.writes.length, 0);
    assert.match(env.warnings[0], /red.*Module Settings.*Database Viewer/i);
  });

  test("free JB2A defaults start without Patreon and tint the two beams red and blue", async (t) => {
    const env = setup(t);
    assert.equal(env.game.modules.get("JB2A_DnD5e").active, true);
    assert.equal(env.game.modules.has("jb2a_patreon"), false);
    for (const key of ["beamClashRedFile", "beamClashBlueFile"]) {
      const registered = env.registrations.get(key);
      assert.equal(registered.default, FREE_DEFAULT_FILE);
      env.settings.set(key, registered.default);
    }
    await env.feature.api.start();
    await flush();
    assert.deepEqual(env.warnings, []);
    assert.equal(env.getState().status, "active");
    assert.deepEqual(env.plays[0].effects.map(({ file, tint }) => ({ file, tint })), [
      { file: FREE_DEFAULT_FILE, tint: 0xff4040 },
      { file: FREE_DEFAULT_FILE, tint: 0x4080ff },
    ]);
  });

  test("GM start is deduplicated, persists on the scene, pans to both tokens, and creates local persistent beams", async (t) => {
    const env = setup(t);
    await Promise.all([env.feature.api.start(), env.feature.api.start()]);
    await flush();
    assert.equal(env.getState().status, "active");
    assert.equal(env.writes.length, 1);
    assert.equal(env.messages.size, 1);
    assert.equal(env.pans.length, 1);
    assert.equal(env.pans[0].x, 450);
    assert.equal(env.pans[0].y, 250);
    assert.ok(env.pans[0].scale > 0 && env.pans[0].scale <= 1.5);
    assert.equal(env.roots().length, 1);
    assert.equal(env.button("red").disabled, false);
    assert.equal(env.button("blue").disabled, true);
    assert.equal(env.plays.length, 1);
    assert.deepEqual(env.plays[0].options, { local: true });
    assert.deepEqual(env.plays[0].effects.map((effect) => effect.file), [RED_FILE, BLUE_FILE]);
    for (const effect of env.plays[0].effects) {
      assert.equal(effect.persist, true);
      assert.equal(effect.temporary, true);
      assert.deepEqual(effect.target, { x: 450, y: 250 });
    }
    env.emit("canvasReady", env.canvas);
    await flush();
    assert.equal(env.roots().length, 1);
    assert.equal(env.plays.length, 1, "repeated canvas hooks must not duplicate persistent effects");
    assert.equal(env.pans.length, 1);
  });

  test("authoritative document author and current actor ownership override forged identities and totals", async (t) => {
    const env = setup(t, { initial: state() });
    env.totals.push(7);
    env.request("red", "owner", { userId: "gm", total: 20 });
    env.request("blue", "gm", { userId: "owner", total: 20 });
    env.request("blue", "outsider", { userId: "owner", total: 20 });
    env.request("blue", "unknown-user", { userId: "owner", total: 20 });
    env.request("blue", "owner", {}, { origin: "outsider" });
    env.request("blue", "owner", { clashId: "old-clash" });
    env.request("blue", "owner", { round: 0 });
    await flush();
    assert.equal(env.dice.length, 0);
    assert.equal(env.writes.length, 0);
    const accepted = env.request("blue", "owner", { userId: "gm", total: 20 });
    await flush();
    assert.deepEqual(env.getState().blue, submission(accepted.id, 7, "owner"));
    assert.equal(env.dice[0].formula, "1d20");
    assert.deepEqual(env.dice[0].options, { allowInteractive: false });
  });

  test("double clicks and competing submissions consume only one die per side per round", async (t) => {
    const env = setup(t, { initial: state() });
    env.totals.push(17, 4);
    await Promise.all([env.feature.api.roll("red"), env.feature.api.roll("red")]);
    env.request("red", "gm-two");
    env.request("blue", "owner");
    env.request("blue", "owner");
    await flush();
    assert.equal(env.dice.length, 2);
    assert.equal(env.getState().round, 2);
    assert.equal(env.getState().score, 1);
    assert.equal(env.getState().lastRound.red.total, 17);
    assert.equal(env.getState().lastRound.blue.total, 4);
    assert.equal(env.getState().processed.length, 2);
  });

  test("double clicks remain latched while native ChatMessage creation is unresolved", async (t) => {
    const env = setup(t, { initial: state() });
    let release;
    env.chatControl.gate = new Promise((resolve) => { release = resolve; });
    const first = env.feature.api.roll("red");
    const second = await env.feature.api.roll("red");
    assert.equal(second, null);
    assert.equal(env.button("red").disabled, true);
    assert.equal(env.messages.size, 0);
    release();
    await first;
    await flush();
    assert.equal(env.messages.size, 1);
    assert.equal(env.dice.length, 1);
    assert.equal(env.button("red").disabled, true, "a persisted roll keeps that side disabled");
  });

  test("a failed authoritative write releases the request latch and permits a same-round retry", async (t) => {
    const env = setup(t, { initial: state() });
    const originalSetFlag = env.scene.setFlag;
    const failures = [];
    t.mock.method(console, "error", (...args) => failures.push(args));
    let failNext = true;
    t.mock.method(env.scene, "setFlag", async function (...args) {
      if (failNext) { failNext = false; throw new Error("temporary write failure"); }
      return originalSetFlag.apply(this, args);
    });
    env.totals.push(19, 8);
    await env.feature.api.roll("red");
    await flush();
    assert.equal(env.getState().red, null);
    assert.equal(env.getState().round, 1);
    assert.ok(failures.length > 0, "the failed persistence attempt is reported");
    assert.equal(env.button("red").disabled, false, "a failed write must not leave the client stuck waiting");
    await env.feature.api.roll("red");
    await flush();
    assert.equal(env.messages.size, 2);
    assert.equal(env.dice.length, 2);
    assert.equal(env.getState().red.total, 8);
    assert.equal(env.getState().round, 1);
    assert.equal(env.button("red").disabled, true);
  });

  test("a non-authority GM creates an intent but cannot adjudicate it locally", async (t) => {
    const env = setup(t, { initial: state(), userId: "gm-two" });
    await env.feature.api.roll("red");
    await flush();
    assert.equal(env.messages.size, 1);
    assert.equal(env.dice.length, 0);
    assert.equal(env.writes.length, 0);
    env.game.users.activeGM = env.game.user;
    env.emit("userConnected", env.game.users.get("gm"), false);
    await new Promise((resolve) => setTimeout(resolve, 225));
    await flush();
    assert.equal(env.dice.length, 1);
    assert.equal(env.getState().red.authorId, "gm-two");
  });

  test("reconnect recovers only the current round's roll requests, without replaying start or stop commands", async (t) => {
    const env = setup(t, { initial: state(), ready: false });
    const quiet = { emitCreate: false };
    env.message({ version: 1, action: "stop", sceneId: env.scene.id, clashId: "clash-1" }, "gm", quiet);
    env.message({ version: 1, action: "start", sceneId: env.scene.id, clashId: "clash-1",
      redTokenId: env.red.id, blueTokenId: env.blue.id, redFile: RED_FILE, blueFile: BLUE_FILE }, "gm", quiet);
    env.request("blue", "owner", { clashId: "previous-clash" }, quiet);
    env.request("red", "gm", { round: 8 }, quiet);
    const valid = env.request("blue", "owner", {}, quiet);
    env.totals.push(14);
    env.feature.ready();
    await new Promise((resolve) => setTimeout(resolve, 225));
    await flush();
    assert.equal(env.dice.length, 1);
    assert.equal(env.getState().status, "active");
    assert.deepEqual(env.getState().blue, submission(valid.id, 14, "owner"));
    env.emit("userConnected", env.game.users.get("owner"), true);
    await new Promise((resolve) => setTimeout(resolve, 225));
    await flush();
    assert.equal(env.dice.length, 1, "replaying the same persisted message must not reroll");
  });

  test("recovery rejects forged authors and requests without matching server-managed provenance", async (t) => {
    const env = setup(t, { initial: state(), ready: false });
    env.request("red", "gm", { userId: "gm", total: 20 }, { emitCreate: false, origin: "owner" });
    env.request("blue", "owner", {}, { emitCreate: false, origin: "gm" });
    const missing = env.request("red", "gm", {}, { emitCreate: false });
    delete missing._stats;
    const legitimate = env.request("blue", "owner", {}, { emitCreate: false });
    env.totals.push(9);
    env.feature.ready();
    await new Promise((resolve) => setTimeout(resolve, 225));
    await flush();
    assert.equal(env.dice.length, 1);
    assert.equal(env.getState().red, null);
    assert.deepEqual(env.getState().blue, submission(legitimate.id, 9, "owner"));
  });

  test("a live native create hook supplies provenance when stored stats are unavailable", async (t) => {
    const env = setup(t, { initial: state() });
    const live = env.request("blue", "owner", {}, { emitCreate: false });
    delete live._stats;
    env.totals.push(11);
    env.emit("createChatMessage", live, {}, "owner");
    await flush();
    assert.equal(env.dice.length, 1);
    assert.deepEqual(env.getState().blue, submission(live.id, 11, "owner"));
  });

  test("leadership and ownership are rechecked after an asynchronous die resolves", async (t) => {
    const env = setup(t, { initial: state() });
    let release;
    env.rollControl.gate = new Promise((resolve) => { release = resolve; });
    env.request("blue", "owner");
    await flush();
    assert.equal(env.dice.length, 1);
    env.blue.actor.testUserPermission = () => false;
    release();
    await flush();
    assert.equal(env.writes.length, 0, "revoking ownership while rolling prevents the write");
    env.blue.actor.testUserPermission = () => true;
    env.rollControl.gate = new Promise((resolve) => { release = resolve; });
    env.request("blue", "owner");
    await flush();
    env.game.users.activeGM = env.game.users.get("gm-two");
    release();
    await flush();
    assert.equal(env.writes.length, 0, "a former active GM must not commit the result");
  });

  test("an in-place flag revision change invalidates an asynchronous roll's original snapshot", async (t) => {
    const env = setup(t, { initial: state() });
    let release;
    env.rollControl.gate = new Promise((resolve) => { release = resolve; });
    env.request("red", "gm");
    await flush();
    env.getState().revision += 1;
    env.getState().score = 1;
    release();
    await flush();
    assert.equal(env.writes.length, 0);
    assert.equal(env.getState().score, 1);
    assert.equal(env.getState().red, null);
  });

  test("a winning round persists its winner and tears down the map interaction", async (t) => {
    const env = setup(t, { initial: state({ score: 2 }) });
    await flush();
    env.totals.push(20, 1);
    env.request("red", "gm");
    env.request("blue", "owner");
    await flush();
    assert.equal(env.getState().status, "finished");
    assert.equal(env.getState().winner, "red");
    assert.equal(env.getState().score, 3);
    assert.equal(env.roots().length, 0);
    assert.ok(env.ends.some(({ broadcast }) => broadcast === false));
    env.request("red", "gm");
    await flush();
    assert.equal(env.dice.length, 2);
  });

  for (const [userId, redDisabled, blueDisabled] of [["owner", true, false], ["outsider", true, true]]) {
    test(`${userId} reconnects to the saved map UI with role-appropriate controls`, async (t) => {
      const env = setup(t, { initial: state(), userId });
      env.blue.document.name = '<img src=x onerror="alert(1)">';
      env.emit("updateActor", env.blue.actor);
      await flush();
      assert.equal(env.roots().length, 1);
      assert.equal(env.button("red").disabled, redDisabled);
      assert.equal(env.button("blue").disabled, blueDisabled);
      assert.ok(env.button("blue").textContent.includes("<img"));
      assert.equal(env.roots()[0].querySelector("img"), null, "token names must remain text");
      assert.equal(env.writes.length, 0);
      assert.equal(env.plays.length, 1);
    });
  }

  test("token movement replaces local beams, updates buttons, and keeps the shared round intact", async (t) => {
    const env = setup(t, { initial: state() });
    await flush();
    const previousName = env.plays[0].effects[0].name;
    const previousLeft = env.button("red").style.left;
    env.red.document.x += 200;
    env.emit("updateToken", env.red.document, { x: env.red.document.x });
    await flush();
    assert.notEqual(env.button("red").style.left, previousLeft);
    assert.equal(env.plays.length, 2);
    assert.deepEqual(env.plays[1].effects[0].target, { x: 550, y: 250 });
    assert.ok(env.ends.some(({ filter, broadcast }) => filter.name === previousName && broadcast === false));
    assert.equal(env.getState().round, 1);
    assert.equal(env.writes.length, 0);
  });

  test("map controls account for canvas CSS offsets, CSS scaling and the stage transform", async (t) => {
    const env = setup(t, { initial: state() });
    const board = env.canvas.app.canvas;
    board.getBoundingClientRect = () => ({ left: 120, top: 60, width: 600, height: 400 });
    env.emit("canvasPan", env.canvas);
    assert.equal(env.button("red").style.left, "195px");
    assert.equal(env.button("red").style.top, "222px");
    assert.equal(env.button("blue").style.left, "495px");
    const score = env.roots()[0].querySelector(".astillon-beam-clash__score");
    assert.equal(score.style.left, "345px");
    assert.equal(score.style.top, "145px");
    env.canvas.stage.toGlobal = ({ x, y }) => ({ x: x * 2 + 20, y: y * 2 + 10 });
    env.emit("canvasPan", env.canvas);
    assert.equal(env.button("red").style.left, "280px");
    assert.equal(env.button("red").style.top, "377px");
    assert.equal(score.style.left, "580px");
    assert.equal(score.style.top, "275px");
    assert.equal(env.getState().revision, 0, "viewport movement must not mutate shared state");
  });

  test("scene teardown removes local UI/effects and scene return restores persisted state", async (t) => {
    const env = setup(t, { initial: state() });
    await flush();
    env.emit("canvasTearDown", env.canvas);
    env.canvas.scene = { id: "other-scene", getFlag: () => null };
    env.emit("canvasReady", env.canvas);
    await flush();
    assert.equal(env.roots().length, 0);
    assert.equal(env.ends.length, 1);
    assert.equal(env.ends[0].broadcast, false);
    assert.equal(env.getState().status, "active");
    env.canvas.scene = env.scene;
    env.emit("canvasReady", env.canvas);
    await flush();
    assert.equal(env.roots().length, 1);
    assert.equal(env.plays.length, 2);
    assert.equal(env.writes.length, 0);
  });

  test("GM stop and token deletion clear effects and persist a stopped tombstone", async (t) => {
    const env = setup(t, { initial: state() });
    await flush();
    await env.feature.api.stop();
    await flush();
    assert.equal(env.getState().status, "stopped");
    assert.equal(env.roots().length, 0);
    assert.ok(env.ends.every(({ broadcast }) => broadcast === false));
    await env.feature.api.start();
    await flush();
    assert.equal(env.getState().status, "active");
    env.scene.tokens.delete(env.blue.id);
    env.emit("deleteToken", env.blue.document);
    await flush();
    assert.equal(env.getState().status, "stopped");
    assert.equal(env.roots().length, 0);
  });

  test("late-loading effects cannot appear after stop or scene teardown", async (t) => {
    const env = setup(t, { ready: false });
    env.effectLoading.deferred = true;
    env.feature.ready();
    await env.feature.api.start();
    await flush();
    assert.equal(env.effectLoading.complete.length, 1);
    await env.feature.api.stop();
    await flush();
    env.effectLoading.complete.shift()();
    await flush();
    assert.deepEqual(env.plays[0].effects, []);
    await env.feature.api.start();
    await flush();
    env.emit("canvasTearDown", env.canvas);
    env.effectLoading.complete.shift()();
    await flush();
    assert.deepEqual(env.plays[1].effects, []);
    assert.equal(env.roots().length, 0);
  });
});
