import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { JSDOM } from "jsdom";

const moduleId = "astillon-hanaq-adventures-module";
const packRoot = new URL("../src/packs/", import.meta.url);
async function readPack(name) {
  const dir = new URL(name + ".db/", packRoot);
  return Promise.all((await readdir(dir)).filter((name) => name.endsWith(".json")).map(async (name) =>
    JSON.parse(await readFile(new URL(encodeURIComponent(name), dir), "utf8"))));
}
const [actors, items, macros] = await Promise.all([
  readPack("astillon-blaster-actors"), readPack("astillon-blaster-items"), readPack("astillon-blaster-macros"),
]);
const blaster = actors.find((actor) => actor._id === "BlasterActor0001");
const thrall = actors.find((actor) => actor._id === "BlasterThrall001");
const byId = new Map(items.map((item) => [item._id, item]));
const embedded = (id) => blaster.items.find((item) => item._id === id);
const description = (item) => item.system.description.value;
const operatingNotes = () => blaster.system.details.privateNotes + thrall.system.details.privateNotes;
const readableDescription = (item) => description(item)
  .replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, "$1")
  .replace(/\[\[[^\]]+\]\]\{([^}]+)\}/g, "$1");
// Verified against PF2e bdea4f90: conditions/dazzled.json, conditions/stupefied.json,
// and actions/skill/demoralize.json. The actual IDs, not translated names, are portable.
const pf2eLinks = new Set([
  "Compendium.pf2e.conditionitems.Item.TkIyaNPgTZFBCCuh",
  "Compendium.pf2e.conditionitems.Item.e1XGnhKNSQIm5IXg",
  "Compendium.pf2e.actionspf2e.Item.2u915NdUyQan6uKF",
]);
const round = { max: 1, per: "round" };
const supportDuration = { value: 1, unit: "rounds", expiry: "turn-start", sustained: false };
const contentItems = [...items, ...actors.flatMap((actor) => actor.items)];

test("expected documents have stable IDs, unique per document collection", () => {
  assert.equal(actors.length, 2);
  assert.equal(items.length, 5);
  assert.equal(macros.length, 8);
  for (const documents of [actors, items, macros, ...actors.map((actor) => actor.items)]) {
    assert.equal(new Set(documents.map((doc) => doc._id)).size, documents.length);
    for (const doc of documents) assert.match(doc._id, /^[A-Za-z0-9]{16}$/, doc.name);
  }
  assert.deepEqual([...byId.keys()].sort(),
    ["BlasterCommand01", "BlasterExpiry001", "BlasterGuard0001", "BlasterInspire01", "BlasterTempHP001"].sort());
  assert.equal(blaster.flags[moduleId].blasterRole, "blaster");
  assert.equal(thrall.flags[moduleId].blasterRole, "hype-thrall");
});

test("NPC sources omit prepared actions, skill labels, foreign ownership, and world state", () => {
  for (const actor of actors) {
    assert.equal(actor.type, "npc");
    assert.equal(actor.system._migration.version, 0.961);
    assert.equal(actor.system._migration.previous, null);
    assert.equal("actions" in actor.system, false);
    assert.deepEqual(Object.keys(actor.flags), [moduleId]);
    assert.equal(actor.prototypeToken.actorLink, false);
    const expectedArt = actor === blaster ? "common/portraits/moon/blaster_portrait.png" : "icons/svg/skull.svg";
    assert.equal(actor.img, expectedArt);
    assert.equal(actor.prototypeToken.texture.src, expectedArt);
    for (const key of ["ownership", "_stats", "_key", "folder"]) assert.equal(key in actor, false, key);
    for (const skill of Object.values(actor.system.skills)) {
      assert.equal(typeof skill.base, "number");
      for (const key of ["label", "mod", "rank", "visible", "breakdown"]) assert.equal(key in skill, false, key);
    }
    for (const ability of Object.values(actor.system.abilities)) assert.deepEqual(Object.keys(ability), ["mod"]);
  }
});

