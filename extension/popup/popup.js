// EggDL - Popup Script
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pageTitleEl = document.getElementById('page-title');
  const countBadge = document.getElementById('stream-count-badge');
  const streamList = document.getElementById('stream-list');
  const emptyState = document.getElementById('empty-state');
  const sniffFullBtn = document.getElementById('sniff-full-btn');
  const downloadAllBtn = document.getElementById('download-all-btn');
  const overlayToggle = document.getElementById('overlay-toggle');

  // Load and bind Overlay Toggle setting
  if (overlayToggle) {
    chrome.storage.sync.get({ showVideoOverlay: true }, (items) => {
      overlayToggle.checked = items.showVideoOverlay !== false;
    });

    overlayToggle.addEventListener('change', () => {
      const enabled = overlayToggle.checked;
      chrome.storage.sync.set({ showVideoOverlay: enabled }, () => {
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(t => {
            if (t.id) {
              chrome.tabs.sendMessage(t.id, { action: "toggle_overlay", enabled: enabled }).catch(() => {});
            }
          });
        });
      });
    });
  }

  if (tab) {
    pageTitleEl.innerText = tab.title || "Current Tab";
    
    streamList.innerHTML = `<div style="text-align: center; padding: 20px; color: #94A3B8; font-size: 12px;">Extracting all qualities (144p - 8K)...</div>`;

    chrome.runtime.sendMessage({ action: "inspect_page", url: tab.url }, (res) => {
      if (res && res.success && res.data) {
        renderInspectQualities(res.data, tab);
      } else {
        chrome.runtime.sendMessage({ action: "get_tab_media", tabId: tab.id }, (mediaRes) => {
          const list = (mediaRes && mediaRes.media) ? mediaRes.media : [];
          renderSniffedMedia(list, tab);
        });
      }
    });
  }

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
    const total = videoOpts.length + audioOpts.length;
    countBadge.innerText = `${total} Egg Qualities`;

    if (total === 0) {
      streamList.innerHTML = '';
      emptyState.style.display = 'block';
      downloadAllBtn.disabled = true;
      return;
    }

    emptyState.style.display = 'none';
    downloadAllBtn.disabled = false;

    let html = '';

    videoOpts.forEach(opt => {
      const tag = getQualityTag(opt.resolution);
      html += `
        <div class="stream-item">
          <div class="stream-info">
            <div class="stream-title">${opt.label}</div>
            <div class="stream-meta">
              <span class="quality-tag ${tag.class}">${tag.label}</span>
              <span class="stream-size">${opt.ext.toUpperCase()} • ${opt.filesize_str}</span>
            </div>
          </div>
          <button class="dl-btn" data-format-id="${opt.format_id}" data-type="video" data-filesize="${opt.filesize || ''}">
            🥚 Download Egg
          </button>
        </div>
      `;
    });

    audioOpts.forEach(opt => {
      html += `
        <div class="stream-item">
          <div class="stream-info">
            <div class="stream-title">${opt.label}</div>
            <div class="stream-meta">
              <span class="quality-tag audio">MP3/M4A</span>
              <span class="stream-size">${opt.ext.toUpperCase()} • ${opt.filesize_str}</span>
            </div>
          </div>
          <button class="dl-btn" data-format-id="${opt.format_id}" data-type="audio" data-filesize="${opt.filesize || ''}">
            🎵 Audio Egg
          </button>
        </div>
      `;
    });

    streamList.innerHTML = html;

    streamList.querySelectorAll('.dl-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const formatId = btn.dataset.formatId;
        const isAudio = btn.dataset.type === 'audio';
        const fileSize = btn.dataset.filesize ? parseInt(btn.dataset.filesize) : null;
        btn.innerText = '⏳ Starting...';

        chrome.runtime.sendMessage({
          action: "download_task",
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
        chrome.runtime.sendMessage({
          action: "download_task",
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
        chrome.runtime.sendMessage({
          action: "download_task",
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
      chrome.tabs.create({ url: `http://localhost:8000/#sniff=${encodeURIComponent(tab.url)}` });
    }
  };
});
