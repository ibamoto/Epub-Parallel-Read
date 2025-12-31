<template>
  <div class="reader-pane-container">
    <div class="reader-wrapper" :class="position">
      <!-- TOC Sidebar -->
      <TableOfContents
        v-if="position === 'left'"
        :items="readerStore.tocs[paneIndex]"
        :visible="readerStore.showToc[paneIndex]"
        :position="position"
        :currentLocation="readerStore.currentLocations[paneIndex]"
        @toggle="readerStore.toggleToc(paneIndex)"
        @navigate="handleNavigate"
      />

      <!-- Reader Content -->
      <div
        class="reader-content"
        :class="{ dragover: isDragging }"
        @dragenter.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @dragover.prevent
        @drop.prevent="handleDrop"
      >
        <!-- Loading State -->
        <div v-if="readerStore.isLoading[paneIndex]" class="loading-state">
          <div class="spinner"></div>
          <span>読み込み中...</span>
        </div>

        <!-- Empty State -->
        <div v-else-if="!hasContent" class="empty-state">
          <div class="drop-icon">📚</div>
          <p>ファイルをドラッグ＆ドロップ</p>
          <p class="hint">または上のボタンから選択</p>
          <p class="formats">対応形式: EPUB, PDF</p>
        </div>

        <!-- Reader View -->
        <div
          v-show="hasContent && !readerStore.isLoading[paneIndex]"
          ref="readerView"
          class="reader-view"
          @scroll="handleScroll"
        ></div>

        <!-- Error Message -->
        <div v-if="readerStore.errors[paneIndex]" class="error-message">
          {{ readerStore.errors[paneIndex] }}
        </div>
      </div>

      <!-- TOC Sidebar (Right) -->
      <TableOfContents
        v-if="position === 'right'"
        :items="readerStore.tocs[paneIndex]"
        :visible="readerStore.showToc[paneIndex]"
        :position="position"
        :currentLocation="readerStore.currentLocations[paneIndex]"
        @toggle="readerStore.toggleToc(paneIndex)"
        @navigate="handleNavigate"
      />
    </div>

    <!-- Navigation Buttons -->
    <div class="navigation-group" :class="position">
      <button class="settings-btn" @click="showSettings = true">
        <span>Aa</span>
      </button>
      <button @click="handlePrev">← 前へ</button>
      <button @click="handleNext">次へ →</button>

      <!-- Scroll Controls -->
      <div class="scroll-controls">
        <div class="scroll-mode-toggle">
          <button
            :class="{ active: paneSettings.epubScrollMode === 'page' }"
            @click="updateScrollMode('page')"
            title="ページモード"
          >頁</button>
          <button
            :class="{ active: paneSettings.epubScrollMode === 'continuous' }"
            @click="updateScrollMode('continuous')"
            title="連続モード"
          >続</button>
        </div>
        <div v-if="paneSettings.epubScrollMode === 'continuous'" class="scroll-speed">
          <input
            type="range"
            :value="paneSettings.epubScrollSpeed"
            min="0.5"
            max="3"
            step="0.1"
            @input="updateScrollSpeed($event.target.value)"
            title="スクロール速度"
          />
          <span class="speed-value">{{ paneSettings.epubScrollSpeed.toFixed(1) }}x</span>
        </div>
      </div>

      <span v-if="fileInfo" class="file-info">{{ fileInfo }}</span>
    </div>

    <!-- Settings Panel (uses Teleport, so placement here doesn't affect layout) -->
    <SettingsPanel
      :visible="showSettings"
      :paneIndex="paneIndex"
      @close="showSettings = false"
      @settings-changed="handleSettingsChanged"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useReaderStore } from "../../stores/reader";
import { useSettingsStore } from "../../stores/settings";
import { useEpubReader } from "../../composables/useEpubReader";
import { usePdfReader } from "../../composables/usePdfReader";
import TableOfContents from "../navigation/TableOfContents.vue";
import SettingsPanel from "../settings/SettingsPanel.vue";

const props = defineProps({
  paneIndex: {
    type: Number,
    required: true,
  },
  position: {
    type: String,
    default: "left",
  },
});

const emit = defineEmits(["scroll", "navigate"]);

const readerStore = useReaderStore();
const settingsStore = useSettingsStore();

const readerView = ref(null);
const isDragging = ref(false);
const showSettings = ref(false);

// Initialize readers
const epubReader = useEpubReader(props.paneIndex);
const pdfReader = usePdfReader(props.paneIndex);

// Current active reader
const activeReader = computed(() => {
  const fileType = readerStore.fileTypes[props.paneIndex];
  if (fileType === "epub") return epubReader;
  if (fileType === "pdf") return pdfReader;
  return null;
});

const hasContent = computed(() => {
  return readerStore.books[props.paneIndex] !== null;
});

// Get pane settings for scroll controls
const paneSettings = computed(() => settingsStore.paneSettings[props.paneIndex]);

// Update scroll mode
function updateScrollMode(mode) {
  settingsStore.updatePaneSettings(props.paneIndex, { epubScrollMode: mode });
}

// Update scroll speed
function updateScrollSpeed(speed) {
  settingsStore.updatePaneSettings(props.paneIndex, { epubScrollSpeed: parseFloat(speed) });
}

const fileInfo = computed(() => {
  const name = readerStore.fileNames[props.paneIndex];
  const type = readerStore.fileTypes[props.paneIndex];
  if (!name) return "";

  if (type === "pdf") {
    const current = readerStore.currentPages[props.paneIndex];
    const total = readerStore.totalPages[props.paneIndex];
    return `${name} (${current}/${total})`;
  }

  return name;
});

