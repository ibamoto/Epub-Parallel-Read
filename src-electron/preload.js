const { contextBridge } = require("electron");
const fs = require("fs");
const path = require("path");

// package.jsonのバージョンを取得
const packageJsonPath = path.join(__dirname, "..", "package.json");
let version = "unknown";
try {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  version = pkg.version;
} catch (e) {
  console.error("Error reading package.json:", e);
}

// ファイルシステム操作を安全に公開
contextBridge.exposeInMainWorld("myFS", {
  existsSync: (filePath) => {
    try {
      console.log("Checking if file exists:", filePath);
      const exists = fs.existsSync(filePath);
      console.log("File exists:", exists);
      return exists;
    } catch (e) {
      console.error("Error in existsSync:", e);
      return false;
    }
  },
  readFileSync: (filePath) => {
    try {
      console.log("Reading file:", filePath);
      const data = fs.readFileSync(filePath);
      console.log("File read successfully, size:", data.length);
      return data;
    } catch (e) {
      console.error("Error in readFileSync:", e);
      return null;
    }
  },
});

contextBridge.exposeInMainWorld("appVersion", version);
