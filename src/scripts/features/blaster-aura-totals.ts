import { reconcileMobPool } from "./blaster-mob-pool.js";
import { BLASTER_THRALLS } from "./blaster-thralls.js";

const AURAS = { inspire: "BlasterAuraIns01", guard: "BlasterAuraGrd01", tempHP: "BlasterAuraBol01" };
const RECEIVERS = ["BlasterInspire01", "BlasterGuard0001", "BlasterTempHP001"];
type Kind = keyof typeof AURAS;

/** Native circles supply containment; one native effect holds the actual cumulative modifiers. */
export function createBlasterAuraTotals(moduleId: string, isPlacing: (token: any) => boolean) {
  const values = (collection: any): any[] => collection?.contents ?? [...(collection?.values?.() ?? [])];
  const flag = (doc: any, key: string) => doc?.getFlag(moduleId, key);
  const primary = () => game.user?.isGM && game.users.activeGM?.id === game.user.id;
  const allTokens = () => values(game.scenes).flatMap(scene => values(scene.tokens));
  const manual = (item: any) => flag(item, "blasterManualSupport") === true;
  const kind = (item: any): Kind | null => Object.prototype.hasOwnProperty.call(AURAS, flag(item, "blasterAura")) ? flag(item, "blasterAura") : null;
  const poolSource = `${moduleId}.blasterMobPool`;
  const lifetime = (token: any) => `${token.uuid}-${flag(token, "blasterSummon")?.nonce}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  const live = (token: any) => token.actor?.system?.attributes?.hp?.value > 0 && flag(token, "blasterSummon")?.expiresAt > game.time.worldTime;
  let template: any;
  async function effectTemplate() {
    template ??= (await foundry.utils.fromUuid(`Compendium.${moduleId}.astillon-blaster-items.Item.BlasterGuard0001`))?.toObject();
    if (!template) throw new Error("Flash Mob support effect is missing from the compendium.");
    return foundry.utils.deepClone(template);
  }

  async function ensureDefault(token: any) {
    if (!primary() || !live(token) || flag(token, "blasterAuraVersion") === 2) return;
    const actor = token.actor;
    const current = values(actor.items).find(item => kind(item) && !manual(item));
    const variant = flag(actor, "blasterVariant") ?? flag(token, "blasterSummon")?.variant;
    const choice = current ? kind(current)! : BLASTER_THRALLS.find(v => v.key === variant)?.support;
    if (!choice) return;
    const source = current?.toObject() ?? (await foundry.utils.fromUuid(`Compendium.${moduleId}.astillon-blaster-items.Item.${AURAS[choice]}`))?.toObject();
    if (!source || !primary()) return;
    source.system.rules = source.system.rules.map((rule: any) => rule.key !== "Aura" ? rule : ({ ...rule,
      slug: `blaster-aura-${choice === "tempHP" ? "bolster" : choice}`, ignored: false, predicate: [], effects: [] }));
    source.system.duration = { value: -1, unit: "unlimited", expiry: null, sustained: false };
    source.system.tokenIcon = { show: true };
    source.flags[moduleId] = { ...source.flags[moduleId], blasterManualSupport: false, blasterAuraVersion: 2 };
    if (current) await actor.updateEmbeddedDocuments("Item", [{ _id: current.id, system: source.system, flags: source.flags }]);
    else { delete source._id; await actor.createEmbeddedDocuments("Item", [source], { blasterManaged: true }); }
    // Retire only the shipped inert source templates; direct GM effects are untouched.
    const obsolete = values(actor.items).filter(item => RECEIVERS.includes(item.id) && !manual(item) && !flag(item, "commandMobSource"));
    if (obsolete.length) await actor.deleteEmbeddedDocuments("Item", obsolete.map(item => item.id));
    await token.setFlag(moduleId, "blasterAuraVersion", 2);
  }

  function providers() {
    return allTokens().flatMap(token => values(token.actor?.items).flatMap(item => {
      const mode = kind(item), rule = item.rules?.find((r: any) => r.key === "Aura")
        ?? item.system.rules.find((r: any) => r.key === "Aura");
      if (!mode || !rule || item.isExpired || item.system.expired) return [];
      const isManual = manual(item), marker = flag(token, "blasterSummon");
      if (!isManual && (!marker?.nonce || marker.expiresAt <= game.time.worldTime)) return [];
      return [{ token, item, mode, isManual, marker, slug: rule.slug,
        key: isManual ? `${token.uuid}-${item.id}`.replace(/[^a-zA-Z0-9_-]/g, "-") : lifetime(token),
        alive: isManual || live(token) }];
    }));
  }

  function inAura(provider: ReturnType<typeof providers>[number], target: any) {
    if (!provider.alive || target.parent?.id !== provider.token.parent?.id) return false;
    const eligible = provider.isManual
      ? target.actor === provider.token.actor || target.actor.isAllyOf(provider.token.actor)
      : target.uuid === provider.marker.ownerTokenUuid && target.actor.uuid === provider.marker.ownerActorUuid;
    return eligible && provider.token.auras?.get(provider.slug)?.containsToken(target) === true;
  }

  function inputs(actor: any) {
    const sources = providers();
    const tokens = allTokens().filter(t => t.actor?.uuid === actor.uuid);
    const viewed = canvas.ready && tokens.some(t => t.parent.id === canvas.scene?.id);
    const owned = allTokens().filter(t => flag(t, "blasterSummon")?.ownerActorUuid === actor.uuid);
    const lifetimes = new Set(owned.filter(t => flag(t, "blasterSummon").expiresAt > game.time.worldTime).map(lifetime));
    const living = new Set(owned.filter(live).map(lifetime));
    for (const source of sources.filter(s => s.isManual)) { lifetimes.add(source.key); living.add(source.key); }
    const inside = viewed ? sources.filter(source => tokens.some(target => inAura(source, target))) : [];
    const active = viewed ? inside.filter(s => s.mode === "tempHP").map(s => s.key)
      : (flag(actor, "blasterMobPool")?.active ?? Object.keys(flag(actor, "blasterMobPool")?.contributions ?? {})).filter((key: string) => living.has(key));
    return { viewed, inside, active: new Set<string>(active), living, lifetimes };
  }

  function observation(actor: any) {
    const hp = actor._source.system.attributes.hp, ledger = flag(actor, "blasterMobPool");
    const externalId = ledger?.external?.tempSource, external = externalId && actor.items.get(externalId);
    return { temp: hp.temp ?? 0, tempSource: hp.tempSource ?? null,
      externalSourceActive: !externalId || !!external && !external.isExpired && !external.system.expired };
  }
  const poolChanges = (result: ReturnType<typeof reconcileMobPool>) => ({
    [`flags.${moduleId}.blasterMobPool`]: foundry.data.operators.ForcedReplacement.create(result.ledger),
    "system.attributes.hp.temp": result.temp, "system.attributes.hp.tempSource": result.tempSource ?? "",
  });
  function observeHP(actor: any, changed: any, options: any) {
    const previous = flag(actor, "blasterMobPool");
    if (!previous && !options?.blasterMobPoolUpdate) return;
    const read = (path: string) => Object.prototype.hasOwnProperty.call(changed, path) ? changed[path] : foundry.utils.getProperty(changed, path);
    const temp = read("system.attributes.hp.temp"), source = read("system.attributes.hp.tempSource");
    if (temp === undefined && source === undefined) return;
    const data = inputs(actor), current = observation(actor), reconcile = options?.blasterMobPoolUpdate;
    const externalExpired = previous?.external?.tempSource && !current.externalSourceActive &&
      previous.displayed.tempSource === previous.external.tempSource && Number(temp) === 0 && !source && source !== undefined && !(options?.damageTaken > 0);
    const result = reconcileMobPool(previous, {
      ...current, temp: reconcile ? current.temp : externalExpired ? previous.displayed.temp : temp ?? current.temp,
      tempSource: reconcile ? current.tempSource : externalExpired ? previous.displayed.tempSource : source === undefined ? current.tempSource : source,
    }, data.living, reconcile ? data.active : [], poolSource, data.lifetimes, data.active);
    for (const [path, value] of Object.entries(poolChanges(result))) {
      delete changed[path]; foundry.utils.setProperty(changed, path, value);
    }
  }

  async function sync() {
    if (!primary()) return;
    for (const token of allTokens()) if (!isPlacing(token)) await ensureDefault(token);
    // Existing manual auras keep their appearance, radius, and unrestricted placement.
    // Remove only legacy built-in receiver links; their bonuses now come from totals.
    const actors = new Map<string, any>([...values(game.actors), ...allTokens().map(t => t.actor)].filter(Boolean).map(a => [a.uuid, a]));
    for (const actor of actors.values()) {
      if (!primary()) return;
      if (!actor.system.attributes?.hp) continue;
      const edits = values(actor.items).flatMap(item => {
        if (!kind(item) || flag(item, "blasterAuraVersion") === 2) return [];
        return [{ _id: item.id, "system.rules": item.system.rules.map((rule: any) => rule.key !== "Aura" ? rule : ({ ...rule,
          effects: (rule.effects ?? []).filter((effect: any) => !RECEIVERS.some(id => effect.uuid?.endsWith(`.Item.${id}`))) })),
          [`flags.${moduleId}.blasterAuraVersion`]: 2 }];
      });
      if (edits.length) await actor.updateEmbeddedDocuments("Item", edits);
      const old = values(actor.items).filter(item => !flag(item, "blasterManualDrop") &&
        (flag(item, "commandMobSource")?.auraEmitterUuid || item.flags?.pf2e?.aura && flag(item, "blasterSupport")));
      if (old.length) await actor.deleteEmbeddedDocuments("Item", old.map(item => item.id));
      const data = inputs(actor), previous = flag(actor, "blasterMobPool");
      if (data.viewed) {
        const counts = { inspire: data.inside.filter(s => s.mode === "inspire").length,
          guard: data.inside.filter(s => s.mode === "guard").length, tempHP: data.active.size };
        const summaries = values(actor.items).filter(item => flag(item, "blasterAuraTotals") && !manual(item));
        if (!counts.inspire && !counts.guard && !counts.tempHP) {
          if (summaries.length) await actor.deleteEmbeddedDocuments("Item", summaries.map(item => item.id));
        } else if (summaries.length !== 1 || JSON.stringify(flag(summaries[0], "blasterAuraTotals")) !== JSON.stringify(counts)) {
          const source = await effectTemplate();
          delete source._id;
          delete source._stats;
          source.name = `Flash Mob — Aura Totals (${counts.inspire} Inspire / ${counts.guard} Guard / ${counts.tempHP} Bolster)`;
          source.flags = { [moduleId]: { blasterAuraTotals: counts, blasterManualSupport: false } };
          source.system.description.value = `<p>Active overlapping auras: <strong>${counts.inspire}</strong> Inspire, <strong>${counts.guard}</strong> Guard, <strong>${counts.tempHP}</strong> Bolster.</p><p>+${counts.inspire} attack/damage/fear saves; +${counts.guard} AC. Bolster supplies up to ${counts.tempHP * 10} temporary HP, less damage already spent from these sources.</p>`;
          source.system.slug = "blaster-aura-totals";
          source.system.rules = [
            { key: "FlatModifier", selector: ["attack-roll", "damage"], type: "untyped", value: counts.inspire, slug: "blaster-aura-total-inspire" },
            { key: "FlatModifier", selector: ["saving-throw"], predicate: ["fear"], type: "untyped", value: counts.inspire, slug: "blaster-aura-total-fear" },
            { key: "FlatModifier", selector: ["ac"], type: "untyped", value: counts.guard, slug: "blaster-aura-total-guard" },
          ].filter(rule => rule.value > 0);
          if (!primary()) return;
          if (summaries.length) {
            await actor.updateEmbeddedDocuments("Item", [{ _id: summaries[0].id, name: source.name, system: source.system, flags: source.flags }]);
            if (summaries.length > 1) await actor.deleteEmbeddedDocuments("Item", summaries.slice(1).map(item => item.id));
          } else await actor.createEmbeddedDocuments("Item", [source], { blasterManaged: true });
        }
      }
      if (previous || data.active.size) {
        const current = observation(actor);
        const result = reconcileMobPool(previous, current, data.living, data.active, poolSource, data.lifetimes, data.active);
        if (JSON.stringify(previous) !== JSON.stringify(result.ledger) || current.temp !== result.temp || (current.tempSource || null) !== result.tempSource) {
          await actor.update(poolChanges(result), { blasterMobPoolUpdate: true });
        }
      }
    }
  }
  return { sync, observeHP, ensureDefault };
}
