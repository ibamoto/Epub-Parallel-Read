<template>
  <div class="reader-pane-container" :class="{ 'url-mode': isUrlMode }">
    <div class="reader-wrapper" :class="[position, { 'url-mode': isUrlMode }]">
      <!-- TOC Sidebar (hidden in URL mode) -->
      <TableOfContents
        v-if="!isUrlMode"
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
        :class="{ dragover: isDragging, 'url-mode': isUrlMode }"
        :style="isUrlMode ? { overflow: 'auto' } : null"
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
          <p class="formats">対応形式: EPUB, PDF, Markdown, URL</p>
        </div>

        <!-- Reader View -->
        <div
          v-show="hasContent && !readerStore.isLoading[paneIndex]"
          ref="readerView"
          class="reader-view"
          :class="{ 'url-mode': isUrlMode }"
          :style="isUrlMode ? { overflow: 'auto' } : null"
        ></div>

        <!-- Progress Bar (clickable for navigation) -->
        <div v-if="showProgress" class="progress-bar-container">
          <div
            class="progress-bar"
            @click="handleProgressClick"
            ref="progressBar"
          >
            <div
              class="progress-fill"
              :style="{ width: progressPercent + '%' }"
            ></div>
          </div>
          <span class="progress-text">{{ Math.round(progressPercent) }}%</span>
        </div>

        <!-- Error Message -->
        <div v-if="readerStore.errors[paneIndex]" class="error-message">
          {{ readerStore.errors[paneIndex] }}
        </div>
      </div>
    </div>

    <!-- Navigation Buttons (hidden when unified navigation is shown) -->
    <div
      v-if="!props.hideNavigation"
      class="navigation-group"
      :class="[position, { 'url-mode': isUrlMode }]"
    >
      <button @click.stop="handlePrev" type="button">
        <span v-if="isUrlMode">↑ 上</span>
        <span v-else>← 前へ</span>
      </button>
      <button @click.stop="handleNext" type="button">
        <span v-if="isUrlMode">↓ 下</span>
        <span v-else>次へ →</span>
      </button>

      <!-- Font size controls (URL mode only) -->
      <div v-if="isUrlMode" class="font-size-controls">
        <button
          @click="decreaseFontSize"
          class="font-size-btn"
          title="文字サイズを小さく"
        >
          −
        </button>
        <span class="font-size-display">{{ urlFontSize }}%</span>
        <button
          @click="increaseFontSize"
          class="font-size-btn"
          title="文字サイズを大きく"
        >
          ＋
        </button>
      </div>

      <button
        v-if="hasContent"
        class="progress-toggle"
        :class="{ active: settingsStore.showProgressBar[paneIndex] }"
        @click="toggleProgressBar"
        :title="`${position === 'left' ? '左' : '右'}ペインのプログレスバー`"
      >
        <span>━</span>
      </button>

      <span v-if="fileInfo" class="file-info">{{ fileInfo }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useReaderStore } from "../../stores/reader";
import { useSettingsStore } from "../../stores/settings";
import { useEpubReader } from "../../composables/useEpubReader";
import { usePdfReader } from "../../composables/usePdfReader";
import { useMarkdownReader } from "../../composables/useMarkdownReader";
import { useWebReader } from "../../composables/useWebReader";
import TableOfContents from "../navigation/TableOfContents.vue";

