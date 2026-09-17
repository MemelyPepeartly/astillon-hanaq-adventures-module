import type { ModuleFeature } from "./feature.js";

const FLAG = "menacing";
const NAME = "ASTILLON.Menacing.Name";

type AnimationFrame = { x: number; y: number; w: number; h: number; duration: number };
type AnimationAtlas = { frames: AnimationFrame[] };
type TokenAnimation = { sprite?: any };

/** A token-local cosmetic status. PF2e intentionally rejects custom ActiveEffects. */
export function createMenacingFeature(moduleId: string): ModuleFeature {
  const statusId = `${moduleId}.menacing`;
  const assetPath = `modules/${moduleId}/assets`;
  const selector = `[data-status-id="${statusId}"]`;
  const animations = new Map<any, TokenAnimation>();
  const pendingToggles = new WeakSet<object>();
  const hudListeners = new WeakMap<HTMLElement, AbortController>();
  let framesPromise: Promise<{ texture: any; time: number }[]> | undefined;

  const isActive = (token: any): boolean => (token?.document ?? token)?.getFlag(moduleId, FLAG) === true;
  const label = (): string => game.i18n.localize(NAME);

  function registerStatus(): void {
    const status = { id: statusId, name: NAME, img: `${assetPath}/menacing-icon.png` };
    // V14 uses an ID-keyed object; V13 still uses an array.
    if (Array.isArray(CONFIG.statusEffects)) {
      if (!CONFIG.statusEffects.some((effect: any) => effect.id === statusId)) CONFIG.statusEffects.push(status);
    } else {
      CONFIG.statusEffects[statusId] = status;
    }
  }

  async function loadFrames(): Promise<{ texture: any; time: number }[]> {
    if (!framesPromise) {
      // This shared atlas stays live across scenes for the module session.
      foundry.canvas.TextureLoader.pinSource(`${assetPath}/menacing.png`);
      framesPromise = (async () => {
        const [response, texture] = await Promise.all([
          fetch(`${assetPath}/menacing.json`),
          foundry.canvas.loadTexture(`${assetPath}/menacing.png`),
        ]);
        if (!response.ok || !texture?.baseTexture) throw new Error("Could not load Menacing animation assets.");
        const atlas: AnimationAtlas = await response.json();
        return atlas.frames.map((frame) => ({
          texture: new PIXI.Texture(texture.baseTexture, new PIXI.Rectangle(frame.x, frame.y, frame.w, frame.h)),
          time: frame.duration,
        }));
      })().catch((error) => {
        foundry.canvas.TextureLoader.unpinSource(`${assetPath}/menacing.png`);
        framesPromise = undefined;
        throw error;
      });
    }
    return framesPromise;
  }

  function removeAnimation(token: any): void {
    const animation = animations.get(token);
    animations.delete(token); // Invalidates pending asset loads as well.
    if (animation?.sprite && !animation.sprite.destroyed) {
      animation.sprite.parent?.removeChild(animation.sprite);
      animation.sprite.destroy(); // Shared atlas textures remain cached for other tokens.
    }
  }

  function positionAnimation(token: any, sprite: any): void {
    const size = Math.min(token.w, token.h) * 0.85;
    sprite.height = size;
    sprite.scale.x = sprite.scale.y;
    sprite.position.set(token.w * 0.94, token.h * 0.12);
    // As a token child it follows movement, zoom and layer visibility automatically.
    // Do not reveal the artwork for hidden, off-level or detection-only tokens.
    sprite.visible = token.isVisible && token.mesh?.visible !== false && !token.detectionFilter
      && (!token.document.hidden || game.user.isGM);
    sprite.alpha = token.document.hidden ? 0.5 : 1;
    if (sprite.visible) sprite.play();
    else sprite.stop();
  }

  async function syncAnimation(token: any): Promise<void> {
    if (!token || token.destroyed || !isActive(token.document)) {
      removeAnimation(token);
      return;
    }
    const existing = animations.get(token);
    if (existing) {
      if (existing.sprite && !existing.sprite.destroyed) positionAnimation(token, existing.sprite);
      return;
    }
    const animation: TokenAnimation = {};
    animations.set(token, animation);
    try {
      const frames = await loadFrames();
      // A toggle, scene change, redraw or deletion may finish before the asset load.
      if (animations.get(token) !== animation || token.destroyed || !isActive(token.document)) return;
      const sprite = new PIXI.AnimatedSprite(frames);
      sprite.anchor.set(0.5);
      sprite.eventMode = "none";
      sprite.name = statusId;
      animation.sprite = sprite;
      token.addChild(sprite);
      positionAnimation(token, sprite);
    } catch (error) {
      if (animations.get(token) === animation) animations.delete(token);
      console.error(`${moduleId} | Unable to display Menacing`, error);
    }
  }

  function updateHudState(hud: any, root: HTMLElement): void {
    const active = isActive(hud.document ?? hud.object?.document);
    for (const control of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
      control.classList.toggle("active", active);
      control.setAttribute("aria-pressed", String(active));
      control.dataset.tooltip = label();
      control.setAttribute("aria-label", label());
      control.title = label();
    }
  }

  async function toggle(token: any = canvas.tokens?.controlled?.[0]?.document, active?: boolean): Promise<boolean> {
    const document = token?.document ?? token;
    if (!document || !document.isOwner) {
      ui.notifications.warn(game.i18n.localize("ASTILLON.Menacing.SelectToken"));
      return false;
    }
    if (pendingToggles.has(document)) return isActive(document);
    pendingToggles.add(document);
    try {
      const enabled = active ?? !isActive(document);
      await document.setFlag(moduleId, FLAG, enabled);
      return enabled;
    } finally {
      pendingToggles.delete(document);
    }
  }

  function renderHud(hud: any, html: HTMLElement | { 0: HTMLElement }): void {
    const root = html instanceof HTMLElement ? html : html[0];
    if (!root) return;
    registerStatus();
    // PF2e can replace its entire status registry after a setting change. Recover
    // in the current palette too, without waiting for a second HUD render.
    if (!root.querySelector(selector)) {
      const palette = root.querySelector(".status-effects");
      if (!palette) return;
      const control = document.createElement("a");
      control.className = "effect-control";
      control.dataset.statusId = statusId;
      const image = document.createElement("img");
      image.src = `${assetPath}/menacing-icon.png`;
      image.alt = label();
      control.append(image);
      palette.append(control);
    }
    const control = root.querySelector<HTMLElement>(selector)!;
    control.setAttribute("role", "button");
    control.tabIndex = 0;
    updateHudState(hud, root);
    hudListeners.get(root)?.abort();
    const controller = new AbortController();
    hudListeners.set(root, controller);
    const onToggle = (event: Event): void => {
      const target = event.target instanceof Element ? event.target.closest(selector) : null;
      if (!target) return;
      if (event instanceof KeyboardEvent && !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void toggle(hud.document ?? hud.object?.document)
        .then(() => updateHudState(hud, root))
        .catch((error) => {
          console.error(`${moduleId} | Unable to toggle Menacing`, error);
          ui.notifications.error(game.i18n.localize("ASTILLON.Menacing.ToggleError"));
        });
    };
    // Capture only our control before PF2e's condition-only click handler.
    for (const event of ["click", "contextmenu", "keydown"]) {
      root.addEventListener(event, onToggle, { capture: true, signal: controller.signal });
    }
  }

  function refreshOpenHud(): void {
    const hud = canvas.tokens?.hud;
    const root = hud?.element instanceof HTMLElement ? hud.element : hud?.element?.[0];
    if (root) updateHudState(hud, root);
  }

  return {
    id: "menacing",
    api: { toggle, isActive, statusId },
    init() {
      registerStatus();
      Hooks.on("renderTokenHUD", renderHud);
      Hooks.on("updateSetting", (setting: any) => {
        if (["pf2e.statusEffectType", "pf2e.deathIcon"].includes(setting.key)) registerStatus();
      });
      Hooks.on("drawToken", (token: any) => {
        removeAnimation(token);
        void syncAnimation(token);
      });
      Hooks.on("refreshToken", (token: any) => {
        const sprite = animations.get(token)?.sprite;
        if (sprite && !sprite.destroyed) positionAnimation(token, sprite);
      });
      Hooks.on("updateToken", (document: any) => {
        void syncAnimation(document.object);
        refreshOpenHud();
      });
      Hooks.on("destroyToken", removeAnimation);
      Hooks.on("deleteToken", (document: any) => removeAnimation(document.object));
      Hooks.on("canvasReady", () => {
        for (const token of canvas.tokens?.placeables ?? []) void syncAnimation(token);
      });
      Hooks.on("canvasTearDown", () => {
        for (const token of animations.keys()) removeAnimation(token);
      });
    },
    ready: registerStatus,
  };
}
