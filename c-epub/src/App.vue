<template>
  <div class="app-container" :class="{ 'dark-mode': isDarkMode }">
    <div class="controls">
      <button @click="toggleSyncMode">
        {{ syncMode ? "Disable Sync" : "Enable Sync" }}
      </button>
      <button @click="toggleDarkMode">
        {{ isDarkMode ? "Light Mode" : "Dark Mode" }}
      </button>
      <input type="file" @change="handleFileSelect(0, $event)" accept=".epub" />
      <input type="file" @change="handleFileSelect(1, $event)" accept=".epub" />
    </div>
    <div class="reader-container">
      <div class="reader-wrapper">
        <div class="toc-sidebar left">
          <div class="toc-title">目次</div>
          <div class="toc-content" v-if="toc1.length > 0">
            <div
              v-for="(item, index) in toc1"
              :key="index"
              class="toc-item"
              :style="{ paddingLeft: `${item.level * 10}px` }"
              @click="navigateToLocation(0, item.href)"
            >
              {{ item.label }}
            </div>
          </div>
        </div>
        <div class="reader-content">
          <div
            class="reader-view"
            ref="reader1"
            @scroll="handleScroll(0)"
          ></div>
          <div class="navigation-buttons">
            <button @click="navigatePage(0, 'prev')">Previous</button>
            <button @click="navigatePage(0, 'next')">Next</button>
          </div>
        </div>
      </div>
      <div class="reader-wrapper">
        <div class="reader-content">
          <div
            class="reader-view"
            ref="reader2"
            @scroll="handleScroll(1)"
          ></div>
          <div class="navigation-buttons">
            <button @click="navigatePage(1, 'prev')">Previous</button>
            <button @click="navigatePage(1, 'next')">Next</button>
          </div>
        </div>
        <div class="toc-sidebar right">
          <div class="toc-title">目次</div>
          <div class="toc-content" v-if="toc2.length > 0">
            <div
              v-for="(item, index) in toc2"
              :key="index"
              class="toc-item"
              :style="{ paddingLeft: `${item.level * 10}px` }"
              @click="navigateToLocation(1, item.href)"
            >
              {{ item.label }}
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onUnmounted } from "vue";
import Epub from "epubjs";

const reader1 = ref(null);
const reader2 = ref(null);
const syncMode = ref(false);
const isDarkMode = ref(false);
const errorMessage = ref("");
let book1 = null;
let book2 = null;
let rendition1 = null;
let rendition2 = null;
let isSyncing = false;

const toc1 = ref([]);
const toc2 = ref([]);

const initializeBook = async (book, container, index) => {
  try {
    console.log(`Initializing book ${index}...`);

    // 既存のレンダリングを破棄
    if (index === 0 && rendition1) {
      rendition1.destroy();
    } else if (index === 1 && rendition2) {
      rendition2.destroy();
    }

    // 新しいレンダリングを作成
    const rendition = book.renderTo(container, {
      width: "100%",
      height: "100%",
      spread: "none",
      manager: "default",
      flow: "scrolled",
      snap: false,
    });

    // テーマを適用
    applyTheme(rendition);

    // 最初のページを表示
    await rendition.display();

    // レンダリング後にリサイズをトリガー
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 100);

    console.log(`Book ${index} initialized successfully`);
    return rendition;
  } catch (error) {
    console.error(`Error initializing book ${index}:`, error);
    errorMessage.value = `Error loading book ${index + 1}: ${error.message}`;
    return null;
  }
};

const processToc = (toc) => {
  const result = [];
  const processItem = (item, level = 0) => {
    result.push({
      label: item.label,
      href: item.href,
      level: level,
    });
    if (item.subitems) {
      item.subitems.forEach((subitem) => processItem(subitem, level + 1));
    }
  };
  toc.forEach((item) => processItem(item));
  return result;
};

const handleFileSelect = async (index, event) => {
  const file = event.target.files[0];
  if (!file) {
    console.log(`No file selected for reader ${index}`);
    return;
  }

  try {
    console.log(`Loading file for reader ${index}:`, file.name);
    errorMessage.value = "";

    const reader = new FileReader();

    const fileLoadPromise = new Promise((resolve, reject) => {
      reader.onload = async (e) => {
        try {
          console.log(
            `File loaded successfully for reader ${index}, size:`,
            e.target.result.byteLength
          );
          console.log(`Creating Epub instance for reader ${index}...`);
          const book = Epub(e.target.result);

          await book.ready;
          console.log(`Book ${index} metadata loaded:`, book.metadata);
          console.log(`Book ${index} spine items:`, book.spine.items);

          // 目次を取得して処理
          const toc = await book.navigation;
          if (index === 0) {
            toc1.value = processToc(toc.toc);
          } else {
            toc2.value = processToc(toc.toc);
          }

          if (index === 0) {
            book1 = book;
            rendition1 = await initializeBook(book, reader1.value, index);
          } else {
            book2 = book;
            rendition2 = await initializeBook(book, reader2.value, index);
          }
          resolve();
        } catch (error) {
          console.error(`Error processing book ${index}:`, error);
          errorMessage.value = `Error processing book ${index + 1}: ${
            error.message
          }`;
          reject(error);
        }
      };

      reader.onerror = (error) => {
        console.error(`File reading error for reader ${index}:`, error);
        errorMessage.value = `Error reading file for reader ${index + 1}: ${
          error.message
        }`;
        reject(error);
      };
    });

    reader.readAsArrayBuffer(file);
    await fileLoadPromise;
  } catch (error) {
    console.error(`Error in handleFileSelect for reader ${index}:`, error);
    errorMessage.value = `Error loading file for reader ${index + 1}: ${
      error.message
    }`;
  }
};

