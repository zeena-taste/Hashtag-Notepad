// tabs.js — tab lifecycle: newTab, switchTab, closeTab, updateTabLabel,
// and the save-before-close prompt flow. Imports state + dom directly;
// reaches into views/ui/file-ops for the render + save calls a tab
// action needs to trigger.
//
// NOTE on the circular requires below: tabs.js, views.js, ui.js and
// file-ops.js all call into each other (a tab switch re-renders the
// sidebar, a save happens as part of closing a tab, etc.) — that's
// inherent to how this app's features are wired together, not a
// mistake. Node handles this fine as long as every module *adds*
// properties to `module.exports` one at a time (`module.exports.foo =
// foo`) instead of replacing it wholesale (`module.exports = {...}`).
// Whichever module is require()'d first in a cycle still gets a live
// reference to the same object the others fill in — see the bottom of
// this file.
const path = require('path')
const { ipcRenderer: ipc } = require('electron')
const state = require('./state')
const dom = require('./dom')

const viewsMod = require('./views')
const uiMod = require('./ui')
const fileOpsMod = require('./file-ops')

function activeTab() { return state.tabs.find(t => t.id === state.activeTabId) || null }

function newTab(filePath = null, content = '', activate = true) {
  const id = 'tab-' + (++state.tabIdCounter)

  const ta = document.createElement('textarea')
  ta.className = 'raw-editor hidden'
  ta.spellcheck = true
  ta.placeholder = 'Start typing…\n\nUse #hashtags to create sections\nUse - for bullet points\nUse => for sub-notes\nUse | col | col | for tables\n\nDrag & drop a .txt or .md file to open it'
  ta.value = content
  dom.editorTextareas.appendChild(ta)
  ta.addEventListener('click', e => {
    // Ctrl+Click (or Cmd+Click on Mac) opens a URL under the cursor in raw view
    if (!e.ctrlKey && !e.metaKey) return
    const pos = ta.selectionStart
    const text = ta.value
    // Walk left to find start of potential URL
    let start = pos
    while (start > 0 && !/\s/.test(text[start - 1])) start--
    // Walk right to find end
    let end = pos
    while (end < text.length && !/\s/.test(text[end])) end++
    const word = text.slice(start, end)
    const urlMatch = word.match(/https?:\/\/[^\s)<>"]+|www\.[^\s)<>"]+/)
    if (urlMatch) viewsMod.openURL(urlMatch[0])
  })
  ta.addEventListener('input', () => {
    const t = state.tabs.find(x => x.textareaEl === ta)
    if (!t) return
    setTabModified(t, true)
    if (t.id === state.activeTabId) { uiMod.renderSidebar(); uiMod.updateStatus(); uiMod.refreshStartPage() }
  })
  ta.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const s = ta.selectionStart, end = ta.selectionEnd
      ta.value = ta.value.substring(0, s) + '  ' + ta.value.substring(end)
      ta.selectionStart = ta.selectionEnd = s + 2
      const t = state.tabs.find(x => x.textareaEl === ta)
      if (t) setTabModified(t, true)
    }
  })

  const tabEl = document.createElement('div')
  tabEl.className = 'tab'
  tabEl.innerHTML = `<span class="tab-name"></span><span class="tab-dot hidden">●</span><button class="tab-close" title="Close tab (Ctrl+W)">✕</button>`
  tabEl.addEventListener('mousedown', e => { if (!e.target.classList.contains('tab-close')) switchTab(id) })
  tabEl.querySelector('.tab-close').addEventListener('click', e => { e.stopPropagation(); requestCloseTab(id) })
  dom.tabList.appendChild(tabEl)

  const tab = {
    id, filePath, isMd: filePath ? filePath.toLowerCase().endsWith('.md') : false,
    textareaEl: ta, tabEl, isModified: false,
    doneLines: new Set(), sectionOrder: [], collapsedSections: new Set()
  }
  state.tabs.push(tab)
  updateTabLabel(tab)
  if (activate) switchTab(id)
  return tab
}

function updateTabLabel(tab) {
  const name = tab.filePath ? path.basename(tab.filePath) : 'untitled.txt'
  tab.tabEl.querySelector('.tab-name').textContent = name
  tab.tabEl.querySelector('.tab-dot').classList.toggle('hidden', !tab.isModified)
  tab.tabEl.title = tab.filePath || name
}

