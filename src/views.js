const state = require('./state')
const dom = require('./dom')
const { setEditorValue } = require('./utils')

const tabsMod = require('./tabs')
const uiMod = require('./ui')
const fs = require('fs')
const path = require('path')

// textarea is visible, hidden, focused or not. No utils dependency.
function writeRawText(t, text) {
  const ta = t.textareaEl
  if (ta.value === text) return
  ta.value = text
  ta.dispatchEvent(new Event('input', { bubbles: true }))
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

function trimTrailingEmpty(lines) { let e = lines.length; while (e > 0 && lines[e - 1].trim() === '') e--; return lines.slice(0, e) }

// ── Table parsing ──────────────────────────────────────────────────────────
function isTableRow(line) {
  return /^\|.+\|$/.test(line.trim())
}

function isTableSep(line) {
  return /^\|(\s*:?-+:?\s*\|)+\s*$/.test(line.trim())
}

function splitTableCells(line) {
  return line.trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(c => c.trim())
}

function parseHeaderCell(raw) {
  const m = raw.match(/^(.+?)(\^*)$/)
  if (m) {
    const label = m[1].trim()
    const span = 1 + m[2].length
    return { label, span }
  }
  return { label: raw, span: 1 }
}

function parseTable(lines, startIdx) {
  const tableLines = []
  let i = startIdx
  while (i < lines.length && (isTableRow(lines[i]) || isTableSep(lines[i]))) {
    tableLines.push(lines[i])
    i++
  }
  return { tableLines, endIdx: i }
}

function renderTable(tableLines, sectionTitle, lineOffset) {
  const table = document.createElement('table')
  table.className = 'md-table'
  let headerDone = false

  tableLines.forEach((line, tli) => {
    if (isTableSep(line)) { headerDone = true; return }
    const rawCells = splitTableCells(line)
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
            if (!input.isConnected) return
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
  const t = tabsMod.activeTab()
  if (!t) return

  const sections = parseContent(t.textareaEl.value, t.isMd)
  const sec = sections.find(s => s.title === sectionTitle)
  if (!sec) return

  const line = sec.lines[lineIdx]
  if (!line) return

  const parts = splitTableCells(line)

  // Prevent undefined cells if the raw line has fewer columns than expected.
  while (parts.length <= colIdx) {
    parts.push('')
  }

  parts[colIdx] = newValue

  const newLine = '| ' + parts.join(' | ') + ' |'
  sec.lines[lineIdx] = newLine

  writeRawText(t, sectionsToText(sections, t.isMd))
  console.log('[views] table commit → raw contains edit:', t.textareaEl.value.includes(newValue))

  tabsMod.setTabModified(t, true)
  uiMod.updateStatus()
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
    // Image: ![alt](src)
    if (text.startsWith('![', i)) {
      const im = text.slice(i).match(/^!\[([^\]]*)\]\(([^)]+)\)/)
      if (im) { tokens.push({ type: 'image', alt: im[1], src: im[2] }); i += im[0].length; continue }
    }
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

// ── Images ─
function resolveImageSrc(src, tab) {
  if (/^(https?:|data:)/i.test(src)) return src
  if (!tab || !tab.filePath) return null   // unsaved tab, can't resolve relative paths
  const base = path.dirname(tab.filePath)
  const p = path.isAbsolute(src) ? path.normalize(src) : path.resolve(base, decodeURIComponent(src))
  try {
    const buf = fs.readFileSync(p)
    const ext = (path.extname(p).slice(1) || 'png').toLowerCase()
    const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : 'image/' + ext
    return 'data:' + mime + ';base64,' + buf.toString('base64')
  } catch { return null }
}
function makeImageEl(alt, src, inline) {
  const resolved = resolveImageSrc(src, tabsMod.activeTab())
  if (!resolved) {
    const miss = document.createElement(inline ? 'span' : 'div')
    miss.className = 'md-image-missing'
    miss.textContent = '[image not found: ' + src + ']'
    return miss
  }
  const img = document.createElement('img')
  img.src = resolved; img.alt = alt || ''; img.title = alt || ''
  if (inline) { img.className = 'md-img-inline'; return img }
  const wrap = document.createElement('div'); wrap.className = 'md-image'
  wrap.appendChild(img)
  return wrap
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
    else if (tok.type === 'image')     el = makeImageEl(tok.alt, tok.src, true)
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

  span._commit = () => {
    if (state.committing) return
    if (span.contentEditable !== 'true') return
    const newRaw = span.textContent
    rawText = newRaw
    showFormatted()
    onCommit(newRaw)
  }
  span.addEventListener('blur', () => span._commit())

  span.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); span.blur() }
    if (e.key === 'Escape') { showFormatted(); e.preventDefault() }
  })

  return span
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
    const im = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/)
    if (im) { body.appendChild(makeImageEl(im[1], im[2], false)); i++; continue }
    const hm = line.match(/^(#{1,6})\s+(.+)$/)
    if (hm) { const d = document.createElement('div'); d.className = 'md-h' + hm[1].length; d.appendChild(renderMdInline(hm[2])); body.appendChild(d); i++; continue }
    if (line.startsWith('> ')) { const d = document.createElement('div'); d.className = 'md-blockquote'; d.appendChild(renderMdInline(line.substring(2))); body.appendChild(d); i++; continue }
    const lm = line.match(/^([ \t]*)[-*] (.*)$/)
    if (lm) {
      const depth = Math.min(8, Math.floor(lm[1].replace(/\t/g, '  ').length / 2))
      const item = document.createElement('div'); item.className = 'line-item'
      if (depth) { item.style.marginLeft = (depth * 18) + 'px'; item.classList.add('nested') }
      const dot = document.createElement('span'); dot.className = 'bullet-dot'; dot.textContent = '–'
      const txt = document.createElement('span'); txt.appendChild(renderMdInline(lm[2]))
      item.appendChild(dot); item.appendChild(txt); body.appendChild(item); i++; continue
    }
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
  const t = tabsMod.activeTab(); if (!t) return
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
  writeRawText(t, sectionsToText(sections, t.isMd))
  
  // FIX: Removed the broken console.log that referenced undefined `newValue`
  console.log('[views] reorder commit → raw updated successfully')
  
  tabsMod.setTabModified(t, true); renderOrganised(); uiMod.updateStatus()
}

function renderOrganised() {
  const t = tabsMod.activeTab()
  dom.organisedView.innerHTML = ''
  if (!t) return
  const sections = parseContent(t.textareaEl.value, t.isMd)
  uiMod.renderSidebar()
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
    const cc = t.isMd ? uiMod.headingColorClass(s.level) : ''
    const head = document.createElement('div')
    head.className = 'section-head'

    // LEFT zone: drag handle + chevron → always collapses/expands
    const leftZone = document.createElement('div')
    leftZone.className = 'section-head-left'
    leftZone.innerHTML = `<span class="drag-handle" title="Drag to reorder">⠿</span><span class="chevron ${isCollapsed ? '' : 'open'}">▶</span>`
    leftZone.querySelector('.drag-handle').addEventListener('mousedown', () => { state.dragFromHandle = true })
    leftZone.addEventListener('click', e => { e.stopPropagation(); toggleSection(s.title) })

     // TITLE zone: only the text → opens section edit on click
    const titleZone = document.createElement('div')
    titleZone.className = 'section-head-title-zone'
    const titleSpan = document.createElement('span')
    titleSpan.className = 'sec-title ' + cc
    const renderedTitle = renderInlineFormatting(s.title)
    while (renderedTitle.firstChild) titleSpan.appendChild(renderedTitle.firstChild)
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
      if (!state.dragFromHandle) { e.preventDefault(); return }
      state.dragSrc = block; block.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('application/x-section', block.dataset.title)
      state.dragGroup = getSubtreeTitles(ordered, s.title)
      state.dragGroup.forEach(title => { if (title !== s.title) document.getElementById('sec-' + title)?.classList.add('dragging-child') })
    })
    block.addEventListener('dragend', () => {
      state.dragFromHandle = false
      document.querySelectorAll('.section-block').forEach(b => b.classList.remove('dragging', 'drag-over', 'dragging-child'))
      state.dragSrc = null; state.dragGroup = []
    })
    block.addEventListener('dragover', e => {
      if (!state.dragSrc || state.dragGroup.includes(s.title)) return
      e.preventDefault(); e.stopPropagation()
      if (block !== state.dragSrc) { document.querySelectorAll('.section-block').forEach(b => b.classList.remove('drag-over')); block.classList.add('drag-over') }
    })
    block.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation()
      if (state.dragSrc && state.dragSrc !== block && !state.dragGroup.includes(s.title)) reorderSections(state.dragSrc.dataset.title, block.dataset.title)
      state.dragSrc = null; state.dragGroup = []
    })
    const body = document.createElement('div'); body.className = 'section-body' + (isCollapsed ? ' hidden' : '')
    buildBody(body, s, hasChildren)
    block.appendChild(head); block.appendChild(body); dom.organisedView.appendChild(block)
  })
}
document.addEventListener('mouseup', () => { state.dragFromHandle = false })

