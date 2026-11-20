# Plan: Spec Kit adoption

Spec: [spec.md](spec.md) · Status: Implemented, pending final delivery.

## Ownership and approach

- Initialize official Specify CLI 1.4.3 locally; keep venv/caches ignored. Use upstream PowerShell helpers and Codex skill delivery, not an imitation scaffold.
- Author `.specify/memory/constitution.md`, project-local overrides and their local registration preset. Materialize the nine skills through the CLI so defaults do not conflict with policy.
- Keep `AGENTS.md` concise; add `docs/project-state.md`, `architecture.md`, `performance.md`, `development-workflow.md`, the baseline spec and a clear index. Canonical instructions are linked, not copied into every skill.
- Correct `.github/workflows/build.yml` to package-only, matching the release workflow. Keep legacy suites inert.
- Reverse the rotation sign only in `src/scripts/features/dark-triad-cutscene.ts`; preserve all timing/media/lifecycle behavior.

## Constitution check

No automated tests or fixtures. No new runtime hooks, caches, world scans, actor/content rewrites or GM restrictions. Tooling is excluded by the existing build's explicit copy list. Use existing stable IDs and native Sequencer animation call; only its numeric direction changes. No new public API needed.

## Dependencies and preservation

Official [existing-project adoption](https://github.github.io/spec-kit/how-to/existing-projects.html), [Codex integration](https://github.github.io/spec-kit/integrations/codex.html), and [preset resolution](https://github.github.io/spec-kit/presets/api.html) describe initialization/overrides. Runtime compatibility remains the existing Foundry 14.370 encounter target; no new support claim. Preserve authored plans and explicit invocation-local feature selection.

## Delivery/evidence

Inspect scoped instruction/source changes once. Build only to package the authorized 0.10.22 release, update package/lockfile and current context, commit/merge/push and confirm manifest/assets. Do not run automated validation. Real Foundry checks and agent-UI discovery remain separately NOT RUN.
