# Hashtag Notepad v3

A lightweight notepad with collapsible `#hashtag` sections. Works with `.txt` and `.md` files, on Windows, macOS, and Linux.

## Build it yourself

**Prerequisites:** Node.js (https://nodejs.org — LTS version)

```
npm install
npm run build:win     # Windows installer + portable .exe  → dist/
npm run build:mac      # macOS .dmg + .zip (must run on a Mac) → dist/
npm run build:linux    # Linux AppImage + .deb              → dist/
npm run build:all      # all three at once (see note below)
```

Note: Apple's tooling requires the macOS build step to actually run on macOS — you can't cross-build a `.dmg` from Windows/Linux. Windows and Linux builds work fine from any of the three.

Unsigned builds will show an "unidentified developer" (macOS) or SmartScreen (Windows) warning on first launch — this is normal for a project without a paid code-signing certificate and just needs one extra click to bypass.

---

## What's new in v3

**Bug fixes**
- Fixed: files with Windows (CRLF) line endings no longer leak stray `\r` characters into headings, bullets, and table cells
- Fixed: `Save As` now correctly re-detects `.txt` vs `.md` mode for the new file, instead of keeping whatever mode the previous file was in
- Fixed: editing via the Organised view (tables, section edits, drag-reorder, find & replace) no longer wipes the Raw view's undo/redo history

**New features**
- **Tabs** — Open (Ctrl+O) now opens files as tabs in the current window instead of always spawning a new OS window. `Ctrl+T` new tab, `Ctrl+W` close tab, `Ctrl+Tab` / `Ctrl+Shift+Tab` to switch. Use **New Window** (Ctrl+Shift+N) when you actually want a separate window (e.g. for side-by-side monitors)
- **Find & Replace** — `Ctrl+F`
- **Word / character count** — in the status bar, next to the existing line/section count
- **Preferences persist across restarts** — theme choice, window size & position, and a recent-files list, stored in a small local JSON file
- **Done-checkboxes / section order / collapsed state now survive closing and reopening a file** — saved invisibly as a trailing HTML comment at the end of the file (see below), so it doesn't clutter the visible text
- **A start page** appears in any empty, untitled tab with quick access to your recent files
- **Export the Organised view** to a standalone HTML file or a PDF (Export ▾ in the toolbar)
- **Zen mode** (`Ctrl+Shift+Z`) — hides the toolbar, tab bar, sidebar and status bar, just the writing
- **H4–H6 markdown headings** — `####`, `#####`, `######` are now recognised, not just up to `###`
- **A basic theme-plugin system** — anyone can drop a folder into `plugins/` (or the user plugins folder) to add a new color scheme. Two sample themes (Nord, Solarized Dark) ship as examples. See `PLUGINS.md`
- **Hierarchy-aware section dragging** — dragging a section's `⠿` handle in Organised view now brings its nested subsections along with it (an H1 carries its H2/H3 children; an H2 carries only its own H3+ children). Sections with children are marked with a small **▾ group** badge and a left accent bar
- **Smarter empty-section rendering** — a heading whose only job is to introduce nested subsections (i.e. it has no content of its own before the next, deeper heading) no longer shows the misleading "no items yet — click title to add" placeholder; it shows a quiet "nested subsections below" hint instead, since that placeholder wording implies you should add checklist items directly there

### A note on the hierarchy features

Both of the above are driven purely by heading **level** (how many `#`s, or the `##`/`###` depth), not by understanding meaning — the app can tell a heading is "structural" because something deeper immediately follows it, not because it read and understood the text. That's a deliberate scope limit: it makes the behavior predictable and fast rather than trying to guess intent from prose.

### The hidden state block

When you check off items, reorder sections, or collapse a section, that state is invisible in the editor but gets appended to the file on save, looking like this:

```
<!-- hashtag-notepad:state
{"done":["Key Concepts::3"],"order":["Session Overview","Key Concepts"],"collapsed":[]}
-->
```

It's inert in any other program (Notepad, VS Code, GitHub's Markdown renderer all just show/ignore an HTML comment) and Hashtag Notepad strips it back out of the visible editor the next time you open the file.

## Format (.txt)

```
#section name
- bullet item
=> sub-note
plain text line
```

## Format (.md)

```
# Heading 1
## Heading 2
###### Heading 6
- bullet
**bold** *italic* `code`
> blockquote
```

## Shortcuts

| Key | Action |
|-----|--------|
| Ctrl+T | New tab |
| Ctrl+Shift+N | New window |
| Ctrl+W | Close tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous tab |
| Ctrl+O | Open file (new tab) |
| Ctrl+S | Save |
| Ctrl+Shift+S | Save As |
| Ctrl+F | Find & Replace |
| Ctrl+Shift+Z | Zen mode |
| Ctrl+B / Ctrl+I / Ctrl+U | Bold / Italic / Underline (Organised view, text selected) |

## Contributors

<a href="https://github.com/zeena-taste/hashtag-notepad/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=zeena-taste/hashtag-notepad" alt="Contributors" />
</a>

## Contributing

This is an open-source, learning-by-doing project — issues and PRs are welcome. See `PLUGINS.md` if you want to contribute a color theme without touching the app's source at all.


<!-- hashtag-notepad:state
{"done":[],"order":[],"collapsed":["Hashtag Notepad v3","Build it yourself","What's new in v3"]}
-->
