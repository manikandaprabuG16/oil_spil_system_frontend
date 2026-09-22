/**
 * Maritime Defense Command - Dashboard Session Guard
 * Runs on the homepage (index.html):
 * - Verifies active 30-minute session; if missing/expired, redirects to /login.html
 * - Updates real-time header countdown HUD (30:00 -> 00:00)
 * - Auto-locks and redirects to /login.html?reason=locked upon 30-min shift limit or inactivity
 * - Handles manual Lock and Logout actions
 */

(function () {
  const STORAGE_TOKEN_KEY = 'icg_session_token';
  const STORAGE_OPERATOR_KEY = 'icg_operator_id';
  const STORAGE_EXPIRES_KEY = 'icg_session_expires_at';
  const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes

  // Check if session exists in sessionStorage or localStorage
  let token = sessionStorage.getItem(STORAGE_TOKEN_KEY) || localStorage.getItem(STORAGE_TOKEN_KEY);
  let operatorId = sessionStorage.getItem(STORAGE_OPERATOR_KEY) || localStorage.getItem(STORAGE_OPERATOR_KEY) || 'ICG-COMMAND-01';
  let expiresAt = parseInt(sessionStorage.getItem(STORAGE_EXPIRES_KEY) || localStorage.getItem(STORAGE_EXPIRES_KEY) || '0', 10);

  // If no session or already expired -> redirect to separate login page immediately!
  const now = Date.now();
  if (!token || !expiresAt || now >= expiresAt) {
    clearSession();
    window.location.replace('/login.html' + (expiresAt && now >= expiresAt ? '?reason=expired' : ''));
    return;
  }

  // Sync to sessionStorage
  sessionStorage.setItem(STORAGE_TOKEN_KEY, token);
  sessionStorage.setItem(STORAGE_OPERATOR_KEY, operatorId);
  sessionStorage.setItem(STORAGE_EXPIRES_KEY, expiresAt.toString());

  let lastActivityTime = Date.now();
  let tickerInterval = null;

  function clearSession() {
    sessionStorage.removeItem(STORAGE_TOKEN_KEY);
    sessionStorage.removeItem(STORAGE_OPERATOR_KEY);
    sessionStorage.removeItem(STORAGE_EXPIRES_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_OPERATOR_KEY);
    localStorage.removeItem(STORAGE_EXPIRES_KEY);
  }

  function handleLock(reason = 'locked') {
    if (tickerInterval) clearInterval(tickerInterval);
    // Tell backend session is locked
    if (token) {
      fetch('/api/auth/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token })
      }).catch(() => {});
    }
    window.location.href = `/login.html?reason=${reason}`;
  }

  function handleLogout() {
    if (tickerInterval) clearInterval(tickerInterval);
    if (token) {
      fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    }
    clearSession();
    window.location.href = '/login.html?reason=logged_out';
  }

  // Activity detection
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach((evt) => {
    window.addEventListener(evt, () => {
      lastActivityTime = Date.now();
    }, { passive: true });
  });

  // DOM elements setup on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    const timerText = document.getElementById('session-countdown-text');
    const timerPill = document.getElementById('session-countdown-pill');
    const operatorBadge = document.querySelector('.operator-badge-id');
    const btnLock = document.getElementById('btn-header-lock');
    const btnLogout = document.getElementById('btn-header-logout');

    if (operatorBadge) {
      operatorBadge.textContent = operatorId;
    }

    if (btnLock) {
      btnLock.addEventListener('click', () => handleLock('locked'));
    }

    if (btnLogout) {
      btnLogout.addEventListener('click', handleLogout);
    }

    function tick() {
      const curNow = Date.now();
      const remainingMs = expiresAt - curNow;

      // 30-min shift limit reached
      if (remainingMs <= 0) {
        handleLock('locked');
        return;
      }

      // 30-min inactivity limit reached
      if (curNow - lastActivityTime >= SESSION_DURATION_MS) {
        handleLock('locked');
        return;
      }

      const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      if (timerText) {
        timerText.textContent = formatted;
      }

      if (timerPill) {
        if (totalSeconds < 120) {
          timerPill.className = 'session-timer-pill critical';
        } else if (totalSeconds < 300) {
          timerPill.className = 'session-timer-pill warning';
        } else {
          timerPill.className = 'session-timer-pill normal';
        }
      }
    }

    tickerInterval = setInterval(tick, 1000);
    tick();
  });

  window.maritimeAuth = {
    lock: handleLock,
    logout: handleLogout
  };
})();
