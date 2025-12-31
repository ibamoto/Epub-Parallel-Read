const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.cjs')

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
  })

  // Prevent navigation
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  // Development mode
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' }
  })
})
