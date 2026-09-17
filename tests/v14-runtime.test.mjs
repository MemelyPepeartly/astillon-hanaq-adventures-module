import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createSarsaparillaFeature } from "../dist/scripts/features/sarsaparilla-surprise.js";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const quietConsole = { log() {} };

async function runMacro(name, actor, DialogV2, { Roll, FormDataClass = FormData } = {}) {
  const path = new URL(`../src/packs/astillon-race-macros.db/${name}.json`, import.meta.url);
  const { command } = JSON.parse(readFileSync(path, "utf8"));
  const run = new AsyncFunction("canvas", "ui", "foundry", "FormData", "console", command);
  await run(
    { tokens: { controlled: [{ actor }] } },
    { notifications: { warn(message) { assert.fail(message); } } },
    { applications: { api: { DialogV2 } }, dice: { Roll } },
    FormDataClass,
    quietConsole,
  );
}

test("speed penalty macro decrements remaining rounds, deletes expired effects and respects cancellation", async () => {
  const deletions = [];
  const updates = [];
  const actor = {
    items: [
      { id: "expiring", name: "Speed Penalty (1 round) (Penalty 2)" },
      { id: "lasting", name: "Speed Penalty (3 rounds) (Penalty 1)" },
    ],
    async deleteEmbeddedDocuments(type, ids) { deletions.push([type, ids]); },
    async updateEmbeddedDocuments(type, data) { updates.push([type, data]); },
  };
  await runMacro("Tick Down Speed Penalty Round", actor, { async confirm() { return true; } });
  assert.deepEqual(deletions, [["Item", ["expiring"]]]);
  assert.deepEqual(updates, [["Item", [{ _id: "lasting", name: "Speed Penalty (2 rounds) (Penalty 1)" }]]]);
  await runMacro("Tick Down Speed Penalty Round", actor, { async confirm() { return false; } });
  await runMacro("Tick Down Speed Penalty Round", actor, { async confirm() { return null; } });
  assert.equal(deletions.length, 1);
  assert.equal(updates.length, 1);
});

test("round macro shows its confirmation content and awaits cooldown changes only when confirmed", async () => {
  const updates = [];
  const item = {
    name: "Engine Cooldown", type: "consumable", system: { uses: { max: 3, value: 2 } },
    async update(data) { await Promise.resolve(); updates.push(data); },
  };
  await runMacro("Tick Down Round", { items: [item] }, { async confirm(config) {
    assert.ok(config.content.includes("Engine Cooldown"));
    return true;
  } });
  assert.deepEqual(updates, [{ "system.uses.value": 1 }]);
  await runMacro("Tick Down Round", { items: [item] }, { async confirm() { return false; } });
  assert.equal(updates.length, 1);
});

test("speed dice macro awaits namespaced rolls, uses the largest penalty and supports bonus or cancellation", async () => {
  const formulas = [];
  const messages = [];
  class Roll {
    constructor(formula) { formulas.push(formula); }
    async evaluate() { await Promise.resolve(); this.evaluated = true; return this; }
    async toMessage(data) { assert.equal(this.evaluated, true); messages.push(data); }
  }
  const actor = { items: [
    { name: "1d6 Speed" },
    { name: "Speed Penalty (2 rounds) (Penalty 2)" },
    { name: "Speed Penalty (1 round) (Penalty 3)" },
  ] };
  for (const checked of [true, false]) {
    await runMacro("Roll Speed Dice", actor, { async wait(config) {
      assert.equal(config.rejectClose, false);
      return config.buttons.find((button) => button.action === "roll")
        .callback({}, { form: { querySelector() { return { checked }; } } });
    } }, { Roll });
  }
  assert.deepEqual(formulas, ["1d6 - 3 + 2", "1d6 - 3 + 0"]);
  assert.equal(messages.length, 2);
  await runMacro("Roll Speed Dice", actor, { async wait(config) {
    return config.buttons.find((button) => button.action === "cancel").callback();
  } }, { Roll });
  await runMacro("Roll Speed Dice", actor, { async wait() { return null; } }, { Roll });
  assert.equal(formulas.length, 2);
});

test("round reset macro reads the DialogV2 form and resets only selected items", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>");
  t.after(() => dom.window.close());
  const updates = [];
  const actor = { items: ["Engine Cooldown", "Turbo Cooldown"].map((name) => ({
    name, type: "consumable", system: { uses: { max: 3, value: 1 } },
    async update(data) { updates.push({ name, ...data }); },
  })) };
  await runMacro("Set Round Counters", actor, { async wait(config) {
    assert.ok(!config.content.includes("<form"), "DialogV2 already supplies a form");
    const form = dom.window.document.createElement("form");
    form.innerHTML = config.content;
    form.querySelector('input[name="Engine Cooldown"]').checked = true;
    const button = dom.window.document.createElement("button");
    form.append(button);
    await config.buttons[0].callback({}, button);
  } }, { FormDataClass: dom.window.FormData });
  assert.deepEqual(updates, [{ name: "Engine Cooldown", "system.uses.value": 3 }]);
});

