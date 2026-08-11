function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// Replace a <textarea>'s value while keeping the browser's native undo/redo
// stack intact. execCommand is deprecated but Electron ships a fixed,
// known Chromium version so it's safe to rely on here.
function setEditorValue(ta, value) {
  if (!ta) return
  if (ta.value === value) return

  // If the textarea is visible and focused, try the undo-friendly way first.
  const isVisible = !!(ta.offsetWidth || ta.offsetHeight || ta.getClientRects().length)

  if (isVisible && document.activeElement === ta) {
    const start = ta.selectionStart
    const end = ta.selectionEnd

    ta.select()

    let ok = false
    try {
      ok = document.execCommand('insertText', false, value)
    } catch {
      ok = false
    }

    if (ok && ta.value === value) {
      try {
        ta.setSelectionRange(start, end)
      } catch {}
      return
    }
  }

  // This works even when the textarea is hidden, e.g. while Organised view
  // is active and the raw editor has .hidden / display:none.
  try {
    ta.setRangeText(value, 0, ta.value.length, 'end')
    if (ta.value === value) return
  } catch {}

  // Final fallback.
  ta.value = value
}

module.exports = { escapeHtml, escapeRegex, setEditorValue }
