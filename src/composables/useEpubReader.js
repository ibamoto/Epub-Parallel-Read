import { ref, onUnmounted } from 'vue'
import Epub from 'epubjs'
import { useReaderStore } from '../stores/reader'
import { useSettingsStore } from '../stores/settings'

export function useEpubReader(paneIndex) {
  const readerStore = useReaderStore()
  const settingsStore = useSettingsStore()

  const containerRef = ref(null)
  const book = ref(null)
  const rendition = ref(null)
  const isReady = ref(false)

  // Process TOC to flat structure
  function processToc(toc) {
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

  // Apply theme to rendition
  function applyTheme() {
    if (!rendition.value) return

    const colors = settingsStore.getThemeColors()
    const theme = {
      body: {
        background: `${colors.background} !important`,
        color: `${colors.text} !important`,
      },
      'p, div, span': {
        color: `${colors.text} !important`,
      },
      a: {
        color: `${colors.link} !important`,
      },
      'h1, h2, h3, h4, h5, h6': {
        color: `${colors.text} !important`,
      },
    }

    rendition.value.themes.register('current', theme)
    rendition.value.themes.select('current')
  }

  // Apply text settings to rendition
  function applySettings() {
    if (!rendition.value) return

    const settings = settingsStore.paneSettings[paneIndex]
    const fontFamily = settings.fontFamily === 'system-ui'
      ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif'
      : settings.fontFamily

    const textTheme = {
      body: {
        'font-family': fontFamily,
        'font-size': `${settings.fontSize}px`,
        'font-weight': settings.fontWeight,
        'line-height': settings.lineHeight,
        'letter-spacing': `${settings.letterSpacing}em`,
        'text-align': settings.textAlign,
      },
      'body > *': {
        'margin-left': `${settings.marginLeft}px`,
        'margin-right': `${settings.marginRight}px`,
      },
      'body > p, body > div': {
        'margin-top': `${settings.paragraphSpacing}em`,
        'margin-bottom': `${settings.paragraphSpacing}em`,
      },
    }

    rendition.value.themes.register('text-settings', textTheme)
    rendition.value.themes.select('text-settings')
  }

  // Open EPUB file
  async function openFile(file) {
    if (!containerRef.value) {
      throw new Error('Container not ready')
    }

    readerStore.setLoading(paneIndex, true)
    readerStore.clearError(paneIndex)

    try {
      // Cleanup previous book
      cleanup()

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer()

      // Create new book
      book.value = Epub(arrayBuffer)
      await book.value.ready

      // Get metadata
      console.log(`Book ${paneIndex} metadata:`, book.value.metadata)

      // Get TOC
      const navigation = await book.value.navigation
      const toc = processToc(navigation.toc)
      readerStore.setToc(paneIndex, toc)

      // Create rendition
      rendition.value = book.value.renderTo(containerRef.value, {
        width: '100%',
        height: '100%',
        spread: 'none',
        manager: 'continuous',
        flow: 'scrolled-doc',
        snap: false,
        allowScriptedContent: true,
        allowPopups: true,
      })

      // Apply themes
      applyTheme()
      applySettings()

      // Setup event listeners
      rendition.value.on('relocated', (location) => {
        if (location?.start?.cfi) {
          readerStore.setCurrentLocation(paneIndex, location.start.cfi)
        }
      })

      // Display book
      const savedLocation = readerStore.currentLocations[paneIndex]
      if (savedLocation) {
        await rendition.value.display(savedLocation)
      } else {
        await rendition.value.display()
      }

      // Store references
      readerStore.setBook(paneIndex, book.value, 'epub')
      readerStore.setRendition(paneIndex, rendition.value)
      readerStore.setFileName(paneIndex, file.name)

      isReady.value = true

      // Trigger resize after render
      setTimeout(() => {
        rendition.value?.resize()
      }, 100)

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
    if (!rendition.value) return
    try {
      await rendition.value.display(href)
    } catch (error) {
      console.error('Error navigating:', error)
    }
  }

  // Navigate to next page/section
  async function next() {
    if (!rendition.value) return
    try {
      await rendition.value.next()
    } catch (error) {
      console.error('Error navigating next:', error)
    }
  }

  // Navigate to previous page/section
  async function prev() {
    if (!rendition.value) return
    try {
      await rendition.value.prev()
    } catch (error) {
      console.error('Error navigating prev:', error)
    }
  }

  // Resize rendition
  function resize() {
    rendition.value?.resize()
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
    if (!containerRef.value) return
    const el = containerRef.value
    const maxScroll = el.scrollHeight - el.clientHeight
    el.scrollTop = ratio * maxScroll
  }

  // Cleanup
  function cleanup() {
    if (rendition.value) {
      try {
        rendition.value.destroy()
      } catch (e) {
        console.warn('Error destroying rendition:', e)
      }
      rendition.value = null
    }
    if (book.value) {
      try {
        book.value.destroy()
      } catch (e) {
        console.warn('Error destroying book:', e)
      }
      book.value = null
    }
    isReady.value = false
  }

  // Cleanup on unmount
  onUnmounted(() => {
    cleanup()
  })

  return {
    containerRef,
    book,
    rendition,
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
