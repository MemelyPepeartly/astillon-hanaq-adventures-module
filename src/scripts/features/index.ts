import type { ModuleFeature } from "./feature.js";
import { createMenacingFeature } from "./menacing.js";
import { createSarsaparillaFeature } from "./sarsaparilla-surprise.js";
import { createYourTurnFeature } from "./your-turn.js";

export type { ModuleFeature } from "./feature";

export function createModuleFeatures(moduleId: string): ModuleFeature[] {
  return [
    createSarsaparillaFeature(moduleId),
    createMenacingFeature(moduleId),
    createYourTurnFeature(moduleId),
  ];
}
