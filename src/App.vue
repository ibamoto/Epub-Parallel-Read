<template>
  <div class="app-container" :class="{ 'dark-mode': isDarkMode }">
    <link
      href="https://fonts.googleapis.com/css2?family=BIZ+UDGothic:wght@400;700&family=BIZ+UDPMincho&display=swap"
      rel="stylesheet"
    />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:;"
    />
    <div class="controls" :class="{ 'controls-hidden': !showControls }">
      <button @click="toggleDarkMode">
        <span class="mode-icon">{{ isDarkMode ? "☾" : "☀" }}</span>
      </button>
      <button @click="toggleSyncMode">
        {{ syncMode ? "スクロール同期" : "スクロール同期" }}
      </button>
      <input type="file" @change="handleFileSelect(0, $event)" accept=".epub" />
      <input type="file" @change="handleFileSelect(1, $event)" accept=".epub" />
      <div class="version">v{{ appVersion }}</div>
    </div>
    <button class="toggle-controls" @click="toggleControls">
      <span class="toggle-icon">{{ showControls ? "▼" : "▲" }}</span>
      <span class="toggle-text" v-if="showControls">コントロールを隠す</span>
    </button>
    <div class="reader-container">
      <div class="reader-wrapper left">
        <div
          class="toc-sidebar"
          :class="{ 'toc-hidden': !showToc1 }"
          :style="getTocStyle(0)"
        >
          <div class="toc-header">
            <button class="toc-toggle" @click="toggleToc(0)">
              <span class="toggle-icon">{{ showToc1 ? "▶" : "◀" }}</span>
            </button>
            <div class="toc-title">目次</div>
          </div>
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
        </div>
        <button
          v-if="!showToc1"
          class="toc-show-button left"
          @click="toggleToc(0)"
        >
          <span class="toggle-icon">◀</span>
        </button>
      </div>
      <div class="resize-handle" @mousedown="startResize"></div>
      <div class="reader-wrapper right">
        <div class="reader-content">
          <div
            class="reader-view"
            ref="reader2"
            @scroll="handleScroll(1)"
          ></div>
        </div>
        <div
          class="toc-sidebar"
          :class="{ 'toc-hidden': !showToc2 }"
          :style="getTocStyle(1)"
        >
          <div class="toc-header">
            <div class="toc-title">目次</div>
            <button class="toc-toggle" @click="toggleToc(1)">
              <span class="toggle-icon">{{ showToc2 ? "◀" : "▶" }}</span>
            </button>
          </div>
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
        <button
          v-if="!showToc2"
          class="toc-show-button right"
          @click="toggleToc(1)"
        >
          <span class="toggle-icon">▶</span>
        </button>
      </div>
    </div>
    <div class="navigation-buttons">
      <div class="navigation-group left">
        <button class="settings-button" @click="toggleSettingsPanel(0)">
          <span class="settings-icon">Aa</span>
        </button>
        <button @click="navigatePage(0, 'prev')">
          Previous
          <span v-if="syncMode" class="shortcut-key">←</span>
        </button>
        <button @click="navigatePage(0, 'next')">
          Next
          <span v-if="syncMode" class="shortcut-key">→</span>
        </button>
      </div>
      <div class="navigation-group right">
        <button class="settings-button" @click="toggleSettingsPanel(1)">
          <span class="settings-icon">Aa</span>
        </button>
        <button @click="navigatePage(1, 'prev')">
          Previous
          <span v-if="syncMode" class="shortcut-key">←</span>
        </button>
        <button @click="navigatePage(1, 'next')">
          Next
          <span v-if="syncMode" class="shortcut-key">→</span>
        </button>
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
              <label>フォント</label>
              <select
                v-model="settings[showSettingsPanel].fontFamily"
                @change="applySettings"
              >
                <option value="system-ui">システムフォント</option>
                <option value="'BIZ UD Gothic', sans-serif">
                  Webフォント：BIZ UD ゴシック
                </option>
                <option value="'BIZ UD Mincho', serif">
                  Webフォント：BIZ UD 明朝
                </option>
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

