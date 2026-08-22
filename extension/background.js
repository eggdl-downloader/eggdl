// Pro Downloader - Background Service Worker (Manifest V3)
const BACKEND_URL = "http://localhost:8000";

// In-memory tab media store
const tabMediaStore = {};

// YouTube itag resolution mapping
const ITAG_MAP = {
  "571": "8K UHD (4320p)",
  "272": "8K UHD (4320p)",
  "401": "4K UHD (2160p)",
  "313": "4K UHD (2160p)",
  "400": "2K QHD (1440p)",
  "271": "2K QHD (1440p)",
  "399": "1080p FHD",
  "248": "1080p FHD",
  "137": "1080p FHD",
  "398": "720p HD",
  "247": "720p HD",
  "136": "720p HD",
  "22": "720p HD",
  "397": "480p SD",
  "244": "480p SD",
  "135": "480p SD",
  "396": "360p",
  "243": "360p",
  "134": "360p",
  "18": "360p",
  "242": "240p",
  "133": "240p",
  "278": "144p",
  "160": "144p",
  "140": "Audio (128kbps M4A)",
  "251": "Audio (Opus 160kbps)"
};

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, len)));
  }
  return btoa(binary);
}

function injectInPageToast(tabId, message, isError = false) {
  if (!tabId) return;
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (msg, err) => {
      const existing = document.querySelectorAll('.egg-dl-inpage-toast');
      existing.forEach(e => e.remove());

      const toast = document.createElement('div');
      toast.className = 'egg-dl-inpage-toast';
      toast.style.cssText = `
        position: fixed !important;
        bottom: 28px !important;
        right: 28px !important;
        background: ${err ? 'rgba(239, 68, 68, 0.95)' : 'rgba(15, 23, 42, 0.95)'} !important;
        color: #ffffff !important;
        padding: 12px 22px !important;
        border-radius: 12px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 14px !important;
        font-weight: 600 !important;
        box-shadow: 0 10px 30px rgba(0,0,0,0.6) !important;
        border: 1px solid ${err ? '#f87171' : 'rgba(0, 210, 255, 0.5)'} !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
        transform: translateY(0) !important;
        opacity: 1 !important;
        pointer-events: none !important;
      `;
      toast.innerText = msg;
      document.body.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(12px)';
        setTimeout(() => toast.remove(), 350);
      }, 3500);
    },
    args: [message, isError]
  }).catch(() => {});
}

async function executeInPageImageCapture(tabId, srcUrl) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: async (targetUrl) => {
        // 1. Check if blob: URL -> fetch blob in page context
        if (targetUrl && targetUrl.startsWith('blob:')) {
          try {
            const resp = await fetch(targetUrl);
            if (resp.ok) {
              const blob = await resp.blob();
              return await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve({
                  success: true,
                  dataUrl: reader.result,
                  title: document.title || "image"
                });
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              });
            }
          } catch (e) {}
        }

        // 2. Locate <img> element matching targetUrl or active right click
        let img = window.__lastRightClickedImg;
        if (!img && targetUrl) {
          try {
            const cleanUrl = targetUrl.split('?')[0];
            img = document.querySelector(`img[src="${CSS.escape(targetUrl)}"], img[src*="${cleanUrl}"]`);
          } catch (e) {}
        }
        if (!img) {
          const allImgs = Array.from(document.querySelectorAll('img'));
          img = allImgs.find(i => i.src === targetUrl || i.currentSrc === targetUrl);
        }

        // 3. Try Canvas drawing from <img> element (bypasses CORS / anti-hotlink when already rendered)
        if (img && img.naturalWidth > 0) {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            if (dataUrl && dataUrl.length > 50) {
              return {
                success: true,
                dataUrl: dataUrl,
                title: img.alt || img.title || document.title
              };
            }
          } catch (e) {}
        }

        // 4. Try page-level fetch with session cookies
        if (targetUrl) {
          try {
            const resp = await fetch(targetUrl, { credentials: 'include' });
            if (resp.ok) {
              const blob = await resp.blob();
              return await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve({
                  success: true,
                  dataUrl: reader.result,
                  title: img?.alt || img?.title || document.title
                });
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              });
            }
          } catch (e) {}
        }

        return { success: false };
      },
      args: [srcUrl]
    });

    if (results && results[0] && results[0].result && results[0].result.success) {
      return results[0].result;
    }
  } catch (err) {
    console.warn("In-page script execution error:", err);
  }
  return null;
}

