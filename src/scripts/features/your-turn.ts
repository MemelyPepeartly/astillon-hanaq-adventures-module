import type { ModuleFeature } from "./feature.js";

const FEATURE_ID = "your-turn";
const SETTING_ENABLED = "yourTurnEnabled";
const SETTING_SCALE = "yourTurnScale";
const SETTING_HOLD = "yourTurnHold";
const ART_FLAG = "yourTurnArt";
const COLOR_FLAG = "yourTurnColor";
const DEFAULT_COLOR = "#2B8CFF";
const ROOT_CLASS = "astillon-yt";
const CONFIGURE_CLASS = "astillon-your-turn-configure";
const CONFIGURE_ACTION = "astillon-your-turn";
const INK_ALPHA = 16;
const OPAQUE_ALPHA = 250;
const MAX_EDGE = 1024;
const STAGE_WIDTH_OF_MAP = 0.62;
const STAGE_HEIGHT_OF_MAP = 0.82;

type SliceSpec = {
  id: string;
  file: string;
  z: number;
  enterMs: number;
  exitMs: number;
  tint?: "theme" | "highlight";
  text?: "name" | "label";
};

const SLICES: SliceSpec[] = [
  { id: "backing", file: "01-dark-backing.png", z: 10, enterMs: 0, exitMs: 2240 },
  { id: "theme", file: "02-theme-panel.png", z: 20, enterMs: 45, exitMs: 2220, tint: "theme" },
  { id: "texture", file: "07-halftone-texture.png", z: 25, enterMs: 70, exitMs: 2200 },
  { id: "highlights", file: "03-highlight-shards.png", z: 30, enterMs: 90, exitMs: 2180, tint: "highlight" },
  { id: "streaks", file: "04-white-speed-streaks.png", z: 40, enterMs: 0, exitMs: 2200 },
  { id: "banner", file: "05-name-banner.png", z: 60, enterMs: 300, exitMs: 2050, text: "name" },
  { id: "label", file: "06-turn-label-strip.png", z: 70, enterMs: 350, exitMs: 2080, tint: "highlight", text: "label" },
];

const PORTRAIT_ENTER_MS = 150;
const PORTRAIT_EXIT_MS = 2150;

type CombatHistory = {
  combatantId?: string | null;
  round?: number;
  turn?: number;
  tokenId?: string | null;
};

type ArtMode = "sticker" | "frame";

type ArtResult = {
  mode: ArtMode;
  url: string;
};

type Subject = {
  name: string;
  art: string[];
  color: string;
};

type Rgb = { r: number; g: number; b: number };

/**
 * Radius-5 regression: 3-4-5 is the disk edge, and one step past it is outside.
 * The outline painter uses this same comparison.
 */
export function euclideanOutlineCovers(dx: number, dy: number, radius: number): boolean {
  return dx * dx + dy * dy <= radius * radius;
}

/** Mix `ratio` of the way from `hex` toward white. The demo highlight uses 0.7. */
export function mixTowardWhite(hex: string, ratio: number): string {
  const rgb = parseHex(hex) ?? parseHex(DEFAULT_COLOR)!;
  const mix = (channel: number) => Math.round(channel + (255 - channel) * ratio);
  return formatHex(mix(rgb.r), mix(rgb.g), mix(rgb.b));
}

/** Flat highlight fill from the demo: 70% of the way from the theme color toward white. */
export function turnHighlight(hex: string): string {
  const rgb = parseHex(mixTowardWhite(hex, 0.7)) ?? parseHex(DEFAULT_COLOR)!;
  return `rgb(${rgb.r},${rgb.g},${rgb.b})`;
}

export const TURN_INTRO_MS = 2600;

type TurnKeyframe = {
  opacity: number;
  transform?: string;
  offset: number;
  easing?: string;
};

/** The demo's 2.6s layer timeline. Offsets are enter/exit milliseconds over 2600. */
export function turnIntroFrames(enterMs: number, exitMs: number, reduced: boolean): TurnKeyframe[] {
  if (reduced) {
    return [
      { opacity: 0, offset: 0 },
      { opacity: 1, offset: 0.12 },
      { opacity: 1, offset: 0.8 },
      { opacity: 0, offset: 1 },
    ];
  }
  const entry = enterMs / TURN_INTRO_MS;
  const end = Math.min((enterMs + 210) / TURN_INTRO_MS, 0.22);
  const settle = Math.min((enterMs + 250) / TURN_INTRO_MS, 0.24);
  const exit = exitMs / TURN_INTRO_MS;
  return [
    { opacity: 0, transform: "translate(52%, 31%)", offset: 0 },
    { opacity: 0, transform: "translate(52%, 31%)", offset: entry, easing: "cubic-bezier(.16,.9,.26,1)" },
    { opacity: 1, transform: "translate(-1.2%, -.8%)", offset: end, easing: "ease-out" },
    { opacity: 1, transform: "translate(0, 0)", offset: settle },
    { opacity: 1, transform: "translate(0, 0)", offset: exit, easing: "cubic-bezier(.6,0,.9,.35)" },
    { opacity: 0, transform: "translate(55%, 35%)", offset: 1 },
  ];
}

