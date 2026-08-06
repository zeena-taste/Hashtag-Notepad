const { app, BrowserWindow, dialog, ipcMain, nativeTheme } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const store = require('./store')
const { discoverThemePlugins } = require('./plugins')

app.setAppUserModelId('com.hashtagnotepad.app')

const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico')
const windows = new Set()
const bundledPluginsDir = path.join(__dirname, '..', 'plugins')

function userPluginsDir() {
  return path.join(app.getPath('userData'), 'plugins')
}

function createWindow(filePath = null, content = null) {
  const prefs = store.load()
  const bounds = prefs.windowBounds || {}
  const win = new BrowserWindow({
    width: bounds.width || 1000,
    height: bounds.height || 680,
    x: bounds.x,
    y: bounds.y,
    minWidth: 600,
    minHeight: 400,
    frame: false,
    backgroundColor: '#1a1a1a',
    icon: iconPath,
    title: filePath ? path.basename(filePath) + ' — Hashtag Notepad' : 'Hashtag Notepad',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  win.setIcon(iconPath)
  win._isModified = false
  windows.add(win)
  win.loadFile('src/renderer.html')

  win.webContents.once('did-finish-load', () => {
    win.webContents.send('system-theme', nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
    if (filePath && content !== null) {
      win.webContents.send('load-file', { content, filePath })
    }
  })

  let boundsSaveTimer = null
  const saveBoundsDebounced = () => {
    clearTimeout(boundsSaveTimer)
    boundsSaveTimer = setTimeout(() => {
      if (win.isDestroyed()) return
      const b = win.getBounds()
      store.save({ windowBounds: b })
    }, 400)
  }
  win.on('resize', saveBoundsDebounced)
  win.on('move', saveBoundsDebounced)

  win.on('close', (e) => {
    if (win._isModified) {
      e.preventDefault()
      win.webContents.send('check-save-before-close')
    } else {
      windows.delete(win)
    }
  })
  win.on('closed', () => windows.delete(win))
  return win
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (event, argv) => {
    const filePath = argv.find(a => (a.endsWith('.txt') || a.endsWith('.md')) && fs.existsSync(a))
    const first = [...windows][0]
    if (filePath) {
      const content = fs.readFileSync(filePath, 'utf-8')
      store.addRecentFile(filePath)
      if (first) {
        if (first.isMinimized()) first.restore()
        first.focus()
        first.webContents.send('open-file-external', { content, filePath })
      } else {
        createWindow(filePath, content)
      }
    } else if (first) {
      if (first.isMinimized()) first.restore()
      first.focus()
    }
  })

  app.whenReady().then(() => {
    const filePath = process.argv.find(a => (a.endsWith('.txt') || a.endsWith('.md')) && fs.existsSync(a))
    if (filePath) {
      const content = fs.readFileSync(filePath, 'utf-8')
      store.addRecentFile(filePath)
      createWindow(filePath, content)
    } else {
      createWindow()
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (windows.size === 0) createWindow()
})

nativeTheme.on('updated', () => {
  const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  windows.forEach(w => w.webContents.send('system-theme', theme))
})

// ── File I/O ─────────────────────────────────────────────────────────────
ipcMain.handle('open-file', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(win, {
    filters: [{ name: 'Text & Markdown', extensions: ['txt', 'md'] }, { name: 'All Files', extensions: ['*'] }],
    properties: ['openFile']
  })
  if (!result.canceled && result.filePaths.length > 0) {
    const fp = result.filePaths[0]
    store.addRecentFile(fp)
    return { content: fs.readFileSync(fp, 'utf-8'), filePath: fp }
  }
  return null
})

ipcMain.handle('save-file', async (event, { content, filePath }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (filePath) {
    fs.writeFileSync(filePath, content, 'utf-8')
    store.addRecentFile(filePath)
    return filePath
  }
  return await doSaveAs(win, content)
})

ipcMain.handle('save-as', async (event, content) => {
  return await doSaveAs(BrowserWindow.fromWebContents(event.sender), content)
})

async function doSaveAs(win, content) {
  const result = await dialog.showSaveDialog(win, {
    filters: [{ name: 'Text Files', extensions: ['txt'] }, { name: 'Markdown', extensions: ['md'] }, { name: 'All Files', extensions: ['*'] }],
    defaultPath: 'notes.txt'
  })
  if (!result.canceled) {
    fs.writeFileSync(result.filePath, content, 'utf-8')
    store.addRecentFile(result.filePath)
    return result.filePath
  }
  return null
}

ipcMain.handle('read-dropped-file', async (event, filePath) => {
  const content = fs.readFileSync(filePath, 'utf-8')
  store.addRecentFile(filePath)
  return { content, filePath }
})

ipcMain.handle('open-recent-file', async (event, filePath) => {
  if (!fs.existsSync(filePath)) return null
  const content = fs.readFileSync(filePath, 'utf-8')
  store.addRecentFile(filePath)
  return { content, filePath }
})

// ── Preferences ──────────────────────────────────────────────────────────
ipcMain.handle('get-prefs', () => {
  const p = store.load()
  return { theme: p.theme, recentFiles: p.recentFiles }
})
ipcMain.on('set-theme-pref', (event, themeId) => store.save({ theme: themeId }))

// ── Theme plugins ────────────────────────────────────────────────────────
ipcMain.handle('get-theme-plugins', () => discoverThemePlugins(bundledPluginsDir, userPluginsDir()))

// ── Export ───────────────────────────────────────────────────────────────
ipcMain.handle('export-html', async (event, { html, suggestedName }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showSaveDialog(win, {
    defaultPath: suggestedName || 'export.html',
    filters: [{ name: 'HTML', extensions: ['html'] }]
  })
  if (result.canceled) return null
  fs.writeFileSync(result.filePath, html, 'utf-8')
  return result.filePath
})

ipcMain.handle('export-pdf', async (event, { html, suggestedName }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showSaveDialog(win, {
    defaultPath: suggestedName || 'export.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (result.canceled) return null

  const tmpPath = path.join(os.tmpdir(), `hashtag-notepad-export-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
  fs.writeFileSync(tmpPath, html, 'utf-8')
  const printWin = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  try {
    await printWin.loadFile(tmpPath)
    const pdfBuffer = await printWin.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    fs.writeFileSync(result.filePath, pdfBuffer)
  } finally {
    printWin.destroy()
    fs.unlink(tmpPath, () => {})
  }
  return result.filePath
})

// ── Window chrome / tab-close plumbing ──────────────────────────────────
ipcMain.on('set-title', (event, title) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.setTitle(title)
})

ipcMain.on('new-window', () => createWindow())
ipcMain.on('set-modified', (event, modified) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win._isModified = modified
})
ipcMain.on('force-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) { win._isModified = false; win.close() }
})
ipcMain.on('minimize-window', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())
ipcMain.on('maximize-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win?.isMaximized()) win.unmaximize(); else win?.maximize()
})
ipcMain.on('close-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) { if (win._isModified) win.webContents.send('check-save-before-close'); else win.close() }
})
