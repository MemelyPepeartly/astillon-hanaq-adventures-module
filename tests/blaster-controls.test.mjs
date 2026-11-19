import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { blastChoiceContent, bindBlastChoices } from "../dist/scripts/features/blaster-controls.js";

function setup(t, { charge = 1, mode = "fire", finale = false, bind = true } = {}) {
  const dom = new JSDOM(`<!doctype html><body><form>${blastChoiceContent(charge, mode, finale)}</form></body>`);
  t.after(() => dom.window.close());
  const errors = [];
  dom.window.addEventListener("error", event => errors.push(event.error));
  const form = dom.window.document.querySelector("form");
  const root = form.querySelector(".aha-blast-choices");
  const preview = root.querySelector(".aha-blast-choice-preview");
  if (bind) bindBlastChoices(form, finale);
  return {
    dom, form, root, preview, errors,
    select(name, value, event = "change") {
      const select = root.querySelector(`[name="${name}"]`);
      select.value = String(value);
      select.dispatchEvent(new dom.window.Event(event, { bubbles: true }));
    },
  };
}

test("preset charge and mode stay selected with an accessible, matching live summary", t => {
  const env = setup(t, { charge: 2, mode: "slowing" });
  assert.equal(env.root.querySelector('[name="charge"]').value, "2");
  assert.equal(env.root.querySelector('[name="mode"]').value, "slowing");
  assert.deepEqual([...env.root.querySelector('[name="charge"]').options].map(option => option.value), ["1", "2", "3"]);
  assert.deepEqual([...env.root.querySelector('[name="mode"]').options].map(option => option.value), [
    "fire", "cold", "electricity", "sonic", "dazzling", "humiliation", "slowing", "hypnotic",
  ]);
  assert.equal(env.preview.getAttribute("aria-live"), "polite");
  assert.match(env.preview.textContent, /Slowing beam: 11d8 cold/);
  assert.match(env.preview.textContent, /DC 40 basic fortitude/);
  assert.match(env.preview.textContent, /1 square\(s\) wide/);
  env.select("mode", "hypnotic", "input");
  assert.equal(env.root.querySelector(".aha-blast-choice-preview"), env.preview);
  assert.equal(env.preview.getAttribute("aria-live"), "polite");
  assert.match(env.preview.textContent, /Hypno-Beam: 11d8 mental/);
});

for (const event of ["input", "change"]) {
  test(`${event} events update all charge formulas and beam widths`, t => {
    const env = setup(t, { charge: 3 });
    for (const [charge, formula, width] of [[1, "6d8", 1], [2, "14d8", 1], [3, "27d10", 3]]) {
      env.select("charge", charge, event);
      assert.ok(env.preview.textContent.includes(`Fire: ${formula} fire`));
      assert.match(env.preview.textContent, /DC 40 basic reflex/);
      assert.ok(env.preview.textContent.includes(`${width} square(s) wide`));
      assert.match(env.preview.textContent, /Damage only; no condition rider/);
    }
  });
}

test("ordinary damage modes change damage type and retain full dice and Reflex saves", t => {
  const env = setup(t, { charge: 3, mode: "hypnotic" });
  for (const [mode, label] of [["fire", "Fire"], ["cold", "Cold"], ["electricity", "Electricity"], ["sonic", "Sonic"]]) {
    env.select("mode", mode);
    assert.ok(env.preview.textContent.includes(`${label}: 27d10 ${mode}`));
    assert.match(env.preview.textContent, /DC 40 basic reflex/);
    assert.match(env.preview.textContent, /Damage only; no condition rider/);
    assert.doesNotMatch(env.preview.textContent, /controlled|slowed|stupefied|dazzled|Incapacitation/);
  }
});

for (const [charge, formula] of [[1, "3d8"], [2, "11d8"], [3, "24d10"]]) {
  test(`${charge} action conditional modes subtract exactly three dice and use their own saves`, t => {
    const env = setup(t, { charge });
    for (const [mode, label, damage, save, rider] of [
      ["dazzling", "Dazzling light", "fire", "reflex", /Failure or critical failure: dazzled for 1 round/],
      ["humiliation", "Psychic humiliation", "mental", "will", /Failure or critical failure: stupefied 1 for 1 round/],
      ["slowing", "Slowing beam", "cold", "fortitude", /Success: slowed 1/],
      ["hypnotic", "Hypno-Beam", "mental", "will", /Incapacitation/],
    ]) {
      env.select("mode", mode, "input");
      assert.ok(env.preview.textContent.includes(`${label}: ${formula} ${damage}`));
      assert.ok(env.preview.textContent.includes(`DC 40 basic ${save}`));
      assert.match(env.preview.textContent, rider);
      assert.doesNotMatch(env.preview.textContent, /Damage only; no condition rider/);
    }
  });
}

test("slowing preview describes every degree of success and its one-round duration", t => {
  const env = setup(t);
  env.select("mode", "slowing");
  assert.match(env.preview.textContent, /Success: slowed 1\./);
  assert.match(env.preview.textContent, /Failure: slowed 2\./);
  assert.match(env.preview.textContent, /Critical failure: slowed 3\./);
  assert.match(env.preview.textContent, /Lasts 1 round; critical success has no effect\./);
  assert.match(env.preview.textContent, /DC 40 basic fortitude/);
});

