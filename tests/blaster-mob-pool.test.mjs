import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Source-only coverage: importing this helper never emits or reads stale build output.
const source = readFileSync(new URL("../src/scripts/features/blaster-mob-pool.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 },
});
const { reconcileMobPool } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const POOL = "astillon-hanaq-adventures-module.blasterMobPool";
const A = "Scene.scene.Token.a:nonce-a";
const B = "Scene.scene.Token.b:nonce-b";
const C = "Scene.scene.Token.c:nonce-c";
const hp = (temp, tempSource = POOL) => ({ temp, tempSource });
const run = (previous, current, live, grants = [], lifetimes = live) =>
  reconcileMobPool(previous?.ledger ?? previous, current, live, grants, POOL, lifetimes);

test("each native arrival grants ten, duplicate arrivals and ordinary reconciliation grant nothing", () => {
  const first = run(null, hp(0, null), [A, B], [A, A, B]);
  assert.equal(first.temp, 20);
  assert.equal(first.tempSource, POOL);
  assert.deepEqual(first.ledger.contributions, { [A]: 10, [B]: 10 });
  assert.deepEqual(run(first, first, [A, B], [A, B]), first);
  assert.deepEqual(run(first, first, [A, B]), first);
});

test("FIFO damage persists zero tombstones across exits, re-entry, and mode changes", () => {
  const first = run(null, hp(0, null), [A, B], [A, B]);
  const damaged = run(first, hp(7), [A, B]);
  assert.equal(damaged.temp, 7);
  assert.deepEqual(damaged.ledger.contributions, { [A]: 0, [B]: 7 });
  const outsideOrOtherMode = run(damaged, damaged, [A, B]);
  assert.deepEqual(run(outsideOrOtherMode, outsideOrOtherMode, [A, B], [A, B]), damaged);
  const exhausted = run(damaged, hp(0, null), [A, B], [A, B]);
  assert.equal(exhausted.temp, 0);
  assert.equal(exhausted.tempSource, null);
  assert.deepEqual(exhausted.ledger.contributions, { [A]: 0, [B]: 0 });
  assert.equal(run(exhausted, exhausted, [A, B], [A, B]).temp, 0);
});

test("a new lifetime grants after damage without restoring any previous contribution", () => {
  const first = run(null, hp(0, null), [A, B], [A, B]);
  const damaged = run(first, hp(3), [A, B]);
  const added = run(damaged, damaged, [A, B, C], [A, B, C]);
  assert.equal(added.temp, 13);
  assert.deepEqual(added.ledger.contributions, { [A]: 0, [B]: 3, [C]: 10 });
});

test("death or expiry removes only that lifetime's unspent HP", () => {
  const first = run(null, hp(0, null), [A, B, C], [A, B, C]);
  const damaged = run(first, hp(17), [A, B, C]);
  const spentSourceDies = run(damaged, damaged, [B, C]);
  assert.equal(spentSourceDies.temp, 17);
  const partialSourceDies = run(spentSourceDies, spentSourceDies, [C]);
  assert.equal(partialSourceDies.temp, 10);
  const allExpire = run(partialSourceDies, partialSourceDies, []);
  assert.equal(allExpire.temp, 0);
  assert.equal(allExpire.tempSource, null);
  assert.deepEqual(allExpire.ledger.contributions, {});
});

test("a dead or invalid summon retains its spent tombstone through revival or link repair", () => {
  const first = run(null, hp(0, null), [A, B], [A, B]);
  const invalid = run(first, first, [B], [], [A, B]);
  assert.equal(invalid.temp, 10);
  assert.deepEqual(invalid.ledger.contributions, { [A]: 0, [B]: 10 });
  const repaired = run(invalid, invalid, [A, B], [A], [A, B]);
  assert.deepEqual(repaired, invalid);
  const newSummon = run(repaired, repaired, [A, B, C], [A, C], [A, B, C]);
  assert.equal(newSummon.temp, 20);
  assert.deepEqual(newSummon.ledger.contributions, { [A]: 0, [B]: 10, [C]: 10 });
});