/** A more saturated, slightly darker panel derived from the theme color. */
export function saturatedPanelColor(hex: string): string {
  const rgb = parseHex(hex) ?? parseHex(DEFAULT_COLOR)!;
  const hsl = rgbToHsl(rgb);
  const next = hslToRgb(hsl.h, Math.min(1, hsl.s + 0.18), Math.max(0, hsl.l * 0.82));
  return formatHex(next.r, next.g, next.b);
}

/**
 * White pixels of a padded Euclidean outline. Ink is alpha >= 16.
 * Only contour ink is stamped; the nearest ink pixel is always on that contour.
 */
export function renderOutlineMask(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  const pad = Math.max(0, radius);
  const outWidth = width + pad * 2;
  const outHeight = height + pad * 2;
  const out = new Uint8ClampedArray(outWidth * outHeight * 4);
  if (radius < 0 || width <= 0 || height <= 0) return out;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isContourInk(pixels, width, height, x, y)) continue;
      const centerX = x + pad;
      const centerY = y + pad;
      const y0 = Math.max(0, centerY - radius);
      const y1 = Math.min(outHeight - 1, centerY + radius);
      const x0 = Math.max(0, centerX - radius);
      const x1 = Math.min(outWidth - 1, centerX + radius);
      for (let oy = y0; oy <= y1; oy += 1) {
        const dy = oy - centerY;
        for (let ox = x0; ox <= x1; ox += 1) {
          if (!euclideanOutlineCovers(ox - centerX, dy, radius)) continue;
          const index = (oy * outWidth + ox) * 4;
          out[index] = 255;
          out[index + 1] = 255;
          out[index + 2] = 255;
          out[index + 3] = 255;
        }
      }
    }
  }

  return out;
}

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^#?([0-9a-fA-F]{6})$/.exec(value.trim());
  if (!match) return null;
  return `#${match[1].toUpperCase()}`;
}

function parseHex(value: string): Rgb | null {
  const normalized = normalizeHexColor(value);
  if (!normalized) return null;
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function formatHex(r: number, g: number, b: number): string {
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0").toUpperCase();
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function rgbToHsl(rgb: Rgb): { h: number; s: number; l: number } {
  const red = rgb.r / 255;
  const green = rgb.g / 255;
  const blue = rgb.b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: lightness };
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return { h: hue * 60, s: saturation, l: lightness };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;
  if (hue < 60) [red, green, blue] = [chroma, x, 0];
  else if (hue < 120) [red, green, blue] = [x, chroma, 0];
  else if (hue < 180) [red, green, blue] = [0, chroma, x];
  else if (hue < 240) [red, green, blue] = [0, x, chroma];
  else if (hue < 300) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];
  return {
    r: Math.round((red + m) * 255),
    g: Math.round((green + m) * 255),
    b: Math.round((blue + m) * 255),
  };
}

function isInk(pixels: Uint8ClampedArray, width: number, height: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  return pixels[(y * width + x) * 4 + 3] >= INK_ALPHA;
}

function isContourInk(pixels: Uint8ClampedArray, width: number, height: number, x: number, y: number): boolean {
  if (!isInk(pixels, width, height, x, y)) return false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      if (!isInk(pixels, width, height, x + dx, y + dy)) return true;
    }
  }
  return false;
}

function isOpaqueAlpha(data: Uint8ClampedArray, pixelCount: number): boolean {
  if (pixelCount <= 0) return true;
  const limit = pixelCount * 0.01;
  let clear = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < OPAQUE_ALPHA) {
      clear += 1;
      if (clear >= limit) return false;
    }
  }
  return true;
}

function outlineRadius(width: number, height: number): number {
  const radius = Math.round(Math.min(width, height) * 0.04);
  return Math.min(24, Math.max(8, radius));
}