test("Sarsaparilla uses V14 dialogs and chat hooks while preserving cancellation, outcomes and card interaction", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const messages = [];
  const hooks = new Map();
  const decisions = [];
  const actor = {
    name: "Archer",
    system: { actions: [{ label: "Bow", totalModifier: 4 }, { label: "Crossbow", totalModifier: 6 }] },
  };
  // Resolve only the non-GSAP fallback animation timers immediately.
  dom.window.setTimeout = (callback) => { queueMicrotask(callback); return 0; };
  const globals = {
    window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element,
    _astillonSarsaparillaState: undefined,
    Dialog: undefined, ChatMessage: undefined, jQuery: undefined, $: undefined, gsap: undefined,
    Hooks: { on(name, callback) { hooks.set(name, callback); return callback; }, off() {} },
    canvas: { tokens: { controlled: [{ actor, document: { id: "token" } }] } },
    game: {
      user: { id: "player", targets: new Set([{ actor: { name: "Enemy", armorClass: { value: 18 } } }]) },
      socket: { on() {}, off() {}, emit() {} },
    },
    ui: { notifications: { warn(message) { assert.fail(message); } } },
    CONFIG: { ChatMessage: { documentClass: {
      getSpeaker({ actor }) { return { alias: actor.name }; },
      async create(message) { messages.push(message); },
    } } },
    foundry: { utils: {}, applications: { api: { DialogV2: { async wait(config) {
      assert.equal(config.rejectClose, false);
      assert.ok(decisions.length, "Unexpected extra dialog");
      const choice = decisions.shift();
      if (choice === null) return null;
      const element = dom.window.document.createElement("div");
      const form = dom.window.document.createElement("form");
      form.innerHTML = config.content;
      element.append(form);
      config.render?.(new dom.window.Event("render"), { element });
      if (choice.action === "draw") {
        const weapon = form.querySelector("#ssp-weapon");
        weapon.value = String(choice.weapon ?? 0);
        weapon.dispatchEvent(new dom.window.Event("change"));
        assert.equal(form.querySelector("#ssp-mod-display").textContent,
          "Attack modifier: " + (weapon.value === "1" ? "+6" : "+4"));
        form.querySelector("#ssp-dieroll").value = String(choice.dieRoll);
      }
      const definition = config.buttons.find((button) => button.action === choice.action);
      const button = dom.window.document.createElement("button");
      form.append(button);
      return definition.callback ? definition.callback(new dom.window.Event("click"), button) : definition.action;
    } } } } },
  };
  const originals = new Map(Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
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
  t.mock.method(Math, "random", () => 0); // Always draw an ace for reproducible hand outcomes.
  const feature = createSarsaparillaFeature("test-module");
  feature.ready();

  for (const choice of [{ action: "cancel" }, null]) {
    decisions.push(choice);
    await feature.api.run();
  }
  assert.equal(messages.length, 0);

  decisions.push({ action: "draw", dieRoll: 1, weapon: 1 }, null);
  await feature.api.run(); // Closing the Hit/Stand window stands with the current hand.
  assert.equal(messages.at(-1).flags.world.sarsaparillaSurprise.naturalTotal, 12);
  assert.equal(messages.at(-1).flags.world.sarsaparillaSurprise.mod, 6);
  assert.equal(messages.at(-1).author, "player");
  assert.deepEqual(messages.at(-1).speaker, { alias: "Archer" });

  decisions.push({ action: "draw", dieRoll: 10 });
  await feature.api.run();
  assert.equal(messages.at(-1).flags.world.sarsaparillaSurprise.result, "blackjack");
  decisions.push({ action: "draw", dieRoll: 3 }, { action: "hit" });
  await feature.api.run();
  assert.equal(messages.at(-1).flags.world.sarsaparillaSurprise.result, "bust");

  const html = dom.window.document.createElement("article");
  html.dataset.documentId = "v14-chat";
  html.innerHTML = messages.at(-1).content;
  const stack = html.querySelector("[data-ssp-card-stack]");
  stack.dataset.index = "1";
  hooks.get("renderChatMessageHTML")(messages.at(-1), html);
  assert.ok(stack.title.includes("Card 2 of 2"), "Hook initializes its HTML before insertion into the chat log");
  dom.window.document.body.append(html);
  stack.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  assert.ok(stack.title.includes("Card 1 of 2"));
  assert.equal(dom.window.document.querySelectorAll('[id$="-overlay"]').length, 0);
  assert.equal(decisions.length, 0);
});
