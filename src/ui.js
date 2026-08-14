const path = require('path')
const { ipcRenderer: ipc } = require('electron')
const state = require('./state')
const dom = require('./dom')
const { escapeHtml, escapeRegex } = require('./utils')

const tabsMod = require('./tabs')
const viewsMod = require('./views')
const fileOpsMod = require('./file-ops')

// ── Sidebar ────────────────────────────────────────────────────────────────
function headingColorClass(level) {
  if (level <= 1) return 'md-h1-color'
  if (level === 2) return 'md-h2-color'
  if (level === 3) return 'md-h3-color'
  if (level === 4) return 'md-h4-color'
  if (level === 5) return 'md-h5-color'
  return 'md-h6-color'
}

function renderSidebar() {
  const t = tabsMod.activeTab()
  dom.sectionList.innerHTML = ''
  if (!t) return
  const sections = viewsMod.parseContent(t.textareaEl.value, t.isMd)
  sections.filter(s => s.title).forEach(s => {
    const el = document.createElement('div')
    el.className = 'section-link'
    el.dataset.level = s.level;   // heading depth 1–6, same value used for the ## sec-tag / indentation
    el.dataset.secTitle = s.title; // used to re-find this link when highlighting the active section
    el.title = s.title;           // free bonus: hovering shows the section name as a tooltip
    const depth = Math.max(0, (s.level || 1) - 1)
    const cc = t.isMd ? headingColorClass(s.level) : ''
    const tagHtml = t.isMd ? `<span class="sl-tag">${s.tag}</span>` : ''
    el.innerHTML = `<span style="width:${depth * 6}px;display:inline-block;flex-shrink:0"></span>${tagHtml}<span class="sl-label ${cc}">${escapeHtml(s.title)}</span>`
    el.onclick = () => jumpToSection(s.title)
    dom.sectionList.appendChild(el)
  })
  // sidebar just got rebuilt from scratch, so re-apply whichever section was active
  if (state.activeSectionTitle) highlightActiveLink(state.activeSectionTitle)
}

// Marks the sidebar link for `title` as active and clears any other. Safe to
// call with a title that isn't currently rendered (e.g. mid-rebuild).
function highlightActiveLink(title) {
  state.activeSectionTitle = title
  dom.sectionList.querySelectorAll('.section-link').forEach(el => {
    el.classList.toggle('active', el.dataset.secTitle === title)
  })
}

// ── Active-section tracking (scroll-spy) ─────────────────────────────────
// Organised view: an IntersectionObserver watches each `#sec-<title>` block
// and highlights whichever one is topmost/visible as you scroll.
// Call observeSectionBlocks() once after the organised view re-renders its
// section blocks, and call initActiveSectionTracking() once during app init.
let sectionObserver = null
function initActiveSectionTracking() {
  if (!('IntersectionObserver' in window) || !dom.organisedView) return
  sectionObserver = new IntersectionObserver(entries => {
    const visible = entries
      .filter(e => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
    if (visible.length) highlightActiveLink(visible[0].target.id.replace(/^sec-/, ''))
  }, { root: dom.organisedView, rootMargin: '-10% 0px -70% 0px', threshold: 0 })
}
function observeSectionBlocks() {
  if (!sectionObserver || !dom.organisedView) return
  sectionObserver.disconnect()
  dom.organisedView.querySelectorAll('[id^="sec-"]').forEach(el => sectionObserver.observe(el))
}

function jumpToSection(title) {
  const t = tabsMod.activeTab(); if (!t) return
  highlightActiveLink(title)
  if (state.currentView === 'organised') {
    const el = document.getElementById('sec-' + title)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } else {
    const text = t.textareaEl.value
    const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = new RegExp('^#+\\s*' + esc + '$', 'm').exec(text)
    if (m) { t.textareaEl.focus(); t.textareaEl.setSelectionRange(m.index, m.index); t.textareaEl.scrollTop = text.substring(0, m.index).split('\n').length * 24 }
  }
}

// ── Status bar / file label ──────────────────────────────────────────────
function updateFileLabel(fp) {
  dom.fileNameEl.textContent = fp ? path.basename(fp) : 'untitled.txt'
  dom.statusFile.textContent = fp || 'untitled.txt'
}

function updateStatus() {
  const t = tabsMod.activeTab()
  const text = t ? t.textareaEl.value : ''
  const s = viewsMod.parseContent(text, t ? t.isMd : false).filter(s => s.title)
  dom.statusSections.textContent = s.length + ' section' + (s.length !== 1 ? 's' : '')
  dom.statusLines.textContent = text.split('\n').length + ' lines'
  const words = (text.match(/\S+/g) || []).length
  dom.statusWords.textContent = words + (words === 1 ? ' word' : ' words')
  dom.statusChars.textContent = text.length + (text.length === 1 ? ' char' : ' chars')
}

// ── Sidebar toggle ───────────────────────────────────────────────────────
function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed
  dom.sidebar.classList.toggle('collapsed', state.sidebarCollapsed)
}

