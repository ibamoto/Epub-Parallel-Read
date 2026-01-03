<template>
  <div class="app-container" :class="themeClass">
    <!-- Google Fonts -->
    <link
      href="https://fonts.googleapis.com/css2?family=BIZ+UDGothic:wght@400;700&family=BIZ+UDMincho&family=Noto+Sans+JP:wght@300;400;500;700&family=Noto+Serif+JP:wght@400;500;700&display=swap"
      rel="stylesheet"
    />

    <!-- Control Bar -->
    <ControlBar @file-select="handleFileSelect" @history-select="handleHistorySelect" @open-settings="showSettings = true" @url-open="handleUrlOpen" />

    <!-- Reader Container -->
    <div class="reader-container">
      <ReaderPane
        ref="reader1"
        :paneIndex="0"
        position="left"
        :style="{ width: `${readerStore.leftPaneWidth}%` }"
        @navigate="handleNavigate"
      />

      <div
        class="resize-handle"
        @mousedown="startResize"
      ></div>

      <ReaderPane
        ref="reader2"
        :paneIndex="1"
        position="right"
        :style="{ width: `${100 - readerStore.leftPaneWidth}%` }"
        @navigate="handleNavigate"
      />
    </div>

    <!-- Global Error Message -->
    <div v-if="globalError" class="global-error">
      {{ globalError }}
      <button @click="globalError = ''">×</button>
    </div>

    <!-- Unified Settings Panel -->
    <SettingsPanel
      :visible="showSettings"
      :paneIndex="-1"
      @close="showSettings = false"
      @settings-changed="handleSettingsChanged"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useSettingsStore } from './stores/settings'
import { useReaderStore } from './stores/reader'
import { useFileHistory } from './composables/useFileHistory'
import ControlBar from './components/common/ControlBar.vue'
import ReaderPane from './components/reader/ReaderPane.vue'
import SettingsPanel from './components/settings/SettingsPanel.vue'

const settingsStore = useSettingsStore()
const readerStore = useReaderStore()
const { addToHistory, addUrlToHistory } = useFileHistory()

const reader1 = ref(null)
const reader2 = ref(null)
const globalError = ref('')
const isResizing = ref(false)
const showSettings = ref(false)
let isSyncing = false
let syncTimeout = null
let keyboardNavLock = false  // Lock to prevent scroll sync during keyboard navigation
let tocNavLock = false  // Lock to prevent scroll sync during TOC navigation

// Theme class
const themeClass = computed(() => ({
  'theme-dark': settingsStore.theme === 'dark',
  'theme-sepia': settingsStore.theme === 'sepia',
  'theme-light': settingsStore.theme === 'light' || !settingsStore.theme,
}))

// Initialize stores
onMounted(() => {
  settingsStore.loadSettings()
  readerStore.loadState()

  // Keyboard shortcuts
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('resize', handleWindowResize)

  // Setup wheel event listeners for scroll sync (after mount)
  setupWheelSyncListeners()
})

// クロスオリジン制限により、iframe内からのメッセージ受信は不可能
// 代わりに、.reader-view上のホイールイベントを使用してスクロール同期を実現

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('resize', handleWindowResize)
  if (syncTimeout) clearTimeout(syncTimeout)
  isSyncing = false
  keyboardNavLock = false
  tocNavLock = false
  
  // Remove wheel listeners
  if (wheelHandler0) {
    const container1 = reader1.value?.$el?.querySelector?.('.epub-content-0, .reader-view')
    if (container1) {
      container1.removeEventListener('wheel', wheelHandler0)
    }
    wheelHandler0 = null
  }
  if (wheelHandler1) {
    const container2 = reader2.value?.$el?.querySelector?.('.epub-content-1, .reader-view')
    if (container2) {
      container2.removeEventListener('wheel', wheelHandler1)
    }
    wheelHandler1 = null
  }
})

