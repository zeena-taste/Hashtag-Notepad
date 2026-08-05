# Hashtag Notepad — Architecture & UI Reference

This document is a full reference for anyone building a theme plugin that goes beyond colors — resizing regions, reshaping components, changing layout, replacing typography, or restructuring the section blocks. It describes every meaningful piece of the UI, where it lives in the DOM, what CSS controls it, and what constraints exist that you can't change from a plugin alone.

---

## File directory

```
hashtag-notepad/
│
├── main.js              Electron main process. Manages windows, file I/O,
│                        IPC handlers, preferences, and plugin discovery.
│                        Does not touch the UI directly.
│
├── renderer.html        The single HTML page. All UI structure is here —
│                        every div, button, and layer. Nothing is injected
│                        by JS at page load except dynamic content (tabs,
│                        section blocks, sidebar links).
│
├── renderer.js          All UI logic. Tab management, file ops, the
│                        organised/raw view renderers, find & replace,
│                        drag-reorder, inline editing, export, zen mode.
│
├── styles.css           All styling. One flat file, no preprocessor.
│                        Structured in sections matching the DOM order.
│                        This is the primary file a theme plugin replaces
│                        or extends.
│
├── store.js             Tiny JSON prefs store (no npm dependency).
│                        Saves: theme id, window bounds, recent files.
│                        Lives in the OS userData folder, not the project.
│
├── plugins.js           Discovers theme plugins from plugins/ (bundled)
│                        and the user's userData/plugins/ folder.
│                        Loads plugin CSS and passes it to the renderer.
│
├── plugins/             Bundled sample themes. Each subfolder is one plugin.
│   ├── nord/
│   │   ├── plugin.json  { id, name, type: "theme", css: "theme.css" }
│   │   └── theme.css    body.theme-nord { --bg: ...; ... }
│   └── solarized-dark/
│       ├── plugin.json
│       └── theme.css
│
├── build/
│   └── icon.png         512px PNG icon used for macOS and Linux builds.
│
├── icon.ico             Windows icon (multi-resolution .ico).
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml       Runs on every push/PR — syntax check + unpacked build.
│   │   └── release.yml  Runs on version tags — builds Win/Mac/Linux installers.
│   ├── ISSUE_TEMPLATE/  Bug report and feature request forms.
│   └── PULL_REQUEST_TEMPLATE.md
│
├── package.json         Electron + electron-builder config. Build scripts,
│                        file lists for each platform target.
├── PLUGINS.md           Guide for writing theme plugins.
├── CONTRIBUTING.md      Dev setup, project layout, PR expectations.
├── CHANGELOG.md         Version history.
├── LICENSE              MIT.
└── README.md            User-facing docs.
```

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

### Needs JS edits (`renderer.js`)

- Changing the section indentation step (currently `18px` per level, hardcoded as `style.marginLeft`)
- Changing how many columns the sidebar uses
- Adding new view modes

---

## Zen mode

Zen mode adds `body.zen` class. The CSS hides: `#tabbar`, `#toolbar`, `#sidebar`, `#statusbar`, `#fmt-toolbar`, `#find-bar`. The titlebar stays visible (so the window is still draggable and closable). A "Press Esc to exit" hint fades in and then out over 4 seconds.

If your theme wants to style zen mode differently (e.g. show a minimal ribbon instead of hiding the toolbar entirely), target `body.zen #toolbar` and override `display: none !important` with a higher-specificity rule.

---

## Fonts in use

| Surface | Font |
|---|---|
| UI chrome (buttons, labels, sidebar) | `'Segoe UI', system-ui, sans-serif` |
| Raw editor textarea | `'Cascadia Code', 'Consolas', monospace` |
| Section-edit textarea | Same monospace stack |
| Status bar | Same as UI chrome |

To swap fonts in a plugin, override `font-family` on `body` (UI font) and `.raw-editor, .section-edit-area` (mono font).
