<template>
  <div class="app-container" :class="{ 'dark-mode': isDarkMode }">
    <div class="version">v1.0.1</div>
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
            <button class="settings-button" @click="toggleSettingsPanel(0)">
              <span class="settings-icon">⚙️</span>
              <span class="settings-text">フォント・レイアウト</span>
            </button>
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
            <button class="settings-button" @click="toggleSettingsPanel(1)">
              <span class="settings-icon">⚙️</span>
              <span class="settings-text">フォント・レイアウト</span>
            </button>
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

    <!-- 設定パネル -->
    <div
      v-if="showSettingsPanel !== null"
      class="settings-panel-overlay"
      @click="closeSettingsPanel"
    >
      <div class="settings-panel" @click.stop>
        <div class="settings-header">
          <h3>フォント・レイアウト設定</h3>
          <button class="close-button" @click="closeSettingsPanel">×</button>
        </div>
        <div class="settings-content">
          <div class="settings-section">
            <h4>フォント</h4>
            <div class="setting-item">
              <label>フォントファミリー</label>
              <select
                v-model="settings[showSettingsPanel].fontFamily"
                @change="applySettings"
              >
                <option value="serif">明朝体</option>
                <option value="sans-serif">ゴシック体</option>
                <option value="monospace">等幅フォント</option>
              </select>
            </div>
            <div class="setting-item">
              <label>フォントサイズ</label>
              <input
                type="range"
                v-model="settings[showSettingsPanel].fontSize"
                min="12"
                max="24"
                step="1"
                @input="applySettings"
              />
              <span>{{ settings[showSettingsPanel].fontSize }}px</span>
            </div>
            <div class="setting-item">
              <label>行間</label>
              <input
                type="range"
                v-model="settings[showSettingsPanel].lineHeight"
                min="1"
                max="2"
                step="0.1"
                @input="applySettings"
              />
              <span>{{ settings[showSettingsPanel].lineHeight }}</span>
            </div>
          </div>
          <div class="settings-section">
            <h4>レイアウト</h4>
            <div class="setting-item">
              <label>余白</label>
              <input
                type="range"
                v-model="settings[showSettingsPanel].margin"
                min="0"
                max="50"
                step="5"
                @input="applySettings"
              />
              <span>{{ settings[showSettingsPanel].margin }}px</span>
            </div>
            <div class="setting-item">
              <label>テキストの配置</label>
              <select
                v-model="settings[showSettingsPanel].textAlign"
                @change="applySettings"
              >
                <option value="left">左揃え</option>
                <option value="justify">両端揃え</option>
                <option value="center">中央揃え</option>
              </select>
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

