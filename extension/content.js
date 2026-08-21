// Pro Downloader - Universal In-Page Video Downloader (Top-Center Placement)
(function() {
  'use strict';

  function findUniversalPlayerWrapper(video) {
    // 1. YouTube
    const ytPlayer = video.closest('#movie_player, .html5-video-player, ytd-player, ytd-shorts');
    if (ytPlayer) return ytPlayer;

    // 2. Instagram
    const igWrapper = video.closest('article, div[role="dialog"], div._ab1y, div._aa55, div.x1ey2m1c');
    if (igWrapper) return igWrapper;

    // 3. Facebook
    const fbWrapper = video.closest('div[data-pagelet*="Video"], div.x1y1aw1k, div.x78zum5, div[role="article"]');
    if (fbWrapper) return fbWrapper;

    // 4. TikTok
    const ttWrapper = video.closest('div[data-e2e="feed-video"], div.video-card-container, div.css-1qnv4eg-DivVideoContainer');
    if (ttWrapper) return ttWrapper;

    // 5. Twitter / X
    const xWrapper = video.closest('div[data-testid="videoPlayer"], div[data-testid="tweetPhoto"], article');
    if (xWrapper) return xWrapper;

    // 6. Reddit
    const redditWrapper = video.closest('shreddit-player, div[data-test-id="post-content"]');
    if (redditWrapper) return redditWrapper;

    // 7. Generic player wrapper or parent
    let cur = video.parentElement;
    while (cur && cur !== document.body) {
      const rect = cur.getBoundingClientRect();
      const style = window.getComputedStyle(cur);
      if (rect.width > 200 && rect.height > 120 && (style.position === 'relative' || style.position === 'absolute' || cur.tagName === 'DIV')) {
        return cur;
      }
      cur = cur.parentElement;
    }

    return video.parentElement || document.body;
  }

  function getMediaSourceUrl(video) {
    const host = window.location.hostname;

    if (host.includes('instagram.com')) {
      const postLink = video.closest('article, div[role="dialog"]')?.querySelector('a[href*="/p/"], a[href*="/reel/"]');
      if (postLink && postLink.href) return postLink.href;
    }

    if (host.includes('facebook.com')) {
      const fbLink = video.closest('div[role="article"], div[data-pagelet*="Video"]')?.querySelector('a[href*="/watch"], a[href*="/reel/"], a[href*="/videos/"]');
      if (fbLink && fbLink.href) return fbLink.href;
    }

    if (host.includes('twitter.com') || host.includes('x.com')) {
      const tweetLink = video.closest('article')?.querySelector('a[href*="/status/"]');
      if (tweetLink && tweetLink.href) return tweetLink.href;
    }

    if (host.includes('tiktok.com')) {
      const ttLink = video.closest('div[data-e2e="feed-video"]')?.querySelector('a[href*="/video/"]');
      if (ttLink && ttLink.href) return ttLink.href;
    }

    return window.location.href;
  }

  let isOverlayEnabled = true;
  chrome.storage.sync.get({ showVideoOverlay: true }, (items) => {
    isOverlayEnabled = items.showVideoOverlay !== false;
    if (!isOverlayEnabled) {
      document.querySelectorAll('.pro-dl-floating-badge').forEach(b => b.remove());
    }
  });

  function attachFloatingDownloaders() {
    if (!isOverlayEnabled) {
      document.querySelectorAll('.pro-dl-floating-badge').forEach(b => b.remove());
      return;
    }

    const videos = document.querySelectorAll('video');
    videos.forEach((video) => {
      if (video.dataset.proDlAttached) return;

      const rect = video.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 60) return;

      video.dataset.proDlAttached = "true";

      const wrapper = findUniversalPlayerWrapper(video);
      if (!wrapper) return;

      const badge = document.createElement('div');
      badge.className = 'pro-dl-floating-badge';

      badge.innerHTML = `
        <div class="pro-dl-badge-btn" title="Download media egg in full resolution (144p - 8K)">
          <svg class="pro-dl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Download Egg</span>
        </div>
        <div class="pro-dl-badge-menu"></div>
      `;

      const computedPos = window.getComputedStyle(wrapper).position;
      if (computedPos === 'static') {
        wrapper.style.position = 'relative';
      }

      wrapper.appendChild(badge);

      // Pre-fetch qualities in background as soon as video is found or played
      const targetUrl = getMediaSourceUrl(video);
      prefetchMedia(targetUrl);
      video.addEventListener('play', () => prefetchMedia(getMediaSourceUrl(video)), { once: true });

      const btn = badge.querySelector('.pro-dl-badge-btn');
      const menu = badge.querySelector('.pro-dl-badge-menu');

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();

        const isActive = menu.classList.contains('active');
        document.querySelectorAll('.pro-dl-badge-menu.active').forEach(m => m.classList.remove('active'));

        if (!isActive) {
          menu.classList.add('active');
          loadMediaMenu(menu, video);
        }
      });

      document.addEventListener('click', (e) => {
        if (!badge.contains(e.target)) {
          menu.classList.remove('active');
        }
      });
    });
  }

  const inPageInspectCache = new Map();

  function prefetchMedia(targetUrl) {
    if (!targetUrl || inPageInspectCache.has(targetUrl)) return;
    chrome.runtime.sendMessage({ action: "inspect_page", url: targetUrl }, (res) => {
      if (res && res.success && res.data) {
        inPageInspectCache.set(targetUrl, res.data);
      }
    });
  }

  function loadMediaMenu(menu, video) {
    const targetUrl = getMediaSourceUrl(video);
    const pageTitle = document.title || "Video Egg";

    // 1. Instant cache hit for the exact current URL (0ms)
    if (inPageInspectCache.has(targetUrl)) {
      renderInspectResults(menu, inPageInspectCache.get(targetUrl), targetUrl, pageTitle, video);
      return;
    }

    // 2. Clean, dedicated loading state for the current video
    menu.innerHTML = `
      <div class="pro-dl-loading">
        <div class="pro-dl-spinner"></div>
        <div style="font-weight: 600; font-size: 13px; color: #fff; margin-top: 4px;">Loading Video Qualities...</div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 2px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${pageTitle}</div>
      </div>
    `;

    // 3. Fetch full formats & update smoothly
    chrome.runtime.sendMessage({ action: "inspect_page", url: targetUrl }, (res) => {
      // Guard: Only render if user is still on the same video URL and menu is still open
      const currentUrl = getMediaSourceUrl(video);
      if (currentUrl !== targetUrl) return;

      if (res && res.success && res.data) {
        inPageInspectCache.set(targetUrl, res.data);
        if (menu.classList.contains('active')) {
          renderInspectResults(menu, res.data, targetUrl, pageTitle, video);
        }
      } else {
        chrome.runtime.sendMessage({ action: "get_tab_media" }, (mediaRes) => {
          if (getMediaSourceUrl(video) !== targetUrl) return;
          const streams = (mediaRes && mediaRes.media) ? mediaRes.media : [];
          if (menu.classList.contains('active')) {
            renderFallbackStreams(menu, streams, targetUrl, pageTitle, video);
          }
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

  function renderInspectResults(menu, data, pageUrl, pageTitle, video) {
    const videoOpts = data.video_options || [];
    const audioOpts = data.audio_options || [];

    let html = `
      <div class="pro-dl-menu-header">🥚 Media Eggs (${videoOpts.length} Available)</div>
    `;

    if (videoOpts.length === 0 && audioOpts.length === 0) {
      const directSrc = video.currentSrc || video.src;
      if (directSrc && !directSrc.startsWith('blob:')) {
        html += `
          <div class="pro-dl-menu-item" data-direct="${directSrc}">
            <span class="pro-dl-tag hd">DIRECT</span>
            <div class="pro-dl-item-info">
              <span class="pro-dl-item-title">${pageTitle.slice(0, 28)}</span>
              <span class="pro-dl-item-meta">Direct Video Stream</span>
            </div>
          </div>
        `;
      } else {
        html += `<div class="pro-dl-empty">No streams found.</div>`;
      }
    }

    videoOpts.forEach(opt => {
      const tag = getQualityTag(opt.resolution);
      html += `
        <div class="pro-dl-menu-item" data-format-id="${opt.format_id}" data-type="video" data-filesize="${opt.filesize || ''}">
          <span class="pro-dl-tag ${tag.class}">${tag.label}</span>
          <div class="pro-dl-item-info">
            <span class="pro-dl-item-title">${opt.label}</span>
            <span class="pro-dl-item-meta">${opt.ext.toUpperCase()} • ${opt.filesize_str}</span>
          </div>
        </div>
      `;
    });

    if (audioOpts.length > 0) {
      html += `<div class="pro-dl-menu-header" style="margin-top: 8px;">🎵 Audio Formats</div>`;
      audioOpts.forEach(opt => {
        html += `
          <div class="pro-dl-menu-item" data-format-id="${opt.format_id}" data-type="audio" data-filesize="${opt.filesize || ''}">
            <span class="pro-dl-tag audio">MP3/M4A</span>
            <div class="pro-dl-item-info">
              <span class="pro-dl-item-title">${opt.label}</span>
              <span class="pro-dl-item-meta">${opt.ext.toUpperCase()} • ${opt.filesize_str}</span>
            </div>
          </div>
        `;
      });
    }

    menu.innerHTML = html;

    menu.querySelectorAll('.pro-dl-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const formatId = item.dataset.formatId;
        const isAudio = item.dataset.type === 'audio';
        const directUrl = item.dataset.direct;
        const fileSize = item.dataset.filesize ? parseInt(item.dataset.filesize) : null;
        
        chrome.runtime.sendMessage({
          action: "download_task",
          payload: {
            url: directUrl || pageUrl,
            download_type: directUrl ? "direct" : "stream",
            format_id: formatId || "bestvideo+bestaudio/best",
            custom_title: data.title || pageTitle,
            thumbnail: data.thumbnail || "",
            expected_size: fileSize,
            is_audio_only: isAudio
          }
        }, () => {
          menu.classList.remove('active');
          showFloatingToast("🥚 Download started in EggDL!");
        });
      });
    });
  }

  function renderFallbackStreams(menu, streams, pageUrl, pageTitle, video) {
    let html = `<div class="pro-dl-menu-header">🥚 Captured Streams</div>`;
    const directSrc = video.currentSrc || video.src;

    if (directSrc && !directSrc.startsWith('blob:')) {
      html += `
        <div class="pro-dl-menu-item" data-url="${directSrc}">
          <span class="pro-dl-tag hd">STREAM</span>
          <div class="pro-dl-item-info">
            <span class="pro-dl-item-title">${pageTitle.slice(0, 28)}</span>
            <span class="pro-dl-item-meta">Current Active Stream</span>
          </div>
        </div>
      `;
    }

    streams.forEach(st => {
      const tag = getQualityTag(st.quality);
      html += `
        <div class="pro-dl-menu-item" data-url="${st.url}">
          <span class="pro-dl-tag ${tag.class}">${tag.label}</span>
          <div class="pro-dl-item-info">
            <span class="pro-dl-item-title">${st.url.split('/').pop().split('?')[0].slice(0, 25)}</span>
            <span class="pro-dl-item-meta">${st.quality}</span>
          </div>
        </div>
      `;
    });

    if (streams.length === 0 && (!directSrc || directSrc.startsWith('blob:'))) {
      html += `<div class="pro-dl-empty">No streams captured yet. Play video to capture.</div>`;
    }

    menu.innerHTML = html;

    menu.querySelectorAll('.pro-dl-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const streamUrl = item.dataset.url;
        chrome.runtime.sendMessage({
          action: "download_task",
          payload: {
            url: streamUrl,
            download_type: "auto",
            custom_title: pageTitle
          }
        }, () => {
          menu.classList.remove('active');
          showFloatingToast("🥚 Download started in EggDL!");
        });
      });
    });
  }

  function showFloatingToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'pro-dl-inpage-toast';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // Track right-clicked elements for direct image capture
  let lastRightClickedEl = null;
  document.addEventListener('contextmenu', (e) => {
    lastRightClickedEl = e.target;
    window.__lastRightClickedImg = e.target;
  }, true);

  // Handle image capture and settings messages
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "toggle_overlay") {
      isOverlayEnabled = request.enabled !== false;
      if (isOverlayEnabled) {
        document.querySelectorAll('video').forEach(v => delete v.dataset.proDlAttached);
        attachFloatingDownloaders();
      } else {
        document.querySelectorAll('.pro-dl-floating-badge').forEach(b => b.remove());
        document.querySelectorAll('video').forEach(v => delete v.dataset.proDlAttached);
      }
      sendResponse({ success: true, isOverlayEnabled });
      return true;
    }

    if (request.action === "get_image_data") {
      let targetImg = null;
      if (lastRightClickedEl) {
        if (lastRightClickedEl.tagName === 'IMG') {
          targetImg = lastRightClickedEl;
        } else if (lastRightClickedEl.querySelector && lastRightClickedEl.querySelector('img')) {
          targetImg = lastRightClickedEl.querySelector('img');
        } else if (lastRightClickedEl.closest && lastRightClickedEl.closest('picture, a, div, figure')) {
          targetImg = lastRightClickedEl.closest('picture, a, div, figure').querySelector('img');
        }
      }

      if (!targetImg && request.srcUrl) {
        const cleanSrc = request.srcUrl.split('?')[0];
        try {
          targetImg = document.querySelector(`img[src="${CSS.escape(request.srcUrl)}"], img[src*="${cleanSrc}"]`);
        } catch (e) {
          const allImgs = Array.from(document.querySelectorAll('img'));
          targetImg = allImgs.find(im => im.src === request.srcUrl || im.currentSrc === request.srcUrl);
        }
      }

      if (targetImg && targetImg.tagName === 'IMG') {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = targetImg.naturalWidth || targetImg.width || 300;
          canvas.height = targetImg.naturalHeight || targetImg.height || 300;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(targetImg, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          sendResponse({
            success: true,
            dataUrl: dataUrl,
            title: targetImg.alt || targetImg.title || document.title
          });
          return true;
        } catch (canvasErr) {
          console.warn("Canvas capture error, attempting fetch:", canvasErr);
        }
      }

      // Page-level fetch with page cookies/credentials
      if (request.srcUrl) {
        fetch(request.srcUrl)
          .then(r => r.blob())
          .then(blob => {
            const reader = new FileReader();
            reader.onloadend = () => {
              sendResponse({ success: true, dataUrl: reader.result });
            };
            reader.readAsDataURL(blob);
          })
          .catch(err => {
            sendResponse({ success: false, error: String(err) });
          });
        return true;
      }

      sendResponse({ success: false });
      return true;
    }
  });

  // Handle SPA navigation on YouTube / Vimeo / etc.
  function handleUrlChange() {
    document.querySelectorAll('.pro-dl-badge-menu.active').forEach(m => m.classList.remove('active'));
    setTimeout(attachFloatingDownloaders, 600);
  }
  window.addEventListener('yt-navigate-finish', handleUrlChange);
  window.addEventListener('popstate', handleUrlChange);

  // Observe DOM for video players
  const observer = new MutationObserver(() => attachFloatingDownloaders());
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(attachFloatingDownloaders, 2000);
})();
