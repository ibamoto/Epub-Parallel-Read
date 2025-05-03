const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // ここにレンダラープロセスに公開したい機能を追加
  // 例: ファイル操作やIPC通信など
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  handleFileOpen: (callback) => ipcRenderer.on("file-opened", callback),
});