const toggleSyncMode = () => {
  syncMode.value = !syncMode.value;
};

const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value;
  if (rendition1) applyTheme(rendition1);
  if (rendition2) applyTheme(rendition2);
};

const applyTheme = (rendition) => {
  if (!rendition) return;

  const theme = isDarkMode.value
    ? {
        body: {
          background: "#1a1a1a !important",
          color: "#e0e0e0 !important",
        },
        "p, div, span": {
          color: "#e0e0e0 !important",
        },
        a: {
          color: "#4a9eff !important",
        },
        "h1, h2, h3, h4, h5, h6": {
          color: "#ffffff !important",
        },
      }
    : {
        body: {
          background: "#ffffff !important",
          color: "#333333 !important",
        },
        "p, div, span": {
          color: "#333333 !important",
        },
        a: {
          color: "#0066cc !important",
        },
        "h1, h2, h3, h4, h5, h6": {
          color: "#000000 !important",
        },
      };

  rendition.themes.register("default", theme);
  rendition.themes.select("default");
};

const handleScroll = (index) => {
  if (!syncMode.value || isSyncing) return;

  isSyncing = true;
  const sourceReader = index === 0 ? reader1.value : reader2.value;
  const targetReader = index === 0 ? reader2.value : reader1.value;

  if (sourceReader && targetReader) {
    const scrollRatio =
      sourceReader.scrollTop /
      (sourceReader.scrollHeight - sourceReader.clientHeight);
    const targetScroll =
      scrollRatio * (targetReader.scrollHeight - targetReader.clientHeight);
    targetReader.scrollTop = targetScroll;
  }

  setTimeout(() => {
    isSyncing = false;
  }, 50);
};

const navigatePage = async (index, direction) => {
  const rendition = index === 0 ? rendition1 : rendition2;
  const otherRendition = index === 0 ? rendition2 : rendition1;
  if (!rendition) return;

  try {
    if (direction === "prev") {
      await rendition.prev();
      if (syncMode.value && otherRendition) {
        await otherRendition.prev();
      }
    } else {
      await rendition.next();
      if (syncMode.value && otherRendition) {
        await otherRendition.next();
      }
    }
  } catch (error) {
    console.error(
      `Error navigating ${direction} page for reader ${index}:`,
      error
    );
    errorMessage.value = `Error navigating ${direction} page for reader ${
      index + 1
    }: ${error.message}`;
  }
};

const navigateToLocation = async (index, href) => {
  const rendition = index === 0 ? rendition1 : rendition2;
  if (!rendition) return;

  try {
    await rendition.display(href);
  } catch (error) {
    console.error(`Error navigating to location for reader ${index}:`, error);
    errorMessage.value = `Error navigating to location for reader ${
      index + 1
    }: ${error.message}`;
  }
};

// リサイズハンドラを追加
onMounted(() => {
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  if (book1) book1.destroy();
  if (book2) book2.destroy();
  if (rendition1) rendition1.destroy();
  if (rendition2) rendition2.destroy();
});

const handleResize = () => {
  if (rendition1) {
    rendition1.resize();
  }
  if (rendition2) {
    rendition2.resize();
  }
};
</script>

<style>
body,
#app {
  margin: 0;
  padding: 0;
  width: 100vw;
  height: 100vh;
}
</style>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  color: #333333;
  transition: background-color 0.3s, color 0.3s;
  overflow: hidden;
  margin: 0;
  padding: 1rem;
  box-sizing: border-box;
}

.app-container.dark-mode {
  background-color: #1a1a1a;
  color: #e0e0e0;
}

