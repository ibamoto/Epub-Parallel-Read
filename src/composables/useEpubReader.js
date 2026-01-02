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
  let wheelHandler = null

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
      // Note: column-width will be set dynamically via JavaScript
      styles += `
        .epub-content-${paneIndex} {
          overflow: hidden;
          padding: 0;
          position: relative;
        }

        .epub-content-${paneIndex} .epub-column-wrapper {
          height: calc(100% - ${settings.marginTop + settings.marginBottom}px);
          margin: ${settings.marginTop}px 0 ${settings.marginBottom}px 0;
          column-gap: 0;
          column-fill: auto;
          box-sizing: border-box;
          transition: transform 0.3s ease;
        }

        .epub-content-${paneIndex} .epub-section {
          padding-left: ${settings.marginLeft}px;
          padding-right: ${settings.marginRight}px;
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
          padding-left: ${settings.marginLeft}px;
          padding-right: ${settings.marginRight}px;
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

      /* Scrollbar styling for epub content */
      .epub-content-${paneIndex}::-webkit-scrollbar {
        width: 8px;
      }
      .epub-content-${paneIndex}::-webkit-scrollbar-track {
        background: ${colors.background};
      }
      .epub-content-${paneIndex}::-webkit-scrollbar-thumb {
        background: ${colors.text}40;
        border-radius: 4px;
      }
      .epub-content-${paneIndex}::-webkit-scrollbar-thumb:hover {
        background: ${colors.text}60;
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

    // Set column-width dynamically based on container width
    wrapper.style.columnWidth = `${containerWidth}px`

    // Wait for browser to recalculate layout
    requestAnimationFrame(() => {
      // Total scrollable width divided by container width = total pages
      const scrollWidth = wrapper.scrollWidth
      const pages = Math.max(1, Math.ceil(scrollWidth / containerWidth))
      totalPages.value = pages

      // Ensure current page is within bounds
      if (currentPage.value >= pages) {
        currentPage.value = pages - 1
        updatePagePosition()
      }
    })
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

      // Setup link handlers for internal navigation
      setupLinkHandlers(sectionDiv)

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

      // Setup wheel handler for page/scroll navigation
      setupWheelHandler()

      // Get saved position before setting isReady
      const savedLocation = readerStore.currentLocations[paneIndex]

      isReady.value = true

      // Page mode: set initial column width and calculate pages after content is loaded
      if (isPageMode) {
        // Set initial column width immediately
        const containerWidth = contentWrapper.value.clientWidth
        if (containerWidth > 0 && columnWrapper.value) {
          columnWrapper.value.style.columnWidth = `${containerWidth}px`
        }

        // Wait for layout to stabilize, calculate pages, then restore position
        setTimeout(async () => {
          calculateTotalPages()

          // Wait for page calculation to complete
          await new Promise(resolve => requestAnimationFrame(() => {
            requestAnimationFrame(resolve)
          }))

          // Restore position AFTER pages are calculated
          if (savedLocation && typeof savedLocation === 'object') {
            await restorePosition(savedLocation)
          }
          // Setup display mode watcher
          setupDisplayModeWatcher()
        }, 150)
      } else {
        // Scroll mode: restore position after sections load
        if (savedLocation && typeof savedLocation === 'object') {
          // Use async restore which handles section loading
          restorePosition(savedLocation).then(() => {
            setupDisplayModeWatcher()
          })
        } else {
          setupDisplayModeWatcher()
        }
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

    const isPageMode = settingsStore.epubDisplayModes[paneIndex] === 'page'
    const container = isPageMode ? columnWrapper.value : contentWrapper.value

    if (!container) return

    // Parse href - may contain fragment identifier (#)
    const hashIndex = href.indexOf('#')
    const path = hashIndex >= 0 ? href.substring(0, hashIndex) : href
    const fragment = hashIndex >= 0 ? href.substring(hashIndex + 1) : null

    // Normalize path for comparison (remove leading ./ or /)
    const normalizePath = (p) => {
      if (!p) return ''
      return p.replace(/^\.?\//, '').replace(/\/$/, '').toLowerCase()
    }

    const normalizedPath = normalizePath(path)
    const normalizedHref = normalizePath(href)

    // Get linear sections (same order as displayed)
    const linearSections = sections.value.filter(s => s.linear !== 'no')

    // Helper function to scroll to element in scroll mode
    const scrollToElement = (element) => {
      if (!contentWrapper.value) return

      // Get element's position relative to the scroll container
      const containerRect = contentWrapper.value.getBoundingClientRect()
      const elementRect = element.getBoundingClientRect()

      // Calculate the offset from container top (accounting for current scroll)
      const currentScroll = contentWrapper.value.scrollTop
      const elementTop = elementRect.top - containerRect.top + currentScroll

      // Scroll to position with a small offset from top
      contentWrapper.value.scrollTo({
        top: Math.max(0, elementTop - 20),
        behavior: 'smooth'
      })
    }

    // Find matching section
    for (let i = 0; i < linearSections.length; i++) {
      const section = linearSections[i]
      const sectionHref = normalizePath(section.href || '')
      const sectionId = (section.id || '').toLowerCase()

      // Check if href matches (with various path formats)
      const hrefMatches =
        sectionHref === normalizedPath ||
        sectionHref === normalizedHref ||
        sectionHref.endsWith('/' + normalizedPath) ||
        normalizedPath.endsWith('/' + sectionHref) ||
        sectionHref.endsWith(normalizedPath) ||
        normalizedPath.endsWith(sectionHref) ||
        (normalizedPath && sectionHref.includes(normalizedPath)) ||
        (normalizedPath && normalizedPath.includes(sectionHref) && sectionHref.length > 0) ||
        sectionId === normalizedHref ||
        sectionId === normalizedPath

      if (hrefMatches) {
        const sectionEl = container.querySelector(`[data-section-index="${i}"]`)
        if (sectionEl) {
          // Ensure section is loaded first
          const isLoaded = sectionEl.dataset.loaded === 'true'

          const navigateToSection = () => {
            const loadedEl = container.querySelector(`[data-section-index="${i}"]`)
            if (!loadedEl) return

            // If there's a fragment, try to find the element within the section
            let targetElement = loadedEl
            if (fragment) {
              // Try various selectors for fragment
              try {
                const fragmentEl =
                  loadedEl.querySelector(`#${CSS.escape(fragment)}`) ||
                  loadedEl.querySelector(`[name="${fragment}"]`) ||
                  loadedEl.querySelector(`[id="${fragment}"]`)
                if (fragmentEl) {
                  targetElement = fragmentEl
                }
              } catch (e) {
                // CSS.escape might fail with invalid selectors
              }
            }

            if (isPageMode) {
              // Page mode: calculate which page contains this element
              navigateToElement(targetElement)
            } else {
              // Scroll mode: use custom scroll for reliability
              scrollToElement(targetElement)
            }
            savePosition()
          }

          if (!isLoaded) {
            loadSectionsInRange(i, i + BUFFER_SECTIONS).then(() => {
              // Small delay to ensure DOM is updated
              setTimeout(navigateToSection, 50)
            })
          } else {
            navigateToSection()
          }
          return
        }
      }
    }

    // Fallback: try to find element by ID/name directly in the container
    const searchId = fragment || normalizedPath || href
    if (searchId) {
      // Search across all loaded sections
      try {
        const element =
          container.querySelector(`#${CSS.escape(searchId)}`) ||
          container.querySelector(`[name="${searchId}"]`) ||
          container.querySelector(`[id="${searchId}"]`)
        if (element) {
          if (isPageMode) {
            navigateToElement(element)
          } else {
            scrollToElement(element)
          }
          savePosition()
        }
      } catch (e) {
        // CSS.escape might fail with invalid selectors
      }
    }
  }

  // Navigate to a specific element in page mode
  function navigateToElement(element) {
    if (!columnWrapper.value || !contentWrapper.value) return

    const containerWidth = contentWrapper.value.clientWidth
    if (containerWidth === 0) return

    // Get the element's position relative to the column wrapper
    const elementRect = element.getBoundingClientRect()
    const wrapperRect = columnWrapper.value.getBoundingClientRect()

    // Calculate the current transform offset
    const currentOffset = currentPage.value * containerWidth

    // Calculate element's actual position in the document
    const elementLeft = elementRect.left - wrapperRect.left + currentOffset

    // Calculate which page the element is on
    const targetPage = Math.floor(elementLeft / containerWidth)

    goToPage(targetPage)
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
      // Scroll mode: calculate section-based ratio for accurate mode switching
      const el = contentWrapper.value
      const sectionEls = el.querySelectorAll('.epub-section')
      const linearSections = sections.value.filter(s => s.linear !== 'no')
      const totalSections = linearSections.length

      let currentSectionIndex = 0
      let sectionRatio = 0

      // Find current section based on scroll position
      for (let i = 0; i < sectionEls.length; i++) {
        const section = sectionEls[i]
        const rect = section.getBoundingClientRect()
        const containerRect = el.getBoundingClientRect()

        if (rect.top <= containerRect.top + 50) {
          currentSectionIndex = parseInt(section.dataset.sectionIndex, 10) || i

          // Calculate ratio within this section
          if (rect.height > 0) {
            const visibleTop = containerRect.top - rect.top
            sectionRatio = Math.min(1, Math.max(0, visibleTop / rect.height))
          }
        }
      }

      // Calculate overall scroll ratio based on sections
      const overallRatio = totalSections > 0
        ? (currentSectionIndex + sectionRatio) / totalSections
        : 0

      readerStore.setCurrentLocation(paneIndex, {
        displayMode: 'scroll',
        sectionIndex: currentSectionIndex,
        sectionRatio: sectionRatio,
        scrollRatio: overallRatio
      })
    }
  }

  async function restorePosition(position) {
    if (!contentWrapper.value || !position) return

    const isPageMode = settingsStore.epubDisplayModes[paneIndex] === 'page'

    if (isPageMode) {
      // Page mode: wait for pages to be calculated, then restore
      await new Promise(resolve => setTimeout(resolve, 100))

      if (position.currentPage !== undefined && position.displayMode === 'page' && !position.switchingMode) {
        // Same mode, use page directly
        goToPage(position.currentPage)
      } else if (position.scrollRatio !== undefined) {
        // Convert scroll ratio to page (works for mode switch)
        const targetPage = Math.round(position.scrollRatio * (totalPages.value - 1))
        goToPage(targetPage)
      }
    } else {
      // Scroll mode: use section-based position for accurate restoration
      const linearSections = sections.value.filter(s => s.linear !== 'no')
      const totalSections = linearSections.length

      if (totalSections === 0) return

      // Determine target section
      let targetSectionIndex = 0
      let sectionRatio = 0

      if (position.sectionIndex !== undefined && position.displayMode === 'scroll' && !position.switchingMode) {
        // Same mode - use section info directly
        targetSectionIndex = position.sectionIndex
        sectionRatio = position.sectionRatio || 0
      } else if (position.scrollRatio !== undefined && position.scrollRatio > 0) {
        // Mode switch or generic ratio - calculate from ratio
        const scaledPosition = position.scrollRatio * totalSections
        targetSectionIndex = Math.min(Math.floor(scaledPosition), totalSections - 1)
        sectionRatio = scaledPosition - targetSectionIndex
      }

      // Load sections up to and beyond target
      await loadSectionsInRange(0, Math.min(targetSectionIndex + BUFFER_SECTIONS, totalSections - 1))

      // Wait for DOM to update
      await new Promise(resolve => setTimeout(resolve, 100))

      const container = contentWrapper.value
      if (!container) return

      // Find the target section element
      const targetSectionEl = container.querySelector(`[data-section-index="${targetSectionIndex}"]`)
      if (targetSectionEl) {
        // Calculate scroll position within section
        const sectionOffset = targetSectionEl.offsetHeight * sectionRatio

        container.scrollTo({
          top: targetSectionEl.offsetTop + sectionOffset,
          behavior: 'auto' // Instant scroll for restore
        })
      }
    }
  }

  function resize() {
    if (settingsStore.epubDisplayModes[paneIndex] === 'page') {
      // Recalculate pages on resize
      calculateTotalPages()
    }
  }

  function handleScrollEvent() {
    if (scrollThrottleTimer) return
    scrollThrottleTimer = setTimeout(() => {
      scrollThrottleTimer = null
      // Save position on scroll
      savePosition()
      // Call scroll callback if set
      if (onScrollCallback) {
        onScrollCallback()
      }
    }, 100) // Increased throttle time for position saving
  }

  function setOnScroll(callback) {
    onScrollCallback = callback
  }

  // Setup wheel event handler for EPUB navigation
  function setupWheelHandler() {
    if (!contentWrapper.value) return

    // Remove existing handler if any
    if (wheelHandler) {
      contentWrapper.value.removeEventListener('wheel', wheelHandler)
    }

    wheelHandler = (e) => {
      const isPageMode = settingsStore.epubDisplayModes[paneIndex] === 'page'

      if (isPageMode) {
        // Page mode: prevent default and navigate pages
        e.preventDefault()

        // Debounce to prevent too rapid page changes
        if (wheelHandler.lastTime && Date.now() - wheelHandler.lastTime < 250) {
          return
        }
        wheelHandler.lastTime = Date.now()

        if (e.deltaY > 0) {
          nextPage()
        } else if (e.deltaY < 0) {
          prevPage()
        }
      } else {
        // Scroll mode: use scroll amount setting if useWheelAmount is enabled
        if (settingsStore.useWheelAmount) {
          e.preventDefault()

          // Debounce
          if (wheelHandler.lastTime && Date.now() - wheelHandler.lastTime < 50) {
            return
          }
          wheelHandler.lastTime = Date.now()

          const scrollAmount = settingsStore.scrollAmounts[paneIndex] || 100
          const direction = e.deltaY > 0 ? 1 : -1
          contentWrapper.value.scrollBy({
            top: direction * scrollAmount,
            behavior: 'smooth'
          })
          savePosition()
        }
        // If useWheelAmount is false, let native scroll handle it
      }
    }

    contentWrapper.value.addEventListener('wheel', wheelHandler, { passive: false })
  }

  // Handle internal link clicks
  function handleLinkClick(e) {
    const link = e.target.closest('a')
    if (!link) return

    const href = link.getAttribute('href')
    if (!href) return

    // Skip external links
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
      return
    }

    // Prevent default navigation
    e.preventDefault()
    e.stopPropagation()

    // Navigate using goTo
    goTo(href)
  }

  // Setup link handlers for a section element
  function setupLinkHandlers(sectionEl) {
    if (!sectionEl) return

    // Add click listener to section for link handling
    sectionEl.addEventListener('click', handleLinkClick)
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
      // Scroll mode: calculate section-based ratio
      const el = contentWrapper.value
      const sectionEls = el.querySelectorAll('.epub-section')
      const linearSections = sections.value.filter(s => s.linear !== 'no')
      const totalSections = linearSections.length

      let currentSectionIndex = 0
      let sectionRatio = 0

      for (let i = 0; i < sectionEls.length; i++) {
        const section = sectionEls[i]
        const rect = section.getBoundingClientRect()
        const containerRect = el.getBoundingClientRect()

        if (rect.top <= containerRect.top + 50) {
          currentSectionIndex = parseInt(section.dataset.sectionIndex, 10) || i
          if (rect.height > 0) {
            const visibleTop = containerRect.top - rect.top
            sectionRatio = Math.min(1, Math.max(0, visibleTop / rect.height))
          }
        }
      }

      const overallRatio = totalSections > 0
        ? (currentSectionIndex + sectionRatio) / totalSections
        : 0

      return {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollRatio: overallRatio,
        displayMode: 'scroll',
        sectionIndex: currentSectionIndex,
        totalSections: totalSections,
      }
    }
  }

  async function setScrollByRatio(ratio) {
    if (!contentWrapper.value) return

    if (settingsStore.epubDisplayModes[paneIndex] === 'page') {
      // Page mode: convert ratio to page
      const targetPage = Math.round(ratio * (totalPages.value - 1))
      if (targetPage !== currentPage.value) {
        currentPage.value = targetPage
        updatePagePosition()
        savePosition()
      }
    } else {
      // Scroll mode: navigate to section based on ratio
      const linearSections = sections.value.filter(s => s.linear !== 'no')
      const totalSections = linearSections.length

      if (totalSections === 0) return

      // Calculate target section based on ratio
      const targetSectionIndex = Math.min(
        Math.floor(ratio * totalSections),
        totalSections - 1
      )

      // Load all sections up to and including the target
      await loadSectionsInRange(0, targetSectionIndex + BUFFER_SECTIONS)

      // Wait for DOM to update
      await new Promise(resolve => setTimeout(resolve, 100))

      const container = contentWrapper.value
      if (!container) return

      // Find the target section element
      const targetSectionEl = container.querySelector(`[data-section-index="${targetSectionIndex}"]`)
      if (targetSectionEl) {
        // Calculate position within the section based on remaining ratio
        const sectionRatio = (ratio * totalSections) - targetSectionIndex
        const sectionOffset = targetSectionEl.offsetHeight * sectionRatio

        // Scroll to section position
        container.scrollTo({
          top: targetSectionEl.offsetTop + sectionOffset,
          behavior: 'smooth'
        })

        savePosition()
      }
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

        // Cleanup and rebuild
        const savedFile = readerStore.files[paneIndex]
        if (savedFile) {
          // Store position ratio for restore with mode switch flag
          readerStore.setCurrentLocation(paneIndex, {
            scrollRatio: positionRatio,
            switchingMode: true
          })

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

    // Remove wheel handler
    if (wheelHandler && contentWrapper.value) {
      contentWrapper.value.removeEventListener('wheel', wheelHandler)
      wheelHandler = null
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
