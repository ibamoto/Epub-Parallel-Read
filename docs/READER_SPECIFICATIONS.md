# リーダー仕様書

## 概要

このドキュメントは、EPUB、Markdown、PDFリーダーの動作仕様を定義します。URLリーダーは別途実装中であり、この仕様の対象外です。

## 対象リーダー

- **EPUBリーダー** (`useEpubReader.js`)
- **Markdownリーダー** (`useMarkdownReader.js`)
- **PDFリーダー** (`usePdfReader.js`)

## 共通インターフェース

すべてのリーダーは以下のインターフェースを実装する必要があります：

```typescript
interface Reader {
  containerRef: Ref<HTMLElement | null>
  isReady: Ref<boolean>
  openFile(file: File): Promise<void>
  goTo(href: string): void
  next(): void
  prev(): void
  getScrollInfo(): ScrollInfo | null
  setScrollByRatio(ratio: number): void
  scrollBy(distance: number): void
  applySettings(): void
  cleanup(): void
}

interface ScrollInfo {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  scrollRatio: number // 0.0 - 1.0
}
```

## スクロール同期仕様

### ホイールイベントによる同期

#### 実装場所
- `App.vue` の `handleWheelSync` 関数
- 各リーダーの `setupWheelHandler` 関数

#### 動作仕様

1. **EPUB-EPUB同期**
   - ソースペイン: ホイールイベントで `.epub-content-{paneIndex}` をスクロール
   - ターゲットペイン: `scrollAmounts[targetIndex] * syncSensitivity` でスクロール
   - スクロール方法: `scrollBy({ top: distance, behavior: 'smooth' })`

2. **Markdown-Markdown同期**
   - ソースペイン: ホイールイベントで `.reader-view` をスクロール
   - ターゲットペイン: `scrollAmounts[targetIndex] * syncSensitivity` でスクロール
   - スクロール方法: `scrollBy({ top: distance, behavior: 'smooth' })`

3. **PDF-PDF同期**
   - ソースペイン: ホイールイベントで `pdfPageAmounts[sourceIndex]` ページ移動
   - ターゲットペイン: `pdfPageAmounts[targetIndex]` ページ移動
   - 移動方法: `goToPage(currentPage ± pageAmount)`

4. **異種リーダー間の同期**
   - EPUB/Markdown → PDF: EPUB/Markdownはスクロール、PDFはページ移動
   - PDF → EPUB/Markdown: PDFはページ移動、EPUB/Markdownはスクロール
   - EPUB ↔ Markdown: 両方ともスクロール

#### 重要な制約

- **ソースペインのスクロールは常に実行される**
  - スクロール同期モードでも、ソースペインのスクロールは実行される
  - これは各リーダーの `setupWheelHandler` で実装されている

- **ターゲットペインの同期は `handleWheelSync` で実行される**
  - `App.vue` の `handleWheelSync` がターゲットペインを同期する
  - スクロール同期モードが有効な場合のみ実行される

- **スクロール同期のロック機構**
  - `keyboardNavLock`: キーボードナビゲーション中はスクロール同期を無効化
  - `tocNavLock`: 目次ナビゲーション中はスクロール同期を無効化
  - `isSyncing`: スクロール同期中のフラグ（現在未使用）

### ナビゲーションボタンによる同期

#### 実装場所
- `ReaderPane.vue` の `handleNext`/`handlePrev` 関数
- `App.vue` の `handleNavigate` 関数

#### 動作仕様

1. **ボタンクリック時の動作**
   - ソースペイン: `activeReader.value.next()` / `prev()` を実行
   - ターゲットペイン: スクロール同期モードが有効な場合、`target.next()` / `prev()` を実行

2. **EPUB/Markdownのnext/prev**
   - EPUB: セクション単位の移動（実装により異なる）
   - Markdown: 画面の80%分をスクロール

3. **PDFのnext/prev**
   - 1ページずつ移動（`goToPage(currentPage ± 1)`）

#### 重要な制約

- **スクロール同期モードが無効な場合**
  - ソースペインのみ動作する
  - ターゲットペインは動作しない

- **キーボードナビゲーションロック**
  - `handleNavigate` 実行時に `keyboardNavLock = true` を設定
  - 600ms後に解除（スクロールアニメーション完了を待つ）

### キーボードショートカット

#### 実装場所
- `App.vue` の `handleKeyDown` 関数

#### 動作仕様

1. **左右矢印キー（← →）**
   - EPUB/Markdown/PDF: `prev()` / `next()` を実行
   - スクロール同期モードが有効な場合、両方のペインで実行

2. **上下矢印キー（↑ ↓）**
   - EPUB/Markdown: `scrollBy(±scrollAmount)` を実行
   - PDF: `pageBy(±pageAmount)` を実行
   - スクロール同期モードが有効な場合、両方のペインで実行