// Handle file selection from control bar
async function handleFileSelect(paneIndex, event) {
  const file = event.target?.files?.[0]
  if (!file) return

  try {
    const reader = paneIndex === 0 ? reader1.value : reader2.value
    await reader?.openFile(file)
    // Add to history after successful open (with pane index)
    await addToHistory(file, paneIndex)
  } catch (error) {
    console.error('Error opening file:', error)
    globalError.value = `ファイルを開けませんでした: ${error.message}`
  }
}

// Handle file selection from history
async function handleHistorySelect(paneIndex, file) {
  if (!file) return

  try {
    const reader = paneIndex === 0 ? reader1.value : reader2.value
    
    // Check if it's a URL
    if (typeof file === 'object' && file.type === 'url' && file.url) {
      await reader?.openUrl(file.url)
      // Update history timestamp
      await addUrlToHistory(file.url, paneIndex)
    } else {
      await reader?.openFile(file)
      // Update history timestamp (with pane index)
      await addToHistory(file, paneIndex)
    }
  } catch (error) {
    console.error('Error opening file from history:', error)
    globalError.value = `ファイルを開けませんでした: ${error.message}`
  }
}

// Handle URL open
async function handleUrlOpen(paneIndex, url) {
  try {
    const reader = paneIndex === 0 ? reader1.value : reader2.value
    if (reader?.openUrl) {
      await reader.openUrl(url)
      // Add URL to history after successful open
      const { addUrlToHistory } = useFileHistory()
      await addUrlToHistory(url, paneIndex)
    } else {
      // Fallback: create a file-like object for URL
      const urlFile = new File([url], url, { type: 'text/plain' })
      await reader?.openFile(urlFile)
      await addToHistory(urlFile, paneIndex)
    }
  } catch (error) {
    console.error('Error opening URL:', error)
    globalError.value = `URLを開けませんでした: ${error.message}`
  }
}

// Wheel event handlers (stored for cleanup)
let wheelHandler0 = null
let wheelHandler1 = null

// Setup wheel event listeners for scroll sync
function setupWheelSyncListeners() {
  // Watch for file changes - ファイルが閉じられたときに自動的にOFFにする
  watch([() => readerStore.fileTypes[0], () => readerStore.fileTypes[1]], (newValues, oldValues) => {
    // 初回実行時は何もしない
    if (!oldValues) return
    
    const hasFile1 = newValues[0] !== null
    const hasFile2 = newValues[1] !== null
    const hadFile1 = oldValues[0] !== null
    const hadFile2 = oldValues[1] !== null
    
    // ファイルが閉じられたとき（両方のファイルが開いていた状態から、片方または両方が閉じられたとき）は自動的にOFFにする
    if ((hadFile1 && hadFile2) && (!hasFile1 || !hasFile2) && settingsStore.syncMode) {
      settingsStore.syncMode = false
    }
  }, { immediate: false })

  // Watch for sync mode and file changes to setup wheel listeners
  watch([() => readerStore.fileTypes[0], () => readerStore.fileTypes[1], () => settingsStore.syncMode], () => {
    // Ensure refs are available
    if (!reader1.value || !reader2.value) return

    // Remove existing listeners
    if (wheelHandler0) {
      const container1 = reader1.value.$el?.querySelector?.('.epub-content-0, .reader-view')
      if (container1) {
        container1.removeEventListener('wheel', wheelHandler0)
      }
      wheelHandler0 = null
    }
    if (wheelHandler1) {
      const container2 = reader2.value.$el?.querySelector?.('.epub-content-1, .reader-view')
      if (container2) {
        container2.removeEventListener('wheel', wheelHandler1)
      }
      wheelHandler1 = null
    }

    // Add new listeners if both files are open and sync mode is on
    const hasFile1 = readerStore.fileTypes[0] !== null
    const hasFile2 = readerStore.fileTypes[1] !== null
    
    if (hasFile1 && hasFile2 && settingsStore.syncMode) {
      // Wait for DOM to update
      nextTick(() => {
        if (!reader1.value || !reader2.value) return

        // EPUBの場合は.epub-content-{paneIndex}、PDF/Markdown/URLの場合は.reader-viewを探す
        const container1 = reader1.value.$el?.querySelector?.('.epub-content-0') || 
                          reader1.value.$el?.querySelector?.('.reader-view')
        const container2 = reader2.value.$el?.querySelector?.('.epub-content-1') || 
                          reader2.value.$el?.querySelector?.('.reader-view')
        
        if (container1) {
          wheelHandler0 = (e) => handleWheelSync(e, 0)
          container1.addEventListener('wheel', wheelHandler0, { passive: true })
        }
        if (container2) {
          wheelHandler1 = (e) => handleWheelSync(e, 1)
          container2.addEventListener('wheel', wheelHandler1, { passive: true })
        }
      })
    }
  }, { immediate: false })
}