function scaledEdge(width: number, height: number): { width: number; height: number } {
  const safeWidth = Math.max(0, Math.round(width));
  const safeHeight = Math.max(0, Math.round(height));
  const edge = Math.max(safeWidth, safeHeight);
  if (edge === 0) return { width: 0, height: 0 };
  if (edge <= MAX_EDGE) return { width: safeWidth, height: safeHeight };
  const scale = MAX_EDGE / edge;
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

function fieldNamespace(): { BooleanField: new () => unknown; NumberField: new (options?: object) => unknown } {
  return foundry.fields ?? foundry.data.fields;
}

function createBooleanField(): unknown {
  const Field = fieldNamespace().BooleanField;
  return new Field();
}

function createNumberField(options: { min: number; max: number; step: number }): unknown {
  const Field = fieldNamespace().NumberField;
  return new Field(options);
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Foundry stores paths like `icons/foo.webp`. From `/game` those only load through getRoute. */
function resolveArtUrl(src: string): string {
  const path = src.trim();
  if (!path || /^(?:https?:|blob:|data:)/i.test(path)) return path;
  const getRoute = (foundry as { utils?: { getRoute?: (path: string) => string } }).utils?.getRoute;
  if (typeof getRoute !== "function") return path;
  try {
    const routed = getRoute(path);
    if (typeof routed === "string" && routed.trim()) return routed.trim();
  } catch {
    // The stored path is still tried by the loader.
  }
  return path;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function imageDataFrom(data: Uint8ClampedArray, width: number, height: number): ImageData {
  const ImageDataCtor = (globalThis as { ImageData?: new (data: Uint8ClampedArray, width: number, height: number) => ImageData }).ImageData;
  if (typeof ImageDataCtor === "function") {
    try {
      return new ImageDataCtor(data, width, height);
    } catch {
      // jsdom and older canvases accept a structural ImageData.
    }
  }
  return { data, width, height, colorSpace: "srgb" } as ImageData;
}

export function createYourTurnFeature(moduleId: string): ModuleFeature {
  let generation = 0;
  let overlay: HTMLElement | null = null;
  let removeTimer: ReturnType<typeof setTimeout> | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let observedSidebar: Element | null = null;
  let draftActor: any = null;
  let draftForm: HTMLFormElement | null = null;
  const artCache = new Map<string, ArtResult>();
  const liveBlobs = new Set<string>();
  const motions = new Map<HTMLElement, Animation[]>();

  function revokeIfUnused(url: string): void {
    if (!url.startsWith("blob:")) return;
    if (liveBlobs.has(url)) return;
    for (const entry of artCache.values()) {
      if (entry.url === url) return;
    }
    try {
      URL.revokeObjectURL(url);
    } catch {
      // The session cache is the owner of blob URLs that are still referenced.
    }
  }

  function rememberArt(src: string, result: ArtResult): ArtResult {
    const previous = artCache.get(src);
    artCache.set(src, result);
    if (previous && previous.url !== result.url) revokeIfUnused(previous.url);
    return result;
  }

  function readSetting(key: string): unknown {
    try {
      return game.settings.get(moduleId, key);
    } catch {
      return undefined;
    }
  }

  function isEnabled(): boolean {
    return readSetting(SETTING_ENABLED) === true;
  }

  function readScale(): number {
    const value = Number(readSetting(SETTING_SCALE));
    return Number.isFinite(value) ? value : 1;
  }

  function prefersReducedMotion(): boolean {
    try {
      const view = document.defaultView ?? globalThis;
      return view.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    } catch {
      return false;
    }
  }

  function flagRaw(doc: any, key: string): unknown {
    if (!doc || typeof doc.getFlag !== "function") return undefined;
    try {
      return doc.getFlag(moduleId, key);
    } catch {
      return undefined;
    }
  }

  function artChainFrom(actor: any, baseActor: any, actorImg: unknown, textureSrc: unknown, draftArt: string | null): string[] {
    const chain: string[] = [];
    const push = (value: unknown) => {
      const art = trimmed(value);
      if (art && !chain.includes(art)) chain.push(art);
    };
    if (draftArt !== null) push(draftArt);
    else push(flagRaw(actor, ART_FLAG));
    push(flagRaw(baseActor, ART_FLAG));
    push(actorImg);
    push(textureSrc);
    return chain;
  }

  function colorFrom(actor: any, baseActor: any, draftColor: string | null): string {
    if (draftColor !== null) return normalizeHexColor(draftColor) ?? DEFAULT_COLOR;
    return normalizeHexColor(flagRaw(actor, COLOR_FLAG))
      ?? normalizeHexColor(flagRaw(baseActor, COLOR_FLAG))
      ?? DEFAULT_COLOR;
  }

  function subjectFromCombatant(combatant: any): Subject {
    const actor = combatant?.actor;
    const baseActor = combatant?.token?.baseActor;
    const name = trimmed(combatant?.name)
      || trimmed(actor?.name)
      || game.i18n.localize("ASTILLON.YourTurn.UnknownName");
    return {
      name,
      art: artChainFrom(actor, baseActor, actor?.img, combatant?.token?.texture?.src, null),
      color: colorFrom(actor, baseActor, null),
    };
  }

  function readDraft(actor: any): { art: string; color: string } | null {
    if (draftActor !== actor || !draftForm?.isConnected) return null;
    return {
      art: draftForm.querySelector<HTMLInputElement>("[name=yourTurnArt]")?.value ?? "",
      color: draftForm.querySelector<HTMLInputElement>("[name=yourTurnColor]")?.value ?? "",
    };
  }

  function subjectFromActor(actor: any): Subject {
    const draft = readDraft(actor);
    const name = trimmed(actor?.name) || game.i18n.localize("ASTILLON.YourTurn.UnknownName");
    return {
      name,
      art: artChainFrom(actor, null, actor?.img, null, draft ? draft.art : null),
      color: colorFrom(actor, null, draft ? draft.color : null),
    };
  }

  function viewport(): { width: number; height: number } {
    const view = document.defaultView;
    return {
      width: view?.innerWidth ?? 0,
      height: view?.innerHeight ?? 0,
    };
  }

  function elementRect(selector: string): DOMRect | null {
    const element = document.querySelector(selector);
    if (!element || typeof (element as HTMLElement).getBoundingClientRect !== "function") return null;
    return (element as HTMLElement).getBoundingClientRect();
  }

  function applyInsets(root: HTMLElement): void {
    const view = viewport();
    const sidebar = ui.sidebar?.element;
    const sidebarRect = sidebar && typeof sidebar.getBoundingClientRect === "function"
      ? sidebar.getBoundingClientRect()
      : null;
    const right = sidebarRect ? Math.max(0, view.width - sidebarRect.left) : 0;
    const bottomBar = elementRect("#ui-bottom") ?? elementRect("#hotbar");
    const bottom = bottomBar ? Math.max(0, view.height - bottomBar.top) : 0;
    const leftBar = elementRect("#ui-left");
    const left = leftBar ? Math.max(0, leftBar.right) : 0;
    const topBar = elementRect("#ui-top");
    const top = topBar ? Math.max(0, topBar.bottom) : 0;
    root.style.setProperty("--yt-top", `${top}px`);
    root.style.setProperty("--yt-right", `${right}px`);
    root.style.setProperty("--yt-bottom", `${bottom}px`);
    root.style.setProperty("--yt-left", `${left}px`);
    // Pixel insets. A percentage height on this overlay does not resolve in Foundry,
    // which collapsed the wedge, the banner plate, and the portrait to nothing.
    root.style.top = `${top}px`;
    root.style.right = `${right}px`;
    root.style.bottom = `${bottom}px`;
    root.style.left = `${left}px`;
    const usableW = Math.max(280, view.width - left - right);
    const usableH = Math.max(280, view.height - top - bottom);
    const stageSize = Math.round(Math.min(usableW * STAGE_WIDTH_OF_MAP, usableH * STAGE_HEIGHT_OF_MAP));
    root.style.setProperty("--yt-stage-size", `${stageSize}px`);
    const stage = root.querySelector<HTMLElement>(".astillon-yt-stage");
    if (stage) {
      stage.style.width = `${stageSize}px`;
      stage.style.height = `${stageSize}px`;
    }
  }

  function applyTheme(root: HTMLElement, color: string): void {
    root.style.setProperty("--yt-color", color);
    root.style.setProperty("--turn-theme", color);
    root.style.setProperty("--turn-highlight", turnHighlight(color));
    root.style.setProperty("--yt-scale", String(readScale()));
  }

  function playLayer(root: HTMLElement, layer: HTMLElement, enterMs: number, exitMs: number, reduced: boolean): void {
    layer.dataset.enterMs = String(enterMs);
    layer.dataset.exitMs = String(exitMs);
    layer.dataset.motion = reduced ? "reduced" : "demo";
    if (typeof layer.animate !== "function") return;
    const animation = layer.animate(turnIntroFrames(enterMs, exitMs, reduced), {
      duration: TURN_INTRO_MS,
      fill: "forwards",
    });
    const running = motions.get(root) ?? [];
    running.push(animation);
    motions.set(root, running);
  }

  function watchSidebar(): void {
    const sidebar = ui.sidebar?.element;
    if (!sidebar || typeof ResizeObserver === "undefined") return;
    if (resizeObserver && observedSidebar === sidebar) return;
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => {
      // Measured once at creation. A sidebar resize must not move a playing cut-in.
    });
    resizeObserver.observe(sidebar);
    observedSidebar = sidebar;
  }

  function refreshInsets(): void {
    // Window resize and sidebar collapse are ignored while a cut-in is on screen.
  }

  function releaseOverlayBlob(node: HTMLElement): void {
    const url = node.dataset.blobUrl ?? "";
    if (!url) return;
    liveBlobs.delete(url);
    revokeIfUnused(url);
  }

  function removeOverlay(): void {
    if (removeTimer !== undefined) {
      clearTimeout(removeTimer);
      removeTimer = undefined;
    }
    const current = overlay;
    overlay = null;
    if (!current) return;
    for (const animation of motions.get(current) ?? []) {
      try {
        animation.cancel();
      } catch {
        // The graphic is already leaving.
      }
    }
    motions.delete(current);
    releaseOverlayBlob(current);
    current.remove();
  }

  function layer(className: string): HTMLDivElement {
    const element = document.createElement("div");
    element.className = className;
    return element;
  }

  function sliceUrl(file: string): string {
    return `modules/${moduleId}/assets/your-turn/${file}`;
  }

  function fitLine(parent: HTMLElement, stagePx: number, fraction: number, maxFont: number): void {
    const span = parent.querySelector("span");
    const text = span?.textContent ?? "";
    const start = stagePx * maxFont;
    let px = start;
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (context && typeof context.measureText === "function") {
        context.font = `italic 900 ${start}px Impact, Haettenschweiler, "Arial Narrow", sans-serif`;
        const measured = context.measureText(text).width;
        px = Math.min(start, start * ((stagePx * fraction) / Math.max(1, measured)));
      }
    } catch {
      // Keep the demo's maximum size when text measurement is unavailable.
    }
    parent.style.fontSize = `${px}px`;
  }

  function buildOverlay(subject: Subject, gen: number, reduced: boolean): HTMLElement {
    const root = document.createElement("div");
    root.className = ROOT_CLASS;
    root.dataset.generation = String(gen);
    root.dataset.motion = reduced ? "reduced" : "demo";
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    root.style.position = "fixed";
    root.style.pointerEvents = "none";
    root.style.zIndex = "80";
    applyTheme(root, subject.color);

    const stage = layer("astillon-yt-stage");
    stage.style.position = "absolute";
    stage.style.right = "0";
    stage.style.bottom = "0";
    stage.style.transformOrigin = "100% 100%";
    stage.style.transform = "scale(var(--yt-scale))";
    stage.style.pointerEvents = "none";

    for (const spec of SLICES) {
      const piece = layer(spec.tint ? "astillon-yt-layer can-tint" : "astillon-yt-layer");
      piece.dataset.layer = spec.id;
      piece.style.zIndex = String(spec.z);
      const image = document.createElement("img");
      image.className = "astillon-yt-slice";
      image.alt = "";
      image.draggable = false;
      image.src = sliceUrl(spec.file);
      piece.append(image);
      if (spec.tint) {
        const tint = document.createElement("div");
        tint.className = "astillon-yt-tint";
        const src = sliceUrl(spec.file);
        tint.style.setProperty("--slice-url", `url("${src}")`);
        tint.style.setProperty("--slice-color", spec.tint === "theme" ? "var(--turn-theme)" : "var(--turn-highlight)");
        piece.append(tint);
      }
      if (spec.text === "name") {
        const name = document.createElement("div");
        name.className = "astillon-yt-name";
        const span = document.createElement("span");
        span.textContent = subject.name;
        name.append(span);
        piece.append(name);
      }
      if (spec.text === "label") {
        const strip = document.createElement("div");
        strip.className = "astillon-yt-strip";
        const span = document.createElement("span");
        span.textContent = game.i18n.localize("ASTILLON.YourTurn.Strip");
        strip.append(span);
        piece.append(strip);
      }
      stage.append(piece);
      playLayer(root, piece, spec.enterMs, spec.exitMs, reduced);
    }

    const portrait = layer("astillon-yt-layer");
    portrait.dataset.layer = "portrait";
    portrait.style.zIndex = "50";
    const character = document.createElement("div");
    character.className = "astillon-yt-character";
    const portraitImage = document.createElement("img");
    portraitImage.alt = "";
    portraitImage.draggable = false;
    character.append(portraitImage);
    portrait.append(character);
    stage.append(portrait);
    playLayer(root, portrait, PORTRAIT_ENTER_MS, PORTRAIT_EXIT_MS, reduced);

    root.append(stage);
    applyInsets(root);
    const stagePx = Number.parseInt(stage.style.width, 10) || 0;
    const name = stage.querySelector<HTMLElement>(".astillon-yt-name");
    const strip = stage.querySelector<HTMLElement>(".astillon-yt-strip");
    if (name) fitLine(name, stagePx, 0.65, 0.095);
    if (strip) fitLine(strip, stagePx, 0.31, 0.043);
    return root;
  }

  function retainBlob(root: HTMLElement, url: string): void {
    if (!url.startsWith("blob:")) return;
    const previous = root.dataset.blobUrl ?? "";
    if (previous && previous !== url) {
      liveBlobs.delete(previous);
      revokeIfUnused(previous);
    }
    root.dataset.blobUrl = url;
    liveBlobs.add(url);
  }

  function revealPortrait(root: HTMLElement, result: ArtResult): void {
    const character = root.querySelector<HTMLElement>(".astillon-yt-character");
    const image = character?.querySelector("img");
    if (!character || !image) return;
    character.classList.toggle("astillon-yt-frame", result.mode === "frame");
    character.classList.toggle("astillon-yt-sticker", result.mode === "sticker");
    character.classList.add("has-art");
    character.dataset.mode = result.mode;
    image.src = result.url;
    if (result.mode === "sticker") retainBlob(root, result.url);
  }

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const fail = () => reject(new Error("your-turn art failed"));
      image.onload = () => resolve(image);
      image.onerror = fail;
      image.src = src;
    });
  }

  function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (typeof canvas.toBlob !== "function") {
        reject(new Error("your-turn blob unavailable"));
        return;
      }
      canvas.toBlob((blob) => {
        if (!blob) reject(new Error("your-turn blob empty"));
        else resolve(blob);
      }, "image/png");
    });
  }

  async function rasterize(image: HTMLImageElement, src: string): Promise<ArtResult> {
    const drawn = scaledEdge(image.naturalWidth || image.width, image.naturalHeight || image.height);
    if (!drawn.width || !drawn.height) throw new Error("your-turn art empty");
    const canvas = document.createElement("canvas");
    canvas.width = drawn.width;
    canvas.height = drawn.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("your-turn canvas unavailable");
    context.drawImage(image, 0, 0, drawn.width, drawn.height);

    let pixels: ImageData;
    try {
      pixels = context.getImageData(0, 0, drawn.width, drawn.height);
    } catch {
      // A tainted canvas cannot be dilated. Keep the raw image in the angular frame.
      return { mode: "frame", url: src };
    }

    if (isOpaqueAlpha(pixels.data, drawn.width * drawn.height)) {
      return { mode: "frame", url: src };
    }

    const radius = outlineRadius(drawn.width, drawn.height);
    const mask = renderOutlineMask(pixels.data, drawn.width, drawn.height, radius);
    const outlined = document.createElement("canvas");
    outlined.width = drawn.width + radius * 2;
    outlined.height = drawn.height + radius * 2;
    const outContext = outlined.getContext("2d");
    if (!outContext) throw new Error("your-turn canvas unavailable");
    outContext.putImageData(imageDataFrom(mask, outlined.width, outlined.height), 0, 0);
    outContext.drawImage(canvas, radius, radius);

    const blob = await canvasToBlob(outlined);
    const create = URL.createObjectURL;
    if (typeof create !== "function") throw new Error("your-turn blob url unavailable");
    return { mode: "sticker", url: create.call(URL, blob) };
  }

  async function prepareArt(src: string): Promise<ArtResult> {
    const resolved = resolveArtUrl(src);
    const cached = artCache.get(src);
    if (cached) return cached;
    let image: HTMLImageElement;
    let loaded = resolved;
    try {
      image = await loadImage(resolved);
    } catch (error) {
      if (resolved === src) throw error;
      image = await loadImage(src);
      loaded = src;
    }
    try {
      return rememberArt(src, await rasterize(image, loaded));
    } catch {
      // A portrait that cannot be outlined still has to appear.
      return rememberArt(src, { mode: "frame", url: loaded });
    }
  }

  async function mountArt(root: HTMLElement, art: string[], gen: number): Promise<void> {
    for (const src of art) {
      if (gen !== generation) return;
      try {
        const prepared = await prepareArt(src);
        if (gen !== generation || overlay !== root) return;
        revealPortrait(root, prepared);
        return;
      } catch {
        // A failed custom path continues down the art chain.
      }
    }
  }

  function present(subject: Subject): void {
    const gen = generation + 1;
    generation = gen;
    const reduced = prefersReducedMotion();
    removeOverlay();
    const root = buildOverlay(subject, gen, reduced);
    document.body.append(root);
    overlay = root;
    watchSidebar();
    removeTimer = setTimeout(() => {
      try {
        if (gen !== generation || overlay !== root) return;
        removeOverlay();
      } catch {
        // Removal is cosmetic.
      }
    }, TURN_INTRO_MS);
    void mountArt(root, subject.art, gen).catch(() => {
      // Decode failures stay inside the art chain.
    });
  }

  function preview(actor: any): void {
    try {
      present(subjectFromActor(actor));
    } catch {
      // Preview must not throw into the sheet.
    }
  }

  function cancel(): void {
    generation += 1;
    try {
      removeOverlay();
    } catch {
      overlay = null;
    }
  }

  function historyChanged(prior: CombatHistory, current: CombatHistory): boolean {
    if (!current.combatantId) return false;
    return (
      prior.combatantId !== current.combatantId
      || prior.round !== current.round
      || prior.turn !== current.turn
    );
  }

  function onCombatTurnChange(combat: any, prior: CombatHistory, current: CombatHistory): void {
    try {
      if (!isEnabled()) return;
      if (combat !== ui.combat?.viewed) return;
      if (!current.combatantId) return;
      if (!historyChanged(prior, current)) return;
      const combatant = combat.combatant;
      if (!combatant) return;
      present(subjectFromCombatant(combatant));
    } catch {
      // A bad portrait must not break the combat hook.
    }
  }

  function filePickerClass(): any {
    return foundry.applications?.apps?.FilePicker?.implementation ?? (globalThis as any).FilePicker;
  }

  function openFilePicker(input: HTMLInputElement): void {
    const Picker = filePickerClass();
    if (!Picker) return;
    try {
      const picker = new Picker({
        type: "image",
        current: input.value,
        callback: (path: string) => {
          input.value = path;
        },
      });
      if (typeof picker.render === "function") picker.render({ force: true });
      else if (typeof picker.browse === "function") void picker.browse(input.value);
    } catch {
      // The text field still accepts a pasted path.
    }
  }

  async function writeFlags(actor: any, art: string, color: string): Promise<void> {
    if (typeof actor?.setFlag !== "function" || typeof actor?.unsetFlag !== "function") return;
    const trimmedArt = art.trim();
    if (trimmedArt) await actor.setFlag(moduleId, ART_FLAG, trimmedArt);
    else await actor.unsetFlag(moduleId, ART_FLAG);
    const hex = normalizeHexColor(color);
    if (hex) await actor.setFlag(moduleId, COLOR_FLAG, hex);
    else await actor.unsetFlag(moduleId, COLOR_FLAG);
  }

  function editorContent(actor: any): string {
    const art = trimmed(flagRaw(actor, ART_FLAG));
    const color = normalizeHexColor(flagRaw(actor, COLOR_FLAG)) ?? DEFAULT_COLOR;
    return `<form class="astillon-yt-editor" autocomplete="off">
      <label class="astillon-yt-editor-label">
        <span>${escapeHtml(game.i18n.localize("ASTILLON.YourTurn.Art"))}</span>
        <span class="astillon-yt-editor-file">
          <input type="text" name="yourTurnArt" value="${escapeHtml(art)}">
          <button type="button" data-action="browse">${escapeHtml(game.i18n.localize("ASTILLON.YourTurn.Browse"))}</button>
        </span>
      </label>
      <label class="astillon-yt-editor-label">
        <span>${escapeHtml(game.i18n.localize("ASTILLON.YourTurn.Color"))}</span>
        <input type="color" name="yourTurnColor" value="${escapeHtml(color)}">
      </label>
      <button type="button" data-action="preview">${escapeHtml(game.i18n.localize("ASTILLON.YourTurn.Preview"))}</button>
    </form>`;
  }

  function bindEditor(element: HTMLElement, actor: any): void {
    const form = element.querySelector<HTMLFormElement>("form.astillon-yt-editor");
    if (!form) return;
    draftActor = actor;
    draftForm = form;
    form.querySelector<HTMLButtonElement>("[data-action=browse]")?.addEventListener("click", (event) => {
      event.preventDefault();
      const input = form.querySelector<HTMLInputElement>("[name=yourTurnArt]");
      if (input) openFilePicker(input);
    });
    form.querySelector<HTMLButtonElement>("[data-action=preview]")?.addEventListener("click", (event) => {
      event.preventDefault();
      preview(actor);
    });
  }

  function editorElement(first: any, second: any): HTMLElement | null {
    if (second?.element instanceof HTMLElement) return second.element;
    if (first?.element instanceof HTMLElement) return first.element;
    if (second instanceof HTMLElement) return second;
    if (first instanceof HTMLElement) return first;
    return null;
  }

  async function openEditor(actor: any): Promise<void> {
    if (!actor) return;
    try {
      const DialogV2 = foundry.applications?.api?.DialogV2;
      if (typeof DialogV2?.wait !== "function") {
        openFallbackEditor(actor);
        return;
      }
      await DialogV2.wait({
        window: { title: game.i18n.localize("ASTILLON.YourTurn.EditorTitle") },
        content: editorContent(actor),
        buttons: [
          {
            action: "save",
            icon: "fas fa-save",
            label: game.i18n.localize("ASTILLON.YourTurn.Save"),
            default: true,
            callback: () => writeFlags(
              actor,
              draftForm?.querySelector<HTMLInputElement>("[name=yourTurnArt]")?.value ?? "",
              draftForm?.querySelector<HTMLInputElement>("[name=yourTurnColor]")?.value ?? "",
            ),
          },
        ],
        render: (first: any, second: any) => {
          const element = editorElement(first, second);
          if (element) bindEditor(element, actor);
        },
        rejectClose: false,
      });
    } catch {
      // Closing the editor is not an error.
    }
  }

  function openFallbackEditor(actor: any): void {
    const wrap = document.createElement("div");
    wrap.className = "astillon-yt-editor-fallback";
    wrap.innerHTML = editorContent(actor);
    const save = document.createElement("button");
    save.type = "button";
    save.dataset.action = "save";
    save.textContent = game.i18n.localize("ASTILLON.YourTurn.Save");
    save.addEventListener("click", () => {
      void writeFlags(
        actor,
        wrap.querySelector<HTMLInputElement>("[name=yourTurnArt]")?.value ?? "",
        wrap.querySelector<HTMLInputElement>("[name=yourTurnColor]")?.value ?? "",
      );
    });
    wrap.append(save);
    document.body.append(wrap);
    bindEditor(wrap, actor);
  }

  function configureLabel(): string {
    return game.i18n.localize("ASTILLON.YourTurn.Configure");
  }

  function sheetIsEditable(sheet: any): boolean {
    return sheet?.isEditable === true;
  }

  function onActorSheetHeaderButtons(sheet: any, buttons: any[]): void {
    if (!sheetIsEditable(sheet) || !Array.isArray(buttons)) return;
    if (buttons.some((button) => button?.class === CONFIGURE_CLASS)) return;
    const actor = sheet.actor ?? sheet.document;
    if (!actor) return;
    buttons.unshift({
      class: CONFIGURE_CLASS,
      icon: "fas fa-bolt",
      label: configureLabel(),
      onclick: () => {
        void openEditor(actor);
      },
    });
  }

  function onHeaderControls(app: any, controls: any[]): void {
    if (!Array.isArray(controls)) return;
    if (app?.document?.documentName !== "Actor") return;
    if (!sheetIsEditable(app)) return;
    if (controls.some((control) => control?.action === CONFIGURE_ACTION || control?.class === CONFIGURE_CLASS)) return;
    controls.push({
      icon: "fas fa-bolt",
      label: configureLabel(),
      action: CONFIGURE_ACTION,
      class: CONFIGURE_CLASS,
      onClick: () => {
        void openEditor(app.document);
      },
    });
  }

  function htmlRoot(value: any): HTMLElement | null {
    if (typeof HTMLElement !== "undefined" && value instanceof HTMLElement) return value;
    if (value?.element instanceof HTMLElement) return value.element;
    if (value?.[0] instanceof HTMLElement) return value[0];
    return null;
  }

  function onRenderApplicationV2(app: any, element: any): void {
    try {
      if (app?.document?.documentName !== "Actor") return;
      if (!sheetIsEditable(app)) return;
      const root = htmlRoot(element) ?? htmlRoot(app?.element);
      if (!root) return;
      if (root.querySelector(`.${CONFIGURE_CLASS}`)) return;
      const header = root.querySelector(".window-header") ?? root;
      const button = document.createElement("button");
      button.type = "button";
      button.className = CONFIGURE_CLASS;
      button.dataset.action = CONFIGURE_ACTION;
      button.textContent = configureLabel();
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void openEditor(app.document);
      });
      header.append(button);
    } catch {
      // A sheet header must still render.
    }
  }

  return {
    id: FEATURE_ID,
    api: {
      preview,
      cancel,
    },
    init() {
      const localize = (key: string) => game.i18n.localize(key);
      game.settings.register(moduleId, SETTING_ENABLED, {
        name: localize("ASTILLON.YourTurn.Enabled"),
        hint: localize("ASTILLON.YourTurn.EnabledHint"),
        scope: "user",
        config: true,
        type: createBooleanField(),
        default: false,
      });
      game.settings.register(moduleId, SETTING_SCALE, {
        name: localize("ASTILLON.YourTurn.Scale"),
        hint: localize("ASTILLON.YourTurn.ScaleHint"),
        scope: "user",
        config: true,
        type: createNumberField({ min: 0.5, max: 1.5, step: 0.05 }),
        default: 1,
      });
      game.settings.register(moduleId, SETTING_HOLD, {
        name: localize("ASTILLON.YourTurn.Hold"),
        hint: localize("ASTILLON.YourTurn.HoldHint"),
        scope: "user",
        config: true,
        type: createNumberField({ min: 0.5, max: 4, step: 0.05 }),
        default: 1.45,
      });

      Hooks.on("combatTurnChange", onCombatTurnChange);
      Hooks.on("collapseSidebar", refreshInsets);
      Hooks.on("getActorSheetHeaderButtons", onActorSheetHeaderButtons);
      Hooks.on("getHeaderControlsApplicationV2", onHeaderControls);
      Hooks.on("renderApplicationV2", onRenderApplicationV2);

      const view = document.defaultView;
      view?.addEventListener("resize", refreshInsets);
    },
  };
}
