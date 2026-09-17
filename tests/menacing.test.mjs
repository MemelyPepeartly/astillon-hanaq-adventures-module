import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createMenacingFeature } from "../dist/scripts/features/menacing.js";

const MODULE = "astillon-hanaq-adventures-module";
const STATUS = `${MODULE}.menacing`;
const flush = () => setImmediate();

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function setup(t, { registry = {}, texturePromise } = {}) {
  const dom = new JSDOM("<!doctype html><body></body>");
  const callbacks = new Map();
  const sprites = [];
  const warnings = [];
  const textureLoads = [];
  const pinned = new Set();
  const emit = (name, ...args) => {
    for (const callback of callbacks.get(name) ?? []) callback(...args);
  };
  const Hooks = { on(name, callback) {
    const listeners = callbacks.get(name) ?? [];
    listeners.push(callback);
    callbacks.set(name, listeners);
  } };
  const point = () => ({ x: 0, y: 0, set(x, y = x) { this.x = x; this.y = y; } });
  class AnimatedSprite {
    constructor(frames) {
      this.frames = frames;
      this.scale = point();
      this.scale.set(1);
      this.anchor = point();
      this.position = point();
      this.destroyed = false;
      this.playing = false;
      sprites.push(this);
    }
    set height(value) { this.scale.y = value / this.frames[0].texture.frame.height; }
    get height() { return this.scale.y * this.frames[0].texture.frame.height; }
    play() { this.playing = true; }
    stop() { this.playing = false; }
    destroy(...args) { this.destroyed = true; this.playing = false; this.destroyArguments = args; }
  }
  const game = { i18n: { localize: () => "Menacing" }, user: { isGM: false } };
  const canvas = { tokens: { controlled: [], placeables: [], hud: null } };
  const globals = {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    KeyboardEvent: dom.window.KeyboardEvent,
    AbortController: dom.window.AbortController,
    CONFIG: { statusEffects: registry },
    Hooks, game, canvas,
    ui: { notifications: { warn: (message) => warnings.push(message), error() {} } },
    PIXI: {
      AnimatedSprite,
      Rectangle: class { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } },
      Texture: class { constructor(baseTexture, frame) { Object.assign(this, { baseTexture, frame }); } },
    },
    foundry: { canvas: {
      TextureLoader: { pinSource: (src) => pinned.add(src), unpinSource: (src) => pinned.delete(src) },
      loadTexture: async (src) => {
        textureLoads.push(src);
        return texturePromise ? await texturePromise : { baseTexture: {} };
      },
    } },
    fetch: async () => ({ ok: true, json: async () => ({ frames: [
      { x: 0, y: 0, w: 100, h: 200, duration: 40 },
      { x: 100, y: 0, w: 100, h: 200, duration: 80 },
    ] }) }),
  };
  const originals = new Map(Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  t.after(() => {
    emit("canvasTearDown");
    dom.window.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const feature = createMenacingFeature(MODULE);
  feature.init();

  function token({ active = false, actor = {}, owner = true } = {}) {
    const flags = { menacing: active };
    const document = {
      actor, isOwner: owner, hidden: false, writes: [],
      getFlag(scope, key) { assert.equal(scope, MODULE); return flags[key]; },
      async setFlag(scope, key, value) {
        assert.equal(scope, MODULE);
        this.writes.push({ key, value });
        flags[key] = value;
        emit("updateToken", this);
      },
    };
    const result = {
      document, actor, w: 100, h: 200, isVisible: true, mesh: { visible: true },
      children: [], destroyed: false,
      addChild(child) { this.children.push(child); child.parent = this; },
      removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parent = null; },
      remoteActive(value) { flags.menacing = value; emit("updateToken", document); },
    };
    document.object = result;
    canvas.tokens.placeables.push(result);
    return result;
  }

  function hud(token, { custom = true } = {}) {
    const root = dom.window.document.createElement("div");
    root.innerHTML = `<div class="status-effects"><div class="title-bar"></div>
      <a class="effect-control" data-status-id="frightened"><img src="frightened.webp"></a>
      ${custom ? `<a class="effect-control" data-status-id="${STATUS}"><img src="menacing.png"></a>` : ""}</div>`;
    dom.window.document.body.append(root);
    const result = { document: token.document, object: token, element: root };
    canvas.tokens.hud = result;
    emit("renderTokenHUD", result, root);
    return result;
  }

  function event(target, type, key) {
    const value = type === "keydown"
      ? new dom.window.KeyboardEvent(type, { key, bubbles: true, cancelable: true })
      : new dom.window.MouseEvent(type, { bubbles: true, cancelable: true });
    target.dispatchEvent(value);
    return value;
  }
  return { feature, emit, token, hud, event, sprites, warnings, textureLoads, pinned, canvas, game };
}

test("registers V14 status without replacing ordinary statuses and recovers after PF2e theme resets", (t) => {
  const frightened = { id: "frightened", name: "Frightened" };
  const env = setup(t, { registry: { frightened } });
  assert.equal(CONFIG.statusEffects.frightened, frightened);
  assert.equal(CONFIG.statusEffects[STATUS].img, `modules/${MODULE}/assets/menacing-icon.png`);
  env.feature.ready();
  assert.equal(Object.keys(CONFIG.statusEffects).length, 2);
  for (const key of ["pf2e.statusEffectType", "pf2e.deathIcon"]) {
    CONFIG.statusEffects = { frightened };
    env.emit("updateSetting", { key });
    assert.equal(CONFIG.statusEffects[STATUS].id, STATUS);
  }
  CONFIG.statusEffects = { frightened };
  const hud = env.hud(env.token(), { custom: false });
  assert.equal(hud.element.querySelectorAll(`[data-status-id="${STATUS}"]`).length, 1);
  assert.equal(CONFIG.statusEffects[STATUS].id, STATUS);
});

test("V13 array registration and repeated HUD renders remain idempotent", async (t) => {
  const env = setup(t, { registry: [{ id: "frightened" }] });
  env.feature.ready();
  const token = env.token();
  const hud = env.hud(token);
  env.emit("renderTokenHUD", hud, { 0: hud.element });
  env.emit("renderTokenHUD", hud, hud.element);
  assert.equal(CONFIG.statusEffects.filter((entry) => entry.id === STATUS).length, 1);
  env.event(hud.element.querySelector(`[data-status-id="${STATUS}"] img`), "click");
  await flush();
  assert.equal(token.document.writes.length, 1);
});

test("custom HUD events intercept PF2e handlers while ordinary conditions remain untouched", async (t) => {
  const env = setup(t);
  const token = env.token();
  const hud = env.hud(token);
  const custom = hud.element.querySelector(`[data-status-id="${STATUS}"]`);
  const frightened = hud.element.querySelector('[data-status-id="frightened"]');
  let customCalls = 0;
  let conditionCalls = 0;
  custom.addEventListener("click", () => { customCalls++; });
  frightened.addEventListener("click", () => { conditionCalls++; });
  const clicked = env.event(custom.querySelector("img"), "click");
  await flush();
  assert.equal(clicked.defaultPrevented, true);
  assert.equal(customCalls, 0);
  assert.equal(custom.getAttribute("aria-pressed"), "true");
  assert.equal(custom.classList.contains("active"), true);
  const ordinary = env.event(frightened.querySelector("img"), "click");
  assert.equal(ordinary.defaultPrevented, false);
  assert.equal(conditionCalls, 1);
  assert.equal(token.document.writes.length, 1);

  for (const [type, key, expected] of [["contextmenu", undefined, false], ["keydown", "Enter", true], ["keydown", " ", false]]) {
    assert.equal(env.event(custom, type, key).defaultPrevented, true);
    await flush();
    assert.equal(env.feature.api.isActive(token.document), expected);
    assert.equal(custom.getAttribute("aria-pressed"), String(expected));
  }
  assert.equal(env.event(custom, "keydown", "Escape").defaultPrevented, false);
  assert.equal(token.document.writes.length, 4);
});

test("toggle persists on the selected token only, even when siblings share an actor", async (t) => {
  const env = setup(t);
  const actor = {};
  const selected = env.token({ actor });
  const sibling = env.token({ actor });
  const unowned = env.token({ owner: false });
  env.canvas.tokens.controlled = [selected, sibling];
  assert.equal(await env.feature.api.toggle(), true);
  await flush();
  assert.equal(env.feature.api.isActive(selected.document), true);
  assert.equal(env.feature.api.isActive(sibling.document), false);
  assert.equal(sibling.children.length, 0);
  assert.equal(sibling.document.writes.length, 0);
  assert.equal(await env.feature.api.toggle(unowned), false);
  assert.equal(unowned.document.writes.length, 0);
  assert.equal(env.warnings.length, 1);
});

test("canvas restoration and remote token updates share the atlas and refresh the open HUD", async (t) => {
  const env = setup(t);
  const first = env.token({ active: true });
  const second = env.token({ active: true });
  const hud = env.hud(first);
  env.emit("canvasReady");
  await flush();
  assert.equal(env.textureLoads.length, 1);
  assert.equal(first.children.length, 1);
  assert.equal(second.children.length, 1);
  assert.equal(first.document.writes.length, 0);
  assert.deepEqual(first.children[0].frames.map((frame) => frame.time), [40, 80]);
  first.remoteActive(false);
  await flush();
  assert.equal(first.children.length, 0);
  assert.equal(second.children.length, 1);
  assert.equal(hud.element.querySelector(`[data-status-id="${STATUS}"]`).getAttribute("aria-pressed"), "false");
  first.remoteActive(true);
  await flush();
  assert.equal(first.children.length, 1);
  assert.equal(env.textureLoads.length, 1);
});

test("animation follows token geometry and respects hidden, invisible and detection-only tokens", async (t) => {
  const env = setup(t);
  const token = env.token({ active: true });
  env.emit("drawToken", token);
  await flush();
  const sprite = token.children[0];
  assert.equal(sprite.height, 85);
  assert.equal(sprite.scale.x, sprite.scale.y);
  assert.equal(sprite.position.x, 94);
  assert.equal(sprite.position.y, 24);
  assert.equal(sprite.anchor.x, 0.5);
  assert.equal(sprite.eventMode, "none");
  assert.equal(sprite.playing, true);
  token.w = 300;
  token.h = 100;
  env.emit("refreshToken", token);
  assert.equal(sprite.position.x, 282);
  assert.equal(sprite.position.y, 12);
  assert.equal(token.children[0], sprite);

  for (const [object, property, hiddenValue, visibleValue] of [
    [token, "isVisible", false, true],
    [token.mesh, "visible", false, true],
    [token, "detectionFilter", {}, null],
    [token.document, "hidden", true, false],
  ]) {
    object[property] = hiddenValue;
    env.emit("refreshToken", token);
    assert.equal(sprite.visible, false, property);
    assert.equal(sprite.playing, false, property);
    object[property] = visibleValue;
    env.emit("refreshToken", token);
    assert.equal(sprite.visible, true, property);
  }
  token.document.hidden = true;
  env.game.user.isGM = true;
  env.emit("refreshToken", token);
  assert.equal(sprite.visible, true);
  assert.equal(sprite.alpha, 0.5);
});

for (const action of ["toggle off", "scene teardown", "token deletion"]) {
  test(`a late atlas load cannot resurrect an animation after ${action}`, async (t) => {
    const pending = deferred();
    const env = setup(t, { texturePromise: pending.promise });
    const token = env.token({ active: true });
    env.emit("drawToken", token);
    if (action === "toggle off") token.remoteActive(false);
    if (action === "scene teardown") env.emit("canvasTearDown");
    if (action === "token deletion") env.emit("deleteToken", token.document);
    pending.resolve({ baseTexture: {} });
    await flush();
    assert.equal(token.children.length, 0);
    assert.equal(env.sprites.length, 0);
  });
}

test("redraw, deletion and scene teardown release sprites without destroying shared textures", async (t) => {
  const env = setup(t);
  const first = env.token({ active: true });
  const second = env.token({ active: true });
  env.emit("canvasReady");
  await flush();
  const original = first.children[0];
  env.emit("drawToken", first);
  await flush();
  assert.equal(original.destroyed, true);
  assert.deepEqual(original.destroyArguments, []);
  assert.equal(first.children.length, 1);
  assert.notEqual(first.children[0], original);
  assert.equal(second.children[0].destroyed, false);
  assert.equal(env.textureLoads.length, 1);
  const replacement = first.children[0];
  env.emit("destroyToken", first);
  assert.equal(replacement.destroyed, true);
  assert.equal(first.children.length, 0);
  const remaining = second.children[0];
  env.emit("canvasTearDown");
  assert.equal(remaining.destroyed, true);
  assert.equal(second.children.length, 0);
});
