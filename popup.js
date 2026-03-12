var tab_title = '';

var propertyName;
var propertyId;
var satellite = {};

(async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: false,
  });

  // const [tab] = await chrome.windows.create({
  //   url: 'popup.html', // URL of the page you want to open
  //   type: 'popup', // Opens the window as a popup
  //   width: 800, // Specify the width of the new window
  //   height: 600 // Specify the height of the new window
  // });
  //console.log('in line 19 pop up ' + tab.id);
  if (tab.id) {
    //console.log('in line 14 pop up ' + tab.id);
    var response;
    // console.log()
    try {
      //console.log('inside try ' + tab.id);
      await new Promise((resolve) => setTimeout(resolve, 3000)); // 3-second delay

      response = await chrome.tabs.sendMessage(tab.id, {
        greeting: 'hello',
      });
      // do something with response here, not outside the function
      console.log('in line 19 in popup  ' + JSON.stringify(response, null, 2));

      satellite = response.satellite;
      scriptURL = response.scriptURL;
      console.log('in line 37 ' + scriptURL);
      // const script_URL = urlParams.get("scriptURL");

      //Passing unminified url to sandbox
      // let satellite_sandbox = document.createElement('iframe');
      // satellite_sandbox.appendChild(document.createElement('body'));

      // satellite_sandbox.src = chrome.runtime.getURL('satellite_sandbox.html');
      // satellite_sandbox.src += '?scriptURL=' + scriptURL;
      // //allowing sandbox with allow-scripts and allow-origin
      // satellite_sandbox.sandbox = 'allow-scripts allow-same-origin';
      // satellite_sandbox.style.display = 'none';
      // console.log('in line 47 ' + document.body.appendChild(satellite_sandbox));
      // document.body.appendChild(satellite_sandbox);

      let satellite_sandbox = document.createElement('iframe');
      satellite_sandbox.src =
        chrome.runtime.getURL('satellite_sandbox.html') +
        '?scriptURL=' +
        encodeURIComponent(scriptURL);
      satellite_sandbox.sandbox = 'allow-scripts'; // Keep security while allowing script execution
      satellite_sandbox.style.display = 'none';
      document.body.appendChild(satellite_sandbox);

      // Listen for messages from the iframe
      window.addEventListener('message', (event) => {
        if (
          event.origin !== 'null' &&
          event.origin !== chrome.runtime.getURL('').slice(0, -1)
        ) {
          console.warn(
            'Received message from unauthorized origin:',
            event.origin
          );
          return;
        }

        if (event.data && event.data.type === 'INJECT_SCRIPT') {
          const script = document.createElement('script');
          script.textContent = event.data.payload;
          let data = event.data.payload;
          console.log('@#333333333333333  ', event.data.payload);
          let match = data.match(
            /window\._satellite\.container\s*=\s*({[\s\S]*});/
          );

          if (match) {
            let containerString = match[1];

            // Step 2: Convert it to valid JSON
            containerString = containerString
              .replace(/:\s*function\s*\([^)]*\)\s*\{[^}]*\}/g, ':"[Function]"') // Replace functions with placeholder
              .replace(/([{,])(\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$3":') // Quote keys
              .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas

            try {
              // Step 3: Parse the JSON
              let containerObject = JSON.parse(containerString);
              console.log(containerObject);
            } catch (error) {
              console.error('Error parsing container JSON:', error);
              console.log('Sanitized JSON string:', containerString); // Debugging
            }
          } else {
            console.error('Container not found in script.');
          }
          // document.body.appendChild(script);
        }
      });

      if (typeof scriptURL === 'string' && scriptURL.length > 0) {
        scriptURL = scriptURL.replace(/\.min\.js$/, '.js');

        // let sandboxScript = document.createElement('script');
        // sandboxScript.src = scriptURL;
        console.log('in line 53***********8', scriptURL);
        // satellite_sandbox.contentDocument.body.appendChild(sandboxScript);
      }

      //Naming headers for the table
      const headers = [
        'componentType',
        'componentName',
        'hasCustomCode',
        'customCode',
        'deModule',
        'deSettings',
        'ruleID',
        'ruleModule',
        'ruleSettings',
        'eventOrder',
      ];

      var dataElements = satellite.dataElements;
      var rules = satellite.rules;
      var extensions = satellite.extensions;
      var property = satellite.property;
      propertyName = property.name;
      propertyId = property.id;

      var deTest = parseDataElements(dataElements);
      var extTest = parseExtensions(extensions);
      var ruleTest = parseRules(rules);

      var deDicts = toTable(headers, deTest);
      var extDicts = toTable(headers, extTest);
      var ruleDicts = toTable(headers, ruleTest);
      const mergedDicts = [...deDicts, ...extDicts, ...ruleDicts];

      //console.log(mergedDicts);

      // To CSV
      csv = [
        [
          'Component Type',
          'Component Name',
          'Has Custom Code',
          'Custom Code',
          'DE Module',
          'DE Settings',
          'RuleID',
          'Rule Module',
          'Rule Settings',
          'Event Order',
        ],
        ...mergedDicts.map((row) =>
          [
            row.componentType,
            row.componentName,
            row.hasCustomCode,
            row.customCode,
            row.deModule, //TODO: Not showing up in csv? check qualifiers. Single quotes vs double?
            row.deSettings,
            row.ruleID,
            row.ruleModule,
            row.ruleSettings,
            row.eventOrder,
          ].map((item) =>
            typeof item === 'string' ? `"${item.replace(/"/g, '""')}"` : item
          )
        ),
      ]
        .map((row) => row.join(','))
        .join('\n');
      //console.log(csv);

      //Button to download CSV.
      document
        .getElementById('csv_link')
        .addEventListener('click', downloadCSV);
      function downloadCSV() {
        var csvFile = new Blob([csv], { type: 'text/csv' });
        var downloadLink = document.createElement('a');
        downloadLink.download = propertyName + '_tagScanner.csv';
        downloadLink.href = window.URL.createObjectURL(csvFile);
        downloadLink.click();
      }

      //Assigning Values in popup
      sessionStorage.setItem('launch_property_name', propertyName);
      sessionStorage.setItem('launch_property_environment', 'Production');
      document.getElementById('property_name').innerHTML =
        'PROPERTY NAME: ' + propertyName;

      //Hard Setting Environment to Production - TODO: fix if ever needed. Currently will always be on prod if not owner of property.
      var envLabel = 'Environment: Production';
      document.getElementById('environment_name').innerHTML = envLabel;
      if (document.getElementById('topbar-env')) {
        document.getElementById('topbar-env').innerHTML = '<i class="fas fa-cloud mr-1"></i>Env: Production';
      }

      //Extension details
      var extensionStr = JSON.stringify(extensions);
      sessionStorage.setItem('_satellite._container.extension', extensionStr);
      extensionStr = extensionStr.split('hostedLibFilesBaseUrl');
      var extCount = extensionStr.length - 1;
      document.getElementById('extensions').innerHTML = extCount;
      sessionStorage.setItem('extensions-length', extensionStr.length - 1);
      if (document.getElementById('topbar-ext')) {
        document.getElementById('topbar-ext').innerHTML = '<i class="fas fa-puzzle-piece mr-1"></i>Extensions: ' + extCount;
      }

      //Rule details
      document.getElementById('rule_details').innerHTML = rules.length;
      if (document.getElementById('topbar-rules')) {
        document.getElementById('topbar-rules').innerHTML = '<i class="fas fa-wrench mr-1"></i>Rules: ' + rules.length;
      }
      sessionStorage.setItem('rule-length', rules.length);
      sessionStorage.setItem(
        '_satellite._container.rules',
        JSON.stringify(rules)
      );

      // Save Components Overview format for display.html iframe (content script cannot read _satellite)
      var rulesRaw = rules || (satellite._container && satellite._container.rules);
      var rulesArray = Array.isArray(rulesRaw) ? rulesRaw : (rulesRaw && typeof rulesRaw === 'object' ? Object.values(rulesRaw) : []);
      var tagscannerRules = rulesArray.map(function (rule) {
        return {
          ruleName: rule.name || '',
          adobeAnalytics: rule.extension === 'Adobe Analytics' ? 'Yes' : 'No',
          webSdk: rule.extension === 'Web SDK' ? 'Yes' : 'No',
          sizeKb: rule.size ? (rule.size / 1000).toFixed(2) : '',
          extension: rule.extension || '',
          ruleEvents: rule.events ? rule.events.map(function (e) { return e.type; }).join(', ') : '',
          conditions: rule.conditions ? rule.conditions.map(function (c) { return c.type; }).join(', ') : '',
          ruleActions: rule.actions ? rule.actions.map(function (a) { return a.type; }).join(', ') : '',
          customCodeCondYN: rule.customCodeCondition ? 'Yes' : 'No',
          customCodeActionYN: rule.customCodeAction ? 'Yes' : 'No',
          customCodeCond: rule.customCodeCondition || '',
          customCodeAction: rule.customCodeAction || ''
        };
      });
      if (tagscannerRules.length > 0) {
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ tagscanner_rules: tagscannerRules });
        }
      }
      // Library snapshot for Components Overview (slightly more than the header bar)
      var customCodeRules = tagscannerRules.filter(function (r) {
        return r.customCodeCondYN === 'Yes' || r.customCodeActionYN === 'Yes';
      }).length;
      var snapshot = {
        propertyName: propertyName || 'Unknown',
        environment: 'Production',
        rulesCount: rulesArray.length,
        dataElementsCount: typeof dataElements === 'object' ? Object.keys(dataElements).length : 0,
        extensionsCount: typeof extensions === 'object' ? Object.keys(extensions).length : 0,
        customCodeRulesCount: customCodeRules
      };
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ tagscanner_snapshot: snapshot });
      }
      var iframe = document.getElementById('component-iframe');
      if (iframe && iframe.contentWindow) {
        try {
          iframe.contentWindow.postMessage({ type: 'TAGSCANNER_SNAPSHOT', data: snapshot }, '*');
          if (tagscannerRules.length > 0) {
            iframe.contentWindow.postMessage({ type: 'TAGSCANNER_RULES', data: tagscannerRules }, '*');
          }
        } catch (e) {
          console.warn('TagScanner: could not postMessage to component iframe', e);
        }
      }

      //Data Element details
      var deStr = JSON.stringify(dataElements);
      sessionStorage.setItem('_satellite._container.dataElements', deStr);
      deStr = deStr.split('modulePath');
      var deCount = deStr.length - 1;
      document.getElementById('dataelement').innerHTML = deCount;
      sessionStorage.setItem('dataelement-length', deStr.length - 1);
      if (document.getElementById('topbar-de')) {
        document.getElementById('topbar-de').innerHTML = '<i class="fas fa-database mr-1"></i>Data Elements: ' + deCount;
      }

      // Load flow view in Components Overview once data is ready (so flow has data to display)
      var componentIframe = document.getElementById('component-iframe');
      if (componentIframe && !componentIframe.src) {
        componentIframe.src = 'display.html';
      }

      //Setting Display Properly if everything is proper
      var set_display = document.getElementById('set_display');
      set_display.style = 'display: none;';

      //To new tab
      //chrome.tabs.create({url: 'popup.html'})
    } catch (error) {
      console.error(error);
      sessionStorage.setItem('launch_property_name', 'No Launch Code');
      var set_display = document.getElementById('set_display');
      // set_display.innerHTML = "No Adobge Tags Script Present";
      set_display.style = 'display: none;';
    }
  }
})();