// Create Context Menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "egg-dl-media",
      title: "Download with EggDL",
      contexts: ["image", "video", "audio", "link"]
    });

    chrome.contextMenus.create({
      id: "egg-dl-page",
      title: "Inspect Media with EggDL",
      contexts: ["page"]
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const isImage = info.mediaType === "image" || (info.srcUrl && (/\.(png|jpe?g|gif|webp|svg|ico|bmp)/i.test(info.srcUrl) || info.srcUrl.startsWith('blob:') || !info.linkUrl));
  const targetUrl = info.srcUrl || info.linkUrl || (tab ? tab.url : null);
  if (!targetUrl) return;

  const pageReferer = tab ? tab.url : null;
  const pageTitle = tab ? tab.title : "Web Download";

  if (isImage && info.srcUrl) {
    // 1. Try in-page DOM canvas / blob execution
    if (tab && tab.id) {
      const domCapture = await executeInPageImageCapture(tab.id, info.srcUrl);
      if (domCapture && domCapture.success && domCapture.dataUrl) {
        const base64data = domCapture.dataUrl.split(',')[1];
        let filename = "";
        try {
          const parsed = new URL(info.srcUrl);
          filename = decodeURIComponent(parsed.pathname.split('/').pop() || "");
        } catch (e) {}
        if (!filename || !filename.includes('.') || filename.length > 50) {
          filename = (domCapture.title ? domCapture.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) : `image_${Date.now()}`) + ".png";
        }

        const saveRes = await saveDirectFile({
          filename: filename,
          data_base64: base64data,
          url: info.srcUrl,
          title: domCapture.title || filename,
          category: "image"
        });

        if (saveRes && saveRes.success) {
          injectInPageToast(tab.id, "🥚 Download started in EggDL!");
          return;
        } else {
          injectInPageToast(tab.id, `❌ Save failed: ${saveRes?.detail || 'Server error'}`, true);
          return;
        }
      }
    }

    // 2. Direct fetch with service worker host permissions
    try {
      const response = await fetch(info.srcUrl);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const base64data = arrayBufferToBase64(buffer);
        let filename = "";
        try {
          const parsed = new URL(info.srcUrl);
          filename = decodeURIComponent(parsed.pathname.split('/').pop() || "");
        } catch (e) {}
        if (!filename || !filename.includes('.')) {
          filename = `image_${Date.now()}.png`;
        }

        const saveRes = await saveDirectFile({
          filename: filename,
          data_base64: base64data,
          url: info.srcUrl,
          title: filename,
          category: "image"
        });

        if (saveRes && saveRes.success) {
          if (tab && tab.id) injectInPageToast(tab.id, "🥚 Download started in EggDL!");
          return;
        }
      }
    } catch (err) {
      console.warn("Direct image buffer fetch failed:", err);
    }

    // 3. Fallback to backend download
    const dlRes = await sendDownload({
      url: targetUrl,
      category: "image",
      referer: pageReferer,
      download_type: "direct"
    });

    if (tab && tab.id) {
      if (dlRes && dlRes.success) {
        injectInPageToast(tab.id, "🥚 Download started in EggDL!");
      } else {
        injectInPageToast(tab.id, `❌ Download failed: ${dlRes?.detail || 'Could not connect'}`, true);
      }
    }
    return;
  }

  // Links & Streams
  const dlRes = await sendDownload({
    url: targetUrl,
    custom_title: pageTitle,
    referer: pageReferer,
    download_type: "auto"
  });

  if (tab && tab.id) {
    if (dlRes && dlRes.success) {
      injectInPageToast(tab.id, "🥚 Download started in EggDL!");
    } else {
      injectInPageToast(tab.id, `❌ Download failed: ${dlRes?.detail || 'Could not connect'}`, true);
    }
  }
});

