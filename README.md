# Parallel Read

EPUB / PDF ファイルを2画面で同時に読むことができるデスクトップアプリケーションです。

## v2.0 の新機能

- **PDF サポート復活**: EPUB に加え、PDF ファイルも表示可能に
- **モダンなアーキテクチャ**: Pinia による状態管理、コンポーネント分離
- **拡張された設定機能**:
  - フォントファミリー（システム、Google Fonts 対応）
  - フォントサイズ・太さ
  - 行間・字間・段落間隔
  - 個別の余白設定（上下左右）
  - テキスト配置
- **テーマ機能**: ライト / ダーク / セピア
- **UI改善**: よりモダンなデザイン

## 機能

- 2画面での同時表示（EPUB / PDF）
- スクロール同期機能
- ダークモード・セピアモード対応
- 目次表示/非表示
- 豊富なカスタマイズオプション
- 画面分割比率の調整
- ドラッグ＆ドロップ対応
- キーボードショートカット対応

## インストール方法

### リリースからインストール

1. [Releases](https://github.com/ibamoto/Epub-Parallel-Read/releases) ページから最新のバージョンをダウンロード
2. ダウンロードしたファイルを実行してインストール
   - macOS: `.dmg`ファイルを開き、アプリケーションを Applications フォルダにドラッグ＆ドロップ
   - Windows: `.exe`ファイルを実行してインストール

### ソースからビルド

```bash
# リポジトリのクローン
git clone https://github.com/ibamoto/Epub-Parallel-Read.git
cd Epub-Parallel-Read

# 依存関係のインストール
npm install

# 開発モードで実行
npm run electron:dev

# アプリケーションのビルド
npm run electron:build
```

## 使用方法

1. アプリケーションを起動
2. 左右のペインにEPUB/PDFファイルをドラッグ＆ドロップ、または上部のボタンから選択
3. 必要に応じて以下の機能を使用:
   - スクロール同期の切り替え: 上部の「スクロール同期」ボタン
   - コントロールパネルの表示/非表示: Ctrl/⌘ + H
   - ページ移動（同期モード時）: ← →
   - 表示設定: 各ペインの「Aa」ボタン
   - 目次の表示/非表示: サイドバーのトグルボタン
   - 画面分割比率の調整: 中央のバーをドラッグ

## 技術スタック

- **フロントエンド**: Vue 3 + Pinia
- **デスクトップ**: Electron
- **EPUB パース**: foliate-js（レンダリングは自前実装）
- **PDF レンダリング**: PDF.js
- **ビルドツール**: Vite + electron-builder

> 詳細なアーキテクチャについては [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) を参照してください。
> 
> EPUB、Markdown、PDFリーダーの仕様については [docs/READER_SPECIFICATIONS.md](./docs/READER_SPECIFICATIONS.md) を参照してください。

## プロジェクト構成

```
src/
├── App.vue                    # メインアプリケーション
├── components/
│   ├── common/
│   │   └── ControlBar.vue     # 上部コントロールバー
│   ├── navigation/
│   │   └── TableOfContents.vue # 目次サイドバー
│   ├── reader/
│   │   └── ReaderPane.vue     # リーダーペイン
│   └── settings/
│       └── SettingsPanel.vue  # 設定パネル
├── composables/
│   ├── useEpubReader.js       # EPUB リーダーロジック
│   ├── usePdfReader.js        # PDF リーダーロジック
│   └── useReaderSync.js       # 同期ロジック
└── stores/
    ├── reader.js              # リーダー状態管理
    └── settings.js            # 設定状態管理
```

## ライセンス

MIT License
