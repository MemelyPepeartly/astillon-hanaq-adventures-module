import type { ModuleFeature } from "./feature.js";

const FEATURE_ID = "your-turn";
const SETTING_ENABLED = "yourTurnEnabled";
const SETTING_SCALE = "yourTurnScale";
const SETTING_HOLD = "yourTurnHold";
const ART_FLAG = "yourTurnArt";
const COLOR_FLAG = "yourTurnColor";
const DEFAULT_COLOR = "#2B8CFF";
const BACKING_COLOR = "#0B0B12";
const ROOT_CLASS = "astillon-yt";
const CONFIGURE_CLASS = "astillon-your-turn-configure";
const CONFIGURE_ACTION = "astillon-your-turn";
const INK_ALPHA = 16;
const OPAQUE_ALPHA = 250;
const MAX_EDGE = 1024;
const INTRO_END = 0.6;
const OUTRO = 0.55;
const REDUCED_FADE_MS = 400;
const STAGE_WIDTH_RATIO = 0.78;
const STAGE_HEIGHT_RATIO = 0.92;

const ENTER_PANELS = { name: "astillon-yt-enter-panels", delay: 0, duration: 0.3 };
const ENTER_CHARACTER = { name: "astillon-yt-enter-character", delay: 0.15, duration: 0.3 };
const ENTER_BANNER = { name: "astillon-yt-enter-banner", delay: 0.3, duration: 0.3 };
const EXIT_TEXT = { name: "astillon-yt-exit-text", offset: 0, duration: 0.22 };
const EXIT_CHARACTER = { name: "astillon-yt-exit-character", offset: 0.16, duration: 0.24 };
const EXIT_PANELS = { name: "astillon-yt-exit-panels", offset: 0.25, duration: 0.3 };

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

type Motion = {
  name: string;
  delay: number;
  duration: number;
};

type Rgb = { r: number; g: number; b: number };

/**
 * Radius-5 regression: 3-4-5 is the disk edge, and one step past it is outside.
 * The outline painter uses this same comparison.
 */
export function euclideanOutlineCovers(dx: number, dy: number, radius: number): boolean {
  return dx * dx + dy * dy <= radius * radius;
}