const props = defineProps({
  paneIndex: {
    type: Number,
    required: true,
  },
  position: {
    type: String,
    default: "left",
  },
  hideNavigation: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["navigate"]);

const readerStore = useReaderStore();
const settingsStore = useSettingsStore();

const readerView = ref(null);
const progressBar = ref(null);
const isDragging = ref(false);
const scrollProgress = ref(0);

// Handle scroll - update progress only (scroll sync is handled by wheel events)
function handleScroll() {
  updateScrollProgress();
}

// Update scroll progress for EPUB, Markdown, and URL
function updateScrollProgress() {
  const fileType = readerStore.fileTypes[props.paneIndex];
  let scrollInfo = null;

  if (fileType === "epub") {
    scrollInfo = epubReader.getScrollInfo?.();
  } else if (fileType === "markdown") {
    scrollInfo = markdownReader.getScrollInfo?.();
  } else if (fileType === "url") {
    scrollInfo = webReader.getScrollInfo?.();
  }

  if (scrollInfo && typeof scrollInfo.scrollRatio === "number") {
    scrollProgress.value = scrollInfo.scrollRatio;
  }
}

// Initialize readers with scroll callback
const epubReader = useEpubReader(props.paneIndex, handleScroll);
const pdfReader = usePdfReader(props.paneIndex);
const markdownReader = useMarkdownReader(props.paneIndex);
const webReader = useWebReader(props.paneIndex);

// Current active reader
const activeReader = computed(() => {
  const fileType = readerStore.fileTypes[props.paneIndex];
  if (fileType === "epub") return epubReader;
  if (fileType === "pdf") return pdfReader;
  if (fileType === "markdown") return markdownReader;
  if (fileType === "url") return webReader;
  return null;
});

const hasContent = computed(() => {
  return readerStore.books[props.paneIndex] !== null;
});

const isEpub = computed(() => {
  return readerStore.fileTypes[props.paneIndex] === "epub";
});

const isUrlMode = computed(() => {
  return readerStore.fileTypes[props.paneIndex] === "url";
});

const urlFontSize = computed(() => {
  return settingsStore.urlFontSizes[props.paneIndex] || 100;
});

// Handle click on progress bar to navigate to position
function handleProgressClick(event) {
  if (!progressBar.value) return;

  const rect = progressBar.value.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, clickX / rect.width));

  // Navigate to the clicked position
  const type = readerStore.fileTypes[props.paneIndex];
  if (type === "epub") {
    epubReader.setScrollByRatio(ratio);
    scrollProgress.value = ratio;
  } else if (type === "pdf") {
    const targetPage = Math.round(ratio * (pdfReader.totalPages.value - 1)) + 1;
    pdfReader.goToPage(targetPage);
  } else if (type === "markdown") {
    markdownReader.setScrollByRatio(ratio);
    scrollProgress.value = ratio;
  } else if (type === "url") {
    webReader.setScrollByRatio(ratio);
    const scrollInfo = webReader.getScrollInfo?.();
    if (scrollInfo && typeof scrollInfo.scrollRatio === "number") {
      scrollProgress.value = scrollInfo.scrollRatio;
    }
  }
}

const fileInfo = computed(() => {
  const name = readerStore.fileNames[props.paneIndex];
  const type = readerStore.fileTypes[props.paneIndex];
  if (!name) return "";

  if (type === "pdf") {
    // Use pdfReader's local reactive refs for reliable updates
    const current = pdfReader.currentPage.value;
    const total = pdfReader.totalPages.value;
    return `${name} (${current}/${total})`;
  }

  return name;
});

// Progress bar percentage
const progressPercent = computed(() => {
  const type = readerStore.fileTypes[props.paneIndex];
  if (type === "pdf") {
    // Use pdfReader's local reactive refs for reliable updates
    const current = pdfReader.currentPage.value;
    const total = pdfReader.totalPages.value;
    if (total <= 1) return 100;
    return ((current - 1) / (total - 1)) * 100;
  }
  // For EPUB, Markdown, and URL, use scroll progress
  if (type === "epub" || type === "markdown" || type === "url") {
    const scrollInfo = activeReader.value?.getScrollInfo?.();
    if (scrollInfo && typeof scrollInfo.scrollRatio === "number") {
      return scrollInfo.scrollRatio * 100;
    }
    return scrollProgress.value * 100;
  }
  return 0;
});

// Whether to show progress bar
const showProgress = computed(() => {
  return settingsStore.showProgressBar[props.paneIndex] && hasContent.value;
});

// Set container ref after mount
onMounted(() => {
  if (readerView.value) {
    epubReader.containerRef.value = readerView.value;
    pdfReader.containerRef.value = readerView.value;
    markdownReader.containerRef.value = readerView.value;
    webReader.containerRef.value = readerView.value;
  }

  // Set up scroll callback for progress update only (scroll sync is handled by wheel events)
  epubReader.setOnScroll(() => {
    updateScrollProgress();
  });

  // Set up scroll listener for markdown and URL
  if (readerView.value) {
    const handleScroll = () => {
      updateScrollProgress();
    };
    readerView.value.addEventListener("scroll", handleScroll, {
      passive: true,
    });
  }
});

// Watch for container changes
watch(readerView, (newVal) => {
  if (newVal) {
    epubReader.containerRef.value = newVal;
    pdfReader.containerRef.value = newVal;
    markdownReader.containerRef.value = newVal;
    webReader.containerRef.value = newVal;
  }
});

