import { ref, onUnmounted } from 'vue'
import { useReaderStore } from '../stores/reader'
import { useSettingsStore } from '../stores/settings'

// Import foliate-js - dynamic import to handle ES modules
let foliateModule = null
const getFoliateModule = async () => {
  if (!foliateModule) {
    foliateModule = await import('foliate-js/view.js')
  }
  return foliateModule
}

export function useEpubReader(paneIndex) {
  const readerStore = useReaderStore()
  const settingsStore = useSettingsStore()

  const containerRef = ref(null)
  const book = ref(null)
  const view = ref(null)
  const isReady = ref(false)
  const styleElement = ref(null)

  // Process TOC to flat structure
  function processToc(toc) {
    if (!toc) return []
    const result = []
    const processItem = (item, level = 0) => {
      result.push({
        label: item.label,
        href: item.href,
        level: level,
      })
      if (item.subitems) {
        item.subitems.forEach((subitem) => processItem(subitem, level + 1))
      }
    }
    toc.forEach((item) => processItem(item))
    return result
  }

  // Generate scoped styles for foliate-view
  function generateScopedStyles() {
    const colors = settingsStore.getThemeColors()
    const settings = settingsStore.paneSettings[paneIndex]
    const fontFamily = settings.fontFamily === 'system-ui'
      ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif'
      : settings.fontFamily

    return `
      .foliate-container-${paneIndex} {
        width: 100%;
        height: 100%;
        background: ${colors.background};
      }

      .foliate-container-${paneIndex} foliate-view {
        width: 100%;
        height: 100%;
        --foliate-background: ${colors.background};
        --foliate-color: ${colors.text};
        --foliate-font-family: ${fontFamily};
        --foliate-font-size: ${settings.fontSize}px;
        --foliate-font-weight: ${settings.fontWeight};
        --foliate-line-height: ${settings.lineHeight};
        --foliate-letter-spacing: ${settings.letterSpacing}em;
        --foliate-text-align: ${settings.textAlign};
        --foliate-margin: ${settings.marginTop}px ${settings.marginRight}px ${settings.marginBottom}px ${settings.marginLeft}px;
      }

      .foliate-container-${paneIndex} foliate-view::part(container) {
        background: ${colors.background};
      }

      .foliate-container-${paneIndex} foliate-view::part(filter) {
        background: ${colors.background};
      }
    `
  }

  // Update styles
  function updateStyles() {
    if (!styleElement.value) return
    styleElement.value.textContent = generateScopedStyles()

    // Also inject styles into the view if available
    if (view.value?.renderer) {
      injectContentStyles()
    }
  }

  // Inject styles into content documents
  function injectContentStyles() {
    if (!view.value?.renderer?.getContents) return

    const colors = settingsStore.getThemeColors()
    const settings = settingsStore.paneSettings[paneIndex]
    const fontFamily = settings.fontFamily === 'system-ui'
      ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif'
      : settings.fontFamily

    const css = `
      html, body {
        background: ${colors.background} !important;
        color: ${colors.text} !important;
        font-family: ${fontFamily} !important;
        font-size: ${settings.fontSize}px !important;
        font-weight: ${settings.fontWeight} !important;
        line-height: ${settings.lineHeight} !important;
        letter-spacing: ${settings.letterSpacing}em !important;
        text-align: ${settings.textAlign} !important;
      }
      a { color: ${colors.link} !important; }
      p, div, span { color: ${colors.text} !important; }
      h1, h2, h3, h4, h5, h6 { color: ${colors.text} !important; }
      p {
        margin-top: ${settings.paragraphSpacing}em !important;
        margin-bottom: ${settings.paragraphSpacing}em !important;
      }
      img { max-width: 100%; height: auto; }
    `

    try {
      const contents = view.value.renderer.getContents()
      for (const { doc } of contents) {
        if (!doc) continue

        // Remove existing injected style
        const existing = doc.getElementById('foliate-injected-style')
        if (existing) existing.remove()

        // Add new style
        const style = doc.createElement('style')
        style.id = 'foliate-injected-style'
        style.textContent = css
        doc.head.appendChild(style)
      }
    } catch (e) {
      console.warn('Could not inject styles:', e)
    }
  }

  // Apply theme
  function applyTheme() {
    updateStyles()
  }

  // Apply settings
  function applySettings() {
    updateStyles()
  }

  // Open EPUB file
  async function openFile(file) {
    if (!containerRef.value) {
      throw new Error('Container not ready')
    }

    readerStore.setLoading(paneIndex, true)
    readerStore.clearError(paneIndex)

    try {
      // Ensure foliate-js is loaded (registers the web component)
      await getFoliateModule()

      // Cleanup previous
      cleanup()

      // Create style element
      styleElement.value = document.createElement('style')
      styleElement.value.id = `foliate-styles-${paneIndex}`
      document.head.appendChild(styleElement.value)
      updateStyles()

      // Create container wrapper
      const wrapper = document.createElement('div')
      wrapper.className = `foliate-container-${paneIndex}`
      wrapper.style.width = '100%'
      wrapper.style.height = '100%'
      containerRef.value.appendChild(wrapper)

      // Create foliate-view element
      const foliateView = document.createElement('foliate-view')
      wrapper.appendChild(foliateView)
      view.value = foliateView

      // Open the book
      await foliateView.open(file)
      book.value = foliateView.book

      // Get metadata
      console.log(`Book ${paneIndex} metadata:`, book.value.metadata)

      // Get TOC
      const toc = processToc(book.value.toc)
      readerStore.setToc(paneIndex, toc)

      // Setup event listeners
      foliateView.addEventListener('relocate', (e) => {
        const { cfi } = e.detail
        if (cfi) {
          readerStore.setCurrentLocation(paneIndex, cfi)
        }
      })

      foliateView.addEventListener('load', () => {
        // Inject styles when content loads
        injectContentStyles()
      })

      // Initialize view
      await foliateView.init({ showTextStart: true })

      // Store references
      readerStore.setBook(paneIndex, book.value, 'epub')
      readerStore.setRendition(paneIndex, view.value)
      readerStore.setFileName(paneIndex, file.name)

      isReady.value = true

    } catch (error) {
      console.error(`Error opening EPUB ${paneIndex}:`, error)
      readerStore.setError(paneIndex, `Error loading EPUB: ${error.message}`)
      throw error
    } finally {
      readerStore.setLoading(paneIndex, false)
    }
  }

  // Navigate to specific location
  async function goTo(href) {
    if (!view.value) return
    try {
      await view.value.goTo(href)
    } catch (error) {
      console.error('Error navigating:', error)
    }
  }

  // Navigate to next page
  async function next() {
    if (!view.value) return
    try {
      await view.value.next()
    } catch (error) {
      console.error('Error navigating next:', error)
    }
  }

  // Navigate to previous page
  async function prev() {
    if (!view.value) return
    try {
      await view.value.prev()
    } catch (error) {
      console.error('Error navigating prev:', error)
    }
  }

  // Resize (no-op for foliate-js, handles it automatically)
  function resize() {
    // foliate-js handles resize automatically
  }

  // Get scroll info for sync
  function getScrollInfo() {
    if (!containerRef.value) return null
    const el = containerRef.value
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollRatio: el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight),
    }
  }

  // Set scroll position by ratio
  function setScrollByRatio(ratio) {
    if (!view.value || !view.value.goToFraction) return
    try {
      view.value.goToFraction(ratio)
    } catch (e) {
      console.warn('Could not set scroll position:', e)
    }
  }

  // Cleanup
  function cleanup() {
    // Close view
    if (view.value) {
      try {
        view.value.close()
      } catch (e) {
        console.warn('Error closing view:', e)
      }
      view.value = null
    }

    // Remove style element
    if (styleElement.value && styleElement.value.parentNode) {
      styleElement.value.parentNode.removeChild(styleElement.value)
      styleElement.value = null
    }

    // Clear container
    if (containerRef.value) {
      containerRef.value.innerHTML = ''
    }

    book.value = null
    isReady.value = false
  }

  // Cleanup on unmount
  onUnmounted(() => {
    cleanup()
  })

  return {
    containerRef,
    book,
    isReady,
    openFile,
    goTo,
    next,
    prev,
    resize,
    applyTheme,
    applySettings,
    getScrollInfo,
    setScrollByRatio,
    cleanup,
  }
}
