# Project rules

## Testing — explicit user policy

- Do not create, extend, update, run, or delegate unit tests, mock/JSDOM suites, synthetic browser fixtures, or content/statblock assertion suites unless the user explicitly asks for them.
- Only test actual module functionality inside a real Foundry VTT instance. If no instance is available, state that functionality was not tested; do not substitute simulations, test counts, or repeated static audits.
- Build/compile only as needed to package an authorized release. Compilation is not functional testing. Release CI must package the module without running the legacy automated suites.
- Keep verification proportionate and brief. Read the relevant API/source while implementing; do not launch broad review/test work to expand the task.

## GM control

- The GM decides what actors receive manually dragged effects and auras. Do not veto these drops, silently disable them, or delete them because the actor is not Blaster/a linked thrall, lacks an owner marker, is out of combat, or has another effect.
- Keep managed summon cleanup distinct from manually placed effects. Rules such as frequency, action cost, and movement restrictions belong on the sheet, not in hard macro permission gates, unless explicitly requested.
- User-requested changes should be versioned, merged, pushed, and published once implemented. Do not repeatedly ask for push permission.
