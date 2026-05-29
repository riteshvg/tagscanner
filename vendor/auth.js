/**
 * TagScanner Auth — Google OAuth + Session Management
 *
 * Setup (one-time):
 * 1. Go to https://console.cloud.google.com → APIs & Services → Credentials
 * 2. Create OAuth 2.0 Client ID → type: "Web application"
 * 3. Add Authorized redirect URI: https://<YOUR_EXTENSION_ID>.chromiumapp.org/
 *    (Find extension ID at chrome://extensions with Developer mode on)
 * 4. Copy the Client ID below
 * 5. For stable extension ID across reinstalls, add a "key" to manifest.json
 *    (generate with: openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt | openssl rsa -pubout | openssl base64)
 */

(function (global) {
  'use strict';

  // ── Replace with your Google OAuth Client ID ──────────────────────────────
  var GOOGLE_CLIENT_ID =
    '668026713538-k01pdeb0ijmqmiqqrqra65jme34jua3v.apps.googleusercontent.com';

  var TS_PROXY_URL =
    'https://ihn2pz2dbcktbxvn36g6pfptda0jfnri.lambda-url.us-east-1.on.aws/';
  var SESSION_KEY = 'tagscanner_session';

  // ── Session helpers ───────────────────────────────────────────────────────

  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (s.expiresAt && Date.now() > s.expiresAt) {
        clearSession();
        return null;
      }
      return s;
    } catch (e) {
      return null;
    }
  }

  function saveSession(session) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) {}
    // Keep legacy key in sync so dataelement.js / rule.js can read email
    try {
      localStorage.setItem(
        'tagscanner_user',
        JSON.stringify({ email: session.email, name: session.name }),
      );
    } catch (e) {}
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
    try {
      localStorage.removeItem('tagscanner_user');
    } catch (e) {}
  }

  function isSignedIn() {
    return getSession() !== null;
  }

  // ── Lambda call ───────────────────────────────────────────────────────────

  async function callLambda(body) {
    var res = await fetch(TS_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    var data = await res.json().catch(function () {
      return { error: 'Invalid response' };
    });
    if (!res.ok)
      throw new Error(data.error || 'Auth request failed (' + res.status + ')');
    return data;
  }

  // ── Google Sign-In via chrome.identity ───────────────────────────────────

  function signInWithGoogle() {
    return new Promise(function (resolve, reject) {
      if (typeof chrome === 'undefined' || !chrome.identity) {
        reject(new Error('Google Sign-In is not available in this context.'));
        return;
      }
      if (
        GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'
      ) {
        reject(
          new Error(
            'Google Client ID is not configured. See vendor/auth.js setup instructions.',
          ),
        );
        return;
      }

      var redirectUri = 'https://' + chrome.runtime.id + '.chromiumapp.org/';
      var authUrl =
        'https://accounts.google.com/o/oauth2/auth?' +
        [
          'client_id=' + encodeURIComponent(GOOGLE_CLIENT_ID),
          'redirect_uri=' + encodeURIComponent(redirectUri),
          'response_type=token',
          'scope=' + encodeURIComponent('email profile openid'),
          'prompt=select_account',
        ].join('&');

      chrome.identity.launchWebAuthFlow(
        { url: authUrl, interactive: true },
        async function (redirectUrl) {
          if (chrome.runtime.lastError) {
            reject(
              new Error(chrome.runtime.lastError.message || 'Sign-in failed'),
            );
            return;
          }
          if (!redirectUrl) {
            reject(new Error('Sign-in was cancelled'));
            return;
          }
          try {
            var hash = new URL(redirectUrl).hash.slice(1);
            var params = new URLSearchParams(hash);
            var accessToken = params.get('access_token');
            if (!accessToken)
              throw new Error('No access token received from Google');

            var data = await callLambda({
              type: 'auth',
              googleAccessToken: accessToken,
            });

            var session = {
              sessionToken: data.sessionToken,
              userId: data.userId,
              email: data.email,
              name: data.name,
              picture: data.picture,
              expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days client-side
            };
            saveSession(session);
            resolve(session);
          } catch (err) {
            reject(err);
          }
        },
      );
    });
  }

  function signOut() {
    clearSession();
  }

  // ── AI features consent popup (shown once, covers both Scan and Explain) ──

  var EXPLAIN_CONSENT_KEY = 'tagscanner_ai_consent_v2';

  function requireExplainConsent() {
    if (localStorage.getItem(EXPLAIN_CONSENT_KEY) === '1') {
      return Promise.resolve(true);
    }
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.id = 'ts-consent-overlay';
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;' +
        'justify-content:center;background:rgba(17,24,39,0.55);backdrop-filter:blur(2px);';

      overlay.innerHTML = [
        '<div style="background:#fff;border-radius:12px;padding:28px 28px 22px;',
        'max-width:420px;width:calc(100% - 48px);box-shadow:0 20px 60px rgba(0,0,0,0.25);',
        'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif">',

        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">',
        '<div style="width:36px;height:36px;border-radius:8px;background:#ede9fe;',
        'display:flex;align-items:center;justify-content:center;flex-shrink:0">',
        '<i class="fas fa-lightbulb" style="color:#7c3aed;font-size:15px"></i>',
        '</div>',
        '<div>',
        '<div style="font-size:15px;font-weight:700;color:#111827">How AI Analysis Works</div>',
        '<div style="font-size:11px;color:#6b7280;margin-top:1px">A quick note before your first AI Scan, Explain, or Ask AI</div>',
        '</div></div>',

        '<p style="margin:0 0 14px;font-size:13px;color:#374151;line-height:1.6">',
        'TagScanner uses <strong>AWS Bedrock</strong> (Amazon\'s managed AI service) to analyze your Tags property. ',
        'When you run a Scan, Explain, or Ask AI, your property data — rule names, data element names, custom code, and ',
        'extension details — is sent to an LLM (Claude) for analysis and the result is returned to you.',
        '</p>',

        '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;',
        'padding:12px 14px;margin-bottom:16px">',
        '<ul style="margin:0;padding:0 0 0 16px;font-size:12px;color:#4b5563;line-height:1.8">',
        '<li>Analysis is performed by AWS infrastructure — TagScanner does not store your property data on its own servers.</li>',
        '<li>Custom code in your rules and data elements is included in the analysis. Common secret patterns (API keys, tokens, passwords) are <strong>automatically redacted</strong> before sending — but ensure no sensitive credentials are hardcoded in your property.</li>',
        '<li>AI responses are a starting point — always review them before making changes to your property.</li>',
        '<li>This feature is in <strong>limited preview</strong> and a daily usage cap applies.</li>',
        '</ul></div>',

        '<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;margin-bottom:18px;user-select:none">',
        '<input type="checkbox" id="ts-consent-check" style="margin-top:2px;width:15px;height:15px;cursor:pointer;accent-color:#7c3aed;flex-shrink:0">',
        '<span style="font-size:12.5px;color:#374151;line-height:1.5">',
        'Got it — I\'m happy for my Tags property data to be analyzed by AWS Bedrock.',
        '</span></label>',

        '<div style="display:flex;gap:10px;justify-content:flex-end">',
        '<button id="ts-consent-cancel" style="padding:8px 18px;border:1px solid #d1d5db;',
        'border-radius:6px;background:#fff;font-size:13px;font-weight:500;color:#374151;cursor:pointer">Not now</button>',
        '<button id="ts-consent-accept" disabled style="padding:8px 18px;border:none;',
        'border-radius:6px;background:#7c3aed;font-size:13px;font-weight:500;color:#fff;',
        'cursor:not-allowed;opacity:0.5">Let\'s go</button>',
        '</div>',

        '</div>',
      ].join('');

      document.body.appendChild(overlay);

      var checkbox = overlay.querySelector('#ts-consent-check');
      var acceptBtn = overlay.querySelector('#ts-consent-accept');
      var cancelBtn = overlay.querySelector('#ts-consent-cancel');

      checkbox.addEventListener('change', function () {
        acceptBtn.disabled = !checkbox.checked;
        acceptBtn.style.opacity = checkbox.checked ? '1' : '0.5';
        acceptBtn.style.cursor = checkbox.checked ? 'pointer' : 'not-allowed';
      });

      function close(result) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(result);
      }

      acceptBtn.addEventListener('click', function () {
        try { localStorage.setItem(EXPLAIN_CONSENT_KEY, '1'); } catch (e) {}
        close(true);
      });

      cancelBtn.addEventListener('click', function () { close(false); });

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close(false);
      });
    });
  }

  // ── Shared sign-in box ────────────────────────────────────────────────────

  var _G_SVG = '<svg width="17" height="17" viewBox="0 0 48 48" style="flex-shrink:0">' +
    '<path fill="#4285F4" d="M47.53 24.56c0-1.6-.14-3.14-.4-4.62H24v8.73h13.2c-.57 3.03-2.3 5.59-4.9 7.32v6.08h7.93c4.64-4.28 7.3-10.58 7.3-17.51z"/>' +
    '<path fill="#34A853" d="M24 48c6.66 0 12.24-2.21 16.32-5.98l-7.93-6.08c-2.2 1.47-5.01 2.34-8.39 2.34-6.45 0-11.91-4.35-13.86-10.21H2.08v6.28C6.14 42.62 14.43 48 24 48z"/>' +
    '<path fill="#FBBC05" d="M10.14 28.07A14.42 14.42 0 0 1 9.6 24c0-1.41.24-2.78.54-4.07v-6.28H2.08A23.98 23.98 0 0 0 0 24c0 3.88.93 7.55 2.08 10.35l8.06-6.28z"/>' +
    '<path fill="#EA4335" d="M24 9.52c3.63 0 6.88 1.25 9.44 3.7l7.08-7.08C36.23 2.19 30.65 0 24 0 14.43 0 6.14 5.38 2.08 13.65l8.06 6.28C12.09 13.87 17.55 9.52 24 9.52z"/>' +
    '</svg>';

  function renderSignInBox(title, subtitle) {
    return (
      '<div style="padding:20px 16px;text-align:center;background:#f8f9fc;border-radius:10px;border:1px solid #e3e6f0;">' +
      '<div style="font-size:13.5px;font-weight:700;color:#1f2937;margin-bottom:6px;">' + (title || 'Sign in to continue') + '</div>' +
      '<div style="font-size:12px;color:#6b7280;margin-bottom:18px;line-height:1.55;">' + (subtitle || 'This AI feature requires a Google account.') + '</div>' +
      '<button class="ts-google-signin-btn" style="display:inline-flex;align-items:center;gap:9px;padding:9px 20px;background:#fff;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-weight:500;color:#374151;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.06);">' +
      _G_SVG + 'Continue with Google</button>' +
      '<div class="ts-google-signin-err" style="display:none;margin-top:9px;font-size:11.5px;color:#ef4444;padding:6px 10px;background:#fef2f2;border-radius:4px;"></div>' +
      '</div>'
    );
  }

  function attachSignInBox(container, onSuccess) {
    var btn = container.querySelector('.ts-google-signin-btn');
    var err = container.querySelector('.ts-google-signin-err');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:7px;font-size:12px;color:#9ca3af"></i>Signing in…';
      if (err) err.style.display = 'none';
      try {
        var session = await signInWithGoogle();
        if (onSuccess) onSuccess(session);
      } catch (e) {
        btn.disabled = false;
        btn.innerHTML = _G_SVG + 'Continue with Google';
        if (err) { err.textContent = e.message || 'Sign-in failed. Please try again.'; err.style.display = 'block'; }
      }
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  global.TagScannerAuth = {
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    getSession: getSession,
    isSignedIn: isSignedIn,
    saveSession: saveSession,
    requireExplainConsent: requireExplainConsent,
    renderSignInBox: renderSignInBox,
    attachSignInBox: attachSignInBox,
  };
})(typeof window !== 'undefined' ? window : this);
