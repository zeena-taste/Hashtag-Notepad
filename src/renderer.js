const { ipcRenderer } = require('electron')
const path = require('path')
const ipc = ipcRenderer

// ── DOM refs ─────────────────────────────────────────────────────────────
const organisedView   = document.getElementById('organised-view')
const sectionList     = document.getElementById('section-list')
const statusSections  = document.getElementById('status-sections')
const statusLines     = document.getElementById('status-lines')
const statusWords     = document.getElementById('status-words')
const statusChars     = document.getElementById('status-chars')
const statusFile      = document.getElementById('status-file')
const fileNameEl      = document.getElementById('file-name')
const modifiedDot     = document.getElementById('modified-dot')
const dropOverlay     = document.getElementById('drop-overlay')
const saveDialog      = document.getElementById('save-dialog')
const saveDialogMsg   = document.getElementById('save-dialog-msg')
const fmtToolbar      = document.getElementById('fmt-toolbar')
const iconSun         = document.getElementById('icon-sun')
const iconMoon        = document.getElementById('icon-moon')
const sidebar         = document.getElementById('sidebar')
const tableBuilder    = document.getElementById('table-builder')
const tabList         = document.getElementById('tab-list')
const editorTextareas = document.getElementById('editor-textareas')
const startPage       = document.getElementById('start-page')
const startPageList   = document.getElementById('start-page-recent-list')
const findBar         = document.getElementById('find-bar')
const findInput       = document.getElementById('find-input')
const findCount       = document.getElementById('find-count')
const replaceInput    = document.getElementById('replace-input')
const themeToggleBtn  = document.getElementById('theme-toggle')
const exportToggleBtn = document.getElementById('export-toggle')

// ── Global (per-window, not per-tab) state ──────────────────────────────
let tabs              = []
let activeTabId       = null
let tabIdCounter      = 0
let currentView       = 'raw'
let sidebarCollapsed  = false
let dragFromHandle    = false
let dragSrc           = null
let dragGroup         = []
let systemTheme       = 'dark'
let currentThemeId    = null   // null = follow system
let pluginThemes      = []
let zenMode           = false
let pendingCloseQueue = []
let closeWindowAfter  = false
let findMatches       = []
let findIndex         = -1
let openDropdownEl    = null
let recentFilesCache  = []

// ── Small utils ──────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// Guard flag — prevents blur events on destroyed/replaced DOM nodes from
// re-triggering a commit that's already in progress (the main crash cause).
let _committing = false

// Replace a <textarea>'s value while keeping the browser's native undo/redo
// stack intact. execCommand is deprecated but Electron ships a fixed,
// known Chromium version so it's safe to rely on here.
function setEditorValue(ta, newValue) {
  if (document.activeElement === ta) {
    ta.select()
    if (document.execCommand('insertText', false, newValue) && ta.value === newValue) return
  }
  ta.value = newValue
}

// ── Tabs ─────────────────────────────────────────────────────────────────
function activeTab() { return tabs.find(t => t.id === activeTabId) || null }

function newTab(filePath = null, content = '', activate = true) {
  const id = 'tab-' + (++tabIdCounter)

  const ta = document.createElement('textarea')
  ta.className = 'raw-editor hidden'
  ta.spellcheck = true
  ta.placeholder = 'Start typing…\n\nUse #hashtags to create sections\nUse - for bullet points\nUse => for sub-notes\nUse | col | col | for tables\n\nDrag & drop a .txt or .md file to open it'
  ta.value = content
  editorTextareas.appendChild(ta)
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
    if (urlMatch) openURL(urlMatch[0])
  })
  ta.addEventListener('input', () => {
    const t = tabs.find(x => x.textareaEl === ta)
    if (!t) return
    setTabModified(t, true)
    if (t.id === activeTabId) { renderSidebar(); updateStatus(); refreshStartPage() }
  })
  ta.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const s = ta.selectionStart, end = ta.selectionEnd
      ta.value = ta.value.substring(0, s) + '  ' + ta.value.substring(end)
      ta.selectionStart = ta.selectionEnd = s + 2
      const t = tabs.find(x => x.textareaEl === ta)
      if (t) setTabModified(t, true)
    }
  })

  const tabEl = document.createElement('div')
  tabEl.className = 'tab'
  tabEl.innerHTML = `<span class="tab-name"></span><span class="tab-dot hidden">●</span><button class="tab-close" title="Close tab (Ctrl+W)">✕</button>`
  tabEl.addEventListener('mousedown', e => { if (!e.target.classList.contains('tab-close')) switchTab(id) })
  tabEl.querySelector('.tab-close').addEventListener('click', e => { e.stopPropagation(); requestCloseTab(id) })
  tabList.appendChild(tabEl)

  const tab = {
    id, filePath, isMd: filePath ? filePath.toLowerCase().endsWith('.md') : false,
    textareaEl: ta, tabEl, isModified: false,
    doneLines: new Set(), sectionOrder: [], collapsedSections: new Set()
  }
  tabs.push(tab)
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
  const t = tabs.find(x => x.id === id)
  if (!t) return
  activeTabId = id
  tabs.forEach(x => {
    x.tabEl.classList.toggle('active', x.id === id)
    x.textareaEl.classList.toggle('hidden', x.id !== id || currentView !== 'raw')
  })
  updateFileLabel(t.filePath)
  updateWindowTitle()
  renderSidebar()
  updateStatus()
  refreshStartPage()
  if (currentView === 'organised') renderOrganised()
  if (!findBar.classList.contains('hidden')) runFind()
}

function setTabModified(tab, modified) {
  if (tab.isModified === modified) { if (tab.id === activeTabId) updateWindowTitle(); return }
  tab.isModified = modified
  updateTabLabel(tab)
  if (tab.id === activeTabId) {
    modifiedDot.classList.toggle('hidden', !modified)
    updateWindowTitle()
  }
  recomputeWindowModified()
}
function recomputeWindowModified() { ipc.send('set-modified', tabs.some(t => t.isModified)) }

function updateWindowTitle() {
  const t = activeTab()
  const name = t && t.filePath ? path.basename(t.filePath) : 'untitled.txt'
  const title = (t && t.isModified ? '● ' : '') + name + ' — Hashtag Notepad'
  ipc.send('set-title', title)
}

// ── Closing tabs / windows (with save prompts) ──────────────────────────
function requestCloseTab(id) {
  const t = tabs.find(x => x.id === id)
  if (!t) return
  if (t.isModified) {
    pendingCloseQueue = [id]
    closeWindowAfter = tabs.length === 1
    promptSaveForTab(id)
  } else {
    finalizeTabClose(id)
    if (tabs.length === 0) ipc.send('force-close')
  }
}

function requestCloseWindow() {
  const unsaved = tabs.filter(t => t.isModified).map(t => t.id)
  if (!unsaved.length) { ipc.send('force-close'); return }
  pendingCloseQueue = unsaved
  closeWindowAfter = true
  promptSaveForTab(pendingCloseQueue[0])
}

