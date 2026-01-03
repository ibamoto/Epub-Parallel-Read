const { app, BrowserWindow, ipcMain, session } = require('electron')
const path = require('path')

// Store iframe webContents for font size control
const iframeWebContentsMap = new Map()
let extensionId = null

// Load Chrome extension
async function loadExtension() {
  try {
    const extensionPath = path.join(__dirname, 'extension')
    const ext = await session.defaultSession.loadExtension(extensionPath, {
      allowFileAccess: true,
    })
    extensionId = ext.id
    console.log('Extension loaded:', extensionId)
    return extensionId
  } catch (error) {
    console.error('Failed to load extension:', error)
    return null
  }
}

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
      webSecurity: false, // クロスオリジン制限を緩和（URLリーダーのスクロール同期のため）
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
  })

  // Prevent navigation
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  // Handle iframe webContents registration
  win.webContents.on('did-attach-webview', (event, webContents) => {
    // Register iframe webContents for font size control
    const iframeId = webContents.id
    iframeWebContentsMap.set(iframeId, webContents)
    
    // Clean up when iframe is destroyed
    webContents.on('destroyed', () => {
      iframeWebContentsMap.delete(iframeId)
    })
  })

  // Development mode
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(async () => {
  // Remove X-Frame-Options and Content-Security-Policy headers to allow iframe embedding
  // This is necessary to display sites like Yahoo.co.jp that set X-Frame-Options: deny
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders }

    // Remove headers that prevent iframe embedding (case-insensitive)
    const headersToRemove = [
      'x-frame-options',
      'X-Frame-Options',
      'content-security-policy',
      'Content-Security-Policy',
      'content-security-policy-report-only',
      'Content-Security-Policy-Report-Only'
    ]

    for (const header of headersToRemove) {
      delete responseHeaders[header]
    }

    callback({ responseHeaders })
  })

  // Load extension before creating window
  await loadExtension()
  createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (!extensionId) {
        await loadExtension()
      }
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

