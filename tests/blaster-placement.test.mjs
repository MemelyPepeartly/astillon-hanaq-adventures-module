import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { createBlastPicker } from "../dist/scripts/features/blaster-placement.js";

const options = { title: "Grand Finale", pointCount: 8, range: 120, width: 3, color: "#ff4433" };
const origin = { x: 50, y: 50 };
const maximumPoints = Array.from({ length: 8 }, (_, i) => ({ x: i % 2 ? 2450 : 50, y: 50 }));

function setup(t, { size = 100, distance = 5, scale = 1, viewportScale = 1, center } = {}) {
  const dom = new JSDOM("<!doctype html><body><canvas></canvas></body>");
  const view = dom.window.document.querySelector("canvas");
  const rect = { left: 20, top: 30, width: 3000 * viewportScale, height: 2000 * viewportScale };
  view.getBoundingClientRect = () => rect;
  const callbacks = new Map();
  const warnings = [], measurements = [];
  const scene = { id: "scene", tokens: new Map() };
  const tokenDoc = { id: "blaster", x: 0, y: 0, width: 1, height: 1, parent: scene };
  const token = { id: "blaster", name: "Blaster", document: tokenDoc, ...(center ? { center } : {}) };
  scene.tokens.set(token.id, tokenDoc);
  const globals = {
    document: dom.window.document,
    window: dom.window,
    Hooks: {
      on(name, fn) { const listeners = callbacks.get(name) ?? []; listeners.push(fn); callbacks.set(name, listeners); return fn; },
      off(name, fn) { callbacks.set(name, (callbacks.get(name) ?? []).filter(listener => listener !== fn)); },
    },
    ui: { notifications: { warn: message => warnings.push(message) } },
    canvas: {
      ready: true, scene, tokens: { controlled: [token] },
      app: { canvas: view, screen: { width: 3000, height: 2000 } },
      stage: {
        scale: { x: scale, y: scale },
        toGlobal: point => ({ x: point.x * scale, y: point.y * scale }),
        toLocal: point => ({ x: point.x / scale, y: point.y / scale }),
      },
      grid: {
        isSquare: true, size, distance, units: "ft",
        getCenterPoint: point => ({ x: Math.floor(point.x / size) * size + size / 2, y: Math.floor(point.y / size) * size + size / 2 }),
        measurePath(path) {
          assert.equal(path.length, 2, "Each leg must use the public measurePath API independently");
          measurements.push(path.map(point => ({ ...point })));
          return { distance: Math.hypot(path[1].x - path[0].x, path[1].y - path[0].y) / size * distance };
        },
      },
    },
  };
  const prior = Object.fromEntries(Object.keys(globals).map(key => [key, globalThis[key]]));
  Object.assign(globalThis, globals);
  const picker = createBlastPicker();
  t.after(() => {
    picker.cancel();
    for (const key of Object.keys(globals)) {
      if (prior[key] === undefined) delete globalThis[key];
      else globalThis[key] = prior[key];
    }
    dom.window.close();
  });
  const pointer = (type, point, button = 0) => view.dispatchEvent(new dom.window.MouseEvent(type, {
    clientX: rect.left + point.x * scale * viewportScale,
    clientY: rect.top + point.y * scale * viewportScale,
    button, bubbles: true, cancelable: true,
  }));
  return {
    picker, token, tokenDoc, scene, callbacks, warnings, measurements, globals, dom, view,
    click: (point, button = 0) => pointer("pointerdown", point, button),
    move: point => pointer("pointermove", point),
    key: key => dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })),
    hook: name => { for (const callback of [...(callbacks.get(name) ?? [])]) callback(); },
  };
}

function assertClean(env) {
  assert.equal(env.picker.busy, false);
  assert.equal(document.querySelector(".aha-blast-preview"), null);
  assert.equal(document.querySelector(".aha-blast-instructions"), null);
  assert.equal(env.callbacks.get("canvasPan")?.length ?? 0, 0);
  assert.equal(env.callbacks.get("canvasTearDown")?.length ?? 0, 0);
}

function previewPoints() {
  return document.querySelector(".aha-blast-preview polyline").getAttribute("points").trim().split(/\s+/).filter(Boolean).map(pair => {
    const [x, y] = pair.split(",").map(Number);
    return { x, y };
  });
}

for (const click of [{ x: 150, y: 50 }, { x: 5050, y: 50 }]) {
  test(`one direction click at ${click.x} returns a full 120-foot beam from the token center`, async t => {
    const env = setup(t, { center: origin });
    assert.equal(env.picker.busy, false);
    const pending = env.picker.pick(env.token, { ...options, pointCount: 2, fixedLength: 120 });
    await setImmediate();
    assert.equal(env.picker.busy, true);
    env.move(click);
    const preview = previewPoints();
    assert.equal(preview.length, 2);
    assert.equal(Math.hypot(preview[1].x - preview[0].x, preview[1].y - preview[0].y), 2400);
    assert.equal(document.querySelector(".aha-blast-preview polyline").getAttribute("stroke-width"), "300");
    env.click(click);
    assert.deepEqual(await pending, [origin, { x: 2450, y: 50 }]);
    assert.deepEqual(env.warnings, []);
    assertClean(env);
  });
}

