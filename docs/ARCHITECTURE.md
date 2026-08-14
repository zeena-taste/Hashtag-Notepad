# Hashtag Notepad — Architecture & UI Reference

This document is a full reference for anyone building a theme plugin that goes beyond colors — resizing regions, reshaping components, changing layout, replacing typography, or restructuring the section blocks. It describes every meaningful piece of the UI, where it lives in the DOM, what CSS controls it, and what constraints exist that you can't change from a plugin alone.

---

## File directory

```
hashtag-notepad/
│
├── src/                     All application source code.
│   ├── main.js              Electron main process. Manages windows, file I/O,
│   │                        IPC handlers, preferences, plugin discovery, and
│   │                        the spellcheck context menu (suggestions,
│   │                        add-to-dictionary, edit roles). Does not touch
│   │                        the UI directly.
│   │
│   ├── renderer.html        The single HTML page. All UI structure is here —
│   │                        every div, button, and layer. Nothing is injected
│   │                        by JS at page load except dynamic content (tabs,
│   │                        section blocks, sidebar links).
│   │
│   ├── renderer.js          The conductor (~100 lines). Requires every module
│   │                        below, wires up all global listeners (keyboard
│   │                        shortcuts, drag & drop, IPC from main.js, find-bar
│   │                        inputs, toolbar buttons), and calls init(). No
│   │                        rendering or business logic lives here anymore —
│   │                        see "Renderer module split" below.
│   ├── state.js             Every `let` that used to sit at the top of
│   │                        renderer.js — tabs array, activeTabId, currentView,
│   │                        drag state, theme state, etc. One shared object.
│   ├── dom.js                Every `document.getElementById()` call.
│   ├── utils.js             escapeHtml / escapeRegex / setEditorValue — small
│   │                        stateless helpers used by several modules.
│   ├── tabs.js              Tab lifecycle: newTab, switchTab, closeTab,
│   │                        updateTabLabel, and the save-before-close prompts.
│   ├── views.js              Content parsing, the Organised view renderer,
│   │                        inline editing, drag-to-reorder, tables, the
│   │                        inline-formatting tokenizer, the format toolbar.
│   ├── ui.js                Sidebar rendering + collapsed-rail hover tooltip,
│   │                        status bar, theme switching, find & replace,
│   │                        table-builder modal, start page.
│   ├── file-ops.js          Open/save/save-as, drag & drop, the hidden
│   │                        done/order/collapsed state block.
│   ├── export.js            Organised view → standalone HTML/PDF string
│   │                        generation.
│   ├── autocorrect.js       As-you-type autocorrect for common misspellings.
│   │                        One delegated `input` listener; undo-safe
│   │                        replacement via execCommand('insertText').
│   │                        Leaf module (v3.4.0) — remember the
│   │                        package.json "files" array.
│   │
│   ├── styles.css           All styling. One flat file, no preprocessor.
│   │                        Structured in sections matching the DOM order.
│   │                        This is the primary file a theme plugin replaces
│   │                        or extends.
│   │
│   ├── store.js             Tiny JSON prefs store (no npm dependency).
│   │                        Saves: theme id, window bounds, recent files.
│   │                        Written to the OS userData folder at runtime,
│   │                        not the project directory.
│   │
│   └── plugins.js           Discovers theme plugins from plugins/ (bundled)
│                            and the user's userData/plugins/ folder.
│                            Loads plugin CSS and passes it to the renderer.
│
├── assets/                  Static files used by the build.
│   ├── icon.ico             Windows icon (multi-resolution .ico).
│   └── icon.png             512×512 PNG icon used for macOS and Linux builds.
│
├── plugins/                 Bundled sample themes. Each subfolder is one plugin.
│   ├── nord/
│   │   ├── plugin.json      { id, name, type: "theme", css: "theme.css" }
│   │   └── theme.css        body.theme-nord { --bg: ...; ... }
│   └── solarized-dark/
│       ├── plugin.json
│       └── theme.css
│
├── docs/                    All documentation except README and LICENSE.
│   ├── ARCHITECTURE.md      This file.
│   ├── PLUGINS.md           Guide for writing theme plugins.
│   ├── CONTRIBUTING.md      Dev setup, project layout, PR expectations.
│   ├── CHANGELOG.md         Version history.
│   └── CODE_OF_CONDUCT.md
│
├── .github/                 GitHub-specific config (must stay at root).
│   ├── workflows/
│   │   ├── ci.yml           Runs on every push/PR to main —
│   │   │                    syntax check + unpacked Linux build.
│   │   └── release.yml      Runs on version tags (e.g. v3.1.0) —
│   │                        builds Win/Mac/Linux installers and creates
│   │                        a GitHub Release with all three attached.
│   ├── ISSUE_TEMPLATE/      Bug report and feature request forms.
│   └── PULL_REQUEST_TEMPLATE.md
│
├── README.md                User-facing docs. Must stay at root —
│                            GitHub renders it as the repo homepage.
├── LICENSE                  MIT. Must stay at root — GitHub badge requires it.
├── .gitignore
└── package.json             Electron + electron-builder config. Build scripts,
                             file include lists, per-platform icon paths.
```

