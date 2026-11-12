import type { ModuleFeature } from "./feature.js";
import {
  acceptBeamRoll, beamMeetingPoint, canSubmitBeamRoll, isBeamSide, readBeamClash,
  type BeamClashState, type BeamSide,
} from "./beam-clash-model.js";

const FLAG = "beamClash";
const REQUEST = "beamClashRequest";
const SIDES = ["red", "blue"] as const;
// Database keys retain JB2A's ranged-template alignment metadata. These are the
// user's Beam002_03_Regular_{Red,Blue}_30ft_1600x400.webm files, not tinted stand-ins.
// Verified: Jules-Bens-Aa/jb2a-databases @ 17ee6e0, jb2a_patreon/scripts/jb2a_sequencer.js.
const PATREON_FILES = {
  red: "jb2a.ranged.beam.002.03.red.30ft",
  blue: "jb2a.ranged.beam.002.03.blue.30ft",
};
const FREE_FILE = "jb2a.energy_beam.normal.bluepink.03.30ft";
type Intent = {
  version: 1; action: "start" | "stop" | "roll"; sceneId: string; clashId: string | null;
  round?: number; side?: BeamSide;
  redTokenId?: string; blueTokenId?: string; redFile?: string; blueFile?: string;
};
type EffectIdentity = { name: string; sceneId: string };

