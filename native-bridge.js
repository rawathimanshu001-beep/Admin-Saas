// CapNative — Capacitor native bridge for Hivu HR
// Wraps native plugins (Geolocation, Camera, Push/Local Notifications, App)
// with web fallbacks so the same www/ files still work in a normal browser.
(function () {
  const cap = window.Capacitor;
  const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const P = (name) => (cap && cap.Plugins ? cap.Plugins[name] : null);

  const toast = (msg) => (typeof window.showToast === 'function' ? window.showToast(msg) : console.log(msg));

  // ---------- Rationale dialog (shown BEFORE the OS permission prompt) ----------
  function showRationale(title, message) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px';
      overlay.innerHTML =
        '<div style="background:var(--surface,#151b34);color:var(--text,#f2f4ff);border:1px solid var(--border,#2a3252);border-radius:14px;max-width:340px;width:100%;padding:20px;box-shadow:0 12px 40px rgba(0,0,0,0.4)">' +
          '<div style="font-size:16px;font-weight:700;margin-bottom:8px">' + title + '</div>' +
          '<div style="font-size:13.5px;line-height:1.55;opacity:0.85;margin-bottom:18px">' + message + '</div>' +
          '<div style="display:flex;gap:10px;justify-content:flex-end">' +
            '<button data-act="no" style="padding:9px 16px;border-radius:8px;border:1px solid var(--border,#2a3252);background:transparent;color:inherit;font-size:13.5px;font-weight:600;cursor:pointer">Not now</button>' +
            '<button data-act="yes" style="padding:9px 16px;border-radius:8px;border:none;background:var(--primary,#0066FF);color:#fff;font-size:13.5px;font-weight:600;cursor:pointer">Continue</button>' +
          '</div>' +
        '</div>';
      overlay.addEventListener('click', (e) => {
        const act = e.target && e.target.dataset ? e.target.dataset.act : null;
        if (act) { overlay.remove(); resolve(act === 'yes'); }
      });
      document.body.appendChild(overlay);
    });
  }

  // ---------- Geolocation ----------
  // Same return shape as navigator.geolocation ({coords, timestamp}).
  async function getCurrentPosition(options) {
    const Geo = P('Geolocation');
    if (!isNative || !Geo) {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('GPS unavailable'));
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
      });
    }

    let perm = await Geo.checkPermissions().catch(() => null);
    if (!perm || perm.location !== 'granted') {
      const ok = await showRationale(
        'Location Access',
        'Hivu HR uses your location only to verify that you are inside the office GPS zone when you clock in or out. Your location is never tracked in the background.'
      );
      if (!ok) throw new Error('Location permission is needed for GPS clock-in');
      perm = await Geo.requestPermissions();
      if (perm.location !== 'granted') throw new Error('Location permission denied. Enable it in Settings > Apps > Hivu HR.');
    }
    return Geo.getCurrentPosition(options);
  }

  // ---------- Camera (profile photo only — capture & upload, no ML/face processing) ----------
  // Returns a dataUrl string, or null if unavailable/cancelled.
  async function pickProfilePhoto() {
    const Camera = P('Camera');
    if (!isNative || !Camera) return null;

    let perm = await Camera.checkPermissions().catch(() => null);
    const needsAsk = !perm || perm.camera !== 'granted' || perm.photos !== 'granted';
    if (needsAsk) {
      const ok = await showRationale(
        'Camera & Photos',
        'Hivu HR needs camera and photo access only so you can take or choose a profile picture. Photos are used for nothing else.'
      );
      if (!ok) return null;
      await Camera.requestPermissions({ permissions: ['camera', 'photos'] }).catch(() => {});
    }

    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        width: 800,
        height: 800,
        correctOrientation: true,
        resultType: 'dataUrl',
        source: 'PROMPT',
        promptLabelHeader: 'Profile Photo',
        promptLabelPicture: 'Take Photo',
        promptLabelPhoto: 'Choose from Gallery',
        promptLabelCancel: 'Cancel'
      });
      return photo && photo.dataUrl ? photo.dataUrl : null;
    } catch (err) {
      // User cancelling the picker is not an error
      if (err && /cancel/i.test(err.message || '')) return null;
      throw err;
    }
  }

  // ---------- Push notifications (server-triggered: leave approval, payslip ready) ----------
  async function initPushNotifications(onToken) {
    const Push = P('PushNotifications');
    if (!isNative || !Push) return;

    try {
      let perm = await Push.checkPermissions();
      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
        const ok = await showRationale(
          'Notifications',
          'Allow notifications so Hivu HR can alert you when your leave is approved, a payslip is ready, or HR sends an announcement.'
        );
        if (!ok) return;
        perm = await Push.requestPermissions();
      }
      if (perm.receive !== 'granted') return;

      await Push.addListener('registration', (token) => {
        if (onToken) onToken(token.value);
      });
      await Push.addListener('registrationError', (err) => {
        console.warn('Push registration error (Firebase not configured yet?):', err);
      });
      await Push.addListener('pushNotificationReceived', (n) => {
        if (n && n.title) toast(n.title + (n.body ? ' — ' + n.body : ''));
      });
      await Push.register();
    } catch (err) {
      console.warn('Push init failed:', err);
    }
  }

  // ---------- Local notifications (clock-out reminder) ----------
  const CLOCKOUT_REMINDER_ID = 4242;

  async function scheduleClockOutReminder(hoursFromNow) {
    const LN = P('LocalNotifications');
    if (!isNative || !LN) return;
    try {
      let perm = await LN.checkPermissions();
      if (perm.display !== 'granted') perm = await LN.requestPermissions();
      if (perm.display !== 'granted') return;
      await LN.schedule({
        notifications: [{
          id: CLOCKOUT_REMINDER_ID,
          title: 'Clock-out reminder',
          body: "You've been clocked in for " + hoursFromNow + " hours. Don't forget to clock out.",
          schedule: { at: new Date(Date.now() + hoursFromNow * 3600 * 1000) }
        }]
      });
    } catch (err) {
      console.warn('Could not schedule clock-out reminder:', err);
    }
  }

  async function cancelClockOutReminder() {
    const LN = P('LocalNotifications');
    if (!isNative || !LN) return;
    try {
      await LN.cancel({ notifications: [{ id: CLOCKOUT_REMINDER_ID }] });
    } catch (err) { /* nothing scheduled — fine */ }
  }

  // ---------- Native Google Sign-In (in-app account picker, no browser) ----------
  // Web client ID from Google Cloud project "hivu-archive" (OAuth consent: "Hivu HR")
  var GOOGLE_WEB_CLIENT_ID = '104226071218-mr3qh55rk3ki7t99feb469ngq0nv4bh7.apps.googleusercontent.com';
  var socialLoginReady = false;

  // Returns a Google ID token, or null if unavailable/cancelled.
  async function googleNativeSignIn() {
    const SL = P('SocialLogin');
    if (!isNative || !SL) return null;
    if (!socialLoginReady) {
      await SL.initialize({ google: { webClientId: GOOGLE_WEB_CLIENT_ID } });
      socialLoginReady = true;
    }
    try {
      const res = await SL.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
      return (res && res.result && res.result.idToken) || null;
    } catch (err) {
      if (err && /cancel/i.test(err.message || '')) return null;
      throw err;
    }
  }

  // ---------- Android back button ----------
  function initBackButton() {
    const App = P('App');
    if (!isNative || !App) return;
    App.addListener('backButton', () => {
      // 1. Close any open modal/panel first
      const openOverlay = document.querySelector('.modal-overlay.open, #gps-modal-overlay.open, #regularization-modal.open, .notif-panel.open');
      if (openOverlay) {
        openOverlay.classList.remove('open');
        const clockBtn = document.getElementById('clock-btn');
        if (clockBtn) clockBtn.disabled = false;
        return;
      }
      // 2. If not on Home page, go back to Home
      if (window.STATE && STATE.currentPage && STATE.currentPage !== 'home' && typeof window.goTo === 'function') {
        goTo('home');
        return;
      }
      // 3. On Home — minimize instead of killing the app
      App.minimizeApp();
    });
  }

  window.CapNative = {
    isNative: isNative,
    googleNativeSignIn: googleNativeSignIn,
    getCurrentPosition: getCurrentPosition,
    pickProfilePhoto: pickProfilePhoto,
    initPushNotifications: initPushNotifications,
    scheduleClockOutReminder: scheduleClockOutReminder,
    cancelClockOutReminder: cancelClockOutReminder,
    initBackButton: initBackButton
  };
})();
