export type Point = { x: number; y: number };
export type Charge = 1 | 2 | 3;
/** Range limits each of the four legs between five waypoints independently. */
export const BLAST_TIERS = {
  1: { name: "Snapshot", dice: 4, range: 80, width: 1 },
  2: { name: "Spotlight", dice: 9, range: 80, width: 1 },
  3: { name: "Standing Ovation", dice: 18, range: 80, width: 3 },
} as const;
export const BLAST_MODES = {
  fire: { label: "Fire", damage: "fire", save: "reflex", penalty: 0, color: "#ff4433", rider: "" },
  cold: { label: "Cold", damage: "cold", save: "reflex", penalty: 0, color: "#55ccff", rider: "" },
  electricity: { label: "Electricity", damage: "electricity", save: "reflex", penalty: 0, color: "#a88bff", rider: "" },
  sonic: { label: "Sonic", damage: "sonic", save: "reflex", penalty: 0, color: "#ffcc55", rider: "" },
  dazzling: { label: "Dazzling light", damage: "fire", save: "reflex", penalty: 2, color: "#ffffbb", rider: "On a failed save, also @UUID[Compendium.pf2e.conditionitems.Item.TkIyaNPgTZFBCCuh]{Dazzled} for 1 round. Apply the condition manually." },
  humiliation: { label: "Psychic humiliation", damage: "mental", save: "will", penalty: 2, color: "#ff55cc", rider: "Mental effect. On a failed save, also @UUID[Compendium.pf2e.conditionitems.Item.e1XGnhKNSQIm5IXg]{Stupefied 1} for 1 round. Apply the condition manually." },
} as const;
export type BlastMode = keyof typeof BLAST_MODES;

/** Pixels throughout: V14 LineShapeData dimensions are pixels, not scene distance units. */
export function lineShapes(points: Point[], gridSize: number, width: number) {
  if (points.length !== 5 || !Number.isFinite(gridSize) || gridSize <= 0 || ![1, 3].includes(width)) {
    throw new Error("A blast needs five waypoints and a valid square grid.");
  }
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error("Invalid waypoint.");
  return points.slice(1).map((point, i) => {
    const start = points[i];
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) throw new Error("Consecutive waypoints must occupy different squares.");
    return {
      type: "line", x: start.x, y: start.y, length, width: gridSize * width,
      rotation: (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360,
      gridBased: false,
    };
  });
}

export type RootState = { combatId: string | null; round: number; turn: number; expires: number };
/** Root lasts through the intervening turns, not merely until the round changes. */
export function isBlastRooted(root: RootState | undefined, combat: any, tokenId: string, now: number): boolean {
  if (!root) return false;
  if (!root.combatId) return now < root.expires;
  if (!combat?.started || combat.id !== root.combatId) return false;
  const later = combat.round > root.round || (combat.round === root.round && combat.turn > root.turn);
  if (later && combat.combatant?.tokenId === tokenId) return false;
  // Fallback for skipped/deleted combatants: never root beyond the following round.
  return combat.round <= root.round + 1;
}
