# Spec Kit installation and customization

Installed from official PyPI `specify-cli==1.4.3`, matching upstream [v1.4.3](https://github.com/github/spec-kit/releases/tag/v1.4.3). Initialization used `--integration codex --script ps --ignore-agent-tools`; bundled scripts/templates are pinned to that CLI version. The ignored local virtual environment is a development tool, never a shipped dependency.

Upstream scripts/templates retain the [GitHub MIT license](UPSTREAM-LICENSE.txt). Project policy overrides are maintained separately from the bundled core.

## What is maintained

- [Constitution](memory/constitution.md): authored project policy; never replace with a generic scaffold.
- [Overrides](templates/overrides): canonical command/template customizations. They remove automated-testing/TDD/coverage requirements and apply the module's performance, native-content and GM-control rules.
- [Local preset](templates/overrides/preset.yml): registers the nine command overrides so the CLI actually materializes them as Codex skills. Installed copies under `presets/astillon-foundry/` are CLI-managed snapshots, not a second source of policy.
- [Skills](../.agents/skills): generated from those reviewed overrides. Do not edit these copies by hand.
- Core templates remain upstream reference material; use the overrides. The bundled workflow is available but is not scheduled or automatically executed. No optional Git/test extensions or agent lifecycle hooks were installed.

## New checkout / regenerate

The committed skills and PowerShell helpers are present after checkout. To install the pinned CLI locally (Python 3.11+):

```powershell
py -3 -m venv .specify/.venv
& .specify/.venv/Scripts/python.exe -m pip install 'specify-cli==1.4.3'
& .specify/.venv/Scripts/specify.exe version
```

The authoring checkout used Python 3.14.6. This does not add a global PATH entry or application runtime requirement. Other operating systems may use their normal Python venv executable location; the repository helper variant is PowerShell.

After editing existing command overrides, regenerate the active skills:

```powershell
& .specify/.venv/Scripts/specify.exe integration use codex
```

The committed local preset registry enables that reconciliation. On an entirely fresh initialization without the installed preset, first run `specify preset add --dev .specify/templates/overrides` through the local executable. Do not reinstall it unnecessarily or edit the installed snapshot instead of the override.

Read the generated implementation skill after regeneration to ensure it contains the project policy, not stock test-first steps. This is a bounded instruction inspection, not an automated content test. Do not run skill validators, fixtures or test suites as a substitute for Foundry functionality.

## Upgrade policy

No automatic upgrades. Review the new upstream version, compatibility and migration instructions; update the pin/preset requirement deliberately; preserve authored constitution, overrides and approved specs. Regenerate and inspect the small affected instruction diff. Do not blindly use force-overwrite, install community extensions, enable hooks or launch full workflows.

Invocation and explicit feature selection are documented in [development workflow](../docs/development-workflow.md). Agent skill discovery may need a new/reloaded session; CLI installation does not prove UI discovery or live Foundry behavior.
