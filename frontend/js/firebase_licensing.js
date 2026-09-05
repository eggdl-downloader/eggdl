// EggDL Firebase Real-Time Hardware Licensing Client
// 100% Hardware-Bound (HWID). Zero Google Login. Instant <3s Admin Control.

const FirebaseLicensing = {
  dbUrl: 'https://eggdl-app-default-rtdb.firebaseio.com',
  eventSource: null,
  activeMachineId: null,
  _pollTimer: null,

  async init(machineId) {
    if (!machineId) {
      try {
        const me = typeof API !== 'undefined' && API.getMe ? await API.getMe() : null;
        machineId = me?.machine?.machine_id || localStorage.getItem('eggdl_hwid');
      } catch (_) {}
    }
    if (!machineId) return;
    this.activeMachineId = machineId.replace(/[\/\.]/g, '_');
    this.startRealtimeStream();
  },

  startRealtimeStream() {
    if (!this.activeMachineId) return;
    if (this.eventSource) {
      try { this.eventSource.close(); } catch (_) {}
      this.eventSource = null;
    }

    // Firebase Realtime Database SSE / Streaming Protocol
    const streamUrl = `${this.dbUrl}/devices/${this.activeMachineId}.json`;
    
    try {
      this.eventSource = new EventSource(streamUrl);

      this.eventSource.addEventListener('put', (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && payload.data) {
            this.handleRemoteUpdate(payload.data);
          }
        } catch (_) {}
      });

      this.eventSource.addEventListener('patch', (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && payload.data) {
            this.handleRemoteUpdate(payload.data);
          }
        } catch (_) {}
      });

      this.eventSource.onerror = () => {
        // SSE disconnected or error, fallback polling is active
      };
    } catch (_) {}

    // In addition to SSE, active fallback polling every 4 seconds ensures 100% reliability
    if (!this._pollTimer) {
      this._pollTimer = setInterval(() => this.pollStatus(), 4000);
    }
  },

  async handleRemoteUpdate(data) {
    if (!data || typeof data !== 'object') return;

    // 1. Instant Kill / Block Check
    if (data.is_blocked) {
      const reason = data.block_reason || 'Access suspended by master administrator.';
      if (window.UI && typeof UI.renderDeviceSuspended === 'function') {
        UI.renderDeviceSuspended(reason);
      }
      if (window.App && App.authData) {
        App.authData.is_blocked = true;
        App.authData.can_download = false;
        App.authData.is_pro = false;
      }
      return;
    } else {
      if (window.UI && typeof UI.removeDeviceSuspended === 'function') {
        UI.removeDeviceSuspended();
      }
    }

    // 2. Instant Pro Grant / Revoke Check
    if (window.App) {
      let changed = false;
      const isPro = !!data.is_pro;
      const planType = data.plan_type || 'trial';

      if (App.authData) {
        if (App.authData.is_pro !== isPro || App.authData.plan_type !== planType) {
          App.authData.is_pro = isPro;
          App.authData.plan_type = planType;
          App.authData.can_download = isPro || !data.trial_expired;
          App.authData.days_remaining = data.days_remaining || (isPro ? 9999 : 0);
          changed = true;
        }
      }

      if (changed && window.UI) {
        UI.renderUserProfile(App.authData);
        if (isPro) {
          UI.showToast('👑 Pro Activated by Master Admin!', 'success');
          UI.closeAccountModal();
        } else if (planType === 'expired') {
          UI.showToast('⚠️ License status changed: Expired', 'warning');
        }
      }
    }
  },

  async pollStatus() {
    if (!this.activeMachineId) return;
    try {
      const res = await fetch(`${this.dbUrl}/devices/${this.activeMachineId}.json`);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          this.handleRemoteUpdate(data);
        }
      }
    } catch (_) {}
  }
};

window.FirebaseLicensing = FirebaseLicensing;
