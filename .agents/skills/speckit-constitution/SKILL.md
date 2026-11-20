---
name: speckit-constitution
description: Maintain the Astillon module constitution and synchronize affected project
  workflow instructions.
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: override:speckit.constitution
---

# Speckit Constitution Skill

# Constitution

Read AGENTS.md, .specify/memory/constitution.md, docs/project-state.md, and docs/development-workflow.md first. Their module-specific rules govern this command. No unit/mock/JSDOM/content tests, synthetic fixtures, coverage gates, or simulated benchmarks; no delegation of that work. Only authorized real Foundry module checks, otherwise record NOT RUN. Build only for authorized release packaging. Do not execute optional extension hooks or workflows automatically.

Use the feature explicitly selected by the user/current task; never infer the newest folder. Preserve existing approved documents. Read only relevant source/contracts. Current user directions govern scope and exceptions.

## User input

$ARGUMENTS

Update only requested principles in .specify/memory/constitution.md. Preserve performance, GM freedom, no automated testing, native PF2e readability, authority/lifecycle, and scoped delivery requirements unless explicitly changed by the user. Record version/date/reason; use major/minor/patch according to its amendment rules. Update affected template/command overrides and canonical docs, then regenerate skills through the pinned CLI. Never silently replace authored principles with stock examples. Report exactly what changed; do not start implementation or new reviews merely because the constitution changed.