// Ignore static assets & UI notification sound files
const IGNORE_PATTERNS = [
  "webmanifest", "manifest.json", "analytics", "googleads", "doubleclick",
  "failure.mp3", "success.mp3", "no_input.mp3", "open.mp3", "pop.mp3",
  "click.mp3", "notification.mp3", "ping.mp3", "favicon", ".svg", ".png", ".jpg"
];

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const { tabId, url, responseHeaders } = details;
    if (tabId < 0 || !url) return;

    const lowerUrl = url.toLowerCase();
    for (const pat of IGNORE_PATTERNS) {
      if (lowerUrl.includes(pat)) return;
    }

    let contentType = "";
    let contentLength = 0;

    for (const h of responseHeaders || []) {
      const name = h.name.toLowerCase();
      if (name === "content-type") contentType = h.value.toLowerCase();
      if (name === "content-length") contentLength = parseInt(h.value, 10) || 0;
    }

    // Ignore tiny audio files (< 150KB) as they are website UI click sounds
    if (contentType.includes("audio") && contentLength > 0 && contentLength < 150000) {
      return;
    }

    const isMediaUrl = (
      lowerUrl.includes(".m3u8") ||
      lowerUrl.includes(".mpd") ||
      lowerUrl.includes(".mp4") ||
      lowerUrl.includes(".webm") ||
      lowerUrl.includes(".m4s") ||
      lowerUrl.includes("/dload/") ||
      lowerUrl.includes("videoplayback")
    );

    const isMediaHeader = (
      contentType.includes("video/") ||
      (contentType.includes("audio/") && (!contentLength || contentLength > 150000)) ||
      contentType.includes("application/vnd.apple.mpegurl") ||
      contentType.includes("application/x-mpegurl") ||
      contentType.includes("application/dash+xml")
    );

    if (isMediaUrl || isMediaHeader) {
      if (!tabMediaStore[tabId]) {
        tabMediaStore[tabId] = [];
      }

      const exists = tabMediaStore[tabId].some(item => item.url === url);
      if (!exists) {
        let quality = "HD Stream";

        // Check YouTube itag
        const itagMatch = url.match(/[?&]itag=(\d+)/);
        if (itagMatch && ITAG_MAP[itagMatch[1]]) {
          quality = ITAG_MAP[itagMatch[1]];
        } else if (lowerUrl.includes("4320p") || lowerUrl.includes("8k")) {
          quality = "8K UHD (4320p)";
        } else if (lowerUrl.includes("2160p") || lowerUrl.includes("4k")) {
          quality = "4K UHD (2160p)";
        } else if (lowerUrl.includes("1440p") || lowerUrl.includes("2k")) {
          quality = "2K QHD (1440p)";
        } else if (lowerUrl.includes("1080p")) {
          quality = "1080p Full HD";
        } else if (lowerUrl.includes("720p")) {
          quality = "720p HD";
        } else if (lowerUrl.includes("480p")) {
          quality = "480p SD";
        } else if (lowerUrl.includes("360p")) {
          quality = "360p";
        } else if (lowerUrl.includes("240p")) {
          quality = "240p";
        } else if (lowerUrl.includes("144p")) {
          quality = "144p";
        } else if (contentType.includes("audio")) {
          quality = "HQ Audio";
        }

        const mediaItem = {
          url: url,
          type: contentType || "video/mp4",
          quality: quality,
          size: contentLength,
          capturedAt: Date.now()
        };

        tabMediaStore[tabId].push(mediaItem);
        chrome.action.setBadgeText({ tabId: tabId, text: String(tabMediaStore[tabId].length) });
        chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: "#3B82F6" });
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabMediaStore[tabId];
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    tabMediaStore[tabId] = [];
    chrome.action.setBadgeText({ tabId: tabId, text: "" });
  }
});

const CANDIDATE_SERVERS = [
  "http://127.0.0.1:8000",
  "http://localhost:8000",
  "http://127.0.0.1:8001",
  "http://localhost:8001"
];
let activeBackendUrl = "http://127.0.0.1:8000";

async function fetchFromBackend(endpoint, options = {}) {
  const urlsToTry = [activeBackendUrl, ...CANDIDATE_SERVERS.filter(u => u !== activeBackendUrl)];
  let lastError = null;

  for (const base of urlsToTry) {
    try {
      const res = await fetch(`${base}${endpoint}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      });
      if (res.ok) {
        activeBackendUrl = base;
        return await res.json();
      }
    } catch (err) {
      lastError = err;
    }
  }
  console.error("EggDL backend connection error:", lastError);
  return { success: false, detail: lastError ? String(lastError) : "Cannot connect to EggDL application" };
}

// Handle extension messaging
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "get_tab_media") {
    const tabId = request.tabId || (sender.tab ? sender.tab.id : null);
    sendResponse({ media: tabMediaStore[tabId] || [] });
    return true;
  }

  if (request.action === "inspect_page") {
    fetchFromBackend("/api/inspect", {
      method: "POST",
      body: JSON.stringify({ url: request.url })
    }).then(data => sendResponse(data))
      .catch(err => sendResponse({ success: false, detail: String(err) }));
    return true;
  }

  if (request.action === "download_task") {
    sendDownload(request.payload).then(res => sendResponse(res));
    return true;
  }
});

async function sendDownload(payload) {
  return await fetchFromBackend("/api/download/start", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

async function saveDirectFile(payload) {
  return await fetchFromBackend("/api/download/save_file", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
