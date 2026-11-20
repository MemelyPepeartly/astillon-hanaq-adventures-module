---
description: "Resolve material ambiguity in the selected module specification without expanding scope."
---

# Clarify

Read AGENTS.md, .specify/memory/constitution.md, docs/project-state.md, and docs/development-workflow.md first. Their module-specific rules govern this command. No unit/mock/JSDOM/content tests, synthetic fixtures, coverage gates, or simulated benchmarks; no delegation of that work. Only authorized real Foundry module checks, otherwise record NOT RUN. Build only for authorized release packaging. Do not execute optional extension hooks or workflows automatically.

Use the feature explicitly selected by the user/current task; never infer the newest folder. Preserve existing approved documents. Read only relevant source/contracts. Current user directions govern scope and exceptions.

## User input

$ARGUMENTS

Read the selected spec and affected baseline section. Ask only unanswered questions that change mechanics, user-visible behavior, permissions, compatibility or scope. Do not ask questions already settled by the constitution, such as whether to run unit tests or whether completed requested changes should be pushed. State small reasonable assumptions rather than blocking. Record answers and their affected requirement IDs in the existing spec, preserving prior decisions. Do not edit runtime or invent new features. If no material ambiguity remains, say so without generating a checklist campaign.
