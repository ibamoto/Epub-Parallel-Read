import { ref, watch, onUnmounted } from 'vue'
import { useReaderStore } from '../stores/reader'
import { useSettingsStore } from '../stores/settings'

// Import foliate-js for EPUB parsing
let epubModule = null
const getEpubModule = async () => {
  if (!epubModule) {
    epubModule = await import('foliate-js/view.js')
  }
  return epubModule
}

// Constants for lazy loading
const INITIAL_SECTIONS = 3 // Load first N sections immediately
const BUFFER_SECTIONS = 2 // Pre-load N sections ahead

export function useEpubReader(paneIndex) {
  const readerStore = useReaderStore()
  const settingsStore = useSettingsStore()

  const containerRef = ref(null)
  const book = ref(null)
  const isReady = ref(false)
  const styleElement = ref(null)
  const contentWrapper = ref(null)
  const sections = ref([])
  const loadedSections = ref(new Set()) // Track which sections are loaded
  const blobUrls = ref([])
  let onScrollCallback = null
  let scrollThrottleTimer = null
  let intersectionObserver = null

  // Page mode state
  const currentPage = ref(0)
  const totalPages = ref(1)
  const columnWrapper = ref(null) // Inner wrapper for column layout
  let displayModeWatcher = null

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
    const isPageMode = settingsStore.epubDisplayModes[paneIndex] === 'page'
    const fontFamily = settings.fontFamily === 'system-ui'
      ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif'
      : settings.fontFamily

    // Base styles for both modes
    let styles = `
      .epub-content-${paneIndex} {
        width: 100%;
        height: 100%;
        background: ${colors.background};
        color: ${colors.text};
        font-family: ${fontFamily};
        font-size: ${settings.fontSize}px;
        font-weight: ${settings.fontWeight};
        line-height: ${settings.lineHeight};
        letter-spacing: ${settings.letterSpacing}em;
        text-align: ${settings.textAlign};
        box-sizing: border-box;
      }
    `

    if (isPageMode) {
      // Page mode: use CSS columns for pagination
      styles += `
        .epub-content-${paneIndex} {
          overflow: hidden;
          padding: 0;
        }

        .epub-content-${paneIndex} .epub-column-wrapper {
          height: 100%;
          column-width: calc(100% - ${settings.marginLeft + settings.marginRight}px);
          column-gap: ${settings.marginLeft + settings.marginRight}px;
          column-fill: auto;
          padding: ${settings.marginTop}px ${settings.marginRight}px ${settings.marginBottom}px ${settings.marginLeft}px;
          box-sizing: border-box;
          transition: transform 0.3s ease;
        }

        .epub-content-${paneIndex} .epub-section {
          break-inside: avoid-column;
          margin-bottom: 2em;
          padding-bottom: 1em;
          border-bottom: 1px solid ${colors.text}20;
        }

        .epub-content-${paneIndex} .epub-section-placeholder {
          min-height: 200px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${colors.text}40;
          font-size: 0.9em;
          break-inside: avoid;
        }
      `
    } else {
      // Scroll mode: standard scrollable container
      styles += `
        .epub-content-${paneIndex} {
          overflow-y: auto;
          overflow-x: hidden;
          padding: ${settings.marginTop}px ${settings.marginRight}px ${settings.marginBottom}px ${settings.marginLeft}px;
        }

        .epub-content-${paneIndex} .epub-section {
          margin-bottom: 2em;
          padding-bottom: 1em;
          border-bottom: 1px solid ${colors.text}20;
        }

        .epub-content-${paneIndex} .epub-section-placeholder {
          min-height: 200px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${colors.text}40;
          font-size: 0.9em;
        }
      `
    }

    // Common element styles
    styles += `
      .epub-content-${paneIndex} a { color: ${colors.link}; }
      .epub-content-${paneIndex} img { max-width: 100%; height: auto; }
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

    return styles
  }

  function updateStyles() {
    if (!styleElement.value) return
    styleElement.value.textContent = generateContentStyles()
    // Recalculate pages when styles change in page mode
    if (settingsStore.epubDisplayModes[paneIndex] === 'page') {
      setTimeout(() => calculateTotalPages(), 50)
    }
  }

  function applyTheme() { updateStyles() }
  function applySettings() { updateStyles() }

  // Page mode helper functions
  function calculateTotalPages() {
    if (!columnWrapper.value || !contentWrapper.value) return

    const wrapper = columnWrapper.value
    const container = contentWrapper.value
    const containerWidth = container.clientWidth

    if (containerWidth === 0) return

    // Total scrollable width divided by container width = total pages
    const scrollWidth = wrapper.scrollWidth
    const pages = Math.max(1, Math.ceil(scrollWidth / containerWidth))
    totalPages.value = pages

    // Ensure current page is within bounds
    if (currentPage.value >= pages) {
      currentPage.value = pages - 1
      updatePagePosition()
    }
  }

  function updatePagePosition() {
    if (!columnWrapper.value || !contentWrapper.value) return

    const containerWidth = contentWrapper.value.clientWidth
    const offset = -currentPage.value * containerWidth
    columnWrapper.value.style.transform = `translateX(${offset}px)`

    // Trigger scroll callback for sync
    if (onScrollCallback) {
      onScrollCallback()
    }
  }

  function goToPage(page) {
    if (!isReady.value) return

    const newPage = Math.max(0, Math.min(page, totalPages.value - 1))
    if (newPage !== currentPage.value) {
      currentPage.value = newPage
      updatePagePosition()
      savePosition()
    }
  }

  function nextPage() {
    if (currentPage.value < totalPages.value - 1) {
      goToPage(currentPage.value + 1)
    }
  }

  function prevPage() {
    if (currentPage.value > 0) {
      goToPage(currentPage.value - 1)
    }
  }

  // Load and render a section's content
  async function loadSectionContent(section, sectionIndex, placeholder) {
    if (loadedSections.value.has(sectionIndex)) return

    try {
      const doc = await section.createDocument()
      if (!doc) return

      loadedSections.value.add(sectionIndex)

      const sectionDiv = document.createElement('div')
      sectionDiv.className = 'epub-section'
      sectionDiv.dataset.sectionIndex = sectionIndex
      sectionDiv.dataset.loaded = 'true'

      const body = doc.body
      if (body) {
        // Process images
        const images = body.querySelectorAll('img')
        for (const img of images) {
          const src = img.getAttribute('src')
          if (src && !src.startsWith('data:') && !src.startsWith('http')) {
            try {
              const resolvedHref = section.resolveHref?.(src) || src
              const blob = await book.value.loadBlob?.(resolvedHref)
              if (blob) {
                const blobUrl = URL.createObjectURL(blob)
                blobUrls.value.push(blobUrl)
                img.src = blobUrl
              }
            } catch (e) {
              // Silently ignore image loading errors
            }
          }
        }

        Array.from(body.childNodes).forEach(node => {
          sectionDiv.appendChild(node.cloneNode(true))
        })
      }

      // Replace placeholder with actual content
      if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.replaceChild(sectionDiv, placeholder)
      }

      return sectionDiv
    } catch (error) {
      console.error('Error loading section:', sectionIndex, error)
      return null
    }
  }

  // Create placeholder for a section
  function createPlaceholder(sectionIndex) {
    const placeholder = document.createElement('div')
    placeholder.className = 'epub-section epub-section-placeholder'
    placeholder.dataset.sectionIndex = sectionIndex
    placeholder.dataset.loaded = 'false'
    placeholder.textContent = `Section ${sectionIndex + 1}`
    return placeholder
  }

  // Setup IntersectionObserver for lazy loading
  function setupIntersectionObserver() {
    if (!contentWrapper.value) return

    intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const sectionIndex = parseInt(entry.target.dataset.sectionIndex, 10)
            const isLoaded = entry.target.dataset.loaded === 'true'

            if (!isLoaded && !isNaN(sectionIndex)) {
              // Load this section and buffer sections ahead
              loadSectionsInRange(sectionIndex, sectionIndex + BUFFER_SECTIONS)
            }
          }
        })
      },
      {
        root: contentWrapper.value,
        rootMargin: '200px 0px', // Pre-load when within 200px
        threshold: 0
      }
    )
  }

  // Load sections in a range
  async function loadSectionsInRange(start, end) {
    const linearSections = sections.value.filter(s => s.linear !== 'no')

    for (let i = start; i <= Math.min(end, linearSections.length - 1); i++) {
      if (loadedSections.value.has(i)) continue

      const placeholder = contentWrapper.value?.querySelector(
        `.epub-section-placeholder[data-section-index="${i}"]`
      )
      if (placeholder) {
        await loadSectionContent(linearSections[i], i, placeholder)
      }
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
      await getEpubModule()
      cleanup()

      // Create style element
      styleElement.value = document.createElement('style')
      styleElement.value.id = `epub-styles-${paneIndex}`
      document.head.appendChild(styleElement.value)
      updateStyles()

      // Parse EPUB using temporary foliate-view
      const tempView = document.createElement('foliate-view')
      tempView.style.display = 'none'
      document.body.appendChild(tempView)

      await tempView.open(file)
      book.value = tempView.book

      const toc = processToc(book.value.toc)
      readerStore.setToc(paneIndex, toc)

      sections.value = book.value.sections || []
      const linearSections = sections.value.filter(s => s.linear !== 'no')

      // Create content wrapper
      contentWrapper.value = document.createElement('div')
      contentWrapper.value.className = `epub-content-${paneIndex}`
      containerRef.value.appendChild(contentWrapper.value)

      const isPageMode = settingsStore.epubDisplayModes[paneIndex] === 'page'

      // For page mode, create an inner column wrapper
      let sectionContainer
      if (isPageMode) {
        columnWrapper.value = document.createElement('div')
        columnWrapper.value.className = 'epub-column-wrapper'
        contentWrapper.value.appendChild(columnWrapper.value)
        sectionContainer = columnWrapper.value
      } else {
        contentWrapper.value.addEventListener('scroll', handleScrollEvent)
        sectionContainer = contentWrapper.value
      }

      // Create placeholders for all sections
      linearSections.forEach((_, index) => {
        const placeholder = createPlaceholder(index)
        sectionContainer.appendChild(placeholder)
      })

      // Setup lazy loading observer
      setupIntersectionObserver()

      // Observe all placeholders
      const placeholders = contentWrapper.value.querySelectorAll('.epub-section-placeholder')
      placeholders.forEach(p => intersectionObserver?.observe(p))

      // Load sections
      if (isPageMode) {
        // Page mode: load all sections for accurate page calculation
        for (let i = 0; i < linearSections.length; i++) {
          const placeholder = sectionContainer.querySelector(
            `.epub-section-placeholder[data-section-index="${i}"]`
          )
          if (placeholder) {
            await loadSectionContent(linearSections[i], i, placeholder)
          }
        }
      } else {
        // Scroll mode: load initial sections, lazy load the rest
        for (let i = 0; i < Math.min(INITIAL_SECTIONS, linearSections.length); i++) {
          const placeholder = contentWrapper.value.querySelector(
            `.epub-section-placeholder[data-section-index="${i}"]`
          )
          if (placeholder) {
            await loadSectionContent(linearSections[i], i, placeholder)
          }
        }
      }

      // Cleanup temp view
      try { tempView.close?.() } catch (e) { /* ignore */ }
      if (tempView.parentNode) tempView.parentNode.removeChild(tempView)

      readerStore.setBook(paneIndex, book.value, 'epub')
      readerStore.setFileName(paneIndex, file.name)
      readerStore.setFile(paneIndex, file)

      // Restore saved position
      const savedLocation = readerStore.currentLocations[paneIndex]
      if (savedLocation && typeof savedLocation === 'object') {
        restorePosition(savedLocation)
      }

      isReady.value = true

      // Page mode: calculate pages after content is loaded
      if (isPageMode) {
        setTimeout(() => {
          calculateTotalPages()
          // Setup display mode watcher
          setupDisplayModeWatcher()
        }, 100)
      } else {
        setupDisplayModeWatcher()
      }

    } catch (error) {
      console.error(`Error opening EPUB ${paneIndex}:`, error)
      readerStore.setError(paneIndex, `Error loading EPUB: ${error.message}`)
      throw error
    } finally {
      readerStore.setLoading(paneIndex, false)
    }
  }

  function goTo(href) {
    if (!contentWrapper.value) return

    for (let i = 0; i < sections.value.length; i++) {
      const section = sections.value[i]
      if (section.id === href || section.href === href) {
        const sectionEl = contentWrapper.value.querySelector(`[data-section-index="${i}"]`)
        if (sectionEl) {
          // Ensure section is loaded before scrolling
          if (sectionEl.dataset.loaded === 'false') {
            loadSectionsInRange(i, i + BUFFER_SECTIONS).then(() => {
              const loadedEl = contentWrapper.value.querySelector(`[data-section-index="${i}"]`)
              loadedEl?.scrollIntoView({ behavior: 'smooth' })
            })
          } else {
            sectionEl.scrollIntoView({ behavior: 'smooth' })
          }
          savePosition()
          return
        }
      }
    }

    const element = contentWrapper.value.querySelector(`[id="${href}"], [name="${href}"]`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
      savePosition()
    }
  }

  function next() {
    if (!contentWrapper.value) return

    if (settingsStore.epubDisplayModes[paneIndex] === 'page') {
      nextPage()
    } else {
      const viewportHeight = contentWrapper.value.clientHeight
      contentWrapper.value.scrollBy({ top: viewportHeight * 0.9, behavior: 'smooth' })
      savePosition()
    }
  }

  function prev() {
    if (!contentWrapper.value) return

    if (settingsStore.epubDisplayModes[paneIndex] === 'page') {
      prevPage()
    } else {
      const viewportHeight = contentWrapper.value.clientHeight
      contentWrapper.value.scrollBy({ top: -viewportHeight * 0.9, behavior: 'smooth' })
      savePosition()
    }
  }

  function scrollBy(distance) {
    if (!contentWrapper.value) return

    if (settingsStore.epubDisplayModes[paneIndex] === 'page') {
      // In page mode, interpret scroll distance as page navigation
      if (distance > 0) {
        nextPage()
      } else if (distance < 0) {
        prevPage()
      }
    } else {
      contentWrapper.value.scrollBy({ top: distance, behavior: 'smooth' })
      savePosition()
    }
  }

  function savePosition() {
    if (!contentWrapper.value) return

    if (settingsStore.epubDisplayModes[paneIndex] === 'page') {
      // Page mode: save page ratio
      const pageRatio = totalPages.value > 1
        ? currentPage.value / (totalPages.value - 1)
        : 0
      readerStore.setCurrentLocation(paneIndex, {
        displayMode: 'page',
        currentPage: currentPage.value,
        totalPages: totalPages.value,
        scrollRatio: pageRatio
      })
    } else {
      // Scroll mode: save scroll ratio
      const el = contentWrapper.value
      const scrollRatio = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)

      const sectionEls = el.querySelectorAll('.epub-section')
      let currentSection = 0
      for (let i = 0; i < sectionEls.length; i++) {
        const rect = sectionEls[i].getBoundingClientRect()
        if (rect.top <= 100) currentSection = i
      }

      readerStore.setCurrentLocation(paneIndex, {
        displayMode: 'scroll',
        sectionIndex: currentSection,
        scrollRatio
      })
    }
  }

  function restorePosition(position) {
    if (!contentWrapper.value || !position) return

    setTimeout(() => {
      if (settingsStore.epubDisplayModes[paneIndex] === 'page') {
        // Page mode: restore from page or ratio
        if (position.currentPage !== undefined && position.displayMode === 'page') {
          goToPage(position.currentPage)
        } else if (position.scrollRatio !== undefined) {
          // Convert scroll ratio to page
          const targetPage = Math.round(position.scrollRatio * (totalPages.value - 1))
          goToPage(targetPage)
        }
      } else {
        // Scroll mode: restore scroll position
        if (position.scrollRatio !== undefined) {
          const el = contentWrapper.value
          const maxScroll = el.scrollHeight - el.clientHeight
          el.scrollTop = position.scrollRatio * maxScroll
        }
      }
    }, 100)
  }

  function resize() {
    if (settingsStore.epubDisplayModes[paneIndex] === 'page') {
      // Recalculate pages on resize
      calculateTotalPages()
    }
  }

  function handleScrollEvent() {
    if (!onScrollCallback) return
    if (scrollThrottleTimer) return
    scrollThrottleTimer = setTimeout(() => {
      scrollThrottleTimer = null
      onScrollCallback()
    }, 16)
  }

  function setOnScroll(callback) {
    onScrollCallback = callback
  }

  function getScrollInfo() {
    if (!contentWrapper.value) return null

    if (settingsStore.epubDisplayModes[paneIndex] === 'page') {
      // Page mode: return page-based scroll info
      const pageRatio = totalPages.value > 1
        ? currentPage.value / (totalPages.value - 1)
        : 0
      return {
        scrollTop: currentPage.value,
        scrollHeight: totalPages.value,
        clientHeight: 1,
        scrollRatio: pageRatio,
        displayMode: 'page',
        currentPage: currentPage.value,
        totalPages: totalPages.value,
      }
    } else {
      // Scroll mode: return scroll-based info
      const el = contentWrapper.value
      return {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollRatio: el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight),
        displayMode: 'scroll',
      }
    }
  }

  function setScrollByRatio(ratio) {
    if (!contentWrapper.value) return

    if (settingsStore.epubDisplayModes[paneIndex] === 'page') {
      // Page mode: convert ratio to page
      const targetPage = Math.round(ratio * (totalPages.value - 1))
      if (targetPage !== currentPage.value) {
        currentPage.value = targetPage
        updatePagePosition()
      }
    } else {
      // Scroll mode: set scroll position
      const el = contentWrapper.value
      const maxScroll = el.scrollHeight - el.clientHeight
      el.scrollTop = ratio * maxScroll
    }
  }

  // Watch for display mode changes and rebuild content
  function setupDisplayModeWatcher() {
    if (displayModeWatcher) {
      displayModeWatcher() // Stop previous watcher
    }

    displayModeWatcher = watch(
      () => settingsStore.epubDisplayModes[paneIndex],
      async (newMode, oldMode) => {
        if (!isReady.value || !book.value || newMode === oldMode) return

        // Save current position ratio before switching
        const scrollInfo = getScrollInfo()
        const positionRatio = scrollInfo?.scrollRatio || 0

        // Get the file to reopen
        const currentBook = book.value

        // Cleanup and rebuild
        const savedFile = readerStore.files[paneIndex]
        if (savedFile) {
          // Store position for restore
          readerStore.setCurrentLocation(paneIndex, { scrollRatio: positionRatio })

          // Reopen the file with new display mode
          await openFile(savedFile)
        }
      }
    )
  }

  function cleanup() {
    if (scrollThrottleTimer) {
      clearTimeout(scrollThrottleTimer)
      scrollThrottleTimer = null
    }

    if (intersectionObserver) {
      intersectionObserver.disconnect()
      intersectionObserver = null
    }

    if (displayModeWatcher) {
      displayModeWatcher()
      displayModeWatcher = null
    }

    blobUrls.value.forEach(url => URL.revokeObjectURL(url))
    blobUrls.value = []
    loadedSections.value.clear()

    if (styleElement.value?.parentNode) {
      styleElement.value.parentNode.removeChild(styleElement.value)
      styleElement.value = null
    }

    if (containerRef.value) {
      containerRef.value.innerHTML = ''
      containerRef.value.style.cssText = ''
    }

    contentWrapper.value = null
    columnWrapper.value = null
    book.value = null
    sections.value = []
    currentPage.value = 0
    totalPages.value = 1
    isReady.value = false
  }

  onUnmounted(() => cleanup())

  return {
    containerRef,
    book,
    isReady,
    currentPage,
    totalPages,
    openFile,
    goTo,
    goToPage,
    next,
    prev,
    scrollBy,
    resize,
    applyTheme,
    applySettings,
    getScrollInfo,
    setScrollByRatio,
    setOnScroll,
    cleanup,
  }
}