/**
 * ホイールイベントによるスクロール同期処理
 * 
 * EPUB、Markdown、PDFリーダーのスクロール同期を実装
 * URLリーダーは別途実装（クロスオリジン制限により制約あり）
 * 
 * 仕様: READER_SPECIFICATIONS.md を参照
 * 
 * @param {WheelEvent} event - ホイールイベント
 * @param {number} sourceIndex - ソースペインのインデックス (0 or 1)
 */
function handleWheelSync(event, sourceIndex) {
  // Skip sync if keyboard navigation is active, TOC navigation is active, already syncing, or sync mode is off
  if (!settingsStore.syncMode || isSyncing || keyboardNavLock || tocNavLock) return

  // 両方のペインにファイルが開かれている場合のみ同期を実行
  const hasFile1 = readerStore.books[0] !== null
  const hasFile2 = readerStore.books[1] !== null
  if (!hasFile1 || !hasFile2) return

  const source = sourceIndex === 0 ? reader1.value : reader2.value
  const target = sourceIndex === 0 ? reader2.value : reader1.value

  const sourceType = readerStore.fileTypes[sourceIndex]
  const targetType = readerStore.fileTypes[1 - sourceIndex]

  // EPUB、Markdown、PDFのスクロール同期処理
  // URLリーダーは後続の処理で別途実装

  // ============================================
  // EPUB、Markdown、PDFのスクロール同期処理
  // 
  // 仕様: READER_SPECIFICATIONS.md を参照
  // 
  // 重要な制約:
  // - ソースペインのスクロールは各リーダーのsetupWheelHandlerで実行される
  // - ターゲットペインの同期はこの関数（handleWheelSync）で実行される
  // - スクロール同期モードが有効な場合のみ実行される
  // ============================================

  // Helper function to get scroll amount based on file type and pane index
  function getScrollAmountForType(fileType, paneIdx) {
    const targetRef = paneIdx === 0 ? reader1.value : reader2.value
    // Use the reader's calculateScrollDistance if available
    if (targetRef?.calculateScrollDistance) {
      return targetRef.calculateScrollDistance()
    }
    // Fallback to settings
    const settings = settingsStore.getScrollSettingsForType(fileType, paneIdx)
    return settings.amount
  }

  // Helper function to get PDF page amount
  function getPdfPageAmount(paneIdx) {
    const settings = settingsStore.pdfScrollSettings[paneIdx] || { amount: 1, unit: 'page' }
    return settings.amount
  }

  const direction = event.deltaY > 0 ? 1 : -1

  // EPUB-EPUB: 両方のコンテナをスクロール
  if (sourceType === 'epub' && targetType === 'epub') {
    const targetContainer = target?.$el?.querySelector?.(`.epub-content-${1 - sourceIndex}`)
    if (targetContainer) {
      const scrollAmount = getScrollAmountForType('epub', 1 - sourceIndex)
      targetContainer.scrollBy({
        top: direction * scrollAmount * settingsStore.syncSensitivity,
        behavior: 'smooth'
      })
    }
  }
  // PDF-PDF: 両方のPDFでページ移動
  else if (sourceType === 'pdf' && targetType === 'pdf') {
    const pageAmount = getPdfPageAmount(1 - sourceIndex)
    target?.pageBy?.(direction * pageAmount)
  }
  // EPUB-PDF: EPUBをスクロール、PDFでページ移動
  else if (sourceType === 'epub' && targetType === 'pdf') {
    const pageAmount = getPdfPageAmount(1 - sourceIndex)
    target?.pageBy?.(direction * pageAmount)
  }
  // PDF-EPUB: PDFでページ移動、EPUBをスクロール
  else if (sourceType === 'pdf' && targetType === 'epub') {
    const targetContainer = target?.$el?.querySelector?.(`.epub-content-${1 - sourceIndex}`)
    if (targetContainer) {
      const scrollAmount = getScrollAmountForType('epub', 1 - sourceIndex)
      targetContainer.scrollBy({
        top: direction * scrollAmount * settingsStore.syncSensitivity,
        behavior: 'smooth'
      })
    }
  }
  // Markdown-Markdown: 両方のコンテナをスクロール
  else if (sourceType === 'markdown' && targetType === 'markdown') {
    const targetContainer = target?.$el?.querySelector?.('.reader-view')
    if (targetContainer) {
      const scrollAmount = getScrollAmountForType('markdown', 1 - sourceIndex)
      targetContainer.scrollBy({
        top: direction * scrollAmount * settingsStore.syncSensitivity,
        behavior: 'smooth'
      })
    }
  }
  // Markdown-EPUB: Markdownをスクロール、EPUBをスクロール
  else if (sourceType === 'markdown' && targetType === 'epub') {
    const targetContainer = target?.$el?.querySelector?.(`.epub-content-${1 - sourceIndex}`)
    if (targetContainer) {
      const scrollAmount = getScrollAmountForType('epub', 1 - sourceIndex)
      targetContainer.scrollBy({
        top: direction * scrollAmount * settingsStore.syncSensitivity,
        behavior: 'smooth'
      })
    }
  }
  // EPUB-Markdown: EPUBをスクロール、Markdownをスクロール
  else if (sourceType === 'epub' && targetType === 'markdown') {
    const targetContainer = target?.$el?.querySelector?.('.reader-view')
    if (targetContainer) {
      const scrollAmount = getScrollAmountForType('markdown', 1 - sourceIndex)
      targetContainer.scrollBy({
        top: direction * scrollAmount * settingsStore.syncSensitivity,
        behavior: 'smooth'
      })
    }
  }
  // Markdown-PDF: Markdownをスクロール、PDFでページ移動
  else if (sourceType === 'markdown' && targetType === 'pdf') {
    const pageAmount = getPdfPageAmount(1 - sourceIndex)
    target?.pageBy?.(direction * pageAmount)
  }
  // PDF-Markdown: PDFでページ移動、Markdownをスクロール
  else if (sourceType === 'pdf' && targetType === 'markdown') {
    const targetContainer = target?.$el?.querySelector?.('.reader-view')
    if (targetContainer) {
      const scrollAmount = getScrollAmountForType('markdown', 1 - sourceIndex)
      targetContainer.scrollBy({
        top: direction * scrollAmount * settingsStore.syncSensitivity,
        behavior: 'smooth'
      })
    }
  }
  // URL-URL: 両方のiframeをスクロール（vh単位対応）
  else if (sourceType === 'url' && targetType === 'url') {
    // ソースペインのスクロール (calculateScrollDistanceを使用)
    const sourceScrollAmount = source?.calculateScrollDistance?.() || 100
    source?.scrollBy?.(direction * sourceScrollAmount)

    // ターゲットペインのスクロール
    const targetScrollAmount = target?.calculateScrollDistance?.() || 100
    target?.scrollBy?.(direction * targetScrollAmount * settingsStore.syncSensitivity)
  }
  // URL-EPUB: URLをスクロール、EPUBをスクロール
  else if (sourceType === 'url' && targetType === 'epub') {
    // ソースペイン（URL）のスクロール
    const sourceScrollAmount = source?.calculateScrollDistance?.() || 100
    source?.scrollBy?.(direction * sourceScrollAmount)

    // ターゲットペイン（EPUB）のスクロール
    const targetContainer = target?.$el?.querySelector?.(`.epub-content-${1 - sourceIndex}`)
    if (targetContainer) {
      const scrollAmount = getScrollAmountForType('epub', 1 - sourceIndex)
      targetContainer.scrollBy({
        top: direction * scrollAmount * settingsStore.syncSensitivity,
        behavior: 'smooth'
      })
    }
  }
  // EPUB-URL: EPUBをスクロール、URLをスクロール
  else if (sourceType === 'epub' && targetType === 'url') {
    // ターゲットペイン（URL）のスクロール
    const scrollAmount = target?.calculateScrollDistance?.() || 100
    target?.scrollBy?.(direction * scrollAmount * settingsStore.syncSensitivity)
  }
  // URL-Markdown: URLをスクロール、Markdownをスクロール
  else if (sourceType === 'url' && targetType === 'markdown') {
    // ソースペイン（URL）のスクロール
    const sourceScrollAmount = source?.calculateScrollDistance?.() || 100
    source?.scrollBy?.(direction * sourceScrollAmount)

    // ターゲットペイン（Markdown）のスクロール
    const targetContainer = target?.$el?.querySelector?.('.reader-view')
    if (targetContainer) {
      const scrollAmount = getScrollAmountForType('markdown', 1 - sourceIndex)
      targetContainer.scrollBy({
        top: direction * scrollAmount * settingsStore.syncSensitivity,
        behavior: 'smooth'
      })
    }
  }
  // Markdown-URL: Markdownをスクロール、URLをスクロール
  else if (sourceType === 'markdown' && targetType === 'url') {
    // ターゲットペイン（URL）のスクロール
    const scrollAmount = target?.calculateScrollDistance?.() || 100
    target?.scrollBy?.(direction * scrollAmount * settingsStore.syncSensitivity)
  }
  // URL-PDF: URLをスクロール、PDFでページ移動
  else if (sourceType === 'url' && targetType === 'pdf') {
    // ソースペイン（URL）のスクロール
    const sourceScrollAmount = source?.calculateScrollDistance?.() || 100
    source?.scrollBy?.(direction * sourceScrollAmount)

    // ターゲットペイン（PDF）のページ移動
    const pageAmount = getPdfPageAmount(1 - sourceIndex)
    target?.pageBy?.(direction * pageAmount)
  }
  // PDF-URL: PDFでページ移動、URLをスクロール
  else if (sourceType === 'pdf' && targetType === 'url') {
    // ターゲットペイン（URL）のスクロール
    const scrollAmount = target?.calculateScrollDistance?.() || 100
    target?.scrollBy?.(direction * scrollAmount * settingsStore.syncSensitivity)
  }

  // ============================================
  // URLリーダーのスクロール同期処理
  // 
  // 注意: URLリーダーは仕様が異なるため、EPUB/Markdown/PDFとは別実装
  // - クロスオリジン制限により、iframe内のスクロールイベントは検出できない
  // - .reader-view上のホイールイベントのみ検出可能
  // - iframe内のスクロールを制御するには、webSecurity: falseが必要
  // 
  // 仕様: READER_SPECIFICATIONS.md を参照（URLリーダーは別途実装中）
  // ============================================
}

