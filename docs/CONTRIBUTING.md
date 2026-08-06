# Contributing to Hashtag Notepad

Thanks for considering it — this started as a personal tool, so contributions of any size (typo fixes included) are genuinely welcome.

## Getting set up

```
git clone https://github.com/<you>/hashtag-notepad.git
cd hashtag-notepad
npm install
npm start
```

That's the whole dev loop — Electron reloads from source, no build step needed while you're working. You only run `npm run build:win` / `build:mac` / `build:linux` when you want an actual installer.

## Project layout

| File | What it does |
|---|---|
| `main.js` | Electron main process — windows, menus, file I/O, IPC handlers |
| `renderer.js` | Everything in the UI — tabs, editor, sidebar, find/replace, export |
| `renderer.html` / `styles.css` | Markup and styling |
| `store.js` | Tiny JSON preferences file (theme, window bounds, recent files) |
| `plugins.js` | Discovers theme plugins from `plugins/` and the user's plugin folder |
| `plugins/*` | Bundled sample theme plugins |

There's no build/transpile step — it's plain CommonJS `require()`, on purpose, to keep the project approachable.

## Before opening a PR

- Run the app (`npm start`) and actually click through the change — there's no automated test suite yet (see "Good first issues" below if you want to help with that).
- Run a quick syntax check on anything you touched: `node --check main.js` (swap the filename).
- Keep PRs focused — one feature or one fix per PR is much easier to review than a bundle of unrelated changes.
- If you're changing behavior, update `README.md` to match.

## Commit messages / branches

Nothing strict — `feat: add X`, `fix: Y`, `docs: Z` style prefixes are appreciated but not required. Branch names like `fix/crlf-handling` or `feat/spellcheck-toggle` are enough.

## Adding a color theme (no code required)

If you just want to contribute a theme, you don't need to touch any JavaScript at all — see [`PLUGINS.md`](./PLUGINS.md). Copy `plugins/nord/` as a starting point, rename it, adjust the colors, open a PR adding your folder under `plugins/`.

## Reporting bugs

Open an issue with: what you did, what you expected, what happened instead, your OS, and (if relevant) the `.txt`/`.md` file content that triggers it. Screenshots help a lot for anything visual.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). Be kind.
