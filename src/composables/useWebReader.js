import { ref, onUnmounted } from 'vue'
import { useReaderStore } from '../stores/reader'
import { useSettingsStore } from '../stores/settings'

export function useWebReader(paneIndex) {
  const readerStore = useReaderStore()
  const settingsStore = useSettingsStore()

  const containerRef = ref(null)
  const isReady = ref(false)
  let iframe = null // Can be iframe or webview element
  let isWebview = false // True if using Electron webview
  let currentUrl = null
  let currentFontSize = 100
  let scrollInfoRequestId = 0
  const pendingScrollInfoRequests = new Map()
  let messageListener = null
  let wheelOverlay = null // Transparent overlay to capture wheel events for cross-origin iframes
  let wheelHandler = null // Stored handler for cleanup

  function getTargetOrigin() {
    if (!currentUrl) return '*'
    try {
      const origin = new URL(currentUrl).origin
      return origin || '*'
    } catch (e) {
      return '*'
    }
  }

  // Validate and normalize URL
  function normalizeUrl(urlString) {
    if (!urlString) return null

    // Remove leading/trailing whitespace
    urlString = urlString.trim()

    // If it doesn't start with http:// or https://, add https://
    if (!/^https?:\/\//i.test(urlString)) {
      urlString = 'https://' + urlString
    }

    try {
      const url = new URL(urlString)
      return url.href
    } catch (error) {
      console.error('Invalid URL:', error)
      return null
    }
  }

  // Open URL
  async function openUrl(urlString) {
    if (!containerRef.value) {
      throw new Error('Container not ready')
    }

    readerStore.setLoading(paneIndex, true)
    readerStore.clearError(paneIndex)

    await new Promise(resolve => requestAnimationFrame(resolve))

    try {
      cleanup()
      addMessageListener()

      const normalizedUrl = normalizeUrl(urlString)
      if (!normalizedUrl) {
        throw new Error('無効なURLです')
      }

      currentUrl = normalizedUrl
      currentFontSize = settingsStore.urlFontSizes[paneIndex] || 100

      // Setup container
      setupContainer()

      // Load URL in iframe
      iframe.src = normalizedUrl

      // Store references
      readerStore.setBook(paneIndex, { url: normalizedUrl }, 'url')
      readerStore.setFileName(paneIndex, normalizedUrl)

      // Generate simple TOC (just the URL)
      readerStore.setToc(paneIndex, [{
        label: normalizedUrl,
        href: normalizedUrl,
        level: 0,
      }])

      // Wait for iframe to load
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('ページの読み込みがタイムアウトしました'))
        }, 30000) // 30秒タイムアウト

        iframe.onload = () => {
          clearTimeout(timeout)
          // Wait a bit for document to be fully ready
          setTimeout(() => {
            // Apply font size and prevent horizontal scroll after load
            applyFontSize(currentFontSize)
            preventHorizontalScroll()
          }, 100)
          resolve()
        }

        iframe.onerror = () => {
          clearTimeout(timeout)
          reject(new Error('ページの読み込みに失敗しました'))
        }
      })

      isReady.value = true
    } catch (error) {
      console.error(`Error opening URL ${paneIndex}:`, error)
      readerStore.setError(paneIndex, `Error loading URL: ${error.message}`)
      throw error
    } finally {
      readerStore.setLoading(paneIndex, false)
    }
  }


  // Open file (for URL text file)
  async function openFile(file) {
    // Read file as text and treat as URL
    const text = await file.text()
    const urlString = text.trim()
    await openUrl(urlString)
  }

  // Setup container
  function setupContainer() {
    if (!containerRef.value) return

    const container = containerRef.value
    container.innerHTML = ''

    // Get container's computed dimensions
    const rect = container.getBoundingClientRect()
    const containerWidth = rect.width || container.offsetWidth || container.clientWidth
    const containerHeight = rect.height || container.offsetHeight || container.clientHeight

    // Set container styles to ensure proper sizing
    container.style.cssText = `
      width: 100%;
      height: 100%;
      overflow: auto;
      position: relative;
      display: block;
      min-width: 0;
      min-height: 0;
    `

    // Use webview in Electron environment for better cross-origin control
    // Use iframe in browser environment
    isWebview = typeof window !== 'undefined' && !!window.electronAPI

    if (isWebview) {
      // Create webview element (Electron only)
      iframe = document.createElement('webview')
      iframe.id = `web-reader-webview-${paneIndex}`
      iframe.className = 'web-reader-webview'
      iframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
        background: white;
        display: block;
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        min-width: 0;
        min-height: 0;
      `
      // Enable node integration for webview to use executeJavaScript
      iframe.setAttribute('webpreferences', 'contextIsolation=yes')
      iframe.setAttribute('allowpopups', '')

      // Listen for dom-ready event to apply initial settings
      iframe.addEventListener('dom-ready', () => {
        console.log('WebReader: webview dom-ready')
        isReady.value = true
        preventHorizontalScroll()
        // Apply initial font size
        if (currentFontSize !== 100) {
          applyFontSizeToWebview(currentFontSize)
        }
      })
    } else {
      // Create iframe (browser environment)
      iframe = document.createElement('iframe')
      iframe.id = `web-reader-iframe-${paneIndex}`
      iframe.className = 'web-reader-iframe'
      iframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
        background: white;
        overflow: auto;
        display: block;
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        min-width: 0;
        min-height: 0;
      `
      iframe.setAttribute('scrolling', 'yes')
      iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade')
    }

    container.appendChild(iframe)

    // Add transparent overlay to capture wheel events for cross-origin iframes
    // This overlay sits on top of the iframe but allows wheel events to be captured
    // and forwarded to both the iframe content and the sync mechanism
    wheelOverlay = document.createElement('div')
    wheelOverlay.id = `web-reader-wheel-overlay-${paneIndex}`
    wheelOverlay.className = 'web-reader-wheel-overlay'
    wheelOverlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10;
      background: transparent;
      cursor: default;
    `
    container.appendChild(wheelOverlay)

    // Setup wheel event handler on the overlay
    wheelHandler = (event) => {
      // Calculate scroll distance
      const scrollDistance = event.deltaY

      // Scroll the iframe/webview content
      scrollBy(scrollDistance)

      // Dispatch a custom event for App.vue to handle sync
      // This allows the wheel sync mechanism in App.vue to work for URL mode
      const syncEvent = new CustomEvent('urlWheelScroll', {
        bubbles: true,
        detail: {
          paneIndex,
          deltaY: event.deltaY,
          scrollDistance
        }
      })
      container.dispatchEvent(syncEvent)
    }
    wheelOverlay.addEventListener('wheel', wheelHandler, { passive: true })

    // Force resize after a short delay to ensure layout is complete
    setTimeout(() => {
      if (iframe && container) {
        const newRect = container.getBoundingClientRect()
        if (newRect.width > 0 && newRect.height > 0) {
          // Trigger resize event if needed
          if (iframe.contentWindow) {
            try {
              iframe.contentWindow.dispatchEvent(new Event('resize'))
            } catch (e) {
              // Cross-origin restriction, ignore
            }
          }
        }
      }
    }, 100)
  }

  // Navigate to URL
  function goTo(href) {
    if (href && href !== currentUrl) {
      openUrl(href)
    }
  }

  // Reload current page
  function reload() {
    if (iframe && currentUrl) {
      iframe.src = currentUrl
    }
  }

  /**
   * Calculate scroll distance based on settings (supports px and vh units)
   */
  function calculateScrollDistance() {
    const settings = settingsStore.urlScrollSettings[paneIndex] || { amount: 50, unit: 'vh' }
    let scrollAmount = settings.amount

    if (settings.unit === 'vh') {
      // Convert vh to pixels based on iframe's viewport height
      const viewportHeight = iframe?.clientHeight || window.innerHeight
      scrollAmount = (settings.amount / 100) * viewportHeight
    }
    // 'px' unit uses the amount directly

    return scrollAmount
  }

  /**
   * 次へナビゲーション（下方向スクロール）
   *
   * 注意: URLリーダーは仕様が異なるため、EPUB/Markdown/PDFとは別実装
   * - EPUB/Markdown/PDF: セクション/ページ単位の移動
   * - URL: 設定されたスクロール量で下方向にスクロール (vh単位対応)
   *
   * @see READER_SPECIFICATIONS.md (EPUB/Markdown/PDFの仕様)
   */
  function next() {
    console.log('WebReader.next called', {
      hasIframe: !!iframe,
      isWebview,
      paneIndex
    })

    if (!iframe) {
      console.warn('WebReader.next: iframe/webview not available')
      return
    }

    const scrollAmount = calculateScrollDistance()
    console.log('WebReader.next: scrolling down by', scrollAmount, 'px')

    // webviewの場合はexecuteJavaScriptを使用
    if (isWebview && iframe.executeJavaScript) {
      scrollWebview(scrollAmount)
      return
    }

    // iframe の場合
    if (!iframe.contentWindow) {
      console.warn('WebReader.next: contentWindow not available')
      return
    }

    const targetOrigin = getTargetOrigin()
    const isSameOrigin =
      targetOrigin !== '*' &&
      targetOrigin !== 'null' &&
      targetOrigin === window.location.origin

    // 同一オリジンの場合は直接スクロール
    if (isSameOrigin) {
      try {
        iframe.contentWindow.scrollBy({
          top: scrollAmount,
          behavior: 'smooth',
        })
        console.log('WebReader.next: scrollBy executed successfully (direct)')
        return
      } catch (e) {
        console.warn('WebReader.next: direct scroll failed:', e.message)
      }
    }

    // クロスオリジンの場合はpostMessageを使用
    // content.jsでPARALLEL_READ_SCROLLメッセージを処理
    try {
      iframe.contentWindow.postMessage({
        type: 'PARALLEL_READ_SCROLL',
        action: 'scroll-by',
        distance: scrollAmount
      }, targetOrigin)
      console.log('WebReader.next: postMessage sent')
    } catch (postError) {
      console.error('WebReader.next: postMessage failed:', postError)
    }
  }

  /**
   * 前へナビゲーション（上方向スクロール）
   *
   * 注意: URLリーダーは仕様が異なるため、EPUB/Markdown/PDFとは別実装
   * - EPUB/Markdown/PDF: セクション/ページ単位の移動
   * - URL: 設定されたスクロール量で上方向にスクロール (vh単位対応)
   *
   * @see READER_SPECIFICATIONS.md (EPUB/Markdown/PDFの仕様)
   */
  function prev() {
    console.log('WebReader.prev called', {
      hasIframe: !!iframe,
      isWebview,
      paneIndex
    })

    if (!iframe) {
      console.warn('WebReader.prev: iframe/webview not available')
      return
    }

    const scrollAmount = calculateScrollDistance()
    console.log('WebReader.prev: scrolling up by', scrollAmount, 'px')

    // webviewの場合はexecuteJavaScriptを使用
    if (isWebview && iframe.executeJavaScript) {
      scrollWebview(-scrollAmount)
      return
    }

    // iframe の場合
    if (!iframe.contentWindow) {
      console.warn('WebReader.prev: contentWindow not available')
      return
    }

    const targetOrigin = getTargetOrigin()
    const isSameOrigin =
      targetOrigin !== '*' &&
      targetOrigin !== 'null' &&
      targetOrigin === window.location.origin

    // 同一オリジンの場合は直接スクロール
    if (isSameOrigin) {
      try {
        iframe.contentWindow.scrollBy({
          top: -scrollAmount,
          behavior: 'smooth',
        })
        console.log('WebReader.prev: scrollBy executed successfully (direct)')
        return
      } catch (e) {
        console.warn('WebReader.prev: direct scroll failed:', e.message)
      }
    }

    // クロスオリジンの場合はpostMessageを使用
    // content.jsでPARALLEL_READ_SCROLLメッセージを処理
    try {
      iframe.contentWindow.postMessage({
        type: 'PARALLEL_READ_SCROLL',
        action: 'scroll-by',
        distance: -scrollAmount
      }, targetOrigin)
      console.log('WebReader.prev: postMessage sent')
    } catch (postError) {
      console.error('WebReader.prev: postMessage failed:', postError)
    }
  }

  // Listen for iframe postMessage responses (e.g., scroll info)
  function addMessageListener() {
    if (messageListener) return

    messageListener = (event) => {
      if (!event?.data || event.data.type !== 'PARALLEL_READ_RESPONSE') return

      const { requestId, success, error } = event.data
      if (!requestId) return

      const handlers = pendingScrollInfoRequests.get(requestId)
      if (!handlers) return

      pendingScrollInfoRequests.delete(requestId)

      if (success) {
        handlers.resolve(event.data)
      } else if (typeof handlers.reject === 'function') {
        handlers.reject(new Error(error || 'Failed to get scroll info'))
      }
    }

    window.addEventListener('message', messageListener)
  }

  function removeMessageListener() {
    if (!messageListener) return
    window.removeEventListener('message', messageListener)
    messageListener = null
  }

  // Get scroll info for sync (synchronous - may fail for cross-origin)
  function getScrollInfo() {
    if (!iframe || !iframe.contentWindow) return null

    try {
      // Try to get scroll info from iframe (may fail due to cross-origin restrictions)
      const iframeWindow = iframe.contentWindow
      const scrollTop = iframeWindow.scrollY || iframeWindow.pageYOffset || 0
      const scrollHeight = iframeWindow.document.documentElement.scrollHeight || iframeWindow.document.body.scrollHeight || 0
      const clientHeight = iframeWindow.innerHeight || iframe.clientHeight || 0
      const maxScroll = Math.max(0, scrollHeight - clientHeight)
      const scrollRatio = maxScroll > 0 ? scrollTop / maxScroll : 0

      return {
        scrollTop,
        scrollHeight,
        clientHeight,
        scrollRatio,
      }
    } catch (error) {
      // Cross-origin restriction - return null to indicate sync is not possible synchronously
      return null
    }
  }

  // Get scroll info asynchronously (works for cross-origin via postMessage)
  async function getScrollInfoAsync() {
    if (!iframe || !iframe.contentWindow) return null

    // First, try synchronous access
    const syncResult = getScrollInfo()
    if (syncResult !== null) {
      return syncResult
    }

    // Fall back to postMessage for cross-origin
    return new Promise((resolve, reject) => {
      const requestId = `scroll-info-${paneIndex}-${++scrollInfoRequestId}`
      const timeoutMs = 2000

      const timeoutId = setTimeout(() => {
        pendingScrollInfoRequests.delete(requestId)
        resolve(null) // Return null on timeout instead of rejecting
      }, timeoutMs)

      pendingScrollInfoRequests.set(requestId, {
        resolve: (data) => {
          clearTimeout(timeoutId)
          resolve(data.scrollInfo || null)
        },
        reject: (error) => {
          clearTimeout(timeoutId)
          resolve(null) // Return null on error instead of rejecting
        }
      })

      try {
        iframe.contentWindow.postMessage({
          type: 'PARALLEL_READ_SCROLL',
          action: 'get-scroll-info',
          requestId: requestId
        }, '*')
      } catch (e) {
        clearTimeout(timeoutId)
        pendingScrollInfoRequests.delete(requestId)
        resolve(null)
      }
    })
  }

  // Set scroll position by ratio
  function setScrollByRatio(ratio) {
    if (!iframe || !iframe.contentWindow) return

    try {
      const iframeWindow = iframe.contentWindow
      const scrollHeight = iframeWindow.document.documentElement.scrollHeight || iframeWindow.document.body.scrollHeight || 0
      const clientHeight = iframeWindow.innerHeight || iframe.clientHeight || 0
      const maxScroll = Math.max(0, scrollHeight - clientHeight)
      const targetScroll = ratio * maxScroll

      iframeWindow.scrollTo({
        top: targetScroll,
        behavior: 'smooth',
      })
    } catch (error) {
      // Cross-origin restriction - can't set scroll position
      console.warn('Cannot set scroll position for iframe due to cross-origin restriction:', error)
    }
  }

  // Scroll by distance (supports vh unit conversion when distance is passed with unit info)
  // distance can be a number (px) or will be calculated using vh if settings specify
  function scrollBy(distance, useSettings = false) {
    if (!iframe) {
      return
    }

    let actualDistance = distance
    if (useSettings) {
      // Calculate based on settings
      actualDistance = (distance > 0 ? 1 : -1) * calculateScrollDistance()
    }

    // webviewの場合はexecuteJavaScriptを使用
    if (isWebview && iframe.executeJavaScript) {
      scrollWebview(actualDistance)
      return
    }

    // iframe の場合
    if (!iframe.contentWindow) {
      return
    }

    const targetOrigin = getTargetOrigin()
    const isSameOrigin =
      targetOrigin !== '*' &&
      targetOrigin !== 'null' &&
      targetOrigin === window.location.origin

    // 同一オリジンの場合は直接スクロール
    if (isSameOrigin) {
      try {
        iframe.contentWindow.scrollBy({
          top: actualDistance,
          behavior: 'smooth',
        })
        return
      } catch (error) {
        console.warn('scrollBy: direct scroll failed:', error.message)
      }
    }

    // クロスオリジンの場合はpostMessageを使用
    try {
      iframe.contentWindow.postMessage({
        type: 'PARALLEL_READ_SCROLL',
        action: 'scroll-by',
        distance: actualDistance
      }, targetOrigin)
    } catch (postError) {
      console.error('scrollBy: postMessage failed:', postError)
    }
  }

  // Scroll webview using executeJavaScript (Electron only)
  function scrollWebview(distance) {
    if (!iframe || !iframe.executeJavaScript) {
      console.warn('scrollWebview: webview not available')
      return
    }

    iframe.executeJavaScript(`
      window.scrollBy({
        top: ${distance},
        behavior: 'smooth'
      });
    `).catch(err => {
      console.error('scrollWebview failed:', err)
    })
  }

  // Apply font size to webview using executeJavaScript (Electron only)
  function applyFontSizeToWebview(size) {
    if (!iframe || !iframe.executeJavaScript) {
      console.warn('applyFontSizeToWebview: webview not available')
      return
    }

    const scale = Math.max(0.5, Math.min(2, size / 100))

    iframe.executeJavaScript(`
      (function() {
        let styleEl = document.getElementById('epub-parallel-read-font-size-style');
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'epub-parallel-read-font-size-style';
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = \`
          html, body {
            font-size: ${size}% !important;
            zoom: ${scale} !important;
          }
        \`;
      })();
    `).catch(err => {
      console.error('applyFontSizeToWebview failed:', err)
    })
  }

  // Scroll by vh unit (for external calls from App.vue)
  function scrollByVh(vhAmount) {
    if (!iframe) return
    const viewportHeight = iframe.clientHeight || window.innerHeight
    const pxAmount = (vhAmount / 100) * viewportHeight
    scrollBy(pxAmount)
  }

  // Apply font size to iframe content
  function applyFontSize(size) {
    currentFontSize = size

    if (!iframe) {
      console.warn('Cannot apply font size: iframe not ready')
      return
    }

    console.log('WebReader.applyFontSize called:', size)

    // webviewの場合はexecuteJavaScriptを使用
    if (isWebview && iframe.executeJavaScript) {
      applyFontSizeToWebview(size)
      return
    }

    // iframe の場合
    const targetOrigin = getTargetOrigin()
    const isSameOrigin =
      targetOrigin !== '*' &&
      targetOrigin !== 'null' &&
      targetOrigin === window.location.origin

    // まずは同一オリジンの場合のみ直接DOMへ適用
    if (isSameOrigin) {
      try {
        applyFontSizeToDocument(size)
        return
      } catch (directErr) {
        console.warn('Direct applyFontSizeToDocument failed, falling back:', directErr)
      }
    }

    // iframeはあるがcontentWindowがまだ無い場合はスケールで暫定対応しつつ後で再試行
    if (!iframe.contentWindow) {
      setTimeout(() => {
        if (iframe?.contentWindow) {
          applyFontSize(size)
        }
      }, 200)
      return
    }

    // クロスオリジン制限により、直接iframe内のdocumentにアクセスできない
    // まずCSS transformフォールバックを適用（確実に動作する）
    // その後、Electron IPC経由でpostMessageを送信（content scriptがあればより良い結果になる）

    // 常にフォールバックを最初に適用（確実に動作）
    applyFontSizeFallback(size)

    // 追加でElectron IPC経由でcontent scriptへの適用を試みる
    // content scriptが正しく動作すれば、より良いフォントサイズ適用になる
    if (typeof window !== 'undefined' && window.electronAPI) {
      const iframeId = iframe.id || `web-reader-iframe-${paneIndex}`
      window.electronAPI.applyIframeFontSize(iframeId, size)
        .then(result => {
          console.log('WebReader.applyFontSize: Electron IPC result:', result)
        })
        .catch(err => {
          console.log('WebReader.applyFontSize: Electron IPC failed (fallback already applied):', err.message)
        })
    }
  }

  // Fallback function to apply font size using CSS transform on the iframe element
  // This works for cross-origin iframes where we cannot access the document
  function applyFontSizeFallback(size) {
    if (!iframe) {
      console.warn('Cannot apply font size fallback: iframe not ready')
      return
    }

    console.log('WebReader.applyFontSizeFallback: applying transform scale', size)

    const zoomLevel = size / 100

    // Use CSS transform to scale the iframe content
    iframe.style.transform = `scale(${zoomLevel})`
    iframe.style.transformOrigin = 'top left'

    // Adjust iframe size to compensate for transform scale
    if (zoomLevel !== 1) {
      iframe.style.width = `${100 / zoomLevel}%`
      iframe.style.height = `${100 / zoomLevel}%`
    } else {
      iframe.style.width = '100%'
      iframe.style.height = '100%'
    }

    console.log(`Font size fallback applied: ${size}% (scale: ${zoomLevel})`)
  }

  // Helper function to apply font size to document
  function applyFontSizeToDocument(size) {
    try {
      const iframeWindow = iframe.contentWindow
      if (!iframeWindow) {
        console.warn('Cannot apply font size: iframe window not accessible')
        return
      }

      const iframeDoc = iframeWindow.document
      if (!iframeDoc) {
        console.warn('Cannot apply font size: document not accessible')
        // Retry after a short delay
        setTimeout(() => {
          if (iframe && iframe.contentWindow) {
            applyFontSizeToDocument(size)
          }
        }, 100)
        return
      }

      // Wait for body to be ready
      if (!iframeDoc.body) {
        console.warn('Cannot apply font size: document body not ready, retrying...')
        setTimeout(() => {
          if (iframe && iframe.contentWindow && iframe.contentWindow.document) {
            applyFontSizeToDocument(size)
          }
        }, 100)
        return
      }

      // Create or update style element
      let styleEl = iframeDoc.getElementById('epub-parallel-read-font-size-style')
      if (!styleEl) {
        styleEl = iframeDoc.createElement('style')
        styleEl.id = 'epub-parallel-read-font-size-style'
        if (iframeDoc.head) {
          iframeDoc.head.appendChild(styleEl)
        } else {
          // Fallback: append to body if head doesn't exist
          iframeDoc.body.insertBefore(styleEl, iframeDoc.body.firstChild)
        }
      }

      styleEl.textContent = `
        html, body {
          overflow-x: hidden !important;
          max-width: 100% !important;
          font-size: ${size}% !important;
        }
        * {
          max-width: 100% !important;
          box-sizing: border-box !important;
        }
        img, video, iframe, embed, object {
          max-width: 100% !important;
          height: auto !important;
        }
        table {
          max-width: 100% !important;
          table-layout: auto !important;
          word-wrap: break-word !important;
        }
      `
      console.log(`Font size applied: ${size}%`)
    } catch (error) {
      console.warn('Error applying font size to document:', error)
      // Retry after a short delay if it's a cross-origin error
      if (error.name !== 'SecurityError' && error.name !== 'DOMException') {
        setTimeout(() => {
          if (iframe && iframe.contentWindow) {
            applyFontSizeToDocument(size)
          }
        }, 200)
      }
    }
  }

  // Prevent horizontal scroll in iframe
  function preventHorizontalScroll() {
    if (!iframe || !iframe.contentWindow) {
      console.warn('Cannot prevent horizontal scroll: iframe not ready')
      return
    }

    console.log('WebReader.preventHorizontalScroll called')

    // クロスオリジン制限により、直接iframe内のdocumentにアクセスできない
    // Electron IPC経由で拡張機能のコンテンツスクリプトを使用して横スクロール防止を適用
    // 直接アクセスは試行しない（常にクロスオリジン制限で失敗するため）

    // Electron IPC経由で拡張機能のコンテンツスクリプトを使用
    if (typeof window !== 'undefined' && window.electronAPI) {
      const iframeId = iframe.id || `web-reader-iframe-${paneIndex}`
      window.electronAPI.preventIframeHorizontalScroll(iframeId)
        .then(result => {
          console.log('WebReader.preventHorizontalScroll: Electron IPC result:', result)
        })
        .catch(err => {
          console.error('WebReader.preventHorizontalScroll: Electron IPC failed:', err)
          // フォールバック: postMessageを使用
          try {
            const targetOrigin = getTargetOrigin()
            iframe.contentWindow.postMessage({
              type: 'PARALLEL_READ_SCROLL',
              action: 'prevent-horizontal-scroll'
            }, targetOrigin)
            console.log('WebReader.preventHorizontalScroll: postMessage sent (fallback)')
          } catch (postError) {
            console.error('WebReader.preventHorizontalScroll: postMessage failed:', postError)
          }
        })
    } else {
      // electronAPIが利用できない場合、postMessageを使用
      try {
        const targetOrigin = getTargetOrigin()
        iframe.contentWindow.postMessage({
          type: 'PARALLEL_READ_SCROLL',
          action: 'prevent-horizontal-scroll'
        }, targetOrigin)
        console.log('WebReader.preventHorizontalScroll: postMessage sent')
      } catch (postError) {
        console.error('WebReader.preventHorizontalScroll: postMessage failed:', postError)
      }
    }
  }

  // Helper function to apply horizontal scroll prevention
  function applyHorizontalScrollPrevention() {
    try {
      const iframeWindow = iframe.contentWindow
      const iframeDoc = iframeWindow.document

      if (!iframeDoc || !iframeDoc.body) {
        console.warn('Cannot prevent horizontal scroll: document body not ready')
        return
      }

      // Create or update style element
      let styleEl = iframeDoc.getElementById('epub-parallel-read-scroll-style')
      if (!styleEl) {
        styleEl = iframeDoc.createElement('style')
        styleEl.id = 'epub-parallel-read-scroll-style'
        if (iframeDoc.head) {
          iframeDoc.head.appendChild(styleEl)
        } else {
          // Fallback: append to body if head doesn't exist
          iframeDoc.body.insertBefore(styleEl, iframeDoc.body.firstChild)
        }
      }

      styleEl.textContent = `
        html, body {
          overflow-x: hidden !important;
          max-width: 100% !important;
        }
        * {
          max-width: 100% !important;
          box-sizing: border-box !important;
        }
        img, video, iframe, embed, object {
          max-width: 100% !important;
          height: auto !important;
        }
        table {
          max-width: 100% !important;
          table-layout: auto !important;
          word-wrap: break-word !important;
        }
      `
    } catch (error) {
      console.warn('Error applying horizontal scroll prevention:', error)
    }
  }

  // Apply settings (not applicable for web)
  function applySettings() {
    // Web pages have their own styling
    // But we can try to apply font size if available
    if (currentFontSize !== 100) {
      applyFontSize(currentFontSize)
    }
  }

  // Resize iframe to match container
  function resize() {
    if (!containerRef.value || !iframe) return

    const container = containerRef.value
    const rect = container.getBoundingClientRect()
    
    // Ensure iframe matches container size
    if (iframe.style.width !== '100%' || iframe.style.height !== '100%') {
      iframe.style.width = '100%'
      iframe.style.height = '100%'
    }

    // Trigger resize event in iframe if possible
    if (iframe.contentWindow) {
      try {
        iframe.contentWindow.dispatchEvent(new Event('resize'))
      } catch (e) {
        // Cross-origin restriction, ignore
      }
    }
  }

  // Cleanup
  function cleanup() {
    // Remove message listener
    removeMessageListener()

    // Clear pending requests
    pendingScrollInfoRequests.clear()

    // Remove wheel overlay and handler
    if (wheelOverlay && wheelHandler) {
      wheelOverlay.removeEventListener('wheel', wheelHandler)
    }
    wheelOverlay = null
    wheelHandler = null

    if (iframe) {
      iframe.src = 'about:blank'
      iframe = null
    }
    currentUrl = null
    isReady.value = false

    if (containerRef.value) {
      containerRef.value.innerHTML = ''
      containerRef.value.style.cssText = ''
    }
  }

  // Cleanup on unmount
  onUnmounted(() => {
    cleanup()
  })

  return {
    containerRef,
    isReady,
    openFile,
    openUrl,
    goTo,
    reload,
    next,
    prev,
    getScrollInfo,
    getScrollInfoAsync,
    setScrollByRatio,
    scrollBy,
    scrollByVh,
    calculateScrollDistance,
    applySettings,
    applyFontSize,
    preventHorizontalScroll,
    resize,
    cleanup,
  }
}
