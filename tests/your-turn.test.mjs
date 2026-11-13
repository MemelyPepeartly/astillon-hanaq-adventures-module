import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test, { describe } from "node:test";
import { JSDOM } from "jsdom";
import {
  TURN_INTRO_MS,
  createYourTurnFeature,
  fitTurnPortrait,
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
  function setup(t, { enabled = true, reduced = false, userId = "player-1", isGM = false,
    scale = 1, hold = 1.45, portraitWidth = 400, route = null, savedWorld = {}, legacyUser = {} } = {}) {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const callbacks = new Map();
    const settings = new Map([
      ["yourTurnEnabled", enabled],
      ["yourTurnScale", scale],
      ["yourTurnHold", hold],
      ["yourTurnPortraitWidth", portraitWidth],
    ]);
    const worldDocuments = new Map(Object.entries(savedWorld).map(([key, value]) => [`${MODULE}.${key}`, { value }]));
    const legacyDocuments = new Map(Object.entries(legacyUser).map(([key, value]) => [`${userId}:${MODULE}.${key}`, { value }]));
    for (const [key, value] of Object.entries(savedWorld)) settings.set(key, value);
    const registrations = new Map();
    const settingsWrites = [];
    const scheduled = [];
    const timerCallbacks = new Map();
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
    const dialogs = [];
    const audioControl = { sounds: [], loadAuto: true, playAuto: true, stopAuto: true, failLoad: false, failPlay: false, failStop: false };

    class SoundStub {
      constructor(options) {
        this.options = options;
        this.playing = false;
        this.failed = false;
        this.playCalls = [];
        this.stopCalls = [];
        this.loads = [];
        audioControl.sounds.push(this);
      }
      async load(options) {
        this.loads.push(options);
        if (!audioControl.loadAuto) await new Promise(resolve => { this.finishLoad = resolve; });
        if (audioControl.failLoad) throw new Error("Audio missing");
        return this;
      }
      async play(options) {
        this.playCalls.push(options);
        this.overlayAtPlay = dom.window.document.querySelector(ROOT);
        if (!audioControl.playAuto) await new Promise(resolve => { this.finishPlay = resolve; });
        if (audioControl.failPlay) throw new Error("Audio blocked");
        this.playing = true;
        return this;
      }
      async stop(options) {
        this.stopCalls.push(options);
        if (!audioControl.stopAuto) await new Promise(resolve => { this.finishStop = resolve; });
        this.playing = false;
        if (audioControl.failStop) throw new Error("Stop failed");
        return this;
      }
    }

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
          this.naturalWidth = this.width = typeof size === "number" ? size : size.width;
          this.naturalHeight = this.height = typeof size === "number" ? size : size.height;
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
      audio: {
        interface: { name: "Foundry interface master volume" },
        unlock: Promise.resolve(),
        create: options => new SoundStub(options),
        play: () => assert.fail("A managed Sound must handle local playback"),
        preload: () => assert.fail("Do not broadcast sound preloads"),
      },
      socket: { emit: () => assert.fail("Stingers must never broadcast") },
      ready: true,
      user: { id: userId, isGM, can: permission => permission === "SETTINGS_MODIFY" && game.user.isGM },
      users: { activeGM: { id: isGM ? userId : "primary-gm" } },
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
          "ASTILLON.YourTurn.Sound": "Sound stinger (optional)",
          "ASTILLON.YourTurn.SoundPlaceholder": "Leave blank for silence",
          "ASTILLON.YourTurn.SoundHint": "Sound plays once with the cut-in and stops when it ends. Uses your Interface volume.",
          "ASTILLON.YourTurn.StopPreview": "Stop preview",
        })[key] ?? key,
        format: (key) => key,
      },
      settings: {
        register(_scope, key, data) { registrations.set(key, data); },
        storage: new Map([["world", { getSetting: (key, user = null) => user
          ? legacyDocuments.get(`${user}:${key}`) : worldDocuments.get(key) }]]),
        get(_scope, key) {
          return settings.get(key);
        },
        async set(_scope, key, value) {
          if (registrations.get(key)?.scope === "world" && !game.user.can("SETTINGS_MODIFY")) throw new Error("World setting permission denied");
          settingsWrites.push({ key, value });
          worldDocuments.set(`${MODULE}.${key}`, { value });
          settings.set(key, value);
          registrations.get(key)?.onChange?.(value);
          return value;
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
        this.options.callback?.(this.options.type === "audio" ? "sounds/picked.ogg" : "icons/picked.webp");
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
              dialog.close = () => { config.close?.(new dom.window.Event("close"), dialog); wrap.remove(); resolve(null); };
              dialogs.push(dialog);
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
                    config.close?.(new dom.window.Event("close"), dialog);
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
        timerCallbacks.set(ms, fn);
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
      audioControl.loadAuto = audioControl.playAuto = audioControl.stopAuto = true;
      for (const sound of audioControl.sounds) { sound.finishLoad?.(); sound.finishPlay?.(); sound.finishStop?.(); }
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
      sound,
      documentName = "Actor",
    } = {}) {
      const flags = {};
      if (art !== undefined) flags.yourTurnArt = art;
      if (color !== undefined) flags.yourTurnColor = color;
      if (sound !== undefined) flags.yourTurnSound = sound;
      return {
        name,
        img,
        documentName,
        flags,
        setCalls: [],
        unsetCalls: [],
        updated: false,
        updateCalls: [],
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
          this.updateCalls.push(changes);
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
      sound,
      baseArt,
      baseColor,
      actorName,
    } = {}) {
      const actor = makeActor({ name: actorName ?? name, img: actorImg, art, color, sound });
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
      ui: globals.ui,
      dom,
      sidebar,
      hotbar,
      uiLeft,
      uiTop,
      settings,
      registrations,
      settingsWrites,
      worldDocuments,
      legacyDocuments,
      scheduled,
      timerCallbacks,
      audioControl,
      dialogs,
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

  test("world enable overrides a player's old opt-out and players cannot change it", async t => {
    const env = setup(t, { savedWorld: { yourTurnEnabled: true }, legacyUser: { yourTurnEnabled: false } });
    await env.feature.ready();
    await env.turnChange(env.combat(), {}, { combatantId: "c1", round: 1, turn: 0 });
    assert.equal(env.overlays().length, 1);
    assert.equal(env.settingsWrites.length, 0);
    await assert.rejects(env.game.settings.set(MODULE, "yourTurnEnabled", false), /permission denied/);
    // Native Setting._onUpdate invokes onChange for old user-scoped documents too.
    env.registrations.get("yourTurnEnabled").onChange(false);
    assert.equal(env.overlays().length, 1, "a legacy player-setting update cannot stop a world-enabled cut-in");
  });

  test("world disable overrides a player's old opt-in and remote updates cancel playback", async t => {
    const env = setup(t, { savedWorld: { yourTurnEnabled: true }, legacyUser: { yourTurnEnabled: true } });
    await env.turnChange(env.combat({ combatant: env.combatant({ sound: "sounds/turn.ogg" }) }), {}, { combatantId: "c1" });
    assert.equal(env.overlays().length, 1);
    env.settings.set("yourTurnEnabled", false); // World Setting update received from the GM.
    env.registrations.get("yourTurnEnabled").onChange(false);
    await flush();
    assert.equal(env.overlays().length, 0);
    assert.equal(env.audioControl.sounds[0].playing, false);
    await env.feature.ready();
    await env.turnChange(env.combat(), {}, { combatantId: "c2" });
    assert.equal(env.overlays().length, 0);
    assert.equal(env.settingsWrites.length, 0);
  });

  test("primary GM migrates only their saved user settings and preserves existing world width", async t => {
    const env = setup(t, { userId: "gm", isGM: true, enabled: false,
      legacyUser: { yourTurnEnabled: true, yourTurnScale: 1.25, yourTurnHold: 2 },
      savedWorld: { yourTurnPortraitWidth: 650 } });
    env.legacyDocuments.set(`player:${MODULE}.yourTurnEnabled`, { value: false });
    await Promise.all([env.feature.ready(), env.feature.ready()]);
    assert.deepEqual(env.settingsWrites, [
      { key: "yourTurnEnabled", value: true }, { key: "yourTurnScale", value: 1.25 }, { key: "yourTurnHold", value: 2 },
    ]);
    assert.equal(env.settings.get("yourTurnPortraitWidth"), 650);
    assert.equal(env.legacyDocuments.get(`gm:${MODULE}.yourTurnEnabled`).value, true, "old preferences are not destructively removed");
    await env.feature.ready();
    assert.equal(env.settingsWrites.length, 3);
  });

  test("existing world choices win over every legacy GM preference", async t => {
    const env = setup(t, { isGM: true, legacyUser: { yourTurnEnabled: true, yourTurnScale: 1.5, yourTurnHold: 4 },
      savedWorld: { yourTurnEnabled: false, yourTurnScale: 0.75, yourTurnHold: 1 } });
    await env.feature.ready();
    assert.equal(env.settingsWrites.length, 0);
    assert.equal(env.settings.get("yourTurnEnabled"), false);
    assert.equal(env.settings.get("yourTurnScale"), 0.75);
    assert.equal(env.settings.get("yourTurnHold"), 1);
  });

  test("missing or invalid legacy values seed defaults, not another player's preferences", async t => {
    const env = setup(t, { userId: "gm", isGM: true, legacyUser: { yourTurnEnabled: "yes", yourTurnScale: 50, yourTurnHold: NaN } });
    env.legacyDocuments.set(`player:${MODULE}.yourTurnEnabled`, { value: true });
    await env.feature.ready();
    assert.deepEqual(env.settingsWrites, [
      { key: "yourTurnEnabled", value: false }, { key: "yourTurnScale", value: 1 }, { key: "yourTurnHold", value: 1.45 },
    ]);
  });

  for (const reason of ["secondary GM", "no settings permission", "not ready"]) {
    test(`settings migration performs no world writes with ${reason}`, async t => {
      const env = setup(t, { isGM: true, legacyUser: { yourTurnEnabled: true } });
      if (reason === "secondary GM") env.game.users.activeGM.id = "otherGM";
      if (reason === "no settings permission") env.game.user.can = () => false;
      if (reason === "not ready") env.game.ready = false;
      await env.feature.ready();
      assert.equal(env.settingsWrites.length, 0);
      env.game.ready = true;
      env.game.users.activeGM.id = env.game.user.id;
      env.game.user.can = () => true;
      env.emit("userConnected", { id: "otherGM" }, false);
      await env.feature.ready();
      assert.equal(env.settingsWrites.length, 3, "the newly authorized GM can complete migration");
    });
  }

  test("migration rechecks GM authority after each awaited setting write", async t => {
    const env = setup(t, { isGM: true, legacyUser: { yourTurnEnabled: true, yourTurnScale: 1.2 } });
    const original = env.game.settings.set;
    env.game.settings.set = async (...args) => {
      const result = await original(...args);
      env.game.users.activeGM.id = "otherGM";
      return result;
    };
    await env.feature.ready();
    assert.deepEqual(env.settingsWrites, [{ key: "yourTurnEnabled", value: true }]);
  });

  test("a migration failure is reported and a later ready can retry without replacing saved choices", async t => {
    const env = setup(t, { isGM: true, legacyUser: { yourTurnEnabled: true, yourTurnScale: 1.2 } });
    const original = env.game.settings.set;
    const warnings = [];
    env.ui.notifications.warn = message => warnings.push(message);
    env.game.settings.set = async (...args) => {
      if (args[1] === "yourTurnScale") throw new Error("injected setting failure");
      return original(...args);
    };
    await env.feature.ready();
    assert.equal(warnings.length, 1);
    assert.deepEqual(env.settingsWrites, [{ key: "yourTurnEnabled", value: true }]);
    env.game.settings.set = original;
    await env.feature.ready();
    assert.equal(env.settingsWrites.length, 3);
    assert.equal(env.settingsWrites.filter(write => write.key === "yourTurnEnabled").length, 1);
  });

  test("Foundry's settings visibility contract hides world controls from players", t => {
    const env = setup(t);
    const visible = () => [...env.registrations.values()].filter(setting => setting.config &&
      (setting.scope !== "world" || env.game.user.can("SETTINGS_MODIFY")));
    assert.equal(visible().length, 0);
    env.game.user.isGM = true;
    assert.equal(visible().length, 4);
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

  test("portrait fitting upscales small art and downscales large art without changing proportions", () => {
    assert.deepEqual(fitTurnPortrait(40, 60, 300), { width: 300, height: 450 });
    assert.deepEqual(fitTurnPortrait(800, 1200, 300), { width: 300, height: 450 });
    assert.deepEqual(fitTurnPortrait(32, 32, 400, true), { width: 400, height: 400 });
    assert.deepEqual(fitTurnPortrait(4096, 4096, 400, true), { width: 400, height: 400 });
    assert.deepEqual(fitTurnPortrait(100, 1000, 400), { width: 400, height: 4000 });
    assert.deepEqual(fitTurnPortrait(1000, 100, 1000), { width: 1000, height: 100 });
    assert.deepEqual(fitTurnPortrait(100, 1000, 1000, true), { width: 1000, height: 9856 });
  });

  test("world portrait width affects every art size and cached previews without changing actor data", async t => {
    const env = setup(t, { portraitWidth: 320 });
    for (const [path, size] of [["icons/small.webp", 32], ["icons/large.webp", 2048]]) {
      env.imageControl.sizes.set(path, size);
      await env.feature.api.preview(env.makeActor({ img: path })); await flush();
      const character = env.overlays()[0].querySelector(".astillon-yt-character");
      assert.equal(character.style.width, "320px");
      assert.equal(character.style.height, "320px");
    }
    const requested = env.imageControl.requested.length;
    const oldRoot = env.overlays()[0];
    env.settings.set("yourTurnPortraitWidth", 250);
    assert.equal(oldRoot.querySelector(".astillon-yt-character").style.width, "320px", "do not resize during a running cut-in");
    await env.feature.api.preview(env.makeActor({ img: "icons/large.webp" })); await flush();
    assert.equal(env.imageControl.requested.length, requested, "width changes reuse prepared artwork");
    assert.equal(env.overlays()[0].querySelector(".astillon-yt-character").style.width, "250px");
    assert.equal(env.calls.update, 0);
    assert.equal(env.calls.nextTurn, 0);
  });

  test("transparent sticker and tainted fallback portraits both obey the same target width", async t => {
    const env = setup(t, { portraitWidth: 280 });
    const pixels = new Uint8ClampedArray(24 * 24 * 4);
    pixels[(12 * 24 + 12) * 4 + 3] = 255;
    env.imageControl.pixels.set("icons/width-sticker.webp", pixels);
    env.imageControl.sizes.set("icons/width-sticker.webp", 24);
    await env.feature.api.preview(env.makeActor({ img: "icons/width-sticker.webp" })); await flush();
    let character = env.overlays()[0].querySelector(".astillon-yt-character");
    assert.equal(character.dataset.mode, "sticker");
    assert.equal(character.style.width, "280px");
    env.imageControl.tainted.add("icons/width-tainted.webp");
    env.imageControl.sizes.set("icons/width-tainted.webp", { width: 30, height: 20 });
    await env.feature.api.preview(env.makeActor({ img: "icons/width-tainted.webp" })); await flush();
    character = env.overlays()[0].querySelector(".astillon-yt-character");
    assert.equal(character.dataset.mode, "frame");
    assert.equal(character.style.width, "280px");
    assert.equal(Number.parseFloat(character.style.height), 192);
  });

  test("invalid portrait-width settings use a safe default or supported bound", async t => {
    const env = setup(t);
    const actor = env.makeActor({ img: "icons/width-safe.webp" });
    for (const [value, expected] of [[undefined, 400], [null, 400], ["", 400], [NaN, 400], [Infinity, 400], [-1, 400], [0, 400], [50, 100], ["250", 250], [9000, 1000]]) {
      env.settings.set("yourTurnPortraitWidth", value);
      await env.feature.api.preview(actor); await flush();
      const root = env.overlays()[0];
      assert.equal(root.style.getPropertyValue("--yt-portrait-width"), `${expected}px`);
      assert.equal(Number.parseFloat(root.querySelector(".astillon-yt-character").style.width), expected);
    }
  });

  test("increasing the target to 1000 enlarges small, large, tall, and wide art without backdrop caps", async t => {
    const env = setup(t, { portraitWidth: 400 });
    for (const [name, width, height] of [["small", 32, 32], ["large", 2048, 2048], ["tall", 32, 160], ["wide", 160, 32]]) {
      const img = `icons/width-${name}.webp`;
      env.imageControl.sizes.set(img, { width, height });
      const actor = env.makeActor({ img });
      env.settings.set("yourTurnPortraitWidth", 400);
      await env.feature.api.preview(actor); await flush();
      const before = env.overlays()[0].querySelector(".astillon-yt-character");
      const beforeHeight = Number.parseFloat(before.style.height);
      assert.equal(before.style.width, "400px");
      env.settings.set("yourTurnPortraitWidth", 1000);
      await env.feature.api.preview(actor); await flush();
      const after = env.overlays()[0].querySelector(".astillon-yt-character");
      assert.equal(after.style.width, "1000px", `${name} reaches the selected width, even beyond the stage`);
      assert.ok(Number.parseFloat(after.style.height) > beforeHeight);
      assert.ok(Math.abs((Number.parseFloat(after.style.height) - 16) / 984 - height / width) < 0.000001);
    }
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
    const actor = env.makeActor({ name: "Editor", img: "icons/saved-actor.webp", art: "icons/stored.webp", sound: "sounds/stored.ogg" });
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
    const sound = dialog.querySelector("[name=yourTurnSound]");
    assert.equal(sound.value, "sounds/stored.ogg");
    assert.equal(art.value, "icons/stored.webp");
    assert.equal(dialog.querySelector("[data-action=preview]").textContent, "Preview");
    assert.equal(dialog.querySelector("[data-action=save]").textContent, "Save");
    dialog.querySelector("[data-action=browse]").click();
    assert.equal(art.value, "icons/picked.webp");
    assert.equal(env.filePickers.length, 1);
    assert.equal(env.filePickers[0].options.type, "image");
    assert.equal(env.filePickers[0].options.field, art);
    assert.equal(env.filePickers[0].browsed, true);
    dialog.querySelector("[data-action=browse-sound]").click();
    assert.equal(sound.value, "sounds/picked.ogg");
    assert.equal(env.filePickers[1].options.type, "audio");
    assert.equal(env.filePickers[1].options.field, sound);
    assert.equal(env.filePickers[1].options.current, "sounds/stored.ogg");
    assert.equal(env.filePickers[1].browsed, true);
    art.value = "icons/draft.webp";
    color.value = "#112233";
    sound.value = "  sounds/draft.ogg  ";
    dialog.querySelector("[data-action=preview]").click();
    await flush();
    assert.equal(env.overlays().length, 1);
    assert.equal(actor.setCalls.length, 0);
    assert.equal(actor.updated, false);
    assert.equal(env.calls.nextTurn, 0);
    assert.equal(env.overlays()[0].querySelector(".astillon-yt-character img").getAttribute("src"), "icons/draft.webp");
    assert.equal(env.overlays()[0].style.getPropertyValue("--yt-color"), "#112233");
    assert.equal(env.audioControl.sounds[0].options.src, "sounds/draft.ogg");
    assert.equal(actor.flags.yourTurnSound, "sounds/stored.ogg");

    dialog.querySelector("[data-action=save]").click();
    await flush();
    assert.equal(actor.flags.yourTurnArt, "icons/draft.webp");
    assert.equal(actor.flags.yourTurnColor, "#112233");
    assert.equal(actor.flags.yourTurnSound, "sounds/draft.ogg");
    assert.equal(dialog.isConnected, false);
    assert.equal(env.calls.update, 1, "portrait, color, and sound save in one document update");
    assert.deepEqual(actor.updateCalls[0], {
      [`flags.${MODULE}.yourTurnArt`]: "icons/draft.webp",
      [`flags.${MODULE}.yourTurnColor`]: "#112233",
      [`flags.${MODULE}.yourTurnSound`]: "sounds/draft.ogg",
    });
    assert.equal(env.audioControl.sounds[0].playing, false, "saving stops the editor preview");

    header.querySelector("button").click();
    const reopened = env.dom.window.document.querySelector(".astillon-yt-dialog");
    assert.equal(reopened.querySelector("[name=yourTurnArt]").value, "icons/draft.webp");
    assert.equal(reopened.querySelector("[name=yourTurnColor]").value, "#112233");
    assert.equal(reopened.querySelector("[name=yourTurnSound]").value, "sounds/draft.ogg");
    reopened.querySelector("[name=yourTurnArt]").value = "   ";
    reopened.querySelector("[name=yourTurnSound]").value = "   ";
    reopened.querySelector("[data-action=save]").click();
    await flush();
    assert.ok(actor.unsetCalls.includes("yourTurnArt"));
    assert.equal(actor.flags.yourTurnArt, undefined);
    assert.equal(actor.flags.yourTurnSound, undefined);
    assert.ok(actor.unsetCalls.includes("yourTurnSound"));
    assert.deepEqual(env.errors, [], "Browse and Preview must not fall through to DialogV2 submit actions");
  });

  test("sound starts once locally after the displayed portrait decodes and uses Foundry's interface context", async t => {
    const env = setup(t);
    let finishDecode;
    env.dom.window.HTMLImageElement.prototype.decode = () => new Promise(resolve => { finishDecode = resolve; });
    const current = env.combatant({ sound: "sounds/turn.ogg" });
    const combat = env.combat({ combatant: current });
    await env.turnChange(combat, { combatantId: null }, { combatantId: current.id, round: 1, turn: 0 });
    assert.equal(env.overlays().length, 0);
    assert.equal(env.audioControl.sounds.length, 0);
    finishDecode(); await flush();
    const [sound] = env.audioControl.sounds;
    assert.deepEqual(sound.options, {
      src: "sounds/turn.ogg", context: env.game.audio.interface, singleton: false, preload: false, autoplay: false,
    });
    assert.deepEqual(sound.loads, [{ autoplay: false }]);
    assert.deepEqual(sound.playCalls, [{ loop: false, volume: 1, offset: 0 }]);
    assert.equal(sound.overlayAtPlay, env.overlays()[0]);
    assert.equal(sound.playing, true);
    const history = { combatantId: current.id, round: 1, turn: 0 };
    await env.turnChange(combat, history, { ...history });
    assert.equal(env.audioControl.sounds.length, 1);
    env.timerCallbacks.get(TURN_INTRO_MS)(); await flush();
    assert.equal(sound.playing, false);
    assert.equal(env.overlays().length, 0);
  });

  test("blank paths are silent and disabled cut-ins never load sound", async t => {
    const env = setup(t, { enabled: false });
    await env.turnChange(env.combat({ combatant: env.combatant({ sound: "sounds/turn.ogg" }) }), {}, { combatantId: "c1" });
    assert.equal(env.audioControl.sounds.length, 0);
    await env.feature.api.preview(env.makeActor({ sound: "  " })); await flush();
    assert.equal(env.overlays().length, 1);
    assert.equal(env.audioControl.sounds.length, 0);
    env.imageControl.auto = false;
    env.settings.set("yourTurnEnabled", true);
    const combat = env.combat({ combatant: env.combatant({ actorImg: "icons/late-sound.webp", sound: "sounds/turn.ogg" }) });
    env.emit("combatTurnChange", combat, {}, { combatantId: "c1" });
    env.settings.set("yourTurnEnabled", false);
    for (const finish of env.imageControl.pending.splice(0)) finish();
    await flush();
    assert.equal(env.overlays().length, 0);
    assert.equal(env.audioControl.sounds.length, 0);
  });

  test("cancel during image loading suppresses sound and artwork", async t => {
    const env = setup(t);
    env.imageControl.auto = false;
    const showing = env.feature.api.preview(env.makeActor({ sound: "sounds/turn.ogg" }));
    env.feature.api.cancel();
    for (const finish of env.imageControl.pending.splice(0)) finish();
    await showing; await flush();
    assert.equal(env.audioControl.sounds.length, 0);
    assert.equal(env.overlays().length, 0);
  });

  test("audio unlock cannot resurrect a canceled cut-in", async t => {
    const env = setup(t);
    let unlock;
    env.game.audio.unlock = new Promise(resolve => { unlock = resolve; });
    await env.feature.api.preview(env.makeActor({ sound: "sounds/turn.ogg" }));
    assert.equal(env.overlays().length, 1);
    assert.equal(env.audioControl.sounds.length, 0);
    env.emit("canvasTearDown");
    unlock(); await flush();
    assert.equal(env.audioControl.sounds.length, 0);
  });

  test("a canceled audio load never autoplays or stops a replacement using the same path", async t => {
    const env = setup(t);
    env.audioControl.loadAuto = false;
    const actor = env.makeActor({ sound: "sounds/shared.ogg" });
    await env.feature.api.preview(actor); await flush();
    const first = env.audioControl.sounds[0];
    env.audioControl.loadAuto = true;
    await env.feature.api.preview(actor); await flush();
    const second = env.audioControl.sounds[1];
    assert.equal(second.playing, true);
    first.finishLoad(); await flush();
    assert.equal(first.playCalls.length, 0);
    assert.equal(first.playing, false);
    assert.equal(second.playing, true);
    assert.equal(second.stopCalls.length, 0);
    env.emit("canvasTearDown"); await flush();
    assert.equal(second.playing, false);
  });

  test("a pending play is stopped again before a replacement sound starts", async t => {
    const env = setup(t);
    env.audioControl.playAuto = false;
    const actor = env.makeActor({ sound: "sounds/shared.ogg" });
    await env.feature.api.preview(actor); await flush();
    const first = env.audioControl.sounds[0];
    assert.equal(first.playCalls.length, 1);
    env.audioControl.playAuto = true;
    await env.feature.api.preview(actor); await flush();
    const second = env.audioControl.sounds[1];
    assert.equal(second.playCalls.length, 0, "wait for the canceled start and its cleanup");
    first.finishPlay(); await flush();
    assert.equal(first.playing, false);
    assert.ok(first.stopCalls.length >= 2);
    assert.equal(second.playing, true);
  });

  test("replacement playback waits for asynchronous sound teardown", async t => {
    const env = setup(t);
    const actor = env.makeActor({ sound: "sounds/shared.ogg" });
    await env.feature.api.preview(actor); await flush();
    const first = env.audioControl.sounds[0];
    env.audioControl.stopAuto = false;
    await env.feature.api.preview(actor); await flush();
    const second = env.audioControl.sounds[1];
    assert.equal(second.playCalls.length, 0);
    env.audioControl.stopAuto = true;
    first.finishStop(); await flush();
    assert.equal(first.playing, false);
    assert.equal(second.playing, true);
  });

  test("audio loading and playback failures preserve the cut-in and permit later playback", async t => {
    const env = setup(t);
    t.mock.method(console, "error", () => {});
    t.mock.method(console, "warn", () => {});
    const actor = env.makeActor({ sound: "sounds/turn.ogg" });
    env.audioControl.failLoad = true;
    await env.feature.api.preview(actor); await flush();
    assert.equal(env.overlays().length, 1);
    assert.equal(env.audioControl.sounds[0].playCalls.length, 0);
    assert.ok(env.errors.some(error => /Audio missing/.test(error)));
    env.audioControl.failLoad = false;
    env.audioControl.failPlay = env.audioControl.failStop = true;
    await env.feature.api.preview(actor); await flush();
    assert.equal(env.overlays().length, 1);
    assert.ok(env.errors.some(error => /Audio blocked/.test(error)));
    env.audioControl.failPlay = env.audioControl.failStop = false;
    await env.feature.api.preview(actor); await flush();
    assert.equal(env.audioControl.sounds.at(-1).playing, true);
  });

  test("cancel or window dismissal preserves every stored field and stops the editor preview", async t => {
    const env = setup(t);
    const actor = env.makeActor({ art: "icons/saved.webp", color: "#123456", sound: "sounds/saved.ogg" });
    for (const dismiss of ["cancel", "close"]) {
      void env.feature.api.configure(actor);
      const dialog = env.dialogs.at(-1);
      dialog.element.querySelector("[name=yourTurnArt]").value = "icons/draft.webp";
      dialog.element.querySelector("[name=yourTurnColor]").value = "#abcdef";
      dialog.element.querySelector("[name=yourTurnSound]").value = "sounds/draft.ogg";
      dialog.element.querySelector("[data-action=preview]").click(); await flush();
      const sound = env.audioControl.sounds.at(-1);
      assert.equal(sound.playing, true);
      if (dismiss === "cancel") dialog.element.querySelector("[data-action=cancel]").click();
      else dialog.close();
      await flush();
      assert.equal(sound.playing, false);
      assert.equal(env.overlays().length, 0);
      assert.deepEqual(actor.flags, { yourTurnArt: "icons/saved.webp", yourTurnColor: "#123456", yourTurnSound: "sounds/saved.ogg" });
    }
    assert.equal(env.calls.update, 0);
    assert.deepEqual(env.errors, []);
  });

  test("closing an editor cancels pending artwork and sound loads", async t => {
    const env = setup(t);
    const actor = env.makeActor({ sound: "sounds/turn.ogg" });
    void env.feature.api.configure(actor);
    env.imageControl.auto = false;
    const first = env.dialogs[0];
    first.element.querySelector("[data-action=preview]").click();
    first.close();
    env.imageControl.auto = true;
    for (const finish of env.imageControl.pending.splice(0)) finish();
    await flush();
    assert.equal(env.audioControl.sounds.length, 0);
    assert.equal(env.overlays().length, 0);
    void env.feature.api.configure(actor);
    env.audioControl.loadAuto = false;
    const second = env.dialogs[1];
    second.element.querySelector("[data-action=preview]").click(); await flush();
    second.close();
    env.audioControl.sounds[0].finishLoad(); await flush();
    assert.equal(env.audioControl.sounds[0].playCalls.length, 0);
    assert.equal(env.calls.update, 0);
  });

  test("stop preview and path changes cancel audio without submitting the editor", async t => {
    const env = setup(t);
    void env.feature.api.configure(env.makeActor({ sound: "sounds/turn.ogg" }));
    const dialog = env.dialogs[0].element;
    for (const stop of ["button", "input", "change"]) {
      dialog.querySelector("[data-action=preview]").click(); await flush();
      const sound = env.audioControl.sounds.at(-1);
      if (stop === "button") dialog.querySelector("[data-action=stop-preview]").click();
      else dialog.querySelector("[name=yourTurnSound]").dispatchEvent(new env.dom.window.Event(stop, { bubbles: true }));
      await flush();
      assert.equal(sound.playing, false);
      assert.equal(env.overlays().length, 0);
      assert.equal(dialog.isConnected, true);
    }
    assert.equal(env.calls.update, 0);
    assert.deepEqual(env.errors, []);
  });

  test("closing another editor does not cancel the latest editor or combat stinger", async t => {
    const env = setup(t);
    const actor = env.makeActor({ sound: "sounds/turn.ogg" });
    void env.feature.api.configure(actor); void env.feature.api.configure(actor);
    env.dialogs[0].element.querySelector("[data-action=preview]").click(); await flush();
    env.dialogs[1].element.querySelector("[data-action=preview]").click(); await flush();
    const second = env.audioControl.sounds.at(-1);
    env.dialogs[0].close(); await flush();
    assert.equal(second.playing, true);
    await env.turnChange(env.combat({ combatant: env.combatant({ sound: "sounds/combat.ogg" }) }), {}, { combatantId: "c1" });
    const combatSound = env.audioControl.sounds.at(-1);
    env.dialogs[1].close(); await flush();
    assert.equal(combatSound.playing, true);
    assert.equal(env.overlays().length, 1);
  });

  test("audio picker cancellation, failure, and late selection preserve the draft and saved sound", async t => {
    const env = setup(t);
    t.mock.method(console, "error", () => {});
    const actor = env.makeActor({ sound: "sounds/saved.ogg" });
    const Picker = foundry.applications.apps.FilePicker.implementation;
    const browse = t.mock.method(Picker.prototype, "browse", async function () { this.browsed = true; });
    void env.feature.api.configure(actor);
    const dialog = env.dialogs[0];
    const input = dialog.element.querySelector("[name=yourTurnSound]");
    input.value = "sounds/typed.ogg";
    dialog.element.querySelector("[data-action=browse-sound]").click(); await flush();
    assert.equal(input.value, "sounds/typed.ogg");
    browse.mock.mockImplementation(async () => { throw new Error("Storage unavailable"); });
    dialog.element.querySelector("[data-action=browse-sound]").click(); await flush();
    assert.equal(input.value, "sounds/typed.ogg");
    assert.ok(env.errors.some(error => /file browser.*Storage unavailable/.test(error)));
    dialog.close(); await flush();
    env.filePickers[0].options.callback("sounds/too-late.ogg");
    assert.equal(input.value, "sounds/typed.ogg");
    assert.equal(actor.flags.yourTurnSound, "sounds/saved.ogg");
    assert.equal(env.calls.update, 0);
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
    const actor = env.makeActor({ art: "icons/saved.webp", color: "#123456", sound: "sounds/saved.ogg" });
    actor.update = async () => { throw new Error("Permission denied"); };
    void env.feature.api.configure(actor);
    const dialog = env.dom.window.document.querySelector(".astillon-yt-dialog");
    dialog.querySelector("[name=yourTurnArt]").value = "icons/new.webp";
    dialog.querySelector("[name=yourTurnSound]").value = "sounds/new.ogg";
    dialog.querySelector("[data-action=save]").click(); await flush();
    assert.equal(actor.flags.yourTurnArt, "icons/saved.webp");
    assert.equal(actor.flags.yourTurnColor, "#123456");
    assert.equal(actor.flags.yourTurnSound, "sounds/saved.ogg");
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

  test("init registers four GM-controlled world settings, not a world portrait path", async (t) => {
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
        assert.equal(registrations.length, 4);
        assert.equal(registrations.some((entry) => entry.key === "yourTurnPortrait"), false);
        const names = registrations.map((entry) => entry.key);
        assert.deepEqual(names, ["yourTurnEnabled", "yourTurnScale", "yourTurnHold", "yourTurnPortraitWidth"]);
        for (const entry of registrations) {
          assert.equal(entry.data.scope, "world");
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
        const width = registrations.find((entry) => entry.key === "yourTurnPortraitWidth");
        assert.equal(width.data.default, 400);
        assert.ok(width.data.type instanceof NumberFieldStub);
        assert.deepEqual(width.data.type.options, { min: 100, max: 1000, step: 10 });
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
        assert.equal(registrations.length, 4);
        assert.equal(registrations.some((entry) => entry.key === "yourTurnPortrait"), false);
        assert.equal(hooks.some((entry) => entry.name === "combatTurnChange"), true);
        assert.ok(registrations.find((entry) => entry.key === "yourTurnEnabled").data.type instanceof BooleanFieldStub);
        assert.ok(registrations.find((entry) => entry.key === "yourTurnScale").data.type instanceof NumberFieldStub);
        assert.ok(registrations.find((entry) => entry.key === "yourTurnHold").data.type instanceof NumberFieldStub);
        assert.equal(registrations.find((entry) => entry.key === "yourTurnPortraitWidth").data.scope, "world");
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
