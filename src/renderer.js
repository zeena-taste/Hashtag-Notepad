const { ipcRenderer } = require('electron')
const ipc = ipcRenderer
const state = require('./state')
const dom = require('./dom')

const tabsMod = require('./tabs')
const viewsMod = require('./views')
const uiMod = require('./ui')
const fileOpsMod = require('./file-ops')
const exportMod = require('./export')
const autocorrectMod = require('./autocorrect')

Object.assign(window, tabsMod, viewsMod, uiMod, fileOpsMod, exportMod)

// ── Window controls ──
document.getElementById('btn-min-win').addEventListener('click', () => ipcRenderer.send('minimize-window'))
document.getElementById('btn-max-win').addEventListener('click', () => ipcRenderer.send('maximize-window'))
document.getElementById('btn-close-win').addEventListener('click', () => ipcRenderer.send('close-window'))

// ── Theme / export toolbar buttons ──────────────────────────────────────
dom.themeToggleBtn.addEventListener('click', e => { e.stopPropagation(); uiMod.openThemeMenu() })
dom.exportToggleBtn.addEventListener('click', e => {
  e.stopPropagation()
  uiMod.showDropdown(dom.exportToggleBtn, [
    { label: 'Export as HTML…', onClick: exportMod.exportAsHTML },
    { label: 'Export as PDF…', onClick: exportMod.exportAsPDF }
  ])
})
document.addEventListener('mousedown', e => { if (state.openDropdownEl && !state.openDropdownEl.contains(e.target)) uiMod.closeDropdown() })

// ── Find & Replace inputs ────────────────────────────────────────────────
dom.findInput.addEventListener('input', uiMod.runFind)
dom.findInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? uiMod.findPrev() : uiMod.findNext() }
  if (e.key === 'Escape') { e.preventDefault(); uiMod.closeFindBar() }
})
dom.replaceInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); uiMod.replaceOne() }
  if (e.key === 'Escape') { e.preventDefault(); uiMod.closeFindBar() }
})

// ── File drag & drop ───────────────────────────────────────────────────────
document.addEventListener('dragover', fileOpsMod.onDragOver)
document.addEventListener('dragleave', fileOpsMod.onDragLeave)
document.addEventListener('drop', fileOpsMod.onDrop)

// ── Autocorrect (as-you-type) ──────────────────────────────────────────────
autocorrectMod.initAutocorrect(document)

// ── Keyboard ───────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key.toLowerCase() === 'n' && e.shiftKey) { e.preventDefault(); fileOpsMod.newWindow() }
    else if (e.key.toLowerCase() === 'n') { /* reserved */ }
    if (e.key.toLowerCase() === 't') { e.preventDefault(); tabsMod.newTab() }
    if (e.key.toLowerCase() === 'w') { e.preventDefault(); if (state.activeTabId) tabsMod.requestCloseTab(state.activeTabId) }
    if (e.key === 'Tab' && state.tabs.length > 1) {
      e.preventDefault()
      const idx = state.tabs.findIndex(t => t.id === state.activeTabId)
      const next = e.shiftKey ? (idx - 1 + state.tabs.length) % state.tabs.length : (idx + 1) % state.tabs.length
      tabsMod.switchTab(state.tabs[next].id)
    }
    if (e.key.toLowerCase() === 'o') { e.preventDefault(); fileOpsMod.openFile() }
    if (e.key.toLowerCase() === 's' && !e.shiftKey) { e.preventDefault(); fileOpsMod.saveFile() }
    if (e.key.toLowerCase() === 's' && e.shiftKey) { e.preventDefault(); fileOpsMod.saveAs() }
    if (e.key.toLowerCase() === 'f') { e.preventDefault(); uiMod.openFindBar() }
    if (e.key.toLowerCase() === 'z' && e.shiftKey) { e.preventDefault(); uiMod.toggleZen() }
    if (state.currentView === 'organised' && document.activeElement?.classList.contains('line-text')) {
      if (e.key === 'b') { e.preventDefault(); viewsMod.applyFormat('bold') }
      if (e.key === 'i') { e.preventDefault(); viewsMod.applyFormat('italic') }
      if (e.key === 'u') { e.preventDefault(); viewsMod.applyFormat('underline') }
    }
  }
  if (e.key === 'Escape') {
    if (state.zenMode) { uiMod.toggleZen(); return }
    uiMod.closeTableBuilder(); dom.saveDialog.classList.add('hidden'); uiMod.closeDropdown()
  }
})