#### 重要な制約

- **キーボードナビゲーションロック**
  - `handleKeyDown` 実行時に `keyboardNavLock = true` を設定
  - 800ms後に解除（スクロールアニメーション完了を待つ）

## リーダー固有の仕様

### EPUBリーダー

#### コンテナ要素
- セレクタ: `.epub-content-{paneIndex}`
- 要素: `contentWrapper.value` (div要素)

#### ホイールイベント処理
- デバウンス: 50ms
- スクロール量: `scrollAmounts[paneIndex]`
- スクロール同期モード時: `preventDefault()` を呼ばない

#### next/prev動作
- セクション単位の移動（実装により異なる）

#### スクロール情報取得
- `contentWrapper.value.scrollTop` を使用
- `contentWrapper.value.scrollHeight` を使用
- `contentWrapper.value.clientHeight` を使用

### Markdownリーダー

#### コンテナ要素
- セレクタ: `.reader-view`
- 要素: `containerRef.value` (div要素)

#### ホイールイベント処理
- ネイティブスクロールを使用（カスタムハンドラーなし）
- `App.vue` の `handleWheelSync` で処理される

#### next/prev動作
- 画面の80%分をスクロール（`container.clientHeight * 0.8`）

#### スクロール情報取得
- `containerRef.value.scrollTop` を使用
- `contentElement.scrollHeight` を使用
- `containerRef.value.clientHeight` を使用

### PDFリーダー

#### コンテナ要素
- セレクタ: `.reader-view`
- 要素: `containerRef.value` (div要素)

#### ホイールイベント処理
- デバウンス: 250ms
- ページ移動量: `pdfPageAmounts[paneIndex]`
- スクロール同期モード時: `preventDefault()` を呼ばない

#### next/prev動作
- 1ページずつ移動（`goToPage(currentPage ± 1)`）

#### スクロール情報取得
- ページ番号から計算: `(currentPage - 1) / (totalPages - 1)`
- 実際のスクロール位置は使用しない

## 設定項目

### scrollAmounts
- 型: `[number, number]`
- デフォルト: `[100, 100]`
- 説明: EPUB/Markdownのスクロール量（ピクセル単位）
- 範囲: 10-1000

### pdfPageAmounts
- 型: `[number, number]`
- デフォルト: `[1, 1]`
- 説明: PDFのページ移動量
- 範囲: 1-100

### syncSensitivity
- 型: `number`
- デフォルト: `1.0`
- 説明: スクロール同期の感度（ターゲットペインのスクロール量に乗算）

## 実装上の注意事項

### スクロール同期の実装パターン

1. **ソースペインのスクロール**
   - 各リーダーの `setupWheelHandler` で実装
   - スクロール同期モードでも実行される

2. **ターゲットペインの同期**
   - `App.vue` の `handleWheelSync` で実装
   - スクロール同期モードが有効な場合のみ実行される

3. **ロック機構**
   - `keyboardNavLock`: キーボードナビゲーション中
   - `tocNavLock`: 目次ナビゲーション中
   - `isSyncing`: スクロール同期中（現在未使用）

### コードの分離

- **URLリーダーは別実装**
  - URLリーダーの実装は、EPUB/Markdown/PDFの実装に影響を与えない
  - `handleWheelSync` でURLリーダーの処理は分離されている

- **型安全性の確保**
  - 各リーダーの型チェックを実装
  - `fileType` による分岐処理を明確にする

## テスト要件

### スクロール同期のテスト

1. **EPUB-EPUB同期**
   - 両方のペインにEPUBを開く
   - スクロール同期モードを有効化
   - ソースペインでホイールを回す
   - ターゲットペインが同期してスクロールすることを確認

2. **Markdown-Markdown同期**
   - 両方のペインにMarkdownを開く
   - スクロール同期モードを有効化
   - ソースペインでホイールを回す
   - ターゲットペインが同期してスクロールすることを確認

3. **PDF-PDF同期**
   - 両方のペインにPDFを開く
   - スクロール同期モードを有効化
   - ソースペインでホイールを回す
   - ターゲットペインが同期してページ移動することを確認

4. **異種リーダー間の同期**
   - EPUBとPDF、MarkdownとPDFなどの組み合わせをテスト
   - スクロール同期が正しく動作することを確認

### ナビゲーションボタンのテスト

1. **next/prevボタンの動作**
   - 各リーダーでnext/prevボタンをクリック
   - ソースペインが正しく動作することを確認
   - スクロール同期モードが有効な場合、ターゲットペインも動作することを確認

2. **キーボードショートカットの動作**
   - 左右矢印キーでnext/prevが動作することを確認
   - 上下矢印キーでスクロール/ページ移動が動作することを確認

## 変更履歴

- 2024-XX-XX: 初版作成
- EPUB、Markdown、PDFの仕様を確定

