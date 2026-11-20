---
description: "Write a short requirements-quality or authorized real Foundry acceptance checklist."
---

# Checklist

Read AGENTS.md, .specify/memory/constitution.md, docs/project-state.md, and docs/development-workflow.md first. Their module-specific rules govern this command. No unit/mock/JSDOM/content tests, synthetic fixtures, coverage gates, or simulated benchmarks; no delegation of that work. Only authorized real Foundry module checks, otherwise record NOT RUN. Build only for authorized release packaging. Do not execute optional extension hooks or workflows automatically.

Use the feature explicitly selected by the user/current task; never infer the newest folder. Preserve existing approved documents. Read only relevant source/contracts. Current user directions govern scope and exceptions.

## User input

$ARGUMENTS

Clarify whether this is a document-quality checklist or a real Foundry acceptance checklist. Use the checklist override. Scope to the selected change: performance/idle behavior, GM freedom, native semantics, authority/stale cleanup, world-copy preservation, release and evidence boundaries as relevant. Acceptance entries describe observable actions in a real instance, not scripts to create/run. Never generate automated tests or synthetic fixtures. Leave unobserved entries unchecked and state NOT RUN. A document-quality check does not certify module behavior; do not turn an optional checklist into a mandatory release gate without user direction.
