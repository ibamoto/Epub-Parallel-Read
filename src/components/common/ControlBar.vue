<template>
  <div class="controls" :class="{ 'controls-hidden': !settingsStore.showControls }">
    <button class="icon-btn" @click="settingsStore.toggleDarkMode" :title="settingsStore.isDarkMode ? 'ライトモード' : 'ダークモード'">
      <span class="mode-icon">{{ settingsStore.isDarkMode ? '☾' : '☀' }}</span>
    </button>

    <button class="sync-btn" :class="{ active: settingsStore.syncMode }" @click="settingsStore.toggleSyncMode">
      <span class="sync-icon">⇄</span>
      スクロール同期
    </button>

    <button class="settings-btn" @click="emit('open-settings')" title="表示設定">
      <span>Aa</span>
    </button>

    <div class="file-inputs">
      <!-- Hidden file inputs -->
      <input type="file" ref="leftFileInput" @change="handleFileChange(0, $event)" :accept="acceptTypes" class="hidden-input" />
      <input type="file" ref="rightFileInput" @change="handleFileChange(1, $event)" :accept="acceptTypes" class="hidden-input" />

      <!-- Left Pane Button with History -->
      <div class="file-button-wrapper" ref="leftButtonWrapper">
        <button class="file-input-label" @click="toggleDropdown(0)">
          <span>左ペイン</span>
          <span class="dropdown-arrow">▼</span>
        </button>
        <div v-if="showDropdown[0]" class="history-dropdown">
          <div class="dropdown-header">
            <span>履歴</span>
            <button class="new-file-btn" @click.stop="triggerFileInput(0)">新規ファイル</button>
          </div>
          <div v-if="leftHistory.length === 0" class="no-history">
            履歴がありません
          </div>
          <div v-else class="history-list">
            <div
              v-for="item in leftHistory"
              :key="item.id"
              class="history-item"
              @click.stop="selectFromHistory(0, item.id)"
            >
              <div class="history-item-icon">{{ item.fileType === 'pdf' ? '📄' : '📕' }}</div>
              <div class="history-item-info">
                <div class="history-item-name">{{ item.fileName }}</div>
                <div class="history-item-meta">
                  {{ formatFileSize(item.fileSize) }} · {{ formatDate(item.openedAt) }}
                </div>
              </div>
              <button class="history-item-delete" @click.stop="deleteHistoryItem(item.id)" title="削除">×</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Left Pane Scroll Amount -->
      <div class="scroll-amount-control">
        <label title="左ペインのスクロール量 (px)">⇅</label>
        <button class="scroll-btn" @click="adjustScrollAmount(0, -10)" title="スクロール量を減らす">−</button>
        <input
          type="number"
          :value="settingsStore.scrollAmounts[0]"
          @input="updateScrollAmount(0, $event)"
          min="10"
          max="1000"
          step="10"
          title="左ペインのスクロール量 (px)"
        />
        <button class="scroll-btn" @click="adjustScrollAmount(0, 10)" title="スクロール量を増やす">+</button>
      </div>

      <!-- Right Pane Scroll Amount -->
      <div class="scroll-amount-control right">
        <button class="scroll-btn" @click="adjustScrollAmount(1, -10)" title="スクロール量を減らす">−</button>
        <input
          type="number"
          :value="settingsStore.scrollAmounts[1]"
          @input="updateScrollAmount(1, $event)"
          min="10"
          max="1000"
          step="10"
          title="右ペインのスクロール量 (px)"
        />
        <button class="scroll-btn" @click="adjustScrollAmount(1, 10)" title="スクロール量を増やす">+</button>
        <label title="右ペインのスクロール量 (px)">⇅</label>
      </div>

      <!-- Right Pane Button with History -->
      <div class="file-button-wrapper right-pane" ref="rightButtonWrapper">
        <button class="file-input-label" @click="toggleDropdown(1)">
          <span>右ペイン</span>
          <span class="dropdown-arrow">▼</span>
        </button>
        <div v-if="showDropdown[1]" class="history-dropdown">
          <div class="dropdown-header">
            <span>履歴</span>
            <button class="new-file-btn" @click.stop="triggerFileInput(1)">新規ファイル</button>
          </div>
          <div v-if="rightHistory.length === 0" class="no-history">
            履歴がありません
          </div>
          <div v-else class="history-list">
            <div
              v-for="item in rightHistory"
              :key="item.id"
              class="history-item"
              @click.stop="selectFromHistory(1, item.id)"
            >
              <div class="history-item-icon">{{ item.fileType === 'pdf' ? '📄' : '📕' }}</div>
              <div class="history-item-info">
                <div class="history-item-name">{{ item.fileName }}</div>
                <div class="history-item-meta">
                  {{ formatFileSize(item.fileSize) }} · {{ formatDate(item.openedAt) }}
                </div>
              </div>
              <button class="history-item-delete" @click.stop="deleteHistoryItem(item.id)" title="削除">×</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="version">v{{ appVersion }}</div>
  </div>

  <button class="toggle-controls" @click="settingsStore.toggleControls">
    <span class="toggle-icon">{{ settingsStore.showControls ? '▲' : '▼' }}</span>
  </button>
</template>

<script setup>
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { useFileHistory } from '../../composables/useFileHistory'

const settingsStore = useSettingsStore()
const { leftHistory, rightHistory, init, getFileById, deleteFromHistory, formatFileSize, formatDate } = useFileHistory()

const appVersion = window.appVersion || '2.0.0'
const acceptTypes = '.epub,.pdf'

const emit = defineEmits(['file-select', 'history-select', 'open-settings'])

const showDropdown = ref([false, false])
const leftFileInput = ref(null)
const rightFileInput = ref(null)
const leftButtonWrapper = ref(null)
const rightButtonWrapper = ref(null)

