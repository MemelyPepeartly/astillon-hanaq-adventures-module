# Spec-driven development workflow

Read [AGENTS.md](../AGENTS.md), [constitution](../.specify/memory/constitution.md), [project state](project-state.md), then the relevant [baseline](../specs/001-module-baseline/spec.md) section/source owner. Code is implementation evidence; specs describe intended contracts. Flag discrepancies instead of copying stale history.

## Right-sized process

- Substantial changes: a numbered [specs](../specs) directory containing spec, plan, and tasks.
- Small repair: amend the relevant change spec or record a short delta/task. No mandatory architecture reinvention or full ceremony.
- Read-only review/questions do not authorize implementation. Implementation requests include the user's standing scoped release authority.

Core skills: `$speckit-specify`, `$speckit-clarify`, `$speckit-plan`, `$speckit-tasks`, `$speckit-implement`, `$speckit-analyze`, `$speckit-checklist`, `$speckit-constitution`, `$speckit-converge`. These are chat skills, not shell commands. Reload the agent session if new skills are not discovered.

1. **Specify:** desired behavior, preservation/non-goals, users, performance requirements, focused real Foundry acceptance scenarios.
2. **Clarify if needed:** only material uncertainty; state reasonable small assumptions.
3. **Plan:** actual owners/callers, public API evidence, flags/authority, event cost, cleanup/recovery, world-copy impact, delivery. Preserve existing approved plans.
4. **Tasks:** IDs, exact edit scope and file ownership. No automated-test phase. Keep unavailable manual acceptance separately pending.
5. **Implement:** requested changes, bounded diff inspection, affected docs, release packaging. No simulations or repeated audits.
6. **Converge when needed/requested:** one concrete in-scope discrepancy pass. Unavailable live evidence is not a code task or an endless repair loop.

## Explicit feature selection

Never pick the newest folder. The baseline is reference, not a task list to reimplement. Use the feature named by the user/current task; ask once if ambiguous.

Set selection in the same PowerShell invocation as the helper:

```powershell
$env:SPECIFY_FEATURE_DIRECTORY = (Resolve-Path 'specs/002-spec-kit-adoption').Path
$env:SPECIFY_FEATURE_NO_PERSIST = '1'
& ./.specify/scripts/powershell/check-prerequisites.ps1 -Json -PathsOnly
```

Substitute the selected directory. Do not commit absolute machine paths. An ignored local feature pointer does not override explicit selection. Core setup-plan preserves existing plans; never force replacement. Core feature creation does not require a Git branch switch.

Use [.specify/templates/overrides](../.specify/templates/overrides), not stock test-first examples. [Setup](../.specify/README.md) explains regeneration.

## Verification

No unit/mock/JSDOM/content/statblock suites, synthetic browser fixtures, coverage, or simulated benchmarks. No delegating them. Old tests are inert history.

Only authorized real Foundry module functionality checks are allowed. Record versions, dependencies, client roles, scenario and observation. Without an instance write **NOT RUN — no real Foundry instance**; do not create substitutes.

Relevant source/API reading and one focused diff inspection are implementation work, not repeated static audits. Build/compile only to package an authorized release. CLI installation/help/version operations establish tooling availability, not game correctness.

## Release

1. Preserve unrelated work; confirm branch/base. Stage intended owned files; normal commits/safe merges, no force/amend/skipping hooks.
2. Update package and lockfile versions together, current context and affected spec. Publication is a separate status from implementation.
3. `npm.cmd run build` packages the authorized release. Resolve actual packaging failures, not add tests. Legacy `test:local` builds/copies into a local Foundry installation; it is not a test and needs appropriate user scope.
4. Push feature, merge safely into main, push main; package-only CI publishes. Do not repeatedly ask for existing push authority.
5. Confirm assets/manifest version; report change, reload/reimport/upgrade needs and NOT RUN evidence.

GitHub publication does not authorize live-world changes or restart. No scheduled automation/extra services are implied.

## Healthy context

Update [project state](project-state.md) in place. Promote completed behavior into the baseline; retain change specs as dated rationale/evidence. Keep implementation tasks and live verification status separate. Avoid copied transcripts, test counts, private URLs and speculative roadmaps. Review generated instructions after upstream upgrades for constitution conflicts.
