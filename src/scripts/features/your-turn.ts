import type { ModuleFeature } from "./feature.js";

const FEATURE_ID = "your-turn";
const SETTING_ENABLED = "yourTurnEnabled";
const SETTING_PORTRAIT = "yourTurnPortrait";
const CARD_TIMEOUT_MS = 3000;
const CARD_CLASS = "astillon-your-turn-card";
const CARD_VISIBLE = "astillon-your-turn-visible";

type CombatHistory = {
  combatantId?: string | null;
  round?: number;
  turn?: number;
  tokenId?: string | null;
};

function createBooleanField(): unknown {
  const Field = foundry.fields?.BooleanField ?? foundry.data.fields.BooleanField;
  return new Field();
}

function createFilePathField(): unknown {
  const Field = foundry.fields?.FilePathField ?? foundry.data.fields.FilePathField;
  return new Field({ categories: ["IMAGE"], blank: true, initial: "" });
}

export function createYourTurnFeature(moduleId: string): ModuleFeature {
  let card: HTMLElement | null = null;
  let dismissTimer: ReturnType<typeof setTimeout> | undefined;
  let resizeObserver: ResizeObserver | undefined;

  function clearCard(): void {
    if (dismissTimer !== undefined) {
      clearTimeout(dismissTimer);
      dismissTimer = undefined;
    }
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    card?.remove();
    card = null;
  }

  function isEnabled(): boolean {
    return game.settings.get(moduleId, SETTING_ENABLED) === true;
  }

  function portraitOverride(): string {
    const value = game.settings.get(moduleId, SETTING_PORTRAIT);
    return typeof value === "string" ? value.trim() : "";
  }

  function resolvePortrait(combatant: any): string | undefined {
    const override = portraitOverride();
    if (override) return override;
    const tokenSrc = combatant?.token?.texture?.src;
    if (typeof tokenSrc === "string" && tokenSrc.trim()) return tokenSrc.trim();
    const actorImg = combatant?.actor?.img;
    if (typeof actorImg === "string" && actorImg.trim()) return actorImg.trim();
    return undefined;
  }

  function playerOwnsCombatant(combatant: any): boolean {
    const userId = game.user?.id;
    if (!userId) return false;
    const players = combatant?.players;
    if (!players) return false;
    if (Array.isArray(players)) return players.some((player: any) => player?.id === userId);
    if (players instanceof Map) return players.has(userId);
    if (typeof players[Symbol.iterator] === "function") {
      for (const player of players as Iterable<any>) {
        if (player?.id === userId) return true;
      }
    }
    return false;
  }

  function historyChanged(prior: CombatHistory, current: CombatHistory): boolean {
    if (!current.combatantId) return false;
    return (
      prior.combatantId !== current.combatantId
      || prior.round !== current.round
      || prior.turn !== current.turn
    );
  }

  function updateCardPosition(element: HTMLElement): void {
    const sidebar = ui.sidebar?.element;
    if (!sidebar) return;
    const rect = sidebar.getBoundingClientRect();
    element.style.setProperty("--astillon-your-turn-top", `${rect.top + rect.height / 2}px`);
    element.style.setProperty("--astillon-your-turn-left", `${rect.left}px`);
  }

  function showCard(combatant: any): void {
    const sidebar = ui.sidebar?.element;
    if (!sidebar) return;

    clearCard();

    const element = document.createElement("aside");
    element.className = CARD_CLASS;
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", "polite");

    const portraitSrc = resolvePortrait(combatant);
    if (portraitSrc) {
      const portrait = document.createElement("div");
      portrait.className = "astillon-your-turn-portrait";
      const image = document.createElement("img");
      image.src = portraitSrc;
      image.alt = "";
      portrait.append(image);
      element.append(portrait);
    }

    const name = document.createElement("p");
    name.className = "astillon-your-turn-name";
    name.textContent = String(combatant?.name ?? combatant?.actor?.name ?? "");
    element.append(name);

    const banner = document.createElement("p");
    banner.className = "astillon-your-turn-banner";
    banner.textContent = game.i18n.localize("ASTILLON.YourTurn.Banner");
    element.append(banner);

    element.addEventListener("click", clearCard);

    document.body.append(element);
    card = element;
    updateCardPosition(element);

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        if (card) updateCardPosition(card);
      });
      resizeObserver.observe(sidebar);
    }

    requestAnimationFrame(() => {
      element.classList.add(CARD_VISIBLE);
      updateCardPosition(element);
    });

    dismissTimer = setTimeout(clearCard, CARD_TIMEOUT_MS);
  }

  function onCombatTurnChange(combat: any, prior: CombatHistory, current: CombatHistory): void {
    if (!isEnabled()) return;
    if (combat !== ui.combat?.viewed) return;
    if (!current.combatantId) return;
    if (!historyChanged(prior, current)) return;
    const combatant = combat.combatant;
    if (!combatant) return;
    if (!playerOwnsCombatant(combatant)) return;
    showCard(combatant);
  }

  return {
    id: FEATURE_ID,
    init() {
      game.settings.register(moduleId, SETTING_ENABLED, {
        name: game.i18n.localize("ASTILLON.YourTurn.Enabled"),
        hint: game.i18n.localize("ASTILLON.YourTurn.EnabledHint"),
        scope: "user",
        config: true,
        type: createBooleanField(),
        default: false,
      });
      game.settings.register(moduleId, SETTING_PORTRAIT, {
        name: game.i18n.localize("ASTILLON.YourTurn.Portrait"),
        hint: game.i18n.localize("ASTILLON.YourTurn.PortraitHint"),
        scope: "user",
        config: true,
        type: createFilePathField(),
        default: "",
      });
      Hooks.on("combatTurnChange", onCombatTurnChange);
    },
  };
}