function buildBody(body, s, hasChildren) {
  const t = tabsMod.activeTab(); if (!t) return
  body.innerHTML = ''
  const lines = trimTrailingEmpty(s.lines)
  if (!lines.length) {
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
      // ── nesting: 2 spaces (or a tab) per level ──
      const ws = line.match(/^[ \t]*/)[0]
      const depth = Math.min(8, Math.floor(ws.replace(/\t/g, '  ').length / 2))
      const rest = line.slice(ws.length)
      const applyNest = (el) => { if (depth) { el.style.marginLeft = (depth * 18) + 'px'; el.classList.add('nested') } }

      if (rest.startsWith('=> ') || rest.startsWith('-> ')) {
        const prefix = rest.startsWith('=> ') ? '=> ' : '-> '
        const rawContent = rest.slice(prefix.length)
        const lineIdx = i
        const item = document.createElement('div'); item.className = 'line-item arrow-line'
        applyNest(item)
        const txt = makeEditableSpan(rawContent, (val) => commitInlineEdit(s.title, lineIdx, ws + prefix + val))
        item.appendChild(txt); body.appendChild(item); i++; continue
      }
      if (rest.startsWith('- ')) {
        const rawContent = rest.slice(2)
        const lineIdx = i
        const item = document.createElement('div'); item.className = 'line-item' + (isDone ? ' done' : '')
        applyNest(item)
        const chk = document.createElement('span'); chk.className = 'check'; chk.textContent = isDone ? '✓' : ''
        chk.onclick = e => { e.stopPropagation(); toggleDone(key) }
        const txt = makeEditableSpan(rawContent, (val) => commitInlineEdit(s.title, lineIdx, ws + '- ' + val))
        item.appendChild(chk); item.appendChild(txt); body.appendChild(item); i++; continue
      }
      // Plain line
      const lineIdx = i
      const item = document.createElement('div'); item.className = 'line-item'
      applyNest(item)
      const txt = makeEditableSpan(rest, (val) => commitInlineEdit(s.title, lineIdx, ws + val))
 item.appendChild(txt); body.appendChild(item); i++
  }
  if (inCode) { const pre = document.createElement('div'); pre.className = 'md-code-block'; pre.textContent = codeLines.join('\n'); body.appendChild(pre) }
}

