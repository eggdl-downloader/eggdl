const App = {
  activeTasks: {},
  downloads: [],
  currentCategory: 'all',
  settings: {},
  ws: null,
  snifferItems: [],
  selectedSnifferUrls: new Set(),
  authData: null,
  authMode: 'login',

  async init() {
    this.initTheme();
    this.bindEvents();
    this.notifiedCompletedTaskIds = new Set();
    this.bindAuthEvents();
    this.initWebSocket();
    await this.initAuth();
    this.startTelemetryHeartbeat();
    this.loadSettings();
    this.loadDownloads();
    this.cleanAutofillSearch();
    setTimeout(() => this.cleanAutofillSearch(), 500);
    this.updateSystemStats();
    setInterval(() => this.updateSystemStats(), 8000);
    this.initPWA();
    this.checkVersion(false);
    this.initAdminPanel();
    this.startSmoothProgressTicker();
  },

  initTheme() {
    const savedTheme = localStorage.getItem('eggdl_theme') || 'mint';
    this.applyTheme(savedTheme);

    const themeSelector = document.getElementById('theme-selector');
    const settingTheme = document.getElementById('setting-theme');

    if (themeSelector) {
      themeSelector.value = savedTheme;
      themeSelector.addEventListener('change', (e) => {
        this.applyTheme(e.target.value);
      });
    }

    if (settingTheme) {
      settingTheme.value = savedTheme;
      settingTheme.addEventListener('change', (e) => {
        this.applyTheme(e.target.value);
      });
    }

    // 5 Visual Theme Swatch Click Listeners
    const swatches = document.querySelectorAll('.theme-swatch-card');
    swatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        const themeVal = swatch.dataset.themeVal;
        if (themeVal) {
          this.applyTheme(themeVal);
        }
      });
    });
  },

  applyTheme(themeName) {
    const validThemes = ['slate', 'navy', 'mint', 'frost', 'zinc'];
    const theme = validThemes.includes(themeName) ? themeName : 'mint';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('eggdl_theme', theme);

    // Broadcast theme to extension and in-page dialogs
    try {
      window.postMessage({ type: 'eggdl_set_theme', theme }, '*');
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ eggdl_theme: theme });
      }
    } catch (_) {}

    const themeSelector = document.getElementById('theme-selector');
    const settingTheme = document.getElementById('setting-theme');
    if (themeSelector && themeSelector.value !== theme) themeSelector.value = theme;
    if (settingTheme && settingTheme.value !== theme) settingTheme.value = theme;

    // Update active swatch state & label badge
    const swatches = document.querySelectorAll('.theme-swatch-card');
    swatches.forEach(s => {
      if (s.dataset.themeVal === theme) {
        s.classList.add('active');
      } else {
        s.classList.remove('active');
      }
    });
    const themeBadge = document.getElementById('current-theme-label');
    if (themeBadge) {
      themeBadge.innerText = theme.charAt(0).toUpperCase() + theme.slice(1);
    }
  },

  startSmoothProgressTicker() {
    setInterval(() => {
      if (!this.activeTasks) return;
      Object.values(this.activeTasks).forEach(task => {
        if (task && task.status === 'downloading' && task.progress >= 99.0 && task.progress < 99.9) {
          task.progress = Math.round((task.progress + 0.05) * 100) / 100;
          const card = document.getElementById(`card-${task.id}`);
          if (card) {
            const fillEl = card.querySelector('.active-progress-fill');
            const pctEl = card.querySelector('.active-progress-pct');
            const valEl = card.querySelector('.stat-value');
            const labelEl = card.querySelector('.stat-label');
            if (fillEl) fillEl.style.width = `${task.progress}%`;
            if (pctEl) pctEl.innerText = `${task.progress.toFixed(1)}%`;
            if (labelEl) labelEl.innerText = 'Status';
            if (valEl) {
              valEl.innerText = 'Finalizing...';
              valEl.style.color = 'var(--accent-cyan)';
            }
          }
        }
      });
    }, 500);
  },

  initPWA() {
    let deferredPrompt = null;
    const installBtn = document.getElementById('install-pwa-btn');

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/static/sw.js').catch(() => {});
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (installBtn) {
        installBtn.style.display = 'inline-flex';
      }
    });

    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') {
            installBtn.style.display = 'none';
            UI.showToast('EggDL App installed successfully!', 'success');
          }
          deferredPrompt = null;
        } else {
          UI.showToast('Click the Install icon in your browser address bar (top right)', 'info');
        }
      });
    }

    window.addEventListener('appinstalled', () => {
      if (installBtn) installBtn.style.display = 'none';
      deferredPrompt = null;
    });
  },

  async initAuth() {
    try {
      this.authData = await API.getMe();
      UI.renderUserProfile(this.authData);
      this.cleanAutofillSearch();

      // If 7-Day Free Trial has expired and user is not Pro, automatically show the paywall & product key modal
      if (this.authData && this.authData.trial_expired && !this.authData.is_pro) {
        setTimeout(() => {
          UI.openAccountModal(this.authData);
          UI.showToast('⏳ Your 7-day free trial has expired. Enter a product key or select a plan to continue downloading.', 'warning', 9000);
        }, 600);
      }
    } catch (e) {
      console.warn('Auth init failed:', e);
    }
  },

  cleanAutofillSearch() {
    const searchInput = document.getElementById('search-history');
    if (!searchInput) return;

    const sanitize = () => {
      const val = searchInput.value;
      if (val && (val.includes('@') || (this.authData?.user?.email && val.toLowerCase() === this.authData.user.email.toLowerCase()))) {
        searchInput.value = '';
        if (typeof this.renderDownloads === 'function') this.renderDownloads();
      }
    };

    sanitize();
    searchInput.addEventListener('change', sanitize);
    searchInput.addEventListener('animationstart', (e) => {
      if (e.animationName && e.animationName.includes('AutoFill')) {
        sanitize();
      }
    });

    [50, 150, 300, 600, 1000, 2000].forEach(delay => {
      setTimeout(sanitize, delay);
    });
  },

  async loadDownloads() {
    try {
      const res = await API.getDownloads(this.currentCategory);
      if (res && res.success && Array.isArray(res.downloads)) {
        if (!this._hasInitializedCompletedNotifs) {
          this._hasInitializedCompletedNotifs = true;
          res.downloads.forEach(d => {
            if (d && d.status === 'completed' && (d.id || d.filename)) {
              this.notifiedCompletedTaskIds.add(d.id || d.filename);
            }
          });
        } else {
          // Check for newly completed downloads that haven't been notified yet
          res.downloads.forEach(d => {
            const taskId = d.id || d.filename;
            if (d && d.status === 'completed' && taskId && !this.notifiedCompletedTaskIds.has(taskId)) {
              if (this.activeTasks[d.id] || (d.created_at && (Date.now() / 1000 - d.created_at < 300))) {
                this.notifiedCompletedTaskIds.add(taskId);
                delete this.activeTasks[d.id];
                UI.renderActiveTasks(this.activeTasks);
                UI.showDownloadCompleteNotification(d);
              }
            }
          });
        }
        this.downloads = res.downloads;
        this.updateCategoryCounts();
        this.renderDownloads();
        this.updateDashboardStats();
      }
    } catch (e) {
      console.warn('Failed to sync downloads:', e);
    }
  },

  initWebSocket() {
    let wsUrl;
    const base = API.getBaseUrl();
    if (base) {
      try {
        const u = new URL(base);
        const protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${u.host}/ws`;
      } catch (_) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws`;
      }
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws`;
    }

    try {
      if (this.ws) {
        try { this.ws.close(); } catch (_) {}
      }
    } catch (_) {}

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.loadDownloads();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleWsMessage(msg);
      } catch (err) {
        console.error('WS Parse Error:', err);
      }
    };

    this.ws.onclose = () => {
      console.warn('WebSocket closed, reconnecting in 3s...');
      setTimeout(() => this.initWebSocket(), 3000);
    };

    if (!this._syncInterval) {
      this._syncInterval = setInterval(() => this.loadDownloads(), 4000);
    }
  },

  handleWsMessage(msg) {
    if (msg.type === 'init') {
      this.settings = msg.settings || {};
      this.downloads = msg.downloads || [];
      if (!this._hasInitializedCompletedNotifs) {
        this._hasInitializedCompletedNotifs = true;
        this.downloads.forEach(d => {
          if (d && d.status === 'completed' && (d.id || d.filename)) {
            this.notifiedCompletedTaskIds.add(d.id || d.filename);
          }
        });
      }
      this.updateCategoryCounts();
      this.renderDownloads();
      this.updateDashboardStats();
    } else if (msg.type === 'progress_update' || msg.type === 'task_updated' || msg.type === 'task_added') {
      const task = msg.task;
      this.activeTasks[task.id] = task;
      UI.renderActiveTasks(this.activeTasks);
      this.updateGlobalSpeed();

      // Update in table if exists or add
      const idx = this.downloads.findIndex(d => d.id === task.id);
      if (idx !== -1) {
        this.downloads[idx] = { ...this.downloads[idx], ...task };
      } else {
        this.downloads.unshift(task);
      }

      if (msg.type === 'progress_update') {
        // High-frequency in-place update for table row
        const row = document.getElementById(`row-${task.id}`);
        if (row) {
          const fill = row.querySelector('.progress-bar-fill');
          if (fill) fill.style.width = `${task.progress || 0}%`;
          const pct = row.querySelector('.row-progress-pct');
          if (pct) pct.innerText = `${task.progress || 0}%`;

          // Keep status badge strictly synced with active task state
          const badge = row.querySelector('.status-badge');
          if (badge) {
            if (task.status === 'downloading' && !badge.classList.contains('downloading')) {
              badge.className = 'status-badge downloading';
              badge.innerHTML = '<span class="status-icon">⬇</span> Downloading';
            } else if (task.status === 'paused' && !badge.classList.contains('paused')) {
              badge.className = 'status-badge paused';
              badge.innerHTML = '<span class="status-icon">⏸</span> Paused';
            }
          }
        }
      } else {
        // Status changed / new task / completed
        this.updateCategoryCounts();
        this.renderDownloads();
        this.updateDashboardStats();
      }

      if (task.status === 'completed') {
        const taskId = task.id;
        const taskName = task.filename;
        if ((taskId && !this.notifiedCompletedTaskIds.has(taskId)) || (taskName && !this.notifiedCompletedTaskIds.has(taskName))) {
          if (taskId) this.notifiedCompletedTaskIds.add(taskId);
          if (taskName) this.notifiedCompletedTaskIds.add(taskName);
          delete this.activeTasks[task.id];
          UI.renderActiveTasks(this.activeTasks);
          UI.showDownloadCompleteNotification(task);
        }
      } else if (task.status === 'error' && msg.type === 'task_updated') {
        UI.showToast(`Download failed: ${task.error_message || 'Unknown error'}`, 'error');
      }
    } else if (msg.type === 'task_completed') {
      const task = msg.task;
      if (task) {
        const taskId = task.id;
        const taskName = task.filename;
        if ((taskId && !this.notifiedCompletedTaskIds.has(taskId)) || (taskName && !this.notifiedCompletedTaskIds.has(taskName))) {
          if (taskId) this.notifiedCompletedTaskIds.add(taskId);
          if (taskName) this.notifiedCompletedTaskIds.add(taskName);
          delete this.activeTasks[task.id];
          UI.renderActiveTasks(this.activeTasks);
          UI.showDownloadCompleteNotification(task);
        }
      }
      this.loadDownloads();
    } else if (msg.type === 'task_canceled' || msg.type === 'task_deleted') {
      delete this.activeTasks[msg.task_id];
      this.downloads = this.downloads.filter(d => d.id !== msg.task_id);
      UI.renderActiveTasks(this.activeTasks);
      this.updateGlobalSpeed();
      this.updateCategoryCounts();
      this.renderDownloads();
      this.updateDashboardStats();
    } else if (msg.type === 'refresh_list') {
      this.loadDownloads();
    } else if (msg.type === 'settings_updated') {
      this.settings = msg.settings;
      this.applySettingsUI();
    }
  },

  updateGlobalSpeed() {
    let totalSpeed = 0;
    Object.values(this.activeTasks).forEach(t => {
      if (t.status === 'downloading') {
        totalSpeed += (t.speed || 0);
      }
    });
    const speedStr = UI.formatSpeed(totalSpeed);
    const speedEl = document.getElementById('global-speed-text');
    if (speedEl) speedEl.innerText = speedStr;
    const statSpeedEl = document.getElementById('stat-speed');
    if (statSpeedEl) statSpeedEl.innerText = speedStr;
  },

  updateDashboardStats() {
    const activeList = Object.values(this.activeTasks).filter(t => t.status === 'downloading' || t.status === 'queued' || t.status === 'paused');
    const completedList = this.downloads.filter(d => d.status === 'completed');

    const activeEl = document.getElementById('stat-active-count');
    if (activeEl) activeEl.innerText = `${activeList.length} Active`;

    const completedEl = document.getElementById('stat-completed-count');
    if (completedEl) completedEl.innerText = `${completedList.length} Completed`;
  },

  async loadSettings() {
    try {
      const res = await API.getSettings();
      if (res.success) {
        this.settings = res.settings;
        this.applySettingsUI();
      }
    } catch (e) {
      console.error(e);
    }
  },

  applySettingsUI() {
    const dirHint = document.getElementById('download-dir-hint');
    if (dirHint && this.settings.download_dir) {
      dirHint.innerText = this.settings.download_dir;
      dirHint.title = this.settings.download_dir;
    }
    const settingDlDir = document.getElementById('setting-dl-dir');
    if (settingDlDir && this.settings.download_dir) {
      settingDlDir.value = this.settings.download_dir;
    }
    const settingSegments = document.getElementById('setting-segments');
    if (settingSegments && this.settings.max_segments_per_download) {
      settingSegments.value = this.settings.max_segments_per_download;
    }

    // Backend Server Connection UI State
    const backendBadge = document.getElementById('backend-server-badge');
    const localConfig = document.getElementById('local-server-config');
    const backendInput = document.getElementById('setting-backend-url');
    const curBackend = API.getBaseUrl();
    if (backendInput) {
      backendInput.value = curBackend;
    }
    if (curBackend) {
      if (backendBadge) {
        backendBadge.innerHTML = '🟢 Local PC Backend';
        backendBadge.style.color = '#38BDF8';
        backendBadge.style.borderColor = 'rgba(56, 189, 248, 0.4)';
        backendBadge.style.background = 'rgba(56, 189, 248, 0.15)';
      }
      if (localConfig) localConfig.style.display = 'block';
    } else {
      if (backendBadge) {
        backendBadge.innerHTML = '🟢 Cloud Server';
        backendBadge.style.color = '#10B981';
        backendBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        backendBadge.style.background = 'rgba(16, 185, 129, 0.15)';
      }
      if (localConfig) localConfig.style.display = 'none';
    }

    // Video Encoder Settings - strictly populate from saved settings
    this.populateAdvancedSettingsModal();
  },

  updateCategoryCounts() {
    const counts = { all: this.downloads.length, video: 0, audio: 0, document: 0, compressed: 0, program: 0 };
    this.downloads.forEach(d => {
      const cat = d.category || 'other';
      if (counts[cat] !== undefined) counts[cat]++;
    });

    Object.keys(counts).forEach(cat => {
      const el = document.getElementById(`count-${cat}`);
      if (el) el.innerText = counts[cat];
    });
  },

  renderDownloads() {
    const searchVal = document.getElementById('search-history')?.value.toLowerCase().trim() || '';
    let filtered = this.downloads;
    
    if (this.currentCategory !== 'all') {
      filtered = filtered.filter(d => (d.category || 'other') === this.currentCategory);
    }

    if (searchVal) {
      filtered = filtered.filter(d => 
        (d.title && d.title.toLowerCase().includes(searchVal)) ||
        (d.filename && d.filename.toLowerCase().includes(searchVal)) ||
        (d.url && d.url.toLowerCase().includes(searchVal))
      );
    }

    UI.renderDownloadsTable(filtered);
  },

  async clearCompleted() {
    try {
      await API.clearCompleted();
      this.downloads = this.downloads.filter(d => d.status !== 'completed');
      this.updateCategoryCounts();
      this.renderDownloads();
      this.updateDashboardStats();
      UI.showToast('Cleared completed downloads from nest', 'info');
    } catch (e) {
      UI.showToast('Failed to clear completed downloads', 'error');
    }
  },

  async openFile(taskId, filePath = null) {
    try {
      await API.openFile(taskId, filePath);
      UI.showToast('Opening file in system player...', 'info');
    } catch (e) {
      UI.showToast(e.message || 'Could not open file', 'error');
    }
  },

  async openFolder(taskId = null, filePath = null) {
    try {
      const res = await API.openFolder(taskId, filePath);
      UI.showToast(`Opened nest folder: ${res.folder_path || 'Downloads\\EggDL'} in Explorer`, 'success');
    } catch (e) {
      UI.showToast(e.message || 'Could not open folder', 'error');
    }
  },

  async updateSystemStats() {
    try {
      const res = await API.getSystemStats();
      if (res.success && res.disk) {
        const freeText = document.getElementById('disk-free-text');
        const diskFill = document.getElementById('disk-progress');
        const statDiskFree = document.getElementById('stat-disk-free');

        if (freeText) freeText.innerText = `${res.disk.free_gb} GB Free`;
        if (statDiskFree) statDiskFree.innerText = `${res.disk.free_gb} GB Free`;
        if (diskFill) diskFill.style.width = `${res.disk.percent_used}%`;
      }
    } catch (e) {
      console.error(e);
    }
  },

  bindEvents() {
    // Stealth Admin Hotkey: Shift + F5 (pressed 2 times quickly within 1.5s)
    let lastShiftF5 = 0;
    window.addEventListener('keydown', (e) => {
      if (e.shiftKey && (e.key === 'F5' || e.code === 'F5' || e.keyCode === 116)) {
        e.preventDefault();
        const now = Date.now();
        if (now - lastShiftF5 < 1500) {
          lastShiftF5 = 0;
          this.triggerStealthAdmin();
        } else {
          lastShiftF5 = now;
        }
      }
    });

    // Stealth Admin Alternative: Click brand logo 5 times quickly
    let logoClicks = 0;
    let logoClickTimer = null;
    document.getElementById('brand-logo-btn')?.addEventListener('click', () => {
      logoClicks++;
      clearTimeout(logoClickTimer);
      logoClickTimer = setTimeout(() => { logoClicks = 0; }, 1800);
      if (logoClicks >= 5) {
        logoClicks = 0;
        this.triggerStealthAdmin();
      }
    });

    // URL input and inspect
    const inspectBtn = document.getElementById('inspect-btn');
    const urlInput = document.getElementById('url-input');
    const pasteBtn = document.getElementById('paste-clipboard-btn');
    const clearBtn = document.getElementById('clear-input-btn');

    inspectBtn?.addEventListener('click', () => this.handleInspect());
    urlInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleInspect();
    });

    urlInput?.addEventListener('input', () => {
      if (clearBtn) clearBtn.style.display = urlInput.value ? 'flex' : 'none';
    });

    urlInput?.addEventListener('paste', () => {
      setTimeout(() => {
        if (clearBtn) clearBtn.style.display = urlInput.value ? 'flex' : 'none';
        const val = urlInput.value.trim();
        if (val.startsWith('http://') || val.startsWith('https://')) {
          this.handleInspect();
        }
      }, 60);
    });

    clearBtn?.addEventListener('click', () => {
      if (urlInput) {
        urlInput.value = '';
        clearBtn.style.display = 'none';
        urlInput.focus();
      }
    });

    pasteBtn?.addEventListener('click', async () => {
      urlInput?.focus();
      let text = '';

      // 1. Native Windows/System Clipboard via Local Backend / PyWebView Bridge (Zero "allow localhost" prompts, 100% instant)
      try {
        text = await API.getClipboard();
      } catch (err) {
        console.warn('Backend clipboard error:', err);
      }

      if (text && text.trim()) {
        urlInput.value = text.trim();
        if (clearBtn) clearBtn.style.display = 'flex';
        const val = text.trim();
        if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('magnet:')) {
          this.handleInspect();
        }
        return;
      }
      UI.showToast('📋 Clipboard is empty. Copy a link first!', 'info', 2500);
    });

    // Category navigation
    document.querySelectorAll('.nav-item[data-category]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentCategory = btn.dataset.category;
        
        const titleEl = document.getElementById('section-title');
        if (titleEl) {
          titleEl.innerText = btn.querySelector('span')?.innerText || 'Downloads';
        }

        this.showDownloadsTab();
        this.renderDownloads();
      });
    });

    // Web Media Sniffer tab
    document.getElementById('tab-sniffer-btn')?.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.getElementById('tab-sniffer-btn')?.classList.add('active');
      this.showSnifferTab();
    });

    document.getElementById('close-sniffer-btn')?.addEventListener('click', () => {
      document.querySelector('.nav-item[data-category="all"]')?.click();
    });

    document.getElementById('sniff-btn')?.addEventListener('click', () => this.handleSniff());
    document.getElementById('sniffer-url-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleSniff();
    });

    // Mobile navigation toggle
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    const toggleSidebar = () => {
      sidebar?.classList.toggle('open');
      backdrop?.classList.toggle('active');
    };

    const closeSidebar = () => {
      sidebar?.classList.remove('open');
      backdrop?.classList.remove('active');
    };

    mobileBtn?.addEventListener('click', toggleSidebar);
    backdrop?.addEventListener('click', closeSidebar);

    // Auto-close sidebar on item click on mobile
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 900) {
          closeSidebar();
        }
      });
    });

    // Initialize default mobile tab
    document.body.dataset.mobileTab = 'queue';

    // Material 3 Android Bottom Navigation Destinations
    const m3Tabs = document.querySelectorAll('.m3-nav-item');
    m3Tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const dest = tab.dataset.tab;
        if (dest === 'settings') {
          this.applySettingsUI();
          document.getElementById('settings-modal').style.display = 'flex';
          return;
        }

        m3Tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        if (dest === 'queue') {
          document.body.dataset.mobileTab = 'queue';
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (dest === 'completed') {
          document.body.dataset.mobileTab = 'completed';
          document.querySelector('.nav-item[data-category="all"]')?.click();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });

    // Material 3 TopAppBar Settings Button
    document.getElementById('m3-settings-topbar-btn')?.addEventListener('click', () => {
      this.applySettingsUI();
      document.getElementById('settings-modal').style.display = 'flex';
    });

    // Material 3 TopAppBar Clipboard Auto-Detect Chip (Native OS clipboard via backend bridge - Zero localhost prompts)
    const clipChip = document.getElementById('m3-clipboard-chip');
    const checkClipboardForChip = async () => {
      try {
        let text = '';
        if (typeof API !== 'undefined' && API.getClipboard) {
          text = await API.getClipboard();
        }
        if (text && (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('magnet:'))) {
          if (clipChip) {
            const chipText = document.getElementById('m3-clipboard-chip-text');
            if (chipText) chipText.innerText = 'Paste: ' + text.substring(0, 18) + '...';
            clipChip.style.display = 'inline-flex';
            clipChip.onclick = () => {
              const urlInput = document.getElementById('url-input');
              if (urlInput) {
                urlInput.value = text.trim();
                clipChip.style.display = 'none';
                this.handleInspect();
              }
            };
          }
        } else {
          if (clipChip) clipChip.style.display = 'none';
        }
      } catch (e) {
        // Silent catch for permissions
      }
    };
    window.addEventListener('focus', checkClipboardForChip);
    setTimeout(checkClipboardForChip, 1500);

    // Top actions
    document.getElementById('open-folder-btn')?.addEventListener('click', () => this.openFolder());
    document.getElementById('clear-all-btn')?.addEventListener('click', () => this.clearAll());
    document.getElementById('clear-completed-btn')?.addEventListener('click', () => this.clearAll());

    // Modals
    document.getElementById('close-modal-btn')?.addEventListener('click', () => UI.closeModal());
    document.getElementById('modal-cancel-btn')?.addEventListener('click', () => UI.closeModal());

    // Settings
    document.getElementById('open-settings-btn')?.addEventListener('click', () => {
      this.applySettingsUI();
      document.getElementById('settings-modal').style.display = 'flex';
    });
    document.getElementById('close-settings-btn')?.addEventListener('click', () => {
      this.applySettingsUI();
      document.getElementById('settings-modal').style.display = 'none';
    });
    document.getElementById('cancel-settings-btn')?.addEventListener('click', () => {
      this.applySettingsUI();
      document.getElementById('settings-modal').style.display = 'none';
    });
    document.getElementById('save-settings-btn')?.addEventListener('click', () => this.saveSettings());
    document.getElementById('btn-check-updates')?.addEventListener('click', () => this.checkVersion(true));

    // Backend Server Mode Buttons
    const btnCloud = document.getElementById('btn-backend-cloud');
    const btnLocal = document.getElementById('btn-backend-local');
    const localConfig = document.getElementById('local-server-config');
    const backendInput = document.getElementById('setting-backend-url');
    const testBtn = document.getElementById('btn-test-backend');

    btnCloud?.addEventListener('click', () => {
      API.setBaseUrl('');
      this.applySettingsUI();
      if (window.AndroidApp?.reloadWithUrl) {
        window.AndroidApp.reloadWithUrl('https://eggdl.onrender.com');
      } else if (window.AndroidApp?.setCustomServerUrl) {
        window.AndroidApp.setCustomServerUrl('');
      }
      this.initWebSocket();
      this.loadDownloads();
      UI.showToast('Switched to Cloud Server (Render)', 'success');
    });

    btnLocal?.addEventListener('click', () => {
      if (localConfig) localConfig.style.display = 'block';
      if (backendInput) backendInput.focus();
    });

    testBtn?.addEventListener('click', async () => {
      let url = backendInput?.value.trim() || '';
      if (!url) {
        UI.showToast('Please enter your desktop PC URL (e.g. http://192.168.1.100:8000)', 'warning');
        return;
      }
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'http://' + url;
        if (backendInput) backendInput.value = url;
      }
      testBtn.disabled = true;
      testBtn.innerText = 'Testing...';
      try {
        const testRes = await fetch(`${url}/api/auth/me`, { mode: 'cors', cache: 'no-cache' });
        if (testRes.ok) {
          API.setBaseUrl(url);
          if (window.AndroidApp?.setCustomServerUrl) {
            window.AndroidApp.setCustomServerUrl(url);
          }
          this.applySettingsUI();
          this.initWebSocket();
          this.loadDownloads();
          UI.showToast('Connected to Local Desktop Backend!', 'success');
        } else {
          throw new Error('Server returned status ' + testRes.status);
        }
      } catch (err) {
        UI.showToast('Could not reach desktop server: ' + (err.message || 'Connection refused'), 'error', 4000);
      } finally {
        testBtn.disabled = false;
        testBtn.innerText = 'Connect';
      }
    });

    // Advanced Settings
    document.getElementById('open-advanced-settings-btn')?.addEventListener('click', () => {
      this.populateAdvancedSettingsModal();
      document.getElementById('advanced-settings-modal').style.display = 'flex';
      if (window.lucide) window.lucide.createIcons();
    });
    document.getElementById('close-advanced-settings-btn')?.addEventListener('click', () => {
      this.closeAdvancedSettingsModal();
    });
    document.getElementById('cancel-advanced-settings-btn')?.addEventListener('click', () => {
      this.closeAdvancedSettingsModal();
    });
    document.getElementById('advanced-settings-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'advanced-settings-modal') {
        this.closeAdvancedSettingsModal();
      }
    });
    document.getElementById('save-advanced-settings-btn')?.addEventListener('click', () => this.saveAdvancedSettings());

    // Video Encoder Toggle in Advanced Settings
    const encoderToggle = document.getElementById('toggle-video-encoder');
    if (encoderToggle) {
      encoderToggle.addEventListener('change', (e) => {
        this.updateVideoEncoderUI(e.target.checked);
      });
    }

    // Codec Selection Radio Cards
    document.querySelectorAll('input[name="video_codec_selection"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.updateSelectedCodecCard(e.target.value);
      });
    });

    // Sniffer batch actions
    document.getElementById('sniffer-select-all')?.addEventListener('click', () => this.toggleSnifferSelectAll());
    document.getElementById('sniffer-download-selected')?.addEventListener('click', () => this.downloadSelectedSnifferItems());
  },

  showDownloadsTab() {
    document.getElementById('history-section').style.display = 'block';
    document.getElementById('sniffer-section').style.display = 'none';
  },

  showSnifferTab() {
    document.getElementById('history-section').style.display = 'none';
    document.getElementById('sniffer-section').style.display = 'block';
  },

  async handleInspect() {
    const urlInput = document.getElementById('url-input');
    const url = urlInput?.value.trim();
    if (!url) {
      UI.showToast('Please enter or paste a valid link', 'error');
      return;
    }

    const inspectBtn = document.getElementById('inspect-btn');
    const originalBtn = inspectBtn.innerHTML;
    inspectBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Inspecting...';
    inspectBtn.disabled = true;
    if (window.lucide) window.lucide.createIcons();

    try {
      const res = await API.inspectUrl(url);
      if (res && res.success) {
        UI.renderInspectModal(res, url);
      } else {
        UI.showToast(res?.message || 'Could not inspect link', 'error', 6000);
      }
    } catch (e) {
      console.warn('Inspect error:', e);
      UI.showToast(e.message || 'Could not inspect link. Please check if the video is available.', 'error', 7000);
    } finally {
      inspectBtn.innerHTML = originalBtn;
      inspectBtn.disabled = false;
      if (window.lucide) window.lucide.createIcons();
    }
  },

  async startDownloadTask(payload) {
    try {
      // Strictly use verified saved preferences from this.settings (never unsaved UI clicks)
      const isEnc = this.settings?.video_encoder_enabled === true;
      const selectedCodec = this.settings?.video_codec || 'h264';

      const fullPayload = {
        video_encoder_enabled: isEnc,
        video_codec: selectedCodec,
        ...payload
      };

      const res = await API.startDownload(fullPayload);
      if (res.success) {
        UI.showToast('Download started with Turbo Speed!', 'success');
        document.getElementById('url-input').value = '';
        const clearBtn = document.getElementById('clear-input-btn');
        if (clearBtn) clearBtn.style.display = 'none';

        // Refresh usage counters
        if (!this.authData?.is_pro) {
          this.initAuth();
        }

        if (res.task) {
          this.activeTasks[res.task.id] = res.task;
          UI.renderActiveTasks(this.activeTasks);
          const activeSec = document.getElementById('active-section');
          if (activeSec) {
            activeSec.style.display = 'block';
            activeSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
        this.loadDownloads();
      }
    } catch (e) {
      if (e.errorType === 'trial_expired' || (e.message && (e.message.includes('Trial has ended') || e.message.includes('trial has expired') || e.message.includes('Trial Expired') || e.message.includes('trial_expired')))) {
        UI.showToast('⚠️ Your 7-Day Free Trial has ended. Enter a product key or choose a plan to continue!', 'warning', 8000);
        setTimeout(() => {
          UI.openAccountModal(this.authData);
        }, 500);
      } else {
        UI.showToast(e.message || 'Failed to start download', 'error');
      }
    }
  },

  async pauseTask(taskId) {
    try {
      await API.pauseDownload(taskId);
      UI.showToast('Download paused', 'info');
    } catch (e) {
      UI.showToast('Failed to pause download', 'error');
    }
  },

  async resumeTask(taskId) {
    try {
      await API.resumeDownload(taskId);
      UI.showToast('Resuming download...', 'info');
    } catch (e) {
      UI.showToast('Failed to resume download', 'error');
    }
  },

  async cancelTask(taskId) {
    try {
      await API.cancelDownload(taskId);
      UI.showToast('Download canceled', 'info');
    } catch (e) {
      UI.showToast('Failed to cancel download', 'error');
    }
  },

  async deleteDownload(taskId) {
    const confirmed = await UI.confirm({
      title: 'Remove from History',
      message: 'Are you sure you want to remove this download record from your list?',
      confirmText: 'Remove',
      isDanger: true,
      icon: 'trash'
    });
    if (!confirmed) return;

    try {
      await API.deleteDownload(taskId, false);
      UI.showToast('Download removed from list', 'info');
    } catch (e) {
      UI.showToast('Failed to remove download', 'error');
    }
  },

  async clearCompleted() {
    try {
      await API.clearCompleted();
      UI.showToast('Cleared completed downloads', 'info');
    } catch (e) {
      UI.showToast('Failed to clear completed downloads', 'error');
    }
  },

  async clearAll() {
    if (!this.downloads || this.downloads.length === 0) {
      UI.showToast('No downloads to clear', 'info');
      return;
    }
    const confirmed = await UI.confirm({
      title: 'Clear All Downloads',
      message: 'Are you sure you want to clear all download history? Your downloaded files on disk will not be deleted.',
      confirmText: 'Clear All',
      isDanger: true,
      icon: 'trash-2'
    });
    if (!confirmed) return;

    try {
      await API.clearAll();
      this.downloads = [];
      this.activeTasks = {};
      UI.renderActiveTasks(this.activeTasks);
      this.renderDownloads();
      this.updateDashboardStats();
      this.updateCategoryCounts();
      UI.showToast('All downloads cleared from history', 'success');
    } catch (e) {
      UI.showToast('Failed to clear downloads', 'error');
    }
  },

  async openFile(taskId, filePath = null) {
    try {
      await API.openFile(taskId, filePath);
      UI.showToast('Opening file in default system player...', 'info');
    } catch (e) {
      UI.showToast(e.message || 'Could not open file', 'error');
    }
  },

  async openFolder(taskId = null, filePath = null) {
    try {
      const res = await API.openFolder(taskId, filePath);
      UI.showToast(`Opened: ${res.folder_path || 'Downloads\\EggDL'} in Windows Explorer`, 'success');
    } catch (e) {
      UI.showToast(e.message || 'Could not open folder', 'error');
    }
  },

  copyLink(url) {
    navigator.clipboard.writeText(url);
    UI.showToast('Link copied to clipboard', 'info');
  },

  async saveSettings() {
    const dlDir = document.getElementById('setting-dl-dir')?.value.trim();
    const segments = parseInt(document.getElementById('setting-segments')?.value || 8);
    const maxActive = parseInt(document.getElementById('setting-max-active')?.value || 3);

    try {
      const res = await API.saveSettings({
        download_dir: dlDir,
        max_segments_per_download: segments,
        max_concurrent_downloads: maxActive
      });
      if (res.success) {
        UI.showToast('Settings saved successfully', 'success');
        document.getElementById('settings-modal').style.display = 'none';
      }
    } catch (e) {
      UI.showToast('Failed to save settings', 'error');
    }
  },

  updateVideoEncoderUI(enabled) {
    const optContainer = document.getElementById('advanced-encoder-options');
    const cautionContainer = document.getElementById('advanced-encoder-caution');
    if (optContainer) {
      optContainer.style.display = enabled ? 'block' : 'none';
    }
    if (cautionContainer) {
      cautionContainer.style.display = enabled ? 'flex' : 'none';
    }
    if (window.lucide) window.lucide.createIcons();
  },

  updateSelectedCodecCard(selectedVal) {
    ['h264', 'h265', 'av1'].forEach(c => {
      const card = document.getElementById(`card-codec-${c}`);
      if (card) {
        if (c === selectedVal) {
          card.classList.add('active-selected');
        } else {
          card.classList.remove('active-selected');
        }
      }
    });
  },

  populateAdvancedSettingsModal() {
    const isEnc = Boolean(this.settings?.video_encoder_enabled);
    const selectedCodec = this.settings?.video_codec || 'h264';

    const toggle = document.getElementById('toggle-video-encoder');
    if (toggle) {
      toggle.checked = isEnc;
      this.updateVideoEncoderUI(isEnc);
    }

    const radio = document.querySelector(`input[name="video_codec_selection"][value="${selectedCodec}"]`);
    if (radio) {
      radio.checked = true;
      this.updateSelectedCodecCard(selectedCodec);
    }
  },

  closeAdvancedSettingsModal() {
    // Revert form state back to last saved preferences so any unsaved clicks are completely discarded
    this.populateAdvancedSettingsModal();
    const modal = document.getElementById('advanced-settings-modal');
    if (modal) modal.style.display = 'none';
  },

  async saveAdvancedSettings() {
    const toggle = document.getElementById('toggle-video-encoder');
    const enabled = Boolean(toggle?.checked);
    const selectedCodec = document.querySelector('input[name="video_codec_selection"]:checked')?.value || 'h264';

    try {
      const res = await API.saveSettings({
        video_encoder_enabled: enabled,
        video_codec: selectedCodec
      });
      if (res.success) {
        if (!this.settings) this.settings = {};
        this.settings.video_encoder_enabled = enabled;
        this.settings.video_codec = selectedCodec;
        localStorage.setItem('eggdl_video_encoder_enabled', enabled ? 'true' : 'false');
        localStorage.setItem('eggdl_video_codec', selectedCodec);

        UI.showToast(enabled ? `Preferences saved: Video Encoder active (${selectedCodec.toUpperCase()})` : 'Preferences saved: Video Encoder disabled (Fast native downloads active)', 'success');
        const modal = document.getElementById('advanced-settings-modal');
        if (modal) modal.style.display = 'none';
      }
    } catch (e) {
      UI.showToast('Failed to save preferences', 'error');
    }
  },

  // Media Sniffer
  openSnifferWithUrl(url) {
    this.showSnifferTab();
    const snifferInput = document.getElementById('sniffer-url-input');
    if (snifferInput) snifferInput.value = url;
    this.handleSniff();
  },

  async handleSniff() {
    const input = document.getElementById('sniffer-url-input');
    const url = input?.value.trim();
    if (!url) {
      UI.showToast('Please enter a webpage URL', 'error');
      return;
    }

    const sniffBtn = document.getElementById('sniff-btn');
    sniffBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Sniffing...';
    sniffBtn.disabled = true;
    lucide.createIcons();

    try {
      const res = await API.sniffUrl(url);
      if (res.success) {
        this.snifferItems = res.data.items || [];
        this.selectedSnifferUrls.clear();
        this.renderSnifferResults(res.data);
      }
    } catch (e) {
      UI.showToast(e.message || 'Failed to sniff webpage', 'error');
    } finally {
      sniffBtn.innerHTML = '<i data-lucide="scan"></i> Sniff Media';
      sniffBtn.disabled = false;
      lucide.createIcons();
    }
  },

  renderSnifferResults(data) {
    const header = document.getElementById('sniffer-results-header');
    const grid = document.getElementById('sniffer-grid');
    const countEl = document.getElementById('sniffer-count');
    const pageTitleEl = document.getElementById('sniffer-page-title');

    if (header) header.style.display = 'flex';
    if (countEl) countEl.innerText = data.total_found;
    if (pageTitleEl) pageTitleEl.innerText = data.page_title || data.page_url;

    if (!grid) return;

    if (this.snifferItems.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">No downloadable media found on this page.</div>';
      return;
    }

    grid.innerHTML = this.snifferItems.map((item, idx) => `
      <div class="sniffer-card" data-index="${idx}">
        ${item.preview_url ? `
          <img class="sniffer-card-thumb" src="${item.preview_url}" alt="Preview" onerror="this.style.display='none'">
        ` : `
          <div class="type-icon ${item.type || 'other'}" style="width: 100%; height: 80px;">
            <i data-lucide="${UI.getCategoryIcon(item.type)}"></i>
          </div>
        `}
        <div class="sniffer-card-title" title="${item.title}">${item.title}</div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">${item.type}</span>
          <input type="checkbox" class="sniffer-checkbox" data-url="${item.url}" onchange="App.toggleSnifferItem(this)">
        </div>
        <button class="btn btn-secondary btn-sm" style="width: 100%; margin-top: 4px;" onclick="App.startDownloadTask({ url: '${item.url}', custom_filename: '${item.filename}', category: '${item.type}' })">
          <i data-lucide="download"></i> Download
        </button>
      </div>
    `).join('');

    lucide.createIcons();
    this.updateSnifferSelectedCount();
  },

  toggleSnifferItem(checkbox) {
    const url = checkbox.dataset.url;
    if (checkbox.checked) {
      this.selectedSnifferUrls.add(url);
    } else {
      this.selectedSnifferUrls.delete(url);
    }
    this.updateSnifferSelectedCount();
  },

  toggleSnifferSelectAll() {
    const checkboxes = document.querySelectorAll('.sniffer-checkbox');
    const allChecked = Array.from(checkboxes).every(c => c.checked);
    checkboxes.forEach(c => {
      c.checked = !allChecked;
      if (!allChecked) {
        this.selectedSnifferUrls.add(c.dataset.url);
      } else {
        this.selectedSnifferUrls.delete(c.dataset.url);
      }
    });
    this.updateSnifferSelectedCount();
  },

  updateSnifferSelectedCount() {
    const countEl = document.getElementById('sniffer-selected-count');
    if (countEl) countEl.innerText = this.selectedSnifferUrls.size;
  },

  async downloadSelectedSnifferItems() {
    if (this.selectedSnifferUrls.size === 0) {
      UI.showToast('Please select at least one media item', 'info');
      return;
    }

    const itemsToDownload = this.snifferItems.filter(i => this.selectedSnifferUrls.has(i.url));
    for (const item of itemsToDownload) {
      await this.startDownloadTask({
        url: item.url,
        custom_filename: item.filename,
        category: item.type
      });
    }

    UI.showToast(`Queued ${itemsToDownload.length} downloads!`, 'success');
    this.showDownloadsTab();
  },

  // --- Hardware Licensing Handlers ---
  bindAuthEvents() {
    // Account Modal Controls
    document.getElementById('close-account-modal-btn')?.addEventListener('click', () => UI.closeAccountModal());
    document.getElementById('close-account-btn')?.addEventListener('click', () => UI.closeAccountModal());

    // License Key Activation
    document.getElementById('activate-license-btn')?.addEventListener('click', () => this.handleActivateLicense());
    document.getElementById('license-key-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleActivateLicense();
    });

    // Click demo key code snippet to auto-fill
    document.querySelectorAll('.demo-keys-hint code').forEach(codeEl => {
      codeEl.addEventListener('click', () => {
        const input = document.getElementById('license-key-input');
        if (input) {
          input.value = codeEl.innerText.trim();
          input.focus();
        }
      });
    });

    // Buy / Upgrade Plan button click
    document.querySelectorAll('.btn-plan-buy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const plan = btn.dataset.plan;
        UI.openPaymentModal(plan);
      });
    });

    // Payment Checkout Modal Controls
    document.getElementById('close-payment-modal-btn')?.addEventListener('click', () => UI.closePaymentModal());
    document.getElementById('cancel-payment-btn')?.addEventListener('click', () => UI.closePaymentModal());
    document.getElementById('tab-pay-upi')?.addEventListener('click', () => UI.switchPaymentTab('upi'));
    document.getElementById('tab-pay-card')?.addEventListener('click', () => UI.switchPaymentTab('card'));
    document.getElementById('submit-payment-btn')?.addEventListener('click', () => this.handlePaymentSubmit());

    // Verify UPI button simulation
    document.getElementById('verify-upi-btn')?.addEventListener('click', () => {
      const upiId = document.getElementById('pay-upi-id')?.value.trim();
      if (upiId && upiId.includes('@')) {
        UI.showToast(`✓ UPI ID "${upiId}" verified! Ready to pay.`, 'success');
      } else {
        UI.showToast('Please enter a valid UPI ID (e.g. name@okhdfcbank)', 'error');
      }
    });

    // Payment Success Done button
    document.getElementById('success-done-btn')?.addEventListener('click', () => {
      UI.closePaymentSuccessModal();
      UI.closeAccountModal();
      UI.showToast('🚀 Pro status activated! Enjoy unlimited turbo speed.', 'success');
    });
  },

  async handlePaymentSubmit() {
    const planType = UI.currentCheckoutPlan || '1month';
    const method = UI.currentPaymentMethod || 'upi';
    const submitBtn = document.getElementById('submit-payment-btn');
    const errBanner = document.getElementById('payment-error-msg');

    let payload = {
      plan_type: planType,
      payment_method: method,
      device_id: this.authData?.machine?.machine_id || API.getOrCreateDeviceId()
    };

    if (method === 'upi') {
      const upiId = document.getElementById('pay-upi-id')?.value.trim();
      if (!upiId) {
        if (errBanner) {
          errBanner.innerText = 'Please enter or confirm your UPI ID';
          errBanner.style.display = 'block';
        }
        return;
      }
      payload.upi_id = upiId;
    } else {
      const cardNumber = document.getElementById('pay-card-number')?.value.trim();
      const cardExpiry = document.getElementById('pay-card-expiry')?.value.trim();
      const cardCvv = document.getElementById('pay-card-cvv')?.value.trim();
      const cardName = document.getElementById('pay-card-name')?.value.trim();

      if (!cardNumber || !cardExpiry || !cardCvv) {
        if (errBanner) {
          errBanner.innerText = 'Please complete all card details';
          errBanner.style.display = 'block';
        }
        return;
      }
      payload.card_number = cardNumber;
      payload.card_expiry = cardExpiry;
      payload.card_cvv = cardCvv;
      payload.card_name = cardName;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> <span>Processing Payment...</span>';
      lucide.createIcons();

      const res = await API.processPayment(payload);
      if (res.success) {
        UI.closePaymentModal();
        await this.initAuth();
        UI.openPaymentSuccessModal(res);
      }
    } catch (e) {
      if (errBanner) {
        errBanner.innerText = e.message || 'Payment processing failed';
        errBanner.style.display = 'block';
      }
    } finally {
      submitBtn.disabled = false;
      const planPrices = { '1month': 99, '3month': 249, '6month': 449, '1year': 699, 'lifetime': 1499 };
      const price = planPrices[planType] || 99;
      submitBtn.innerHTML = `<i data-lucide="lock"></i> <span>Pay ₹${price.toLocaleString('en-IN')} & Auto-Activate</span>`;
      lucide.createIcons();
    }
  },

  startTelemetryHeartbeat() {
    const sendPing = async () => {
      try {
        const machine = this.authData?.machine || {};
        const devId = machine.machine_id || API.getOrCreateDeviceId();
        const res = await API.telemetryHeartbeat({
          device_id: devId,
          desktop_name: machine.desktop_name || API.getDeviceName(),
          user_name: machine.user_name || 'User',
          os_info: machine.os_info || navigator.platform || 'Windows',
          app_version: '2.1.6',
          total_downloads: this.downloads?.length || 0,
          data_downloaded_mb: 0
        });

        if (res && res.is_blocked) {
          UI.renderDeviceSuspended(res.block_reason || 'Access has been suspended by the administrator.');
        } else {
          // If was previously suspended and now unblocked, remove suspension overlay immediately
          UI.removeDeviceSuspended();

          if (res && res.success !== false) {
            const hadPro = !!this.authData?.is_pro;
            const nowPro = !!res.is_pro;
            const hadPlan = this.authData?.plan_type;
            const nowPlan = res.plan_type;
            const hadDays = this.authData?.days_remaining;
            const nowDays = res.days_remaining;
            const hadTrialDays = this.authData?.trial_days_remaining;
            const nowTrialDays = res.trial_days_remaining;
            const hadTrialExpired = !!this.authData?.trial_expired;
            const nowTrialExpired = !!res.trial_expired;

            if (hadPro !== nowPro || hadPlan !== nowPlan || hadDays !== nowDays || hadTrialDays !== nowTrialDays || hadTrialExpired !== nowTrialExpired) {
              // Direct in-memory hot update of authData for 0ms instant UI update without restart!
              if (!this.authData) this.authData = {};
              this.authData.is_pro = nowPro;
              this.authData.is_trial = !!res.is_trial;
              this.authData.trial_expired = nowTrialExpired;
              this.authData.trial_days_remaining = nowTrialDays;
              this.authData.days_remaining = nowDays;
              this.authData.plan_type = nowPlan;
              this.authData.can_download = !nowTrialExpired || nowPro;
              this.authData.is_unlimited = !nowTrialExpired || nowPro;
              if (this.authData.user) {
                this.authData.user.plan_type = nowPlan;
              }
              if (window.PLAN_CONFIGS) {
                this.authData.plan = window.PLAN_CONFIGS[nowPlan] || this.authData.plan;
              }
              
              UI.renderUserProfile(this.authData);
              if (typeof this.updateStats === 'function') this.updateStats();

              // Automatically dismiss paywall modal if upgraded or trial renewed
              if (nowPro || (!nowTrialExpired && res.is_trial)) {
                UI.closeAccountModal();
              }
            }
          }
        }
      } catch (_) {}
    };

    sendPing();
    setInterval(sendPing, 3000);
  },

  triggerStealthAdmin() {
    const adminModal = document.getElementById('admin-modal');
    const loginView = document.getElementById('admin-login-view');
    const dashView = document.getElementById('admin-dashboard-view');
    const keyInput = document.getElementById('admin-master-key-input');

    if (!adminModal) return;

    if (this.adminKey) {
      if (loginView) loginView.style.display = 'none';
      if (dashView) dashView.style.display = 'block';
      this.refreshAdminDevices();
    } else {
      if (loginView) loginView.style.display = 'block';
      if (dashView) dashView.style.display = 'none';
      if (keyInput) {
        keyInput.value = '';
        setTimeout(() => keyInput.focus(), 150);
      }
    }

    adminModal.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
    UI.showToast('🛡️ Master Admin Mode Activated', 'info');
  },

  async handleActivateLicense() {
    const input = document.getElementById('license-key-input');
    const rawVal = input?.value || '';
    const key = rawVal.replace(/\s+/g, '').replace(/[–—]/g, '-').trim().toUpperCase();
    const feedbackMsg = document.getElementById('license-feedback-msg');
    const btn = document.getElementById('activate-license-btn');

    if (!key) {
      if (feedbackMsg) {
        feedbackMsg.className = 'license-feedback error';
        feedbackMsg.innerText = 'Please enter a product key.';
        feedbackMsg.style.display = 'block';
      }
      return;
    }

    try {
      if (btn) btn.disabled = true;
      const machineId = this.authData?.machine?.machine_id || this.authData?.user?.id || (typeof API !== 'undefined' ? API.getOrCreateDeviceId() : '');
      const res = await API.activateMachineKey(key, machineId);
      if (res.success) {
        if (feedbackMsg) {
          feedbackMsg.className = 'license-feedback success';
          feedbackMsg.innerText = `✓ ${res.message}`;
          feedbackMsg.style.display = 'block';
        }
        UI.showToast(`🎉 Upgraded this PC to ${res.plan?.name || 'Pro'}! All features unlocked.`, 'success');
        
        // Refresh authentication & hardware state immediately
        await this.initAuth();
        UI.openAccountModal(this.authData);
        if (typeof this.updateStats === 'function') this.updateStats();
      }
    } catch (e) {
      if (feedbackMsg) {
        feedbackMsg.className = 'license-feedback error';
        feedbackMsg.innerText = `✕ ${e.message || 'Invalid product key'}`;
        feedbackMsg.style.display = 'block';
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async handleLogout() {
    await API.logout();
    UI.closeAccountModal();
    UI.showToast('Logged out', 'info');
    await this.initAuth();
  },

  // --- In-App Auto Updates & Versioning ---
  async checkVersion(manual = false) {
    const statusHint = document.getElementById('settings-update-status');
    const versionBadge = document.getElementById('settings-app-version');
    const checkBtn = document.getElementById('btn-check-updates');
    const topBanner = document.getElementById('top-update-banner');

    if (manual) {
      if (checkBtn) {
        checkBtn.disabled = true;
        checkBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Checking...';
      }
      if (statusHint) {
        statusHint.style.color = '#38BDF8';
        statusHint.innerHTML = '<i data-lucide="refresh-cw" class="spin" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Checking update server...';
      }
    }

    try {
      const info = await API.checkVersion();
      const curVer = info?.current_version || '2.1.6';
      const latVer = info?.latest_version || curVer;

      if (versionBadge) versionBadge.innerText = `v${curVer}`;

      if (info && info.update_available) {
        if (statusHint) {
          statusHint.style.color = '#F59E0B';
          statusHint.style.fontWeight = '600';
          statusHint.innerHTML = `🚀 <b style="color: #F59E0B;">v${latVer} Update Available</b> &bull; <a href="javascript:void(0)" style="color: #38BDF8; text-decoration: underline; margin-left: 4px;">Click to Install</a>`;
          statusHint.style.cursor = 'pointer';
          statusHint.onclick = () => this.showUpdateModal(info);
        }

        if (topBanner) {
          topBanner.style.display = 'flex';
          const titleEl = document.getElementById('top-update-title');
          if (titleEl) titleEl.innerText = `🚀 New EggDL Update v${latVer} is Available!`;
          const updateBtn = document.getElementById('top-update-btn');
          if (updateBtn) updateBtn.onclick = () => this.showUpdateModal(info);
          const dismissBtn = document.getElementById('top-update-dismiss');
          if (dismissBtn) dismissBtn.onclick = () => { topBanner.style.display = 'none'; };
        }

        UI.showToast(`🎉 New EggDL Update v${latVer} is available!`, 'success', 7000);
        this.showUpdateModal(info);
      } else {
        if (topBanner) topBanner.style.display = 'none';
        if (statusHint) {
          statusHint.style.color = '#10B981';
          statusHint.style.fontWeight = '500';
          statusHint.innerHTML = `✓ You are running the latest version (v${curVer})`;
          statusHint.style.cursor = 'default';
          statusHint.onclick = null;
        }
        if (manual && window.UI) {
          UI.showToast(`✓ EggDL v${curVer} is the latest version.`, 'success');
        }
      }
    } catch (e) {
      console.warn('Update check failed:', e);
      if (statusHint) {
        statusHint.style.color = '#EF4444';
        statusHint.innerHTML = '✕ Could not reach update server.';
      }
      if (manual && window.UI) UI.showToast('Could not reach update server. Check your connection.', 'error');
    } finally {
      if (checkBtn) {
        checkBtn.disabled = false;
        checkBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Check for Updates';
      }
      if (window.lucide) window.lucide.createIcons();
    }
  },

  showUpdateModal(info) {
    const modal = document.getElementById('update-modal');
    if (!modal) return;
    
    const detailsView = document.getElementById('update-modal-details-view');
    const progressView = document.getElementById('update-modal-progress-view');
    const verBadge = document.getElementById('update-modal-version');
    const notesBox = document.getElementById('update-modal-notes');
    const nowBtn = document.getElementById('update-modal-now-btn');
    const laterBtn = document.getElementById('update-modal-later-btn');

    const pTitle = document.getElementById('update-progress-title');
    const pSub = document.getElementById('update-progress-sub');
    const pBar = document.getElementById('update-progress-bar');
    const pPercent = document.getElementById('update-progress-percent');
    const pSpeed = document.getElementById('update-progress-speed');
    const pSize = document.getElementById('update-progress-size');
    const installBtn = document.getElementById('update-install-btn');

    if (detailsView) detailsView.style.display = 'block';
    if (progressView) progressView.style.display = 'none';
    if (installBtn) installBtn.style.display = 'none';

    if (verBadge) verBadge.innerText = `v${info.latest_version || '2.1.5'} Available`;
    if (notesBox) {
      const rawNotes = info.release_notes || '⚡ Ultra-Fast Native MP4 Engine\n🚀 Zero 99% Lag & Instant Single-File Output\n🎬 4K/8K stream download optimizations';
      notesBox.innerHTML = rawNotes.split('\n').map(l => `<div style="margin-bottom: 4px;">${l}</div>`).join('');
    }
    
    if (nowBtn) {
      nowBtn.onclick = async () => {
        if (detailsView) detailsView.style.display = 'none';
        if (progressView) progressView.style.display = 'block';
        if (pTitle) pTitle.innerText = `Downloading EggDL v${info.latest_version}...`;
        if (pSub) pSub.innerText = 'Preparing update package in the background...';
        if (pBar) pBar.style.width = '0%';
        if (pPercent) pPercent.innerText = '0%';
        if (pSpeed) pSpeed.innerText = 'Connecting...';
        if (pSize) pSize.innerText = '';
        if (window.lucide) window.lucide.createIcons();

        try {
          await API.startUpdateDownload(info.latest_version, info.download_url);
          
          let pollInterval = setInterval(async () => {
            try {
              const st = await API.getUpdateStatus();
              if (st.status === 'downloading') {
                const prog = Math.min(Math.max(st.progress || 0, 0), 99);
                if (pBar) pBar.style.width = `${prog}%`;
                if (pPercent) pPercent.innerText = `${prog}%`;
                if (pSpeed) pSpeed.innerText = st.speed || 'Downloading...';
                const mbDown = ((st.downloaded_bytes || 0) / 1048576).toFixed(1);
                const mbTot = ((st.total_bytes || 0) / 1048576).toFixed(1);
                if (pSize && st.total_bytes > 0) pSize.innerText = `${mbDown} MB / ${mbTot} MB`;
              } else if (st.status === 'ready') {
                clearInterval(pollInterval);
                if (pBar) pBar.style.width = '100%';
                if (pPercent) pPercent.innerText = '100%';
                if (pSpeed) pSpeed.innerText = 'Ready';
                if (pTitle) pTitle.innerHTML = '✅ Update Download Complete!';
                if (pSub) pSub.innerText = 'EggDL is ready to install the new update.';
                if (installBtn) {
                  installBtn.style.display = 'inline-flex';
                  installBtn.onclick = async () => {
                    installBtn.disabled = true;
                    installBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Restarting EggDL...';
                    if (window.lucide) window.lucide.createIcons();
                    UI.showToast('🚀 Launching update installer...', 'success', 5000);
                    try {
                      await API.installUpdate();
                    } catch (_) {}
                  };
                }
                if (window.lucide) window.lucide.createIcons();
              } else if (st.status === 'error') {
                clearInterval(pollInterval);
                if (pTitle) pTitle.innerText = 'Update Download Failed';
                if (pSub) pSub.innerText = st.error || 'Server error. Please try again.';
                if (pSpeed) pSpeed.innerText = 'Error';
              }
            } catch (_) {}
          }, 600);
        } catch (err) {
          if (pTitle) pTitle.innerText = 'Update Error';
          if (pSub) pSub.innerText = err.message || 'Could not start update download';
        }
      };
    }
    if (laterBtn) {
      laterBtn.onclick = () => {
        modal.style.display = 'none';
      };
    }

    modal.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
  },

  // --- Developer Admin Remote Control Center ---
  adminKey: null,
  initAdminPanel() {
    const adminModal = document.getElementById('admin-modal');
    const closeAdminBtn = document.getElementById('close-admin-modal-btn');
    const adminLoginBtn = document.getElementById('btn-admin-login');
    const adminKeyInput = document.getElementById('admin-master-key-input');
    const loginView = document.getElementById('admin-login-view');
    const dashView = document.getElementById('admin-dashboard-view');
    
    const tabDevices = document.getElementById('admin-tab-devices-btn');
    const tabKeys = document.getElementById('admin-tab-keys-btn');
    const tabReleases = document.getElementById('admin-tab-releases-btn');
    
    const viewDevices = document.getElementById('admin-view-devices');
    const viewKeys = document.getElementById('admin-view-keys');
    const viewReleases = document.getElementById('admin-view-releases');
    
    const pushReleaseBtn = document.getElementById('btn-admin-push-release');
    const refreshDevicesBtn = document.getElementById('btn-admin-refresh-devices');
    const generateKeysBtn = document.getElementById('btn-admin-generate-keys');

    if (closeAdminBtn) {
      closeAdminBtn.onclick = () => {
        if (adminModal) adminModal.style.display = 'none';
      };
    }

    if (adminKeyInput) {
      adminKeyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          adminLoginBtn?.click();
        }
      });
    }

    if (adminLoginBtn) {
      adminLoginBtn.onclick = async () => {
        const key = (adminKeyInput?.value || '').trim();
        if (!key) return UI.showToast('Please enter master key', 'error');
        try {
          adminLoginBtn.disabled = true;
          adminLoginBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Verifying...';
          lucide.createIcons();
          const data = await API.getAdminDevices(key);
          this.adminKey = key;
          loginView.style.display = 'none';
          dashView.style.display = 'block';
          UI.renderAdminDevices(data, this.adminKey);
          UI.showToast('🛡️ Master Control Center Unlocked!', 'success');
        } catch (e) {
          UI.showToast(e.message || 'Invalid Master Key', 'error');
        } finally {
          adminLoginBtn.disabled = false;
          adminLoginBtn.innerHTML = '<i data-lucide="shield-check"></i> <span>Unlock Master Center</span>';
          lucide.createIcons();
        }
      };
    }

    // Admin Tab Navigation
    if (tabDevices && tabKeys && tabReleases) {
      tabDevices.onclick = () => {
        tabDevices.classList.add('active');
        tabKeys.classList.remove('active');
        tabReleases.classList.remove('active');
        if (viewDevices) viewDevices.style.display = 'block';
        if (viewKeys) viewKeys.style.display = 'none';
        if (viewReleases) viewReleases.style.display = 'none';
        if (this.adminKey) this.refreshAdminDevices();
      };

      tabKeys.onclick = () => {
        tabKeys.classList.add('active');
        tabDevices.classList.remove('active');
        tabReleases.classList.remove('active');
        if (viewKeys) viewKeys.style.display = 'block';
        if (viewDevices) viewDevices.style.display = 'none';
        if (viewReleases) viewReleases.style.display = 'none';
      };

      tabReleases.onclick = () => {
        tabReleases.classList.add('active');
        tabDevices.classList.remove('active');
        tabKeys.classList.remove('active');
        if (viewReleases) viewReleases.style.display = 'block';
        if (viewDevices) viewDevices.style.display = 'none';
        if (viewKeys) viewKeys.style.display = 'none';
      };
    }

    // Refresh Devices
    if (refreshDevicesBtn) {
      refreshDevicesBtn.onclick = () => this.refreshAdminDevices();
    }

    // Generate Keys
    if (generateKeysBtn) {
      generateKeysBtn.onclick = async () => {
        const planTier = document.getElementById('admin-key-plan-tier')?.value || 'lifetime';
        const count = parseInt(document.getElementById('admin-key-count')?.value || '5', 10);
        const outBox = document.getElementById('admin-generated-keys-box');
        const outText = document.getElementById('admin-generated-keys-output');

        try {
          generateKeysBtn.disabled = true;
          let keys = [];

          // 1. Generate via Cloud Render Master Server (Central Authority)
          try {
            const cloudRes = await fetch(`https://eggdl.onrender.com/api/license/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ plan_type: planTier, count })
            });
            if (cloudRes.ok) {
              const cloudData = await cloudRes.json();
              if (cloudData.keys && cloudData.keys.length > 0) {
                keys = cloudData.keys;
                // Also import to local backend so local machine has them
                fetch(`${API.baseUrl}/api/license/import-keys`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ plan_type: planTier, keys: keys })
                }).catch(() => {});
              }
            }
          } catch (_) {}

          // 2. If Cloud unreachable, generate locally and forward
          if (keys.length === 0) {
            const res = await fetch(`${API.baseUrl}/api/license/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ plan_type: planTier, count })
            });
            const data = await res.json();
            if (res.ok && data.keys) {
              keys = data.keys;
              // Forward to Cloud Render Server
              fetch(`https://eggdl.onrender.com/api/license/import-keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan_type: planTier, keys: keys })
              }).catch(() => {});
            } else {
              throw new Error(data.detail || 'Key generation failed');
            }
          }

          if (keys.length > 0) {
            if (outBox) outBox.style.display = 'block';
            if (outText) outText.value = keys.join('\n');
            if (window.lucide) window.lucide.createIcons();
            UI.showToast(`✨ Generated ${keys.length} cloud-verified product keys!`, 'success');
          }
        } catch (err) {
          UI.showToast('Generation error: ' + err.message, 'error');
        } finally {
          generateKeysBtn.disabled = false;
        }
      };
    }

    const copyKeysBtn = document.getElementById('btn-admin-copy-keys');
    if (copyKeysBtn) {
      copyKeysBtn.onclick = () => {
        const outText = document.getElementById('admin-generated-keys-output');
        if (outText && outText.value) {
          navigator.clipboard.writeText(outText.value).then(() => {
            UI.showToast('📋 All product keys copied to clipboard!', 'success');
          }).catch(() => {
            outText.select();
            document.execCommand('copy');
            UI.showToast('📋 All product keys copied!', 'success');
          });
        }
      };
    }

    // Push Releases
    if (pushReleaseBtn) {
      pushReleaseBtn.onclick = async () => {
        const ver = document.getElementById('admin-release-ver').value.trim();
        const notes = document.getElementById('admin-release-notes').value.trim();
        const url = document.getElementById('admin-release-url').value.trim();
        if (!ver) return UI.showToast('Version is required', 'error');
        try {
          pushReleaseBtn.disabled = true;
          await API.adminPushRelease(this.adminKey, ver, notes, url);
          UI.showToast(`🚀 Broadcasted v${ver} update to all users!`, 'success');
        } catch (e) {
          UI.showToast('Push failed: ' + e.message, 'error');
        } finally {
          pushReleaseBtn.disabled = false;
        }
      };
    }
  },

  async refreshAdminDevices() {
    if (!this.adminKey) return;
    const btn = document.getElementById('btn-admin-refresh-devices');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="refresh-cw" class="spin" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Refreshing...';
      if (window.lucide) window.lucide.createIcons();
    }
    try {
      const data = await API.getAdminDevices(this.adminKey);
      UI.renderAdminDevices(data, this.adminKey, window._activeAdminFilter || 'all');
      UI.showToast(`Updated ${data.devices?.length || 0} device telemetry records`, 'info', 1800);
    } catch (e) {
      UI.showToast('Refresh failed: ' + e.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml || '<i data-lucide="refresh-cw"></i> Refresh Devices';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  },

  async handleAdminGrantPlan(deviceId) {
    const select = document.getElementById(`plan-select-${deviceId}`);
    const planType = select ? select.value : 'lifetime';
    await this.handleAdminDeviceAction(deviceId, 'grant_pro', planType);
  },

  async handleAdminDeviceAction(deviceId, action, planType = 'lifetime', reason = '') {
    if (!this.adminKey) return;
    try {
      const res = await API.adminDeviceAction(this.adminKey, deviceId, action, planType, reason);
      UI.showToast(res.message || 'Action executed successfully', 'success');
      await this.refreshAdminDevices();
      // Re-sync local machine status immediately if current PC was targeted
      await this.initAuth();
      if (typeof this.updateStats === 'function') this.updateStats();
    } catch (e) {
      UI.showToast(e.message || 'Device action failed', 'error');
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