//TODO: Add button to open popup in new tab/window. currently doesn't work because messaging.
//TODO: Possible to do this maybe if the new tab has a sends a message to content script instead of popup.js?
//TODO: Thinking await tab creation and then add listener for message from content script??

//Parsing the data elements
function parseDataElements(dataElements) {
  let parsedDataElements = [];
  for (let dataElement in dataElements) {
    let component = dataElements[dataElement];
    let componentName = dataElement;
    let componentType = 'Data Element';
    let customCode;
    let hasCustomCode;
    let de_module = component.modulePath;
    let de_settings;
    if (component.settings.source) {
      customCode = component.settings.source;
      hasCustomCode = true;
    } else {
      hasCustomCode = false;
      customCode = null;
      de_settings = JSON.stringify(component.settings);
    }

    parsedDataElements.push([
      componentType,
      componentName,
      hasCustomCode,
      customCode,
      de_module,
      de_settings,
    ]);
  }
  return parsedDataElements;
}

//Parsing extensions. TODO: parse into modules, hosted files urls, etc.
function parseExtensions(extensions) {
  let parsedextensions = [];
  for (let extension in extensions) {
    let component = extensions[extension];
    let componentName = extension;
    let componentType = 'Extension';
    //Set undefined if there is no custom code.
    let customCode = null;
    parsedextensions.push([componentType, componentName, customCode]);
  }
  return parsedextensions;
}