test("permanent token removal or lifetime expiry prunes retained tombstones", () => {
  const first = run(null, hp(0, null), [A], [A]);
  const dead = run(first, first, [], [], [A]);
  assert.equal(dead.temp, 0);
  assert.deepEqual(dead.ledger.contributions, { [A]: 0 });
  const removed = run(dead, dead, [], [], []);
  assert.deepEqual(removed.ledger.contributions, {});
  assert.equal(removed.temp, 0);
});

test("default lifetime keys also work with a single-use live-key iterator", () => {
  const first = reconcileMobPool(null, hp(0, null), [A, B].values(), [A, B], POOL);
  assert.equal(first.temp, 20);
  assert.deepEqual(first.ledger.contributions, { [A]: 10, [B]: 10 });
});

test("unrelated higher temporary HP is preserved, not summed or wiped at mob expiry", () => {
  const first = run(null, hp(40, "external-item"), [A, B], [A, B]);
  assert.equal(first.temp, 40);
  assert.equal(first.tempSource, "external-item");
  const expired = run(first, first, []);
  assert.equal(expired.temp, 40);
  assert.equal(expired.tempSource, "external-item");
});

test("damage while an external pool is higher also spends hidden mob HP without regeneration", () => {
  const first = run(null, hp(40, "external-item"), [A, B], [A, B]);
  const damaged = run(first, hp(15, "external-item"), [A, B]);
  assert.equal(damaged.temp, 15);
  assert.deepEqual(damaged.ledger.contributions, { [A]: 0, [B]: 0 });
  assert.deepEqual(run(damaged, damaged, [A, B], [A, B]), damaged);
  const depleted = run(damaged, hp(0, null), [A, B], [A, B]);
  assert.equal(depleted.temp, 0);
});

test("mob takeover retains an external pool, spends it in parallel, and restores only its remainder", () => {
  const first = run(null, hp(15, "external-item"), [A, B], [A, B]);
  assert.equal(first.temp, 20);
  assert.equal(first.tempSource, POOL);
  const damaged = run(first, hp(16), [A, B]);
  assert.deepEqual(damaged.ledger.external, hp(11, "external-item"));
  const expired = run(damaged, damaged, []);
  assert.equal(expired.temp, 11);
  assert.equal(expired.tempSource, "external-item");
});

test("new unrelated sources replace the retained external source without adding pools", () => {
  const first = run(null, hp(15, "old-external"), [A, B], [A, B]);
  const replacement = run(first, hp(35, "new-external"), [A, B]);
  assert.equal(replacement.temp, 35);
  assert.deepEqual(replacement.ledger.external, hp(35, "new-external"));
  assert.deepEqual(replacement.ledger.contributions, { [A]: 10, [B]: 10 });
  const expired = run(replacement, replacement, []);
  assert.equal(expired.temp, 35);
  assert.equal(expired.tempSource, "new-external");
});

test("a hidden external source that expires cannot return when mob contributions expire", () => {
  const first = run(null, hp(15, "external-item"), [A, B], [A, B]);
  const externalExpired = run(first, { ...first, externalSourceActive: false }, [A, B]);
  assert.equal(externalExpired.temp, 20);
  assert.equal(externalExpired.ledger.external, null);
  assert.equal(run(externalExpired, externalExpired, []).temp, 0);
});

test("invalidating a previous external source does not discard its new replacement", () => {
  const first = run(null, hp(15, "old-external"), [A, B], [A, B]);
  const replacement = run(first, { ...hp(35, "new-external"), externalSourceActive: false }, [A, B]);
  assert.equal(replacement.temp, 35);
  assert.equal(replacement.tempSource, "new-external");
});

test("external invalidation cannot discard a first unrelated manual grant", () => {
  const first = run(null, hp(0, null), [A], [A]);
  const manual = run(first, { ...hp(25, null), externalSourceActive: false }, [A]);
  assert.equal(manual.temp, 25);
  assert.equal(manual.tempSource, null);
});