test("all source items use current action, effect, or NPC Strike shapes and core icons", () => {
  for (const item of contentItems) {
    assert.ok(["action", "effect", "melee"].includes(item.type), item.name);
    assert.match(item.img, /^icons\//, item.name);
    assert.equal(typeof item.system.description.value, "string");
    assert.equal(item.system._migration.version, 0.961);
    assert.ok(Array.isArray(item.system.traits.value));
    assert.ok(Array.isArray(item.system.rules));
    assert.equal("label" in item.system, false);
    if (item.type === "action") {
      assert.ok(["action", "reaction", "passive"].includes(item.system.actionType.value));
      assert.ok(item.system.actionType.value === "action"
        ? [1, 2, 3].includes(item.system.actions.value)
        : item.system.actions.value === null);
      assert.equal("level" in item.system, false);
    }
    if (item.type === "effect") {
      assert.equal(item.system.duration.expiry, "turn-start");
      assert.equal(item.system.duration.sustained, false);
      assert.deepEqual(item.system.start, { value: 0, initiative: null });
      assert.equal(item.system.context, null, "runtime supplies origin");
    }
  }
});

test("every module and core compendium link resolves, including the description refresh macro", () => {
  const sources = new Map();
  for (const [pack, type, documents] of [
    ["astillon-blaster-actors", "Actor", actors],
    ["astillon-blaster-items", "Item", items],
    ["astillon-blaster-macros", "Macro", macros],
  ]) for (const doc of documents) sources.set("Compendium." + moduleId + "." + pack + "." + type + "." + doc._id, doc);
  const linkedMacros = new Set();
  for (const doc of [...actors, ...items]) {
    for (const match of JSON.stringify(doc).matchAll(/@UUID\[([^\]]+)\]/g)) {
      assert.ok(sources.has(match[1]) || pf2eLinks.has(match[1]), "unresolved UUID " + match[1]);
      if (match[1].includes(".Macro.")) linkedMacros.add(match[1].split(".").at(-1));
    }
  }
  assert.deepEqual([...linkedMacros].sort(), [
    "BlasterBlast0001", "BlasterFlash0001", "BlasterMobCmd001", "BlasterClash0001",
    "BlasterStop00001", "BlasterClear0001", "BlasterUnroot001", "BlasterText00001",
  ].sort());
});

test("Blaster has the selected level-18 defenses and no unrequested immunities", () => {
  assert.equal(blaster.system.details.level.value, 18);
  assert.equal(blaster.system.attributes.ac.value, 41);
  assert.deepEqual(blaster.system.attributes.hp, { value: 330, max: 330, temp: 0, details: "" });
  assert.equal(blaster.system.saves.fortitude.value, 30);
  assert.equal(blaster.system.saves.reflex.value, 33);
  assert.equal(blaster.system.saves.will.value, 27);
  assert.equal(blaster.system.perception.mod, 30);
  assert.deepEqual(blaster.system.attributes.immunities, []);
});

test("ordinary Strikes are usable attacks with MAP and no blast riders", () => {
  const ranged = embedded("BlasterRange0001");
  const melee = embedded("BlasterMelee0001");
  assert.equal(ranged.name, "Crystal Flechette");
  for (const strike of [ranged, melee]) {
    assert.equal(strike.type, "melee");
    assert.equal(strike.system.action, "strike");
    assert.equal(strike.system.subjectToMAP, true);
    assert.equal(strike.system.area, null);
    assert.deepEqual(strike.system.attackEffects.value, []);
    assert.deepEqual(strike.system.rules, []);
    assert.match(description(strike), /This Strike is not a Charged Blast/);
    assert.doesNotMatch(strike.system.traits.value.join(" "), /flourish|range-increment-/);
  }
  assert.equal(ranged.system.bonus.value, 35);
  assert.deepEqual(ranged.system.range, { increment: 60, max: null });
  assert.deepEqual(ranged.system.damageRolls.main, { damage: "3d10+17", damageType: "piercing", category: null });
  assert.equal(melee.system.bonus.value, 33);
  assert.equal(melee.system.range, null);
  assert.deepEqual(melee.system.damageRolls.main, { damage: "3d8+17", damageType: "bludgeoning", category: null });
});

