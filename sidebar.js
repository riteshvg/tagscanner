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
      if (!raw) { infoEl.style.cssText = 'display:none!important'; if (dividerEl) dividerEl.style.cssText = 'display:none!important'; return; }
      var s = JSON.parse(raw);
      if (!s || !s.sessionToken) { infoEl.style.cssText = 'display:none!important'; if (dividerEl) dividerEl.style.cssText = 'display:none!important'; return; }

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
      infoEl.style.cssText = 'display:none!important';
      if (dividerEl) dividerEl.style.cssText = 'display:none!important';
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

  // ── Share & Invite ───────────────────────────────────────────────────────

  var CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/tagscanner/mhejdbndckkddicchjjbaehfbmjjlmjn';

  var shareBtn   = document.getElementById('share-button-sidebar');
  var sharePanel = document.getElementById('share-panel');
  var copyBtn    = document.getElementById('share-copy-btn');
  var copyLabel  = document.getElementById('share-copy-label');
  var emailBtn   = document.getElementById('share-email-btn');

  if (shareBtn && sharePanel) {
    shareBtn.addEventListener('click', function () {
      var isOpen = sharePanel.style.display !== 'none';
      sharePanel.style.display = isOpen ? 'none' : 'block';
      shareBtn.style.background = isOpen ? '' : 'rgba(255,255,255,0.1)';
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('mouseenter', function () { copyBtn.style.background = 'rgba(255,255,255,0.08)'; });
    copyBtn.addEventListener('mouseleave', function () { copyBtn.style.background = 'transparent'; });
    copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(CHROME_STORE_URL).then(function () {
        copyLabel.textContent = 'Link copied!';
        copyBtn.style.borderColor = '#34d399';
        copyBtn.querySelector('i').style.color = '#34d399';
        setTimeout(function () {
          copyLabel.textContent = 'Copy Chrome Store link';
          copyBtn.style.borderColor = 'rgba(255,255,255,0.15)';
          copyBtn.querySelector('i').style.color = '#9ca3af';
        }, 2000);
      });
      if (window.TagScannerAnalytics) {
        TagScannerAnalytics.track('Share:Copy Link', { pageName: 'TagScanner:Sidebar', c2: 'Sidebar' });
      }
    });
  }

  var emailPicker  = document.getElementById('share-email-picker');
  var emailChevron = document.getElementById('share-email-chevron');

  function buildEmailLinks(client) {
    var subject = 'Free Chrome extension for Adobe Tags — worth installing';
    var body =
      'Hey,\n\n' +
      'Quick share — I\'ve been using TagScanner to inspect Adobe Tags (Launch) properties. ' +
      'It gives you a full breakdown of every rule, data element, and extension in seconds — ' +
      'no API keys or login needed.\n\n' +
      'It also has AI-powered health scans, plain-English explanations of custom code, ' +
      'and lets you export everything to Excel in one click.\n\n' +
      'Install it here (free): ' + CHROME_STORE_URL + '\n\n' +
      'Takes 30 seconds to set up. Would be super useful for Adobe Tags work.\n\nCheers';

    var s = encodeURIComponent(subject);
    var b = encodeURIComponent(body);

    switch (client) {
      case 'outlook365':
        return 'https://outlook.office.com/mail/deeplink/compose?subject=' + s + '&body=' + b;
      case 'outlooklive':
        return 'https://outlook.live.com/mail/deeplink/compose?subject=' + s + '&body=' + b;
      case 'gmail':
        return 'https://mail.google.com/mail/?view=cm&fs=1&su=' + s + '&body=' + b;
      default:
        return 'mailto:?subject=' + s + '&body=' + b;
    }
  }

  if (emailBtn && emailPicker) {
    emailBtn.addEventListener('mouseenter', function () { emailBtn.style.background = 'rgba(255,255,255,0.08)'; });
    emailBtn.addEventListener('mouseleave', function () { emailBtn.style.background = 'transparent'; });
    emailBtn.addEventListener('click', function () {
      var isOpen = emailPicker.style.display !== 'none';
      emailPicker.style.display = isOpen ? 'none' : 'block';
      if (emailChevron) emailChevron.style.transform = isOpen ? '' : 'rotate(180deg)';
      emailBtn.style.borderColor = isOpen ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.3)';
    });
  }

  document.querySelectorAll('.share-client-btn').forEach(function (btn) {
    btn.addEventListener('mouseenter', function () { btn.style.filter = 'brightness(1.3)'; });
    btn.addEventListener('mouseleave', function () { btn.style.filter = ''; });
    btn.addEventListener('click', function () {
      var client = btn.getAttribute('data-client');
      var url = buildEmailLinks(client);
      if (client === 'mailto') {
        window.location.href = url;
      } else {
        chrome.tabs.create({ url: url }, function (tab) {
          chrome.windows.update(tab.windowId, { focused: true });
        });
      }
      if (window.TagScannerAnalytics) {
        TagScannerAnalytics.track('Share:Invite Email', {
          pageName: 'TagScanner:Sidebar',
          c2: 'Sidebar',
          v9: 'Share:Invite:' + client
        });
      }
    });
  });

  // Navigation tracking
  var _navMap = [
    { id: 'home-menu-link',         section: 'Home' },
    { id: 'extension-menu-link',    section: 'Extensions' },
    { id: 'rule-menu-link',         section: 'Rules' },
    { id: 'dataelements-menu-link', section: 'Data Elements' },
    { id: 'flow-menu-link',         section: 'Flow' },
    { id: 'codesearch-menu-link',   section: 'Search' },
    { id: 'envoverride-menu-link',  section: 'Env Override' },
    { id: 'summary-menu-link',      section: 'Summary' },
    { id: 'chat-menu-link',         section: 'Ask AI' },
    { id: 'monitor-menu-link',      section: 'Monitor' },
    { id: 'feedback-menu-link',     section: 'Feedback' },
    { id: 'history-menu-link',      section: 'History' }
  ];
  _navMap.forEach(function (item) {
    var el = document.getElementById(item.id);
    if (el) {
      el.addEventListener('click', function () {
        if (window.TagScannerAnalytics) {
          TagScannerAnalytics.page('TagScanner:' + item.section, {
            events: 'event11,event12',
            v5:     item.section,
            c2:     item.section
          });
          TagScannerAnalytics.suppressNextPageView('TagScanner:' + item.section);
        }
      });
    }
  });

  if (authBtn) {
    authBtn.addEventListener('click', async function () {
      if (isSignedIn()) {
        // Sign out
        if (window.TagScannerAnalytics) {
          TagScannerAnalytics.track('Auth:Sign Out', {
            pageName: 'TagScanner:Sidebar',
            events:   'event10',
            c2:       'Sidebar'
          });
        }
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
          if (window.TagScannerAnalytics) {
            TagScannerAnalytics.track('Auth:Sign In', {
              pageName: 'TagScanner:Sidebar',
              events:   'event9',
              c2:       'Sidebar'
            });
          }
          showPostSignInBanner();
        } catch (err) {
          authBtn.innerHTML = '<i class="px-1 fas fa-exclamation-circle"></i><span>Failed</span>';
          setTimeout(function () { setAuthButtonState(false); }, 2000);
        }
      }
    });
  }
});
