import { ref, shallowRef, onUnmounted, watch } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useReaderStore } from '../stores/reader'
import { useSettingsStore } from '../stores/settings'

// Set worker path using Vite's ?url suffix for reliable resolution
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export function usePdfReader(paneIndex) {
  const readerStore = useReaderStore()
  const settingsStore = useSettingsStore()

  // Watch for scroll mode changes
  watch(
    () => settingsStore.paneSettings[paneIndex]?.epubScrollMode,
    (newMode) => {
      if (isReady.value && containerRef.value) {
        updatePageVisibility()
      }
    }
  )

  const containerRef = ref(null)
  // Use shallowRef to avoid Vue's Proxy wrapping pdfjs objects (causes private field access errors)
  const pdf = shallowRef(null)
  const currentPage = ref(1)
  const totalPages = ref(0)
  const scale = ref(1.5)
  const isReady = ref(false)
  const renderedPages = ref(new Map())
  const renderingPages = new Set() // Track pages currently being rendered

  // For lazy loading
  let intersectionObserver = null
  let pageHeights = new Map() // Cache page heights for placeholders
  const BUFFER_PAGES = 2 // Render current page ± this many pages

  // Create canvas for a page
  function createPageCanvas(pageNum) {
    const canvas = document.createElement('canvas')
    canvas.className = 'pdf-page'
    canvas.dataset.page = pageNum
    return canvas
  }

  // Render a single page
  async function renderPage(pageNum, canvas) {
    if (!pdf.value) return

    // Skip if already rendering this page
    if (renderingPages.has(pageNum)) {
      console.log(`[PDF] Page ${pageNum} is already being rendered, skipping`)
      return
    }

    // Mark as rendering
    renderingPages.add(pageNum)

    try {
      console.log(`[PDF] Rendering page ${pageNum}...`)
      const page = await pdf.value.getPage(pageNum)
      const viewport = page.getViewport({ scale: scale.value })
      console.log(`[PDF] Page ${pageNum} viewport:`, viewport.width, 'x', viewport.height)

      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = '100%'
      canvas.style.height = 'auto'
      canvas.style.display = 'block'
      canvas.style.marginBottom = '10px'

      const context = canvas.getContext('2d')

      // Apply theme background
      const colors = settingsStore.getThemeColors()
      context.fillStyle = colors.background
      context.fillRect(0, 0, canvas.width, canvas.height)

      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise

      console.log(`[PDF] Page ${pageNum} rendered successfully`)
      renderedPages.value.set(pageNum, true)
    } catch (error) {
      console.error(`[PDF] Error rendering page ${pageNum}:`, error)
    } finally {
      // Remove from rendering set
      renderingPages.delete(pageNum)
    }
  }

  // Get page dimensions (cached)
  async function getPageDimensions(pageNum) {
    if (pageHeights.has(pageNum)) {
      return pageHeights.get(pageNum)
    }
    const page = await pdf.value.getPage(pageNum)
    const viewport = page.getViewport({ scale: scale.value })
    const dimensions = { width: viewport.width, height: viewport.height }
    pageHeights.set(pageNum, dimensions)
    return dimensions
  }

  // Create placeholder canvases for all pages (without rendering)
  async function createPagePlaceholders() {
    console.log('[PDF] createPagePlaceholders called')
    if (!pdf.value || !containerRef.value) {
      console.log('[PDF] createPagePlaceholders aborted - missing pdf or container')
      return
    }

    const container = containerRef.value
    container.innerHTML = ''
    renderedPages.value.clear()

    const fragment = document.createDocumentFragment()
    console.log('[PDF] Creating', totalPages.value, 'placeholder canvas elements')

    // Get first page dimensions to estimate others (faster than getting all)
    const firstPageDims = await getPageDimensions(1)

    for (let i = 1; i <= totalPages.value; i++) {
      const canvas = createPageCanvas(i)
      // Set placeholder size (use first page dimensions as estimate)
      canvas.width = firstPageDims.width
      canvas.height = firstPageDims.height
      canvas.style.width = '100%'
      canvas.style.height = 'auto'
      canvas.style.display = 'block'
      canvas.style.marginBottom = '10px'
      // Add loading indicator style
      canvas.style.backgroundColor = '#f0f0f0'
      fragment.appendChild(canvas)
    }

    container.appendChild(fragment)
    console.log('[PDF] Placeholders created')
  }

  // Setup IntersectionObserver for lazy loading
  function setupIntersectionObserver() {
    if (intersectionObserver) {
      intersectionObserver.disconnect()
    }

    if (!containerRef.value) return

    const options = {
      root: containerRef.value,
      rootMargin: '200px 0px', // Pre-load pages 200px before they become visible
      threshold: 0
    }

    intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const pageNum = parseInt(entry.target.dataset.page, 10)
          renderPageWithBuffer(pageNum)
        }
      }
    }, options)

    // Observe all canvas elements
    const canvases = containerRef.value.querySelectorAll('canvas')
    canvases.forEach(canvas => intersectionObserver.observe(canvas))
    console.log('[PDF] IntersectionObserver setup for', canvases.length, 'pages')
  }

  // Render a page and its buffer pages
  async function renderPageWithBuffer(centerPage) {
    const startPage = Math.max(1, centerPage - BUFFER_PAGES)
    const endPage = Math.min(totalPages.value, centerPage + BUFFER_PAGES)

    const container = containerRef.value
    if (!container) return

    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      // Skip already rendered pages
      if (renderedPages.value.get(pageNum)) continue

      const canvas = container.querySelector(`canvas[data-page="${pageNum}"]`)
      if (canvas) {
        await renderPage(pageNum, canvas)
      }
    }
  }

  // Render initial visible pages (first page + buffer)
  async function renderInitialPages() {
    console.log('[PDF] Rendering initial pages...')
    await renderPageWithBuffer(1)
    console.log('[PDF] Initial pages rendered')
  }

  // Generate TOC from PDF outline
  async function generateToc() {
    if (!pdf.value) return []

    try {
      const outline = await pdf.value.getOutline()
      if (!outline) return []

      const processTocItem = async (item, level = 0) => {
        let pageNum = 1
        if (item.dest) {
          try {
            const dest = typeof item.dest === 'string'
              ? await pdf.value.getDestination(item.dest)
              : item.dest
            if (dest) {
              const pageIndex = await pdf.value.getPageIndex(dest[0])
              pageNum = pageIndex + 1
            }
          } catch (e) {
            console.warn('Error getting destination:', e)
          }
        }

        const result = [{
          label: item.title,
          href: pageNum,
          level: level,
        }]

        if (item.items && item.items.length > 0) {
          for (const child of item.items) {
            const childItems = await processTocItem(child, level + 1)
            result.push(...childItems)
          }
        }

        return result
      }

      const toc = []
      for (const item of outline) {
        const items = await processTocItem(item)
        toc.push(...items)
      }

      return toc
    } catch (error) {
      console.error('Error generating TOC:', error)
      return []
    }
  }

  // Open PDF file
  async function openFile(file) {
    console.log('[PDF] openFile called, file:', file.name)
    console.log('[PDF] containerRef:', containerRef.value)

    if (!containerRef.value) {
      throw new Error('Container not ready')
    }

    readerStore.setLoading(paneIndex, true)
    readerStore.clearError(paneIndex)

    try {
      // Cleanup previous PDF
      cleanup()

      // Read file as ArrayBuffer
      console.log('[PDF] Reading file as ArrayBuffer...')
      const arrayBuffer = await file.arrayBuffer()
      console.log('[PDF] ArrayBuffer size:', arrayBuffer.byteLength)

      // Load PDF
      console.log('[PDF] Loading PDF document...')
      console.log('[PDF] Worker source:', pdfjsLib.GlobalWorkerOptions.workerSrc)
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
      pdf.value = await loadingTask.promise
      console.log('[PDF] PDF loaded, pages:', pdf.value.numPages)

      totalPages.value = pdf.value.numPages
      currentPage.value = 1

      // Store references
      readerStore.setBook(paneIndex, pdf.value, 'pdf')
      readerStore.setTotalPages(paneIndex, totalPages.value)
      readerStore.setFileName(paneIndex, file.name)

      // Generate and set TOC
      const toc = await generateToc()
      readerStore.setToc(paneIndex, toc)

      // Create placeholders for all pages (fast)
      await createPagePlaceholders()

      // Setup lazy loading observer
      setupIntersectionObserver()

      // Render only initial visible pages (fast)
      await renderInitialPages()

      // Restore saved position
      const savedPage = readerStore.currentPages[paneIndex]
      if (savedPage && savedPage <= totalPages.value) {
        goToPage(savedPage)
      }

      // Setup wheel event handler for scroll mode
      setupWheelHandler()

      // Apply initial page visibility based on scroll mode
      updatePageVisibility()

      isReady.value = true

    } catch (error) {
      console.error(`Error opening PDF ${paneIndex}:`, error)
      readerStore.setError(paneIndex, `Error loading PDF: ${error.message}`)
      throw error
    } finally {
      readerStore.setLoading(paneIndex, false)
    }
  }

  // Update page visibility based on scroll mode
  function updatePageVisibility() {
    if (!containerRef.value) return

    const settings = settingsStore.paneSettings[paneIndex]
    const isPageMode = settings.epubScrollMode === 'page'
    const canvases = containerRef.value.querySelectorAll('canvas')
    const container = containerRef.value

    // Adjust container layout first
    if (isPageMode) {
      container.style.cssText = `
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
        min-height: 0;
        background: var(--bg-primary);
      `
    } else {
      container.style.cssText = `
        overflow-y: auto;
        display: block;
        flex: 1;
        min-height: 0;
        background: var(--bg-primary);
      `
    }

    canvases.forEach((canvas) => {
      const pageNum = parseInt(canvas.dataset.page, 10)
      if (isPageMode) {
        // Page mode: show only current page, centered and fit to container
        if (pageNum === currentPage.value) {
          canvas.style.cssText = `
            display: block;
            max-height: 100%;
            max-width: 100%;
            width: auto;
            height: auto;
            object-fit: contain;
          `
        } else {
          canvas.style.display = 'none'
        }
      } else {
        // Continuous mode: show all pages with margin
        canvas.style.cssText = `
          display: block;
          margin: 0 auto 10px auto;
          width: 100%;
          height: auto;
        `
      }
    })
  }

  // Go to specific page
  function goToPage(pageNum) {
    if (!containerRef.value || pageNum < 1 || pageNum > totalPages.value) return

    const canvas = containerRef.value.querySelector(`canvas[data-page="${pageNum}"]`)
    if (canvas) {
      // Ensure the target page and surrounding pages are rendered
      renderPageWithBuffer(pageNum)

      currentPage.value = pageNum
      readerStore.setCurrentPage(paneIndex, pageNum)

      const settings = settingsStore.paneSettings[paneIndex]
      if (settings.epubScrollMode === 'page') {
        // Page mode: show only this page
        updatePageVisibility()
      } else {
        // Continuous mode: scroll to page
        canvas.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }

  // Navigate to TOC item
  function goTo(href) {
    const pageNum = typeof href === 'number' ? href : parseInt(href, 10)
    if (!isNaN(pageNum)) {
      goToPage(pageNum)
    }
  }

  // Next page
  function next() {
    if (currentPage.value < totalPages.value) {
      goToPage(currentPage.value + 1)
    }
  }

  // Previous page
  function prev() {
    if (currentPage.value > 1) {
      goToPage(currentPage.value - 1)
    }
  }

  // Update current page based on scroll position
  function updateCurrentPage() {
    if (!containerRef.value) return

    const container = containerRef.value
    const canvases = container.querySelectorAll('canvas')
    const containerRect = container.getBoundingClientRect()
    const containerTop = container.scrollTop

    for (const canvas of canvases) {
      const canvasTop = canvas.offsetTop
      const canvasBottom = canvasTop + canvas.offsetHeight

      if (canvasTop <= containerTop + 100 && canvasBottom > containerTop) {
        const pageNum = parseInt(canvas.dataset.page, 10)
        if (pageNum !== currentPage.value) {
          currentPage.value = pageNum
          readerStore.setCurrentPage(paneIndex, pageNum)
        }
        break
      }
    }
  }

  // Set scale and re-render visible pages
  async function setScale(newScale) {
    scale.value = newScale
    // Clear cached page heights (they depend on scale)
    pageHeights.clear()
    // Clear rendered pages to force re-render
    renderedPages.value.clear()
    // Recreate placeholders with new scale
    await createPagePlaceholders()
    // Re-setup observer
    setupIntersectionObserver()
    // Re-render current visible pages
    await renderPageWithBuffer(currentPage.value)
  }

  // Wheel event handler reference for cleanup
  let wheelHandler = null

  // Setup wheel event handler for scroll mode
  function setupWheelHandler() {
    if (!containerRef.value) return

    // Remove existing handler if any
    if (wheelHandler) {
      containerRef.value.removeEventListener('wheel', wheelHandler)
    }

    wheelHandler = (e) => {
      const settings = settingsStore.paneSettings[paneIndex]

      if (settings.epubScrollMode === 'page') {
        // Page mode: scroll by page on wheel
        e.preventDefault()

        // Debounce to prevent too rapid page changes
        if (wheelHandler.lastTime && Date.now() - wheelHandler.lastTime < 300) {
          return
        }
        wheelHandler.lastTime = Date.now()

        if (e.deltaY > 0) {
          next()
        } else if (e.deltaY < 0) {
          prev()
        }
      } else {
        // Continuous mode: apply speed adjustment
        if (settings.epubScrollSpeed !== 1.0) {
          e.preventDefault()
          const scrollAmount = e.deltaY * settings.epubScrollSpeed
          containerRef.value.scrollTop += scrollAmount
        }
        // If speed is 1.0, let default scroll behavior happen
      }
    }

    containerRef.value.addEventListener('wheel', wheelHandler, { passive: false })
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
    // Remove IntersectionObserver
    if (intersectionObserver) {
      intersectionObserver.disconnect()
      intersectionObserver = null
    }

    // Remove wheel handler
    if (wheelHandler && containerRef.value) {
      containerRef.value.removeEventListener('wheel', wheelHandler)
      wheelHandler = null
    }

    if (pdf.value) {
      pdf.value.destroy()
      pdf.value = null
    }
    renderedPages.value.clear()
    renderingPages.clear()
    pageHeights.clear()
    totalPages.value = 0
    currentPage.value = 1
    isReady.value = false

    if (containerRef.value) {
      containerRef.value.innerHTML = ''
    }
  }

  // Cleanup on unmount
  onUnmounted(() => {
    cleanup()
  })

  return {
    containerRef,
    pdf,
    currentPage,
    totalPages,
    scale,
    isReady,
    openFile,
    goTo,
    goToPage,
    next,
    prev,
    setScale,
    updateCurrentPage,
    getScrollInfo,
    setScrollByRatio,
    cleanup,
  }
}
