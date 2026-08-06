# Creating a theme plugin

Hashtag Notepad supports a small, deliberately safe plugin system: **theme plugins**. A theme plugin is just a folder with two files — no JavaScript execution, no arbitrary code, just CSS custom properties. That's what makes it safe to load from a random folder someone downloaded off GitHub.

## Folder layout

```
plugins/
  my-theme/
    plugin.json
    theme.css
```

**`plugin.json`**
```json
{
  "id": "my-theme",
  "name": "My Theme",
  "type": "theme",
  "css": "theme.css",
  "author": "your name (optional)"
}
```

**`theme.css`** — define every variable below inside a single selector, `body.theme-<id>` (id must match `plugin.json`'s `id`):

```css
body.theme-my-theme {
  --bg: #202020; --bg2: #262626; --bg3: #2c2c2c; --bg4: #333333;
  --border: #3a3a3a; --border2: #484848;
  --text: #e0e0e0; --text2: #999999; --text3: #5a5a5a;
  --accent: #e07b53; --accent-bg: #3a2a20; --accent-text: #ffb08a;
  --titlebar: #161616; --statusbar-bg: #4a3226; --statusbar-text: #e0a888;
  --done-text: #666666; --check-border: #484848; --check-done-bg: #333333;
  --drag-handle: #484848;
  --section-head: #262626; --section-head-hover: #2c2c2c; --section-body: #202020;
  --arrow-bg: #2a2018; --arrow-border: #6b4a2f; --arrow-text: #d9a067;
  --md-h1: #e07b53; --md-h2: #d9a067; --md-h3: #b0c98a;
  --md-h4: #8fb0a0; --md-h5: #7a9bb0; --md-h6: #6a7a90;
  --md-code: #d98c5f; --md-quote: #b0c98a; --md-bold: #d9a067; --md-italic: #8fb0a0;
  --inline-edit-border: #e07b53; --inline-edit-bg: #161616; --fmt-bar: #161616;
}
```

You don't have to hand-pick every value from scratch — copying `plugins/nord/theme.css` or `plugins/solarized-dark/theme.css` as a starting point and adjusting the hex values is the fastest way to get something working.

## Where to put it

- **Bundled with the app**: drop your folder in the project's own `plugins/` directory before building — it ships with the app for everyone.
- **Installed by a user**: drop the folder into the app's user plugins directory instead, and it'll be picked up on next launch without rebuilding anything:
  - Windows: `%APPDATA%/HashtagNotepad/plugins/`
  - macOS: `~/Library/Application Support/HashtagNotepad/plugins/`
  - Linux: `~/.config/HashtagNotepad/plugins/`

A user-installed plugin with the same `id` as a bundled one overrides it, so you can also use this to tweak a built-in theme without touching the app itself.

## What's not supported (yet)

This is intentionally CSS-only for now — no JS panels, no custom commands, no new file-format support. If the project grows a community around it, a richer plugin API (with proper permissions/sandboxing) would be the natural next step, but that's a bigger undertaking than a first version should take on.
