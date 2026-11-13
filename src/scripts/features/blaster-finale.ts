import { BLAST_MODES, FINALE, lineShapes, type BlastMode, type Point } from "./blaster-model.js";

const PLAN_FLAG = "blasterFinalePlans";
const REGION_FLAG = "blasterFinale";
const AMBER = "#ffbf00";
type Status = "pending" | "publishing" | "fired" | "recovery" | "clearing";
type Placement = { scene: any; tokenId: string; cancelled: boolean };
type Plan = {
  id: string; tokenId: string; actorUuid: string; points: Point[]; width: 1 | 3; gridSize: number;
  mode: BlastMode; combatUuid: string | null; commitRound: number | null; dueRound: number | null;
  status: Status; regionIDs: string[]; messageId: string; claim: string | null;
};
type Picker = {
  pick(token: any, options: { title: string; pointCount: 2 | 8; range: number; width: 1 | 3; color: string }): Promise<Point[] | null>;
  cancel(): void; readonly busy: boolean;
};

/**
 * V14 public document APIs only. Regions have no Behaviors and never apply damage.
 * A durable publication claim intentionally favors missing-card manual recovery over
 * duplicate cards: keepId is public, but is NOT a world-document compare-and-swap.
 */
export function createBlasterFinale(moduleId: string, { selectToken, picker }: { selectToken: () => any; picker: Picker }) {
  let registered = false;
  let queue: Promise<unknown> = Promise.resolve();
  let placement: Placement | null = null;
  const jobs = new Set<Promise<unknown>>();
  const notices = new Set<string>();
  const contents = (collection: any): any[] => collection?.contents ?? [...(collection?.values?.() ?? collection ?? [])];
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const flag = (doc: any, key: string) => doc?.getFlag(moduleId, key);
  const primaryGM = () => !!game.user?.isGM && game.users?.activeGM?.id === game.user.id;
  const combatUuid = (combat: any) => combat?.uuid ?? (combat?.id ? `Combat.${combat.id}` : null);
  const sceneCombat = (scene: any) => game.combat?.scene?.id === scene.id && game.combat.started ? game.combat : null;
  const key = (tokenId: string) => `${PLAN_FLAG}.${tokenId}`;
  const warn = (message: string): false => { ui.notifications.warn(message); return false; };
  const report = (error: unknown): false => {
    console.error(`${moduleId} | Grand Finale`, error);
    ui.notifications.error(error instanceof Error ? error.message : String(error));
    return false;
  };
  function notice(id: string, message: string) {
    if (notices.has(id)) return;
    notices.add(id); ui.notifications.warn(message);
  }
  function serial<T>(work: () => Promise<T>): Promise<T | false> {
    const job = queue.then(work).catch(report);
    queue = job; jobs.add(job);
    void job.then(() => jobs.delete(job));
    return job;
  }
  function planMap(scene: any): Record<string, unknown> {
    const value = flag(scene, PLAN_FLAG);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }
  function validPlan(value: any, tokenId: string): value is Plan {
    return !!value && typeof value === "object" && /^[\w-]+$/.test(tokenId)
      && !["__proto__", "prototype", "constructor"].includes(tokenId)
      && value.tokenId === tokenId && typeof value.id === "string" && !!value.id
      && typeof value.actorUuid === "string" && !!value.actorUuid
      && typeof value.messageId === "string" && !!value.messageId
      && ["pending", "publishing", "fired", "recovery", "clearing"].includes(value.status)
      && (value.claim === null || typeof value.claim === "string")
      && Object.prototype.hasOwnProperty.call(BLAST_MODES, value.mode)
      && [1, 3].includes(value.width) && Number.isFinite(value.gridSize) && value.gridSize > 0
      && Array.isArray(value.points) && value.points.length === FINALE.pointCount
      && value.points.every((p: any, i: number) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
        && (!i || (Number.isFinite(Math.hypot(p.x - value.points[i - 1].x, p.y - value.points[i - 1].y))
          && Math.hypot(p.x - value.points[i - 1].x, p.y - value.points[i - 1].y) >= 1)))
      && Array.isArray(value.regionIDs) && value.regionIDs.length === FINALE.pointCount - 1
      && new Set(value.regionIDs).size === value.regionIDs.length && value.regionIDs.every((id: any) => typeof id === "string" && !!id)
      && (value.combatUuid === null ? value.commitRound === null && value.dueRound === null
        : typeof value.combatUuid === "string" && !!value.combatUuid && Number.isInteger(value.commitRound)
          && value.commitRound >= 1 && value.dueRound === value.commitRound + 1);
  }
  function read(scene: any, tokenId: string): Plan | null {
    const value = planMap(scene)[tokenId];
    return validPlan(value, tokenId) ? clone(value) : null;
  }
  function current(scene: any, plan: Plan): Plan | null {
    const value = read(scene, plan.tokenId);
    return value?.id === plan.id ? value : null;
  }
  function owner(scene: any, plan: Plan) {
    const token = scene.tokens.get(plan.tokenId);
    return token?.actor?.uuid === plan.actorUuid && token.actor.getFlag(moduleId, "blasterRole") === "blaster" ? token : null;
  }
  function assertAuthority() {
    if (!primaryGM()) throw new Error("Use the active GM client for Grand Finale.");
  }
  async function save(scene: any, plan: Plan) {
    assertAuthority();
    await scene.setFlag(moduleId, key(plan.tokenId), foundry.data.operators.ForcedReplacement.create(clone(plan)));
    const saved = read(scene, plan.tokenId);
    if (!saved || Object.keys(plan).some(k => JSON.stringify(saved[k as keyof Plan]) !== JSON.stringify(plan[k as keyof Plan]))) {
      throw new Error("Grand Finale state could not be verified. Inspect or clear the finale before continuing.");
    }
  }
  function markedRegions(scene: any, tokenId: string, id?: string) {
    return contents(scene.regions).filter(region => {
      const mark = flag(region, REGION_FLAG);
      return mark?.tokenId === tokenId && typeof mark.id === "string" && (!id || mark.id === id);
    });
  }
  async function removeRegions(scene: any, tokenId: string, id?: string) {
    const ids = markedRegions(scene, tokenId, id).map(region => region.id);
    if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
  }
  function cancelPlacement(scene: any, tokenId?: string) {
    if (placement && placement.scene === scene && (!tokenId || placement.tokenId === tokenId)) {
      placement.cancelled = true; picker.cancel();
    }
  }
  async function erase(scene: any, tokenId: string) {
    assertAuthority();
    const plan = read(scene, tokenId);
    // Persist cancellation before deleting: failed deletion is retried on ready.
    if (plan && plan.status !== "clearing") await save(scene, { ...plan, status: "clearing" });
    assertAuthority();
    await removeRegions(scene, tokenId);
    assertAuthority();
    if (Object.prototype.hasOwnProperty.call(planMap(scene), tokenId)) await scene.unsetFlag(moduleId, key(tokenId));
  }
  function selectedContext() {
    assertAuthority();
    const token = selectToken();
    const scene = token.document.parent;
    if (canvas.scene !== scene || scene.tokens.get(token.id) !== token.document
        || token.actor?.uuid !== token.document.actor?.uuid) throw new Error("Select a live Blaster token in the viewed scene.");
    return { token, scene };
  }

  async function mark(): Promise<boolean> {
    if (placement || picker.busy) return warn("Finish or cancel the current blast placement first.");
    let session: Placement | null = null;
    try {
      const { token, scene } = selectedContext();
      const actorUuid = token.actor.uuid;
      const position = { x: token.document.x, y: token.document.y };
      session = { scene, tokenId: token.id, cancelled: false }; placement = session;
      const validate = () => {
        assertAuthority();
        if (session!.cancelled || selectToken() !== token || canvas.scene !== scene
            || scene.tokens.get(token.id) !== token.document || token.actor?.uuid !== actorUuid
            || token.document.actor?.uuid !== actorUuid || token.document.x !== position.x || token.document.y !== position.y) {
          throw new Error("The selected Blaster or scene changed during Grand Finale placement. Mark again.");
        }
      };
      const chosen = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Blaster · Grand Finale" }, rejectClose: false,
        content: `<p>Free action at round start (GM adjudicated). Choose eight points for seven legs, up to 120 feet each, three squares wide. The amber warning never deals damage. It fires at the next global round start, using this exact path.</p><div class="form-group"><label>Spectrum</label><select name="mode">${Object.entries(BLAST_MODES).map(([key, mode]) => `<option value="${key}">${mode.label}${mode.penalty ? " (−2 damage dice; condition on failure)" : ""}</option>`).join("")}</select></div><p>Without a started combat this is manual-only: use Fire Finale. Saves, damage, and riders are manual.</p>`,
        ok: { label: "Mark eight points", callback: (_event: Event, button: any) => ({ mode: button.form.elements.mode.value }) },
      });
      if (!chosen || session.cancelled) return false;
      const mode = chosen.mode as BlastMode;
      if (!Object.prototype.hasOwnProperty.call(BLAST_MODES, mode)) throw new Error("Choose a valid Grand Finale spectrum.");
      validate();
      const points = await picker.pick(token, { title: FINALE.name, pointCount: FINALE.pointCount, range: FINALE.range, width: FINALE.width, color: AMBER });
      if (!points || session.cancelled) return false;
      validate();
      const snapshot = clone(points);
      const gridSize = canvas.grid.size;
      if (snapshot.length !== FINALE.pointCount) throw new Error("Grand Finale requires eight waypoints.");
      const shapes = lineShapes(snapshot, gridSize, FINALE.width);
      if (snapshot.slice(1).some((point, i) => {
        const distance = canvas.grid.measurePath([snapshot[i], point]).distance;
        return !Number.isFinite(distance) || distance > FINALE.range + 0.001;
      })) throw new Error("Each Grand Finale leg must be at most 120 feet.");
      const levels = canvas.level ? [canvas.level.id] : [];
      const result = await serial(async () => {
        validate();
        const previousRaw = clone(planMap(scene)[token.id] ?? null);
        const id = foundry.utils.randomID();
        const sources = shapes.map((shape, index) => ({
          name: `${token.name} — Grand Finale warning ${index + 1}/7`, shapes: [shape], levels,
          color: AMBER, highlightMode: "coverage", displayMeasurements: true, hidden: false,
          visibility: (globalThis as any).CONST.REGION_VISIBILITY.ALWAYS,
          ownership: { default: 2, [game.user.id]: 3 }, behaviors: [],
          flags: { pf2e: { areaShape: "line" }, [moduleId]: { [REGION_FLAG]: { id, tokenId: token.id, actorUuid, status: "warning" } } },
        }));
        let plan: Plan | null = null;
        try {
          const created = await scene.createEmbeddedDocuments("Region", sources);
          if (created.length !== shapes.length) throw new Error("Grand Finale did not create all seven warning regions.");
          validate();
          // Capture scheduling at the actual commit, after placement AND document creation.
          const combat = sceneCombat(scene);
          plan = { id, tokenId: token.id, actorUuid, points: snapshot, width: FINALE.width, gridSize, mode,
            combatUuid: combatUuid(combat), commitRound: combat?.round ?? null, dueRound: combat ? combat.round + 1 : null,
            status: "pending", regionIDs: created.map((r: any) => r.id), messageId: foundry.utils.randomID(), claim: null };
          if (!validPlan(plan, token.id)) throw new Error("Grand Finale cannot schedule against this combat or grid state.");
          await save(scene, plan);
          // A turn can advance while the Scene write is in flight. Our serial queue
          // keeps hook jobs behind this commit; align the schedule before releasing it.
          const committedCombat = sceneCombat(scene);
          if (primaryGM() && (combatUuid(committedCombat) !== plan.combatUuid || (committedCombat?.round ?? null) !== plan.commitRound)) {
            plan = { ...plan, combatUuid: combatUuid(committedCombat), commitRound: committedCombat?.round ?? null,
              dueRound: committedCombat ? committedCombat.round + 1 : null };
            await save(scene, plan);
          }
        } catch (error) {
          // A rejected persistence call may nevertheless have reached the server.
          // Restore only if this transaction's nonce still owns the slot.
          if (plan && current(scene, plan)) {
            try {
              if (previousRaw !== null) await scene.setFlag(moduleId, key(token.id), foundry.data.operators.ForcedReplacement.create(previousRaw));
              else await scene.unsetFlag(moduleId, key(token.id));
            } catch (restoreError) { report(new Error(`Grand Finale rollback needs GM attention: ${String(restoreError)}`)); }
          }
          await removeRegions(scene, token.id, id);
          throw error;
        }
        // The prior plan and all prior visuals survive cancellation and failed commits.
        try {
          assertAuthority();
          const oldIds = markedRegions(scene, token.id).filter(r => flag(r, REGION_FLAG).id !== id).map(r => r.id);
          if (oldIds.length) await scene.deleteEmbeddedDocuments("Region", oldIds);
        } catch (error) { report(new Error(`Grand Finale is marked, but older warning regions need cleanup: ${String(error)}`)); }
        ui.notifications.info(`Grand Finale marked: ${plan!.dueRound === null ? "manual-only; use Fire Finale" : `fires at the start of round ${plan!.dueRound}`}.`);
        return true;
      });
      return !!result;
    } catch (error) { return report(error); }
    finally { if (placement === session) placement = null; }
  }

  async function firePlan(scene: any, original: Plan, automatic: boolean): Promise<boolean> {
    assertAuthority();
    let plan = current(scene, original);
    if (!plan || plan.status === "clearing" || plan.status === "fired") return false;
    const token = owner(scene, plan);
    if (!token) { await erase(scene, plan.tokenId); return false; }
    if (plan.status === "publishing") {
      const message = game.messages?.get(plan.messageId);
      const mark = flag(message, REGION_FLAG);
      if (mark?.id === plan.id && mark?.sceneId === scene.id && mark?.tokenId === plan.tokenId) {
        await save(scene, { ...plan, status: "fired" });
      } else notice(plan.id, "Grand Finale publication is uncertain. Inspect chat history; no card will be retried. If no card was published, use Clear Finale and mark a new plan for manual recovery.");
      return false;
    }
    if (automatic && plan.status !== "pending") return false;
    const spectrum = BLAST_MODES[plan.mode];
    const traits = ["magical", spectrum.damage, ...(plan.mode === "dazzling" ? ["light"] : [])].join(",");
    const escape = foundry.utils.escapeHTML;
    // These are base dice/DC. Native PF2e enrichment retains Inspire, elite/weak,
    // and other system adjustments, matching the immediate blast and statblock.
    const action = token.actor.items?.find?.((item: any) => item.slug === "blaster-grand-finale");
    const card = `<h3>${escape(token.name)} · ${FINALE.name}</h3><p>${spectrum.label} · DC ${FINALE.dc} · ${plan.width} square${plan.width === 1 ? "" : "s"} wide · seven connected legs</p><p>@Check[${spectrum.save}|dc:${FINALE.dc}|basic|traits:${traits}] @Damage[${FINALE.dice - spectrum.penalty}d6[${spectrum.damage}]|traits:${traits}|options:area-damage]</p><p>One save and damage application per creature, even where legs overlap. Blaster is excluded. Resolve cover and line of effect normally. Apply HP changes, saves, and riders manually. The fixed area remains until cleared or replaced.</p>${spectrum.rider ? `<p>${spectrum.rider}</p>` : ""}`;
    const content = await game.pf2e.TextEditor.enrichHTML(card, { rollData: action?.getRollData() ?? token.actor.getRollData(), relativeTo: action ?? token.actor });
    assertAuthority();
    plan = current(scene, plan);
    if (!plan || !owner(scene, plan) || !["pending", "recovery"].includes(plan.status)) return false;
    if (automatic) {
      const combat = findCombat(plan.combatUuid);
      if (!combat?.started || combat.round !== plan.dueRound) return false;
    }
    const claimed: Plan = { ...plan, status: "publishing", claim: foundry.utils.randomID() };
    await save(scene, claimed);
    assertAuthority();
    if (current(scene, claimed)?.claim !== claimed.claim || !owner(scene, claimed)) return false;
    let publicationStarted = false;
    try {
      const regions = markedRegions(scene, claimed.tokenId, claimed.id);
      if (regions.length !== claimed.regionIDs.length || regions.some(r => !claimed.regionIDs.includes(r.id))) {
        throw new Error("Grand Finale warning regions are incomplete. Clear and mark the plan again.");
      }
      const shapes = lineShapes(claimed.points, claimed.gridSize, claimed.width);
      await scene.updateEmbeddedDocuments("Region", claimed.regionIDs.map((id, index) => ({
        _id: id, shapes: [shapes[index]], color: spectrum.color, name: `${token.name} — Grand Finale active ${index + 1}/7`,
        [`flags.${moduleId}.${REGION_FLAG}.status`]: "active",
      })));
      assertAuthority();
      if (current(scene, claimed)?.claim !== claimed.claim || !owner(scene, claimed)) return false;
      if (automatic) {
        const combat = findCombat(claimed.combatUuid);
        if (!combat?.started || combat.round !== claimed.dueRound) {
          await save(scene, { ...claimed, status: "recovery", claim: null });
          return warn("Grand Finale's round changed before publication. Use Fire Finale manually or Clear Finale.");
        }
      }
      publicationStarted = true;
      // Do not retry this call on any rejection, reconnect, or handover. The server
      // might have stored/broadcast it before the client lost the acknowledgement.
      const message = await foundry.documents.ChatMessage.implementation.create({
        _id: claimed.messageId, speaker: foundry.documents.ChatMessage.getSpeaker({ token }), content,
        flags: { [moduleId]: { [REGION_FLAG]: { id: claimed.id, sceneId: scene.id, tokenId: claimed.tokenId } } },
      }, { keepId: true });
      if (!message) throw new Error("Grand Finale chat creation returned no document. Inspect chat history; publication will not be retried.");
      if (primaryGM() && current(scene, claimed)?.claim === claimed.claim) await save(scene, { ...claimed, status: "fired" });
      return true;
    } catch (error) {
      if (!publicationStarted && primaryGM() && current(scene, claimed)?.claim === claimed.claim) {
        await save(scene, { ...claimed, status: "recovery", claim: null });
      }
      if (publicationStarted) notice(claimed.id, "Grand Finale card publication may have succeeded. Inspect chat history; automatic and manual retries are blocked to prevent duplicate damage cards.");
      throw error;
    }
  }
  async function fire(): Promise<boolean> {
    try {
      const { token, scene } = selectedContext();
      return !!(await serial(async () => {
        const plan = read(scene, token.id);
        if (!plan) return warn("This Blaster has no valid Grand Finale plan. Clear malformed plans before marking again.");
        return firePlan(scene, plan, false);
      }));
    } catch (error) { return report(error); }
  }
  async function clear(): Promise<boolean> {
    try {
      const { token, scene } = selectedContext();
      cancelPlacement(scene, token.id);
      return !!(await serial(async () => { await erase(scene, token.id); return true; }));
    } catch (error) { return report(error); }
  }
  function findCombat(uuid: string | null) {
    if (!uuid) return null;
    return contents(game.combats).find(combat => combatUuid(combat) === uuid)
      ?? (combatUuid(game.combat) === uuid ? game.combat : null);
  }
  async function reconcile() {
    if (!primaryGM()) return;
    for (const scene of contents(game.scenes)) {
      for (const [tokenId, raw] of Object.entries(planMap(scene))) {
        if (!primaryGM()) return;
        if (!validPlan(raw, tokenId)) {
          notice(`${scene.id}:${tokenId}`, "Ignored malformed Grand Finale state. Select that Blaster and use Clear Finale before marking again.");
          continue;
        }
        try {
          const plan = read(scene, tokenId);
          if (!plan) continue;
          if (!owner(scene, plan) || plan.status === "clearing") { await erase(scene, tokenId); continue; }
          const combat = findCombat(plan.combatUuid);
          if (plan.combatUuid && !combat) { await erase(scene, tokenId); continue; }
          if (plan.status === "publishing") { await firePlan(scene, plan, false); continue; }
          if (plan.status !== "pending" || !plan.combatUuid) continue;
          if (!combat.started || combat.round < plan.commitRound! || combat.round > plan.dueRound!) {
            await save(scene, { ...plan, status: "recovery" });
            notice(plan.id, "Grand Finale's scheduled round was missed or rewound. Use Fire Finale manually or Clear Finale; it will not fire automatically.");
          } else if (combat.round === plan.dueRound) await firePlan(scene, plan, true);
        } catch (error) { report(error); } // One failed plan must not block other Blasters.
      }
    }
  }
  async function ready(): Promise<void> {
    if (!registered) {
      registered = true;
      Hooks.on("combatTurnChange", () => serial(reconcile));
      Hooks.on("updateCombat", (_combat: any, changed: any) => {
        if ("round" in changed || "turn" in changed) return serial(reconcile);
      });
      Hooks.on("deleteToken", (token: any) => {
        cancelPlacement(token.parent, token.id);
        return serial(async () => { if (primaryGM()) await erase(token.parent, token.id); });
      });
      Hooks.on("deleteCombat", (combat: any) => {
        if (placement && combat.scene?.id === placement.scene.id) cancelPlacement(placement.scene);
        return serial(async () => {
          if (!primaryGM()) return;
          for (const scene of contents(game.scenes)) for (const [tokenId, raw] of Object.entries(planMap(scene))) {
            if (validPlan(raw, tokenId) && raw.combatUuid === combatUuid(combat)) await erase(scene, tokenId);
          }
        });
      });
      Hooks.on("userConnected", () => serial(reconcile));
      Hooks.on("updateUser", () => serial(reconcile));
      Hooks.on("canvasReady", () => serial(reconcile));
      void serial(reconcile);
    }
    // Await new jobs added while an earlier awaited operation was in flight as well.
    while (jobs.size) await Promise.all([...jobs]);
  }
  return { mark, fire, clear, ready };
}
