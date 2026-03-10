const MODULE_ID = "astillon-hanaq-adventures-module";
const SOCK = `module.${MODULE_ID}`;
const OVERLAY_Z = "100000";
const CARD_BACKDROP = "linear-gradient(135deg,#fffdf8,#f0e6d3)";
const CARD_BORDER = "#444";
const GOLD = "#d4af37";
const DEEP_PURPLE = "#4a0e4e";

type CardRank = {
  name: string;
  value: number;
  display: string;
};

type DrawnCard = {
  suit: string;
  rank: CardRank;
  color: string;
};

type AnimationState = {
  handler: ((data: any) => void) | null;
  chatClickHandler: ((event: Event) => void) | null;
  chatRenderHook: any;
  queue: Promise<unknown>;
};

const escapeHTML = (value: unknown) => {
  const text = String(value ?? "");
  return foundry.utils.escapeHTML
    ? foundry.utils.escapeHTML(text)
    : text
        .split("&").join("&amp;")
        .split("<").join("&lt;")
        .split(">").join("&gt;")
        .split("\"").join("&quot;")
        .split("'").join("&#39;");
};

const SUITS = ["\u2660", "\u2665", "\u2666", "\u2663"];
const SUIT_COLORS: Record<string, string> = {
  "\u2660": "#1a1a2e",
  "\u2663": "#1a1a2e",
  "\u2665": "#c0392b",
  "\u2666": "#c0392b",
};

const RANKS: CardRank[] = [
  { name: "A", value: 11, display: "A" },
  { name: "2", value: 2, display: "2" },
  { name: "3", value: 3, display: "3" },
  { name: "4", value: 4, display: "4" },
  { name: "5", value: 5, display: "5" },
  { name: "6", value: 6, display: "6" },
  { name: "7", value: 7, display: "7" },
  { name: "8", value: 8, display: "8" },
  { name: "9", value: 9, display: "9" },
  { name: "10", value: 10, display: "10" },
  { name: "J", value: 10, display: "J" },
  { name: "Q", value: 10, display: "Q" },
  { name: "K", value: 10, display: "K" },
];

const FLAVORS: Record<string, string[]> = {
  blackjack: [
    "\"Twenty-one, darling. The Trickster always wins.\" - Sarsaparilla",
    "The golden string hums with triumphant resonance. Perfect luck.",
    "Fortune smiles - a natural blackjack. The odds bow to the Velvet Trickster.",
  ],
  bust: [
    "\"Oh dear... too greedy, love.\" - Sarsaparilla's echo",
    "The string snaps with a discordant twang. Fortune is fickle.",
    "The cards scatter. Bust. The Trickster's laughter echoes.",
  ],
  hit: [
    "The Velvet Trickster tips her hat. Luck is on your side - this time.",
    "Golden sparks dance along the string as fortune bends the arrow's path.",
    "\"Not bad, not bad at all.\" The bow hums approvingly.",
  ],
  miss: [
    "The card drawn is not enough. Fortune shrugs and looks away.",
    "Close, but the Trickster's luck has its limits. The arrow still flies wide.",
    "\"Can't win them all, love.\" The bow's warmth dims momentarily.",
  ],
};

const RESULT_COLORS: Record<string, { total: string; pillBg: string; glow: string }> = {
  blackjack: { total: "#27ae60", pillBg: "linear-gradient(135deg,#27ae60,#2ecc71)", glow: "rgba(46,204,113,0.5)" },
  bust: { total: "#c0392b", pillBg: "linear-gradient(135deg,#c0392b,#e74c3c)", glow: "rgba(231,76,60,0.5)" },
  hit: { total: "#2980b9", pillBg: "linear-gradient(135deg,#2980b9,#3498db)", glow: "rgba(41,128,185,0.3)" },
  miss: { total: "#7f8c8d", pillBg: "linear-gradient(135deg,#7f8c8d,#95a5a6)", glow: "rgba(127,140,141,0.3)" },
};

const DS = {
  wrap: "text-align:center;padding:12px;font-family:'Modesto Condensed','Palatino Linotype',serif",
  head: "color:#4a0e4e;font-size:1.4em;margin:0 0 2px",
  sub: "color:#777;font-style:italic;font-size:0.85em;margin:0 0 10px",
  lbl: "display:block;margin:8px 0 3px;font-weight:bold;color:#333",
  sel: "width:100%;text-align:left;font-size:1.1em;padding:4px 8px;border:2px solid #4a0e4e;border-radius:4px",
  inp: "width:70px;text-align:center;font-size:1.1em;padding:4px 8px;border:2px solid #4a0e4e;border-radius:4px",
  hint: "font-size:0.78em;color:#888;font-style:italic;margin-top:4px",
  modDisp: "font-size:0.85em;color:#4a0e4e;margin-top:3px;font-weight:bold",
  tgtOk: "margin:6px 0;padding:5px 8px;border-radius:4px;background:rgba(74,14,78,0.06);font-size:0.88em;border-left:3px solid #27ae60",
  tgtNo: "margin:6px 0;padding:5px 8px;border-radius:4px;background:rgba(74,14,78,0.06);font-size:0.88em;border-left:3px solid #e67e22;color:#999",
  bg: { background: "linear-gradient(180deg,#f9f3e3,#ede0c8)", border: "2px solid #d4af37" },
};

