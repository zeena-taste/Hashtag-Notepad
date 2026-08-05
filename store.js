// Tiny JSON preferences store — deliberately dependency-free.
// (electron-store v9+ ships as ESM-only, which doesn't play nicely with a
// CommonJS/require()-based codebase like this one, so we just roll a
// minimal version of the same idea: read/write a JSON file in userData.)
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const DEFAULTS = {
  theme: null,          // null = follow OS theme; otherwise 'dark' | 'light' | a plugin theme id
  windowBounds: null,   // { width, height, x, y }
  recentFiles: [],      // absolute paths, most-recent-first, max 10
  lastFile: null
}

let storePath = null
let cache = null

function getStorePath() {
  if (!storePath) storePath = path.join(app.getPath('userData'), 'prefs.json')
  return storePath
}

function load() {
  if (cache) return cache
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf-8')
    cache = Object.assign({}, DEFAULTS, JSON.parse(raw))
  } catch {
    cache = Object.assign({}, DEFAULTS)
  }
  return cache
}

function save(partial) {
  cache = Object.assign({}, load(), partial)
  try {
    fs.mkdirSync(path.dirname(getStorePath()), { recursive: true })
    fs.writeFileSync(getStorePath(), JSON.stringify(cache, null, 2), 'utf-8')
  } catch (e) {
    console.error('[hashtag-notepad] failed to persist prefs:', e)
  }
  return cache
}

function addRecentFile(filePath) {
  const s = load()
  const list = [filePath, ...s.recentFiles.filter(f => f !== filePath)].slice(0, 10)
  return save({ recentFiles: list, lastFile: filePath })
}

module.exports = { load, save, addRecentFile, getStorePath }
