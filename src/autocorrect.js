const TYPOS = {
  teh: 'the', recieve: 'receive', seperate: 'separate', definately: 'definitely',
  becuase: 'because', occured: 'occurred', untill: 'until', wich: 'which',
  tommorow: 'tomorrow', freind: 'friend', alot: 'a lot', protfolio: 'portfolio', fird: 'friday'
}
const TRIGGERS = [' ', '.', ',', '!', '?', '\n']

function initAutocorrect(rootEl) {
  rootEl.addEventListener('input', (e) => {
    const ta = e.target
    if (!ta.classList.contains('raw-editor') || e.inputType !== 'insertText') return
    if (!TRIGGERS.includes(e.data)) return
    const caret = ta.selectionStart
    const m = ta.value.slice(0, caret - 1).match(/[A-Za-z']+$/)
    if (!m) return
    const fix = TYPOS[m[0].toLowerCase()]
    if (!fix) return
    const out = m[0][0] === m[0][0].toUpperCase() ? fix[0].toUpperCase() + fix.slice(1) : fix
    ta.setSelectionRange(caret - 1 - m[0].length, caret - 1)
    document.execCommand('insertText', false, out)  // keeps Ctrl+Z working AND fires `input` so the app stays synced
  })
}

module.exports.initAutocorrect = initAutocorrect