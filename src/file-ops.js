// file-ops.js — opening, saving, drag-and-drop, and the hidden
// done/order/collapsed state block that gets appended to saved files.
const { ipcRenderer: ipc } = require('electron')
const state = require('./state')
const dom = require('./dom')

const tabsMod = require('./tabs')
const uiMod = require('./ui')
const viewsMod = require('./views')

// ── Hidden state block (done/order/collapsed persistence) ──────────────
// Appended invisibly to the saved file as a trailing HTML comment so the
// data survives being closed and reopened, without cluttering the visible
// editor. Any other program opening the file just sees an inert comment.
const STATE_BLOCK_RE = /\n*<!--\s*hashtag-notepad:state\s*\n([\s\S]*?)\n-->\s*$/

function parseStateBlock(rawText) {
  const m = rawText.match(STATE_BLOCK_RE)
  if (!m) return { content: rawText, state: null }
  let parsed = null
  try { parsed = JSON.parse(m[1]) } catch { parsed = null }
  return { content: rawText.slice(0, m.index), state: parsed }
}

function serializeStateBlockFor(tab) {
  const blockState = {
    done: [...tab.doneLines],
    order: tab.sectionOrder,
    collapsed: [...tab.collapsedSections]
  }
  if (!blockState.done.length && !blockState.order.length && !blockState.collapsed.length) return ''
  return '\n\n<!-- hashtag-notepad:state\n' + JSON.stringify(blockState) + '\n-->\n'
}

function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

// ── File ops ───────────────────────────────────────────────────────────────
function newWindow() { ipc.send('new-window') }

async function openFile() {
  const r = await ipc.invoke('open-file')
  if (r) loadIntoTabSmart(r.content, r.filePath)
}

async function saveFile() {
  const t = tabsMod.activeTab(); if (!t) return
  const content = t.textareaEl.value + serializeStateBlockFor(t)
  const r = await ipc.invoke('save-file', { content, filePath: t.filePath })
  if (r) {
    t.filePath = r
    t.isMd = r.toLowerCase().endsWith('.md')
    tabsMod.setTabModified(t, false)
    tabsMod.updateTabLabel(t)
    uiMod.updateFileLabel(r)
  }
}

async function saveAs() {
  const t = tabsMod.activeTab(); if (!t) return
  const content = t.textareaEl.value + serializeStateBlockFor(t)
  const r = await ipc.invoke('save-as', content)
  if (r) {
    t.filePath = r
    t.isMd = r.toLowerCase().endsWith('.md')
    tabsMod.setTabModified(t, false)
    tabsMod.updateTabLabel(t)
    uiMod.updateFileLabel(r)
  }
}

// Opens content into the current tab if it's a blank/untitled/unmodified
// tab (so "Open" from an empty new tab doesn't spawn a redundant extra
// tab); otherwise opens a new tab, keeping other open files untouched.
function loadIntoTabSmart(content, filePath) {
  const t = tabsMod.activeTab()
  if (t && !t.filePath && !t.isModified && t.textareaEl.value === '') {
    loadFileIntoTab(t, content, filePath)
  } else {
    loadFileIntoTab(tabsMod.newTab(), content, filePath)
  }
}

function loadFileIntoTab(tab, rawContent, filePath) {
  const normalized = normalizeLineEndings(rawContent)
  const { content, state: blockState } = parseStateBlock(normalized)
  tab.filePath = filePath
  tab.isMd = filePath ? filePath.toLowerCase().endsWith('.md') : false
  tab.doneLines = new Set((blockState && blockState.done) || [])
  tab.sectionOrder = (blockState && blockState.order) || []
  tab.collapsedSections = new Set((blockState && blockState.collapsed) || [])
  tab.textareaEl.value = content
  tab.isModified = false
  tabsMod.updateTabLabel(tab)
  tabsMod.recomputeWindowModified()
  if (tab.id === state.activeTabId) {
    uiMod.updateFileLabel(filePath)
    tabsMod.updateWindowTitle()
    uiMod.renderSidebar()
    uiMod.updateStatus()
    uiMod.refreshStartPage()
    if (state.currentView === 'organised') viewsMod.renderOrganised()
  }
}

// ── File drag & drop ───────────────────────────────────────────────────────
// Wired up in renderer.js (document-level listeners); exported here so the
// actual file-reading logic lives next to the rest of the file ops.
function onDragOver(e) {
  if (state.dragFromHandle || state.dragSrc) return
  e.preventDefault()
  dom.dropOverlay.classList.remove('hidden')
}
function onDragLeave(e) {
  if (state.dragFromHandle || state.dragSrc) return
  if (!e.relatedTarget) dom.dropOverlay.classList.add('hidden')
}
async function onDrop(e) {
  if (state.dragSrc) return
  e.preventDefault()
  dom.dropOverlay.classList.add('hidden')
  const file = e.dataTransfer.files[0]
  if (file && file.path) {
    const r = await ipc.invoke('read-dropped-file', file.path)
    if (r) loadIntoTabSmart(r.content, r.filePath)
  }
}

module.exports.STATE_BLOCK_RE = STATE_BLOCK_RE
module.exports.parseStateBlock = parseStateBlock
module.exports.serializeStateBlockFor = serializeStateBlockFor
module.exports.normalizeLineEndings = normalizeLineEndings
module.exports.newWindow = newWindow
module.exports.openFile = openFile
module.exports.saveFile = saveFile
module.exports.saveAs = saveAs
module.exports.loadIntoTabSmart = loadIntoTabSmart
module.exports.loadFileIntoTab = loadFileIntoTab
module.exports.onDragOver = onDragOver
module.exports.onDragLeave = onDragLeave
module.exports.onDrop = onDrop
