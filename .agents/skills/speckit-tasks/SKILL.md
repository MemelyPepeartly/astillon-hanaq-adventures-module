---
name: speckit-tasks
description: Create scoped module implementation tasks without automated-test phases.
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: override:speckit.tasks
---

# Speckit Tasks Skill

# Tasks

Read AGENTS.md, .specify/memory/constitution.md, docs/project-state.md, and docs/development-workflow.md first. Their module-specific rules govern this command. No unit/mock/JSDOM/content tests, synthetic fixtures, coverage gates, or simulated benchmarks; no delegation of that work. Only authorized real Foundry module checks, otherwise record NOT RUN. Build only for authorized release packaging. Do not execute optional extension hooks or workflows automatically.

Use the feature explicitly selected by the user/current task; never infer the newest folder. Preserve existing approved documents. Read only relevant source/contracts. Current user directions govern scope and exceptions.

## User input

$ARGUMENTS

Require selected spec.md and plan.md. Use .specify/templates/overrides/tasks-template.md. Preserve completed tasks and approved scope; amend rather than regenerate away history. Each task has an ID, requirement/story reference, actual file path, dependency, and completion criterion. Mark parallel work only for disjoint file ownership.

Cover implementation, affected docs, release packaging/publication, and only relevant authorized real Foundry checks. Keep manual acceptance pending separately; absent Foundry does not create simulation tasks. Do not add unit/mock/content tests, coverage/TDD, generalized audits, speculative refactors, or unrelated dependency upgrades. Distinguish implementation complete from published/live verified. Do not execute the tasks in this command unless the user explicitly requested implementation too.