// 設定関連の状態
const showSettingsPanel = ref(null);
const settings = ref([
  {
    fontFamily: "serif",
    fontSize: 16,
    lineHeight: 1.5,
    margin: 20,
    textAlign: "left",
  },
  {
    fontFamily: "serif",
    fontSize: 16,
    lineHeight: 1.5,
    margin: 20,
    textAlign: "left",
  },
]);

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
      allowScriptedContent: true,
      allowPopups: true,
      allowSameOrigin: true,
    });

    // テーマを適用
    applyTheme(rendition);

    // 最初のページを表示
    await rendition.display();

    // レンダリング後にリサイズをトリガー
    setTimeout(() => {
      rendition.resize();
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

// 前回の状態を保存する関数
const saveState = () => {
  const state = {
    file1: book1?.key,
    file2: book2?.key,
    position1: rendition1?.location?.start?.cfi,
    position2: rendition2?.location?.start?.cfi,
    syncMode: syncMode.value,
    darkMode: isDarkMode.value,
    settings: settings.value,
  };
  localStorage.setItem("epubReaderState", JSON.stringify(state));
};

// スクロール位置を保存
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

  // スクロール時に状態を保存
  saveState();

  setTimeout(() => {
    isSyncing = false;
  }, 50);
};

// ページ移動時に状態を保存
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
    saveState();
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

// 目次から移動時に状態を保存
const navigateToLocation = async (index, href) => {
  const rendition = index === 0 ? rendition1 : rendition2;
  if (!rendition) return;

  try {
    await rendition.display(href);
    saveState();
  } catch (error) {
    console.error(`Error navigating to location for reader ${index}:`, error);
    errorMessage.value = `Error navigating to location for reader ${
      index + 1
    }: ${error.message}`;
  }
};

// アプリ起動時に前回の状態を復元
onMounted(async () => {
  const savedState = localStorage.getItem("epubReaderState");
  if (savedState) {
    const state = JSON.parse(savedState);
    syncMode.value = state.syncMode;
    isDarkMode.value = state.darkMode;
    if (state.settings) {
      settings.value = state.settings;
    }
  }
});

// 設定の適用
const applySettings = () => {
  if (showSettingsPanel.value === null) return;

  const currentSettings = settings.value[showSettingsPanel.value];
  const rendition = showSettingsPanel.value === 0 ? rendition1 : rendition2;

  if (rendition) {
    const theme = {
      body: {
        "font-family": currentSettings.fontFamily,
        "font-size": `${currentSettings.fontSize}px`,
        "line-height": currentSettings.lineHeight,
        "text-align": currentSettings.textAlign,
      },
      "body > *": {
        "margin-left": `${currentSettings.margin}px`,
        "margin-right": `${currentSettings.margin}px`,
      },
      "body > p": {
        "margin-top": `${currentSettings.margin}px`,
        "margin-bottom": `${currentSettings.margin}px`,
      },
    };

    rendition.themes.register("custom", theme);
    rendition.themes.select("custom");

    // 設定を保存
    saveState();
  }
};

// 設定を初期化して適用する関数
const initializeAndApplySettings = (index) => {
  const rendition = index === 0 ? rendition1 : rendition2;
  if (!rendition) return;

  // 保存された設定を取得
  const savedState = localStorage.getItem("epubReaderState");
  if (savedState) {
    const state = JSON.parse(savedState);
    if (state.settings && state.settings[index]) {
      // 設定を初期化
      settings.value[index] = {
        fontFamily: state.settings[index].fontFamily || "serif",
        fontSize: state.settings[index].fontSize || 16,
        lineHeight: state.settings[index].lineHeight || 1.5,
        margin: state.settings[index].margin || 20,
        textAlign: state.settings[index].textAlign || "left",
      };

      // 設定を適用
      const theme = {
        body: {
          "font-family": settings.value[index].fontFamily,
          "font-size": `${settings.value[index].fontSize}px`,
          "line-height": settings.value[index].lineHeight,
          "text-align": settings.value[index].textAlign,
        },
        "body > *": {
          "margin-left": `${settings.value[index].margin}px`,
          "margin-right": `${settings.value[index].margin}px`,
        },
        "body > p": {
          "margin-top": `${settings.value[index].margin}px`,
          "margin-bottom": `${settings.value[index].margin}px`,
        },
      };

      rendition.themes.register("custom", theme);
      rendition.themes.select("custom");
    }
  }
};

// ファイル選択時に前回の位置を復元
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

          // 前回の位置を復元
          const savedState = localStorage.getItem("epubReaderState");
          if (savedState) {
            const state = JSON.parse(savedState);
            const savedPosition =
              index === 0 ? state.position1 : state.position2;
            if (savedPosition) {
              const rendition = index === 0 ? rendition1 : rendition2;
              await rendition.display(savedPosition);
            }
          }

          // 設定を初期化して適用
          initializeAndApplySettings(index);

          // レンダリング後にリサイズをトリガー
          setTimeout(() => {
            if (index === 0 && rendition1) {
              rendition1.resize();
            } else if (index === 1 && rendition2) {
              rendition2.resize();
            }
          }, 200);

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

// 設定パネルの表示/非表示
const toggleSettingsPanel = (index) => {
  showSettingsPanel.value = showSettingsPanel.value === index ? null : index;
};

const closeSettingsPanel = () => {
  showSettingsPanel.value = null;
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

.version {
  position: fixed;
  top: 0.5rem;
  right: 0.5rem;
  font-size: 0.8rem;
  color: #666;
  z-index: 1000;
}

.dark-mode .version {
  color: #999;
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
  position: relative;
}

.reader-container::after {
  content: "";
  position: absolute;
  top: 0;
  left: 50%;
  height: 100%;
  width: 1px;
  background-color: #ccc;
  z-index: 1;
}

.dark-mode .reader-container::after {
  background-color: #404040;
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

.settings-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  background: #4a9eff;
  color: white;
  cursor: pointer;
  transition: background-color 0.3s;
}

.settings-button:hover {
  background: #3a8eef;
}

.settings-icon {
  font-size: 1rem;
}

.settings-text {
  font-size: 0.9rem;
}

.dark-mode .settings-button {
  background: #0066cc;
}

.dark-mode .settings-button:hover {
  background: #0055bb;
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

/* 設定パネルのスタイル */
.settings-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.settings-panel {
  background: #ffffff;
  border-radius: 8px;
  width: 400px;
  max-width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.dark-mode .settings-panel {
  background: #2d2d2d;
  color: #e0e0e0;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #ddd;
}

.dark-mode .settings-header {
  border-bottom-color: #404040;
}

.settings-header h3 {
  margin: 0;
  font-size: 1.2rem;
}

.close-button {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #666;
}

.dark-mode .close-button {
  color: #999;
}

.settings-content {
  padding: 1rem;
}

.settings-section {
  margin-bottom: 1.5rem;
}

.settings-section h4 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
}

.setting-item {
  display: flex;
  align-items: center;
  margin-bottom: 1rem;
  gap: 1rem;
}

.setting-item label {
  min-width: 100px;
}

.setting-item select,
.setting-item input[type="range"] {
  flex: 1;
}

.setting-item span {
  min-width: 40px;
  text-align: right;
}

/* スクロールバーのスタイル */
.settings-panel::-webkit-scrollbar {
  width: 8px;
}

.settings-panel::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.dark-mode .settings-panel::-webkit-scrollbar-track {
  background: #2d2d2d;
}

.settings-panel::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

.dark-mode .settings-panel::-webkit-scrollbar-thumb {
  background: #555;
}

.settings-panel::-webkit-scrollbar-thumb:hover {
  background: #666;
}

.dark-mode .settings-panel::-webkit-scrollbar-thumb:hover {
  background: #444;
}
</style>
