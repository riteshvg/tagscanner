// Background script for TagScanner React application

// Handle extension icon click
chrome.action.onClicked.addListener(() => {
  // Open the extension in a popup window
  chrome.windows.create({
    url: chrome.runtime.getURL('index.html'),
    type: 'popup',
    width: 1200,
    height: 800,
    focused: true,
  });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Forward messages from content scripts to the React app
  if (message.satellite) {
    // Store the data temporarily
    chrome.storage.session.set({
      satelliteData: message.satellite,
      scriptURL: message.scriptURL,
    });
  }

  // Return true to indicate we'll respond asynchronously if needed
  return true;
});

// Handle installation and updates
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // First-time installation
    chrome.tabs.create({
      url: chrome.runtime.getURL('welcome.html'),
    });
  } else if (details.reason === 'update') {
    // Extension was updated
    const currentVersion = chrome.runtime.getManifest().version;
    const previousVersion = details.previousVersion;

    if (currentVersion !== previousVersion) {
      // Only show update page if version changed
      chrome.storage.local.set({
        showUpdateNotification: true,
        previousVersion: previousVersion,
        currentVersion: currentVersion,
      });
    }
  }
});
