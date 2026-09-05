const API = {
  baseUrl: (localStorage.getItem('eggdl_backend_url') || '').replace(/\/+$/, ''),
  tokenKey: 'eggdl_auth_token',

  setBaseUrl(url) {
    if (url && url.trim()) {
      this.baseUrl = url.trim().replace(/\/+$/, '');
      localStorage.setItem('eggdl_backend_url', this.baseUrl);
    } else {
      this.baseUrl = '';
      localStorage.removeItem('eggdl_backend_url');
    }
  },

  getBaseUrl() {
    return this.baseUrl || (localStorage.getItem('eggdl_backend_url') || '').replace(/\/+$/, '');
  },

  getOrCreateDeviceId() {
    return localStorage.getItem('eggdl_hwid') || '';
  },

  getDeviceName() {
    return localStorage.getItem('eggdl_pc_name') || 'SRIMAN';
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

  async browseDirectory(currentDir = '') {
    const res = await fetch(`${this.baseUrl}/api/settings/browse_directory`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ current_dir: currentDir })
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
    let currentVer = '2.1.8';
    let localData = null;

    // 1. Try local server with fast 2.5s timeout
    try {
      const res = await fetch(`${this.baseUrl}/api/system/version`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout ? AbortSignal.timeout(2500) : undefined
      });
      if (res.ok) {
        localData = await res.json();
        currentVer = localData.current_version || '2.1.7';
        if (localData.update_available) {
          return localData;
        }
      }
    } catch (_) {}

    // 2. Direct Firebase Realtime Database release check
    try {
      const fbRes = await fetch('https://eggdl-app-default-rtdb.firebaseio.com/system/latest_release.json', {
        signal: AbortSignal.timeout ? AbortSignal.timeout(3500) : undefined
      });
      if (fbRes.ok) {
        const cloudData = await fbRes.json();
        if (cloudData && cloudData.version) {
          const latestVer = cloudData.version;
          const hasUpdate = this.isNewerVersion(latestVer, currentVer);
          return {
            success: true,
            current_version: currentVer,
            latest_version: latestVer,
            update_available: hasUpdate,
            release_notes: cloudData.release_notes || 'Exciting new features and performance upgrades.',
            download_url: cloudData.download_url || 'https://raw.githubusercontent.com/eggdl-downloader/eggdl/main/frontend/downloads/EggDL_Setup.exe',
            mandatory: Boolean(cloudData.mandatory),
            latest_release: cloudData
          };
        }
      }
    } catch (err) {
      console.warn('Firebase update check error/timeout:', err);
    }

    return localData || {
      success: true,
      current_version: currentVer,
      latest_version: currentVer,
      update_available: false
    };
  },

  async getClipboard() {
    // 1. Try PyWebView native JS API if available
    try {
      if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.get_clipboard === 'function') {
        const clip = await window.pywebview.api.get_clipboard();
        if (clip) return clip;
      }
    } catch (_) {}

    // 2. Fetch from local backend with fast timeout
    try {
      const res = await fetch(`${this.baseUrl}/api/system/clipboard`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout ? AbortSignal.timeout(1500) : undefined
      });
      if (res.ok) {
        const data = await res.json();
        return data.text || '';
      }
    } catch (_) {}
    return '';
  },

  async startUpdateDownload(version, downloadUrl) {
    const res = await fetch(`${this.baseUrl}/api/system/update/download`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ version, download_url: downloadUrl })
    });
    return res.json();
  },

  async getUpdateStatus() {
    const res = await fetch(`${this.baseUrl}/api/system/update/status`, { headers: this.getHeaders() });
    return res.json();
  },

  async installUpdate() {
    try {
      if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.install_update === 'function') {
        const nativeRes = await window.pywebview.api.install_update();
        if (nativeRes && nativeRes.success) return nativeRes;
      }
    } catch (_) {}

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${this.baseUrl}/api/system/update/install`, {
        method: 'POST',
        headers: this.getHeaders(),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        return await res.json();
      }
      return { success: false, message: `Server error: ${res.status}` };
    } catch (err) {
      return { success: false, message: err.message || 'Connection error' };
    }
  },

  async getDeviceStatus(userEmail = null) {
    try {
      const res = await fetch(`${this.baseUrl}/api/system/device-status`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ user_email: userEmail, app_version: '2.0.0' })
      });
      if (res.ok) return await res.json();
    } catch (_) {}

    return { success: false };
  },

  async getAdminOverview(adminKey) {
    try {
      const res = await fetch(`${this.baseUrl}/api/admin/overview?admin_key=${encodeURIComponent(adminKey)}`);
      if (res.ok) return await res.json();
    } catch (_) {}

    throw new Error('Could not connect to Admin Server or invalid key.');
  },

  async getMachineInfo() {
    try {
      const res = await fetch(`${this.baseUrl}/api/system/machine-info`);
      if (res.ok) return await res.json();
    } catch (_) {}
    return { success: false };
  },

  async telemetryHeartbeat(payload = {}) {
    try {
      const localRes = await fetch(`${this.baseUrl}/api/telemetry/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (localRes.ok) return await localRes.json();
    } catch (_) {}

    return { success: false };
  },

  async activateMachineKey(licenseKey, deviceId = null) {
    const cleanKey = (licenseKey || '').replace(/\s+/g, '').replace(/[–—]/g, '-').trim().toUpperCase();
    let res = null;
    try {
      res = await fetch(`${this.baseUrl}/api/license/activate-machine-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: cleanKey, device_id: deviceId })
      });
    } catch (e) {
      throw new Error('Unable to connect to local licensing engine: ' + e.message);
    }

    const data = await res.json().catch(() => ({ detail: 'Activation failed' }));
    if (!res.ok) {
      throw new Error(data.detail || data.message || 'Product key activation failed');
    }
    return data;
  },

  async getAdminDevices(adminKey) {
    try {
      const res = await fetch(`${this.baseUrl}/api/admin/devices?admin_key=${encodeURIComponent(adminKey)}`);
      if (res.ok) return await res.json();
      const err = await res.json().catch(() => null);
      if (res.status === 403) throw new Error((err && err.detail) || 'Invalid Master Admin Key');
    } catch (e) {
      if (e.message && e.message.includes('Invalid Master Admin Key')) throw e;
    }

    throw new Error('Failed to fetch connected devices from Admin server');
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
      throw new Error((err && err.detail) || 'Failed to perform device action');
    } catch (e) {
      throw e;
    }
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
      const err = await res.json().catch(() => null);
      if (res.status === 403) throw new Error((err && err.detail) || 'Invalid Master Admin Key');
      throw new Error((err && err.detail) || 'Push release failed');
    } catch (e) {
      throw e;
    }
  }
};
