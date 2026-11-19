export type Point = { x: number; y: number };
export type Charge = 1 | 2 | 3;
/** Immediate blasts are straight lines of this fixed length. */
export const BLAST_TIERS = {
  1: { name: "Snapshot", dice: 10, die: 10, range: 120, width: 1 },
  2: { name: "Spotlight", dice: 14, die: 8, range: 120, width: 1 },
  3: { name: "Standing Ovation", dice: 27, die: 10, range: 120, width: 3 },
} as const;
export const FINALE = { name: "Grand Finale", pointCount: 8, range: 120, width: 3, dice: 36, die: 10, dc: 40 } as const;
export const BLAST_MODES = {
  fire: { label: "Fire", damage: "fire", save: "reflex", penalty: 0, color: "#ff4433", rider: "" },
  cold: { label: "Cold", damage: "cold", save: "reflex", penalty: 0, color: "#55ccff", rider: "" },
  electricity: { label: "Electricity", damage: "electricity", save: "reflex", penalty: 0, color: "#a88bff", rider: "" },
  sonic: { label: "Sonic", damage: "sonic", save: "reflex", penalty: 0, color: "#ffcc55", rider: "" },
  dazzling: { label: "Dazzling light", damage: "fire", save: "reflex", penalty: 3, color: "#ffffbb", rider: "Failure or critical failure: dazzled for 1 round." },
  humiliation: { label: "Psychic humiliation", damage: "mental", save: "will", penalty: 3, color: "#ff55cc", rider: "Failure or critical failure: stupefied 1 for 1 round." },
  slowing: { label: "Slowing beam", damage: "cold", save: "fortitude", penalty: 3, color: "#63dbc1", rider: "Success: slowed 1. Failure: slowed 2. Critical failure: slowed 3. Lasts 1 round; critical success has no effect." },
  hypnotic: { label: "Hypno-Beam", damage: "mental", save: "will", penalty: 3, color: "#cc77ff", rider: "Incapacitation. Success: fascinated for 1 round. Failure: controlled for 1 round. Critical failure: permanently controlled until removed. Critical success has no effect. Apply after damage; normal fascinated hostility breaks still apply." },
} as const;
export type BlastMode = keyof typeof BLAST_MODES;
export type BlastOutcome = "criticalSuccess" | "success" | "failure" | "criticalFailure";
export const BLAST_RIDER_EFFECTS: Partial<Record<BlastMode, Partial<Record<BlastOutcome, string>>>> = {
  dazzling: { failure: "BlasterDazzle001", criticalFailure: "BlasterDazzle001" },
  humiliation: { failure: "BlasterStupor001", criticalFailure: "BlasterStupor001" },
  slowing: { success: "BlasterSlow00001", failure: "BlasterSlow00002", criticalFailure: "BlasterSlow00003" },
  hypnotic: { success: "BlasterFascin001", failure: "BlasterControl01", criticalFailure: "BlasterControl02" },
};
export function blastTraits(mode: BlastMode): string[] {
  return ["magical", BLAST_MODES[mode].damage, ...(mode === "dazzling" ? ["light"] : mode === "hypnotic" ? ["mental", "visual", "incapacitation"] : [])]
    .filter((trait, index, all) => all.indexOf(trait) === index);
}
export function blastDamage(dice: number, die: number, mode: BlastMode): string {
  return `${dice - BLAST_MODES[mode].penalty}d${die}`;
}
export function blastRiderLinks(moduleId: string, mode: BlastMode): string {
  const effects = BLAST_RIDER_EFFECTS[mode];
  if (!effects) return "";
  const labels = { criticalSuccess: "Critical success", success: "Success", failure: "Failure", criticalFailure: "Critical failure" };
  return `<p>${BLAST_MODES[mode].rider}</p><p>${Object.entries(effects).map(([outcome, id]) =>
    `@UUID[Compendium.${moduleId}.astillon-blaster-items.Item.${id}]{${labels[outcome as BlastOutcome]} effect}`).join(" · ")}</p>`;
}

/** Pixels throughout: V14 LineShapeData dimensions are pixels, not scene distance units. */
export function lineShapes(points: Point[], gridSize: number, width: number) {
  if (points.length < 2 || points.length > 8 || !Number.isFinite(gridSize) || gridSize <= 0 || ![1, 3].includes(width)) {
    throw new Error("A blast needs two to eight waypoints and a valid square grid.");
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
