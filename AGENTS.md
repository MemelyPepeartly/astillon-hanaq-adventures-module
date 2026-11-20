# Project rules

## Start here and keep context current

- Read [the constitution](.specify/memory/constitution.md), [current project state](docs/project-state.md), then only the affected [baseline contracts](specs/001-module-baseline/spec.md) and [source owners](docs/architecture.md).
- Use [the development workflow](docs/development-workflow.md) for substantial changes; small fixes need a short delta, not a full ceremony. Select the feature explicitly; never guess the newest spec or overwrite an approved plan.
- Project-local Spec Kit [overrides](.specify/templates/overrides) are canonical. Stock test-first examples are not this project's policy. Regenerate skills through the pinned local preset; do not hand-edit generated skills.
- Keep implemented, packaged, published, and live-verified states separate. Update the affected spec and current-state page without accumulating transcripts or duplicate rules.

## Performance — correctness at the table

- Unrelated token events must return before expensive work. No world-wide actor/item/region scans or inactive-scene synthetic actor construction in per-token hot paths.
- Scope and batch related events, reuse provider snapshots, bound caches/queues, yield image processing, and preserve damage/publication ordering.
- Inactive features are practically idle. Render locally once per client; no render-triggered persistent writes, feedback loops, or per-client rebroadcast storms.
- Every timer/listener/media job has lifecycle cleanup. Follow [performance contracts](docs/performance.md); do not claim measured improvement without real Foundry evidence.

## Testing — explicit user policy

- Do not create, extend, update, run, or delegate unit tests, mock/JSDOM suites, synthetic browser fixtures, or content/statblock assertion suites unless the user explicitly asks for them.
- Only test actual module functionality inside a real Foundry VTT instance. If no instance is available, state that functionality was not tested; do not substitute simulations, test counts, or repeated static audits.
- Build/compile only as needed to package an authorized release. Compilation is not functional testing. Release CI must package the module without running the legacy automated suites.
- Keep verification proportionate and brief. Read the relevant API/source while implementing; do not launch broad review/test work to expand the task.

## GM control

- The GM decides what actors receive manually dragged effects and auras. Do not veto these drops, silently disable them, or delete them because the actor is not Blaster/a linked thrall, lacks an owner marker, is out of combat, or has another effect.
- Keep managed summon cleanup distinct from manually placed effects. Rules such as frequency, action cost, and movement restrictions belong on the sheet, not in hard macro permission gates, unless explicitly requested.
- User-requested changes should be versioned, merged, pushed, and published once implemented. Do not repeatedly ask for push permission.

## Native content and safe changes

- Use verified public Foundry APIs and PF2e-native schemas/rules. Keep concise PF2e-style descriptions with correct inline checks, damage, condition/effect UUIDs, headings and outcomes.
- Preserve stable IDs, custom world content, wounds and native uses as documented. Description refresh is not a mechanics upgrade.
- Preserve unrelated dirty work and explicit delegated file ownership. Do not add unsolicited UI, mechanics, broad refactors, or review campaigns.
