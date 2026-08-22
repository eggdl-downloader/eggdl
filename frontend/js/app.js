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
    this.bindEvents();
    this.bindAuthEvents();
    this.initWebSocket();
    this.initFirebase();
    await this.initAuth();
    this.initGoogleOAuth();
    this.loadSettings();
    this.loadDownloads();
    this.cleanAutofillSearch();
    setTimeout(() => this.cleanAutofillSearch(), 500);
    this.updateSystemStats();
    setInterval(() => this.updateSystemStats(), 8000);
    this.initPWA();
    this.checkVersion(false);
    this.checkDeviceAuthorization();
    this.initAdminPanel();
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

  initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
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
  },

  handleWsMessage(msg) {
    if (msg.type === 'init') {
      this.settings = msg.settings || {};
      this.downloads = msg.downloads || [];
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

      if (task.status === 'completed' && msg.type === 'task_updated') {
        UI.showToast(`Download complete: ${task.title || task.filename}`, 'success');
      } else if (task.status === 'error' && msg.type === 'task_updated') {
        UI.showToast(`Download failed: ${task.error_message || 'Unknown error'}`, 'error');
      }
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
    if (activeEl) activeEl.innerText = `${activeList.length} Eggs`;

    const completedEl = document.getElementById('stat-completed-count');
    if (completedEl) completedEl.innerText = `${completedList.length} Eggs`;
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
  },

  async loadDownloads() {
    try {
      const res = await API.getDownloads(this.currentCategory);
      if (res.success) {
        this.downloads = res.downloads;
        this.updateCategoryCounts();
        this.renderDownloads();
        this.updateDashboardStats();
      }
    } catch (e) {
      console.error(e);
    }
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

  async startDownloadTask(payload) {
    try {
      const res = await API.startDownload(payload);
      if (res.success) {
        UI.showToast('🥚 Egg added to nest!', 'success');
        document.getElementById('url-input').value = '';
        document.getElementById('clear-input-btn').style.display = 'none';
        this.loadDownloads();
      }
    } catch (e) {
      UI.showToast(e.message || 'Failed to start downloading egg', 'error');
    }
  },

  async pauseTask(taskId) {
    try {
      await API.pauseDownload(taskId);
      UI.showToast('⏸️ Egg incubating (Paused)', 'info');
    } catch (e) {
      UI.showToast('Could not pause download', 'error');
    }
  },

  async resumeTask(taskId) {
    try {
      await API.resumeDownload(taskId);
      UI.showToast('▶️ Hatching resumed', 'success');
    } catch (e) {
      UI.showToast('Could not resume download', 'error');
    }
  },

  async cancelTask(taskId) {
    try {
      await API.cancelDownload(taskId);
      UI.showToast('⏹️ Egg hatching stopped', 'info');
    } catch (e) {
      UI.showToast('Could not cancel download', 'error');
    }
  },

  async deleteDownload(taskId) {
    try {
      await API.deleteDownload(taskId);
      this.downloads = this.downloads.filter(d => d.id !== taskId);
      this.updateCategoryCounts();
      this.renderDownloads();
      this.updateDashboardStats();
      UI.showToast('🗑️ Egg removed from nest', 'info');
    } catch (e) {
      UI.showToast('Could not delete egg', 'error');
    }
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
      UI.showToast('🥚 Opening media egg in system player...', 'info');
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

    clearBtn?.addEventListener('click', () => {
      if (urlInput) {
        urlInput.value = '';
        clearBtn.style.display = 'none';
        urlInput.focus();
      }
    });

    pasteBtn?.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
          urlInput.value = text.trim();
          if (clearBtn) clearBtn.style.display = 'flex';
          this.handleInspect();
        } else {
          UI.showToast('Clipboard does not contain a valid URL', 'info');
        }
      } catch (err) {
        UI.showToast('Please paste the URL directly into the input', 'info');
      }
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

    // Top actions
    document.getElementById('open-folder-btn')?.addEventListener('click', () => this.openFolder());
    document.getElementById('clear-all-btn')?.addEventListener('click', () => this.clearAll());
    document.getElementById('clear-completed-btn')?.addEventListener('click', () => this.clearAll());

    // Modals
    document.getElementById('close-modal-btn')?.addEventListener('click', () => UI.closeModal());
    document.getElementById('modal-cancel-btn')?.addEventListener('click', () => UI.closeModal());

    // Settings
    document.getElementById('open-settings-btn')?.addEventListener('click', () => {
      document.getElementById('settings-modal').style.display = 'flex';
    });
    document.getElementById('close-settings-btn')?.addEventListener('click', () => {
      document.getElementById('settings-modal').style.display = 'none';
    });
    document.getElementById('cancel-settings-btn')?.addEventListener('click', () => {
      document.getElementById('settings-modal').style.display = 'none';
    });
    document.getElementById('save-settings-btn')?.addEventListener('click', () => this.saveSettings());
    document.getElementById('btn-check-updates')?.addEventListener('click', () => this.checkVersion(true));

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
    lucide.createIcons();

    try {
      const res = await API.inspectUrl(url);
      if (res.success) {
        UI.renderInspectModal(res, url);
      }
    } catch (e) {
      UI.showToast(e.message || 'Could not inspect link', 'error');
    } finally {
      inspectBtn.innerHTML = originalBtn;
      inspectBtn.disabled = false;
      lucide.createIcons();
    }
  },

  async startDownloadTask(payload) {
    try {
      const res = await API.startDownload(payload);
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

  // --- Authentication & Licensing Handlers ---
  bindAuthEvents() {
    // Auth Tabs
    document.getElementById('tab-login-btn')?.addEventListener('click', () => {
      this.authMode = 'login';
      UI.openAuthModal('login');
    });

    document.getElementById('tab-register-btn')?.addEventListener('click', () => {
      this.authMode = 'register';
      UI.openAuthModal('register');
    });

    // Close Auth Modal
    document.getElementById('close-auth-modal-btn')?.addEventListener('click', () => UI.closeAuthModal());
    document.getElementById('cancel-auth-btn')?.addEventListener('click', () => UI.closeAuthModal());

    // Submit Auth Form
    document.getElementById('submit-auth-btn')?.addEventListener('click', () => this.handleAuthSubmit());
    document.getElementById('auth-password-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleAuthSubmit();
    });

    // Google Sign-In button
    document.getElementById('google-login-btn')?.addEventListener('click', () => this.handleGoogleLogin());

    // Account Modal Header & Footer Sign-In Buttons
    document.getElementById('acc-quick-signin-btn')?.addEventListener('click', () => {
      UI.closeAccountModal();
      UI.openAuthModal('login');
    });
    document.getElementById('acc-quick-google-btn')?.addEventListener('click', () => {
      this.handleGoogleLogin();
    });
    document.getElementById('acc-footer-signin-btn')?.addEventListener('click', () => {
      UI.closeAccountModal();
      UI.openAuthModal('login');
    });

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

    // Buy / Upgrade Plan button click (closes account modal and shows signin if not auth)
    document.querySelectorAll('.btn-plan-buy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const plan = btn.dataset.plan;
        if (!this.authData || !this.authData.authenticated) {
          this.pendingCheckoutPlan = plan;
          UI.closeAccountModal();
          UI.openAuthModal('login');
          UI.showToast('Please sign in or create an account first to proceed to checkout.', 'info');
          return;
        }
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

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', () => this.handleLogout());
  },

  async handlePaymentSubmit() {
    const planType = UI.currentCheckoutPlan || '1month';
    const method = UI.currentPaymentMethod || 'upi';
    const submitBtn = document.getElementById('submit-payment-btn');
    const errBanner = document.getElementById('payment-error-msg');

    if (!this.authData || !this.authData.authenticated) {
      UI.closePaymentModal();
      UI.openAuthModal('login');
      UI.showToast('Please sign in first to complete payment.', 'info');
      return;
    }

    let payload = {
      plan_type: planType,
      payment_method: method
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

      // Call payment process API
      const res = await API.processPayment(payload);
      if (res.success) {
        UI.closePaymentModal();
        // Refresh auth profile state
        await this.initAuth();
        // Open success modal showing masked key and auto-activation
        UI.openPaymentSuccessModal(res);
      }
    } catch (e) {
      if (errBanner) {
        errBanner.innerText = e.message || 'Payment processing failed';
        errBanner.style.display = 'block';
      }
    } finally {
      submitBtn.disabled = false;
      const planPrices = { '1month': 99, '3month': 249, '6month': 499, '1year': 799, 'lifetime': 1999 };
      const price = planPrices[planType] || 99;
      submitBtn.innerHTML = `<i data-lucide="lock"></i> <span>Pay ₹${price.toLocaleString('en-IN')} & Auto-Activate</span>`;
      lucide.createIcons();
    }
  },

  initFirebase() {
    if (typeof firebase === 'undefined') return;
    try {
      const firebaseConfig = {
        apiKey: "AIzaSyATuqCfXB9gs9B8I4KAJHl6k6n6JdCGEkI",
        authDomain: "eggdl-downloader-f5783.firebaseapp.com",
        projectId: "eggdl-downloader-f5783",
        storageBucket: "eggdl-downloader-f5783.firebasestorage.app",
        messagingSenderId: "839840380946",
        appId: "1:839840380946:web:56f324e7b8e591702600cb",
        measurementId: "G-FX4F8R0N6F"
      };

      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      this.firebaseAuth = firebase.auth();
    } catch (err) {
      console.warn('Firebase init note:', err);
    }
  },

  async onAuthSuccess(displayName) {
    UI.showToast(`✨ Welcome to EggDL, ${displayName}!`, 'success');
    await this.initAuth();
    UI.closeAuthModal();
    if (this.pendingCheckoutPlan) {
      const p = this.pendingCheckoutPlan;
      this.pendingCheckoutPlan = null;
      UI.openPaymentModal(p);
    } else if (this.pendingProductKey) {
      const k = this.pendingProductKey;
      this.pendingProductKey = null;
      UI.openAccountModal(this.authData);
      const input = document.getElementById('license-key-input');
      if (input) input.value = k;
      this.handleActivateLicense();
    } else {
      UI.openAccountModal(this.authData);
    }
  },

  async handleAuthSubmit() {
    const email = document.getElementById('auth-email-input')?.value.trim();
    const password = document.getElementById('auth-password-input')?.value;
    const name = document.getElementById('auth-name-input')?.value.trim();
    const errBanner = document.getElementById('auth-error-msg');
    const submitBtn = document.getElementById('submit-auth-btn');

    if (!email || !password) {
      if (errBanner) {
        errBanner.innerText = 'Please enter both email and password';
        errBanner.style.display = 'block';
      }
      return;
    }

    if (errBanner) errBanner.style.display = 'none';
    submitBtn.disabled = true;

    try {
      if (this.firebaseAuth) {
        let fbUser;
        if (this.authMode === 'register') {
          const userCredential = await this.firebaseAuth.createUserWithEmailAndPassword(email, password);
          fbUser = userCredential.user;
          if (name) {
            try { await fbUser.updateProfile({ displayName: name }); } catch (_) {}
          }
        } else {
          const userCredential = await this.firebaseAuth.signInWithEmailAndPassword(email, password);
          fbUser = userCredential.user;
        }

        const idToken = await fbUser.getIdToken();
        const res = await API.firebaseAuth({
          id_token: idToken,
          email: fbUser.email,
          name: name || fbUser.displayName || fbUser.email.split('@')[0],
          avatar: fbUser.photoURL || '',
          uid: fbUser.uid,
          auth_provider: 'email'
        });

        const displayName = res.user.name || res.user.email.split('@')[0];
        await this.onAuthSuccess(displayName);
        return;
      }

      // Legacy fallback
      let res;
      if (this.authMode === 'register') {
        res = await API.register(email, password, name);
      } else {
        res = await API.login(email, password);
      }

      const displayName = res?.user?.name || email.split('@')[0];
      await this.onAuthSuccess(displayName);
    } catch (e) {
      if (errBanner) {
        let msg = e.message || 'Authentication error';
        if (e.code === 'auth/email-already-in-use') msg = 'This email is already registered. Please sign in.';
        else if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') msg = 'Incorrect email or password.';
        else if (e.code === 'auth/weak-password') msg = 'Password should be at least 6 characters.';
        else if (e.code === 'auth/invalid-email') msg = 'Please enter a valid email address.';
        errBanner.innerText = msg;
        errBanner.style.display = 'block';
      }
    } finally {
      submitBtn.disabled = false;
    }
  },

  initGoogleOAuth() {
    const GOOGLE_CLIENT_ID = "672502283484-4gub6ocl1hbrhv9c1ico1sjsnocc5nvk.apps.googleusercontent.com";
    
    const setupGsi = () => {
      if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
        return;
      }
      try {
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            if (response && response.credential) {
              await this.handleGoogleCredential(response.credential);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true
        });
      } catch (err) {
        console.warn('Google Identity Services setup note:', err);
      }
    };

    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      setupGsi();
    } else {
      window.addEventListener('load', () => setTimeout(setupGsi, 600));
      setTimeout(setupGsi, 1500);
    }
  },

  async handleGoogleCredential(credential) {
    try {
      UI.showToast('Signing in...', 'info');
      let payloadData = { credential };

      try {
        const base64Url = credential.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const parsed = JSON.parse(jsonPayload);
        if (parsed.email) payloadData.email = parsed.email;
        if (parsed.name) payloadData.name = parsed.name;
        if (parsed.picture) payloadData.avatar = parsed.picture;
        if (parsed.sub) payloadData.google_id = parsed.sub;
      } catch (clientParseErr) {
        console.warn('Client token parse note:', clientParseErr);
      }

      const res = await API.googleAuth(payloadData);
      if (res.success) {
        const displayName = res.user.name || res.user.email.split('@')[0];
        await this.onAuthSuccess(displayName);
      }
    } catch (e) {
      UI.showToast(e.message || 'Authentication failed', 'error');
    }
  },

  async handleGoogleLogin() {
    if (this.firebaseAuth) {
      try {
        UI.showToast('Opening Google Sign-In...', 'info');
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await this.firebaseAuth.signInWithPopup(provider);
        const user = result.user;
        const idToken = await user.getIdToken();

        const res = await API.firebaseAuth({
          id_token: idToken,
          email: user.email,
          name: user.displayName || user.email.split('@')[0],
          avatar: user.photoURL || '',
          uid: user.uid,
          auth_provider: 'google'
        });

        const displayName = res.user.name || res.user.email.split('@')[0];
        await this.onAuthSuccess(displayName);
        return;
      } catch (fbErr) {
        console.warn('Google Auth popup note, using fallback:', fbErr);
        if (fbErr.code === 'auth/popup-closed-by-user' || fbErr.code === 'auth/cancelled-popup-request') {
          return;
        }
      }
    }

    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      try {
        google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            this.triggerGooglePromptFallback();
          }
        });
        return;
      } catch (_) {}
    }

    this.triggerGooglePromptFallback();
  },

  async triggerGooglePromptFallback() {
    try {
      const promptEmail = prompt('Enter your Google Account email to sign in:', 'user@gmail.com');
      if (!promptEmail || !promptEmail.trim()) return;

      const cleanEmail = promptEmail.trim().toLowerCase();
      const res = await API.googleAuth({
        email: cleanEmail,
        name: cleanEmail.split('@')[0],
        avatar: '',
        google_id: `g_${btoa(cleanEmail).slice(0, 12)}`
      });

      const displayName = res.user.name || cleanEmail.split('@')[0];
      await this.onAuthSuccess(displayName);
    } catch (e) {
      UI.showToast(e.message || 'Sign in failed', 'error');
    }
  },

  async handleActivateLicense() {
    const input = document.getElementById('license-key-input');
    const key = input?.value.trim();
    const feedbackMsg = document.getElementById('license-feedback-msg');
    const btn = document.getElementById('activate-license-btn');

    if (!this.authData || !this.authData.authenticated) {
      if (key) this.pendingProductKey = key;
      UI.closeAccountModal();
      UI.openAuthModal('login');
      UI.showToast('Please sign in or create an account first to bind your product key.', 'info');
      return;
    }

    if (!key) {
      if (feedbackMsg) {
        feedbackMsg.className = 'license-feedback error';
        feedbackMsg.innerText = 'Please enter a product key.';
        feedbackMsg.style.display = 'block';
      }
      return;
    }

    try {
      btn.disabled = true;
      const res = await API.activateLicense(key);
      if (res.success) {
        if (feedbackMsg) {
          feedbackMsg.className = 'license-feedback success';
          feedbackMsg.innerText = `✓ ${res.message}`;
          feedbackMsg.style.display = 'block';
        }
        UI.showToast(`🎉 Upgraded to ${res.plan.name}! All Turbo features unlocked.`, 'success');
        await this.initAuth();
        UI.openAccountModal(this.authData);
      }
    } catch (e) {
      if (feedbackMsg) {
        feedbackMsg.className = 'license-feedback error';
        feedbackMsg.innerText = `✕ ${e.message || 'Invalid product key'}`;
        feedbackMsg.style.display = 'block';
      }
    } finally {
      btn.disabled = false;
    }
  },

  async handleLogout() {
    if (this.firebaseAuth) {
      try {
        await this.firebaseAuth.signOut();
      } catch (_) {}
    }
    await API.logout();
    UI.closeAccountModal();
    UI.showToast('Logged out of EggDL', 'info');
    await this.initAuth();
  },

  // --- In-App Auto Updates & Versioning ---
  async checkVersion(manual = false) {
    const statusHint = document.getElementById('settings-update-status');
    const versionBadge = document.getElementById('settings-app-version');
    if (versionBadge) versionBadge.innerText = 'v2.0.0';

    try {
      if (manual && statusHint) statusHint.innerText = 'Checking for updates on server...';
      const info = await API.checkVersion();
      
      if (info.update_available) {
        if (statusHint) statusHint.innerText = `New version v${info.latest_version} available!`;
        this.showUpdateModal(info);
      } else {
        if (statusHint) statusHint.innerText = `You are running the latest version (v${info.current_version}).`;
        if (manual) {
          UI.showToast(`✓ You are up to date! EggDL v${info.current_version} is the latest version.`, 'success');
        }
      }
    } catch (e) {
      if (statusHint) statusHint.innerText = 'Could not reach update server.';
      if (manual) UI.showToast('Could not check updates: ' + e.message, 'error');
    }
  },

  showUpdateModal(info) {
    const modal = document.getElementById('update-modal');
    if (!modal) return;
    const verBadge = document.getElementById('update-modal-version');
    const notesBox = document.getElementById('update-modal-notes');
    const nowBtn = document.getElementById('update-modal-now-btn');
    const laterBtn = document.getElementById('update-modal-later-btn');

    if (verBadge) verBadge.innerText = `v${info.latest_version} Available`;
    if (notesBox) notesBox.innerText = info.release_notes || 'Exciting new features and performance upgrades.';
    
    if (nowBtn) {
      nowBtn.onclick = async () => {
        modal.style.display = 'none';
        const downloadUrl = info.download_url || 'https://eggdl.onrender.com/download/setup';
        const targetFilename = `EggDL_Setup_v${info.latest_version}.exe`;
        
        UI.showToast(`⬇️ Starting in-app Turbo download for EggDL v${info.latest_version}...`, 'success');
        
        try {
          await this.startDownloadTask({
            url: downloadUrl,
            custom_filename: targetFilename,
            category: 'program'
          });
          
          const downloadsNav = document.getElementById('nav-downloads');
          if (downloadsNav) downloadsNav.click();
          
          const activeSec = document.getElementById('active-section');
          if (activeSec) {
            activeSec.style.display = 'block';
            activeSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        } catch (err) {
          console.warn('In-app update queue note:', err);
          window.open(downloadUrl, '_blank');
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

  // --- Remote Kill-Switch & Anti-Piracy Authorization ---
  async checkDeviceAuthorization() {
    try {
      const email = this.authData?.user?.email || null;
      const res = await API.checkDeviceStatus(email);
      if (res.is_blocked) {
        const blockedScreen = document.getElementById('blocked-screen');
        if (blockedScreen) {
          blockedScreen.style.display = 'flex';
          const devIdEl = document.getElementById('blocked-device-id');
          const reasonEl = document.getElementById('blocked-reason-text');
          if (devIdEl) devIdEl.innerText = res.device_id;
          if (reasonEl) reasonEl.innerText = res.block_reason || 'License violation detected';
          if (window.lucide) window.lucide.createIcons();
        }
      }
    } catch (e) {
      console.warn('Device authorization check:', e);
    }
  },

  // --- Developer Admin Remote Control Center ---
  adminKey: null,
  initAdminPanel() {
    const openAdminBtn = document.getElementById('btn-open-admin');
    const adminModal = document.getElementById('admin-modal');
    const closeAdminBtn = document.getElementById('close-admin-modal-btn');
    const adminLoginBtn = document.getElementById('btn-admin-login');
    const adminKeyInput = document.getElementById('admin-master-key-input');
    const loginView = document.getElementById('admin-login-view');
    const dashView = document.getElementById('admin-dashboard-view');
    const tabReleases = document.getElementById('admin-tab-releases-btn');
    const tabDevices = document.getElementById('admin-tab-devices-btn');
    const viewReleases = document.getElementById('admin-view-releases');
    const viewDevices = document.getElementById('admin-view-devices');
    const pushReleaseBtn = document.getElementById('btn-admin-push-release');
    const refreshDevicesBtn = document.getElementById('btn-admin-refresh-devices');

    if (openAdminBtn) {
      openAdminBtn.onclick = () => {
        if (adminModal) {
          adminModal.style.display = 'flex';
          if (window.lucide) window.lucide.createIcons();
        }
      };
    }
    if (closeAdminBtn) {
      closeAdminBtn.onclick = () => {
        if (adminModal) adminModal.style.display = 'none';
      };
    }

    if (adminLoginBtn) {
      adminLoginBtn.onclick = async () => {
        const key = adminKeyInput.value.trim();
        if (!key) return UI.showToast('Please enter master key', 'error');
        try {
          adminLoginBtn.disabled = true;
          const data = await API.getAdminOverview(key);
          this.adminKey = key;
          loginView.style.display = 'none';
          dashView.style.display = 'block';
          this.renderAdminDevices(data.devices);
          UI.showToast('Master Control Center Unlocked', 'success');
        } catch (e) {
          UI.showToast(e.message || 'Invalid Master Key', 'error');
        } finally {
          adminLoginBtn.disabled = false;
        }
      };
    }

    if (tabReleases && tabDevices) {
      tabReleases.onclick = () => {
        tabReleases.classList.add('active');
        tabDevices.classList.remove('active');
        viewReleases.style.display = 'block';
        viewDevices.style.display = 'none';
      };
      tabDevices.onclick = () => {
        tabDevices.classList.add('active');
        tabReleases.classList.remove('active');
        viewDevices.style.display = 'block';
        viewReleases.style.display = 'none';
        if (this.adminKey) this.refreshAdminDevices();
      };
    }

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

    if (refreshDevicesBtn) {
      refreshDevicesBtn.onclick = () => this.refreshAdminDevices();
    }
  },

  async refreshAdminDevices() {
    if (!this.adminKey) return;
    try {
      const data = await API.getAdminOverview(this.adminKey);
      this.renderAdminDevices(data.devices);
    } catch (e) {
      UI.showToast('Refresh failed: ' + e.message, 'error');
    }
  },

  renderAdminDevices(devices = []) {
    const list = document.getElementById('admin-devices-list');
    if (!list) return;
    if (!devices.length) {
      list.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 20px;">No registered devices found.</div>';
      return;
    }
    list.innerHTML = devices.map(d => `
      <div style="background: var(--bg-secondary); border: 1px solid ${d.is_blocked ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-color)'}; border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 700; font-family: monospace; font-size: 0.88rem; color: ${d.is_blocked ? '#F87171' : 'var(--text-main)'};">
            ${d.device_id} ${d.is_blocked ? '<span class="badge" style="background: #EF4444; color: #fff; font-size: 0.65rem; padding: 1px 6px; border-radius: 4px;">BLOCKED</span>' : '<span class="badge" style="background: #10B981; color: #fff; font-size: 0.65rem; padding: 1px 6px; border-radius: 4px;">ACTIVE</span>'}
          </div>
          <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 2px;">
            PC: <b>${d.machine_name || 'PC'}</b> • OS: ${d.os_info || 'Win'} • User: ${d.user_email || 'Guest'}
          </div>
        </div>
        <div>
          <button class="btn btn-sm ${d.is_blocked ? 'btn-secondary' : 'btn-danger'}" onclick="App.toggleDeviceBlock('${d.device_id}', ${d.is_blocked ? 'false' : 'true'})">
            ${d.is_blocked ? 'Unblock PC' : 'Kill-Switch Block'}
          </button>
        </div>
      </div>
    `).join('');
  },

  async toggleDeviceBlock(deviceId, shouldBlock) {
    if (!this.adminKey) return;
    try {
      await API.adminBlockDevice(this.adminKey, deviceId, shouldBlock, shouldBlock ? 'Revoked by developer' : null);
      UI.showToast(`Device ${deviceId} ${shouldBlock ? 'BLOCKED' : 'UNBLOCKED'}`, 'success');
      this.refreshAdminDevices();
    } catch (e) {
      UI.showToast(e.message || 'Block failed', 'error');
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
