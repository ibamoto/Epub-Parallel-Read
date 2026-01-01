# Parallel Read アーキテクチャ解説

## 目次

1. [概要](#概要)
2. [ハイブリッドアプローチの詳細](#ハイブリッドアプローチの詳細)
3. [EPUBの取り扱い](#epubの取り扱い)
4. [レンダリングパイプライン](#レンダリングパイプライン)
5. [状態管理と位置保存](#状態管理と位置保存)
6. [メリット・デメリット](#メリットデメリット)
7. [サービス全体のアーキテクチャ](#サービス全体のアーキテクチャ)
8. [技術的な制約と設計判断](#技術的な制約と設計判断)

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

## レンダリングパイプライン

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