// IPC handler for applying font size to iframe using extension
ipcMain.handle('apply-iframe-font-size', async (event, iframeId, fontSize) => {
  try {
    // 通常のiframeではwebContentsを直接取得できないため、
    // メインウィンドウのwebContentsからiframeを探して拡張機能のコンテンツスクリプトにメッセージを送信
    const mainWindow = BrowserWindow.fromWebContents(event.sender)
    if (!mainWindow) {
      return { success: false, error: 'Main window not found' }
    }

    if (!extensionId) {
      return { success: false, error: 'Extension not loaded' }
    }

    // メインウィンドウのwebContentsから、iframe内で拡張機能のコンテンツスクリプトにメッセージを送信
    const result = await mainWindow.webContents.executeJavaScript(`
      (async function() {
        try {
          // iframe要素を取得
          const iframe = document.getElementById('${iframeId}');
          if (!iframe || !iframe.contentWindow) {
            return { success: false, error: 'Iframe not found' };
          }

          // iframe内で拡張機能のコンテンツスクリプトにメッセージを送信
          // クロスオリジン制限により、evalは失敗する可能性が高いため、最初からpostMessageを使用
          try {
            iframe.contentWindow.postMessage({
              type: 'PARALLEL_READ_FONT_SIZE',
              action: 'apply-font-size',
              fontSize: ${fontSize}
            }, '*');
            return { success: true, method: 'postMessage' };
          } catch (postError) {
            console.error('postMessage failed:', postError);
            return { success: false, error: postError.message };
          }
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `)
    
    return result || { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// IPC handler for preventing horizontal scroll in iframe using extension
ipcMain.handle('prevent-iframe-horizontal-scroll', async (event, iframeId) => {
  try {
    // 通常のiframeではwebContentsを直接取得できないため、
    // メインウィンドウのwebContentsからiframeを探して拡張機能のコンテンツスクリプトにメッセージを送信
    const mainWindow = BrowserWindow.fromWebContents(event.sender)
    if (!mainWindow) {
      return { success: false, error: 'Main window not found' }
    }

    if (!extensionId) {
      return { success: false, error: 'Extension not loaded' }
    }

    // メインウィンドウのwebContentsから、iframe内で拡張機能のコンテンツスクリプトにメッセージを送信
    const result = await mainWindow.webContents.executeJavaScript(`
      (async function() {
        try {
          // iframe要素を取得
          const iframe = document.getElementById('${iframeId}');
          if (!iframe || !iframe.contentWindow) {
            return { success: false, error: 'Iframe not found' };
          }

          // iframe内で拡張機能のコンテンツスクリプトにメッセージを送信
          // クロスオリジン制限により、evalは失敗する可能性が高いため、最初からpostMessageを使用
          try {
            iframe.contentWindow.postMessage({
              type: 'PARALLEL_READ_SCROLL',
              action: 'prevent-horizontal-scroll'
            }, '*');
            return { success: true, method: 'postMessage' };
          } catch (postError) {
            console.error('postMessage failed:', postError);
            return { success: false, error: postError.message };
          }
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `)
    
    return result || { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// IPC handler for getting scroll info from iframe
ipcMain.handle('get-iframe-scroll-info', async (event, iframeId) => {
  try {
    const iframeWebContents = iframeWebContentsMap.get(iframeId)
    if (!iframeWebContents || iframeWebContents.isDestroyed()) {
      return { success: false, error: 'Iframe not found or destroyed' }
    }

    const result = await iframeWebContents.executeJavaScript(`
      (function() {
        try {
          const scrollTop = window.scrollY || window.pageYOffset || 0;
          const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
          const clientHeight = window.innerHeight || document.documentElement.clientHeight || 0;
          const maxScroll = Math.max(0, scrollHeight - clientHeight);
          const scrollRatio = maxScroll > 0 ? scrollTop / maxScroll : 0;

          return {
            success: true,
            scrollInfo: {
              scrollTop,
              scrollHeight,
              clientHeight,
              scrollRatio
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `)
    
    return result
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// IPC handler for scrolling iframe
ipcMain.handle('scroll-iframe', async (event, iframeId, distance) => {
  try {
    // 通常のiframeではwebContentsを直接取得できないため、
    // メインウィンドウのwebContentsからiframeを探してスクロールを実行
    const mainWindow = BrowserWindow.fromWebContents(event.sender)
    if (!mainWindow) {
      return { success: false, error: 'Main window not found' }
    }

    // 拡張機能のコンテンツスクリプトを使用してスクロール
    // コンテンツスクリプトはすべてのフレーム（iframeを含む）に注入されている
    if (!extensionId) {
      return { success: false, error: 'Extension not loaded' }
    }

    // メインウィンドウのwebContentsから、すべてのフレームに対してスクロールを実行
    // 拡張機能のコンテンツスクリプトがiframe内で実行されているため、
    // executeJavaScriptで拡張機能のメッセージAPIを使用してスクロールを実行
    const result = await mainWindow.webContents.executeJavaScript(`
      (async function() {
        try {
          // iframe要素を取得
          const iframe = document.getElementById('${iframeId}');
          if (!iframe || !iframe.contentWindow) {
            return { success: false, error: 'Iframe not found' };
          }

          // iframe内で拡張機能のコンテンツスクリプトにメッセージを送信
          // コンテンツスクリプトはiframe内で実行されているため、クロスオリジン制限を回避できる
          // 注意: iframe内から直接chrome.runtime.sendMessageを呼び出す必要がある
          // そのため、iframe内でexecuteJavaScriptを実行する
          try {
            // iframe内で拡張機能のメッセージAPIを使用してスクロール
            const iframeResult = await iframe.contentWindow.eval(\`
              (async function() {
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                  return await new Promise((resolve) => {
                    chrome.runtime.sendMessage('${extensionId}', {
                      action: 'scroll-by',
                      distance: ${distance}
                    }, (response) => {
                      resolve(response || { success: true });
                    });
                  });
                } else {
                  // フォールバック: 直接スクロール
                  window.scrollBy({
                    top: ${distance},
                    behavior: 'smooth'
                  });
                  return { success: true };
                }
              })();
            \`);
            return iframeResult;
          } catch (evalError) {
            // evalが失敗した場合（クロスオリジン制限）、postMessageを使用
            console.warn('eval failed, trying postMessage:', evalError.message);
            iframe.contentWindow.postMessage({
              type: 'PARALLEL_READ_SCROLL',
              action: 'scroll-by',
              distance: ${distance}
            }, '*');
            return { success: true, method: 'postMessage' };
          }
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `)
    
    return result || { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// IPC handler for setting scroll ratio
ipcMain.handle('set-iframe-scroll-ratio', async (event, iframeId, ratio) => {
  try {
    const iframeWebContents = iframeWebContentsMap.get(iframeId)
    if (!iframeWebContents || iframeWebContents.isDestroyed()) {
      return { success: false, error: 'Iframe not found or destroyed' }
    }

    const result = await iframeWebContents.executeJavaScript(`
      (function() {
        try {
          const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
          const clientHeight = window.innerHeight || document.documentElement.clientHeight || 0;
          const maxScroll = Math.max(0, scrollHeight - clientHeight);
          const targetScroll = ${ratio} * maxScroll;

          window.scrollTo({
            top: targetScroll,
            behavior: 'smooth'
          });
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `)
    
    return result || { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})
