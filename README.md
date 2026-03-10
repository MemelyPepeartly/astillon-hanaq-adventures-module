![](https://img.shields.io/badge/Foundry-v13-informational)

# Astillon Hanaq Adventures

Foundry VTT module content for Pathfinder 2e, including Astillon/Hanaq compendia and module-loaded utilities.

## Development

`npm run build` builds the module into `dist/`.

`npm run test:local` builds and copies the module into `%LOCALAPPDATA%\\FoundryVTT\\Data\\modules\\astillon-hanaq-adventures-module`.

## Sarsaparilla Surprise

The Sarsaparilla feature now lives in module runtime code, so its chat interactivity and socket-driven animations load for every connected client while the module is active.

Create a hotbar macro with:

```js
game.astillonHanaqAdventures?.sarsaparilla.run();
```

## License

MIT License. Do what you will. PRs welcome.
