import { BLAST_MODES, BLAST_TIERS, FINALE, blastDamage, type BlastMode, type Charge } from "./blaster-model.js";

export function blastChoiceContent(charge: Charge = 1, mode: BlastMode = "fire", finale = false): string {
  return `<div class="aha-blast-choices"><p><strong>1. Choose a blast.</strong> Its mode determines damage type, saving throw, area color, and condition outcomes.</p>
    ${finale ? "" : `<div class="form-group"><label>Charge</label><select name="charge" aria-label="Charge">${Object.entries(BLAST_TIERS).map(([key, tier]) =>
      `<option value="${key}" ${Number(key) === charge ? "selected" : ""}>${key} action(s): ${tier.name} — ${tier.dice}d${tier.die}, ${tier.width} square(s) wide</option>`).join("")}</select></div>`}
    <div class="form-group"><label>Damage / effect mode</label><select name="mode" aria-label="Damage / effect mode">${Object.entries(BLAST_MODES).map(([key, entry]) =>
      `<option value="${key}" ${key === mode ? "selected" : ""}>${entry.label}${entry.penalty ? ` (−${entry.penalty} dice + effect)` : ""}</option>`).join("")}</select></div>
    <div class="aha-blast-choice-preview" aria-live="polite">${choiceSummary(charge, mode, finale)}</div>
    <p><strong>2. Place the area.</strong> ${finale ? "Click eight points. Each of seven legs reaches up to 120 feet; the warning fires next round." : "Click a direction from Blaster for the full 120-foot beam."}</p>
    <p><strong>3. Resolve in chat.</strong> Click the save and damage controls on the generated card. To apply riders, target creatures with the same final save outcome and run <strong>Apply Blast Effect</strong>. The colored map area never applies damage just by touching a token.</p>
    <p>No automatic movement lock. Action costs, frequency, and recharge remain GM-adjudicated.</p></div>`;
}

function choiceSummary(charge: Charge, mode: BlastMode, finale: boolean): string {
  const tier = finale ? FINALE : BLAST_TIERS[charge];
  const spectrum = BLAST_MODES[mode];
  return `<p><strong>${spectrum.label}: ${blastDamage(tier.dice, tier.die, mode)} ${spectrum.damage}</strong> · DC 40 basic ${spectrum.save} · ${tier.width} square(s) wide</p>${spectrum.rider ? `<p>${spectrum.rider}</p>` : "<p>Damage only; no condition rider.</p>"}`;
}

export function bindBlastChoices(element: any, finale = false): void {
  const root = element?.querySelector?.(".aha-blast-choices");
  if (!root || root.dataset.bound) return;
  root.dataset.bound = "true";
  const update = () => {
    const charge = Number(root.querySelector('[name="charge"]')?.value ?? 1) as Charge;
    const mode = root.querySelector('[name="mode"]')?.value as BlastMode;
    if (![1, 2, 3].includes(charge) || !Object.prototype.hasOwnProperty.call(BLAST_MODES, mode)) return;
    root.querySelector(".aha-blast-choice-preview").innerHTML = choiceSummary(charge, mode, finale);
  };
  root.addEventListener("input", update);
  root.addEventListener("change", update);
  update();
}