function switchTab(id) {
  const t = state.tabs.find(x => x.id === id)
  if (!t) return
  viewsMod.commitActiveInlineEdit()
  state.activeTabId = id
  state.tabs.forEach(x => {
    x.tabEl.classList.toggle('active', x.id === id)
    x.textareaEl.classList.toggle('hidden', x.id !== id || state.currentView !== 'raw')
  })
  uiMod.updateFileLabel(t.filePath)
  updateWindowTitle()
  uiMod.renderSidebar()
  uiMod.updateStatus()
  uiMod.refreshStartPage()
  if (state.currentView === 'organised') viewsMod.renderOrganised()
  if (!dom.findBar.classList.contains('hidden')) uiMod.runFind()
}

function setTabModified(tab, modified) {
  if (tab.isModified === modified) { if (tab.id === state.activeTabId) updateWindowTitle(); return }
  tab.isModified = modified
  updateTabLabel(tab)
  if (tab.id === state.activeTabId) {
    dom.modifiedDot.classList.toggle('hidden', !modified)
    updateWindowTitle()
  }
  recomputeWindowModified()
}
function recomputeWindowModified() { ipc.send('set-modified', state.tabs.some(t => t.isModified)) }

function updateWindowTitle() {
  const t = activeTab()
  const name = t && t.filePath ? path.basename(t.filePath) : 'untitled.txt'
  const title = (t && t.isModified ? '● ' : '') + name + ' — Hashtag Notepad'
  ipc.send('set-title', title)
}

// ── Closing tabs / windows (with save prompts) ──────────────────────────
function requestCloseTab(id) {
  const t = state.tabs.find(x => x.id === id)
  if (!t) return
  if (t.isModified) {
    state.pendingCloseQueue = [id]
    state.closeWindowAfter = state.tabs.length === 1
    promptSaveForTab(id)
  } else {
    finalizeTabClose(id)
    if (state.tabs.length === 0) ipc.send('force-close')
  }
}

function requestCloseWindow() {
  const unsaved = state.tabs.filter(t => t.isModified).map(t => t.id)
  if (!unsaved.length) { ipc.send('force-close'); return }
  state.pendingCloseQueue = unsaved
  state.closeWindowAfter = true
  promptSaveForTab(state.pendingCloseQueue[0])
}

function promptSaveForTab(id) {
  const t = state.tabs.find(x => x.id === id)
  const name = t && t.filePath ? path.basename(t.filePath) : 'untitled.txt'
  dom.saveDialogMsg.textContent = `Save changes to ${name} before closing?`
  dom.saveDialog._tabId = id
  dom.saveDialog.classList.remove('hidden')
}

async function saveAndClose() {
  dom.saveDialog.classList.add('hidden')
  const id = dom.saveDialog._tabId
  if (id !== state.activeTabId) switchTab(id)
  await fileOpsMod.saveFile()
  advanceCloseQueue()
}
function discardAndClose() {
  dom.saveDialog.classList.add('hidden')
  const id = dom.saveDialog._tabId
  const t = state.tabs.find(x => x.id === id)
  if (t) { t.isModified = false; updateTabLabel(t) }
  advanceCloseQueue()
}
function cancelClose() {
  dom.saveDialog.classList.add('hidden')
  state.pendingCloseQueue = []
  state.closeWindowAfter = false
}
function advanceCloseQueue() {
  const id = state.pendingCloseQueue.shift()
  finalizeTabClose(id)
  if (state.pendingCloseQueue.length) { promptSaveForTab(state.pendingCloseQueue[0]); return }
  if (state.closeWindowAfter || state.tabs.length === 0) ipc.send('force-close')
}
function finalizeTabClose(id) {
  const idx = state.tabs.findIndex(x => x.id === id)
  if (idx === -1) return
  const t = state.tabs[idx]
  t.textareaEl.remove()
  t.tabEl.remove()
  state.tabs.splice(idx, 1)
  recomputeWindowModified()
  if (state.activeTabId === id) {
    const next = state.tabs[idx] || state.tabs[idx - 1] || state.tabs[0]
    if (next) switchTab(next.id)
    else state.activeTabId = null
  }
}

module.exports.activeTab = activeTab
module.exports.newTab = newTab
module.exports.updateTabLabel = updateTabLabel
module.exports.switchTab = switchTab
module.exports.setTabModified = setTabModified
module.exports.recomputeWindowModified = recomputeWindowModified
module.exports.updateWindowTitle = updateWindowTitle
module.exports.requestCloseTab = requestCloseTab
module.exports.requestCloseWindow = requestCloseWindow
module.exports.promptSaveForTab = promptSaveForTab
module.exports.saveAndClose = saveAndClose
module.exports.discardAndClose = discardAndClose
module.exports.cancelClose = cancelClose
module.exports.advanceCloseQueue = advanceCloseQueue
module.exports.finalizeTabClose = finalizeTabClose
