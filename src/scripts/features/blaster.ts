import type { ModuleFeature } from "./feature.js";
import { BLAST_MODES, BLAST_TIERS, isBlastRooted, lineShapes, type BlastMode, type Charge, type Point, type RootState } from "./blaster-model.js";
import { createBlasterSummons } from "./blaster-summons.js";

type BlastUse = { combatId: string | null; round: number; rechargeCombatId?: string | null; readyRound?: number; readyTime?: number };
const SVG_NS = "http://www.w3.org/2000/svg";

export function createBlasterFeature(moduleId: string): ModuleFeature {
  const summons = createBlasterSummons(moduleId);
  let busy = false;
  let cancelPicker: (() => void) | null = null;
  const escape = (s: string) => foundry.utils.escapeHTML(s);
  const combatFor = (scene: any) => game.combat?.scene?.id === scene.id ? game.combat : null;
  const notifyError = (error: unknown) => {
    console.error(`${moduleId} | Blaster`, error);
    ui.notifications.error(error instanceof Error ? error.message : String(error));
  };

  function selected() {
    if (!game.user.isGM) throw new Error("Only the GM can operate Blaster's blast.");
    if (game.users.activeGM?.id !== game.user.id) throw new Error("Use the active GM client for Blaster's blast tools to prevent simultaneous duplicate uses.");
    if (game.system.id !== "pf2e") throw new Error("Blaster requires Pathfinder 2e.");
    if (!canvas.ready || !canvas.grid.isSquare) throw new Error("Open a scene with a square grid first.");
    if (Number(game.release?.generation) < 14 || !canvas.regions) throw new Error("Blaster's area tool requires Foundry V14.");
    const tokens = canvas.tokens.controlled;
    if (tokens.length !== 1 || tokens[0].actor?.getFlag(moduleId, "blasterRole") !== "blaster") {
      throw new Error("Select exactly one Blaster token from the shipped NPC compendium.");
    }
    return tokens[0];
  }

  function checkAvailability(token: any, charge: Charge) {
    const combat = combatFor(token.document.parent);
    const use = token.actor.getFlag(moduleId, "blastUse") as BlastUse | undefined;
    if (combat?.started) {
      if (combat.combatant?.tokenId !== token.id) throw new Error("Charged Blast is used on Blaster's turn.");
      if (use && use.combatId === combat.id && use.round === combat.round) throw new Error("Charged Blast has already been used this round.");
      if (charge === 3 && use && use.rechargeCombatId === combat.id && (use.readyRound ?? 0) > combat.round) {
        throw new Error(`Standing Ovation recharges on round ${use.readyRound}.`);
      }
    }
    if (charge === 3 && (!combat?.started || use?.rechargeCombatId !== combat.id) && (use?.readyTime ?? 0) > game.time.worldTime) {
      throw new Error("Standing Ovation is still recharging. Advance world time before using it again.");
    }
    return combat;
  }

  function pickPoints(token: any, charge: Charge, mode: BlastMode): Promise<Point[] | null> {
    const tier = BLAST_TIERS[charge];
    const view: HTMLCanvasElement = canvas.app.canvas ?? canvas.app.view;
    const scene = canvas.scene;
    const points: Point[] = [];
    let cursor: Point | null = null;
    let finished = false;
    const overlay = document.createElementNS(SVG_NS, "svg");
    overlay.setAttribute("class", "aha-blast-preview");
    overlay.setAttribute("aria-hidden", "true");
    const status = document.createElement("div");
    status.className = "aha-blast-instructions";
    status.setAttribute("role", "status");
    document.body.append(overlay, status);
    const measured = (path: Point[]) => path.length < 2 ? 0 : canvas.grid.measurePath(path).distance;
    const toScreen = (p: Point): Point => {
      const r = view.getBoundingClientRect();
      const global = canvas.stage.toGlobal(p);
      return { x: r.left + global.x * r.width / canvas.app.screen.width, y: r.top + global.y * r.height / canvas.app.screen.height };
    };
    const toWorld = (e: PointerEvent): Point => {
      const r = view.getBoundingClientRect();
      return canvas.grid.getCenterPoint(canvas.stage.toLocal({
        x: (e.clientX - r.left) * canvas.app.screen.width / r.width,
        y: (e.clientY - r.top) * canvas.app.screen.height / r.height,
      }));
    };
    const draw = () => {
      if (finished || canvas.scene !== scene) return;
      overlay.replaceChildren();
      const path = cursor ? [...points, cursor] : points;
      const line = document.createElementNS(SVG_NS, "polyline");
      line.setAttribute("points", path.map(toScreen).map(p => `${p.x},${p.y}`).join(" "));
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", measured(path) > tier.range ? "#ff2222" : BLAST_MODES[mode].color);
      line.setAttribute("stroke-width", String(tier.width * canvas.grid.size * canvas.stage.scale.x * view.getBoundingClientRect().width / canvas.app.screen.width));
      line.setAttribute("stroke-opacity", "0.35");
      line.setAttribute("stroke-linejoin", "bevel");
      overlay.append(line);
      for (const [i, point] of points.entries()) {
        const p = toScreen(point);
        const marker = document.createElementNS(SVG_NS, "text");
        marker.setAttribute("x", String(p.x)); marker.setAttribute("y", String(p.y));
        marker.setAttribute("fill", "white"); marker.setAttribute("stroke", "black");
        marker.setAttribute("paint-order", "stroke"); marker.setAttribute("stroke-width", "3");
        marker.setAttribute("font-size", "22"); marker.textContent = String(i + 1);
        overlay.append(marker);
      }
      status.textContent = `${tier.name} · ${points.length}/5 points · ${Math.round(measured(points))}/${tier.range} ${canvas.grid.units} · ${points.length ? "Click next square" : "Click Blaster's square first"} · Backspace: undo · Esc/right-click: cancel`;
    };
    return new Promise(resolve => {
      const finish = (result: Point[] | null) => {
        if (finished) return;
        finished = true;
        view.removeEventListener("pointerdown", click, true);
        view.removeEventListener("pointerup", stop, true);
        view.removeEventListener("click", stop, true);
        view.removeEventListener("pointermove", move, true);
        view.removeEventListener("contextmenu", cancel, true);
        window.removeEventListener("keydown", key, true);
        window.removeEventListener("resize", draw);
        Hooks.off("canvasPan", draw); Hooks.off("canvasTearDown", teardown);
        overlay.remove(); status.remove(); cancelPicker = null;
        resolve(result);
      };
      const stop = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation(); };
      const cancel = (e: Event) => { stop(e); finish(null); };
      const teardown = () => finish(null);
      const click = (e: PointerEvent) => {
        if (e.button !== 0) { if (e.button === 2) cancel(e); return; }
        stop(e);
        const p = toWorld(e);
        const d = token.document;
        if (!points.length && !(p.x >= d.x && p.y >= d.y && p.x < d.x + d.width * canvas.grid.size && p.y < d.y + d.height * canvas.grid.size)) {
          ui.notifications.warn("The first waypoint must be in Blaster's square."); return;
        }
        if (points.length && p.x === points[points.length - 1].x && p.y === points[points.length - 1].y) return;
        if (measured([...points, p]) > tier.range + 0.001) { ui.notifications.warn(`Total path cannot exceed ${tier.range} ${canvas.grid.units}.`); return; }
        points.push(p); cursor = null; draw();
        if (points.length === 5) finish(points);
      };
      const move = (e: PointerEvent) => { cursor = toWorld(e); draw(); };
      const key = (e: KeyboardEvent) => {
        if (e.key === "Escape") cancel(e);
        else if (e.key === "Backspace") { stop(e); points.pop(); draw(); }
      };
      cancelPicker = teardown;
      view.addEventListener("pointerdown", click, true);
      view.addEventListener("pointerup", stop, true);
      view.addEventListener("click", stop, true);
      view.addEventListener("pointermove", move, true);
      view.addEventListener("contextmenu", cancel, true);
      window.addEventListener("keydown", key, true);
      window.addEventListener("resize", draw);
      Hooks.on("canvasPan", draw); Hooks.on("canvasTearDown", teardown);
      draw();
    });
  }

  async function blast() {
    if (busy) return ui.notifications.warn("Finish or cancel the current blast first.");
    busy = true;
    try {
      const token = selected();
      const scene = canvas.scene;
      const chosen = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Blaster · Charged Blast" },
        content: `<p>Choose the charge and Curated Spectrum. Five clicks create four connected areas; each creature saves once for the entire blast.</p><div class="form-group"><label>Charge</label><select name="charge">${Object.entries(BLAST_TIERS).map(([key, t]) => `<option value="${key}">${key} action${key === "1" ? "" : "s"}: ${t.name} — ${t.dice}d6, ${t.range} ft, ${t.width} square wide</option>`).join("")}</select></div><div class="form-group"><label>Spectrum</label><select name="mode">${Object.entries(BLAST_MODES).map(([key, m]) => `<option value="${key}">${m.label}${m.penalty ? " (−2 dice; condition on failed save)" : ""}</option>`).join("")}</select></div><p>Three actions roots Blaster until his next turn and recharges for 1d4 rounds. Actions, saves, damage and condition application are adjudicated normally.</p>`,
        ok: { label: "Choose five points", callback: (_event: Event, button: any) => ({ charge: Number(button.form.elements.charge.value), mode: button.form.elements.mode.value }) },
        rejectClose: false,
      });
      if (!chosen) return;
      const charge = chosen.charge as Charge;
      const mode = chosen.mode as BlastMode;
      if (![1, 2, 3].includes(charge) || !Object.prototype.hasOwnProperty.call(BLAST_MODES, mode)) throw new Error("Invalid blast selection.");
      const combat = checkAvailability(token, charge);
      const snapshot = { x: token.document.x, y: token.document.y, round: combat?.round, turn: combat?.turn };
      const points = await pickPoints(token, charge, mode);
      if (!points) return;
      if (canvas.scene !== scene || !scene.tokens.get(token.id) || token.document.x !== snapshot.x || token.document.y !== snapshot.y || combat?.round !== snapshot.round || combat?.turn !== snapshot.turn) {
        throw new Error("The scene, token, or turn changed during placement. Start the blast again.");
      }
      checkAvailability(token, charge);
      const tier = BLAST_TIERS[charge];
      const spectrum = BLAST_MODES[mode];
      const traits = ["magical", spectrum.damage, ...(mode === "dazzling" ? ["light"] : [])].join(",");
      const blastId = foundry.utils.randomID();
      const data = lineShapes(points, canvas.grid.size, tier.width).map((shape, index) => ({
        name: `${token.name} — ${tier.name} ${index + 1}/4`, shapes: [shape],
        levels: canvas.level ? [canvas.level.id] : [], color: spectrum.color,
        highlightMode: "coverage", displayMeasurements: true,
        visibility: (globalThis as any).CONST.REGION_VISIBILITY.ALWAYS,
        ownership: { [game.user.id]: 3 },
        flags: { pf2e: { areaShape: "line" }, [moduleId]: { blast: { id: blastId, tokenId: token.id, actorUuid: token.actor.uuid, charge, mode } } },
      }));
      const recharge = charge === 3 ? await new foundry.dice.Roll("1d4").evaluate() : null;
      const previous = token.actor.getFlag(moduleId, "blastUse") as BlastUse | undefined;
      const use: BlastUse = { ...previous, combatId: combat?.started ? combat.id : null, round: combat?.round ?? 0 };
      if (recharge) {
        use.rechargeCombatId = combat?.started ? combat.id : null;
        use.readyRound = (combat?.round ?? 0) + recharge.total + 1;
        use.readyTime = game.time.worldTime + (recharge.total + 1) * 6;
      }
      const root: RootState = { combatId: combat?.started ? combat.id : null, round: combat?.round ?? 0, turn: combat?.turn ?? 0, expires: game.time.worldTime + 6 };
      const created = await scene.createEmbeddedDocuments("Region", data);
      try {
        if (charge === 3) await token.document.setFlag(moduleId, "blastRoot", root);
        await token.actor.setFlag(moduleId, "blastUse", use);
      } catch (error) {
        await scene.deleteEmbeddedDocuments("Region", created.map((r: any) => r.id));
        if (charge === 3) await token.document.unsetFlag(moduleId, "blastRoot");
        throw error;
      }
      const card = `<h3>${escape(token.name)} · ${tier.name}</h3><p>${charge} action${charge === 1 ? "" : "s"} · ${spectrum.label} · DC 40 · ${tier.width} square${tier.width === 1 ? "" : "s"} wide</p><p>@Check[${spectrum.save}|dc:40|basic|traits:${traits}] @Damage[${tier.dice - spectrum.penalty}d6[${spectrum.damage}]|traits:${traits}]</p><p>One save and one damage application per creature, even where segments overlap. Blaster is excluded. Resolve cover and line of effect normally.</p>${spectrum.rider ? `<p>${spectrum.rider}</p>` : ""}${recharge ? `<p>Rooted until the start of Blaster's next turn (6 seconds outside combat). Standing Ovation recharge: ${recharge.total} full rounds; available round ${use.readyRound} in this combat.</p>` : ""}`;
      const action = token.actor.items?.find?.((item: any) => item.slug === `blaster-charged-blast-${charge}`);
      const content = await game.pf2e.TextEditor.enrichHTML(card, { rollData: action?.getRollData() ?? token.actor.getRollData() });
      await foundry.documents.ChatMessage.implementation.create({
        speaker: foundry.documents.ChatMessage.getSpeaker({ token: token.document }), content,
        flags: { [moduleId]: { blast: { id: blastId, sceneId: scene.id, tokenId: token.id } } },
      });
      return created;
    } catch (error) { notifyError(error); }
    finally { busy = false; }
  }

  async function clearBlast() {
    try {
      const token = selected();
      const ids = canvas.scene.regions.filter((r: any) => r.getFlag(moduleId, "blast")?.tokenId === token.id).map((r: any) => r.id);
      if (ids.length) await canvas.scene.deleteEmbeddedDocuments("Region", ids);
      ui.notifications.info(`Cleared ${ids.length} Blaster area segment(s).`);
    } catch (error) { notifyError(error); }
  }

  async function releaseRoot() {
    try { await selected().document.unsetFlag(moduleId, "blastRoot"); }
    catch (error) { notifyError(error); }
  }

  function preventMovement(token: any, options: any) {
    if (options?.blasterForcedMovement && game.user.isGM) return;
    if (isBlastRooted(token.getFlag(moduleId, "blastRoot"), combatFor(token.parent), token.id, game.time.worldTime)) {
      ui.notifications.warn("Standing Ovation: Blaster cannot move until the start of his next turn. Use Release Blast Root for GM adjudication of forced movement.");
      return false;
    }
  }

  return {
    id: "blaster", api: { blast, clearBlast, releaseRoot, flashMob: summons.flashMob, commandMob: summons.commandMob, cancelPlacement: () => cancelPicker?.() },
    ready() {
      summons.ready();
      Hooks.on("preMoveToken", (token: any, _movement: any, options: any) => preventMovement(token, options));
      Hooks.on("preUpdateToken", (token: any, changed: any, options: any) => {
        if (["x", "y", "elevation", "level"].some(k => k in changed && changed[k] !== token[k])) return preventMovement(token, options);
      });
      const expire = async () => {
        if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
        for (const scene of game.scenes) for (const token of scene.tokens) {
          const root = token.getFlag(moduleId, "blastRoot");
          if (root && !isBlastRooted(root, combatFor(scene), token.id, game.time.worldTime)) await token.unsetFlag(moduleId, "blastRoot");
        }
      };
      for (const event of ["updateCombat", "deleteCombat", "updateWorldTime", "canvasReady"]) Hooks.on(event, () => void expire().catch(notifyError));
    },
  };
}
