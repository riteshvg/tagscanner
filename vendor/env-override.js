(function () {
  'use strict';

  var STORAGE_KEY = 'envOverride';

  var prodUrl         = '';
  var currentOverride = null;

  var prodUrlEl        = document.getElementById('prodUrlDisplay');
  var envSelect        = document.getElementById('envSelect');
  var overridePreview  = document.getElementById('overrideUrlPreview');
  var overrideCustom   = document.getElementById('overrideUrlCustom');
  var enableBtn        = document.getElementById('enableBtn');
  var activeBanner     = document.getElementById('activeBanner');
  var activeBannerUrl  = document.getElementById('activeBannerUrl');
  var reloadStatus     = document.getElementById('reloadStatus');

  // ── URL derivation ─────────────────────────────────────────────────────

  function stripEnvSuffix(url) {
    return url
      .replace(/-staging\.min\.js(\?.*)?$/, '.min.js')
      .replace(/-development\.min\.js(\?.*)?$/, '.min.js');
  }

  function deriveUrl(base, env) {
    if (!base) return '';
    var clean = stripEnvSuffix(base);
    if (env === 'staging')     return clean.replace(/\.min\.js$/, '-staging.min.js');
    if (env === 'development') return clean.replace(/\.min\.js$/, '-development.min.js');
    return clean;
  }

  function getOverrideUrl() {
    if (envSelect.value === 'custom') return overrideCustom.value.trim();
    return deriveUrl(prodUrl, envSelect.value);
  }

  // ── UI helpers ─────────────────────────────────────────────────────────

  function updateUrlFields() {
    var env = envSelect.value;
    if (env === 'custom') {
      overridePreview.classList.add('hidden');
      overrideCustom.classList.remove('hidden');
    } else {
      overrideCustom.classList.add('hidden');
      var derived = deriveUrl(prodUrl, env);
      overridePreview.textContent = derived || '—';
      overridePreview.classList.remove('hidden');
    }
  }

  function renderState() {
    if (currentOverride && currentOverride.enabled) {
      activeBanner.style.display = '';
      activeBannerUrl.textContent = '→ ' + (currentOverride.overrideUrl || '');
      enableBtn.innerHTML = '<i class="fas fa-toggle-on"></i> Disable Override';
      enableBtn.className = 'btn-enable state-disable';
    } else {
      activeBanner.style.display = 'none';
      enableBtn.innerHTML = '<i class="fas fa-toggle-off"></i> Enable Override';
      enableBtn.className = 'btn-enable state-enable';
    }
    enableBtn.disabled = false;
  }

  // ── Init ───────────────────────────────────────────────────────────────

  // Load script URL and override state in parallel
  chrome.storage.local.get(['launch_script_url', STORAGE_KEY], function (data) {
    prodUrl = data.launch_script_url || '';

    if (prodUrl) {
      prodUrlEl.textContent = prodUrl;
      prodUrlEl.classList.remove('empty');
    } else {
      prodUrlEl.textContent = 'No Tags script detected — open TagScanner on a page with Adobe Tags first.';
      prodUrlEl.classList.add('empty');
    }

    currentOverride = data[STORAGE_KEY] || null;
    updateUrlFields();
    renderState();
  });

  // ── Reload sequence ────────────────────────────────────────────────────
  // 1. Reload the website tab so it picks up the overridden script
  // 2. Wait for it to load (countdown), then reload the extension popup
  // The popup's own 3-second scan delay means Tags will be initialised by the time
  // popup.js queries the content script.

  function reloadSequence() {
    enableBtn.disabled = true;
    reloadStatus.style.display = 'flex';

    chrome.storage.local.get('launch_tab_id', function (data) {
      var tabId = data.launch_tab_id;

      if (!tabId) {
        reloadStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i>&nbsp; Reloading TagScanner…';
        setTimeout(function () { window.top.location.reload(); }, 800);
        return;
      }

      reloadStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i>&nbsp; Reloading website…';
      chrome.tabs.reload(tabId);

      var secs = 5;
      reloadStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i>&nbsp; Waiting for page to load… (' + secs + 's)';

      var ticker = setInterval(function () {
        secs--;
        if (secs <= 0) {
          clearInterval(ticker);
          reloadStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i>&nbsp; Reloading TagScanner…';
          setTimeout(function () { window.top.location.reload(); }, 600);
        } else {
          reloadStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i>&nbsp; Waiting for page to load… (' + secs + 's)';
        }
      }, 1000);
    });
  }

  // ── Events ─────────────────────────────────────────────────────────────

  envSelect.addEventListener('change', updateUrlFields);

  enableBtn.addEventListener('click', function () {
    enableBtn.disabled = true;

    if (currentOverride && currentOverride.enabled) {
      // Disable — clear rule then reload so the extension re-scans the real prod script
      chrome.runtime.sendMessage({ type: 'CLEAR_ENV_OVERRIDE' }, function () {
        currentOverride = null;
        reloadSequence();
      });
      return;
    }

    // Enable
    if (!prodUrl) {
      alert('No Tags script detected. Navigate to a page with Adobe Tags and re-open TagScanner first.');
      enableBtn.disabled = false;
      return;
    }

    var overrideUrl = getOverrideUrl();
    if (!overrideUrl) {
      alert('Please enter a valid override URL.');
      enableBtn.disabled = false;
      return;
    }
    if (overrideUrl === prodUrl) {
      alert('The override URL is identical to the production URL. Select a different environment.');
      enableBtn.disabled = false;
      return;
    }

    chrome.runtime.sendMessage({
      type:        'SET_ENV_OVERRIDE',
      prodUrl:     prodUrl,
      overrideUrl: overrideUrl
    }, function (resp) {
      if (chrome.runtime.lastError) {
        alert('Override error: ' + chrome.runtime.lastError.message);
        enableBtn.disabled = false;
        return;
      }
      if (resp && resp.success) {
        currentOverride = { enabled: true, prodUrl: prodUrl, overrideUrl: overrideUrl };
        reloadSequence();
      } else {
        alert('Failed to set override: ' + ((resp && resp.error) || 'no response from service worker'));
        enableBtn.disabled = false;
      }
    });
  });
})();
