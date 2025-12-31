import { ref, shallowRef } from 'vue'

const DB_NAME = 'EpubParallelReadHistory'
const DB_VERSION = 1
const STORE_NAME = 'files'
const MAX_HISTORY_ITEMS = 10

// Shared state across components
const history = ref([])
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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
        store.createIndex('fileName', 'fileName', { unique: false })
        store.createIndex('openedAt', 'openedAt', { unique: false })
      }
    }
  })
}

// Get all history items (metadata only, no file content)
async function loadHistory() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      // Sort by openedAt descending (most recent first)
      const items = request.result
        .map(item => ({
          id: item.id,
          fileName: item.fileName,
          fileType: item.fileType,
          fileSize: item.fileSize,
          openedAt: item.openedAt,
        }))
        .sort((a, b) => b.openedAt - a.openedAt)
      resolve(items)
    }
  })
}

// Add file to history
async function addToHistory(file) {
  const db = await openDB()

  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer()
  const extension = file.name.split('.').pop()?.toLowerCase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    // First, check if file with same name exists
    const index = store.index('fileName')
    const checkRequest = index.getAll(file.name)

    checkRequest.onsuccess = () => {
      const existing = checkRequest.result

      // Delete existing entries with same filename
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
      }

      const addRequest = store.add(entry)
      addRequest.onerror = () => reject(addRequest.error)
      addRequest.onsuccess = () => {
        // Cleanup old entries if exceeding max
        cleanupOldEntries().then(() => {
          loadHistory().then(items => {
            history.value = items
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
      loadHistory().then(items => {
        history.value = items
        resolve()
      })
    }
  })
}

// Cleanup old entries
async function cleanupOldEntries() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('openedAt')
    const request = index.openCursor(null, 'prev')

    let count = 0
    const idsToDelete = []

    request.onsuccess = (event) => {
      const cursor = event.target.result
      if (cursor) {
        count++
        if (count > MAX_HISTORY_ITEMS) {
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
      history.value = await loadHistory()
      isInitialized.value = true
    } catch (error) {
      console.error('Failed to initialize file history:', error)
    }
  }

  return {
    history,
    isInitialized,
    init,
    addToHistory,
    getFileById,
    deleteFromHistory,
    formatFileSize,
    formatDate,
  }
}