const appVersion = window.appVersion || "1.2.1";
const reader1 = ref(null);
const reader2 = ref(null);
const syncMode = ref(false);
const isDarkMode = ref(false);
const showControls = ref(true);
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
    fontFamily: "system-ui",
    fontSize: 16,
    lineHeight: 1.5,
    margin: 20,
    textAlign: "left",
  },
  {
    fontFamily: "system-ui",
    fontSize: 16,
    lineHeight: 1.5,
    margin: 20,
    textAlign: "left",
  },
]);

const showToc1 = ref(true);
const showToc2 = ref(true);

const isResizing = ref(false);
const resizeTimeout = ref(null);

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
      manager: "continuous",
      flow: "scrolled-doc",
      snap: false,
      allowScriptedContent: true,
      allowPopups: true,
      allowSameOrigin: true,
      stylesheet: true,
      injectStyles: true,
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

// マウスホイールイベントのハンドラを追加
const handleWheel = (event) => {
  // イベントの発生元を特定
  const target = event.target;
  const isLeftReader = reader1.value?.contains(target);
  const isRightReader = reader2.value?.contains(target);
  const readerPosition = isLeftReader
    ? "Left"
    : isRightReader
    ? "Right"
    : "Unknown";

  console.group(`🖱️ Wheel Event - ${readerPosition} Reader`);
  console.log("Event Details:", {
    deltaY: Math.round(event.deltaY),
    deltaMode:
      event.deltaMode === 0 ? "pixel" : event.deltaMode === 1 ? "line" : "page",
    deltaX: Math.round(event.deltaX),
    deltaZ: Math.round(event.deltaZ),
    target: target.className || target.id || "Unknown element",
  });
  console.groupEnd();

  // 同期モードが有効な場合のみ処理
  if (!syncMode.value) return;

  // イベントを両方のリーダーに送信
  if (reader1.value && reader2.value) {
    // スクロール量を計算
    const scrollAmount = event.deltaY;

    // 両方のリーダーの現在のスクロール位置を取得
    const leftScrollTop = reader1.value.scrollTop;
    const rightScrollTop = reader2.value.scrollTop;

    // 新しいスクロール位置を計算
    const newLeftScrollTop = leftScrollTop + scrollAmount;
    const newRightScrollTop = rightScrollTop + scrollAmount;

    // スクロール位置を設定
    reader1.value.scrollTop = newLeftScrollTop;
    reader2.value.scrollTop = newRightScrollTop;

    // スクロールイベントを手動で発火
    reader1.value.dispatchEvent(new Event("scroll"));
    reader2.value.dispatchEvent(new Event("scroll"));
  }
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
        "font-family":
          currentSettings.fontFamily === "system-ui"
            ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif'
            : currentSettings.fontFamily,
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

// コンポーネントのマウント時にホイールイベントリスナーを追加
onMounted(() => {
  window.addEventListener("resize", handleResize);
  // パッシブリスナーを使用してパフォーマンスを改善
  window.addEventListener("wheel", handleWheel, { passive: true });
});

// コンポーネントのアンマウント時にイベントリスナーを削除
onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("wheel", handleWheel);
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

const toggleControls = () => {
  showControls.value = !showControls.value;
};

// ホットキーでコントロールを切り替え
const handleKeyDown = (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "h") {
    event.preventDefault();
    toggleControls();
  }

  // スクロール同期モードがオンの時のみ、矢印キーでページ移動
  if (syncMode.value) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      navigatePage(0, "prev");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      navigatePage(0, "next");
    }
  }
};

onMounted(() => {
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("resize", handleResize);
  if (book1) book1.destroy();
  if (book2) book2.destroy();
  if (rendition1) rendition1.destroy();
  if (rendition2) rendition2.destroy();
});

const toggleToc = (index) => {
  if (index === 0) {
    showToc1.value = !showToc1.value;
  } else {
    showToc2.value = !showToc2.value;
  }
  // リサイズをトリガー
  setTimeout(() => {
    if (rendition1) rendition1.resize();
    if (rendition2) rendition2.resize();
  }, 100);
};