/**
 * ナビゲーションボタンによる同期処理
 * 
 * EPUB、Markdown、PDFリーダーのナビゲーション同期を実装
 * URLリーダーも対象（next/prevでスクロールを実行）
 * 
 * 仕様: READER_SPECIFICATIONS.md を参照
 * 
 * @param {number} sourceIndex - ソースペインのインデックス (0 or 1)
 * @param {string} direction - ナビゲーション方向 ('next' | 'prev' | 'toc')
 * @param {string} href - ナビゲーション先のhref（目次ナビゲーション時）
 */
function handleNavigate(sourceIndex, direction, href) {
  // 目次からのナビゲーションの場合は、スクロール同期を無効化
  if (direction === 'toc') {
    tocNavLock = true
    // 目次ナビゲーション完了後にロックを解除（スクロールアニメーションを考慮）
    setTimeout(() => {
      tocNavLock = false
    }, 1000) // TOC navigation may take longer due to section loading
    return // 目次ナビゲーションは同期しない
  }

  // Skip if sync mode is off or keyboard nav is active
  if (!settingsStore.syncMode || keyboardNavLock) return

  // 両方のペインにファイルが開かれている場合のみ同期を実行
  const hasFile1 = readerStore.fileTypes[0] !== null
  const hasFile2 = readerStore.fileTypes[1] !== null
  if (!hasFile1 || !hasFile2) return

  // Lock to prevent scroll sync feedback
  keyboardNavLock = true

  const target = sourceIndex === 0 ? reader2.value : reader1.value
  if (direction === 'next') {
    target?.next?.()
  } else if (direction === 'prev') {
    target?.prev?.()
  }

  // Reset lock after navigation animation completes
  setTimeout(() => {
    keyboardNavLock = false
  }, 600)
}

