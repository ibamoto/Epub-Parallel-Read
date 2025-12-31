import { ref } from 'vue'

const DB_NAME = 'EpubParallelReadHistory'
const DB_VERSION = 2
const STORE_NAME = 'files'
const MAX_HISTORY_ITEMS_PER_PANE = 10

// Shared state across components - separate history for each pane
const leftHistory = ref([])
const rightHistory = ref([])
const isInitialized = ref(false)
let dbInstance = null

// Open IndexedDB
async function openDB() {
  if (dbInstance) return dbInstance

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }

    request.onupgradeneeded = (event) => {
      const db = event.target.result

      // Delete old store if exists and create new one with paneIndex
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME)
      }

      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
      store.createIndex('fileName', 'fileName', { unique: false })
      store.createIndex('openedAt', 'openedAt', { unique: false })
      store.createIndex('paneIndex', 'paneIndex', { unique: false })
      store.createIndex('paneAndFile', ['paneIndex', 'fileName'], { unique: false })
    }
  })
}

// Get history items for a specific pane
async function loadHistoryForPane(paneIndex) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('paneIndex')
    const request = index.getAll(paneIndex)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const items = request.result
        .map(item => ({
          id: item.id,
          fileName: item.fileName,
          fileType: item.fileType,
          fileSize: item.fileSize,
          openedAt: item.openedAt,
          paneIndex: item.paneIndex,
        }))
        .sort((a, b) => b.openedAt - a.openedAt)
      resolve(items)
    }
  })
}

// Load all history
async function loadAllHistory() {
  const [left, right] = await Promise.all([
    loadHistoryForPane(0),
    loadHistoryForPane(1)
  ])
  leftHistory.value = left
  rightHistory.value = right
}

// Add file to history for a specific pane
async function addToHistory(file, paneIndex) {
  const db = await openDB()

  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer()
  const extension = file.name.split('.').pop()?.toLowerCase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    // Check if file with same name exists in this pane
    const index = store.index('paneAndFile')
    const checkRequest = index.getAll([paneIndex, file.name])

    checkRequest.onsuccess = () => {
      const existing = checkRequest.result

      // Delete existing entries with same filename in this pane
      existing.forEach(item => {
        store.delete(item.id)
      })

      // Add new entry
      const entry = {
        fileName: file.name,
        fileType: extension,
        fileSize: file.size,
        fileData: arrayBuffer,
        openedAt: Date.now(),
        paneIndex: paneIndex,
      }

      const addRequest = store.add(entry)
      addRequest.onerror = () => reject(addRequest.error)
      addRequest.onsuccess = () => {
        // Cleanup old entries if exceeding max for this pane
        cleanupOldEntriesForPane(paneIndex).then(() => {
          loadAllHistory().then(() => {
            resolve(addRequest.result)
          })
        })
      }
    }

    checkRequest.onerror = () => reject(checkRequest.error)
  })
}

// Get file data by ID
async function getFileById(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(id)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const item = request.result
      if (item) {
        // Create a File object from stored data
        const blob = new Blob([item.fileData], { type: getFileMimeType(item.fileType) })
        const file = new File([blob], item.fileName, { type: blob.type })
        resolve(file)
      } else {
        resolve(null)
      }
    }
  })
}

// Delete a history item
async function deleteFromHistory(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(id)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      loadAllHistory().then(() => {
        resolve()
      })
    }
  })
}

// Cleanup old entries for a specific pane
async function cleanupOldEntriesForPane(paneIndex) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('paneIndex')
    const request = index.openCursor(IDBKeyRange.only(paneIndex), 'prev')

    let count = 0
    const idsToDelete = []

    request.onsuccess = (event) => {
      const cursor = event.target.result
      if (cursor) {
        count++
        if (count > MAX_HISTORY_ITEMS_PER_PANE) {
          idsToDelete.push(cursor.value.id)
        }
        cursor.continue()
      } else {
        // Delete old entries
        idsToDelete.forEach(id => store.delete(id))
        resolve()
      }
    }

    request.onerror = () => reject(request.error)
  })
}

// Get MIME type from file extension
function getFileMimeType(ext) {
  switch (ext) {
    case 'epub':
      return 'application/epub+zip'
    case 'pdf':
      return 'application/pdf'
    default:
      return 'application/octet-stream'
  }
}

// Format file size for display
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// Format date for display
function formatDate(timestamp) {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date

  // Today
  if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
    return '今日 ' + date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  }
  // Yesterday
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.getDate() === yesterday.getDate()) {
    return '昨日 ' + date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  }
  // This year
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
  }
  // Other
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function useFileHistory() {
  // Initialize history on first use
  async function init() {
    if (isInitialized.value) return
    try {
      await loadAllHistory()
      isInitialized.value = true
    } catch (error) {
      console.error('Failed to initialize file history:', error)
    }
  }

  return {
    leftHistory,
    rightHistory,
    isInitialized,
    init,
    addToHistory,
    getFileById,
    deleteFromHistory,
    formatFileSize,
    formatDate,
  }
}
