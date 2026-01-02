// Background service worker for the extension
// This script handles communication between the main app and content scripts

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'content-script-ready') {
    // Content script is ready, store the tab/frame info
    // This can be used to track which frames are available
    console.log('Content script ready in frame:', request.frameId, request.url);
    sendResponse({ success: true });
    return true;
  }
  
  // Forward messages from main app to content scripts
  // This will be handled by the main Electron app via IPC
  return false;
});

// Listen for messages from the main Electron app
// Note: This requires the extension to be loaded by Electron
chrome.runtime.onConnectExternal.addListener((port) => {
  console.log('External connection established');
  
  port.onMessage.addListener((message) => {
    // Handle messages from Electron main process
    if (message.action === 'inject-to-frame') {
      // Find the target frame and inject the script
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              // This will be executed in the content script context
              return true;
            },
          });
        });
      });
    }
  });
});