function promptSaveForTab(id) {
  const t = tabs.find(x => x.id === id)
  const name = t && t.filePath ? path.basename(t.filePath) : 'untitled.txt'
  saveDialogMsg.textContent = `Save changes to ${name} before closing?`
  saveDialog._tabId = id
  saveDialog.classList.remove('hidden')
}

async function saveAndClose() {
  saveDialog.classList.add('hidden')
  const id = saveDialog._tabId
  if (id !== activeTabId) switchTab(id)
  await saveFile()
  advanceCloseQueue()
}
function discardAndClose() {
  saveDialog.classList.add('hidden')
  const id = saveDialog._tabId
  const t = tabs.find(x => x.id === id)
  if (t) { t.isModified = false; updateTabLabel(t) }
  advanceCloseQueue()
}
function cancelClose() {
  saveDialog.classList.add('hidden')
  pendingCloseQueue = []
  closeWindowAfter = false
}
function advanceCloseQueue() {
  const id = pendingCloseQueue.shift()
  finalizeTabClose(id)
  if (pendingCloseQueue.length) { promptSaveForTab(pendingCloseQueue[0]); return }
  if (closeWindowAfter || tabs.length === 0) ipc.send('force-close')
}
function finalizeTabClose(id) {
  const idx = tabs.findIndex(x => x.id === id)
  if (idx === -1) return
  const t = tabs[idx]
  t.textareaEl.remove()
  t.tabEl.remove()
  tabs.splice(idx, 1)
  recomputeWindowModified()
  if (activeTabId === id) {
    const next = tabs[idx] || tabs[idx - 1] || tabs[0]
    if (next) switchTab(next.id)
    else activeTabId = null
  }
}

// ── Parse ──────────────────────────────────────────────────────────────────
function parseContent(text, isMd) {
  const lines = text.split('\n')
  const sections = []
  let current = null, pre = [], inCode = false
  for (const line of lines) {
    if (line.startsWith('```')) inCode = !inCode
    const re = isMd ? /^(#{1,6})\s+(.+)$/ : /^(#+)\s*(.+)$/
    const m = !inCode && line.match(re)
    if (m) {
      if (current) sections.push(current)
      else if (pre.length) sections.push({ tag: null, title: null, level: 0, lines: [...pre] })
      current = { tag: m[1], title: m[2].trim(), level: m[1].length, lines: [] }
      pre = []
    } else {
      if (current) current.lines.push(line); else pre.push(line)
    }
  }
  if (current) sections.push(current)
  else if (pre.length) sections.push({ tag: null, title: null, level: 0, lines: [...pre] })
  return sections
}

function sectionsToText(sections, isMd) {
  return sections.map(s => {
    if (!s.title) return s.lines.join('\n')
    return (s.tag || '#') + (isMd ? ' ' : '') + s.title + '\n' + s.lines.join('\n')
  }).join('\n')
}

// ── Hidden state block (done/order/collapsed persistence) ──────────────
// Appended invisibly to the saved file as a trailing HTML comment so the
// data survives being closed and reopened, without cluttering the visible
// editor. Any other program opening the file just sees an inert comment.
const STATE_BLOCK_RE = /\n*<!--\s*hashtag-notepad:state\s*\n([\s\S]*?)\n-->\s*$/

function parseStateBlock(rawText) {
  const m = rawText.match(STATE_BLOCK_RE)
  if (!m) return { content: rawText, state: null }
  let state = null
  try { state = JSON.parse(m[1]) } catch { state = null }
  return { content: rawText.slice(0, m.index), state }
}

function serializeStateBlockFor(tab) {
  const state = {
    done: [...tab.doneLines],
    order: tab.sectionOrder,
    collapsed: [...tab.collapsedSections]
  }
  if (!state.done.length && !state.order.length && !state.collapsed.length) return ''
  return '\n\n<!-- hashtag-notepad:state\n' + JSON.stringify(state) + '\n-->\n'
}

function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

// ── Table parsing ──────────────────────────────────────────────────────────
function isTableRow(line) { return /^\|.+\|/.test(line.trim()) }
function isTableSep(line) { return /^\|[\s\-:|]+\|/.test(line.trim()) }

function parseTable(lines, startIdx) {
  const tableLines = []
  let i = startIdx
  while (i < lines.length && (isTableRow(lines[i]) || isTableSep(lines[i]))) {
    tableLines.push(lines[i])
    i++
  }
  return { tableLines, endIdx: i }
}

function parseHeaderCell(raw) {
  const m = raw.match(/^\^(.+?)(\^*)$/)
  if (m) {
    const label = m[1].trim()
    const span = 1 + m[2].length
    return { label, span }
  }
  return { label: raw, span: 1 }
}

function renderTable(tableLines, sectionTitle, lineOffset) {
  const table = document.createElement('table')
  table.className = 'md-table'
  let headerDone = false

  tableLines.forEach((line, tli) => {
    if (isTableSep(line)) { headerDone = true; return }
    const rawCells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
    const row = document.createElement('tr')
    const isHeader = !headerDone
    const rawLineIdx = (lineOffset !== undefined) ? lineOffset + tli : undefined

    rawCells.forEach((rawCell, ci) => {
      const isSpanned = rawCell.startsWith('^')
      const { label, span } = parseHeaderCell(rawCell)

      const el = document.createElement(isHeader ? 'th' : 'td')
      if (span > 1) {
        el.colSpan = span
        el.classList.add(isHeader ? 'th-spanned' : 'td-spanned')
      }
      el.textContent = label

      if (sectionTitle !== undefined && rawLineIdx !== undefined) {
        el.classList.add('table-cell-editable')
        el.title = isSpanned ? `Click to edit (spans ${span} cols)` : 'Click to edit'

        el.addEventListener('click', e => {
          e.stopPropagation()
          if (el.querySelector('input')) return
          const input = document.createElement('input')
          input.type = 'text'
          input.value = rawCell
          input.className = 'table-cell-input'
          el.textContent = ''
          el.appendChild(input)
          input.focus(); input.select()

          const commit = () => {
            const newVal = input.value
            const parsed = parseHeaderCell(newVal)
            el.textContent = parsed.label
            el.colSpan = parsed.span > 1 ? parsed.span : 1
            if (parsed.span > 1) el.classList.add(isHeader ? 'th-spanned' : 'td-spanned')
            else el.classList.remove('th-spanned', 'td-spanned')
            commitTableCell(sectionTitle, rawLineIdx, ci, newVal)
          }
          input.addEventListener('blur', commit)
          input.addEventListener('keydown', ke => {
            if (ke.key === 'Enter') { ke.preventDefault(); input.blur() }
            if (ke.key === 'Escape') { input.value = rawCell; input.blur() }
            if (ke.key === 'Tab') {
              ke.preventDefault(); input.blur()
              const allCells = table.querySelectorAll('th.table-cell-editable, td.table-cell-editable')
              const idx = Array.from(allCells).indexOf(el)
              const next = allCells[ke.shiftKey ? idx - 1 : idx + 1]
              if (next) next.click()
            }
          })
        })
      }
      row.appendChild(el)
    })
    table.appendChild(row)
  })

  const wrap = document.createElement('div')
  wrap.style.overflowX = 'auto'
  wrap.appendChild(table)
  return wrap
}

function commitTableCell(sectionTitle, lineIdx, colIdx, newValue) {
  const t = activeTab(); if (!t) return
  const sections = parseContent(t.textareaEl.value, t.isMd)
  const sec = sections.find(s => s.title === sectionTitle)
  if (!sec) return
  const line = sec.lines[lineIdx]
  if (!line) return
  const parts = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
  parts[colIdx] = newValue
  const newLine = '| ' + parts.join(' | ') + ' |'
  sec.lines[lineIdx] = newLine
  setEditorValue(t.textareaEl, sectionsToText(sections, t.isMd))
  setTabModified(t, true)
  updateStatus()
}

// ── Link detection ─────────────────────────────────────────────────────────
// Matches https://, http://, and www. URLs
const URL_RE = /https?:\/\/[^\s)<>"]+|www\.[^\s)<>"]+/g
// Matches markdown links: [label](url)
const MD_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g