function getRoot(): typeof globalThis & { _astillonSarsaparillaState?: AnimationState } {
  return globalThis as typeof globalThis & { _astillonSarsaparillaState?: AnimationState };
}

function pickFlavor(key: string) {
  const pool = FLAVORS[key];
  return pool[Math.floor(Math.random() * pool.length)];
}

function drawCard(): DrawnCard {
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
  return { suit, rank, color: SUIT_COLORS[suit] };
}

function suitEntity(suit: string) {
  if (suit === "\u2660") return "&spades;";
  if (suit === "\u2665") return "&hearts;";
  if (suit === "\u2666") return "&diams;";
  return "&clubs;";
}

function suitName(suit: string) {
  if (suit === "\u2660") return "Spades";
  if (suit === "\u2665") return "Hearts";
  if (suit === "\u2666") return "Diamonds";
  return "Clubs";
}

function cardValueTotal(cards: DrawnCard[]) {
  return cards.reduce((sum, card) => sum + card.rank.value, 0);
}

function naturalTotal(dieRoll: number, cards: DrawnCard[]) {
  return dieRoll + cardValueTotal(cards);
}

function cardText(card: DrawnCard) {
  return `${card.rank.display} of ${suitName(card.suit)}`;
}

function cardChip(card: DrawnCard, { large = false } = {}) {
  const width = large ? "60px" : "48px";
  const height = large ? "76px" : "62px";
  const rankSize = large ? "1.35em" : "1.08em";
  const suitSize = large ? "1.05em" : "0.88em";
  return `<div style="display:flex;flex:0 0 auto;flex-direction:column;justify-content:center;align-items:center;gap:4px;width:${width};height:${height};box-sizing:border-box;padding:6px;border-radius:8px;border:1px solid #b9b2a2;background:${CARD_BACKDROP};box-shadow:inset 0 1px 0 rgba(255,255,255,0.85),0 1px 4px rgba(0,0,0,0.12);color:${card.color};font-family:'Modesto Condensed','Palatino Linotype',serif;overflow:hidden;text-align:center;">
    <div style="font-size:${rankSize};font-weight:700;line-height:1;">${card.rank.display}</div>
    <div style="font-size:${suitSize};line-height:1;">${suitEntity(card.suit)}</div>
  </div>`;
}

function buildStatTile(label: string, value: string, accent = DEEP_PURPLE) {
  return `<div style="padding:8px 10px;border-radius:8px;border:1px solid rgba(74,14,78,0.16);background:rgba(255,255,255,0.72);box-shadow:inset 0 1px 0 rgba(255,255,255,0.75);">
    <div style="font-size:0.72em;letter-spacing:0.08em;text-transform:uppercase;color:#746653;margin-bottom:3px;">${label}</div>
    <div style="font-size:1.18em;font-weight:700;color:${accent};line-height:1.1;">${value}</div>
  </div>`;
}

function buildDetailRow(
  label: string,
  value: string,
  { emphasize = false, valueColor = "#2b241d", border = true, nowrap = false } = {},
) {
  return `<div style="padding:${border ? "8px 0" : "8px 0 0"};${border ? "border-bottom:1px solid rgba(74,14,78,0.10);" : ""}">
    <div style="font-size:0.74em;letter-spacing:0.04em;text-transform:uppercase;color:#7a6b58;margin-bottom:3px;">${label}</div>
    <div style="color:${valueColor};font-weight:${emphasize ? "700" : "600"};line-height:1.25;white-space:${nowrap ? "nowrap" : "normal"};overflow-wrap:anywhere;">${value}</div>
  </div>`;
}

function ensureAnimationState() {
  const root = getRoot();

  if (!root._astillonSarsaparillaState) {
    root._astillonSarsaparillaState = {
      handler: null,
      chatClickHandler: null,
      chatRenderHook: null,
      queue: Promise.resolve(),
    };
  }

  return root._astillonSarsaparillaState;
}

function enqueueAnimation(task: () => Promise<unknown> | unknown) {
  const state = ensureAnimationState();
  const next = state.queue
    .catch(() => {})
    .then(async () => {
      try {
        return await task();
      } catch (error) {
        console.error("Sarsaparilla Surprise | Animation failed", error);
        return undefined;
      }
    });

  state.queue = next.catch(() => {});
  return next;
}

function resolveAnimation(promiseFactory: (resolve: () => void) => void, overlay: HTMLElement) {
  return new Promise<void>((resolve) => {
    if (!(globalThis as any).gsap) {
      window.setTimeout(() => {
        overlay.remove();
        resolve();
      }, 900);
      return;
    }

    promiseFactory(resolve);
  });
}

function encodeStackCards(cards: DrawnCard[]) {
  return encodeURIComponent(
    JSON.stringify(
      cards.map((card) => ({
        suit: card.suit,
        color: card.color,
        rank: {
          display: card.rank.display,
          value: card.rank.value,
        },
      })),
    ),
  );
}

function decodeStackCards(encodedCards: string) {
  if (!encodedCards) return [];

  try {
    const parsed = JSON.parse(decodeURIComponent(encodedCards));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Sarsaparilla Surprise | Unable to decode card stack", error);
    return [];
  }
}

