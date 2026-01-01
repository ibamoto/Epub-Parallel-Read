import { ref, onUnmounted } from 'vue'
import { useReaderStore } from '../stores/reader'
import { useSettingsStore } from '../stores/settings'

// Import foliate-js for EPUB parsing
let epubModule = null
const getEpubModule = async () => {
  if (!epubModule) {
    // Import the view module to get access to book parsing
    epubModule = await import('foliate-js/view.js')
  }
  return epubModule
}

export function useEpubReader(paneIndex) {
  const readerStore = useReaderStore()
  const settingsStore = useSettingsStore()

  const containerRef = ref(null)
  const book = ref(null)
  const isReady = ref(false)
  const styleElement = ref(null)
  const contentWrapper = ref(null)
  const sections = ref([])
  const currentSectionIndex = ref(0)
  const blobUrls = ref([]) // Track blob URLs for cleanup

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

  // Generate styles for content
  function generateContentStyles() {
    const colors = settingsStore.getThemeColors()
    const settings = settingsStore.paneSettings[paneIndex]
    const fontFamily = settings.fontFamily === 'system-ui'
      ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif'
      : settings.fontFamily

    return `
      .epub-content-${paneIndex} {
        width: 100%;
        height: 100%;
        overflow-y: auto;
        overflow-x: hidden;
        background: ${colors.background};
        color: ${colors.text};
        font-family: ${fontFamily};
        font-size: ${settings.fontSize}px;
        font-weight: ${settings.fontWeight};
        line-height: ${settings.lineHeight};
        letter-spacing: ${settings.letterSpacing}em;
        text-align: ${settings.textAlign};
        padding: ${settings.marginTop}px ${settings.marginRight}px ${settings.marginBottom}px ${settings.marginLeft}px;
        box-sizing: border-box;
      }

      .epub-content-${paneIndex} .epub-section {
        margin-bottom: 2em;
        padding-bottom: 1em;
        border-bottom: 1px solid ${colors.text}20;
      }

      .epub-content-${paneIndex} a {
        color: ${colors.link};
      }

      .epub-content-${paneIndex} img {
        max-width: 100%;
        height: auto;
      }

      .epub-content-${paneIndex} p {
        margin-top: ${settings.paragraphSpacing}em;
        margin-bottom: ${settings.paragraphSpacing}em;
      }

      .epub-content-${paneIndex} h1,
      .epub-content-${paneIndex} h2,
      .epub-content-${paneIndex} h3,
      .epub-content-${paneIndex} h4,
      .epub-content-${paneIndex} h5,
      .epub-content-${paneIndex} h6 {
        color: ${colors.text};
        margin-top: 1em;
        margin-bottom: 0.5em;
      }
    `
  }

  // Update styles
  function updateStyles() {
    if (!styleElement.value) return
    styleElement.value.textContent = generateContentStyles()
  }

  // Apply theme
  function applyTheme() {
    updateStyles()
  }

  // Apply settings
  function applySettings() {
    updateStyles()
  }

  // Load and render a section's content
  async function loadSectionContent(section, sectionIndex) {
    try {
      // Create document from section
      const doc = await section.createDocument()
      if (!doc) return null

      // Create a container for this section
      const sectionDiv = document.createElement('div')
      sectionDiv.className = 'epub-section'
      sectionDiv.dataset.sectionIndex = sectionIndex

      // Get the body content
      const body = doc.body
      if (body) {
        // Process images - convert relative URLs to blob URLs
        const images = body.querySelectorAll('img')
        for (const img of images) {
          const src = img.getAttribute('src')
          if (src && !src.startsWith('data:') && !src.startsWith('http')) {
            try {
              // Resolve the image path relative to the section
              const resolvedHref = section.resolveHref?.(src) || src
              const blob = await book.value.loadBlob?.(resolvedHref)
              if (blob) {
                const blobUrl = URL.createObjectURL(blob)
                blobUrls.value.push(blobUrl)
                img.src = blobUrl
              }
            } catch (e) {
              console.warn('Could not load image:', src, e)
            }
          }
        }

        // Clone and append all child nodes
        Array.from(body.childNodes).forEach(node => {
          sectionDiv.appendChild(node.cloneNode(true))
        })
      }

      return sectionDiv
    } catch (error) {
      console.error('Error loading section:', error)
      return null
    }
  }

  // Open EPUB file
  async function openFile(file) {
    if (!containerRef.value) {
      throw new Error('Container not ready')
    }

    readerStore.setLoading(paneIndex, true)
    readerStore.clearError(paneIndex)

    try {
      // Ensure foliate-js is loaded
      await getEpubModule()

      // Cleanup previous
      cleanup()

      // Create style element
      styleElement.value = document.createElement('style')
      styleElement.value.id = `epub-styles-${paneIndex}`
      document.head.appendChild(styleElement.value)
      updateStyles()

      // Create a temporary foliate-view to parse the EPUB
      const tempView = document.createElement('foliate-view')
      tempView.style.display = 'none'
      document.body.appendChild(tempView)

      // Open and parse the book
      await tempView.open(file)
      book.value = tempView.book

      // Get metadata
      console.log(`Book ${paneIndex} metadata:`, book.value.metadata)

      // Get TOC
      const toc = processToc(book.value.toc)
      readerStore.setToc(paneIndex, toc)

      // Store sections reference
      sections.value = book.value.sections || []

      // Create content wrapper
      contentWrapper.value = document.createElement('div')
      contentWrapper.value.className = `epub-content-${paneIndex}`
      containerRef.value.appendChild(contentWrapper.value)

      // Load all sections and render them
      console.log(`Loading ${sections.value.length} sections...`)
      for (let i = 0; i < sections.value.length; i++) {
        const section = sections.value[i]
        if (section.linear !== 'no') {
          const sectionContent = await loadSectionContent(section, i)
          if (sectionContent) {
            contentWrapper.value.appendChild(sectionContent)
          }
        }
      }

      // Remove temporary view
      tempView.close()
      document.body.removeChild(tempView)

      // Store references
      readerStore.setBook(paneIndex, book.value, 'epub')
      readerStore.setFileName(paneIndex, file.name)

      // Restore saved position
      const savedLocation = readerStore.currentLocations[paneIndex]
      if (savedLocation && typeof savedLocation === 'object') {
        restorePosition(savedLocation)
      }

      isReady.value = true

    } catch (error) {
      console.error(`Error opening EPUB ${paneIndex}:`, error)
      readerStore.setError(paneIndex, `Error loading EPUB: ${error.message}`)
      throw error
    } finally {
      readerStore.setLoading(paneIndex, false)
    }
  }

  // Navigate to specific location (TOC item)
  function goTo(href) {
    if (!contentWrapper.value) return

    // Find the section that matches this href
    for (let i = 0; i < sections.value.length; i++) {
      const section = sections.value[i]
      if (section.id === href || section.href === href) {
        const sectionEl = contentWrapper.value.querySelector(`[data-section-index="${i}"]`)
        if (sectionEl) {
          sectionEl.scrollIntoView({ behavior: 'smooth' })
          currentSectionIndex.value = i
          savePosition()
          return
        }
      }
    }

    // If not found by section, try to find by anchor
    const element = contentWrapper.value.querySelector(`[id="${href}"], [name="${href}"]`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
      savePosition()
    }
  }

  // Navigate to next page (scroll by viewport height)
  function next() {
    if (!contentWrapper.value) return
    const viewportHeight = contentWrapper.value.clientHeight
    contentWrapper.value.scrollBy({
      top: viewportHeight * 0.9,
      behavior: 'smooth'
    })
    savePosition()
  }

  // Navigate to previous page (scroll by viewport height)
  function prev() {
    if (!contentWrapper.value) return
    const viewportHeight = contentWrapper.value.clientHeight
    contentWrapper.value.scrollBy({
      top: -viewportHeight * 0.9,
      behavior: 'smooth'
    })
    savePosition()
  }

  // Scroll by distance (for arrow keys)
  function scrollBy(distance) {
    if (!contentWrapper.value) return
    contentWrapper.value.scrollBy({
      top: distance,
      behavior: 'smooth'
    })
    savePosition()
  }

  // Save current position
  function savePosition() {
    if (!contentWrapper.value) return
    const el = contentWrapper.value
    const scrollRatio = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)

    // Find current section
    const sectionEls = el.querySelectorAll('.epub-section')
    let currentSection = 0
    for (let i = 0; i < sectionEls.length; i++) {
      const rect = sectionEls[i].getBoundingClientRect()
      if (rect.top <= 100) {
        currentSection = i
      }
    }

    const position = {
      sectionIndex: currentSection,
      scrollRatio: scrollRatio
    }
    readerStore.setCurrentLocation(paneIndex, position)
  }

  // Restore position
  function restorePosition(position) {
    if (!contentWrapper.value || !position) return

    setTimeout(() => {
      if (position.scrollRatio !== undefined) {
        const el = contentWrapper.value
        const maxScroll = el.scrollHeight - el.clientHeight
        el.scrollTop = position.scrollRatio * maxScroll
      }
    }, 100)
  }

  // Resize handler
  function resize() {
    // Native scrolling handles resize automatically
  }

  // Get scroll info for sync
  function getScrollInfo() {
    if (!contentWrapper.value) return null
    const el = contentWrapper.value
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollRatio: el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight),
    }
  }

  // Set scroll position by ratio
  function setScrollByRatio(ratio) {
    if (!contentWrapper.value) return
    const el = contentWrapper.value
    const maxScroll = el.scrollHeight - el.clientHeight
    el.scrollTop = ratio * maxScroll
  }

  // Cleanup
  function cleanup() {
    // Revoke blob URLs
    blobUrls.value.forEach(url => URL.revokeObjectURL(url))
    blobUrls.value = []

    // Remove style element
    if (styleElement.value && styleElement.value.parentNode) {
      styleElement.value.parentNode.removeChild(styleElement.value)
      styleElement.value = null
    }

    // Clear container
    if (containerRef.value) {
      containerRef.value.innerHTML = ''
    }

    contentWrapper.value = null
    book.value = null
    sections.value = []
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
    scrollBy,
    resize,
    applyTheme,
    applySettings,
    getScrollInfo,
    setScrollByRatio,
    cleanup,
  }
}
