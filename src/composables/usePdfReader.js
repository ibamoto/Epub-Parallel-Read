import { ref, shallowRef, onUnmounted } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useReaderStore } from '../stores/reader'
import { useSettingsStore } from '../stores/settings'

// Set worker path using Vite's ?url suffix for reliable resolution
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export function usePdfReader(paneIndex) {
  const readerStore = useReaderStore()
  const settingsStore = useSettingsStore()

  const containerRef = ref(null)
  // Use shallowRef to avoid Vue's Proxy wrapping pdfjs objects (causes private field access errors)
  const pdf = shallowRef(null)
  const currentPage = ref(1)
  const totalPages = ref(0)
  const scale = ref(1.5)
  const isReady = ref(false)

  // Single canvas for current page display
  let pageCanvas = null

  // Render the current page to canvas
  async function renderCurrentPage() {
    if (!pdf.value || !pageCanvas) return

    try {
      const page = await pdf.value.getPage(currentPage.value)
      const viewport = page.getViewport({ scale: scale.value })

      pageCanvas.width = viewport.width
      pageCanvas.height = viewport.height

      const context = pageCanvas.getContext('2d')

      // Apply theme background
      const colors = settingsStore.getThemeColors()
      context.fillStyle = colors.background
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height)

      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise
    } catch (error) {
      console.error(`[PDF] Error rendering page ${currentPage.value}:`, error)
    }
  }

  // Setup container for single page display
  function setupContainer() {
    if (!containerRef.value) return

    const container = containerRef.value
    container.innerHTML = ''

    // Set container layout for single page display
    container.style.cssText = `
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1;
      min-height: 0;
      padding: 16px;
      background: var(--bg-secondary, #f0f0f0);
    `

    // Create single canvas for page display
    pageCanvas = document.createElement('canvas')
    pageCanvas.className = 'pdf-page'
    pageCanvas.style.cssText = `
      display: block;
      max-height: 100%;
      max-width: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      border-radius: 2px;
    `
    container.appendChild(pageCanvas)
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
    if (!containerRef.value) {
      throw new Error('Container not ready')
    }

    readerStore.setLoading(paneIndex, true)
    readerStore.clearError(paneIndex)

    try {
      // Cleanup previous PDF
      cleanup()

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer()

      // Load PDF
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
      pdf.value = await loadingTask.promise

      totalPages.value = pdf.value.numPages
      currentPage.value = 1

      // Store references
      readerStore.setBook(paneIndex, pdf.value, 'pdf')
      readerStore.setTotalPages(paneIndex, totalPages.value)
      readerStore.setFileName(paneIndex, file.name)

      // Generate and set TOC
      const toc = await generateToc()
      readerStore.setToc(paneIndex, toc)

      // Setup container with single canvas
      setupContainer()

      // Restore saved position
      const savedPage = readerStore.currentPages[paneIndex]
      if (savedPage && savedPage <= totalPages.value) {
        currentPage.value = savedPage
      }

      // Render the current page
      await renderCurrentPage()
      readerStore.setCurrentPage(paneIndex, currentPage.value)

      // Setup wheel event handler
      setupWheelHandler()

      isReady.value = true

    } catch (error) {
      console.error(`Error opening PDF ${paneIndex}:`, error)
      readerStore.setError(paneIndex, `Error loading PDF: ${error.message}`)
      throw error
    } finally {
      readerStore.setLoading(paneIndex, false)
    }
  }

  // Go to specific page
  async function goToPage(pageNum) {
    if (!pdf.value || pageNum < 1 || pageNum > totalPages.value) return
    if (pageNum === currentPage.value) return

    currentPage.value = pageNum
    readerStore.setCurrentPage(paneIndex, pageNum)
    await renderCurrentPage()
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

  // Set scale and re-render
  async function setScale(newScale) {
    scale.value = newScale
    await renderCurrentPage()
  }

  // Wheel event handler reference for cleanup
  let wheelHandler = null

  // Setup wheel event handler for page navigation
  function setupWheelHandler() {
    if (!containerRef.value) return

    // Remove existing handler if any
    if (wheelHandler) {
      containerRef.value.removeEventListener('wheel', wheelHandler)
    }

    wheelHandler = (e) => {
      e.preventDefault()

      // Debounce to prevent too rapid page changes
      if (wheelHandler.lastTime && Date.now() - wheelHandler.lastTime < 250) {
        return
      }
      wheelHandler.lastTime = Date.now()

      // Get page amount from settings if useWheelAmount is enabled
      const pageAmount = settingsStore.useWheelAmount
        ? settingsStore.pdfPageAmounts[paneIndex]
        : 1

      if (e.deltaY > 0) {
        goToPage(currentPage.value + pageAmount)
      } else if (e.deltaY < 0) {
        goToPage(currentPage.value - pageAmount)
      }
    }

    containerRef.value.addEventListener('wheel', wheelHandler, { passive: false })
  }

  // Get scroll info for sync - for PDF, calculate ratio from page number
  function getScrollInfo() {
    if (!totalPages.value) return null
    // Convert current page to scroll ratio
    const scrollRatio = (currentPage.value - 1) / Math.max(1, totalPages.value - 1)
    return {
      scrollTop: 0,
      scrollHeight: totalPages.value,
      clientHeight: 1,
      scrollRatio: scrollRatio,
    }
  }

  // Set scroll position by ratio - for PDF, convert to page number
  function setScrollByRatio(ratio) {
    if (!totalPages.value) return
    // Convert scroll ratio to page number
    const targetPage = Math.max(1, Math.min(totalPages.value, Math.round(ratio * (totalPages.value - 1)) + 1))
    if (targetPage !== currentPage.value) {
      goToPage(targetPage)
    }
  }

  // Cleanup
  function cleanup() {
    // Remove wheel handler
    if (wheelHandler && containerRef.value) {
      containerRef.value.removeEventListener('wheel', wheelHandler)
      wheelHandler = null
    }

    if (pdf.value) {
      pdf.value.destroy()
      pdf.value = null
    }

    pageCanvas = null
    totalPages.value = 0
    currentPage.value = 1
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
    getScrollInfo,
    setScrollByRatio,
    cleanup,
  }
}