function openURL(url) {
  // Ensure www. links get a protocol before opening
  const full = url.startsWith('www.') ? 'https://' + url : url
  require('electron').shell.openExternal(full)
}

// ── Inline formatting renderer ─────────────────────────────────────────────
// Tokenizes text into: md-link, url, bold, italic, underline, code, plain.
// Order matters — md-links are checked before plain URLs so [label](url)
// doesn't get partially matched by the URL regex first.
function tokenizeInline(text) {
  const tokens = []
  let i = 0
  while (i < text.length) {
    // Markdown link: [label](url)
    if (text[i] === '[') {
      const mdm = text.slice(i).match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)/)
      if (mdm) { tokens.push({ type: 'md-link', label: mdm[1], url: mdm[2] }); i += mdm[0].length; continue }
    }
    // Plain URL: https:// or http:// or www.
    if (text.startsWith('https://', i) || text.startsWith('http://', i) || text.startsWith('www.', i)) {
      const rest = text.slice(i)
      const um = rest.match(/^(https?:\/\/[^\s)<>"]+|www\.[^\s)<>"]+)/)
      if (um) { tokens.push({ type: 'url', url: um[1] }); i += um[1].length; continue }
    }
    // Bold: **text**
    if (text.startsWith('**', i)) { const end = text.indexOf('**', i + 2); if (end !== -1) { tokens.push({ type: 'bold', text: text.slice(i + 2, end) }); i = end + 2; continue } }
    // Italic: *text*
    if (text[i] === '*' && text[i + 1] !== '*') { const end = text.indexOf('*', i + 1); if (end !== -1) { tokens.push({ type: 'italic', text: text.slice(i + 1, end) }); i = end + 1; continue } }
    // Underline: __text__
    if (text.startsWith('__', i)) { const end = text.indexOf('__', i + 2); if (end !== -1) { tokens.push({ type: 'underline', text: text.slice(i + 2, end) }); i = end + 2; continue } }
    // Inline code: `text`
    if (text[i] === '`') { const end = text.indexOf('`', i + 1); if (end !== -1) { tokens.push({ type: 'code', text: text.slice(i + 1, end) }); i = end + 1; continue } }
    // Plain text — accumulate into previous plain token if possible
    if (tokens.length && tokens[tokens.length - 1].type === 'plain') tokens[tokens.length - 1].text += text[i]
    else tokens.push({ type: 'plain', text: text[i] })
    i++
  }
  return tokens
}

function makeLink(label, url) {
  const a = document.createElement('a')
  a.className = 'inline-link'
  a.textContent = label
  a.title = url
  a.href = '#'
  a.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openURL(url) })
  return a
}

function renderInlineFormatting(text) {
  const span = document.createElement('span')
  span.className = 'line-text'
  tokenizeInline(text).forEach(tok => {
    let el
    if      (tok.type === 'md-link')   el = makeLink(tok.label, tok.url)
    else if (tok.type === 'url')       el = makeLink(tok.url, tok.url)
    else if (tok.type === 'bold')      { el = document.createElement('span'); el.className = 'fmt-bold'; el.textContent = tok.text }
    else if (tok.type === 'italic')    { el = document.createElement('span'); el.className = 'fmt-italic'; el.textContent = tok.text }
    else if (tok.type === 'underline') { el = document.createElement('span'); el.className = 'fmt-underline'; el.textContent = tok.text }
    else if (tok.type === 'code')      { el = document.createElement('span'); el.className = 'md-inline-code'; el.textContent = tok.text }
    else                               el = document.createTextNode(tok.text)
    span.appendChild(el)
  })
  return span
}

// Creates a span that:
//  • Shows rendered inline formatting (bold/italic/etc) when idle
//  • Switches to plain raw text on click so the user edits the markdown source
//  • Calls onCommit(rawText) on blur, guarded against recursive firing
function makeEditableSpan(rawText, onCommit) {
  const span = document.createElement('span')
  span.className = 'line-text'

  function showFormatted() {
    // Remove contenteditable entirely — don't set it to 'false'.
    // Setting contenteditable="false" on a child of a non-editable parent
    // causes Chromium to swallow clicks before our listener fires.
    span.removeAttribute('contenteditable')
    span.innerHTML = ''
    const rendered = renderInlineFormatting(rawText)
    while (rendered.firstChild) span.appendChild(rendered.firstChild)
    span.style.cursor = 'text'
  }

  function showRaw() {
    span.contentEditable = 'true'
    span.textContent = rawText
    span.style.cursor = 'text'
  }

  showFormatted()

  span.addEventListener('click', e => {
    e.stopPropagation()
    if (span.contentEditable === 'true') return  // already editing
    showRaw()
    // Place cursor at click position — just focus, browser handles cursor
    span.focus()
  })

  span.addEventListener('blur', () => {
    if (_committing) return
    if (span.contentEditable !== 'true') return  // wasn't in edit mode
    const newRaw = span.textContent
    rawText = newRaw
    showFormatted()
    onCommit(newRaw)
  })

  span.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); span.blur() }
    if (e.key === 'Escape') { showFormatted(); e.preventDefault() }
  })

  return span
}

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
  const t = activeTab()
  sectionList.innerHTML = ''
  if (!t) return
  const sections = parseContent(t.textareaEl.value, t.isMd)
  sections.filter(s => s.title).forEach(s => {
    const el = document.createElement('div')
    el.className = 'section-link'
    const depth = Math.max(0, (s.level || 1) - 1)
    const cc = t.isMd ? headingColorClass(s.level) : ''
    el.innerHTML = `<span style="width:${depth * 10}px;display:inline-block;flex-shrink:0"></span><span class="sl-label ${cc}">${s.tag}${t.isMd ? ' ' : ''}${escapeHtml(s.title)}</span>`
    el.onclick = () => jumpToSection(s.title)
    sectionList.appendChild(el)
  })
}

