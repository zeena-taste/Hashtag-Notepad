// state.js — The Single Source of Truth.
//
// Everything that used to be a scattered `let x = ...` at the top of
// renderer.js lives on this one object now. Feature modules read and
// write through `state.<name>` (e.g. `state.tabs.push(...)`,
// `state.activeTabId = id`) instead of declaring their own copies.
//
// Why an object instead of individual exported `let`s: CommonJS exports
// are captured by value at require() time. If this module exported
// `let activeTabId = null` directly, a consumer's `activeTabId = 5`
// would rebind its own local variable, not this module's — the change
// would never be seen anywhere else. Wrapping everything in one object
// sidesteps that: every module holds the same object reference, so
// `state.activeTabId = 5` is visible everywhere immediately.

const state = {
  tabs:              [],
  activeTabId:       null,
  tabIdCounter:      0,
  currentView:       'raw',
  sidebarCollapsed:  false,
  dragFromHandle:    false,
  dragSrc:           null,
  dragGroup:         [],
  systemTheme:       'dark',
  currentThemeId:    null,   // null = follow system
  pluginThemes:      [],
  zenMode:           false,
  pendingCloseQueue: [],
  closeWindowAfter:  false,
  findMatches:       [],
  findIndex:         -1,
  openDropdownEl:    null,
  recentFilesCache:  [],

  // Guard flag — prevents blur events on destroyed/replaced DOM nodes from
  // re-triggering a commit that's already in progress (the main crash cause).
  committing: false
}

module.exports = state
