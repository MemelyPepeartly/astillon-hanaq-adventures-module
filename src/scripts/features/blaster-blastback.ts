const PLAN_FLAG = "blasterBlastbackPlans";
const MARK_FLAG = "blasterBlastback";
const ABILITY = "blaster-blastback";
const AMBER = "#ffbf00";
type Point = { x: number; y: number };
type Status = "charging" | "publishing" | "fired" | "recovery" | "clearing";
type Plan = {
  id: string; tokenId: string; actorUuid: string; status: Status; bank: number;
  combatUuid: string | null; combatantId: string | null; armedRound: number | null;
  armedTurn: number | null; dueRound: number | null; expiresAt: number | null;
  regionIDs: string[]; messageId: string; claim: string | null;
  snapshotDamage: number | null; center: Point | null;
};
type Session = { scene: any; token: any; actorUuid: string; cancelled: boolean };

/**
 * Foundry 14.370 / PF2e 8.7.1 (d507983d): updateActor.damageTaken is the
 * system's AFTER-IWR total, including temporary HP. Never infer damage from HP
 * differences or intercept the native update. Native damageUndo reports restored
 * ordinary HP only; temp-only undo and manual HP edits require the bank editor.
 *
 * Scene flags: blasterBlastbackPlans.<tokenId>. Region/chat marker: blasterBlastback.
 * keepId is not a compare-and-swap: use one primary-GM writer, a durable publishing
 * claim, and NEVER retry an uncertain publication (even after reload/handover).
 */