.controls {
  padding: 1rem;
  display: flex;
  gap: 1rem;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.dark-mode .controls {
  background: #2d2d2d;
  border-bottom: 1px solid #404040;
}

.controls button {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  background: #4a9eff;
  color: white;
  cursor: pointer;
  transition: background-color 0.3s;
}

.controls button:hover {
  background: #3a8eef;
}

.dark-mode .controls button {
  background: #0066cc;
}

.dark-mode .controls button:hover {
  background: #0055bb;
}

.reader-container {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
  margin: 0;
  padding: 0;
  gap: 1rem;
  width: 100%;
  box-sizing: border-box;
}

.reader-wrapper {
  flex: 1;
  display: flex;
  min-width: 0;
  position: relative;
  margin: 0;
  padding: 0;
  background: #ffffff;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  width: 50%;
  box-sizing: border-box;
}

.dark-mode .reader-wrapper {
  background: #2d2d2d;
}

.reader-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin: 0;
  padding: 0;
  width: calc(100% - 200px);
  box-sizing: border-box;
}

.toc-sidebar {
  width: 200px;
  min-width: 200px;
  max-width: 200px;
  background: #f5f5f5;
  border-right: 1px solid #ddd;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  box-sizing: border-box;
}

.toc-sidebar.right {
  border-right: none;
  border-left: 1px solid #ddd;
}

.dark-mode .toc-sidebar {
  background: #2d2d2d;
  border-color: #404040;
}

.toc-title {
  padding: 0.5rem;
  font-weight: bold;
  border-bottom: 1px solid #ddd;
  text-align: center;
  flex-shrink: 0;
}

.dark-mode .toc-title {
  border-bottom-color: #404040;
}

.toc-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.toc-item {
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  border-radius: 4px;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toc-item:hover {
  background: #e0e0e0;
}

.dark-mode .toc-item:hover {
  background: #404040;
}

.reader-view {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  background-color: #ffffff;
  color: #333333;
  min-height: 0;
  margin: 0;
  width: 100%;
  box-sizing: border-box;
}

.dark-mode .reader-view {
  background-color: #1a1a1a;
  color: #e0e0e0;
}

.navigation-buttons {
  display: flex;
  justify-content: center;
  gap: 1rem;
  padding: 1rem;
  background: #f5f5f5;
  border-top: 1px solid #ddd;
  flex-shrink: 0;
}

.dark-mode .navigation-buttons {
  background: #2d2d2d;
  border-top: 1px solid #404040;
}

.navigation-buttons button {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  background: #4a9eff;
  color: white;
  cursor: pointer;
  transition: background-color 0.3s;
}

.navigation-buttons button:hover {
  background: #3a8eef;
}

.dark-mode .navigation-buttons button {
  background: #0066cc;
}

.dark-mode .navigation-buttons button:hover {
  background: #0055bb;
}

.error-message {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 1rem;
  background-color: #ff4444;
  color: white;
  text-align: center;
  z-index: 1000;
}

/* スクロールバーのスタイル */
.reader-view::-webkit-scrollbar,
.toc-content::-webkit-scrollbar {
  width: 8px;
}

.reader-view::-webkit-scrollbar-track,
.toc-content::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.dark-mode .reader-view::-webkit-scrollbar-track,
.dark-mode .toc-content::-webkit-scrollbar-track {
  background: #2d2d2d;
}

.reader-view::-webkit-scrollbar-thumb,
.toc-content::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

.dark-mode .reader-view::-webkit-scrollbar-thumb,
.dark-mode .toc-content::-webkit-scrollbar-thumb {
  background: #555;
}

.reader-view::-webkit-scrollbar-thumb:hover,
.toc-content::-webkit-scrollbar-thumb:hover {
  background: #666;
}

.dark-mode .reader-view::-webkit-scrollbar-thumb:hover,
.dark-mode .toc-content::-webkit-scrollbar-thumb:hover {
  background: #444;
}

@media (max-width: 1600px) {
  .toc-sidebar {
    width: 180px;
    min-width: 180px;
    max-width: 180px;
  }

  .reader-content {
    width: calc(100% - 180px);
  }
}

@media (max-width: 1400px) {
  .toc-sidebar {
    width: 160px;
    min-width: 160px;
    max-width: 160px;
  }

  .reader-content {
    width: calc(100% - 160px);
  }
}

@media (max-width: 1200px) {
  .toc-sidebar {
    width: 140px;
    min-width: 140px;
    max-width: 140px;
  }

  .reader-content {
    width: calc(100% - 140px);
  }
}

@media (max-width: 1000px) {
  .toc-sidebar {
    width: 120px;
    min-width: 120px;
    max-width: 120px;
  }

  .reader-content {
    width: calc(100% - 120px);
  }
}

@media (max-width: 800px) {
  .reader-wrapper {
    width: 100%;
  }

  .reader-container {
    flex-direction: column;
  }

  .toc-sidebar {
    width: 100%;
    min-width: 100%;
    max-width: 100%;
    border-right: none;
    border-bottom: 1px solid #ddd;
  }

  .toc-sidebar.right {
    border-left: none;
  }

  .reader-content {
    width: 100%;
  }
}
</style>