test("all three blast activities share once-per-round flourish and a single area", () => {
  for (const [actions, dice, length, width] of [[1, 4, 60, 1], [2, 9, 90, 1], [3, 18, 120, 3]]) {
    const item = embedded("BlasterBlastAct" + actions);
    assert.equal(item.system.actions.value, actions);
    assert.deepEqual(item.system.frequency, round);
    assert.ok(item.system.traits.value.includes("flourish"));
    const text = description(item);
    for (const pattern of [
      /once per round, shared by all Charged Blast variants/, /five points/, /four connected segments/,
      /beginning in his space/, /total no more than/, /require line of effect/,
      /Each creature other than Blaster attempts one save/, /takes damage only once/, /roll damage once/,
      /@Check\[reflex\|dc:40\|basic\|traits:/, /@Check\[will\|dc:40\|basic\|traits:mental\]/,
    ]) assert.match(text, pattern);
    assert.ok(text.includes(length + "-foot path"));
    assert.ok(text.includes(width + " square"));
    const damageLinks = [...text.matchAll(/@Damage\[(\d+)d6\[([a-z]+)\]\|traits:([a-z,]+)\|options:area-damage\]/g)];
    assert.deepEqual(damageLinks.map(([, n, damage, traits]) => [Number(n), damage, traits]), [
      [dice, "fire", "fire"], [dice, "cold", "cold"], [dice, "electricity", "electricity"], [dice, "sonic", "sonic"],
      [dice - 2, "fire", "fire,light"], [dice - 2, "mental", "mental"],
    ]);
    assert.match(text, /Choose one spectrum/);
    assert.match(text, /conditions only on a failure or critical failure, until the start of Blaster's next turn/);
    assert.match(text, /@UUID\[Compendium\.pf2e\.conditionitems\.Item\.TkIyaNPgTZFBCCuh\]\{Dazzled\}/);
    assert.match(text, /@UUID\[Compendium\.pf2e\.conditionitems\.Item\.e1XGnhKNSQIm5IXg\]\{Stupefied 1\}/);
  }
});

test("full charge pays its root and full-intervening-round recharge without locking lesser modes", () => {
  const text = description(embedded("BlasterBlastAct3"));
  assert.match(text, /can't voluntarily move until the start of his next turn/);
  assert.match(text, /forced movement is unaffected/);
  assert.match(text, /\[\[\/gmr 1d4 #Standing Ovation recharge\]\]\{1d4\}/);
  assert.match(text, /full intervening rounds/);
  assert.match(operatingNotes(), /A result of 1 in round 4 is ready in round 6/);
  assert.match(text, /one- and two-action blasts remain available/);
  assert.match(operatingNotes(), /without resetting use, recharge, or root/);
});

test("Curated Spectrum preserves basic saves and riders only on failed saves", () => {
  const item = embedded("BlasterSpectrum1");
  assert.equal(item.system.actionType.value, "passive");
  const text = readableDescription(item);
  assert.match(text, /Fire, cold, electricity, or sonic/);
  assert.match(text, /one spectrum for the entire blast at no additional action cost/);
  assert.match(text, /gains the trait of its damage type/);
  assert.equal((text.match(/damage with 2 fewer dice/g) ?? []).length, 2);
  assert.match(text, /@Check\[reflex\|dc:40\|basic/);
  assert.match(text, /@Check\[will\|dc:40\|basic/);
  assert.match(text, /On a failure or critical failure, the target is also Dazzled/);
  assert.match(text, /On a failure or critical failure, the target is also Stupefied 1/);
  assert.match(text, /conditions last until the start of Blaster's next turn, in addition to the basic save's damage/);
});

test("Beam Clash is a defensive reaction, without damage or action refunds", () => {
  const item = embedded("BlasterClashAct1");
  assert.equal(item.system.actionType.value, "reaction");
  assert.deepEqual(item.system.frequency, round);
  const text = readableDescription(item);
  for (const pattern of [
    /visible foe/, /before it resolves/, /Suspend the triggering effect/,
    /start a clash at 0/, /unmodified d20/, /ties leave it unchanged/,
    /\+1 for Blaster, -1 for the foe/, /Blaster Wins \(\+3\)/, /Foe Wins \(-3\)/, /against Blaster only/,
    /Other targets resolve normally/, /deals no damage/, /reflects nothing/,
    /grants or refunds no attacks, movement, actions, reactions, or resources/,
    /dice are not checks/, /modifiers, fortune, misfortune/, /natural 1 or 20 don't apply/,
  ]) assert.match(text, pattern);
  assert.match(description(item), /\[\[\/r 1d20 #Beam Clash manual contest\]\]\{Manual d20 \(no tracker\)\}/);
  assert.match(operatingNotes(), /does not submit to the tracker/);
  assert.match(operatingNotes(), /cancels an active contest without a winner or refunding its cost/);
});

test("Flash Mob and its separate support command each cost one action once per round", () => {
  const flash = embedded("BlasterFlashAct1");
  const command = byId.get("BlasterCommand01");
  assert.deepEqual(embedded("BlasterCommand01"), command);
  for (const item of [flash, command]) {
    assert.equal(item.system.actions.value, 1);
    assert.deepEqual(item.system.frequency, round);
  }
  for (const pattern of [/fewer than 3 living/, /creates one/, /within 30 feet and line of effect/, /lasts 1 minute/, /no free support/]) {
    assert.match(description(flash), pattern);
  }
  assert.match(description(command), /within 60 feet/);
  assert.match(description(command), /Blaster commands one qualifying thrall, gaining one/);
  assert.match(description(command), /until the start of his next turn/);
  assert.match(description(command), /once per round, separate from Flash Mob/);
  assert.match(description(command), /thrall gains no movement or other actions/);
  assert.match(description(command), /Higher existing temporary HP retain their original duration/);
  assert.match(description(flash), /destroyed at 0 HP/);
  assert.match(operatingNotes(), /at expiration, not immediately at 0 HP/);
});

test("support FlatModifiers use correct domains, status stacking, and fear predicate", () => {
  const inspire = byId.get("BlasterInspire01");
  const guard = byId.get("BlasterGuard0001");
  assert.equal(inspire.system.slug, "blaster-inspire");
  assert.equal(guard.system.slug, "blaster-guard");
  assert.deepEqual(inspire.system.rules, [
    { key: "FlatModifier", selector: ["attack-roll", "damage"], type: "status", value: 1 },
    { key: "FlatModifier", selector: ["saving-throw"], predicate: ["fear"], type: "status", value: 1 },
  ]);
  assert.deepEqual(guard.system.rules, [
    { key: "FlatModifier", selector: ["ac"], type: "status", value: 1 },
  ]);
  for (const item of [inspire, guard, byId.get("BlasterTempHP001")]) {
    assert.deepEqual(item.system.duration, supportDuration);
    assert.match(description(item), /Blaster gains/);
  }
});

test("Bolster grants temporary HP only on creation and does not regenerate", () => {
  const item = byId.get("BlasterTempHP001");
  assert.equal(item.system.slug, "blaster-temp-hp");
  assert.deepEqual(item.system.rules, [{ key: "TempHP", value: 10, events: { onCreate: true, onTurnStart: false } }]);
  assert.match(description(item), /existing temporary HP are higher, he keeps them with their original duration/);
  assert.match(description(item), /until used or the start of his next turn, whichever comes first/);
  assert.match(operatingNotes(), /never refreshes automatically/);
});

test("Hype Thrall keeps helper identification and 1-HP shell without independent attacks or turns", () => {
  assert.equal(thrall.name, "Flash Mob Hype Thrall");
  assert.equal(thrall.system.details.level.value, 18);
  assert.equal(thrall.system.attributes.hp.max, 1);
  assert.equal(thrall.system.attributes.hp.value, 1);
  assert.ok(thrall.system.traits.value.includes("thrall"));
  assert.ok(thrall.system.traits.value.includes("minion"));
  assert.ok(thrall.system.traits.value.includes("undead"));
  assert.ok(thrall.items.every((item) => item.type === "action" && item.system.actionType.value === "passive"));
  const shell = thrall.items.find((item) => item._id === "BlasterThrallAct");
  assert.match(description(shell), /destroyed at 0 HP/);
  assert.doesNotMatch(description(shell), /disappears at 0 HP/);
  assert.deepEqual(shell.system.rules, [
    { key: "AdjustDegreeOfSuccess", selector: "saving-throw", adjustment: { all: "to-failure" } },
  ]);
  for (const pattern of [/no independent turns/, /not the usual two minion actions/, /no separate XP/, /automatically hit/, /automatically fails all saving throws/, /stationary/, /can flank but cannot Strike/, /does not use dying rules/]) {
    assert.match(description(shell), pattern);
  }
});

test("helper expiration is a separate attack-free one-minute marker with the exact integration slug", () => {
  const item = byId.get("BlasterExpiry001");
  assert.equal(item.system.slug, "effect-thrall-expiration-date");
  assert.deepEqual(item.system.duration, { value: 1, unit: "minutes", expiry: "turn-start", sustained: false });
  assert.deepEqual(item.system.rules, []);
  assert.ok(thrall.items.every((embedded) => embedded._id !== item._id));
  assert.match(description(item), /Duration<\/strong> 1 minute/);
  assert.match(description(item), /thrall disappears when this effect expires/);
  assert.match(operatingNotes(), /60 world-time seconds/);
  assert.match(operatingNotes(), /do not drag it onto Blaster/);
});

test("abilities follow native PF2e header, divider, effect and outcome structure", () => {
  for (const id of ["BlasterBlastAct1", "BlasterBlastAct2", "BlasterBlastAct3", "BlasterFlashAct1", "BlasterCommand01", "BlasterClashAct1"]) {
    const html = description(embedded(id));
    const dom = JSDOM.fragment(html);
    assert.equal(dom.firstElementChild.querySelector("strong").textContent, "Frequency");
    assert.match(html, /<hr \/>\s*<p><strong>Effect<\/strong>/);
    assert.ok(dom.querySelectorAll("hr").length >= 2, "rules and Foundry controls have clear separators");
    assert.doesNotMatch(html, /Without runtime|runtime displays|The GM applies|placeholder|paying extra actions/i);
  }
  const clash = JSDOM.fragment(description(embedded("BlasterClashAct1")));
  const results = [...clash.querySelectorAll("p > strong")].filter(el => /Wins/.test(el.textContent));
  assert.deepEqual(results.map(el => el.textContent), ["Blaster Wins (+3)", "Foe Wins (-3)"]);
  assert.equal(results[0].parentElement.previousElementSibling.tagName, "HR");
  assert.equal(JSDOM.fragment(description(embedded("BlasterCommand01"))).querySelectorAll("li").length, 3);
  for (const item of contentItems) assert.equal(item.system.description.gm, "", "PF2e renders item GM notes inline; keep operations in the NPC Notes tab");
});

test("combat descriptions have short paragraphs and stay within readable word budgets", () => {
  const plain = html => JSDOM.fragment(html
    .replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, "$1")
    .replace(/@Damage\[(.*?)\[([^\]]+)\][^\]]*\]/g, "$1 $2")
    .replace(/@Check\[([^\]]+)\]/g, (_match, terms) => `DC 40 basic ${terms.split("|")[0]}`)
    .replace(/\[\[.*?\]\]\{([^}]+)\}/g, "$1")
    .replace(/<\/(p|li)>/g, "</$1> ")).textContent.trim();
  const count = text => text.split(/\s+/).filter(Boolean).length;
  const budgets = { BlasterSpectrum1: 150, BlasterBlastAct1: 190, BlasterBlastAct2: 190, BlasterBlastAct3: 235,
    BlasterFlashAct1: 110, BlasterCommand01: 140, BlasterClashAct1: 210, BlasterRange0001: 35, BlasterMelee0001: 35 };
  for (const item of blaster.items) {
    assert.ok(count(plain(description(item))) <= budgets[item._id], `${item.name} exceeds its word budget`);
    for (const paragraph of JSDOM.fragment(description(item)).querySelectorAll("p")) {
      assert.ok(count(plain(paragraph.outerHTML)) <= 75, `${item.name} has a wall of text`);
    }
  }
});