//Parsing rules
function parseRules(rules) {
  let parsedRules = [];
  
  for (let rule in rules) {
    let component = rules[rule];
    let componentName = component.name;
    let ruleID = component.id;

    //Nest For loops here for actions, conditions, events
    //Looping actions

    for (let action in component.actions) {
      let ruleModule = component.actions[action].modulePath;
      let componentType = 'Rule Action';
      let ruleSettings;
      let hasCustomCode;
      let customCode = undefined;
      if (component.actions[action].settings.isExternal == true) {
        ruleSettings = component.actions[action].settings.source;
        customCode = component.actions[action].settings.source;
        hasCustomCode = true;
      } else if (component.actions[action].settings.customSetup) {
        //TODO: cover edge cases like this
        customCode = component.actions[action].settings.customSetup.source;
        hasCustomCode = true;
      } else {
        ruleSettings = JSON.stringify(component.actions[action].settings);
        hasCustomCode = false;
      }

      let eventOrder = undefined;
      let de_module = undefined,
        de_settings = undefined;
      
      parsedRules.push([
        componentType,
        componentName,
        hasCustomCode,
        customCode,
        de_module,
        de_settings,
        ruleID,
        ruleModule,
        ruleSettings,
        eventOrder,
      ]);
    }

    //Looping conditions
    for (let condition in component.conditions) {
      let ruleModule = component.conditions[condition].modulePath;
      let ruleSettings;
      let componentType = 'Rule Condition';
      let hasCustomCode;
      let customCode = undefined;
      if (ruleModule.includes('customCode')) {
        hasCustomCode = true;
        customCode = component.conditions[condition].settings.source;
      } else {
        hasCustomCode = false;
        ruleSettings = JSON.stringify(component.conditions[condition].settings);
      }
      let eventOrder = undefined;
      let de_module = undefined,
        de_settings = undefined;
      
      parsedRules.push([
        componentType,
        componentName,
        hasCustomCode,
        customCode,
        de_module,
        de_settings,
        ruleID,
        ruleModule,
        ruleSettings,
        eventOrder,
      ]);
    }

    //Looping events
    for (let event in component.events) {
      let componentType = 'Rule Event';
      let ruleModule = component.events[event].modulePath;
      let eventOrder = component.events[event].ruleOrder;
      let ruleSettings = JSON.stringify(component.events[event].settings);
      let hasCustomCode;
      let customCode = undefined;
      if (ruleModule.includes('customCode')) {
        hasCustomCode = true;
      } else {
        hasCustomCode = false;
      }
      let de_module = undefined,
        de_settings = undefined;
      // For events, customCode is undefined, so always 'No' for third-party tracking
      let hasThirdPartyTracking = 'No';
      parsedRules.push([
        componentType,
        componentName,
        hasCustomCode,
        customCode,
        de_module,
        de_settings,
        ruleID,
        ruleModule,
        ruleSettings,
        eventOrder,
        hasThirdPartyTracking,
      ]);
    }
  }
  return parsedRules;
}

