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

  // ── Public API ────────────────────────────────────────────────────────────

  global.TagScannerAuth = {
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    getSession: getSession,
    isSignedIn: isSignedIn,
    saveSession: saveSession,
  };
})(typeof window !== 'undefined' ? window : this);
