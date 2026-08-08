# Changelog

## v3.1.0
- URLs (https://, http://, www.) render as clickable links in organised view
- Markdown links [label](url) render with the label as the link text
- Ctrl+Click opens URLs in raw view
- Links revert to plain text when editing a line, restore on blur
- Works in both .txt and .md files

## v3.0.0

**Fixed**
- CRLF (Windows) line endings no longer leak stray `\r` characters into headings/bullets/table cells
- `Save As` correctly re-detects `.txt` vs `.md` mode for the new file
- Editing via Organised view no longer wipes Raw view's undo/redo history

**Added**
- Tabs (Ctrl+T / Ctrl+W / Ctrl+Tab), with Open now opening into a tab instead of always a new window
- Find & Replace (Ctrl+F)
- Word / character count in the status bar
- Persisted preferences: theme, window bounds, recent files
- Done-checkboxes / section order / collapsed state persist across close-reopen (hidden trailing state block)
- Start page with recent files, shown in empty untitled tabs
- Export Organised view to standalone HTML or PDF
- Zen mode (Ctrl+Shift+Z)
- H4–H6 markdown heading support
- Basic theme-plugin system (`plugins/`), with Nord and Solarized Dark as samples
- Hierarchy-aware section dragging (dragging a parent heading brings its nested children along)
- Smarter empty-section rendering for organisational parent headings

## v2.0.0

- Multi-window support
- Light/dark theme with system detection
- Inline editing in Organised view
- Markdown support (`#`/`##`/`###` headings, bold/italic/code, blockquotes, bullets)

## v1.0.0

- Initial release: `.txt` notepad with `#hashtag` collapsible sections, bullets, sub-notes, and basic tables