function jumpToSection(title) {
  const t = activeTab(); if (!t) return
  if (currentView === 'organised') {
    const el = document.getElementById('sec-' + CSS.escape(title))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } else {
    const text = t.textareaEl.value
    const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = new RegExp('^#+\\s*' + esc + '$', 'm').exec(text)
    if (m) { t.textareaEl.focus(); t.textareaEl.setSelectionRange(m.index, m.index); t.textareaEl.scrollTop = text.substring(0, m.index).split('\n').length * 24 }
  }
}

// ── MD inline render ───────────────────────────────────────────────────────
function renderMdInline(text) {
  // Reuse the same tokenizer so .md files get clickable links too
  return renderInlineFormatting(text)
}

function renderMdLines(lines, body) {
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (isTableRow(line)) {
      const { tableLines, endIdx } = parseTable(lines, i)
      body.appendChild(renderTable(tableLines))
      i = endIdx; continue
    }
    const hm = line.match(/^(#{1,6})\s+(.+)$/)
    if (hm) { const d = document.createElement('div'); d.className = 'md-h' + hm[1].length; d.appendChild(renderMdInline(hm[2])); body.appendChild(d); i++; continue }
    if (line.startsWith('> ')) { const d = document.createElement('div'); d.className = 'md-blockquote'; d.appendChild(renderMdInline(line.substring(2))); body.appendChild(d); i++; continue }
    if (line.match(/^[-*] /)) { const item = document.createElement('div'); item.className = 'line-item'; const dot = document.createElement('span'); dot.className = 'bullet-dot'; dot.textContent = '–'; const txt = document.createElement('span'); txt.appendChild(renderMdInline(line.substring(2))); item.appendChild(dot); item.appendChild(txt); body.appendChild(item); i++; continue }
    if (line.match(/^-{3,}$/) || line.match(/^\*{3,}$/)) { const hr = document.createElement('div'); hr.className = 'md-hr'; body.appendChild(hr); i++; continue }
    if (line.trim() === '') { const sp = document.createElement('div'); sp.style.height = '6px'; body.appendChild(sp); i++; continue }
    const d = document.createElement('div'); d.className = 'md-plain'; d.appendChild(renderMdInline(line)); body.appendChild(d); i++
  }
}

// ── Organised view ─────────────────────────────────────────────────────────
function applyOrder(sections, tab) {
  if (!tab.sectionOrder.length) return sections
  const titled = sections.filter(s => s.title), untitled = sections.filter(s => !s.title), ordered = []
  tab.sectionOrder.forEach(t => { const f = titled.find(s => s.title === t); if (f) ordered.push(f) })
  titled.forEach(s => { if (!tab.sectionOrder.includes(s.title)) ordered.push(s) })
  return [...untitled, ...ordered]
}

// A section "owns" every section immediately after it whose heading level is
// deeper (e.g. dragging an H1 carries its H2/H3 children with it; dragging an
// H2 carries only its own H3+ children, not sibling H2s). Leaf sections just
// return themselves, so plain flat lists behave exactly as before.
function getSubtreeTitles(displayedSections, title) {
  const idx = displayedSections.findIndex(s => s.title === title)
  if (idx === -1) return [title]
  const level = displayedSections[idx].level
  const group = [title]
  for (let i = idx + 1; i < displayedSections.length; i++) {
    if (displayedSections[i].level > level) group.push(displayedSections[i].title)
    else break
  }
  return group
}

function reorderSections(from, to) {
  const t = activeTab(); if (!t) return
  const sections = parseContent(t.textareaEl.value, t.isMd)
  const displayed = applyOrder(sections, t).filter(s => s.title)
  const group = getSubtreeTitles(displayed, from)
  if (group.includes(to)) return // can't drop a section inside its own subtree

  const remaining = displayed.filter(s => !group.includes(s.title))
  const groupSections = displayed.filter(s => group.includes(s.title))
  const ti = remaining.findIndex(s => s.title === to)
  const newDisplayed = ti === -1
    ? [...remaining, ...groupSections]
    : [...remaining.slice(0, ti), ...groupSections, ...remaining.slice(ti)]

  t.sectionOrder = newDisplayed.map(s => s.title)
  setEditorValue(t.textareaEl, sectionsToText(applyOrder(sections, t), t.isMd))
  setTabModified(t, true); renderOrganised(); updateStatus()
}

function renderOrganised() {
  const t = activeTab()
  organisedView.innerHTML = ''
  if (!t) return
  const sections = parseContent(t.textareaEl.value, t.isMd)
  renderSidebar()
  const ordered = applyOrder(sections, t).filter(s => s.title)
  ordered.forEach((s, idx) => {
    const isCollapsed = t.collapsedSections.has(s.title)
    // A section "has children" when the very next section (in display order)
    // is nested deeper than it — i.e. this heading is really an organisational
    // parent, not a leaf meant to hold its own checklist items.
    const hasChildren = idx + 1 < ordered.length && ordered[idx + 1].level > s.level
    const block = document.createElement('div')
    block.className = 'section-block' + (hasChildren ? ' has-children' : '')
    block.id = 'sec-' + s.title; block.dataset.title = s.title
    block.style.marginLeft = (Math.max(0, (s.level || 1) - 1) * 18) + 'px'
    block.draggable = true
    const cc = t.isMd ? headingColorClass(s.level) : ''
    const head = document.createElement('div')
    head.className = 'section-head'

    // LEFT zone: drag handle + chevron → always collapses/expands
    const leftZone = document.createElement('div')
    leftZone.className = 'section-head-left'
    leftZone.innerHTML = `<span class="drag-handle" title="Drag to reorder">⠿</span><span class="chevron ${isCollapsed ? '' : 'open'}">▶</span>`
    leftZone.querySelector('.drag-handle').addEventListener('mousedown', () => { dragFromHandle = true })
    leftZone.addEventListener('click', e => { e.stopPropagation(); toggleSection(s.title) })

    // TITLE zone: only the text → opens section edit on click
    const titleZone = document.createElement('div')
    titleZone.className = 'section-head-title-zone'
    const titleSpan = document.createElement('span')
    titleSpan.className = 'sec-title ' + cc
    titleSpan.textContent = s.title
    titleZone.appendChild(titleSpan)
    titleZone.addEventListener('click', e => { e.stopPropagation(); openSectionEdit(block, s) })

    // RIGHT zone: tag + optional badge → collapses/expands
    const rightZone = document.createElement('div')
    rightZone.className = 'section-head-right'
    const tagSpan = document.createElement('span')
    tagSpan.className = 'sec-tag'
    tagSpan.textContent = s.tag
    rightZone.appendChild(tagSpan)
    if (hasChildren) {
      const badge = document.createElement('span')
      badge.className = 'sec-parent-badge'
      badge.title = 'Has nested subsections — drag moves children too'
      badge.textContent = '▾ group'
      rightZone.appendChild(badge)
    }
    rightZone.addEventListener('click', e => { e.stopPropagation(); toggleSection(s.title) })

    head.appendChild(leftZone)
    head.appendChild(titleZone)
    head.appendChild(rightZone)
    block.addEventListener('dragstart', e => {
      if (!dragFromHandle) { e.preventDefault(); return }
      dragSrc = block; block.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('application/x-section', block.dataset.title)
      dragGroup = getSubtreeTitles(ordered, s.title)
      dragGroup.forEach(title => { if (title !== s.title) document.getElementById('sec-' + title)?.classList.add('dragging-child') })
    })
    block.addEventListener('dragend', () => {
      dragFromHandle = false
      document.querySelectorAll('.section-block').forEach(b => b.classList.remove('dragging', 'drag-over', 'dragging-child'))
      dragSrc = null; dragGroup = []
    })
    block.addEventListener('dragover', e => {
      if (!dragSrc || dragGroup.includes(s.title)) return
      e.preventDefault(); e.stopPropagation()
      if (block !== dragSrc) { document.querySelectorAll('.section-block').forEach(b => b.classList.remove('drag-over')); block.classList.add('drag-over') }
    })
    block.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation()
      if (dragSrc && dragSrc !== block && !dragGroup.includes(s.title)) reorderSections(dragSrc.dataset.title, block.dataset.title)
      dragSrc = null; dragGroup = []
    })
    const body = document.createElement('div'); body.className = 'section-body' + (isCollapsed ? ' hidden' : '')
    buildBody(body, s, hasChildren)
    block.appendChild(head); block.appendChild(body); organisedView.appendChild(block)
  })
}
document.addEventListener('mouseup', () => { dragFromHandle = false })

