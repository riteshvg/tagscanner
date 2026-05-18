(function () {
  'use strict';

  var STORAGE_KEY = 'envOverride';

  var prodUrl         = '';
  var currentOverride = null;

  var overrideUrl      = document.getElementById('overrideUrl');
  var enableBtn        = document.getElementById('enableBtn');
  var changeBtn        = document.getElementById('changeBtn');
  var activeBanner     = document.getElementById('activeBanner');
  var activeBannerUrl  = document.getElementById('activeBannerUrl');
  var reloadStatus     = document.getElementById('reloadStatus');
  var urlValidationMsg = document.getElementById('urlValidationMsg');
  var urlValidationTxt = document.getElementById('urlValidationText');

  function validateOverrideUrl(url) {
    if (!url) return null; // empty — no message, just keep button disabled
    if (/\basync\b/i.test(url))
      return 'Remove the "async" keyword — paste only the URL, not the full script tag.';
    if (/<|>|"/.test(url))
      return 'Looks like a script tag was pasted. Paste only the URL (starting with https://).';
    if (!/^https:\/\//i.test(url))
      return 'URL must start with https://';
    if (!/\.min\.js$/.test(url))
      return 'URL must end with .min.js — remove any extra characters after it.';
    return null; // valid
  }

  function showUrlValidation(msg) {
    if (msg) {
      urlValidationTxt.textContent = msg;
      urlValidationMsg.style.display = '';
    } else {
      urlValidationMsg.style.display = 'none';
    }
  }

  // ── UI state ───────────────────────────────────────────────────────────

  function renderState() {
    if (currentOverride && currentOverride.enabled) {
      activeBanner.style.display = '';
      activeBannerUrl.textContent = '→ ' + (currentOverride.overrideUrl || '');
      if (currentOverride.overrideUrl) overrideUrl.value = currentOverride.overrideUrl;
      enableBtn.innerHTML = '<i class="fas fa-toggle-on"></i> Disable Override';
      enableBtn.className = 'btn-toggle state-disable';
      changeBtn.style.display = '';
    } else {
      activeBanner.style.display = 'none';
      enableBtn.innerHTML = '<i class="fas fa-toggle-off"></i> Enable Override';
      enableBtn.className = 'btn-toggle state-enable';
      changeBtn.style.display = 'none';
    }
    // Enable button only when there is a valid URL in the input (or override is already active)
    var _val = overrideUrl.value.trim();
    enableBtn.disabled = !(currentOverride && currentOverride.enabled) && (!_val || !!validateOverrideUrl(_val));
    reloadStatus.style.display = 'none';
  }

  // ── Init ───────────────────────────────────────────────────────────────

  chrome.storage.local.get(['launch_script_url', STORAGE_KEY], function (data) {
    prodUrl = data.launch_script_url || '';
    currentOverride = data[STORAGE_KEY] || null;
    renderState();
    var _tsA = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
    if (_tsA) _tsA.page('TagScanner:Env Override', { events: 'event12' });
  });

  // ── Reload sequence ────────────────────────────────────────────────────
  // 1. Reload the target website tab (picks up the redirected/cleared script)
  // 2. Count down while the page + Tags initialises
  // 3. Tell popup.html (the parent frame) to reload itself via postMessage
  //    — more reliable than window.top.location.reload() across frames

  function reloadSequence() {
    enableBtn.disabled = true;
    reloadStatus.style.display = 'flex';
    reloadStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i>&nbsp; Reloading website…';

    chrome.storage.local.get('launch_tab_id', function (data) {
      var tabId = data.launch_tab_id;

      function doExtensionReload() {
        reloadStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i>&nbsp; Reloading TagScanner…';
        // postMessage to popup.html (the direct parent frame) — it listens for this
        // and calls window.location.reload() on the top-level popup window.
        setTimeout(function () {
          window.parent.postMessage({ type: 'TAGSCANNER_RELOAD' }, 'chrome-extension://' + chrome.runtime.id);
        }, 500);
      }

      if (!tabId) {
        doExtensionReload();
        return;
      }

      chrome.tabs.reload(tabId);

      var secs = 6;
      reloadStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i>&nbsp; Waiting for page to load… (' + secs + 's)';

      var ticker = setInterval(function () {
        secs--;
        if (secs <= 0) {
          clearInterval(ticker);
          doExtensionReload();
        } else {
          reloadStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i>&nbsp; Waiting for page to load… (' + secs + 's)';
        }
      }, 1000);
    });
  }

  // ── Events ─────────────────────────────────────────────────────────────

  overrideUrl.addEventListener('input', function () {
    if (currentOverride && currentOverride.enabled) return;
    var val = overrideUrl.value.trim();
    var err = validateOverrideUrl(val);
    showUrlValidation(err);
    enableBtn.disabled = !val || !!err;
  });

  // Change: reset the form so the user can enter a new environment URL.
  // The existing rule stays active until they click Enable with the new URL,
  // at which point SET_ENV_OVERRIDE replaces it atomically.
  changeBtn.addEventListener('click', function () {
    currentOverride = null; // local reset only — storage + rule untouched
    overrideUrl.value = '';
    showUrlValidation(null);
    activeBanner.style.display = 'none';
    changeBtn.style.display = 'none';
    enableBtn.innerHTML = '<i class="fas fa-toggle-off"></i> Enable Override';
    enableBtn.className = 'btn-toggle state-enable';
    enableBtn.disabled = true;
    overrideUrl.focus();
  });

  enableBtn.addEventListener('click', function () {
    enableBtn.disabled = true;

    // ── Disable ──────────────────────────────────────────────────────────
    if (currentOverride && currentOverride.enabled) {
      chrome.runtime.sendMessage({ type: 'CLEAR_ENV_OVERRIDE' }, function () {
        if (chrome.runtime.lastError) { console.warn(chrome.runtime.lastError); }
        var tsA = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
        if (tsA) tsA.track('Env Override:Disabled', { pageName: 'TagScanner:Env Override', events: 'event7', v5: 'Env Override', c2: 'Env Override' });
        currentOverride = null;
        reloadSequence();
      });
      return;
    }

    // ── Enable ───────────────────────────────────────────────────────────
    if (!prodUrl) {
      alert('No Tags script detected. Navigate to a page with Adobe Tags and re-open TagScanner first.');
      enableBtn.disabled = false;
      return;
    }

    var targetUrl = overrideUrl.value.trim();
    if (!targetUrl) {
      alert('Please paste the override script URL.');
      enableBtn.disabled = false;
      return;
    }
    if (!targetUrl.includes('assets.adobedtm.com') && !targetUrl.startsWith('https://')) {
      alert('Please enter a valid https:// URL.');
      enableBtn.disabled = false;
      return;
    }
    if (targetUrl === prodUrl) {
      alert('The override URL is identical to the production URL. Enter a different environment\'s URL.');
      enableBtn.disabled = false;
      return;
    }

    chrome.runtime.sendMessage({
      type:        'SET_ENV_OVERRIDE',
      prodUrl:     prodUrl,
      overrideUrl: targetUrl
    }, function (resp) {
      if (chrome.runtime.lastError) {
        alert('Override error: ' + chrome.runtime.lastError.message);
        enableBtn.disabled = false;
        return;
      }
      if (resp && resp.success) {
        chrome.storage.local.set({
          envOverride: { enabled: true, prodUrl: prodUrl, overrideUrl: targetUrl }
        });
        currentOverride = { enabled: true, prodUrl: prodUrl, overrideUrl: targetUrl };
        var tsA = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
        if (tsA) tsA.track('Env Override:Enabled', { pageName: 'TagScanner:Env Override', events: 'event6', v5: 'Env Override', c2: 'Env Override' });
        reloadSequence();
      } else {
        alert('Failed to set override: ' + ((resp && resp.error) || 'no response from service worker'));
        enableBtn.disabled = false;
      }
    });
  });
})();
