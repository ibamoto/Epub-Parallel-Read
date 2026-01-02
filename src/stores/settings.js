import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'parallelReadSettings'

const defaultPaneSettings = () => ({
  // Font settings
  fontFamily: 'system-ui',
  fontSize: 16,
  fontWeight: 400,

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

  // EPUB display mode: 'scroll' | 'page'
  const epubDisplayMode = ref('scroll')

  // Per-pane scroll amount (in pixels for EPUB)
  const scrollAmounts = ref([100, 100])

  // Per-pane PDF page amount (pages per navigation)
  const pdfPageAmounts = ref([1, 1])

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
        epubDisplayMode.value = parsed.epubDisplayMode ?? 'scroll'
        theme.value = parsed.theme ?? 'light'
        scrollAmounts.value = parsed.scrollAmounts ?? [100, 100]
        pdfPageAmounts.value = parsed.pdfPageAmounts ?? [1, 1]
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
        epubDisplayMode: epubDisplayMode.value,
        theme: theme.value,
        customColors: customColors.value,
        paneSettings: paneSettings.value,
        scrollAmounts: scrollAmounts.value,
        pdfPageAmounts: pdfPageAmounts.value,
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
    scrollAmounts.value = [...scrollAmounts.value]
    scrollAmounts.value[paneIndex] = value
  }

  // Update PDF page amount for a pane
  function setPdfPageAmount(paneIndex, value) {
    pdfPageAmounts.value = [...pdfPageAmounts.value]
    pdfPageAmounts.value[paneIndex] = value
  }

  // Toggle progress bar for a pane
  function setShowProgressBar(paneIndex, value) {
    showProgressBar.value = [...showProgressBar.value]
    showProgressBar.value[paneIndex] = value
  }

  // Set theme
  function setTheme(newTheme) {
    theme.value = newTheme
    isDarkMode.value = newTheme === 'dark'
    saveSettings()
  }

  // Set EPUB display mode
  function setEpubDisplayMode(mode) {
    epubDisplayMode.value = mode
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
  watch([isDarkMode, syncMode, showControls, syncSensitivity, epubDisplayMode, theme, customColors, paneSettings, scrollAmounts, pdfPageAmounts, useWheelAmount, showProgressBar], () => {
    saveSettings()
  }, { deep: true })

  return {
    // State
    isDarkMode,
    syncMode,
    showControls,
    syncSensitivity,
    epubDisplayMode,
    theme,
    customColors,
    paneSettings,
    fontOptions,
    scrollAmounts,
    pdfPageAmounts,
    useWheelAmount,
    showProgressBar,

    // Actions
    loadSettings,
    saveSettings,
    toggleDarkMode,
    toggleSyncMode,
    toggleControls,
    updatePaneSettings,
    resetPaneSettings,
    setScrollAmount,
    setPdfPageAmount,
    setShowProgressBar,
    setTheme,
    setEpubDisplayMode,
    getThemeColors,
  }
})
