// Minimal theme-plugin loader.
//
// A theme plugin is just a folder containing:
//   plugin.json   { "id": "nord", "name": "Nord", "type": "theme", "css": "theme.css" }
//   theme.css     body.theme-nord { --bg: #2e3440; ... }
//
// Deliberately CSS-only (no JS execution) for v3 — this keeps the plugin
// surface trivially safe to load from a community folder while still letting
// anyone ship a new color scheme without touching the app's source.
// See PLUGINS.md for the full list of variables a theme can define.
const fs = require('fs')
const path = require('path')

function readPluginDir(dir) {
  const found = []
  if (!dir || !fs.existsSync(dir)) return found
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return found }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const pluginDir = path.join(dir, entry.name)
    const manifestPath = path.join(pluginDir, 'plugin.json')
    if (!fs.existsSync(manifestPath)) continue
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      if (manifest.type !== 'theme') continue
      const cssFile = manifest.css || 'theme.css'
      const cssPath = path.join(pluginDir, cssFile)
      if (!fs.existsSync(cssPath)) continue
      const css = fs.readFileSync(cssPath, 'utf-8')
      const id = String(manifest.id || entry.name).replace(/[^a-z0-9\-_]/gi, '')
      if (!id) continue
      found.push({ id, name: manifest.name || id, author: manifest.author || null, css })
    } catch (e) {
      console.error('[hashtag-notepad] failed to load plugin at', pluginDir, e.message)
    }
  }
  return found
}

// User plugins (installed by the person, in userData/plugins) win over
// bundled ones sharing the same id, so someone can override a built-in
// sample theme just by dropping a folder with the same id.
function discoverThemePlugins(bundledDir, userDir) {
  const byId = new Map()
  readPluginDir(bundledDir).forEach(p => byId.set(p.id, p))
  readPluginDir(userDir).forEach(p => byId.set(p.id, p))
  return [...byId.values()]
}

module.exports = { discoverThemePlugins }
