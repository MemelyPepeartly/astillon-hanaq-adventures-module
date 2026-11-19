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
const macroById = new Map(macros.map((macro) => [macro._id, macro]));
const embedded = (id) => blaster.items.find((item) => item._id === id);
const description = (item) => item.system.description.value;
const operatingNotes = () => blaster.system.details.privateNotes + thrall.system.details.privateNotes;
const readableDescription = (item) => description(item)
  .replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, "$1")
  .replace(/\[\[[^\]]+\]\]\{([^}]+)\}/g, "$1");
const plainText = html => JSDOM.fragment(html.replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, "$1")).textContent.replace(/\s+/g, " ").trim();
const sectionText = (html, heading) => {
  const fragment = JSDOM.fragment(html);
  const header = [...fragment.querySelectorAll("h2,h3")].find(node => heading.test(node.textContent));
  assert.ok(header, `Missing notes section ${heading}`);
  const content = [];
  for (let node = header.nextElementSibling; node && !/^H[23]$/.test(node.tagName); node = node.nextElementSibling) content.push(node.outerHTML);
  return plainText(content.join(" "));
};
const macroCalls = {
  BlasterBlast0001: ["blaster", "blast", []],
  BlasterBlast0002: ["blaster", "blast", [{ charge: 2 }]],
  BlasterBlast0003: ["blaster", "blast", [{ charge: 3 }]],
  BlasterClear0001: ["blaster", "clearBlast", []],
  BlasterUnroot001: ["blaster", "releaseRoot", []],
  BlasterText00001: ["blaster", "refreshDescriptions", []],
  BlasterFlash0001: ["blaster", "flashMob", []],
  BlasterMobCmd001: ["blaster", "commandMob", []],
  BlasterClash0001: ["beamClash", "start", []],
  BlasterStop00001: ["beamClash", "stop", []],
  BlasterMark00001: ["blaster", "markFinale", []],
  BlasterFire00001: ["blaster", "fireFinale", []],
  BlasterWipe00001: ["blaster", "clearFinale", []],
  BlasterBack00001: ["blaster", "blastback", []],
  BlasterBackFire1: ["blaster", "fireBlastback", []],
  BlasterBackClear: ["blaster", "clearBlastback", []],
  BlasterResolve01: ["blaster", "applyBlastEffect", []],
  BlasterUpgrade01: ["blaster", "upgradeSheet", []],
};
// Spell/action references verified against PF2e 8b6df942; condition IDs and native
// GrantItem alterations rechecked against d507983d (8.7.1). This module does not
// run PF2e's named-link build step, so rules and prose must use actual IDs.
const pf2eLinks = new Set([
  "Compendium.pf2e.conditionitems.Item.TkIyaNPgTZFBCCuh",
  "Compendium.pf2e.conditionitems.Item.e1XGnhKNSQIm5IXg",
  "Compendium.pf2e.conditionitems.Item.XgEqL1kFApUbl5Z2", // Blinded
  "Compendium.pf2e.conditionitems.Item.MIRkyAjyBeXivMa7", // Enfeebled
  "Compendium.pf2e.conditionitems.Item.i3OJZU2nk64Df3xm", // Clumsy
  "Compendium.pf2e.conditionitems.Item.xYTAsEpcJE1Ccni3", // Slowed
  "Compendium.pf2e.conditionitems.Item.AdPVz7rbaVSRxHFg", // Fascinated
  "Compendium.pf2e.conditionitems.Item.9qGBRpbX9NEwtAAr", // Controlled
  "Compendium.pf2e.conditionitems.Item.TBSHQspnbcqxsmjL", // Frightened
  "Compendium.pf2e.conditionitems.Item.dfCMdR4wnpbYNTix", // Stunned
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
const auraSpecs = [
  { id: "BlasterAuraIns01", benefit: "BlasterInspire01", key: "inspire", slug: "blaster-aura-inspire", color: "#66E56A", removeOnExit: true },
  { id: "BlasterAuraGrd01", benefit: "BlasterGuard0001", key: "guard", slug: "blaster-aura-guard", color: "#9B6CFF", removeOnExit: true },
  { id: "BlasterAuraBol01", benefit: "BlasterTempHP001", key: "tempHP", slug: "blaster-aura-bolster", color: "#F35BCB", removeOnExit: false },
];
const blastConditionEffectIds = [
  "BlasterSlow00001",
  "BlasterSlow00002",
  "BlasterSlow00003",
  "BlasterFascin001",
  "BlasterControl01",
  "BlasterControl02",
  "BlasterDazzle001",
  "BlasterStupor001",
];
const contentItems = [...items, ...actors.flatMap((actor) => actor.items)];

test("expected documents have stable IDs, unique per document collection", () => {
  assert.equal(actors.length, 4);
  assert.deepEqual(items.map(item => item._id).sort(), ["BlasterCommand01", "BlasterExpiry001",
    ...auraSpecs.flatMap(spec => [spec.id, spec.benefit]), ...blastConditionEffectIds].sort());
  assert.equal(macros.length, 18);
  assert.deepEqual(macros.map(macro => macro._id).sort(), Object.keys(macroCalls).sort());
  for (const documents of [actors, items, macros, ...actors.map((actor) => actor.items)]) {
    assert.equal(new Set(documents.map((doc) => doc._id)).size, documents.length);
    for (const doc of documents) assert.match(doc._id, /^[A-Za-z0-9]{16}$/, doc.name);
  }
  for (const id of ["BlasterCommand01", "BlasterExpiry001", ...auraSpecs.map(spec => spec.id), ...blastConditionEffectIds]) {
    assert.ok(byId.has(id), `missing item ${id}`);
  }
  for (const id of [
    "BlasterBlast0002", "BlasterBlast0003", "BlasterResolve01", "BlasterUpgrade01",
    "BlasterBack00001", "BlasterBackFire1", "BlasterBackClear",
  ]) assert.ok(macroById.has(id), `missing macro ${id}`);
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
    assert.match(item.img, /^(?:icons\/|systems\/pf2e\/icons\/)/, item.name);
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
      assert.equal(item.system.duration.expiry, item.system.duration.unit === "unlimited" ? null : "turn-start");
      assert.equal(item.system.duration.sustained, false);
      assert.deepEqual(item.system.start, { value: 0, initiative: null });
      assert.equal(item.system.context, null, "runtime supplies origin");
    }
  }
});

