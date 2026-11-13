import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { PNG } from "pngjs";
import { BLASTER_THRALLS, thrallArtwork, thrallPickerContent } from "../dist/scripts/features/blaster-thralls.js";

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
// Verified against PF2e 8b6df942 (8.7.0): canonical spells, conditions, actions,
// and spell-effects. Use actual IDs: this module does not run PF2e's named-link build step.
const pf2eLinks = new Set([
  "Compendium.pf2e.conditionitems.Item.TkIyaNPgTZFBCCuh",
  "Compendium.pf2e.conditionitems.Item.e1XGnhKNSQIm5IXg",
  "Compendium.pf2e.conditionitems.Item.XgEqL1kFApUbl5Z2", // Blinded
  "Compendium.pf2e.conditionitems.Item.MIRkyAjyBeXivMa7", // Enfeebled
  "Compendium.pf2e.conditionitems.Item.i3OJZU2nk64Df3xm", // Clumsy
  "Compendium.pf2e.conditionitems.Item.xYTAsEpcJE1Ccni3", // Slowed
  "Compendium.pf2e.conditionitems.Item.AdPVz7rbaVSRxHFg", // Fascinated
  "Compendium.pf2e.actionspf2e.Item.2u915NdUyQan6uKF",
  "Compendium.pf2e.actionspf2e.Item.BlAOM2X92SI6HMtJ", // Seek
  "Compendium.pf2e.actionspf2e.Item.AJstokjdG6iDjVjE", // Impersonate
  "Compendium.pf2e.spells-srd.Item.znv4ECL7ZtuiagtA", // Petrify
  "Compendium.pf2e.spells-srd.Item.LiGbewa9pO0yjbsY", // Confusion
  "Compendium.pf2e.spells-srd.Item.8kJbiBEjMWG4VUjs", // Warp Mind
  "Compendium.pf2e.spell-effects.Item.0PO5mFRhh9HxGAtv", // Mirror Image
  "Compendium.pf2e.spell-effects.Item.3Ktyd5F9lOPo4myk", // Illusory Disguise
]);
const spellSpecs = [
  { id: "BlasterSpell0001", name: "Inner Radiance Torrent", source: "eSEmqOBuywoJ6tYd", base: 2, rank: 8, uses: 1,
    publication: { license: "ORC", remaster: true, title: "Pathfinder Impossible Magic" } },
  { id: "BlasterSpell0002", name: "Chromatic Ray", source: "Hb8GdAhP0zBCv3zU", base: 4, rank: 7, uses: 1,
    publication: { license: "OGL", remaster: false, title: "Pathfinder Secrets of Magic" } },
  { id: "BlasterSpell0003", name: "Hypnotize", source: "K2WpC3FFoHrqX9Q5", base: 3, rank: 3, uses: 1,
    publication: { license: "ORC", remaster: true, title: "Pathfinder Player Core" } },
  { id: "BlasterSpell0004", name: "Suggestion", source: "qwlh6aDgi86U3Q7H", base: 4, rank: 9, uses: 1,
    publication: { license: "ORC", remaster: true, title: "Pathfinder Player Core" } },
  { id: "BlasterSpell0005", name: "Mirror Image", source: "j8vIoIEWElvpwkcI", base: 2, rank: 2, uses: 3,
    publication: { license: "OGL", remaster: false, title: "Pathfinder Core Rulebook" } },
  { id: "BlasterSpell0006", name: "Illusory Disguise (At Will)", source: "i35dpZFI7jZcRoBo", base: 1, rank: 3, uses: null,
    publication: { license: "ORC", remaster: true, title: "Pathfinder Player Core" } },
];
const round = { max: 1, per: "round" };
const supportDuration = { value: 1, unit: "rounds", expiry: "turn-start", sustained: false };
const contentItems = [...items, ...actors.flatMap((actor) => actor.items)];

