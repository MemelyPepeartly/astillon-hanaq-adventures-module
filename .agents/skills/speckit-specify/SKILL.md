---
name: speckit-specify
description: Specify a bounded module change using current contracts and real Foundry
  acceptance scenarios.
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: override:speckit.specify
---

# Speckit Specify Skill

# Specify

Read AGENTS.md, .specify/memory/constitution.md, docs/project-state.md, and docs/development-workflow.md first. Their module-specific rules govern this command. No unit/mock/JSDOM/content tests, synthetic fixtures, coverage gates, or simulated benchmarks; no delegation of that work. Only authorized real Foundry module checks, otherwise record NOT RUN. Build only for authorized release packaging. Do not execute optional extension hooks or workflows automatically.

Use the feature explicitly selected by the user/current task; never infer the newest folder. Preserve existing approved documents. Read only relevant source/contracts. Current user directions govern scope and exceptions.

## User input

$ARGUMENTS

For a substantial new change, create the next numbered specs/NNN-short-name folder using .specify/scripts/powershell/create-new-feature.ps1 with -Json and a short description; set SPECIFY_FEATURE_NO_PERSIST=1 for isolated/delegated work. This creates documents, not Git branches. Do not overwrite an existing feature or treat the baseline as a new implementation task. For a small repair, amend the relevant change spec instead.

Use .specify/templates/overrides/spec-template.md. Record desired outcome, affected users, stable requirement IDs, preservation/non-goals, event/performance constraints, security versus GM-adjudication, world-copy compatibility, and a few focused manual Foundry scenarios. Separate shipped facts, proposed changes and unverified assumptions. Link source owners rather than copying whole mechanics tables. Ask only material clarifications. No test-generation or test-count success criteria. Record spec status honestly and stop after the requested specification work.
