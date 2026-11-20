# In-game performance contract

These are design requirements, not measured guarantees. The 0.10.21 changes were packaged, not profiled inside Foundry.

| Path | Required shape | Forbidden pattern |
| --- | --- | --- |
| Unrelated token update/delete/refresh | Cheap identity/changed-field check, then return | Scan all scenes, actors, items, or Regions |
| Relevant aura change | Batch burst; one scoped provider snapshot reused across recipients | Rebuild all providers inside each actor's loop |
| Inactive feature | No recurring media/render jobs; cheap hooks only | Always-on timers/tickers or world reconciliation |
| Active visual | Attachment or coalesced frame update; local rendering | Recreate all beams on unrelated refresh |
| Portrait warmup | Enabled-only; combat/scene first; bounded idle work | Decode/rasterize every world's token portrait at ready |
| Persistent state | Single writer; compare-before-write | Render-triggered writes or feedback storms |
| Recovery/migration | Bounded startup/relevant authority recovery | Full orphan/migration scans on ordinary movement |

## Existing design limits

- Your Turn prepared-art cache: **64 entries**. World background queue filling stops at **128 entries**; foreground scene needs have priority. Eviction must not revoke a visible portrait's blob.
- Outlining yields after approximately **4 ms of processing**, checked between rows. This is not a hard upper bound on a row or a measured frame budget.
- Aura bursts use **100 ms batching**. Events during an awaited pass may require one trailing pass; ordered gameplay events stay ordered.
- Blastback visual refresh is frame-coalesced and restricted to watched charge tokens. Native damage and explicit actions are ordering barriers.
- Do not traverse inactive maps' `token.actor` getters. Raw token flags and already-loaded world actors avoid constructing unrelated synthetic actors.

Change limits only for a concrete reason recorded in the plan, not a new mock benchmark campaign. Prefer a smaller bounded algorithm over new worker/service/cache infrastructure without need.

## Questions for an affected plan

What invokes this code, how often, on which clients? What collections are traversed? What happens with no Blaster, no charge, or disabled cut-ins? What is cached and who invalidates it? What queues up during bulk deletion? Which writes trigger the same hooks? What clears on teardown, deletion, cancellation, replacement, or GM handover?

## Real-instance acceptance only

When a real Foundry instance is provided and the operation authorized, record module/system/Foundry versions, client roles, scene/world scale, dependencies, and the specific operation. Check startup, unrelated move/delete, a relevant aura change, and the changed presentation path only as needed. A short real browser profile can identify CPU/network work; do not run destructive campaign operations without approval.

Record observed outcome and limits. Otherwise: **NOT RUN — no real Foundry instance**. No synthetic demo, unit suite, invented benchmark, or compilation result replaces this evidence.
