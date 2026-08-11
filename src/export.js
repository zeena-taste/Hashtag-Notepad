// export.js — Organised view → standalone HTML / PDF.
// Renders the same structure as the Organised view, but as static markup:
// no editable fields, no drag handles — just a clean read-only document,
// which is what makes it worth turning into a PDF or a shareable HTML page.
const path = require('path')
const { ipcRenderer: ipc } = require('electron')
const { escapeHtml } = require('./utils')

const tabsMod = require('./tabs')
const viewsMod = require('./views')

function renderInlineHtml(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
}

function buildExportSectionsHtml(tab) {
  const sections = viewsMod.applyOrder(viewsMod.parseContent(tab.textareaEl.value, tab.isMd), tab).filter(s => s.title)
  let out = ''
  sections.forEach(s => {
    out += `<section class="exp-section"><h2 class="exp-h${Math.min(s.level, 6)}">${escapeHtml(s.title)}</h2>`
    const lines = viewsMod.trimTrailingEmpty(s.lines)
    let inCode = false, codeLines = [], i = 0
    while (i < lines.length) {
      const line = lines[i]
      if (line.startsWith('```')) {
        if (inCode) { out += `<pre class="exp-code">${escapeHtml(codeLines.join('\n'))}</pre>`; codeLines = []; inCode = false }
        else inCode = true
        i++; continue
      }
      if (inCode) { codeLines.push(line); i++; continue }
      if (viewsMod.isTableRow(line)) {
        const { tableLines, endIdx } = viewsMod.parseTable(lines, i)
        out += '<table class="exp-table">'
        let headerDone = false
        tableLines.forEach(tl => {
          if (viewsMod.isTableSep(tl)) { headerDone = true; return }
          const cells = viewsMod.splitTableCells(tl)
          out += '<tr>'
          cells.forEach(c => {
            const { label, span } = viewsMod.parseHeaderCell(c)
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
  const t = tabsMod.activeTab()
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
  const t = tabsMod.activeTab(); if (!t) return
  const base = t.filePath ? path.basename(t.filePath).replace(/\.[^.]+$/, '') : 'export'
  await ipc.invoke('export-html', { html: buildExportHTML(), suggestedName: base + '.html' })
}
async function exportAsPDF() {
  const t = tabsMod.activeTab(); if (!t) return
  const base = t.filePath ? path.basename(t.filePath).replace(/\.[^.]+$/, '') : 'export'
  await ipc.invoke('export-pdf', { html: buildExportHTML(), suggestedName: base + '.pdf' })
}

module.exports.renderInlineHtml = renderInlineHtml
module.exports.buildExportSectionsHtml = buildExportSectionsHtml
module.exports.buildExportHTML = buildExportHTML
module.exports.exportAsHTML = exportAsHTML
module.exports.exportAsPDF = exportAsPDF