const startResize = (e) => {
  if (isResizing.value) return;
  isResizing.value = true;
  e.preventDefault();

  const container = document.querySelector(".reader-container");
  const leftWrapper = document.querySelector(".reader-wrapper.left");
  const rightWrapper = document.querySelector(".reader-wrapper.right");
  const initialX = e.clientX;
  const initialLeftWidth = leftWrapper.offsetWidth;
  const initialRightWidth = rightWrapper.offsetWidth;

  const handleMouseMove = (e) => {
    if (!isResizing.value) return;
    e.preventDefault();

    const delta = e.clientX - initialX;
    const newLeftWidth = Math.max(
      200,
      Math.min(initialLeftWidth + delta, container.offsetWidth - 200)
    );
    const newRightWidth = container.offsetWidth - newLeftWidth - 8;

    leftWrapper.style.flex = "none";
    rightWrapper.style.flex = "none";
    leftWrapper.style.width = `${newLeftWidth}px`;
    rightWrapper.style.width = `${newRightWidth}px`;

    if (resizeTimeout.value) {
      clearTimeout(resizeTimeout.value);
    }
    resizeTimeout.value = setTimeout(() => {
      if (rendition1) rendition1.resize();
      if (rendition2) rendition2.resize();
      resizeTimeout.value = null;
    }, 100);
  };

  const handleMouseUp = (e) => {
    if (!isResizing.value) return;
    e.preventDefault();
    isResizing.value = false;

    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    document.removeEventListener("mouseleave", handleMouseUp);

    if (resizeTimeout.value) {
      clearTimeout(resizeTimeout.value);
    }
    if (rendition1) rendition1.resize();
    if (rendition2) rendition2.resize();
  };

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
  document.addEventListener("mouseleave", handleMouseUp);
};

// コンポーネントのアンマウント時にイベントリスナーをクリーンアップ
onUnmounted(() => {
  isResizing.value = false;
  if (resizeTimeout.value) {
    clearTimeout(resizeTimeout.value);
  }
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
  document.removeEventListener("mouseleave", handleMouseUp);
});

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

