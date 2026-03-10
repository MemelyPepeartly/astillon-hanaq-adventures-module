import { createModuleFeatures, type ModuleFeature } from "./features/index.js";

const MODULE_ID = "astillon-hanaq-adventures-module";
const MODULE_NAME = "Astillon Hanaq Adventures";
const moduleFeatures = createModuleFeatures(MODULE_ID);

function exposeModuleApi(moduleId: string, features: ModuleFeature[]) {
  const api = Object.fromEntries(
    features
      .filter((feature) => feature.api)
      .map((feature) => [feature.id, feature.api]),
  );

  const module = game.modules?.get?.(moduleId);
  if (module) {
    module.api = api;
  }

  if (!game.astillonHanaqAdventures) {
    game.astillonHanaqAdventures = {};
  }

  Object.assign(game.astillonHanaqAdventures, api);
}

Hooks.once("init", () => {
  exposeModuleApi(MODULE_ID, moduleFeatures);

  for (const feature of moduleFeatures) {
    feature.init?.();
  }
});

Hooks.once("ready", () => {
  for (const feature of moduleFeatures) {
    feature.ready?.();
  }

  console.log(`${MODULE_NAME} | Ready`);
});
