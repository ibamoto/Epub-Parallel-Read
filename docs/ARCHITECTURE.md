# Parallel Read アーキテクチャ解説

## 目次

1. [概要](#概要)
2. [ハイブリッドアプローチの詳細](#ハイブリッドアプローチの詳細)
3. [EPUBの取り扱い](#epubの取り扱い)
4. [EPUBレンダリングパイプライン](#epubレンダリングパイプライン)
5. [PDFの取り扱い](#pdfの取り扱い)
6. [状態管理と位置保存](#状態管理と位置保存)
7. [EPUB vs PDF 比較](#epub-vs-pdf-比較)
8. [メリット・デメリット](#メリットデメリット)
9. [サービス全体のアーキテクチャ](#サービス全体のアーキテクチャ)
10. [技術的な制約と設計判断](#技術的な制約と設計判断)

---

## 概要

Parallel Readは、EPUB/PDFファイルを2画面で同時に読むことができるデスクトップアプリケーションです。本ドキュメントでは、特にEPUBレンダリングにおける**ハイブリッドアプローチ**について詳しく解説します。

### アーキテクチャ概念図

```
┌─────────────────────────────────────────────────────────────────────┐
│  foliate-js (バックエンド層)                                          │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  - EPUB解析（ZIP展開、OPF/NCXパース）                           │  │
│  │  - メタデータ抽出（タイトル、著者、言語等）                        │  │
│  │  - 目次（TOC）の構造化                                          │  │
│  │  - セクション（章）の管理                                        │  │
│  │  - 画像リソースのBlob変換                                       │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓ book オブジェクト
┌─────────────────────────────────────────────────────────────────────┐
│  自前レンダリング (フロントエンド層)                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  - section.createDocument() でHTML DOM取得                     │  │
│  │  - DOMを直接コンテナに挿入                                       │  │
│  │  - 動的CSSによるスタイリング                                     │  │
│  │  - ネイティブスクロール（ホイール、矢印キー）                       │  │
│  │  - スクロール位置の追跡・復元                                     │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## ハイブリッドアプローチの詳細

### なぜハイブリッドなのか

一般的なEPUBリーダーライブラリ（foliate-js、epub.js等）は、完全な「レンダリングエンジン」として機能します。つまり：

- **従来のアプローチ**: ライブラリが iframe やカスタム要素内でEPUBを完全に管理
- **本アプローチ**: ライブラリはパース専用、レンダリングは自前実装

### 役割分担

| 機能 | foliate-js | 自前実装 |
|------|-----------|----------|
| EPUBファイルの解析 | ✅ | - |
| ZIPの展開 | ✅ | - |
| メタデータ抽出 | ✅ | - |
| TOC構造の取得 | ✅ | - |
| セクションのDOM生成 | ✅ | - |
| 画像のBlob URL化 | ✅ | - |
| DOMのレンダリング | - | ✅ |
| スタイリング | - | ✅ |
| スクロール制御 | - | ✅ |
| 位置の追跡・保存 | - | ✅ |
| ユーザー操作処理 | - | ✅ |

### 実装の流れ

```javascript
// 1. foliate-jsを動的インポート
epubModule = await import('foliate-js/view.js')

// 2. 一時的な<foliate-view>要素を作成してパース
const tempView = document.createElement('foliate-view')
await tempView.open(file)
book.value = tempView.book  // bookオブジェクトを取得

// 3. 一時要素を削除（レンダリングには使わない）
tempView.close()
tempView.remove()

// 4. 各セクションをDOMとして取得し、自前コンテナに挿入
for (const section of book.sections) {
  const doc = await section.createDocument()
  contentWrapper.appendChild(doc.body.cloneNode(true))
}
```

---

## EPUBの取り扱い

### ファイル読み込みフロー

```
ファイル選択/ドロップ
        ↓
  File オブジェクト
        ↓
┌───────────────────┐
│ useEpubReader.js  │
│   openFile()      │
└───────────────────┘
        ↓
  foliate-js パース
        ↓
┌───────────────────┐
│ book オブジェクト   │
│ ├─ metadata       │
│ ├─ toc            │
│ ├─ sections[]     │
│ └─ loadBlob()     │
└───────────────────┘
        ↓
  セクション展開
        ↓
  DOM レンダリング
```

### bookオブジェクトの構造

foliate-jsから取得される`book`オブジェクトには以下が含まれます：

```javascript
book = {
  metadata: {
    title: "書籍タイトル",
    creator: "著者名",
    language: "ja",
    identifier: "ISBN/UUID",
    // ...その他のメタデータ
  },
  toc: [
    {
      label: "第1章",
      href: "chapter1.xhtml",
      subitems: [
        { label: "1.1 セクション", href: "chapter1.xhtml#section1" }
      ]
    },
    // ...
  ],
  sections: [
    {
      id: "chapter1",
      href: "chapter1.xhtml",
      linear: "yes",  // "no"の場合はスキップ
      createDocument: async () => Document,  // DOMを生成
      resolveHref: (src) => "解決済みパス",
    },
    // ...
  ],
  loadBlob: async (href) => Blob,  // リソース読み込み
}
```

### セクションの処理

```javascript
async function loadSectionContent(section, sectionIndex) {
  // 1. セクションからDOMドキュメントを生成
  const doc = await section.createDocument()

  // 2. セクション用のコンテナを作成
  const sectionDiv = document.createElement('div')
  sectionDiv.className = 'epub-section'
  sectionDiv.dataset.sectionIndex = sectionIndex

  // 3. 画像のURLをBlob URLに変換
  const images = doc.body.querySelectorAll('img')
  for (const img of images) {
    const blob = await book.loadBlob(section.resolveHref(img.src))
    img.src = URL.createObjectURL(blob)
  }

  // 4. body内容をクローンして追加
  sectionDiv.appendChild(doc.body.cloneNode(true))
  return sectionDiv
}
```

---

## EPUBレンダリングパイプライン

### DOM構造

```html
<div class="reader-view" ref="containerRef">
  <!-- contentWrapper: スクロール可能なコンテナ -->
  <div class="epub-content-{paneIndex}">
    <!-- 各セクション -->
    <div class="epub-section" data-section-index="0">
      <!-- 第1章のHTML内容 -->
    </div>
    <div class="epub-section" data-section-index="1">
      <!-- 第2章のHTML内容 -->
    </div>
    <!-- ... -->
  </div>
</div>
```

### 動的スタイリング

スタイルは`<style>`要素を動的に生成して`<head>`に挿入します：

```javascript
function generateContentStyles() {
  const colors = settingsStore.getThemeColors()
  const settings = settingsStore.paneSettings[paneIndex]

  return `
    .epub-content-${paneIndex} {
      font-family: ${settings.fontFamily};
      font-size: ${settings.fontSize}px;
      line-height: ${settings.lineHeight};
      color: ${colors.text};
      background: ${colors.background};
      padding: ${settings.marginTop}px ${settings.marginRight}px
               ${settings.marginBottom}px ${settings.marginLeft}px;
    }

    .epub-content-${paneIndex} a {
      color: ${colors.link};
    }

    .epub-content-${paneIndex} p {
      margin: ${settings.paragraphSpacing}em 0;
    }
  `
}
```

### スクロールとナビゲーション

| 操作 | 動作 | 実装 |
|------|------|------|
| マウスホイール | ネイティブスクロール | ブラウザ標準 |
| ↑↓キー | 微細スクロール | `scrollBy(±100px)` |
| ←→キー | ページ送り | `scrollBy(±90% viewport)` |
| TOCクリック | セクション移動 | `scrollIntoView()` |

```javascript
// ページ送り（90%スクロール）
function next() {
  const viewportHeight = contentWrapper.clientHeight
  contentWrapper.scrollBy({
    top: viewportHeight * 0.9,
    behavior: 'smooth'
  })
}

// 微細スクロール
function scrollBy(distance) {
  contentWrapper.scrollBy({
    top: distance,
    behavior: 'smooth'
  })
}
```

---

## PDFの取り扱い

PDFの描画にはMozillaの**PDF.js**ライブラリを使用しています。EPUBとは異なり、PDFは固定レイアウトであるため、**単一ページ表示**モードを採用しています。

### アーキテクチャ概念図

```
┌─────────────────────────────────────────────────────────────────────┐
│  PDF.js (レンダリングエンジン)                                        │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  - PDFファイルのパース                                          │  │
│  │  - ページ情報の取得（サイズ、アウトライン等）                       │  │
│  │  - Canvas へのレンダリング                                      │  │
│  │  - Web Worker によるバックグラウンド処理                          │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│  自前制御 (フロントエンド層)                                          │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  - 単一ページ表示モード                                          │  │
│  │  - 遅延読み込み（IntersectionObserver）                          │  │
│  │  - ページ送り（ホイール、矢印キー）                                │  │
│  │  - 現在ページの追跡・復元                                        │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### ファイル読み込みフロー

```
ファイル選択/ドロップ
        ↓
  File オブジェクト
        ↓
  file.arrayBuffer()
        ↓
┌───────────────────┐
│ usePdfReader.js   │
│   openFile()      │
└───────────────────┘
        ↓
  pdfjsLib.getDocument()
        ↓
┌───────────────────┐
│ pdf オブジェクト    │
│ ├─ numPages       │
│ ├─ getPage()      │
│ ├─ getOutline()   │
│ └─ getDestination │
└───────────────────┘
        ↓
  プレースホルダー作成
        ↓
  遅延レンダリング開始
```

### PDF.jsの初期化

```javascript
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Web Workerの設定（重要：メインスレッドのブロックを防ぐ）
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
```

### 遅延読み込み（Lazy Loading）

PDFはEPUBと異なり、**遅延読み込み**を実装しています。これは以下の理由によります：

- PDFページはCanvas要素への描画が必要で、事前レンダリングが重い
- ページ数が多いPDFでは全ページレンダリングが非現実的
- 単一ページ表示なので、非表示ページのレンダリングは無駄

```javascript
// 定数定義
const BUFFER_PAGES = 2  // 現在ページ ± 2ページを事前レンダリング

// IntersectionObserverによる可視性検出
function setupIntersectionObserver() {
  const options = {
    root: containerRef.value,
    rootMargin: '200px 0px',  // 200px手前からプリロード開始
    threshold: 0
  }

  intersectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const pageNum = parseInt(entry.target.dataset.page, 10)
        renderPageWithBuffer(pageNum)  // 周辺ページも含めてレンダリング
      }
    }
  }, options)

  // 全Canvas要素を監視対象に
  containerRef.value.querySelectorAll('canvas').forEach(canvas =>
    intersectionObserver.observe(canvas)
  )
}
```

### レンダリングパイプライン

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. プレースホルダー作成（高速）                                     │
│    - 全ページ分のCanvas要素を作成                                  │
│    - 初期サイズは1ページ目の寸法を使用                              │
│    - 背景色でローディング表示                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. IntersectionObserver設定                                      │
│    - 各Canvasの可視性を監視                                       │
│    - rootMargin: 200pxで事前検出                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. 初期ページレンダリング                                          │
│    - 1ページ目 + バッファページ（2ページ）を描画                     │
│    - 保存された位置があれば、そのページから開始                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. オンデマンドレンダリング                                         │
│    - ページ移動時に必要なページを描画                               │
│    - 重複レンダリング防止（renderingPages Set）                     │
│    - レンダリング済みページはキャッシュ（renderedPages Map）          │
└─────────────────────────────────────────────────────────────────┘
```

### ページレンダリングの詳細

```javascript
async function renderPage(pageNum, canvas) {
  // 重複レンダリング防止
  if (renderingPages.has(pageNum)) return
  renderingPages.add(pageNum)

  try {
    // 1. ページオブジェクトを取得
    const page = await pdf.value.getPage(pageNum)

    // 2. ビューポート計算（スケール適用）
    const viewport = page.getViewport({ scale: scale.value })

    // 3. Canvas設定
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.style.width = '100%'
    canvas.style.height = 'auto'

    // 4. コンテキスト取得とテーマ背景適用
    const context = canvas.getContext('2d')
    const colors = settingsStore.getThemeColors()
    context.fillStyle = colors.background
    context.fillRect(0, 0, canvas.width, canvas.height)

    // 5. PDF描画
    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise

    // 6. キャッシュに記録
    renderedPages.value.set(pageNum, true)

  } finally {
    renderingPages.delete(pageNum)
  }
}
```

### 単一ページ表示モード

PDFは**1ページずつ中央に表示**するモードで動作します。これはEPUBの連続スクロールとは根本的に異なります。

```javascript
function updatePageVisibility() {
  const container = containerRef.value

  // コンテナをFlexboxで中央配置
  container.style.cssText = `
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 0;
    background: var(--bg-primary);
  `

  // 現在ページのみ表示、他は非表示
  containerRef.value.querySelectorAll('canvas').forEach((canvas) => {
    const pageNum = parseInt(canvas.dataset.page, 10)

    if (pageNum === currentPage.value) {
      canvas.style.cssText = `
        display: block;
        max-height: 100%;
        max-width: 100%;
        width: auto;
        height: auto;
        object-fit: contain;
      `
    } else {
      canvas.style.display = 'none'
    }
  })
}
```

### DOM構造

```html
<div class="reader-view" ref="containerRef" style="display: flex; ...">
  <!-- 1ページ目（表示） -->
  <canvas class="pdf-page" data-page="1" style="display: block; ..."></canvas>

  <!-- 2ページ目以降（非表示） -->
  <canvas class="pdf-page" data-page="2" style="display: none;"></canvas>
  <canvas class="pdf-page" data-page="3" style="display: none;"></canvas>
  <!-- ... -->
</div>
```

### ナビゲーション

| 操作 | 動作 | 実装 |
|------|------|------|
| マウスホイール | ページ送り | `wheelHandler`（デバウンス250ms） |
| ↑キー | 前ページ | `prev()` |
| ↓キー | 次ページ | `next()` |
| ←キー | 前ページ | `prev()` |
| →キー | 次ページ | `next()` |
| TOCクリック | 指定ページへ | `goToPage(pageNum)` |

```javascript
// ホイールイベントハンドラ（デバウンス付き）
function setupWheelHandler() {
  wheelHandler = (e) => {
    e.preventDefault()

    // 250msデバウンスで連続入力を防止
    if (wheelHandler.lastTime && Date.now() - wheelHandler.lastTime < 250) {
      return
    }
    wheelHandler.lastTime = Date.now()

    if (e.deltaY > 0) {
      next()   // 下スクロール → 次ページ
    } else if (e.deltaY < 0) {
      prev()   // 上スクロール → 前ページ
    }
  }

  containerRef.value.addEventListener('wheel', wheelHandler, { passive: false })
}

// ページ移動
function next() {
  if (currentPage.value < totalPages.value) {
    goToPage(currentPage.value + 1)
  }
}

function prev() {
  if (currentPage.value > 1) {
    goToPage(currentPage.value - 1)
  }
}

function goToPage(pageNum) {
  // バッファページも含めてレンダリング
  renderPageWithBuffer(pageNum)

  currentPage.value = pageNum
  readerStore.setCurrentPage(paneIndex, pageNum)

  // 表示更新（現在ページのみ表示）
  updatePageVisibility()
}
```

### 目次（TOC）の生成

PDFのアウトライン（しおり）からTOCを生成します：

```javascript
async function generateToc() {
  const outline = await pdf.value.getOutline()
  if (!outline) return []

  const processTocItem = async (item, level = 0) => {
    let pageNum = 1

    if (item.dest) {
      // 名前付き目的地の場合は解決が必要
      const dest = typeof item.dest === 'string'
        ? await pdf.value.getDestination(item.dest)
        : item.dest

      if (dest) {
        const pageIndex = await pdf.value.getPageIndex(dest[0])
        pageNum = pageIndex + 1
      }
    }

    const result = [{
      label: item.title,
      href: pageNum,     // EPUBのhrefと異なりページ番号
      level: level,
    }]

    // 子項目を再帰処理
    if (item.items?.length > 0) {
      for (const child of item.items) {
        result.push(...await processTocItem(child, level + 1))
      }
    }

    return result
  }

  const toc = []
  for (const item of outline) {
    toc.push(...await processTocItem(item))
  }
  return toc
}
```

### スケール変更

```javascript
async function setScale(newScale) {
  scale.value = newScale

  // キャッシュをクリア（寸法がスケール依存のため）
  pageHeights.clear()
  renderedPages.value.clear()

  // プレースホルダー再作成
  await createPagePlaceholders()

  // Observer再設定
  setupIntersectionObserver()

  // 現在ページを再レンダリング
  await renderPageWithBuffer(currentPage.value)
}
```

### 位置の保存と復元

PDFはシンプルに**ページ番号**で位置を管理します：

```javascript
// 保存
readerStore.setCurrentPage(paneIndex, currentPage.value)

// 復元
const savedPage = readerStore.currentPages[paneIndex]
if (savedPage && savedPage <= totalPages.value) {
  goToPage(savedPage)
}
```

### クリーンアップ

```javascript
function cleanup() {
  // IntersectionObserver解除
  if (intersectionObserver) {
    intersectionObserver.disconnect()
    intersectionObserver = null
  }

  // ホイールハンドラ解除
  if (wheelHandler && containerRef.value) {
    containerRef.value.removeEventListener('wheel', wheelHandler)
    wheelHandler = null
  }

  // PDFオブジェクト破棄
  if (pdf.value) {
    pdf.value.destroy()
    pdf.value = null
  }

  // キャッシュクリア
  renderedPages.value.clear()
  renderingPages.clear()
  pageHeights.clear()

  // コンテナリセット
  if (containerRef.value) {
    containerRef.value.innerHTML = ''
    containerRef.value.style.cssText = ''
  }
}
```

---

## 状態管理と位置保存

### 位置情報のデータ構造

本アプリケーションは、EPUB標準のCFI（Canonical Fragment Identifier）ではなく、簡略化された位置情報を使用します：

```javascript
const position = {
  sectionIndex: number,  // 現在表示中のセクション番号
  scrollRatio: number    // スクロール位置（0.0〜1.0）
}
```

### scrollRatioの計算

```javascript
function savePosition() {
  const el = contentWrapper

  // スクロール比率 = 現在位置 / 最大スクロール量
  const scrollRatio = el.scrollTop / (el.scrollHeight - el.clientHeight)

  // 現在のセクションを特定
  const sectionEls = el.querySelectorAll('.epub-section')
  let currentSection = 0
  for (let i = 0; i < sectionEls.length; i++) {
    if (sectionEls[i].getBoundingClientRect().top <= 100) {
      currentSection = i
    }
  }

  readerStore.setCurrentLocation(paneIndex, { sectionIndex, scrollRatio })
}
```

### 位置の復元

```javascript
function restorePosition(position) {
  setTimeout(() => {
    const maxScroll = contentWrapper.scrollHeight - contentWrapper.clientHeight
    contentWrapper.scrollTop = position.scrollRatio * maxScroll
  }, 100)  // DOMレンダリング完了を待つ
}
```

### ストレージ構成

```
┌─────────────────────────────────────────────────────────────────┐
│  Pinia Store (メモリ内状態)                                      │
│  ┌────────────────────┐  ┌────────────────────┐                 │
│  │  useReaderStore    │  │  useSettingsStore  │                 │
│  │  - books[2]        │  │  - theme           │                 │
│  │  - fileTypes[2]    │  │  - paneSettings[2] │                 │
│  │  - locations[2]    │  │  - syncMode        │                 │
│  │  - tocs[2]         │  │  - customColors    │                 │
│  └────────────────────┘  └────────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
                    ↓ 永続化
┌─────────────────────────────────────────────────────────────────┐
│  localStorage                                                    │
│  ┌────────────────────────────┬────────────────────────────┐    │
│  │  parallelReadState         │  parallelReadSettings      │    │
│  │  - fileNames               │  - theme                   │    │
│  │  - fileTypes               │  - paneSettings            │    │
│  │  - currentLocations        │  - syncMode                │    │
│  │  - currentPages            │  - customColors            │    │
│  └────────────────────────────┴────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                    ↓ ファイル本体
┌─────────────────────────────────────────────────────────────────┐
│  IndexedDB (useFileHistory)                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  fileHistory (per pane)                                     │ │
│  │  - id, fileName, fileType, fileSize                        │ │
│  │  - paneIndex                                                │ │
│  │  - openedAt                                                 │ │
│  │  - fileData: ArrayBuffer                                    │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## EPUB vs PDF 比較

本アプリケーションでは、EPUBとPDFで根本的に異なるレンダリング戦略を採用しています。

### 表示モードの違い

| 観点 | EPUB | PDF |
|------|------|-----|
| 表示方式 | 連続スクロール | 単一ページ表示 |
| レイアウト | リフロー（可変） | 固定 |
| レンダリング先 | DOM要素 | Canvas要素 |
| 読み込み | 全セクション一括 | 遅延読み込み |
| 位置管理 | scrollRatio | ページ番号 |
| ホイール操作 | ネイティブスクロール | ページ送り |

### 統一インターフェース

異なる表示方式にもかかわらず、同じAPIを提供することで同期処理を共通化しています：

```javascript
// 両リーダーで共通のインターフェース
interface Reader {
  openFile(file: File): Promise<void>
  next(): void
  prev(): void
  goTo(href: string | number): void
  getScrollInfo(): ScrollInfo | null
  setScrollByRatio(ratio: number): void
  cleanup(): void
}
```

### ナビゲーション動作の違い

```
EPUB:
┌─────────────────────────┐
│  Chapter 1              │ ← スクロールで
│  ...                    │   連続的に移動
│  ...                    │
│  Chapter 2              │
│  ...                    │
│  ...                    │
└─────────────────────────┘

PDF:
┌─────────────────────────┐
│                         │
│      [ Page 1 ]         │ ← ページ単位で
│                         │   離散的に移動
└─────────────────────────┘
         ↓ next()
┌─────────────────────────┐
│                         │
│      [ Page 2 ]         │
│                         │
└─────────────────────────┘
```

### 同期時の挙動

| シナリオ | EPUB ↔ EPUB | PDF ↔ PDF | EPUB ↔ PDF |
|---------|-------------|-----------|------------|
| 同期方式 | scrollRatio | ページ比率 | 混合※ |
| 精度 | 高 | 高 | 中 |

※ EPUB ↔ PDF 間の同期は、EPUBのscrollRatioをPDFのページ番号に変換して行います。

### メモリ使用パターン

```
EPUB:
├─ 初期ロード: 全セクションDOM展開 (メモリ消費大)
├─ 閲覧中: 一定 (追加メモリなし)
└─ ピーク: 初期ロード時

PDF:
├─ 初期ロード: プレースホルダーのみ (メモリ消費小)
├─ 閲覧中: 表示ページ+バッファをレンダリング (徐々に増加)
└─ ピーク: 多くのページを閲覧した後
```

### 選択理由

**EPUBが連続スクロールの理由:**
- リフロー可能なテキストコンテンツ
- 章をまたいだ自然な読書体験
- ネイティブスクロールの活用

**PDFが単一ページ表示の理由:**
- 固定レイアウトの忠実な再現
- ページ境界の明確化
- 印刷物と同じ見た目の維持

---

## メリット・デメリット

### メリット

#### 1. 完全なスタイル制御

```
✅ 任意のCSSプロパティを適用可能
✅ テーマ切り替えが即座に反映
✅ ペインごとに独立した設定
✅ 既存のVue/CSSエコシステムとの統合が容易
```

foliate-jsの標準レンダリングでは、iframeやShadow DOM内でスタイルが隔離されるため、外部からのスタイル適用が困難です。

#### 2. ネイティブスクロール

```
✅ ブラウザ標準のスクロール挙動
✅ スムーズスクロール、慣性スクロール
✅ アクセシビリティ対応（キーボードナビ等）
✅ パフォーマンスの最適化が不要
```

#### 3. シンプルな実装

```
✅ 位置追跡がscrollRatioのみ
✅ CFIの複雑なパース・生成が不要
✅ デバッグが容易
✅ コード量が少ない
```

#### 4. 2画面表示との親和性

```
✅ 各ペインが独立したDOMコンテナ
✅ スクロール同期が単純な比率計算で実現可能
✅ リサイズ時も自動的に対応
```

#### 5. 柔軟な拡張性

```
✅ 検索機能の実装が容易（標準DOM操作）
✅ ハイライト、注釈機能の追加が容易
✅ 他のVueコンポーネントとの統合
```

### デメリット

#### 1. CFI非対応

```
❌ EPUB標準の位置指定フォーマットに非対応
❌ 他のEPUBリーダーとの位置情報の互換性なし
❌ リフロー時に位置がずれる可能性
```

**影響**: フォントサイズや画面幅を変更すると、同じscrollRatioでも実際の表示位置がずれることがあります。

#### 2. 固定レイアウトEPUBの非対応

```
❌ 漫画、雑誌などの固定レイアウトには不向き
❌ ページ単位の表示ができない
❌ 見開き表示に非対応
```

#### 3. EPUBの高度な機能の非対応

```
❌ Media Overlays（音声同期）非対応
❌ JavaScript埋め込みの実行なし
❌ EPUB内のインタラクティブ要素が動作しない可能性
```

#### 4. メモリ使用量

```
❌ 全セクションを一度にDOMに展開
❌ 大きなEPUBファイルでメモリ消費が増加
❌ 遅延読み込み（lazy loading）なし
```

#### 5. DRM非対応

```
❌ DRM保護されたEPUBは読めない
❌ 暗号化されたリソースの復号なし
```

### 比較表

| 観点 | 本アプローチ | 従来アプローチ(foliate-js完全使用) |
|------|------------|----------------------------------|
| スタイル制御 | ◎ 完全自由 | △ 制限あり |
| 実装複雑度 | ○ シンプル | △ ライブラリ依存 |
| 位置精度 | △ 相対的 | ◎ CFI正確 |
| メモリ効率 | △ 全展開 | ○ 遅延読み込み |
| 標準準拠 | △ 部分的 | ◎ EPUB3準拠 |
| 2画面対応 | ◎ 最適 | △ 要改造 |
| 固定レイアウト | ✕ 非対応 | ○ 対応 |

---

## サービス全体のアーキテクチャ

### ディレクトリ構造

```
src/
├── App.vue                      # メインアプリケーション
│                                # - キーボードショートカット
│                                # - ペインレイアウト管理
│                                # - スクロール同期オーケストレーション
│
├── components/
│   ├── common/
│   │   └── ControlBar.vue       # 上部コントロールバー
│   │                            # - ファイル選択
│   │                            # - 履歴ドロップダウン
│   │                            # - テーマトグル
│   │
│   ├── navigation/
│   │   └── TableOfContents.vue  # 目次サイドバー
│   │                            # - 階層表示
│   │                            # - ナビゲーション
│   │
│   ├── reader/
│   │   └── ReaderPane.vue       # リーダーペイン
│   │                            # - ドロップゾーン
│   │                            # - リーダーコンポジション
│   │
│   └── settings/
│       └── SettingsPanel.vue    # 設定パネル
│                                # - タイポグラフィ
│                                # - テーマ選択
│                                # - マージン・レイアウト
│
├── composables/
│   ├── useEpubReader.js         # EPUB リーダーロジック (423行)
│   │                            # - セクション読み込み
│   │                            # - カスタムレンダリング
│   │                            # - スクロール追跡
│   │
│   ├── usePdfReader.js          # PDF リーダーロジック
│   │                            # - PDF.js統合
│   │                            # - 遅延読み込み
│   │                            # - ページ表示
│   │
│   ├── useReaderSync.js         # 同期ロジック
│   │                            # - クロスペインスクロール同期
│   │                            # - ナビゲーション同期
│   │
│   └── useFileHistory.js        # ファイル履歴管理
│                                # - IndexedDB操作
│                                # - ペイン別ファイル保存
│
└── stores/
    ├── reader.js                # リーダー状態管理
    │                            # - 書籍情報
    │                            # - 位置情報
    │                            # - TOC
    │
    └── settings.js              # 設定状態管理
                                 # - テーマ
                                 # - タイポグラフィ
                                 # - 同期設定
```

### コンポーネント関係図

```
                    ┌─────────────────────────────────┐
                    │           App.vue               │
                    │  ┌───────────────────────────┐  │
                    │  │       ControlBar          │  │
                    │  └───────────────────────────┘  │
                    │  ┌─────────────┬─────────────┐  │
                    │  │ ReaderPane  │ ReaderPane  │  │
                    │  │   (Left)    │   (Right)   │  │
                    │  │  ┌───────┐  │  ┌───────┐  │  │
                    │  │  │  TOC  │  │  │  TOC  │  │  │
                    │  │  └───────┘  │  └───────┘  │  │
                    │  │  ┌───────┐  │  ┌───────┐  │  │
                    │  │  │Reader │  │  │Reader │  │  │
                    │  │  │ View  │  │  │ View  │  │  │
                    │  │  └───────┘  │  └───────┘  │  │
                    │  └─────────────┴─────────────┘  │
                    │  ┌───────────────────────────┐  │
                    │  │     SettingsPanel         │  │
                    │  └───────────────────────────┘  │
                    └─────────────────────────────────┘
```

### データフロー

```
┌──────────────────────────────────────────────────────────────────┐
│ ユーザー操作                                                       │
│ (ファイル選択、スクロール、設定変更)                                  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ Composables (ビジネスロジック)                                     │
│ useEpubReader / usePdfReader / useFileHistory                    │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ Pinia Stores (状態管理)                                           │
│ useReaderStore / useSettingsStore                                 │
└──────────────────────────────────────────────────────────────────┘
                              ↓
         ┌────────────────────┼────────────────────┐
         ↓                    ↓                    ↓
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Components    │  │   localStorage  │  │    IndexedDB    │
│   (UI更新)       │  │   (設定永続化)   │  │  (ファイル保存)  │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### キーボードショートカット

| キー | 同期モードON | 同期モードOFF |
|------|-------------|--------------|
| `Ctrl/⌘ + H` | コントロール非表示 | コントロール非表示 |
| `←` | 両ペイン前ページ | - |
| `→` | 両ペイン次ページ | - |
| `↑` | 両ペイン上スクロール | - |
| `↓` | 両ペイン下スクロール | - |

### スクロール同期の仕組み

```javascript
// App.vue での同期処理
function handleSync(sourcePaneIndex) {
  const source = readers[sourcePaneIndex]
  const target = readers[1 - sourcePaneIndex]

  // ソースのスクロール比率を取得
  const info = source.getScrollInfo()

  // 感度調整を適用してターゲットに反映
  const adjustedRatio = info.scrollRatio * syncSensitivity
  target.setScrollByRatio(adjustedRatio)
}

// 100msのデバウンスでピンポン同期を防止
```

---

## 技術的な制約と設計判断

### 1. なぜCFIを使わないのか

CFI (Canonical Fragment Identifier) はEPUB3標準の位置指定フォーマットですが、本アプリでは以下の理由で採用していません：

- **実装の複雑さ**: CFIのパース・生成には専用ライブラリが必要
- **ユースケース**: 2画面同期にはscrollRatioで十分
- **相互運用性**: 他のリーダーとの位置共有は想定していない

### 2. なぜ全セクションを一度に読み込むのか

遅延読み込み（lazy loading）を採用しない理由：

- **スクロール同期の精度**: 全長が確定していないと比率計算が不正確
- **ネイティブスクロール**: 部分読み込みではスクロールバーが不安定
- **実装のシンプルさ**: IntersectionObserverなど追加実装が不要

### 3. なぜfoliate-jsのレンダリングを使わないのか

- **スタイル制御**: iframe/Shadow DOMではCSS注入が困難
- **2画面対応**: 単一ビューア想定のAPIが使いにくい
- **スクロール挙動**: ページネーションではなく連続スクロールが必要

### 4. PDFとの統一的な扱い

EPUBとPDFで異なるレンダリング方式（連続スクロール vs ページ単位）を採用しながら、同じインターフェース（`next()`, `prev()`, `getScrollInfo()`等）を提供することで、同期処理を共通化しています。

---

## まとめ

本アプリケーションのハイブリッドアプローチは、「パース/データ抽出」と「レンダリング/UI」を明確に分離することで、以下を実現しています：

1. **柔軟なスタイリング**: テーマ、フォント、余白など完全にカスタマイズ可能
2. **シンプルな同期**: scrollRatioベースの直感的な位置管理
3. **ネイティブ操作**: ブラウザ標準のスクロール挙動
4. **保守性**: Vueエコシステムとの自然な統合

一方で、CFI非対応や固定レイアウト非対応などのトレードオフがあります。これらは「2画面でリフロー型EPUBを快適に読む」という本アプリの主目的においては許容範囲内と判断しています。