test("blast rider effects grant real native condition UUIDs and preserve finite or unlimited duration", () => {
  for (const [id, conditionId, value] of [
    ["BlasterDazzle001", "TkIyaNPgTZFBCCuh"],
    ["BlasterStupor001", "e1XGnhKNSQIm5IXg"],
    ["BlasterSlow00001", "xYTAsEpcJE1Ccni3"],
    ["BlasterSlow00002", "xYTAsEpcJE1Ccni3", 2],
    ["BlasterSlow00003", "xYTAsEpcJE1Ccni3", 3],
    ["BlasterFascin001", "AdPVz7rbaVSRxHFg"],
    ["BlasterControl01", "9qGBRpbX9NEwtAAr"],
    ["BlasterControl02", "9qGBRpbX9NEwtAAr"],
  ]) {
    const item = byId.get(id);
    assert.equal(item.type, "effect");
    assert.deepEqual(item.system.duration, id === "BlasterControl02"
      ? { value: -1, unit: "unlimited", expiry: null, sustained: false }
      : { value: 1, unit: "rounds", expiry: "turn-start", sustained: false });
    const rule = { key: "GrantItem", inMemoryOnly: true,
      uuid: `Compendium.pf2e.conditionitems.Item.${conditionId}` };
    if (value) rule.alterations = [{ mode: "override", property: "badge-value", value }];
    assert.deepEqual(item.system.rules, [rule], item.name);
    assert.equal(item.system.context, null);
    assert.deepEqual(item.system.start, { value: 0, initiative: null });
    assert.equal("ownership" in item, false, "Control effects never transfer document permissions");
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
  for (const item of contentItems) for (const rule of item.system.rules) {
    if (rule.key === "GrantItem") assert.ok(sources.has(rule.uuid) || pf2eLinks.has(rule.uuid), `unresolved GrantItem UUID ${rule.uuid}`);
  }
  for (const id of Object.keys(macroCalls)) assert.ok(linkedMacros.has(id), "missing linked macro " + id);
});

test("Blaster has the selected level-18 defenses and no unrequested immunities", () => {
  assert.equal(blaster.system.details.level.value, 18);
  assert.equal(blaster.system.attributes.ac.value, 41);
  assert.deepEqual(blaster.system.attributes.hp, { value: 700, max: 700, temp: 0, details: "" });
  assert.equal(blaster.system.saves.fortitude.value, 30);
  assert.equal(blaster.system.saves.reflex.value, 33);
  assert.equal(blaster.system.saves.will.value, 27);
  assert.equal(blaster.system.perception.mod, 30);
  assert.deepEqual(blaster.system.attributes.immunities, []);
  assert.deepEqual(blaster.system.traits.value, ["dream"]);
});

test("Dreamshell uses native all-damage resistance at exact current-HP fractions", () => {
  const shell = embedded("BlasterShell0001");
  assert.equal(shell.system.actionType.value, "passive");
  assert.equal(shell.system.slug, "blaster-dreamshell");
  assert.equal(shell.system.rules.length, 1);
  const [rule] = shell.system.rules;
  assert.equal(rule.key, "Resistance");
  assert.deepEqual(rule.type, ["all-damage"]);
  // PF2e resolves these @actor paths before Roll.safeEval; use the documented
  // ternary/lte operators here to test this source formula at its exact boundaries.
  // Do not predicate on hp-percent: PF2e floors it and would activate early at 526 HP.
  const formula = rule.value.replaceAll("@actor.system.attributes.hp.value", "hp")
    .replaceAll("@actor.system.attributes.hp.max", "max");
  const evaluate = new Function("hp", "max", "ternary", "lte", `return (${formula});`);
  const resistance = (hp, max = 700) => evaluate(hp, max, (condition, yes, no) => condition ? yes : no, (a, b) => a <= b);
  for (const [hp, expected] of [[700, 0], [526, 0], [525, 10], [351, 10], [350, 15], [176, 15], [175, 20], [0, 20], [700, 0]]) {
    assert.equal(resistance(hp), expected, `HP ${hp}`);
  }
  for (const [hp, expected] of [[601, 0], [600, 10], [401, 10], [400, 15], [201, 15], [200, 20]]) {
    assert.equal(resistance(hp, 800), expected, `changed max: ${hp}/800`);
  }
  assert.match(description(shell), /Healing above a threshold lowers/);
  assert.doesNotMatch(rule.value, /hp-percent|hp.temp/);
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
  for (const pattern of [/with or without combat|in or out of combat/i, /action costs/i, /recharge/i,
    /No macro writes or enforces a movement lock/i, /BlasterUpgrade01/, /BlasterText00001/]) assert.match(notes, pattern);
  assert.doesNotMatch(notes, /prevents voluntary movement|Release Root clears only this movement restriction|Multiple copies and other status bonuses to the same statistic do not stack/);
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

test("all three charged blasts are immediate straight 120-foot lines with stronger dice and spectrum rider references", () => {
  for (const [actions, dice, width, faces] of [[1, 6, 1, 8], [2, 14, 1, 8], [3, 27, 3, 10]]) {
    const item = embedded("BlasterBlastAct" + actions);
    assert.equal(item.system.actions.value, actions);
    assert.deepEqual(item.system.frequency, round);
    assert.ok(item.system.traits.value.includes("flourish"));
    const text = description(item);
    for (const pattern of [
      /once per round, shared by all Charged Blast variants/, /straight 120-foot beam from his space/,
      /line of effect/,
      /Each creature other than Blaster attempts one save/, /roll damage once/,
      /@Check\[reflex\|dc:40\|basic\|traits:/,
    ]) assert.match(text, pattern);
    assert.ok(text.includes("120-foot line"));
    assert.doesNotMatch(text, /five points|four connected|80 feet|segments overlap/);
    assert.ok(text.includes(width + " square"));
    const damageLinks = [...text.matchAll(new RegExp(`@Damage\\[(\\d+)d${faces}\\[([a-z]+)\\]\\|traits:([a-z,]+)\\|options:area-damage\\]`, "g"))];
    assert.deepEqual(damageLinks.map(([, n, damage, traits]) => [Number(n), damage, traits]), [
      [dice, "fire", "magical,fire"], [dice, "cold", "magical,cold"], [dice, "electricity", "magical,electricity"], [dice, "sonic", "magical,sonic"],
      [dice - 3, "fire", "magical,fire,light"], [dice - 3, "mental", "magical,mental"], [dice - 3, "cold", "magical,cold"], [dice - 3, "mental", "magical,mental,visual,incapacitation"],
    ]);
    const saves = [...text.matchAll(/@Check\[([a-z]+)\|dc:40\|basic\|traits:([a-z,]+)\]/g)].map(([, save, traits]) => [save, traits]);
    assert.deepEqual(saves, [
      ["reflex", "magical,fire"], ["reflex", "magical,cold"], ["reflex", "magical,electricity"], ["reflex", "magical,sonic"],
      ["reflex", "magical,fire,light"], ["will", "magical,mental"], ["fortitude", "magical,cold"], ["will", "magical,mental,visual,incapacitation"],
    ]);
    assert.match(text, /riders as listed in Curated Spectrum/);
    assert.match(text, /BlasterResolve01/);
  }
});

test("full charge leaves movement manual and retains full-intervening-round recharge references", () => {
  const html = description(embedded("BlasterBlastAct3"));
  const text = plainText(html);
  assert.match(text, /movement.*GM.adjudicat|GM.adjudicat.*movement/i);
  assert.match(text, /macro (?:never|does not) locks? movement|no automatic movement lock/i);
  assert.match(html, /\[\[\/gmr\s+1d4(?:\s[^\]]*)?\]\]/, "Recharge remains a clickable GM 1d4 roll");
  assert.match(text, /full intervening rounds/i);
  assert.match(text, /(?:one-|1-).*?(?:two-|2-)action blasts.*available/i);
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
  const damageLinks = [...text.matchAll(/@Damage\[(\d+)d10\[([a-z]+)\]\|traits:([a-z,]+)\|options:area-damage\]/g)];
  assert.deepEqual(damageLinks.map(([, n, type, traits]) => [Number(n), type, traits]), [
    [36, "fire", "magical,fire"], [36, "cold", "magical,cold"], [36, "electricity", "magical,electricity"], [36, "sonic", "magical,sonic"],
    [33, "fire", "magical,fire,light"], [33, "mental", "magical,mental"], [33, "cold", "magical,cold"], [33, "mental", "magical,mental,visual,incapacitation"],
  ]);
  const saves = [...text.matchAll(/@Check\[([a-z]+)\|dc:40\|basic\|traits:([a-z,]+)\]/g)].map(([, save, traits]) => [save, traits]);
  assert.deepEqual(saves, [
    ["reflex", "magical,fire"], ["reflex", "magical,cold"], ["reflex", "magical,electricity"], ["reflex", "magical,sonic"],
    ["reflex", "magical,fire,light"], ["will", "magical,mental"], ["fortitude", "magical,cold"], ["will", "magical,mental,visual,incapacitation"],
  ]);
  for (const ability of ["Charged Blast", "Grand Finale", "Beam Clash counter-hit"]) assert.ok(description(embedded("BlasterSpectrum1")).includes(ability));
  assert.match(operatingNotes(), /next global round boundary, not on Blaster's turn/);
  assert.match(operatingNotes(), /Outside combat, the path is manual-only/);
  assert.match(operatingNotes(), /BlasterClear0001\]\{Clear Blast Areas\} handles only immediate charged beams/);
});

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
for (const [id, [namespace, method, expectedArgs]] of Object.entries(macroCalls)) {
  test(`${id} awaits exactly ${namespace}.${method} with its intended arguments`, async () => {
    const macro = macroById.get(id);
    assert.equal(macro.type, "script");
    const calls = [];
    let finishCall, finished = false;
    const feature = { [method](...args) {
      assert.equal(this, feature);
      calls.push(args);
      return new Promise(resolve => { finishCall = resolve; });
    } };
    const game = Object.freeze({ astillonHanaqAdventures: Object.freeze({ [namespace]: Object.freeze(feature) }) });
    const ui = { notifications: { warn: () => assert.fail("Expected an available module API") } };
    const pending = new AsyncFunction("game", "ui", macro.command)(game, ui).then(result => { finished = true; return result; });
    await Promise.resolve();
    assert.deepEqual(calls, [expectedArgs]);
    assert.equal(finished, false, "The macro must await the feature call");
    finishCall("feature result");
    assert.equal(await pending, undefined);
    assert.equal(finished, true);
  });
}

test("all 18 macros warn and return safely when the module, feature, or API method is unavailable", async () => {
  for (const [id, [namespace]] of Object.entries(macroCalls)) {
    const execute = new AsyncFunction("game", "ui", macroById.get(id).command);
    for (const game of [{}, { astillonHanaqAdventures: {} }, { astillonHanaqAdventures: { [namespace]: {} } }]) {
      const warnings = [];
      assert.equal(await execute(game, { notifications: { warn: message => warnings.push(message) } }), undefined);
      assert.equal(warnings.length, 1, id);
      assert.match(warnings[0], /Astillon Hanaq Adventures/);
    }
  }
});

test("Blastback banks applied damage into a flat self-excluding force burst", () => {
  const item = embedded("BlasterBackAct01");
  const html = description(item), text = plainText(html);
  assert.equal(item.system.actionType.value, "action");
  assert.equal(item.system.actions.value, 1);
  assert.equal(item.system.frequency, undefined);
  assert.deepEqual(item.system.rules, []);
  assert.deepEqual(item.system.traits.value, ["concentrate", "magical", "force"]);
  assert.match(text, /100-foot radius/i);
  assert.match(text, /centered on Blaster at release/i);
  assert.match(text, /post-resistance damage|damage after resistances?/i);
  assert.match(text, /including.*temporary HP/i);
  assert.match(text, /force damage equal to the bank/i);
  assert.match(text, /Blaster is excluded/i);
  assert.match(text, /flat damage/i);
  assert.match(text, /not.*(?:extra dice|multiplied)|no.*(?:extra dice|multiplier)/i);
  assert.doesNotMatch(text, /1[.,]5\s*[x×]|150\s*%/);
  assert.doesNotMatch(html, /@Damage\[[^\]]*\d+d\d+/);
  assert.ok(html.includes("@Check[reflex|dc:40|basic|immutable|traits:magical,force]"));
  assert.match(text, /start of his next turn/i);
  assert.match(text, /Outside combat.*6 world-time seconds/i);
  for (const id of ["BlasterBack00001", "BlasterBackFire1", "BlasterBackClear"]) {
    assert.ok(html.includes(`@UUID[Compendium.${moduleId}.astillon-blaster-macros.Macro.${id}]`));
  }
  assert.match(text, /GM can adjust.*bank.*fire at any time/i);
});

test("Curated Spectrum defines all rider outcomes once, after damage and incapacitation adjustment", () => {
  const item = embedded("BlasterSpectrum1");
  assert.equal(item.system.actionType.value, "passive");
  const text = readableDescription(item);
  for (const ability of ["Charged Blast", "Grand Finale", "Beam Clash counter-hit"]) assert.ok(text.includes(ability));
  assert.match(text, /Fire, cold, electricity, or sonic/);
  assert.match(text, /Rider modes roll 3 fewer damage dice/);
  const modes = JSDOM.fragment(description(item)).querySelectorAll("li");
  assert.equal(modes.length, 5);
  for (const [index, save] of [[0, "Reflex"], [1, "Reflex"], [2, "Will"], [3, "Fortitude"], [4, "Will"]]) {
    assert.ok(modes[index].textContent.includes(`DC 40 basic ${save}`));
  }
  assert.match(modes[4].textContent, /Mental, visual, incapacitation/);
  assert.match(modes[4].textContent, /higher-level creature improves its save outcome by one degree/);
  assert.match(text, /Apply riders after damage, using the final save outcome/);
  assert.match(text, /final outcome, after incapacitation/);
  for (const id of blastConditionEffectIds) {
    const link = `@UUID[Compendium.${moduleId}.astillon-blaster-items.Item.${id}]`;
    assert.equal(description(item).split(link).length - 1, 1, `Exactly one clickable rider reference for ${id}`);
  }
  assert.match(text, /Fascinated ends normally if broken by hostility/);
  assert.match(text, /Critical success has no rider/);
  assert.match(text, /Control cannot compel obviously self-destructive orders/);
  assert.doesNotMatch(text, /Blastback/);
});

test("Beam Clash is a defensive reaction with automatic severe-loss outcomes", () => {
  const item = embedded("BlasterClashAct1");
  assert.equal(item.system.actionType.value, "reaction");
  assert.deepEqual(item.system.frequency, round);
  const text = readableDescription(item);
  for (const pattern of [
    /visible foe/, /before it resolves/, /Suspend the triggering effect/,
    /start a clash at 0/, /unmodified d20/, /ties leave it unchanged/,
    /\+1 for Blaster, -1 for the foe/, /Blaster Wins \(\+3\)/, /Foe Wins \(-3\)/, /against Blaster only/,
    /Other targets resolve normally/,
    /no additional attack roll or saving throw/,
    /Use rider failure outcomes/,
    /automatically resolves against Blaster as a critical hit or as a critically failed save/,
    /grants no additional actions or reactions/,
    /dice are not checks/, /modifiers, fortune, misfortune/, /natural 1\/20 special results do not apply/,
  ]) assert.match(text, pattern);
  assert.match(description(item), /\[\[\/r 1d20 #Beam Clash manual contest\]\]\{Manual d20 \(no tracker\)\}/);
  assert.match(operatingNotes(), /does not submit to the tracker/);
  assert.match(operatingNotes(), /cancels an active contest without a winner or refunding its cost/);
});

test("Flash Mob summons one support thrall, and Command changes one thrall mode for its lifetime", () => {
  const flash = embedded("BlasterFlashAct1");
  const command = byId.get("BlasterCommand01");
  const flashText = plainText(description(flash)), commandText = plainText(description(command));
  assert.deepEqual(embedded("BlasterCommand01"), command);
  assert.equal(command.system.frequency, undefined, "Command does not add a native frequency gate");
  assert.equal(flash.system.actions.value, 1);
  assert.deepEqual(flash.system.frequency, round);
  for (const pattern of [/one support thrall/i, /within 30 feet/i, /line of effect/i, /1.minute lifetime|lasts 1 minute/i, /signature aura.*active/i]) {
    assert.match(flashText, pattern);
  }
  const entries = [...JSDOM.fragment(description(flash)).querySelectorAll("li")];
  for (const variant of BLASTER_THRALLS) {
    const entry = entries.find(node => node.innerHTML.includes(`.Actor.${variant.id}]`));
    assert.ok(entry, `Missing Flash Mob choice ${variant.id}`);
    assert.ok(entry.textContent.includes(variant.routine), `${variant.name} starts with ${variant.routine}`);
  }
  for (const pattern of [/within 60 feet/i, /one chosen thrall/i, /remaining lifetime/i,
    /Other thralls keep.*modes/i, /no frequency or combat requirement/i, /no movement or other actions/i,
    /Higher.*temporary HP.*source and duration/i, /Already.granted HP remain.*mode/i,
    /distinct thralls stack/i, /destruction, removal, or expiration/i]) assert.match(commandText, pattern);
  for (const spec of auraSpecs) assert.match(description(command), new RegExp(spec.id));
  assert.match(flashText, /1 HP/);
  assert.match(flashText, /no living.thrall cap|no.*thrall limit|any number of.*thralls/i);
  assert.doesNotMatch(description(flash), /no free support|fewer than 3|maximum of 3|maximum of three/i);
});

test("portable native auras affect only the summoning Blaster within 60 feet", () => {
  for (const spec of auraSpecs) {
    const item = byId.get(spec.id);
    assert.equal(item.type, "effect");
    assert.deepEqual(item.flags, { [moduleId]: { blasterAura: spec.key } });
    assert.equal(item.system.slug, spec.slug);
    assert.deepEqual(item.system.duration, { value: -1, unit: "unlimited", expiry: null, sustained: false });
    assert.deepEqual(item.system.start, { value: 0, initiative: null });
    assert.equal(item.system.context, null, "runtime supplies owner and activation timing");
    assert.deepEqual(item.system.traits, { value: [], otherTags: [] }, "no new mental-immunity interaction");
    assert.equal(item.system.rules.length, 1);
    const [aura] = item.system.rules;
    assert.equal(aura.key, "Aura");
    assert.equal(aura.slug, spec.slug);
    assert.equal(aura.radius, 60);
    assert.deepEqual(aura.predicate, ["self:trait:thrall"]);
    assert.deepEqual(aura.traits, []);
    assert.deepEqual(aura.effects, [{
      uuid: `{actor|uuid}.Item.${spec.benefit}`,
      affects: "all", // Match owner signature even when token dispositions differ.
      includesSelf: false,
      events: ["enter"],
      predicate: ["target:signature:{actor|flags.pf2e-summons-assistant.summoner.signature}"],
      removeOnExit: spec.removeOnExit,
    }]);
    assert.equal(byId.get(spec.benefit).type, "effect");
    assert.deepEqual(aura.appearance, {
      border: { color: spec.color, alpha: 0.75 }, highlight: { color: spec.color, alpha: 0.1 },
    });
    for (const key of ["ownership", "_stats", "_key", "folder"]) assert.equal(key in item, false, key);
    assert.match(description(item), /only to its summoning Blaster/);
    assert.match(description(item), /No other creature benefits/);
    assert.match(description(item), /aura and its (?:linked )?benefits end if the thrall is destroyed,? (?:or )?removed/);
  }
  assert.equal(new Set(auraSpecs.map(spec => byId.get(spec.id).system.rules[0].appearance.border.color)).size, 3);
  for (const actor of actors.filter(actor => actor._id.startsWith("BlasterThrall"))) {
    assert.equal(actor.items.filter(item => item.system.rules.some(rule => rule.key === "Aura")).length, 1, "each thrall embeds one default aura");
    for (const id of ["BlasterInspire01", "BlasterGuard0001", "BlasterTempHP001"]) {
      assert.ok(actor.items.some(item => item._id === id), `${actor.name} has receiver template ${id}`);
    }
  }
});

test("aura operating notes explain default support, lifetime modes, inert templates, and no-refill pool", () => {
  for (const actor of actors) {
    const notes = sectionText(actor.system.details.privateNotes, /Flash Mob Auras|Native Support Auras/);
    for (const pattern of [/signature aura|starts with.*Aura/, /60-foot/, /summoner signature/,
      /remaining lifetime/, /receiver templates/i, /distinct thralls stack/,
      /never refill|never refills/, /mode changes|Changing (?:the|a) thrall's mode/,
      /unrelated temporary HP|unrelated pools/]) assert.match(notes, pattern, actor.name);
    if (actor !== blaster) {
      assert.match(notes, /ignored/);
      assert.match(notes, /unmatched signature/);
    } else assert.match(notes, /receiver templates.*inert/i);
    assert.doesNotMatch(notes, /none has an active aura|turn-start expiry|6 world-time seconds without combat|grants no free support/);
  }
  assert.doesNotMatch(blaster.system.details.privateNotes, /apply exactly one linked effect to Blaster|Remove the old effect before reapplying/);
});

test("support FlatModifiers use inert receiver signatures, untyped stacking, and correct domains", () => {
  const inspire = byId.get("BlasterInspire01");
  const guard = byId.get("BlasterGuard0001");
  assert.equal(inspire.system.slug, "blaster-inspire");
  assert.equal(guard.system.slug, "blaster-guard");
  assert.deepEqual(inspire.system.rules, [
    { key: "FlatModifier", selector: ["attack-roll", "damage"], type: "untyped", value: 1,
      slug: "blaster-inspire-attack-damage", predicate: ["self:signature:{item|flags.astillon-hanaq-adventures-module.blasterReceiverSignature}"], ignored: true },
    { key: "FlatModifier", selector: ["saving-throw"], predicate: ["self:signature:{item|flags.astillon-hanaq-adventures-module.blasterReceiverSignature}", "fear"], type: "untyped", value: 1,
      slug: "blaster-inspire-fear", ignored: true },
  ]);
  assert.deepEqual(guard.system.rules, [{ key: "FlatModifier", selector: ["ac"], type: "untyped", value: 1,
    slug: "blaster-guard-ac", predicate: ["self:signature:{item|flags.astillon-hanaq-adventures-module.blasterReceiverSignature}"], ignored: true }]);
  for (const item of [inspire, guard, byId.get("BlasterTempHP001")]) {
    assert.deepEqual(item.system.duration, { value: -1, unit: "unlimited", expiry: null, sustained: false });
    assert.match(description(item), /summoning Blaster/i);
    assert.equal(item.flags[moduleId].blasterReceiverSignature, "unassigned-flash-mob-receiver");
  }
  for (const item of [inspire, guard]) {
    assert.match(description(item), /while inside this thrall's 60-foot aura/);
    assert.match(description(item), /distinct thralls stack/);
  }
});

test("Bolster uses helper pool wording and never auto-regenerates", () => {
  const item = byId.get("BlasterTempHP001");
  const aura = byId.get("BlasterAuraBol01");
  const text = plainText(description(item));
  assert.equal(item.system.slug, "blaster-temp-hp");
  assert.deepEqual(item.system.rules, []);
  for (const pattern of [/10 temporary HP/i, /summoning Blaster/i, /once.*lifetime/i,
    /distinct thralls.*add together/i, /mode.*retains|retains.*mode/i,
    /does not add.*unrelated/i, /removes only.*unspent/i,
    /re.entry/i, /never refill spent HP/i]) assert.match(text, pattern);
  assert.match(description(aura), /unless its mode changes/);
  assert.ok(!aura.system.rules.some(rule => rule.key === "TempHP"));
});

test("Hype Thrall keeps helper identification and 1-HP shell without independent attacks or turns", () => {
  assert.equal(thrall.name, "Flash Mob Hype Fan");
  assert.equal(thrall.system.details.level.value, 18);
  assert.equal(thrall.system.attributes.hp.max, 1);
  assert.equal(thrall.system.attributes.hp.value, 1);
  assert.ok(thrall.system.traits.value.includes("thrall"));
  assert.ok(thrall.system.traits.value.includes("minion"));
  assert.ok(thrall.system.traits.value.includes("undead"));
  const actions = thrall.items.filter(item => item.type === "action");
  assert.equal(actions.length, 3);
  assert.ok(actions.every(item => item.system.actionType.value === "passive"));
  assert.ok(thrall.items.every(item => ["action", "effect"].includes(item.type)));
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
  for (const variant of BLASTER_THRALLS) {
    const defaultAura = auraSpecs.find(spec => spec.key === variant.support);
    assert.ok(defaultAura, `${variant.name} has a known default support mode`);
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
    assert.equal(actor.items.length, 7);
    const actions = actor.items.filter(item => item.type === "action");
    assert.equal(actions.length, 3);
    assert.ok(actions.every(item => item.system.actionType.value === "passive"));
    for (const id of ["BlasterThrallAct", "BlasterStagehand"]) {
      assert.deepEqual(actor.items.find(item => item._id === id), thrall.items.find(item => item._id === id));
    }
    const routine = actions.find(item => !["BlasterThrallAct", "BlasterStagehand"].includes(item._id));
    assert.match(description(routine), new RegExp(defaultAura.id));
    assert.match(description(routine), /a 60-foot aura granting only its summoning Blaster/);
    assert.match(description(routine), /begins with.*active/);
    assert.match(description(routine), /remaining lifetime/);
    assert.match(description(routine), /destruction, removal, or expiration/);
    assert.match(description(routine), /no movement or other actions/);
    assert.doesNotMatch(description(routine), /Select Blaster|drag|Runtime|Foundry/);
    assert.deepEqual(routine.system.rules, []);
    for (const spec of auraSpecs) {
      const receiver = actor.items.find(item => item._id === spec.benefit);
      assert.deepEqual(receiver, byId.get(spec.benefit), `${variant.name} embeds the inert ${spec.key} receiver template`);
    }
    const activeAuras = actor.items.filter(item => item.system.rules.some(rule => rule.key === "Aura"));
    assert.deepEqual(activeAuras, [byId.get(defaultAura.id)], "Only the signature aura starts active");
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
    assert.match(dom.textContent, /No living-thrall limit/);
    assert.match(dom.textContent, /Each thrall starts with its signature aura/);
    assert.match(dom.textContent, /Distinct thralls stack/);
    assert.match(dom.textContent, /Command.*one thrall.*remaining lifetime/);
  } finally {
    if (prior) Object.defineProperty(globalThis, "foundry", prior);
    else delete globalThis.foundry;
  }
});

test("abilities follow native PF2e header, divider, effect and outcome structure", () => {
  for (const id of ["BlasterBlastAct1", "BlasterBlastAct2", "BlasterBlastAct3", "BlasterFinaleAct", "BlasterFlashAct1", "BlasterCommand01", "BlasterClashAct1"]) {
    const html = description(embedded(id));
    const dom = JSDOM.fragment(html);
    assert.equal(dom.firstElementChild.querySelector("strong").textContent, id === "BlasterCommand01" ? "Requirements" : "Frequency");
    const effect = [...dom.querySelectorAll("p")].find(node => node.firstElementChild?.tagName === "STRONG" && node.firstElementChild.textContent === "Effect");
    assert.equal(effect?.previousElementSibling?.tagName, "HR", "Effect follows the rules header divider");
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
  const budgets = { BlasterShell0001: 110, BlasterSpectrum1: 220, BlasterBlastAct1: 190, BlasterBlastAct2: 190, BlasterBlastAct3: 235,
    BlasterFinaleAct: 235, BlasterFlashAct1: 110, BlasterCommand01: 190, BlasterClashAct1: 240, BlasterBackAct01: 190, BlasterRange0001: 35, BlasterMelee0001: 35 };
  const abilities = blaster.items.filter(item => item.type === "action" || item.type === "melee");
  assert.deepEqual(abilities.map(item => item._id).sort(), Object.keys(budgets).sort());
  for (const item of abilities) {
    assert.ok(count(plain(description(item))) <= budgets[item._id], `${item.name} exceeds its word budget`);
    for (const paragraph of JSDOM.fragment(description(item)).querySelectorAll("p")) {
      assert.ok(count(plain(paragraph.outerHTML)) <= 75, `${item.name} has a wall of text`);
    }
  }
});