function buildCardStack(cards: DrawnCard[]) {
  const count = cards.length;
  const firstCard = cards[0];
  const encodedCards = encodeStackCards(cards);
  const stackShadows = Array.from({ length: Math.min(2, Math.max(0, count - 1)) }, (_, index) => {
    const offset = (Math.min(2, count - 1) - index) * 6;
    return `<div style="position:absolute;top:${offset}px;left:${offset}px;width:60px;height:76px;border-radius:8px;border:1px solid rgba(90,78,62,0.30);background:linear-gradient(135deg,#efe7d6,#e3d7bf);box-shadow:0 1px 3px rgba(0,0,0,0.10);"></div>`;
  }).join("");

  const title = count > 1
    ? `${cardText(firstCard)}. Value +${firstCard.rank.value}. Click to cycle ${count} cards.`
    : `${cardText(firstCard)}. Value +${firstCard.rank.value}.`;

  return `<div data-ssp-card-stack="1" data-cards="${encodedCards}" data-index="0" title="${escapeHTML(title)}" style="display:flex;align-items:center;justify-content:flex-start;width:100%;cursor:pointer;user-select:none;">
    <div style="position:relative;flex:0 0 auto;width:78px;height:92px;">
      ${stackShadows}
      <div data-ssp-stack-face style="position:absolute;top:0;left:0;">${cardChip(firstCard, { large: true })}</div>
    </div>
  </div>`;
}

function initializeCardStacks(messageId: string | null = null) {
  const selector = messageId
    ? `li.chat-message[data-message-id="${messageId}"] [data-ssp-card-stack]`
    : "[data-ssp-card-stack]";

  document.body.querySelectorAll(selector).forEach((stackElement) => {
    if (stackElement instanceof HTMLElement) {
      renderCardStackState(stackElement);
    }
  });
}

function renderCardStackState(stackElement: HTMLElement) {
  const cards = decodeStackCards(stackElement.dataset.cards ?? "");
  if (!cards.length) return;

  let index = Number(stackElement.dataset.index ?? 0);
  if (!Number.isInteger(index) || index < 0) index = 0;
  index %= cards.length;
  stackElement.dataset.index = String(index);

  const currentCard = cards[index];
  const face = stackElement.querySelector("[data-ssp-stack-face]");

  if (face) face.innerHTML = cardChip(currentCard, { large: true });
  stackElement.title = cards.length > 1
    ? `${cardText(currentCard)}. Value +${currentCard.rank.value}. Card ${index + 1} of ${cards.length}. Click to cycle.`
    : `${cardText(currentCard)}. Value +${currentCard.rank.value}.`;
}

function registerChatCardInteractivity() {
  const state = ensureAnimationState();

  if (state.chatClickHandler) {
    document.body.removeEventListener("click", state.chatClickHandler);
  }
  if (state.chatRenderHook !== null) {
    Hooks.off("renderChatMessageHTML", state.chatRenderHook);
  }

  state.chatClickHandler = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const stackElement = target.closest("[data-ssp-card-stack]");
    if (!(stackElement instanceof HTMLElement)) return;

    event.preventDefault();

    const cards = decodeStackCards(stackElement.dataset.cards ?? "");
    if (cards.length <= 1) {
      renderCardStackState(stackElement);
      return;
    }

    const currentIndex = Number(stackElement.dataset.index ?? 0);
    const nextIndex = Number.isInteger(currentIndex) ? (currentIndex + 1) % cards.length : 0;
    stackElement.dataset.index = String(nextIndex);
    renderCardStackState(stackElement);
  };

  document.body.addEventListener("click", state.chatClickHandler);

  state.chatRenderHook = Hooks.on("renderChatMessageHTML", (message: any) => {
    if (!message?.flags?.world?.sarsaparillaSurprise) return;
    window.setTimeout(() => initializeCardStacks(message.id), 0);
  });

  window.setTimeout(() => initializeCardStacks(), 0);
}