test("fixed beams use grid distance, snap the aim square, and prefer the rendered token center", async t => {
  const center = { x: 150, y: 150 };
  const env = setup(t, { size: 200, distance: 10, center });
  const pending = env.picker.pick(env.token, { ...options, pointCount: 2, fixedLength: 120 });
  await setImmediate();
  // This click snaps to (500, 300), so the normalized direction is (350, 150).
  env.click({ x: 420, y: 240 });
  const result = await pending;
  assert.deepEqual(result[0], center);
  const delta = { x: result[1].x - center.x, y: result[1].y - center.y };
  assert.ok(Math.abs(Math.hypot(delta.x, delta.y) - 2400) < 1e-8);
  assert.ok(Math.abs(delta.x / delta.y - 350 / 150) < 1e-8);
  assertClean(env);
});

test("fixed beam origin falls back to the center of a larger token document", async t => {
  const env = setup(t);
  Object.assign(env.tokenDoc, { x: 200, y: 100, width: 2, height: 3 });
  const pending = env.picker.pick(env.token, { ...options, pointCount: 2, width: 1, fixedLength: 120 });
  await setImmediate();
  env.click({ x: 650, y: 250 });
  assert.deepEqual(await pending, [{ x: 300, y: 250 }, { x: 2700, y: 250 }]);
  assertClean(env);
});

test("aiming at the origin does not finish a fixed beam with an undefined direction", async t => {
  const env = setup(t, { center: origin });
  const pending = env.picker.pick(env.token, { ...options, pointCount: 2, fixedLength: 120 });
  await setImmediate();
  env.click(origin);
  assert.equal(env.picker.busy, true);
  env.click({ x: 50, y: 150 });
  assert.deepEqual(await pending, [origin, { x: 50, y: 2450 }]);
  assertClean(env);
});

test("eight clicked points accept seven independent 120-foot legs totaling 840 feet", async t => {
  const env = setup(t);
  const pending = env.picker.pick(env.token, options);
  await setImmediate();
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /0\/8/);
  for (const [index, point] of maximumPoints.entries()) {
    if (index) {
      env.move(point);
      assert.equal(document.querySelector(".aha-blast-preview polyline").getAttribute("stroke"), options.color);
      assert.match(document.querySelector(".aha-blast-instructions").textContent, /120\/120 ft/);
    }
    env.click(point);
    if (index < maximumPoints.length - 1) {
      assert.equal(env.picker.busy, true);
      assert.equal(previewPoints().length, index + 1);
      assert.deepEqual([...document.querySelectorAll(".aha-blast-preview text")].map(marker => marker.textContent), Array.from({ length: index + 1 }, (_, i) => String(i + 1)));
    }
  }
  assert.deepEqual(await pending, maximumPoints);
  assert.ok(env.measurements.length > 0);
  assert.ok(env.measurements.every(path => path.length === 2));
  assert.deepEqual(env.warnings, []);
  assertClean(env);
});

test("a 125-foot leg is rejected without spending one of the eight clicks", async t => {
  const env = setup(t);
  const pending = env.picker.pick(env.token, options);
  await setImmediate();
  env.click(origin);
  const tooFar = { x: 2550, y: 50 };
  env.move(tooFar);
  assert.equal(document.querySelector(".aha-blast-preview polyline").getAttribute("stroke"), "#ff2222");
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /125\/120 ft/);
  env.click(tooFar);
  assert.match(env.warnings.at(-1), /cannot exceed 120 ft/);
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /1\/8/);
  for (const point of maximumPoints.slice(1)) env.click(point);
  assert.deepEqual(await pending, maximumPoints);
  assertClean(env);
});

test("waypoint range checks honor the public grid measurement instead of pixel distance", async t => {
  const env = setup(t);
  const pending = env.picker.pick(env.token, options);
  await setImmediate();
  env.click(origin);
  env.globals.canvas.grid.measurePath = path => {
    assert.equal(path.length, 2);
    return { distance: 125 };
  };
  env.click({ x: 150, y: 50 });
  assert.match(env.warnings.at(-1), /cannot exceed 120 ft/);
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /1\/8/);
  env.picker.cancel();
  assert.equal(await pending, null);
  assertClean(env);
});

