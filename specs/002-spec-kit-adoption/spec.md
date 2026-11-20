# Feature specification: Spec Kit adoption and reverse cutscene spin

Status: Implemented, packaged, merged/pushed and published as 0.10.22. Live Foundry acceptance and new-session skill discovery remain NOT RUN; see [tasks](tasks.md).
Requested: 2026-11-19. Baseline: e295d5c / 0.10.21. Target: 0.10.22.

## Outcome

Future agents can recover the module's current purpose, pieces, boundaries and working expectations without reading a long chat history. Spec Kit is actually installed and its delivered instructions conform to the owner's no-testing, high-performance, native-content and GM-control requirements.

## Requirements

- GOV-001: Install pinned official Spec Kit with discoverable Codex skills and PowerShell helpers; keep tooling outside the game package and no global environment changes required.
- GOV-002: Author a versioned constitution, current-state page, architecture map, performance contract and right-sized development workflow. Capture all six feature factories and eight compendia in a baseline with source links.
- GOV-003: Override test-first/coverage/example test commands and templates, including the actual generated skills. No tests, fixtures or simulated acceptance are introduced or executed.
- GOV-004: Preserve GM manual effect/aura freedom, table-adjudicated costs, data integrity, native PF2e inline readability and the scoped version/merge/push/publish workflow.
- PERF-001: Document cheap unrelated-event exits, scene/participant scope, one provider snapshot, bounded/coalesced work, idle behavior, no eager off-scene actors, ordered state writes and lifecycle cleanup. Label limits as design requirements, not measurements.
- CI-001: Both CI paths package without legacy tests. Remove the stale Build workflow's nonexistent `npm test` invocation; do not add another validation pipeline.
- VIS-001: Per the later explicit request, reverse only the Dark Triad image rotation from 0→360 to 0→−360. Keep the one-minute rotation, fade, lightning, sound and controls unchanged.

## Non-goals and preservation

No encounter rebalance, actor migration, new panels, dependencies in Foundry, campaign deployment, test suite repairs, broad runtime refactors, automatic Git extensions, scheduled workflows or lifecycle hooks. Existing test files remain untouched. Governance adoption itself changes no game mechanics; VIS-001 is the only requested runtime delta.

## Acceptance and evidence boundary

Installation/materialized instructions and actual source edits can be inspected as development artifacts. Package success is not gameplay acceptance. Skill discovery in a new VS Code session has not been interactively confirmed. Reverse spin, unchanged audio, and performance in real Foundry remain **NOT RUN — no real Foundry instance**. No synthetic substitutes.

## Delivery

Publish 0.10.22 under existing authority. Reload all Foundry clients for reversed spin; no sheet reimport. Reload the coding agent session for newly discovered Spec Kit skills if necessary.