function playTwangAnimation(card: DrawnCard) {
  document.getElementById("ssp-twang-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "ssp-twang-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: OVERLAY_Z,
    pointerEvents: "none",
    overflow: "hidden",
  });

  const vignette = document.createElement("div");
  Object.assign(vignette.style, {
    position: "absolute",
    inset: "0",
    background: "radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.6) 100%)",
    opacity: "0",
  });
  overlay.appendChild(vignette);

  const bow = document.createElement("div");
  Object.assign(bow.style, {
    position: "absolute",
    top: "50%",
    left: "16%",
    transform: "translate(-50%,-50%)",
    opacity: "0",
  });

  const limb = document.createElement("div");
  Object.assign(limb.style, {
    width: "14px",
    height: "240px",
    borderRadius: "8px",
    background: "linear-gradient(180deg,#2d0a31,#4a0e4e,#6b1d6e,#4a0e4e,#2d0a31)",
    boxShadow: "0 0 20px rgba(74,14,78,0.6)",
  });
  bow.appendChild(limb);

  const stringBox = document.createElement("div");
  Object.assign(stringBox.style, {
    position: "absolute",
    left: "7px",
    top: "0",
    width: "50px",
    height: "240px",
  });

  const makeString = (top: string, origin: string) => {
    const line = document.createElement("div");
    Object.assign(line.style, {
      position: "absolute",
      left: "0",
      top,
      width: "2px",
      height: "50%",
      background: "linear-gradient(to bottom,#d4af37,#f5e6a3)",
      boxShadow: "0 0 6px rgba(212,175,55,0.8)",
      transformOrigin: origin,
    });
    return line;
  };

  const topString = makeString("0", "top left");
  const bottomString = makeString("50%", "bottom left");
  stringBox.append(topString, bottomString);
  bow.appendChild(stringBox);
  overlay.appendChild(bow);

  const sparks = document.createElement("div");
  Object.assign(sparks.style, {
    position: "absolute",
    top: "50%",
    left: "16%",
    width: "0",
    height: "0",
    zIndex: "4",
  });
  for (let index = 0; index < 10; index += 1) {
    const spark = document.createElement("div");
    Object.assign(spark.style, {
      position: "absolute",
      width: "4px",
      height: "4px",
      borderRadius: "50%",
      background: GOLD,
      boxShadow: `0 0 6px ${GOLD}`,
    });
    sparks.appendChild(spark);
  }
  overlay.appendChild(sparks);

  const flyingCard = document.createElement("div");
  Object.assign(flyingCard.style, {
    position: "absolute",
    top: "50%",
    left: "16%",
    transform: "translate(-50%,-50%)",
    opacity: "0",
    zIndex: "3",
  });

  const cardFace = document.createElement("div");
  Object.assign(cardFace.style, {
    width: "70px",
    height: "100px",
    borderRadius: "8px",
    border: `2px solid ${CARD_BORDER}`,
    background: CARD_BACKDROP,
    boxShadow: "0 0 25px rgba(212,175,55,0.5)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    color: card.color,
    fontFamily: "'Modesto Condensed','Palatino Linotype',serif",
    fontWeight: "bold",
  });
  cardFace.innerHTML = `<span style="font-size:1.8em;line-height:1">${card.rank.display}</span><span style="font-size:1.4em;line-height:1;margin-top:2px">${suitEntity(card.suit)}</span>`;
  flyingCard.appendChild(cardFace);
  overlay.appendChild(flyingCard);

  document.body.appendChild(overlay);

  return resolveAnimation((resolve) => {
    const timeline = gsap.timeline({
      onComplete() {
        overlay.remove();
        resolve();
      },
    });

    timeline.to(vignette, { opacity: 1, duration: 0.25 });
    timeline.to(bow, { opacity: 1, duration: 0.3, ease: "back.out(1.4)" }, 0.1);
    timeline.to(topString, { rotation: 10, x: 35, duration: 0.25, ease: "power2.in" }, 0.4);
    timeline.to(bottomString, { rotation: -10, x: 35, duration: 0.25, ease: "power2.in" }, 0.4);
    timeline.to(topString, { rotation: 0, x: 0, duration: 0.06, ease: "power4.out" }, 0.7);
    timeline.to(bottomString, { rotation: 0, x: 0, duration: 0.06, ease: "power4.out" }, 0.7);
    timeline.to(topString, { x: 5, duration: 0.04, yoyo: true, repeat: 5 }, 0.76);
    timeline.to(bottomString, { x: -5, duration: 0.04, yoyo: true, repeat: 5 }, 0.76);
    timeline.to(flyingCard, { opacity: 1, duration: 0.04 }, 0.7);
    timeline.to(flyingCard, { left: "50%", top: "50%", rotation: 720, duration: 0.6, ease: "power2.out" }, 0.72);

    sparks.querySelectorAll("div").forEach((spark) => {
      const angle = (Math.random() * 120 - 60) * Math.PI / 180;
      const distance = 50 + Math.random() * 120;
      timeline.to(
        spark,
        {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          opacity: 0,
          scale: 0,
          duration: 0.4,
          ease: "power2.out",
        },
        0.72,
      );
    });

    timeline.to(flyingCard, { scale: 1.4, rotation: 0, duration: 0.3, ease: "back.out(1.2)" }, 1.35);
    timeline.to(overlay, { opacity: 0, duration: 0.4, ease: "power2.in" }, 2.0);
  }, overlay);
}

