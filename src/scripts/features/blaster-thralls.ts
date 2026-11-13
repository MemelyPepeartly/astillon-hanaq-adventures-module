/** Portable actor IDs and bundled artwork shared by the picker and content tests. */
export const BLASTER_THRALLS = [
  { key: "hype-fan", id: "BlasterThrall001", name: "Hype Fan", tagline: "Glowsticks up. Ego higher.", routine: "Inspire", detail: "A cheering superfan with an impossible grin." },
  { key: "ego-guard", id: "BlasterThrall002", name: "Ego Guard", tagline: "Nobody touches the talent.", routine: "Guard", detail: "A smug stage bouncer with a violet energy shield." },
  { key: "paparazzo", id: "BlasterThrall003", name: "Paparazzo", tagline: "Every angle is his good angle.", routine: "Bolster", detail: "An obsessive photographer firing magenta flashes." },
] as const;

export function thrallArtwork(moduleId: string, key: string): string {
  return `modules/${moduleId}/assets/blaster-thralls/${key}.png`;
}

/** Native radio controls remain keyboard accessible; the entire portrait card is clickable. */
export function thrallPickerContent(moduleId: string): string {
  const escape = (value: string) => foundry.utils.escapeHTML(value);
  return `<div class="aha-thrall-picker">
    <p class="aha-thrall-intro">Choose one member of Blaster's entourage, then place it within <strong>30 feet</strong>.</p>
    <div class="aha-thrall-choices" role="group" aria-label="Thrall appearance">
      ${BLASTER_THRALLS.map((variant, i) => `<label class="aha-thrall-choice">
        <input type="radio" name="variant" value="${variant.key}" ${i === 0 ? "checked" : ""}>
        <img src="${escape(thrallArtwork(moduleId, variant.key))}" alt="${variant.name}" width="180" height="180">
        <strong>${variant.name}</strong><span class="aha-thrall-tagline">${variant.tagline}</span>
        <span>${variant.detail}</span><small>Signature routine: ${variant.routine}</small>
      </label>`).join("")}
    </div>
    <label class="aha-thrall-random"><input type="radio" name="variant" value="random"> Surprise me — randomly choose one of the three</label>
    <p class="aha-thrall-limits">1 action · 1 summon per round · 3 living thralls maximum · 1 HP · lasts 1 minute.<br>All three can Inspire, Guard, or Bolster when commanded; choosing a look grants no free support.</p>
  </div>`;
}
