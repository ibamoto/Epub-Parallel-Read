# EPUB Reader

EPUB ファイルを 2 画面で同時に読むことができるデスクトップアプリケーションです。

## 機能

- 2 画面での同時表示
- スクロール同期機能
- ダークモード対応
- 目次表示/非表示
- フォントサイズ・行間・余白のカスタマイズ
- 画面分割比率の調整
- キーボードショートカット対応

## インストール方法

### リリースからインストール

1. [Releases](https://github.com/ibamoto/c-epub/releases) ページから最新のバージョンをダウンロード
2. ダウンロードしたファイルを実行してインストール
   - macOS: `.dmg`ファイルを開き、アプリケーションを Applications フォルダにドラッグ＆ドロップ
   - Windows: `.exe`ファイルを実行してインストール
   - Linux: `.AppImage`ファイルを実行

### ソースからビルド

```bash
# リポジトリのクローン
git clone https://github.com/ibamoto/c-epub.git
cd c-epub

# 依存関係のインストール
npm install

# 開発モードで実行
npm run electron:dev

# アプリケーションのビルド
npm run electron:build
```

## 使用方法

1. アプリケーションを起動
2. 左右の「ファイルを選択」ボタンから EPUB ファイルを選択
3. 必要に応じて以下の機能を使用:
   - スクロール同期の切り替え: ⌘Y
   - コントロールパネルの表示/非表示: ⌘H
   - ページ移動（同期モード時）: ← →
   - 目次の表示/非表示: 各画面の目次ボタンをクリック
   - 画面分割比率の調整: 中央のバーをドラッグ

## 開発環境

- Node.js
- Vue 3
- Electron
- EPUBjs

## ライセンス

MIT License
