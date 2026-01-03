import { ref, onUnmounted } from 'vue'
import { useReaderStore } from '../stores/reader'
import { useSettingsStore } from '../stores/settings'

export function useHtmlReader(paneIndex) {
  const readerStore = useReaderStore()
  const settingsStore = useSettingsStore()

  const containerRef = ref(null)
  const isReady = ref(false)
  let contentElement = null

  // Generate TOC from HTML headings
  function generateToc(doc) {
    const toc = []
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')

    headings.forEach((heading, index) => {
      const level = parseInt(heading.tagName.charAt(1), 10)
      const text = heading.textContent.trim()

      // Generate anchor ID if not present
      if (!heading.id) {
        const anchor = text
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-') || `heading-${index}`
        heading.id = anchor
      }

      toc.push({
        label: text,
        href: `#${heading.id}`,
        level: level - 1,
      })
    })

    return toc
  }

  // Open HTML file
  async function openFile(file) {
    if (!containerRef.value) {
      throw new Error('Container not ready')
    }

    readerStore.setLoading(paneIndex, true)
    readerStore.clearError(paneIndex)

    await new Promise(resolve => requestAnimationFrame(resolve))

    try {
      cleanup()

      // Read file as text
      const text = await file.text()

      // Parse HTML
      const parser = new DOMParser()
      const doc = parser.parseFromString(text, 'text/html')

      // Setup container
      setupContainer()

      // Extract body content (or use full document if no body)
      const bodyContent = doc.body ? doc.body.innerHTML : doc.documentElement.innerHTML
      contentElement.innerHTML = bodyContent

      // Generate and set TOC
      const toc = generateToc(contentElement)
      readerStore.setToc(paneIndex, toc)

      // Store references
      readerStore.setBook(paneIndex, { content: text, html: bodyContent }, 'html')
      readerStore.setFileName(paneIndex, file.name)

      // Apply theme
      applyTheme()

      isReady.value = true
    } catch (error) {
      console.error(`Error opening HTML ${paneIndex}:`, error)
      readerStore.setError(paneIndex, `Error loading HTML: ${error.message}`)
      throw error
    } finally {
      readerStore.setLoading(paneIndex, false)
    }
  }

  // Setup container
  function setupContainer() {
    if (!containerRef.value) return

    const container = containerRef.value
    container.innerHTML = ''

    // Create content wrapper
    contentElement = document.createElement('div')
    contentElement.className = 'html-content'
    contentElement.style.cssText = `
      padding: 2rem;
      max-width: 900px;
      margin: 0 auto;
      line-height: 1.6;
      color: var(--text-primary, #333);
    `

    container.appendChild(contentElement)
  }

  // Apply theme
  function applyTheme() {
    if (!contentElement) return

    const colors = settingsStore.getThemeColors()
    contentElement.style.color = colors.text
    contentElement.style.backgroundColor = colors.background

    // Apply styles to HTML elements
    const style = document.createElement('style')
    style.id = `html-theme-${paneIndex}`
    style.textContent = `
      .html-content h1, .html-content h2, .html-content h3,
      .html-content h4, .html-content h5, .html-content h6 {
        color: ${colors.text};
        margin-top: 1.5em;
        margin-bottom: 0.5em;
      }
      .html-content a {
        color: ${colors.link || '#0066cc'};
      }
      .html-content code {
        background: ${colors.bgSecondary || 'rgba(0,0,0,0.05)'};
        padding: 0.2em 0.4em;
        border-radius: 3px;
        font-family: 'Courier New', monospace;
      }
      .html-content pre {
        background: ${colors.bgSecondary || 'rgba(0,0,0,0.05)'};
        padding: 1em;
        border-radius: 5px;
        overflow-x: auto;
      }
      .html-content blockquote {
        border-left: 4px solid ${colors.link || '#0066cc'};
        padding-left: 1em;
        margin-left: 0;
        color: ${colors.textSecondary || colors.text};
      }
      .html-content table {
        border-collapse: collapse;
        width: 100%;
        margin: 1em 0;
      }
      .html-content th, .html-content td {
        border: 1px solid ${colors.border || 'rgba(0,0,0,0.1)'};
        padding: 0.5em;
      }
      .html-content th {
        background: ${colors.bgSecondary || 'rgba(0,0,0,0.05)'};
      }
      .html-content img {
        max-width: 100%;
        height: auto;
      }
    `

    // Remove old style if exists
    const oldStyle = document.getElementById(`html-theme-${paneIndex}`)
    if (oldStyle) oldStyle.remove()

    document.head.appendChild(style)
  }

  // Navigate to anchor
  function goTo(href) {
    if (!contentElement) return

    const anchor = href.startsWith('#') ? href.substring(1) : href
    const element = contentElement.querySelector(`#${CSS.escape(anchor)}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  /**
   * Next navigation (scroll down)
   * Scrolls down by 80% of viewport height
   */
  function next() {
    if (!containerRef.value) return
    const container = containerRef.value
    const scrollAmount = container.clientHeight * 0.8
    container.scrollBy({ top: scrollAmount, behavior: 'smooth' })
  }

  /**
   * Previous navigation (scroll up)
   * Scrolls up by 80% of viewport height
   */
  function prev() {
    if (!containerRef.value) return
    const container = containerRef.value
    const scrollAmount = container.clientHeight * 0.8
    container.scrollBy({ top: -scrollAmount, behavior: 'smooth' })
  }

  /**
   * Get scroll info for scroll synchronization
   * @returns {ScrollInfo | null}
   */
  function getScrollInfo() {
    if (!containerRef.value || !contentElement) return null

    const container = containerRef.value
    const scrollTop = container.scrollTop
    const scrollHeight = contentElement.scrollHeight
    const clientHeight = container.clientHeight
    const scrollRatio = scrollHeight > clientHeight
      ? scrollTop / (scrollHeight - clientHeight)
      : 0

    return {
      scrollTop,
      scrollHeight,
      clientHeight,
      scrollRatio,
    }
  }

  /**
   * Set scroll position by ratio (for scroll sync)
   * @param {number} ratio - Scroll ratio (0.0 - 1.0)
   */
  function setScrollByRatio(ratio) {
    if (!containerRef.value || !contentElement) return

    const container = containerRef.value
    const scrollHeight = contentElement.scrollHeight
    const clientHeight = container.clientHeight
    const maxScroll = scrollHeight - clientHeight
    const targetScroll = ratio * maxScroll

    container.scrollTo({
      top: targetScroll,
      behavior: 'smooth',
    })
  }

  /**
   * Calculate scroll distance based on HTML settings (supports px unit)
   */
  function calculateScrollDistance() {
    const settings = settingsStore.htmlScrollSettings[paneIndex] || { amount: 100, unit: 'px' }
    // HTML only supports px unit
    return settings.amount
  }

  /**
   * Scroll by specified distance
   * @param {number} distance - Scroll distance in pixels (positive = down)
   * @param {boolean} useSettings - If true, calculate distance from settings
   */
  function scrollBy(distance, useSettings = false) {
    if (!containerRef.value) return
    let actualDistance = distance
    if (useSettings) {
      actualDistance = (distance > 0 ? 1 : -1) * calculateScrollDistance()
    }
    containerRef.value.scrollBy({ top: actualDistance, behavior: 'smooth' })
  }

  // Apply settings
  function applySettings() {
    applyTheme()
  }

  // Cleanup
  function cleanup() {
    contentElement = null
    isReady.value = false

    if (containerRef.value) {
      containerRef.value.innerHTML = ''
      containerRef.value.style.cssText = ''
    }

    // Remove theme style
    const style = document.getElementById(`html-theme-${paneIndex}`)
    if (style) style.remove()
  }

  // Cleanup on unmount
  onUnmounted(() => {
    cleanup()
  })

  return {
    containerRef,
    isReady,
    openFile,
    goTo,
    next,
    prev,
    getScrollInfo,
    setScrollByRatio,
    scrollBy,
    calculateScrollDistance,
    applySettings,
    applyTheme,
    cleanup,
  }
}
