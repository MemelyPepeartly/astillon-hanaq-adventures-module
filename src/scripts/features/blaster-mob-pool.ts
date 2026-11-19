/** PF2e's creature pre-update clamps temporary HP to this value. Excess is never banked. */
const MAX_TEMP_HP = 999;
const CONTRIBUTION_HP = 10;

export interface BlasterMobPoolHP {
  temp: number;
  tempSource: string | null;
}

export interface BlasterMobPoolLedger {
  version: 1;
  /** Insertion order is the spend order; zero is a once-per-lifetime grant tombstone. */
  contributions: Record<string, number>;
  external: BlasterMobPoolHP | null;
  /** The last result committed together with this ledger, never an independently sampled value. */
  displayed: BlasterMobPoolHP;
}

export interface BlasterMobPoolObservation {
  temp: number;
  tempSource?: string | null;
  /** False when the previously retained external source has expired or disappeared. */
  externalSourceActive?: boolean;
}

export interface BlasterMobPoolResult extends BlasterMobPoolHP {
  ledger: BlasterMobPoolLedger;
}

function hpValue(value: unknown, maximum = MAX_TEMP_HP): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(0, Math.floor(number))) : 0;
}

function sourceId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Reconcile an aggregate Flash Mob pool without document writes or native TempHP rule elements.
 *
 * A native aura arrival supplies a grant key (token UUID plus summon nonce). All living summon
 * keys, including those outside the aura or in another mode, must remain in liveKeys. Supply
 * lifetimeKeys separately to retain spent tombstones for temporarily dead or invalid summons:
 * their contributions are removed, but revival/link repair cannot grant them again. Omit a key
 * from lifetimeKeys only after its token/lifetime ends. Ordinary HP pre-updates should pass the
 * existing contribution keys and no grants. Commit the returned HP and ledger atomically.
 *
 * The mob and unrelated pool compete by maximum. Every observed decrease spends BOTH pools,
 * so a hidden pool cannot refill damage when it becomes the higher one. A new unrelated source
 * replaces the retained unrelated pool. Removing a thrall removes only its unspent contribution.
 */
export function reconcileMobPool(
  previous: BlasterMobPoolLedger | null | undefined,
  current: BlasterMobPoolObservation,
  liveKeys: Iterable<string>,
  grantKeys: Iterable<string>,
  poolSourceId: string,
  lifetimeKeys: Iterable<string> = liveKeys,
): BlasterMobPoolResult {
  const observed = { temp: hpValue(current.temp), tempSource: sourceId(current.tempSource) };
  const prior = previous?.version === 1 ? previous : null;
  const priorDisplayed = prior
    ? { temp: hpValue(prior.displayed?.temp), tempSource: sourceId(prior.displayed?.tempSource) }
    : observed;
  const live = new Set(liveKeys);
  // The default may be a one-shot iterator already consumed while constructing live.
  const lifetimes = lifetimeKeys === liveKeys ? live : new Set(lifetimeKeys);
  const contributions = new Map<string, number>();
  let capacity = MAX_TEMP_HP;
  for (const [key, value] of Object.entries(prior?.contributions ?? {})) {
    const remaining = Math.min(capacity, hpValue(value, CONTRIBUTION_HP));
    contributions.set(key, remaining);
    capacity -= remaining;
  }

  let external = prior?.external
    ? { temp: hpValue(prior.external.temp), tempSource: sourceId(prior.external.tempSource) }
    : null;
  const spent = Math.max(0, priorDisplayed.temp - observed.temp);
  let unassigned = spent;
  for (const [key, remaining] of contributions) {
    const debit = Math.min(remaining, unassigned);
    contributions.set(key, remaining - debit);
    unassigned -= debit;
  }
  if (external) external.temp = Math.max(0, external.temp - spent);

  // Current unrelated HP is authoritative, including manual grants with no item source.
  // A source change replaces, rather than adds to, the one retained unrelated pool.
  if (observed.tempSource !== poolSourceId) {
    external = observed.temp > 0 ? { ...observed } : null;
  }
  if (
    external && prior?.external && current.externalSourceActive === false &&
    external.tempSource === sourceId(prior?.external?.tempSource)
  ) {
    external = null;
  }
  if (external?.temp === 0 || external?.tempSource === poolSourceId) external = null;

  // A mode change or aura exit must not remove a living lifetime key from this set.
  for (const key of contributions.keys()) {
    if (!lifetimes.has(key)) contributions.delete(key);
    else if (!live.has(key)) contributions.set(key, 0);
  }
  let mobRemaining = [...contributions.values()].reduce((total, value) => total + value, 0);
  for (const key of grantKeys) {
    if (!live.has(key) || !lifetimes.has(key) || contributions.has(key)) continue;
    const grant = Math.min(CONTRIBUTION_HP, MAX_TEMP_HP - mobRemaining);
    contributions.set(key, grant);
    mobRemaining += grant;
  }

  const externalRemaining = external?.temp ?? 0;
  const useMob = mobRemaining > externalRemaining ||
    (mobRemaining > 0 && mobRemaining === externalRemaining && observed.tempSource === poolSourceId);
  const displayed: BlasterMobPoolHP = useMob
    ? { temp: mobRemaining, tempSource: poolSourceId }
    : { temp: externalRemaining, tempSource: externalRemaining > 0 ? external!.tempSource : null };
  return {
    ...displayed,
    ledger: { version: 1, contributions: Object.fromEntries(contributions), external, displayed },
  };
}
