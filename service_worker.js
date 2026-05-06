// chrome.action.onClicked.addListener(function(tab){
//     chrome.tabs.create({
//         url: chrome.runtime.getURL('popup.html')+"?page_url="+tab.url,
//         active: false
//     }, function(tab) {
//         // After the tab has been created, open a window to inject the tab
//         chrome.windows.create({
//             tabId: tab.id,
//             type: 'popup',
//             focused: true
//             // incognito, top, left, ...
//         });
//     });
// });

// // window.pageSat = {};

// // // Listening for data from content_script.js
// // chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
// //     window.pageSat = message.essential;

// // });

// service_worker.js

chrome.action.onClicked.addListener(async (tab) => {
  const popupUrl = chrome.runtime.getURL('popup.html');

  // Look up the stored window ID — more reliable than scanning all windows.
  const stored = await chrome.storage.local.get('tagscanner_window_id');
  if (stored.tagscanner_window_id) {
    try {
      // Verify the window still exists (throws if it was closed).
      await chrome.windows.get(stored.tagscanner_window_id);

      // Restore if minimized, then focus via the Chrome API.
      await chrome.windows.update(stored.tagscanner_window_id, { state: 'normal', focused: true });

      // Also tell the popup page to call window.focus() on itself —
      // self-focus from within the page context works where external API calls don't.
      chrome.runtime.sendMessage({ type: 'BRING_TO_FRONT' }).catch(() => {});

      // Brief badge pulse — only if OVR badge isn't already showing.
      const data = await chrome.storage.local.get('envOverride');
      if (!data.envOverride || !data.envOverride.enabled) {
        chrome.action.setBadgeText({ text: '↑' });
        chrome.action.setBadgeBackgroundColor({ color: '#4e73df' });
        setTimeout(() => chrome.action.setBadgeText({ text: '' }), 1500);
      }
      return;
    } catch (e) {
      // Window no longer exists — clear stale ID and fall through to open a new one.
      await chrome.storage.local.remove('tagscanner_window_id');
    }
  }

  // No existing popup — safe to write the tab ID and open a new window.
  if (tab && tab.id) {
    await chrome.storage.local.set({ launch_tab_id: tab.id });
  }

  const newWin = await chrome.windows.create({
    url: popupUrl.split('#')[0],
    type: 'popup',
    width: 1500,
    height: 890,
    focused: true,
  });

  // Store the window ID so we can reliably find it on the next icon click.
  await chrome.storage.local.set({ tagscanner_window_id: newWin.id });
});

// Clear stored window ID when the TagScanner popup is closed.
chrome.windows.onRemoved.addListener(async (windowId) => {
  const data = await chrome.storage.local.get('tagscanner_window_id');
  if (data.tagscanner_window_id === windowId) {
    chrome.storage.local.remove('tagscanner_window_id');
  }
});

// ── Environment Override ───────────────────────────────────────────────────

var ENV_OVERRIDE_RULE_ID = 1001;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type === 'SET_ENV_OVERRIDE') {
    var prodUrl     = message.prodUrl;
    var overrideUrl = message.overrideUrl;

    // Use Promise API — callback form swallows errors in MV3 service workers.
    // Use regexFilter with escaped URL for reliable exact-URL matching.
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [ENV_OVERRIDE_RULE_ID],
      addRules: [{
        id:       ENV_OVERRIDE_RULE_ID,
        priority: 100,
        action:   { type: 'redirect', redirect: { url: overrideUrl } },
        condition: {
          regexFilter:   '^' + escapeRegex(prodUrl) + '$',
          resourceTypes: ['script']
        }
      }]
    }).then(function () {
      chrome.action.setBadgeText({ text: 'OVR' });
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
      chrome.storage.local.set({
        envOverride: { enabled: true, prodUrl: prodUrl, overrideUrl: overrideUrl }
      });
      sendResponse({ success: true });
    }).catch(function (err) {
      console.error('TagScanner env override error:', err);
      sendResponse({ success: false, error: err.message || String(err) });
    });
    return true;
  }

  if (message.type === 'CLEAR_ENV_OVERRIDE') {
    chrome.declarativeNetRequest.updateDynamicRules(
      { removeRuleIds: [ENV_OVERRIDE_RULE_ID] }
    ).then(function () {
      chrome.action.setBadgeText({ text: '' });
      chrome.storage.local.remove('envOverride');
      sendResponse({ success: true });
    }).catch(function (err) {
      console.error('TagScanner env override clear error:', err);
      sendResponse({ success: true }); // best-effort clear
    });
    return true;
  }
});

// Auto-disable env override on browser startup — declarativeNetRequest rules persist
// across restarts so without this the dev/staging redirect would silently remain active.
chrome.runtime.onStartup.addListener(function () {
  chrome.storage.local.get('envOverride', function (data) {
    if (data.envOverride && data.envOverride.enabled) {
      chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [ENV_OVERRIDE_RULE_ID] });
      chrome.storage.local.remove('envOverride');
      chrome.action.setBadgeText({ text: '' });
    }
  });
});
