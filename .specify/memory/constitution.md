# Astillon Hanaq Adventures Constitution

Version: **1.0.0** · Ratified: **2026-11-19** · Last amended: **2026-11-19**

## Purpose and authority

This is a campaign-focused Foundry VTT/PF2e module, not a general rules enforcement engine. It ships reusable compendium content, encounter tools, and theatrical presentation while keeping the GM in control and the table responsive. The owner's current explicit directions override repository defaults; record material policy changes here rather than silently weakening them.

Read [AGENTS.md](../../AGENTS.md), [current context](../../docs/project-state.md), and the relevant feature spec before changing behavior. This constitution governs project-authored templates and materialized Spec Kit skills. Stock examples, old tests, old release notes, and dependency conventions do not authorize conflicting work.

## I. Session responsiveness is a correctness requirement

- An inactive encounter feature must be practically idle. Unrelated token changes must return before actor construction, provider/region discovery, media work, or network writes.
- Filter hooks by document identity and changed fields. No world-wide actor/token/item traversal in per-token hot paths; scope work to affected scenes/participants, build indexes/provider snapshots once per pass, and reuse them across recipients.
- Avoid token.actor access on unrelated inactive scenes: it can materialize synthetic actors.
- Coalesce event bursts; bound queues/caches; yield expensive image processing. Timers, listeners, media, animation-frame jobs, and blob URLs need explicit ownership and cleanup.
- Preserve ordered gameplay events. Native damage, explicit commands, and publication claims must not be reordered by optimization. No busy-loop polling or independent per-client rebroadcasts.
- No persistent writes during render/refresh merely to recompute appearance. Compare before writing and avoid self-generated reconciliation storms.
- Global recovery/migration scans belong to bounded startup/authority recovery, not routine movement.
- Follow [performance contracts](../../docs/performance.md). Numerical design limits are not measured guarantees; no live speedup/FPS/load-time claim without real evidence.

## II. The GM controls the game

- GMs may drag effects and auras onto any actor. Do not reject, disable, or delete a manual drop because of actor role, summoner linkage, combat state, another effect, or a missing module marker.
- Separate manual documents from managed summons/generated areas. Cleanup identifies module ownership and the specific invocation; never sweep unrelated user content.
- Action costs, recharge, frequency, daily limits, and movement costs are sheet rules for GM adjudication. Do not make them hard macro invocation gates unless explicitly requested.
- Preserve security and data-integrity boundaries: GM-only shared controls, player ownership, active-GM single writer where required, and stale operation cancellation. GM freedom does not let another player control someone else's actor.
- Do not invent new panels, action debits, automatic damage/targeting, or mechanics beyond the request. Controlled conditions do not transfer document ownership.

## III. No automated testing workflow

- **Do not create, extend, update, run, or delegate unit tests, mocks, JSDOM suites, synthetic browser fixtures, content/statblock assertions, coverage gates, or benchmark simulations.** Only a later explicit user request for a particular test permits an exception. Requests to fix, validate, review, or improve quality are not such permission.
- Only test actual module functionality in a real Foundry instance within authorized scope. A shared browser alone does not authorize modifying a live campaign, deleting tokens, or disruptive profiling.
- Without a suitable instance, state **NOT RUN — no real Foundry instance**. Do not substitute simulated evidence, test counts, repeated static audits, or speculative success claims.
- Read relevant source/API while implementing and inspect the bounded change once. Build/compile only as needed to package an authorized release. Build success means **packaged**, not functionally verified.
- CI packages the module; it must not invoke legacy test suites. Existing test files are inert historical material, not a backlog or mandatory repair target. Do not delete them without a request.
- Specs contain focused real-world acceptance scenarios, not executable test mandates. Unperformed live checks remain pending; they are neither false passes nor authorization for endless verification.

## IV. Native integration and readable content

- Verify relevant public APIs against the target Foundry generation. Verify PF2e schemas, rule elements, and same-type examples before content changes; record exact versions/commits used. Historical pins do not establish current compatibility.
- Prefer native document operations, Rule Elements, Regions, FilePicker, DialogV2, audio channels, and system rolls. Do not monkey-patch core/system classes or invent APIs.
- PF2e descriptions are concise: appropriate bold Frequency/Trigger/Requirements/Effect headings, separators, outcome lines, native action fields, typed clickable damage/check links, and verified stable effect/condition UUIDs. Long operating guidance belongs in actor Notes, not ability paragraphs.
- Preserve save/critical/incapacitation semantics, traits, durations, origins, spell uses, and condition values. Distinguish links, rolls, and effect application; a template does not automatically resolve damage.
- Preserve stable document IDs and module API contracts. Compendium updates do not automatically update world copies. Description refresh and mechanics upgrade remain separate and preserve custom data/wounds as documented.
- Missing optional Sequencer/JB2A/Summons Assistant must not break unrelated features. Fail clearly and locally when needed. Never redistribute licensed JB2A files or private manifest credentials.

## V. Multiplayer lifecycle and bounded failure

- Shared durable state has one authoritative writer. Rendering/audio are local per viewer; respect volume/mute/visibility and GM-owned world enablement.
- Revalidate relevant scene/token/actor identity and authority after awaits. Fence stale image/audio/sequence loads so cancelled/replaced work cannot reappear.
- Persist at-most-once claims before shared publication where applicable. Do not blindly retry ambiguous successful placement or chat publication. Preserve recovery/rollback without adding gameplay restrictions.
- Missing media/optional animations degrade gracefully. Report actionable errors without refresh-loop notification spam or disrupting unrelated play.

## VI. Small, current specifications

- Maintain one context entrypoint, architectural ownership map, and baseline contract. Retain change specs as dated decisions, not competing descriptions of current behavior.
- Substantial changes use spec -> plan -> tasks -> implementation -> delivery. Small repairs need a short delta, not a full ceremony or architecture reinvention.
- Plans name changed files/affected consumers, event scope/cost, state authority, compatibility, cleanup, manual acceptance, and delivery. Ask only materially important questions.
- Preserve approved plans/completed task history. Select feature directories explicitly; do not choose the newest folder or switch branches implicitly.
- Delegation requires explicit file ownership; no duplicated investigations or broad review/test campaigns. Stop on handoff/cancellation.
- Separate **implemented**, **packaged**, **published**, and **live verified**. Update affected context/specs; compilation never completes pending live acceptance.

## VII. Scoped delivery

- Standing authorization: version, merge, push, and publish completed requested changes without repeatedly asking. This does not authorize unrelated refactors, forced pushes, destructive cleanup, or live-campaign deployment.
- Preserve dirty work and ownership. Stage only intended changes, use ordinary commits/safe merges, retain pack identities.
- Update package/lockfile versions together; generate the manifest. Build for packaging, follow package-only CI, verify release assets/version, and state reload/reimport/upgrade needs.
- Governance releases must not quietly change encounter rules. Publication may proceed with explicit NOT RUN live acceptance; it is not runtime certification.

## Governance and amendments

Identify the user request, changed principle, and affected templates/skills/docs. Major versions change principles incompatibly; minor adds principles; patch clarifies. Regenerate skills from reviewed project-local overrides. No optional Spec Kit extensions, lifecycle hooks, scheduled workflows, or test tooling are installed automatically. Review upstream upgrades for conflicts before adopting them.

Initial adoption records the module baseline at e295d5c / 0.10.21 and the owner's performance, GM-control, no-testing, and delivery expectations. It does not retroactively certify the implementation.
