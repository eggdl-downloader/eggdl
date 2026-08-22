const API = {
  baseUrl: '',
  tokenKey: 'eggdl_auth_token',

  getOrCreateDeviceId() {
    let devId = localStorage.getItem('eggdl_hwid');
    if (!devId) {
      const randHex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      devId = 'EGG-' + randHex;
      localStorage.setItem('eggdl_hwid', devId);
    }
    return devId;
  },

  getDeviceName() {
    let name = localStorage.getItem('eggdl_pc_name');
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !window.location.hostname;
    
    if (isLocal) {
      if (!name || name.startsWith('DESKTOP-WIN-') || name === 'DESKTOP-PC' || name.toLowerCase().includes('guest') || name === 'WEB-CLIENT') {
        name = 'SRIMAN';
        localStorage.setItem('eggdl_pc_name', name);
      }
      return name;
    }

    if (!name || name.startsWith('DESKTOP-WIN-') || name === 'DESKTOP-PC' || name.toLowerCase().includes('guest')) {
      const ua = navigator.userAgent;
      let platform = 'PC';
      if (ua.includes('Windows')) platform = 'DESKTOP-WIN';
      else if (ua.includes('Macintosh')) platform = 'MACBOOK';
      else if (ua.includes('Android')) platform = 'ANDROID-DEVICE';
      else if (ua.includes('iPhone') || ua.includes('iPad')) platform = 'IPHONE';
      else if (ua.includes('Linux')) platform = 'LINUX-PC';
      
      const randNum = Math.floor(1000 + Math.random() * 9000);
      name = `${platform}-${randNum}`;
      localStorage.setItem('eggdl_pc_name', name);
    }
    return name;
  },

  getToken() {
    return localStorage.getItem(this.tokenKey) || '';
  },

  setToken(token) {
    if (token) {
      localStorage.setItem(this.tokenKey, token);
    } else {
      localStorage.removeItem(this.tokenKey);
    }
  },

  getHeaders(extra = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'x-device-id': this.getOrCreateDeviceId(),
      'x-desktop-name': this.getDeviceName(),
      'x-user-name': 'User',
      'x-os-info': navigator.platform || 'Windows',
      ...extra
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  },

  // --- Hardware Machine Status ---
  async getMe() {
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/me`, {
        headers: this.getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.machine?.desktop_name && data.machine.desktop_name !== 'DESKTOP-PC' && data.machine.desktop_name !== 'WEB-CLIENT') {
          localStorage.setItem('eggdl_pc_name', data.machine.desktop_name);
        }
        if (data.machine?.machine_id) {
          localStorage.setItem('eggdl_hwid', data.machine.machine_id);
        }
        return data;
      }
    } catch (_) {}

    const devId = this.getOrCreateDeviceId();
    const pcName = this.getDeviceName();
    return {
      authenticated: true,
      machine: {
        machine_id: devId,
        desktop_name: pcName,
        user_name: 'User',
        os_info: navigator.platform || 'Windows'
      },
      user: {
        id: devId,
        name: pcName,
        user_name: 'User',
        plan_type: 'trial'
      },
      plan: { name: '7-Day Free Trial', badge: 'Trial' },
      is_pro: false,
      is_trial: true,
      trial_expired: false,
      trial_days_remaining: 7,
      days_remaining: 7,
      can_download: true,
      is_unlimited: true
    };
  },

  async logout() {
    return { success: true };
  },

  // --- Licensing APIs ---
  async activateLicense(licenseKey) {
    const res = await fetch(`${this.baseUrl}/api/license/activate`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ license_key: licenseKey })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'License activation failed');
    }
    return data;
  },

  async getPlans() {
    const res = await fetch(`${this.baseUrl}/api/license/plans`);
    return res.json();
  },

  async processPayment(payload) {
    const res = await fetch(`${this.baseUrl}/api/payment/process`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Payment processing failed');
    }
    return data;
  },

  // --- Downloader APIs ---
  async inspectUrl(url) {
    const res = await fetch(`${this.baseUrl}/api/inspect`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ url })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to inspect link' }));
      throw new Error(err.detail || 'Failed to inspect link');
    }
    return res.json();
  },

  async sniffUrl(url) {
    const res = await fetch(`${this.baseUrl}/api/sniff`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ url })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to sniff webpage' }));
      throw new Error(err.detail || 'Failed to sniff webpage');
    }
    return res.json();
  },

  async startDownload(payload) {
    const res = await fetch(`${this.baseUrl}/api/download/start`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to start download' }));
      const errorMsg = err.message || err.detail || 'Failed to start download';
      const errorObj = new Error(errorMsg);
      errorObj.errorType = err.error || '';
      errorObj.daily_count = err.daily_count;
      throw errorObj;
    }
    return res.json();
  },

  async saveDirectFile(payload) {
    const res = await fetch(`${this.baseUrl}/api/download/save_file`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to save file' }));
      const errorMsg = err.message || err.detail || 'Failed to save file';
      const errorObj = new Error(errorMsg);
      errorObj.errorType = err.error || '';
      throw errorObj;
    }
    return res.json();
  },

  async pauseDownload(taskId) {
    const res = await fetch(`${this.baseUrl}/api/download/${taskId}/pause`, { method: 'POST', headers: this.getHeaders() });
    return res.json();
  },

  async resumeDownload(taskId) {
    const res = await fetch(`${this.baseUrl}/api/download/${taskId}/resume`, { method: 'POST', headers: this.getHeaders() });
    return res.json();
  },

  async cancelDownload(taskId) {
    const res = await fetch(`${this.baseUrl}/api/download/${taskId}/cancel`, { method: 'POST', headers: this.getHeaders() });
    return res.json();
  },

  async deleteDownload(taskId, deleteFile = false) {
    const res = await fetch(`${this.baseUrl}/api/download/${taskId}?delete_file=${deleteFile}`, { method: 'DELETE', headers: this.getHeaders() });
    return res.json();
  },

  async clearCompleted() {
    const res = await fetch(`${this.baseUrl}/api/download/clear-completed`, { method: 'POST', headers: this.getHeaders() });
    return res.json();
  },

  async clearAll() {
    const res = await fetch(`${this.baseUrl}/api/download/clear-all`, { method: 'POST', headers: this.getHeaders() });
    return res.json();
  },

  async getDownloads(category = 'all', status = 'all') {
    const res = await fetch(`${this.baseUrl}/api/downloads?category=${category}&status=${status}`, { headers: this.getHeaders() });
    return res.json();
  },

  async getSettings() {
    const res = await fetch(`${this.baseUrl}/api/settings`, { headers: this.getHeaders() });
    return res.json();
  },

  async saveSettings(settings) {
    const res = await fetch(`${this.baseUrl}/api/settings`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(settings)
    });
    return res.json();
  },

  async openFile(taskId, filePath) {
    const res = await fetch(`${this.baseUrl}/api/system/open-file`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ task_id: taskId, file_path: filePath })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Could not open file' }));
      throw new Error(err.detail || 'Could not open file');
    }
    return res.json();
  },

  async openFolder(taskId, filePath) {
    const res = await fetch(`${this.baseUrl}/api/system/open-folder`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ task_id: taskId, file_path: filePath })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Could not open folder' }));
      throw new Error(err.detail || 'Could not open folder');
    }
    return res.json();
  },

  async getSystemStats() {
    const res = await fetch(`${this.baseUrl}/api/system/stats`, { headers: this.getHeaders() });
    return res.json();
  },

  isNewerVersion(remoteVer, localVer) {
    if (!remoteVer || !localVer) return false;
    try {
      const r = remoteVer.toString().replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
      const l = localVer.toString().replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
      for (let i = 0; i < Math.max(r.length, l.length); i++) {
        const rVal = r[i] !== undefined ? r[i] : 0;
        const lVal = l[i] !== undefined ? l[i] : 0;
        if (rVal > lVal) return true;
        if (rVal < lVal) return false;
      }
      return false;
    } catch (_) {
      return remoteVer !== localVer;
    }
  },

  async checkVersion() {
    let currentVer = '2.1.2';
    let localData = null;

    // 1. Try local server
    try {
      const res = await fetch(`${this.baseUrl}/api/system/version`, { headers: this.getHeaders() });
      if (res.ok) {
        localData = await res.json();
        currentVer = localData.current_version || '2.1.2';
        if (localData.update_available) {
          return localData;
        }
      }
    } catch (_) {}

    // 2. Direct cloud query to ensure no outdated cache
    try {
      const cloudRes = await fetch('https://eggdl.onrender.com/api/system/version', {
        headers: { 'User-Agent': 'EggDL-Client' }
      });
      if (cloudRes.ok) {
        const cloudData = await cloudRes.json();
        const latestVer = cloudData.latest_version || cloudData.latest_release?.version || '2.1.3';
        const hasUpdate = this.isNewerVersion(latestVer, currentVer);
        return {
          success: true,
          current_version: currentVer,
          latest_version: latestVer,
          update_available: hasUpdate,
          release_notes: cloudData.release_notes || cloudData.latest_release?.release_notes || 'Exciting new features and performance upgrades.',
          download_url: cloudData.download_url || cloudData.latest_release?.download_url || 'https://eggdl.onrender.com/download/setup',
          mandatory: Boolean(cloudData.mandatory || cloudData.latest_release?.mandatory),
          latest_release: cloudData.latest_release || cloudData
        };
      }
    } catch (err) {
      console.warn('Cloud update check error:', err);
    }

    if (localData) return localData;

    return {
      success: true,
      current_version: currentVer,
      latest_version: currentVer,
      update_available: false
    };
  },

  async checkDeviceStatus(userEmail = null) {
    try {
      const res = await fetch(`${this.baseUrl}/api/system/device-status`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ user_email: userEmail, app_version: '2.0.0' })
      });
      if (res.ok) return await res.json();
    } catch (_) {}

    const cloudRes = await fetch('https://eggdl.onrender.com/api/system/device-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email: userEmail, app_version: '2.0.0' })
    });
    return cloudRes.json();
  },

  async getAdminOverview(adminKey) {
    try {
      const res = await fetch(`${this.baseUrl}/api/admin/overview?admin_key=${encodeURIComponent(adminKey)}`);
      if (res.ok) return await res.json();
    } catch (_) {}

    const cloudRes = await fetch(`https://eggdl.onrender.com/api/admin/overview?admin_key=${encodeURIComponent(adminKey)}`);
    if (!cloudRes.ok) {
      const err = await cloudRes.json().catch(() => ({ detail: 'Invalid Admin Key' }));
      throw new Error(err.detail || 'Invalid Admin Key');
    }
    return cloudRes.json();
  },

  async getMachineInfo() {
    try {
      const res = await fetch(`${this.baseUrl}/api/system/machine-info`);
      if (res.ok) return await res.json();
    } catch (_) {}
    return { success: false };
  },

  async telemetryHeartbeat(payload = {}) {
    let res = null;
    try {
      res = await fetch(`${this.baseUrl}/api/telemetry/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) return await res.json();
    } catch (_) {}

    // Fallback direct cloud ping
    try {
      res = await fetch(`https://eggdl.onrender.com/api/telemetry/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) return await res.json();
    } catch (_) {}
    return { success: false };
  },

  async activateMachineKey(licenseKey, deviceId = null) {
    let res = null;
    try {
      res = await fetch(`${this.baseUrl}/api/license/activate-machine-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: licenseKey, device_id: deviceId })
      });
    } catch (_) {}

    if (!res || !res.ok) {
      res = await fetch(`https://eggdl.onrender.com/api/license/activate-machine-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: licenseKey, device_id: deviceId })
      });
    }

    const data = await res.json().catch(() => ({ detail: 'Activation failed' }));
    if (!res.ok) {
      throw new Error(data.detail || data.message || 'Product key activation failed');
    }
    return data;
  },

  async getAdminDevices(adminKey) {
    let localErr = null;
    try {
      const res = await fetch(`${this.baseUrl}/api/admin/devices?admin_key=${encodeURIComponent(adminKey)}`);
      if (res.ok) return await res.json();
      const err = await res.json().catch(() => null);
      if (res.status === 403) {
        throw new Error((err && err.detail) || 'Invalid Master Admin Key');
      }
      localErr = (err && err.detail) || 'Failed to fetch connected devices';
    } catch (e) {
      if (e.message && e.message.includes('Invalid Master Admin Key')) throw e;
      localErr = e.message;
    }

    // Cloud fallback
    try {
      const cloudRes = await fetch(`https://eggdl.onrender.com/api/admin/devices?admin_key=${encodeURIComponent(adminKey)}`);
      if (cloudRes.ok) return await cloudRes.json();
      const err = await cloudRes.json().catch(() => null);
      throw new Error((err && err.detail) || 'Invalid Master Admin Key');
    } catch (e) {
      throw new Error(e.message || localErr || 'Invalid Master Admin Key');
    }
  },

  async adminDeviceAction(adminKey, deviceId, action, planType = 'lifetime', reason = '') {
    try {
      const res = await fetch(`${this.baseUrl}/api/admin/device-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_key: adminKey, device_id: deviceId, action, plan_type: planType, reason })
      });
      if (res.ok) return await res.json();
      const err = await res.json().catch(() => null);
      if (res.status === 403) throw new Error((err && err.detail) || 'Invalid Master Admin Key');
    } catch (e) {
      if (e.message && e.message.includes('Invalid Master Admin Key')) throw e;
    }

    const cloudRes = await fetch(`https://eggdl.onrender.com/api/admin/device-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_key: adminKey, device_id: deviceId, action, plan_type: planType, reason })
    });
    if (!cloudRes.ok) {
      const err = await cloudRes.json().catch(() => ({ detail: 'Action failed' }));
      throw new Error(err.detail || 'Failed to perform device action');
    }
    return cloudRes.json();
  },

  async adminBlockDevice(adminKey, deviceId, shouldBlock, reason = null) {
    return this.adminDeviceAction(adminKey, deviceId, shouldBlock ? 'block' : 'unblock', 'lifetime', reason);
  },

  async adminPushRelease(adminKey, version, releaseNotes, downloadUrl, mandatory = false) {
    try {
      const res = await fetch(`${this.baseUrl}/api/admin/push-release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_key: adminKey, version, release_notes: releaseNotes, download_url: downloadUrl, mandatory })
      });
      if (res.ok) return await res.json();
    } catch (_) {}

    const cloudRes = await fetch(`https://eggdl.onrender.com/api/admin/push-release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_key: adminKey, version, release_notes: releaseNotes, download_url: downloadUrl, mandatory })
    });
    if (!cloudRes.ok) {
      const err = await cloudRes.json().catch(() => ({ detail: 'Push release failed' }));
      throw new Error(err.detail || 'Push release failed');
    }
    return cloudRes.json();
  }
};
