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

chrome.action.onClicked.addListener(() => {
  let url = chrome.runtime.getURL('popup.html');
  let cleanUrl = url.split('#')[0];

  chrome.windows.create({
    url: cleanUrl,
    type: 'popup',
    width: 1500,
    height: 890,
    focused: true,
  });
});

// ── Environment Override ───────────────────────────────────────────────────

var ENV_OVERRIDE_RULE_ID = 1001;

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type === 'SET_ENV_OVERRIDE') {
    var prodUrl    = message.prodUrl;
    var overrideUrl = message.overrideUrl;

    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [ENV_OVERRIDE_RULE_ID],
      addRules: [{
        id:       ENV_OVERRIDE_RULE_ID,
        priority: 100,
        action:   { type: 'redirect', redirect: { url: overrideUrl } },
        condition: {
          urlFilter:     '|' + prodUrl + '|',
          resourceTypes: ['script']
        }
      }]
    }, function () {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      chrome.action.setBadgeText({ text: 'OVR' });
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
      chrome.storage.local.set({
        envOverride: { enabled: true, prodUrl: prodUrl, overrideUrl: overrideUrl }
      });
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'CLEAR_ENV_OVERRIDE') {
    chrome.declarativeNetRequest.updateDynamicRules(
      { removeRuleIds: [ENV_OVERRIDE_RULE_ID] },
      function () {
        chrome.action.setBadgeText({ text: '' });
        chrome.storage.local.remove('envOverride');
        sendResponse({ success: true });
      }
    );
    return true;
  }
});

// Restore badge on browser startup if an override was active
chrome.runtime.onStartup.addListener(function () {
  chrome.storage.local.get('envOverride', function (data) {
    if (data.envOverride && data.envOverride.enabled) {
      chrome.action.setBadgeText({ text: 'OVR' });
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    }
  });
});