function buildBody(body, s, hasChildren) {
  const t = activeTab(); if (!t) return
  body.innerHTML = ''
  const lines = trimTrailingEmpty(s.lines)
  if (!lines.length) {
    // A heading that exists purely to group nested subsections isn't an
    // empty checklist — don't invite the user to "add items" to it, since
    // its content lives in the child sections below, not here.
    const e = document.createElement('div')
    if (hasChildren) { e.className = 'empty-section empty-section-parent'; e.textContent = '— nested subsections below —' }
    else { e.className = 'empty-section'; e.textContent = 'no items yet — click title to add' }
    body.appendChild(e)
    return
  }
  let inCode = false, codeLines = [], i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) { if (inCode) { const pre = document.createElement('div'); pre.className = 'md-code-block'; pre.textContent = codeLines.join('\n'); body.appendChild(pre); codeLines = []; inCode = false } else { inCode = true } i++; continue }
    if (inCode) { codeLines.push(line); i++; continue }
    if (t.isMd) {
      if (isTableRow(line)) {
        const { tableLines, endIdx } = parseTable(lines, i)
        body.appendChild(renderTable(tableLines, s.title, i))
        i = endIdx; continue
      }
      renderMdLines([line], body); i++; continue
    }

    if (isTableRow(line)) {
      const { tableLines, endIdx } = parseTable(lines, i)
      body.appendChild(renderTable(tableLines, s.title, i))
      i = endIdx; continue
    }

    const key = s.title + '::' + i, isDone = t.doneLines.has(key)
    if (line.trim() === '') { const sp = document.createElement('div'); sp.style.height = '6px'; body.appendChild(sp); i++; continue }

    if (line.startsWith('=> ') || line.startsWith('-> ')) {
      const prefix = line.startsWith('=> ') ? '=> ' : '-> '
      const rawContent = line.slice(prefix.length)
      const item = document.createElement('div'); item.className = 'line-item arrow-line'
      const txt = makeEditableSpan(rawContent, (val) => commitInlineEdit(s.title, i, prefix + val))
      item.appendChild(txt); body.appendChild(item); i++; continue
    }

    if (line.startsWith('- ')) {
      const rawContent = line.slice(2)
      const item = document.createElement('div'); item.className = 'line-item' + (isDone ? ' done' : '')
      const chk = document.createElement('span'); chk.className = 'check'; chk.textContent = isDone ? '✓' : ''
      chk.onclick = e => { e.stopPropagation(); toggleDone(key) }
      const txt = makeEditableSpan(rawContent, (val) => commitInlineEdit(s.title, i, '- ' + val))
      item.appendChild(chk); item.appendChild(txt); body.appendChild(item); i++; continue
    }

    // Plain line
    const item = document.createElement('div'); item.className = 'line-item'
    const txt = makeEditableSpan(line, (val) => commitInlineEdit(s.title, i, val))
    item.appendChild(txt); body.appendChild(item); i++
  }
  if (inCode) { const pre = document.createElement('div'); pre.className = 'md-code-block'; pre.textContent = codeLines.join('\n'); body.appendChild(pre) }
}

function openSectionEdit(block, s) {
  const body = block.querySelector('.section-body')
  const t = activeTab(); if (!t) return
  body.classList.remove('hidden'); t.collapsedSections.delete(s.title)
  if (block.querySelector('.section-edit-area')) { block.querySelector('.section-edit-area').focus(); return }
  const ta = document.createElement('textarea'); ta.className = 'section-edit-area'
  ta.value = s.lines.join('\n'); ta.rows = Math.max(3, s.lines.length + 1)
  body.innerHTML = ''; body.appendChild(ta); ta.focus()
  ta.addEventListener('blur', () => commitSectionEdit(s.title, ta.value))
  ta.addEventListener('keydown', e => { if (e.key === 'Escape') ta.blur() })
}

function commitSectionEdit(title, newContent) {
  if (_committing) return
  _committing = true
  try {
    const t = activeTab(); if (!t) return
    const sections = parseContent(t.textareaEl.value, t.isMd)
    const sec = sections.find(s => s.title === title); if (!sec) return
    sec.lines = newContent.split('\n')
    setEditorValue(t.textareaEl, sectionsToText(sections, t.isMd))
    setTabModified(t, true)
    // Defer the re-render so the blur event fully completes before we
    // destroy and rebuild the DOM (destroying mid-blur causes another blur)
    setTimeout(() => { renderOrganised(); updateStatus() }, 0)
  } finally {
    setTimeout(() => { _committing = false }, 0)
  }
}

function commitInlineEdit(title, li, newText) {
  if (_committing) return
  _committing = true
  try {
    const t = activeTab(); if (!t) return
    const sections = parseContent(t.textareaEl.value, t.isMd)
    const sec = sections.find(s => s.title === title); if (!sec) return
    // Only write back if the text actually changed — avoids spurious re-renders
    // when the user just clicked away without editing
    if (sec.lines[li] === newText) return
    sec.lines[li] = newText
    setEditorValue(t.textareaEl, sectionsToText(sections, t.isMd))
    setTabModified(t, true)
    setTimeout(() => { updateStatus() }, 0)
  } finally {
    setTimeout(() => { _committing = false }, 0)
  }
}

// ── Table builder ──────────────────────────────────────────────────────────
function openTableBuilder() {
  tableBuilder.classList.remove('hidden')
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
  const t = activeTab(); if (!t) return
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
  setTabModified(t, true)
  closeTableBuilder()
  renderSidebar()
  updateStatus()
}