function playStandReveal(cards: DrawnCard[], labelText: string, labelColor: string) {
  document.getElementById("ssp-stand-overlay")?.remove();
  document.getElementById("ssp-twang-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "ssp-stand-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: OVERLAY_Z,
    pointerEvents: "none",
    overflow: "hidden",
  });

  const vignette = document.createElement("div");
  Object.assign(vignette.style, {
    position: "absolute",
    inset: "0",
    background: "radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.55) 100%)",
    opacity: "0",
  });
  overlay.appendChild(vignette);

  const label = document.createElement("div");
  Object.assign(label.style, {
    position: "absolute",
    top: "22%",
    left: "50%",
    transform: "translate(-50%,-50%)",
    opacity: "0",
    fontFamily: "'Modesto Condensed','Palatino Linotype',serif",
    fontSize: "3em",
    fontWeight: "bold",
    letterSpacing: "3px",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    color: labelColor,
    textShadow: "0 0 30px rgba(0,0,0,0.9), 0 3px 6px rgba(0,0,0,0.6)",
  });
  label.textContent = labelText;
  overlay.appendChild(label);

  const tray = document.createElement("div");
  Object.assign(tray.style, {
    position: "absolute",
    top: "52%",
    left: "50%",
    transform: "translate(-50%,-50%)",
    display: "flex",
    gap: "14px",
    zIndex: "3",
    flexWrap: "wrap",
    justifyContent: "center",
    maxWidth: "80vw",
  });

  const cardElements: HTMLElement[] = [];
  for (const card of cards) {
    const element = document.createElement("div");
    Object.assign(element.style, {
      width: "80px",
      height: "115px",
      borderRadius: "8px",
      border: `2px solid ${CARD_BORDER}`,
      background: CARD_BACKDROP,
      boxShadow: "0 0 18px rgba(212,175,55,0.4)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      color: card.color,
      fontFamily: "'Modesto Condensed','Palatino Linotype',serif",
      fontWeight: "bold",
      opacity: "0",
      transform: "scale(0.3) rotate(180deg)",
    });
    element.innerHTML = `<span style="font-size:1.8em;line-height:1">${card.rank.display}</span><span style="font-size:1.4em;line-height:1;margin-top:2px">${suitEntity(card.suit)}</span>`;
    tray.appendChild(element);
    cardElements.push(element);
  }
  overlay.appendChild(tray);

  const sparks = document.createElement("div");
  Object.assign(sparks.style, {
    position: "absolute",
    top: "52%",
    left: "50%",
    width: "0",
    height: "0",
    zIndex: "4",
  });
  for (let index = 0; index < 14; index += 1) {
    const spark = document.createElement("div");
    Object.assign(spark.style, {
      position: "absolute",
      width: "5px",
      height: "5px",
      borderRadius: "50%",
      background: GOLD,
      boxShadow: `0 0 8px ${GOLD}`,
    });
    sparks.appendChild(spark);
  }
  overlay.appendChild(sparks);

  document.body.appendChild(overlay);

  return resolveAnimation((resolve) => {
    const timeline = gsap.timeline({
      onComplete() {
        overlay.remove();
        resolve();
      },
    });

    timeline.to(vignette, { opacity: 1, duration: 0.3 });
    cardElements.forEach((element, index) => {
      timeline.to(element, { opacity: 1, scale: 1, rotation: 0, duration: 0.35, ease: "back.out(1.7)" }, 0.3 + index * 0.2);
    });

    const revealAt = 0.3 + cardElements.length * 0.2 + 0.15;

    sparks.querySelectorAll("div").forEach((spark) => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 70 + Math.random() * 100;
      timeline.to(
        spark,
        {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          opacity: 0,
          scale: 0,
          duration: 0.5,
          ease: "power2.out",
        },
        revealAt,
      );
    });

    timeline.fromTo(
      label,
      { opacity: 0, scale: 0.3 },
      { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" },
      revealAt + 0.05,
    );
    timeline.to(overlay, { opacity: 0, duration: 0.5, ease: "power2.in" }, revealAt + 1.3);
  }, overlay);
}

function registerSocketHandler() {
  const state = ensureAnimationState();

  if (state.handler) {
    game.socket.off(SOCK, state.handler);
  }

  state.handler = (data: any) => {
    if (!data || data.userId === game.user.id) return;

    if (data.type === "twang") {
      void enqueueAnimation(() => playTwangAnimation(data.card));
    } else if (data.type === "stand") {
      void enqueueAnimation(() => playStandReveal(data.cards, data.labelText, data.labelColor));
    }
  };

  game.socket.on(SOCK, state.handler);
}

async function broadcastTwang(card: DrawnCard) {
  const local = enqueueAnimation(() => playTwangAnimation(card));
  game.socket.emit(SOCK, { type: "twang", userId: game.user.id, card });
  await local;
}

async function broadcastStandReveal(cards: DrawnCard[], labelText: string, labelColor: string) {
  const local = enqueueAnimation(() => playStandReveal(cards, labelText, labelColor));
  game.socket.emit(SOCK, { type: "stand", userId: game.user.id, cards, labelText, labelColor });
  await local;
}