// ── Sidebar resize ───────────────────────────────────────────────────────
// Self-contained: builds its own drag handle so no HTML/dom.js changes are
// required. Call uiMod.initSidebarResize() once during app init.
const SIDEBAR_MIN_W = 160
const SIDEBAR_MAX_W = 420

function initSidebarResize() {
  if (dom.sidebar.querySelector('.sidebar-resizer')) return // already wired up
  dom.sidebar.appendChild(Object.assign(document.createElement('div'), { className: 'sidebar-resizer' }))
  const handle = dom.sidebar.querySelector('.sidebar-resizer')

  let dragging = false, startX = 0, startW = 0

  handle.addEventListener('mousedown', e => {
    if (state.sidebarCollapsed) return
    dragging = true
    startX = e.clientX
    startW = dom.sidebar.getBoundingClientRect().width
    dom.sidebar.classList.add('resizing')
    document.body.style.cursor = 'col-resize'
    e.preventDefault()
  })

  window.addEventListener('mousemove', e => {
    if (!dragging) return
    const w = Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, startW + (e.clientX - startX)))
    document.documentElement.style.setProperty('--sidebar-w', w + 'px')
  })

  window.addEventListener('mouseup', () => {
    if (!dragging) return
    dragging = false
    dom.sidebar.classList.remove('resizing')
    document.body.style.cursor = ''
    // Optional persistence — no-op unless you add a 'set-sidebar-width-pref'
    // handler in main.js, same pattern as the existing 'set-theme-pref'.
    try { ipc.send('set-sidebar-width-pref', document.documentElement.style.getPropertyValue('--sidebar-w')) } catch (e) {}
  })
}

// ── Zen mode ─────────────────────────────────────────────────────────────
function toggleZen() {
  state.zenMode = !state.zenMode
  document.body.classList.toggle('zen', state.zenMode)
  if (state.zenMode) {
    // Re-trigger the CSS fade animation by replacing the node with a fresh clone
    const hint = document.getElementById('zen-hint')
    if (hint) { const fresh = hint.cloneNode(true); hint.replaceWith(fresh) }
  }
}

// ── Theme (system / dark / light / plugin themes) ───────────────────────
function applyTheme(themeId) {
  document.body.className = document.body.className.split(' ').filter(c => !c.startsWith('theme-')).join(' ')
  document.body.classList.add('theme-' + themeId)
  const isLightish = themeId === 'light'
  dom.iconSun.classList.toggle('hidden', isLightish)
  dom.iconMoon.classList.toggle('hidden', !isLightish)
}
function effectiveTheme() { return state.currentThemeId || state.systemTheme }
function setTheme(id) {
  state.currentThemeId = id
  applyTheme(effectiveTheme())
  ipc.send('set-theme-pref', id)
}

function openThemeMenu() {
  const items = [
    { label: 'System', active: state.currentThemeId === null, onClick: () => setTheme(null) },
    { label: 'Dark', active: state.currentThemeId === 'dark', onClick: () => setTheme('dark') },
    { label: 'Light', active: state.currentThemeId === 'light', onClick: () => setTheme('light') }
  ]
  if (state.pluginThemes.length) {
    items.push({ type: 'sep' })
    state.pluginThemes.forEach(p => items.push({ label: p.name, active: state.currentThemeId === p.id, onClick: () => setTheme(p.id) }))
  }
  showDropdown(dom.themeToggleBtn, items)
}

// ── Generic dropdown menu (theme picker, export menu) ───────────────────
function closeDropdown() { if (state.openDropdownEl) { state.openDropdownEl.remove(); state.openDropdownEl = null } }