function openSectionEdit(block, s) {
  const body = block.querySelector('.section-body')
  const t = tabsMod.activeTab(); if (!t) return
  body.classList.remove('hidden'); t.collapsedSections.delete(s.title)
  if (block.querySelector('.section-edit-area')) { block.querySelector('.section-edit-area').focus(); return }

  const fresh = parseContent(t.textareaEl.value, t.isMd).find(x => x.title === s.title)
  const lines = fresh ? fresh.lines : s.lines

  const ta = document.createElement('textarea'); ta.className = 'section-edit-area'
  ta.value = lines.join('\n'); ta.rows = Math.max(3, lines.length + 1)
  body.innerHTML = ''; body.appendChild(ta); ta.focus()
  ta.addEventListener('blur', () => commitSectionEdit(s.title, ta.value))
  ta._commit = () => commitSectionEdit(s.title, ta.value)
  ta.addEventListener('keydown', e => { if (e.key === 'Escape') ta.blur() })
}

function commitSectionEdit(title, newContent) {
  if (state.committing) return
  state.committing = true
  try {
    const t = tabsMod.activeTab(); if (!t) return
    const sections = parseContent(t.textareaEl.value, t.isMd)
    const sec = sections.find(s => s.title === title); if (!sec) return
    sec.lines = newContent.split('\n')
    writeRawText(t, sectionsToText(sections, t.isMd))
    
    // FIX: Removed the broken console.log that referenced undefined `newValue`
    console.log('[views] section commit → raw updated successfully')
    
    tabsMod.setTabModified(t, true)
    // Defer the re-render so the blur event fully completes before we
    // destroy and rebuild the DOM (destroying mid-blur causes another blur)
    setTimeout(() => { renderOrganised(); uiMod.updateStatus() }, 0)
  } finally {
    setTimeout(() => { state.committing = false }, 0)
  }
}

function commitInlineEdit(title, li, newText) {
  if (state.committing) return
  state.committing = true
  try {
    const t = tabsMod.activeTab(); if (!t) return
    const sections = parseContent(t.textareaEl.value, t.isMd)
    const sec = sections.find(s => s.title === title); if (!sec) return
    // Only write back if the text actually changed — avoids spurious re-renders
    // when the user just clicked away without editing
    if (sec.lines[li] === newText) return
    sec.lines[li] = newText
    writeRawText(t, sectionsToText(sections, t.isMd))
    console.log('[views] line commit → raw contains edit:', t.textareaEl.value.includes(newText))
    tabsMod.setTabModified(t, true)
    setTimeout(() => { uiMod.updateStatus() }, 0)
  } finally {
    setTimeout(() => { state.committing = false }, 0)
  }
}

