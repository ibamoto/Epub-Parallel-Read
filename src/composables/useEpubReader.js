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
  let wheelHandler = null

  // Helper to find section index from href
  function findSectionIndex(href) {
    if (!href || !sections.value.length) return { index: -1, fragment: null }

    // Remove fragment
    const hashIndex = href.indexOf('#')
    const path = hashIndex >= 0 ? href.substring(0, hashIndex) : href
    const fragment = hashIndex >= 0 ? href.substring(hashIndex + 1) : null

    // Normalize and get filename
    const normalizePath = (p) => {
      if (!p) return ''
      return p.replace(/^\.?\.?\//, '').replace(/\/$/, '').toLowerCase()
    }
    const getFileName = (p) => {
      if (!p) return ''
      const parts = normalizePath(p).split('/')
      return parts[parts.length - 1]
    }

    const targetPath = normalizePath(path)
    const targetFile = getFileName(path)

    const linearSections = sections.value.filter(s => s.linear !== 'no')

    for (let i = 0; i < linearSections.length; i++) {
      const section = linearSections[i]
      // foliate-js stores href in section.id, not section.href
      const sectionHref = section.id || section.href || ''
      const sectionPath = normalizePath(sectionHref)
      const sectionFile = getFileName(sectionHref)

      // Try multiple matching strategies
      if (
        sectionPath === targetPath ||
        sectionFile === targetFile ||
        sectionPath.endsWith(targetPath) ||
        targetPath.endsWith(sectionPath) ||
        (targetPath && sectionPath.includes(targetPath)) ||
        (targetPath && targetPath.includes(sectionPath) && sectionPath.length > 0)
      ) {
        return { index: i, fragment }
      }
    }

    return { index: -1, fragment }
  }

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
    
    // Use custom text color if set, otherwise use theme color
    const textColor = settings.textColor || colors.text

    // Scroll mode: standard scrollable container
    let styles = `
      .epub-content-${paneIndex} {
        width: 100%;
        height: 100%;
        background: ${colors.background};
        color: ${textColor};
        font-family: ${fontFamily};
        font-size: ${settings.fontSize}px;
        font-weight: ${settings.fontWeight};
        line-height: ${settings.lineHeight};
        letter-spacing: ${settings.letterSpacing}em;
        text-align: ${settings.textAlign};
        box-sizing: border-box;
        overflow-y: auto;
        overflow-x: hidden;
        padding: ${settings.marginTop}px ${settings.marginRight}px ${settings.marginBottom}px ${settings.marginLeft}px;
      }

      .epub-content-${paneIndex} .epub-section {
        margin-bottom: 2em;
        padding-bottom: 1em;
        border-bottom: 1px solid ${textColor}20;
      }

      .epub-content-${paneIndex} .epub-section-placeholder {
        min-height: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${textColor}40;
        font-size: 0.9em;
      }
    `

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
        color: ${textColor};
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
        background: ${textColor}40;
        border-radius: 4px;
      }
      .epub-content-${paneIndex}::-webkit-scrollbar-thumb:hover {
        background: ${textColor}60;
      }
    `

    return styles
  }

  function updateStyles() {
    if (!styleElement.value) return
    styleElement.value.textContent = generateContentStyles()
  }

  function applyTheme() { updateStyles() }
  function applySettings() { updateStyles() }

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

      // Add scroll event listener
      contentWrapper.value.addEventListener('scroll', handleScrollEvent)

      // Create placeholders for all sections
      linearSections.forEach((_, index) => {
        const placeholder = createPlaceholder(index)
        contentWrapper.value.appendChild(placeholder)
      })

      // Setup lazy loading observer
      setupIntersectionObserver()

      // Observe all placeholders
      const placeholders = contentWrapper.value.querySelectorAll('.epub-section-placeholder')
      placeholders.forEach(p => intersectionObserver?.observe(p))

      // Load initial sections, lazy load the rest
      for (let i = 0; i < Math.min(INITIAL_SECTIONS, linearSections.length); i++) {
        const placeholder = contentWrapper.value.querySelector(
          `.epub-section-placeholder[data-section-index="${i}"]`
        )
        if (placeholder) {
          await loadSectionContent(linearSections[i], i, placeholder)
        }
      }

      // Cleanup temp view
      try { tempView.close?.() } catch (e) { /* ignore */ }
      if (tempView.parentNode) tempView.parentNode.removeChild(tempView)

      readerStore.setBook(paneIndex, book.value, 'epub')
      readerStore.setFileName(paneIndex, file.name)
      readerStore.setFile(paneIndex, file)

      // Setup wheel handler for scroll navigation
      setupWheelHandler()

      // Get saved position before setting isReady
      const savedLocation = readerStore.currentLocations[paneIndex]

      isReady.value = true

      // Restore position after sections load
      if (savedLocation && typeof savedLocation === 'object') {
        // Use async restore which handles section loading
        await restorePosition(savedLocation)
      }

    } catch (error) {
      console.error(`Error opening EPUB ${paneIndex}:`, error)
      readerStore.setError(paneIndex, `Error loading EPUB: ${error.message}`)
      throw error
    } finally {
      readerStore.setLoading(paneIndex, false)
    }
  }

  async function goTo(href) {
    if (!isReady.value || !contentWrapper.value) return

    const container = contentWrapper.value
    if (!container) return

    // Helper function to scroll to element
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

    // Use helper to find section
    const { index: sectionIndex, fragment } = findSectionIndex(href)

    if (sectionIndex >= 0) {
      const sectionEl = container.querySelector(`[data-section-index="${sectionIndex}"]`)
      if (sectionEl) {
        const isLoaded = sectionEl.dataset.loaded === 'true'

        const navigateToSection = async () => {
          const loadedEl = container.querySelector(`[data-section-index="${sectionIndex}"]`)
          if (!loadedEl) return

          // If there's a fragment, try to find the element within the section
          let targetElement = loadedEl
          if (fragment) {
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

          scrollToElement(targetElement)
          savePosition()
        }

        if (!isLoaded) {
          // Load ALL sections from 0 to target to ensure accurate scroll position
          // This is necessary because placeholder heights differ from actual content
          await loadSectionsInRange(0, sectionIndex + BUFFER_SECTIONS)
          // Wait for DOM to fully render
          await new Promise(resolve => setTimeout(resolve, 100))
          await navigateToSection()
        } else {
          // Section is loaded, but check if sections before it are loaded
          // If not, load them first for accurate positioning
          let needsPreload = false
          for (let i = 0; i < sectionIndex; i++) {
            const el = container.querySelector(`[data-section-index="${i}"]`)
            if (el && el.dataset.loaded !== 'true') {
              needsPreload = true
              break
            }
          }

          if (needsPreload) {
            await loadSectionsInRange(0, sectionIndex)
            await new Promise(resolve => setTimeout(resolve, 100))
          }
          await navigateToSection()
        }
        return
      }
    }

    // Fallback: try to find element by ID/name directly in all loaded sections
    const hashIndex = href.indexOf('#')
    const searchId = hashIndex >= 0 ? href.substring(hashIndex + 1) : href
    if (searchId) {
      try {
        const element =
          container.querySelector(`#${CSS.escape(searchId)}`) ||
          container.querySelector(`[name="${searchId}"]`) ||
          container.querySelector(`[id="${searchId}"]`)
        if (element) {
          scrollToElement(element)
          savePosition()
        }
      } catch (e) {
        // CSS.escape might fail with invalid selectors
      }
    }
  }

  function next() {
    if (!contentWrapper.value) return
    const viewportHeight = contentWrapper.value.clientHeight
    contentWrapper.value.scrollBy({ top: viewportHeight * 0.9, behavior: 'smooth' })
    savePosition()
  }

  function prev() {
    if (!contentWrapper.value) return
    const viewportHeight = contentWrapper.value.clientHeight
    contentWrapper.value.scrollBy({ top: -viewportHeight * 0.9, behavior: 'smooth' })
    savePosition()
  }

  // Scroll by distance (in pixels) or use settings-based calculation
  function scrollBy(distance, useSettings = false) {
    if (!contentWrapper.value) return
    let actualDistance = distance
    if (useSettings) {
      // Use settings-based scroll amount with sign from distance
      actualDistance = (distance > 0 ? 1 : -1) * calculateScrollDistance()
    }
    contentWrapper.value.scrollBy({ top: actualDistance, behavior: 'smooth' })
    savePosition()
  }

  function savePosition() {
    if (!contentWrapper.value) return

    // Calculate section-based ratio for accurate position tracking
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

  async function restorePosition(position) {
    if (!contentWrapper.value || !position) return

    // Use section-based position for accurate restoration
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
      // Generic ratio - calculate from ratio
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

  function resize() {
    // No-op for scroll mode
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

  /**
   * Calculate scroll distance based on EPUB settings (supports px and page units)
   */
  function calculateScrollDistance() {
    const settings = settingsStore.epubScrollSettings[paneIndex] || { amount: 100, unit: 'px' }
    let scrollAmount = settings.amount

    if (settings.unit === 'page') {
      // Convert page to pixels based on viewport height
      const viewportHeight = contentWrapper.value?.clientHeight || window.innerHeight
      scrollAmount = settings.amount * viewportHeight * 0.9 // 90% of viewport per page
    }
    // 'px' unit uses the amount directly

    return scrollAmount
  }

  /**
   * EPUBリーダーのホイールイベントハンドラーを設定
   *
   * 仕様: READER_SPECIFICATIONS.md を参照
   * - ソースペインのスクロールを実行（スクロール同期モードでも実行される）
   * - ターゲットペインの同期はApp.vueのhandleWheelSyncで処理される
   * - デバウンス: 50ms
   * - スクロール量: epubScrollSettings[paneIndex] (px または page単位)
   */
  function setupWheelHandler() {
    if (!contentWrapper.value) return

    // Remove existing handler if any
    if (wheelHandler) {
      contentWrapper.value.removeEventListener('wheel', wheelHandler)
    }

    wheelHandler = (e) => {
      // スクロール同期モードの時は、App.vueのhandleWheelSyncがターゲットペインを同期するので、preventDefault()を呼ばない
      // ただし、スクロール同期モードでない場合は、通常通りpreventDefault()を呼ぶ
      if (!settingsStore.syncMode) {
        e.preventDefault()
      }

      // Debounce: 50ms
      if (wheelHandler.lastTime && Date.now() - wheelHandler.lastTime < 50) {
        return
      }
      wheelHandler.lastTime = Date.now()

      // 常に設定されたスクロール量を使用 (px または page単位)
      // スクロール同期モードの時でも、ソースペインのスクロールは実行する
      const scrollAmount = calculateScrollDistance()
      const direction = e.deltaY > 0 ? 1 : -1
      contentWrapper.value.scrollBy({
        top: direction * scrollAmount,
        behavior: 'smooth'
      })
      savePosition()
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

    const linearSections = sections.value.filter(s => s.linear !== 'no')
    const totalSections = linearSections.length

    if (totalSections === 0) return null

    const container = contentWrapper.value
    if (!container) return null

    const sectionEls = container.querySelectorAll('.epub-section')
    if (sectionEls.length === 0) return null

    // Calculate cumulative heights for all sections
    const sectionHeights = []
    let totalContentHeight = 0
    for (let i = 0; i < sectionEls.length; i++) {
      const section = sectionEls[i]
      const height = section.offsetHeight || section.getBoundingClientRect().height
      sectionHeights.push(height)
      totalContentHeight += height
    }

    // Find section based on scroll position
    const el = contentWrapper.value
    const scrollTop = el.scrollTop
    const currentContentPosition = scrollTop

    let currentSectionIndex = 0
    let sectionRatio = 0

    // Find which section contains this scroll position
    let cumulativeHeight = 0
    for (let i = 0; i < sectionEls.length; i++) {
      const sectionHeight = sectionHeights[i]
      if (scrollTop <= cumulativeHeight + sectionHeight) {
        currentSectionIndex = parseInt(sectionEls[i].dataset.sectionIndex, 10) || i
        if (sectionHeight > 0) {
          sectionRatio = Math.min(1, Math.max(0, (scrollTop - cumulativeHeight) / sectionHeight))
        }
        break
      }
      cumulativeHeight += sectionHeight
    }

    // Calculate overall ratio based on content position
    const overallRatio = totalContentHeight > 0
      ? currentContentPosition / totalContentHeight
      : (totalSections > 0 ? (currentSectionIndex + sectionRatio) / totalSections : 0)

    return {
      scrollTop: contentWrapper.value.scrollTop,
      scrollHeight: contentWrapper.value.scrollHeight,
      clientHeight: contentWrapper.value.clientHeight,
      scrollRatio: overallRatio,
      displayMode: 'scroll',
      sectionIndex: currentSectionIndex,
      totalSections: totalSections,
    }
  }

  async function setScrollByRatio(ratio) {
    if (!contentWrapper.value) return

    const linearSections = sections.value.filter(s => s.linear !== 'no')
    const totalSections = linearSections.length

    if (totalSections === 0) return

    // Load all sections first to get accurate heights
    await loadSectionsInRange(0, totalSections - 1)
    await new Promise(resolve => setTimeout(resolve, 100))

    const container = contentWrapper.value
    if (!container) return

    const sectionEls = container.querySelectorAll('.epub-section')
    if (sectionEls.length === 0) return

    // Calculate cumulative heights for all sections
    const sectionHeights = []
    let totalContentHeight = 0
    for (let i = 0; i < sectionEls.length; i++) {
      const section = sectionEls[i]
      const height = section.offsetHeight || section.getBoundingClientRect().height
      sectionHeights.push(height)
      totalContentHeight += height
    }

    if (totalContentHeight === 0) return

    // Calculate target content position from ratio
    const targetContentPosition = ratio * totalContentHeight

    // Scroll to exact content position
    contentWrapper.value.scrollTo({
      top: targetContentPosition,
      behavior: 'smooth'
    })

    savePosition()
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
    book.value = null
    sections.value = []
    isReady.value = false
  }

  onUnmounted(() => cleanup())

  return {
    containerRef,
    book,
    isReady,
    openFile,
    goTo,
    next,
    prev,
    scrollBy,
    calculateScrollDistance,
    resize,
    applyTheme,
    applySettings,
    getScrollInfo,
    setScrollByRatio,
    setOnScroll,
    cleanup,
  }
}
