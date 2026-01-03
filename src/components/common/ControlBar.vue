<template>
  <div
    class="controls"
    :class="{ 'controls-hidden': !settingsStore.showControls }"
  >
    <button
      class="icon-btn"
      @click="settingsStore.toggleDarkMode"
      :title="settingsStore.isDarkMode ? 'ライトモード' : 'ダークモード'"
    >
      <span class="mode-icon">{{ settingsStore.isDarkMode ? "☾" : "☀" }}</span>
    </button>

    <button
      class="sync-btn"
      :class="{ active: settingsStore.syncMode, disabled: !canSync }"
      @click="handleSyncToggle"
      :title="syncButtonTitle"
    >
      <span class="sync-icon">⇄</span>
      スクロール同期
    </button>

    <button
      class="settings-btn"
      :class="{ disabled: !canApplySettings }"
      @click="canApplySettings && emit('open-settings')"
      :title="canApplySettings ? '表示設定' : '表示設定はEPUB/Markdownのみ有効'"
    >
      <span>Aa</span>
    </button>

    <div class="file-inputs">
      <!-- Hidden file inputs -->
      <input
        type="file"
        ref="leftFileInput"
        @change="handleFileChange(0, $event)"
        :accept="acceptTypes"
        class="hidden-input"
      />
      <input
        type="file"
        ref="rightFileInput"
        @change="handleFileChange(1, $event)"
        :accept="acceptTypes"
        class="hidden-input"
      />

      <!-- Left Pane Button with History -->
      <div class="file-button-wrapper" ref="leftButtonWrapper">
        <button class="file-input-label" @click="toggleDropdown(0)">
          <span>左ペイン</span>
          <span class="dropdown-arrow">▼</span>
        </button>
        <div v-if="showDropdown[0]" class="history-dropdown">
          <div class="dropdown-header">
            <span>履歴</span>
            <div class="header-buttons">
              <button class="new-file-btn" @click.stop="openUrlDialog(0)">
                URLを開く
              </button>
              <button class="new-file-btn" @click.stop="triggerFileInput(0)">
                新規ファイル
              </button>
            </div>
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
              <div class="history-item-icon">
                <span v-if="item.fileType === 'pdf'" class="pdf-icon">PDF</span>
                <span v-else-if="item.fileType === 'url'" class="url-icon"
                  >URL</span
                >
                <span
                  v-else-if="
                    item.fileType === 'md' || item.fileType === 'markdown'
                  "
                  class="md-icon"
                  >MD</span
                >
                <span v-else class="epub-icon">EPUB</span>
              </div>
              <div class="history-item-info">
                <div class="history-item-name">{{ item.fileName }}</div>
                <div class="history-item-meta">
                  {{
                    item.fileType === "url"
                      ? "URL"
                      : formatFileSize(item.fileSize)
                  }}
                  ·
                  {{ formatDate(item.openedAt) }}
                </div>
              </div>
              <button
                class="history-item-delete"
                @click.stop="deleteHistoryItem(item.id)"
                title="削除"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Left Pane Settings -->
      <div class="pane-settings" v-if="readerStore.fileTypes[0]">
        <!-- URL: vh unit -->
        <div
          class="scroll-amount-control"
          v-if="readerStore.fileTypes[0] === 'url'"
          title="左ペインのスクロール量 (vh)"
        >
          <input
            type="number"
            :value="settingsStore.urlScrollSettings[0]?.amount ?? 50"
            @input="updateUrlScrollAmount(0, $event)"
            @keydown="preventInvalidInput($event, 1, 100)"
            min="1"
            max="100"
            step="5"
          />
          <span class="unit">vh</span>
        </div>
        <!-- EPUB: px unit -->
        <div
          class="scroll-amount-control"
          v-if="readerStore.fileTypes[0] === 'epub'"
          title="左ペインのスクロール量 (px)"
        >
          <input
            type="number"
            :value="settingsStore.epubScrollSettings[0]?.amount ?? 100"
            @input="updateEpubScrollAmount(0, $event)"
            @keydown="preventInvalidInput($event, 10, 1000)"
            min="10"
            max="1000"
            step="10"
          />
          <span class="unit">px</span>
        </div>
        <!-- Markdown: px unit -->
        <div
          class="scroll-amount-control"
          v-if="readerStore.fileTypes[0] === 'markdown'"
          title="左ペインのスクロール量 (px)"
        >
          <input
            type="number"
            :value="settingsStore.markdownScrollSettings[0]?.amount ?? 100"
            @input="updateMarkdownScrollAmount(0, $event)"
            @keydown="preventInvalidInput($event, 10, 1000)"
            min="10"
            max="1000"
            step="10"
          />
          <span class="unit">px</span>
        </div>
        <!-- PDF: page unit -->
        <div
          class="scroll-amount-control"
          v-if="readerStore.fileTypes[0] === 'pdf'"
          title="左ペインのページ数"
        >
          <input
            type="number"
            :value="settingsStore.pdfScrollSettings[0]?.amount ?? 1"
            @input="updatePdfScrollAmount(0, $event)"
            @keydown="preventInvalidInput($event, 1, 100)"
            min="1"
            max="100"
            step="1"
          />
          <span class="unit">ページ</span>
        </div>
      </div>

      <!-- Right Pane Settings -->
      <div class="pane-settings right" v-if="readerStore.fileTypes[1]">
        <!-- PDF: page unit -->
        <div
          class="scroll-amount-control"
          v-if="readerStore.fileTypes[1] === 'pdf'"
          title="右ペインのページ数"
        >
          <input
            type="number"
            :value="settingsStore.pdfScrollSettings[1]?.amount ?? 1"
            @input="updatePdfScrollAmount(1, $event)"
            @keydown="preventInvalidInput($event, 1, 100)"
            min="1"
            max="100"
            step="1"
          />
          <span class="unit">ページ</span>
        </div>
        <!-- URL: vh unit -->
        <div
          class="scroll-amount-control"
          v-if="readerStore.fileTypes[1] === 'url'"
          title="右ペインのスクロール量 (vh)"
        >
          <input
            type="number"
            :value="settingsStore.urlScrollSettings[1]?.amount ?? 50"
            @input="updateUrlScrollAmount(1, $event)"
            @keydown="preventInvalidInput($event, 1, 100)"
            min="1"
            max="100"
            step="5"
          />
          <span class="unit">vh</span>
        </div>
        <!-- EPUB: px unit -->
        <div
          class="scroll-amount-control"
          v-if="readerStore.fileTypes[1] === 'epub'"
          title="右ペインのスクロール量 (px)"
        >
          <input
            type="number"
            :value="settingsStore.epubScrollSettings[1]?.amount ?? 100"
            @input="updateEpubScrollAmount(1, $event)"
            @keydown="preventInvalidInput($event, 10, 1000)"
            min="10"
            max="1000"
            step="10"
          />
          <span class="unit">px</span>
        </div>
        <!-- Markdown: px unit -->
        <div
          class="scroll-amount-control"
          v-if="readerStore.fileTypes[1] === 'markdown'"
          title="右ペインのスクロール量 (px)"
        >
          <input
            type="number"
            :value="settingsStore.markdownScrollSettings[1]?.amount ?? 100"
            @input="updateMarkdownScrollAmount(1, $event)"
            @keydown="preventInvalidInput($event, 10, 1000)"
            min="10"
            max="1000"
            step="10"
          />
          <span class="unit">px</span>
        </div>
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
            <div class="header-buttons">
              <button class="new-file-btn" @click.stop="openUrlDialog(1)">
                URLを開く
              </button>
              <button class="new-file-btn" @click.stop="triggerFileInput(1)">
                新規ファイル
              </button>
            </div>
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
              <div class="history-item-icon">
                <span v-if="item.fileType === 'pdf'" class="pdf-icon">PDF</span>
                <span v-else-if="item.fileType === 'url'" class="url-icon"
                  >URL</span
                >
                <span
                  v-else-if="
                    item.fileType === 'md' || item.fileType === 'markdown'
                  "
                  class="md-icon"
                  >MD</span
                >
                <span v-else class="epub-icon">EPUB</span>
              </div>
              <div class="history-item-info">
                <div class="history-item-name">{{ item.fileName }}</div>
                <div class="history-item-meta">
                  {{
                    item.fileType === "url"
                      ? "URL"
                      : formatFileSize(item.fileSize)
                  }}
                  ·
                  {{ formatDate(item.openedAt) }}
                </div>
              </div>
              <button
                class="history-item-delete"
                @click.stop="deleteHistoryItem(item.id)"
                title="削除"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="version">v{{ appVersion }}</div>
  </div>

  <button class="toggle-controls" @click="settingsStore.toggleControls">
    <span class="toggle-icon">{{
      settingsStore.showControls ? "▲" : "▼"
    }}</span>
  </button>

  <!-- URL Input Dialogs -->
  <div
    v-if="showUrlDialog[0]"
    class="url-dialog-overlay"
    @click.self="closeUrlDialog(0)"
  >
    <div class="url-dialog url-input-0">
      <h3>URLを開く</h3>
      <input
        type="text"
        v-model="urlInput[0]"
        @keydown="handleUrlKeydown(0, $event)"
        placeholder="https://example.com"
        class="url-input-field"
      />
      <div class="url-dialog-buttons">
        <button @click="closeUrlDialog(0)" class="url-btn-cancel">
          キャンセル
        </button>
        <button @click="handleUrlOpen(0)" class="url-btn-open">開く</button>
      </div>
    </div>
  </div>

  <div
    v-if="showUrlDialog[1]"
    class="url-dialog-overlay"
    @click.self="closeUrlDialog(1)"
  >
    <div class="url-dialog url-input-1">
      <h3>URLを開く</h3>
      <input
        type="text"
        v-model="urlInput[1]"
        @keydown="handleUrlKeydown(1, $event)"
        placeholder="https://example.com"
        class="url-input-field"
      />
      <div class="url-dialog-buttons">
        <button @click="closeUrlDialog(1)" class="url-btn-cancel">
          キャンセル
        </button>
        <button @click="handleUrlOpen(1)" class="url-btn-open">開く</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import { useSettingsStore } from "../../stores/settings";
