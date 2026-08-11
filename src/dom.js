// dom.js — every document.getElementById() call, in one place.
//
// Feature modules require this instead of querying the DOM themselves.
// If an element gets renamed or moved in renderer.html, this is the
// only file that needs to change.

module.exports = {
  organisedView:   document.getElementById('organised-view'),
  sectionList:     document.getElementById('section-list'),
  statusSections:  document.getElementById('status-sections'),
  statusLines:     document.getElementById('status-lines'),
  statusWords:     document.getElementById('status-words'),
  statusChars:     document.getElementById('status-chars'),
  statusFile:      document.getElementById('status-file'),
  fileNameEl:      document.getElementById('file-name'),
  modifiedDot:     document.getElementById('modified-dot'),
  dropOverlay:     document.getElementById('drop-overlay'),
  saveDialog:      document.getElementById('save-dialog'),
  saveDialogMsg:   document.getElementById('save-dialog-msg'),
  fmtToolbar:      document.getElementById('fmt-toolbar'),
  iconSun:         document.getElementById('icon-sun'),
  iconMoon:        document.getElementById('icon-moon'),
  sidebar:         document.getElementById('sidebar'),
  tableBuilder:    document.getElementById('table-builder'),
  tabList:         document.getElementById('tab-list'),
  editorTextareas: document.getElementById('editor-textareas'),
  startPage:       document.getElementById('start-page'),
  startPageList:   document.getElementById('start-page-recent-list'),
  findBar:         document.getElementById('find-bar'),
  findInput:       document.getElementById('find-input'),
  findCount:       document.getElementById('find-count'),
  replaceInput:    document.getElementById('replace-input'),
  themeToggleBtn:  document.getElementById('theme-toggle'),
  exportToggleBtn: document.getElementById('export-toggle')
}
