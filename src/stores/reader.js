import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'parallelReadState'

export const useReaderStore = defineStore('reader', () => {
  // Reader state for each pane
  const books = ref([null, null])
  const renditions = ref([null, null])
  const fileTypes = ref([null, null]) // 'epub' | 'pdf' | null
  const fileNames = ref(['', ''])
  const tocs = ref([[], []])
  const currentLocations = ref([null, null])
  const totalPages = ref([0, 0]) // For PDF
  const currentPages = ref([1, 1]) // For PDF

  // Loading states
  const isLoading = ref([false, false])
  const errors = ref(['', ''])

  // TOC visibility
  const showToc = ref([true, true])

  // Resize state
  const leftPaneWidth = ref(50) // percentage

  // Set book for a pane
  function setBook(paneIndex, book, type) {
    books.value[paneIndex] = book
    fileTypes.value[paneIndex] = type
  }

  // Set rendition for a pane
  function setRendition(paneIndex, rendition) {
    renditions.value[paneIndex] = rendition
  }

  // Set TOC for a pane
  function setToc(paneIndex, toc) {
    tocs.value[paneIndex] = toc
  }

  // Set file name
  function setFileName(paneIndex, name) {
    fileNames.value[paneIndex] = name
  }

  // Set current location (CFI for EPUB, page for PDF)
  function setCurrentLocation(paneIndex, location) {
    currentLocations.value[paneIndex] = location
    saveState()
  }

  // Set loading state
  function setLoading(paneIndex, loading) {
    isLoading.value[paneIndex] = loading
  }

  // Set error
  function setError(paneIndex, error) {
    errors.value[paneIndex] = error
  }

  // Clear error
  function clearError(paneIndex) {
    errors.value[paneIndex] = ''
  }

  // Toggle TOC visibility
  function toggleToc(paneIndex) {
    showToc.value[paneIndex] = !showToc.value[paneIndex]
  }

  // Set pane width
  function setLeftPaneWidth(width) {
    leftPaneWidth.value = Math.max(20, Math.min(80, width))
  }

  // PDF specific
  function setTotalPages(paneIndex, total) {
    totalPages.value[paneIndex] = total
  }

  function setCurrentPage(paneIndex, page) {
    currentPages.value[paneIndex] = page
    saveState()
  }

  // Cleanup a pane
  function cleanupPane(paneIndex) {
    if (renditions.value[paneIndex]) {
      try {
        renditions.value[paneIndex].destroy?.()
      } catch (e) {
        console.warn('Error destroying rendition:', e)
      }
    }
    if (books.value[paneIndex]) {
      try {
        books.value[paneIndex].destroy?.()
      } catch (e) {
        console.warn('Error destroying book:', e)
      }
    }

    books.value[paneIndex] = null
    renditions.value[paneIndex] = null
    fileTypes.value[paneIndex] = null
    fileNames.value[paneIndex] = ''
    tocs.value[paneIndex] = []
    currentLocations.value[paneIndex] = null
    totalPages.value[paneIndex] = 0
    currentPages.value[paneIndex] = 1
    errors.value[paneIndex] = ''
  }

  // Save state to localStorage
  function saveState() {
    try {
      const state = {
        fileNames: fileNames.value,
        fileTypes: fileTypes.value,
        currentLocations: currentLocations.value,
        currentPages: currentPages.value,
        showToc: showToc.value,
        leftPaneWidth: leftPaneWidth.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (error) {
      console.error('Failed to save reader state:', error)
    }
  }

  // Load state from localStorage
  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const state = JSON.parse(saved)
        if (state.fileNames) fileNames.value = state.fileNames
        if (state.currentLocations) currentLocations.value = state.currentLocations
        if (state.currentPages) currentPages.value = state.currentPages
        if (state.showToc) showToc.value = state.showToc
        if (state.leftPaneWidth) leftPaneWidth.value = state.leftPaneWidth
      }
    } catch (error) {
      console.error('Failed to load reader state:', error)
    }
  }

  return {
    // State
    books,
    renditions,
    fileTypes,
    fileNames,
    tocs,
    currentLocations,
    totalPages,
    currentPages,
    isLoading,
    errors,
    showToc,
    leftPaneWidth,

    // Actions
    setBook,
    setRendition,
    setToc,
    setFileName,
    setCurrentLocation,
    setLoading,
    setError,
    clearError,
    toggleToc,
    setLeftPaneWidth,
    setTotalPages,
    setCurrentPage,
    cleanupPane,
    saveState,
    loadState,
  }
})
