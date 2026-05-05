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

  // ── Events ─────────────────────────────────────────────────────────────

  envSelect.addEventListener('change', updateUrlFields);

  enableBtn.addEventListener('click', function () {
    enableBtn.disabled = true;

    if (currentOverride && currentOverride.enabled) {
      // Disable
      chrome.runtime.sendMessage({ type: 'CLEAR_ENV_OVERRIDE' }, function () {
        currentOverride = null;
        renderState();
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
      if (resp && resp.success) {
        currentOverride = { enabled: true, prodUrl: prodUrl, overrideUrl: overrideUrl };
      } else {
        alert('Failed to set override: ' + ((resp && resp.error) || 'unknown error'));
      }
      renderState();
    });
  });
})();
