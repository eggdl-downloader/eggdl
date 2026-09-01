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
  if (!tabId || !task) return;
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (taskData, backendUrl) => {
      // 1. Play Epidemic Sound Notification 18 in the webpage
      try {
        const audioUri = "data:audio/mp3;base64,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jT6JIzFYmBCm+FVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVOFWE7vqVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7lGRUj/AWAIADgAAIAoAQAGwAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7lGRRj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7lGRRj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7lGRRj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7lGRRj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7lGRRj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7lGRRj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7lGRRj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==";
        const snd = new Audio(audioUri);
        snd.volume = 0.85;
        snd.play().catch(() => {});
      } catch (e) {}

      // 2. Render Premium Classy In-Page Completion Popup
      const existing = document.querySelectorAll('.egg-dl-inpage-complete-popup');
      existing.forEach(e => e.remove());

      const popup = document.createElement('div');
      popup.className = 'egg-dl-inpage-complete-popup';
      popup.style.cssText = `
        position: fixed !important;
        bottom: 24px !important;
        right: 24px !important;
        z-index: 2147483647 !important;
        background: rgba(13, 17, 23, 0.96) !important;
        backdrop-filter: blur(28px) saturate(190%) !important;
        -webkit-backdrop-filter: blur(28px) saturate(190%) !important;
        border: 1px solid rgba(255, 255, 255, 0.12) !important;
        border-top: 1px solid rgba(255, 255, 255, 0.22) !important;
        border-radius: 14px !important;
        box-shadow: 0 24px 60px -10px rgba(0, 0, 0, 0.85), 0 0 1px 1px rgba(255, 255, 255, 0.08) !important;
        color: #F8FAFC !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif !important;
        width: 380px !important;
        max-width: calc(100vw - 48px) !important;
        padding: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
        transform: translateY(18px) scale(0.96) !important;
        opacity: 0 !important;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
        user-select: none !important;
        pointer-events: auto !important;
      `;

      const title = taskData.title || taskData.filename || 'Downloaded File';
      const rawFilePath = taskData.file_path || (taskData.filename ? 'Downloads\\EggDL\\' + taskData.filename : 'Downloads\\EggDL');
      
      // Extract directory path only (without filename) so it looks clean and concise
      let dirPath = '';
      const lastSlashIdx = Math.max(rawFilePath.lastIndexOf('\\'), rawFilePath.lastIndexOf('/'), rawFilePath.lastIndexOf('\\'));
      if (lastSlashIdx !== -1) {
        dirPath = rawFilePath.substring(0, lastSlashIdx + 1);
      } else {
        dirPath = 'Downloads\\EggDL\\';
      }
      if (!dirPath.endsWith('\\') && !dirPath.endsWith('/') && !dirPath.endsWith('\\')) {
        dirPath += '\\';
      }
      const category = (taskData.category || 'file').toLowerCase();
      
      const realLogoUrl = chrome.runtime.getURL('icons/egg-icon.png') || chrome.runtime.getURL('icons/icon128.png');

      // Real File Size calculation in exact IDM style: "Downloaded 414.94 KB (424902 Bytes)"
      const rawBytes = (taskData.file_size && taskData.file_size > 0) ? taskData.file_size : (taskData.downloaded_bytes || 0);
      let sizeStr = '';
      if (rawBytes >= 1024 * 1024 * 1024) {
        sizeStr = (rawBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
      } else if (rawBytes >= 1024 * 1024) {
        sizeStr = (rawBytes / (1024 * 1024)).toFixed(2) + ' MB';
      } else if (rawBytes >= 1024) {
        sizeStr = (rawBytes / 1024).toFixed(2) + ' KB';
      } else if (rawBytes > 0) {
        sizeStr = rawBytes + ' Bytes';
      } else {
        sizeStr = '0 Bytes';
      }
      const detailedSizeText = rawBytes > 0 ? `Downloaded ${sizeStr} (${rawBytes} Bytes)` : `Downloaded ${sizeStr}`;

      // File Format / Extension detection
      let fileExt = '';
      if (taskData.filename && taskData.filename.includes('.')) {
        fileExt = taskData.filename.split('.').pop().toUpperCase();
      } else if (taskData.file_path && taskData.file_path.includes('.')) {
        fileExt = taskData.file_path.split('.').pop().toUpperCase();
      } else if (taskData.audio_format) {
        fileExt = taskData.audio_format.toUpperCase();
      } else {
        fileExt = (taskData.category || 'FILE').toUpperCase();
      }

      // Category Stroke Icons (Clean, Premium, Classy Vector SVGs)
      let catIconSvg = '';
      let catBadgeColor = '#38BDF8';
      let catBg = 'rgba(56, 189, 248, 0.12)';
      let catBorder = 'rgba(56, 189, 248, 0.25)';

      if (category === 'video') {
        catBadgeColor = '#C084FC';
        catBg = 'rgba(192, 132, 252, 0.12)';
        catBorder = 'rgba(192, 132, 252, 0.25)';
        catIconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C084FC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>';
      } else if (category === 'image') {
        catBadgeColor = '#F472B6';
        catBg = 'rgba(244, 114, 182, 0.12)';
        catBorder = 'rgba(244, 114, 182, 0.25)';
        catIconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F472B6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
      } else if (category === 'audio') {
        catBadgeColor = '#FBBF24';
        catBg = 'rgba(251, 191, 36, 0.12)';
        catBorder = 'rgba(251, 191, 36, 0.25)';
        catIconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
      } else if (category === 'document' || title.toLowerCase().endsWith('.pdf') || title.toLowerCase().endsWith('.doc')) {
        catBadgeColor = '#34D399';
        catBg = 'rgba(52, 211, 153, 0.12)';
        catBorder = 'rgba(52, 211, 153, 0.25)';
        catIconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34D399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
      } else if (category === 'compressed' || title.toLowerCase().endsWith('.zip') || title.toLowerCase().endsWith('.rar')) {
        catBadgeColor = '#FB7185';
        catBg = 'rgba(251, 113, 133, 0.12)';
        catBorder = 'rgba(251, 113, 133, 0.25)';
        catIconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FB7185" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>';
      } else {
        catIconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>';
      }

      popup.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 11px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${realLogoUrl}" alt="EggDL" style="width: 19px; height: 19px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
            <span style="font-size: 13px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.01em;">Download complete</span>
          </div>
          <button type="button" class="egg-dl-close-btn" style="background: transparent; border: none; color: #94A3B8; cursor: pointer; padding: 4px 6px; border-radius: 6px; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease;" title="Close">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style="padding: 12px 14px 10px 14px; display: flex; flex-direction: column; gap: 9px;">
          <div style="display: flex; align-items: center; gap: 11px;">
            <div style="width: 36px; height: 36px; border-radius: 9px; background: ${catBg}; border: 1px solid ${catBorder}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              ${catIconSvg}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 13px; font-weight: 600; color: #FFFFFF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.35;" title="${title}">${title}</div>
              <div style="font-size: 11px; font-weight: 500; color: #94A3B8; margin-top: 3px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="color: #CBD5E1; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 10.5px;">${detailedSizeText}</span>
                <span style="color: #64748B;">•</span>
                <span style="color: ${catBadgeColor}; font-weight: 700; font-size: 10px; background: ${catBg}; border: 1px solid ${catBorder}; padding: 1px 5px; border-radius: 4px; letter-spacing: 0.3px;">${fileExt}</span>
              </div>
            </div>
          </div>

          <div class="egg-dl-path-container" style="background: rgba(0, 0, 0, 0.45); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 6px 8px 6px 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; transition: all 0.15s ease;">
            <div class="egg-dl-path-text-area" style="display: flex; align-items: center; gap: 7px; min-width: 0; flex: 1; cursor: pointer;" title="Open containing folder: ${dirPath}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
              <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; color: #94A3B8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${dirPath}</span>
            </div>
            <button type="button" class="egg-dl-copy-path-btn" title="Copy file path" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 4px 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #94A3B8; transition: all 0.15s ease; flex-shrink: 0;">
              <svg class="egg-dl-copy-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              <span class="egg-dl-copied-text" style="display: none; font-size: 10px; font-weight: 700; color: #10B981; margin-left: 3px;">Copied!</span>
            </button>
          </div>
        </div>

        <div style="padding: 2px 14px 13px 14px; display: flex; gap: 8px;">
          <button type="button" class="egg-dl-open-btn" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; background: linear-gradient(180deg, #2563EB 0%, #1D4ED8 100%); color: #FFFFFF; border: 1px solid rgba(255,255,255,0.18); font-size: 12.5px; font-weight: 600; padding: 7.5px 14px; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35), inset 0 1px 0 rgba(255,255,255,0.25); transition: all 0.15s ease;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            <span>Open</span>
          </button>
          <button type="button" class="egg-dl-folder-btn" style="display: flex; align-items: center; justify-content: center; gap: 6px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.12); color: #E2E8F0; font-size: 12px; font-weight: 500; padding: 7.5px 13px; border-radius: 8px; cursor: pointer; transition: all 0.15s ease;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
            <span>Folder</span>
          </button>
        </div>

        <div style="height: 2px; background: rgba(255,255,255,0.06); width: 100%; position: relative;">
          <div class="egg-dl-bar" style="height: 100%; background: linear-gradient(90deg, #38BDF8, #10B981); width: 100%; transition: width 7.5s linear;"></div>
        </div>
      `;

      document.body.appendChild(popup);

      // Trigger entrance animation
      requestAnimationFrame(() => {
        popup.style.opacity = '1';
        popup.style.transform = 'translateY(0) scale(1)';
        const bar = popup.querySelector('.egg-dl-bar');
        if (bar) {
          setTimeout(() => { bar.style.width = '0%'; }, 50);
        }
      });

      const dismiss = () => {
        popup.style.opacity = '0';
        popup.style.transform = 'translateY(18px) scale(0.96)';
        setTimeout(() => popup.remove(), 300);
      };

      let timer = setTimeout(dismiss, 7500);

      popup.querySelector('.egg-dl-close-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        clearTimeout(timer);
        dismiss();
      });

      popup.querySelector('.egg-dl-open-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          chrome.runtime.sendMessage({
            action: 'open_file',
            file_path: taskData.file_path,
            task_id: taskData.id
          });
        } catch (err) {}
        dismiss();
      });

      const openFolder = (e) => {
        e.stopPropagation();
        try {
          chrome.runtime.sendMessage({
            action: 'open_folder',
            file_path: taskData.file_path,
            task_id: taskData.id
          });
        } catch (err) {}
        dismiss();
      };

      popup.querySelector('.egg-dl-folder-btn')?.addEventListener('click', openFolder);
      popup.querySelector('.egg-dl-path-text-area')?.addEventListener('click', openFolder);

      // Copy Path Event Handler
      const copyBtn = popup.querySelector('.egg-dl-copy-path-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(dirPath);
            } else {
              const input = document.createElement('input');
              input.value = dirPath;
              document.body.appendChild(input);
              input.select();
              document.execCommand('copy');
              input.remove();
            }
          } catch (_) {}

          const copyIcon = copyBtn.querySelector('.egg-dl-copy-icon');
          const copiedText = copyBtn.querySelector('.egg-dl-copied-text');
          if (copyIcon && copiedText) {
            copyIcon.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
            copyBtn.style.color = '#10B981';
            copyBtn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
            copyBtn.style.background = 'rgba(16, 185, 129, 0.12)';
            copiedText.style.display = 'inline';
            setTimeout(() => {
              copyIcon.innerHTML = '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>';
              copyBtn.style.color = '#94A3B8';
              copyBtn.style.borderColor = 'rgba(255,255,255,0.1)';
              copyBtn.style.background = 'rgba(255,255,255,0.05)';
              copiedText.style.display = 'none';
            }, 1600);
          }
        });
      }

      popup.addEventListener('mouseenter', () => clearTimeout(timer));
      popup.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 4000); });
    },
    args: [task, activeBackendUrl]
  }).catch(() => {});
}

function monitorDownloadTask(tabId, taskId) {
  if (!taskId) return;
  const startTime = Date.now();
  const pollInterval = setInterval(async () => {
    if (Date.now() - startTime > 15 * 60 * 1000) {
      clearInterval(pollInterval);
      return;
    }
    try {
      const res = await fetchFromBackend(`/api/download/${taskId}`);
      if (res && res.success && res.task) {
        if (res.task.status === 'completed') {
          clearInterval(pollInterval);
          injectInPageCompleteNotification(tabId, res.task);
        } else if (res.task.status === 'error' || res.task.status === 'canceled') {
          clearInterval(pollInterval);
        }
      }
    } catch (e) {}
  }, 1000);
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
        injectInPageToast(tab.id, "🥚 Download started in EggDL!");
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
      injectInPageToast(tab.id, "🥚 Download started in EggDL!");
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

// Initial discovery and periodic keepalive
discoverActiveBackend();
setInterval(discoverActiveBackend, 20000);

async function fetchFromBackend(endpoint, options = {}) {
  const isInspect = endpoint.includes('inspect') || endpoint.includes('sniff');
  const timeoutMs = isInspect ? 24000 : 8000;

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
    if (res.ok) {
      return await res.json();
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
    if (res.ok) {
      return await res.json();
    } else {
      const errJson = await res.json().catch(() => null);
      return { success: false, detail: errJson?.detail || `HTTP ${res.status}` };
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

      const downloadInfo = {
        url: url,
        filename: filename,
        file_size: fileSize,
        mime: mime,
        referrer: downloadItem.referrer || ''
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

