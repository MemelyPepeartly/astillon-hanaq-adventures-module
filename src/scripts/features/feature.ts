export type ModuleFeature = {
  id: string;
  api?: Record<string, unknown>;
  init?: () => void;
  ready?: () => void;
};
