// Pro Downloader - Universal In-Page Video Downloader (Top-Center Placement)
(function() {
  'use strict';

  function isExtensionValid() {
    try {
      return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
    } catch (_) {
      return false;
    }
  }

  function cleanupInvalidatedExtension() {
    try {
      if (window.__proDlObserver) {
        window.__proDlObserver.disconnect();
        window.__proDlObserver = null;
      }
      if (window.__proDlInterval) {
        clearInterval(window.__proDlInterval);
        window.__proDlInterval = null;
      }
      document.querySelectorAll('.pro-dl-floating-badge').forEach(b => b.remove());
      document.querySelectorAll('.egg-dl-idm-backdrop').forEach(b => b.remove());
    } catch (_) {}
  }

  let activeEggTheme = 'slate';
  let cachedDownloadDir = '';

  function applyThemeEverywhere(themeName) {
    activeEggTheme = themeName || 'slate';
    document.documentElement.setAttribute('data-theme', activeEggTheme);
    if (document.body) document.body.setAttribute('data-theme', activeEggTheme);
    document.querySelectorAll('.pro-dl-floating-badge, .egg-dl-idm-backdrop, .egg-dl-idm-dock-container, .egg-dl-idm-dock-capsule').forEach(el => {
      el.setAttribute('data-theme', activeEggTheme);
    });
  }

  function syncDockCapsulesFromStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get({ eggdl_theme: 'slate', eggdlDownloadDir: '', eggdl_dock_items: {} }, (items) => {
        if (items) {
          if (items.eggdl_theme) applyThemeEverywhere(items.eggdl_theme);
          if (items.eggdlDownloadDir) cachedDownloadDir = items.eggdlDownloadDir;
          renderDockCapsulesFromStorage(items.eggdl_dock_items || {});
        }
      });
    }
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    syncDockCapsulesFromStorage();

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (!areaName || areaName === 'local') {
        if (changes.eggdl_theme) {
          applyThemeEverywhere(changes.eggdl_theme.newValue || 'slate');
        }
        if (changes.eggdlDownloadDir) {
          cachedDownloadDir = changes.eggdlDownloadDir.newValue || '';
        }
        if (changes.eggdl_dock_items) {
          renderDockCapsulesFromStorage(changes.eggdl_dock_items.newValue || {});
        }
      }
    });
  }

  // Real-time tab visibility and focus sync for already opened tabs
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncDockCapsulesFromStorage();
  });
  window.addEventListener('focus', () => {
    syncDockCapsulesFromStorage();
  });

  // Periodic heartbeat sync for visible tabs so all tabs stay updated
  setInterval(() => {
    if (!document.hidden) syncDockCapsulesFromStorage();
  }, 2500);

  function fetchLatestDownloadDir(callback) {
    safeSendMessage({ action: "get_download_dir" }, (res) => {
      if (res && res.download_dir) {
        cachedDownloadDir = res.download_dir;
      }
      if (typeof callback === 'function') callback(cachedDownloadDir);
    });
  }

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'eggdl_set_theme' && e.data.theme) {
      applyThemeEverywhere(e.data.theme);
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ eggdl_theme: e.data.theme });
      }
    }
  });

  function getOrCreateDockContainer() {
    let container = document.querySelector('.egg-dl-idm-dock-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'egg-dl-idm-dock-container';
      container.setAttribute('data-theme', activeEggTheme);
      document.body.appendChild(container);
    }
    return container;
  }

  function saveDockItemToStorage(item) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get({ eggdl_dock_items: {} }, (res) => {
        const items = res.eggdl_dock_items || {};
        items[item.id] = item;
        chrome.storage.local.set({ eggdl_dock_items: items });
      });
    }
  }

  function removeDockItemFromStorage(itemId) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get({ eggdl_dock_items: {} }, (res) => {
        const items = res.eggdl_dock_items || {};
        if (items[itemId]) {
          delete items[itemId];
          chrome.storage.local.set({ eggdl_dock_items: items });
        }
      });
    }
  }

  function renderDockCapsulesFromStorage(storedMap) {
    const activeIds = Object.keys(storedMap || {});
    if (activeIds.length === 0) {
      document.querySelector('.egg-dl-idm-dock-container')?.remove();
      return;
    }

    const container = getOrCreateDockContainer();
    container.setAttribute('data-theme', activeEggTheme);

    container.querySelectorAll('.egg-dl-idm-dock-capsule').forEach(el => {
      const id = el.getAttribute('data-dialog-id');
      if (!activeIds.includes(id)) el.remove();
    });

    const realLogoUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL) ? (chrome.runtime.getURL('icons/egg-icon.png') || chrome.runtime.getURL('icons/icon128.png')) : '';

    for (const id of activeIds) {
      const item = storedMap[id];
      if (!item) continue;
      let el = container.querySelector(`.egg-dl-idm-dock-capsule[data-dialog-id="${id}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'egg-dl-idm-dock-capsule';
        el.setAttribute('data-dialog-id', id);
        el.setAttribute('data-theme', activeEggTheme);

        const shortTitle = item.title || item.filename || 'Download';
        const fullTitle = item.filename || item.title || shortTitle;

        el.innerHTML = `
          <div class="egg-dl-dock-content">
            <img src="${realLogoUrl}" alt="EggDL" style="width: 18px; height: 18px; object-fit: contain; flex-shrink: 0;">
            <span class="egg-dl-dock-title" title="${fullTitle}">EggDL • ${shortTitle}</span>
          </div>
          <div class="egg-dl-dock-actions">
            <span class="egg-dl-dock-restore">Restore</span>
            <button type="button" class="egg-dl-dock-close" title="Close">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        `;

        el.addEventListener('click', (e) => {
          if (e.target.closest('.egg-dl-dock-close')) {
            el.remove();
            removeDockItemFromStorage(id);
            safeSendMessage({ action: "dock_remove", id: id });
            const localBackdrop = document.querySelector(`.egg-dl-idm-backdrop[data-dialog-id="${id}"]`);
            if (localBackdrop) localBackdrop.remove();
            return;
          }
          el.remove();
          removeDockItemFromStorage(id);
          safeSendMessage({ action: "dock_remove", id: id });
          const localBackdrop = document.querySelector(`.egg-dl-idm-backdrop[data-dialog-id="${id}"]`);
          if (localBackdrop) {
            localBackdrop.classList.remove('minimized');
          } else {
            renderIdmDownloadDialog(item);
          }
        });

        container.appendChild(el);
      }
    }
  }

  function safeSendMessage(message, callback) {
    if (!isExtensionValid()) {
      cleanupInvalidatedExtension();
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime?.lastError;
        if (err) {
          if (err.message && (err.message.includes('Extension context invalidated') || err.message.includes('Could not establish connection'))) {
            cleanupInvalidatedExtension();
            return;
          }
        }
        if (typeof callback === 'function') {
          callback(response);
        }
      });
    } catch (e) {
      if (e.message && (e.message.includes('Extension context invalidated') || e.message.includes('Could not establish connection'))) {
        cleanupInvalidatedExtension();
      }
    }
  }

  function safeStorageGet(defaults, callback) {
    if (!isExtensionValid() || !chrome.storage || !chrome.storage.sync) {
      if (typeof callback === 'function') callback(defaults);
      return;
    }
    try {
      chrome.storage.sync.get(defaults, (items) => {
        const err = chrome.runtime?.lastError;
        if (err) {
          if (typeof callback === 'function') callback(defaults);
          return;
        }
        if (typeof callback === 'function') callback(items);
      });
    } catch (_) {
      if (typeof callback === 'function') callback(defaults);
    }
  }

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
    const xWrapper = video.closest('div[data-testid="videoPlayer"], div[data-testid="tweetPhoto"]');
    if (xWrapper) return xWrapper;

    // 6. Reddit
    const redditWrapper = video.closest('shreddit-player, div[data-test-id="post-content"]');
    if (redditWrapper) return redditWrapper;

    // 7. Pexels / Stock / HTML5 Dedicated Player
    if (video.parentElement && video.parentElement !== document.body) {
      const pRect = video.parentElement.getBoundingClientRect();
      const vRect = video.getBoundingClientRect();
      // Ensure the parent element is bounded around the video itself and not an entire column
      if (pRect.width > 0 && vRect.width > 0 && pRect.width <= vRect.width * 1.35) {
        return video.parentElement;
      }
    }

    return video.parentElement || video;
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

    // Direct video stream if available
    const directSrc = video.currentSrc || video.src;
    if (directSrc && !directSrc.startsWith('blob:') && directSrc.startsWith('http')) {
      return directSrc;
    }

    return window.location.href;
  }

  let isOverlayEnabled = true;
  safeStorageGet({ showVideoOverlay: true }, (items) => {
    isOverlayEnabled = items.showVideoOverlay !== false;
    if (!isOverlayEnabled) {
      document.querySelectorAll('.pro-dl-floating-badge').forEach(b => b.remove());
    }
  });

  function attachFloatingDownloaders() {
    if (!isExtensionValid()) {
      cleanupInvalidatedExtension();
      return;
    }

    if (!isOverlayEnabled) {
      document.querySelectorAll('.pro-dl-floating-badge').forEach(b => b.remove());
      return;
    }

    const videos = document.querySelectorAll('video');
    videos.forEach((video) => {
      const rect = video.getBoundingClientRect();
      // Strict minimum size: Ignore thumbnails, side previews, and background elements (<220x140)
      if (rect.width < 220 || rect.height < 140) return;

      const wrapper = findUniversalPlayerWrapper(video);
      if (!wrapper) return;

      // Check if wrapper already has a live badge attached
      let badge = wrapper.querySelector('.pro-dl-floating-badge');
      if (badge) {
        return;
      }

      badge = document.createElement('div');
      badge.className = 'pro-dl-floating-badge';
      badge.setAttribute('data-theme', activeEggTheme);
      const targetUrl = getMediaSourceUrl(video);
      badge.dataset.targetUrl = targetUrl;

      badge.innerHTML = `
        <div class="pro-dl-badge-btn" title="Download video in full resolution (144p - 8K)">
          <svg class="pro-dl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Download Video</span>
        </div>
        <div class="pro-dl-badge-menu"></div>
      `;

      const computedPos = window.getComputedStyle(wrapper).position;
      if (computedPos === 'static') {
        wrapper.style.position = 'relative';
      }

      wrapper.appendChild(badge);
      video.dataset.proDlAttached = "true";

      const btn = badge.querySelector('.pro-dl-badge-btn');
      const menu = badge.querySelector('.pro-dl-badge-menu');

      let hideTimer = null;

      function showBadge() {
        badge.classList.add('pro-dl-visible');
        clearTimeout(hideTimer);
      }

      function hideBadge() {
        if (menu.classList.contains('active')) return;
        if (badge.matches(':hover') || wrapper.matches(':hover')) return;
        badge.classList.remove('pro-dl-visible');
      }

      function scheduleAutoHide(delay = 4500) {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          if (!menu.classList.contains('active') && !badge.matches(':hover') && !wrapper.matches(':hover')) {
            badge.classList.remove('pro-dl-visible');
          }
        }, delay);
      }

      function onVideoPlayStateChange() {
        const isPlaying = !video.paused && !video.ended && video.readyState >= 2;
        if (isPlaying) {
          // Hide any other active badges across the document
          document.querySelectorAll('.pro-dl-floating-badge').forEach(b => {
            if (b !== badge && !b.querySelector('.pro-dl-badge-menu.active')) {
              b.classList.remove('pro-dl-visible');
            }
          });

          video.dataset.proDlHasPlayed = "true";
          showBadge();
          scheduleAutoHide(5000);
        } else {
          // Paused or ended -> Hide overlay from unplayed / paused previews
          if (!menu.classList.contains('active')) {
            hideBadge();
          }
        }
      }

      // Video playback events
      video.addEventListener('play', onVideoPlayStateChange);
      video.addEventListener('playing', onVideoPlayStateChange);
      video.addEventListener('pause', onVideoPlayStateChange);
      video.addEventListener('ended', onVideoPlayStateChange);
      video.addEventListener('timeupdate', () => {
        if (!video.paused && !video.ended && video.currentTime > 0.3) {
          if (!video.dataset.proDlHasPlayed) {
            video.dataset.proDlHasPlayed = "true";
            showBadge();
            scheduleAutoHide(5000);
          }
        }
      });

      // Player hover interactions: only reveal on hover IF video is playing or actively in use
      wrapper.addEventListener('mouseenter', () => {
        const isPlaying = !video.paused && !video.ended;
        const hasPlayed = video.dataset.proDlHasPlayed === "true" || video.currentTime > 0.5;
        if (isPlaying || hasPlayed) {
          showBadge();
          if (isPlaying) scheduleAutoHide(4000);
        }
      });

      wrapper.addEventListener('mousemove', () => {
        const isPlaying = !video.paused && !video.ended;
        const hasPlayed = video.dataset.proDlHasPlayed === "true" || video.currentTime > 0.5;
        if (isPlaying || hasPlayed) {
          showBadge();
          if (isPlaying) scheduleAutoHide(4000);
        }
      });

      wrapper.addEventListener('mouseleave', () => {
        if (!menu.classList.contains('active')) {
          badge.classList.remove('pro-dl-visible');
        }
      });

      // If video was already actively playing when script attached (e.g. YouTube autoplay)
      if (!video.paused && !video.ended && video.currentTime > 0) {
        video.dataset.proDlHasPlayed = "true";
        showBadge();
        scheduleAutoHide(5000);
      }

      // On-demand prefetch on hover
      badge.addEventListener('mouseenter', () => {
        const tUrl = getMediaSourceUrl(video);
        prefetchMedia(tUrl);
      }, { once: true });

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();

        const isActive = menu.classList.contains('active');
        document.querySelectorAll('.pro-dl-badge-menu.active').forEach(m => m.classList.remove('active'));

        if (!isActive) {
          menu.classList.add('active');
          showBadge();
          loadMediaMenu(menu, video);
        } else {
          menu.classList.remove('active');
          if (video.paused) hideBadge();
        }
      });

      document.addEventListener('click', (e) => {
        if (!badge.contains(e.target)) {
          menu.classList.remove('active');
          if (video.paused) hideBadge();
        }
      });
    });
  }

  const inPageInspectCache = new Map();
  let _lastInspectTime = 0;

  function prefetchMedia(targetUrl) {
    if (!targetUrl || inPageInspectCache.has(targetUrl)) return;
    const now = Date.now();
    if (now - _lastInspectTime < 800) return; // Throttle
    _lastInspectTime = now;

    safeSendMessage({ action: "inspect_page", url: targetUrl }, (res) => {
      if (res && res.success && res.data) {
        inPageInspectCache.set(targetUrl, res.data);
      }
    });
  }

  function loadMediaMenu(menu, video) {
    const targetUrl = getMediaSourceUrl(video);
    const pageTitle = document.title || "Video File";

    // 1. Instant cache hit
    if (inPageInspectCache.has(targetUrl)) {
      renderInspectResults(menu, inPageInspectCache.get(targetUrl), targetUrl, pageTitle, video);
      return;
    }

    // 2. Loading state
    menu.innerHTML = `
      <div class="pro-dl-loading">
        <div class="pro-dl-spinner"></div>
        <div style="font-weight: 600; font-size: 13px; color: #fff; margin-top: 4px;">Loading Video Qualities...</div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 2px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${pageTitle}</div>
      </div>
    `;

    // 3. Inspect via backend
    safeSendMessage({ action: "inspect_page", url: targetUrl }, (res) => {
      const currentUrl = getMediaSourceUrl(video);
      if (currentUrl !== targetUrl && !targetUrl.startsWith('http')) return;

      if (res && res.success && res.data && ((res.data.video_options && res.data.video_options.length > 0) || (res.data.audio_options && res.data.audio_options.length > 0))) {
        inPageInspectCache.set(targetUrl, res.data);
        if (menu.classList.contains('active')) {
          renderInspectResults(menu, res.data, targetUrl, pageTitle, video);
        }
      } else {
        safeSendMessage({ action: "get_tab_media" }, (mediaRes) => {
          const streams = (mediaRes && mediaRes.media) ? mediaRes.media : [];
          if (menu.classList.contains('active')) {
            renderFallbackStreams(menu, streams, targetUrl, pageTitle, video);
          }
        });
      }
    });
  }

  function getQualityTag(res) {
    if (!res) return { class: 'tag-720p hd', label: 'HD' };
    const r = res.toLowerCase();
    if (r.includes('best') || r.includes('auto')) return { class: 'tag-best', label: 'Best' };
    if (r.includes('4320') || r.includes('8k')) return { class: 'tag-8k uhd', label: '8K' };
    if (r.includes('2160') || r.includes('4k')) return { class: 'tag-4k uhd', label: '4K' };
    if (r.includes('1440') || r.includes('2k')) return { class: 'tag-2k qhd', label: '2K' };
    if (r.includes('1080')) return { class: 'tag-1080p fhd', label: '1080p' };
    if (r.includes('720')) return { class: 'tag-720p hd', label: '720p' };
    if (r.includes('480')) return { class: 'tag-sd sd', label: '480p' };
    if (r.includes('360')) return { class: 'tag-sd sd', label: '360p' };
    if (r.includes('240')) return { class: 'tag-sd sd', label: '240p' };
    if (r.includes('144')) return { class: 'tag-sd sd', label: '144p' };
    return { class: 'tag-720p hd', label: res };
  }

  function renderInspectResults(menu, data, pageUrl, pageTitle, video) {
    const videoOpts = data.video_options || [];
    let audioOpts = data.audio_options || [];

    if (videoOpts.length === 0 && audioOpts.length === 0) {
      safeSendMessage({ action: "get_tab_media" }, (mediaRes) => {
        const streams = (mediaRes && mediaRes.media) ? mediaRes.media : [];
        if (menu.classList.contains('active')) {
          renderFallbackStreams(menu, streams, pageUrl, pageTitle, video);
        }
      });
      return;
    }

    // Always provide rich audio options if empty
    if (audioOpts.length === 0) {
      audioOpts = [
        {
          format_id: 'ba/best',
          label: 'Original Audio (Best Available)',
          ext: 'm4a',
          filesize_str: 'HQ Stream',
          filesize: null
        },
        {
          format_id: 'mp3_320',
          label: 'MP3 Audio (HQ 320kbps)',
          ext: 'mp3',
          filesize_str: 'Extracted MP3',
          filesize: null
        }
      ];
    }

    const videoCount = videoOpts.length;
    const audioCount = audioOpts.length;

    let html = `
      <div class="pro-dl-tabs-nav">
        <button type="button" class="pro-dl-tab-btn active" data-tab="video">
          <span>🎬 Video</span> <span class="pro-dl-tab-count">${videoCount}</span>
        </button>
        <button type="button" class="pro-dl-tab-btn" data-tab="audio">
          <span>🎵 Audio</span> <span class="pro-dl-tab-count">${audioCount}</span>
        </button>
      </div>
      <div class="pro-dl-tab-panels">
        <div class="pro-dl-tab-panel" id="pro-dl-video-panel">
    `;

    if (videoOpts.length === 0) {
      html += `<div class="pro-dl-empty">No video streams found.</div>`;
    } else {
      videoOpts.forEach(opt => {
        const tag = getQualityTag(opt.resolution || opt.label);
        html += `
          <div class="pro-dl-menu-item" data-format-id="${opt.format_id}" data-type="video" data-filesize="${opt.filesize || ''}">
            <span class="pro-dl-tag ${tag.class}">${tag.label}</span>
            <div class="pro-dl-item-info">
              <span class="pro-dl-item-title">${opt.label}</span>
              <span class="pro-dl-item-meta">${opt.ext.toUpperCase()} • ${opt.filesize_str || 'Direct'}</span>
            </div>
          </div>
        `;
      });
    }

    html += `
        </div>
        <div class="pro-dl-tab-panel hidden" id="pro-dl-audio-panel">
    `;

    if (audioOpts.length === 0) {
      html += `<div class="pro-dl-empty">No audio streams found.</div>`;
    } else {
      audioOpts.forEach(opt => {
        html += `
          <div class="pro-dl-menu-item" data-format-id="${opt.format_id}" data-type="audio" data-filesize="${opt.filesize || ''}">
            <span class="pro-dl-tag tag-audio">MP3/M4A</span>
            <div class="pro-dl-item-info">
              <span class="pro-dl-item-title">${opt.label}</span>
              <span class="pro-dl-item-meta">${opt.ext.toUpperCase()} • ${opt.filesize_str || 'Audio Stream'}</span>
            </div>
          </div>
        `;
      });
    }

    html += `
        </div>
      </div>
    `;

    menu.innerHTML = html;

    // Switch tabs on click
    const tabBtns = menu.querySelectorAll('.pro-dl-tab-btn');
    const videoPanel = menu.querySelector('#pro-dl-video-panel');
    const audioPanel = menu.querySelector('#pro-dl-audio-panel');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tab = btn.dataset.tab;
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (tab === 'video') {
          videoPanel.classList.remove('hidden');
          audioPanel.classList.add('hidden');
        } else {
          audioPanel.classList.remove('hidden');
          videoPanel.classList.add('hidden');
        }
      });
    });

    // Item click
    menu.querySelectorAll('.pro-dl-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.remove('active');

        const formatId = item.dataset.formatId;
        const isAudio = item.dataset.type === 'audio';
        const directUrl = item.dataset.direct;
        const fileSize = item.dataset.filesize ? parseInt(item.dataset.filesize) : null;
        const videoTitle = data.title || pageTitle || "Video";

        const ext = isAudio ? '.mp3' : '.mp4';
        const cleanTitle = videoTitle.replace(/[/\?%*:|"<>]/g, '_').trim();
        const initialFname = `${cleanTitle}${ext}`;

        fetchLatestDownloadDir((latestDir) => {
          renderIdmDownloadDialog({
            url: directUrl || pageUrl,
            filename: initialFname,
            file_size: fileSize,
            mime: isAudio ? 'audio/mpeg' : 'video/mp4',
            download_type: directUrl ? 'direct' : 'stream',
            format_id: formatId || (isAudio ? 'bestaudio/best' : 'bestvideo+bestaudio/best'),
            thumbnail: data.thumbnail || '',
            is_audio_only: isAudio,
            download_dir: latestDir,
            referrer: window.location.href
          });
        });
      });
    });
  }

  function renderFallbackStreams(menu, streams, pageUrl, pageTitle, video) {
    // Also check DOM for any source tags
    const sources = Array.from(video.querySelectorAll('source') || []).map(s => s.src).filter(s => s && s.startsWith('http'));
    sources.forEach(src => {
      if (!streams.some(s => s.url === src)) {
        streams.push({
          url: src,
          quality: 'HD Stream',
          type: 'video/mp4',
          sizeFormatted: 'Direct Video'
        });
      }
    });

    const directSrc = video.currentSrc || video.src;
    if (directSrc && !directSrc.startsWith('blob:') && !streams.some(s => s.url === directSrc)) {
      streams.unshift({
        url: directSrc,
        quality: 'Original Video',
        type: 'video/mp4',
        sizeFormatted: 'Full Quality'
      });
    }

    const videoStreams = streams.filter(s => !(s.type || '').includes('audio'));
    let audioStreams = streams.filter(s => (s.type || '').includes('audio'));

    if (audioStreams.length === 0 && directSrc && !directSrc.startsWith('blob:')) {
      audioStreams.push({
        url: directSrc,
        quality: 'Audio Stream',
        type: 'audio/mpeg',
        sizeFormatted: 'Audio Extracted'
      });
    }

    const videoCount = videoStreams.length;
    const audioCount = audioStreams.length;

    let html = `
      <div class="pro-dl-tabs-nav">
        <button type="button" class="pro-dl-tab-btn active" data-tab="video">
          <span>🎬 Video</span> <span class="pro-dl-tab-count">${videoCount}</span>
        </button>
        <button type="button" class="pro-dl-tab-btn" data-tab="audio">
          <span>🎵 Audio</span> <span class="pro-dl-tab-count">${audioCount}</span>
        </button>
      </div>
      <div class="pro-dl-tab-panels">
        <div class="pro-dl-tab-panel" id="pro-dl-video-panel">
    `;

    if (videoStreams.length === 0) {
      html += `<div class="pro-dl-empty">No video streams captured yet. Play video to capture.</div>`;
    } else {
      videoStreams.forEach(stream => {
        const tag = getQualityTag(stream.quality || stream.resolution);
        html += `
          <div class="pro-dl-menu-item" data-url="${stream.url}" data-size="${stream.size || ''}" data-type="video">
            <span class="pro-dl-tag ${tag.class}">${tag.label}</span>
            <div class="pro-dl-item-info">
              <span class="pro-dl-item-title">${stream.title || pageTitle.slice(0, 30)}</span>
              <span class="pro-dl-item-meta">${stream.ext || 'MP4'} • ${stream.sizeFormatted || 'High Speed Stream'}</span>
            </div>
          </div>
        `;
      });
    }

    html += `
        </div>
        <div class="pro-dl-tab-panel hidden" id="pro-dl-audio-panel">
    `;

    if (audioStreams.length === 0) {
      html += `<div class="pro-dl-empty">No audio streams captured yet.</div>`;
    } else {
      audioStreams.forEach(stream => {
        html += `
          <div class="pro-dl-menu-item" data-url="${stream.url}" data-size="${stream.size || ''}" data-type="audio">
            <span class="pro-dl-tag tag-audio">MP3/M4A</span>
            <div class="pro-dl-item-info">
              <span class="pro-dl-item-title">${stream.title || pageTitle.slice(0, 30)}</span>
              <span class="pro-dl-item-meta">${stream.ext || 'MP3'} • ${stream.sizeFormatted || 'Audio Stream'}</span>
            </div>
          </div>
        `;
      });
    }

    html += `
        </div>
      </div>
    `;

    menu.innerHTML = html;

    // Tab switching
    const tabBtns = menu.querySelectorAll('.pro-dl-tab-btn');
    const videoPanel = menu.querySelector('#pro-dl-video-panel');
    const audioPanel = menu.querySelector('#pro-dl-audio-panel');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tab = btn.dataset.tab;
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (tab === 'video') {
          videoPanel.classList.remove('hidden');
          audioPanel.classList.add('hidden');
        } else {
          audioPanel.classList.remove('hidden');
          videoPanel.classList.add('hidden');
        }
      });
    });

    menu.querySelectorAll('.pro-dl-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.remove('active');
        const streamUrl = item.dataset.url;
        const fileSize = item.dataset.size ? parseInt(item.dataset.size, 10) : 0;
        const isAudio = item.dataset.type === 'audio';
        const videoTitle = document.title || pageTitle || "Video";
        const cleanTitle = videoTitle.replace(/[/\?%*:|"<>]/g, '_').trim() || "video";
        const initialFname = `${cleanTitle}${isAudio ? '.mp3' : '.mp4'}`;

        fetchLatestDownloadDir((latestDir) => {
          renderIdmDownloadDialog({
            url: streamUrl,
            filename: initialFname,
            file_size: fileSize,
            mime: isAudio ? 'audio/mpeg' : 'video/mp4',
            download_type: 'direct',
            is_audio_only: isAudio,
            download_dir: latestDir,
            referrer: window.location.href
          });
        });
      });
    });
  }

  function showFloatingToast(msg, isSuccess = true, durationMs = 2600) {
    document.querySelectorAll('.pro-dl-inpage-toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `pro-dl-inpage-toast ${isSuccess ? 'success' : 'error'}`;

    if (isSuccess && (!msg || msg.toLowerCase().includes('started') || msg.includes('🥚'))) {
      toast.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-primary, #38BDF8); flex-shrink: 0;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        <span style="font-weight: 600; font-size: 13px; color: #FFFFFF;">Download started</span>
      `;
    } else {
      toast.innerHTML = `<span style="font-weight: 600; font-size: 13px; color: #FFFFFF; line-height: 1.4;">${msg}</span>`;
      if (!isSuccess && durationMs === 2600) {
        durationMs = 6500;
      }
    }

    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add('active');
    });

    setTimeout(() => {
      toast.classList.remove('active');
      setTimeout(() => toast.remove(), 250);
    }, durationMs);
  }

  // --- IDM-STYLE DRAGGABLE & MINIMIZABLE DOWNLOAD INTERCEPTION MODAL WITH EXTENSION PRESERVATION & CLEAN SPACING ---
  function inferFileExtension(filename, url, mime) {
    const cleanUrl = (url || '').split('?')[0].toLowerCase();
    const cleanName = (filename || '').toLowerCase();
    const cleanMime = (mime || '').toLowerCase();

    // 1. Check existing filename extension
    if (cleanName.includes('.')) {
      const ext = cleanName.split('.').pop();
      if (ext && ext.length >= 2 && ext.length <= 5) return `.${ext}`;
    }

    // 2. Check URL path extension
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.mp4', '.mkv', '.webm', '.mov', '.avi', '.mp3', '.m4a', '.wav', '.flac', '.zip', '.rar', '.7z', '.tar', '.gz', '.pdf', '.exe', '.msi', '.docx', '.xlsx']) {
      if (cleanUrl.endsWith(ext) || cleanUrl.includes(`${ext}/`)) return ext;
    }

    // 3. Check MIME type
    if (cleanMime.includes('image/jpeg') || cleanMime.includes('image/jpg')) return '.jpg';
    if (cleanMime.includes('image/png')) return '.png';
    if (cleanMime.includes('image/webp')) return '.webp';
    if (cleanMime.includes('image/gif')) return '.gif';
    if (cleanMime.includes('image/svg')) return '.svg';
    if (cleanMime.includes('video/mp4')) return '.mp4';
    if (cleanMime.includes('video/webm')) return '.webm';
    if (cleanMime.includes('video/x-matroska')) return '.mkv';
    if (cleanMime.includes('audio/mpeg') || cleanMime.includes('audio/mp3')) return '.mp3';
    if (cleanMime.includes('audio/mp4') || cleanMime.includes('audio/m4a')) return '.m4a';
    if (cleanMime.includes('application/pdf')) return '.pdf';
    if (cleanMime.includes('application/zip') || cleanMime.includes('compressed')) return '.zip';

    // 4. Domain & context heuristics
    if (cleanUrl.includes('unsplash.com') || cleanUrl.includes('pexels.com') || cleanMime.includes('image')) return '.jpg';
    if (cleanMime.includes('video') || cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) return '.mp4';
    if (cleanMime.includes('audio')) return '.mp3';

    return '.jpg';
  }

  function renderIdmDownloadDialog(downloadInfo) {
    if (!downloadInfo || !downloadInfo.url) return;

    // Remove any previous active (unminimized) modal, but KEEP all minimized capsules and modals
    document.querySelectorAll('.egg-dl-idm-backdrop:not(.minimized)').forEach(el => el.remove());

    const dialogId = 'egg-dl-idm-' + Math.random().toString(36).slice(2, 9);
    const backdrop = document.createElement('div');
    backdrop.className = 'egg-dl-idm-backdrop';
    backdrop.setAttribute('data-dialog-id', dialogId);
    backdrop.setAttribute('data-theme', activeEggTheme);

    const url = downloadInfo.url;
    const mime = (downloadInfo.mime || '').toLowerCase();
    const targetExt = inferFileExtension(downloadInfo.filename, url, mime);

    let initialFilename = downloadInfo.filename || 'download';
    if (!initialFilename.includes('.') && targetExt) {
      initialFilename = `${initialFilename}${targetExt}`;
    }

    const rawBytes = downloadInfo.file_size || 0;

    // Format file size (e.g. "1.43 MB (1,504,476 Bytes)" or "1.43 MB")
    let sizeStr = '';
    if (rawBytes >= 1024 * 1024 * 1024) {
      sizeStr = (rawBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    } else if (rawBytes >= 1024 * 1024) {
      sizeStr = (rawBytes / (1024 * 1024)).toFixed(2) + ' MB';
    } else if (rawBytes >= 1024) {
      sizeStr = (rawBytes / 1024).toFixed(2) + ' KB';
    } else if (rawBytes > 0) {
      sizeStr = rawBytes + ' Bytes';
    }
    const inlineSizeText = rawBytes > 0 ? `${sizeStr} (${rawBytes.toLocaleString()} Bytes)` : '';

    // Extension & category detection
    function getExtAndCategory(fname) {
      let ext = fname.includes('.') ? fname.split('.').pop().toUpperCase() : (targetExt ? targetExt.replace('.', '').toUpperCase() : 'FILE');
      let catIcon = '';
      let catBadgeColor = '#38BDF8';
      let catBg = 'rgba(56, 189, 248, 0.12)';
      let catBorder = 'rgba(56, 189, 248, 0.25)';
      let catLabel = 'General File';

      const extLower = ext.toLowerCase();
      if (['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'wmv'].includes(extLower) || mime.includes('video') || url.includes('youtube.com') || url.includes('youtu.be')) {
        catLabel = 'Video File';
        catBadgeColor = '#C084FC';
        catBg = 'rgba(192, 132, 252, 0.12)';
        catBorder = 'rgba(192, 132, 252, 0.25)';
        catIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C084FC" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>';
      } else if (['mp3', 'm4a', 'wav', 'flac', 'aac', 'ogg', 'opus'].includes(extLower) || mime.includes('audio') || downloadInfo.is_audio_only) {
        catLabel = 'Audio File';
        catBadgeColor = '#FBBF24';
        catBg = 'rgba(251, 191, 36, 0.12)';
        catBorder = 'rgba(251, 191, 36, 0.25)';
        catIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
      } else if (['zip', 'rar', '7z', 'tar', 'gz', 'iso'].includes(extLower) || mime.includes('zip') || mime.includes('compressed')) {
        catLabel = 'Compressed Archive';
        catBadgeColor = '#FB7185';
        catBg = 'rgba(251, 113, 133, 0.12)';
        catBorder = 'rgba(251, 113, 133, 0.25)';
        catIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FB7185" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>';
      } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extLower) || mime.includes('image')) {
        catLabel = 'Image File';
        catBadgeColor = '#F472B6';
        catBg = 'rgba(244, 114, 182, 0.12)';
        catBorder = 'rgba(244, 114, 182, 0.25)';
        catIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F472B6" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
      } else if (['exe', 'msi', 'dmg', 'apk', 'appimage', 'deb'].includes(extLower)) {
        catLabel = 'Application';
        catBadgeColor = '#38BDF8';
        catBg = 'rgba(56, 189, 248, 0.12)';
        catBorder = 'rgba(56, 189, 248, 0.25)';
        catIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
      } else if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'].includes(extLower) || mime.includes('pdf')) {
        catLabel = 'Document';
        catBadgeColor = '#34D399';
        catBg = 'rgba(52, 211, 153, 0.12)';
        catBorder = 'rgba(52, 211, 153, 0.25)';
        catIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34D399" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>';
      } else {
        catIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>';
      }
      return { ext, catLabel, catBadgeColor, catBg, catBorder, catIcon };
    }
    let meta = getExtAndCategory(initialFilename);
    const realLogoUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL) ? (chrome.runtime.getURL('icons/egg-icon.png') || chrome.runtime.getURL('icons/icon128.png')) : '';
    let defaultFolder = (downloadInfo && downloadInfo.download_dir) || cachedDownloadDir || 'Downloads\\Eggdl Downloads\\';
    if (!defaultFolder.endsWith('\\') && !defaultFolder.endsWith('/')) {
      defaultFolder += '\\';
    }

    backdrop.innerHTML = `
      <div class="egg-dl-idm-modal">
        <!-- Draggable Header with Window Controls -->
        <div class="egg-dl-idm-header" title="Drag to move">
          <div style="display: flex; align-items: center; gap: 8px; pointer-events: none;">
            <img src="${realLogoUrl}" alt="EggDL" style="width: 18px; height: 18px; object-fit: contain; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.5));">
            <span style="font-size: 13.5px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.01em;">EggDL - Start Download</span>
          </div>
          <div class="egg-dl-idm-window-controls">
            <button type="button" class="egg-dl-idm-ctrl-btn egg-dl-idm-min-btn" title="Minimize">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button type="button" class="egg-dl-idm-ctrl-btn close egg-dl-idm-close-btn" title="Close">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Body Content with Modular Stepped Spacing -->
        <div style="padding: 14px 16px; display: flex; flex-direction: column; gap: 11px;">
          <!-- File Details Row with Inline File Size -->
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="egg-dl-idm-cat-box" style="width: 38px; height: 38px; border-radius: 6px; background: ${meta.catBg}; border: 1px solid ${meta.catBorder}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              ${meta.catIcon}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div class="egg-dl-idm-filename-title" style="font-size: 13.5px; font-weight: 700; color: #FFFFFF; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${initialFilename}">${initialFilename}</div>
              <div style="font-size: 11px; font-weight: 500; color: #94A3B8; margin-top: 3px; display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; overflow: hidden;">
                <span class="egg-dl-idm-ext-badge" style="color: ${meta.catBadgeColor}; font-weight: 700; font-size: 10px; background: ${meta.catBg}; border: 1px solid ${meta.catBorder}; padding: 1px 6px; border-radius: 4px; flex-shrink: 0;">${meta.ext}</span>
                <span style="color: #64748B; flex-shrink: 0;">•</span>
                <span class="egg-dl-idm-cat-label" style="color: #CBD5E1; font-weight: 600; flex-shrink: 0;">${meta.catLabel}</span>
                ${inlineSizeText ? `
                  <span style="color: #64748B; flex-shrink: 0;">•</span>
                  <span class="egg-dl-idm-size-label" style="color: var(--accent-primary, #38BDF8); font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${inlineSizeText}</span>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- URL / Source Line -->
          <div style="background: var(--bg-input, #12151A); border: 1px solid var(--border-default, #2E3540); border-radius: 6px; padding: 6px 10px; display: flex; align-items: center; gap: 8px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary, #38BDF8)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; color: #94A3B8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;" title="${url}">${url}</span>
          </div>

          <!-- Save As: Click to Rename & Edit Path Row (Clean & Full Width) -->
          <div class="egg-dl-idm-save-row">
            <span class="egg-dl-idm-save-label">Save As:</span>
            <div class="egg-dl-idm-input-wrapper">
              <input type="text" class="egg-dl-idm-path-input" value="${defaultFolder}${initialFilename}" spellcheck="false" title="Click to rename file or edit destination path">
            </div>
            <button type="button" class="egg-dl-idm-browse-btn" title="Choose download directory">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            </button>
          </div>
        </div>

        <!-- Footer Action Buttons with Solid Native Styling -->
        <div style="padding: 10px 16px 14px 16px; display: flex; align-items: center; justify-content: flex-end; gap: 9px; border-top: 1px solid var(--border-default, #2E3540); background: var(--bg-surface, #181C22);">
          <button type="button" class="egg-dl-idm-browser-btn">
            Download with Browser
          </button>
          <button type="button" class="egg-dl-idm-cancel-btn">
            Cancel
          </button>
          <button type="button" class="egg-dl-idm-start-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span>Start Download</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    requestAnimationFrame(() => {
      backdrop.classList.add('active');
    });

    const modal = backdrop.querySelector('.egg-dl-idm-modal');
    const header = backdrop.querySelector('.egg-dl-idm-header');
    const pathInput = backdrop.querySelector('.egg-dl-idm-path-input');
    const titleEl = backdrop.querySelector('.egg-dl-idm-filename-title');
    const extBadgeEl = backdrop.querySelector('.egg-dl-idm-ext-badge');
    const catLabelEl = backdrop.querySelector('.egg-dl-idm-cat-label');
    const catBoxEl = backdrop.querySelector('.egg-dl-idm-cat-box');

    // Live update filename, badge, and category when user renames file
    if (pathInput) {
      pathInput.addEventListener('input', () => {
        const val = pathInput.value.trim();
        let fname = val.split(/[\\\/]/).pop() || val;
        if (fname) {
          const displayName = fname.includes('.') ? fname : `${fname}${targetExt}`;
          titleEl.textContent = displayName;
          titleEl.title = displayName;
          const updatedMeta = getExtAndCategory(displayName);
          extBadgeEl.textContent = updatedMeta.ext;
          extBadgeEl.style.color = updatedMeta.catBadgeColor;
          extBadgeEl.style.background = updatedMeta.catBg;
          extBadgeEl.style.borderColor = updatedMeta.catBorder;
          catLabelEl.textContent = updatedMeta.catLabel;
          catBoxEl.innerHTML = updatedMeta.catIcon;
          catBoxEl.style.background = updatedMeta.catBg;
          catBoxEl.style.borderColor = updatedMeta.catBorder;
        }
      });
    }

    // If download_dir wasn't passed directly or default fallback was used, refresh dynamically from backend
    if (!downloadInfo || !downloadInfo.download_dir) {
      fetchLatestDownloadDir((freshDir) => {
        if (freshDir && pathInput) {
          const curVal = pathInput.value;
          if (curVal.startsWith('Downloads\\Eggdl Downloads\\') || !curVal.includes('\\')) {
            const fname = curVal.split(/[\\\/]/).pop() || initialFilename;
            const pfx = (freshDir.endsWith('\\') || freshDir.endsWith('/')) ? freshDir : (freshDir + '\\');
            pathInput.value = `${pfx}${fname}`;
          }
        }
      });
    }

    // Browse folder button: opens native folder picker and updates input + storage
    const browseBtn = backdrop.querySelector('.egg-dl-idm-browse-btn');
    let isBrowsingFolder = false;
    browseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isBrowsingFolder) return;
      isBrowsingFolder = true;
      browseBtn.style.opacity = '0.5';
      browseBtn.style.pointerEvents = 'none';

      safeSendMessage({ action: "select_folder" }, (res) => {
        isBrowsingFolder = false;
        browseBtn.style.opacity = '1';
        browseBtn.style.pointerEvents = 'auto';

        if (res && res.success && res.folder) {
          let chosen = res.folder;
          if (!chosen.endsWith('\\') && !chosen.endsWith('/')) chosen += '\\';
          let curVal = pathInput ? pathInput.value.trim() : initialFilename;
          let fname = curVal.split(/[\\\/]/).pop() || initialFilename;
          if (pathInput) pathInput.value = `${chosen}${fname}`;
          cachedDownloadDir = chosen;
          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({ eggdlDownloadDir: chosen });
          }
        }
      });
    });

    // Drag-to-Move Functionality via Header
    if (header && modal) {
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let modalStartX = 0;
      let modalStartY = 0;

      header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.egg-dl-idm-window-controls')) return;

        isDragging = true;
        header.style.cursor = 'grabbing';

        const rect = modal.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        modalStartX = rect.left;
        modalStartY = rect.top;

        modal.style.position = 'fixed';
        modal.style.left = `${rect.left}px`;
        modal.style.top = `${rect.top}px`;
        modal.style.transform = 'none';
        modal.style.margin = '0';

        e.preventDefault();
      });

      const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        let newLeft = modalStartX + dx;
        let newTop = modalStartY + dy;

        newLeft = Math.max(10, Math.min(window.innerWidth - modal.offsetWidth - 10, newLeft));
        newTop = Math.max(10, Math.min(window.innerHeight - modal.offsetHeight - 10, newTop));

        modal.style.left = `${newLeft}px`;
        modal.style.top = `${newTop}px`;
      };

      const onMouseUp = () => {
        if (isDragging) {
          isDragging = false;
          header.style.cursor = 'grab';
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }

    function getOrCreateDockContainer() {
      let container = document.querySelector('.egg-dl-idm-dock-container');
      if (!container) {
        container = document.createElement('div');
        container.className = 'egg-dl-idm-dock-container';
        document.body.appendChild(container);
      }
      return container;
    }

    const dismissModal = () => {
      backdrop.classList.remove('active');
      removeDockItemFromStorage(dialogId);
      safeSendMessage({ action: "dock_remove", id: dialogId });
      setTimeout(() => backdrop.remove(), 200);
    };

    // Close button
    backdrop.querySelector('.egg-dl-idm-close-btn')?.addEventListener('click', dismissModal);
    backdrop.querySelector('.egg-dl-idm-cancel-btn')?.addEventListener('click', dismissModal);

    // Minimize button -> Hides modal and adds floating dock capsule stacked upwards ("top, top, top")
    backdrop.querySelector('.egg-dl-idm-min-btn')?.addEventListener('click', () => {
      backdrop.classList.add('minimized');

      let currentFname = pathInput?.value.trim().split(/[\\\/]/).pop() || initialFilename;
      if (!currentFname.includes('.') && targetExt) currentFname += targetExt;
      const shortTitle = currentFname.length > 20 ? currentFname.slice(0, 18) + '…' : currentFname;

      const fullPath = pathInput ? pathInput.value.trim() : initialFilename;
      let chosenDir = null;
      if (fullPath.includes('\\') || fullPath.includes('/')) {
        const parts = fullPath.split(/[\\\/]/);
        parts.pop();
        chosenDir = parts.join('\\');
      }
      const dirToSend = chosenDir || (downloadInfo && downloadInfo.download_dir) || cachedDownloadDir || null;

      const dockPayload = {
        id: dialogId,
        title: shortTitle,
        filename: currentFname,
        url: url,
        download_dir: dirToSend,
        download_type: downloadInfo.download_type || "direct",
        format_id: downloadInfo.format_id || null,
        thumbnail: downloadInfo.thumbnail || "",
        is_audio_only: downloadInfo.is_audio_only || false,
        referrer: downloadInfo.referrer || window.location.href,
        file_size: rawBytes > 0 ? rawBytes : null
      };

      // 1. Save to local storage for instant multi-tab sync
      saveDockItemToStorage(dockPayload);

      // 2. Sync with native desktop floating dock
      safeSendMessage({
        action: "dock_add",
        payload: dockPayload
      });
    });

    backdrop.querySelector('.egg-dl-idm-browser-btn')?.addEventListener('click', () => {
      safeSendMessage({ action: "bypass_browser_download", url: url });
      dismissModal();
    });

    // Start Download: always guarantees valid file extension on disk
    backdrop.querySelector('.egg-dl-idm-start-btn')?.addEventListener('click', () => {
      let fullPath = pathInput ? pathInput.value.trim() : initialFilename;
      let finalFilename = initialFilename;
      let customDir = null;

      if (fullPath.includes('\\') || fullPath.includes('/')) {
        const parts = fullPath.split(/[\\\/]/);
        finalFilename = parts.pop() || initialFilename;
        customDir = parts.join('\\');
      } else if (fullPath) {
        finalFilename = fullPath;
      }

      // If customDir is empty or placeholder, prioritize user's configured download directory
      const isPlaceholderFallback = !customDir || 
        customDir.toLowerCase() === 'downloads\\eggdl downloads' || 
        customDir.toLowerCase() === 'downloads/eggdl downloads';

      const bestKnownDir = (downloadInfo && downloadInfo.download_dir) || cachedDownloadDir;
      let dirToSend = customDir;
      if (isPlaceholderFallback && bestKnownDir) {
        dirToSend = bestKnownDir;
      } else if (!dirToSend && bestKnownDir) {
        dirToSend = bestKnownDir;
      }

      // Always guarantee proper file extension (.jpg, .mp4, .mp3, etc.)
      if (!finalFilename.includes('.') && targetExt) {
        finalFilename = `${finalFilename}${targetExt}`;
      }

      safeSendMessage({
        action: "download_task",
        payload: {
          url: url,
          download_type: downloadInfo.download_type || "direct",
          format_id: downloadInfo.format_id || null,
          thumbnail: downloadInfo.thumbnail || "",
          is_audio_only: downloadInfo.is_audio_only || false,
          custom_filename: finalFilename,
          custom_title: finalFilename,
          download_dir: dirToSend,
          referer: downloadInfo.referrer || window.location.href,
          expected_size: rawBytes > 0 ? rawBytes : null
        }
      }, (res) => {
        dismissModal();
        if (res && res.success) {
          showFloatingToast("Download started⚡", true);
        } else {
          const isExpired = res?.error === 'trial_expired' || res?.trial_expired || (res?.message && (res.message.includes('Trial has ended') || res.message.includes('trial has expired') || res.message.includes('Subscription Expired') || res.message.includes('trial_expired') || res.message.includes('Revoked')));
          const isDailyLimit = res?.error === 'trial_daily_limit_reached' || (res?.message && res.message.includes('Daily Free Trial Limit'));

          let errMsg = res?.message || res?.detail;
          if (isExpired) {
            errMsg = '⚠️ Free Trial Expired: Your 7-day free trial has ended. Please open EggDL or enter a product key to continue downloading.';
          } else if (isDailyLimit) {
            errMsg = '⚠️ Daily Limit Reached (3/3): You have reached your 3 daily downloads on the Free Trial. Upgrade to Starter or Pro for unlimited downloads!';
          } else if (!errMsg || errMsg === 'HTTP 403') {
            errMsg = '⚠️ Free Trial Expired: Please open EggDL or enter your product key to continue downloading.';
          }
          showFloatingToast(errMsg, false, 8500);
        }
      });
    });
  }
  // Track right-clicked elements for direct image capture
  let lastRightClickedEl = null;
  document.addEventListener('contextmenu', (e) => {
    lastRightClickedEl = e.target;
    window.__lastRightClickedImg = e.target;
  }, true);

  // Handle image capture, settings, and IDM download messages
  if (isExtensionValid() && chrome.runtime.onMessage) {
    try {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (!isExtensionValid()) return;

        if (request.action === "show_idm_download_dialog") {
          renderIdmDownloadDialog(request.download);
          sendResponse({ success: true });
          return true;
        }

        if (request.action === "show_download_complete") {
          renderInPageCompleteNotification(request.task);
          sendResponse({ success: true });
          return true;
        }

        if (request.action === "set_theme") {
          applyThemeEverywhere(request.theme);
          sendResponse({ success: true });
          return true;
        }

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

        if (request.action === "dock_sync") {
          syncDockCapsulesFromStorage();
          sendResponse({ success: true });
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
    } catch (_) {}
  }

  // Handle SPA navigation on YouTube / Vimeo / Pexels / etc.
  function handleUrlChange() {
    if (!isExtensionValid()) {
      cleanupInvalidatedExtension();
      return;
    }
    document.querySelectorAll('.pro-dl-badge-menu.active').forEach(m => m.classList.remove('active'));
    setTimeout(attachFloatingDownloaders, 250);
    setTimeout(attachFloatingDownloaders, 800);
    setTimeout(attachFloatingDownloaders, 1800);
  }

  window.addEventListener('yt-navigate-finish', handleUrlChange);
  window.addEventListener('yt-page-data-updated', handleUrlChange);
  window.addEventListener('spfdone', handleUrlChange);
  window.addEventListener('popstate', handleUrlChange);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      attachFloatingDownloaders();
    }
  });

  // Render Premium Classy In-Page Completion Popup on Right Side
  function renderInPageCompleteNotification(taskData) {
    if (!taskData) return;
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
    
    let dirPath = '';
    const lastSlashIdx = Math.max(rawFilePath.lastIndexOf('\\'), rawFilePath.lastIndexOf('/'));
    if (lastSlashIdx !== -1) {
      dirPath = rawFilePath.substring(0, lastSlashIdx + 1);
    } else {
      dirPath = 'Downloads\\EggDL\\';
    }
    if (!dirPath.endsWith('\\') && !dirPath.endsWith('/')) {
      dirPath += '\\';
    }
    const category = (taskData.category || 'file').toLowerCase();
    
    let realLogoUrl = '';
    try {
      realLogoUrl = chrome.runtime.getURL('icons/egg-icon.png') || chrome.runtime.getURL('icons/icon128.png');
    } catch (_) {}

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
          ${realLogoUrl ? `<img src="${realLogoUrl}" alt="EggDL" style="width: 19px; height: 19px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">` : ''}
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
      safeSendMessage({
        action: 'open_file',
        file_path: taskData.file_path,
        task_id: taskData.id
      });
      dismiss();
    });

    const openFolder = (e) => {
      e.stopPropagation();
      safeSendMessage({
        action: 'open_folder',
        file_path: taskData.file_path,
        task_id: taskData.id
      });
      dismiss();
    };

    popup.querySelector('.egg-dl-folder-btn')?.addEventListener('click', openFolder);
    popup.querySelector('.egg-dl-path-text-area')?.addEventListener('click', openFolder);

    const copyBtn = popup.querySelector('.egg-dl-copy-path-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(dirPath);
          }
        } catch (_) {}
        const copyIcon = copyBtn.querySelector('.egg-dl-copy-icon');
        const copiedText = copyBtn.querySelector('.egg-dl-copied-text');
        if (copyIcon && copiedText) {
          copyIcon.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
          copyBtn.style.color = '#10B981';
          copiedText.style.display = 'inline';
          setTimeout(() => {
            copyIcon.innerHTML = '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>';
            copyBtn.style.color = '#94A3B8';
            copiedText.style.display = 'none';
          }, 1600);
        }
      });
    }

    popup.addEventListener('mouseenter', () => clearTimeout(timer));
    popup.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 4000); });
  }

  // Poll backend for unread download notifications on visible active pages
  let isCheckingNotifications = false;
  async function checkUnreadNotifications() {
    if (document.visibilityState !== 'visible' || isCheckingNotifications) return;
    isCheckingNotifications = true;
    try {
      const resp = await fetch('http://127.0.0.1:8000/api/system/unread-notifications');
      if (resp.ok) {
        const data = await resp.json();
        if (data.success && data.notifications && data.notifications.length > 0) {
          const notifiedIds = [];
          for (const task of data.notifications) {
            renderInPageCompleteNotification(task);
            notifiedIds.push(task.id);
          }
          if (notifiedIds.length > 0) {
            await fetch('http://127.0.0.1:8000/api/system/mark-notified', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ task_ids: notifiedIds })
            });
          }
        }
      }
    } catch (_) {}
    finally {
      isCheckingNotifications = false;
    }
  }

  setInterval(checkUnreadNotifications, 2500);

  // Observe DOM for video players
  try {
    window.__proDlObserver = new MutationObserver(() => attachFloatingDownloaders());
    window.__proDlObserver.observe(document.body, { childList: true, subtree: true });
    window.__proDlInterval = setInterval(attachFloatingDownloaders, 2500);
  } catch (_) {}
})();
