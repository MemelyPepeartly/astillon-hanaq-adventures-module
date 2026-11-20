# Architecture and ownership

[module.ts](../src/scripts/module.ts) loads the six factories in [features/index.ts](../src/scripts/features/index.ts), exposes `game.astillonHanaqAdventures` and the module API, and invokes feature init/ready. Client-side TypeScript compiles to ES modules; there is no custom server service.

| Owner | Responsibilities / boundaries |
| --- | --- |
| [Sarsaparilla](../src/scripts/features/sarsaparilla-surprise.ts) | Player macro, dialogs/chat interactivity, socket-driven presentation. Treat socket input as untrusted. |
| [Menacing](../src/scripts/features/menacing.ts) | Cosmetic token flag/status control and shared atlas animation; not a PF2e condition/custom ActiveEffect. |
| [Your Turn](../src/scripts/features/your-turn.ts) | GM world settings; actor art/color/placement/sound/outline preferences; local overlay/audio, editor ownership, bounded media preparation. [Outline painter](../src/scripts/features/your-turn-outline.ts) owns bounded normalized strokes and outline-only canvas compositing. |
| [Blaster facade](../src/scripts/features/blaster.ts) | API composition and immediate blast commands. [Model](../src/scripts/features/blaster-model.ts) owns modes/tiers; [placement](../src/scripts/features/blaster-placement.ts) owns map interaction. |
| [Grand Finale](../src/scripts/features/blaster-finale.ts) | Durable path warning, timing/recovery/publication, native scene Regions. |
| [Blastback](../src/scripts/features/blaster-blastback.ts) | Native damage bank, charge editor, release/recovery; [visuals](../src/scripts/features/blaster-blastback-visuals.ts) owns local charge/explosion effects. |
| [Recoil](../src/scripts/features/blaster-recoil.ts) | Arm one next move/backward beam; unarmed movement is inert. |
| [Resolution](../src/scripts/features/blaster-resolution.ts) | Rider application, counterblast publication, known-content upgrades; preserve custom content/native uses and at-most-once publication. |
| [Summons](../src/scripts/features/blaster-summons.ts) | Summons Assistant integration, nonce-linked recovery, managed lifetime, modes and scheduling. |
| [Aura totals](../src/scripts/features/blaster-aura-totals.ts) | Native containment, aggregate modifiers, scoped snapshots; manual/managed distinction. [Pool](../src/scripts/features/blaster-mob-pool.ts) owns cumulative/spent temp HP. |
| [Beam Clash](../src/scripts/features/beam-clash.ts) | Shared contest, GM/owner controls, camera/local beams; [model](../src/scripts/features/beam-clash-model.ts) owns progression. No unsolicited gamble/counterblast panel. |
| [Dark Triad](../src/scripts/features/dark-triad-cutscene.ts) | GM world-setting start/end, local blackout/art/lightning/filtered thunder and escape cleanup. |

## Content and packaging

[src/packs](../src/packs) contains editable JSON for Blaster actors/effects/macros, race items/macros, player macros, ancestry feats, and retired characters. Preserve `_id`, collection names, and PF2e schemas. [Manifest template](../src/static/module.json) owns declared packs/styles/languages/dependencies; [package.json](../package.json) owns version.

[build.mjs](../build/build.mjs) compiles TypeScript, copies assets/styles/languages, builds animation assets, sanitizes JSON and emits newline-delimited `.db` packs and manifest into ignored `dist/`. Do not edit generated output as source. Governance/tooling is development-only and not copied into the installable module.

Macros should delegate to stable module APIs when possible. Imported runtime-backed macros inherit code updates; embedded standalone macro code and existing world actors can require explicit reimport or upgrade. Description refresh is not mechanics upgrade.

## State and authority

- Use module flags and UUIDs, not display names. Managed summons include owner actor/token, invocation nonce, and lifetime.
- Scene plans, world cinematic settings, token markers, actor ledgers, and user roll intents have different owners. Avoid a global updater spanning them all.
- Active GM writes shared state; each viewer renders/hears once. Native audio channels preserve client volume/mute. Do not have every client rebroadcast effects.
- Editor drafts/previews are local and owner-scoped; Cancel does not persist actor flags.
- Compendium references, user `common/` paths, and optional module asset keys are distinct. Never include Patreon manifests/credentials or private asset downloads.

For a helper change, trace actual API/macro callers, affected flags/pack descriptions, and UI/lifecycle consumers. Update those contracts together; do not expand into historical-data audits or old suites. See [workflow](development-workflow.md) and [performance](performance.md).