//Transforming to dictionary/key:value format
function toTable(headers, data) {
  return data.reduce((acc, e, idx) => {
    acc.push(
      headers.reduce((r, h, i) => {
        r[h] = e[i];
        return r;
      }, {})
    );
    return acc;
  }, []);
}

//const myTimeout = setTimeout(myGreeting, 3000);

//Links
if (window.location.href.indexOf('page_url=') > -1) {
  sessionStorage.setItem('launch_page_url', window.location.href);
}
sessionStorage.setItem('tagScanner_version', '2.0.0');
// document.getElementById('feed_back_form').addEventListener('click', newwindow);
// function newwindow() {
//   window.open(
//     'https://forms.office.com/pages/responsepage.aspx?id=Wht7-jR7h0OUrtLBeN7O4XEws-rPjjFIo66cJYv98MhUNkNWREtONjYyNDdKOUJCSlRYNVc5Q05FNiQlQCN0PWcu',
//     '',
//     'width=600, height=600'
//   );
//   tagScanner('sendEvent', {
//     xdm: {
//       web: {
//         webPageDetails: {
//           name: document.title,
//         },
//         webInteraction: {
//           linkClicks: {
//             value: 1,
//           },
//           name: 'Feed Back Form', // Name that shows up in the custom links report
//           URL: 'https://myurl.com', // The URL of the link
//           type: 'other', // values: other, download, exit
//         },
//       },
//       _ags046: {
//         link_name: 'Feedback Form',
//         link_click: 'Yes',
//         propertyName: property_name,
//         version: 'version- 1.1.0',
//         page_url: page_url,
//         launch_page_url: launch_page_url_1,
//       },
//     },
//   });
// }
// document
//   .getElementById('request_new_feature')
//   .addEventListener('click', newRequest);
// function newRequest() {
//   window.open(
//     'https://forms.office.com/Pages/ResponsePage.aspx?id=Wht7-jR7h0OUrtLBeN7O4XEws-rPjjFIo66cJYv98MhURjNMUFZMQkY1MFU5VTVRUk1COU5UWThYViQlQCN0PWcu',
//     '',
//     'width=600, height=600'
//   );
//   tagScanner('sendEvent', {
//     xdm: {
//       web: {
//         webPageDetails: {
//           name: document.title,
//         },
//         webInteraction: {
//           linkClicks: {
//             value: 1,
//           },
//           name: 'Feature Request Form', // Name that shows up in the custom links report
//           URL: 'https://myurl.com', // The URL of the link
//           type: 'other', // values: other, download, exit
//         },
//       },
//       _ags046: {
//         link_name: 'Feature Request Form',
//         link_click: 'Yes',
//         propertyName: property_name,
//         version: 'version- 1.1.0',
//         page_url: page_url,
//         launch_page_url: launch_page_url_1,
//       },
//     },
//   });
// }
// document
//   .getElementById('git_share_link')
//   .addEventListener('click', gitLinkShare);
// function gitLinkShare() {
//   var copyText = document.getElementById('git_share_link').dataset.link;
//   navigator.clipboard.writeText(copyText);
//   alert('Copied the text: ' + copyText);
// }
