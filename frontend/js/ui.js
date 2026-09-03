// Safe global lucide icon runner with standalone offline SVG dictionary
if (typeof window !== 'undefined') {
  const fallbackIconMap = {
    'layout-grid': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>',
    'video': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>',
    'music': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    'file-text': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    'archive': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>',
    'terminal': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
    'compass': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
    'settings': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    'folder': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>',
    'folder-open': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>',
    'copy': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
    'trash-2': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>',
    'play': '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    'pause': '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
    'rotate-cw': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><polyline points="21 3 21 8 16 8"/></svg>',
    'download': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
    'arrow-down-circle': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" x2="12" y1="8" y2="16"/></svg>',
    'clipboard': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>',
    'link-2': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></svg>',
    'zap': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    'download-cloud': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m8 17 4 4 4-4"/></svg>',
    'check-circle-2': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
    'hard-drive': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/></svg>',
    'search': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg>',
    'x': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>',
    'file': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>',
    'check': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    'check-circle': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    'lock': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    'shield-check': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
    'shield-alert': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    'layers': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.9a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>',
    'play-circle': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>',
    'monitor': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    'sparkles': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>'
  };

  const renderFallbackIcons = (options) => {
    try {
      const root = (options && options.root) ? options.root : document;
      const elements = root.querySelectorAll ? root.querySelectorAll('i[data-lucide]') : [];
      elements.forEach(el => {
        const iconName = el.getAttribute('data-lucide');
        if (fallbackIconMap[iconName]) {
          el.innerHTML = fallbackIconMap[iconName];
        }
      });
    } catch (_) {}
  };

  if (typeof window.lucide === 'undefined' || !window.lucide.createIcons) {
    window.lucide = { createIcons: renderFallbackIcons };
  } else {
    const origCreateIcons = window.lucide.createIcons;
    window.lucide.createIcons = function(options) {
      try {
        origCreateIcons.call(window.lucide, options);
      } catch (_) {
        renderFallbackIcons(options);
      }
    };
  }
}