function closeTableBuilder() {
  tableBuilder.classList.add('hidden')
  document.getElementById('tbl-cols').removeEventListener('input', updateTablePreview)
  document.getElementById('tbl-rows').removeEventListener('input', updateTablePreview)
}

// ── Format toolbar ─────────────────────────────────────────────────────────
function applyFormat(type) {
  const t = activeTab(); if (!t) return
  const wrappers = { bold: ['**', '**'], italic: ['*', '*'], underline: ['__', '__'], code: ['`', '`'] }
  const [open, close] = wrappers[type]

  // ── Organised view: wrap selected text inside the active editable span ──
  if (currentView === 'organised') {
    const active = document.activeElement
    if (!active || active.contentEditable !== 'true') return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
    const selectedText = sel.getRangeAt(0).toString()
    if (!selectedText) return
    // Insert the wrapped text using execCommand so undo works
    document.execCommand('insertText', false, open + selectedText + close)
    return
  }

  // ── Raw view: wrap selected text in the textarea ──
  const ta = t.textareaEl
  const s = ta.selectionStart, e = ta.selectionEnd
  if (s === e) return
  const selected = ta.value.slice(s, e)
  const replacement = open + selected + close
  ta.setSelectionRange(s, e)
  const ok = document.execCommand('insertText', false, replacement)
  if (!ok) ta.value = ta.value.slice(0, s) + replacement + ta.value.slice(e)
  ta.setSelectionRange(s + open.length, s + open.length + selected.length)
  ta.focus()
  setTabModified(t, true)
  renderSidebar(); updateStatus()
}

// ── Done / collapse / expand ───────────────────────────────────────────────
function toggleDone(key) {
  const t = activeTab(); if (!t) return
  if (t.doneLines.has(key)) t.doneLines.delete(key); else t.doneLines.add(key)
  setTabModified(t, true)
  renderOrganised()
}
function toggleSection(title) {
  const t = activeTab(); if (!t) return
  if (t.collapsedSections.has(title)) t.collapsedSections.delete(title); else t.collapsedSections.add(title)
  setTabModified(t, true)
  renderOrganised()
}
function collapseAll() {
  const t = activeTab(); if (!t) return
  parseContent(t.textareaEl.value, t.isMd).filter(s => s.title).forEach(s => t.collapsedSections.add(s.title))
  setTabModified(t, true)
  if (currentView === 'organised') renderOrganised()
}
function expandAll() {
  const t = activeTab(); if (!t) return
  t.collapsedSections.clear()
  setTabModified(t, true)
  if (currentView === 'organised') renderOrganised()
}
function trimTrailingEmpty(lines) { let e = lines.length; while (e > 0 && lines[e - 1].trim() === '') e--; return lines.slice(0, e) }

// ── View ───────────────────────────────────────────────────────────────────
function switchView(view) {
  currentView = view
  document.getElementById('btn-raw').classList.toggle('active', view === 'raw')
  document.getElementById('btn-organised').classList.toggle('active', view === 'organised')
  tabs.forEach(t => t.textareaEl.classList.toggle('hidden', view !== 'raw' || t.id !== activeTabId))
  organisedView.classList.toggle('hidden', view !== 'organised')
  fmtToolbar.classList.toggle('hidden', view !== 'organised')
  if (view === 'organised') renderOrganised()
  else renderSidebar()
}

// ── File ops ───────────────────────────────────────────────────────────────
function newWindow() { ipc.send('new-window') }

async function openFile() {
  const r = await ipc.invoke('open-file')
  if (r) loadIntoTabSmart(r.content, r.filePath)
}

async function saveFile() {
  const t = activeTab(); if (!t) return
  const content = t.textareaEl.value + serializeStateBlockFor(t)
  const r = await ipc.invoke('save-file', { content, filePath: t.filePath })
  if (r) {
    t.filePath = r
    t.isMd = r.toLowerCase().endsWith('.md')
    setTabModified(t, false)
    updateTabLabel(t)
    updateFileLabel(r)
  }
}

async function saveAs() {
  const t = activeTab(); if (!t) return
  const content = t.textareaEl.value + serializeStateBlockFor(t)
  const r = await ipc.invoke('save-as', content)
  if (r) {
    t.filePath = r
    t.isMd = r.toLowerCase().endsWith('.md')
    setTabModified(t, false)
    updateTabLabel(t)
    updateFileLabel(r)
  }
}

// Opens content into the current tab if it's a blank/untitled/unmodified
// tab (so "Open" from an empty new tab doesn't spawn a redundant extra
// tab); otherwise opens a new tab, keeping other open files untouched.
function loadIntoTabSmart(content, filePath) {
  const t = activeTab()
  if (t && !t.filePath && !t.isModified && t.textareaEl.value === '') {
    loadFileIntoTab(t, content, filePath)
  } else {
    loadFileIntoTab(newTab(), content, filePath)
  }
}

function loadFileIntoTab(tab, rawContent, filePath) {
  const normalized = normalizeLineEndings(rawContent)
  const { content, state } = parseStateBlock(normalized)
  tab.filePath = filePath
  tab.isMd = filePath ? filePath.toLowerCase().endsWith('.md') : false
  tab.doneLines = new Set((state && state.done) || [])
  tab.sectionOrder = (state && state.order) || []
  tab.collapsedSections = new Set((state && state.collapsed) || [])
  tab.textareaEl.value = content
  tab.isModified = false
  updateTabLabel(tab)
  recomputeWindowModified()
  if (tab.id === activeTabId) {
    updateFileLabel(filePath)
    updateWindowTitle()
    renderSidebar()
    updateStatus()
    refreshStartPage()
    if (currentView === 'organised') renderOrganised()
  }
}

function updateFileLabel(fp) {
  fileNameEl.textContent = fp ? path.basename(fp) : 'untitled.txt'
  statusFile.textContent = fp || 'untitled.txt'
}

function updateStatus() {
  const t = activeTab()
  const text = t ? t.textareaEl.value : ''
  const s = parseContent(text, t ? t.isMd : false).filter(s => s.title)
  statusSections.textContent = s.length + ' section' + (s.length !== 1 ? 's' : '')
  statusLines.textContent = text.split('\n').length + ' lines'
  const words = (text.match(/\S+/g) || []).length
  statusWords.textContent = words + (words === 1 ? ' word' : ' words')
  statusChars.textContent = text.length + (text.length === 1 ? ' char' : ' chars')
}

// ── Sidebar toggle ───────────────────────────────────────────────────────
function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed
  sidebar.classList.toggle('collapsed', sidebarCollapsed)
}