export function createBlasterBlastback(moduleId: string, { selectToken }: { selectToken: () => any }) {
  let registered = false;
  let queue: Promise<unknown> = Promise.resolve();
  const jobs = new Set<Promise<unknown>>();
  const sessions = new Set<Session>();
  const cancellations = new Map<string, number>();
  const cancelledTargets = new Set<string>();
  const notices = new Set<string>();
  const contents = (collection: any): any[] => collection?.contents ?? [...(collection?.values?.() ?? collection ?? [])];
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const flag = (doc: any, key: string) => doc?.getFlag(moduleId, key);
  const primaryGM = () => !!game.user?.isGM && game.users?.activeGM?.id === game.user.id;
  const key = (id: string) => `${PLAN_FLAG}.${id}`;
  const combatUuid = (combat: any): string | null => combat?.uuid ?? (combat?.id ? `Combat.${combat.id}` : null);
  const collecting = (plan: Plan) => plan.status === "charging" || plan.status === "recovery";
  const amount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  const safeId = (id: unknown): id is string => typeof id === "string" && /^[\w-]+$/.test(id)
    && !["__proto__", "prototype", "constructor"].includes(id);
  const warn = (message: string): false => { ui.notifications.warn(message); return false; };
  const report = (error: unknown): false => {
    console.error(`${moduleId} | Blastback`, error);
    ui.notifications.error(error instanceof Error ? error.message : String(error));
    return false;
  };
  function notice(id: string, message: string) {
    if (!notices.has(id)) { notices.add(id); ui.notifications.warn(message); }
  }
  function serial<T>(work: () => Promise<T>): Promise<T | false> {
    const job = queue.then(work).catch(report);
    queue = job; jobs.add(job);
    void job.then(() => jobs.delete(job));
    return job;
  }
  function assertAuthority() {
    if (!primaryGM()) throw new Error("Use the active GM client for Blastback.");
  }
  function planMap(scene: any): Record<string, unknown> {
    const value = flag(scene, PLAN_FLAG);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }
  function validPlan(value: any, tokenId: string): value is Plan {
    return !!value && safeId(tokenId) && value.tokenId === tokenId && safeId(value.id)
      && typeof value.actorUuid === "string" && !!value.actorUuid && safeId(value.messageId)
      && ["charging", "publishing", "fired", "recovery", "clearing"].includes(value.status)
      && amount(value.bank) && (value.claim === null || safeId(value.claim))
      && Array.isArray(value.regionIDs) && value.regionIDs.length === 1 && safeId(value.regionIDs[0])
      && (value.snapshotDamage === null || amount(value.snapshotDamage))
      && (value.center === null || (Number.isFinite(value.center?.x) && Number.isFinite(value.center?.y)))
      && (!["publishing", "fired"].includes(value.status) || (value.claim !== null && value.snapshotDamage !== null && value.center !== null))
      && (value.combatUuid === null
        ? value.combatantId === null && value.armedRound === null && value.armedTurn === null && value.dueRound === null
          && Number.isFinite(value.expiresAt)
        : typeof value.combatUuid === "string" && !!value.combatUuid && safeId(value.combatantId)
          && Number.isInteger(value.armedRound) && value.armedRound >= 1 && Number.isInteger(value.armedTurn)
          && value.armedTurn >= 0 && [value.armedRound, value.armedRound + 1].includes(value.dueRound) && value.expiresAt === null);
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
    if (game.scenes?.get(scene.id) !== scene) return null;
    const token = scene.tokens.get(plan.tokenId);
    return token?.parent === scene && token.actor?.uuid === plan.actorUuid
      && token.isOwner !== false && token.actor.isOwner !== false
      && flag(token.actor, "blasterRole") === "blaster" ? token : null;
  }
  async function save(scene: any, plan: Plan) {
    assertAuthority();
    if (!validPlan(plan, plan.tokenId)) throw new Error("Invalid Blastback state; inspect or clear the charge.");
    await scene.setFlag(moduleId, key(plan.tokenId), foundry.data.operators.ForcedReplacement.create(clone(plan)));
    const saved = read(scene, plan.tokenId);
    if (!saved || Object.keys(plan).some(k => JSON.stringify(saved[k as keyof Plan]) !== JSON.stringify(plan[k as keyof Plan]))) {
      throw new Error("Blastback state could not be verified. Inspect or clear the charge before continuing.");
    }
  }
  function markedRegions(scene: any, tokenId: string, id?: string) {
    return contents(scene.regions).filter(region => {
      const mark = flag(region, MARK_FLAG);
      return mark?.tokenId === tokenId && safeId(mark.id) && typeof mark.actorUuid === "string" && (!id || mark.id === id);
    });
  }
  async function removeRegions(scene: any, tokenId: string, id?: string) {
    assertAuthority();
    const ids = markedRegions(scene, tokenId, id).map(region => region.id);
    if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
  }
  function cancel(scene: any, tokenId?: string) {
    const scope = `${scene.id}:${tokenId ?? "*"}`;
    cancellations.set(scope, (cancellations.get(scope) ?? 0) + 1);
    cancelledTargets.add(scope);
    for (const session of sessions) if (session.scene === scene && (!tokenId || session.token.id === tokenId)) session.cancelled = true;
  }
  const revision = (scene: any, tokenId: string) => `${cancellations.get(`${scene.id}:*`) ?? 0}:${cancellations.get(`${scene.id}:${tokenId}`) ?? 0}`;
  const cancelled = (scene: any, tokenId: string) => cancelledTargets.has(`${scene.id}:*`) || cancelledTargets.has(`${scene.id}:${tokenId}`);
  async function erase(scene: any, tokenId: string) {
    assertAuthority();
    if (!safeId(tokenId)) return;
    const plan = read(scene, tokenId);
    // Persist cancellation first so a failed Region deletion is recoverable on ready.
    if (plan && plan.status !== "clearing") await save(scene, { ...plan, status: "clearing" });
    await removeRegions(scene, tokenId);
    assertAuthority();
    if (Object.prototype.hasOwnProperty.call(planMap(scene), tokenId)) await scene.unsetFlag(moduleId, key(tokenId));
    cancelledTargets.delete(`${scene.id}:${tokenId}`);
  }
  function selectedContext(): Session {
    assertAuthority();
    const token = selectToken();
    const scene = token?.document?.parent;
    if (!scene || canvas.scene !== scene || game.scenes?.get(scene.id) !== scene || !safeId(token.id)
        || scene.tokens.get(token.id) !== token.document || !token.actor?.uuid
        || token.document.isOwner === false || token.actor.isOwner === false
        || token.actor.uuid !== token.document.actor?.uuid || flag(token.actor, "blasterRole") !== "blaster") {
      throw new Error("Select a live Blaster token in the viewed scene.");
    }
    return { scene, token, actorUuid: token.actor.uuid, cancelled: false };
  }
  function validate(session: Session) {
    assertAuthority();
    const now = selectedContext();
    if (session.cancelled || now.token !== session.token || now.scene !== session.scene || now.actorUuid !== session.actorUuid) {
      throw new Error("The selected Blaster or scene changed. Run Blastback again.");
    }
  }
  function circle(scene: any, token: any, center?: Point) {
    const point = center ?? token.getCenterPoint();
    const radius = 100 * scene.grid.size / scene.grid.distance;
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || !Number.isFinite(radius) || radius <= 0) {
      throw new Error("Blastback requires a valid token position and scene grid distance.");
    }
    // Public EllipseShapeData (class, not interface): x/y are the ellipse center.
    return { type: "ellipse", x: point.x, y: point.y, radiusX: radius, radiusY: radius, rotation: 0, hole: false, gridBased: false };
  }
  function schedule(scene: any, tokenId: string): Pick<Plan, "combatUuid" | "combatantId" | "armedRound" | "armedTurn" | "dueRound" | "expiresAt"> {
    const combat = game.combat;
    const turns = combat?.turns ?? [];
    const index = turns.findIndex((c: any) => c.tokenId === tokenId);
    if (combat?.started && combat.scene?.id === scene.id && index >= 0
        && Number.isInteger(combat.round) && combat.round >= 1 && Number.isInteger(combat.turn) && combat.turn >= 0) {
      return { combatUuid: combatUuid(combat), combatantId: turns[index].id, armedRound: combat.round,
        armedTurn: combat.turn, dueRound: combat.round + (combat.turn >= index ? 1 : 0), expiresAt: null };
    }
    const now = game.time.worldTime;
    if (!Number.isFinite(now)) throw new Error("Blastback requires a valid world time.");
    return { combatUuid: null, combatantId: null, armedRound: null, armedTurn: null, dueRound: null, expiresAt: now + 6 };
  }
  function findCombat(uuid: string | null) {
    return contents(game.combats).find(combat => combatUuid(combat) === uuid)
      ?? (uuid && combatUuid(game.combat) === uuid ? game.combat : null);
  }
  function timing(scene: any, plan: Plan): "waiting" | "due" | "lost" | "missed" {
    if (!plan.combatUuid) return game.time.worldTime >= plan.expiresAt! ? "due" : "waiting";
    const combat = findCombat(plan.combatUuid);
    const index = combat?.turns?.findIndex((c: any) => c.id === plan.combatantId && c.tokenId === plan.tokenId) ?? -1;
    if (!combat || combat.scene?.id !== scene.id || index < 0) return "lost";
    if (!combat.started || combat.round < plan.armedRound! || combat.round > plan.dueRound!
        || (combat.round === plan.armedRound && combat.turn < plan.armedTurn!)
        || (combat.round === plan.dueRound && combat.turn > index)) return "missed";
    return combat.round === plan.dueRound && combat.turn === index ? "due" : "waiting";
  }
  async function syncRegion(scene: any, plan: Plan, center?: Point, active = false) {
    assertAuthority();
    const token = owner(scene, plan);
    const regions = markedRegions(scene, plan.tokenId, plan.id);
    if (!token || regions.length !== 1 || regions[0].id !== plan.regionIDs[0]
        || flag(regions[0], MARK_FLAG).actorUuid !== plan.actorUuid) {
      throw new Error("Blastback warning is incomplete or its owner changed. Clear and rearm the charge.");
    }
    const shape = circle(scene, token, center);
    const name = `${token.name} — Blastback ${active ? "resolved" : "charging"} (100 ft radius)`;
    const status = active ? "active" : "warning";
    if (regions[0].shapes?.length === 1 && Object.entries(shape).every(([key, value]) => regions[0].shapes[0][key] === value)
        && regions[0].name === name && flag(regions[0], MARK_FLAG).status === status) return;
    await scene.updateEmbeddedDocuments("Region", [{ _id: regions[0].id, shapes: [shape],
      name, color: active ? "#aa55ff" : AMBER, [`flags.${moduleId}.${MARK_FLAG}.status`]: status }]);
  }
  async function arm(session: Session, previous: Plan | null): Promise<boolean> {
    validate(session);
    const { scene, token, actorUuid } = session;
    const previousRaw = flag(scene, key(token.id)) ?? null;
    if (previousRaw !== null && (!previous || current(scene, previous)?.id !== previous.id)) return warn("Blastback changed; inspect it again before rearming.");
    cancelledTargets.delete(`${scene.id}:${token.id}`);
    const id = foundry.utils.randomID();
    let plan: Plan | null = null;
    try {
      const created = await scene.createEmbeddedDocuments("Region", [{
        name: `${token.name} — Blastback charging (100 ft radius)`, shapes: [circle(scene, token.document)],
        color: AMBER, highlightMode: "coverage", displayMeasurements: true, hidden: false,
        visibility: (globalThis as any).CONST.REGION_VISIBILITY.ALWAYS,
        ownership: { default: 2, [game.user.id]: 3 }, behaviors: [],
        flags: { pf2e: { areaShape: "burst" }, [moduleId]: { [MARK_FLAG]: { id, tokenId: token.id, actorUuid, status: "warning" } } },
      }]);
      validate(session);
      if (created.length !== 1) throw new Error("Blastback did not create its warning Region.");
      plan = { id, tokenId: token.id, actorUuid, status: "charging", bank: 0, ...schedule(scene, token.id),
        regionIDs: [created[0].id], messageId: foundry.utils.randomID(), claim: null, snapshotDamage: null, center: null };
      await save(scene, plan);
      validate(session);
      // Movement is allowed during arming; refresh the warning at the current position.
      await syncRegion(scene, plan);
      validate(session);
    } catch (error) {
      if (primaryGM()) {
        try {
          if (plan && current(scene, plan)) {
            if (previousRaw !== null) await scene.setFlag(moduleId, key(token.id), foundry.data.operators.ForcedReplacement.create(clone(previousRaw)));
            else await scene.unsetFlag(moduleId, key(token.id));
          }
        } catch (restoreError) { report(new Error(`Blastback rollback needs GM attention: ${String(restoreError)}`)); }
        finally { if (primaryGM()) await removeRegions(scene, token.id, id); }
      }
      throw error;
    }
    assertAuthority();
    const oldIds = markedRegions(scene, token.id).filter(r => flag(r, MARK_FLAG).id !== id).map(r => r.id);
    if (oldIds.length) await scene.deleteEmbeddedDocuments("Region", oldIds);
    ui.notifications.info("Blastback armed (1 action, once per day; track the sheet's daily use). Damage is taken normally; the bank will release on the next scheduled turn or after six world seconds outside combat. GM overrides remain available.");
    return true;
  }
  async function start(): Promise<boolean> {
    let session: Session | null = null;
    try {
      session = selectedContext();
      if ([...sessions].some(s => !s.cancelled && s.scene === session!.scene && s.token.id === session!.token.id)) return warn("Finish or cancel the current Blastback operation first.");
      sessions.add(session);
      const context = session;
      // Snapshot through the writer, but leave the dialog OUTSIDE the queue so
      // native damage, automatic release, and Clear continue while it is open.
      const original = await serial(async () => { validate(context); return read(context.scene, context.token.id); });
      if (original === false) return false;
      if (!original) {
        if (flag(context.scene, key(context.token.id)) != null) return warn("Malformed Blastback state. Use Clear Blastback before arming.");
        return !!(await serial(() => arm(context, null)));
      }
      const editable = collecting(original);
      const decision = await foundry.applications.api.DialogV2.wait({
        window: { title: "Blaster · Blastback" }, rejectClose: false,
        content: `<p>Bank: <strong>${original.bank}</strong> force damage. Status: ${original.status}.</p><p>Blaster takes damage normally. Native post-resistance damage is banked, including temporary HP. Manual HP edits and temporary-HP-only undo require a bank adjustment here.</p>${editable ? `<div class="form-group"><label>Banked damage</label><input type="number" name="bank" min="0" step="1" value="${original.bank}"></div><p>Saving applies your adjustment while retaining damage received since this dialog opened.</p>` : ""}<p>Rearm discards this charge and starts from zero (1 action, GM adjudicated). Clear removes it. If publication is uncertain, inspect chat history before explicitly rearming; the previous card is never retried.</p>`,
        buttons: [
          ...(editable ? [{ action: "save", label: "Save adjustment", default: true,
            callback: (_event: Event, button: any) => ({ action: "save", bank: button.form.elements.bank.value.trim() === "" ? NaN : Number(button.form.elements.bank.value) }) }] : []),
          { action: "rearm", label: "Rearm from zero", callback: () => ({ action: "rearm" }) },
          { action: "clear", label: "Clear", callback: () => ({ action: "clear" }) },
          { action: "cancel", label: "Cancel", callback: () => ({ action: "cancel" }) },
        ],
      });
      if (!decision || decision.action === "cancel") return false;
      if (decision.action === "clear") {
        validate(context);
        if (!current(context.scene, original)) return warn("Blastback changed while the dialog was open. Inspect it again.");
        const clearingContext = selectedContext();
        // Like the standalone Clear macro, cancel both running and queued release
        // before waiting for the writer. Never cancel a replacement plan.
        cancel(context.scene, context.token.id);
        return !!(await serial(async () => {
          validate(clearingContext);
          if (!current(context.scene, original)) return false;
          await erase(context.scene, original.tokenId);
          return true;
        }));
      }
      return !!(await serial(async () => {
        validate(context);
        const live = current(context.scene, original);
        if (!live || live.status !== original.status) return warn("Blastback changed while the dialog was open. Inspect it again.");
        if (decision.action === "rearm") return arm(context, live);
        if (decision.action !== "save" || !collecting(live) || !amount(decision.bank)) return warn("Enter a non-negative whole-number damage bank.");
        const bank = Math.max(0, live.bank + decision.bank - original.bank);
        if (!amount(bank)) return warn("The adjusted Blastback bank is too large.");
        await save(context.scene, { ...live, bank });
        return true;
      }));
    } catch (error) { return report(error); }
    finally { if (session) sessions.delete(session); }
  }
  async function card(token: any, damage: number) {
    const actor = token.actor;
    const action = actor.items?.find?.((item: any) => item.slug === ABILITY);
    const raw = `<h3>${foundry.utils.escapeHTML(token.name)} · Blastback</h3><p>100-foot radius, centered on Blaster at release. Banked damage: ${damage} force.</p><p>@Check[reflex|dc:40|basic|immutable|traits:magical,force] @Damage[${damage}[force]|immutable|traits:magical,force|options:area-damage]</p><p>Blaster is excluded. Each other creature in the area attempts one DC 40 basic Reflex save. Resolve cover and line of effect normally. Apply damage manually; this card never changes HP. The bank already includes damage actually taken; do not add damage dice or source bonuses.</p>`;
    const content = await game.pf2e.TextEditor.enrichHTML(raw, { rollData: action?.getRollData() ?? actor.getRollData(), relativeTo: action ?? actor });
    const wrapper = document.createElement("div");
    wrapper.innerHTML = content;
    const anchors = wrapper.querySelectorAll<HTMLAnchorElement>("a[data-damage-roll]");
    if (anchors.length !== 1) throw new Error("PF2e did not produce exactly one Blastback damage link; publication was stopped.");
    const anchor = anchors[0];
    // PF2e 8.7.1 adds elite/weak even with immutable. Its native inline handler
    // uses a plain typed DamageRoll when baseFormula is absent. Freeze that link
    // after actor enrichment: future clicks retain the saved amount and speaker.
    anchor.dataset.formula = anchor.dataset.damageRoll = `${damage}[force]`;
    delete anchor.dataset.baseFormula;
    delete anchor.dataset.tooltip;
    anchor.classList.remove("altered");
    anchor.textContent = `${damage} force`;
    anchor.setAttribute("aria-label", `${damage} force damage`);
    return { content: wrapper.innerHTML, origin: action?.getOriginData?.() };
  }
  async function firePlan(scene: any, original: Plan, automatic: boolean, session?: Session): Promise<boolean> {
    assertAuthority();
    const startedRevision = revision(scene, original.tokenId);
    const validateRelease = () => {
      assertAuthority();
      if (cancelled(scene, original.tokenId) || startedRevision !== revision(scene, original.tokenId)) throw new Error("Blastback release was cancelled.");
      if (session) validate(session);
    };
    let plan = current(scene, original);
    if (!plan || ["clearing", "fired"].includes(plan.status)) return false;
    if (cancelled(scene, plan.tokenId)) return false;
    const token = owner(scene, plan);
    if (!token) { await erase(scene, plan.tokenId); return false; }
    if (plan.status === "publishing") {
      const message = game.messages?.get(plan.messageId);
      const mark = flag(message, MARK_FLAG);
      if (mark?.id === plan.id && mark?.sceneId === scene.id && mark?.tokenId === plan.tokenId && mark?.actorUuid === plan.actorUuid) {
        await save(scene, { ...plan, status: "fired" });
      } else notice(plan.id, "Blastback publication is uncertain. Inspect chat history. No automatic or manual retry will occur; use Start to explicitly rearm from zero, or Clear.");
      return false;
    }
    if (automatic && (plan.status !== "charging" || timing(scene, plan) !== "due")) return false;
    validateRelease();
    const damage = plan.bank;
    // The durable claim is the release cutoff. Stop collecting before enriching
    // the card so damage arriving during publication belongs to normal HP only.
    const shape = circle(scene, token);
    const claimed: Plan = { ...plan, status: "publishing", claim: foundry.utils.randomID(), snapshotDamage: damage,
      center: { x: shape.x, y: shape.y } };
    await save(scene, claimed);
    let publicationStarted = false;
    try {
      validateRelease();
      const enriched = await card(token, damage);
      for (;;) {
        validateRelease();
        if (current(scene, claimed)?.claim !== claimed.claim || owner(scene, claimed) !== token) return false;
        const latest = circle(scene, token);
        if (latest.x !== claimed.center!.x || latest.y !== claimed.center!.y) {
          claimed.center = { x: latest.x, y: latest.y };
          await save(scene, claimed);
          validateRelease();
        }
        await syncRegion(scene, claimed, claimed.center!, true);
        validateRelease();
        if (current(scene, claimed)?.claim !== claimed.claim || owner(scene, claimed) !== token) return false;
        if (automatic && timing(scene, claimed) !== "due") throw new Error("Blastback's scheduled turn changed before publication. Fire manually or clear it.");
        const position = circle(scene, token);
        if (position.x === claimed.center!.x && position.y === claimed.center!.y) break;
      }
      publicationStarted = true;
      const message = await foundry.documents.ChatMessage.implementation.create({
        _id: claimed.messageId, speaker: foundry.documents.ChatMessage.getSpeaker({ token }), content: enriched.content,
        flags: { ...(enriched.origin ? { pf2e: { origin: enriched.origin } } : {}),
          [moduleId]: { [MARK_FLAG]: { id: claimed.id, sceneId: scene.id, tokenId: claimed.tokenId, actorUuid: claimed.actorUuid,
            sourceAbilitySlug: ABILITY, snapshotDamage: claimed.snapshotDamage, center: claimed.center } } },
      }, { keepId: true });
      if (!message) throw new Error("Blastback chat creation returned no document; inspect chat history. Publication will not be retried.");
      if (primaryGM() && current(scene, claimed)?.claim === claimed.claim) await save(scene, { ...claimed, status: "fired" });
      return true;
    } catch (error) {
      if (!publicationStarted && primaryGM() && current(scene, claimed)?.claim === claimed.claim) {
        await save(scene, { ...claimed, status: "recovery", claim: null, snapshotDamage: null, center: null });
      }
      if (publicationStarted) notice(claimed.id, "Blastback publication may have succeeded. Inspect chat history; retries are blocked to prevent duplicate cards.");
      throw error;
    }
  }
  async function fire(): Promise<boolean> {
    let session: Session | null = null;
    try {
      session = selectedContext(); sessions.add(session);
      const context = session;
      return !!(await serial(async () => {
        validate(context);
        const plan = read(context.scene, context.token.id);
        if (!plan) return warn("This Blaster has no valid Blastback charge.");
        return firePlan(context.scene, plan, false, context);
      }));
    } catch (error) { return report(error); }
    finally { if (session) sessions.delete(session); }
  }
  async function clear(): Promise<boolean> {
    try {
      const context = selectedContext();
      cancel(context.scene, context.token.id);
      return !!(await serial(async () => { validate(context); await erase(context.scene, context.token.id); return true; }));
    } catch (error) { return report(error); }
  }
  function onDamage(actor: any, _changed: any, options: any) {
    if (!primaryGM() || !actor?.uuid || flag(actor, "blasterRole") !== "blaster") return;
    const nativeAmount = options?.damageTaken;
    if (typeof nativeAmount !== "number" || !Number.isSafeInteger(nativeAmount)) return;
    const delta = options.damageUndo ? Math.min(0, nativeAmount) : Math.max(0, nativeAmount);
    if (!delta) return; // Healing, healing undo, zero, and ordinary/manual HP updates.
    // Capture identities at event arrival so a queued update cannot enter a new charge.
    const targets: { scene: any; plan: Plan }[] = [];
    for (const scene of contents(game.scenes)) for (const tokenId of Object.keys(planMap(scene))) {
      const plan = read(scene, tokenId);
      if (plan && collecting(plan) && plan.actorUuid === actor.uuid && owner(scene, plan)?.actor === actor) targets.push({ scene, plan });
    }
    return serial(async () => {
      if (!primaryGM()) {
        for (const { plan } of targets) warn(`GM authority changed before a native Blastback bank adjustment (${delta > 0 ? "+" : ""}${delta}, token ${plan.tokenId}) was saved. Inspect the bank with the active GM; this event will not be replayed automatically.`);
        return;
      }
      for (const { scene, plan } of targets) {
        const live = current(scene, plan);
        if (!live || !collecting(live) || owner(scene, live)?.actor !== actor) continue;
        const bank = Math.max(0, live.bank + delta);
        if (!amount(bank)) { notice(live.id, "Blastback bank exceeded the safe numeric range. Inspect and adjust it manually."); continue; }
        await save(scene, { ...live, bank });
      }
    });
  }
  async function reconcile() {
    if (!primaryGM()) return;
    for (const scene of contents(game.scenes)) {
      // A disconnected GM can leave a successfully created Region before its
      // plan commit. Reconcile only our tagged or superseded orphan warnings.
      const orphans = contents(scene.regions).filter(region => {
        const mark = flag(region, MARK_FLAG);
        if (!safeId(mark?.id) || !safeId(mark?.tokenId) || typeof mark?.actorUuid !== "string") return false;
        const raw = planMap(scene)[mark.tokenId] as Partial<Plan> | undefined;
        return !raw || raw.id !== mark.id;
      });
      if (orphans.length) {
        try { assertAuthority(); await scene.deleteEmbeddedDocuments("Region", orphans.map(region => region.id)); }
        catch (error) { report(error); }
      }
      for (const [tokenId, raw] of Object.entries(planMap(scene))) {
        if (!primaryGM()) return;
        if (!validPlan(raw, tokenId)) { notice(`${scene.id}:${tokenId}`, "Ignored malformed Blastback state. Select its token and use Clear Blastback."); continue; }
        try {
          let plan = read(scene, tokenId);
          if (!plan) continue;
          if (!owner(scene, plan) || plan.status === "clearing") { await erase(scene, tokenId); continue; }
          if (cancelled(scene, tokenId)) continue;
          if (plan.status === "publishing") { await firePlan(scene, plan, false); continue; }
          if (!collecting(plan)) continue;
          const when = timing(scene, plan);
          if (when === "lost") { await erase(scene, tokenId); continue; }
          if (when === "missed" && plan.status === "charging") {
            plan = { ...plan, status: "recovery" };
            await save(scene, plan);
            notice(plan.id, "Blastback's scheduled turn was missed or rewound. The bank remains armed; fire manually or clear it.");
          }
          if (plan.status === "charging" && when === "due") await firePlan(scene, plan, true);
          else await syncRegion(scene, plan);
        } catch (error) { report(error); }
      }
    }
  }
  async function ready(): Promise<void> {
    if (!registered) {
      registered = true;
      Hooks.on("updateActor", onDamage);
      Hooks.on("createRegion", (region: any) => {
        if (flag(region, MARK_FLAG)) return serial(reconcile);
      });
      Hooks.on("combatTurnChange", () => serial(reconcile));
      Hooks.on("updateCombat", () => serial(reconcile));
      Hooks.on("updateCombatant", () => serial(reconcile));
      Hooks.on("deleteCombatant", () => serial(reconcile));
      Hooks.on("updateWorldTime", () => serial(reconcile));
      Hooks.on("updateToken", (_token: any, changed: any) => {
        if (["x", "y", "width", "height", "elevation", "actorId", "actorLink"].some(key => key in changed)) return serial(reconcile);
      });
      Hooks.on("deleteToken", (token: any) => {
        cancel(token.parent, token.id);
        return serial(async () => { if (primaryGM()) await erase(token.parent, token.id); });
      });
      Hooks.on("deleteCombat", (combat: any) => {
        for (const scene of contents(game.scenes)) for (const [tokenId, raw] of Object.entries(planMap(scene))) {
          if (validPlan(raw, tokenId) && raw.combatUuid === combatUuid(combat)) cancel(scene, tokenId);
        }
        return serial(async () => {
          if (!primaryGM()) return;
          for (const scene of contents(game.scenes)) for (const [tokenId, raw] of Object.entries(planMap(scene))) {
            if (validPlan(raw, tokenId) && raw.combatUuid === combatUuid(combat)) await erase(scene, tokenId);
          }
        });
      });
      Hooks.on("deleteScene", (scene: any) => cancel(scene));
      Hooks.on("deleteActor", () => serial(reconcile));
      Hooks.on("userConnected", () => serial(reconcile));
      Hooks.on("updateUser", () => serial(reconcile));
      Hooks.on("canvasReady", () => {
        for (const session of sessions) if (canvas.scene !== session.scene) session.cancelled = true;
        return serial(reconcile);
      });
      void serial(reconcile);
    }
    while (jobs.size) await Promise.all([...jobs]);
  }
  return { start, fire, clear, ready };
}
