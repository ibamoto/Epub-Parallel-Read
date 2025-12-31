import { ref, watch } from 'vue'
import { useSettingsStore } from '../stores/settings'

export function useReaderSync(reader1, reader2) {
  const settingsStore = useSettingsStore()

  const isSyncing = ref(false)
  const lastSyncSource = ref(null)
  let syncTimeout = null

  // Sync scroll from source to target
  function syncScroll(sourceIndex) {
    if (!settingsStore.syncMode || isSyncing.value) return

    const source = sourceIndex === 0 ? reader1 : reader2
    const target = sourceIndex === 0 ? reader2 : reader1

    if (!source?.getScrollInfo || !target?.setScrollByRatio) return

    const scrollInfo = source.getScrollInfo()
    if (!scrollInfo) return

    isSyncing.value = true
    lastSyncSource.value = sourceIndex

    // Apply sensitivity adjustment
    const adjustedRatio = scrollInfo.scrollRatio * settingsStore.syncSensitivity

    target.setScrollByRatio(adjustedRatio)

    // Reset syncing flag after a short delay to prevent ping-pong
    if (syncTimeout) clearTimeout(syncTimeout)
    syncTimeout = setTimeout(() => {
      isSyncing.value = false
    }, 100)
  }

  // Sync navigation (next/prev) between readers
  async function syncNavigation(sourceIndex, direction) {
    if (!settingsStore.syncMode) return

    const target = sourceIndex === 0 ? reader2 : reader1

    if (!target) return

    try {
      if (direction === 'next') {
        await target.next?.()
      } else if (direction === 'prev') {
        await target.prev?.()
      }
    } catch (error) {
      console.error('Error syncing navigation:', error)
    }
  }

  // Handle wheel event for synchronized scrolling
  function handleWheel(event, sourceIndex) {
    if (!settingsStore.syncMode) return

    const target = sourceIndex === 0 ? reader2 : reader1

    if (!target?.containerRef?.value) return

    // Apply wheel delta to target
    const delta = event.deltaY * settingsStore.syncSensitivity
    target.containerRef.value.scrollTop += delta
  }

  // Setup scroll listeners
  function setupScrollListeners() {
    if (reader1?.containerRef?.value) {
      reader1.containerRef.value.addEventListener('scroll', () => {
        if (lastSyncSource.value !== 1) {
          syncScroll(0)
        }
      })
    }

    if (reader2?.containerRef?.value) {
      reader2.containerRef.value.addEventListener('scroll', () => {
        if (lastSyncSource.value !== 0) {
          syncScroll(1)
        }
      })
    }
  }

  // Cleanup
  function cleanup() {
    if (syncTimeout) {
      clearTimeout(syncTimeout)
      syncTimeout = null
    }
  }

  return {
    isSyncing,
    syncScroll,
    syncNavigation,
    handleWheel,
    setupScrollListeners,
    cleanup,
  }
}
