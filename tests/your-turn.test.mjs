import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createYourTurnFeature } from "../dist/scripts/features/your-turn.js";

const MODULE = "astillon-hanaq-adventures-module";
const CARD_TIMEOUT_MS = 3000;
const CARD_SELECTOR = ".astillon-your-turn-card";
const flush = () => setImmediate();
const flushFrames = async () => {
  await flush();
  await flush();
};

class BooleanFieldStub {
  constructor() {
    this.kind = "boolean";
  }
}

class FilePathFieldStub {
  constructor(options) {
    this.kind = "filePath";
    this.options = options;
  }
}

function setup(t, { enabled = true, portrait = "", userId = "player-1" } = {}) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const callbacks = new Map();
  const settings = new Map([
    ["yourTurnEnabled", enabled],
    ["yourTurnPortrait", portrait],
  ]);
  const emit = (name, ...args) => {
    for (const callback of callbacks.get(name) ?? []) callback(...args);
  };

  const sidebar = dom.window.document.createElement("aside");
  sidebar.id = "sidebar";
  sidebar.getBoundingClientRect = () => ({
    top: 80,
    left: 900,
    width: 300,
    height: 600,
    right: 1200,
    bottom: 680,
    x: 900,
    y: 80,
    toJSON() {
      return {};
    },
  });
  dom.window.document.body.append(sidebar);

  const combatTracker = dom.window.document.createElement("section");
  combatTracker.id = "combat-tracker";
  sidebar.append(combatTracker);

  const resizeObservers = [];
  class ResizeObserverMock {
    constructor(callback) {
      this.callback = callback;
      resizeObservers.push(this);
    }
    observe() {}
    disconnect() {
      const index = resizeObservers.indexOf(this);
      if (index >= 0) resizeObservers.splice(index, 1);
    }
  }

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
    i18n: {
      localize: (key) => (key === "ASTILLON.YourTurn.Banner" ? "YOUR TURN" : key),
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

  const globals = {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    requestAnimationFrame: (fn) => {
      fn();
      return 0;
    },
    ResizeObserver: ResizeObserverMock,
    Hooks,
    game,
    ui: {
      sidebar: { element: sidebar, expanded: true },
      combat: { viewed: viewedCombat },
    },
    foundry: {
      data: {
        fields: {
          BooleanField: BooleanFieldStub,
          FilePathField: FilePathFieldStub,
        },
      },
    },
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

  const feature = createYourTurnFeature(MODULE);
  feature.init();

  function combatant({
    id = "c1",
    name = "Hero",
    players = [{ id: userId }],
    tokenTexture = "icons/token.webp",
    actorImg = "icons/actor.webp",
  } = {}) {
    const token = {
      texture: tokenTexture ? { src: tokenTexture } : { src: "" },
    };
    return {
      id,
      name,
      players,
      token,
      actor: { name, img: actorImg },
    };
  }

  function combat({
    id = "combat-viewed",
    combatant: current = combatant(),
    viewed = true,
  } = {}) {
    const instance = { id, combatant: current };
    if (viewed) ui.combat.viewed = instance;
    return instance;
  }

  function turnChange(combatInstance, prior, current) {
    emit("combatTurnChange", combatInstance, prior, current);
  }

  function cards() {
    return [...dom.window.document.body.querySelectorAll(CARD_SELECTOR)];
  }

  return {
    feature,
    dom,
    sidebar,
    combatTracker,
    settings,
    combatant,
    combat,
    turnChange,
    cards,
    emit,
    game,
  };
}

test("setting off shows nothing", (t) => {
  const env = setup(t, { enabled: false });
  env.turnChange(
    env.combat(),
    { combatantId: null, round: 1, turn: 0 },
    { combatantId: "c1", round: 1, turn: 1 },
  );
  assert.equal(env.cards().length, 0);
});

test("another user's combatant shows nothing", (t) => {
  const env = setup(t, { userId: "player-1" });
  const foe = env.combatant({ players: [{ id: "player-2" }] });
  env.turnChange(
    env.combat({ combatant: foe }),
    { combatantId: null, round: 1, turn: 0 },
    { combatantId: "c1", round: 1, turn: 1 },
  );
  assert.equal(env.cards().length, 0);
});

test("owned combatant shows name, banner, and token portrait", (t) => {
  const env = setup(t);
  env.turnChange(
    env.combat({ combatant: env.combatant({ name: "Aster", tokenTexture: "icons/token.webp" }) }),
    { combatantId: null, round: 1, turn: 0 },
    { combatantId: "c1", round: 1, turn: 1 },
  );
  const [card] = env.cards();
  assert.ok(card);
  assert.equal(card.querySelector(".astillon-your-turn-name").textContent, "Aster");
  assert.equal(card.querySelector(".astillon-your-turn-banner").textContent, "YOUR TURN");
  assert.equal(card.querySelector(".astillon-your-turn-portrait img").getAttribute("src"), "icons/token.webp");
});

test("empty token image falls through to actor portrait", (t) => {
  const env = setup(t);
  env.turnChange(
    env.combat({
      combatant: env.combatant({ tokenTexture: "", actorImg: "icons/actor-only.webp" }),
    }),
    { combatantId: "c1", round: 1, turn: 0 },
    { combatantId: "c1", round: 1, turn: 1 },
  );
  const img = env.cards()[0]?.querySelector(".astillon-your-turn-portrait img");
  assert.ok(img);
  assert.equal(img.getAttribute("src"), "icons/actor-only.webp");
});

test("portrait setting replaces token and actor images", (t) => {
  const env = setup(t, { portrait: "icons/custom.webp" });
  env.turnChange(
    env.combat(),
    { combatantId: null, round: 1, turn: 0 },
    { combatantId: "c1", round: 1, turn: 1 },
  );
  const img = env.cards()[0]?.querySelector(".astillon-your-turn-portrait img");
  assert.equal(img.getAttribute("src"), "icons/custom.webp");
});

test("click removes the card", (t) => {
  const env = setup(t);
  env.turnChange(
    env.combat(),
    { combatantId: null, round: 1, turn: 0 },
    { combatantId: "c1", round: 1, turn: 1 },
  );
  assert.equal(env.cards().length, 1);
  env.cards()[0].click();
  assert.equal(env.cards().length, 0);
});

test("timer removes the card", async (t) => {
  const env = setup(t);
  env.turnChange(
    env.combat(),
    { combatantId: null, round: 1, turn: 0 },
    { combatantId: "c1", round: 1, turn: 1 },
  );
  assert.equal(env.cards().length, 1);
  await new Promise((resolve) => setTimeout(resolve, CARD_TIMEOUT_MS + 50));
  assert.equal(env.cards().length, 0);
});

test("second combatTurnChange leaves only one card", (t) => {
  const env = setup(t);
  const first = env.combat({ combatant: env.combatant({ name: "First", id: "c1" }) });
  env.turnChange(
    first,
    { combatantId: null, round: 1, turn: 0 },
    { combatantId: "c1", round: 1, turn: 1 },
  );
  const second = env.combat({ combatant: env.combatant({ name: "Second", id: "c2" }) });
  env.turnChange(
    second,
    { combatantId: "c1", round: 1, turn: 1 },
    { combatantId: "c2", round: 1, turn: 2 },
  );
  assert.equal(env.cards().length, 1);
  assert.equal(env.cards()[0].querySelector(".astillon-your-turn-name").textContent, "Second");
});

test("card is appended to body, not inside sidebar or combat tracker", (t) => {
  const env = setup(t);
  env.turnChange(
    env.combat(),
    { combatantId: null, round: 1, turn: 0 },
    { combatantId: "c1", round: 1, turn: 1 },
  );
  const [card] = env.cards();
  assert.ok(card);
  assert.equal(card.parentElement, env.dom.window.document.body);
  assert.equal(env.sidebar.contains(card), false);
  assert.equal(env.combatTracker.contains(card), false);
});

test("combat that is not ui.combat.viewed shows nothing", (t) => {
  const env = setup(t);
  const other = env.combat({ id: "other-combat", viewed: false });
  env.turnChange(
    other,
    { combatantId: null, round: 1, turn: 0 },
    { combatantId: "c1", round: 1, turn: 1 },
  );
  assert.equal(env.cards().length, 0);
});

test("identical prior and current history shows nothing", (t) => {
  const env = setup(t);
  const history = { combatantId: "c1", round: 1, turn: 1 };
  env.turnChange(env.combat(), history, { ...history });
  assert.equal(env.cards().length, 0);
});

test("new round for the same combatant shows again", (t) => {
  const env = setup(t);
  const instance = env.combat();
  env.turnChange(
    instance,
    { combatantId: "c1", round: 1, turn: 2 },
    { combatantId: "c1", round: 2, turn: 0 },
  );
  assert.equal(env.cards().length, 1);
});

test("positions card using sidebar geometry", async (t) => {
  const env = setup(t);
  env.turnChange(
    env.combat(),
    { combatantId: null, round: 1, turn: 0 },
    { combatantId: "c1", round: 1, turn: 1 },
  );
  await flushFrames();
  const [card] = env.cards();
  assert.equal(card.style.getPropertyValue("--astillon-your-turn-top"), "380px");
  assert.equal(card.style.getPropertyValue("--astillon-your-turn-left"), "900px");
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

test("init registers settings and hooks combatTurnChange with foundry.data.fields only", (t) => {
  withFoundryNamespace(
    t,
    {
      data: {
        fields: {
          BooleanField: BooleanFieldStub,
          FilePathField: FilePathFieldStub,
        },
      },
    },
    ({ registrations, hooks }) => {
      assert.equal("fields" in foundry, false);
      createYourTurnFeature(MODULE).init();
      assert.equal(registrations.length, 2);
      assert.equal(hooks.some((entry) => entry.name === "combatTurnChange"), true);
      const enabled = registrations.find((entry) => entry.key === "yourTurnEnabled");
      const portrait = registrations.find((entry) => entry.key === "yourTurnPortrait");
      assert.equal(enabled.data.scope, "user");
      assert.equal(enabled.data.config, true);
      assert.equal(enabled.data.default, false);
      assert.ok(enabled.data.type instanceof BooleanFieldStub);
      assert.equal(portrait.data.scope, "user");
      assert.equal(portrait.data.default, "");
      assert.ok(portrait.data.type instanceof FilePathFieldStub);
      assert.deepEqual(portrait.data.type.options, { categories: ["IMAGE"], blank: true, initial: "" });
    },
  );
});

test("init still registers when foundry.fields provides legacy field types", (t) => {
  withFoundryNamespace(
    t,
    {
      fields: {
        BooleanField: BooleanFieldStub,
        FilePathField: FilePathFieldStub,
      },
    },
    ({ registrations, hooks }) => {
      createYourTurnFeature(MODULE).init();
      assert.equal(registrations.length, 2);
      assert.equal(hooks.some((entry) => entry.name === "combatTurnChange"), true);
      assert.ok(registrations.find((entry) => entry.key === "yourTurnEnabled").data.type instanceof BooleanFieldStub);
    },
  );
});