const UI = {
  formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let b = bytes;
    while (b >= 1024 && i < units.length - 1) {
      b /= 1024;
      i++;
    }
    return `${b.toFixed(1)} ${units[i]}`;
  },

  formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return '0.0 KB/s';
    return `${this.formatBytes(bytesPerSec)}/s`;
  },

  formatEta(seconds) {
    if (!seconds || seconds <= 0 || seconds > 86400 * 7) return '--:--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m ${secs}s`;
  },

  formatDate(val) {
    if (!val) return new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    let d;
    if (typeof val === 'number') {
      d = val < 1e11 ? new Date(val * 1000) : new Date(val);
    } else {
      d = new Date(val);
    }
    if (isNaN(d.getTime())) return new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  },

  getCategoryIcon(category) {
    switch (category) {
      case 'video': return 'video';
      case 'audio': return 'music';
      case 'document': return 'file-text';
      case 'compressed': return 'archive';
      case 'program': return 'terminal';
      default: return 'file';
    }
  },

  getResolutionTag(resolution) {
    if (!resolution) return { class: 'hd', text: 'VIDEO' };
    const res = resolution.toLowerCase();
    if (res.includes('2160') || res.includes('4k')) return { class: 'uhd', text: '4K UHD' };
    if (res.includes('1440') || res.includes('2k')) return { class: 'qhd', text: '2K QHD' };
    if (res.includes('1080')) return { class: 'fhd', text: '1080p FHD' };
    if (res.includes('720')) return { class: 'hd', text: '720p HD' };
    if (res.includes('audio')) return { class: 'audio', text: 'AUDIO' };
    return { class: 'hd', text: resolution };
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  _lastSoundPlayTime: 0,

  playTechyCompletionSound() {
    try {
      const now = Date.now();
      if (now - this._lastSoundPlayTime < 2500) {
        return; // Ignore rapid duplicate audio playback calls within 2.5 seconds
      }
      this._lastSoundPlayTime = now;

      if (window.DOWNLOAD_COMPLETE_AUDIO) {
        const snd = new Audio(window.DOWNLOAD_COMPLETE_AUDIO);
        snd.volume = 0.85;
        snd.play().catch(() => {});
        return;
      }
      const snd = new Audio('/static/audio/notification.mp3');
      snd.volume = 0.85;
      snd.play().catch(() => {});
    } catch (e) {
      console.warn('Audio playback note:', e);
    }
  },

  showToast(message, type = 'info', duration = 5000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-triangle';
    if (type === 'warning') iconName = 'alert-circle';

    toast.innerHTML = `
      <i data-lucide="${iconName}"></i>
      <span>${message}</span>
    `;
    container.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  showDownloadCompleteNotification(task) {
    if (!task) return;
    // 1. Play the download complete sound effect
    try {
      this.playTechyCompletionSound();
    } catch (_) {}

    // 2. In web browser contexts (non-desktop tray), show native OS/browser notification
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const title = task.title || task.filename || 'File';
        new Notification('EggDL • Download Complete ⚡', {
          body: `Downloaded ${title}`,
          icon: '/static/images/egg-icon.png'
        });
      }
    } catch (_) {}
  },

  renderActiveTasks(tasks) {
    const container = document.getElementById('active-tasks-container');
    const activeSection = document.getElementById('active-section');
    const activeCountSpan = document.getElementById('active-count');
    const iconSlot = document.getElementById('active-header-icon-slot');
    
    if (!container) return;

    const activeList = Object.values(tasks).filter(t => t.status === 'downloading' || t.status === 'queued' || t.status === 'paused');
    
    if (activeList.length === 0) {
      if (activeSection) activeSection.style.display = 'none';
      return;
    }

    if (activeSection) activeSection.style.display = 'block';
    if (activeCountSpan) activeCountSpan.innerText = activeList.length;

    // Only show rolling circle while actively downloading. If paused, show static pause icon
    const isAnyDownloading = activeList.some(t => t.status === 'downloading');
    if (iconSlot) {
      if (isAnyDownloading) {
        iconSlot.innerHTML = '<i data-lucide="loader-2" class="spin" style="color: #38BDF8; width: 18px; height: 18px; margin-right: 2px;"></i>';
      } else {
        iconSlot.innerHTML = '<i data-lucide="pause-circle" style="color: var(--accent-amber); width: 18px; height: 18px; margin-right: 2px;"></i>';
      }
      lucide.createIcons({ root: iconSlot });
    }

    // Check if card structure matches existing DOM to avoid replacing nodes and flickering
    const currentCardIds = Array.from(container.children).map(c => c.id);
    const newCardIds = activeList.map(t => `card-${t.id}`);
    const isStructureSame = currentCardIds.length === newCardIds.length && currentCardIds.every((id, idx) => id === newCardIds[idx]);

    if (isStructureSame) {
      activeList.forEach(task => {
        const card = document.getElementById(`card-${task.id}`);
        if (!card) return;

        const isPaused = task.status === 'paused';
        const isFinalizing = !isPaused && task.progress >= 99.0;
        const speedStr = isPaused ? 'Paused' : (isFinalizing ? 'Finalizing...' : UI.formatSpeed(task.speed));
        const etaStr = isPaused ? '--:--' : (isFinalizing ? '--:--' : UI.formatEta(task.eta));
        const sizeStr = task.file_size > 0 
          ? `${UI.formatBytes(task.downloaded_bytes)} / ${UI.formatBytes(task.file_size)}` 
          : UI.formatBytes(task.downloaded_bytes);

        card.className = `active-card ${isPaused ? 'is-paused' : ''}`;
        
        const subEl = card.querySelector('.active-file-sub');
        if (subEl) subEl.innerHTML = `<span>${sizeStr}</span><span>•</span><span>ETA: ${etaStr}</span>`;

        const valEl = card.querySelector('.stat-value');
        if (valEl) {
          valEl.innerText = speedStr;
          valEl.style.color = isPaused ? 'var(--accent-amber)' : (isFinalizing ? 'var(--accent-cyan)' : '');
        }

        const labelEl = card.querySelector('.stat-label');
        if (labelEl) labelEl.innerText = (isPaused || isFinalizing) ? 'Status' : 'Download Speed';

        const fillEl = card.querySelector('.active-progress-fill');
        if (fillEl) {
          fillEl.style.width = `${task.progress}%`;
          fillEl.className = `active-progress-fill ${isPaused ? 'paused' : ''} ${isFinalizing ? 'processing' : ''}`;
        }

        const pctEl = card.querySelector('.active-progress-pct');
        if (pctEl) {
          pctEl.innerText = `${task.progress}%`;
          pctEl.style.color = isPaused ? 'var(--accent-amber)' : 'var(--accent-cyan)';
        }

        const pauseBtn = card.querySelector('.btn-pause-toggle');
        if (pauseBtn) {
          const currentIsPaused = pauseBtn.dataset.paused === 'true';
          if (currentIsPaused !== isPaused) {
            pauseBtn.dataset.paused = isPaused ? 'true' : 'false';
            pauseBtn.title = isPaused ? 'Resume Download' : 'Pause Download';
            pauseBtn.setAttribute('onclick', isPaused ? `App.resumeTask('${task.id}')` : `App.pauseTask('${task.id}')`);
            pauseBtn.innerHTML = `<i data-lucide="${isPaused ? 'play' : 'pause'}"></i>`;
            lucide.createIcons({ root: pauseBtn });
          }
        }
      });
      return;
    }

    container.innerHTML = activeList.map(task => {
      const isPaused = task.status === 'paused';
      const isFinalizing = !isPaused && task.progress >= 99.0;
      const speedStr = isPaused ? 'Paused' : (isFinalizing ? 'Finalizing...' : UI.formatSpeed(task.speed));
      const etaStr = isPaused ? '--:--' : (isFinalizing ? '--:--' : UI.formatEta(task.eta));
      const sizeStr = task.file_size > 0 
        ? `${UI.formatBytes(task.downloaded_bytes)} / ${UI.formatBytes(task.file_size)}` 
        : UI.formatBytes(task.downloaded_bytes);

      return `
        <div class="active-card ${isPaused ? 'is-paused' : ''}" id="card-${task.id}">
          <div class="active-card-header">
            <div class="active-card-meta">
              ${task.thumbnail 
                ? `<img class="active-thumb" src="${task.thumbnail}" alt="Thumbnail">` 
                : `<div class="type-icon ${task.category || 'other'}"><i data-lucide="${UI.getCategoryIcon(task.category)}"></i></div>`
              }
              <div class="active-file-info">
                <div class="active-file-title" title="${task.title || task.filename}">${task.title || task.filename}</div>
                <div class="active-file-sub">
                  <span>${sizeStr}</span>
                  <span>•</span>
                  <span>ETA: ${etaStr}</span>
                </div>
              </div>
            </div>

            <div class="active-card-stats">
              <div class="stat-group">
                <div class="stat-value" style="${isPaused ? 'color: var(--accent-amber);' : (isFinalizing ? 'color: var(--accent-cyan);' : '')}">${speedStr}</div>
                <div class="stat-label">${(isPaused || isFinalizing) ? 'Status' : 'Download Speed'}</div>
              </div>

              <div class="active-actions">
                <button class="btn btn-secondary btn-sm btn-pause-toggle" data-paused="${isPaused ? 'true' : 'false'}" onclick="${isPaused ? `App.resumeTask('${task.id}')` : `App.pauseTask('${task.id}')`}" title="${isPaused ? 'Resume Download' : 'Pause Download'}">
                  <i data-lucide="${isPaused ? 'play' : 'pause'}"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="App.cancelTask('${task.id}')" title="Cancel & Remove">
                  <i data-lucide="x"></i>
                </button>
              </div>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 14px; margin-top: 10px;">
            <div class="active-progress-bar" style="flex: 1; margin-top: 0;">
              <div class="active-progress-fill ${isPaused ? 'paused' : ''} ${isFinalizing ? 'processing' : ''}" style="width: ${task.progress}%;"></div>
            </div>
            <span class="active-progress-pct" style="font-size: 0.9rem; font-family: var(--font-mono); font-weight: 700; color: ${isPaused ? 'var(--accent-amber)' : 'var(--accent-cyan)'}; min-width: 45px; text-align: right;">${task.progress}%</span>
          </div>
        </div>
      `;
    }).join('');

    lucide.createIcons();
  },

  renderDownloadsTable(downloads) {
    const tbody = document.getElementById('downloads-tbody');
    const emptyState = document.getElementById('empty-state');
    if (!tbody) return;

    if (!downloads || downloads.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    tbody.innerHTML = downloads.map(item => {
      const liveActive = (typeof App !== 'undefined' && App.activeTasks) ? App.activeTasks[item.id] : null;
      const effectiveStatus = liveActive ? liveActive.status : (item.status || 'queued');
      const effectiveProgress = liveActive ? (liveActive.progress || item.progress || 0) : (item.progress || 0);

      const sizeStr = item.file_size > 0 ? UI.formatBytes(item.file_size) : UI.formatBytes(item.downloaded_bytes);
      const isDone = effectiveStatus === 'completed';
      const isDownloading = effectiveStatus === 'downloading';
      const isPaused = effectiveStatus === 'paused';
      const isFailedOrCanceled = effectiveStatus === 'canceled' || effectiveStatus === 'error';
      const statusClass = effectiveStatus;
      
      let statusLabel = effectiveStatus;
      if (effectiveStatus === 'completed') statusLabel = '<span class="status-icon">✓</span> Completed';
      else if (effectiveStatus === 'downloading') statusLabel = '<span class="status-icon">⬇</span> Downloading';
      else if (effectiveStatus === 'paused') statusLabel = '<span class="status-icon">⏸</span> Paused';
      else if (effectiveStatus === 'error') statusLabel = '<span class="status-icon">✕</span> Error';
      else if (effectiveStatus === 'canceled') statusLabel = '<span class="status-icon">■</span> Stopped';
      
      const title = item.title || item.filename || 'Download';
      const cleanUrl = (item.url && item.url.startsWith('data:')) ? 'data:image/... [Embedded Image Data]' : (item.url || '');

      return `
        <tr id="row-${item.id}">
          <td class="col-type">
            <div class="type-icon ${item.category || 'other'}">
              <i data-lucide="${UI.getCategoryIcon(item.category)}"></i>
            </div>
          </td>
          <td class="col-file">
            <div class="file-cell">
              <div class="file-cell-info">
                <div class="file-title" title="${UI.escapeHtml(title)}">${UI.escapeHtml(title)}</div>
                <div class="file-sub" title="${UI.escapeHtml(cleanUrl)}">${UI.escapeHtml(cleanUrl)}</div>
              </div>
            </div>
          </td>
          <td class="col-size">${sizeStr}</td>
          <td class="col-progress">
            <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
              <div class="progress-bar-bg" style="width: 70px; margin-bottom: 0; flex-shrink: 0;">
                <div class="progress-bar-fill" style="width: ${effectiveProgress}%;"></div>
              </div>
              <span class="row-progress-pct" style="font-size: 0.8rem; font-family: var(--font-mono); font-weight: 600; flex-shrink: 0;">${effectiveProgress}%</span>
            </div>
          </td>
          <td class="col-status">
            <span class="status-badge ${statusClass}">
              ${statusLabel}
            </span>
          </td>
          <td class="col-date">${UI.formatDate(item.created_at)}</td>
          <td class="col-actions">
            <div class="action-buttons">
              ${isDownloading ? `
                <button class="btn btn-secondary btn-sm" onclick="App.pauseTask('${item.id}')" title="Pause Download">
                  <i data-lucide="pause"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="App.cancelTask('${item.id}')" title="Cancel Download">
                  <i data-lucide="x"></i>
                </button>
              ` : (isPaused ? `
                <button class="btn btn-secondary btn-sm" onclick="App.resumeTask('${item.id}')" title="Resume Download">
                  <i data-lucide="play"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="App.cancelTask('${item.id}')" title="Cancel Download">
                  <i data-lucide="x"></i>
                </button>
              ` : (isDone ? `
                <button class="btn btn-secondary btn-sm" onclick="UI.openPlayerModal('${item.id}', '${(item.title || item.filename || '').replace(/'/g, "\\'")}')" title="Play Video / Audio">
                  <i data-lucide="play"></i>
                </button>
                <a class="btn btn-secondary btn-sm" href="/api/media/${item.id}" download="${(item.filename || item.title || 'download').replace(/"/g, '')}" title="Save / Download to PC">
                  <i data-lucide="download"></i>
                </a>
                <button class="btn btn-secondary btn-sm" onclick="App.openFolder('${item.id}')" title="Show in Folder">
                  <i data-lucide="folder"></i>
                </button>
              ` : (isFailedOrCanceled ? `
                <button class="btn btn-secondary btn-sm" onclick="App.resumeTask('${item.id}')" title="Retry Download">
                  <i data-lucide="rotate-cw"></i>
                </button>
              ` : '')))}
              <button class="btn btn-secondary btn-sm" onclick="App.copyLink('${item.url}')" title="Copy Link">
                <i data-lucide="copy"></i>
              </button>
              <button class="btn btn-danger btn-sm" onclick="App.deleteDownload('${item.id}')" title="Delete">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    lucide.createIcons();
  },

  renderInspectModal(result, currentUrl) {
    const modal = document.getElementById('inspect-modal');
    const modalBody = document.getElementById('modal-body-content');
    const startBtn = document.getElementById('modal-start-btn');
    if (!modal || !modalBody) return;

    if (result.type === 'stream') {
      const data = result.data;
      modalBody.innerHTML = `
        <div class="media-preview-box">
          ${data.thumbnail ? `<img class="media-modal-thumb" src="${data.thumbnail}" alt="Thumbnail">` : ''}
          <div class="media-preview-info">
            <h3>${data.title}</h3>
            <div class="media-preview-meta">
              <span><i data-lucide="clock" class="small-icon"></i> ${data.duration_str}</span>
              <span><i data-lucide="user" class="small-icon"></i> ${data.uploader || 'Stream'}</span>
            </div>
          </div>
        </div>

        <div class="format-tabs">
          <button class="format-tab-btn active" onclick="UI.switchFormatTab('video')">Video Qualities</button>
          <button class="format-tab-btn" onclick="UI.switchFormatTab('audio')">Audio (MP3 / M4A)</button>
        </div>

        <div id="tab-video-content" class="format-grid">
          ${(data.video_options || []).map((opt, i) => {
            const tag = UI.getResolutionTag(opt.resolution);
            return `
              <div class="format-item ${i === 0 ? 'selected' : ''}" data-format-id="${opt.format_id}" data-type="video" data-filesize="${opt.filesize || ''}" onclick="UI.selectFormatItem(this)">
                <div class="format-label">
                  <span class="res-tag ${tag.class}">${tag.text}</span>
                  <span>${opt.label}</span>
                </div>
                <div class="format-meta">${opt.ext.toUpperCase()} • ${opt.filesize_str}</div>
              </div>
            `;
          }).join('')}
        </div>

        <div id="tab-audio-content" class="format-grid" style="display: none;">
          ${(data.audio_options || []).map((opt, i) => `
            <div class="format-item ${i === 0 ? 'selected' : ''}" data-format-id="${opt.format_id}" data-type="audio" data-ext="${opt.ext}" data-filesize="${opt.filesize || ''}" onclick="UI.selectFormatItem(this)">
              <div class="format-label">
                <span class="res-tag audio">MP3/M4A</span>
                <span>${opt.label}</span>
              </div>
              <div class="format-meta">${opt.ext.toUpperCase()} • ${opt.filesize_str}</div>
            </div>
          `).join('')}
        </div>
      `;

      startBtn.innerHTML = '<i data-lucide="arrow-down-circle"></i> <span>Start Download</span>';
      startBtn.className = 'btn btn-primary btn-glow';

      startBtn.onclick = () => {
        const selected = modalBody.querySelector('.format-item.selected');
        const isAudio = selected ? selected.dataset.type === 'audio' : false;
        const formatId = selected ? selected.dataset.formatId : 'bestvideo+bestaudio/best';
        const audioExt = selected ? (selected.dataset.ext || 'mp3') : 'mp3';
        const fileSize = selected && selected.dataset.filesize ? parseInt(selected.dataset.filesize) : null;

        App.startDownloadTask({
          url: currentUrl,
          download_type: 'stream',
          format_id: formatId,
          is_audio_only: isAudio,
          audio_format: audioExt,
          custom_title: data.title,
          thumbnail: data.thumbnail,
          expected_size: fileSize
        });
        UI.closeModal();
      };

    } else if (result.type === 'direct') {
      const data = result.data;
      const sizeStr = data.file_size > 0 ? UI.formatBytes(data.file_size) : 'Unknown Size (Stream)';
      
      modalBody.innerHTML = `
        <div class="media-preview-box">
          <div class="type-icon ${data.category || 'other'}" style="width: 48px; height: 48px;">
            <i data-lucide="${UI.getCategoryIcon(data.category)}"></i>
          </div>
          <div class="media-preview-info">
            <h3 id="direct-filename-preview">${data.filename}</h3>
            <div class="media-preview-meta">
              <span><b>Size:</b> ${sizeStr}</span>
              <span><b>Type:</b> ${data.category.toUpperCase()}</span>
              <span><b>Acceleration:</b> ${data.supports_ranges ? 'Multi-Thread Supported' : 'Single stream'}</span>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label for="direct-custom-name">File Name</label>
          <input type="text" id="direct-custom-name" class="form-control" value="${data.filename}">
        </div>

        <div class="form-group">
          <label for="direct-segments-count">Parallel Connections (Multi-Thread)</label>
          <select id="direct-segments-count" class="form-control" ${!data.supports_ranges ? 'disabled' : ''}>
            <option value="1">1 Connection (Single stream)</option>
            <option value="4">4 Connections</option>
            <option value="8" selected>8 Connections (Recommended)</option>
            <option value="16">16 Connections (Maximum Speed)</option>
            <option value="32">32 Connections (Turbo)</option>
          </select>
          ${!data.supports_ranges ? '<small class="form-hint" style="color: var(--accent-amber);">Server does not support Range headers; downloading in 1 stream.</small>' : ''}
        </div>
      `;

      startBtn.innerHTML = '<i data-lucide="arrow-down-circle"></i> <span>Start Download</span>';
      startBtn.className = 'btn btn-primary btn-glow';

      startBtn.onclick = () => {
        const customName = document.getElementById('direct-custom-name')?.value || data.filename;
        const segCount = parseInt(document.getElementById('direct-segments-count')?.value || 8);

        App.startDownloadTask({
          url: currentUrl,
          download_type: 'direct',
          custom_filename: customName,
          category: data.category,
          segments_count: segCount
        });
        UI.closeModal();
      };

    } else if (result.type === 'webpage') {
      modalBody.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <div class="type-icon document" style="margin: 0 auto 16px auto; width: 56px; height: 56px;">
            <i data-lucide="compass"></i>
          </div>
          <h3>Webpage Detected</h3>
          <p style="color: var(--text-muted); margin-top: 8px;">Would you like to sniff all media files (videos, images, docs) from this page or download the page directly?</p>
        </div>
      `;

      startBtn.innerHTML = '<i data-lucide="scan"></i> Sniff Media on Page';
      startBtn.className = 'btn btn-primary btn-glow';
      startBtn.onclick = () => {
        UI.closeModal();
        App.openSnifferWithUrl(currentUrl);
      };
    }

    modal.style.display = 'flex';
    lucide.createIcons();
  },

  switchFormatTab(type) {
    const videoTab = document.getElementById('tab-video-content');
    const audioTab = document.getElementById('tab-audio-content');
    const btns = document.querySelectorAll('.format-tab-btn');
    
    btns.forEach(b => b.classList.remove('active'));
    if (type === 'video') {
      btns[0]?.classList.add('active');
      if (videoTab) videoTab.style.display = 'grid';
      if (audioTab) audioTab.style.display = 'none';
    } else {
      btns[1]?.classList.add('active');
      if (videoTab) videoTab.style.display = 'none';
      if (audioTab) audioTab.style.display = 'grid';
    }
  },

  selectFormatItem(elem) {
    const parent = elem.closest('.modal-body');
    if (parent) {
      parent.querySelectorAll('.format-item').forEach(i => i.classList.remove('selected'));
    }
    elem.classList.add('selected');
  },

  closeModal() {
    const modal = document.getElementById('inspect-modal');
    if (modal) modal.style.display = 'none';
  },

  openPlayerModal(taskId, title) {
    const modal = document.getElementById('player-modal');
    const video = document.getElementById('player-video-element');
    const titleEl = document.getElementById('player-title');
    const extBtn = document.getElementById('player-external-btn');

    if (titleEl) titleEl.innerText = title || 'Playing Media';
    if (video) {
      video.src = `/api/media/${taskId}`;
      video.play().catch(() => {});
    }
    if (extBtn) {
      extBtn.onclick = () => App.openFile(taskId);
    }
    if (modal) modal.style.display = 'flex';
    lucide.createIcons();
  },

  closePlayerModal() {
    const modal = document.getElementById('player-modal');
    const video = document.getElementById('player-video-element');
    if (video) {
      video.pause();
      video.src = '';
    }
    if (modal) modal.style.display = 'none';
  },

  // --- Machine ID & License UI ---
  renderUserProfile(authData) {
    const container = document.getElementById('user-header-area');
    if (!container) return;

    const user = (authData && authData.user) || {};
    const machine = (authData && authData.machine) || {};
    
    let desktopName = machine.desktop_name || user.name || '';
    if (!desktopName || desktopName.toLowerCase().includes('guest') || desktopName === 'DESKTOP-PC' || desktopName === 'WEB-CLIENT') {
      const stored = localStorage.getItem('eggdl_pc_name');
      if (stored && !stored.toLowerCase().includes('guest') && stored !== 'DESKTOP-PC' && stored !== 'WEB-CLIENT') {
        desktopName = stored;
      } else {
        desktopName = typeof API !== 'undefined' ? API.getDeviceName() : 'SRIMAN';
      }
    }
    if (desktopName.startsWith('DESKTOP-WIN-') && machine.desktop_name && !machine.desktop_name.startsWith('DESKTOP-WIN-')) {
      desktopName = machine.desktop_name;
    }

    const isPro = authData && authData.is_pro;
    const isTrial = authData && authData.is_trial;
    const trialDaysLeft = (authData && authData.trial_days_remaining) || 0;
    const daysLeft = authData && authData.days_remaining;

    let badgeClass = 'user-plan-badge trial';
    let badgeText = `⏳ ${trialDaysLeft}d Trial Left`;

    if (user.plan_type === 'lifetime' || (isPro && (!daysLeft || daysLeft >= 36500))) {
      badgeClass = 'user-plan-badge lifetime';
      badgeText = '👑 Pro Lifetime';
    } else if (isPro) {
      badgeClass = 'user-plan-badge pro';
      badgeText = `⚡ Pro (${daysLeft}d Left)`;
    } else if (isTrial && !authData.trial_expired) {
      badgeClass = 'user-plan-badge trial';
      badgeText = `⏳ 7-Day Trial (${trialDaysLeft}d Left)`;
    } else {
      badgeClass = 'user-plan-badge expired';
      badgeText = `⚠️ Trial Expired`;
    }

    container.innerHTML = `
      <button class="user-pill-btn" id="user-profile-btn" title="Click to view License & Registration">
        <div class="user-avatar"><i data-lucide="monitor" style="width: 14px; height: 14px;"></i></div>
        <span class="user-name">${desktopName}</span>
        <span class="${badgeClass}">${badgeText}</span>
      </button>
    `;

    document.getElementById('user-profile-btn')?.addEventListener('click', () => {
      UI.openAccountModal(authData);
    });

    lucide.createIcons();
  },

  renderDeviceSuspended(reason = 'Access to this device has been suspended by the administrator.') {
    let overlay = document.getElementById('device-kill-lockout-overlay') || document.getElementById('device-suspended-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'device-kill-lockout-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#06080F;z-index:999999;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:Inter,system-ui,sans-serif;color:#F8FAFC;';
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <div style="max-width:520px;background:#0F172A;border:1px solid rgba(239,68,68,0.4);border-radius:20px;padding:40px 32px;box-shadow:0 25px 60px rgba(0,0,0,0.8);">
        <div style="width:72px;height:72px;border-radius:50%;background:rgba(239,68,68,0.15);color:#EF4444;display:flex;align-items:center;justify-content:center;margin:0 auto 20px auto;font-size:2rem;">
          <i data-lucide="shield-alert"></i>
        </div>
        <h2 style="font-size:1.5rem;font-weight:800;color:#EF4444;margin-bottom:12px;">🚨 Device Access Suspended</h2>
        <p style="font-size:0.95rem;color:#94A3B8;line-height:1.6;margin-bottom:24px;">${reason}</p>
        <div style="background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:14px;font-family:monospace;font-size:0.8rem;color:#CBD5E1;margin-bottom:24px;word-break:break-all;">
          STATUS: LOCKED BY MASTER ADMIN
        </div>
        <p style="font-size:0.82rem;color:#64748B;">Please contact administrator for license activation.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  },

  removeDeviceSuspended() {
    const o1 = document.getElementById('device-kill-lockout-overlay');
    if (o1) o1.remove();
    const o2 = document.getElementById('device-suspended-overlay');
    if (o2) o2.remove();
  },

  openAccountModal(authData) {
    const modal = document.getElementById('account-modal');
    const user = (authData && authData.user) || { name: '', email: '', plan_type: 'free' };
    const machine = (authData && authData.machine) || {};
    const desktopName = machine.desktop_name || user.name || 'DESKTOP-PC';
    const machineId = machine.machine_id || user.id || 'EGG-UNKNOWN';
    const plan = (authData && authData.plan) || { badge: 'Free', name: 'Free Plan' };
    const isPro = authData && authData.is_pro;
    const daysLeft = authData && authData.days_remaining;

    const nameEl = document.getElementById('acc-name-display');
    const machineIdEl = document.getElementById('acc-machine-id');
    const pillEl = document.getElementById('acc-plan-pill');
    const keyInput = document.getElementById('license-key-input');
    const feedbackMsg = document.getElementById('license-feedback-msg');

    if (nameEl) nameEl.innerText = desktopName;
    if (machineIdEl) machineIdEl.innerText = machineId;
    if (keyInput) keyInput.value = '';
    if (feedbackMsg) feedbackMsg.style.display = 'none';

    if (pillEl) {
      if (user.plan_type === 'lifetime') {
        pillEl.className = 'plan-pill lifetime';
        pillEl.innerHTML = '👑 Ultimate Pass • Lifetime VIP (Unlimited Downloads)';
      } else if (isPro) {
        pillEl.className = 'plan-pill pro';
        pillEl.innerHTML = `⚡ ${plan.name || 'Pro'} • ${daysLeft} Days Remaining (Unlimited Downloads)`;
      } else if (authData?.is_trial) {
        pillEl.className = 'plan-pill trial';
        pillEl.innerHTML = `⏳ 7-Day Free Trial • ${authData.trial_days_remaining} Days Remaining (Unlimited Downloads)`;
      } else {
        pillEl.className = 'plan-pill expired';
        pillEl.innerHTML = `⚠️ Free Trial Expired • Enter Product Key or Purchase Plan Below`;
      }
    }

    // Highlight Current Active Plan Card
    const planPrices = {
      '1month': { name: 'Starter', price: 99, defaultBadge: '30 Days' },
      '3month': { name: 'Pro', price: 249, defaultBadge: '90 Days' },
      '6month': { name: 'Elite', price: 449, defaultBadge: '180 Days' },
      '1year': { name: 'Ultra Elite', price: 699, defaultBadge: '365 Days' },
      'lifetime': { name: 'Ultimate Pass', price: 1499, defaultBadge: 'Permanent' }
    };

    document.querySelectorAll('#account-modal .plan-card').forEach(card => {
      const planKey = card.dataset.plan;
      const buyBtn = card.querySelector('.btn-plan-buy');
      const featTag = card.querySelector('.plan-featured-tag');
      const badgeEl = card.querySelector('.plan-badge');
      const pInfo = planPrices[planKey] || { price: 99, defaultBadge: 'Active' };

      // Clear any previous floating tags
      const existingTag = card.querySelector('.current-plan-tag');
      if (existingTag) existingTag.remove();

      if (isPro && user.plan_type === planKey) {
        // Active Plan: Clean emerald glowing border & clean "✓ Active" badge
        card.classList.add('current-active-plan');
        if (featTag) featTag.style.display = 'none'; // Hide floating tag to prevent clutter
        if (badgeEl) {
          badgeEl.className = 'plan-badge current-plan';
          badgeEl.innerHTML = '<i data-lucide="check"></i> Active';
        }

        if (buyBtn) {
          buyBtn.disabled = true;
          buyBtn.style.opacity = '0.6';
          buyBtn.style.cursor = 'default';
          buyBtn.innerHTML = '<i data-lucide="check-circle"></i> <span>Subscribed</span>';
        }
      } else {
        card.classList.remove('current-active-plan');
        if (featTag) featTag.style.display = '';
        if (badgeEl) {
          badgeEl.className = `plan-badge ${planKey === 'lifetime' ? 'lifetime' : ''}`;
          badgeEl.innerText = pInfo.defaultBadge;
        }

        if (buyBtn) {
          if (user.plan_type === 'lifetime') {
            buyBtn.disabled = true;
            buyBtn.style.opacity = '0.4';
            buyBtn.style.cursor = 'not-allowed';
            buyBtn.innerHTML = '<i data-lucide="lock"></i> <span>Owned</span>';
          } else {
            buyBtn.disabled = false;
            buyBtn.style.opacity = '1';
            buyBtn.style.cursor = 'pointer';
            buyBtn.innerHTML = planKey === 'lifetime' ? `<i data-lucide="crown"></i> <span>Pay ₹${pInfo.price.toLocaleString('en-IN')}</span>` : `<i data-lucide="credit-card"></i> <span>Pay ₹${pInfo.price.toLocaleString('en-IN')}</span>`;
          }
        }
      }
    });

    if (modal) modal.style.display = 'flex';
    lucide.createIcons();
  },

  closeAccountModal() {
    const modal = document.getElementById('account-modal');
    if (modal) modal.style.display = 'none';
  },

  // --- Payment Checkout UI ---
  currentCheckoutPlan: '1month',
  currentPaymentMethod: 'upi',

  openPaymentModal(planType = '1month') {
    this.currentCheckoutPlan = planType;
    this.currentPaymentMethod = 'upi';

    const planPrices = {
      '1month': { name: 'Starter (1 Month)', price: 99, desc: '30 Days • 16 Turbo Threads • Up to 4K Ultra HD • 2 Simultaneous' },
      '3month': { name: 'Pro (3 Months)', price: 249, desc: '90 Days • 24 Turbo Threads • Full 8K Ultra HD • 5 Simultaneous' },
      '6month': { name: 'Elite (6 Months)', price: 449, desc: '180 Days • 32 Turbo Threads • 10 Simultaneous • Smart Media Sniffer' },
      '1year': { name: 'Ultra Elite (1 Year)', price: 699, desc: '365 Days • 48 Turbo Threads • 20 Simultaneous • VIP Speeds' },
      'lifetime': { name: 'Ultimate Pass (Lifetime)', price: 1499, desc: 'Permanent Pass • Unlimited Everything • Infinite Simultaneous Downloads' }
    };

    const info = planPrices[planType] || planPrices['1month'];
    const modal = document.getElementById('payment-modal');
    const nameEl = document.getElementById('checkout-plan-name');
    const descEl = document.getElementById('checkout-plan-desc');
    const priceEl = document.getElementById('checkout-price-display');
    const btnText = document.getElementById('submit-payment-btn-text');
    const errBanner = document.getElementById('payment-error-msg');

    if (nameEl) nameEl.innerText = info.name;
    if (descEl) descEl.innerText = info.desc;
    if (priceEl) priceEl.innerText = `₹${info.price.toLocaleString('en-IN')}`;
    if (btnText) btnText.innerText = `Pay ₹${info.price.toLocaleString('en-IN')} & Auto-Activate`;
    if (errBanner) {
      errBanner.style.display = 'none';
      errBanner.innerText = '';
    }

    this.switchPaymentTab('upi');
    if (modal) modal.style.display = 'flex';
    lucide.createIcons();
  },

  closePaymentModal() {
    const modal = document.getElementById('payment-modal');
    if (modal) modal.style.display = 'none';
  },

  switchPaymentTab(method = 'upi') {
    this.currentPaymentMethod = method;
    const tabUpi = document.getElementById('tab-pay-upi');
    const tabCard = document.getElementById('tab-pay-card');
    const viewUpi = document.getElementById('payment-upi-view');
    const viewCard = document.getElementById('payment-card-view');

    if (method === 'upi') {
      tabUpi?.classList.add('active');
      tabCard?.classList.remove('active');
      if (viewUpi) viewUpi.style.display = 'block';
      if (viewCard) viewCard.style.display = 'none';
    } else {
      tabCard?.classList.add('active');
      tabUpi?.classList.remove('active');
      if (viewCard) viewCard.style.display = 'block';
      if (viewUpi) viewUpi.style.display = 'none';
    }
  },

  openPaymentSuccessModal(paymentData) {
    const modal = document.getElementById('payment-success-modal');
    const planTitle = document.getElementById('success-plan-title');
    const planExpiry = document.getElementById('success-plan-expiry');
    const maskedKeyEl = document.getElementById('success-masked-key');
    const txnEl = document.getElementById('success-txn-id');

    if (planTitle) planTitle.innerText = paymentData.plan?.name || 'Pro Subscription';
    if (planExpiry) {
      if (paymentData.plan_type === 'lifetime') {
        planExpiry.innerText = 'Valid: Permanent Lifetime Access (Never Expires)';
      } else {
        planExpiry.innerText = `Valid through: ${UI.formatDate(paymentData.plan_expires_at)}`;
      }
    }
    if (maskedKeyEl) maskedKeyEl.innerText = paymentData.masked_key || 'EGGDL-PRO-****-****-****';
    if (txnEl) txnEl.innerText = paymentData.transaction_id || 'TXN_SUCCESS';

    if (modal) modal.style.display = 'flex';
    lucide.createIcons();
  },

  closePaymentSuccessModal() {
    const modal = document.getElementById('payment-success-modal');
    if (modal) modal.style.display = 'none';
  },

  confirm({ title = 'Confirm Action', message = 'Are you sure?', confirmText = 'Confirm', cancelText = 'Cancel', icon = 'alert-triangle', isDanger = true } = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirm-modal');
      const titleEl = document.getElementById('confirm-modal-title');
      const descEl = document.getElementById('confirm-modal-desc');
      const okBtn = document.getElementById('confirm-modal-ok-btn');
      const cancelBtn = document.getElementById('confirm-modal-cancel-btn');
      const iconWrapper = document.getElementById('confirm-modal-icon');

      if (!modal) {
        resolve(window.confirm(message));
        return;
      }

      if (titleEl) titleEl.innerText = title;
      if (descEl) descEl.innerText = message;
      if (okBtn) {
        okBtn.innerText = confirmText;
        okBtn.className = isDanger ? 'btn btn-danger btn-glow' : 'btn btn-primary btn-glow';
        okBtn.style.flex = '1';
        okBtn.style.padding = '10px 16px';
      }
      if (cancelBtn) {
        cancelBtn.innerText = cancelText;
      }
      if (iconWrapper) {
        iconWrapper.style.background = isDanger ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)';
        iconWrapper.style.color = isDanger ? '#EF4444' : '#3B82F6';
        iconWrapper.innerHTML = `<i data-lucide="${icon}"></i>`;
      }

      modal.style.display = 'flex';
      lucide.createIcons();

      const cleanup = (result) => {
        modal.style.display = 'none';
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        resolve(result);
      };

      okBtn.onclick = () => cleanup(true);
      cancelBtn.onclick = () => cleanup(false);
    });
  },

  renderAdminDevices(devicesData, adminKey, activeFilter = 'all') {
    const listContainer = document.getElementById('admin-devices-list');
    const totalCountEl = document.getElementById('admin-total-devices-count');
    const onlineCountEl = document.getElementById('admin-online-devices-count');
    const proCountEl = document.getElementById('admin-pro-devices-count');
    const blockedCountEl = document.getElementById('admin-blocked-devices-count');

    if (!listContainer) return;

    window._lastAdminDevicesData = devicesData;
    window._lastAdminKey = adminKey;
    window._activeAdminFilter = activeFilter;

    const allDevices = devicesData.devices || [];
    
    // Helper to categorize device precisely (Ensures 7D Trial is never counted as Pro)
    const getDeviceCategory = (dev) => {
      if (dev.is_blocked) return 'blocked';
      const planType = (dev.plan_type || 'trial').toLowerCase().trim();
      const isPro = Boolean(dev.is_pro) && planType !== 'trial' && planType !== 'free' && planType !== 'blocked';
      if (isPro) return 'pro';
      const isTrial = planType === 'trial' || Boolean(dev.is_trial);
      if (isTrial) return 'trial';
      return 'expired';
    };
    
    // Count calculations
    const onlineCount = allDevices.filter(d => d.is_online).length;
    const proCount = allDevices.filter(d => getDeviceCategory(d) === 'pro').length;
    const trialCount = allDevices.filter(d => getDeviceCategory(d) === 'trial').length;
    const blockedCount = allDevices.filter(d => getDeviceCategory(d) === 'blocked').length;
    const offlineCount = allDevices.filter(d => !d.is_online).length;

    if (totalCountEl) totalCountEl.innerText = devicesData.total_devices || allDevices.length;
    if (onlineCountEl) onlineCountEl.innerText = onlineCount;
    if (proCountEl) proCountEl.innerText = proCount;
    if (blockedCountEl) blockedCountEl.innerText = blockedCount;

    // Apply Filter
    let devices = allDevices;
    if (activeFilter === 'online') {
      devices = allDevices.filter(d => d.is_online);
    } else if (activeFilter === 'pro') {
      devices = allDevices.filter(d => getDeviceCategory(d) === 'pro');
    } else if (activeFilter === 'trial') {
      devices = allDevices.filter(d => getDeviceCategory(d) === 'trial');
    } else if (activeFilter === 'offline') {
      devices = allDevices.filter(d => !d.is_online);
    }

    // Filter Tabs HTML (Single clean bar without redundant duplicate refresh button)
    const filterTabsHtml = `
      <div style="display: flex; justify-content: flex-start; align-items: center; gap: 8px; margin-bottom: 14px; flex-wrap: wrap;">
        <div style="display: flex; gap: 6px; flex-wrap: wrap;" id="admin-device-filter-bar">
          <button type="button" class="btn btn-sm ${activeFilter === 'all' ? 'btn-primary btn-glow' : 'btn-secondary'}" onclick="UI.renderAdminDevices(window._lastAdminDevicesData, window._lastAdminKey, 'all')" style="padding: 4px 10px; font-size: 0.76rem;">
            All Users <span style="opacity: 0.7; margin-left: 3px;">(${allDevices.length})</span>
          </button>
          <button type="button" class="btn btn-sm ${activeFilter === 'online' ? 'btn-primary btn-glow' : 'btn-secondary'}" onclick="UI.renderAdminDevices(window._lastAdminDevicesData, window._lastAdminKey, 'online')" style="padding: 4px 10px; font-size: 0.76rem;">
            <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#10B981;margin-right:4px;box-shadow:0 0 6px #10B981;"></span> Online (${onlineCount})
          </button>
          <button type="button" class="btn btn-sm ${activeFilter === 'pro' ? 'btn-primary btn-glow' : 'btn-secondary'}" onclick="UI.renderAdminDevices(window._lastAdminDevicesData, window._lastAdminKey, 'pro')" style="padding: 4px 10px; font-size: 0.76rem;">
            ⭐ Pro (${proCount})
          </button>
          <button type="button" class="btn btn-sm ${activeFilter === 'trial' ? 'btn-primary btn-glow' : 'btn-secondary'}" onclick="UI.renderAdminDevices(window._lastAdminDevicesData, window._lastAdminKey, 'trial')" style="padding: 4px 10px; font-size: 0.76rem;">
            ⏳ Trial (${trialCount})
          </button>
          <button type="button" class="btn btn-sm ${activeFilter === 'offline' ? 'btn-primary btn-glow' : 'btn-secondary'}" onclick="UI.renderAdminDevices(window._lastAdminDevicesData, window._lastAdminKey, 'offline')" style="padding: 4px 10px; font-size: 0.76rem;">
            ⚪ Offline (${offlineCount})
          </button>
        </div>
      </div>
    `;

    // Dynamic clean empty messages
    const emptyMessages = {
      all: 'No connected devices recorded yet.',
      online: 'No devices online right now.',
      pro: 'No Pro devices found.',
      trial: 'No devices on trial.',
      offline: 'No devices offline.'
    };
    const emptyText = emptyMessages[activeFilter] || 'No devices found.';

    if (!devices.length) {
      listContainer.innerHTML = filterTabsHtml + `
        <div style="text-align:center;padding:40px;color:var(--text-dim);background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.08);border-radius:12px;">
          <i data-lucide="monitor-off" style="width:36px;height:36px;margin:0 auto 12px auto;opacity:0.5;"></i>
          <p style="font-size:0.92rem;font-weight:600;color:#CBD5E1;margin:0;">${emptyText}</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    let html = filterTabsHtml;
    devices.forEach((dev) => {
      const isOnline = dev.is_online;
      const planType = (dev.plan_type || 'trial').toLowerCase().trim();
      const isBlocked = Boolean(dev.is_blocked);
      const isPro = !isBlocked && Boolean(dev.is_pro) && planType !== 'trial' && planType !== 'free' && planType !== 'blocked';
      const isTrial = !isBlocked && !isPro && (planType === 'trial' || Boolean(dev.is_trial));

      // Real Days Remaining Calculation:
      let daysLeft = dev.days_remaining;
      const durMap = { '1month': 30, '3month': 90, '6month': 180, '1year': 365, 'pro': 30 };
      
      if (planType === 'lifetime') {
        daysLeft = 99999;
      } else if (dev.plan_expires_at) {
        try {
          const expTime = new Date(dev.plan_expires_at).getTime();
          const nowTime = Date.now();
          const diffDays = Math.ceil((expTime - nowTime) / (1000 * 86400));
          if (diffDays > 0) {
            daysLeft = diffDays;
          }
        } catch (_) {}
      }
      
      if (isPro && planType !== 'lifetime' && (daysLeft === undefined || daysLeft === null || daysLeft <= 0)) {
        const totalDur = durMap[planType] || 30;
        if (dev.created_at) {
          try {
            const crTime = new Date(dev.created_at).getTime();
            const nowTime = Date.now();
            const daysPassed = Math.max(0, Math.floor((nowTime - crTime) / (1000 * 86400)));
            daysLeft = Math.max(1, totalDur - daysPassed);
          } catch (_) {
            daysLeft = totalDur;
          }
        } else {
          daysLeft = totalDur;
        }
      }

      let trialDaysLeft = dev.trial_days_remaining;
      if (!trialDaysLeft || trialDaysLeft <= 0) {
        if (dev.created_at) {
          try {
            const crTime = new Date(dev.created_at).getTime();
            const nowTime = Date.now();
            const daysPassed = Math.max(0, Math.floor((nowTime - crTime) / (1000 * 86400)));
            trialDaysLeft = Math.max(1, 7 - daysPassed);
          } catch (_) {
            trialDaysLeft = 7;
          }
        } else {
          trialDaysLeft = 7;
        }
      }
      
      const onlineBadge = isOnline 
        ? '<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.72rem;font-weight:700;color:#10B981;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.25);padding:1px 6px;border-radius:4px;"><span style="width:6px;height:6px;border-radius:50%;background:#10B981;box-shadow:0 0 6px #10B981;"></span> Online</span>'
        : `<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.72rem;font-weight:500;color:#94A3B8;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:1px 6px;border-radius:4px;"><span style="width:6px;height:6px;border-radius:50%;background:#64748B;"></span> ${dev.last_seen_str || 'Offline'}</span>`;

      // Formatted License Badge with exact Days Left (No redundant 'Active Now' underneath)
      let licenseBadgeHtml = '';
      if (isBlocked) {
        licenseBadgeHtml = `<div style="font-size:0.84rem;font-weight:800;color:#EF4444;letter-spacing:0.2px;">🚨 BLOCKED / KILLED</div>`;
      } else if (isPro) {
        if (planType === 'lifetime' || daysLeft >= 36500) {
          licenseBadgeHtml = `<div style="font-size:0.84rem;font-weight:800;color:#FBBF24;display:flex;align-items:center;gap:4px;justify-content:flex-end;">👑 PRO (Lifetime) • Permanent</div>`;
        } else {
          licenseBadgeHtml = `<div style="font-size:0.84rem;font-weight:800;color:#10B981;display:flex;align-items:center;gap:4px;justify-content:flex-end;">⭐ PRO (${planType}) • <span style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);padding:1px 6px;border-radius:4px;">${daysLeft} days left</span></div>`;
        }
      } else if (isTrial) {
        licenseBadgeHtml = `<div style="font-size:0.84rem;font-weight:800;color:#F59E0B;display:flex;align-items:center;gap:4px;justify-content:flex-end;">⏳ Free Trial • <span style="background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);padding:1px 6px;border-radius:4px;">${trialDaysLeft} days left</span></div>`;
      } else {
        licenseBadgeHtml = `<div style="font-size:0.84rem;font-weight:700;color:#94A3B8;">⚠️ Free Trial Expired</div>`;
      }

      html += `
        <div class="admin-device-card ${isBlocked ? 'blocked' : ''}" style="background:rgba(255,255,255,0.03);border:1px solid ${isBlocked ? 'rgba(239,68,68,0.4)' : (isOnline ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.07)')};border-radius:14px;padding:16px 18px;margin-bottom:12px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:14px;transition:all 0.15s ease;">
          <div style="display:flex;align-items:center;gap:14px;min-width:260px;">
            <div style="width:42px;height:42px;border-radius:10px;background:${isBlocked ? 'rgba(239,68,68,0.15)' : (isOnline ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.1)')};color:${isBlocked ? '#EF4444' : (isOnline ? '#10B981' : '#3B82F6')};display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">
              <i data-lucide="${isBlocked ? 'shield-ban' : 'monitor'}"></i>
            </div>
            <div>
              <div style="font-weight:700;font-size:0.96rem;color:var(--text-main);display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span>${dev.desktop_name}</span>
                ${onlineBadge}
                <span style="font-size:0.72rem;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);padding:2px 6px;border-radius:5px;font-family:ui-monospace,monospace;color:var(--text-dim);cursor:pointer;" title="Click to copy Machine ID" onclick="navigator.clipboard.writeText('${dev.device_id}'); UI.showToast('Copied Machine ID: ${dev.device_id}', 'info', 1800);">
                  ${dev.device_id}
                </span>
              </div>
              <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:4px;">
                User: <span style="color:#CBD5E1;font-weight:600;">${dev.user_name || 'User'}</span> • ${dev.os_info || 'Windows'} • v${dev.app_version} • <span style="font-family:monospace;color:#94A3B8;">${dev.ip_address || '127.0.0.1'}</span>
              </div>
            </div>
          </div>

          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
            <div style="text-align:right;">
              ${licenseBadgeHtml}
            </div>

            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;">
              <select class="form-control form-control-sm plan-select-dropdown" id="plan-select-${dev.device_id}" style="padding:4px 8px;font-size:0.78rem;height:30px;background:#1E293B !important;border:1px solid rgba(255,255,255,0.25);border-radius:6px;color:#F8FAFC !important;cursor:pointer;font-weight:600;">
                <option value="1month" ${planType === '1month' ? 'selected' : ''} style="background:#1E293B;color:#F8FAFC;">1 Month (30d)</option>
                <option value="3month" ${planType === '3month' ? 'selected' : ''} style="background:#1E293B;color:#F8FAFC;">3 Months (90d)</option>
                <option value="6month" ${planType === '6month' ? 'selected' : ''} style="background:#1E293B;color:#F8FAFC;">6 Months (180d)</option>
                <option value="1year" ${planType === '1year' ? 'selected' : ''} style="background:#1E293B;color:#F8FAFC;">1 Year (365d)</option>
                <option value="lifetime" ${planType === 'lifetime' ? 'selected' : ''} style="background:#1E293B;color:#F8FAFC;">Lifetime</option>
              </select>
              <button class="btn btn-sm btn-primary" onclick="App.handleAdminGrantPlan('${dev.device_id}')" title="Grant Selected Subscription">
                <i data-lucide="crown" style="width:13px;height:13px;"></i> Set Plan
              </button>
              <button class="btn btn-sm btn-secondary" onclick="App.handleAdminDeviceAction('${dev.device_id}', 'reset_trial')" title="Reset 7-Day Free Trial">
                <i data-lucide="rotate-ccw" style="width:13px;height:13px;"></i> Reset 7D
              </button>
              <button class="btn btn-sm btn-secondary" onclick="App.handleAdminDeviceAction('${dev.device_id}', 'revoke_pro')" title="Revoke Pro">
                <i data-lucide="x-circle" style="width:13px;height:13px;"></i> Revoke
              </button>
              ${isBlocked ? `
                <button class="btn btn-sm btn-secondary" onclick="App.handleAdminDeviceAction('${dev.device_id}', 'unblock')" title="Unblock Machine">
                  <i data-lucide="check-circle" style="width:13px;height:13px;"></i> Unblock
                </button>
              ` : `
                <button class="btn btn-sm btn-danger" onclick="App.handleAdminDeviceAction('${dev.device_id}', 'block')" title="Kill & Block Machine">
                  <i data-lucide="shield-alert" style="width:13px;height:13px;"></i> Kill
                </button>
              `}
              <button class="btn btn-sm btn-secondary" onclick="if(confirm('Remove device ${dev.device_id}?')) App.handleAdminDeviceAction('${dev.device_id}', 'delete')" title="Delete Device Entry" style="padding: 4px 8px;">
                <i data-lucide="trash-2" style="width:13px;height:13px;color:#EF4444;"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    });

    listContainer.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  }
};
