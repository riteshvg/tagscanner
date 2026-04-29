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

  // ── Explain consent popup ─────────────────────────────────────────────────

  var EXPLAIN_CONSENT_KEY = 'tagscanner_explain_consent';

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
        '<div style="font-size:15px;font-weight:700;color:#111827">AI Code Explain — Limited Preview</div>',
        '<div style="font-size:11px;color:#6b7280;margin-top:1px">Powered by Amazon Bedrock · Claude</div>',
        '</div></div>',

        '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;',
        'padding:12px 14px;margin-bottom:16px">',
        '<div style="font-size:11px;font-weight:700;text-transform:uppercase;',
        'letter-spacing:0.5px;color:#92400e;margin-bottom:6px">Before you continue</div>',
        '<ul style="margin:0;padding:0 0 0 16px;font-size:12px;color:#78350f;line-height:1.7">',
        '<li>This feature is in <strong>limited preview</strong> — availability may change without notice.</li>',
        '<li>Requests are processed via the <strong>developer\'s personal API keys</strong>. A daily usage cap applies.</li>',
        '<li>AI responses are generated by a large language model and <strong>must be independently validated</strong> before acting on them.</li>',
        '<li>Do not rely on this feature for production decisions without human review.</li>',
        '</ul></div>',

        '<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;margin-bottom:18px;user-select:none">',
        '<input type="checkbox" id="ts-consent-check" style="margin-top:2px;width:15px;height:15px;cursor:pointer;accent-color:#7c3aed;flex-shrink:0">',
        '<span style="font-size:12.5px;color:#374151;line-height:1.5">',
        'I understand this is a preview feature, usage is limited, and I will validate AI responses before acting on them.',
        '</span></label>',

        '<div style="display:flex;gap:10px;justify-content:flex-end">',
        '<button id="ts-consent-cancel" style="padding:8px 18px;border:1px solid #d1d5db;',
        'border-radius:6px;background:#fff;font-size:13px;font-weight:500;color:#374151;cursor:pointer">Cancel</button>',
        '<button id="ts-consent-accept" disabled style="padding:8px 18px;border:none;',
        'border-radius:6px;background:#7c3aed;font-size:13px;font-weight:500;color:#fff;',
        'cursor:not-allowed;opacity:0.5">Enable Explain</button>',
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

  // ── Public API ────────────────────────────────────────────────────────────

  global.TagScannerAuth = {
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    getSession: getSession,
    isSignedIn: isSignedIn,
    saveSession: saveSession,
    requireExplainConsent: requireExplainConsent,
  };
})(typeof window !== 'undefined' ? window : this);
