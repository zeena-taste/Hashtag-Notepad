# Creating a Plugin

Hashtag Notepad supports a flexible plugin system with two types of plugins:

1. **Theme Plugins** (CSS-only) — color schemes, fonts, visual tweaks
2. **Connector Plugins** (JavaScript + CSS) — full-featured extensions with API access, custom UI, and AI/MCP integration

## Folder Layout

```text
plugins/
  my-plugin/
    plugin.json
    theme.css        (optional, for themes or visual tweaks)
    main.js          (required for connectors)
```

---

## plugin.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "type": "connector",
  "main": "main.js",
  "css": "theme.css",
  "author": "your name (optional)",
  "version": "1.0.0"
}
```

### Fields

* `id` — unique identifier (lowercase, alphanumeric + dashes/underscores)
* `name` — display name shown in the UI
* `type` — either `"theme"` or `"connector"`
* `main` — JavaScript entry point (required for connectors)
* `css` — CSS file (optional, can be used by both types)
* `author` — your name/handle (optional)
* `version` — plugin version (optional)

---

## Theme Plugins (CSS-only)

A theme plugin defines CSS custom properties inside `body.theme-<id>`:

```css
body.theme-my-theme {
  --bg: #202020;
  --bg2: #262626;
  --bg3: #2c2c2c;
  --bg4: #333333;

  --border: #3a3a3a;
  --border2: #484848;

  --text: #e0e0e0;
  --text2: #999999;
  --text3: #5a5a5a;

  --accent: #e07b53;
  --accent-bg: #3a2a20;
  --accent-text: #ffb08a;

  /* ... see ARCHITECTURE.md for full variable list ... */
}
```

See `plugins/nord/theme.css` or `plugins/solarized-dark/theme.css` for complete examples.

---

## Connector Plugins (JavaScript + API)

Connector plugins can add buttons, commands, AI tools, and custom functionality using the **HashtagNotepadAPI**.

### main.js Structure

```javascript
module.exports = {
  onload: function(api) {
    // Called when the plugin loads
    // Register buttons, commands, event listeners here
  },

  onunload: function() {
    // Called when the plugin is disabled/unloaded
    // Clean up any resources, remove UI elements
  }
}
```

### The HashtagNotepadAPI

The `api` object passed to `onload()` provides safe access to the app.

---

### `api.workspace` — Editor Access

```javascript
// Get current note text
const text = api.workspace.getActiveText()

// Set current note text
api.workspace.setActiveText('new content')

// Get active tab info
const tab = api.workspace.getActiveTab()
```

---

### `api.ui` — UI Manipulation

```javascript
// Add a toolbar button
const btn = api.ui.addToolbarButton('🚀', 'My Action', () => {
  console.log('Button clicked!')
})

// Show a toast notification
api.ui.showToast('Operation completed!')
```

---

### `api.events` — Event System

```javascript
// Listen for events
api.events.on('text-changed', (newText) => {
  console.log('Text updated:', newText)
})

// Emit custom events (for inter-plugin communication)
api.events.emit('my-plugin-event', { data: 'value' })

// Remove a listener
api.events.off('text-changed', callback)
```

---

### `api.mcp` — AI/MCP Integration

Register tools that AI assistants such as Claude or GPT can use:

```javascript
api.mcp.registerTool(
  'get_word_count',
  'Returns the word count of the active note',
  async () => {
    const text = api.workspace.getActiveText()
    return text.trim() ? text.trim().split(/\s+/).length : 0
  }
)
```

This makes the tool available to MCP-compatible AI clients.

---

## Example: Word Count Connector

### `plugins/word-count/plugin.json`

```json
{
  "id": "word-count",
  "name": "Word Count Widget",
  "type": "connector",
  "main": "main.js",
  "author": "You"
}
```

### `plugins/word-count/main.js`

```javascript
module.exports = {
  onload: function(api) {
    console.log('[Word Count] Plugin loaded')

    // Add button to toolbar
    api.ui.addToolbarButton('📊', 'Count Words', () => {
      const text = api.workspace.getActiveText()
      const words = text.trim() ? text.trim().split(/\s+/).length : 0
      const chars = text.length

      api.ui.showToast(`Words: ${words} | Characters: ${chars}`)
    })

    // Register MCP tool for AI
    api.mcp.registerTool(
      'count_words',
      'Count words and characters in the current note',
      () => {
        const text = api.workspace.getActiveText()

        return {
          words: text.trim() ? text.trim().split(/\s+/).length : 0,
          characters: text.length
        }
      }
    )
  },

  onunload: function() {
    console.log('[Word Count] Plugin unloaded')
  }
}
```

---

## Example: AI Hashtag Suggestor

### `plugins/ai-hashtags/plugin.json`

```json
{
  "id": "ai-hashtags",
  "name": "AI Hashtag Generator",
  "type": "connector",
  "main": "main.js",
  "author": "You"
}
```

### `plugins/ai-hashtags/main.js`

```javascript
module.exports = {
  onload: function(api) {
    api.ui.addToolbarButton('🏷️', 'Suggest Hashtags', async () => {
      const text = api.workspace.getActiveText()

      // Call your AI API here (OpenAI, Anthropic, etc.)
      // For now, just extract words as example hashtags
      const words = text.match(/\b\w+\b/g) || []

      const hashtags = [...new Set(words)]
        .filter(w => w.length > 3)
        .slice(0, 10)
        .map(w => `#${w.toLowerCase()}`)
        .join(' ')

      // Append hashtags to current note
      const newText = text + '\n\n' + hashtags

      api.workspace.setActiveText(newText)
      api.ui.showToast('Hashtags added!')
    })
  }
}
```

---

## Where to Put Plugins

### Bundled with the App

Drop your plugin folder in the project's `plugins/` directory before building — it ships with the app for everyone.

### Installed by a User

Drop the folder into the app's user plugins directory. It will be picked up on the next launch:

* **Windows:** `%APPDATA%/HashtagNotepad/plugins/`
* **macOS:** `~/Library/Application Support/HashtagNotepad/plugins/`
* **Linux:** `~/.config/HashtagNotepad/plugins/`

> User-installed plugins override bundled ones with the same `id`, so you can tweak built-in plugins without rebuilding.

---

## Security Notes

Connector plugins run in the renderer process with access to:

* The DOM and UI
* The HashtagNotepadAPI
* Browser APIs such as `localStorage`

### Plugins CANNOT

* Access Node.js modules directly (`require()` is blocked)
* Access the filesystem directly
* Execute arbitrary system commands

This keeps plugins safe to install from the community while still being powerful.

---

## Debugging Plugins

Open DevTools:

* **Windows/Linux:** `Ctrl+Shift+I`
* **macOS:** `Cmd+Option+I`

Then check the console for:

```text
[Plugin] Loaded connector: <name>
```

Successful loads will show the message above.

For errors:

```text
[Plugin] Failed to load connector <name>: <error>
```

You can also check for plugin-specific `console.log()` messages.

---

## Publishing Plugins

1. **Test locally** — drop the plugin into your user plugins folder.
2. **Create a GitHub repo** — share your plugin folder.
3. **Submit a PR** — optionally bundle the plugin with the app.
4. **Document it** — add the plugin to the community plugin list.

For deeper layout and DOM constraints beyond CSS, see `ARCHITECTURE.md`.