/** Mix `ratio` of the way from `hex` toward white. `ratio` 0.35 is the light panel. */
export function mixTowardWhite(hex: string, ratio: number): string {
  const rgb = parseHex(hex) ?? parseHex(DEFAULT_COLOR)!;
  const mix = (channel: number) => Math.round(channel + (255 - channel) * ratio);
  return formatHex(mix(rgb.r), mix(rgb.g), mix(rgb.b));
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

function seconds(value: number): string {
  return `${value.toFixed(2)}s`;
}

function holdMilliseconds(holdSeconds: number): number {
  return Math.round(holdSeconds * 1000);
}

function durationMs(holdSeconds: number, reduced: boolean): number {
  const holdMs = holdMilliseconds(holdSeconds);
  if (reduced) return REDUCED_FADE_MS + holdMs + REDUCED_FADE_MS;
  return Math.round(INTRO_END * 1000) + holdMs + Math.round(OUTRO * 1000);
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

  function readHold(): number {
    const value = Number(readSetting(SETTING_HOLD));
    return Number.isFinite(value) ? value : 1.45;
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
    const stageW = Math.round(usableW * STAGE_WIDTH_RATIO);
    const stageH = Math.round(usableH * STAGE_HEIGHT_RATIO);
    root.style.setProperty("--yt-stage-w", `${stageW}px`);
    root.style.setProperty("--yt-stage-h", `${stageH}px`);
    const stage = root.querySelector<HTMLElement>(".astillon-yt-stage");
    if (stage) {
      stage.style.width = `${stageW}px`;
      stage.style.height = `${stageH}px`;
    }
  }

  function applyTheme(root: HTMLElement, color: string): void {
    root.style.setProperty("--yt-color", color);
    root.style.setProperty("--yt-panel", saturatedPanelColor(color));
    root.style.setProperty("--yt-light", mixTowardWhite(color, 0.35));
    root.style.setProperty("--yt-backing", BACKING_COLOR);
    root.style.setProperty("--yt-scale", String(readScale()));
  }

  function clearMotion(element: HTMLElement): void {
    element.style.animationName = "none";
    element.style.animationDuration = "0s";
    element.style.animationDelay = "0s";
    element.style.animationFillMode = "none";
  }

  function applyMotion(element: HTMLElement, enter: Motion | null, exit: Motion | null, reduced: boolean): void {
    if (reduced) {
      clearMotion(element);
      return;
    }
    const names: string[] = [];
    const durations: string[] = [];
    const delays: string[] = [];
    const fills: string[] = [];
    if (enter) {
      names.push(enter.name);
      durations.push(seconds(enter.duration));
      delays.push(seconds(enter.delay));
      fills.push("both");
    }
    if (exit) {
      names.push(exit.name);
      durations.push(seconds(exit.duration));
      delays.push(seconds(exit.delay));
      fills.push("forwards");
    }
    element.style.animationName = names.join(", ");
    element.style.animationDuration = durations.join(", ");
    element.style.animationDelay = delays.join(", ");
    element.style.animationTimingFunction = names.map(() => "cubic-bezier(0.16, 0.84, 0.32, 1)").join(", ");
    element.style.animationFillMode = fills.join(", ");
    element.style.animationIterationCount = names.map(() => "1").join(", ");
  }

  function exitMotion(offset: number, duration: number, name: string, hold: number): Motion {
    return { name, delay: INTRO_END + hold + offset, duration };
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
    releaseOverlayBlob(current);
    current.remove();
  }

  function layer(className: string): HTMLDivElement {
    const element = document.createElement("div");
    element.className = className;
    return element;
  }

  function buildOverlay(subject: Subject, gen: number, reduced: boolean, hold: number): HTMLElement {
    const root = document.createElement("div");
    root.className = reduced ? `${ROOT_CLASS} astillon-yt-reduced` : ROOT_CLASS;
    root.dataset.generation = String(gen);
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

    const slashHold = layer("astillon-yt-slash-hold");
    const slash = layer("astillon-yt-slash");
    slashHold.append(slash);
    const back = layer("astillon-yt-panel astillon-yt-panel-back");
    const saturated = layer("astillon-yt-panel astillon-yt-panel-sat");
    const accentHold = layer("astillon-yt-accent-hold");
    const accent = layer("astillon-yt-panel astillon-yt-panel-accent");
    accentHold.append(accent);
    const light = layer("astillon-yt-panel astillon-yt-panel-light");
    const bannerHold = layer("astillon-yt-banner-hold");
    const banner = layer("astillon-yt-banner");
    const edgeHold = layer("astillon-yt-banner-edge-hold");
    const edge = layer("astillon-yt-banner-edge");
    edgeHold.append(edge);
    const plate = layer("astillon-yt-banner-plate");
    const text = layer("astillon-yt-banner-text");
    const name = document.createElement("p");
    name.className = "astillon-yt-name astillon-yt-support";
    name.textContent = subject.name;
    const strip = document.createElement("p");
    strip.className = "astillon-yt-strip astillon-yt-headline";
    strip.textContent = game.i18n.localize("ASTILLON.YourTurn.Strip");
    text.append(name, strip);
    banner.append(edgeHold, plate, text);
    bannerHold.append(banner);

    const panelExit = exitMotion(EXIT_PANELS.offset, EXIT_PANELS.duration, EXIT_PANELS.name, hold);
    const textExit = exitMotion(EXIT_TEXT.offset, EXIT_TEXT.duration, EXIT_TEXT.name, hold);
    for (const panel of [back, saturated, accent, light, slash]) {
      applyMotion(panel, ENTER_PANELS, panelExit, reduced);
    }
    applyMotion(edge, null, panelExit, reduced);
    applyMotion(plate, null, panelExit, reduced);
    applyMotion(banner, ENTER_BANNER, null, reduced);
    applyMotion(text, null, textExit, reduced);

    stage.append(back, saturated, accentHold, light, slashHold, bannerHold);
    root.append(stage);
    applyInsets(root);

    if (reduced) {
      const holdMs = holdMilliseconds(hold);
      root.style.animationName = "astillon-yt-fade-in, astillon-yt-fade-out";
      root.style.animationDuration = `${REDUCED_FADE_MS}ms, ${REDUCED_FADE_MS}ms`;
      root.style.animationDelay = `0ms, ${REDUCED_FADE_MS + holdMs}ms`;
      root.style.animationTimingFunction = "linear, linear";
      root.style.animationFillMode = "both, forwards";
      root.style.animationIterationCount = "1, 1";
    }

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

  function appendCharacter(root: HTMLElement, result: ArtResult, reduced: boolean, hold: number): void {
    const stage = root.querySelector(".astillon-yt-stage");
    if (!stage) return;
    const character = document.createElement("div");
    character.className = result.mode === "frame"
      ? "astillon-yt-character astillon-yt-frame"
      : "astillon-yt-character astillon-yt-sticker";
    character.dataset.mode = result.mode;
    const image = document.createElement("img");
    image.alt = "";
    image.src = result.url;
    image.style.width = "100%";
    image.style.height = "100%";
    image.style.maxWidth = "none";
    image.style.maxHeight = "none";
    image.style.objectFit = "contain";
    image.style.objectPosition = "center bottom";
    character.append(image);
    const banner = stage.querySelector(".astillon-yt-banner-hold");
    if (banner) stage.insertBefore(character, banner);
    else stage.append(character);
    applyMotion(
      character,
      ENTER_CHARACTER,
      exitMotion(EXIT_CHARACTER.offset, EXIT_CHARACTER.duration, EXIT_CHARACTER.name, hold),
      reduced,
    );
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

  async function mountArt(root: HTMLElement, art: string[], gen: number, reduced: boolean, hold: number): Promise<void> {
    for (const src of art) {
      if (gen !== generation) return;
      try {
        const prepared = await prepareArt(src);
        if (gen !== generation || overlay !== root) return;
        appendCharacter(root, prepared, reduced, hold);
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
    const hold = readHold();
    removeOverlay();
    const root = buildOverlay(subject, gen, reduced, hold);
    document.body.append(root);
    overlay = root;
    watchSidebar();
    const duration = durationMs(hold, reduced);
    removeTimer = setTimeout(() => {
      try {
        if (gen !== generation || overlay !== root) return;
        removeOverlay();
      } catch {
        // Removal is cosmetic.
      }
    }, duration);
    void mountArt(root, subject.art, gen, reduced, hold).catch(() => {
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