// Set container ref after mount
onMounted(() => {
  if (readerView.value) {
    epubReader.containerRef.value = readerView.value;
    pdfReader.containerRef.value = readerView.value;

    // Listen for custom epub-wheel events dispatched from foliate-view
    // This enables scroll sync for EPUB files where wheel events are captured internally
    readerView.value.addEventListener('epub-wheel', handleEpubWheel);
  }
});

// Handle wheel events from EPUB viewer for scroll sync
function handleEpubWheel() {
  emit("scroll", props.paneIndex);
}

// Watch for container changes
watch(readerView, (newVal) => {
  if (newVal) {
    epubReader.containerRef.value = newVal;
    pdfReader.containerRef.value = newVal;
  }
});

// Handle file drop
async function handleDrop(event) {
  isDragging.value = false;

  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return;

  const file = files[0];
  await openFile(file);
}

// Open file
async function openFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "epub") {
    await epubReader.openFile(file);
  } else if (extension === "pdf") {
    await pdfReader.openFile(file);
  } else {
    readerStore.setError(
      props.paneIndex,
      "対応していないファイル形式です。EPUB または PDF を選択してください。"
    );
  }
}

// Handle navigation
function handleNavigate(href) {
  activeReader.value?.goTo(href);
}

function handleNext() {
  activeReader.value?.next();
  emit("navigate", props.paneIndex, "next");
}

function handlePrev() {
  activeReader.value?.prev();
  emit("navigate", props.paneIndex, "prev");
}

// Handle scroll
function handleScroll() {
  if (readerStore.fileTypes[props.paneIndex] === "pdf") {
    pdfReader.updateCurrentPage();
  }
  emit("scroll", props.paneIndex);
}

// Handle settings changed
function handleSettingsChanged() {
  if (readerStore.fileTypes[props.paneIndex] === "epub") {
    epubReader.applyTheme();
    epubReader.applySettings();
  }
}

// Expose methods for parent
defineExpose({
  openFile,
  getScrollInfo: () => activeReader.value?.getScrollInfo(),
  setScrollByRatio: (ratio) => activeReader.value?.setScrollByRatio(ratio),
  resize: () => activeReader.value?.resize?.(),
  next: () => activeReader.value?.next?.(),
  prev: () => activeReader.value?.prev?.(),
});

// Cleanup
onUnmounted(() => {
  // Remove epub-wheel event listener
  if (readerView.value) {
    readerView.value.removeEventListener('epub-wheel', handleEpubWheel);
  }
  epubReader.cleanup();
  pdfReader.cleanup();
});
</script>

<style scoped>
.reader-pane-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.reader-wrapper {
  flex: 1;
  display: flex;
  min-width: 0;
  min-height: 0;
  position: relative;
  background: var(--bg-primary);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.reader-wrapper.left {
  flex-direction: row;
}

.reader-wrapper.right {
  flex-direction: row;
}

.reader-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
  overflow: hidden;
}

.reader-content.dragover::after {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--accent-light);
  border: 2px dashed var(--accent-color);
  border-radius: 8px;
  z-index: 10;
  pointer-events: none;
}

.reader-view {
  flex: 1;
  overflow-y: auto;
  background: var(--bg-primary);
  min-height: 0;
}

.loading-state,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  gap: 0.75rem;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.drop-icon {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}

.empty-state p {
  margin: 0;
  font-size: 0.95rem;
}

.empty-state .hint {
  font-size: 0.85rem;
  color: var(--text-tertiary);
}

.empty-state .formats {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin-top: 0.5rem;
}

.error-message {
  padding: 1rem;
  background: #fee2e2;
  color: #dc2626;
  text-align: center;
  font-size: 0.9rem;
}

.navigation-group {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.75rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.navigation-group.left {
  border-right: 1px solid var(--border-color);
}

.navigation-group.right {
  justify-content: flex-end;
}

.navigation-group button {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.15s;
}

.navigation-group button:hover {
  background: var(--bg-hover);
  border-color: var(--accent-color);
}

.settings-btn {
  font-weight: 600;
}

.file-info {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--text-tertiary);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Scroll Controls */
.scroll-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: 0.5rem;
  padding-left: 0.5rem;
  border-left: 1px solid var(--border-color);
}

.scroll-mode-toggle {
  display: flex;
}

.scroll-mode-toggle button {
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.15s;
}

.scroll-mode-toggle button:first-child {
  border-radius: 4px 0 0 4px;
}

.scroll-mode-toggle button:last-child {
  border-radius: 0 4px 4px 0;
  border-left: none;
}

.scroll-mode-toggle button:hover {
  background: var(--bg-hover);
}

.scroll-mode-toggle button.active {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.scroll-speed {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.scroll-speed input[type="range"] {
  width: 60px;
  height: 4px;
  -webkit-appearance: none;
  background: var(--border-color);
  border-radius: 2px;
  outline: none;
}

.scroll-speed input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: var(--accent-color);
  border-radius: 50%;
  cursor: pointer;
}

.speed-value {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  min-width: 28px;
  font-family: monospace;
}

/* PDF specific styles */
:deep(.pdf-page) {
  display: block;
  margin: 0 auto 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* foliate-js EPUB viewer styles */
:deep(.foliate-container-0),
:deep(.foliate-container-1) {
  width: 100%;
  height: 100%;
}

:deep(foliate-view) {
  display: block;
  width: 100%;
  height: 100%;
}

/* Scrollbar styles */
.reader-view::-webkit-scrollbar {
  width: 6px;
}

.reader-view::-webkit-scrollbar-track {
  background: transparent;
}

.reader-view::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.reader-view::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}
</style>