// ── Zen mode ─────────────────────────────────────────────────────────────
function toggleZen() {
  zenMode = !zenMode
  document.body.classList.toggle('zen', zenMode)
  if (zenMode) {
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
  iconSun.classList.toggle('hidden', isLightish)
  iconMoon.classList.toggle('hidden', !isLightish)
}
function effectiveTheme() { return currentThemeId || systemTheme }
function setTheme(id) {
  currentThemeId = id
  applyTheme(effectiveTheme())
  ipc.send('set-theme-pref', id)
}
ipc.on('system-theme', (_, t) => { systemTheme = t; if (!currentThemeId) applyTheme(t) })

function openThemeMenu() {
  const items = [
    { label: 'System', active: currentThemeId === null, onClick: () => setTheme(null) },
    { label: 'Dark', active: currentThemeId === 'dark', onClick: () => setTheme('dark') },
    { label: 'Light', active: currentThemeId === 'light', onClick: () => setTheme('light') }
  ]
  if (pluginThemes.length) {
    items.push({ type: 'sep' })
    pluginThemes.forEach(p => items.push({ label: p.name, active: currentThemeId === p.id, onClick: () => setTheme(p.id) }))
  }
  showDropdown(themeToggleBtn, items)
}

// ── Generic dropdown menu (theme picker, export menu) ───────────────────
function closeDropdown() { if (openDropdownEl) { openDropdownEl.remove(); openDropdownEl = null } }
document.addEventListener('mousedown', e => { if (openDropdownEl && !openDropdownEl.contains(e.target)) closeDropdown() })

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
  openDropdownEl = menu
}

themeToggleBtn.addEventListener('click', e => { e.stopPropagation(); openThemeMenu() })
exportToggleBtn.addEventListener('click', e => {
  e.stopPropagation()
  showDropdown(exportToggleBtn, [
    { label: 'Export as HTML…', onClick: exportAsHTML },
    { label: 'Export as PDF…', onClick: exportAsPDF }
  ])
})

// ── Export (Organised view → standalone HTML / PDF) ─────────────────────
// Renders the same structure as the Organised view, but as static markup:
// no editable fields, no drag handles — just a clean read-only document,
// which is what makes it worth turning into a PDF or a shareable HTML page.
function renderInlineHtml(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
}

function buildExportSectionsHtml(tab) {
  const sections = applyOrder(parseContent(tab.textareaEl.value, tab.isMd), tab).filter(s => s.title)
  let out = ''
  sections.forEach(s => {
    out += `<section class="exp-section"><h2 class="exp-h${Math.min(s.level, 6)}">${escapeHtml(s.title)}</h2>`
    const lines = trimTrailingEmpty(s.lines)
    let inCode = false, codeLines = [], i = 0
    while (i < lines.length) {
      const line = lines[i]
      if (line.startsWith('```')) {
        if (inCode) { out += `<pre class="exp-code">${escapeHtml(codeLines.join('\n'))}</pre>`; codeLines = []; inCode = false }
        else inCode = true
        i++; continue
      }
      if (inCode) { codeLines.push(line); i++; continue }
      if (isTableRow(line)) {
        const { tableLines, endIdx } = parseTable(lines, i)
        out += '<table class="exp-table">'
        let headerDone = false
        tableLines.forEach(tl => {
          if (isTableSep(tl)) { headerDone = true; return }
          const cells = tl.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
          out += '<tr>'
          cells.forEach(c => {
            const { label, span } = parseHeaderCell(c)
            const tag = headerDone ? 'td' : 'th'
            out += `<${tag}${span > 1 ? ` colspan="${span}"` : ''}>${escapeHtml(label)}</${tag}>`
          })
          out += '</tr>'
        })
        out += '</table>'
        i = endIdx; continue
      }
      const key = s.title + '::' + i
      if (line.trim() === '') { i++; continue }
      if (line.startsWith('=> ') || line.startsWith('-> ')) {
        out += `<div class="exp-arrow">→ ${renderInlineHtml(line.replace(/^(=>|->)\s*/, ''))}</div>`; i++; continue
      }
      if (line.startsWith('- ')) {
        const done = tab.doneLines.has(key)
        out += `<div class="exp-item${done ? ' exp-done' : ''}"><span class="exp-check">${done ? '☑' : '☐'}</span> ${renderInlineHtml(line.substring(2))}</div>`
        i++; continue
      }
      if (tab.isMd && line.startsWith('> ')) { out += `<blockquote class="exp-quote">${renderInlineHtml(line.substring(2))}</blockquote>`; i++; continue }
      out += `<p class="exp-plain">${renderInlineHtml(line)}</p>`
      i++
    }
    out += '</section>'
  })
  return out
}

