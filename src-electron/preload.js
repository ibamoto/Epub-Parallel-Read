const { contextBridge } = require('electron')
const fs = require('fs')
const path = require('path')

// Get version from package.json
let version = '2.0.0'
try {
  const packageJsonPath = path.join(__dirname, '..', 'package.json')
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
  version = pkg.version
} catch (e) {
  console.warn('Could not read package.json version:', e.message)
}

// Expose version
contextBridge.exposeInMainWorld('appVersion', version)

// Expose filesystem operations (read-only for security)
contextBridge.exposeInMainWorld('myFS', {
  existsSync: (filePath) => {
    try {
      return fs.existsSync(filePath)
    } catch (e) {
      console.error('Error in existsSync:', e)
      return false
    }
  },
  readFileSync: (filePath) => {
    try {
      return fs.readFileSync(filePath)
    } catch (e) {
      console.error('Error in readFileSync:', e)
      return null
    }
  },
})

// Prevent drag-and-drop from navigating
window.addEventListener('DOMContentLoaded', () => {
  const preventDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  document.addEventListener('dragenter', preventDrag, false)
  document.addEventListener('dragover', preventDrag, false)
  document.addEventListener('dragleave', preventDrag, false)
  document.addEventListener('drop', preventDrag, false)
})
