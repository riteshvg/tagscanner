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
