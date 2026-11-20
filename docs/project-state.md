# Current project context

Read this after [AGENTS.md](../AGENTS.md). Do not load the entire release history to start a task.

## Product and state

- **Astillon Hanaq Adventures** (`astillon-hanaq-adventures-module`): PF2e campaign content plus six feature factories. See the [baseline contract](../specs/001-module-baseline/spec.md) and [ownership map](architecture.md).
- Last substantial runtime change: **0.10.21**, commit `e295d5c`, performance hotfix. Adoption release **0.10.22** adds Spec Kit/governance, corrects stale packaging CI, and reverses the Dark Triad image spin at the user's request; no encounter mechanics change.
- **Published:** [0.10.23](https://github.com/MemelyPepeartly/astillon-hanaq-adventures-module/releases/tag/0.10.23), release commit `02c6bfc`; both packaging workflows succeeded. Real Foundry editor/save/multiplayer acceptance remains NOT RUN; the specifically authorized WickerWind renderer/painter preview was visually inspected.
- **Current change:** 0.10.24 fixes the Your Turn/paint dialogs overflowing below the viewport by scrolling their content independently of native action footers. The user reports painting works but Save was unreachable in 0.10.23. Persistence/multiplayer and the new layout remain unverified in live Foundry. See [delta](../specs/003-opaque-portrait-outline/spec.md).
- Manifest advertises Foundry 13–14; newer Blaster/cutscene paths target **14.370 / PF2e 8.7.1** from recorded implementation evidence. The manifest's older PF2e verified value is not live V14 evidence. Do not expand compatibility without evidence.
- Spec Kit **1.4.3**, Codex skills, PowerShell scripts. [Setup/update](../.specify/README.md). No automatic agent lifecycle hooks, Git extension, or test extension is enabled.

## Binding expectations

1. Responsive game first: unrelated token operations must not trigger world scans or eager off-scene actor/media construction.
2. GM owns gameplay decisions and manual effect/aura placement. Security/ownership checks are distinct from unwanted gameplay locks.
3. No unit/mock/JSDOM/content tests, simulated fixtures, or testing campaigns. Only authorized real Foundry module checks; otherwise report NOT RUN.
4. PF2e descriptions must be concise, native-looking, and actionable with correct inline links.
5. Version, merge, push, and publish requested implementation work. Preserve unrelated changes; do not infer live-campaign deployment permission.

## Implementation versus evidence

- The hotfix scopes aura reconciliation, reuses provider snapshots, batches events, and avoids arbitrary inactive-map synthetic actors. Portrait warming is enabled-only, prioritized, cache-bounded, and yields during outlining. Blastback movement targets its existing plan.
- Those are code changes, **not measured live-world improvement**. No real Foundry performance session was available. Keep that acceptance gap until actual evidence arrives.
- Manual support effects remain unrestricted. Managed thrall auras sum Inspire/Guard and active-source Bolster balances; no thrall cap/combat/turn gate is intended.
- Existing tests and older test counts are historical/inactive, not permission to run or modernize suites.
- Compendium NPC changes need the documented upgrade path for world copies. Runtime-only updates normally require all clients to reload, not sheet reimport.

## Navigation

| Need | Canonical document |
| --- | --- |
| Principles | [Constitution](../.specify/memory/constitution.md) |
| Current feature contracts | [Baseline spec](../specs/001-module-baseline/spec.md) |
| Runtime/data ownership | [Architecture](architecture.md) |
| Performance constraints | [Performance](performance.md) |
| Work and delivery | [Development workflow](development-workflow.md) |
| Active/change index | [Specs index](../specs/README.md) |
| User operation | [README](../README.md) |

Update this page in place, not as an append-only transcript. Read/update only the affected contracts.
