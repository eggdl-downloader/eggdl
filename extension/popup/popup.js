// EggDL - Popup Script
document.addEventListener('DOMContentLoaded', async () => {
  const pageTitleEl = document.getElementById('page-title');
  const countBadge = document.getElementById('stream-count-badge');
  const streamList = document.getElementById('stream-list');
  const emptyState = document.getElementById('empty-state');
  const sniffFullBtn = document.getElementById('sniff-full-btn');
  const downloadAllBtn = document.getElementById('download-all-btn');
  const overlayToggle = document.getElementById('overlay-toggle');
  const themeSelector = document.getElementById('ext-theme-selector');

  function applyPopupTheme(theme) {
    const validThemes = ['slate', 'navy', 'mint', 'frost', 'zinc'];
    const t = validThemes.includes(theme) ? theme : 'slate';
    document.documentElement.setAttribute('data-theme', t);
    if (themeSelector && themeSelector.value !== t) themeSelector.value = t;
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get({ eggdl_theme: 'slate' }, (items) => {
      applyPopupTheme(items?.eggdl_theme);
    });
  }

  if (themeSelector) {
    themeSelector.addEventListener('change', (e) => {
      const chosen = e.target.value;
      applyPopupTheme(chosen);
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ eggdl_theme: chosen });
      }
    });
  }

  function isExtensionValid() {
    try {
      return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
    } catch (_) {
      return false;
    }
  }

  function safeSendMessage(message, callback) {
    if (!isExtensionValid()) return;
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime?.lastError;
        if (err) {
          if (typeof callback === 'function') callback(null);
          return;
        }
        if (typeof callback === 'function') {
          callback(response);
        }
      });
    } catch (_) {
      if (typeof callback === 'function') callback(null);
    }
  }

  // Load and bind Overlay Toggle setting
  if (overlayToggle) {
    try {
      chrome.storage.sync.get({ showVideoOverlay: true }, (items) => {
        overlayToggle.checked = items?.showVideoOverlay !== false;
      });

      overlayToggle.addEventListener('change', () => {
        const enabled = overlayToggle.checked;
        chrome.storage.sync.set({ showVideoOverlay: enabled }, () => {
          chrome.tabs.query({}, (tabs) => {
            if (chrome.runtime?.lastError) return;
            tabs.forEach(t => {
              if (t.id) {
                chrome.tabs.sendMessage(t.id, { action: "toggle_overlay", enabled: enabled }).catch(() => {});
              }
            });
          });
        });
      });
    } catch (_) {}
  }

  // Resilient tab query (handles popup focus windows cleanly)
  let tab = null;
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs && tabs.length > 0) {
      tab = tabs[0];
    } else {
      const allActive = await chrome.tabs.query({ active: true });
      tab = allActive && allActive.length > 0 ? allActive[0] : null;
    }
  } catch (e) {
    console.error("Tab query error:", e);
  }

  const isValidUrl = tab && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'));

  if (!isValidUrl) {
    pageTitleEl.innerText = "EggDL Downloader";
    countBadge.innerText = "0 Eggs";
    streamList.innerHTML = `
      <div style="padding: 16px 12px; text-align: center; color: #94A3B8; font-size: 12px;">
        Open a video page (YouTube, Instagram, TikTok) to detect media eggs.
      </div>
    `;
    emptyState.style.display = 'block';
    downloadAllBtn.disabled = true;
    return;
  }

  pageTitleEl.innerText = tab.title ? tab.title.slice(0, 45) : "Current Page";
  pageTitleEl.title = tab.title || "";

  // 1. Immediately render sniffed media from tab store (0ms instant)
  safeSendMessage({ action: "get_tab_media", tabId: tab.id }, (mediaRes) => {
    const list = (mediaRes && mediaRes.media) ? mediaRes.media : [];
    if (list.length > 0) {
      renderSniffedMedia(list, tab);
    } else {
      streamList.innerHTML = `<div style="text-align: center; padding: 22px; color: #94A3B8; font-size: 12.5px;">🔍 Extracting qualities (144p - 8K)...</div>`;
    }
  });

  // 2. Concurrently inspect full page stream formats with timeout guard
  let inspectDone = false;
  const timeoutId = setTimeout(() => {
    if (!inspectDone) {
      safeSendMessage({ action: "get_tab_media", tabId: tab.id }, (mediaRes) => {
        const list = (mediaRes && mediaRes.media) ? mediaRes.media : [];
        renderSniffedMedia(list, tab);
      });
    }
  }, 6000);

  safeSendMessage({ action: "inspect_page", url: tab.url }, (res) => {
    inspectDone = true;
    clearTimeout(timeoutId);
    if (res && res.success && res.data) {
      renderInspectQualities(res.data, tab);
    } else {
      safeSendMessage({ action: "get_tab_media", tabId: tab.id }, (mediaRes) => {
        const list = (mediaRes && mediaRes.media) ? mediaRes.media : [];
        renderSniffedMedia(list, tab);
      });
    }
  });

  function getQualityTag(res) {
    if (!res) return { class: 'hd', label: 'HD' };
    const r = res.toLowerCase();
    if (r.includes('4320') || r.includes('8k')) return { class: 'uhd', label: '8K' };
    if (r.includes('2160') || r.includes('4k')) return { class: 'uhd', label: '4K' };
    if (r.includes('1440') || r.includes('2k')) return { class: 'qhd', label: '2K' };
    if (r.includes('1080')) return { class: 'fhd', label: '1080p' };
    if (r.includes('720')) return { class: 'hd', label: '720p' };
    if (r.includes('480')) return { class: 'sd', label: '480p' };
    if (r.includes('360')) return { class: 'sd', label: '360p' };
    if (r.includes('240')) return { class: 'sd', label: '240p' };
    if (r.includes('144')) return { class: 'sd', label: '144p' };
    return { class: 'hd', label: res };
  }

  function renderInspectQualities(data, currentTab) {
    const videoOpts = data.video_options || [];
    const audioOpts = data.audio_options || [];
    const totalCount = videoOpts.length + audioOpts.length;

    countBadge.innerText = `${totalCount} Available`;

    if (totalCount === 0) {
      streamList.innerHTML = '';
      emptyState.style.display = 'block';
      downloadAllBtn.disabled = true;
      return;
    }

    emptyState.style.display = 'none';
    downloadAllBtn.disabled = false;

    let itemsHtml = '';

    if (videoOpts.length > 0) {
      itemsHtml += `<div class="stream-section-label">🎬 Video Qualities</div>`;
      itemsHtml += videoOpts.map(opt => {
        const tag = getQualityTag(opt.resolution);
        const formatId = opt.format_id;
        const sizeStr = opt.filesize_str || 'Auto Size';
        return `
          <div class="stream-item">
            <div class="stream-info">
              <div class="stream-title">${opt.label}</div>
              <div class="stream-meta">
                <span class="quality-tag ${tag.class}">${tag.label}</span>
                <span class="stream-size">${opt.ext.toUpperCase()} • ${sizeStr}</span>
              </div>
            </div>
            <button class="dl-btn" data-format="${formatId}" data-type="video" data-filesize="${opt.filesize || ''}">
              ⚡ Download
            </button>
          </div>
        `;
      }).join('');
    }

    if (audioOpts.length > 0) {
      itemsHtml += `<div class="stream-section-label" style="margin-top: 10px;">🎵 Audio Formats</div>`;
      itemsHtml += audioOpts.map(opt => {
        const formatId = opt.format_id;
        const sizeStr = opt.filesize_str || 'Audio Stream';
        return `
          <div class="stream-item">
            <div class="stream-info">
              <div class="stream-title">${opt.label}</div>
              <div class="stream-meta">
                <span class="quality-tag audio">MP3/M4A</span>
                <span class="stream-size">${opt.ext.toUpperCase()} • ${sizeStr}</span>
              </div>
            </div>
            <button class="dl-btn" data-format="${formatId}" data-type="audio" data-filesize="${opt.filesize || ''}">
              🎵 Download Audio
            </button>
          </div>
        `;
      }).join('');
    }

    streamList.innerHTML = itemsHtml;

    streamList.querySelectorAll('.dl-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const formatId = btn.dataset.format;
        const isAudio = btn.dataset.type === 'audio';
        const fileSize = btn.dataset.filesize ? parseInt(btn.dataset.filesize) : null;
        btn.innerText = '⏳ Starting...';

        safeSendMessage({
          action: "download_task",
          tabId: currentTab.id,
          payload: {
            url: currentTab.url,
            download_type: "stream",
            format_id: formatId,
            custom_title: data.title || currentTab.title,
            thumbnail: data.thumbnail || "",
            expected_size: fileSize,
            is_audio_only: isAudio
          }
        }, (res) => {
          if (res && res.success) {
            btn.innerText = '✓ Started';
            btn.style.background = '#10B981';
          } else {
            btn.innerText = '✕ Retry';
            btn.style.background = '#EF4444';
          }
        });
      });
    });

    downloadAllBtn.onclick = () => {
      if (videoOpts[0]) {
        downloadAllBtn.innerText = '⏳ Starting...';
        safeSendMessage({
          action: "download_task",
          tabId: currentTab.id,
          payload: {
            url: currentTab.url,
            download_type: "stream",
            format_id: videoOpts[0].format_id,
            custom_title: data.title || currentTab.title
          }
        }, (res) => {
          if (res && res.success) {
            downloadAllBtn.innerText = '✓ Started Best';
            downloadAllBtn.style.background = '#10B981';
          } else {
            downloadAllBtn.innerText = '✕ Retry';
            downloadAllBtn.style.background = '#EF4444';
          }
        });
      }
    };
  }

  function renderSniffedMedia(list, currentTab) {
    countBadge.innerText = `${list.length} Found`;
    if (list.length === 0) {
      streamList.innerHTML = '';
      emptyState.style.display = 'block';
      downloadAllBtn.disabled = true;
      return;
    }

    emptyState.style.display = 'none';
    downloadAllBtn.disabled = false;

    streamList.innerHTML = list.map((item, idx) => {
      const tag = getQualityTag(item.quality);
      const filename = item.url.split('/').pop().split('?')[0] || `Stream_${idx + 1}`;
      return `
        <div class="stream-item">
          <div class="stream-info">
            <div class="stream-title">${filename}</div>
            <div class="stream-meta">
              <span class="quality-tag ${tag.class}">${tag.label}</span>
              <span class="stream-size">${item.quality}</span>
            </div>
          </div>
          <button class="dl-btn" data-url="${item.url}">
            ⚡ Download
          </button>
        </div>
      `;
    }).join('');

    streamList.querySelectorAll('.dl-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        btn.innerText = '⏳ Starting...';
        safeSendMessage({
          action: "download_task",
          tabId: currentTab.id,
          payload: {
            url: url,
            download_type: "auto",
            custom_title: currentTab.title || "Video Download"
          }
        }, (res) => {
          if (res && res.success) {
            btn.innerText = '✓ Started';
            btn.style.background = '#10B981';
          } else {
            btn.innerText = '✕ Retry';
            btn.style.background = '#EF4444';
          }
        });
      });
    });
  }

  sniffFullBtn.onclick = () => {
    if (tab && tab.url) {
      chrome.tabs.create({ url: `http://127.0.0.1:8000/#sniff=${encodeURIComponent(tab.url)}` });
    }
  };
});