function showDropdown(anchor, items) {
  closeDropdown()
  const menu = document.createElement('div')
  menu.className = 'dropdown-menu'
  items.forEach(it => {
    if (it.type === 'sep') { const s = document.createElement('div'); s.className = 'dropdown-sep'; menu.appendChild(s); return }
    const row = document.createElement('div')
    row.className = 'dropdown-item' + (it.active ? ' active' : '')
    row.textContent = it.label
    row.addEventListener('mousedown', e => { e.stopPropagation() })
    row.addEventListener('click', e => { e.stopPropagation(); closeDropdown(); it.onClick && it.onClick() })
    menu.appendChild(row)
  })
  document.body.appendChild(menu)
  const rect = anchor.getBoundingClientRect()
  menu.style.top = (rect.bottom + 4) + 'px'
  menu.style.right = Math.max(8, window.innerWidth - rect.right) + 'px'
  state.openDropdownEl = menu
}

// ── Find & Replace ────────────────────────────────────────────────────────
function activeEditor() { const t = tabsMod.activeTab(); return t ? t.textareaEl : null }

function openFindBar() {
  if (state.currentView !== 'raw') viewsMod.switchView('raw')
  dom.findBar.classList.remove('hidden')
  const ed = activeEditor()
  if (ed && ed.selectionStart !== ed.selectionEnd) dom.findInput.value = ed.value.slice(ed.selectionStart, ed.selectionEnd)
  dom.findInput.focus(); dom.findInput.select()
  runFind()
}
function closeFindBar() {
  dom.findBar.classList.add('hidden')
  state.findMatches = []; state.findIndex = -1
  activeEditor()?.focus()
}
function runFind() {
  const ed = activeEditor()
  state.findMatches = []
  const q = dom.findInput.value
  if (ed && q) {
    const hay = ed.value.toLowerCase()
    const needle = q.toLowerCase()
    let idx = 0
    while ((idx = hay.indexOf(needle, idx)) !== -1) {
      state.findMatches.push({ start: idx, end: idx + needle.length })
      idx += needle.length
    }
  }
  state.findIndex = state.findMatches.length ? 0 : -1
  updateFindStatus()
  selectCurrentMatch()
}
function updateFindStatus() {
  dom.findCount.textContent = state.findMatches.length ? `${state.findIndex + 1} / ${state.findMatches.length}` : (dom.findInput.value ? '0 / 0' : '')
}
function selectCurrentMatch() {
  const ed = activeEditor()
  if (!ed || state.findIndex === -1) return
  const m = state.findMatches[state.findIndex]
  ed.focus()
  ed.setSelectionRange(m.start, m.end)
  const line = ed.value.slice(0, m.start).split('\n').length
  ed.scrollTop = Math.max(0, (line - 5) * 20)
}
function findNext() { if (!state.findMatches.length) return; state.findIndex = (state.findIndex + 1) % state.findMatches.length; updateFindStatus(); selectCurrentMatch() }
function findPrev() { if (!state.findMatches.length) return; state.findIndex = (state.findIndex - 1 + state.findMatches.length) % state.findMatches.length; updateFindStatus(); selectCurrentMatch() }

function replaceOne() {
  const t = tabsMod.activeTab(); if (!t || state.findIndex === -1) return
  selectCurrentMatch()
  document.execCommand('insertText', false, dom.replaceInput.value)
  tabsMod.setTabModified(t, true)
  renderSidebar(); updateStatus()
  runFind()
}
function replaceAll() {
  const t = tabsMod.activeTab(); if (!t || !state.findMatches.length) return
  const q = dom.findInput.value; if (!q) return
  const re = new RegExp(escapeRegex(q), 'gi')
  const newText = t.textareaEl.value.replace(re, () => dom.replaceInput.value)
  require('./utils').setEditorValue(t.textareaEl, newText)
  tabsMod.setTabModified(t, true)
  renderSidebar(); updateStatus()
  runFind()
}

// ── Recent files / start page ────────────────────────────────────────────
function refreshStartPage() {
  const t = tabsMod.activeTab()
  const show = t && !t.filePath && !t.isModified && t.textareaEl.value === '' && state.currentView === 'raw'
  dom.startPage.classList.toggle('hidden', !show)
  if (show) renderStartPageList()
}
function renderStartPageList() {
  dom.startPageList.innerHTML = ''
  if (!state.recentFilesCache.length) {
    const e = document.createElement('div'); e.id = 'start-page-recent-empty'; e.textContent = 'No recent files yet.'
    dom.startPageList.appendChild(e)
    return
  }
  state.recentFilesCache.forEach(fp => {
    const row = document.createElement('div')
    row.className = 'start-recent-item'
    row.innerHTML = `<span class="start-recent-name">${escapeHtml(path.basename(fp))}</span><span class="start-recent-path">${escapeHtml(fp)}</span>`
    row.addEventListener('click', async () => {
      const r = await ipc.invoke('open-recent-file', fp)
      if (r) fileOpsMod.loadIntoTabSmart(r.content, r.filePath)
    })
    dom.startPageList.appendChild(row)
  })
}

