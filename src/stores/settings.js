import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'parallelReadSettings'

const defaultPaneSettings = () => ({
  // Font settings
  fontFamily: 'system-ui',
  fontSize: 16,
  fontWeight: 400,
  textColor: null, // null means use theme color

  // Layout settings
  lineHeight: 1.6,
  letterSpacing: 0,
  paragraphSpacing: 1,
  marginTop: 20,
  marginRight: 20,
  marginBottom: 20,
  marginLeft: 20,
  textAlign: 'left',

  // Display settings
  columnCount: 1,
  scrollMode: 'vertical',
})

export const useSettingsStore = defineStore('settings', () => {
  // Global settings
  const isDarkMode = ref(false)
  const syncMode = ref(false)
  const showControls = ref(true)
  const syncSensitivity = ref(1.0)

  // Keyboard shortcut for sync mode toggle
  // Options: 'ctrl+shift+s', 'alt+s', 'ctrl+/', 'none'
  const syncModeShortcut = ref('ctrl+shift+s')

  // Available shortcut options
  const shortcutOptions = [
    { value: 'ctrl+shift+s', label: 'Ctrl+Shift+S', macLabel: 'Cmd+Shift+S' },
    { value: 'alt+s', label: 'Alt+S', macLabel: 'Option+S' },
    { value: 'ctrl+/', label: 'Ctrl+/', macLabel: 'Cmd+/' },
    { value: 'none', label: '無効', macLabel: '無効' },
  ]


  // Per-pane, per-file-type scroll settings
  // Each setting has: { amount: number, unit: 'px' | 'page' | 'vh' }

  // EPUB scroll settings (supports 'px' and 'page' units)
  const epubScrollSettings = ref([
    { amount: 100, unit: 'px' },
    { amount: 100, unit: 'px' }
  ])

  // Markdown scroll settings (supports 'px' unit)
  const markdownScrollSettings = ref([
    { amount: 100, unit: 'px' },
    { amount: 100, unit: 'px' }
  ])

  // URL scroll settings (supports 'vh' unit - viewport height percentage)
  const urlScrollSettings = ref([
    { amount: 50, unit: 'vh' },
    { amount: 50, unit: 'vh' }
  ])

  // PDF scroll settings (supports 'page' unit)
  const pdfScrollSettings = ref([
    { amount: 1, unit: 'page' },
    { amount: 1, unit: 'page' }
  ])

  // Legacy: kept for backwards compatibility during migration
  const scrollAmounts = ref([100, 100])
  const pdfPageAmounts = ref([1, 1])

  // Per-pane URL font size (percentage, default 100%)
  const urlFontSizes = ref([100, 100])

  // Use scroll/page amount for wheel navigation
  const useWheelAmount = ref(false)

  // Show progress bar for each pane
  const showProgressBar = ref([true, true])

  // Theme settings
  const theme = ref('light') // 'light' | 'dark' | 'sepia' | 'custom'
  const customColors = ref({
    background: '#ffffff',
    text: '#333333',
    link: '#0066cc',
  })

  // Per-pane settings
  const paneSettings = ref([
    defaultPaneSettings(),
    defaultPaneSettings(),
  ])

  // Font options
  const fontOptions = ref([
    { value: 'system-ui', label: 'システムフォント' },
    { value: "'BIZ UDGothic', sans-serif", label: 'BIZ UDゴシック' },
    { value: "'BIZ UDMincho', serif", label: 'BIZ UD明朝' },
    { value: "'Noto Sans JP', sans-serif", label: 'Noto Sans JP' },
    { value: "'Noto Serif JP', serif", label: 'Noto Serif JP' },
  ])

  // Load settings from localStorage
  function loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        isDarkMode.value = parsed.isDarkMode ?? false
        syncMode.value = parsed.syncMode ?? false
        showControls.value = parsed.showControls ?? true
        syncSensitivity.value = parsed.syncSensitivity ?? 1.0
        syncModeShortcut.value = parsed.syncModeShortcut ?? 'ctrl+shift+s'
        theme.value = parsed.theme ?? 'light'
        // New per-file-type scroll settings
        epubScrollSettings.value = parsed.epubScrollSettings ?? [
          { amount: 100, unit: 'px' },
          { amount: 100, unit: 'px' }
        ]
        markdownScrollSettings.value = parsed.markdownScrollSettings ?? [
          { amount: 100, unit: 'px' },
          { amount: 100, unit: 'px' }
        ]
        urlScrollSettings.value = parsed.urlScrollSettings ?? [
          { amount: 50, unit: 'vh' },
          { amount: 50, unit: 'vh' }
        ]
        pdfScrollSettings.value = parsed.pdfScrollSettings ?? [
          { amount: 1, unit: 'page' },
          { amount: 1, unit: 'page' }
        ]

        // Legacy settings (for backwards compatibility)
        scrollAmounts.value = parsed.scrollAmounts ?? [100, 100]
        pdfPageAmounts.value = parsed.pdfPageAmounts ?? [1, 1]
        urlFontSizes.value = parsed.urlFontSizes ?? [100, 100]
        useWheelAmount.value = parsed.useWheelAmount ?? false
        showProgressBar.value = parsed.showProgressBar ?? [true, true]

        if (parsed.customColors) {
          customColors.value = { ...customColors.value, ...parsed.customColors }
        }

        if (parsed.paneSettings) {
          paneSettings.value = parsed.paneSettings.map((settings, index) => ({
            ...defaultPaneSettings(),
            ...settings,
          }))
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  // Save settings to localStorage
  function saveSettings() {
    try {
      const data = {
        isDarkMode: isDarkMode.value,
        syncMode: syncMode.value,
        showControls: showControls.value,
        syncSensitivity: syncSensitivity.value,
        syncModeShortcut: syncModeShortcut.value,
        theme: theme.value,
        customColors: customColors.value,
        paneSettings: paneSettings.value,
        // New per-file-type scroll settings
        epubScrollSettings: epubScrollSettings.value,
        markdownScrollSettings: markdownScrollSettings.value,
        urlScrollSettings: urlScrollSettings.value,
        pdfScrollSettings: pdfScrollSettings.value,
        // Legacy settings (for backwards compatibility)
        scrollAmounts: scrollAmounts.value,
        pdfPageAmounts: pdfPageAmounts.value,
        urlFontSizes: urlFontSizes.value,
        useWheelAmount: useWheelAmount.value,
        showProgressBar: showProgressBar.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }

  // Toggle functions
  function toggleDarkMode() {
    isDarkMode.value = !isDarkMode.value
    theme.value = isDarkMode.value ? 'dark' : 'light'
    saveSettings()
  }

  function toggleSyncMode() {
    syncMode.value = !syncMode.value
    saveSettings()
  }

  function toggleControls() {
    showControls.value = !showControls.value
    saveSettings()
  }

  function setSyncModeShortcut(value) {
    syncModeShortcut.value = value
    saveSettings()
  }

  // Update pane settings
  function updatePaneSettings(paneIndex, newSettings) {
    paneSettings.value[paneIndex] = {
      ...paneSettings.value[paneIndex],
      ...newSettings,
    }
    saveSettings()
  }

  // Reset pane settings to default
  function resetPaneSettings(paneIndex) {
    paneSettings.value[paneIndex] = defaultPaneSettings()
    saveSettings()
  }

  // Update scroll amount for a pane
  function setScrollAmount(paneIndex, value) {
    const newAmounts = [...scrollAmounts.value]
    newAmounts[paneIndex] = value
    scrollAmounts.value = newAmounts
    saveSettings()
  }

  // Update PDF page amount for a pane
  function setPdfPageAmount(paneIndex, value) {
    const newAmounts = [...pdfPageAmounts.value]
    newAmounts[paneIndex] = value
    pdfPageAmounts.value = newAmounts
    saveSettings()
  }

  // Update URL font size for a pane
  function setUrlFontSize(paneIndex, value) {
    const newSizes = [...urlFontSizes.value]
    newSizes[paneIndex] = value
    urlFontSizes.value = newSizes
    saveSettings()
  }

  // Toggle progress bar for a pane
  function setShowProgressBar(paneIndex, value) {
    showProgressBar.value = [...showProgressBar.value]
    showProgressBar.value[paneIndex] = value
  }

  // Update EPUB scroll settings for a pane
  function setEpubScrollSettings(paneIndex, amount, unit) {
    const newSettings = [...epubScrollSettings.value]
    newSettings[paneIndex] = { amount, unit }
    epubScrollSettings.value = newSettings
    saveSettings()
  }

  // Update Markdown scroll settings for a pane
  function setMarkdownScrollSettings(paneIndex, amount, unit) {
    const newSettings = [...markdownScrollSettings.value]
    newSettings[paneIndex] = { amount, unit }
    markdownScrollSettings.value = newSettings
    saveSettings()
  }

  // Update URL scroll settings for a pane
  function setUrlScrollSettings(paneIndex, amount, unit) {
    const newSettings = [...urlScrollSettings.value]
    newSettings[paneIndex] = { amount, unit }
    urlScrollSettings.value = newSettings
    saveSettings()
  }

  // Update PDF scroll settings for a pane
  function setPdfScrollSettings(paneIndex, amount, unit) {
    const newSettings = [...pdfScrollSettings.value]
    newSettings[paneIndex] = { amount, unit }
    pdfScrollSettings.value = newSettings
    saveSettings()
  }

  // Helper to get scroll amount for a specific file type and pane
  function getScrollSettingsForType(fileType, paneIndex) {
    switch (fileType) {
      case 'epub':
        return epubScrollSettings.value[paneIndex] || { amount: 100, unit: 'px' }
      case 'markdown':
        return markdownScrollSettings.value[paneIndex] || { amount: 100, unit: 'px' }
      case 'url':
        return urlScrollSettings.value[paneIndex] || { amount: 50, unit: 'vh' }
      case 'pdf':
        return pdfScrollSettings.value[paneIndex] || { amount: 1, unit: 'page' }
      default:
        return { amount: 100, unit: 'px' }
    }
  }

  // Set theme
  function setTheme(newTheme) {
    theme.value = newTheme
    isDarkMode.value = newTheme === 'dark'
    saveSettings()
  }


  // Get theme colors
  function getThemeColors() {
    switch (theme.value) {
      case 'dark':
        return {
          background: '#1a1a1a',
          text: '#e0e0e0',
          link: '#4a9eff',
        }
      case 'sepia':
        return {
          background: '#f4ecd8',
          text: '#5c4b37',
          link: '#8b4513',
        }
      case 'custom':
        return customColors.value
      default: // light
        return {
          background: '#ffffff',
          text: '#333333',
          link: '#0066cc',
        }
    }
  }

  // Auto-save on changes
  watch([isDarkMode, syncMode, showControls, syncSensitivity, syncModeShortcut, theme, customColors, paneSettings, scrollAmounts, pdfPageAmounts, urlFontSizes, useWheelAmount, showProgressBar, epubScrollSettings, markdownScrollSettings, urlScrollSettings, pdfScrollSettings], () => {
    saveSettings()
  }, { deep: true })

  return {
    // State
    isDarkMode,
    syncMode,
    showControls,
    syncSensitivity,
    syncModeShortcut,
    shortcutOptions,
    theme,
    customColors,
    paneSettings,
    fontOptions,
    // New per-file-type scroll settings
    epubScrollSettings,
    markdownScrollSettings,
    urlScrollSettings,
    pdfScrollSettings,
    // Legacy settings (for backwards compatibility)
    scrollAmounts,
    pdfPageAmounts,
    urlFontSizes,
    useWheelAmount,
    showProgressBar,

    // Actions
    loadSettings,
    saveSettings,
    toggleDarkMode,
    toggleSyncMode,
    toggleControls,
    setSyncModeShortcut,
    updatePaneSettings,
    resetPaneSettings,
    setScrollAmount,
    setPdfPageAmount,
    setUrlFontSize,
    setShowProgressBar,
    // New per-file-type scroll setting functions
    setEpubScrollSettings,
    setMarkdownScrollSettings,
    setUrlScrollSettings,
    setPdfScrollSettings,
    getScrollSettingsForType,
    setTheme,
    getThemeColors,
  }
})