test("expected documents have stable IDs, unique per document collection", () => {
  assert.equal(actors.length, 4);
  assert.equal(items.length, 5);
  assert.equal(macros.length, 11);
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
    const expectedArt = actor === blaster ? "common/portraits/moon/blaster_portrait.png"
      : thrallArtwork(moduleId, actor.flags[moduleId].blasterVariant);
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

test("source items preserve homebrew shapes and native spell source conventions", () => {
  for (const item of contentItems) {
    assert.ok(["action", "effect", "melee", "spell", "spellcastingEntry"].includes(item.type), item.name);
    const nativeSpell = item.type === "spell" || item.type === "spellcastingEntry";
    assert.match(item.img, nativeSpell ? /^(?:icons\/|systems\/pf2e\/icons\/)/ : /^icons\//, item.name);
    assert.equal(typeof item.system.description.value, "string");
    if (nativeSpell) assert.equal(item.system._migration, undefined, "native pack sources omit migration metadata");
    else assert.equal(item.system._migration.version, 0.961);
    if (item.type !== "spellcastingEntry") assert.ok(Array.isArray(item.system.traits.value));
    assert.ok(Array.isArray(item.system.rules));
    assert.equal("label" in item.system, false);
    if (item.type === "action") {
      assert.ok(["action", "reaction", "free", "passive"].includes(item.system.actionType.value));
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
    "BlasterMark00001", "BlasterFire00001", "BlasterWipe00001",
  ].sort());
});

test("Blaster has the selected level-18 defenses and no unrequested immunities", () => {
  assert.equal(blaster.system.details.level.value, 18);
  assert.equal(blaster.system.attributes.ac.value, 41);
  assert.deepEqual(blaster.system.attributes.hp, { value: 600, max: 600, temp: 0, details: "" });
  assert.equal(blaster.system.saves.fortitude.value, 30);
  assert.equal(blaster.system.saves.reflex.value, 33);
  assert.equal(blaster.system.saves.will.value, 27);
  assert.equal(blaster.system.perception.mod, 30);
  assert.deepEqual(blaster.system.attributes.immunities, []);
});

test("Blaster has one native occult innate entry and six linked spells at their selected ranks and uses", () => {
  const entry = embedded("BlasterCasting01");
  assert.deepEqual(blaster.items.filter(item => item.type === "spellcastingEntry"), [entry]);
  assert.equal(entry.name, "Occult Innate Spells");
  assert.equal(entry.system.tradition.value, "occult");
  assert.deepEqual(entry.system.prepared, { flexible: false, value: "innate" });
  assert.deepEqual(entry.system.spelldc, { dc: 40, value: 32 });
  assert.deepEqual(entry.system.autoHeightenLevel, { value: null });
  assert.deepEqual(entry.system.slots, {}, "innate uses belong to spells, not prepared slots");
  assert.equal("level" in entry.system, false, "caster level comes from the level-18 actor");
  assert.deepEqual(blaster.items.filter(item => item.type === "spell").map(item => item._id), spellSpecs.map(spec => spec.id));
  for (const spec of spellSpecs) {
    const spell = embedded(spec.id);
    assert.equal(spell.name, spec.name);
    assert.equal(spell.system.level.value, spec.base, "preserve the canonical base rank for heightening");
    const location = { heightenedLevel: spec.rank, value: entry._id };
    if (spec.uses !== null) location.uses = { value: spec.uses, max: spec.uses };
    assert.deepEqual(spell.system.location, location, spec.name);
    assert.deepEqual(spell._stats, { compendiumSource: `Compendium.pf2e.spells-srd.Item.${spec.source}` });
    assert.deepEqual(spell.system.publication, spec.publication, "retain canonical attribution and license");
    assert.ok(spell.system.traits.traditions.includes("occult"));
    assert.ok(!spell.system.traits.value.includes("cantrip"));
    assert.ok(!spell.system.traits.value.includes("focus"));
    assert.deepEqual(spell.system.rules, []);
    assert.equal("folder" in spell, false, "do not import foreign compendium folders");
  }
  // PF2e's Witchfire Warden uses a name suffix; 8.7.0 has no location.atWill flag.
  assert.equal(embedded("BlasterSpell0006").system.slug, "illusory-disguise");
  assert.match(blaster.system.details.privateNotes, /click its spell icon to post the native spell card without spending a use/);
  assert.match(blaster.system.details.privateNotes, /Cast button still expends an innate use/);
});

test("canonical spell heightening, casting variants, saves, and clickable references remain intact", () => {
  const [torrent, chromatic, hypnotize, suggestion, mirror, disguise] = spellSpecs.map(spec => embedded(spec.id));
  assert.deepEqual(torrent.system.area, { type: "line", value: 60 });
  assert.equal(torrent.system.counteraction, true);
  assert.deepEqual(torrent.system.defense, { save: { basic: true, statistic: "reflex" } });
  assert.deepEqual(torrent.system.damage, { 0: { applyMod: false, category: null, formula: "4d4", kinds: ["damage"], type: "force" } });
  assert.deepEqual(torrent.system.heightening, { area: 0, damage: { 0: "2d4" }, interval: 1, type: "interval" });
  assert.deepEqual(torrent.system.overlays, {
    owbdx5mwkhnfjfe8: { overlayType: "override", sort: 2, system: { area: { value: "120" }, damage: { 0: { category: null } }, time: { value: "3" } } },
    qrxkquqbapot642g: { overlayType: "override", sort: 1, system: { damage: { 0: { category: null } }, time: { value: "2" } } },
    zzgj6vleao856t2k: { name: "Inner Radiance Torrent (2 Rounds)", overlayType: "override", sort: 3,
      system: { area: { value: "120" }, damage: { 0: { category: null, formula: "8d4" } }, heightening: { damage: { 0: "4d4" } }, time: { value: "2 rounds" } } },
  });
  assert.match(description(torrent), /@Damage\[\(max\(2,@item.rank\)-1\)\[force\]\|options:area-damage\]/);
  assert.ok(chromatic.system.traits.value.includes("attack"));
  assert.deepEqual(chromatic.system.defense, { save: { basic: false, statistic: "fortitude" } });
  for (const damage of ["40[fire]", "50[acid]", "60[electricity]", "35[poison]"]) {
    assert.ok(description(chromatic).includes(`@Damage[${damage}]`), "retain heightened ray damage");
  }
  assert.match(description(chromatic), /\[\[\/r 1d8\]\]/);
  for (const spell of [hypnotize, suggestion]) assert.deepEqual(spell.system.defense, { save: { basic: false, statistic: "will" } });
  assert.ok(!hypnotize.system.traits.value.includes("incapacitation"));
  assert.equal(hypnotize.system.heightening, undefined);
  assert.deepEqual(hypnotize.system.duration, { sustained: true, value: "1 minute" });
  assert.ok(suggestion.system.traits.value.includes("incapacitation"));
  assert.deepEqual(suggestion.system.heightening, { levels: { 8: { target: { value: "10 creatures" } } }, type: "fixed" });
  assert.deepEqual(mirror.system.duration, { sustained: false, value: "1 minute" });
  assert.deepEqual(disguise.system.duration, { sustained: false, value: "1 hour" });
  assert.match(description(disguise), /Heightened \(3rd\)/);
  assert.equal(disguise.system.target.value, "1 willing creature");
  const refs = spell => [...description(spell).matchAll(/@UUID\[Compendium\.pf2e\.([^.]+)\.Item\.([^\]]+)\]/g)]
    .map(([, pack, id]) => `${pack}.${id}`);
  assert.deepEqual(refs(torrent), ["conditionitems.XgEqL1kFApUbl5Z2"]);
  assert.deepEqual([...new Set(refs(chromatic))], ["conditionitems.MIRkyAjyBeXivMa7", "spells-srd.znv4ECL7ZtuiagtA",
    "conditionitems.i3OJZU2nk64Df3xm", "conditionitems.xYTAsEpcJE1Ccni3", "spells-srd.LiGbewa9pO0yjbsY",
    "spells-srd.8kJbiBEjMWG4VUjs", "conditionitems.TkIyaNPgTZFBCCuh", "conditionitems.XgEqL1kFApUbl5Z2"]);
  assert.deepEqual(refs(hypnotize), ["conditionitems.TkIyaNPgTZFBCCuh", "actionspf2e.BlAOM2X92SI6HMtJ", "conditionitems.AdPVz7rbaVSRxHFg"]);
  assert.deepEqual(refs(mirror), ["spell-effects.0PO5mFRhh9HxGAtv"]);
  assert.deepEqual(refs(disguise), ["actionspf2e.AJstokjdG6iDjVjE", "spell-effects.3Ktyd5F9lOPo4myk"]);
});

test("operating notes distinguish GM-adjudicated costs from unrestricted macro invocation", () => {
  const notes = blaster.system.details.privateNotes;
  for (const pattern of [/at any time, with or without combat/, /do not enforce turns, once-per-round limits, or recharge/,
    /Adjudicate the listed action costs, frequencies, and recharge/, /still enforce the three-living-thrall cap and their ranges/,
    /Command support ends at the start of Blaster's next turn/, /same round after an off-turn command/,
    /6 world-time seconds without combat/, /until the start of Blaster's next turn, even when fired off-turn/,
    /Import a fresh Blaster from the compendium/, /Refresh Sheet Descriptions does not add them/]) assert.match(notes, pattern);
  assert.doesNotMatch(notes, /Paying extra actions does not allow another command|Release Root does not restore a blast use/);
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

test("all three charged blasts are immediate straight 120-foot lines with unchanged damage and widths", () => {
  for (const [actions, dice, width] of [[1, 4, 1], [2, 9, 1], [3, 18, 3]]) {
    const item = embedded("BlasterBlastAct" + actions);
    assert.equal(item.system.actions.value, actions);
    assert.deepEqual(item.system.frequency, round);
    assert.ok(item.system.traits.value.includes("flourish"));
    const text = description(item);
    for (const pattern of [
      /once per round, shared by all Charged Blast variants/, /straight 120-foot beam from his space/,
      /requires line of effect/,
      /Each creature other than Blaster attempts one save/, /takes damage only once/, /roll damage once/,
      /@Check\[reflex\|dc:40\|basic\|traits:/, /@Check\[will\|dc:40\|basic\|traits:mental\]/,
    ]) assert.match(text, pattern);
    assert.ok(text.includes("120-foot line"));
    assert.doesNotMatch(text, /five points|four connected|80 feet|segments overlap/);
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
  assert.match(operatingNotes(), /does not release the root or change the printed frequency or recharge/);
});

test("Grand Finale is a separate free-action eight-point telegraph which fires next round", () => {
  const item = embedded("BlasterFinaleAct");
  assert.equal(item.name, "Grand Finale");
  assert.equal(item.system.actionType.value, "free");
  assert.equal(item.system.actions.value, null);
  assert.deepEqual(item.system.frequency, round);
  assert.deepEqual(item.system.traits.value, ["concentrate", "magical"]);
  const text = description(item);
  for (const pattern of [/A round begins/, /seven connected line segments/, /up to 120 feet long and 3 squares wide/,
    /marks eight points, beginning in his space/, /visible path deals no damage yet/,
    /At the start of the next round/, /without spending another action/, /path stays fixed even if Blaster moves/,
    /Each creature other than Blaster attempts one save/, /takes damage only once, even where segments overlap/,
    /Roll damage once/, /BlasterMark00001/, /BlasterFire00001/, /BlasterWipe00001/]) assert.match(text, pattern);
  const damageLinks = [...text.matchAll(/@Damage\[(\d+)d6\[([a-z]+)\]/g)];
  assert.deepEqual(damageLinks.map(([, n, type]) => [Number(n), type]), [
    [24, "fire"], [24, "cold"], [24, "electricity"], [24, "sonic"], [22, "fire"], [22, "mental"],
  ]);
  assert.match(description(embedded("BlasterSpectrum1")), /Charged Blast or marks Grand Finale/);
  assert.match(operatingNotes(), /next global round boundary, not on Blaster's turn/);
  assert.match(operatingNotes(), /Outside combat, the path is manual-only/);
  assert.match(operatingNotes(), /Clear Blast Areas handles only immediate charged beams/);
});

test("the three Grand Finale macros call the shipped Blaster API without changing combat", async () => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const calls = [];
  const blasterApi = Object.fromEntries(["markFinale", "fireFinale", "clearFinale"].map(name => [name, async () => calls.push(name)]));
  const game = { astillonHanaqAdventures: { blaster: blasterApi } };
  const ui = { notifications: { warn: () => assert.fail("Expected an available module API") } };
  for (const id of ["BlasterMark00001", "BlasterFire00001", "BlasterWipe00001"]) {
    const macro = macros.find(entry => entry._id === id);
    assert.equal(macro.type, "script");
    await new AsyncFunction("game", "ui", macro.command)(game, ui);
  }
  assert.deepEqual(calls, ["markFinale", "fireFinale", "clearFinale"]);
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
  assert.equal(thrall.name, "Flash Mob Hype Fan");
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

test("three distinct entourage sheets share the unchanged support shell and ship transparent art", async () => {
  const effectIds = ["BlasterInspire01", "BlasterGuard0001", "BlasterTempHP001"];
  for (const [i, variant] of BLASTER_THRALLS.entries()) {
    const actor = actors.find((entry) => entry._id === variant.id);
    assert.ok(actor, variant.name);
    assert.equal(actor.name, `Flash Mob ${variant.name}`);
    assert.equal(actor.flags[moduleId].blasterRole, "hype-thrall");
    assert.equal(actor.flags[moduleId].blasterVariant, variant.key);
    assert.equal(actor.prototypeToken.name, actor.name);
    assert.equal(actor.prototypeToken.texture.src, thrallArtwork(moduleId, variant.key));
    assert.equal(actor.img, actor.prototypeToken.texture.src);
    assert.deepEqual(actor.system.attributes, thrall.system.attributes);
    assert.deepEqual(actor.system.saves, thrall.system.saves);
    assert.deepEqual(actor.system.traits, thrall.system.traits);
    assert.equal(actor.system.details.level.value, 18);
    assert.equal(actor.items.length, 3);
    assert.ok(actor.items.every(item => item.type === "action" && item.system.actionType.value === "passive"));
    assert.deepEqual(actor.items.slice(0, 2), thrall.items.slice(0, 2));
    const routine = actor.items[2];
    assert.match(description(routine), new RegExp(effectIds[i]));
    assert.match(description(routine), /within 60 feet/);
    assert.match(description(routine), /either other Command Flash Mob benefit/);
    assert.match(description(routine), /no extra action or free support/);
    assert.deepEqual(routine.system.rules, []);
    const png = PNG.sync.read(await readFile(new URL(`../src/assets/blaster-thralls/${variant.key}.png`, import.meta.url)));
    assert.equal(png.width, png.height);
    assert.ok(png.width >= 512);
    assert.ok(png.data.some((value, index) => index % 4 === 3 && value === 0), "true alpha transparency");
  }
});

test("entourage picker renders three accessible portrait radios and an explicit random choice", () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "foundry");
  globalThis.foundry = { utils: { escapeHTML: value => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;") } };
  try {
    const dom = JSDOM.fragment(thrallPickerContent(moduleId));
    assert.equal(dom.querySelectorAll('input[type="radio"][name="variant"]').length, 4);
    assert.equal(dom.querySelectorAll('input[checked]').length, 1);
    for (const variant of BLASTER_THRALLS) {
      const control = dom.querySelector(`input[value="${variant.key}"]`);
      const label = control.closest("label");
      assert.equal(label.querySelector("img").getAttribute("src"), thrallArtwork(moduleId, variant.key));
      assert.equal(label.querySelector("strong").textContent, variant.name);
    }
    assert.ok(dom.querySelector('input[value="random"]'));
    assert.match(dom.textContent, /All three can Inspire, Guard, or Bolster/);
  } finally {
    if (prior) Object.defineProperty(globalThis, "foundry", prior);
    else delete globalThis.foundry;
  }
});

test("abilities follow native PF2e header, divider, effect and outcome structure", () => {
  for (const id of ["BlasterBlastAct1", "BlasterBlastAct2", "BlasterBlastAct3", "BlasterFinaleAct", "BlasterFlashAct1", "BlasterCommand01", "BlasterClashAct1"]) {
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
  for (const item of contentItems) {
    const nativeSpell = item.type === "spell" || item.type === "spellcastingEntry";
    assert.equal(item.system.description.gm, nativeSpell ? undefined : "", "PF2e renders item GM notes inline; keep operations in the NPC Notes tab");
  }
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
    BlasterFinaleAct: 235, BlasterFlashAct1: 110, BlasterCommand01: 140, BlasterClashAct1: 210, BlasterRange0001: 35, BlasterMelee0001: 35 };
  const abilities = blaster.items.filter(item => item.type === "action" || item.type === "melee");
  assert.deepEqual(abilities.map(item => item._id).sort(), Object.keys(budgets).sort());
  for (const item of abilities) {
    assert.ok(count(plain(description(item))) <= budgets[item._id], `${item.name} exceeds its word budget`);
    for (const paragraph of JSDOM.fragment(description(item)).querySelectorAll("p")) {
      assert.ok(count(plain(paragraph.outerHTML)) <= 75, `${item.name} has a wall of text`);
    }
  }
});