// ── Table builder ──────────────────────────────────────────────────────────
function openTableBuilder() {
  dom.tableBuilder.classList.remove('hidden')
  updateTablePreview()
  document.getElementById('tbl-cols').addEventListener('input', updateTablePreview)
  document.getElementById('tbl-rows').addEventListener('input', updateTablePreview)
}

function updateTablePreview() {
  const cols = Math.max(1, Math.min(10, parseInt(document.getElementById('tbl-cols').value) || 3))
  const rows = Math.max(1, Math.min(20, parseInt(document.getElementById('tbl-rows').value) || 3))
  const preview = document.getElementById('tbl-preview')
  let html = '<table><tr>' + Array.from({length: cols}, (_, i) => `<th>Col ${i+1}</th>`).join('') + '</tr>'
  for (let r = 0; r < Math.min(rows, 3); r++) {
    html += '<tr>' + Array.from({length: cols}, () => '<td>cell</td>').join('') + '</tr>'
  }
  if (rows > 3) html += `<tr><td colspan="${cols}" style="text-align:center;color:var(--text3)">+${rows-3} more rows</td></tr>`
  html += '</table>'
  preview.innerHTML = html
}

function insertTable() {
  const t = tabsMod.activeTab(); if (!t) return
  const cols = Math.max(1, Math.min(10, parseInt(document.getElementById('tbl-cols').value) || 3))
  const rows = Math.max(1, Math.min(20, parseInt(document.getElementById('tbl-rows').value) || 3))
  const header = '| ' + Array.from({length: cols}, (_, i) => `Header ${i+1}`).join(' | ') + ' |'
  const sep    = '| ' + Array.from({length: cols}, () => '------').join(' | ') + ' |'
  const row    = '| ' + Array.from({length: cols}, () => '      ').join(' | ') + ' |'
  const table  = [header, sep, ...Array.from({length: rows}, () => row)].join('\n')
  const ta = t.textareaEl
  const pos = ta.selectionStart
  const before = ta.value.substring(0, pos)
  const after = ta.value.substring(pos)
  const needsNewline = before.length > 0 && !before.endsWith('\n') ? '\n' : ''
  const insertion = needsNewline + table + '\n'
  ta.focus(); ta.setSelectionRange(pos, pos)
  document.execCommand('insertText', false, insertion)
  if (!ta.value.includes(table)) ta.value = before + insertion + after
  tabsMod.setTabModified(t, true)
  closeTableBuilder()
  renderSidebar()
  updateStatus()
}

function closeTableBuilder() {
  dom.tableBuilder.classList.add('hidden')
  document.getElementById('tbl-cols').removeEventListener('input', updateTablePreview)
  document.getElementById('tbl-rows').removeEventListener('input', updateTablePreview)
}

module.exports.headingColorClass = headingColorClass
module.exports.renderSidebar = renderSidebar
module.exports.highlightActiveLink = highlightActiveLink
module.exports.initActiveSectionTracking = initActiveSectionTracking
module.exports.observeSectionBlocks = observeSectionBlocks
module.exports.jumpToSection = jumpToSection
module.exports.updateFileLabel = updateFileLabel
module.exports.updateStatus = updateStatus
module.exports.toggleSidebar = toggleSidebar
module.exports.initSidebarResize = initSidebarResize
module.exports.toggleZen = toggleZen
module.exports.applyTheme = applyTheme
module.exports.effectiveTheme = effectiveTheme
module.exports.setTheme = setTheme
module.exports.openThemeMenu = openThemeMenu
module.exports.closeDropdown = closeDropdown
module.exports.showDropdown = showDropdown
module.exports.activeEditor = activeEditor
module.exports.openFindBar = openFindBar
module.exports.closeFindBar = closeFindBar
module.exports.runFind = runFind
module.exports.updateFindStatus = updateFindStatus
module.exports.selectCurrentMatch = selectCurrentMatch
module.exports.findNext = findNext
module.exports.findPrev = findPrev
module.exports.replaceOne = replaceOne
module.exports.replaceAll = replaceAll
module.exports.refreshStartPage = refreshStartPage
module.exports.renderStartPageList = renderStartPageList
module.exports.openTableBuilder = openTableBuilder
module.exports.updateTablePreview = updateTablePreview
module.exports.insertTable = insertTable
module.exports.closeTableBuilder = closeTableBuilder
