export const BLASTBACK_VISUALS = {
  inward: "jb2a.energy_strands.in.blue.01.0",
  complete: "jb2a.energy_strands.complete.blue.01",
} as const;
const EXPLOSION = "jb2a.fireball.loop_no_debris.blue";

/** Each viewing client renders locally from shared plan/chat data; no broadcast duplication. */
export function createBlastbackVisuals(moduleId: string) {
  const globals = globalThis as any;
  const active = new Map<string, { name: string; sceneId: string; signature: string }>();
  const names = new Set<string>();
  const exploded = new Set<string>();
  const warnings = new Set<string>();
  const watchedTokens = new Set<string>();
  let registered = false;
  let serial = 0;
  let syncFrame: number | null = null;
  const prefix = () => `${moduleId}.blastback.${game.user.id}.`;
  const available = (file: string) => {
    try {
      if (game.modules.get("sequencer")?.active && globals.Sequence && globals.Sequencer?.Database?.getEntry(file)) return true;
    } catch { /* Optional cosmetic asset; never block banking or damage. */ }
    if (game.user.isGM && !warnings.has(file)) {
      warnings.add(file);
      ui.notifications.warn(`Blastback visual unavailable: ${file}. Enable Sequencer and the matching JB2A library; the ability still works.`);
    }
    return false;
  };
  const end = (name: string, sceneId?: string) => {
    names.delete(name);
    if (globals.Sequencer?.EffectManager) void Promise.resolve(globals.Sequencer.EffectManager.endEffects({ name, ...(sceneId ? { sceneId } : {}) }, false)).catch(console.warn);
  };
  const visible = (token: any) => !!token?.object?.isVisible && (game.user.isGM || !token.hidden);
  function stop(id: string) {
    const effect = active.get(id);
    if (effect) { active.delete(id); end(effect.name, effect.sceneId); }
  }
  function clear() {
    if (syncFrame !== null) { cancelAnimationFrame(syncFrame); syncFrame = null; }
    watchedTokens.clear();
    for (const id of [...active.keys()]) stop(id);
    for (const name of [...names]) end(name);
  }
  function scheduleSync() {
    if (syncFrame !== null) return;
    syncFrame = requestAnimationFrame(() => { syncFrame = null; sync(); });
  }
  function syncToken(token: any) {
    if (!watchedTokens.size) return;
    const document = token?.document ?? token;
    if (document?.parent?.id !== canvas.scene?.id || !watchedTokens.has(document.id)) return;
    scheduleSync();
  }
  function sync() {
    if (!canvas.ready || !canvas.scene) { clear(); return; }
    const scene = canvas.scene, plans = scene.getFlag(moduleId, "blasterBlastbackPlans") ?? {};
    const wanted = new Set<string>();
    watchedTokens.clear();
    for (const plan of Object.values(plans) as any[]) {
      if (!plan?.id || !["charging", "recovery", "publishing"].includes(plan.status) || exploded.has(plan.id)) continue;
      // Invisible charges still need a refresh when their token becomes visible.
      watchedTokens.add(plan.tokenId);
      const token = scene.tokens.get(plan?.tokenId);
      if (token?.actor?.uuid !== plan.actorUuid || !visible(token)) continue;
      const visual = plan.visual === "complete" ? "complete" : "inward";
      const file = BLASTBACK_VISUALS[visual];
      if (!available(file)) continue;
      wanted.add(plan.id);
      const signature = `${scene.id}:${token.id}:${visual}:${token.width}:${token.height}`;
      if (active.get(plan.id)?.signature === signature) continue;
      stop(plan.id);
      const effect = { name: `${prefix()}charge.${++serial}`, sceneId: scene.id, signature };
      active.set(plan.id, effect); names.add(effect.name);
      try {
        const sequence = new globals.Sequence({ moduleName: moduleId });
        sequence.effect().file(file).attachTo(token.object, { bindRotation: false })
          .scaleToObject(visual === "complete" ? 3 : 2).fadeIn(250).fadeOut(500)
          .name(effect.name).persist().temporary();
        void sequence.play({ local: true }).catch((error: unknown) => {
          if (active.get(plan.id) === effect) stop(plan.id);
          else end(effect.name, scene.id);
          console.warn(`${moduleId} | Blastback visual`, error);
        });
      } catch (error) { stop(plan.id); console.warn(`${moduleId} | Blastback visual`, error); }
    }
    for (const id of [...active.keys()]) if (!wanted.has(id)) stop(id);
  }
  function detonate(message: any) {
    const mark = message.getFlag(moduleId, "blasterBlastback"), scene = canvas.scene;
    if (!canvas.ready || !mark?.id || mark.sceneId !== scene?.id || exploded.has(mark.id)) return;
    const token = scene.tokens.get(mark.tokenId);
    exploded.add(mark.id); stop(mark.id);
    if (token?.actor?.uuid !== mark.actorUuid || !visible(token) || !Number.isFinite(mark.center?.x) ||
        !Number.isFinite(mark.center?.y) || !available(EXPLOSION)) return;
    const name = `${prefix()}explosion.${++serial}`;
    names.add(name);
    try {
      const diameter = 200 * scene.grid.size / scene.grid.distance;
      const sequence = new globals.Sequence({ moduleName: moduleId });
      sequence.effect().file(EXPLOSION).atLocation(mark.center).size({ width: diameter, height: diameter })
        .name(name).persist().temporary().loopOptions({ loops: 6, endOnLastLoop: true }).fadeOut(1000);
      void sequence.play({ local: true }).catch((error: unknown) => { end(name, scene.id); console.warn(`${moduleId} | Blastback explosion`, error); });
    } catch (error) { end(name, scene.id); console.warn(`${moduleId} | Blastback explosion`, error); }
  }
  function ready() {
    if (registered) return;
    registered = true;
    Hooks.on("updateScene", (scene: any) => { if (scene.id === canvas.scene?.id) scheduleSync(); });
    Hooks.on("createChatMessage", detonate);
    Hooks.on("updateToken", syncToken);
    Hooks.on("deleteToken", syncToken);
    Hooks.on("refreshToken", syncToken);
    Hooks.on("canvasReady", scheduleSync);
    Hooks.on("canvasTearDown", clear);
    Hooks.on("preCreateSequencerEffect", (data: any) => {
      if (data?.name?.startsWith(prefix()) && (!names.has(data.name) || !canvas.ready || data.sceneId !== canvas.scene?.id)) return false;
    });
    Hooks.on("createSequencerEffect", (effect: any) => {
      const data = effect?.data;
      if (data?.name?.startsWith(prefix()) && (!names.has(data.name) || !canvas.ready || data.sceneId !== canvas.scene?.id)) end(data.name, data.sceneId);
    });
    sync();
  }
  return { ready };
}