// ── Format toolbar ─────────────────────────────────────────────────────────
function applyFormat(type) {
  const t = tabsMod.activeTab(); if (!t) return
  const wrappers = { bold: ['**', '**'], italic: ['*', '*'], underline: ['__', '__'], code: ['`', '`'] }
  const [open, close] = wrappers[type]

  // ── Organised view: wrap selected text inside the active editable span ──
  if (state.currentView === 'organised') {
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
  tabsMod.setTabModified(t, true)
  uiMod.renderSidebar(); uiMod.updateStatus()
}

// ── Done / collapse / expand ───────────────────────────────────────────────
function toggleDone(key) {
  const t = tabsMod.activeTab(); if (!t) return
  if (t.doneLines.has(key)) t.doneLines.delete(key); else t.doneLines.add(key)
  tabsMod.setTabModified(t, true)
  renderOrganised()
}
function toggleSection(title) {
  const t = tabsMod.activeTab(); if (!t) return
  if (t.collapsedSections.has(title)) t.collapsedSections.delete(title); else t.collapsedSections.add(title)
  tabsMod.setTabModified(t, true)
  renderOrganised()
}
function collapseAll() {
  const t = tabsMod.activeTab(); if (!t) return
  parseContent(t.textareaEl.value, t.isMd).filter(s => s.title).forEach(s => t.collapsedSections.add(s.title))
  tabsMod.setTabModified(t, true)
  if (state.currentView === 'organised') renderOrganised()
}
function expandAll() {
  const t = tabsMod.activeTab(); if (!t) return
  t.collapsedSections.clear()
  tabsMod.setTabModified(t, true)
  if (state.currentView === 'organised') renderOrganised()
}

// ── View ───────────────────────────────────────────────────────────────────
function commitActiveInlineEdit() {
  const openEditors = dom.organisedView.querySelectorAll('.table-cell-input, .section-edit-area, .line-text[contenteditable="true"]')
  openEditors.forEach(el => el.blur())
}

function switchView(view) {
  commitActiveInlineEdit()
  const t = tabsMod.activeTab()
  if (t) t.view = view
  state.currentView = view
  document.getElementById('btn-raw').classList.toggle('active', view === 'raw')
  document.getElementById('btn-organised').classList.toggle('active', view === 'organised')
  state.tabs.forEach(x => x.textareaEl.classList.toggle('hidden', view !== 'raw' || x.id !== state.activeTabId))
  dom.organisedView.classList.toggle('hidden', view !== 'organised')
  dom.fmtToolbar.classList.toggle('hidden', view !== 'organised')
  if (view === 'organised') renderOrganised()
  else uiMod.renderSidebar()
}

module.exports.parseContent = parseContent
module.exports.sectionsToText = sectionsToText
module.exports.trimTrailingEmpty = trimTrailingEmpty
module.exports.isTableRow = isTableRow
module.exports.isTableSep = isTableSep
module.exports.splitTableCells = splitTableCells
module.exports.parseTable = parseTable
module.exports.parseHeaderCell = parseHeaderCell
module.exports.renderTable = renderTable
module.exports.commitTableCell = commitTableCell
module.exports.URL_RE = URL_RE
module.exports.MD_LINK_RE = MD_LINK_RE
module.exports.openURL = openURL
module.exports.tokenizeInline = tokenizeInline
module.exports.makeLink = makeLink
module.exports.renderInlineFormatting = renderInlineFormatting
module.exports.makeEditableSpan = makeEditableSpan
module.exports.renderMdInline = renderMdInline
module.exports.renderMdLines = renderMdLines
module.exports.applyOrder = applyOrder
module.exports.getSubtreeTitles = getSubtreeTitles
module.exports.reorderSections = reorderSections
module.exports.renderOrganised = renderOrganised
module.exports.buildBody = buildBody
module.exports.openSectionEdit = openSectionEdit
module.exports.commitSectionEdit = commitSectionEdit
module.exports.commitInlineEdit = commitInlineEdit
module.exports.applyFormat = applyFormat
module.exports.toggleDone = toggleDone
module.exports.toggleSection = toggleSection
module.exports.collapseAll = collapseAll
module.exports.expandAll = expandAll
module.exports.commitActiveInlineEdit = commitActiveInlineEdit
module.exports.switchView = switchView
