(function () {
  'use strict';

  var STORAGE_KEY = 'envOverride';

  var prodUrl         = '';
  var currentOverride = null;

  var prodUrlEl   = document.getElementById('prodUrlDisplay');
  var overrideUrl = document.getElementById('overrideUrl');
  var enableBtn       = document.getElementById('enableBtn');
  var changeBtn       = document.getElementById('changeBtn');
  var activeBanner    = document.getElementById('activeBanner');
  var activeBannerUrl = document.getElementById('activeBannerUrl');
  var reloadStatus    = document.getElementById('reloadStatus');

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
    // Enable button only when there is a URL in the input (or override is already active)
    enableBtn.disabled = !(currentOverride && currentOverride.enabled) && !overrideUrl.value.trim();
    reloadStatus.style.display = 'none';
  }

  // ── Init ───────────────────────────────────────────────────────────────

  chrome.storage.local.get(['launch_script_url', STORAGE_KEY], function (data) {
    prodUrl = data.launch_script_url || '';

    if (prodUrl) {
      prodUrlEl.textContent = prodUrl;
      prodUrlEl.classList.remove('empty');
    } else {
      prodUrlEl.textContent = 'No Tags script detected — open TagScanner on a page with Adobe Tags first.';
    }

    currentOverride = data[STORAGE_KEY] || null;
    renderState();
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
          window.parent.postMessage({ type: 'TAGSCANNER_RELOAD' }, '*');
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
    if (!(currentOverride && currentOverride.enabled)) {
      enableBtn.disabled = !overrideUrl.value.trim();
    }
  });

  // Change: reset the form so the user can enter a new environment URL.
  // The existing rule stays active until they click Enable with the new URL,
  // at which point SET_ENV_OVERRIDE replaces it atomically.
  changeBtn.addEventListener('click', function () {
    currentOverride = null; // local reset only — storage + rule untouched
    overrideUrl.value = '';
    activeBanner.style.display = 'none';
    changeBtn.style.display = 'none';
    enableBtn.innerHTML = '<i class="fas fa-toggle-off"></i> Enable Override';
    enableBtn.className = 'btn-toggle state-enable';
    enableBtn.disabled = false;
    overrideUrl.focus();
  });

  enableBtn.addEventListener('click', function () {
    enableBtn.disabled = true;

    // ── Disable ──────────────────────────────────────────────────────────
    if (currentOverride && currentOverride.enabled) {
      chrome.runtime.sendMessage({ type: 'CLEAR_ENV_OVERRIDE' }, function () {
        if (chrome.runtime.lastError) { console.warn(chrome.runtime.lastError); }
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
        reloadSequence();
      } else {
        alert('Failed to set override: ' + ((resp && resp.error) || 'no response from service worker'));
        enableBtn.disabled = false;
      }
    });
  });
})();
