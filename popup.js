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
    // Ensure content script is injected even if the tab was open before the extension was installed
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content_scripts.js'],
      });
    } catch (e) {
      console.warn('Unable to inject content_scripts.js via scripting API:', e);
    }
    //console.log('in line 14 pop up ' + tab.id);
    var response;
    // console.log()
    try {
      //console.log('inside try ' + tab.id);
      await new Promise((resolve) => setTimeout(resolve, 3000)); // small delay to let injected script run

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

      // Listen for messages from the iframe — validate by source reference,
      // not origin, because sandboxed iframes always have origin "null".
      window.addEventListener('message', (event) => {
        if (event.source !== satellite_sandbox.contentWindow) {
          return;
        }

        if (event.data && event.data.type === 'INJECT_SCRIPT') {
          let data = event.data.payload;
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
      var dataElements = satellite.dataElements;
      var rules = satellite.rules;
      var extensions = satellite.extensions;
      var property = satellite.property;
      propertyName = property.name;
      propertyId = property.id;

      //Button to download XLSX (3 sheets: Rules, Data Elements, Extensions).
      document
        .getElementById('csv_link')
        .addEventListener('click', downloadXLSX);

      function downloadXLSX() {
        if (typeof XLSX === 'undefined') {
          alert('Excel library not loaded. Please reload and try again.');
          return;
        }

        function extFromPath(p) { return p ? p.split('/')[0] : ''; }
        function typeFromPath(p) {
          if (!p) return '';
          var parts = p.split('/');
          var fn = parts[parts.length - 1].replace(/\.js$/, '');
          if ((fn === 'index' || fn === '') && parts.length > 2) fn = parts[parts.length - 2];
          return fn.replace(/([A-Z])/g, ' $1').trim();
        }
        function codeSnippet(comp) {
          var src = comp && comp.settings && (comp.settings.source || comp.settings.code);
          if (!src || typeof src !== 'string') return '';
          var s = src.trim();
          return s.length > 500 ? s.slice(0, 500) + '…' : s;
        }

        var ruleList = Array.isArray(rules) ? rules
          : (rules && typeof rules === 'object' ? Object.values(rules) : []);
        var deObj = dataElements || {};
        var extObj = extensions || {};

        // ── Pre-compute extension usage counts from rules + data elements ────
        var extUsage = {};
        Object.keys(extObj).forEach(function (k) {
          extUsage[k] = { events: 0, conditions: 0, actions: 0, dataElements: 0 };
        });
        function tally(arr, field) {
          if (!arr) return;
          arr.forEach(function (comp) {
            var k = extFromPath(comp.modulePath);
            if (k) {
              if (!extUsage[k]) extUsage[k] = { events: 0, conditions: 0, actions: 0, dataElements: 0 };
              extUsage[k][field]++;
            }
          });
        }
        ruleList.forEach(function (rule) {
          tally(rule.events, 'events');
          tally(rule.conditions, 'conditions');
          tally(rule.actions, 'actions');
        });
        Object.keys(deObj).forEach(function (name) {
          var k = extFromPath((deObj[name] || {}).modulePath);
          if (k) {
            if (!extUsage[k]) extUsage[k] = { events: 0, conditions: 0, actions: 0, dataElements: 0 };
            extUsage[k].dataElements++;
          }
        });

        // ── Sheet 1: Rules Summary — one row per rule ─────────────────────────
        var summaryRows = [['#', 'Rule Name', '# Events', '# Conditions',
                            '# Actions', 'Total Components', 'Extensions Used', 'Has Custom Code']];
        ruleList.forEach(function (rule, idx) {
          var rName = rule.name || rule.id || 'Unknown';
          var evts = (rule.events || []).length;
          var conds = (rule.conditions || []).length;
          var acts = (rule.actions || []).length;
          var hasCode = false;
          var extSet = {};
          function scanComps(arr) {
            if (!arr) return;
            arr.forEach(function (c) {
              if (c.settings && (c.settings.source || c.settings.code)) hasCode = true;
              var k = extFromPath(c.modulePath);
              if (k) extSet[k] = true;
            });
          }
          scanComps(rule.events); scanComps(rule.conditions); scanComps(rule.actions);
          summaryRows.push([idx + 1, rName,
            evts, conds, acts, evts + conds + acts,
            Object.keys(extSet).join(', '), hasCode ? 'Yes' : 'No']);
        });

        // ── Sheet 2: Rule Components — one row per component, rule name merged ─
        var compRows = [['Rule Name', 'Component Type', 'Component Name',
                         'Extension', 'Order', 'Has Custom Code', 'Code Snippet']];
        var compMerges = [];
        ruleList.forEach(function (rule) {
          var rName = rule.name || rule.id || 'Unknown';
          var startRow = compRows.length; // 0-indexed
          var order = 0;
          function addComps(arr, typeName) {
            if (!arr || !arr.length) return;
            arr.forEach(function (comp) {
              var hasCode = !!(comp.settings && (comp.settings.source || comp.settings.code));
              var isFirst = compRows.length === startRow;
              compRows.push([
                isFirst ? rName : '',
                typeName,
                comp.name || typeFromPath(comp.modulePath),
                extFromPath(comp.modulePath),
                ++order,
                hasCode ? 'Yes' : 'No',
                codeSnippet(comp)
              ]);
            });
          }
          addComps(rule.events, 'Event');
          addComps(rule.conditions, 'Condition');
          addComps(rule.actions, 'Action');
          if (compRows.length === startRow) {
            compRows.push([rName, '(no components)', '', '', '', '', '']);
          }
          var endRow = compRows.length - 1;
          if (endRow > startRow) {
            // Merge Rule Name column across all component rows
            compMerges.push({ s: { r: startRow, c: 0 }, e: { r: endRow, c: 0 } });
          }
        });

        // ── Sheet 3: Data Elements ────────────────────────────────────────────
        var deRows = [['#', 'Name', 'Type', 'Extension', 'Storage Duration',
                        'Default Value', 'Clean Text', 'Force Lowercase',
                        'Has Custom Code', 'Code Snippet', 'Size (KB)']];
        var di = 1;
        Object.keys(deObj).forEach(function (name) {
          var d = deObj[name] || {};
          var hasCode = !!(d.settings && (d.settings.source || d.settings.code));
          var sizeKb = d.size ? parseFloat((d.size / 1024).toFixed(2)) : '';
          deRows.push([di++, name, typeFromPath(d.modulePath), extFromPath(d.modulePath),
            d.storageDuration || '',
            (d.settings && d.settings.defaultValue) || '',
            d.cleanText ? 'Yes' : 'No',
            d.forceLowerCase ? 'Yes' : 'No',
            hasCode ? 'Yes' : 'No', codeSnippet(d), sizeKb]);
        });

        // ── Sheet 4: Extensions ───────────────────────────────────────────────
        var extRows = [['#', 'Extension Key', 'Display Name',
                        '# Events Used', '# Conditions Used', '# Actions Used', '# Data Elements',
                        'Total Usage', 'Has Settings', 'Settings Summary', 'Size (KB)']];
        var ei = 1;
        Object.keys(extObj).sort().forEach(function (key) {
          var e = extObj[key] || {};
          var u = extUsage[key] || { events: 0, conditions: 0, actions: 0, dataElements: 0 };
          var hasSettings = !!(e.settings && Object.keys(e.settings).length > 0);
          var settingsSummary = '';
          if (e.settings) {
            try {
              var j = JSON.stringify(e.settings);
              settingsSummary = j.length > 300 ? j.slice(0, 300) + '…' : j;
            } catch (_) {}
          }
          var sizeKb = e.size ? parseFloat((e.size / 1024).toFixed(2)) : '';
          extRows.push([ei++, key, e.displayName || key,
            u.events, u.conditions, u.actions, u.dataElements,
            u.events + u.conditions + u.actions + u.dataElements,
            hasSettings ? 'Yes' : 'No', settingsSummary, sizeKb]);
        });

        // ── Build workbook ─────────────────────────────────────────────────────
        function autoWidth(ws, data) {
          if (!data || !data.length) return;
          var widths = [];
          for (var c = 0; c < data[0].length; c++) {
            var max = 10;
            data.forEach(function (row) {
              var len = row[c] == null ? 0 : String(row[c]).length;
              if (len > max) max = len;
            });
            widths.push({ wch: Math.min(max + 2, 60) });
          }
          ws['!cols'] = widths;
        }

        var wb = XLSX.utils.book_new();

        var wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
        autoWidth(wsSummary, summaryRows);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Rules Summary');

        var wsComp = XLSX.utils.aoa_to_sheet(compRows);
        if (compMerges.length) wsComp['!merges'] = compMerges;
        autoWidth(wsComp, compRows);
        XLSX.utils.book_append_sheet(wb, wsComp, 'Rule Components');

        var wsDe = XLSX.utils.aoa_to_sheet(deRows);
        autoWidth(wsDe, deRows);
        XLSX.utils.book_append_sheet(wb, wsDe, 'Data Elements');

        var wsExt = XLSX.utils.aoa_to_sheet(extRows);
        autoWidth(wsExt, extRows);
        XLSX.utils.book_append_sheet(wb, wsExt, 'Extensions');

        var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        var blob = new Blob([wbout], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = propertyName + '_tagScanner.xlsx';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
      }

      //Assigning Values in popup
      sessionStorage.setItem('launch_property_name', propertyName);
      sessionStorage.setItem('launch_property_environment', 'Production');
      document.getElementById('property_name').textContent =
        'PROPERTY NAME: ' + propertyName;

      //Hard Setting Environment to Production - TODO: fix if ever needed. Currently will always be on prod if not owner of property.
      document.getElementById('environment_name').textContent = 'Environment: Production';
      var topbarEnv = document.getElementById('topbar-env');
      if (topbarEnv) {
        topbarEnv.textContent = '';
        var envIcon = document.createElement('i');
        envIcon.className = 'fas fa-cloud mr-1';
        topbarEnv.appendChild(envIcon);
        topbarEnv.appendChild(document.createTextNode('Env: Production'));
      }

      //Extension details
      var extensionStr = JSON.stringify(extensions);
      sessionStorage.setItem('_satellite._container.extension', extensionStr);
      extensionStr = extensionStr.split('hostedLibFilesBaseUrl');
      var extCount = extensionStr.length - 1;
      document.getElementById('extensions').textContent = extCount;
      sessionStorage.setItem('extensions-length', extensionStr.length - 1);
      var topbarExt = document.getElementById('topbar-ext');
      if (topbarExt) {
        topbarExt.textContent = '';
        var extIcon = document.createElement('i');
        extIcon.className = 'fas fa-puzzle-piece mr-1';
        topbarExt.appendChild(extIcon);
        topbarExt.appendChild(document.createTextNode('Extensions: ' + extCount));
      }

      //Rule details
      document.getElementById('rule_details').textContent = rules.length;
      var topbarRules = document.getElementById('topbar-rules');
      if (topbarRules) {
        topbarRules.textContent = '';
        var rulesIcon = document.createElement('i');
        rulesIcon.className = 'fas fa-wrench mr-1';
        topbarRules.appendChild(rulesIcon);
        topbarRules.appendChild(document.createTextNode('Rules: ' + rules.length));
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
sessionStorage.setItem('tagScanner_version', chrome.runtime.getManifest().version);
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