function buildChatCard({
  dieRoll,
  cards,
  naturalRollTotal,
  fullTotal,
  mod,
  weaponLabel,
  resultClass,
  resultText,
  flavor,
  actorName,
  targetName,
  targetAC,
}: {
  dieRoll: number;
  cards: DrawnCard[];
  naturalRollTotal: number;
  fullTotal: number;
  mod: number;
  weaponLabel: string;
  resultClass: string;
  resultText: string;
  flavor: string;
  actorName: string;
  targetName: string;
  targetAC: number | null;
}) {
  const palette = RESULT_COLORS[resultClass];
  const drawnTotal = cardValueTotal(cards);
  const headerTag = escapeHTML(resultText);
  const safeActorName = escapeHTML(actorName);
  const safeWeaponLabel = escapeHTML(weaponLabel);
  const safeFlavor = escapeHTML(flavor);
  const safeTargetName = escapeHTML(targetName ?? "");
  const stackHtml = buildCardStack(cards);
  const signedMod = `${mod >= 0 ? "+" : "-"}${Math.abs(mod)}`;
  const targetResult = targetAC !== null
    ? fullTotal >= targetAC
      ? "Hit"
      : "Still a Miss"
    : "GM Determines Outcome";
  const outcomeSummary = naturalRollTotal === 21
    ? "Critical Hit"
    : naturalRollTotal > 21
      ? "Critical Miss"
      : targetResult;
  const outcomeColor = naturalRollTotal === 21
    ? RESULT_COLORS.blackjack.total
    : naturalRollTotal > 21
      ? RESULT_COLORS.bust.total
      : targetAC !== null
        ? fullTotal >= targetAC
          ? RESULT_COLORS.hit.total
          : RESULT_COLORS.miss.total
        : DEEP_PURPLE;

  const summaryTiles = [
    buildStatTile("d20 Roll", String(dieRoll)),
    buildStatTile("Card Bonus", `+${drawnTotal}`, "#7a5a11"),
    buildStatTile("Natural Total", String(naturalRollTotal), palette.total),
    buildStatTile(naturalRollTotal < 21 ? "Final Total" : "Outcome", naturalRollTotal < 21 ? String(fullTotal) : outcomeSummary, naturalRollTotal < 21 ? DEEP_PURPLE : outcomeColor),
  ].join("");

  const drawnCardsText = cards.map((card) => cardText(card)).join(", ");
  const detailRows = [
    buildDetailRow("Cards Drawn", `${escapeHTML(drawnCardsText)} (+${drawnTotal})`, { valueColor: "#4a3d2b" }),
    buildDetailRow("Natural Formula", `${dieRoll} + ${drawnTotal} = ${naturalRollTotal}`, { emphasize: true, valueColor: palette.total, nowrap: true }),
  ];

  if (naturalRollTotal === 21) {
    detailRows.push(buildDetailRow("Outcome", "Natural 21: Critical Hit", { emphasize: true, valueColor: RESULT_COLORS.blackjack.total }));
  } else if (naturalRollTotal > 21) {
    detailRows.push(buildDetailRow("Outcome", "Over 21: Critical Miss", { emphasize: true, valueColor: RESULT_COLORS.bust.total }));
  } else {
    detailRows.push(buildDetailRow("Attack Modifier", signedMod));
    detailRows.push(buildDetailRow("Final Formula", `${naturalRollTotal} ${mod >= 0 ? "+" : "-"} ${Math.abs(mod)} = ${fullTotal}`, { emphasize: true, valueColor: DEEP_PURPLE, nowrap: true }));
    if (targetAC !== null) {
      detailRows.push(
        buildDetailRow(
          `Versus ${safeTargetName} AC`,
          `${targetAC} - ${targetResult}`,
          { emphasize: true, valueColor: fullTotal >= targetAC ? RESULT_COLORS.hit.total : RESULT_COLORS.miss.total, border: false },
        ),
      );
    } else {
      detailRows.push(buildDetailRow("Target", "No target selected", { border: false }));
    }
  }

  return `<div class="pf2e chat-card">
    <header class="card-header flexrow">
      <img src="icons/sundries/gaming/playing-cards.webp" alt="Playing Cards" />
      <h3>Sarsaparilla Surprise</h3>
      <h4 style="color:${palette.total};">${headerTag}</h4>
    </header>
    <div class="card-content">
      <div style="display:grid;gap:10px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:0.75em 0.9em;border:1px solid rgba(74,14,78,0.20);border-radius:8px;background:linear-gradient(135deg,rgba(253,246,227,0.92),rgba(240,230,211,0.98));box-shadow:inset 0 1px 0 rgba(255,255,255,0.75);">
          <div>
            <div style="font-size:0.74em;letter-spacing:0.08em;text-transform:uppercase;color:#7d6e59;margin-bottom:4px;">Fortune favors ${safeActorName}</div>
            <div style="font-size:1.28em;font-weight:700;color:#2b241d;line-height:1.15;">${safeWeaponLabel}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
            <div style="font-size:0.72em;letter-spacing:0.08em;text-transform:uppercase;color:#7d6e59;">Outcome</div>
            <div style="display:inline-block;padding:4px 12px;border-radius:999px;color:#fff;font-weight:700;background:${palette.pillBg};box-shadow:0 0 14px ${palette.glow};">${headerTag}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;">
          ${summaryTiles}
        </div>
        <div style="padding:0.7em 0.85em;border-radius:8px;border-left:4px solid ${palette.total};background:linear-gradient(135deg,rgba(255,255,255,0.78),rgba(247,241,230,0.92));color:#4f4336;">
          <em>${safeFlavor}</em>
        </div>
        <div style="padding:0.75em 0.85em;border-radius:8px;border:1px solid rgba(74,14,78,0.14);background:rgba(255,255,255,0.62);">
          <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
            <div style="font-size:0.74em;letter-spacing:0.08em;text-transform:uppercase;color:#746653;">Card Stack</div>
            <div style="font-size:0.85em;color:#6b5d4b;">Total bonus +${drawnTotal}</div>
          </div>
          ${stackHtml}
        </div>
        <div style="padding:0.25em 0.85em 0.05em;border-radius:8px;border:1px solid rgba(74,14,78,0.14);background:rgba(255,255,255,0.58);">
          ${detailRows.join("")}
        </div>
      </div>
    </div>
    <footer>
      <span>Natural 21 crits</span>
      <span>Over 21 busts</span>
      <span>${targetAC !== null ? `${safeTargetName} AC ${targetAC}` : "No target selected"}</span>
    </footer>
  </div>`;
}