// Resize handling
function startResize(e) {
  if (isResizing.value) return
  isResizing.value = true
  e.preventDefault()

  const container = document.querySelector('.reader-container')
  const containerWidth = container.offsetWidth
  const startX = e.clientX
  const startWidth = readerStore.leftPaneWidth

  const handleMouseMove = (e) => {
    if (!isResizing.value) return
    e.preventDefault()

    const delta = e.clientX - startX
    const deltaPercent = (delta / containerWidth) * 100
    const newWidth = Math.max(20, Math.min(80, startWidth + deltaPercent))

    readerStore.setLeftPaneWidth(newWidth)
  }

  const handleMouseUp = () => {
    isResizing.value = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)

    // Resize renditions
    reader1.value?.resize?.()
    reader2.value?.resize?.()

    readerStore.saveState()
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

// Keyboard shortcuts
function handleKeyDown(event) {
  // Ignore if user is typing in an input
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
    return
  }

  // Ctrl/Cmd + H: Toggle controls
  if ((event.ctrlKey || event.metaKey) && event.key === 'h') {
    event.preventDefault()
    settingsStore.toggleControls()
    return
  }

  // Arrow keys for navigation
  const fileType1 = readerStore.fileTypes[0]
  const fileType2 = readerStore.fileTypes[1]

  // Skip if no files are open
  if (!fileType1 && !fileType2) return

  // Lock scroll sync during keyboard navigation to prevent feedback loops
  // Both panes will navigate directly, no scroll-based sync needed
  keyboardNavLock = true
  if (syncTimeout) clearTimeout(syncTimeout)
  syncTimeout = setTimeout(() => {
    keyboardNavLock = false
  }, 800) // Extended timeout to cover smooth scroll animations

  // 両方のペインにファイルが開かれているかチェック
  const hasFile1 = readerStore.fileTypes[0] !== null
  const hasFile2 = readerStore.fileTypes[1] !== null
  const bothFilesOpen = hasFile1 && hasFile2

  // Left/Right arrows: page navigation for both EPUB and PDF
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    reader1.value?.prev?.()
    if (settingsStore.syncMode && bothFilesOpen) reader2.value?.prev?.()
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    reader1.value?.next?.()
    if (settingsStore.syncMode && bothFilesOpen) reader2.value?.next?.()
  }
  // Up/Down arrows: scroll for EPUB/Markdown/URL, page navigation for PDF
  else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()

    // Get scroll/page amounts using file-type-specific settings
    const getScrollAmount = (fileType, paneIdx) => {
      const targetRef = paneIdx === 0 ? reader1.value : reader2.value
      if (targetRef?.calculateScrollDistance) {
        return targetRef.calculateScrollDistance()
      }
      const settings = settingsStore.getScrollSettingsForType(fileType, paneIdx)
      return settings.amount
    }

    const getPageAmount = (paneIdx) => {
      const settings = settingsStore.pdfScrollSettings[paneIdx] || { amount: 1, unit: 'page' }
      return settings.amount
    }

    const direction = event.key === 'ArrowUp' ? -1 : 1

    // Pane 1
    if (fileType1 === 'epub' || fileType1 === 'markdown' || fileType1 === 'url') {
      const scrollAmount = getScrollAmount(fileType1, 0)
      reader1.value?.scrollBy?.(direction * scrollAmount)
    }
    if (fileType1 === 'pdf') {
      const pageAmount = getPageAmount(0)
      reader1.value?.pageBy?.(direction * pageAmount)
    }

    // Pane 2 (sync mode)
    if (settingsStore.syncMode && bothFilesOpen) {
      if (fileType2 === 'epub' || fileType2 === 'markdown' || fileType2 === 'url') {
        const scrollAmount = getScrollAmount(fileType2, 1)
        reader2.value?.scrollBy?.(direction * scrollAmount)
      }
      if (fileType2 === 'pdf') {
        const pageAmount = getPageAmount(1)
        reader2.value?.pageBy?.(direction * pageAmount)
      }
    }
  }
}