// Watch for URL mode changes and resize iframe
watch(isUrlMode, (newVal) => {
  if (newVal && webReader && typeof webReader.resize === "function") {
    // Wait for next tick to ensure DOM is updated
    nextTick(() => {
      setTimeout(() => {
        webReader.resize();
      }, 100);
    });
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
  } else if (extension === "md" || extension === "markdown") {
    await markdownReader.openFile(file);
  } else {
    // Try to open as URL if it looks like a URL
    const fileName = file.name.toLowerCase();
    if (
      fileName.includes("url") ||
      fileName.includes("link") ||
      fileName.endsWith(".txt")
    ) {
      // Read as text and try to parse as URL
      try {
        const text = await file.text();
        const trimmedText = text.trim();
        if (
          trimmedText.startsWith("http://") ||
          trimmedText.startsWith("https://") ||
          (trimmedText.includes(".") && !trimmedText.includes(" "))
        ) {
          await webReader.openUrl(trimmedText);
          return;
        }
      } catch (e) {
        // Fall through to error
      }
    }
    readerStore.setError(
      props.paneIndex,
      "対応していないファイル形式です。EPUB、PDF、Markdown、またはURLを選択してください。"
    );
  }
}

// Handle navigation
function handleNavigate(href) {
  activeReader.value?.goTo(href);
  // 目次からのナビゲーションを親に通知（スクロール同期を無効化するため）
  emit("navigate", props.paneIndex, "toc", href);
}

/**
 * 次へボタンのハンドラー
 *
 * 仕様: READER_SPECIFICATIONS.md を参照
 * - ソースペインのnext()を実行
 * - スクロール同期モードが有効な場合、App.vueのhandleNavigateでターゲットペインも同期される
 */
function handleNext() {
  console.log("handleNext called", {
    paneIndex: props.paneIndex,
    fileType: readerStore.fileTypes[props.paneIndex],
    hasActiveReader: !!activeReader.value,
    hasNext: typeof activeReader.value?.next === "function",
  });

  if (activeReader.value && typeof activeReader.value.next === "function") {
    activeReader.value.next();
  } else {
    console.warn(
      "handleNext: activeReader.next is not available",
      activeReader.value
    );
  }

  emit("navigate", props.paneIndex, "next");
}

/**
 * 前へボタンのハンドラー
 *
 * 仕様: READER_SPECIFICATIONS.md を参照
 * - ソースペインのprev()を実行
 * - スクロール同期モードが有効な場合、App.vueのhandleNavigateでターゲットペインも同期される
 */
function handlePrev() {
  console.log("handlePrev called", {
    paneIndex: props.paneIndex,
    fileType: readerStore.fileTypes[props.paneIndex],
    hasActiveReader: !!activeReader.value,
    hasPrev: typeof activeReader.value?.prev === "function",
  });

  if (activeReader.value && typeof activeReader.value.prev === "function") {
    activeReader.value.prev();
  } else {
    console.warn(
      "handlePrev: activeReader.prev is not available",
      activeReader.value
    );
  }

  emit("navigate", props.paneIndex, "prev");
}

// Toggle progress bar
function toggleProgressBar() {
  settingsStore.setShowProgressBar(
    props.paneIndex,
    !settingsStore.showProgressBar[props.paneIndex]
  );
}

// Font size controls for URL mode
function increaseFontSize() {
  if (!isUrlMode.value) return;
  const currentSize = settingsStore.urlFontSizes[props.paneIndex] || 100;
  const newSize = Math.min(200, currentSize + 10);
  settingsStore.setUrlFontSize(props.paneIndex, newSize);
  if (webReader && typeof webReader.applyFontSize === "function") {
    webReader.applyFontSize(newSize);
  } else {
    console.warn("webReader.applyFontSize is not available");
  }
}

function decreaseFontSize() {
  if (!isUrlMode.value) return;
  const currentSize = settingsStore.urlFontSizes[props.paneIndex] || 100;
  const newSize = Math.max(50, currentSize - 10);
  settingsStore.setUrlFontSize(props.paneIndex, newSize);
  if (webReader && typeof webReader.applyFontSize === "function") {
    webReader.applyFontSize(newSize);
  } else {
    console.warn("webReader.applyFontSize is not available");
  }
}

// Open URL
async function openUrl(url) {
  await webReader.openUrl(url);
}

// Expose methods for parent
defineExpose({
  openFile,
  openUrl,
  getScrollInfo: () => activeReader.value?.getScrollInfo(),
  setScrollByRatio: (ratio) => activeReader.value?.setScrollByRatio(ratio),
  resize: () => activeReader.value?.resize?.(),
  next: () => {
    const type = readerStore.fileTypes[props.paneIndex];
    if (type === "epub") epubReader.next?.();
    else if (type === "pdf") pdfReader.next?.();
    else if (type === "markdown") markdownReader.next?.();
    else if (type === "url") webReader.next?.();
  },
  prev: () => {
    const type = readerStore.fileTypes[props.paneIndex];
    if (type === "epub") epubReader.prev?.();
    else if (type === "pdf") pdfReader.prev?.();
    else if (type === "markdown") markdownReader.prev?.();
    else if (type === "url") webReader.prev?.();
  },
  scrollBy: (distance) => {
    const type = readerStore.fileTypes[props.paneIndex];
    if (type === "epub") epubReader.scrollBy?.(distance);
    else if (type === "markdown") markdownReader.scrollBy?.(distance);
    else if (type === "url") webReader.scrollBy?.(distance);
  },
  calculateScrollDistance: () => {
    const type = readerStore.fileTypes[props.paneIndex];
    if (type === "epub") return epubReader.calculateScrollDistance?.();
    else if (type === "markdown") return markdownReader.calculateScrollDistance?.();
    else if (type === "url") return webReader.calculateScrollDistance?.();
    return 100; // default
  },
  pageBy: (pages) => pdfReader.goToPage?.(pdfReader.currentPage.value + pages),
  applySettings: () => {
    const type = readerStore.fileTypes[props.paneIndex];
    if (type === "epub") {
      epubReader.applyTheme();
      epubReader.applySettings();
    } else if (type === "markdown") {
      markdownReader.applySettings();
    }
  },
});

// Cleanup
onUnmounted(() => {
  epubReader.cleanup();
  pdfReader.cleanup();
  markdownReader.cleanup();
  webReader.cleanup();
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

/* URL mode: enforce full height */
.reader-pane-container.url-mode {
  height: 100%;
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

/* URL mode: ensure full width when TOC is hidden */
.reader-wrapper.url-mode {
  width: 100%;
  min-width: 0;
  height: 100%;
}

.reader-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
  overflow: hidden;
}

/* URL mode: ensure full width */
.reader-content.url-mode {
  width: 100%;
  min-width: 0;
  flex: 1 1 auto;
  height: 100%;
  overflow: auto !important;
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

/* URL mode: full size, no scrollbar on container */
.reader-view.url-mode {
  overflow: auto !important;
  width: 100%;
  height: 100%;
  position: relative;
}

/* Ensure iframe inside URL mode is scrollable */
:deep(.web-reader-iframe) {
  width: 100% !important;
  height: 100% !important;
  overflow: auto !important;
  position: absolute;
  inset: 0;
  border: none;
  background: white;
  min-width: 0;
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

/* Progress Bar */
.progress-bar-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--border-color);
  border-radius: 3px;
  overflow: hidden;
  cursor: pointer;
  transition: height 0.15s ease;
}

.progress-bar:hover {
  height: 10px;
}

.progress-fill {
  height: 100%;
  background: var(--accent-color);
  border-radius: 3px;
  transition: width 0.15s ease-out;
}

.progress-text {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  min-width: 3em;
  text-align: right;
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

/* URL mode: button text is changed to ↑ 上 / ↓ 下 */

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

.navigation-group .progress-toggle {
  padding: 0.3rem 0.5rem;
  font-size: 0.9rem;
  line-height: 1;
  color: var(--text-tertiary);
}

.navigation-group .progress-toggle:hover {
  background: var(--bg-hover);
  border-color: var(--accent-color);
}

.navigation-group .progress-toggle.active {
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: white;
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

/* Font size controls for URL mode */
.font-size-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  justify-content: center;
}

.font-size-btn {
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1;
  transition: all 0.15s;
  min-width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.font-size-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent-color);
}

.font-size-display {
  font-size: 0.85rem;
  color: var(--text-secondary);
  min-width: 3em;
  text-align: center;
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
