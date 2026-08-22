const API = {
  baseUrl: '',
  tokenKey: 'eggdl_auth_token',

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
    const headers = { 'Content-Type': 'application/json', ...extra };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  },

  // --- Authentication APIs ---
  async login(email, password) {
    const res = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Login failed');
    }
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  },

  async register(email, password, name = '') {
    const res = await fetch(`${this.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Registration failed');
    }
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  },

  async googleAuth(payload) {
    const res = await fetch(`${this.baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Google sign in failed');
    }
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  },

  async firebaseAuth(payload) {
    const res = await fetch(`${this.baseUrl}/api/auth/firebase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Firebase authentication failed');
    }
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  },

  async getMe() {
    const res = await fetch(`${this.baseUrl}/api/auth/me`, {
      headers: this.getHeaders()
    });
    if (!res.ok) {
      return { authenticated: false, user: { name: 'Guest User', plan_type: 'free' } };
    }
    return res.json();
  },

  async logout() {
    this.setToken(null);
    try {
      await fetch(`${this.baseUrl}/api/auth/logout`, { method: 'POST' });
    } catch (e) {}
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

  async checkVersion() {
    try {
      const res = await fetch(`${this.baseUrl}/api/system/version`, { headers: this.getHeaders() });
      if (res.ok) return await res.json();
    } catch (_) {}

    // Fallback to central cloud server
    const cloudRes = await fetch('https://eggdl.onrender.com/api/system/version');
    if (!cloudRes.ok) throw new Error('Could not fetch version information');
    return cloudRes.json();
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
