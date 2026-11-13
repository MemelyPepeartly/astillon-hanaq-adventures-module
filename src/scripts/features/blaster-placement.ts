import type { Point } from "./blaster-model.js";

export type BlastPickerOptions = {
  title: string;
  pointCount: 2 | 8;
  range: number;
  width: 1 | 3;
  color: string;
  fixedLength?: number;
};
export type BlastPicker = {
  pick(token: any, options: BlastPickerOptions): Promise<Point[] | null>;
  cancel(): void;
  readonly busy: boolean;
};

const SVG_NS = "http://www.w3.org/2000/svg";
const finitePoint = (point: Point | undefined): point is Point => !!point && Number.isFinite(point.x) && Number.isFinite(point.y);

/** One shared, cancellable picker for immediate lines and the Finale's clicked path. */
export function createBlastPicker(): BlastPicker {
  let cancelCurrent: (() => void) | null = null;

  async function pick(token: any, options: BlastPickerOptions): Promise<Point[] | null> {
    if (cancelCurrent) {
      ui.notifications.warn("Finish or cancel the current blast placement first.");
      return null;
    }
    const scene = canvas.scene;
    const grid = canvas.grid;
    const app = canvas.app;
    const stage = canvas.stage;
    const view: HTMLCanvasElement = app.canvas ?? app.view;
    const fixed = options.fixedLength !== undefined;
    if (!canvas.ready || !scene || !grid.isSquare || !Number.isFinite(grid.size) || grid.size <= 0
      || ![2, 8].includes(options.pointCount) || ![1, 3].includes(options.width)
      || !Number.isFinite(options.range) || options.range <= 0
      || (fixed && (options.pointCount !== 2 || !Number.isFinite(options.fixedLength) || options.fixedLength! <= 0
        || !Number.isFinite(grid.distance) || grid.distance <= 0))) {
      throw new Error("Blast placement requires a valid square grid and range.");
    }
    const doc = token.document;
    const center = token.center;
    const origin: Point = finitePoint(center) ? { x: center.x, y: center.y }
      : { x: doc.x + doc.width * grid.size / 2, y: doc.y + doc.height * grid.size / 2 };
    if (!finitePoint(origin)) throw new Error("Blaster's center could not be determined.");
    const points: Point[] = fixed ? [origin] : [];
    let cursor: Point | null = null;
    let finished = false;
    const overlay = document.createElementNS(SVG_NS, "svg");
    overlay.setAttribute("class", "aha-blast-preview");
    overlay.setAttribute("aria-hidden", "true");
    const status = document.createElement("div");
    status.className = "aha-blast-instructions";
    status.setAttribute("role", "status");

    const measureLeg = (start: Point, end: Point) => grid.measurePath([start, end]).distance;
    const exceedsRange = (distance: number) => !Number.isFinite(distance) || distance > options.range + 0.001;
    const toScreen = (point: Point): Point => {
      const rect = view.getBoundingClientRect();
      const global = stage.toGlobal(point);
      return { x: rect.left + global.x * rect.width / app.screen.width, y: rect.top + global.y * rect.height / app.screen.height };
    };
    const toWorld = (event: PointerEvent): Point => {
      const rect = view.getBoundingClientRect();
      return grid.getCenterPoint(stage.toLocal({
        x: (event.clientX - rect.left) * app.screen.width / rect.width,
        y: (event.clientY - rect.top) * app.screen.height / rect.height,
      }));
    };
    const endpoint = (aim: Point): Point | null => {
      const dx = aim.x - origin.x;
      const dy = aim.y - origin.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 1) return null;
      // Native PF2e areas use scene-distance-to-pixel conversion, not movement distance.
      const length = options.fixedLength! * grid.size / grid.distance;
      return { x: origin.x + dx * length / distance, y: origin.y + dy * length / distance };
    };

    return new Promise((resolve, reject) => {
      const finish = (result: Point[] | null, error?: unknown) => {
        if (finished) return;
        finished = true;
        view.removeEventListener("pointerdown", click, true);
        view.removeEventListener("pointerup", stop, true);
        view.removeEventListener("click", stop, true);
        view.removeEventListener("pointermove", move, true);
        view.removeEventListener("contextmenu", cancel, true);
        window.removeEventListener("keydown", key, true);
        window.removeEventListener("resize", redraw);
        Hooks.off("canvasPan", redraw);
        Hooks.off("canvasTearDown", teardown);
        overlay.remove();
        status.remove();
        cancelCurrent = null;
        if (error) reject(error);
        else resolve(result);
      };
      const sameScene = () => {
        if (finished) return false;
        if (!canvas.ready || canvas.scene !== scene || canvas.app !== app || canvas.stage !== stage || canvas.grid !== grid) {
          finish(null);
          return false;
        }
        return true;
      };
      const draw = () => {
        if (!sameScene()) return;
        overlay.replaceChildren();
        const path = cursor ? [...points, cursor] : points;
        const distances = fixed ? [] : path.slice(1).map((point, i) => measureLeg(path[i], point));
        const line = document.createElementNS(SVG_NS, "polyline");
        line.setAttribute("points", path.map(toScreen).map(p => `${p.x},${p.y}`).join(" "));
        line.setAttribute("fill", "none");
        line.setAttribute("stroke", distances.some(exceedsRange) ? "#ff2222" : options.color);
        line.setAttribute("stroke-width", String(options.width * grid.size * stage.scale.x * view.getBoundingClientRect().width / app.screen.width));
        line.setAttribute("stroke-opacity", "0.35");
        line.setAttribute("stroke-linejoin", "bevel");
        overlay.append(line);
        for (const [i, point] of path.entries()) {
          const p = toScreen(point);
          const marker = document.createElementNS(SVG_NS, "text");
          marker.setAttribute("x", String(p.x)); marker.setAttribute("y", String(p.y));
          marker.setAttribute("fill", "white"); marker.setAttribute("stroke", "black");
          marker.setAttribute("paint-order", "stroke"); marker.setAttribute("stroke-width", "3");
          marker.setAttribute("font-size", "22"); marker.textContent = String(i + 1);
          overlay.append(marker);
        }
        if (fixed) {
          status.textContent = `${options.title} · ${options.fixedLength} ${grid.units} fixed line · ${options.width} square${options.width === 1 ? "" : "s"} wide · Click once to aim from Blaster · Esc/right-click: cancel`;
        } else {
          const legStatus = distances.length ? ` · ${cursor ? "Next" : "Last"} leg: ${Math.round(distances[distances.length - 1])}/${options.range} ${grid.units}` : "";
          status.textContent = `${options.title} · ${points.length}/${options.pointCount} points · ${options.range} ${grid.units} per leg${legStatus} · ${points.length ? "Click next square" : "Click Blaster's square first"} · Backspace: undo · Esc/right-click: cancel`;
        }
      };
      const safely = (action: () => void) => { try { action(); } catch (error) { finish(null, error); } };
      const redraw = () => safely(draw);
      const stop = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
      const cancel = (event: Event) => { stop(event); finish(null); };
      const teardown = () => finish(null);
      const click = (event: PointerEvent) => safely(() => {
        if (!sameScene()) return;
        if (event.button !== 0) { if (event.button === 2) cancel(event); return; }
        stop(event);
        const point = toWorld(event);
        if (!finitePoint(point)) throw new Error("Invalid waypoint.");
        if (fixed) {
          const end = endpoint(point);
          if (!end) { ui.notifications.warn("Choose a direction away from Blaster's center."); return; }
          finish([origin, end]);
          return;
        }
        if (!points.length && !(point.x >= doc.x && point.y >= doc.y && point.x < doc.x + doc.width * grid.size && point.y < doc.y + doc.height * grid.size)) {
          ui.notifications.warn("The first waypoint must be in Blaster's square."); return;
        }
        const previous = points[points.length - 1];
        if (previous && point.x === previous.x && point.y === previous.y) return;
        if (previous && exceedsRange(measureLeg(previous, point))) {
          ui.notifications.warn(`Each leg cannot exceed ${options.range} ${grid.units}.`); return;
        }
        points.push(point); cursor = null;
        draw();
        if (points.length === options.pointCount) finish(points);
      });
      const move = (event: PointerEvent) => safely(() => {
        if (!sameScene()) return;
        const point = toWorld(event);
        if (!finitePoint(point)) throw new Error("Invalid waypoint.");
        cursor = fixed ? endpoint(point) : point;
        draw();
      });
      const key = (event: KeyboardEvent) => safely(() => {
        if (!sameScene()) return;
        if (event.key === "Escape") cancel(event);
        else if (event.key === "Backspace") {
          stop(event);
          if (!fixed) points.pop();
          else cursor = null;
          draw();
        }
      });
      cancelCurrent = teardown;
      safely(() => {
        document.body.append(overlay, status);
        view.addEventListener("pointerdown", click, true);
        view.addEventListener("pointerup", stop, true);
        view.addEventListener("click", stop, true);
        view.addEventListener("pointermove", move, true);
        view.addEventListener("contextmenu", cancel, true);
        window.addEventListener("keydown", key, true);
        window.addEventListener("resize", redraw);
        Hooks.on("canvasPan", redraw);
        Hooks.on("canvasTearDown", teardown);
        draw();
      });
    });
  }

  return { pick, cancel: () => cancelCurrent?.(), get busy() { return cancelCurrent !== null; } };
}