test("first waypoint must be clicked in Blaster's square and consecutive duplicates do not count", async t => {
  const env = setup(t);
  const pending = env.picker.pick(env.token, options);
  await setImmediate();
  env.click({ x: 150, y: 50 });
  assert.match(env.warnings.at(-1), /first waypoint/);
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /0\/8/);
  env.click(origin);
  env.click({ x: 10, y: 10 });
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /1\/8/);
  for (const point of maximumPoints.slice(1)) env.click(point);
  assert.deepEqual(await pending, maximumPoints);
  assertClean(env);
});

test("Backspace removes a waypoint and recalculates the next leg from its predecessor", async t => {
  const env = setup(t);
  const pending = env.picker.pick(env.token, options);
  await setImmediate();
  env.click(origin);
  env.click(maximumPoints[1]);
  env.move({ x: 2550, y: 50 });
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /5\/120 ft/);
  env.key("Backspace");
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /1\/8/);
  env.move({ x: 2550, y: 50 });
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /125\/120 ft/);
  assert.equal(document.querySelector(".aha-blast-preview polyline").getAttribute("stroke"), "#ff2222");
  env.key("Backspace");
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /0\/8.*Click Blaster's square first/);
  env.key("Backspace");
  for (const point of maximumPoints) env.click(point);
  assert.deepEqual(await pending, maximumPoints);
  assertClean(env);
});

test("SVG preview includes each waypoint and scales the full three-square width with the viewport", async t => {
  const env = setup(t, { scale: 1.5, viewportScale: 0.5 });
  const pending = env.picker.pick(env.token, options);
  await setImmediate();
  for (const point of maximumPoints.slice(0, 7)) env.click(point);
  const preview = document.querySelector(".aha-blast-preview");
  assert.equal(preview.querySelector("polyline").getAttribute("stroke-width"), "225");
  assert.equal(preview.querySelectorAll("text").length, 7);
  assert.deepEqual(previewPoints(), maximumPoints.slice(0, 7).map(point => ({ x: 20 + point.x * 0.75, y: 30 + point.y * 0.75 })));
  env.click(maximumPoints[7]);
  assert.deepEqual(await pending, maximumPoints);
  assertClean(env);
});

for (const cancel of ["Escape", "right-click", "contextmenu", "api", "canvasTearDown"]) {
  test(`${cancel} cancels a partial eight-point path, removes listeners, and releases busy`, async t => {
    const env = setup(t);
    const pending = env.picker.pick(env.token, options);
    await setImmediate();
    for (const point of maximumPoints.slice(0, 3)) env.click(point);
    if (cancel === "Escape") env.key("Escape");
    else if (cancel === "right-click") env.click(origin, 2);
    else if (cancel === "contextmenu") env.view.dispatchEvent(new env.dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    else if (cancel === "api") env.picker.cancel();
    else env.hook(cancel);
    assert.equal(await pending, null);
    assertClean(env);
    const warnings = [...env.warnings];
    env.click({ x: 9999, y: 9999 });
    env.move(origin);
    env.key("Backspace");
    env.hook("canvasPan");
    assert.deepEqual(env.warnings, warnings);
    assertClean(env);
    const retry = env.picker.pick(env.token, { ...options, pointCount: 2, fixedLength: 120 });
    await setImmediate();
    env.click({ x: 150, y: 50 });
    assert.deepEqual(await retry, [origin, { x: 2450, y: 50 }]);
    assertClean(env);
  });
}

test("a busy picker does not replace the active path with another request", async t => {
  const env = setup(t);
  const pending = env.picker.pick(env.token, options);
  await setImmediate();
  env.click(origin);
  assert.equal(await env.picker.pick(env.token, { ...options, pointCount: 2, fixedLength: 120 }), null);
  assert.equal(env.picker.busy, true);
  assert.equal(document.querySelectorAll(".aha-blast-preview").length, 1);
  assert.match(document.querySelector(".aha-blast-instructions").textContent, /1\/8/);
  for (const point of maximumPoints.slice(1)) env.click(point);
  assert.deepEqual(await pending, maximumPoints);
  assertClean(env);
});

for (const event of ["pointerdown", "pointermove", "canvasPan", "resize"]) {
  test(`scene replacement during ${event} cancels without reading the new scene's grid`, async t => {
    const env = setup(t);
    const pending = env.picker.pick(env.token, options);
    await setImmediate();
    env.click(origin);
    env.globals.canvas.scene = { id: "another-scene" };
    env.globals.canvas.grid = null;
    env.globals.canvas.stage = null;
    if (event === "pointerdown") env.click(maximumPoints[1]);
    else if (event === "pointermove") env.move(maximumPoints[1]);
    else if (event === "resize") env.dom.window.dispatchEvent(new env.dom.window.Event("resize"));
    else env.hook(event);
    assert.equal(await pending, null);
    assertClean(env);
  });
}