// Initialize history on mount
onMounted(async () => {
  await init()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// Toggle dropdown
function toggleDropdown(paneIndex) {
  // Close other dropdown
  showDropdown.value[1 - paneIndex] = false
  // Toggle this dropdown
  showDropdown.value[paneIndex] = !showDropdown.value[paneIndex]
}

// Close dropdowns when clicking outside
function handleClickOutside(event) {
  if (leftButtonWrapper.value && !leftButtonWrapper.value.contains(event.target)) {
    showDropdown.value[0] = false
  }
  if (rightButtonWrapper.value && !rightButtonWrapper.value.contains(event.target)) {
    showDropdown.value[1] = false
  }
}

// Trigger file input
async function triggerFileInput(paneIndex) {
  showDropdown.value[paneIndex] = false
  // Wait for DOM to update before triggering file input
  await nextTick()
  if (paneIndex === 0) {
    leftFileInput.value?.click()
  } else {
    rightFileInput.value?.click()
  }
}

// Handle file change from input
function handleFileChange(paneIndex, event) {
  emit('file-select', paneIndex, event)
}

// Select file from history
async function selectFromHistory(paneIndex, fileId) {
  showDropdown.value[paneIndex] = false
  try {
    const file = await getFileById(fileId)
    if (file) {
      emit('history-select', paneIndex, file)
    }
  } catch (error) {
    console.error('Failed to load file from history:', error)
  }
}

// Delete history item
async function deleteHistoryItem(id) {
  try {
    await deleteFromHistory(id)
  } catch (error) {
    console.error('Failed to delete history item:', error)
  }
}

// Update scroll amount
function updateScrollAmount(paneIndex, event) {
  const value = parseInt(event.target.value, 10)
  if (!isNaN(value) && value >= 10 && value <= 1000) {
    settingsStore.scrollAmounts[paneIndex] = value
  }
}

// Adjust scroll amount by delta
function adjustScrollAmount(paneIndex, delta) {
  const currentValue = settingsStore.scrollAmounts[paneIndex]
  const newValue = Math.max(10, Math.min(1000, currentValue + delta))
  settingsStore.scrollAmounts[paneIndex] = newValue
}
</script>

<style scoped>
.controls {
  padding: 0.5rem 1rem;
  display: flex;
  gap: 0.75rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  transition: all 0.3s ease-in-out;
  position: relative;
}

.controls-hidden {
  transform: translateY(-100%);
  height: 0;
  padding: 0;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.icon-btn {
  padding: 0.4rem 0.6rem;
  border: none;
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover {
  background: var(--bg-hover);
}

.mode-icon {
  font-size: 1.2rem;
  line-height: 1;
}

.sync-btn {
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
}

.sync-btn:hover {
  background: var(--bg-hover);
}

.sync-btn.active {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.sync-icon {
  font-size: 1rem;
}

.settings-btn {
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
  font-weight: 600;
}

.settings-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent-color);
}

.file-inputs {
  display: flex;
  gap: 0.5rem;
  flex: 1;
}

.file-button-wrapper {
  position: relative;
}

.file-button-wrapper.right-pane {
  margin-left: 0;
}

.scroll-amount-control {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.scroll-amount-control.right {
  margin-left: auto;
}

.scroll-amount-control label {
  font-size: 0.9rem;
  color: var(--text-secondary);
  cursor: default;
}

.scroll-amount-control input {
  width: 60px;
  padding: 0.3rem 0.4rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 0.8rem;
  text-align: center;
}

.scroll-amount-control input:hover {
  border-color: var(--accent-color);
}

.scroll-amount-control input:focus {
  outline: none;
  border-color: var(--accent-color);
  box-shadow: 0 0 0 2px var(--accent-light);
}

/* Hide number input spinners */
.scroll-amount-control input::-webkit-outer-spin-button,
.scroll-amount-control input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.scroll-amount-control input[type=number] {
  -moz-appearance: textfield;
}

.scroll-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  user-select: none;
}

.scroll-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent-color);
}

.scroll-btn:active {
  background: var(--accent-light);
}

.file-input-label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.4rem 0.75rem;
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.85rem;
  user-select: none;
}

.file-input-label:hover {
  border-color: var(--accent-color);
  background: var(--bg-hover);
}

.hidden-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.dropdown-arrow {
  font-size: 0.6rem;
  margin-left: 0.25rem;
  opacity: 0.7;
}

.history-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  min-width: 280px;
  max-width: 350px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
}

.file-button-wrapper.right-pane .history-dropdown {
  left: auto;
  right: 0;
}

.dropdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.new-file-btn {
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  background: transparent;
  color: var(--accent-color);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.new-file-btn:hover {
  background: var(--accent-color);
  color: white;
}

.no-history {
  padding: 1rem;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 0.85rem;
}

.history-list {
  max-height: 300px;
  overflow-y: auto;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: background-color 0.15s;
}

.history-item:hover {
  background: var(--bg-hover);
}

.history-item-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.history-item-info {
  flex: 1;
  min-width: 0;
}

.history-item-name {
  font-size: 0.85rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-item-meta {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.history-item-delete {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  opacity: 0;
  transition: all 0.15s;
}

.history-item:hover .history-item-delete {
  opacity: 1;
}

.history-item-delete:hover {
  background: rgba(220, 38, 38, 0.1);
  color: #dc2626;
}

.version {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--text-tertiary);
}

.toggle-controls {
  position: fixed;
  top: 8px;
  right: 8px;
  z-index: 1000;
  padding: 0.3rem 0.5rem;
  background: var(--bg-primary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.toggle-controls:hover {
  background: var(--bg-secondary);
}

.toggle-icon {
  font-size: 0.7rem;
}
</style>
