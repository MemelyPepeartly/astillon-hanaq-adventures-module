---
description: "Plan a module change with scoped hooks, state ownership, cleanup and packaging-only delivery."
---

# Plan

Read AGENTS.md, .specify/memory/constitution.md, docs/project-state.md, and docs/development-workflow.md first. Their module-specific rules govern this command. No unit/mock/JSDOM/content tests, synthetic fixtures, coverage gates, or simulated benchmarks; no delegation of that work. Only authorized real Foundry module checks, otherwise record NOT RUN. Build only for authorized release packaging. Do not execute optional extension hooks or workflows automatically.

Use the feature explicitly selected by the user/current task; never infer the newest folder. Preserve existing approved documents. Read only relevant source/contracts. Current user directions govern scope and exceptions.

## User input

$ARGUMENTS

Require the selected spec. Set invocation-local SPECIFY_FEATURE_DIRECTORY to that exact existing directory and SPECIFY_FEATURE_NO_PERSIST=1. Use .specify/scripts/powershell/setup-plan.ps1 -Json only to initialize a missing plan; it must preserve an existing plan. Read the override plan-template.md, not stock examples.

Identify actual file owners and affected macro/API/pack/UI consumers. Read only relevant official Foundry APIs and PF2e/native examples where needed; record versions/commits and unresolved compatibility. Describe hook identity/field filters, bounded traversal/queues/cache/media, idle behavior, state writer, await invalidation, teardown/recovery, manual versus managed content, and upgrade implications. Include a short manual acceptance plan and explicit NOT RUN boundary if no instance exists. No automated-test phase, benchmarks, new infrastructure without need, or automatic branch switching. Do not run compile/build during planning.