// ── IPC ────────────────────────────────────────────────────────────────────
ipc.on('load-file', (_, d) => fileOpsMod.loadIntoTabSmart(d.content, d.filePath))
ipc.on('open-file-external', (_, d) => fileOpsMod.loadIntoTabSmart(d.content, d.filePath))
ipc.on('check-save-before-close', () => tabsMod.requestCloseWindow())
ipc.on('system-theme', (_, t) => { state.systemTheme = t; if (!state.currentThemeId) uiMod.applyTheme(t) })

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  try {
    const prefs = await ipc.invoke('get-prefs')
    state.currentThemeId = prefs.theme
    state.recentFilesCache = prefs.recentFiles || []
  } catch { /* prefs unavailable, fall back to defaults */ }
  try {
    const allPlugins = await ipc.invoke('get-plugins')
    // 1. Handle CSS Themes (existing behavior)
    state.pluginThemes = allPlugins.filter(p => p.css)
    if (state.pluginThemes.length) {
        const style = document.createElement('style')
        style.id = 'plugin-theme-styles'
        style.textContent = state.pluginThemes.map(p => p.css).join('\n\n')
        document.head.appendChild(style)
    }

    // 2. Handle JS Connectors (NEW)
    const connectors = allPlugins.filter(p => p.type === 'connector' && p.js)
    if (connectors.length) {
        
        // ── The Obsidian-style API we expose to plugins ──
        const HashtagNotepadAPI = {
            workspace: {
                getActiveText: () => {
                    const tab = state.tabs.find(t => t.id === state.activeTabId)
                    return tab ? tab.content : ''
                },
                setActiveText: (text) => {
                    const tab = state.tabs.find(t => t.id === state.activeTabId)
                    if (tab) {
                        tab.content = text
                        // Update the actual textarea if it's visible
                        const ta = document.getElementById(`editor-${tab.id}`)
                        if (ta) {
                            const { setEditorValue } = require('./utils')
                            setEditorValue(ta, text)
                        }
                        // Trigger UI updates (status bar, etc)
                        uiMod.updateStatus()
                    }
                },
                getActiveTab: () => state.tabs.find(t => t.id === state.activeTabId)
            },
            ui: {
                addToolbarButton: (icon, tooltip, onClick) => {
                    const btn = document.createElement('button')
                    btn.className = 'tb-btn plugin-btn'
                    btn.innerHTML = icon
                    btn.title = tooltip
                    btn.addEventListener('click', onClick)
                    // Add to the right side of the toolbar
                    document.getElementById('toolbar-right').appendChild(btn)
                    return btn // Return it so they can remove it later if needed
                },
                showToast: (msg) => {
                    // Simple toast implementation
                    const toast = document.createElement('div')
                    toast.style.cssText = `position:fixed; bottom:40px; left:50%; transform:translateX(-50%); background:var(--bg3); color:var(--text); padding:8px 16px; border-radius:6px; border:1px solid var(--border); z-index:999; font-size:12px; box-shadow:0 4px 12px rgba(0,0,0,0.3); transition:opacity 0.3s;`
                    toast.textContent = msg
                    document.body.appendChild(toast)
                    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300) }, 3000)
                }
            },
            events: {
                _listeners: {},
                on(event, callback) {
                    if (!this._listeners[event]) this._listeners[event] = []
                    this._listeners[event].push(callback)
                },
                off(event, callback) {
                    if (!this._listeners[event]) return
                    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback)
                },
                emit(event, data) {
                    (this._listeners[event] || []).forEach(cb => {
                        try { cb(data) } catch(e) { console.error(`[Plugin Event Error] ${event}:`, e) }
                    })
                }
            },
            // Future-proofing for MCP / AI tools
            mcp: {
                _tools: [],
                registerTool(name, description, handler) {
                    this._tools.push({ name, description, handler })
                    console.log(`[MCP] Registered tool: ${name}`)
                }
            }
        }

        // Execute each connector
        connectors.forEach(plugin => {
            try {
                const pluginModule = { exports: {} }
                
                // Block them from requiring native Node modules (like 'fs' or 'child_process')
                const pluginRequire = (mod) => {
                    throw new Error(`Plugin security: Cannot require native module "${mod}". Use the HashtagNotepadAPI instead.`)
                }
                
                // Execute plugin via <script> tag (allowed by 'unsafe-inline' CSP, no 'unsafe-eval' needed)
                window.__HN_PLUGIN_API = HashtagNotepadAPI
                window.__HN_PLUGIN_MODULE = { exports: {} }
                window.__HN_PLUGIN_REQUIRE = (mod) => {
                    throw new Error(`Plugin security: Cannot require native module "${mod}". Use the HashtagNotepadAPI instead.`)
                }

                const script = document.createElement('script')
                script.textContent = `(function(){
                    var module = window.__HN_PLUGIN_MODULE;
                    var require = window.__HN_PLUGIN_REQUIRE;
                    var api = window.__HN_PLUGIN_API;
                    ${plugin.js}
                    if (typeof module.exports.onload === 'function') {
                        module.exports.onload(api);
                    }
                })()`
                document.head.appendChild(script)
                script.remove() // Safe: inline scripts execute synchronously on appendChild

                delete window.__HN_PLUGIN_API
                delete window.__HN_PLUGIN_MODULE
                delete window.__HN_PLUGIN_REQUIRE
                
                console.log(`[Plugin] Loaded connector: ${plugin.name}`)
            } catch (e) {
                console.error(`[Plugin] Failed to load connector ${plugin.name}:`, e)
            }
        })
    }
} catch (e) {
    console.error('[hashtag-notepad] failed to load plugins:', e)
    state.pluginThemes = []
}
  uiMod.applyTheme(uiMod.effectiveTheme())
  tabsMod.newTab()
  uiMod.updateStatus()
  uiMod.refreshStartPage()
}
init()