async function playBlackjack(
  dieRoll: number,
  mod: number,
  weaponLabel: string,
  targetAC: number | null,
  targetName: string,
  actorName: string,
  speaker: Record<string, unknown>,
) {
  const hand: DrawnCard[] = [];
  let busted = false;
  let blackjack = false;

  hand.push(drawCard());
  let naturalRollTotal = naturalTotal(dieRoll, hand);
  await broadcastTwang(hand[0]);

  if (naturalRollTotal === 21) blackjack = true;
  if (naturalRollTotal > 21) busted = true;

  while (!busted && !blackjack) {
    const action = await new Promise<string>((resolve) => {
      const cardsHtml = hand
        .map((card) => `<div style="width:46px;height:64px;border-radius:5px;border:2px solid ${CARD_BORDER};background:${CARD_BACKDROP};box-shadow:2px 2px 5px rgba(0,0,0,0.2);display:inline-flex;flex-direction:column;justify-content:center;align-items:center;font-weight:bold;color:${card.color}"><span style="font-size:1.2em;line-height:1">${card.rank.display}</span><span style="font-size:1em;line-height:1">${suitEntity(card.suit)}</span></div>`)
        .join("");

      const totalColor = naturalRollTotal >= 17 ? "#c0392b" : "#27ae60";
      const prompt =
        naturalRollTotal <= 15
          ? "Feeling lucky? The Trickster urges you on..."
          : naturalRollTotal <= 18
            ? "The string hums with tension... risky territory."
            : naturalRollTotal <= 20
              ? "One wrong card and you are bust. Dare you push it?"
              : "Standing at the edge of fortune.";

      new Dialog({
        title: "Sarsaparilla Surprise - Hit or Stand?",
        content: `<div style="${DS.wrap}">
          <div style="font-size:1.1em;color:${DEEP_PURPLE};margin:0 0 6px">The Velvet Trickster's Table</div>
          <div style="font-size:0.82em;color:#666;margin-bottom:6px">d20 roll: <b>${dieRoll}</b></div>
          <div style="display:flex;justify-content:center;align-items:center;gap:6px;flex-wrap:wrap;margin:8px 0">${cardsHtml}</div>
          <div style="font-size:1.8em;font-weight:bold;color:${totalColor};margin:6px 0 2px">Hand: ${naturalRollTotal} / 21</div>
          <div style="font-size:0.85em;color:#888;font-style:italic;margin-bottom:4px">${prompt}</div>
        </div>`,
        buttons: {
          hit: { icon: '<i class="fas fa-plus"></i>', label: "Hit", callback: () => resolve("hit") },
          stand: { icon: '<i class="fas fa-hand"></i>', label: "Stand", callback: () => resolve("stand") },
        },
        default: "hit",
        render: (html: any) => {
          const jq = html instanceof jQuery ? html : $(html);
          jq.closest(".dialog,.window-app").css(DS.bg);
        },
        close: () => resolve("stand"),
      }).render(true);
    });

    if (action === "stand") break;

    const nextCard = drawCard();
    hand.push(nextCard);
    naturalRollTotal = naturalTotal(dieRoll, hand);
    if (naturalRollTotal === 21) blackjack = true;
    else if (naturalRollTotal > 21) busted = true;
    await broadcastTwang(nextCard);
  }

  const fullTotal = naturalRollTotal + mod;
  let resultClass: string;
  let resultText: string;
  let flavor: string;

  if (blackjack) {
    resultClass = "blackjack";
    resultText = "BLACKJACK - Critical Hit";
    flavor = pickFlavor("blackjack");
  } else if (busted) {
    resultClass = "bust";
    resultText = "BUST - Critical Miss";
    flavor = pickFlavor("bust");
  } else if (targetAC !== null && fullTotal >= targetAC) {
    resultClass = "hit";
    resultText = "Hit";
    flavor = pickFlavor("hit");
  } else if (targetAC !== null && fullTotal < targetAC) {
    resultClass = "miss";
    resultText = "Still a Miss";
    flavor = pickFlavor("miss");
  } else {
    resultClass = "hit";
    resultText = `+${cardValueTotal(hand)} to the Strike`;
    flavor = "The Trickster's cards add their fortune. The GM determines the final outcome.";
  }

  const revealLabel = blackjack ? "BLACKJACK!" : busted ? "BUST!" : resultText.toUpperCase();
  const revealColor = blackjack ? "#2ecc71" : busted ? "#e74c3c" : RESULT_COLORS[resultClass].total;
  await broadcastStandReveal(hand, revealLabel, revealColor);

  await ChatMessage.create({
    author: game.user.id,
    content: buildChatCard({
      dieRoll,
      cards: hand,
      naturalRollTotal,
      fullTotal,
      mod,
      weaponLabel,
      resultClass,
      resultText,
      flavor,
      actorName,
      targetName,
      targetAC,
    }),
    speaker,
    flags: {
      world: {
        sarsaparillaSurprise: {
          dieRoll,
          cards: hand.map((card) => ({ rank: card.rank.name, suit: card.suit, value: card.rank.value })),
          naturalTotal: naturalRollTotal,
          fullTotal,
          mod,
          weaponLabel,
          result: resultClass,
        },
      },
    },
  });
}

