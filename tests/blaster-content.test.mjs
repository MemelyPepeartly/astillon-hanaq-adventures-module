import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

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
const round = { max: 1, per: "round" };
const supportDuration = { value: 1, unit: "rounds", expiry: "turn-start", sustained: false };
const contentItems = [...items, ...actors.flatMap((actor) => actor.items)];

test("expected documents have stable IDs, unique per document collection", () => {
  assert.equal(actors.length, 2);
  assert.equal(items.length, 5);
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
    assert.match(actor.img, /^icons\//);
    assert.match(actor.prototypeToken.texture.src, /^icons\//);
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

test("every module compendium link resolves, including all seven macros", () => {
  const sources = new Map();
  for (const [pack, type, documents] of [
    ["astillon-blaster-actors", "Actor", actors],
    ["astillon-blaster-items", "Item", items],
    ["astillon-blaster-macros", "Macro", macros],
  ]) for (const doc of documents) sources.set("Compendium." + moduleId + "." + pack + "." + type + "." + doc._id, doc);
  const linkedMacros = new Set();
  for (const doc of [...actors, ...items]) {
    for (const match of JSON.stringify(doc).matchAll(/@UUID\[([^\]]+)\]/g)) {
      assert.ok(sources.has(match[1]), "unresolved UUID " + match[1]);
      if (match[1].includes(".Macro.")) linkedMacros.add(match[1].split(".").at(-1));
    }
  }
  assert.deepEqual([...linkedMacros].sort(), [
    "BlasterBlast0001", "BlasterFlash0001", "BlasterMobCmd001", "BlasterClash0001",
    "BlasterStop00001", "BlasterClear0001", "BlasterUnroot001",
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
    assert.match(description(strike), /normal multiple-attack penalty/);
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
      /Once per round, shared across all three/, /five clicked waypoints/, /four segments/,
      /first point inside Blaster's occupied square/, /sum of all four segment lengths/,
      /Blaster is excluded/, /takes damage at most once/, /roll damage once/,
      /@Check\[reflex\|dc:40\|basic\]/, /@Check\[will\|dc:40\|basic\]/,
    ]) assert.match(text, pattern);
    assert.ok(text.includes(length + " feet total"));
    assert.ok(text.includes(width + " square"));
    assert.ok(text.includes(dice + "d6 raw, or " + (dice - 2) + "d6"));
  }
});

test("full charge pays its root and full-intervening-round recharge without locking lesser modes", () => {
  const text = description(embedded("BlasterBlastAct3"));
  assert.match(text, /cannot voluntarily move until the start of his next turn/);
  assert.match(text, /forced movement remains possible/);
  assert.match(text, /1d4/);
  assert.match(text, /full intervening rounds/);
  assert.match(text, /round 4 means ready in round 6/);
  assert.match(text, /other modes remain usable/);
  assert.match(text, /without resetting shared use, recharge, or root/);
});

test("Curated Spectrum preserves basic saves and riders only on failed saves", () => {
  const item = embedded("BlasterSpectrum1");
  assert.equal(item.system.actionType.value, "passive");
  const text = description(item);
  assert.match(text, /fire, cold, electricity, or sonic/);
  assert.match(text, /4d6 \/ 9d6 \/ 18d6/);
  assert.match(text, /2d6 \/ 7d6 \/ 16d6/);
  assert.match(text, /DC 40 basic Reflex/);
  assert.match(text, /DC 40 basic Will/);
  assert.match(text, /fails or critically fails is also dazzled for 1 round/);
  assert.match(text, /fails or critically fails is also stupefied 1 for 1 round/);
  assert.match(text, /success or critical success causes no dazzled/);
  assert.match(text, /success or critical success causes no stupefied/);
});

test("Beam Clash is a defensive reaction, without damage or action refunds", () => {
  const item = embedded("BlasterClashAct1");
  assert.equal(item.system.actionType.value, "reaction");
  assert.deepEqual(item.system.frequency, round);
  const text = description(item);
  for (const pattern of [
    /visible foe/, /before that effect resolves/, /Suspend the triggering resolution/,
    /start the clash at 0/, /unmodified d20/, /Ties move it 0/,
    /\+3, red wins/, /-3, blue wins/, /against Blaster only/,
    /All other targets resolve normally/, /deals no extra damage/, /refunds no resources/,
    /cancels without declaring a winner/, /GM adjudication/,
  ]) assert.match(text, pattern);
});

test("Flash Mob and its separate support command each cost one action once per round", () => {
  const flash = embedded("BlasterFlashAct1");
  const command = byId.get("BlasterCommand01");
  assert.deepEqual(embedded("BlasterCommand01"), command);
  for (const item of [flash, command]) {
    assert.equal(item.system.actions.value, 1);
    assert.deepEqual(item.system.frequency, round);
  }
  for (const pattern of [/At most 3 live/, /exactly one/, /within 30 feet/, /lasts 1 minute/, /no free support command/]) {
    assert.match(description(flash), pattern);
  }
  assert.match(description(command), /within 60 feet/);
  assert.match(description(command), /one benefit for Blaster only/);
  assert.match(description(command), /paying extra actions does not allow another command/);
  assert.match(description(flash), /At 0 HP it is destroyed and no longer usable/);
  assert.match(description(flash), /rather than immediately at 0 HP/);
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
    assert.match(description(item), /Apply to Blaster, not the thrall/);
  }
});

test("Bolster grants temporary HP only on creation and does not regenerate", () => {
  const item = byId.get("BlasterTempHP001");
  assert.equal(item.system.slug, "blaster-temp-hp");
  assert.deepEqual(item.system.rules, [{ key: "TempHP", value: 10, events: { onCreate: true, onTurnStart: false } }]);
  assert.match(description(item), /keep the higher amount/);
  assert.match(description(item), /never refreshes automatically/);
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
  assert.match(description(shell), /At 0 HP it is destroyed and no longer usable/);
  assert.doesNotMatch(description(shell), /disappears at 0 HP/);
  assert.deepEqual(shell.system.rules, [
    { key: "AdjustDegreeOfSuccess", selector: "saving-throw", adjustment: { all: "to-failure" } },
  ]);
  for (const pattern of [/no independent turns/, /not a real bard/, /scaling shell/, /no separate XP/, /automatically hit/, /stationary/]) {
    assert.match(description(shell), pattern);
  }
});

test("helper expiration is a separate attack-free one-minute marker with the exact integration slug", () => {
  const item = byId.get("BlasterExpiry001");
  assert.equal(item.system.slug, "effect-thrall-expiration-date");
  assert.deepEqual(item.system.duration, { value: 1, unit: "minutes", expiry: "turn-start", sustained: false });
  assert.deepEqual(item.system.rules, []);
  assert.ok(thrall.items.every((embedded) => embedded._id !== item._id));
  assert.match(description(item), /60 world-time seconds/);
  assert.match(description(item), /do not drag it onto Blaster/);
});
