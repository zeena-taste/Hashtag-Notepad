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
      const type = manifest.type || 'theme'
      // Allow both themes and connectors
      if (type !== 'theme' && type !== 'connector') continue

      let css = null
      const cssFile = manifest.css || 'theme.css'
      const cssPath = path.join(pluginDir, cssFile)
      if (fs.existsSync(cssPath)) {
          css = fs.readFileSync(cssPath, 'utf-8')
      }

      // NEW: Read the JS entry point if it's a connector
      let js = null
      if (type === 'connector' && manifest.main) {
          const jsPath = path.join(pluginDir, manifest.main)
          if (fs.existsSync(jsPath)) {
              try {
                  js = fs.readFileSync(jsPath, 'utf-8')
              } catch (e) {
                  console.error('[hashtag-notepad] failed to read JS for plugin', pluginDir, e.message)
              }
          }
      }

      // Must have at least CSS or JS to be valid
      if (!css && !js) continue

      const id = String(manifest.id || entry.name).replace(/[^a-z0-9-_]/gi, '')
      if (!id) continue

      found.push({ id, name: manifest.name || id, author: manifest.author || null, type, css, js })
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
