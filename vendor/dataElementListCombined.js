/**
 * Combined Analytics and XDM Variable Mapping
 * This script combines functionality for both Analytics rules and XDM data elements
 */

document.addEventListener('DOMContentLoaded', function () {
  console.log('Combined Variable Mapping page loading...');

  // Get DOM elements
  const variableSelect = document.getElementById('variableSelect');
  const analyzeButton = document.getElementById('analyzeButton');
  const resultsSection = document.getElementById('resultsSection');
  const loader = document.getElementById('set_display');
  const eVarTypeBtn = document.getElementById('eVarTypeBtn');
  const propTypeBtn = document.getElementById('propTypeBtn');
  const eventTypeBtn = document.getElementById('eventTypeBtn');
  const modeAnalytics = document.getElementById('modeAnalytics');
  const modeXDM = document.getElementById('modeXDM');

  // Current variable type and mode
  let currentVariableType = 'eVar';
  let currentMode = 'analytics';

  // Store all analytics variables and their mappings
  const analyticsVariables = {
    eVars: {},
    props: {},
    events: {},
  };

  // Store rule information by data element
  const rulesByDataElement = {};

  // Initialize the page
  initPage();

  // Function to initialize the page
  function initPage() {
    // Add event listeners to variable type buttons
    eVarTypeBtn.addEventListener('click', function () {
      setVariableType('eVar');
    });

    propTypeBtn.addEventListener('click', function () {
      setVariableType('prop');
    });

    eventTypeBtn.addEventListener('click', function () {
      setVariableType('event');
    });

    // Add event listeners to mode radio buttons
    modeAnalytics.addEventListener('change', function () {
      if (this.checked) {
        currentMode = 'analytics';
        resetAndExtractVariables();
      }
    });

    modeXDM.addEventListener('change', function () {
      if (this.checked) {
        currentMode = 'xdm';
        resetAndExtractVariables();
      }
    });

    // Add event listener to the analyze button
    analyzeButton.addEventListener('click', analyzeSelectedVariable);

    // Check data availability and set initial mode
    checkDataAvailability();
  }

  // Function to check data availability and set initial mode
  function checkDataAvailability() {
    const deValue = sessionStorage.getItem(
      '_satellite._container.dataElements'
    );
    const rulesValue = sessionStorage.getItem('_satellite._container.rules');

    if (!deValue || !rulesValue) {
      alert(
        'Data not found in sessionStorage. Please make sure you have loaded the TagScanner properly.'
      );
      return;
    }

    const dataElements = JSON.parse(deValue);
    const rules = JSON.parse(rulesValue);

    let hasAnalytics = false;
    let hasXDM = false;

    // Check for Analytics rules
    rules.forEach((rule) => {
      if (rule.actions) {
        rule.actions.forEach((action) => {
          if (
            action.modulePath &&
            action.modulePath.includes(
              'adobe-analytics/src/lib/actions/setVariables.js'
            )
          ) {
            hasAnalytics = true;
          }
        });
      }
    });

    // Check for XDM data elements
    for (const deName in dataElements) {
      const de = dataElements[deName];
      if (
        de.modulePath &&
        de.modulePath.includes(
          'adobe-alloy/dist/lib/dataElements/xdmObject/index.js'
        )
      ) {
        hasXDM = true;
        break;
      }
    }

    // Enable/disable radio buttons based on availability
    modeAnalytics.disabled = !hasAnalytics;
    modeXDM.disabled = !hasXDM;

    // Set initial mode
    if (hasAnalytics) {
      modeAnalytics.checked = true;
      currentMode = 'analytics';
    } else if (hasXDM) {
      modeXDM.checked = true;
      currentMode = 'xdm';
    }

    // Extract variables for initial mode
    resetAndExtractVariables();
  }

  // Function to reset and extract variables
  function resetAndExtractVariables() {
    // Reset variables
    Object.keys(analyticsVariables).forEach((key) => {
      analyticsVariables[key] = {};
    });
    Object.keys(rulesByDataElement).forEach((key) => {
      delete rulesByDataElement[key];
    });

    // Extract variables based on current mode
    if (currentMode === 'analytics') {
      extractAnalyticsVariables();
    } else {
      extractXDMVariables();
    }
  }

  // Function to set the current variable type
  function setVariableType(type) {
    currentVariableType = type;

    // Update button states
    eVarTypeBtn.classList.remove('active');
    propTypeBtn.classList.remove('active');
    eventTypeBtn.classList.remove('active');

    if (type === 'eVar') {
      eVarTypeBtn.classList.add('active');
    } else if (type === 'prop') {
      propTypeBtn.classList.add('active');
    } else if (type === 'event') {
      eventTypeBtn.classList.add('active');
    }

    // Update the dropdown options
    populateVariableDropdown();
  }

  // Function to populate the variable dropdown based on the current type
  function populateVariableDropdown() {
    // Clear existing options
    variableSelect.innerHTML =
      '<option value="">-- Select a Variable --</option>';

    let variables = [];

    if (currentVariableType === 'eVar') {
      variables = Object.keys(analyticsVariables.eVars);
    } else if (currentVariableType === 'prop') {
      variables = Object.keys(analyticsVariables.props);
    } else if (currentVariableType === 'event') {
      variables = Object.keys(analyticsVariables.events);
    }

    // Sort variables numerically
    variables.sort((a, b) => {
      const aNum = parseInt(a.replace(/[^\d]/g, ''));
      const bNum = parseInt(b.replace(/[^\d]/g, ''));
      return aNum - bNum;
    });

    // Add options for each variable
    variables.forEach((variable) => {
      const option = document.createElement('option');
      option.value = variable;
      option.textContent = variable;
      variableSelect.appendChild(option);
    });
  }

  // Function to extract Analytics variables
  function extractAnalyticsVariables() {
    // Show loader
    loader.style.display = 'flex';

    // Get data elements and rules from sessionStorage
    const deValue = sessionStorage.getItem(
      '_satellite._container.dataElements'
    );
    const rulesValue = sessionStorage.getItem('_satellite._container.rules');

    if (!deValue || !rulesValue) {
      alert(
        'Data not found in sessionStorage. Please make sure you have loaded the TagScanner properly.'
      );
      loader.style.display = 'none';
      return;
    }

    const dataElements = JSON.parse(deValue);
    const rules = JSON.parse(rulesValue);

    console.log(
      `Analyzing ${Object.keys(dataElements).length} data elements and ${
        rules.length
      } rules...`
    );

    // Process Analytics rules
    let foundAnalyticsRules = false;
    rules.forEach((rule) => {
      if (rule.actions) {
        rule.actions.forEach((action) => {
          if (
            action.modulePath &&
            action.modulePath.includes(
              'adobe-analytics/src/lib/actions/setVariables.js'
            )
          ) {
            console.log(
              `Found Analytics Set Variables action in rule: ${rule.name}`
            );
            foundAnalyticsRules = true;

            if (action.settings) {
              processAnalyticsRuleAction(rule.name, action);
            }
          }
        });
      }
    });

    // Process rules to find data element references
    processRules(rules, dataElements);

    // Populate the dropdown with the initial variable type (eVars)
    populateVariableDropdown();

    // Hide the loader
    loader.style.display = 'none';
  }

  // Function to extract XDM variables
  function extractXDMVariables() {
    // Show loader
    loader.style.display = 'flex';

    // Get data elements and rules from sessionStorage
    const deValue = sessionStorage.getItem(
      '_satellite._container.dataElements'
    );
    const rulesValue = sessionStorage.getItem('_satellite._container.rules');

    if (!deValue || !rulesValue) {
      alert(
        'Data not found in sessionStorage. Please make sure you have loaded the TagScanner properly.'
      );
      loader.style.display = 'none';
      return;
    }

    const dataElements = JSON.parse(deValue);
    const rules = JSON.parse(rulesValue);

    console.log(
      `Analyzing ${Object.keys(dataElements).length} data elements and ${
        rules.length
      } rules...`
    );

    // Process XDM data elements
    let foundXDMElements = false;
    for (const deName in dataElements) {
      if (dataElements.hasOwnProperty(deName)) {
        const de = dataElements[deName];

        if (
          de.modulePath &&
          de.modulePath.includes(
            'adobe-alloy/dist/lib/dataElements/xdmObject/index.js'
          )
        ) {
          console.log(`Found XDM object data element: ${deName}`);
          foundXDMElements = true;

          if (!rulesByDataElement[deName]) {
            rulesByDataElement[deName] = [];
          }

          processXDMDataElement(deName, de);
        }
      }
    }

    // Process rules to find data element references
    processRules(rules, dataElements);

    // Populate the dropdown with the initial variable type (eVars)
    populateVariableDropdown();

    // Hide the loader
    loader.style.display = 'none';
  }

  // Function to process an Analytics rule action
  function processAnalyticsRuleAction(ruleName, action) {
    try {
      if (!action.settings.trackerProperties) {
        return;
      }

      // Process eVars
      if (action.settings.trackerProperties.eVars) {
        for (const eVarKey in action.settings.trackerProperties.eVars) {
          const eVarObj = action.settings.trackerProperties.eVars[eVarKey];
          const eVarName = eVarObj.name || eVarKey.replace(/^evar/i, 'eVar');

          if (!analyticsVariables.eVars[eVarName]) {
            analyticsVariables.eVars[eVarName] = [];
          }

          let value = eVarObj.value || '';
          const valueStr =
            typeof value === 'string' ? value : JSON.stringify(value);

          if (
            !entryExists(analyticsVariables.eVars[eVarName], ruleName, valueStr)
          ) {
            analyticsVariables.eVars[eVarName].push({
              ruleName: ruleName,
              value: valueStr,
            });
          }
        }
      }

      // Process props
      if (action.settings.trackerProperties.props) {
        for (const propKey in action.settings.trackerProperties.props) {
          const propObj = action.settings.trackerProperties.props[propKey];
          const propName = propObj.name || propKey.replace(/^prop/i, 'prop');

          if (!analyticsVariables.props[propName]) {
            analyticsVariables.props[propName] = [];
          }

          let value = propObj.value || '';
          const valueStr =
            typeof value === 'string' ? value : JSON.stringify(value);

          if (
            !entryExists(analyticsVariables.props[propName], ruleName, valueStr)
          ) {
            analyticsVariables.props[propName].push({
              ruleName: ruleName,
              value: valueStr,
            });
          }
        }
      }

      // Process events
      if (action.settings.trackerProperties.events) {
        let eventsValue = action.settings.trackerProperties.events;

        if (typeof eventsValue === 'string') {
          const eventList = eventsValue.split(',').map((e) => e.trim());

          eventList.forEach((eventItem) => {
            const eventParts = eventItem.split('=');
            const eventName = eventParts[0].trim();

            if (eventName.match(/^event\d+$/)) {
              if (!analyticsVariables.events[eventName]) {
                analyticsVariables.events[eventName] = [];
              }

              let value = eventParts.length > 1 ? eventParts[1] : '';

              if (
                !entryExists(
                  analyticsVariables.events[eventName],
                  ruleName,
                  value
                )
              ) {
                analyticsVariables.events[eventName].push({
                  ruleName: ruleName,
                  value: value,
                });
              }
            }
          });
        } else if (typeof eventsValue === 'object') {
          for (const eventKey in eventsValue) {
            const eventObj = eventsValue[eventKey];
            const eventName = eventObj.name || eventKey;

            if (eventName.match(/^event\d+$/)) {
              if (!analyticsVariables.events[eventName]) {
                analyticsVariables.events[eventName] = [];
              }

              let value = eventObj.value || '';
              const valueStr =
                typeof value === 'string' ? value : JSON.stringify(value);

              if (
                !entryExists(
                  analyticsVariables.events[eventName],
                  ruleName,
                  valueStr
                )
              ) {
                analyticsVariables.events[eventName].push({
                  ruleName: ruleName,
                  value: valueStr,
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error processing rule ${ruleName}:`, error);
    }
  }

  // Function to process an XDM data element
  function processXDMDataElement(deName, de) {
    if (!de.settings || !de.settings.data) {
      return;
    }

    processXDMPath(deName, de.settings.data, '');
    processSpecificXDMPaths(deName, de.settings.data);
  }

  // Function to process XDM paths recursively
  function processXDMPath(deName, obj, currentPath) {
    if (!obj || typeof obj !== 'object') return;

    for (const key in obj) {
      if (!obj.hasOwnProperty(key)) continue;

      const value = obj[key];
      const valueStr =
        typeof value === 'string' ? value : JSON.stringify(value);

      if (key.match(/^eVar\d+$/)) {
        if (!analyticsVariables.eVars[key]) {
          analyticsVariables.eVars[key] = [];
        }

        if (!entryExists(analyticsVariables.eVars[key], deName, valueStr)) {
          analyticsVariables.eVars[key].push({
            ruleName: deName,
            value: valueStr,
          });
        }
      }

      if (key.match(/^prop\d+$/)) {
        if (!analyticsVariables.props[key]) {
          analyticsVariables.props[key] = [];
        }

        if (!entryExists(analyticsVariables.props[key], deName, valueStr)) {
          analyticsVariables.props[key].push({
            ruleName: deName,
            value: valueStr,
          });
        }
      }

      if (key.match(/^event\d+$/)) {
        if (!analyticsVariables.events[key]) {
          analyticsVariables.events[key] = [];
        }

        if (!entryExists(analyticsVariables.events[key], deName, valueStr)) {
          analyticsVariables.events[key].push({
            ruleName: deName,
            value: valueStr,
          });
        }
      }

      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const newPath = currentPath ? `${currentPath}.${key}` : key;
        processXDMPath(deName, obj[key], newPath);
      }
    }
  }

  // Function to process specific XDM paths
  function processSpecificXDMPaths(deName, data) {
    const xdmPaths = [
      { path: '_experience.analytics.customDimensions.eVars', type: 'eVars' },
      { path: '_experience.analytics.customDimensions.props', type: 'props' },
      {
        path: 'xdm._experience.analytics.customDimensions.eVars',
        type: 'eVars',
      },
      {
        path: 'xdm._experience.analytics.customDimensions.props',
        type: 'props',
      },
      { path: 'analytics.customDimensions.eVars', type: 'eVars' },
      { path: 'analytics.customDimensions.props', type: 'props' },
      { path: '_experience.analytics.event1to100', type: 'events' },
      { path: 'xdm._experience.analytics.event1to100', type: 'events' },
      { path: 'analytics.event1to100', type: 'events' },
    ];

    xdmPaths.forEach((pathObj) => {
      const pathParts = pathObj.path.split('.');
      let currentObj = data;

      for (const part of pathParts) {
        if (currentObj && currentObj[part]) {
          currentObj = currentObj[part];
        } else {
          currentObj = null;
          break;
        }
      }

      if (currentObj && typeof currentObj === 'object') {
        for (const key in currentObj) {
          if (!currentObj.hasOwnProperty(key)) continue;

          const value = currentObj[key];
          const valueStr =
            typeof value === 'string' ? value : JSON.stringify(value);

          if (pathObj.type === 'eVars' && key.match(/^eVar\d+$/)) {
            if (!analyticsVariables.eVars[key]) {
              analyticsVariables.eVars[key] = [];
            }

            if (!entryExists(analyticsVariables.eVars[key], deName, valueStr)) {
              analyticsVariables.eVars[key].push({
                ruleName: deName,
                value: valueStr,
              });
            }
          } else if (pathObj.type === 'props' && key.match(/^prop\d+$/)) {
            if (!analyticsVariables.props[key]) {
              analyticsVariables.props[key] = [];
            }

            if (!entryExists(analyticsVariables.props[key], deName, valueStr)) {
              analyticsVariables.props[key].push({
                ruleName: deName,
                value: valueStr,
              });
            }
          } else if (pathObj.type === 'events' && key.match(/^event\d+$/)) {
            if (!analyticsVariables.events[key]) {
              analyticsVariables.events[key] = [];
            }

            if (
              !entryExists(analyticsVariables.events[key], deName, valueStr)
            ) {
              analyticsVariables.events[key].push({
                ruleName: deName,
                value: valueStr,
              });
            }
          }
        }
      }
    });
  }

  // Function to process rules and find data element references
  function processRules(rules, dataElements) {
    rules.forEach((rule) => {
      const ruleName = rule.name;
      const ruleStr = JSON.stringify(rule);

      // Method 1: Look for data element references in the format %dataElement%
      const deMatches = ruleStr.match(/%([^%]+)%/g);
      if (deMatches) {
        const uniqueDataElements = new Set();

        deMatches.forEach((match) => {
          const deName = match.replace(/%/g, '');
          if (!uniqueDataElements.has(deName)) {
            uniqueDataElements.add(deName);
            if (!rulesByDataElement[deName]) {
              rulesByDataElement[deName] = [];
            }
            if (!rulesByDataElement[deName].includes(ruleName)) {
              rulesByDataElement[deName].push(ruleName);
            }
          }
        });
      }

      // Method 2: Look for data element references in the format _satellite.getVar("dataElement")
      const getVarMatches = ruleStr.match(
        /_satellite\.getVar\(["']([^"']+)["']\)/g
      );
      if (getVarMatches) {
        const uniqueDataElements = new Set();

        getVarMatches.forEach((match) => {
          const deNameMatch = match.match(
            /_satellite\.getVar\(["']([^"']+)["']\)/
          );
          if (deNameMatch && deNameMatch[1]) {
            const deName = deNameMatch[1];
            if (!uniqueDataElements.has(deName)) {
              uniqueDataElements.add(deName);
              if (!rulesByDataElement[deName]) {
                rulesByDataElement[deName] = [];
              }
              if (!rulesByDataElement[deName].includes(ruleName)) {
                rulesByDataElement[deName].push(ruleName);
              }
            }
          }
        });
      }
    });
  }

  // Function to check if an entry already exists
  function entryExists(mappings, ruleName, value) {
    return mappings.some(
      (entry) => entry.ruleName === ruleName && entry.value === value
    );
  }

  // Function to analyze the selected variable
  function analyzeSelectedVariable() {
    const selectedVariable = variableSelect.value;

    if (!selectedVariable) {
      alert('Please select a variable first.');
      return;
    }

    // Show loader
    loader.style.display = 'flex';

    // Clear previous results
    clearResults();

    // Get mappings for the selected variable
    let mappings = [];

    if (currentVariableType === 'eVar') {
      mappings = analyticsVariables.eVars[selectedVariable] || [];
    } else if (currentVariableType === 'prop') {
      mappings = analyticsVariables.props[selectedVariable] || [];
    } else if (currentVariableType === 'event') {
      mappings = analyticsVariables.events[selectedVariable] || [];
    }

    // Update the UI with our findings
    updateUI(selectedVariable, mappings);

    // Show the results section
    resultsSection.style.display = 'block';

    // Hide the loader
    loader.style.display = 'none';
  }

  // Function to clear previous results
  function clearResults() {
    document
      .getElementById('mappingsTable')
      .getElementsByTagName('tbody')[0].innerHTML = '';
    document.getElementById('noMappingsMessage').style.display = 'block';
    document.getElementById('mappingCount').textContent = '(0)';
  }

  // Function to update the UI with our findings
  function updateUI(selectedVariable, mappings) {
    const mappingsTable = document
      .getElementById('mappingsTable')
      .getElementsByTagName('tbody')[0];
    const noMappingsMessage = document.getElementById('noMappingsMessage');
    const mappingCount = document.getElementById('mappingCount');

    if (mappings.length > 0) {
      noMappingsMessage.style.display = 'none';
      mappingsTable.innerHTML = '';

      // Sort mappings alphabetically by rule name
      mappings.sort((a, b) => a.ruleName.localeCompare(b.ruleName));

      // Update count
      mappingCount.textContent = `(${mappings.length})`;

      // Create a map to track unique combinations
      const processedEntries = new Set();

      // Add rows to table
      mappings.forEach((item) => {
        // Create unique key for this entry
        const entryKey = `${item.ruleName}|${item.value}`;

        // Skip if we've already processed this combination
        if (processedEntries.has(entryKey)) {
          return;
        }

        // Mark as processed
        processedEntries.add(entryKey);

        const row = mappingsTable.insertRow();

        // Rule Name column
        const cellRule = row.insertCell(0);
        cellRule.innerHTML = `<span class="badge badge-success">${item.ruleName}</span>`;

        // Data Element Value column
        const cellDataElement = row.insertCell(1);
        cellDataElement.textContent = item.value;
      });
    } else {
      mappingCount.textContent = '(0)';
    }
  }
});