import { useReaderStore } from "../../stores/reader";
import { useFileHistory } from "../../composables/useFileHistory";

const settingsStore = useSettingsStore();
const readerStore = useReaderStore();
const {
  leftHistory,
  rightHistory,
  init,
  getFileById,
  deleteFromHistory,
  formatFileSize,
  formatDate,
} = useFileHistory();

const appVersion = window.appVersion || "2.0.0";
const acceptTypes = ".epub,.pdf,.md,.markdown,.txt";

// スクロール同期が可能かどうか（2つのファイルが開いている時のみ）
const canSync = computed(() => {
  return readerStore.fileTypes[0] !== null && readerStore.fileTypes[1] !== null;
});

// Aaボタンが有効かどうか（両方がURLモードの場合は無効）
const canApplySettings = computed(() => {
  const type0 = readerStore.fileTypes[0];
  const type1 = readerStore.fileTypes[1];
  // 少なくとも1つのペインがEPUB/Markdownの場合は有効
  // 両方がURL/PDF/nullの場合は無効
  const hasApplicableType = (type0 === 'epub' || type0 === 'markdown') ||
                            (type1 === 'epub' || type1 === 'markdown');
  return hasApplicableType;
});

// ショートカットの表示文字列を取得
const syncShortcutLabel = computed(() => {
  const shortcut = settingsStore.syncModeShortcut;
  if (shortcut === 'none') return '';

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const option = settingsStore.shortcutOptions.find(opt => opt.value === shortcut);
  if (!option) return '';

  return isMac ? option.macLabel : option.label;
});

