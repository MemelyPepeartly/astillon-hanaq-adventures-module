import type { ModuleFeature } from "./feature.js";
import { createSarsaparillaFeature } from "./sarsaparilla-surprise.js";

export type { ModuleFeature } from "./feature";

export function createModuleFeatures(moduleId: string): ModuleFeature[] {
  return [
    createSarsaparillaFeature(moduleId),
  ];
}
