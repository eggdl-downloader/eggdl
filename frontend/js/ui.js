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
        const speedStr = isPaused ? 'Paused' : UI.formatSpeed(task.speed);
        const etaStr = isPaused ? '--:--' : UI.formatEta(task.eta);
        const sizeStr = task.file_size > 0 
          ? `${UI.formatBytes(task.downloaded_bytes)} / ${UI.formatBytes(task.file_size)}` 
          : UI.formatBytes(task.downloaded_bytes);

        card.className = `active-card ${isPaused ? 'is-paused' : ''}`;
        
        const subEl = card.querySelector('.active-file-sub');
        if (subEl) subEl.innerHTML = `<span>${sizeStr}</span><span>•</span><span>ETA: ${etaStr}</span>`;

        const valEl = card.querySelector('.stat-value');
        if (valEl) {
          valEl.innerText = speedStr;
          valEl.style.color = isPaused ? 'var(--accent-amber)' : '';
        }

        const labelEl = card.querySelector('.stat-label');
        if (labelEl) labelEl.innerText = isPaused ? 'Status' : 'Download Speed';

        const fillEl = card.querySelector('.active-progress-fill');
        if (fillEl) {
          fillEl.style.width = `${task.progress}%`;
          fillEl.className = `active-progress-fill ${isPaused ? 'paused' : ''}`;
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
      const speedStr = isPaused ? 'Paused' : UI.formatSpeed(task.speed);
      const etaStr = isPaused ? '--:--' : UI.formatEta(task.eta);
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
                <div class="stat-value" style="${isPaused ? 'color: var(--accent-amber);' : ''}">${speedStr}</div>
                <div class="stat-label">${isPaused ? 'Status' : 'Download Speed'}</div>
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
              <div class="active-progress-fill ${isPaused ? 'paused' : ''}" style="width: ${task.progress}%;"></div>
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
      
      return `
        <tr id="row-${item.id}">
          <td>
            <div class="type-icon ${item.category || 'other'}">
              <i data-lucide="${UI.getCategoryIcon(item.category)}"></i>
            </div>
          </td>
          <td>
            <div class="file-cell">
              <div class="file-cell-info">
                <div class="file-title" title="${item.title || item.filename}">${item.title || item.filename}</div>
                <div class="file-sub" title="${item.url}">${item.url}</div>
              </div>
            </div>
          </td>
          <td style="font-weight: 600; font-family: var(--font-mono);">${sizeStr}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="progress-bar-bg" style="width: 80px; margin-bottom: 0;">
                <div class="progress-bar-fill" style="width: ${effectiveProgress}%;"></div>
              </div>
              <span class="row-progress-pct" style="font-size: 0.8rem; font-family: var(--font-mono); font-weight: 600;">${effectiveProgress}%</span>
            </div>
          </td>
          <td>
            <span class="status-badge ${statusClass}">
              ${statusLabel}
            </span>
          </td>
          <td style="font-size: 0.8rem; color: var(--text-dim); white-space: nowrap;">${UI.formatDate(item.created_at)}</td>
          <td>
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

  // --- Machine ID & Account UI ---
  renderUserProfile(authData) {
    const container = document.getElementById('user-header-area');
    if (!container) return;

    const user = (authData && authData.user) || {};
    const machine = (authData && authData.machine) || {};
    const desktopName = machine.desktop_name || user.name || 'DESKTOP-PC';
    const plan = (authData && authData.plan) || { badge: '7-Day Trial', name: '7-Day Free Trial' };
    const isPro = authData && authData.is_pro;
    const isTrial = authData && authData.is_trial;
    const trialExpired = authData && authData.trial_expired;
    const trialDaysLeft = (authData && authData.trial_days_remaining) || 0;
    const daysLeft = authData && authData.days_remaining;

    let badgeClass = 'user-plan-badge trial';
    let badgeText = `⏳ ${trialDaysLeft}d Trial Left`;

    if (user.plan_type === 'lifetime' || (isPro && !daysLeft)) {
      badgeClass = 'user-plan-badge lifetime';
      badgeText = '👑 Pro Lifetime';
    } else if (isPro) {
      badgeClass = 'user-plan-badge pro';
      badgeText = `⚡ Pro (${daysLeft}d Left)`;
    } else if (isTrial) {
      badgeClass = 'user-plan-badge trial';
      badgeText = `⏳ 7-Day Trial (${trialDaysLeft}d Left)`;
    } else {
      badgeClass = 'user-plan-badge expired';
      badgeText = `⚠️ Trial Expired`;
    }

    container.innerHTML = `
      <button class="user-pill-btn" id="user-profile-btn" title="Click to view Machine License & Product Key">
        <div class="user-avatar"><i data-lucide="monitor" style="width: 14px; height: 14px;"></i></div>
        <span class="user-name">${desktopName}</span>
        <span class="${badgeClass}">${badgeText}</span>
      </button>
    `;

    document.getElementById('user-profile-btn')?.addEventListener('click', () => {
      UI.openAccountModal(authData);
    });

    // Topbar Status Greeting
    const engineTextEl = document.getElementById('engine-status-text');
    if (engineTextEl) {
      if (isPro) {
        engineTextEl.innerHTML = `EggDL Pro Engine <span class="engine-dot-ready">⚡</span> <span style="font-size:0.75rem; color:#10B981; font-weight:600;">(Unlimited Turbo)</span>`;
      } else if (isTrial) {
        engineTextEl.innerHTML = `EggDL Trial Ready <span class="engine-dot-ready">⚡</span> <span style="font-size:0.75rem; color:#F59E0B; font-weight:600;">(${trialDaysLeft} Days Remaining)</span>`;
      } else {
        engineTextEl.innerHTML = `EggDL Engine <span style="font-size:0.75rem; color:#EF4444; font-weight:600;">(Trial Expired • Activate Key)</span>`;
      }
    }
    lucide.createIcons();
  },

  renderDeviceSuspended(reason = 'Access to this device has been suspended by the administrator.') {
    let overlay = document.getElementById('device-kill-lockout-overlay');
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
    lucide.createIcons();
  },

  openAuthModal(mode = 'login') {
    const modal = document.getElementById('auth-modal');
    const title = document.getElementById('auth-modal-title');
    const tabLogin = document.getElementById('tab-login-btn');
    const tabReg = document.getElementById('tab-register-btn');
    const nameGroup = document.getElementById('auth-name-group');
    const submitText = document.getElementById('submit-auth-text');
    const errBanner = document.getElementById('auth-error-msg');
    
    if (errBanner) {
      errBanner.style.display = 'none';
      errBanner.innerText = '';
    }

    if (mode === 'register') {
      if (title) title.innerText = 'Create EggDL Account';
      tabLogin?.classList.remove('active');
      tabReg?.classList.add('active');
      if (nameGroup) nameGroup.style.display = 'flex';
      if (submitText) submitText.innerText = 'Create Account';
    } else {
      if (title) title.innerText = 'Sign In to EggDL';
      tabLogin?.classList.add('active');
      tabReg?.classList.remove('active');
      if (nameGroup) nameGroup.style.display = 'none';
      if (submitText) submitText.innerText = 'Sign In';
    }

    if (modal) modal.style.display = 'flex';
    if (typeof App !== 'undefined' && App.initGoogleOAuth) {
      setTimeout(() => App.initGoogleOAuth(), 100);
    }
    lucide.createIcons();
  },

  toggleAuthPassword(btn) {
    const wrapper = btn.closest('.auth-input-wrapper');
    const input = wrapper ? wrapper.querySelector('input') : null;
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      btn.innerHTML = '<i data-lucide="eye-off" style="width: 15px; height: 15px;"></i>';
    } else {
      input.type = 'password';
      btn.innerHTML = '<i data-lucide="eye" style="width: 15px; height: 15px;"></i>';
    }
    lucide.createIcons();
  },

  closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.style.display = 'none';
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
        pillEl.innerHTML = '👑 Ultimate Pass • Lifetime VIP';
      } else if (isPro) {
        pillEl.className = 'plan-pill pro';
        pillEl.innerHTML = `⚡ ${plan.name || 'Pro'} (${daysLeft} days remaining)`;
      } else if (authData?.is_trial) {
        pillEl.className = 'plan-pill trial';
        pillEl.innerHTML = `⏳ 7-Day Free Trial • ${authData.trial_days_remaining} Days Remaining (Unlimited Downloads)`;
      } else {
        pillEl.className = 'plan-pill expired';
        pillEl.innerHTML = `⚠️ 7-Day Free Trial Ended • Enter Product Key or Purchase Plan Below`;
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

  renderAdminDevices(devicesData, adminKey) {
    const listContainer = document.getElementById('admin-devices-list');
    const totalCountEl = document.getElementById('admin-total-devices-count');
    const onlineCountEl = document.getElementById('admin-online-devices-count');
    const proCountEl = document.getElementById('admin-pro-devices-count');
    const blockedCountEl = document.getElementById('admin-blocked-devices-count');

    if (!listContainer) return;

    const devices = devicesData.devices || [];
    if (totalCountEl) totalCountEl.innerText = devicesData.total_devices || devices.length;
    if (onlineCountEl) onlineCountEl.innerText = devicesData.online_count || 0;
    if (proCountEl) proCountEl.innerText = devicesData.pro_count || 0;
    if (blockedCountEl) blockedCountEl.innerText = devicesData.blocked_count || 0;

    if (!devices.length) {
      listContainer.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--text-dim);">
          <i data-lucide="monitor-off" style="width:36px;height:36px;margin:0 auto 12px auto;opacity:0.5;"></i>
          <p>No connected devices recorded yet.</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    let html = '';
    devices.forEach((dev) => {
      const isOnline = dev.is_online;
      const isBlocked = dev.is_blocked;
      const isPro = dev.is_pro;
      
      const onlineDot = isOnline 
        ? '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#10B981;box-shadow:0 0 8px #10B981;margin-right:6px;"></span>'
        : '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#64748B;margin-right:6px;"></span>';

      html += `
        <div class="admin-device-card ${isBlocked ? 'blocked' : ''}" style="background:rgba(255,255,255,0.03);border:1px solid ${isBlocked ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'};border-radius:14px;padding:16px 18px;margin-bottom:12px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:14px;">
          <div style="display:flex;align-items:center;gap:14px;min-width:260px;">
            <div style="width:42px;height:42px;border-radius:10px;background:${isBlocked ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.12)'};color:${isBlocked ? '#EF4444' : '#3B82F6'};display:flex;align-items:center;justify-content:center;font-size:1.2rem;">
              <i data-lucide="${isBlocked ? 'shield-ban' : 'monitor'}"></i>
            </div>
            <div>
              <div style="font-weight:700;font-size:0.96rem;color:var(--text-main);display:flex;align-items:center;">
                ${onlineDot} ${dev.desktop_name}
                <span style="font-size:0.72rem;background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:6px;margin-left:8px;font-family:monospace;color:var(--text-dim);">${dev.device_id}</span>
              </div>
              <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:3px;">
                User: <span style="color:#CBD5E1;">${dev.user_name || 'User'}</span> • ${dev.os_info || 'Windows'} • v${dev.app_version} • <span style="font-family:monospace;">${dev.ip_address || '127.0.0.1'}</span>
              </div>
            </div>
          </div>

          <div style="display:flex;align-items:center;gap:16px;">
            <div style="text-align:right;">
              <div style="font-size:0.82rem;font-weight:700;color:${isBlocked ? '#EF4444' : (isPro ? '#10B981' : '#F59E0B')};">
                ${dev.status_badge}
              </div>
              <div style="font-size:0.72rem;color:var(--text-dim);margin-top:2px;">
                ${dev.last_seen_str}
              </div>
            </div>

            <div style="display:flex;gap:6px;">
              ${isBlocked ? `
                <button class="btn btn-sm btn-secondary" onclick="App.handleAdminDeviceAction('${dev.device_id}', 'unblock')" title="Unblock Machine">
                  <i data-lucide="check-circle" style="width:13px;height:13px;"></i> Unblock
                </button>
              ` : `
                <button class="btn btn-sm btn-danger" onclick="App.handleAdminDeviceAction('${dev.device_id}', 'block')" title="Kill & Block Machine">
                  <i data-lucide="shield-alert" style="width:13px;height:13px;"></i> Kill Machine
                </button>
              `}
              <button class="btn btn-sm btn-primary" onclick="App.handleAdminDeviceAction('${dev.device_id}', 'grant_pro', 'lifetime')" title="Grant Pro Lifetime">
                <i data-lucide="crown" style="width:13px;height:13px;"></i> Grant Pro
              </button>
              <button class="btn btn-sm btn-secondary" onclick="App.handleAdminDeviceAction('${dev.device_id}', 'reset_trial')" title="Reset 7-Day Trial">
                <i data-lucide="rotate-ccw" style="width:13px;height:13px;"></i> Reset 7D
              </button>
            </div>
          </div>
        </div>
      `;
    });

    listContainer.innerHTML = html;
    lucide.createIcons();
  }
};
