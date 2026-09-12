// Pro Downloader - Background Service Worker (Manifest V3)
const BACKEND_URL = "http://127.0.0.1:8000";

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

function injectInPageCompleteNotification(tabId, task) {
  // In-browser popup disabled per user request.
  // The system-wide native Windows notification is displayed globally by EggDL desktop app across any window.
  return;
}

function monitorDownloadTask(tabId, taskId) {
  // Polling disabled: native Windows notification handles completion globally.
  return;
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
          if (tab && tab.id) {
            injectInPageCompleteNotification(tab.id, saveRes.task || { filename, file_path: `Downloads\\EggDL\\${filename}`, category: 'image' });
          }
          return;
        } else {
          if (tab && tab.id) injectInPageToast(tab.id, `❌ Save failed: ${saveRes?.detail || 'Server error'}`, true);
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
          if (tab && tab.id) {
            injectInPageCompleteNotification(tab.id, saveRes.task || { filename, file_path: `Downloads\\EggDL\\${filename}`, category: 'image' });
          }
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
        injectInPageToast(tab.id, "Download started in EggDL!");
        if (dlRes.task_id) {
          monitorDownloadTask(tab.id, dlRes.task_id);
        }
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
      injectInPageToast(tab.id, "Download started in EggDL!");
      if (dlRes.task_id) {
        monitorDownloadTask(tab.id, dlRes.task_id);
      }
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
      lowerUrl.includes(".m4a") ||
      lowerUrl.includes(".mkv") ||
      lowerUrl.includes(".avi") ||
      lowerUrl.includes(".mov") ||
      lowerUrl.includes(".flv") ||
      lowerUrl.includes(".ts") ||
      lowerUrl.includes("/dload/") ||
      lowerUrl.includes("videoplayback") ||
      lowerUrl.includes("/unishr/files/") ||
      lowerUrl.includes("jiosicloud.com") ||
      lowerUrl.includes("jiocloud.com") ||
      lowerUrl.includes("jioaicloud.com") ||
      (lowerUrl.includes("/download/") && !lowerUrl.endsWith(".html") && !lowerUrl.endsWith(".js") && !lowerUrl.endsWith(".css")) ||
      (lowerUrl.includes("/stream/") && !lowerUrl.endsWith(".html") && !lowerUrl.endsWith(".js") && !lowerUrl.endsWith(".css"))
    );

    const isMediaHeader = (
      contentType.includes("video/") ||
      (contentType.includes("audio/") && (!contentLength || contentLength > 150000)) ||
      contentType.includes("application/vnd.apple.mpegurl") ||
      contentType.includes("application/x-mpegurl") ||
      contentType.includes("application/dash+xml") ||
      ((contentType.includes("application/octet-stream") || contentType.includes("binary/octet-stream")) && (contentLength > 500000 || lowerUrl.includes("stream") || lowerUrl.includes("download") || lowerUrl.includes("jio") || lowerUrl.includes("video")))
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
        } else if (contentLength > 100 * 1024 * 1024) {
          quality = `Video (${(contentLength / (1024 * 1024)).toFixed(0)} MB)`;
        } else if (contentLength > 0) {
          quality = `Stream (${(contentLength / (1024 * 1024)).toFixed(1)} MB)`;
        }

        let sizeFormatted = "";
        if (contentLength > 0) {
          sizeFormatted = contentLength >= 1024 * 1024 ? `${(contentLength / (1024 * 1024)).toFixed(1)} MB` : `${(contentLength / 1024).toFixed(0)} KB`;
        }

        const mediaItem = {
          url: url,
          type: contentType || "video/mp4",
          quality: quality,
          size: contentLength,
          sizeFormatted: sizeFormatted,
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

const CANDIDATE_PORTS = [8000, 8001, 8002, 8003, 8004, 8005];
let activeBackendUrl = "http://127.0.0.1:8000";

// Load persisted backend URL from storage upon service worker wakeup
chrome.storage.local.get({ eggdlBackendUrl: "http://127.0.0.1:8000" }, (items) => {
  if (items.eggdlBackendUrl) {
    activeBackendUrl = items.eggdlBackendUrl;
  }
});

async function discoverActiveBackend() {
  // Check current active URL first with fast probe
  try {
    const probe = await fetch(`${activeBackendUrl}/api/system/ping`, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(800) : undefined
    });
    if (probe.ok) return activeBackendUrl;
  } catch (_) {}

  for (const p of CANDIDATE_PORTS) {
    for (const host of ["127.0.0.1", "localhost"]) {
      const url = `http://${host}:${p}`;
      try {
        const res = await fetch(`${url}/api/system/ping`, {
          signal: AbortSignal.timeout ? AbortSignal.timeout(600) : undefined
        });
        if (res.ok) {
          activeBackendUrl = url;
          chrome.storage.local.set({ eggdlBackendUrl: url });
          return url;
        }
      } catch (e) {}
    }
  }
  return activeBackendUrl;
}

