document.addEventListener('DOMContentLoaded', function () {
  function sidebar() {
    const sidebar = document.getElementById('sidebar-click');
    if (sidebar.classList.contains('active')) {
      sidebar.classList.remove('active');
      document.getElementById('home-button-sidebar').innerHTML =
        '<i class="px-1 fas fa-home"></i><span>Home</span>';
      document.getElementById('ext-button-sidebar').innerHTML =
        '<i class="px-1 fas fa-plug"></i><span>Extensions</span>';
      document.getElementById('rule-button-sidebar').innerHTML =
        '<i class="px-1 fas fa-wrench"></i><span>Rules</span>';
      document.getElementById('de-button-sidebar').innerHTML =
        '<i class="px-1 fas fa-database"></i><span>Data Elements</span>';
      document.getElementById(
        'feedback-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-envelope"></i><span>Feedback</span>`;
      if (document.getElementById('advanced-button-sidebar')) {
        document.getElementById('advanced-button-sidebar').innerHTML =
          '<i class="px-1 fas fa-cog"></i><span>Advanced Mode</span>';
      }
      document.getElementById('code-button-sidebar').innerHTML =
        '<i class="px-1 fas fa-code"></i><span>Custom Code</span>';

      document.getElementById(
        'collapse-click'
      ).innerHTML = `<i id="collapse-click-right" class="fas fa-angle-right text-white"></i>`;
    } else {
      sidebar.classList.add('active');
      document.getElementById(
        'home-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-home"></i><span>Home</span>`;
      document.getElementById(
        'ext-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-plug"></i><span>Extensions</span>`;
      document.getElementById(
        'rule-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-wrench"></i><span>Rules</span>`;
      document.getElementById(
        'de-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-database"></i><span>Data Elements</span>`;
      document.getElementById(
        'code-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-code"></i><span>Custom Code</span>`;

      document.getElementById(
        'feedback-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-envelope"></i><span>Feedback</span>`;
      if (document.getElementById('advanced-button-sidebar')) {
        document.getElementById('advanced-button-sidebar').innerHTML =
          '<i class="px-1 fas fa-cog"></i><span>Advanced Mode</span>';
      }
      document.getElementById(
        'collapse-click'
      ).innerHTML = `<i id="collapse-click-left" class="fas fa-angle-left text-white"></i>`;
    }
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar-click');
    const icon = document.getElementById('sidebar-toggle-icon');
    const label = document.getElementById('sidebar-toggle-label');
    
    if (sidebar.classList.contains('active')) {
      sidebar.classList.remove('active');
      if (icon) icon.className = 'fas fa-angle-right';
      if (label) label.textContent = 'Expand';
    } else {
      sidebar.classList.add('active');
      if (icon) icon.className = 'fas fa-angle-left';
      if (label) label.textContent = 'Collapse';
    }
  }

  const btn = document.getElementById('sidebar-toggle-btn');
  if (btn) {
    btn.addEventListener('click', toggleSidebar);
  }

  var authBtn = document.getElementById('signout-button-sidebar');

  function isSignedIn() {
    try {
      var raw = localStorage.getItem('tagscanner_session');
      if (!raw) return false;
      var s = JSON.parse(raw);
      return !!(s && s.sessionToken);
    } catch (e) { return false; }
  }

  function setAuthButtonState(signedIn) {
    if (!authBtn) return;
    if (signedIn) {
      authBtn.innerHTML = '<i class="px-1 fas fa-sign-out-alt"></i><span>Sign Out</span>';
      authBtn.style.color = '#f87171';
      authBtn.title = 'Sign Out';
    } else {
      authBtn.innerHTML = '<i class="px-1 fas fa-sign-in-alt"></i><span>Sign In</span>';
      authBtn.style.color = '#86efac';
      authBtn.title = 'Sign In';
    }
    authBtn.disabled = false;
  }

  // ── Topbar user info ─────────────────────────────────────────────────────

  function renderTopbarUser() {
    var infoEl    = document.getElementById('topbar-user-info');
    var dividerEl = document.getElementById('topbar-user-divider');
    var avatarEl  = document.getElementById('topbar-user-avatar');
    var nameEl    = document.getElementById('topbar-user-name');
    if (!infoEl) return;

    try {
      var raw = localStorage.getItem('tagscanner_session');
      if (!raw) { infoEl.style.display = 'none'; if (dividerEl) dividerEl.style.display = 'none'; return; }
      var s = JSON.parse(raw);
      if (!s || !s.sessionToken) { infoEl.style.display = 'none'; if (dividerEl) dividerEl.style.display = 'none'; return; }

      if (nameEl)    nameEl.textContent = s.name || s.email || '';
      if (avatarEl) {
        if (s.picture) {
          avatarEl.src            = s.picture;
          avatarEl.style.display  = 'inline-block';
          avatarEl.onerror        = function () { avatarEl.style.display = 'none'; };
        } else {
          avatarEl.style.display = 'none';
        }
      }
      infoEl.style.cssText    = 'display:flex!important';
      if (dividerEl) dividerEl.style.cssText = 'display:block!important';
    } catch (e) {
      infoEl.style.display = 'none';
      if (dividerEl) dividerEl.style.display = 'none';
    }
  }

  // Set initial state
  setAuthButtonState(isSignedIn());
  renderTopbarUser();
  if (window._revealDashboardIfAdmin) window._revealDashboardIfAdmin();

  // Expose so iframes (e.g. chat.html) can notify the sidebar after signing in
  window.TagScannerSidebar = {
    refreshAuthState: function () {
      setAuthButtonState(isSignedIn());
      renderTopbarUser();
      if (window._revealDashboardIfAdmin) window._revealDashboardIfAdmin();
    }
  };

  // React to sign-in/out happening inside iframes (dashboard, etc.)
  window.addEventListener('storage', function (e) {
    if (e.key === 'tagscanner_session') {
      setAuthButtonState(isSignedIn());
      renderTopbarUser();
      if (window._revealDashboardIfAdmin) window._revealDashboardIfAdmin();
    }
  });

  function showPostSignInBanner() {
    var existing = document.getElementById('post-signin-banner');
    if (existing) existing.remove();

    var banner = document.createElement('div');
    banner.id = 'post-signin-banner';
    banner.style.cssText = [
      'position:fixed', 'bottom:20px', 'right:20px', 'z-index:9999',
      'background:#1e3a5f', 'color:#fff', 'border-radius:10px',
      'padding:14px 18px', 'max-width:300px', 'box-shadow:0 4px 20px rgba(0,0,0,0.25)',
      'font-size:12.5px', 'line-height:1.5',
    ].join(';');
    banner.innerHTML = [
      '<div style="display:flex;align-items:flex-start;gap:10px;">',
        '<i class="fas fa-check-circle" style="color:#34d399;font-size:18px;margin-top:2px;flex-shrink:0;"></i>',
        '<div>',
          '<div style="font-weight:700;margin-bottom:4px;">Signed in!</div>',
          '<div style="color:#d1d5db;">Run your first <strong style="color:#fff;">AI Health Scan</strong> via',
          ' <a href="vendor/summary.html" target="iframe2" id="post-signin-summary-link"',
          '   style="color:#61dafb;text-decoration:underline;cursor:pointer;">Summary</a>,',
          ' or explain custom code from <a href="vendor/rule.html" target="iframe2" id="post-signin-rules-link"',
          '   style="color:#61dafb;text-decoration:underline;cursor:pointer;">Rules</a>.',
          '</div>',
        '</div>',
        '<button id="post-signin-close" style="background:none;border:none;color:#9ca3af;font-size:16px;cursor:pointer;padding:0 0 0 6px;flex-shrink:0;">&times;</button>',
      '</div>',
    ].join('');

    document.body.appendChild(banner);

    function dismiss() { if (banner.parentNode) banner.parentNode.removeChild(banner); }
    document.getElementById('post-signin-close').addEventListener('click', dismiss);
    document.getElementById('post-signin-summary-link').addEventListener('click', dismiss);
    document.getElementById('post-signin-rules-link').addEventListener('click', dismiss);
    setTimeout(dismiss, 12000);
  }

  if (authBtn) {
    authBtn.addEventListener('click', async function () {
      if (isSignedIn()) {
        // Sign out
        try { localStorage.removeItem('tagscanner_session'); } catch (e) {}
        try { localStorage.removeItem('tagscanner_user'); } catch (e) {}
        renderTopbarUser();
        if (window._revealDashboardIfAdmin) window._revealDashboardIfAdmin();
        var iframe = document.getElementById('component-iframe');
        if (iframe) iframe.src = 'display.html';
        authBtn.innerHTML = '<i class="px-1 fas fa-check"></i><span>Signed out</span>';
        authBtn.disabled = true;
        setTimeout(function () { setAuthButtonState(false); }, 1500);
      } else {
        // Sign in
        if (!window.TagScannerAuth) return;
        authBtn.innerHTML = '<i class="px-1 fas fa-spinner fa-spin"></i><span>Signing in…</span>';
        authBtn.disabled = true;
        try {
          await window.TagScannerAuth.signInWithGoogle();
          setAuthButtonState(true);
          renderTopbarUser();
          if (window._revealDashboardIfAdmin) window._revealDashboardIfAdmin();
          showPostSignInBanner();
        } catch (err) {
          authBtn.innerHTML = '<i class="px-1 fas fa-exclamation-circle"></i><span>Failed</span>';
          setTimeout(function () { setAuthButtonState(false); }, 2000);
        }
      }
    });
  }
});
