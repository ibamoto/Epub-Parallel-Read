<template>
  <div class="app-container" :class="themeClass">
    <!-- Google Fonts -->
    <link
      href="https://fonts.googleapis.com/css2?family=BIZ+UDGothic:wght@400;700&family=BIZ+UDMincho&family=Noto+Sans+JP:wght@300;400;500;700&family=Noto+Serif+JP:wght@400;500;700&display=swap"
      rel="stylesheet"
    />

    <!-- Control Bar -->
    <ControlBar @file-select="handleFileSelect" @history-select="handleHistorySelect" @open-settings="showSettings = true" />

    <!-- Reader Container -->
    <div class="reader-container">
      <ReaderPane
        ref="reader1"
        :paneIndex="0"
        position="left"
        :style="{ width: `${readerStore.leftPaneWidth}%` }"
        @scroll="handleScroll(0)"
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
        @scroll="handleScroll(1)"
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useSettingsStore } from './stores/settings'
import { useReaderStore } from './stores/reader'
import { useFileHistory } from './composables/useFileHistory'
import ControlBar from './components/common/ControlBar.vue'
import ReaderPane from './components/reader/ReaderPane.vue'
import SettingsPanel from './components/settings/SettingsPanel.vue'

const settingsStore = useSettingsStore()
const readerStore = useReaderStore()
const { addToHistory } = useFileHistory()

const reader1 = ref(null)
const reader2 = ref(null)
const globalError = ref('')
const isResizing = ref(false)
const showSettings = ref(false)
let isSyncing = false
let syncTimeout = null

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
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('resize', handleWindowResize)
  if (syncTimeout) clearTimeout(syncTimeout)
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
    await reader?.openFile(file)
    // Update history timestamp (with pane index)
    await addToHistory(file, paneIndex)
  } catch (error) {
    console.error('Error opening file from history:', error)
    globalError.value = `ファイルを開けませんでした: ${error.message}`
  }
}

// Handle scroll sync
function handleScroll(sourceIndex) {
  if (!settingsStore.syncMode || isSyncing) return

  isSyncing = true

  const source = sourceIndex === 0 ? reader1.value : reader2.value
  const target = sourceIndex === 0 ? reader2.value : reader1.value

  const scrollInfo = source?.getScrollInfo?.()
  if (scrollInfo && target?.setScrollByRatio) {
    target.setScrollByRatio(scrollInfo.scrollRatio * settingsStore.syncSensitivity)
  }

  if (syncTimeout) clearTimeout(syncTimeout)
  syncTimeout = setTimeout(() => {
    isSyncing = false
  }, 100)
}

// Handle navigation sync
function handleNavigate(sourceIndex, direction) {
  if (!settingsStore.syncMode) return

  const target = sourceIndex === 0 ? reader2.value : reader1.value
  if (direction === 'next') {
    target?.next?.()
  } else if (direction === 'prev') {
    target?.prev?.()
  }
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
  // Ctrl/Cmd + H: Toggle controls
  if ((event.ctrlKey || event.metaKey) && event.key === 'h') {
    event.preventDefault()
    settingsStore.toggleControls()
  }

  // Arrow keys for navigation when sync mode is on
  if (settingsStore.syncMode) {
    // Left/Right arrows: page navigation for both EPUB and PDF
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      reader1.value?.prev?.()
      reader2.value?.prev?.()
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      reader1.value?.next?.()
      reader2.value?.next?.()
    }
    // Up/Down arrows: scroll for EPUB, page navigation for PDF
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const fileType1 = readerStore.fileTypes[0]
      const fileType2 = readerStore.fileTypes[1]
      const scrollDistance1 = settingsStore.scrollAmounts[0] // Left pane scroll amount
      const scrollDistance2 = settingsStore.scrollAmounts[1] // Right pane scroll amount

      if (event.key === 'ArrowUp') {
        // EPUB: scroll up, PDF: previous page
        if (fileType1 === 'epub') reader1.value?.scrollBy?.(-scrollDistance1)
        if (fileType1 === 'pdf') reader1.value?.prev?.()
        if (fileType2 === 'epub') reader2.value?.scrollBy?.(-scrollDistance2)
        if (fileType2 === 'pdf') reader2.value?.prev?.()
      } else {
        // EPUB: scroll down, PDF: next page
        if (fileType1 === 'epub') reader1.value?.scrollBy?.(scrollDistance1)
        if (fileType1 === 'pdf') reader1.value?.next?.()
        if (fileType2 === 'epub') reader2.value?.scrollBy?.(scrollDistance2)
        if (fileType2 === 'pdf') reader2.value?.next?.()
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
