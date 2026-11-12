import type { ModuleFeature } from "./feature.js";
import {
  acceptBeamRoll, beamMeetingPoint, canSubmitBeamRoll, isBeamSide, readBeamClash,
  type BeamClashState, type BeamSide,
} from "./beam-clash-model.js";

const FLAG = "beamClash";
const REQUEST = "beamClashRequests";
const REQUEST_SLOTS = ["control", "red", "blue"] as const;
const SIDES = ["red", "blue"] as const;
// Database keys retain JB2A's ranged-template alignment metadata. The ranged
// Beam002 clips have no published internal-loop markers. Both exact 30ft previews
// at library.jb2a.com were inspected at 30fps: 1500-2100ms is fully extended,
// before the 2300ms collapse. Keep the launch once, then loop just that window.
// Verified: Jules-Bens-Aa/jb2a-databases @ 17ee6e0, jb2a_patreon/scripts/jb2a_sequencer.js.
const PATREON_FILES = {
  red: "jb2a.ranged.beam.002.03.red.30ft",
  blue: "jb2a.ranged.beam.002.03.blue.30ft",
};
const FREE_FILE = "jb2a.energy_beam.normal.bluepink.03.30ft";
const AURA_FILE = "jb2a.static_electricity.02.dark_purple";
const RANGED_LOOP = { start: 1500, end: 2100 };
const RANGED_END = 3033;
type Intent = {
  version: 1; action: "start" | "stop" | "roll"; sceneId: string; clashId: string | null;
  round?: number; side?: BeamSide;
  redTokenId?: string; blueTokenId?: string; redFile?: string; blueFile?: string;
};
type UserIntent = Intent & { id: string };
type EffectIdentity = { name: string; sceneId: string };

/**
 * Integration: register this ModuleFeature and include styles/beam-clash.css.
 * Macro: await game.modules.get(MODULE_ID).api.beamClash.start();
 * start()/stop()/roll() update bounded request slots on the requesting User document.
 * The native updateUser origin authenticates the sender; no chat messages are created.
 * No socket payload, client die, or claimed user ID is an authority boundary.
 * Foundry 14.370: User.setFlag/updateUser, Users.activeGM, Scene flags, Roll.evaluate,
 * TokenDocument.getCenterPoint, Canvas.animatePan and standard document/canvas hooks.
 */
