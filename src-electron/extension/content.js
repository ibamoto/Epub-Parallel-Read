// Content script that runs in all frames (including iframes)
// This script can access the iframe's document even with cross-origin restrictions

(function() {
  'use strict';

  // Unique identifier for this frame
  const frameId = Math.random().toString(36).substring(7);
  const isTopFrame = window === window.top;

  // Listen for messages from the extension background script or main app
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'apply-font-size') {
      try {
        applyFontSize(request.fontSize);
        sendResponse({ success: true, frameId });
      } catch (error) {
        sendResponse({ success: false, error: error.message, frameId });
      }
      return true; // Keep the message channel open for async response
    } else if (request.action === 'prevent-horizontal-scroll') {
      try {
        preventHorizontalScroll();
        sendResponse({ success: true, frameId });
      } catch (error) {
        sendResponse({ success: false, error: error.message, frameId });
      }
      return true;
    } else if (request.action === 'get-scroll-info') {
      try {
        const scrollInfo = getScrollInfo();
        sendResponse({ success: true, scrollInfo, frameId });
      } catch (error) {
        sendResponse({ success: false, error: error.message, frameId });
      }
      return true;
    } else if (request.action === 'scroll-by') {
      try {
        scrollBy(request.distance);
        sendResponse({ success: true, frameId });
      } catch (error) {
        sendResponse({ success: false, error: error.message, frameId });
      }
      return true;
    } else if (request.action === 'set-scroll-ratio') {
      try {
        setScrollByRatio(request.ratio);
        sendResponse({ success: true, frameId });
      } catch (error) {
        sendResponse({ success: false, error: error.message, frameId });
      }
      return true;
    }
    return false;
  });

  // Listen for postMessage from parent window (for cross-origin iframe scrolling and styling)
  window.addEventListener('message', (event) => {
    // Security: 信頼できるソースのみ処理（親ウィンドウは常に許可）
    const trustedOrigins = new Set()
    try {
      const referrerOrigin = new URL(document.referrer || '').origin
      if (referrerOrigin) trustedOrigins.add(referrerOrigin)
    } catch (e) {
      // ignore invalid referrer
    }

    // Always allow same-origin messages
    trustedOrigins.add(window.location.origin)
    // For file:// origins, event.origin is "null"
    trustedOrigins.add('null')

    const isParent = event.source && event.source === window.parent
    const isTrustedOrigin = (event.origin && trustedOrigins.has(event.origin)) || isParent

    if (!isTrustedOrigin) {
      console.warn('Content script: rejected postMessage from untrusted origin', event.origin)
      return
    }

    if (event.data && event.data.type === 'PARALLEL_READ_SCROLL') {
      if (event.data.action === 'scroll-by') {
        try {
          console.log('Content script: received scroll message', event.data.distance);
          scrollBy(event.data.distance);
          console.log('Content script: scroll executed');
          // Send response back to parent
          if (event.source) {
            event.source.postMessage({
              type: 'PARALLEL_READ_RESPONSE',
              action: 'scroll-by',
              requestId: event.data.requestId,
              success: true
            }, '*');
          }
        } catch (error) {
          console.error('Content script: error scrolling via postMessage:', error);
          if (event.source) {
            event.source.postMessage({
              type: 'PARALLEL_READ_RESPONSE',
              action: 'scroll-by',
              requestId: event.data.requestId,
              success: false,
              error: error.message
            }, '*');
          }
        }
      } else if (event.data.action === 'prevent-horizontal-scroll') {
        try {
          console.log('Content script: received prevent horizontal scroll message');
          preventHorizontalScroll();
          console.log('Content script: horizontal scroll prevention applied');
        } catch (error) {
          console.error('Content script: error preventing horizontal scroll via postMessage:', error);
        }
      } else if (event.data.action === 'get-scroll-info') {
        try {
          console.log('Content script: received get-scroll-info request');
          const scrollInfo = getScrollInfo();
          // Send scroll info back to parent
          if (event.source) {
            event.source.postMessage({
              type: 'PARALLEL_READ_RESPONSE',
              action: 'get-scroll-info',
              requestId: event.data.requestId,
              success: true,
              scrollInfo: scrollInfo
            }, '*');
          }
          console.log('Content script: scroll info sent', scrollInfo);
        } catch (error) {
          console.error('Content script: error getting scroll info via postMessage:', error);
          if (event.source) {
            event.source.postMessage({
              type: 'PARALLEL_READ_RESPONSE',
              action: 'get-scroll-info',
              requestId: event.data.requestId,
              success: false,
              error: error.message
            }, '*');
          }
        }
      } else if (event.data.action === 'set-scroll-ratio') {
        try {
          console.log('Content script: received set-scroll-ratio request', event.data.ratio);
          setScrollByRatio(event.data.ratio);
          if (event.source) {
            event.source.postMessage({
              type: 'PARALLEL_READ_RESPONSE',
              action: 'set-scroll-ratio',
              requestId: event.data.requestId,
              success: true
            }, '*');
          }
        } catch (error) {
          console.error('Content script: error setting scroll ratio via postMessage:', error);
          if (event.source) {
            event.source.postMessage({
              type: 'PARALLEL_READ_RESPONSE',
              action: 'set-scroll-ratio',
              requestId: event.data.requestId,
              success: false,
              error: error.message
            }, '*');
          }
        }
      }
    } else if (event.data && event.data.type === 'PARALLEL_READ_FONT_SIZE') {
      if (event.data.action === 'apply-font-size') {
        try {
          console.log('Content script: received font size message', event.data.fontSize);
          applyFontSize(event.data.fontSize);
          console.log('Content script: font size applied');
        } catch (error) {
          console.error('Content script: error applying font size via postMessage:', error);
        }
      }
    }
  });

  // Apply font size to the document
  function applyFontSize(size) {
    console.log('Content script: applyFontSize called with size:', size);
    const scale = Math.max(0.5, Math.min(2, size / 100));
    let styleEl = document.getElementById('epub-parallel-read-font-size-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'epub-parallel-read-font-size-style';
      if (document.head) {
        document.head.appendChild(styleEl);
      } else {
        if (document.body) {
          document.body.insertBefore(styleEl, document.body.firstChild);
        } else {
          // If body doesn't exist yet, wait for it
          const observer = new MutationObserver((mutations, obs) => {
            if (document.body) {
              document.body.insertBefore(styleEl, document.body.firstChild);
              obs.disconnect();
            }
          });
          observer.observe(document.documentElement, { childList: true });
        }
      }
    }

    styleEl.textContent = `
      html {
        overflow-x: hidden !important;
        width: 100% !important;
        height: 100% !important;
        font-size: ${size}% !important;
        zoom: ${scale} !important;
      }
      body {
        overflow-x: hidden !important;
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        font-size: ${size}% !important;
        zoom: ${scale} !important;
        box-sizing: border-box !important;
      }
      /* Apply max-width to main content containers */
      body > *:not(script):not(style):not([style*="position: fixed"]):not([style*="position:absolute"]) {
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
      /* Ensure all block elements respect container width */
      div:not([style*="position: fixed"]):not([style*="position:absolute"]),
      section:not([style*="position: fixed"]):not([style*="position:absolute"]),
      article:not([style*="position: fixed"]):not([style*="position:absolute"]),
      main:not([style*="position: fixed"]):not([style*="position:absolute"]),
      header:not([style*="position: fixed"]):not([style*="position:absolute"]),
      footer:not([style*="position: fixed"]):not([style*="position:absolute"]),
      aside:not([style*="position: fixed"]):not([style*="position:absolute"]),
      nav:not([style*="position: fixed"]):not([style*="position:absolute"]) {
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
      img, video, iframe, embed, object {
        max-width: 100% !important;
        height: auto !important;
        box-sizing: border-box !important;
      }
      table {
        max-width: 100% !important;
        table-layout: auto !important;
        word-wrap: break-word !important;
        box-sizing: border-box !important;
      }
      /* Prevent fixed/absolute positioned elements from breaking layout */
      [style*="position: fixed"], [style*="position:absolute"] {
        max-width: none !important;
      }
    `;
  }

  // Prevent horizontal scroll
  function preventHorizontalScroll() {
    console.log('Content script: preventHorizontalScroll called');
    let styleEl = document.getElementById('epub-parallel-read-scroll-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'epub-parallel-read-scroll-style';
      if (document.head) {
        document.head.appendChild(styleEl);
      } else {
        if (document.body) {
          document.body.insertBefore(styleEl, document.body.firstChild);
        } else {
          // If body doesn't exist yet, wait for it
          const observer = new MutationObserver((mutations, obs) => {
            if (document.body) {
              document.body.insertBefore(styleEl, document.body.firstChild);
              obs.disconnect();
            }
          });
          observer.observe(document.documentElement, { childList: true });
        }
      }
    }

    styleEl.textContent = `
      html {
        overflow-x: hidden !important;
        width: 100% !important;
        height: 100% !important;
      }
      body {
        overflow-x: hidden !important;
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        box-sizing: border-box !important;
      }
      /* Apply max-width to main content containers */
      body > *:not(script):not(style):not([style*="position: fixed"]):not([style*="position:absolute"]) {
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
      /* Ensure all block elements respect container width */
      div:not([style*="position: fixed"]):not([style*="position:absolute"]),
      section:not([style*="position: fixed"]):not([style*="position:absolute"]),
      article:not([style*="position: fixed"]):not([style*="position:absolute"]),
      main:not([style*="position: fixed"]):not([style*="position:absolute"]),
      header:not([style*="position: fixed"]):not([style*="position:absolute"]),
      footer:not([style*="position: fixed"]):not([style*="position:absolute"]),
      aside:not([style*="position: fixed"]):not([style*="position:absolute"]),
      nav:not([style*="position: fixed"]):not([style*="position:absolute"]) {
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
      img, video, iframe, embed, object {
        max-width: 100% !important;
        height: auto !important;
        box-sizing: border-box !important;
      }
      table {
        max-width: 100% !important;
        table-layout: auto !important;
        word-wrap: break-word !important;
        box-sizing: border-box !important;
      }
      /* Prevent fixed/absolute positioned elements from breaking layout */
      [style*="position: fixed"], [style*="position:absolute"] {
        max-width: none !important;
      }
    `;
  }

  // Get scroll information
  function getScrollInfo() {
    const scrollTop = window.scrollY || window.pageYOffset || 0;
    const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
    const clientHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const maxScroll = Math.max(0, scrollHeight - clientHeight);
    const scrollRatio = maxScroll > 0 ? scrollTop / maxScroll : 0;

    return {
      scrollTop,
      scrollHeight,
      clientHeight,
      scrollRatio,
    };
  }

  // Scroll by distance
  function scrollBy(distance) {
    window.scrollBy({
      top: distance,
      behavior: 'smooth',
    });
  }

  // Set scroll position by ratio
  function setScrollByRatio(ratio) {
    const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
    const clientHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const maxScroll = Math.max(0, scrollHeight - clientHeight);
    const targetScroll = ratio * maxScroll;

    window.scrollTo({
      top: targetScroll,
      behavior: 'smooth',
    });
  }

  // Apply initial styles when document is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      preventHorizontalScroll();
    });
  } else {
    preventHorizontalScroll();
  }

  // Notify background script that content script is ready
  chrome.runtime.sendMessage({
    action: 'content-script-ready',
    frameId,
    isTopFrame,
    url: window.location.href,
  }).catch(() => {
    // Ignore errors if background script is not ready
  });
})();
