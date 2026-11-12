export type BeamSide = "red" | "blue";
export type BeamSubmission = { requestId: string; authorId: string; total: number };
export type BeamClashState = {
  version: 1;
  id: string;
  sceneId: string;
  redTokenId: string;
  blueTokenId: string;
  redFile: string;
  blueFile: string;
  status: "active" | "finished" | "stopped";
  round: number;
  score: number;
  revision: number;
  red: BeamSubmission | null;
  blue: BeamSubmission | null;
  lastRound: { round: number; red: BeamSubmission; blue: BeamSubmission } | null;
  winner: BeamSide | null;
  processed: string[];
};

export function isBeamSide(value: unknown): value is BeamSide {
  return value === "red" || value === "blue";
}

/** Reject malformed/older flags rather than trying to operate a partial clash. */
export function readBeamClash(value: any): BeamClashState | null {
  if (!value || value.version !== 1 || !["active", "finished", "stopped"].includes(value.status)) return null;
  for (const key of ["id", "sceneId", "redTokenId", "blueTokenId", "redFile", "blueFile"]) {
    if (typeof value[key] !== "string" || !value[key]) return null;
  }
  if (value.redTokenId === value.blueTokenId || !Number.isInteger(value.round) || value.round < 1
    || !Number.isInteger(value.revision) || value.revision < 0
    || !Number.isInteger(value.score) || Math.abs(value.score) > 3
    || (value.status === "active" && Math.abs(value.score) >= 3)
    || !Array.isArray(value.processed) || !value.processed.every((id: unknown) => typeof id === "string")) return null;
  for (const side of ["red", "blue"] as const) {
    const roll = value[side];
    if (roll !== null && (!roll || typeof roll.requestId !== "string" || typeof roll.authorId !== "string"
      || !Number.isInteger(roll.total) || roll.total < 1 || roll.total > 20)) return null;
  }
  return value;
}

/** GMs can roll either side; non-GMs may roll only the actor on that side they own. */
export function canSubmitBeamRoll(side: BeamSide, user: any, actor: any): boolean {
  if (!isBeamSide(side) || !user) return false;
  if (user.isGM === true) return true;
  return actor?.testUserPermission(user, "OWNER") === true;
}

/** Pure transition; the caller supplies only a die it evaluated on the authoritative GM. */
export function acceptBeamRoll(
  state: BeamClashState, side: BeamSide, round: number, submission: BeamSubmission,
): BeamClashState | null {
  if (!isBeamSide(side) || state.status !== "active" || round !== state.round || state[side]
    || state.processed.includes(submission.requestId) || !submission.requestId || !submission.authorId
    || !Number.isInteger(submission.total) || submission.total < 1 || submission.total > 20) return null;
  const next: BeamClashState = {
    ...state, [side]: { ...submission }, revision: state.revision + 1,
    processed: [...state.processed, submission.requestId],
  };
  if (next.red && next.blue) {
    next.score += Math.sign(next.red.total - next.blue.total);
    next.lastRound = { round: next.round, red: next.red, blue: next.blue };
    next.red = null;
    next.blue = null;
    if (Math.abs(next.score) === 3) {
      next.status = "finished";
      next.winner = next.score === 3 ? "red" : "blue";
    } else next.round += 1;
  }
  return next;
}

/** Positive scores move the meeting point toward blue's token. */
export function beamMeetingPoint(red: { x: number; y: number }, blue: { x: number; y: number }, score: number) {
  const fraction = (Math.max(-3, Math.min(3, score)) + 3) / 6;
  return { x: red.x + (blue.x - red.x) * fraction, y: red.y + (blue.y - red.y) * fraction };
}