function buildExportHTML() {
  const t = activeTab()
  const title = t && t.filePath ? path.basename(t.filePath) : 'Hashtag Notepad export'
  const body = t ? buildExportSectionsHtml(t) : ''
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title><style>
body{font-family:'Segoe UI',system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 24px;color:#1a1a1a;line-height:1.55}
.exp-section{margin-bottom:28px}
.exp-h1{font-size:26px;border-bottom:2px solid #ddd;padding-bottom:6px}
.exp-h2{font-size:22px}
.exp-h3{font-size:19px}
.exp-h4{font-size:17px}
.exp-h5{font-size:15px;text-transform:uppercase;letter-spacing:.03em}
.exp-h6{font-size:14px;color:#666}
.exp-item{margin:4px 0}
.exp-done{color:#999;text-decoration:line-through}
.exp-arrow{margin:4px 0 4px 18px;color:#555}
.exp-quote{border-left:3px solid #ccc;margin:8px 0;padding:2px 12px;color:#555}
.exp-code{background:#f4f4f4;border-radius:6px;padding:10px;font-family:Consolas,monospace;white-space:pre-wrap}
.exp-table{border-collapse:collapse;margin:10px 0}
.exp-table td,.exp-table th{border:1px solid #ccc;padding:6px 10px}
.exp-table th{background:#f0f0f0}
code{background:#f0f0f0;padding:1px 5px;border-radius:3px;font-family:Consolas,monospace}
</style></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`
}

async function exportAsHTML() {
  const t = activeTab(); if (!t) return
  const base = t.filePath ? path.basename(t.filePath).replace(/\.[^.]+$/, '') : 'export'
  await ipc.invoke('export-html', { html: buildExportHTML(), suggestedName: base + '.html' })
}
async function exportAsPDF() {
  const t = activeTab(); if (!t) return
  const base = t.filePath ? path.basename(t.filePath).replace(/\.[^.]+$/, '') : 'export'
  await ipc.invoke('export-pdf', { html: buildExportHTML(), suggestedName: base + '.pdf' })
}

// ── Find & Replace ────────────────────────────────────────────────────────
function activeEditor() { const t = activeTab(); return t ? t.textareaEl : null }

function openFindBar() {
  if (currentView !== 'raw') switchView('raw')
  findBar.classList.remove('hidden')
  const ed = activeEditor()
  if (ed && ed.selectionStart !== ed.selectionEnd) findInput.value = ed.value.slice(ed.selectionStart, ed.selectionEnd)
  findInput.focus(); findInput.select()
  runFind()
}
function closeFindBar() {
  findBar.classList.add('hidden')
  findMatches = []; findIndex = -1
  activeEditor()?.focus()
}
function runFind() {
  const ed = activeEditor()
  findMatches = []
  const q = findInput.value
  if (ed && q) {
    const hay = ed.value.toLowerCase()
    const needle = q.toLowerCase()
    let idx = 0
    while ((idx = hay.indexOf(needle, idx)) !== -1) {
      findMatches.push({ start: idx, end: idx + needle.length })
      idx += needle.length
    }
  }
  findIndex = findMatches.length ? 0 : -1
  updateFindStatus()
  selectCurrentMatch()
}
function updateFindStatus() {
  findCount.textContent = findMatches.length ? `${findIndex + 1} / ${findMatches.length}` : (findInput.value ? '0 / 0' : '')
}
function selectCurrentMatch() {
  const ed = activeEditor()
  if (!ed || findIndex === -1) return
  const m = findMatches[findIndex]
  ed.focus()
  ed.setSelectionRange(m.start, m.end)
  const line = ed.value.slice(0, m.start).split('\n').length
  ed.scrollTop = Math.max(0, (line - 5) * 20)
}
function findNext() { if (!findMatches.length) return; findIndex = (findIndex + 1) % findMatches.length; updateFindStatus(); selectCurrentMatch() }
function findPrev() { if (!findMatches.length) return; findIndex = (findIndex - 1 + findMatches.length) % findMatches.length; updateFindStatus(); selectCurrentMatch() }

function replaceOne() {
  const t = activeTab(); if (!t || findIndex === -1) return
  selectCurrentMatch()
  document.execCommand('insertText', false, replaceInput.value)
  setTabModified(t, true)
  renderSidebar(); updateStatus()
  runFind()
}
function replaceAll() {
  const t = activeTab(); if (!t || !findMatches.length) return
  const q = findInput.value; if (!q) return
  const re = new RegExp(escapeRegex(q), 'gi')
  const newText = t.textareaEl.value.replace(re, () => replaceInput.value)
  setEditorValue(t.textareaEl, newText)
  setTabModified(t, true)
  renderSidebar(); updateStatus()
  runFind()
}
findInput.addEventListener('input', runFind)
findInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? findPrev() : findNext() }
  if (e.key === 'Escape') { e.preventDefault(); closeFindBar() }
})
replaceInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); replaceOne() }
  if (e.key === 'Escape') { e.preventDefault(); closeFindBar() }
})

// ── Recent files / start page ────────────────────────────────────────────
function refreshStartPage() {
  const t = activeTab()
  const show = t && !t.filePath && !t.isModified && t.textareaEl.value === '' && currentView === 'raw'
  startPage.classList.toggle('hidden', !show)
  if (show) renderStartPageList()
}
function renderStartPageList() {
  startPageList.innerHTML = ''
  if (!recentFilesCache.length) {
    const e = document.createElement('div'); e.id = 'start-page-recent-empty'; e.textContent = 'No recent files yet.'
    startPageList.appendChild(e)
    return
  }
  recentFilesCache.forEach(fp => {
    const row = document.createElement('div')
    row.className = 'start-recent-item'
    row.innerHTML = `<span class="start-recent-name">${escapeHtml(path.basename(fp))}</span><span class="start-recent-path">${escapeHtml(fp)}</span>`
    row.addEventListener('click', async () => {
      const r = await ipc.invoke('open-recent-file', fp)
      if (r) loadIntoTabSmart(r.content, r.filePath)
    })
    startPageList.appendChild(row)
  })
}

// ── File drag & drop ───────────────────────────────────────────────────────
document.addEventListener('dragover', e => { if (dragFromHandle || dragSrc) return; e.preventDefault(); dropOverlay.classList.remove('hidden') })
document.addEventListener('dragleave', e => { if (dragFromHandle || dragSrc) return; if (!e.relatedTarget) dropOverlay.classList.add('hidden') })
document.addEventListener('drop', async e => {
  if (dragSrc) return; e.preventDefault(); dropOverlay.classList.add('hidden')
  const file = e.dataTransfer.files[0]
  if (file && file.path) { const r = await ipc.invoke('read-dropped-file', file.path); if (r) loadIntoTabSmart(r.content, r.filePath) }
})

// ── Keyboard ───────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key.toLowerCase() === 'n' && e.shiftKey) { e.preventDefault(); newWindow() }
    else if (e.key.toLowerCase() === 'n') { /* reserved */ }
    if (e.key.toLowerCase() === 't') { e.preventDefault(); newTab() }
    if (e.key.toLowerCase() === 'w') { e.preventDefault(); if (activeTabId) requestCloseTab(activeTabId) }
    if (e.key === 'Tab' && tabs.length > 1) {
      e.preventDefault()
      const idx = tabs.findIndex(t => t.id === activeTabId)
      const next = e.shiftKey ? (idx - 1 + tabs.length) % tabs.length : (idx + 1) % tabs.length
      switchTab(tabs[next].id)
    }
    if (e.key.toLowerCase() === 'o') { e.preventDefault(); openFile() }
    if (e.key.toLowerCase() === 's' && !e.shiftKey) { e.preventDefault(); saveFile() }
    if (e.key.toLowerCase() === 's' && e.shiftKey) { e.preventDefault(); saveAs() }
    if (e.key.toLowerCase() === 'f') { e.preventDefault(); openFindBar() }
    if (e.key.toLowerCase() === 'z' && e.shiftKey) { e.preventDefault(); toggleZen() }
    if (currentView === 'organised' && document.activeElement?.classList.contains('line-text')) {
      if (e.key === 'b') { e.preventDefault(); applyFormat('bold') }
      if (e.key === 'i') { e.preventDefault(); applyFormat('italic') }
      if (e.key === 'u') { e.preventDefault(); applyFormat('underline') }
    }
  }
  if (e.key === 'Escape') {
    if (zenMode) { toggleZen(); return }
    closeTableBuilder(); saveDialog.classList.add('hidden'); closeDropdown()
  }
})

// ── IPC ────────────────────────────────────────────────────────────────────
ipc.on('load-file', (_, d) => loadIntoTabSmart(d.content, d.filePath))
ipc.on('open-file-external', (_, d) => loadIntoTabSmart(d.content, d.filePath))
ipc.on('check-save-before-close', () => requestCloseWindow())

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  try {
    const prefs = await ipc.invoke('get-prefs')
    currentThemeId = prefs.theme
    recentFilesCache = prefs.recentFiles || []
  } catch { /* prefs unavailable, fall back to defaults */ }
  try {
    pluginThemes = await ipc.invoke('get-theme-plugins')
    if (pluginThemes.length) {
      const style = document.createElement('style')
      style.id = 'plugin-theme-styles'
      style.textContent = pluginThemes.map(p => p.css).join('\n\n')
      document.head.appendChild(style)
    }
  } catch (e) {
    console.error('[hashtag-notepad] failed to load theme plugins:', e)
    pluginThemes = []
  }
  applyTheme(effectiveTheme())
  newTab()
  updateStatus()
  refreshStartPage()
}
init()