/**
 * Integration: register this ModuleFeature and include styles/beam-clash.css.
 * Macro: await game.modules.get(MODULE_ID).api.beamClash.start();
 * start()/stop()/roll() submit native ChatMessage intents; the elected active GM handles them.
 * No socket payload, client die, or claimed user ID is an authority boundary.
 * Foundry 14.370: ChatMessage.author, Users.activeGM, Scene flags, Roll.evaluate,
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
  let effectSignature = "";
  let effectSerial = 0;
  let visualGeneration = 0;
  let pannedClash = "";
  let canvasAvailable = true;

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
      return `The ${side} animation key is unavailable. In Module Settings, set Beam Clash ${side} beam to auto or an installed jb2a key from Sequencer's Database Viewer. Auto uses the Patreon ranged beam when installed, or the free energy beam otherwise.`;
    }
    return null;
  }

  function selectedFile(side: BeamSide): string {
    const configured = String(game.settings.get(moduleId, setting(side)) ?? "").trim();
    // The previous built-in default may already have been saved by Foundry. Upgrade
    // that default to the requested Patreon beam without changing other custom keys.
    if (!configured || configured === "auto" || configured === FREE_FILE) {
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

  function currentScene(): any {
    return canvasAvailable && canvas?.ready ? canvas.scene : null;
  }

  function tokenPair(scene: any, state: Pick<BeamClashState, "redTokenId" | "blueTokenId">): any[] | null {
    const red = scene?.tokens?.get(state.redTokenId);
    const blue = scene?.tokens?.get(state.blueTokenId);
    return red && blue && red.id !== blue.id ? [red, blue] : null;
  }

  function authorOf(message: any, initiatingUserId?: string): any {
    const id = message?.author?.id;
    // author is Foundry's DocumentAuthorField, received after server document creation.
    // Recovery has no create-hook origin: require server-managed stats instead. Conservatively
    // ignore requests subsequently edited by someone else (including a GM); the owner can retry.
    const origin = initiatingUserId ?? message?._stats?.lastModifiedBy;
    if (!id || !origin || origin !== id) return null;
    return game.users?.get(id) ?? null;
  }

  async function createIntent(intent: Intent): Promise<any> {
    // Static text only: token/actor names never enter HTML strings.
    return foundry.documents.ChatMessage.implementation.create({
      content: `<p>Beam Clash: ${intent.action === "roll" ? "roll requested" : `${intent.action} requested`}.</p>`,
      flags: { [moduleId]: { [REQUEST]: intent } },
    });
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
      return await createIntent({ version: 1, action: "start", sceneId: scene.id, clashId: stateOf(scene)?.id ?? null,
        redTokenId: red.id, blueTokenId: blue.id, redFile, blueFile });
    } finally { pending.delete(key); }
  }

  async function stop(): Promise<any> {
    if (!game.user?.isGM) { notify("Only a GM can stop a clash."); return null; }
    const scene = currentScene();
    const state = stateOf(scene);
    if (!state || state.status !== "active") return null;
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
  async function handleIntent(message: any, initiatingUserId?: string, recover = false): Promise<void> {
    if (!isAuthority() || !message?.id || game.messages?.get(message.id) !== message) return;
    const intent = message.getFlag(moduleId, REQUEST) as Intent | undefined;
    if (!intent || intent.version !== 1 || typeof intent.sceneId !== "string") return;
    const author = authorOf(message, initiatingUserId);
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
        version: 1, id: message.id, sceneId: scene.id, redTokenId: intent.redTokenId,
        blueTokenId: intent.blueTokenId, redFile: intent.redFile, blueFile: intent.blueFile,
        status: "active", round: 1, score: 0, revision: 0, red: null, blue: null,
        lastRound: null, winner: null, processed: [],
      };
      if (isAuthority()) await scene.setFlag(moduleId, FLAG, next);
      return;
    }
    if (!state || state.sceneId !== scene.id || state.status !== "active" || state.id !== intent.clashId) return;
    if (intent.action === "stop") {
      if (author.isGM && isAuthority()) await scene.setFlag(moduleId, FLAG, { ...state, status: "stopped", revision: state.revision + 1 });
      return;
    }
    const side = intent.side;
    const pair = tokenPair(scene, state);
    if (intent.action !== "roll" || !isBeamSide(side) || !Number.isInteger(intent.round)
      || intent.round !== state.round || state[side] || state.processed.includes(message.id)
      || !pair || !canSubmitBeamRoll(side, author, pair[side === "red" ? 0 : 1].actor)) return;
    const expectedId = state.id;
    const expectedRevision = state.revision;
    const die = await new foundry.dice.Roll("1d20").evaluate({ allowInteractive: false });
    // Leadership, permissions or state may have changed while the die was evaluating.
    const current = stateOf(scene);
    if (!isAuthority() || !current || current.id !== expectedId || current.revision !== expectedRevision
      || current.status !== "active" || !tokenPair(scene, current)
      || !canSubmitBeamRoll(side, game.users.get(author.id), scene.tokens.get(side === "red" ? current.redTokenId : current.blueTokenId)?.actor)) return;
    const next = acceptBeamRoll(current, side, intent.round!, { requestId: message.id, authorId: author.id, total: die.total });
    if (!next) return;
    await scene.setFlag(moduleId, FLAG, next);
    // State is committed before optional chat output, so a chat error cannot reroll a submission.
    if (isAuthority()) {
      const outcome = next.status === "finished" ? ` ${next.winner === "red" ? "Red" : "Blue"} wins the clash!` : "";
      await foundry.documents.ChatMessage.implementation.create({
        content: `<p>Beam Clash round ${current.round}: ${side === "red" ? "Red" : "Blue"} rolled ${die.total}.${outcome}</p>`,
        rolls: [die],
      });
    }
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
        for (const message of [...game.messages.contents]) await handleIntent(message, undefined, true);
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

  function clearVisuals(): void {
    visualGeneration += 1;
    const old = activeEffect;
    activeEffect = undefined;
    effectSignature = "";
    pannedClash = "";
    root?.remove();
    root = undefined;
    pending.clear();
    void endEffects(old).catch(logError);
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
    }
    const midpoint = beamMeetingPoint(center(pair[0]), center(pair[1]), state!.score);
    const screen = screenPoint(midpoint);
    const score = root.querySelector<HTMLElement>(".astillon-beam-clash__score");
    if (score) { score.style.left = `${screen.x}px`; score.style.top = `${screen.y - 40}px`; }
  }

  function renderControls(scene: any, state: BeamClashState | null): void {
    if (!state || state.status !== "active" || currentScene()?.id !== scene?.id) return;
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
      button.disabled = !!submitted || sending || !game.users.activeGM || !allowed;
      button.dataset.state = submitted ? "rolled" : sending ? "pending" : button.disabled ? "locked" : "ready";
      button.querySelector<HTMLElement>(".astillon-beam-clash__name")!.textContent = pair[i].name;
      button.querySelector<HTMLElement>(".astillon-beam-clash__label")!.textContent = submitted ? `d20: ${submitted.total}` : sending ? "Rolling…" : "Roll d20";
      button.querySelector<HTMLElement>(".astillon-beam-clash__hint")!.textContent = submitted ? "Waiting for other roll"
        : sending ? "Submitting roll" : !game.users.activeGM ? "Waiting for GM"
          : !allowed ? "Owner / GM only"
            : side === "blue" && game.user.isGM ? "GM · roll for player" : "Click to push the beam";
      button.title = `GM or this actor's owner: roll for the ${side} character`;
      button.setAttribute("aria-label", `${submitted ? `Rolled ${submitted.total}` : "Roll d20"} for ${pair[i].name}`);
      button.setAttribute("aria-busy", String(sending));
    }
    root.querySelector<HTMLElement>(".astillon-beam-clash__score")!.textContent =
      `Round ${state.round} · ${state.score > 0 ? "+" : ""}${state.score} · First to ±3`;
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

  function redraw(): void {
    const scene = currentScene();
    const state = stateOf(scene);
    const pair = state && tokenPair(scene, state);
    if (!state || state.status !== "active" || state.sceneId !== scene.id || !pair) { clearVisuals(); return; }
    renderControls(scene, state);
    fitView(scene, state, pair);
    // Missing optional dependencies are silent outside start(); controls and shared state still work.
    if (filesProblem(state.redFile, state.blueFile)) return;
    const red = center(pair[0]);
    const blue = center(pair[1]);
    const signature = JSON.stringify([state.id, state.score, state.redFile, state.blueFile, red, blue]);
    if (signature === effectSignature) return;
    effectSignature = signature;
    const generation = ++visualGeneration;
    const old = activeEffect;
    const identity = { name: `${effectPrefix}${game.user.id}.${state.id}.${++effectSerial}`, sceneId: scene.id };
    activeEffect = identity;
    void (async () => {
      await endEffects(old);
      if (generation !== visualGeneration || currentScene()?.id !== scene.id) return;
      const meeting = beamMeetingPoint(red, blue, state.score);
      const sequence = new globals.Sequence({ moduleName: moduleId });
      for (const side of SIDES) {
        const file = side === "red" ? state.redFile : state.blueFile;
        const effect = sequence.effect().file(file);
        // Preserve the native launch/impact animation and colors of the ranged
        // Patreon clips. Only the shared single-color free fallback needs tinting.
        if (file === FREE_FILE) effect.tint(side === "red" ? 0xff4040 : 0x4080ff);
        effect.atLocation(side === "red" ? red : blue).stretchTo(meeting)
          .name(identity.name).persist().temporary();
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
          hint: "auto uses the Patreon Beam002_03 red/blue ranged clips when installed, with a tinted free fallback. Or enter an installed JB2A database key.",
          scope: "world", config: true, type: String, default: "auto",
        });
      }
    },
    ready(): void {
      if (listening) return;
      listening = true;
      Hooks.on("createChatMessage", (message: any, _options: unknown, userId: string) => {
        void enqueue(() => handleIntent(message, userId)).catch(logError);
      });
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
      Hooks.on("deleteScene", (scene: any) => { if (activeEffect?.sceneId === scene.id) clearVisuals(); });
      Hooks.on("updateActor", redraw);
      Hooks.on("updateUser", () => { redraw(); recoverAuthority(); });
      Hooks.on("userConnected", () => { redraw(); recoverAuthority(); });
      // Source-verified Sequencer hook runs after async loading, before EffectManager.play.
      // Cancel obsolete sequences that finish loading after stop, movement or a scene switch.
      Hooks.on("preCreateSequencerEffect", (data: any) => {
        if (typeof data?.name !== "string" || !data.name.startsWith(`${effectPrefix}${game.user.id}.`)) return;
        if (data.name !== activeEffect?.name || data.sceneId !== currentScene()?.id) return false;
      });
      window.addEventListener("resize", positionControls);
      redraw();
      recoverAuthority();
    },
  };
}