test("hypnotic preview distinguishes temporary fascination, temporary control, and permanent control", t => {
  const env = setup(t);
  env.select("mode", "hypnotic", "input");
  assert.match(env.preview.textContent, /Incapacitation\./);
  assert.match(env.preview.textContent, /Success: fascinated for 1 round\./);
  assert.match(env.preview.textContent, /Failure: controlled for 1 round\./);
  assert.match(env.preview.textContent, /Critical failure: permanently controlled until removed\./);
  assert.match(env.preview.textContent, /Critical success has no effect\./);
  assert.match(env.preview.textContent, /Apply after damage; normal fascinated hostility breaks still apply\./);
  assert.match(env.preview.textContent, /DC 40 basic will/);
});

test("Finale uses 36d10 or 33d10, three-square width, and no normal charge control", t => {
  const env = setup(t, { charge: 3, finale: true });
  assert.equal(env.root.querySelector('[name="charge"]'), null);
  assert.match(env.preview.textContent, /Fire: 36d10 fire/);
  assert.match(env.preview.textContent, /DC 40 basic reflex/);
  assert.match(env.preview.textContent, /3 square\(s\) wide/);
  for (const [mode, label, damage, save] of [
    ["dazzling", "Dazzling light", "fire", "reflex"],
    ["humiliation", "Psychic humiliation", "mental", "will"],
    ["slowing", "Slowing beam", "cold", "fortitude"],
    ["hypnotic", "Hypno-Beam", "mental", "will"],
  ]) {
    env.select("mode", mode, "change");
    assert.ok(env.preview.textContent.includes(`${label}: 33d10 ${damage}`));
    assert.ok(env.preview.textContent.includes(`DC 40 basic ${save}`));
    assert.match(env.preview.textContent, /3 square\(s\) wide/);
  }
  env.select("mode", "cold", "input");
  assert.match(env.preview.textContent, /Cold: 36d10 cold/);
  assert.match(env.preview.textContent, /Damage only; no condition rider/);
});

test("normal and Finale instructions describe their actual placement and manual resolution", t => {
  const normal = setup(t);
  const finale = setup(t, { finale: true });
  assert.match(normal.root.textContent, /Click a direction from Blaster for the full 120-foot beam/);
  assert.doesNotMatch(normal.root.textContent, /Click eight points|seven legs|warning fires next round/);
  assert.match(finale.root.textContent, /Click eight points\. Each of seven legs reaches up to 120 feet; the warning fires next round/);
  assert.doesNotMatch(finale.root.textContent, /Click a direction from Blaster/);
  for (const { root } of [normal, finale]) {
    assert.match(root.textContent, /Click the save and damage controls on the generated card/);
    assert.match(root.textContent, /target creatures with the same final save outcome and run Apply Blast Effect/);
    assert.match(root.textContent, /colored map area never applies damage just by touching a token/);
    assert.match(root.textContent, /No automatic movement lock/);
    assert.match(root.textContent, /Action costs, frequency, and recharge remain GM-adjudicated/);
  }
});

test("binding synchronizes current selections and is idempotent for subsequent events", t => {
  const env = setup(t, { bind: false });
  env.root.querySelector('[name="charge"]').value = "3";
  env.root.querySelector('[name="mode"]').value = "hypnotic";
  bindBlastChoices(env.form);
  assert.match(env.preview.textContent, /Hypno-Beam: 24d10 mental/);
  bindBlastChoices(env.form);
  const observer = new env.dom.window.MutationObserver(() => {});
  observer.observe(env.preview, { childList: true });
  t.after(() => observer.disconnect());
  env.select("mode", "sonic", "input");
  assert.match(env.preview.textContent, /Sonic: 27d10 sonic/);
  assert.equal(observer.takeRecords().length, 1, "Repeated binding must not duplicate preview updates");
  env.select("charge", 2, "change");
  assert.match(env.preview.textContent, /Sonic: 14d8 sonic/);
  assert.equal(observer.takeRecords().length, 1, "Change events also retain one update per selection");
});

test("missing roots are harmless", t => {
  const dom = new JSDOM("<!doctype html><body><form></form></body>");
  t.after(() => dom.window.close());
  for (const element of [undefined, null, {}, dom.window.document, dom.window.document.querySelector("form")]) {
    assert.doesNotThrow(() => bindBlastChoices(element));
    assert.doesNotThrow(() => bindBlastChoices(element, true));
  }
});

for (const [name, value] of [["charge", "0"], ["charge", "4"], ["charge", "invalid"], ["mode", "unknown"], ["mode", "__proto__"]]) {
  test(`invalid ${name} ${value} preserves the valid summary and recovers after correction`, t => {
    const env = setup(t, { charge: 2, mode: "cold" });
    const previous = env.preview.innerHTML;
    const select = env.root.querySelector(`[name="${name}"]`);
    select.add(new env.dom.window.Option("Invalid selection", value));
    for (const event of ["input", "change"]) {
      assert.doesNotThrow(() => env.select(name, value, event));
      assert.equal(env.preview.innerHTML, previous);
    }
    env.select(name, name === "charge" ? 3 : "slowing");
    assert.match(env.preview.textContent, name === "charge" ? /Cold: 27d10 cold/ : /Slowing beam: 11d8 cold/);
    assert.deepEqual(env.errors, [], "Invalid UI input must not throw from its event handler");
  });
}
