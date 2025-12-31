import { ref, onUnmounted } from 'vue'
import Epub from 'epubjs'
import { useReaderStore } from '../stores/reader'
import { useSettingsStore } from '../stores/settings'

export function useEpubReader(paneIndex) {
  const readerStore = useReaderStore()
  const settingsStore = useSettingsStore()

  const containerRef = ref(null)
  const book = ref(null)
  const isReady = ref(false)

  // Content state
  const chapters = ref([])
  const currentChapterIndex = ref(0)
  const resourceUrls = ref({}) // Store blob URLs for images/resources
  const styleElement = ref(null)

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

  // Generate scoped styles
  function generateScopedStyles() {
    const colors = settingsStore.getThemeColors()
    const settings = settingsStore.paneSettings[paneIndex]
    const fontFamily = settings.fontFamily === 'system-ui'
      ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif'
      : settings.fontFamily

    return `
      .epub-content-${paneIndex} {
        background: ${colors.background} !important;
        color: ${colors.text} !important;
        font-family: ${fontFamily};
        font-size: ${settings.fontSize}px;
        font-weight: ${settings.fontWeight};
        line-height: ${settings.lineHeight};
        letter-spacing: ${settings.letterSpacing}em;
        text-align: ${settings.textAlign};
        padding: ${settings.marginTop}px ${settings.marginRight}px ${settings.marginBottom}px ${settings.marginLeft}px;
        box-sizing: border-box;
      }

      .epub-content-${paneIndex} p,
      .epub-content-${paneIndex} div {
        color: ${colors.text} !important;
      }

      .epub-content-${paneIndex} a {
        color: ${colors.link} !important;
      }

      .epub-content-${paneIndex} h1,
      .epub-content-${paneIndex} h2,
      .epub-content-${paneIndex} h3,
      .epub-content-${paneIndex} h4,
      .epub-content-${paneIndex} h5,
      .epub-content-${paneIndex} h6 {
        color: ${colors.text} !important;
        margin-top: 1.2em;
        margin-bottom: 0.6em;
      }

      .epub-content-${paneIndex} p {
        margin-top: ${settings.paragraphSpacing}em;
        margin-bottom: ${settings.paragraphSpacing}em;
      }

      .epub-content-${paneIndex} img {
        max-width: 100%;
        height: auto;
        display: block;
        margin: 1em auto;
      }

      .epub-content-${paneIndex} .epub-chapter {
        margin-bottom: 2em;
        padding-bottom: 2em;
        border-bottom: 1px solid ${colors.text}22;
      }

      .epub-content-${paneIndex} .epub-chapter:last-child {
        border-bottom: none;
      }

      .epub-content-${paneIndex} svg {
        max-width: 100%;
        height: auto;
      }

      .epub-content-${paneIndex} table {
        border-collapse: collapse;
        margin: 1em 0;
        max-width: 100%;
        overflow-x: auto;
        display: block;
      }

      .epub-content-${paneIndex} th,
      .epub-content-${paneIndex} td {
        border: 1px solid ${colors.text}44;
        padding: 0.5em;
      }

      .epub-content-${paneIndex} pre,
      .epub-content-${paneIndex} code {
        background: ${colors.text}11;
        padding: 0.2em 0.4em;
        border-radius: 3px;
        font-family: monospace;
        overflow-x: auto;
      }

      .epub-content-${paneIndex} pre code {
        padding: 0;
        background: none;
      }

      .epub-content-${paneIndex} blockquote {
        margin: 1em 0;
        padding-left: 1em;
        border-left: 3px solid ${colors.text}44;
        font-style: italic;
      }
    `
  }

  // Apply theme and settings
  function applyTheme() {
    updateStyles()
  }

  function applySettings() {
    updateStyles()
  }

  // Update styles
  function updateStyles() {
    if (!styleElement.value || !containerRef.value) return
    styleElement.value.textContent = generateScopedStyles()
  }

  // Load resource as blob URL
  async function loadResource(path, book) {
    try {
      // Normalize path
      const normalizedPath = path.replace(/^\.\//, '').replace(/^\//, '')

      // Try to get resource from archive
      const resource = book.archive.zip.files[normalizedPath] ||
                      book.archive.zip.files['OEBPS/' + normalizedPath] ||
                      book.archive.zip.files['OPS/' + normalizedPath]

      if (resource) {
        const blob = await resource.async('blob')
        return URL.createObjectURL(blob)
      }

      // Try using epubjs resources
      const url = await book.resources.get(normalizedPath)
      if (url) return url

      return null
    } catch (error) {
      console.warn('Failed to load resource:', path, error)
      return null
    }
  }

  // Process HTML content - replace resource URLs
  async function processContent(html, basePath, book) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'application/xhtml+xml')

    // Handle parse errors by trying HTML parser
    if (doc.querySelector('parsererror')) {
      const htmlDoc = parser.parseFromString(html, 'text/html')
      return processDocument(htmlDoc, basePath, book)
    }

    return processDocument(doc, basePath, book)
  }

  async function processDocument(doc, basePath, book) {
    const baseDir = basePath.split('/').slice(0, -1).join('/')

    // Process images
    const images = doc.querySelectorAll('img')
    for (const img of images) {
      const src = img.getAttribute('src')
      if (src && !src.startsWith('data:') && !src.startsWith('http')) {
        const fullPath = resolveUrl(baseDir, src)
        let blobUrl = resourceUrls.value[fullPath]

        if (!blobUrl) {
          blobUrl = await loadResource(fullPath, book)
          if (blobUrl) {
            resourceUrls.value[fullPath] = blobUrl
          }
        }

        if (blobUrl) {
          img.setAttribute('src', blobUrl)
        }
      }
    }

    // Process SVG images (xlink:href)
    const svgImages = doc.querySelectorAll('image')
    for (const img of svgImages) {
      const href = img.getAttribute('xlink:href') || img.getAttribute('href')
      if (href && !href.startsWith('data:') && !href.startsWith('http')) {
        const fullPath = resolveUrl(baseDir, href)
        let blobUrl = resourceUrls.value[fullPath]

        if (!blobUrl) {
          blobUrl = await loadResource(fullPath, book)
          if (blobUrl) {
            resourceUrls.value[fullPath] = blobUrl
          }
        }

        if (blobUrl) {
          img.setAttribute('xlink:href', blobUrl)
          img.setAttribute('href', blobUrl)
        }
      }
    }

    // Remove scripts for security
    const scripts = doc.querySelectorAll('script')
    scripts.forEach(script => script.remove())

    // Get body content or full document
    const body = doc.body || doc.documentElement
    return body.innerHTML
  }

  // Resolve relative URL
  function resolveUrl(base, relative) {
    if (relative.startsWith('/')) {
      return relative.slice(1)
    }

    const baseParts = base.split('/')
    const relativeParts = relative.split('/')

    for (const part of relativeParts) {
      if (part === '..') {
        baseParts.pop()
      } else if (part !== '.') {
        baseParts.push(part)
      }
    }

    return baseParts.join('/')
  }

  // Load all chapters
  async function loadChapters(book) {
    const loadedChapters = []
    const spine = book.spine

    for (let i = 0; i < spine.items.length; i++) {
      const item = spine.items[i]
      try {
        // Get chapter content
        const doc = await book.load(item.href)
        const serializer = new XMLSerializer()
        const html = serializer.serializeToString(doc)

        // Process content (replace image URLs, etc.)
        const processedHtml = await processContent(html, item.href, book)

        loadedChapters.push({
          href: item.href,
          index: i,
          content: processedHtml,
          idref: item.idref
        })
      } catch (error) {
        console.warn(`Failed to load chapter ${i}:`, error)
        loadedChapters.push({
          href: item.href,
          index: i,
          content: `<p>Failed to load chapter: ${error.message}</p>`,
          idref: item.idref
        })
      }
    }

    return loadedChapters
  }

  // Render chapters to container
  function renderChapters() {
    if (!containerRef.value) return

    const container = containerRef.value
    container.innerHTML = ''

    // Create content wrapper
    const wrapper = document.createElement('div')
    wrapper.className = `epub-content-${paneIndex}`

    // Add chapters
    for (const chapter of chapters.value) {
      const chapterDiv = document.createElement('div')
      chapterDiv.className = 'epub-chapter'
      chapterDiv.dataset.href = chapter.href
      chapterDiv.dataset.index = chapter.index
      chapterDiv.innerHTML = chapter.content
      wrapper.appendChild(chapterDiv)
    }

    container.appendChild(wrapper)
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

      // Create new book (only for parsing, not rendering)
      book.value = Epub(arrayBuffer)
      await book.value.ready

      // Get metadata
      console.log(`Book ${paneIndex} metadata:`, book.value.metadata)

      // Get TOC
      const navigation = await book.value.navigation
      const toc = processToc(navigation.toc)
      readerStore.setToc(paneIndex, toc)

      // Create style element
      styleElement.value = document.createElement('style')
      styleElement.value.id = `epub-styles-${paneIndex}`
      document.head.appendChild(styleElement.value)
      updateStyles()

      // Load all chapters
      chapters.value = await loadChapters(book.value)

      // Render chapters
      renderChapters()

      // Store references
      readerStore.setBook(paneIndex, book.value, 'epub')
      readerStore.setRendition(paneIndex, null) // No rendition in iframe-free mode
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
    if (!containerRef.value || !href) return

    try {
      // Remove any fragment identifier for matching
      const [targetHref, fragment] = href.split('#')

      // Find the chapter element
      const chapters = containerRef.value.querySelectorAll('.epub-chapter')

      for (const chapter of chapters) {
        const chapterHref = chapter.dataset.href

        // Match by href (with or without path prefix)
        if (chapterHref === targetHref ||
            chapterHref.endsWith('/' + targetHref) ||
            targetHref.endsWith('/' + chapterHref) ||
            chapterHref.includes(targetHref) ||
            targetHref.includes(chapterHref)) {

          if (fragment) {
            // Try to find element with matching id
            const targetElement = chapter.querySelector(`#${fragment}`)
            if (targetElement) {
              targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
              return
            }
          }

          // Scroll to chapter start
          chapter.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return
        }
      }

      // If no match found, try matching by fragment only
      if (fragment) {
        const targetElement = containerRef.value.querySelector(`#${fragment}`)
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return
        }
      }

      console.warn('Could not find navigation target:', href)
    } catch (error) {
      console.error('Error navigating:', error)
    }
  }

  // Navigate to next chapter
  async function next() {
    if (!containerRef.value) return

    const container = containerRef.value
    const scrollAmount = container.clientHeight * 0.9
    container.scrollBy({ top: scrollAmount, behavior: 'smooth' })
  }

  // Navigate to previous chapter
  async function prev() {
    if (!containerRef.value) return

    const container = containerRef.value
    const scrollAmount = container.clientHeight * 0.9
    container.scrollBy({ top: -scrollAmount, behavior: 'smooth' })
  }

  // Resize handler (no-op in iframe-free mode, but kept for API compatibility)
  function resize() {
    // No action needed - CSS handles responsive layout
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
    // Revoke all blob URLs
    for (const url of Object.values(resourceUrls.value)) {
      try {
        URL.revokeObjectURL(url)
      } catch (e) {
        // Ignore errors
      }
    }
    resourceUrls.value = {}

    // Remove style element
    if (styleElement.value && styleElement.value.parentNode) {
      styleElement.value.parentNode.removeChild(styleElement.value)
      styleElement.value = null
    }

    // Clear container
    if (containerRef.value) {
      containerRef.value.innerHTML = ''
    }

    // Destroy book
    if (book.value) {
      try {
        book.value.destroy()
      } catch (e) {
        console.warn('Error destroying book:', e)
      }
      book.value = null
    }

    chapters.value = []
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
