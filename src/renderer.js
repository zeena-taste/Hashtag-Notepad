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
    state.pluginThemes = await ipc.invoke('get-theme-plugins')
    if (state.pluginThemes.length) {
      const style = document.createElement('style')
      style.id = 'plugin-theme-styles'
      style.textContent = state.pluginThemes.map(p => p.css).join('\n\n')
      document.head.appendChild(style)
    }
  } catch (e) {
    console.error('[hashtag-notepad] failed to load theme plugins:', e)
    state.pluginThemes = []
  }
  uiMod.applyTheme(uiMod.effectiveTheme())
  tabsMod.newTab()
  uiMod.updateStatus()
  uiMod.refreshStartPage()
}
init()