test("confirmed external expiry reveals existing mob HP without treating expiry as damage", () => {
  const first = run(null, hp(40, "external-item"), [A, B], [A, B]);
  // The integration recognizes native onDelete's zero/source deletion and supplies the
  // last displayed HP with the now-invalid external source, so expiry is not a damage debit.
  const expired = run(first, { ...hp(40, "external-item"), externalSourceActive: false }, [A, B]);
  assert.equal(expired.temp, 20);
  assert.equal(expired.tempSource, POOL);
  assert.equal(expired.ledger.external, null);
  assert.deepEqual(expired.ledger.contributions, { [A]: 10, [B]: 10 });
  assert.deepEqual(run(expired, expired, [A, B], [A, B]), expired);
});

test("native clearing of an active external source cannot expose fresh hidden mob HP", () => {
  const first = run(null, hp(40, "external-item"), [A, B], [A, B]);
  const cleared = run(first, hp(0, null), [A, B]);
  assert.equal(cleared.temp, 0);
  assert.equal(cleared.ledger.external, null);
  assert.deepEqual(cleared.ledger.contributions, { [A]: 0, [B]: 0 });
});

test("manual unrelated HP with no item source remains protected", () => {
  const first = run(null, hp(30, null), [A], [A]);
  assert.equal(first.temp, 30);
  assert.equal(first.tempSource, null);
  const damaged = run(first, hp(28, null), [A]);
  assert.equal(damaged.ledger.contributions[A], 8);
  const expired = run(damaged, damaged, []);
  assert.equal(expired.temp, 28);
  assert.equal(expired.tempSource, null);
});

test("ties retain the already active source and do not cause source churn", () => {
  const external = run(null, hp(20, "external-item"), [A, B], [A, B]);
  assert.equal(external.tempSource, "external-item");
  const owned = run(null, hp(0, null), [A, B], [A, B]);
  const tiedLedger = { ...owned.ledger, external: hp(20, "external-item") };
  const tied = run(tiedLedger, owned, [A, B]);
  assert.equal(tied.tempSource, POOL);
});

test("only currently live native-arrival keys grant, with independent summon nonces", () => {
  const replacedA = "Scene.scene.Token.a:new-nonce";
  const first = run(null, hp(0, null), [A], [A, B]);
  assert.deepEqual(first.ledger.contributions, { [A]: 10 });
  const next = run(first, first, [replacedA], [A, replacedA]);
  assert.deepEqual(next.ledger.contributions, { [replacedA]: 10 });
  assert.equal(next.temp, 10);
});

test("many thralls respect native 999 cap without storing overflow that later heals", () => {
  const keys = Array.from({ length: 105 }, (_, index) => `Scene.scene.Token.${index}:nonce`);
  const first = run(null, hp(0, null), keys, keys);
  assert.equal(first.temp, 999);
  assert.equal(first.ledger.contributions[keys[99]], 9);
  assert.equal(first.ledger.contributions[keys[100]], 0);
  const damaged = run(first, hp(980), keys, keys);
  assert.equal(damaged.temp, 980);
  assert.equal(damaged.ledger.contributions[keys[100]], 0);
  assert.deepEqual(run(damaged, damaged, keys, keys), damaged);
});

test("reconciliation leaves prior ledger, observations, and key inputs untouched", () => {
  const first = run(null, hp(12, "external-item"), [A, B], [A, B]);
  const original = structuredClone(first);
  Object.freeze(first.ledger.contributions);
  Object.freeze(first.ledger.external);
  Object.freeze(first.ledger.displayed);
  Object.freeze(first.ledger);
  const current = Object.freeze(hp(13));
  const live = Object.freeze([A, B, C]);
  const grants = Object.freeze([C]);
  const next = run(first, current, live, grants);
  assert.equal(next.temp, 23);
  assert.deepEqual(first, original);
  assert.deepEqual(current, hp(13));
  assert.deepEqual(live, [A, B, C]);
  assert.deepEqual(grants, [C]);
});
