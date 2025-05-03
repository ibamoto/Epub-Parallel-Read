const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // 開発時はViteの開発サーバーを使用
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5174");
    mainWindow.webContents.openDevTools();
  } else {
    // 本番環境ではビルドされたファイルを読み込む
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});