// スクロール同期ボタンのツールチップ
const syncButtonTitle = computed(() => {
  if (!canSync.value) {
    return '2つのファイルを開いてください';
  }
  const shortcutHint = syncShortcutLabel.value ? ` (${syncShortcutLabel.value})` : '';
  return `スクロール同期${shortcutHint}`;
});

const emit = defineEmits([
  "file-select",
  "history-select",
  "open-settings",
  "url-open",
]);

const showDropdown = ref([false, false]);
const showUrlDialog = ref([false, false]);
const urlInput = ref(["", ""]);
const leftFileInput = ref(null);
const rightFileInput = ref(null);
const leftButtonWrapper = ref(null);
const rightButtonWrapper = ref(null);

// Initialize history on mount
onMounted(async () => {
  await init();
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});

// Toggle dropdown
function toggleDropdown(paneIndex) {
  // Close other dropdown
  showDropdown.value[1 - paneIndex] = false;
  // Toggle this dropdown
  showDropdown.value[paneIndex] = !showDropdown.value[paneIndex];
}

// Close dropdowns when clicking outside
function handleClickOutside(event) {
  if (
    leftButtonWrapper.value &&
    !leftButtonWrapper.value.contains(event.target)
  ) {
    showDropdown.value[0] = false;
  }
  if (
    rightButtonWrapper.value &&
    !rightButtonWrapper.value.contains(event.target)
  ) {
    showDropdown.value[1] = false;
  }
}

// Trigger file input
async function triggerFileInput(paneIndex) {
  showDropdown.value[paneIndex] = false;
  // Wait for DOM to update before triggering file input
  await nextTick();
  if (paneIndex === 0) {
    leftFileInput.value?.click();
  } else {
    rightFileInput.value?.click();
  }
}