async function activateSarsaparillaSurprise() {
  const token = canvas.tokens.controlled[0];
  if (!token) {
    ui.notifications.warn("Select a token wielding the Sarsaparilla Surprise.");
    return;
  }

  const actor = token.actor;
  if (!actor) {
    ui.notifications.warn("The selected token has no associated actor.");
    return;
  }

  const strikes = (actor.system.actions ?? []).filter((action: any) => typeof action?.totalModifier === "number");
  if (!strikes.length) {
    ui.notifications.warn("This actor has no strikes available.");
    return;
  }

  const strikeOptions = strikes
    .map((strike: any, index: number) => {
      const modifier = strike.totalModifier >= 0 ? `+${strike.totalModifier}` : `${strike.totalModifier}`;
      return `<option value="${index}">${escapeHTML(strike.label)} (${modifier})</option>`;
    })
    .join("");

  const target = Array.from(game.user.targets)[0] as any;
  const targetActor = target?.actor ?? null;
  const targetAC = targetActor?.armorClass?.value ?? targetActor?.system?.attributes?.ac?.value ?? null;
  const targetName = targetActor?.name ?? "Unknown";

  const targetLine = targetActor
    ? `<div style="${DS.tgtOk}">Targeting: <b>${escapeHTML(targetName)}</b></div>`
    : `<div style="${DS.tgtNo}">No target selected - the GM will determine the outcome.</div>`;

  const setup = await new Promise<{ dieRoll: number; mod: number; weaponLabel: string } | null>((resolve) => {
    new Dialog({
      title: "Sarsaparilla Surprise - Draw from the Deck",
      content: `<div style="${DS.wrap}">
        <div style="${DS.head}">Sarsaparilla Surprise</div>
        <div style="${DS.sub}">The Velvet Trickster whispers... "Shall we beat the odds, love?"</div>
        <label style="${DS.lbl}" for="ssp-weapon">Weapon:</label>
        <select style="${DS.sel}" id="ssp-weapon">${strikeOptions}</select>
        <div style="${DS.modDisp}" id="ssp-mod-display">Attack modifier: ${strikes[0].totalModifier >= 0 ? "+" : ""}${strikes[0].totalModifier}</div>
        <label style="${DS.lbl}" for="ssp-dieroll">Natural d20 result from the missed strike:</label>
        <input style="${DS.inp}" type="number" id="ssp-dieroll" value="1" min="1" max="20" autofocus />
        <div style="${DS.hint}">The card values will be added to this die result.</div>
        <hr style="border-color:${GOLD};margin:10px 0" />
        ${targetLine}
      </div>`,
      buttons: {
        draw: {
          icon: '<i class="fas fa-hand-sparkles"></i>',
          label: "Draw a Card",
          callback: (html: any) => {
            const jq = html instanceof jQuery ? html : $(html);
            const index = parseInt(jq.find("#ssp-weapon").val(), 10) || 0;
            const rawDieRoll = parseInt(jq.find("#ssp-dieroll").val(), 10) || 1;
            resolve({
              dieRoll: Math.clamped(rawDieRoll, 1, 20),
              mod: strikes[index].totalModifier,
              weaponLabel: strikes[index].label,
            });
          },
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Walk Away",
          callback: () => resolve(null),
        },
      },
      default: "draw",
      render: (html: any) => {
        const jq = html instanceof jQuery ? html : $(html);
        jq.closest(".dialog,.window-app").css(DS.bg);
        jq.find("#ssp-weapon").on("change", function (this: HTMLSelectElement) {
          const strike = strikes[parseInt(this.value, 10) || 0];
          jq.find("#ssp-mod-display").text(`Attack modifier: ${strike.totalModifier >= 0 ? "+" : ""}${strike.totalModifier}`);
        });
      },
      close: () => resolve(null),
    }).render(true);
  });

  if (!setup) return;

  const speaker = ChatMessage.getSpeaker({ actor, token: token.document });
  await playBlackjack(setup.dieRoll, setup.mod, setup.weaponLabel, targetAC, targetName, actor.name, speaker);
}

function registerModuleApi() {
  const api = {
    runSarsaparillaSurprise: activateSarsaparillaSurprise,
  };

  const module = game.modules?.get?.(MODULE_ID);
  if (module) {
    module.api = api;
  }

  if (!game.astillonHanaqAdventures) {
    game.astillonHanaqAdventures = {};
  }

  game.astillonHanaqAdventures.sarsaparilla = {
    run: activateSarsaparillaSurprise,
  };
}

Hooks.once("init", () => {
  registerModuleApi();
});

Hooks.once("ready", () => {
  registerSocketHandler();
  registerChatCardInteractivity();
  console.log("Astillon Hanaq Adventures | Ready");
});