// Handle window resize
function handleWindowResize() {
  reader1.value?.resize?.()
  reader2.value?.resize?.()
}

// Handle settings changed from unified settings panel
function handleSettingsChanged() {
  // Apply theme and settings to both readers
  if (readerStore.fileTypes[0] === 'epub' && reader1.value) {
    reader1.value.applySettings?.()
  }
  if (readerStore.fileTypes[1] === 'epub' && reader2.value) {
    reader2.value.applySettings?.()
  }
}

// Watch theme changes to apply to EPUB content automatically
watch(() => settingsStore.theme, () => {
  handleSettingsChanged()
})
</script>

<style>
/* CSS Variables */
:root {
  /* Light theme */
  --bg-primary: #ffffff;
  --bg-secondary: #f8f9fa;
  --bg-tertiary: #f0f1f2;
  --bg-hover: #e9ecef;

  --text-primary: #212529;
  --text-secondary: #495057;
  --text-tertiary: #6c757d;

  --border-color: #dee2e6;

  --accent-color: #4a9eff;
  --accent-light: rgba(74, 158, 255, 0.1);
}

.theme-dark {
  --bg-primary: #1a1a1a;
  --bg-secondary: #242424;
  --bg-tertiary: #2d2d2d;
  --bg-hover: #363636;

  --text-primary: #e0e0e0;
  --text-secondary: #a0a0a0;
  --text-tertiary: #707070;

  --border-color: #404040;

  --accent-color: #4a9eff;
  --accent-light: rgba(74, 158, 255, 0.15);
}