// Initial discovery and periodic keepalive + settings sync
async function syncBackendSettings() {
  try {
    const res = await fetchFromBackend("/api/settings");
    if (res && res.settings && res.settings.download_dir) {
      chrome.storage.local.set({ eggdlDownloadDir: res.settings.download_dir });
      return res.settings.download_dir;
    }
  } catch (_) {}
  return null;
}

discoverActiveBackend().then(() => syncBackendSettings());
setInterval(() => {
  discoverActiveBackend();
  syncBackendSettings();
}, 8000);

async function fetchFromBackend(endpoint, options = {}) {
  const isInspect = endpoint.includes('inspect') || endpoint.includes('sniff');
  const isDialog = endpoint.includes('select-folder') || endpoint.includes('browse_directory');
  const timeoutMs = isDialog ? 180000 : (isInspect ? 24000 : 8000);

  // First try active URL
  try {
    const res = await fetch(`${activeBackendUrl}${endpoint}`, {
      ...options,
      signal: options.signal || (AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined),
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      return data || { success: true };
    } else {
      return {
        success: false,
        status: res.status,
        ...(data || {}),
        message: data?.message || data?.detail || `HTTP ${res.status}`,
        detail: data?.detail || data?.message || `HTTP ${res.status}`
      };
    }
  } catch (e) {}

  // If active URL failed, auto-discover live server across candidate ports
  const liveBase = await discoverActiveBackend();
  try {
    const res = await fetch(`${liveBase}${endpoint}`, {
      ...options,
      signal: options.signal || (AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined),
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      return data || { success: true };
    } else {
      return {
        success: false,
        status: res.status,
        ...(data || {}),
        message: data?.message || data?.detail || `HTTP ${res.status}`,
        detail: data?.detail || data?.message || `HTTP ${res.status}`
      };
    }
  } catch (err) {
    console.warn("EggDL backend connection error:", err);
    return { success: false, detail: "Cannot connect to EggDL application. Please ensure EggDL app is running." };
  }
}

// Handle extension messaging
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = request.tabId || (sender.tab ? sender.tab.id : null);

  if (request.action === "get_tab_media") {
    sendResponse({ media: tabMediaStore[tabId] || [] });
    return true;
  }

  if (request.action === "get_download_dir" || request.action === "get_settings") {
    syncBackendSettings().then(dir => {
      if (dir) {
        sendResponse({ success: true, download_dir: dir });
      } else {
        chrome.storage.local.get(['eggdlDownloadDir'], (st) => {
          sendResponse({ success: !!st?.eggdlDownloadDir, download_dir: st?.eggdlDownloadDir || null });
        });
      }
    }).catch(() => {
      chrome.storage.local.get(['eggdlDownloadDir'], (st) => {
        sendResponse({ success: !!st?.eggdlDownloadDir, download_dir: st?.eggdlDownloadDir || null });
      });
    });
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
    sendDownload(request.payload).then(res => {
      sendResponse(res);
      if (res && res.success && res.task_id && tabId) {
        monitorDownloadTask(tabId, res.task_id);
      }
    });
    return true;
  }

  if (request.action === "save_file") {
    saveDirectFile(request.payload).then(res => {
      sendResponse(res);
      if (res && res.success && tabId) {
        injectInPageCompleteNotification(tabId, res.task || { filename: request.payload.filename, file_path: `Downloads\\EggDL\\${request.payload.filename}`, category: request.payload.category || 'file' });
      }
    });
    return true;
  }

  if (request.action === "open_file") {
    fetchFromBackend("/api/system/open-file", {
      method: "POST",
      body: JSON.stringify({ file_path: request.file_path, task_id: request.task_id })
    }).then(data => sendResponse(data)).catch(err => sendResponse({ success: false }));
    return true;
  }

  if (request.action === "open_folder") {
    fetchFromBackend("/api/system/open-folder", {
      method: "POST",
      body: JSON.stringify({ file_path: request.file_path, task_id: request.task_id })
    }).then(data => sendResponse(data)).catch(err => sendResponse({ success: false }));
    return true;
  }

  if (request.action === "select_folder") {
    fetchFromBackend("/api/system/select-folder", {
      method: "POST"
    }).then(data => sendResponse(data)).catch(err => sendResponse({ success: false }));
    return true;
  }

  if (request.action === "dock_add") {
    fetchFromBackend("/api/dock/add", {
      method: "POST",
      body: JSON.stringify(request.payload)
    }).then(data => sendResponse(data)).catch(err => sendResponse({ success: false }));
    chrome.tabs.query({}, (tabs) => {
      for (const tab of (tabs || [])) {
        if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { action: "dock_sync" }).catch(() => {});
      }
    });
    return true;
  }

  if (request.action === "dock_remove") {
    fetchFromBackend("/api/dock/remove", {
      method: "POST",
      body: JSON.stringify({ id: request.id })
    }).then(data => sendResponse(data)).catch(err => sendResponse({ success: false }));
    chrome.tabs.query({}, (tabs) => {
      for (const tab of (tabs || [])) {
        if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { action: "dock_sync" }).catch(() => {});
      }
    });
    return true;
  }

  if (request.action === "bypass_browser_download") {
    const url = request.url;
    if (url) {
      eggdlBypassedUrls.add(url);
      chrome.downloads.download({ url: url }, (newId) => {
        if (newId) eggdlBypassedDownloadIds.add(newId);
        setTimeout(() => {
          eggdlBypassedUrls.delete(url);
          if (newId) eggdlBypassedDownloadIds.delete(newId);
        }, 15000);
      });
    }
    sendResponse({ success: true });
    return true;
  }
});