export function createBeamClashFeature(moduleId: string): ModuleFeature {
  const globals = globalThis as any;
  const stateOf = (scene: any): BeamClashState | null => readBeamClash(scene?.getFlag(moduleId, FLAG));
  const isAuthority = (): boolean => !!game.user?.isGM && game.users?.activeGM?.id === game.user.id;
  const sequencer = () => globals.Sequencer;
  const notify = (message: string) => ui.notifications?.warn(`Beam Clash: ${message}`);
  const logError = (error: unknown) => console.error(`${moduleId} | Beam Clash`, error);
  const setting = (side: BeamSide) => `beamClash${side === "red" ? "Red" : "Blue"}File`;
  const effectPrefix = `${moduleId}.beam-clash.`;
  const pending = new Set<string>();
  let initialized = false;
  let listening = false;
  let queue: Promise<unknown> = Promise.resolve();
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let root: HTMLDivElement | undefined;
  let activeEffect: EffectIdentity | undefined;
  let activeAura: EffectIdentity | undefined;
  let auraSignature = "";
  let effectSignature = "";
  let effectSerial = 0;
  let visualGeneration = 0;
  let pannedClash = "";
  let canvasAvailable = true;
  let openingEffect: { name: string; clashId: string } | undefined;
  const openedClashes = new Set<string>();
  const pendingSeeks = new Set<number>();

  function enqueue(task: () => Promise<unknown>): Promise<unknown> {
    const result = queue.then(task);
    queue = result.catch(logError); // One failed document request must not poison the queue.
    return result;
  }

  function filesProblem(red: string, blue: string): string | null {
    if (!game.modules?.get("sequencer")?.active || typeof globals.Sequence !== "function"
      || !sequencer()?.EffectManager?.endEffects || !sequencer()?.Database?.getEntry) {
      return "Enable Sequencer (and its required dependencies), then reload the world.";
    }
    if (!game.modules?.get("jb2a_patreon")?.active && !game.modules?.get("JB2A_DnD5e")?.active) {
      return "Enable JB2A Free Content or JB2A Patreon, then reload the world.";
    }
    for (const [side, key] of [["red", red], ["blue", blue]]) {
      try {
        if (key?.startsWith("jb2a.") && sequencer().Database.getEntry(key, { softFail: true })) continue;
      } catch { /* Report one actionable start warning instead of failing module startup. */ }
      return `The ${side} animation key is unavailable. In Module Settings, set Beam Clash ${side} beam to auto or an installed jb2a key from Sequencer's Database Viewer. Auto uses the Patreon ranged beam with a sustained loop, or the original energy beam at 2x speed.`;
    }
    return null;
  }

  function selectedFile(side: BeamSide): string {
    const configured = String(game.settings.get(moduleId, setting(side)) ?? "").trim();
    if (!configured || configured === "auto") {
      return game.modules?.get("jb2a_patreon")?.active ? PATREON_FILES[side] : FREE_FILE;
    }
    // Accept the exact reference paths too, but resolve them to database keys so
    // the source/impact offsets are retained when stretching to the clash point.
    const color = side === "red" ? "Red" : "Blue";
    if (configured === `modules/jb2a_patreon/Library/Generic/RangedSpell/Beam/Beam002_03_Regular_${color}_30ft_1600x400.webm`) {
      return PATREON_FILES[side];
    }
    return configured;
  }

  function auraAvailable(): boolean {
    try { return !!sequencer()?.Database?.getEntry(AURA_FILE, { softFail: true }); }
    catch { return false; }
  }

  function rangedLoopFile(side: BeamSide): string | null {
    const database = sequencer()?.Database;
    const namespace = `${moduleId}-beam-clash`;
    const key = `${namespace}.${side}`;
    try {
      if (database?.getEntry(key, { softFail: true })) return key;
      if (typeof database?.registerEntries !== "function") return null;
      // Resolve the installed database's real files (including a custom asset
      // prefix), without mutating JB2A's entries or bundling its Patreon videos.
      const files: Record<string, string> = {};
      for (const color of SIDES) {
        const entry = database.getEntry(PATREON_FILES[color], { softFail: true });
        // An exact .30ft lookup may still return a range file whose no-argument
        // getFile() defaults to 15ft. Other Sequencer versions return a string.
        const path = typeof entry === "string" ? entry : entry?.getFile?.("30ft");
        const title = color === "red" ? "Red" : "Blue";
        if (typeof path !== "string" || !path.endsWith(`Beam002_03_Regular_${title}_30ft_1600x400.webm`)) return null;
        files[color] = path;
      }
      database.registerEntries(namespace, {
        _templates: { ranged: [200, 200, 200] }, _template: "ranged",
        // End immediately on re-aim/stop instead of playing the outro while the
        // replacement beam is already extending to a different meeting point.
        _markers: { loop: { ...RANGED_LOOP }, forcedEnd: RANGED_END }, ...files,
      }, true);
      return database.getEntry(key, { softFail: true }) ? key : null;
    } catch (error) { logError(error); return null; }
  }

  function currentScene(): any {
    return canvasAvailable && canvas?.ready ? canvas.scene : null;
  }

  function tokenPair(scene: any, state: Pick<BeamClashState, "redTokenId" | "blueTokenId">): any[] | null {
    const red = scene?.tokens?.get(state.redTokenId);
    const blue = scene?.tokens?.get(state.blueTokenId);
    return red && blue && red.id !== blue.id ? [red, blue] : null;
  }

  function authorOf(user: any, initiatingUserId?: string): any {
    const id = user?.id;
    // Players can update their own User flags, not another user's. Require the
    // server update origin too; payload user IDs are never trusted. Recovery
    // conservatively ignores a User document last edited by somebody else.
    const origin = initiatingUserId ?? user?._stats?.lastModifiedBy;
    if (!id || !origin || origin !== id) return null;
    return game.users?.get(id) === user ? user : null;
  }

  async function createIntent(intent: Intent): Promise<UserIntent> {
    const request = { ...intent, id: foundry.utils.randomID() };
    const slot = intent.action === "roll" ? intent.side! : "control";
    // Separate dotted slots prevent simultaneous GM rolls for both sides from
    // overwriting each other. Only three small request records persist per user.
    await game.user.setFlag(moduleId, `${REQUEST}.${slot}`, request);
    return request;
  }

  function changedPath(change: any, path: string[]): boolean {
    if (!change || typeof change !== "object") return false;
    for (let count = path.length; count > 0; count -= 1) {
      const key = path.slice(0, count).join(".");
      if (Object.prototype.hasOwnProperty.call(change, key)) {
        return count === path.length || changedPath(change[key], path.slice(count));
      }
    }
    return false;
  }

  function receiveRequests(user: any, changed: any, userId?: string): void {
    if (!userId || !authorOf(user, userId)) return;
    for (const slot of REQUEST_SLOTS) {
      if (!changedPath(changed, ["flags", moduleId, REQUEST, slot])) continue;
      const value = user.getFlag(moduleId, REQUEST)?.[slot];
      if (!value || (slot === "control" ? !["start", "stop"].includes(value.action) : value.action !== "roll" || value.side !== slot)) continue;
      // Capture at the native hook, before a later update changes this User.
      const intent = structuredClone(value);
      void enqueue(() => handleIntent(user, intent, userId)).catch(logError);
    }
  }

  async function start(): Promise<any> {
    if (!game.user?.isGM) { notify("Only a GM can start a clash."); return null; }
    const scene = currentScene();
    const controlled = canvas?.tokens?.controlled ?? [];
    const targets: any[] = Array.from(game.user.targets ?? []);
    if (!scene || controlled.length !== 1 || targets.length !== 1) {
      notify("Select exactly one red token and target exactly one different blue token on the viewed scene."); return null;
    }
    const red = controlled[0].document;
    const blue = targets[0].document;
    if (red?.parent?.id !== scene.id || blue?.parent?.id !== scene.id || red.id === blue.id || !red.actor || !blue.actor) {
      notify("Choose two different tokens on this scene, each with an actor."); return null;
    }
    const redFile = selectedFile("red");
    const blueFile = selectedFile("blue");
    const problem = filesProblem(redFile, blueFile);
    if (problem) { notify(problem); return null; }
    if (stateOf(scene)?.status === "active") { notify("This scene already has a clash. Stop it before starting another."); return null; }
    const key = `start:${scene.id}`;
    if (pending.has(key)) return null;
    pending.add(key);
    try {
      if (!auraAvailable()) notify("The purple static-electricity overlay is unavailable in this JB2A installation. The clash will still run without it.");
      return await createIntent({ version: 1, action: "start", sceneId: scene.id, clashId: stateOf(scene)?.id ?? null,
        redTokenId: red.id, blueTokenId: blue.id, redFile, blueFile });
    } finally { pending.delete(key); }
  }

  async function stop(): Promise<any> {
    if (!game.user?.isGM) { notify("Only a GM can stop a clash."); return null; }
    const scene = currentScene();
    const state = stateOf(scene);
    if (!state || state.status === "stopped") return null;
    return createIntent({ version: 1, action: "stop", sceneId: scene.id, clashId: state.id });
  }

  async function roll(side: BeamSide = game.user?.isGM ? "red" : "blue"): Promise<any> {
    const scene = currentScene();
    const state = stateOf(scene);
    if (!isBeamSide(side) || !state || state.status !== "active") return null;
    const pair = tokenPair(scene, state);
    if (!pair || !canSubmitBeamRoll(side, game.user, pair[side === "red" ? 0 : 1].actor)) return null;
    if (!game.users.activeGM) { notify("A GM must be connected to adjudicate rolls."); return null; }
    const key = `${state.id}:${state.round}:${side}`;
    if (pending.has(key) || state[side]) return null;
    pending.add(key); // Synchronous, before the first await, including double clicks.
    renderControls(scene, state);
    try {
      return await createIntent({ version: 1, action: "roll", sceneId: scene.id,
        clashId: state.id, round: state.round, side });
    } finally {
      // A rejected permission check or failed GM write must leave a same-round retry possible.
      // The persisted side slot and request-ID ledger, not this UI latch, enforce exactly one result.
      pending.delete(key);
      renderControls(scene, stateOf(scene));
    }
  }

  /** Every write, including cleanup, runs on this same active-GM queue. */
  async function handleIntent(user: any, intent: UserIntent, initiatingUserId?: string, recover = false): Promise<void> {
    if (!isAuthority() || !intent || typeof intent.id !== "string" || !intent.id
      || intent.version !== 1 || typeof intent.sceneId !== "string") return;
    const author = authorOf(user, initiatingUserId);
    const scene = game.scenes.get(intent.sceneId);
    if (!author || !scene) return;
    const state = stateOf(scene);
    if (recover && intent.action !== "roll") return; // Never replay old GM start/stop commands on login.
    if (intent.action === "start") {
      if (!author.isGM || state?.status === "active" || intent.clashId !== (state?.id ?? null)
        || typeof intent.redTokenId !== "string" || typeof intent.blueTokenId !== "string"
        || typeof intent.redFile !== "string" || typeof intent.blueFile !== "string") return;
      const pair = tokenPair(scene, { redTokenId: intent.redTokenId, blueTokenId: intent.blueTokenId });
      if (!pair || !pair[0].actor || !pair[1].actor) return;
      const problem = filesProblem(intent.redFile, intent.blueFile);
      if (problem) { notify(problem); return; }
      const next: BeamClashState = {
        version: 1, id: intent.id, sceneId: scene.id, redTokenId: intent.redTokenId,
        blueTokenId: intent.blueTokenId, redFile: intent.redFile, blueFile: intent.blueFile,
        status: "active", round: 1, score: 0, revision: 0, red: null, blue: null,
        lastRound: null, winner: null, processed: [],
      };
      if (isAuthority()) await scene.setFlag(moduleId, FLAG, next);
      return;
    }
    if (!state || state.sceneId !== scene.id || state.status === "stopped" || state.id !== intent.clashId) return;
    if (intent.action === "stop") {
      if (author.isGM && isAuthority()) await scene.setFlag(moduleId, FLAG, { ...state, status: "stopped", revision: state.revision + 1 });
      return;
    }
    const side = intent.side;
    const pair = tokenPair(scene, state);
    if (state.status !== "active" || intent.action !== "roll" || !isBeamSide(side) || !Number.isInteger(intent.round)
      || intent.round !== state.round || state[side] || state.processed.includes(intent.id)
      || !pair || !canSubmitBeamRoll(side, author, pair[side === "red" ? 0 : 1].actor)) return;
    const expectedId = state.id;
    const expectedRevision = state.revision;
    const die = await new foundry.dice.Roll("1d20").evaluate({ allowInteractive: false });
    // Leadership, permissions or state may have changed while the die was evaluating.
    const current = stateOf(scene);
    if (!isAuthority() || !current || current.id !== expectedId || current.revision !== expectedRevision
      || current.status !== "active" || !tokenPair(scene, current)
      || !canSubmitBeamRoll(side, game.users.get(author.id), scene.tokens.get(side === "red" ? current.redTokenId : current.blueTokenId)?.actor)) return;
    const next = acceptBeamRoll(current, side, intent.round!, { requestId: intent.id, authorId: author.id, total: die.total });
    if (!next) return;
    await scene.setFlag(moduleId, FLAG, next);
  }

  async function repairScene(scene: any): Promise<void> {
    const state = stateOf(scene);
    if (isAuthority() && state?.status === "active" && !tokenPair(scene, state)) {
      await scene.setFlag(moduleId, FLAG, { ...state, status: "stopped", revision: state.revision + 1 });
    }
  }

  function recoverAuthority(): void {
    if (recoveryTimer) clearTimeout(recoveryTimer);
    // Coalesce connection/election events. Re-read activeGM inside the queue after settling.
    recoveryTimer = setTimeout(() => {
      recoveryTimer = undefined;
      void enqueue(async () => {
        if (!isAuthority()) return;
        for (const scene of game.scenes.contents) await repairScene(scene);
        for (const user of game.users.contents) {
          const requests = user.getFlag(moduleId, REQUEST);
          for (const side of SIDES) {
            if (requests?.[side]?.side === side) await handleIntent(user, structuredClone(requests[side]), undefined, true);
          }
        }
      }).catch(logError);
    }, 200);
  }

  async function endEffects(identity?: EffectIdentity): Promise<void> {
    if (identity && sequencer()?.EffectManager?.endEffects) {
      // Sequencer source: endEffects(inFilter = {}, push = true). Never broadcast local cleanup.
      const filter = game.scenes.get(identity.sceneId) ? identity : { name: identity.name };
      await sequencer().EffectManager.endEffects(filter, false);
    }
  }

  function clearAnimations(): void {
    visualGeneration += 1;
    const old = activeEffect;
    const oldAura = activeAura;
    activeEffect = undefined;
    activeAura = undefined;
    openingEffect = undefined;
    auraSignature = "";
    effectSignature = "";
    for (const frame of pendingSeeks) cancelAnimationFrame(frame);
    pendingSeeks.clear();
    void endEffects(old).catch(logError);
    void endEffects(oldAura).catch(logError);
  }

  function clearVisuals(): void {
    clearAnimations();
    pannedClash = "";
    root?.remove();
    root = undefined;
    pending.clear();
  }

  function center(token: any): { x: number; y: number } {
    const point = token.getCenterPoint();
    return { x: point.x, y: point.y };
  }

  function screenPoint(point: { x: number; y: number }): { x: number; y: number } {
    const screen = canvas.stage.toGlobal(point);
    // PIXI coordinates use logical renderer pixels. DOM controls use viewport CSS pixels.
    // V14 exposes Canvas.app (PIXI Application); view is the v7 canvas, canvas the v8 equivalent.
    const view = canvas.app?.canvas ?? canvas.app?.view;
    const rect = view?.getBoundingClientRect?.();
    const width = canvas.app?.renderer?.screen?.width ?? canvas.screenDimensions?.[0];
    const height = canvas.app?.renderer?.screen?.height ?? canvas.screenDimensions?.[1];
    if (!rect || !rect.width || !rect.height || !(width > 0) || !(height > 0)) return screen;
    return { x: rect.left + screen.x * rect.width / width, y: rect.top + screen.y * rect.height / height };
  }

  function positionControls(): void {
    const scene = currentScene();
    const state = stateOf(scene);
    const pair = state && tokenPair(scene, state);
    if (!root || !pair || !canvas.stage) return;
    for (let i = 0; i < SIDES.length; i += 1) {
      const button = root.querySelector<HTMLButtonElement>(`[data-side="${SIDES[i]}"]`);
      const token = pair[i];
      const point = center(token);
      point.y += (token.object?.h ?? token.height * scene.grid.size) / 2;
      const screen = screenPoint(point);
      if (button) {
        button.style.left = `${screen.x}px`;
        button.style.top = `${screen.y + 12}px`;
      }
      const indicator = root.querySelector<HTMLElement>(`[data-indicator="${SIDES[i]}"]`);
      const top = center(token);
      top.y -= (token.object?.h ?? token.height * scene.grid.size) / 2;
      const above = screenPoint(top);
      if (indicator) {
        indicator.style.left = `${above.x}px`;
        indicator.style.top = `${above.y - 10}px`;
      }
    }
    const midpoint = beamMeetingPoint(center(pair[0]), center(pair[1]), state!.status === "finished" ? 0 : state!.score);
    const screen = screenPoint(midpoint);
    const score = root.querySelector<HTMLElement>(".astillon-beam-clash__score");
    if (score) { score.style.left = `${screen.x}px`; score.style.top = `${screen.y - 40}px`; }
  }

  function renderControls(scene: any, state: BeamClashState | null): void {
    if (!state || state.status === "stopped" || currentScene()?.id !== scene?.id) return;
    const pair = tokenPair(scene, state);
    if (!pair || typeof document === "undefined") return;
    if (!root) {
      root = document.createElement("div");
      root.className = "astillon-beam-clash";
      root.setAttribute("aria-label", "Beam Clash");
      for (const side of SIDES) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `astillon-beam-clash__roll astillon-beam-clash__roll--${side}`;
        button.dataset.side = side;
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("class", "astillon-beam-clash__icon");
        icon.setAttribute("viewBox", "0 0 32 34");
        icon.innerHTML = '<path d="M16 1 30 9v16L16 33 2 25V9Z M16 1 6 24h20L16 1 M2 9l4 15-4 1m28-16-4 15 4 1M6 24l10 9 10-9"/><text x="16" y="21" text-anchor="middle">20</text>';
        icon.setAttribute("aria-hidden", "true");
        const copy = document.createElement("span");
        copy.className = "astillon-beam-clash__copy";
        for (const part of ["name", "label", "hint"]) {
          const text = document.createElement("span");
          text.className = `astillon-beam-clash__${part}`;
          copy.append(text);
        }
        button.append(icon, copy);
        button.addEventListener("click", () => { void roll(side).catch(logError); });
        root.append(button);
        const indicator = document.createElement("div");
        indicator.className = `astillon-beam-clash__indicator astillon-beam-clash__indicator--${side}`;
        indicator.dataset.indicator = side;
        indicator.setAttribute("role", "status");
        const die = document.createElement("span");
        die.className = "astillon-beam-clash__die";
        indicator.append(die);
        const pips = document.createElement("span");
        pips.className = "astillon-beam-clash__pips";
        pips.setAttribute("aria-hidden", "true");
        for (let pip = 0; pip < 3; pip += 1) pips.append(document.createElement("i"));
        indicator.append(pips);
        for (const part of ["round", "remaining"]) {
          const text = document.createElement("span");
          text.className = `astillon-beam-clash__indicator-${part}`;
          indicator.append(text);
        }
        root.append(indicator);
      }
      const score = document.createElement("div");
      score.className = "astillon-beam-clash__score";
      score.setAttribute("role", "status");
      root.append(score);
      document.body.append(root);
    }
    for (const key of pending) {
      if (!key.startsWith(`${state.id}:${state.round}:`)) pending.delete(key);
    }
    for (let i = 0; i < SIDES.length; i += 1) {
      const side = SIDES[i];
      const button = root.querySelector<HTMLButtonElement>(`[data-side="${side}"]`)!;
      const submitted = state[side];
      const sending = pending.has(`${state.id}:${state.round}:${side}`);
      const allowed = canSubmitBeamRoll(side, game.user, pair[i].actor);
      button.hidden = state.status === "finished";
      button.disabled = state.status !== "active" || !!submitted || sending || !game.users.activeGM || !allowed;
      button.dataset.state = submitted ? "rolled" : sending ? "pending" : button.disabled ? "locked" : "ready";
      button.querySelector<HTMLElement>(".astillon-beam-clash__name")!.textContent = pair[i].name;
      button.querySelector<HTMLElement>(".astillon-beam-clash__label")!.textContent = submitted ? `d20: ${submitted.total}` : sending ? "Rolling…" : "Roll d20";
      button.querySelector<HTMLElement>(".astillon-beam-clash__hint")!.textContent = submitted ? "Waiting for other roll"
        : sending ? "Submitting roll" : !game.users.activeGM ? "Waiting for GM"
          : !allowed ? "Owner / GM only"
            : side === "blue" && game.user.isGM ? "GM · roll for player" : "Click to push the beam";
      button.title = `GM or this actor's owner: roll for ${pair[i].name}`;
      button.setAttribute("aria-label", `${submitted ? `Rolled ${submitted.total}` : "Roll d20"} for ${pair[i].name}`);
      button.setAttribute("aria-busy", String(sending));
      const indicator = root.querySelector<HTMLElement>(`[data-indicator="${side}"]`)!;
      const currentPair = !!state.red || !!state.blue;
      const result = currentPair ? submitted : state.lastRound?.[side];
      const round = currentPair || !state.lastRound ? state.round : state.lastRound.round;
      const lead = state.score * (side === "red" ? 1 : -1);
      const remaining = 3 - lead;
      const finished = state.status === "finished";
      const won = finished && state.winner === side;
      indicator.dataset.state = finished ? (won ? "won" : "lost") : result ? "rolled" : "waiting";
      indicator.querySelector<HTMLElement>(".astillon-beam-clash__die")!.textContent = result ? String(result.total) : "—";
      indicator.querySelectorAll<HTMLElement>(".astillon-beam-clash__pips i").forEach((pip, index) => {
        pip.classList.toggle("filled", index < Math.max(0, lead));
      });
      indicator.querySelector<HTMLElement>(".astillon-beam-clash__indicator-round")!.textContent = `Round ${round}${result ? " · d20" : " · waiting"}`;
      indicator.querySelector<HTMLElement>(".astillon-beam-clash__indicator-remaining")!.textContent = finished
        ? won ? "WINNER" : "DEFEATED" : `${remaining} ${remaining === 1 ? "push" : "pushes"} to win`;
      indicator.setAttribute("aria-label", `${pair[i].name}: ${result ? `rolled ${result.total}` : "waiting to roll"}, round ${round}. ${finished ? won ? "Winner" : "Defeated" : `${remaining} ${remaining === 1 ? "push" : "pushes"} to win`}.`);
    }
    root.querySelector<HTMLElement>(".astillon-beam-clash__score")!.textContent =
      state.status === "finished" ? `${pair[state.winner === "red" ? 0 : 1].name} wins the clash!`
        : `Round ${state.round} · ${state.score > 0 ? "+" : ""}${state.score} · First to ±3`;
    positionControls();
  }

  function fitView(scene: any, state: BeamClashState, pair: any[]): void {
    if (pannedClash === state.id) return;
    pannedClash = state.id;
    const red = center(pair[0]);
    const blue = center(pair[1]);
    const size = scene.grid.size;
    const width = Math.abs(red.x - blue.x) + Math.max(pair[0].width, pair[1].width) * size;
    const height = Math.abs(red.y - blue.y) + Math.max(pair[0].height, pair[1].height) * size;
    const [screenWidth, screenHeight] = canvas.screenDimensions;
    const scale = Math.max(0.001, Math.min(1.5, Math.max(100, screenWidth - 360) / (width + 200),
      Math.max(100, screenHeight - 240) / (height + 200)));
    void Promise.resolve(canvas.animatePan({ x: (red.x + blue.x) / 2, y: (red.y + blue.y) / 2, scale, duration: 600 })).catch(logError);
  }

  function renderAura(scene: any, state: BeamClashState, selected: any): void {
    // Separate lifetime from the beams: score changes must not restart the overlay.
    // Attachment handles position/scale/visibility; no document flags are stored.
    const signature = JSON.stringify([scene.id, state.id, selected.id]);
    if (signature === auraSignature || !selected.object || !auraAvailable()) return;
    auraSignature = signature;
    const old = activeAura;
    const identity = { name: `${effectPrefix}${game.user.id}.${state.id}.aura.${++effectSerial}`, sceneId: scene.id };
    activeAura = identity;
    void (async () => {
      await endEffects(old);
      if (activeAura !== identity || currentScene()?.id !== scene.id) return;
      const sequence = new globals.Sequence({ moduleName: moduleId });
      sequence.effect().file(AURA_FILE).attachTo(selected.object, { bindRotation: false })
        .scaleToObject(1.6).name(identity.name).persist().temporary();
      void sequence.play({ local: true }).catch(logError);
    })().catch(logError);
  }

  function restoreLoopSeek(effect: any): void {
    const data = effect?.data;
    if (data?.name !== activeEffect?.name || data?.time?.start?.value !== RANGED_LOOP.start
      || data?.time?.end?.value !== RANGED_LOOP.end || data?.time?.isRange !== true) return;
    // Sequencer d8529e7's startup clock correction can replace timeRange's seek
    // with a small zero-based offset. Its create hook fires BEFORE initialization.
    // Once ready, use the source-verified public mediaCurrentTime accessor to
    // restore only our trimmed beam if necessary. No private engine methods,
    // broadcast updates, persistent document writes, or perpetual ticker.
    const deadline = Date.now() + 15000;
    let frame = 0;
    const restore = () => {
      pendingSeeks.delete(frame);
      if (data.name !== activeEffect?.name || data.sceneId !== currentScene()?.id || effect.destroyed) return;
      if (effect.ready) {
        if (effect.mediaCurrentTime < RANGED_LOOP.start / 1000 || effect.mediaCurrentTime >= RANGED_LOOP.end / 1000) {
          effect.mediaCurrentTime = RANGED_LOOP.start / 1000;
        }
        return;
      }
      if (Date.now() < deadline) {
        frame = requestAnimationFrame(restore);
        pendingSeeks.add(frame);
      }
    };
    frame = requestAnimationFrame(restore);
    pendingSeeks.add(frame);
  }

  function redraw(): void {
    const scene = currentScene();
    const state = stateOf(scene);
    const pair = state && tokenPair(scene, state);
    if (!state || state.status === "stopped" || state.sceneId !== scene.id || !pair) { clearVisuals(); return; }
    renderControls(scene, state);
    if (state.status === "finished") { clearAnimations(); return; }
    fitView(scene, state, pair);
    // Missing optional dependencies are silent outside start(); controls and shared state still work.
    if (filesProblem(state.redFile, state.blueFile)) return;
    renderAura(scene, state, pair[0]);
    const red = center(pair[0]);
    const blue = center(pair[1]);
    const signature = JSON.stringify([state.id, state.score, state.redFile, state.blueFile, red, blue]);
    if (signature === effectSignature) return;
    const showOpener = !openedClashes.has(state.id) && state.round === 1 && state.score === 0 && !state.red && !state.blue;
    effectSignature = signature;
    const generation = ++visualGeneration;
    const old = activeEffect;
    const identity = { name: `${effectPrefix}${game.user.id}.${state.id}.${++effectSerial}`, sceneId: scene.id };
    activeEffect = identity;
    openingEffect = showOpener ? { name: identity.name, clashId: state.id } : undefined;
    void (async () => {
      await endEffects(old);
      if (generation !== visualGeneration || currentScene()?.id !== scene.id) return;
      const meeting = beamMeetingPoint(red, blue, state.score);
      const sequence = new globals.Sequence({ moduleName: moduleId });
      for (const side of SIDES) {
        const file = side === "red" ? state.redFile : state.blueFile;
        const ranged = file === PATREON_FILES[side];
        const rangedFile = ranged ? rangedLoopFile(side) : null;
        const effect = sequence.effect().file(rangedFile ?? file);
        // Range trims are supported even if registering the optional opening
        // wrapper fails. Never fall back to endlessly replaying the launch.
        if (ranged && (!showOpener || !rangedFile)) effect.timeRange(RANGED_LOOP.start, RANGED_LOOP.end);
        // The original energy beam is shared by free and Patreon. Custom keys
        // retain their native colors; only this shared asset needs side tinting.
        if (file === FREE_FILE) effect.tint(side === "red" ? 0xff4040 : 0x4080ff);
        effect.atLocation(side === "red" ? red : blue).stretchTo(meeting)
          .playbackRate(ranged ? 1 : 2).name(identity.name).persist().temporary();
      }
      // A persistent sequence's promise may remain pending for its whole lifetime; do not await it.
      void sequence.play({ local: true }).catch(logError);
    })().catch(logError);
  }

  return {
    id: "beamClash",
    api: { start, stop, roll },
    init(): void {
      if (initialized) return;
      initialized = true;
      for (const side of SIDES) {
        game.settings.register(moduleId, setting(side), {
          name: `Beam Clash ${side} beam`,
          hint: "auto plays the Patreon Beam002_03 opener once, then loops its sustained segment at normal speed. Without Patreon, the original tinted beam plays at 2x. Set an explicit energy_beam key for that 2x fallback; other custom keys also play at 2x.",
          scope: "world", config: true, type: String, default: "auto",
        });
      }
    },
    ready(): void {
      if (listening) return;
      listening = true;
      Hooks.on("updateScene", (scene: any) => { if (currentScene()?.id === scene.id) redraw(); });
      Hooks.on("canvasReady", () => { canvasAvailable = true; redraw(); recoverAuthority(); });
      Hooks.on("canvasTearDown", () => { canvasAvailable = false; clearVisuals(); });
      Hooks.on("canvasPan", positionControls);
      Hooks.on("refreshToken", positionControls);
      Hooks.on("updateToken", (token: any) => { if (currentScene()?.id === token.parent?.id) redraw(); });
      Hooks.on("deleteToken", (token: any) => {
        if (currentScene()?.id === token.parent?.id) redraw();
        void enqueue(() => repairScene(token.parent)).catch(logError);
      });
      Hooks.on("deleteScene", (scene: any) => {
        if (currentScene()?.id === scene.id || activeEffect?.sceneId === scene.id || activeAura?.sceneId === scene.id) clearVisuals();
      });
      Hooks.on("updateActor", redraw);
      Hooks.on("updateUser", (user: any, changed: any, _options: unknown, userId: string) => {
        if (REQUEST_SLOTS.some(slot => changedPath(changed, ["flags", moduleId, REQUEST, slot]))) receiveRequests(user, changed, userId);
        else { redraw(); recoverAuthority(); }
      });
      Hooks.on("userConnected", () => { redraw(); recoverAuthority(); });
      // Source-verified Sequencer hook runs after async loading, before EffectManager.play.
      // Cancel obsolete sequences that finish loading after stop, movement or a scene switch.
      Hooks.on("preCreateSequencerEffect", (data: any) => {
        if (typeof data?.name !== "string" || !data.name.startsWith(`${effectPrefix}${game.user.id}.`)) return;
        if ((data.name !== activeEffect?.name && data.name !== activeAura?.name) || data.sceneId !== currentScene()?.id) return false;
        if (openingEffect && data.name === openingEffect.name) openedClashes.add(openingEffect.clashId);
      });
      Hooks.on("createSequencerEffect", restoreLoopSeek);
      window.addEventListener("resize", positionControls);
      redraw();
      recoverAuthority();
    },
  };
}