.theme-sepia {
  --bg-primary: #f4ecd8;
  --bg-secondary: #ebe3cf;
  --bg-tertiary: #e2d9c5;
  --bg-hover: #d9d0bc;

  --text-primary: #5c4b37;
  --text-secondary: #7a6b5a;
  --text-tertiary: #998b7a;

  --border-color: #c9c0ac;

  --accent-color: #8b4513;
  --accent-light: rgba(139, 69, 19, 0.1);
}

/* Global Reset */
*,
*::before,
*::after {
  box-sizing: border-box;
}

body,
#app {
  margin: 0;
  padding: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}

/* Google Fonts */
@font-face {
  font-family: 'BIZ UDGothic';
  src: url('https://fonts.googleapis.com/css2?family=BIZ+UDGothic:wght@400;700&display=swap');
}

@font-face {
  font-family: 'BIZ UDMincho';
  src: url('https://fonts.googleapis.com/css2?family=BIZ+UDMincho&display=swap');
}
</style>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  color: var(--text-primary);
  overflow: hidden;
  transition: background-color 0.3s, color 0.3s;
}

.reader-container {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
  gap: 0;
  padding: 0.5rem;
  padding-top: 0;
}

.resize-handle {
  width: 8px;
  background: var(--border-color);
  cursor: col-resize;
  transition: background-color 0.2s;
  flex-shrink: 0;
  border-radius: 4px;
  margin: 0 2px;
}

.resize-handle:hover,
.resize-handle:active {
  background: var(--accent-color);
}

.global-error {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.75rem 1.5rem;
  background: #dc2626;
  color: white;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
  z-index: 3000;
}

.global-error button {
  background: none;
  border: none;
  color: white;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

/* Responsive */
@media (max-width: 900px) {
  .reader-container {
    flex-direction: column;
  }

  .resize-handle {
    width: 100%;
    height: 8px;
    cursor: row-resize;
  }
}
</style>
