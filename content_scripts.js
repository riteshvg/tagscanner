// Guard against duplicate injection when executeScript re-injects into an already-loaded page
if (window.__tagScannerContentScriptLoaded) {
  // Script already running — skip re-initialisation to avoid duplicate listeners
} else {
  window.__tagScannerContentScriptLoaded = true;
  initTagScanner();
}

function initTagScanner() {

let scriptURL;

function myMain(evt) {
  function injectScript(file_path, tag) {
    // Don't re-inject if pass_satellite.js is already in the DOM
    if (document.querySelector('script[src="' + file_path + '"]')) return;
    var node = document.getElementsByTagName(tag)[0];
    var script = document.createElement('script');
    script.setAttribute('type', 'text/javascript');
    script.setAttribute('src', file_path);
    node.appendChild(script);
  }

  injectScript(chrome.runtime.getURL('pass_satellite.js'), 'body');

  let a = [...document.querySelectorAll('script')];
  a = a.filter((scpt) => scpt.src && scpt.src.includes('assets.adobedtm.com'));
  if (a.length > 0) {
    scriptURL = a[0].src;
  }
}

// Run myMain immediately if page is already loaded (re-injection case), otherwise wait for load event
if (document.readyState === 'complete') {
  myMain();
} else {
  window.addEventListener('load', myMain, false);
}

//Listening for message from pass_satellite.js
let satellite = {};
// let satellite = null;

window.addEventListener(
  'message',
  function (event) {
    if (event.source !== window) return;

    if (event.data.type === 'FROM_PAGE') {
      satellite = event.data.essential?.satellite;
      if (event.data.essential?.dataElementsRawCount != null) {
        satellite._rawDECount = event.data.essential.dataElementsRawCount;
      }
    }
  },
  false
);

// Check every 500ms until `satellite` is not empty
const checkSatellite = setInterval(() => {
  if (satellite) {
    clearInterval(checkSatellite);
  }
}, 500);

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {

  try {
    if (
      request.greeting === 'hello' ||
      (request.data && request.data.greeting === 'hello')
    ) {
      // If message came through service worker, it might be wrapped in data property
      const actualRequest = request.data || request;

      // Re-scan the DOM for the Tags script URL at response time — on React/SPA
      // pages the script is injected dynamically and won't be in the DOM at load.
      if (!scriptURL) {
        const tags = [...document.querySelectorAll('script')]
          .filter(s => s.src && s.src.includes('assets.adobedtm.com'));
        if (tags.length) scriptURL = tags[0].src;
      }

      if (satellite && Object.keys(satellite).length > 0) {
        sendResponse({ satellite: satellite, scriptURL: scriptURL || '' });
      } else {

        // Run pixel/container detection now so it's ready for the error response
        var pixelInfo = detectPixelImpl();

        // If satellite data isn't ready yet, wait a bit and try again
        setTimeout(() => {
          // Re-scan once more before giving up
          if (!scriptURL) {
            const tags = [...document.querySelectorAll('script')]
              .filter(s => s.src && s.src.includes('assets.adobedtm.com'));
            if (tags.length) scriptURL = tags[0].src;
          }
          if (satellite && Object.keys(satellite).length > 0) {
            try {
              chrome.runtime.sendMessage({
                satellite: satellite,
                scriptURL: scriptURL || '',
              });
            } catch (err) {
              console.error('Error sending delayed response:', err);
            }
          } else {
            try {
              chrome.runtime.sendMessage({
                type: 'CONNECTION_ERROR',
                error: 'Could not find Adobe Tag Manager data on this page.',
                pixelInfo: pixelInfo,
              });
            } catch (err) {
              console.error('Error sending error message:', err);
            }
          }
        }, 1500);

        sendResponse({ pending: true, pixelInfo: pixelInfo });
      }
    }
  } catch (error) {
    console.error('Error in content script message handler:', error);
    sendResponse({ error: error.message });
  }

  // Return true to indicate we'll respond asynchronously
  return true;
});

function extractComponentData() {
  if (window._satellite && window._satellite._container && window._satellite._container.rules) {
    const rules = window._satellite._container.rules.map(rule => ({
      ruleName: rule.name || "",
      adobeAnalytics: rule.extension === "Adobe Analytics" ? "Yes" : "No",
      webSdk: rule.extension === "Web SDK" ? "Yes" : "No",
      sizeKb: rule.size ? (rule.size / 1000).toFixed(2) : "",
      extension: rule.extension || "",
      ruleEvents: rule.events ? rule.events.map(e => e.type).join(", ") : "",
      conditions: rule.conditions ? rule.conditions.map(c => c.type).join(", ") : "",
      ruleActions: rule.actions ? rule.actions.map(a => a.type).join(", ") : "",
      customCodeCondYN: rule.customCodeCondition ? "Yes" : "No",
      customCodeActionYN: rule.customCodeAction ? "Yes" : "No",
      customCodeCond: rule.customCodeCondition || "",
      customCodeAction: rule.customCodeAction || ""
    }));
    // Save to chrome.storage.local for cross-tab access
    chrome.storage.local.set({ tagscanner_rules: rules });
    return rules;
  }
  return [];
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_COMPONENT_DATA") {
    sendResponse({ data: extractComponentData() });
  }
});

// On load, extract and store rules if available
extractComponentData();

// Returns pixel/container detection result at call time — used inline in message handler
function detectPixelImpl() {
  try {
    // ── Shopify Web Pixels Manager ──────────────────────────────────────────
    var wpmScript = document.getElementById('web-pixels-manager-setup');
    if (wpmScript) {
      var wpmText = wpmScript.textContent || '';
      var adobeMatch = wpmText.match(/"name"\s*:\s*"([^"]*(?:[Aa]dobe|AEP)[^"]*)"/i);
      var pixelName = adobeMatch ? adobeMatch[1] : 'Adobe Experience Platform';
      return { detected: true, platform: 'Shopify Web Pixels', pixelName: pixelName };
    }

    // ── Google Tag Manager ──────────────────────────────────────────────────
    var gtmEl = document.querySelector('script[src*="googletagmanager.com/gtm.js"]') ||
                document.querySelector('iframe[src*="googletagmanager.com/ns.html"]');
    if (gtmEl) {
      return { detected: true, platform: 'Google Tag Manager', pixelName: null };
    }

    // ── Tealium iQ ──────────────────────────────────────────────────────────
    var tealiumEl = document.querySelector('script[src*="tags.tiqcdn.com"]') ||
                    document.querySelector('script[src*="tealiumiq.com"]');
    if (tealiumEl) {
      return { detected: true, platform: 'Tealium iQ', pixelName: null };
    }

    // ── OneTrust (consent-gated) ────────────────────────────────────────────
    var otEl = document.querySelector('script[src*="cookielaw.org"]') ||
               document.querySelector('script[src*="onetrust.com"]') ||
               document.getElementById('onetrust-consent-sdk');
    if (otEl) {
      return { detected: true, platform: 'OneTrust (consent-gated)', pixelName: null };
    }

    // ── Inline reference to adobedtm (dynamic injection) ───────────────────
    var hasInlineRef = Array.from(document.querySelectorAll('script:not([src])')).some(function(s) {
      return s.textContent && s.textContent.includes('adobedtm.com');
    });
    if (hasInlineRef) {
      return { detected: true, platform: 'dynamic injection', pixelName: null };
    }
  } catch (e) {}
  return null;
}

} // end initTagScanner
