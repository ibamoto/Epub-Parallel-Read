import { ref, onUnmounted } from 'vue'
import MarkdownIt from 'markdown-it'
import mermaid from 'mermaid'
import { useReaderStore } from '../stores/reader'
import { useSettingsStore } from '../stores/settings'

export function useMarkdownReader(paneIndex) {
  const readerStore = useReaderStore()
  const settingsStore = useSettingsStore()

  const containerRef = ref(null)
  const isReady = ref(false)
  let contentElement = null
  let mermaidInitialized = false

  // Initialize Mermaid
  function initMermaid() {
    if (mermaidInitialized) return
    mermaid.initialize({
      startOnLoad: false,
      theme: settingsStore.theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose',
    })
    mermaidInitialized = true
  }

  // Render Mermaid diagrams
  async function renderMermaid() {
    if (!containerRef.value || !contentElement) return

    const mermaidElements = contentElement.querySelectorAll('.mermaid')
    for (const element of mermaidElements) {
      try {
        const code = element.textContent.trim()
        if (code) {
          // Render mermaid
          await mermaid.run({
            nodes: [element],
          })
        }
      } catch (error) {
        console.error('Error rendering Mermaid diagram:', error)
        element.innerHTML = `<p style="color: red; padding: 1em;">Mermaid diagram error: ${error.message}</p>`
      }
    }
  }

  // Generate TOC from markdown headings
  function generateToc(markdown) {
    const toc = []
    const lines = markdown.split('\n')
    let level = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
      if (headingMatch) {
        const headingLevel = headingMatch[1].length
        const headingText = headingMatch[2].trim()
        const anchor = headingText
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')

        toc.push({
          label: headingText,
          href: `#${anchor}`,
          level: headingLevel - 1,
        })
      }
    }

    return toc
  }

  // Open Markdown file
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

      // Initialize Mermaid
      initMermaid()

      // Parse Markdown
      const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
      })

      // Add anchor IDs to headings
      const renderer = md.renderer
      const originalHeadingOpen = renderer.rules.heading_open || function(tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options)
      }
      renderer.rules.heading_open = function(tokens, idx, options, env, self) {
        const token = tokens[idx]
        const headingText = tokens[idx + 1]?.content || ''
        const anchor = headingText
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
        token.attrSet('id', anchor)
        return originalHeadingOpen(tokens, idx, options, env, self)
      }

      // Handle Mermaid code blocks
      const originalCodeBlock = renderer.rules.fence || function(tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options)
      }
      renderer.rules.fence = function(tokens, idx, options, env, self) {
        const token = tokens[idx]
        if (token.info === 'mermaid') {
          // Return a div with class mermaid for Mermaid rendering
          return `<div class="mermaid">${token.content}</div>\n`
        }
        return originalCodeBlock(tokens, idx, options, env, self)
      }

      // Render Markdown to HTML
      const html = md.render(text)

      // Setup container
      setupContainer()

      // Insert HTML
      contentElement.innerHTML = html

      // Generate and set TOC
      const toc = generateToc(text)
      readerStore.setToc(paneIndex, toc)

      // Store references
      readerStore.setBook(paneIndex, { content: text, html }, 'markdown')
      readerStore.setFileName(paneIndex, file.name)

      // Render Mermaid diagrams
      await renderMermaid()

      // Apply theme
      applyTheme()

      isReady.value = true
    } catch (error) {
      console.error(`Error opening Markdown ${paneIndex}:`, error)
      readerStore.setError(paneIndex, `Error loading Markdown: ${error.message}`)
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
    contentElement.className = 'markdown-content'
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

    // Update Mermaid theme
    if (mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: settingsStore.theme === 'dark' ? 'dark' : 'default',
        securityLevel: 'loose',
      })
    }

    // Apply styles to markdown elements
    const style = document.createElement('style')
    style.id = `markdown-theme-${paneIndex}`
    style.textContent = `
      .markdown-content h1, .markdown-content h2, .markdown-content h3,
      .markdown-content h4, .markdown-content h5, .markdown-content h6 {
        color: ${colors.text};
        margin-top: 1.5em;
        margin-bottom: 0.5em;
      }
      .markdown-content a {
        color: ${colors.accent || '#0066cc'};
      }
      .markdown-content code {
        background: ${colors.bgSecondary || 'rgba(0,0,0,0.05)'};
        padding: 0.2em 0.4em;
        border-radius: 3px;
        font-family: 'Courier New', monospace;
      }
      .markdown-content pre {
        background: ${colors.bgSecondary || 'rgba(0,0,0,0.05)'};
        padding: 1em;
        border-radius: 5px;
        overflow-x: auto;
      }
      .markdown-content blockquote {
        border-left: 4px solid ${colors.accent || '#0066cc'};
        padding-left: 1em;
        margin-left: 0;
        color: ${colors.textSecondary || colors.text};
      }
      .markdown-content table {
        border-collapse: collapse;
        width: 100%;
        margin: 1em 0;
      }
      .markdown-content th, .markdown-content td {
        border: 1px solid ${colors.border || 'rgba(0,0,0,0.1)'};
        padding: 0.5em;
      }
      .markdown-content th {
        background: ${colors.bgSecondary || 'rgba(0,0,0,0.05)'};
      }
      .markdown-content .mermaid {
        margin: 1.5em 0;
        text-align: center;
      }
    `
    
    // Remove old style if exists
    const oldStyle = document.getElementById(`markdown-theme-${paneIndex}`)
    if (oldStyle) oldStyle.remove()
    
    document.head.appendChild(style)
  }

  // Navigate to anchor
  function goTo(href) {
    if (!contentElement) return

    const anchor = href.startsWith('#') ? href.substring(1) : href
    const element = contentElement.querySelector(`#${anchor}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  /**
   * 次へナビゲーション（下方向スクロール）
   * 
   * 仕様: READER_SPECIFICATIONS.md を参照
   * - 画面の80%分を下方向にスクロール
   */
  function next() {
    if (!containerRef.value) return
    const container = containerRef.value
    const scrollAmount = container.clientHeight * 0.8
    container.scrollBy({ top: scrollAmount, behavior: 'smooth' })
  }

  /**
   * 前へナビゲーション（上方向スクロール）
   * 
   * 仕様: READER_SPECIFICATIONS.md を参照
   * - 画面の80%分を上方向にスクロール
   */
  function prev() {
    if (!containerRef.value) return
    const container = containerRef.value
    const scrollAmount = container.clientHeight * 0.8
    container.scrollBy({ top: -scrollAmount, behavior: 'smooth' })
  }

  /**
   * スクロール情報を取得（スクロール同期用）
   * 
   * 仕様: READER_SPECIFICATIONS.md を参照
   * - containerRef.value.scrollTop を使用
   * - contentElement.scrollHeight を使用
   * - containerRef.value.clientHeight を使用
   * 
   * @returns {ScrollInfo | null} スクロール情報
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
   * スクロール位置を比率で設定（スクロール同期用）
   * 
   * 仕様: READER_SPECIFICATIONS.md を参照
   * - ratio: 0.0 - 1.0
   * - containerRef.value.scrollTo を使用
   * 
   * @param {number} ratio - スクロール比率 (0.0 - 1.0)
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
   * Calculate scroll distance based on Markdown settings (supports px unit)
   */
  function calculateScrollDistance() {
    const settings = settingsStore.markdownScrollSettings[paneIndex] || { amount: 100, unit: 'px' }
    // Markdown only supports px unit
    return settings.amount
  }

  /**
   * 指定距離だけスクロール
   *
   * 仕様: READER_SPECIFICATIONS.md を参照
   * - containerRef.value.scrollBy を使用
   *
   * @param {number} distance - スクロール距離（ピクセル単位、正の値は下方向）
   * @param {boolean} useSettings - trueの場合、設定から距離を計算
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
    const style = document.getElementById(`markdown-theme-${paneIndex}`)
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

