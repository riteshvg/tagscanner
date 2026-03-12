window.addEventListener('load', myMain, false);

let scriptURL;

function myMain(evt) {
  //Injecting script to get satellite TODO: Set Delay for after page load or to wait for satellite to load.
  function injectScript(file_path, tag) {
    var node = document.getElementsByTagName(tag)[0];
    var script = document.createElement('script');
    script.setAttribute('type', 'text/javascript');
    script.setAttribute('src', file_path);
    node.appendChild(script);
  }

  injectScript(chrome.runtime.getURL('pass_satellite.js'), 'body');
  console.log(
    'line 16 content_script',
    chrome.runtime.getURL('pass_satellite.js')
  );

  //console.log('Script injected');

  //Testing with passing scripts tag.
  let a = [...document.querySelectorAll('script')];
  console.log('in line 22 content_script', a);
  a = a.filter((scpt) => scpt.src && scpt.src.includes('assets.adobedtm.com'));

  if (a.length > 0) {
    console.log(a[0].src);
    scriptURL = a[0].src;
    console.log('in mymain content_scripts', scriptURL);
  } else {
    console.error('No matching script found.');
  }
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
      console.log(satellite);
    }
  },
  false
);

// Check every 500ms until `satellite` is not empty
const checkSatellite = setInterval(() => {
  if (satellite) {
    console.log('Satellite received:', satellite);
    clearInterval(checkSatellite); // Stop checking once data is available
  }
}, 500);

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  console.log('Message received in content script:', request);
  console.log(
    sender.tab
      ? 'from a content script:' + sender.tab.url
      : 'from the extension'
  );

  try {
    if (
      request.greeting === 'hello' ||
      (request.data && request.data.greeting === 'hello')
    ) {
      // If message came through service worker, it might be wrapped in data property
      const actualRequest = request.data || request;

      if (satellite && scriptURL) {
        console.log('Sending satellite data back to popup');
        sendResponse({ satellite: satellite, scriptURL: scriptURL });
      } else {
        console.warn(
          'Satellite or scriptURL is undefined - checking if they need more time to load'
        );

        // If satellite data isn't ready yet, wait a bit and try again
        setTimeout(() => {
          if (satellite && scriptURL) {
            console.log('Satellite data available after delay');
            try {
              chrome.runtime.sendMessage({
                satellite: satellite,
                scriptURL: scriptURL,
              });
            } catch (err) {
              console.error('Error sending delayed response:', err);
            }
          } else {
            console.error('Satellite data still not available after delay');
            try {
              chrome.runtime.sendMessage({
                type: 'CONNECTION_ERROR',
                error: 'Could not find Adobe Tag Manager data on this page.',
              });
            } catch (err) {
              console.error('Error sending error message:', err);
            }
          }
        }, 1500);

        sendResponse({ pending: true });
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
