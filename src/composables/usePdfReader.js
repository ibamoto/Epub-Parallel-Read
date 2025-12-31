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
  const renderedPages = ref(new Map())

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
    }
  }

  // Render all pages
  async function renderAllPages() {
    console.log('[PDF] renderAllPages called')
    console.log('[PDF] pdf.value:', !!pdf.value)
    console.log('[PDF] containerRef.value:', !!containerRef.value)

    if (!pdf.value || !containerRef.value) {
      console.log('[PDF] renderAllPages aborted - missing pdf or container')
      return
    }

    const container = containerRef.value
    container.innerHTML = ''

    const fragment = document.createDocumentFragment()

    console.log('[PDF] Creating', totalPages.value, 'canvas elements')
    for (let i = 1; i <= totalPages.value; i++) {
      const canvas = createPageCanvas(i)
      fragment.appendChild(canvas)
    }

    container.appendChild(fragment)

    // Render pages
    const canvases = container.querySelectorAll('canvas')
    console.log('[PDF] Rendering', canvases.length, 'pages')
    for (let i = 0; i < canvases.length; i++) {
      await renderPage(i + 1, canvases[i])
    }
    console.log('[PDF] All pages rendered')
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

      // Render all pages
      await renderAllPages()

      // Restore saved position
      const savedPage = readerStore.currentPages[paneIndex]
      if (savedPage && savedPage <= totalPages.value) {
        goToPage(savedPage)
      }

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
  function goToPage(pageNum) {
    if (!containerRef.value || pageNum < 1 || pageNum > totalPages.value) return

    const canvas = containerRef.value.querySelector(`canvas[data-page="${pageNum}"]`)
    if (canvas) {
      canvas.scrollIntoView({ behavior: 'smooth', block: 'start' })
      currentPage.value = pageNum
      readerStore.setCurrentPage(paneIndex, pageNum)
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

  // Set scale and re-render
  async function setScale(newScale) {
    scale.value = newScale
    await renderAllPages()
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
    if (pdf.value) {
      pdf.value.destroy()
      pdf.value = null
    }
    renderedPages.value.clear()
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