// 目次のスタイルを取得する関数
const getTocStyle = (index) => {
  const currentSettings = settings.value[index];
  return {
    "font-family":
      currentSettings.fontFamily === "system-ui"
        ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif'
        : currentSettings.fontFamily,
    "font-size": `${currentSettings.fontSize}px`,
    "line-height": currentSettings.lineHeight,
  };
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

@font-face {
  font-family: "BIZ UD Gothic";
  src: url("https://fonts.googleapis.com/css2?family=BIZ+UDGothic:wght@400;700&display=swap");
}

@font-face {
  font-family: "BIZ UD Mincho";
  src: url("https://fonts.googleapis.com/css2?family=BIZ+UDPMincho&display=swap");
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
  padding: 0.2rem;
  box-sizing: border-box;
}

.app-container.dark-mode {
  background-color: #1a1a1a;
  color: #e0e0e0;
}

.controls {
  padding: 0.5rem;
  display: flex;
  gap: 0.5rem;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
  flex-shrink: 0;
  flex-wrap: wrap;
  transition: all 0.3s ease-in-out;
  transform: translateY(0);
  position: relative;
  height: auto;
  opacity: 1;
  visibility: visible;
  align-items: center;
}

.controls-hidden {
  transform: translateY(-100%);
  height: 0;
  padding: 0;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.dark-mode .controls {
  background: #2d2d2d;
  border-bottom: 1px solid #404040;
}

.controls button {
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: 4px;
  background: #e0e0e0;
  color: #333333;
  cursor: pointer;
  transition: background-color 0.3s;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 32px;
  justify-content: center;
}

.controls button:first-child {
  padding: 0.25rem 0.5rem;
  min-width: 40px;
}

.controls button:hover {
  background: #d0d0d0;
}

.dark-mode .controls button {
  background: #404040;
  color: #e0e0e0;
}

.dark-mode .controls button:hover {
  background: #505050;
}

.controls input[type="file"] {
  padding: 0.25rem 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #ffffff;
  color: #333333;
  cursor: pointer;
  transition: background-color 0.3s, border-color 0.3s;
  font-size: 0.9rem;
}

.dark-mode .controls input[type="file"] {
  background: #2d2d2d;
  color: #e0e0e0;
  border-color: #404040;
}

.controls input[type="file"]:hover {
  background: #f0f0f0;
  border-color: #ccc;
}

.dark-mode .controls input[type="file"]:hover {
  background: #3d3d3d;
  border-color: #505050;
}

.controls input[type="file"]::-webkit-file-upload-button {
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: 4px;
  background: #e0e0e0;
  color: #333333;
  cursor: pointer;
  transition: background-color 0.3s;
  font-size: 0.9rem;
}

.controls input[type="file"]::-webkit-file-upload-button:hover {
  background: #d0d0d0;
}

.dark-mode .controls input[type="file"]::-webkit-file-upload-button {
  background: #404040;
  color: #e0e0e0;
}

.dark-mode .controls input[type="file"]::-webkit-file-upload-button:hover {
  background: #505050;
}

.reader-container {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
  margin: 0;
  padding: 0;
  gap: 0;
  width: 100%;
  box-sizing: border-box;
  position: relative;
  transition: height 0.3s ease-in-out;
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
  transition: none;
}

.reader-wrapper.left {
  flex-direction: row;
}

.reader-wrapper.right {
  flex-direction: row;
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
  transition: width 0.3s ease-in-out;
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
  transition: all 0.3s ease-in-out;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

.controls-hidden .toc-sidebar {
  border-top: 1px solid #ddd;
}

.dark-mode .toc-sidebar {
  background: #2d2d2d;
  border-right: 1px solid #404040;
}

.dark-mode .controls-hidden .toc-sidebar {
  border-top: 1px solid #404040;
}

.reader-wrapper.right .toc-sidebar {
  order: 2;
  border-right: none;
  border-left: 1px solid #ddd;
}

.controls-hidden .reader-wrapper.right .toc-sidebar {
  border-top: 1px solid #ddd;
}

.dark-mode .reader-wrapper.right .toc-sidebar {
  border-left: 1px solid #404040;
}

.dark-mode .controls-hidden .reader-wrapper.right .toc-sidebar {
  border-top: 1px solid #404040;
}

.toc-hidden {
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  border: none !important;
  opacity: 0;
  visibility: hidden;
}

.toc-hidden + .reader-content {
  width: 100% !important;
}

.toc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  border-bottom: 1px solid #ddd;
  flex-shrink: 0;
  background: #f5f5f5;
}

.controls-hidden .toc-header {
  background: #f5f5f5;
}

.dark-mode .toc-header {
  border-bottom: 1px solid #404040;
  background: #2d2d2d;
}

.dark-mode .controls-hidden .toc-header {
  background: #2d2d2d;
}

.toc-toggle {
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.toc-toggle:hover {
  background: rgba(0, 0, 0, 0.1);
}

.dark-mode .toc-toggle:hover {
  background: rgba(255, 255, 255, 0.1);
}

.toc-title {
  font-weight: bold;
  text-align: center;
  flex: 1;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

.toc-item {
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  border-radius: 4px;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #333333;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

.dark-mode .toc-item {
  color: #e0e0e0;
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
  padding: 0;
  background-color: #ffffff;
  color: #333333;
  min-height: 0;
  margin: 0;
  width: 100%;
  box-sizing: border-box;
  position: relative;
}

.dark-mode .reader-view {
  background-color: #1a1a1a;
  color: #e0e0e0;
}

.reader-view :deep(body) {
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  background-color: inherit;
}

.reader-view :deep(p) {
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
}

.reader-view :deep(div) {
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  background-color: inherit;
}

.reader-view :deep(section) {
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  background-color: inherit;
}

.reader-view :deep(article) {
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  background-color: inherit;
}

.reader-view :deep(chapter) {
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  background-color: inherit;
}

.reader-view :deep(h1),
.reader-view :deep(h2),
.reader-view :deep(h3),
.reader-view :deep(h4),
.reader-view :deep(h5),
.reader-view :deep(h6) {
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  background-color: inherit;
}

.reader-view :deep(img) {
  margin: 0;
  padding: 0;
  max-width: 100%;
  height: auto;
  display: block;
}

.reader-view :deep(blockquote) {
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  background-color: inherit;
}

.reader-view :deep(ul),
.reader-view :deep(ol) {
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  background-color: inherit;
}

.reader-view :deep(li) {
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  background-color: inherit;
}

.reader-view :deep(table) {
  margin: 0;
  padding: 0;
  border-collapse: collapse;
  width: 100%;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  background-color: inherit;
}

.reader-view :deep(td),
.reader-view :deep(th) {
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  background-color: inherit;
}

.navigation-buttons {
  display: flex;
  justify-content: space-between;
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

.navigation-group {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.settings-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  background: #e0e0e0;
  color: #333333;
  cursor: pointer;
  transition: background-color 0.3s;
  font-size: 1rem;
  min-width: unset;
  min-height: unset;
}

.settings-button:hover {
  background: #d0d0d0;
}

.dark-mode .settings-button {
  background: #404040;
  color: #e0e0e0;
}

.dark-mode .settings-button:hover {
  background: #505050;
}

.settings-icon {
  font-size: 1.2rem;
  font-family: inherit;
  font-weight: 400;
  line-height: 1;
}

.settings-text {
  font-size: 0.9rem;
}

.navigation-buttons button {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  background: #e0e0e0;
  color: #333333;
  cursor: pointer;
  transition: background-color 0.3s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.navigation-buttons button:hover {
  background: #d0d0d0;
}

.dark-mode .navigation-buttons button {
  background: #404040;
  color: #e0e0e0;
}

.dark-mode .navigation-buttons button:hover {
  background: #505050;
}

.shortcut-key {
  font-size: 0.9rem;
  opacity: 0.8;
  margin-left: 0.25rem;
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
  width: 4px;
  background: transparent;
}

.reader-view::-webkit-scrollbar-track,
.toc-content::-webkit-scrollbar-track {
  background: transparent;
}

.reader-view::-webkit-scrollbar-thumb,
.toc-content::-webkit-scrollbar-thumb {
  background: #f5f5f5;
  border-radius: 4px;
  transition: background 0.2s;
}

.reader-view::-webkit-scrollbar-thumb:hover,
.toc-content::-webkit-scrollbar-thumb:hover {
  background: #e0e0e0;
}

.dark-mode .reader-view::-webkit-scrollbar-thumb,
.dark-mode .toc-content::-webkit-scrollbar-thumb {
  background: #232323;
}

.dark-mode .reader-view::-webkit-scrollbar-thumb:hover,
.dark-mode .toc-content::-webkit-scrollbar-thumb:hover {
  background: #333333;
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
  width: 500px;
  max-width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  color: #333333;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #ddd;
  background: #f5f5f5;
}

.settings-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #333333;
}

.close-button {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #666;
  padding: 0.25rem;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.close-button:hover {
  background: rgba(0, 0, 0, 0.1);
}

.settings-content {
  padding: 1rem;
  background: #ffffff;
}

.settings-section {
  margin-bottom: 1.5rem;
  background: #ffffff;
  padding: 1rem;
  border-radius: 4px;
  border: 1px solid #eee;
}

.settings-section h4 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: #333333;
}

.setting-item {
  display: flex;
  align-items: center;
  margin-bottom: 1rem;
  gap: 1rem;
  padding: 0.5rem;
  border-radius: 4px;
  background: #f8f8f8;
  transition: background-color 0.2s;
}

.dark-mode .setting-item {
  background: #333333;
}

.setting-item:hover {
  background: #f0f0f0;
}

.dark-mode .setting-item:hover {
  background: #404040;
}

.setting-item label {
  min-width: 100px;
  color: #333333;
  font-weight: 500;
}

.dark-mode .setting-item label {
  color: #e0e0e0;
}

.setting-item select {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #ffffff;
  color: #333333;
  font-size: 0.9rem;
  transition: border-color 0.2s;
}

.dark-mode .setting-item select {
  background: #1a1a1a;
  border-color: #404040;
  color: #e0e0e0;
}

.setting-item select:hover {
  border-color: #999;
}

.dark-mode .setting-item select:hover {
  border-color: #666;
}

.setting-item input[type="range"] {
  flex: 1;
  margin: 0 1rem;
  height: 4px;
  -webkit-appearance: none;
  background: #ddd;
  border-radius: 2px;
  outline: none;
}

.dark-mode .setting-item input[type="range"] {
  background: #404040;
}

.setting-item input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: #666;
  border-radius: 50%;
  cursor: pointer;
  transition: background-color 0.2s;
}

.dark-mode .setting-item input[type="range"]::-webkit-slider-thumb {
  background: #888;
}

.setting-item input[type="range"]::-webkit-slider-thumb:hover {
  background: #444;
}

.dark-mode .setting-item input[type="range"]::-webkit-slider-thumb:hover {
  background: #aaa;
}

.setting-item span {
  min-width: 40px;
  text-align: right;
  color: #666;
  font-size: 0.9rem;
  font-weight: 500;
}

.dark-mode .setting-item span {
  color: #999;
}

.toggle-controls {
  position: fixed;
  top: 10px;
  right: 10px;
  z-index: 1000;
  padding: 4px 8px;
  background-color: #ffffff;
  color: #213547;
  border: 1px solid #213547;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  font-size: 0.8rem;
}

.toggle-controls:hover {
  opacity: 0.8;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.toggle-icon {
  font-size: 0.9rem;
  line-height: 1;
  font-weight: bold;
}

.toggle-text {
  font-size: 0.7rem;
  font-weight: 500;
}

.dark-mode .toggle-controls {
  background-color: #1a1a1a;
  color: rgba(255, 255, 255, 0.87);
  border-color: transparent;
}

.version {
  position: absolute;
  bottom: 0.25rem;
  right: 0.25rem;
  font-size: 0.7rem;
  color: #666;
  z-index: 1000;
}

.dark-mode .version {
  color: #888;
}

.toc-show-button {
  position: absolute;
  top: 0;
  transform: none;
  padding: 8px 4px;
  border: none;
  background: rgba(0, 0, 0, 0.1);
  color: inherit;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.3s, opacity 0.3s, visibility 0.3s;
  opacity: 0;
  z-index: 10;
  visibility: hidden;
}

.toc-show-button.left {
  left: 0;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  border-top-right-radius: 0;
}

.toc-show-button.right {
  right: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-top-left-radius: 0;
}

.reader-wrapper:hover .toc-show-button {
  visibility: visible;
  opacity: 0.5;
}

.toc-show-button:hover {
  background: rgba(0, 0, 0, 0.2);
  opacity: 1;
}

.dark-mode .toc-show-button {
  background: rgba(255, 255, 255, 0.1);
}

.dark-mode .toc-show-button:hover {
  background: rgba(255, 255, 255, 0.2);
}

.toc-show-button .toggle-icon {
  font-size: 1rem;
  line-height: 1;
  font-weight: bold;
}

.resize-handle {
  width: 8px;
  background-color: #ccc;
  cursor: col-resize;
  transition: background-color 0.3s;
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  user-select: none;
  touch-action: none; /* タッチデバイスでのパフォーマンスを改善 */
}

.resize-handle:hover,
.resize-handle:active {
  background-color: #999;
}

.dark-mode .resize-handle {
  background-color: #232323;
}

.dark-mode .resize-handle:hover,
.dark-mode .resize-handle:active {
  background-color: #333333;
}

.mode-icon {
  font-size: 1.2rem;
  line-height: 1;
  color: inherit;
  transition: color 0.3s;
}

.dark-mode .settings-panel {
  background: #232323;
  color: #f0f0f0;
  border: 1px solid #444;
}

.dark-mode .settings-header {
  background: #181818;
  border-bottom: 1px solid #444;
}

.dark-mode .settings-content {
  background: #232323;
}

.dark-mode .settings-section {
  background: #232323;
  border: 1px solid #444;
}

.dark-mode .settings-section h4 {
  color: #f0f0f0;
}

.dark-mode .setting-item label {
  color: #e0e0e0;
}

.dark-mode .setting-item select {
  background: #181818;
  border: 1px solid #666;
  color: #f0f0f0;
}

.dark-mode .setting-item select:hover {
  border-color: #aaa;
}

.dark-mode .setting-item input[type="range"] {
  background: #444;
}

.dark-mode .setting-item input[type="range"]::-webkit-slider-thumb {
  background: #bbb;
}

.dark-mode .setting-item input[type="range"]::-webkit-slider-thumb:hover {
  background: #fff;
}

.dark-mode .setting-item span {
  color: #ccc;
}
</style>