async function sendDownload(payload) {
  if (payload && payload.url) {
    eggdlInitiatedUrls.add(payload.url);
    setTimeout(() => eggdlInitiatedUrls.delete(payload.url), 30000);

    // Auto-extract session cookies from Chrome if not already provided
    if (!payload.cookies && typeof chrome !== 'undefined' && chrome.cookies && chrome.cookies.getAll) {
      try {
        const cks = await chrome.cookies.getAll({ url: payload.url });
        if (cks && cks.length > 0) {
          payload.cookies = cks.map(c => `${c.name}=${c.value}`).join('; ');
        }
      } catch (_) {}
    }
  }
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

// --- IDM-STYLE AUTOMATIC BROWSER DOWNLOAD INTERCEPTION ---
const eggdlInitiatedUrls = new Set();
const eggdlBypassedUrls = new Set();
const eggdlBypassedDownloadIds = new Set();

if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.onCreated) {
  chrome.downloads.onCreated.addListener(async (downloadItem) => {
    try {
      const downloadId = downloadItem.id;
      const url = downloadItem.finalUrl || downloadItem.url;
      if (!url || url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('chrome-extension://')) {
        return; // Ignore internal blob/data streams
      }

      // Check if initiated by EggDL or explicitly bypassed by user
      if (eggdlInitiatedUrls.has(url) || eggdlBypassedUrls.has(url) || eggdlBypassedDownloadIds.has(downloadId) || downloadItem.byExtensionId === chrome.runtime.id) {
        return;
      }

      // 1. Cancel Chrome native download immediately so EggDL can take over
      try {
        await chrome.downloads.cancel(downloadId);
        await chrome.downloads.erase({ id: downloadId });
      } catch (_) {}

      // 2. Extract file details
      let filename = downloadItem.filename ? downloadItem.filename.split(/[\\\/]/).pop() : '';
      if (!filename || filename === 'download') {
        try {
          const urlObj = new URL(url);
          filename = decodeURIComponent(urlObj.pathname.split('/').pop()) || 'download';
        } catch (_) {
          filename = 'download';
        }
      }

      let fileSize = (downloadItem.totalBytes && downloadItem.totalBytes > 0) ? downloadItem.totalBytes : (downloadItem.fileSize || 0);
      let mime = downloadItem.mime || '';

      // If filesize or filename is missing, perform a fast background HEAD probe
      if (!fileSize || fileSize <= 0) {
        try {
          const headRes = await fetch(url, { method: 'HEAD' });
          const cl = headRes.headers.get('content-length');
          if (cl) fileSize = parseInt(cl, 10);
          const cd = headRes.headers.get('content-disposition');
          if (cd && cd.includes('filename=')) {
            const match = cd.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i);
            if (match && match[1]) filename = decodeURIComponent(match[1].trim());
          }
          if (!mime) mime = headRes.headers.get('content-type') || '';
        } catch (_) {}
      }

      let configuredDir = null;
      try {
        const settingsRes = await fetchFromBackend("/api/settings");
        if (settingsRes && settingsRes.settings && settingsRes.settings.download_dir) {
          configuredDir = settingsRes.settings.download_dir;
          chrome.storage.local.set({ eggdlDownloadDir: configuredDir });
        }
      } catch (_) {}
      if (!configuredDir) {
        try {
          const localSt = await new Promise(r => chrome.storage.local.get(['eggdlDownloadDir'], r));
          if (localSt && localSt.eggdlDownloadDir) {
            configuredDir = localSt.eggdlDownloadDir;
          }
        } catch (_) {}
      }

      let cookiesStr = '';
      try {
        if (chrome.cookies && chrome.cookies.getAll) {
          const cks = await chrome.cookies.getAll({ url: url });
          if (cks && cks.length > 0) {
            cookiesStr = cks.map(c => `${c.name}=${c.value}`).join('; ');
          }
        }
      } catch (_) {}

      const downloadInfo = {
        url: url,
        filename: filename,
        file_size: fileSize,
        mime: mime,
        referrer: downloadItem.referrer || '',
        cookies: cookiesStr,
        download_dir: configuredDir
      };

      // 3. Send message to active tab to display centered IDM dialog
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0 && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "show_idm_download_dialog",
            download: downloadInfo
          }, () => {});
        }
      });
    } catch (err) {
      console.warn("EggDL download interception error:", err);
    }
  });
}

