---
name: speckit-converge
description: Assess remaining in-scope module work once, separating implementation
  gaps from live evidence.
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: override:speckit.converge
---

# Speckit Converge Skill

# Converge

Read AGENTS.md, .specify/memory/constitution.md, docs/project-state.md, and docs/development-workflow.md first. Their module-specific rules govern this command. No unit/mock/JSDOM/content tests, synthetic fixtures, coverage gates, or simulated benchmarks; no delegation of that work. Only authorized real Foundry module checks, otherwise record NOT RUN. Build only for authorized release packaging. Do not execute optional extension hooks or workflows automatically.

Use the feature explicitly selected by the user/current task; never infer the newest folder. Preserve existing approved documents. Read only relevant source/contracts. Current user directions govern scope and exceptions.

## User input

$ARGUMENTS

Read the selected spec/plan/tasks and affected source. Make one bounded comparison for concrete unmet requested behavior or constitutional conflicts. If implementation edits are authorized, append only actionable missing tasks with affected paths; otherwise report them read-only. Preserve completed task history. Do not add tests, broad audits, speculative features, repeated validation passes, or work to 'prove' an unavailable Foundry scenario. Report IMPLEMENTED/PACKAGED/PUBLISHED separately from LIVE VERIFIED or NOT RUN. Do not repeatedly invoke implementation/convergence automatically. Stop once code scope is delivered and remaining external acceptance is honestly recorded.
