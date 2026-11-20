import type { ModuleFeature } from "./feature.js";

const SETTING = "darkTriadCutscene";
const IMAGE = "common/monsters/dark_triad.png";
const LIGHTNING = "jb2a.call_lightning.low_res.red";
const THUNDER = "common/sound-effects/unsorted/Thunderstorm_SFX.mp3";
const FADE = 8000;
const FADE_OUT = 1500;

type ThunderRun = { sound?: any; starting?: Promise<unknown>; stopping?: Promise<void> };

/** GM-owned world setting synchronizes the cinematic; Sequencer renders locally per viewer. */
export function createDarkTriadCutsceneFeature(moduleId: string): ModuleFeature {
  const globals = globalThis as any;
  let ready = false, current = "", dismissed = "", generation = 0;
  let thunder: ThunderRun | undefined;
  let thunderCleanup = Promise.resolve();
  const prefix = () => `${moduleId}.dark-triad.${game.user.id}.`;
  const report = (error: unknown) => {
    console.warn(`${moduleId} | Dark Triad cutscene`, error);
    ui.notifications.warn("Dark Triad cutscene could not load. Check Sequencer, the JB2A lightning key, and common/monsters/dark_triad.png.");
  };
  function available() {
    if (!game.modules.get("sequencer")?.active || !globals.Sequence || !globals.Sequencer?.EffectManager) return false;
    try { return !!globals.Sequencer.Database.getEntry(LIGHTNING); } catch { return false; }
  }
  function stopThunder(run: ThunderRun | undefined, fade = FADE_OUT): Promise<void> {
    if (!run?.sound) return Promise.resolve();
    return run.stopping ??= (async () => {
      // Let an in-flight play settle before stopping its unique Sound.
      await run.starting?.catch(() => {});
      try { await run.sound.stop({ fade }); }
      catch (error) { console.warn(`${moduleId} | Dark Triad thunder cleanup`, error); }
    })();
  }
  async function playThunder(id: string, revision: number) {
    const run: ThunderRun = {};
    thunder = run;
    const active = () => thunder === run && current === id && generation === revision;
    try {
      const audio = game.audio;
      if (!audio?.environment || typeof audio.create !== "function") throw new Error("Foundry audio unavailable");
      await audio.unlock;
      if (!active()) return;
      // The shared setting starts one local Sound per viewer, not another broadcast.
      // Environment context preserves the viewer's own volume and mute controls.
      run.sound = audio.create({ src: THUNDER, context: audio.environment, singleton: false, preload: false, autoplay: false });
      await run.sound.load({ autoplay: false });
      await thunderCleanup;
      if (!active()) { await stopThunder(run, 0); return; }
      if (run.sound.failed) throw new Error("Thunder audio failed to load");
      const lowpass = globals.foundry.audio.Sound.createEffect(audio.environment, { type: "lowpass", intensity: 6 });
      if (!lowpass) throw new Error("Foundry low-pass effect unavailable");
      run.sound.applyEffects([lowpass]);
      run.starting = Promise.resolve(run.sound.play({ loop: true, volume: 0.7, offset: 0, fade: FADE }));
      await run.starting;
      if (!active()) await stopThunder(run);
    } catch (error) {
      if (active()) {
        console.warn(`${moduleId} | Dark Triad thunder`, error);
        ui.notifications.warn("Dark Triad thunder could not play. Check common/sound-effects/unsorted/Thunderstorm_SFX.mp3. The cutscene will continue without audio.");
        thunder = undefined;
      }
      await stopThunder(run, 0);
    }
  }
  async function stopLocal() {
    generation++;
    current = "";
    const previous = thunder;
    thunder = undefined;
    thunderCleanup = Promise.all([thunderCleanup, stopThunder(previous)]).then(() => {});
    if (globals.Sequencer?.EffectManager) await globals.Sequencer.EffectManager.endEffects({ name: `${prefix()}*` }, false);
  }
  async function render() {
    if (!ready) return;
    const state = game.settings.get(moduleId, SETTING);
    const id = state?.active && typeof state.id === "string" ? state.id : "";
    if (id && (id === current || id === dismissed)) return;
    const revision = generation + 1;
    await stopLocal();
    if (revision !== generation) return;
    const latest = game.settings.get(moduleId, SETTING);
    if ((latest?.active ? latest.id : "") !== id) return;
    if (!id || !available()) {
      if (id) report(new Error("Sequencer or lightning asset unavailable"));
      return;
    }
    current = id;
    try {
      const image = new Image(); image.src = IMAGE;
      await image.decode();
      if (revision !== generation || current !== id) return;
      const sequence = new globals.Sequence({ moduleName: moduleId });
      const screen = (file: string, layer: number) => sequence.effect().file(file)
        .screenSpace().screenSpaceAboveUI().screenSpaceAnchor(0.5).zIndex(layer)
        .name(`${prefix()}${id}.${layer}`).persist().temporary().fadeIn(FADE).fadeOut(FADE_OUT);
      screen(`modules/${moduleId}/assets/dark-triad/black.svg`, 100)
        .screenSpaceScale({ fitX: true, fitY: true });
      screen(LIGHTNING, 101).screenSpaceScale({ fitY: true, ratioX: true }).opacity(0.7).volume(0);
      screen(IMAGE, 102).screenSpaceScale({ fitY: true, ratioX: true, y: 0.65 })
        .loopProperty("sprite", "rotation", { from: 0, to: -360, duration: 60000, ease: "linear", pingPong: false });
      void sequence.play({ local: true }).catch((error: unknown) => {
        if (current === id) { void stopLocal(); report(error); }
      });
      void playThunder(id, revision);
    } catch (error) {
      if (current === id) { await stopLocal(); report(error); }
    }
  }
  async function start() {
    if (!game.user.isGM) return ui.notifications.warn("Only the GM can start the cutscene for everyone.");
    if (!available()) return report(new Error("Sequencer or lightning unavailable"));
    try {
      const image = new Image(); image.src = IMAGE; await image.decode();
      await game.settings.set(moduleId, SETTING, { active: true, id: foundry.utils.randomID() });
      ui.notifications.info("Dark Triad cutscene started. Escape ends it for everyone when pressed by the GM; the End Cutscene macro also restores the view.");
    } catch (error) { report(error); }
  }
  async function end() {
    if (!game.user.isGM) return ui.notifications.warn("Only the GM can end the cutscene for everyone.");
    await game.settings.set(moduleId, SETTING, { active: false, id: "" });
  }
  return {
    id: "darkTriadCutscene", api: { start, end },
    init() {
      game.settings.register(moduleId, SETTING, { name: "Dark Triad cutscene", scope: "world", config: false,
        type: Object, default: { active: false, id: "" }, onChange: () => { void render().catch(report); } });
    },
    ready() {
      ready = true;
      window.addEventListener("keydown", event => {
        if (event.key !== "Escape" || !current) return;
        event.preventDefault();
        if (game.user.isGM) void end().catch(error => { dismissed = current; void stopLocal().catch(report); report(error); });
        else { dismissed = current; void stopLocal().catch(report); }
      }, { capture: true });
      Hooks.on("preCreateSequencerEffect", (data: any) => {
        if (data?.name?.startsWith(prefix()) && (!current || !data.name.startsWith(`${prefix()}${current}.`))) return false;
      });
      Hooks.on("createSequencerEffect", (effect: any) => {
        const name = effect?.data?.name;
        if (name?.startsWith(prefix()) && (!current || !name.startsWith(`${prefix()}${current}.`))) {
          void globals.Sequencer.EffectManager.endEffects({ name }, false);
        }
      });
      Hooks.on("canvasReady", () => { current = ""; void render().catch(report); });
      void render().catch(report);
    },
  };
}
