import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test, { describe } from "node:test";
import { JSDOM } from "jsdom";
import {
  TURN_INTRO_MS,
  createYourTurnFeature,
  euclideanOutlineCovers,
  mixTowardWhite,
  renderOutlineMask,
  saturatedPanelColor,
  turnHighlight,
  turnIntroFrames,
} from "../dist/scripts/features/your-turn.js";

const MODULE = "astillon-hanaq-adventures-module";
const ROOT = ".astillon-yt";
const flush = () => setImmediate();

class BooleanFieldStub {
  constructor() {
    this.kind = "boolean";
  }
}

class NumberFieldStub {
  constructor(options) {
    this.kind = "number";
    this.options = options;
  }
}

function rect(left, top, width, height) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON() {
      return {};
    },
  };
}

function secondsList(value) {
  return String(value)
    .split(",")
    .map((part) => parseFloat(part.trim()))
    .filter((part) => !Number.isNaN(part));
}

function durationList(value) {
  return String(value)
    .split(",")
    .map((part) => {
      const amount = parseFloat(part.trim());
      return part.includes("ms") ? amount : amount * 1000;
    })
    .filter((part) => !Number.isNaN(part));
}

describe("your turn cut-in", { concurrency: 1 }, () => {
  function setup(t, { enabled = true, reduced = false, userId = "player-1", scale = 1, hold = 1.45, route = null } = {}) {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const callbacks = new Map();
    const settings = new Map([
      ["yourTurnEnabled", enabled],
      ["yourTurnScale", scale],
      ["yourTurnHold", hold],
    ]);
    const scheduled = [];
    const timerIds = [];
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    const imageControl = {
      auto: true,
      pending: [],
      requested: [],
      decoded: [],
      tainted: new Set(),
      pixels: new Map(),
      sizes: new Map(),
    };
    const filePickers = [];
    const errors = [];
    const calls = { nextTurn: 0, update: 0 };

    const emit = (name, ...args) => {
      for (const callback of callbacks.get(name) ?? []) callback(...args);
    };

    const sidebar = dom.window.document.createElement("aside");
    sidebar.id = "sidebar";
    let sidebarLeft = 900;
    sidebar.getBoundingClientRect = () => rect(sidebarLeft, 40, 300, 760);
    dom.window.document.body.append(sidebar);

    const hotbar = dom.window.document.createElement("div");
    hotbar.id = "ui-bottom";
    hotbar.getBoundingClientRect = () => rect(0, 820, 1400, 80);
    dom.window.document.body.append(hotbar);

    const uiLeft = dom.window.document.createElement("div");
    uiLeft.id = "ui-left";
    uiLeft.getBoundingClientRect = () => rect(0, 36, 64, 784);
    dom.window.document.body.append(uiLeft);

    const uiTop = dom.window.document.createElement("div");
    uiTop.id = "ui-top";
    uiTop.getBoundingClientRect = () => rect(0, 0, 1400, 36);
    dom.window.document.body.append(uiTop);

    dom.window.innerWidth = 1400;
    dom.window.innerHeight = 900;
    dom.window.matchMedia = (query) => ({
      matches: reduced && String(query).includes("prefers-reduced-motion"),
      media: String(query),
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
      onchange: null,
    });

    class FakeImage {
      constructor() {
        this.naturalWidth = 40;
        this.naturalHeight = 40;
        this.width = 40;
        this.height = 40;
        this.onload = null;
        this.onerror = null;
        this._src = "";
        this.tainted = false;
        this.pixels = null;
      }

      set src(value) {
        this._src = String(value);
        imageControl.requested.push(this._src);
        this.tainted = imageControl.tainted.has(this._src);
        this.pixels = imageControl.pixels.get(this._src) ?? null;
        const size = imageControl.sizes.get(this._src);
        if (size) {
          this.naturalWidth = size;
          this.naturalHeight = size;
          this.width = size;
          this.height = size;
        }
        const run = () => {
          if (this._src.startsWith("fail:")) this.onerror?.(new dom.window.Event("error"));
          else this.onload?.(new dom.window.Event("load"));
        };
        run.src = this._src;
        if (imageControl.auto) queueMicrotask(run);
        else imageControl.pending.push(run);
      }

      get src() {
        return this._src;
      }

      async decode() {
        imageControl.decoded.push(this._src);
      }
    }

    const canvasProto = dom.window.HTMLCanvasElement.prototype;
    canvasProto.getContext = function getContext() {
      const canvas = this;
      const buffer = () => {
        const count = canvas.width * canvas.height * 4;
        if (!canvas.__px || canvas.__px.length !== count) canvas.__px = new Uint8ClampedArray(count);
        return canvas.__px;
      };
      return {
        drawImage(source, dx = 0, dy = 0, dw, dh) {
          const dest = buffer();
          const destW = canvas.width;
          const destH = canvas.height;
          canvas.__tainted = source?.tainted === true;
          const sourcePixels = source instanceof dom.window.HTMLCanvasElement ? source.__px : source?.pixels;
          const sw = source instanceof dom.window.HTMLCanvasElement
            ? source.width
            : source?.naturalWidth || source?.width || destW;
          const sh = source instanceof dom.window.HTMLCanvasElement
            ? source.height
            : source?.naturalHeight || source?.height || destH;
          const copyW = dw ?? sw;
          const copyH = dh ?? sh;
          for (let y = 0; y < copyH; y += 1) {
            for (let x = 0; x < copyW; x += 1) {
              const tx = dx + x;
              const ty = dy + y;
              if (tx < 0 || ty < 0 || tx >= destW || ty >= destH) continue;
              const di = (ty * destW + tx) * 4;
              if (sourcePixels) {
                const sx = Math.min(sw - 1, Math.floor((x * sw) / copyW));
                const sy = Math.min(sh - 1, Math.floor((y * sh) / copyH));
                const si = (sy * sw + sx) * 4;
                dest[di] = sourcePixels[si] ?? 0;
                dest[di + 1] = sourcePixels[si + 1] ?? 0;
                dest[di + 2] = sourcePixels[si + 2] ?? 0;
                dest[di + 3] = sourcePixels[si + 3] ?? 0;
              } else {
                dest[di] = 255;
                dest[di + 1] = 255;
                dest[di + 2] = 255;
                dest[di + 3] = 255;
              }
            }
          }
        },
        getImageData(_x, _y, w, h) {
          if (canvas.__tainted) {
            const error = new Error("The canvas has been tainted by cross-origin data.");
            error.name = "SecurityError";
            throw error;
          }
          return { data: buffer().slice(0, w * h * 4), width: w, height: h };
        },
        putImageData(imageData, dx, dy) {
          const dest = buffer();
          for (let y = 0; y < imageData.height; y += 1) {
            for (let x = 0; x < imageData.width; x += 1) {
              const tx = dx + x;
              const ty = dy + y;
              if (tx < 0 || ty < 0 || tx >= canvas.width || ty >= canvas.height) continue;
              const si = (y * imageData.width + x) * 4;
              const di = (ty * canvas.width + tx) * 4;
              dest[di] = imageData.data[si];
              dest[di + 1] = imageData.data[si + 1];
              dest[di + 2] = imageData.data[si + 2];
              dest[di + 3] = imageData.data[si + 3];
            }
          }
        },
        clearRect() {},
      };
    };
    canvasProto.toBlob = function toBlob(callback) {
      callback(new dom.window.Blob(["png"], { type: "image/png" }));
    };

    class ResizeObserverMock {
      constructor(callback) {
        this.callback = callback;
        resizeObservers.push(this);
      }

      observe(element) {
        this.element = element;
      }

      disconnect() {
        const index = resizeObservers.indexOf(this);
        if (index >= 0) resizeObservers.splice(index, 1);
      }
    }
    const resizeObservers = [];

    const Hooks = {
      on(name, callback) {
        const listeners = callbacks.get(name) ?? [];
        listeners.push(callback);
        callbacks.set(name, listeners);
      },
    };

    const viewedCombat = { id: "combat-viewed" };
    const game = {
      user: { id: userId, isGM: false },
      actors: [], scenes: [], combats: [],
      i18n: {
        localize: (key) => ({
          "ASTILLON.YourTurn.UnknownName": "Someone",
          "ASTILLON.YourTurn.Strip": "YOUR TURN",
          "ASTILLON.YourTurn.Configure": "Your Turn",
          "ASTILLON.YourTurn.EditorTitle": "Your Turn Cut-In",
          "ASTILLON.YourTurn.Art": "Portrait",
          "ASTILLON.YourTurn.Color": "Color",
          "ASTILLON.YourTurn.Browse": "Browse",
          "ASTILLON.YourTurn.Preview": "Preview",
          "ASTILLON.YourTurn.Save": "Save",
        })[key] ?? key,
        format: (key) => key,
      },
      settings: {
        register() {},
        get(_scope, key) {
          return settings.get(key);
        },
        set(_scope, key, value) {
          settings.set(key, value);
        },
      },
    };

    class FilePickerStub {
      constructor(options) {
        this.options = options;
        filePickers.push(this);
      }

      async browse() {
        this.browsed = true;
        this.options.callback?.("icons/picked.webp");
      }
    }

    const foundryNamespace = {
      data: { fields: { BooleanField: BooleanFieldStub, NumberField: NumberFieldStub } },
      applications: {
        api: {
          DialogV2: {
            wait(config) {
              const wrap = dom.window.document.createElement("div");
              wrap.className = "astillon-yt-dialog";
              // Foundry DialogV2 already owns a form. Native HTML parsing drops nested forms.
              wrap.innerHTML = `<form class="dialog-form"><div class="dialog-content">${config.content}</div><footer></footer></form>`;
              dom.window.document.body.append(wrap);
              const dialog = { element: wrap };
              let resolve;
              const closed = new Promise(done => { resolve = done; });
              config.render?.(new dom.window.Event("render"), dialog);
              for (const button of config.buttons ?? []) {
                const element = dom.window.document.createElement("button");
                element.type = "button";
                element.dataset.action = button.action;
                element.textContent = button.label;
                element.addEventListener("click", async (event) => {
                  event.preventDefault();
                  try {
                    const result = await button.callback?.(event, element, dialog);
                    wrap.remove(); resolve(result);
                  } catch (error) { errors.push(error.message); }
                });
                wrap.querySelector("footer").append(element);
              }
              wrap.addEventListener("click", event => {
                const action = event.target.closest("[data-action]")?.dataset.action;
                if (action && !config.buttons.some(b => b.action === action)) errors.push(`Unhandled dialog action: ${action}`);
              });
              return closed;
            },
          },
        },
        apps: { FilePicker: { implementation: FilePickerStub } },
      },
      ...(typeof route === "function" ? { utils: { getRoute: route } } : {}),
    };

    const blobUrls = [];
    const globals = {
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      Element: dom.window.Element,
      Image: FakeImage,
      requestAnimationFrame: (fn) => {
        fn();
        return 0;
      },
      ResizeObserver: ResizeObserverMock,
      Hooks,
      game,
      ui: {
        notifications: { error: message => errors.push(message) },
        sidebar: { element: sidebar, expanded: true },
        combat: {
          viewed: viewedCombat,
          nextTurn() {
            calls.nextTurn += 1;
          },
        },
      },
      foundry: foundryNamespace,
      setTimeout: (fn, ms, ...args) => {
        scheduled.push(ms);
        const id = realSetTimeout(fn, ms, ...args);
        timerIds.push(id);
        return id;
      },
      clearTimeout: (id) => realClearTimeout(id),
    };

    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => {
      const url = `blob:your-turn-${blobUrls.length + 1}`;
      blobUrls.push(url);
      return url;
    };
    URL.revokeObjectURL = () => {};

    const originals = new Map(
      Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
    );
    for (const [name, value] of Object.entries(globals)) {
      Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }

    const feature = createYourTurnFeature(MODULE);
    feature.init();

    t.after(async () => {
      feature.api.cancel();
      imageControl.auto = true;
      for (const finish of imageControl.pending.splice(0)) finish();
      await flush();
      for (const id of timerIds) realClearTimeout(id);
      dom.window.close();
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    });

    function makeActor({
      name = "Hero",
      img = "icons/actor.webp",
      art,
      color,
      documentName = "Actor",
    } = {}) {
      const flags = {};
      if (art !== undefined) flags.yourTurnArt = art;
      if (color !== undefined) flags.yourTurnColor = color;
      return {
        name,
        img,
        documentName,
        flags,
        setCalls: [],
        unsetCalls: [],
        updated: false,
        isEditable: true,
        getFlag(module, key) {
          assert.equal(module, MODULE);
          return flags[key];
        },
        async setFlag(module, key, value) {
          assert.equal(module, MODULE);
          flags[key] = value;
          this.setCalls.push([key, value]);
        },
        async unsetFlag(module, key) {
          assert.equal(module, MODULE);
          delete flags[key];
          this.unsetCalls.push(key);
        },
        async update(changes) {
          this.updated = true;
          calls.update += 1;
          for (const [key, value] of Object.entries(changes)) {
            const flagKey = key.replace(`flags.${MODULE}.`, "");
            if (flagKey.startsWith("-=")) { delete flags[flagKey.slice(2)]; this.unsetCalls.push(flagKey.slice(2)); }
            else flags[flagKey] = value;
          }
        },
      };
    }

    function combatant({
      id = "c1",
      name = "Hero",
      players = [{ id: "player-2" }],
      tokenTexture = "icons/token.webp",
      actorImg = "icons/actor.webp",
      art,
      color,
      baseArt,
      baseColor,
      actorName,
    } = {}) {
      const actor = makeActor({ name: actorName ?? name, img: actorImg, art, color });
      const baseActor = baseArt !== undefined || baseColor !== undefined
        ? makeActor({ name: "Base", img: "icons/base.webp", art: baseArt, color: baseColor })
        : null;
      return {
        id,
        name,
        players,
        actor,
        token: {
          texture: { src: tokenTexture },
          baseActor,
        },
      };
    }

    function combat({
      id = "combat-viewed",
      combatant: current = combatant(),
      viewed = true,
    } = {}) {
      const instance = {
        id,
        combatant: current,
        nextTurn() {
          calls.nextTurn += 1;
        },
      };
      if (viewed) ui.combat.viewed = instance;
      return instance;
    }

    async function turnChange(combatInstance, prior, current) {
      emit("combatTurnChange", combatInstance, prior, current);
      await flush();
    }

    function overlays() {
      return [...dom.window.document.body.querySelectorAll(ROOT)];
    }

    return {
      feature,
      dom,
      sidebar,
      hotbar,
      uiLeft,
      uiTop,
      settings,
      scheduled,
      imageControl,
      resizeObservers,
      filePickers,
      calls,
      game,
      errors,
      makeActor,
      combatant,
      combat,
      turnChange,
      overlays,
      emit,
      setSidebarLeft(left) {
        sidebarLeft = left;
      },
    };
  }

  test("setting off shows nothing", async (t) => {
    const env = setup(t, { enabled: false });
    await env.turnChange(
      env.combat(),
      { combatantId: null, round: 1, turn: 0 },
      { combatantId: "c1", round: 1, turn: 1 },
    );
    assert.equal(env.overlays().length, 0);
  });

  test("a foundry route is used before the stored portrait path is drawn", async (t) => {
    const env = setup(t, {
      route: (path) => `/join/${String(path).replace(/^\//, "")}`,
    });
    await env.turnChange(
      env.combat({ combatant: env.combatant({ actorImg: "icons/routed.webp", tokenTexture: "" }) }),
      { combatantId: null, round: 1, turn: 0 },
      { combatantId: "c1", round: 1, turn: 1 },
    );
    await flush();
    const image = env.overlays()[0]?.querySelector(".astillon-yt-character img");
    assert.equal(image?.getAttribute("src"), "/join/icons/routed.webp");
    assert.ok(env.overlays()[0]?.querySelector("[data-layer='backing'] img")?.getAttribute("src")?.endsWith("01-dark-backing.png"));
    assert.ok(env.overlays()[0]?.querySelector("[data-layer='theme'].can-tint .astillon-yt-tint"));
  });

  test("preview while disabled does not advance combat or write flags", async (t) => {
    const env = setup(t, { enabled: false });
    const actor = env.makeActor({ name: "Hero", img: "icons/hero.webp" });
    await env.feature.api.preview(actor);
    await flush();
    const [root] = env.overlays();
    assert.ok(root);
    assert.equal(root.querySelector(".astillon-yt-name").textContent, "Hero");
    assert.equal(root.querySelector(".astillon-yt-strip").textContent, "YOUR TURN");
    assert.equal(root.querySelector(".astillon-yt-character img").getAttribute("src"), "icons/hero.webp");
    assert.equal(actor.setCalls.length, 0);
    assert.equal(actor.updated, false);
    assert.equal(env.calls.nextTurn, 0);
    assert.equal(env.calls.update, 0);
  });

  test("combat guards ignore other combats, repeats, and missing combatants", async (t) => {
    const env = setup(t);
    const other = env.combat({ id: "other-combat", viewed: false });
    await env.turnChange(
      other,
      { combatantId: null, round: 1, turn: 0 },
      { combatantId: "c1", round: 1, turn: 1 },
    );
    assert.equal(env.overlays().length, 0);

    const history = { combatantId: "c1", round: 1, turn: 1 };
    await env.turnChange(env.combat(), history, { ...history });
    assert.equal(env.overlays().length, 0);

    await env.turnChange(
      env.combat(),
      { combatantId: "c1", round: 1, turn: 0 },
      { combatantId: null, round: 1, turn: 1 },
    );
    assert.equal(env.overlays().length, 0);

    const viewed = env.combat();
    viewed.combatant = null;
    await env.turnChange(
      viewed,
      { combatantId: null, round: 1, turn: 0 },
      { combatantId: "c1", round: 1, turn: 1 },
    );
    assert.equal(env.overlays().length, 0);

    await env.turnChange(
      env.combat(),
      { combatantId: "c1", round: 1, turn: 2 },
      { combatantId: "c1", round: 2, turn: 0 },
    );
    assert.equal(env.overlays().length, 1);
  });

  test("another user's combatant is announced", async (t) => {
    const env = setup(t, { userId: "player-1" });
    const foe = env.combatant({
      name: "Rival",
      players: [{ id: "player-2" }],
      actorImg: "icons/rival.webp",
      tokenTexture: "icons/token.webp",
    });
    await env.turnChange(
      env.combat({ combatant: foe }),
      { combatantId: null, round: 1, turn: 0 },
      { combatantId: "c1", round: 1, turn: 1 },
    );
    await flush();
    const [root] = env.overlays();
    assert.equal(root.querySelector(".astillon-yt-name").textContent, "Rival");
    assert.equal(root.querySelector(".astillon-yt-character img").getAttribute("src"), "icons/rival.webp");
  });

  test("rapid turn leaves one overlay for the latest combatant", async (t) => {
    const env = setup(t);
    await env.turnChange(
      env.combat({ combatant: env.combatant({ name: "First", id: "c1", actorImg: "icons/first.webp" }) }),
      { combatantId: null, round: 1, turn: 0 },
      { combatantId: "c1", round: 1, turn: 1 },
    );
    await env.turnChange(
      env.combat({ combatant: env.combatant({ name: "Second", id: "c2", actorImg: "icons/second.webp" }) }),
      { combatantId: "c1", round: 1, turn: 1 },
      { combatantId: "c2", round: 1, turn: 2 },
    );
    await flush();
    assert.equal(env.overlays().length, 1);
    assert.equal(env.overlays()[0].querySelector(".astillon-yt-name").textContent, "Second");
    assert.equal(env.overlays()[0].querySelector(".astillon-yt-character img").getAttribute("src"), "icons/second.webp");
  });

  test("a late image from the previous turn is ignored", async (t) => {
    const env = setup(t);
    env.imageControl.auto = false;
    await env.turnChange(
      env.combat({ combatant: env.combatant({ name: "First", actorImg: "icons/first.webp" }) }),
      { combatantId: null, round: 1, turn: 0 },
      { combatantId: "c1", round: 1, turn: 1 },
    );
    assert.equal(env.overlays().length, 0, "do not start an empty flash-in while art loads");
    await env.turnChange(
      env.combat({ combatant: env.combatant({ name: "Second", id: "c2", actorImg: "icons/second.webp" }) }),
      { combatantId: "c1", round: 1, turn: 1 },
      { combatantId: "c2", round: 1, turn: 2 },
    );
    assert.equal(env.overlays().length, 0);
    for (const finish of env.imageControl.pending.filter(fn => fn.src !== "icons/second.webp")) finish();
    await flush();
    assert.equal(env.overlays().length, 0, "the old portrait must never flash in late");
    env.imageControl.pending.find(fn => fn.src === "icons/second.webp")();
    await flush();
    assert.equal(env.overlays().length, 1);
    assert.equal(env.overlays()[0].querySelector(".astillon-yt-name").textContent, "Second");
    assert.equal(env.overlays()[0].querySelector(".astillon-yt-character img").getAttribute("src"), "icons/second.webp");
  });

  test("the demo slices carry the name and YOUR TURN on the demo timeline", async (t) => {
    const env = setup(t);
    await env.turnChange(
      env.combat({ combatant: env.combatant({ name: "Aster" }) }),
      { combatantId: null, round: 1, turn: 0 },
      { combatantId: "c1", round: 1, turn: 1 },
    );
    const [root] = env.overlays();
    const name = root.querySelector(".astillon-yt-name");
    const strip = root.querySelector(".astillon-yt-strip");
    assert.equal(name.textContent, "Aster");
    assert.equal(strip.textContent, "YOUR TURN");
    assert.equal(name.closest("[data-layer]")?.dataset.layer, "banner");
    assert.equal(strip.closest("[data-layer]")?.dataset.layer, "label");
    const files = [...root.querySelectorAll(".astillon-yt-slice")].map((image) => image.getAttribute("src"));
    assert.deepEqual(files, [
      "modules/astillon-hanaq-adventures-module/assets/your-turn/01-dark-backing.png",
      "modules/astillon-hanaq-adventures-module/assets/your-turn/02-theme-panel.png",
      "modules/astillon-hanaq-adventures-module/assets/your-turn/07-halftone-texture.png",
      "modules/astillon-hanaq-adventures-module/assets/your-turn/03-highlight-shards.png",
      "modules/astillon-hanaq-adventures-module/assets/your-turn/04-white-speed-streaks.png",
      "modules/astillon-hanaq-adventures-module/assets/your-turn/05-name-banner.png",
      "modules/astillon-hanaq-adventures-module/assets/your-turn/06-turn-label-strip.png",
    ]);
    const backing = root.querySelector("[data-layer='backing']");
    const banner = root.querySelector("[data-layer='banner']");
    const label = root.querySelector("[data-layer='label']");
    const portrait = root.querySelector("[data-layer='portrait']");
    assert.equal(backing.dataset.enterMs, "0");
    assert.equal(backing.dataset.exitMs, "2240");
    assert.equal(banner.dataset.enterMs, "300");
    assert.equal(banner.dataset.exitMs, "2050");
    assert.equal(label.dataset.enterMs, "350");
    assert.equal(label.dataset.exitMs, "2080");
    assert.equal(portrait.dataset.enterMs, "150");
    assert.equal(portrait.dataset.exitMs, "2150");
    assert.equal(banner.compareDocumentPosition(portrait) & 4, 4);
    assert.equal(portrait.style.zIndex, "50");
    assert.equal(banner.style.zIndex, "60");
    assert.equal(label.style.zIndex, "70");
    const frames = turnIntroFrames(0, 2240, false);
    const themeTint = root.querySelector("[data-layer='theme'] .astillon-yt-tint");
    const shardTint = root.querySelector("[data-layer='highlights'] .astillon-yt-tint");
    const labelTint = root.querySelector("[data-layer='label'] .astillon-yt-tint");
    assert.equal(themeTint.dataset.tintColor, "#2B8CFF");
    assert.equal(themeTint.style.backgroundColor, "rgb(43, 140, 255)");
    assert.match(themeTint.style.cssText, /mask-image:[^;]*02-theme-panel\.png/);
    assert.match(themeTint.style.cssText, /mask-mode:\s*alpha/);
    assert.equal(shardTint.dataset.tintColor, turnHighlight("#2B8CFF"));
    assert.match(shardTint.style.cssText, /03-highlight-shards\.png/);
    assert.equal(labelTint.dataset.tintColor, turnHighlight("#2B8CFF"));
    assert.match(labelTint.style.cssText, /06-turn-label-strip\.png/);
    for (const id of ["backing", "texture", "streaks", "banner"]) {
      assert.equal(root.querySelector(`[data-layer='${id}'] .astillon-yt-tint`), null);
    }
    assert.equal(frames[0].transform, "translate(52%, 31%)");
    assert.equal(frames[2].transform, "translate(-1.2%, -.8%)");
    assert.equal(frames[5].transform, "translate(55%, 35%)");
    assert.ok(Math.abs(frames[1].offset - 0) < 0.0001);
    assert.ok(Math.abs(frames[4].offset - 2240 / TURN_INTRO_MS) < 0.0001);

    env.feature.api.cancel();
    await env.turnChange(
      env.combat({ combatant: env.combatant({ name: " ", actorName: " ", actorImg: " ", tokenTexture: " " }) }),
      { combatantId: "c1", round: 1, turn: 1 },
      { combatantId: "c1", round: 1, turn: 2 },
    );
    await flush();
    const unknown = env.overlays()[0];
    assert.equal(unknown.querySelector(".astillon-yt-name").textContent, "Someone");
    assert.equal(unknown.querySelector(".astillon-yt-character.has-art img").getAttribute("src"), "icons/svg/mystery-man.svg");
    assert.ok(unknown.querySelector("[data-layer='streaks']"));
    assert.ok(unknown.querySelector("[data-layer='theme']"));
    assert.ok(unknown.querySelector("[data-layer='banner']"));
  });

  test("flag art wins, a blank flag uses actor.img, and a blank actor image uses the token", async (t) => {
    const env = setup(t);
    await env.turnChange(
      env.combat({
        combatant: env.combatant({
          art: "icons/flag.webp",
          actorImg: "icons/actor.webp",
          tokenTexture: "icons/token.webp",
        }),
      }),
      { combatantId: null, round: 1, turn: 0 },
      { combatantId: "c1", round: 1, turn: 1 },
    );
    await flush();
    assert.equal(env.overlays()[0].querySelector(".astillon-yt-character img").getAttribute("src"), "icons/flag.webp");

    await env.turnChange(
      env.combat({
        combatant: env.combatant({
          id: "c2",
          art: "   ",
          baseArt: "icons/base.webp",
          actorImg: "icons/actor.webp",
          tokenTexture: "icons/token.webp",
        }),
      }),
      { combatantId: "c1", round: 1, turn: 1 },
      { combatantId: "c2", round: 1, turn: 2 },
    );
    await flush();
    assert.equal(env.overlays()[0].querySelector(".astillon-yt-character img").getAttribute("src"), "icons/base.webp");

    await env.turnChange(
      env.combat({
        combatant: env.combatant({
          id: "c3",
          art: "",
          actorImg: "icons/actor-only.webp",
          tokenTexture: "icons/token.webp",
        }),
      }),
      { combatantId: "c2", round: 1, turn: 2 },
      { combatantId: "c3", round: 1, turn: 3 },
    );
    await flush();
    assert.equal(env.overlays()[0].querySelector(".astillon-yt-character img").getAttribute("src"), "icons/actor-only.webp");

    await env.turnChange(
      env.combat({
        combatant: env.combatant({
          id: "c4",
          art: "",
          actorImg: "  ",
          tokenTexture: "icons/token-only.webp",
        }),
      }),
      { combatantId: "c3", round: 1, turn: 3 },
      { combatantId: "c4", round: 1, turn: 4 },
    );
    await flush();
    assert.equal(env.overlays()[0].querySelector(".astillon-yt-character img").getAttribute("src"), "icons/token-only.webp");

    await env.turnChange(
      env.combat({
        combatant: env.combatant({
          id: "c5",
          art: "fail:missing.webp",
          actorImg: "icons/after-failure.webp",
          tokenTexture: "icons/token.webp",
        }),
      }),
      { combatantId: "c4", round: 1, turn: 4 },
      { combatantId: "c5", round: 1, turn: 5 },
    );
    await flush();
    await flush();
    assert.equal(env.overlays()[0].querySelector(".astillon-yt-character img").getAttribute("src"), "icons/after-failure.webp");
  });

  test("default color is #2B8CFF and invalid hex falls back to it", async (t) => {
    const env = setup(t);
    await env.turnChange(
      env.combat({ combatant: env.combatant({ color: "blue" }) }),
      { combatantId: null, round: 1, turn: 0 },
      { combatantId: "c1", round: 1, turn: 1 },
    );
    let [root] = env.overlays();
    assert.equal(root.style.getPropertyValue("--yt-color"), "#2B8CFF");
    assert.equal(root.style.getPropertyValue("--turn-theme"), "#2B8CFF");
    assert.equal(root.style.getPropertyValue("--turn-highlight"), turnHighlight("#2B8CFF"));
    assert.match(turnHighlight("#2B8CFF"), /^rgb\(\d+,\d+,\d+\)$/);
    assert.equal(saturatedPanelColor("#000000"), "#000000");
    assert.notEqual(mixTowardWhite("#2B8CFF", 0.7), "#2B8CFF");
    assert.equal(root.style.getPropertyValue("--yt-scale"), "1");
    assert.equal(root.querySelector("[data-layer='theme'] .astillon-yt-tint").dataset.tintColor, "#2B8CFF");

    await env.turnChange(
      env.combat({ combatant: env.combatant({ id: "c2", color: "#ff00aa" }) }),
      { combatantId: "c1", round: 1, turn: 1 },
      { combatantId: "c2", round: 1, turn: 2 },
    );
    await flush();
    [, root] = [null, env.overlays()[0]];
    assert.equal(env.overlays()[0].style.getPropertyValue("--yt-color"), "#FF00AA");
    assert.equal(env.overlays()[0].querySelector("[data-layer='theme'] .astillon-yt-tint").dataset.tintColor, "#FF00AA");
    assert.equal(env.overlays()[0].querySelector("[data-layer='highlights'] .astillon-yt-tint").dataset.tintColor, turnHighlight("#FF00AA"));
    assert.equal(env.overlays()[0].querySelector("[data-layer='label'] .astillon-yt-tint").dataset.tintColor, turnHighlight("#FF00AA"));
  });

  test("overlay is on the body, ignores the pointer, and does not dismiss on click", async (t) => {
    const env = setup(t);
    await env.turnChange(
      env.combat(),
      { combatantId: null, round: 1, turn: 0 },
      { combatantId: "c1", round: 1, turn: 1 },
    );
    const [root] = env.overlays();
    assert.equal(root.parentElement, env.dom.window.document.body);
    assert.equal(root.style.position, "fixed");
    assert.equal(root.style.pointerEvents, "none");
    assert.equal(root.style.zIndex, "80");
    assert.equal(root.getAttribute("role"), "status");
    assert.equal(root.getAttribute("aria-live"), "polite");
    const stage = root.querySelector(".astillon-yt-stage");
    assert.equal(stage.style.width, "784px");
    assert.equal(stage.style.height, "784px");
    assert.equal(stage.style.transformOrigin, "100% 100%");
    assert.equal(stage.style.transform, "scale(var(--yt-scale))");
    assert.equal(stage.style.position, "fixed");
    assert.equal(stage.style.top, "36px");
    assert.equal(stage.style.right, "500px");
    assert.equal(stage.style.bottom, "auto");
    assert.equal(Number.parseInt(stage.style.top, 10) + Number.parseInt(stage.style.height, 10), 820);
    root.click();
    assert.equal(env.overlays().length, 1);
    env.feature.api.cancel();
    assert.equal(env.overlays().length, 0);
  });

  test("insets come from the sidebar, hotbar, and the side bars", async (t) => {
    const env = setup(t);
    await env.turnChange(
      env.combat(),
      { combatantId: null, round: 1, turn: 0 },
      { combatantId: "c1", round: 1, turn: 1 },
    );
    const [root] = env.overlays();
    assert.equal(root.style.getPropertyValue("--yt-right"), "500px");
    assert.equal(root.style.getPropertyValue("--yt-bottom"), "80px");
    assert.equal(root.style.getPropertyValue("--yt-left"), "64px");
    assert.equal(root.style.getPropertyValue("--yt-top"), "36px");
    assert.equal(env.dom.window.document.querySelector("#board"), null);
  });

  test("collapse and resize leave the playing cut-in where it was measured", async (t) => {
    const env = setup(t);
    await env.turnChange(
      env.combat(),
      { combatantId: null, round: 1, turn: 0 },
      { combatantId: "c1", round: 1, turn: 1 },
    );
    const [root] = env.overlays();
    const generation = root.dataset.generation;
    const enterMs = root.querySelector("[data-layer='backing']").dataset.enterMs;
    const stage = root.querySelector(".astillon-yt-stage");
    const width = stage.style.width;
    const height = stage.style.height;
    assert.equal(width, "784px");
    assert.equal(height, "784px");
    env.setSidebarLeft(1280);
    env.emit("collapseSidebar", { element: env.sidebar }, true);
    assert.equal(env.overlays().length, 1);
    assert.equal(env.overlays()[0], root);
    assert.equal(root.dataset.generation, generation);
    assert.equal(root.querySelector("[data-layer='backing']").dataset.enterMs, enterMs);
    assert.equal(root.style.getPropertyValue("--yt-right"), "500px");
    assert.equal(stage.style.width, width);
    assert.equal(stage.style.height, height);

    env.resizeObservers[0].callback();
    assert.equal(env.overlays().length, 1);
    assert.equal(root.style.getPropertyValue("--yt-right"), "500px");
    assert.equal(stage.style.width, width);
    assert.equal(stage.style.height, height);

    env.dom.window.innerWidth = 1600;
    env.dom.window.dispatchEvent(new env.dom.window.Event("resize"));
    assert.equal(env.overlays().length, 1);
    assert.equal(root.dataset.generation, generation);
    assert.equal(root.style.getPropertyValue("--yt-right"), "500px");
    assert.equal(root.style.getPropertyValue("--yt-bottom"), "80px");
    assert.equal(stage.style.width, width);
    assert.equal(stage.style.height, height);

    env.feature.api.cancel();
    env.hotbar.getBoundingClientRect = () => rect(0, 1500, 2400, 100);
    env.uiTop.getBoundingClientRect = () => rect(0, 0, 2400, 40);
    env.setSidebarLeft(2000);
    env.dom.window.innerWidth = 2400;
    env.dom.window.innerHeight = 1700;
    await env.turnChange(
      env.combat({ combatant: env.combatant({ name: "Wide", id: "c2" }) }),
      { combatantId: "c1", round: 1, turn: 1 },
      { combatantId: "c2", round: 1, turn: 2 },
    );
    const next = env.overlays()[0].querySelector(".astillon-yt-stage");
    assert.equal(next.style.width, "1460px");
    assert.equal(next.style.height, "1460px");
    assert.equal(next.style.top, "40px");
    assert.equal(Number.parseInt(next.style.top, 10) + Number.parseInt(next.style.height, 10), 1500);
  });

  test("full-size ui regions do not lift the cut-in off the top of the page", async (t) => {
    const env = setup(t);
    env.uiTop.getBoundingClientRect = () => rect(0, 0, 1400, 900);
    env.hotbar.getBoundingClientRect = () => rect(0, 0, 1400, 900);
    const navigation = env.dom.window.document.createElement("nav");
    navigation.id = "navigation";
    navigation.getBoundingClientRect = () => rect(0, 0, 1400, 36);
    env.dom.window.document.body.append(navigation);
    const macroBar = env.dom.window.document.createElement("div");
    macroBar.id = "hotbar";
    macroBar.getBoundingClientRect = () => rect(220, 820, 700, 64);
    env.dom.window.document.body.append(macroBar);
    await env.turnChange(
      env.combat(),
      { combatantId: null, round: 1, turn: 0 },
      { combatantId: "c1", round: 1, turn: 1 },
    );
    const stage = env.overlays()[0].querySelector(".astillon-yt-stage");
    assert.equal(env.overlays()[0].style.getPropertyValue("--yt-top"), "36px");
    assert.equal(env.overlays()[0].style.getPropertyValue("--yt-bottom"), "80px");
    assert.equal(stage.style.top, "36px");
    assert.equal(stage.style.width, "784px");
    assert.equal(stage.style.height, "784px");
    assert.equal(Number.parseInt(stage.style.top, 10) + Number.parseInt(stage.style.height, 10), 820);
  });

  test("euclidean outline covers (3, 4) and leaves (4, 4) clear at radius 5", () => {
    assert.equal(euclideanOutlineCovers(3, 4, 5), true);
    assert.equal(euclideanOutlineCovers(4, 4, 5), false);
    const width = 11;
    const height = 11;
    const radius = 5;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const inkX = 5;
    const inkY = 5;
    pixels[(inkY * width + inkX) * 4 + 3] = 255;
    const mask = renderOutlineMask(pixels, width, height, radius);
    const outWidth = width + radius * 2;
    const outHeight = height + radius * 2;
    for (let y = 0; y < outHeight; y += 1) {
      for (let x = 0; x < outWidth; x += 1) {
        const covered = euclideanOutlineCovers(x - (inkX + radius), y - (inkY + radius), radius);
        assert.equal(mask[(y * outWidth + x) * 4 + 3], covered ? 255 : 0, `${x},${y}`);
      }
    }
    assert.equal(mixTowardWhite("#000000", 0.35), "#595959");
    assert.equal(mixTowardWhite("#FFFFFF", 0.35), "#FFFFFF");
  });

  test("opaque art uses the angular frame and the raw image", async (t) => {
    const env = setup(t);
    await env.turnChange(
      env.combat({ combatant: env.combatant({ actorImg: "icons/opaque.webp" }) }),
      { combatantId: null, round: 1, turn: 0 },
      { combatantId: "c1", round: 1, turn: 1 },
    );
    await flush();
    const character = env.overlays()[0].querySelector(".astillon-yt-character");
    const image = character.querySelector("img");
    assert.equal(character.classList.contains("astillon-yt-frame"), true);
    assert.equal(character.classList.contains("astillon-yt-sticker"), false);
    assert.equal(image.getAttribute("src"), "icons/opaque.webp");
    assert.equal(image.style.objectFit, "");
    assert.equal(image.getAttribute("src").startsWith("blob:"), false);
  });

  test("a tainted getImageData keeps the raw image in the frame", async (t) => {
    const env = setup(t);
    env.imageControl.tainted.add("icons/tainted.webp");
    let threw = false;
    try {
      await env.turnChange(
        env.combat({ combatant: env.combatant({ actorImg: "icons/tainted.webp" }) }),
        { combatantId: null, round: 1, turn: 0 },
        { combatantId: "c1", round: 1, turn: 1 },
      );
    } catch {
      threw = true;
    }
    await flush();
    assert.equal(threw, false);
    const character = env.overlays()[0].querySelector(".astillon-yt-character");
    assert.equal(character.classList.contains("astillon-yt-frame"), true);
    assert.equal(character.querySelector("img").getAttribute("src"), "icons/tainted.webp");
  });

  test("sticker art becomes a blob url", async (t) => {
    const env = setup(t);
    const size = 24;
    const pixels = new Uint8ClampedArray(size * size * 4);
    pixels[(12 * size + 12) * 4 + 3] = 255;
    env.imageControl.pixels.set("icons/sticker.webp", pixels);
    env.imageControl.sizes.set("icons/sticker.webp", size);
    await env.turnChange(
      env.combat({ combatant: env.combatant({ actorImg: "icons/sticker.webp" }) }),
      { combatantId: null, round: 1, turn: 0 },
      { combatantId: "c1", round: 1, turn: 1 },
    );
    await flush();
    const character = env.overlays()[0].querySelector(".astillon-yt-character");
    assert.equal(character.classList.contains("astillon-yt-sticker"), true);
    assert.equal(character.classList.contains("astillon-yt-frame"), false);
    assert.equal(character.querySelector("img").getAttribute("src").startsWith("blob:"), true);
  });

  test("reduced motion uses the demo fade across the same 2.6 seconds", async (t) => {
    const env = setup(t, { reduced: true, hold: 1.45 });
    await env.turnChange(
      env.combat(),
      { combatantId: null, round: 1, turn: 0 },
      { combatantId: "c1", round: 1, turn: 1 },
    );
    const [root] = env.overlays();
    assert.equal(root.dataset.motion, "reduced");
    const frames = turnIntroFrames(0, 2240, true);
    assert.deepEqual(frames.map((frame) => frame.opacity), [0, 1, 1, 0]);
    assert.deepEqual(frames.map((frame) => frame.offset), [0, 0.12, 0.8, 1]);
    for (const layer of root.querySelectorAll(".astillon-yt-layer")) {
      assert.equal(layer.dataset.motion, "reduced");
    }
    assert.equal(env.scheduled.at(-1), TURN_INTRO_MS);
  });

  test("playback stays on the demo's 2.6 second timeline", async (t) => {
    const env = setup(t, { hold: 1.45 });
    await env.turnChange(
      env.combat(),
      { combatantId: null, round: 1, turn: 0 },
      { combatantId: "c1", round: 1, turn: 1 },
    );
    assert.equal(env.scheduled.at(-1), TURN_INTRO_MS);
    const backing = env.overlays()[0].querySelector("[data-layer='backing']");
    const label = env.overlays()[0].querySelector("[data-layer='label']");
    assert.equal(backing.dataset.motion, "demo");
    assert.equal(backing.dataset.enterMs, "0");
    assert.equal(label.dataset.enterMs, "350");
    const normal = turnIntroFrames(300, 2050, false);
    assert.ok(Math.abs(normal[1].offset - 300 / TURN_INTRO_MS) < 0.0001);
    assert.ok(Math.abs(normal[2].offset - Math.min(510 / TURN_INTRO_MS, 0.22)) < 0.0001);
    assert.ok(Math.abs(normal[3].offset - Math.min(550 / TURN_INTRO_MS, 0.24)) < 0.0001);
    assert.ok(Math.abs(normal[4].offset - 2050 / TURN_INTRO_MS) < 0.0001);

    env.settings.set("yourTurnHold", 2);
    await env.turnChange(
      env.combat({ combatant: env.combatant({ name: "Later", id: "c2" }) }),
      { combatantId: "c1", round: 1, turn: 1 },
      { combatantId: "c2", round: 1, turn: 2 },
    );
    assert.equal(env.overlays().length, 1);
    assert.equal(env.scheduled.at(-1), TURN_INTRO_MS);
    assert.equal(env.overlays()[0].querySelector("[data-layer='banner']").dataset.exitMs, "2050");
  });

  test("editable sheet can preview the draft and save flags", async (t) => {
    const env = setup(t, { enabled: false });
    const actor = env.makeActor({ name: "Editor", img: "icons/saved-actor.webp", art: "icons/stored.webp" });
    const host = env.dom.window.document.createElement("section");
    const header = env.dom.window.document.createElement("div");
    header.className = "window-header";
    host.append(header);
    env.dom.window.document.body.append(host);
    const app = { isEditable: true, actor, document: actor, element: host };
    const buttons = [];
    const controls = [];
    env.emit("getActorSheetHeaderButtons", app, buttons);
    env.emit("getHeaderControlsApplicationV2", app, controls);
    env.emit("renderApplicationV2", app, host);
    env.emit("renderApplicationV2", app, host);
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].class, "astillon-your-turn-configure");
    assert.equal(typeof buttons[0].onclick, "function");
    assert.equal(controls.length, 1);
    assert.equal(controls[0].action, "astillon-your-turn");
    assert.equal(header.querySelectorAll(".astillon-your-turn-configure").length, 1);

    header.querySelector("button").click();
    const dialog = env.dom.window.document.querySelector(".astillon-yt-dialog");
    assert.ok(dialog);
    assert.equal(dialog.querySelectorAll("form").length, 1, "Foundry owns the only form");
    const art = dialog.querySelector("[name=yourTurnArt]");
    const color = dialog.querySelector("[name=yourTurnColor]");
    assert.equal(art.value, "icons/stored.webp");
    assert.equal(dialog.querySelector("[data-action=preview]").textContent, "Preview");
    assert.equal(dialog.querySelector("[data-action=save]").textContent, "Save");
    dialog.querySelector("[data-action=browse]").click();
    assert.equal(art.value, "icons/picked.webp");
    assert.equal(env.filePickers.length, 1);
    assert.equal(env.filePickers[0].options.type, "image");
    assert.equal(env.filePickers[0].options.field, art);
    assert.equal(env.filePickers[0].browsed, true);
    art.value = "icons/draft.webp";
    color.value = "#112233";
    dialog.querySelector("[data-action=preview]").click();
    await flush();
    assert.equal(env.overlays().length, 1);
    assert.equal(actor.setCalls.length, 0);
    assert.equal(actor.updated, false);
    assert.equal(env.calls.nextTurn, 0);
    assert.equal(env.overlays()[0].querySelector(".astillon-yt-character img").getAttribute("src"), "icons/draft.webp");
    assert.equal(env.overlays()[0].style.getPropertyValue("--yt-color"), "#112233");

    dialog.querySelector("[data-action=save]").click();
    await flush();
    assert.equal(actor.flags.yourTurnArt, "icons/draft.webp");
    assert.equal(actor.flags.yourTurnColor, "#112233");
    assert.equal(dialog.isConnected, false);
    assert.equal(env.calls.update, 1, "portrait and color save in one document update");

    header.querySelector("button").click();
    const reopened = env.dom.window.document.querySelector(".astillon-yt-dialog");
    assert.equal(reopened.querySelector("[name=yourTurnArt]").value, "icons/draft.webp");
    assert.equal(reopened.querySelector("[name=yourTurnColor]").value, "#112233");
    reopened.querySelector("[name=yourTurnArt]").value = "   ";
    reopened.querySelector("[data-action=save]").click();
    await flush();
    assert.ok(actor.unsetCalls.includes("yourTurnArt"));
    assert.equal(actor.flags.yourTurnArt, undefined);
    assert.deepEqual(env.errors, [], "Browse and Preview must not fall through to DialogV2 submit actions");
  });

  test("startup preloads world actors, synthetic tokens, base-actor art, combatants and all slices even while disabled", async t => {
    const env = setup(t, { enabled: false });
    const hero = env.makeActor({ art: "icons/hero-custom.webp" });
    const linked = env.makeActor({ img: "icons/fallback.webp" });
    const synthetic = env.makeActor({ art: "icons/token-custom.webp" });
    env.game.actors.push(hero, linked);
    env.game.scenes.push({ tokens: [
      { actor: synthetic, texture: { src: "icons/token.webp" } },
      { actor: env.makeActor({ img: "icons/base-fallback.webp" }), baseActor: env.makeActor({ art: "icons/base-custom.webp" }) },
    ] });
    env.game.combats.push({ combatants: [env.combatant({ art: "icons/combat-custom.webp" })] });
    env.feature.ready(); await env.feature.api.preload();
    for (const src of ["icons/hero-custom.webp", "icons/fallback.webp", "icons/token-custom.webp", "icons/base-custom.webp", "icons/combat-custom.webp"]) {
      assert.ok(env.imageControl.decoded.includes(src), src);
    }
    assert.equal(env.imageControl.requested.filter(src => src.includes("assets/your-turn/")).length, 7);
    assert.equal(env.overlays().length, 0);
    assert.equal(env.calls.update, 0);
    const before = env.imageControl.requested.length;
    await env.feature.api.preview(hero);
    assert.equal(env.imageControl.requested.length, before, "first playback uses prepared resources");
    assert.equal(env.scheduled.at(-1), TURN_INTRO_MS);
  });

  test("startup bounds portrait work and a concurrent preview shares its image request", async t => {
    const env = setup(t);
    env.imageControl.auto = false;
    env.game.actors.push(...Array.from({ length: 7 }, (_, i) => env.makeActor({ art: `icons/warm-${i}.webp` })));
    const warming = env.feature.api.preload();
    const showing = env.feature.api.preview(env.game.actors[0]);
    assert.equal(env.imageControl.requested.filter(src => src.startsWith("icons/warm-")).length, 4);
    assert.equal(env.imageControl.requested.filter(src => src === "icons/warm-0.webp").length, 1);
    assert.equal(env.overlays().length, 0);
    assert.ok(!env.scheduled.includes(TURN_INTRO_MS), "animation has not consumed any time while loading");
    env.imageControl.auto = true;
    for (const finish of env.imageControl.pending.splice(0)) finish();
    await Promise.all([warming, showing]);
    assert.equal(env.overlays().length, 1);
    assert.equal(env.imageControl.requested.filter(src => src.startsWith("icons/warm-")).length, 7);
    assert.equal(env.scheduled.at(-1), TURN_INTRO_MS);
  });

  test("actor and token updates warm new art and failed custom images use a cached fallback", async t => {
    const env = setup(t);
    const actor = env.makeActor({ art: "fail:missing.webp", img: "icons/good.webp" });
    env.game.actors.push(actor);
    await env.feature.api.preload();
    await env.feature.api.preview(actor);
    assert.equal(env.overlays()[0].querySelector(".astillon-yt-character img").getAttribute("src"), "icons/good.webp");
    assert.equal(env.imageControl.requested.filter(src => src === "fail:missing.webp").length, 1);
    actor.flags.yourTurnArt = "icons/replacement.webp";
    env.emit("updateActor", actor, { flags: { [MODULE]: { yourTurnArt: actor.flags.yourTurnArt } } });
    env.emit("createToken", { actor: env.makeActor({ art: "icons/new-token.webp" }) });
    await flush();
    assert.ok(env.imageControl.decoded.includes("icons/replacement.webp"));
    assert.ok(env.imageControl.decoded.includes("icons/new-token.webp"));
  });

  test("cancel and scene teardown suppress a pending first playback", async t => {
    const env = setup(t);
    env.imageControl.auto = false;
    const showing = env.feature.api.preview(env.makeActor({ img: "icons/late.webp" }));
    env.emit("canvasTearDown");
    for (const finish of env.imageControl.pending.splice(0)) finish();
    await showing;
    assert.equal(env.overlays().length, 0);
    assert.ok(!env.scheduled.includes(TURN_INTRO_MS));
  });

  test("two simultaneous editors preview and save their own actor and fields", async t => {
    const env = setup(t, { enabled: false });
    const first = env.makeActor({ name: "First", art: "icons/first.webp" });
    const second = env.makeActor({ name: "Second", art: "icons/second.webp" });
    void env.feature.api.configure(first); void env.feature.api.configure(second);
    const [a, b] = env.dom.window.document.querySelectorAll(".astillon-yt-dialog");
    a.querySelector("[name=yourTurnArt]").value = "icons/first-draft.webp";
    a.querySelector("[name=yourTurnColor]").value = "#123456";
    b.querySelector("[name=yourTurnColor]").value = "#abcdef";
    a.querySelector("[data-action=preview]").click(); await flush();
    assert.equal(env.overlays()[0].querySelector(".astillon-yt-name").textContent, "First");
    assert.equal(env.overlays()[0].querySelector(".astillon-yt-character img").getAttribute("src"), "icons/first-draft.webp");
    assert.equal(env.calls.update, 0);
    a.querySelector("[data-action=save]").click(); await flush();
    b.querySelector("[data-action=save]").click(); await flush();
    assert.equal(first.flags.yourTurnArt, "icons/first-draft.webp");
    assert.equal(first.flags.yourTurnColor, "#123456");
    assert.equal(second.flags.yourTurnArt, "icons/second.webp");
    assert.equal(second.flags.yourTurnColor, "#ABCDEF");
    assert.deepEqual(env.errors, []);
  });

  test("save failures are visible and cannot silently clear the stored artwork", async t => {
    const env = setup(t);
    t.mock.method(console, "error", () => {});
    const actor = env.makeActor({ art: "icons/saved.webp", color: "#123456" });
    actor.update = async () => { throw new Error("Permission denied"); };
    void env.feature.api.configure(actor);
    const dialog = env.dom.window.document.querySelector(".astillon-yt-dialog");
    dialog.querySelector("[name=yourTurnArt]").value = "icons/new.webp";
    dialog.querySelector("[data-action=save]").click(); await flush();
    assert.equal(actor.flags.yourTurnArt, "icons/saved.webp");
    assert.equal(actor.flags.yourTurnColor, "#123456");
    assert.ok(env.errors.some(message => /could not save.*Permission denied/.test(message)));
    assert.equal(dialog.isConnected, true);
  });

  test("file browser errors are reported and the typed path remains usable", async t => {
    const env = setup(t);
    t.mock.method(console, "error", () => {});
    const Picker = foundry.applications.apps.FilePicker.implementation;
    t.mock.method(Picker.prototype, "browse", async () => { throw new Error("Storage unavailable"); });
    void env.feature.api.configure(env.makeActor({ art: "icons/original.webp" }));
    const dialog = env.dom.window.document.querySelector(".astillon-yt-dialog");
    dialog.querySelector("[data-action=browse]").click(); await flush();
    assert.ok(env.errors.some(message => /file browser.*Storage unavailable/.test(message)));
    assert.equal(dialog.querySelector("[name=yourTurnArt]").value, "icons/original.webp");
  });

  test("init registers exactly three settings with foundry.data.fields and no portrait setting", async (t) => {
    withFoundryNamespace(
      t,
      {
        data: {
          fields: {
            BooleanField: BooleanFieldStub,
            NumberField: NumberFieldStub,
          },
        },
      },
      ({ registrations, hooks }) => {
        assert.equal("fields" in foundry, false);
        createYourTurnFeature(MODULE).init();
        assert.equal(registrations.length, 3);
        assert.equal(registrations.some((entry) => entry.key === "yourTurnPortrait"), false);
        const names = registrations.map((entry) => entry.key);
        assert.deepEqual(names, ["yourTurnEnabled", "yourTurnScale", "yourTurnHold"]);
        for (const entry of registrations) {
          assert.equal(entry.data.scope, "user");
          assert.equal(entry.data.config, true);
        }
        const enabled = registrations.find((entry) => entry.key === "yourTurnEnabled");
        const scale = registrations.find((entry) => entry.key === "yourTurnScale");
        const hold = registrations.find((entry) => entry.key === "yourTurnHold");
        assert.equal(enabled.data.default, false);
        assert.ok(enabled.data.type instanceof BooleanFieldStub);
        assert.equal(scale.data.default, 1);
        assert.ok(scale.data.type instanceof NumberFieldStub);
        assert.deepEqual(scale.data.type.options, { min: 0.5, max: 1.5, step: 0.05 });
        assert.equal(hold.data.default, 1.45);
        assert.deepEqual(hold.data.type.options, { min: 0.5, max: 4, step: 0.05 });
        for (const name of [
          "combatTurnChange",
          "collapseSidebar",
          "getActorSheetHeaderButtons",
          "getHeaderControlsApplicationV2",
          "renderApplicationV2",
        ]) {
          assert.equal(hooks.some((entry) => entry.name === name), true, name);
        }
      },
    );
  });

  test("init still registers when foundry.fields provides legacy field types", async (t) => {
    withFoundryNamespace(
      t,
      {
        fields: {
          BooleanField: BooleanFieldStub,
          NumberField: NumberFieldStub,
        },
      },
      ({ registrations, hooks }) => {
        createYourTurnFeature(MODULE).init();
        assert.equal(registrations.length, 3);
        assert.equal(registrations.some((entry) => entry.key === "yourTurnPortrait"), false);
        assert.equal(hooks.some((entry) => entry.name === "combatTurnChange"), true);
        assert.ok(registrations.find((entry) => entry.key === "yourTurnEnabled").data.type instanceof BooleanFieldStub);
        assert.ok(registrations.find((entry) => entry.key === "yourTurnScale").data.type instanceof NumberFieldStub);
        assert.ok(registrations.find((entry) => entry.key === "yourTurnHold").data.type instanceof NumberFieldStub);
      },
    );
  });

  test("a non-editable sheet gets no your-turn control", async (t) => {
    const env = setup(t);
    const actor = env.makeActor({ name: "Locked" });
    actor.isEditable = false;
    const host = env.dom.window.document.createElement("section");
    const app = { isEditable: false, actor, document: actor, element: host };
    const buttons = [];
    const controls = [];
    env.emit("getActorSheetHeaderButtons", app, buttons);
    env.emit("getHeaderControlsApplicationV2", app, controls);
    env.emit("renderApplicationV2", app, host);
    assert.equal(buttons.length, 0);
    assert.equal(controls.length, 0);
    assert.equal(host.querySelector(".astillon-your-turn-configure"), null);

    const itemHost = env.dom.window.document.createElement("section");
    env.emit("renderApplicationV2", { isEditable: true, document: { documentName: "Item" }, element: itemHost }, itemHost);
    assert.equal(itemHost.querySelector(".astillon-your-turn-configure"), null);
    const itemControls = [];
    env.emit("getHeaderControlsApplicationV2", { isEditable: true, document: { documentName: "Item" } }, itemControls);
    assert.equal(itemControls.length, 0);
  });
});

function withFoundryNamespace(t, foundryNamespace, run) {
  const dom = new JSDOM("<!doctype html><body></body>");
  const hooks = [];
  const registrations = [];
  const Hooks = {
    on(name, callback) {
      hooks.push({ name, callback });
    },
  };
  const game = {
    i18n: { localize: (key) => key },
    settings: {
      register(scope, key, data) {
        registrations.push({ scope, key, data });
      },
      get() {},
    },
  };
  const globals = {
    document: dom.window.document,
    Hooks,
    game,
    ui: { sidebar: { element: null }, combat: { viewed: null } },
    foundry: foundryNamespace,
  };
  const originals = new Map(
    Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  t.after(() => {
    dom.window.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  run({ registrations, hooks });
}