// Open URL dialog
function openUrlDialog(paneIndex) {
  showDropdown.value[paneIndex] = false;
  showUrlDialog.value[paneIndex] = true;
  urlInput.value[paneIndex] = "";
  nextTick(() => {
    const input = document.querySelector(`.url-input-${paneIndex} input`);
    input?.focus();
  });
}

// Close URL dialog
function closeUrlDialog(paneIndex) {
  showUrlDialog.value[paneIndex] = false;
  urlInput.value[paneIndex] = "";
}

// Handle URL open
function handleUrlOpen(paneIndex) {
  const url = urlInput.value[paneIndex].trim();
  if (url) {
    emit("url-open", paneIndex, url);
    closeUrlDialog(paneIndex);
  }
}

// Handle URL input keydown
function handleUrlKeydown(paneIndex, event) {
  if (event.key === "Enter") {
    handleUrlOpen(paneIndex);
  } else if (event.key === "Escape") {
    closeUrlDialog(paneIndex);
  }
}

// Handle file change from input
function handleFileChange(paneIndex, event) {
  emit("file-select", paneIndex, event);
}

// Select file from history
async function selectFromHistory(paneIndex, fileId) {
  showDropdown.value[paneIndex] = false;
  try {
    const file = await getFileById(fileId);
    if (file) {
      emit("history-select", paneIndex, file);
    }
  } catch (error) {
    console.error("Failed to load file from history:", error);
  }
}

// Delete history item
async function deleteHistoryItem(id) {
  try {
    await deleteFromHistory(id);
  } catch (error) {
    console.error("Failed to delete history item:", error);
  }
}

// Prevent invalid input (exceeding min/max)
function preventInvalidInput(event, min, max) {
  // Allow: backspace, delete, tab, escape, enter, arrow keys, home, end
  const allowedKeys = [
    "Backspace",
    "Delete",
    "Tab",
    "Escape",
    "Enter",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
  ];

  if (allowedKeys.includes(event.key)) {
    return;
  }

  // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
  if (event.ctrlKey || event.metaKey) {
    return;
  }

  // Only allow digits
  if (!/^\d$/.test(event.key)) {
    event.preventDefault();
    return;
  }

  // Get current input value
  const input = event.target;
  const currentValue = input.value || "";
  const selectionStart = input.selectionStart || 0;
  const selectionEnd = input.selectionEnd || 0;

  // Calculate what the new value would be
  const beforeSelection = currentValue.substring(0, selectionStart);
  const afterSelection = currentValue.substring(selectionEnd);
  const newValue = beforeSelection + event.key + afterSelection;

  // Check if the new value would be valid
  const numValue = parseInt(newValue, 10);
  if (!isNaN(numValue)) {
    // If the new value exceeds max, prevent input
    // Also check if the string length suggests it will exceed max
    if (
      numValue > max ||
      (newValue.length >= max.toString().length && parseInt(newValue, 10) > max)
    ) {
      event.preventDefault();
    }
  } else if (newValue !== "" && newValue !== "-") {
    // If it's not a valid number (and not empty or just a minus sign), prevent
    event.preventDefault();
  }
}

// Update URL scroll amount (vh unit, 1-100)
function updateUrlScrollAmount(paneIndex, event) {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value)) {
    const clampedValue = Math.max(1, Math.min(100, value));
    settingsStore.setUrlScrollSettings(paneIndex, clampedValue, 'vh');
    if (value !== clampedValue) {
      event.target.value = clampedValue;
    }
  }
}

// Update EPUB scroll amount (px unit, 10-1000)
function updateEpubScrollAmount(paneIndex, event) {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value)) {
    const clampedValue = Math.max(10, Math.min(1000, value));
    settingsStore.setEpubScrollSettings(paneIndex, clampedValue, 'px');
    if (value !== clampedValue) {
      event.target.value = clampedValue;
    }
  }
}

// Update Markdown scroll amount (px unit, 10-1000)
function updateMarkdownScrollAmount(paneIndex, event) {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value)) {
    const clampedValue = Math.max(10, Math.min(1000, value));
    settingsStore.setMarkdownScrollSettings(paneIndex, clampedValue, 'px');
    if (value !== clampedValue) {
      event.target.value = clampedValue;
    }
  }
}

// Update PDF scroll amount (page unit, 1-100)
function updatePdfScrollAmount(paneIndex, event) {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value)) {
    const clampedValue = Math.max(1, Math.min(100, value));
    settingsStore.setPdfScrollSettings(paneIndex, clampedValue, 'page');
    if (value !== clampedValue) {
      event.target.value = clampedValue;
    }
  }
}