### Path references to keep in sync

Moving files between these folders requires updating three places:

| What moved | Where to update |
|---|---|
| `src/` files | `package.json` → `"files"` array |
| `assets/icon.ico` / `assets/icon.png` | `package.json` → `win.icon`, `mac.icon`, `linux.icon` |
| `assets/icon.ico` | `src/main.js` → `const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico')` |
| `docs/` files | Any cross-links inside the markdown files themselves |

---

## Renderer module split

`renderer.js` was split into 8 files under `src/` along the lines suggested
in an earlier version of this doc (state.js / dom.js / feature modules /
conductor). A few things came up during the actual split that are worth
recording:

**`utils.js` was added — it wasn't in the original plan.** `escapeHtml`,
`escapeRegex`, and `setEditorValue` were each used by three or more feature
modules. They don't belong in `state.js` (they're not state) or in any one
feature module (they're not specific to tabs, views, or ui), so they got
their own small file instead of being copied or bolted onto something that
doesn't quite fit.

**The modules call each other, a lot, and that's fine.** A tab switch
re-renders the sidebar; closing a tab can trigger a save; loading a file
touches four different modules. `tabs.js`, `views.js`, `ui.js`, and
`file-ops.js` all require each other. To make that safe in CommonJS, every
one of those four files (plus `export.js`) builds its exports by assigning
properties one at a time —

```js
module.exports.newTab = newTab
module.exports.switchTab = switchTab
```

— instead of the more common `module.exports = { newTab, switchTab }` at
the bottom of the file. The difference matters here specifically because of
the cycles: with a single reassignment, whichever module in a cycle gets
required *first* can end up holding a reference to another module's
half-built (empty) exports object, and never sees the real functions get
added to it. Incremental assignment mutates the same object throughout, so
every module ends up with a live reference no matter what order they're
required in. `state.js`, `dom.js`, and `utils.js` don't have this problem —
nothing requires them in a cycle — so they still export as one object.

**A real bug got fixed along the way.** The table-cell click handler (now
in `views.js`'s `renderTable()`) had a leftover line —
`ta._commit = () => commitSectionEdit(s.title, ta.value)` — referencing
`ta` and `s`, neither of which existed in that function's scope. It looks
like debris copy-pasted from `openSectionEdit()`. In the original single
file this would throw a `ReferenceError` the instant anyone clicked an
editable table cell, before the cell's actual edit-input listeners got
attached — so table cells were effectively unclickable. The line has been
removed; table cell editing was verified working end-to-end (see below).

**A second, more serious bug — inline edits silently landing on the wrong
line.** In `buildBody()`, every checklist item, arrow line, and plain line
gets an editable span whose commit callback closes over `i`, the shared
loop counter that walks the section's lines: `(val) => commitInlineEdit(s.title, i, ...)`.
`i` is a single `let` declared once above the `while` loop and mutated by
`i++` on every iteration — it is *not* re-bound per line the way `const`
inside a `for`/`forEach` body would be. Every editable span in a section
ends up closing over the *same* `i` variable, so by the time you actually
click a span and edit it — which happens after the whole section has
already finished rendering — `i` has already advanced to its final value
(the index just past the section's last line). The edit gets written to
that trailing index instead of the line you actually edited: your original
line is untouched, and the new text gets silently appended past the end of
the section instead. This matches exactly what was reported: edit
something in Organised view, switch to Raw, and the edit isn't there. Table
cells were *not* affected — their equivalent index (`rawLineIdx`) is a
`const` created fresh inside a `.forEach()` callback per cell, which does
get its own binding per iteration.

Fix: capture `i` into a fresh `const lineIdx = i` right before creating
each editable span's commit callback, and close over `lineIdx` instead of
`i`. Reproduced first in the jsdom harness (edit "milk" → blur → the raw
text still said "milk", with "MILK-EDITED" appended as a stray trailing
line), then confirmed fixed the same way (edit "milk" → blur → raw text
now correctly reads "MILK-EDITED" in place, table cell edits unaffected
either way). Same repro pattern is worth remembering if this class of bug
(a callback created inside a loop, closing over the loop's own counter
instead of a snapshot of it) shows up elsewhere later — it doesn't error,
so it's silent, which is worse than the table-cell one.

**`renderer.html` wasn't part of this refactor.** The old `renderer.js` ran
as a plain (non-module) script, so every top-level function it defined was
implicitly global — `renderer.html`'s `onclick="newTab()"`-style attributes,
if it uses any, worked by finding `newTab` on `window`. Splitting into
`require()`-based modules means those functions no longer land on `window`
automatically. To avoid silently breaking any such attributes,
`renderer.js` does this near the top:

```js
Object.assign(window, tabsMod, viewsMod, uiMod, fileOpsMod, exportMod)
```

This is a safety net, not the ideal end state — if you're open to touching
`renderer.html`, converting any `onclick="..."` attributes to
`addEventListener` calls in `renderer.js` (with the buttons' ids added to
`dom.js`) is the more robust long-term fix and would let this line go away.
`renderer.html` wasn't in the files provided for this refactor, so this
couldn't be checked directly — worth a quick pass to confirm nothing relies
on stray globals beyond what's re-exported here.

**How it was verified.** Since this is a large, mechanical-but-risky move
(1,400 lines → 9 files), every module was loaded in a jsdom-based test
harness standing in for `renderer.html` + a mocked `electron` module, and
exercised through: tab creation/switching/closing, typing → status bar
update, raw ↔ organised view switching, checklist toggling, collapse/expand
all, table builder insert, table cell click-to-edit (the fixed bug above),
find & replace, theme switching, and HTML export. All passed. That harness
isn't part of the app and wasn't included in the delivered files, but it's
worth keeping around (or asking for) if more refactoring happens here later.

---

## How the UI is structured

The full window is a vertical flex column (`body`). From top to bottom:

```
body (flex column, height: 100vh, overflow: hidden)
│
├── #titlebar          Custom window chrome (drag region + min/max/close)
├── #tabbar            Tab row (one tab per open file)
├── #toolbar           Main action bar
├── #find-bar          Find & Replace (hidden by default)
├── #fmt-toolbar       Format buttons (hidden unless in Organised view)
│
├── #layout            Horizontal flex row, flex: 1 (fills remaining height)
│   ├── #sidebar       Section nav list (collapsible, fixed width)
│   └── #editor-area   Main content area (position: relative, flex: 1)
│       ├── #editor-textareas   Raw textarea(s) — one per tab, absolute inset
│       ├── #organised-view     Organised view — absolute inset, hidden when raw
│       ├── #start-page         Empty-tab welcome screen, absolute, z-index 1
│       └── #drop-overlay       Drag-and-drop target, absolute, z-index 10
│
├── #zen-hint          "Press Esc to exit" toast (fixed position, hidden)
│
└── #statusbar         Bottom bar (sections · lines · words · chars · filename)

    (outside #layout, rendered as position:fixed overlays)
    #table-builder     Table insert modal
    #save-dialog       Unsaved changes confirmation modal
```

---

## Layer system inside `#editor-area`

`#editor-area` is `position: relative; overflow: hidden`. Everything inside it is `position: absolute; inset: 0` — they all occupy the exact same rectangle. Only one is visible at a time:

| Layer | Visible when |
|---|---|
| `.raw-editor` (one per tab) | Current tab is active + Raw view |
| `#organised-view` | Organised view is active |
| `#start-page` | Active tab is blank/untitled/unmodified |
| `#drop-overlay` | File is being dragged over the window |

Visibility is controlled by adding/removing the `.hidden` class (`display: none !important`). The `z-index` stacking is: `#drop-overlay` (10) > `#start-page` (1) > everything else (auto).

**Plugin implication:** if you want to change the editor's dimensions (e.g. add a gutter, a ruler, or a bottom padding zone), you need to add that space outside `#editor-area`, not inside it — everything inside fills the full inset.

---

## CSS variable reference

All colors, a few spacing values, and the sidebar width are expressed as CSS custom properties on `:root` (dark theme) and overridden on `body.theme-light`. A plugin theme sets these on `body.theme-<id>`.

### Background layers

| Variable | Used on |
|---|---|
| `--bg` | Main editor background, raw textarea, organised view background |
| `--bg2` | Toolbar, sidebar, find bar |
| `--bg3` | Hover states, table header cells, code blocks, view-switcher, dropdowns |
| `--bg4` | Active hover states, form inputs, deep nesting backgrounds |

The four background values form a light-to-dark (or dark-to-light) scale. `--bg` is the "paper" and `--bg4` is the most contrasted surface.

### Borders

| Variable | Used on |
|---|---|
| `--border` | All structural dividers (between toolbar and editor, sidebar, section blocks) |
| `--border2` | Form inputs, table cells, stronger separators |

### Text

| Variable | Used on |
|---|---|
| `--text` | Primary content — editor text, section body, active tab |
| `--text2` | Secondary — toolbar button labels, inactive tab, sidebar links |
| `--text3` | Muted — separators, empty-state hints, timestamps |

### Accent

| Variable | Used on |
|---|---|
| `--accent` | Active tab indicator, focus rings, inline-edit underline, scrollbar hover, drag-over highlight, chevron color |
| `--accent-bg` | Active tab background, view-switcher active pill, save button background |
| `--accent-text` | Text on top of `--accent-bg` |

### Chrome

| Variable | Used on |
|---|---|
| `--titlebar` | Titlebar and tab bar background |
| `--statusbar-bg` | Status bar background |
| `--statusbar-text` | Status bar text |

### Content-specific

| Variable | Used on |
|---|---|
| `--section-head` | Section block header background |
| `--section-head-hover` | Section block header on hover |
| `--section-body` | Section block content area background |
| `--drag-handle` | The `⠿` drag icon color |
| `--done-text` | Strikethrough color for checked-off items |
| `--check-border` | Checkbox border |
| `--check-done-bg` | Checkbox background when checked |
| `--arrow-bg` | `=> / ->` sub-note line background |
| `--arrow-border` | Sub-note left border |
| `--arrow-text` | Sub-note text color |
| `--inline-edit-border` | Underline color when a line-item span is being edited |
| `--inline-edit-bg` | Background of the section-edit textarea |
| `--fmt-bar` | Format toolbar background (usually matches `--bg2` or `--titlebar`) |

### Markdown heading colors

`--md-h1` through `--md-h6` — used both in the Organised view rendered headings and as colored labels in the sidebar section list.

### Inline formatting colors

| Variable | Used on |
|---|---|
| `--md-bold` | `**bold**` text |
| `--md-italic` | `*italic*` text |
| `--md-code` | `` `inline code` `` text |
| `--md-quote` | `> blockquote` text and left border |

### Layout

| Variable | Used on |
|---|---|
| `--sidebar-w` | Sidebar width (default `180px`). Change this to resize the sidebar. |

---

## Key CSS classes and IDs

### Chrome / navigation

| Selector | Description |
|---|---|
| `#titlebar` | Full drag region. `-webkit-app-region: drag` on it, `no-drag` on the buttons. |
| `#titlebar-drag` | Left side — logo icon + app name + filename + modified dot. |
| `#titlebar-controls` | Right side — minimize / maximize / close buttons. |
| `#tabbar` | Tab row. Wraps to a new line when tabs overflow (no horizontal scroll). |
| `.tab` | Individual tab. `flex: 1` so they share width equally. Max-width 200px. |
| `.tab.active` | Active tab — accent top border via `::after`. |
| `.tab-dot` | The `●` unsaved indicator inside a tab. |
| `#toolbar` | Main toolbar. Wraps (`flex-wrap: wrap`) on narrow windows. |
| `#toolbar-left` | File operation buttons and collapse/expand. |
| `#view-switcher` | Raw / Organised pill. |
| `#toolbar-right` | Find, Export, Zen, Theme buttons. |
| `#statusbar` | Bottom bar. Fixed height 24px. |

### Editor chrome

| Selector | Description |
|---|---|
| `#sidebar` | Left nav panel. Width controlled by `--sidebar-w`. Collapsing sets `width: 32px`. |
| `#sidebar.collapsed` | Collapsed state — only the toggle button is visible. |
| `#section-list` | Scrollable list of `.section-link` items. |
| `.section-link` | One nav entry per `#section` in the file. `border-left` highlight on active. |
| `#find-bar` | Hidden by default. Shown on Ctrl+F. Contains two inputs + nav buttons. |
| `#fmt-toolbar` | Format buttons bar. Hidden by default, shown in Organised view. |

### Organised view — section blocks

Each section renders as:

```
.section-block                    (border, radius, overflow:hidden)
  .section-head                   (flex row, background: --section-head)
    .section-head-left            (drag handle + chevron — collapse/expand on click)
      .drag-handle                (⠿ icon, cursor:grab)
      .chevron                    (▶ rotates to 90° when expanded, class .open)
    .section-head-title-zone      (flex:1 — clicking opens section edit textarea)
      .sec-title                  (the heading text, color from --md-h1/2/3...)
    .section-head-right           (tag + optional badge — collapse/expand on click)
      .sec-tag                    (## or ### label, muted)
  .section-body                   (content area, background: --section-body)
  .section-body.hidden            (collapsed state — display:none)
```

The three-zone header layout is intentional and load-bearing — it separates the collapse click target from the edit click target. Don't merge them or the click routing breaks.

### Section body content types

Inside `.section-body`, the renderer creates these depending on the line type:

| Class(es) | Created for |
|---|---|
| `.line-item` | Every content line |
| `.line-item.done` | Checked-off bullet (`- item` that's been ticked) |
| `.line-item.arrow-line` | `=> note` or `-> note` lines |
| `.check` | The checkbox span inside a bullet item |
| `.bullet-dot` | The `–` prefix for bullet items |
| `.line-text` | The editable span. No `contenteditable` attr in display mode; `contenteditable="true"` set on click. |
| `.empty-section` | Shown when a section has no content lines |
| `.empty-section-parent` | Variant shown when section is a structural parent (has child headings) |

### Markdown-only content types

These only appear inside `.section-body` when the file is `.md`:

| Class | Created for |
|---|---|
| `.md-h1` – `.md-h6` | `#` through `######` headings inside a section body |
| `.md-blockquote` | `> quote` lines |
| `.md-code-block` | Fenced code blocks (` ``` `) |
| `.md-hr` | `---` or `***` horizontal rule |
| `.md-plain` | Plain paragraph text |
| `.md-table` | Pipe-separated table |

### Inline formatting spans

Inside `.line-text` and markdown elements:

| Class | Created for |
|---|---|
| `.fmt-bold` | `**bold**` |
| `.fmt-italic` | `*italic*` |
| `.fmt-underline` | `__underline__` |
| `.md-inline-code` | `` `code` `` |

### Modals

| Selector | Description |
|---|---|
| `#table-builder` | Full-screen overlay modal for inserting tables. `position:fixed; z-index:100`. |
| `#table-builder-box` | The actual modal card. Width 320px. |
| `#save-dialog` | Same structure — overlay + card. Width 300px. |
| `.dropdown-menu` | Theme picker and export menu. `position:fixed; z-index:200`. |

### State classes added by JS

| Class | Added to | Meaning |
|---|---|---|
| `.hidden` | Many elements | `display:none !important` |
| `.active` | `.tab`, `.view-btn` | Currently selected |
| `.open` | `.chevron` | Section is expanded (rotated 90°) |
| `.dragging` | `.section-block` | Being dragged (opacity 0.35) |
| `.dragging-child` | `.section-block` | Child of dragged block (opacity 0.55) |
| `.drag-over` | `.section-block` | Valid drop target (accent border) |
| `.has-children` | `.section-block` | Heading immediately followed by deeper headings |
| `.done` | `.line-item` | Checkbox is ticked |
| `.collapsed` | `#sidebar` | Sidebar in narrow mode |
| `.zen` | `body` | Zen / focus mode active |
| `theme-dark` / `theme-light` / `theme-<id>` | `body` | Current theme |

---

## How plugin themes are loaded

1. `main.js` calls `plugins.js → discoverThemePlugins()` on launch.
2. `discoverThemePlugins` reads `plugins/` (bundled) and `userData/plugins/` (user-installed), returns an array of `{ id, name, css }` objects.
3. The array is passed to the renderer via IPC (`get-theme-plugins`).
4. `renderer.js` injects all plugin CSS strings into a single `<style id="plugin-theme-styles">` tag in `<head>`.
5. When a theme is selected, `applyTheme(id)` strips all `theme-*` classes from `body` and adds `theme-<id>`. Because the plugin CSS is already in the page, the variables take effect immediately.

**What this means for a layout plugin:** your plugin CSS is injected into `<head>` *after* `styles.css` is linked, so it has natural cascade priority. You can override any rule in `styles.css` without `!important` as long as your selectors have equal or higher specificity. The only things you can't change from plugin CSS alone are the HTML structure itself (the DOM), and anything hard-coded in `renderer.js` (e.g. the inline `style.marginLeft` used for section indentation).

---

## What you can and can't change from a plugin

### Can change (CSS only)

- All dimensions: titlebar height, toolbar height, sidebar width (via `--sidebar-w`), statusbar height, section head padding, tab sizes, font sizes everywhere
- All colors via the variable system — or by overriding rules directly
- Border radii, shadows, and spacing on any component
- Typography — swap fonts by overriding `font-family` on `body`, `.raw-editor`, `.section-edit-area` etc.
- Scrollbar appearance (`::-webkit-scrollbar` rules)
- The zen mode max-width (`body.zen #organised-view`)
- Show/hide the format toolbar hint text (`.fmt-hint`)
- The empty-section placeholder style

### Needs HTML edits (can't do from plugin CSS)

- Reordering the titlebar / tabbar / toolbar (e.g. moving toolbar above tabs)
- Adding new buttons or toolbar zones
- Changing the titlebar control icons (SVGs are inline in `renderer.html`)
- Adding a footer area, a ruler, or a gutter alongside the editor

### Needs JS edits (`src/views.js`)

- Changing the section indentation step (currently `18px` per level, hardcoded as `style.marginLeft` in `renderOrganised()`)
- Changing how many columns the sidebar uses
- Adding new view modes (`switchView()`)

---

## Zen mode

Zen mode adds `body.zen` class. The CSS hides: `#tabbar`, `#toolbar`, `#sidebar`, `#statusbar`, `#fmt-toolbar`, `#find-bar`. The titlebar stays visible (so the window is still draggable and closable). A "Press Esc to exit" hint fades in and then out over 4 seconds.

If your theme wants to style zen mode differently (e.g. show a minimal ribbon instead of hiding the toolbar entirely), target `body.zen #toolbar` and override `display: none !important` with a higher-specificity rule.

---

## Spellcheck, autocorrect & sidebar tooltip
Chromium's built-in spellchecker draws the squiggles in the raw textarea
(`spellcheck: true` in `webPreferences`). Electron ships no context menu, so
`main.js` builds one per window from the `context-menu` event:
`params.dictionarySuggestions` become click-to-apply items
(`webContents.replaceMisspelling`), plus "Add to dictionary"
(`session.addWordToSpellCheckerDictionary`) and the standard edit roles.
The handler must live inside `createWindow()` — `win` is not in scope at
module top level.

As-you-type autocorrect lives in `autocorrect.js`: one delegated `input`
listener (attached to `document` in `renderer.js`) watches for trigger
characters (space/punctuation), matches the preceding word against a small
typo map, and replaces it via `setSelectionRange` +
`execCommand('insertText')` — chosen deliberately because it keeps the
native undo stack intact and fires a real `input` event, so tab state, the
Organised view, and the status bar all stay in sync.

The collapsed-rail tooltip is a single `position: fixed` div created by
`ui.js` and appended to `document.body` — it must live outside `#sidebar`
because the sidebar's `overflow: hidden` would clip any tooltip rendered
inside it. Shown on `mouseenter` only while `#sidebar.collapsed`, follows
the cursor on `mousemove`. The native `title` attribute is intentionally
NOT set on `.section-link` (it would double up with the custom tooltip).

## Fonts in use

| Surface | Font |
|---|---|
| UI chrome (buttons, labels, sidebar) | `'Segoe UI', system-ui, sans-serif` |
| Raw editor textarea | `'Cascadia Code', 'Consolas', monospace` |
| Section-edit textarea | Same monospace stack |
| Status bar | Same as UI chrome |

To swap fonts in a plugin, override `font-family` on `body` (UI font) and `.raw-editor, .section-edit-area` (mono font).
