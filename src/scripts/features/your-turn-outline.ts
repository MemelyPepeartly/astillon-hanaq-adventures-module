/** Normalized, image-specific strokes erase the outline layer, never the source artwork. */
export type OutlineStroke = { radius: number; points: [number, number][] };
export type OutlineMask = { image: string; strokes: OutlineStroke[] };
const MAX_STROKES = 64;
const MAX_POINTS = 128;
const clamp = (n: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, n)) * 10000) / 10000;

export function normalizeOutlineMask(value: any): OutlineMask | null {
  if (!value || typeof value.image !== "string" || !Array.isArray(value.strokes)) return null;
  const strokes: OutlineStroke[] = [];
  for (const raw of value.strokes.slice(0, MAX_STROKES)) {
    if (!Number.isFinite(raw?.radius) || !Array.isArray(raw.points)) continue;
    const points: [number, number][] = raw.points.slice(0, MAX_POINTS)
      .filter((p: any) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
      .map((p: number[]) => [clamp(p[0], -0.25, 1.25), clamp(p[1], -0.25, 1.25)]);
    if (points.length) strokes.push({ radius: clamp(raw.radius, 0.002, 0.25), points });
  }
  return { image: value.image, strokes };
}

export function drawOutlineExclusions(context: CanvasRenderingContext2D, mask: OutlineMask | null,
  width: number, height: number, padding: number, overlay = false): void {
  if (!mask?.strokes.length) return;
  context.save();
  context.globalCompositeOperation = overlay ? "source-over" : "destination-out";
  context.strokeStyle = context.fillStyle = overlay ? "rgba(255,85,110,0.24)" : "#000";
  context.lineCap = context.lineJoin = "round";
  for (const stroke of mask.strokes) {
    const radius = stroke.radius * Math.min(width, height);
    const [first, ...rest] = stroke.points;
    context.lineWidth = radius * 2;
    context.beginPath();
    if (!rest.length) {
      context.arc(first[0] * width + padding, first[1] * height + padding, radius, 0, Math.PI * 2);
      context.fill();
    } else {
      context.moveTo(first[0] * width + padding, first[1] * height + padding);
      for (const point of rest) context.lineTo(point[0] * width + padding, point[1] * height + padding);
      context.stroke();
    }
  }
  context.restore();
}

/** DOM-only painter mounted by the Foundry dialog after render; also used by the authorized visual preview. */
export function createOutlinePainter(source: HTMLCanvasElement, outline: Uint8ClampedArray, padding: number,
  initial: OutlineMask | null, image: string, labels: Record<string, string>) {
  const mask = normalizeOutlineMask(initial?.image === image ? initial : { image, strokes: [] })!;
  const element = document.createElement("div");
  element.className = "astillon-yt-mask-editor";
  element.innerHTML = `<p data-label="hint"></p>
    <div class="astillon-yt-mask-tools">
      <label><span data-label="brush"></span> <input type="range" min="4" max="80" value="28" data-brush><output>28 px</output></label>
      <button type="button" data-undo data-label="undo"></button>
      <button type="button" data-clear data-label="clear"></button>
      <label><input type="checkbox" data-show><span data-label="show"></span></label>
    </div><canvas></canvas><p data-status role="status"></p>`;
  for (const node of Array.from(element.querySelectorAll<HTMLElement>("[data-label]"))) node.textContent = labels[node.dataset.label!] ?? "";
  const canvas = element.querySelector("canvas")!;
  canvas.setAttribute("aria-label", labels.hint);
  canvas.width = source.width + padding * 2; canvas.height = source.height + padding * 2;
  const base = document.createElement("canvas"); base.width = canvas.width; base.height = canvas.height;
  const baseContext = base.getContext("2d")!;
  const imageData = baseContext.createImageData(base.width, base.height);
  imageData.data.set(outline); baseContext.putImageData(imageData, 0, 0);
  const context = canvas.getContext("2d")!;
  const brush = element.querySelector<HTMLInputElement>("[data-brush]")!;
  const show = element.querySelector<HTMLInputElement>("[data-show]")!;
  const undo = element.querySelector<HTMLButtonElement>("[data-undo]")!;
  const clear = element.querySelector<HTMLButtonElement>("[data-clear]")!;
  const status = element.querySelector<HTMLElement>("[data-status]")!;
  const controller = new AbortController();
  let active: OutlineStroke | null = null, pointer: number | null = null;
  let cursor: [number, number] | null = null, frame: number | null = null, disposed = false;
  const point = (event: PointerEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    return [clamp(((event.clientX - rect.left) * canvas.width / rect.width - padding) / source.width, -0.25, 1.25),
      clamp(((event.clientY - rect.top) * canvas.height / rect.height - padding) / source.height, -0.25, 1.25)];
  };
  const redraw = () => {
    frame = null;
    if (disposed) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(base, 0, 0);
    drawOutlineExclusions(context, mask, source.width, source.height, padding);
    context.drawImage(source, padding, padding);
    if (show.checked) drawOutlineExclusions(context, mask, source.width, source.height, padding, true);
    if (cursor) {
      context.save(); context.strokeStyle = "#ff7890"; context.lineWidth = 2; context.setLineDash([5, 4]);
      context.beginPath(); context.arc(cursor[0] * source.width + padding, cursor[1] * source.height + padding, Number(brush.value), 0, Math.PI * 2); context.stroke(); context.restore();
    }
    undo.disabled = clear.disabled = mask.strokes.length === 0;
  };
  const schedule = () => { if (!disposed && frame === null) frame = requestAnimationFrame(redraw); };
  const addPoint = (p: [number, number]) => {
    if (!active) return;
    if (active.points.length >= MAX_POINTS) { status.textContent = labels.strokeLimit; return; }
    const last = active.points[active.points.length - 1];
    if (!last || Math.hypot((p[0] - last[0]) * source.width, (p[1] - last[1]) * source.height) >= 2) active.points.push(p);
  };
  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0 || pointer !== null) return;
    event.preventDefault(); event.stopPropagation();
    if (mask.strokes.length >= MAX_STROKES) { status.textContent = labels.limit; return; }
    status.textContent = "";
    pointer = event.pointerId; cursor = point(event);
    active = { radius: clamp(Number(brush.value) / Math.min(source.width, source.height), 0.002, 0.25), points: [cursor] };
    mask.strokes.push(active); canvas.setPointerCapture(pointer); schedule();
  }, { signal: controller.signal });
  canvas.addEventListener("pointermove", event => {
    if (pointer !== null && event.pointerId !== pointer) return;
    cursor = point(event);
    if (pointer !== null) { event.preventDefault(); addPoint(cursor); }
    schedule();
  }, { signal: controller.signal });
  const finish = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    if (event.type === "pointerup") addPoint(point(event));
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    pointer = null; active = null; schedule();
  };
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"] as const) canvas.addEventListener(name, finish, { signal: controller.signal });
  canvas.addEventListener("pointerleave", () => { if (pointer === null) { cursor = null; schedule(); } }, { signal: controller.signal });
  brush.addEventListener("input", () => { element.querySelector("output")!.textContent = `${brush.value} px`; schedule(); }, { signal: controller.signal });
  show.addEventListener("change", schedule, { signal: controller.signal });
  undo.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); active = null; mask.strokes.pop(); status.textContent = ""; schedule(); }, { signal: controller.signal });
  clear.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); active = null; mask.strokes.length = 0; status.textContent = ""; schedule(); }, { signal: controller.signal });
  redraw();
  return { element, read: () => normalizeOutlineMask(mask), destroy: () => {
    if (disposed) return;
    disposed = true; controller.abort();
    if (frame !== null) cancelAnimationFrame(frame);
    if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    canvas.width = base.width = 0;
  } };
}