// Toggle progress bar
function toggleProgressBar(paneIndex) {
  settingsStore.setShowProgressBar(
    paneIndex,
    !settingsStore.showProgressBar[paneIndex]
  );
}

// Handle sync toggle
function handleSyncToggle() {
  if (canSync.value) {
    settingsStore.toggleSyncMode();
  }
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

.sync-btn:hover:not(.disabled) {
  background: var(--bg-hover);
}

.sync-btn.active {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.sync-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--bg-tertiary);
  color: var(--text-tertiary);
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

.settings-btn:hover:not(.disabled) {
  background: var(--bg-hover);
  border-color: var(--accent-color);
}

.settings-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--bg-tertiary);
  color: var(--text-tertiary);
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

.pane-settings {
  display: flex;
  gap: 0.25rem;
}

.pane-settings.right {
  margin-left: auto;
}

.scroll-amount-control {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.progress-toggle {
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
  line-height: 1;
}

.progress-toggle:hover {
  background: var(--bg-hover);
  border-color: var(--accent-color);
}

.progress-toggle.active {
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: white;
}

.scroll-amount-control label {
  font-size: 0.9rem;
  color: var(--text-secondary);
  cursor: default;
}

.scroll-amount-control .unit {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  white-space: nowrap;
  margin-left: 0.15rem;
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

.scroll-amount-control input[type="number"] {
  -moz-appearance: textfield;
}

.scroll-amount-control.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.scroll-amount-control.disabled input {
  cursor: not-allowed;
  background: var(--bg-hover);
}

.scroll-amount-control.disabled label {
  cursor: not-allowed;
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

.header-buttons {
  display: flex;
  gap: 0.5rem;
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
  display: flex;
  align-items: center;
  justify-content: center;
}

.pdf-icon {
  display: inline-block;
  background: #dc2626;
  color: white;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.2em 0.35em;
  border-radius: 3px;
  line-height: 1;
  letter-spacing: 0.05em;
  font-family: system-ui, -apple-system, sans-serif;
}

.pdf-icon-label {
  display: inline-block;
  background: #dc2626;
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.25em 0.4em;
  border-radius: 3px;
  line-height: 1;
  letter-spacing: 0.05em;
  font-family: system-ui, -apple-system, sans-serif;
}

.epub-icon {
  display: inline-block;
  background: #16a34a;
  color: white;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.2em 0.35em;
  border-radius: 3px;
  line-height: 1;
  letter-spacing: 0.05em;
  font-family: system-ui, -apple-system, sans-serif;
}

.epub-icon-label {
  display: inline-block;
  background: #16a34a;
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.25em 0.4em;
  border-radius: 3px;
  line-height: 1;
  letter-spacing: 0.05em;
  font-family: system-ui, -apple-system, sans-serif;
}

.url-icon {
  display: inline-block;
  background: #2563eb;
  color: white;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.2em 0.35em;
  border-radius: 3px;
  line-height: 1;
  letter-spacing: 0.05em;
  font-family: system-ui, -apple-system, sans-serif;
}

.url-icon-label {
  display: inline-block;
  background: #2563eb;
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.25em 0.4em;
  border-radius: 3px;
  line-height: 1;
  letter-spacing: 0.05em;
  font-family: system-ui, -apple-system, sans-serif;
}

.md-icon {
  display: inline-block;
  background: #374151;
  color: white;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.2em 0.35em;
  border-radius: 3px;
  line-height: 1;
  letter-spacing: 0.05em;
  font-family: system-ui, -apple-system, sans-serif;
}

.md-icon-label {
  display: inline-block;
  background: #374151;
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.25em 0.4em;
  border-radius: 3px;
  line-height: 1;
  letter-spacing: 0.05em;
  font-family: system-ui, -apple-system, sans-serif;
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

/* URL Dialog Styles */
.url-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.url-dialog {
  background: var(--bg-primary);
  border-radius: 8px;
  padding: 1.5rem;
  min-width: 400px;
  max-width: 90vw;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.url-dialog h3 {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  color: var(--text-primary);
}

.url-input-field {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.9rem;
  margin-bottom: 1rem;
  box-sizing: border-box;
}

.url-input-field:focus {
  outline: none;
  border-color: var(--accent-color);
}

.url-dialog-buttons {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.url-btn-cancel,
.url-btn-open {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid var(--border-color);
}

.url-btn-cancel {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.url-btn-cancel:hover {
  background: var(--bg-hover);
}

.url-btn-open {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.url-btn-open:hover {
  background: var(--accent-hover, var(--accent-color));
  opacity: 0.9;
}
</style>
