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

  // Current variable type
  let currentVariableType = 'eVar';

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

    // Add event listener to the analyze button
    analyzeButton.addEventListener('click', analyzeSelectedVariable);

    // Check data availability and extract variables
    checkDataAvailability();
  }

  // Function to check data availability and extract variables
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

    // Extract variables and populate dropdown
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

    // Extract variables
    extractAnalyticsVariables();
    extractXDMVariables();
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
    const select = document.getElementById('variableSelect');
    select.innerHTML = ''; // Clear existing options

    // Get the current variable type
    const currentType = document.querySelector('.btn-group .active').id;
    let variableList = [];

    // Get the appropriate variable list based on type
    if (currentType === 'eVarTypeBtn') {
      variableList = Object.keys(analyticsVariables.eVars);
    } else if (currentType === 'propTypeBtn') {
      variableList = Object.keys(analyticsVariables.props);
    } else if (currentType === 'eventTypeBtn') {
      variableList = Object.keys(analyticsVariables.events);
    }

    // Check if there are any variables available
    if (variableList.length === 0) {
      // No variables available - disable dropdown and show prompt
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No variables activated';
      select.appendChild(option);
      select.disabled = true;

      // Also disable the analyze button
      document.getElementById('analyzeButton').disabled = true;

      // Hide results section if it's visible
      document.getElementById('resultsSection').style.display = 'none';
    } else {
      // Variables are available - enable dropdown and populate options
      select.disabled = false;
      document.getElementById('analyzeButton').disabled = false;

      // Add default option
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = '-- Select a Variable --';
      select.appendChild(defaultOption);

      // Add options for each variable
      variableList.forEach((variable) => {
        const option = document.createElement('option');
        option.value = variable;
        option.textContent = variable;
        select.appendChild(option);
      });
    }
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
              processAnalyticsRuleAction(rule.name, action, rule.id);
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

    // Process rules to find data element references and sendEvent actions
    processRules(rules, dataElements);

    // Process rules with sendEvent actions
    processSendEventRules(rules);

    // Populate the dropdown with the initial variable type (eVars)
    populateVariableDropdown();

    // Hide the loader
    loader.style.display = 'none';
  }

  // Function to process an Analytics rule action
  function processAnalyticsRuleAction(ruleName, action, ruleId) {
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
            !entryExists(
              analyticsVariables.eVars[eVarName],
              ruleName,
              valueStr,
              ruleId
            )
          ) {
            analyticsVariables.eVars[eVarName].push({
              ruleName: ruleName,
              value: valueStr,
              ruleId: ruleId,
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
            !entryExists(
              analyticsVariables.props[propName],
              ruleName,
              valueStr,
              ruleId
            )
          ) {
            analyticsVariables.props[propName].push({
              ruleName: ruleName,
              value: valueStr,
              ruleId: ruleId,
            });
          }
        }
      }

      // Process events
      if (action.settings.trackerProperties.events) {
        for (const eventKey in action.settings.trackerProperties.events) {
          const eventObj = action.settings.trackerProperties.events[eventKey];
          const eventName =
            eventObj.name || eventKey.replace(/^event/i, 'event');

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
              valueStr,
              ruleId
            )
          ) {
            analyticsVariables.events[eventName].push({
              ruleName: ruleName,
              value: valueStr,
              ruleId: ruleId,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error processing rule action for ${ruleName}:`, error);
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

    // Get rules from sessionStorage
    const rulesValue = sessionStorage.getItem('_satellite._container.rules');
    const rules = rulesValue ? JSON.parse(rulesValue) : [];

    // Find rules that reference this data element
    const referencingRules = rules.filter((rule) => {
      const ruleStr = JSON.stringify(rule);
      return (
        ruleStr.includes(`%${deName}%`) ||
        ruleStr.includes(`_satellite.getVar("${deName}")`)
      );
    });

    for (const key in obj) {
      if (!obj.hasOwnProperty(key)) continue;

      const value = obj[key];
      const valueStr =
        typeof value === 'string' ? value : JSON.stringify(value);

      if (key.match(/^eVar\d+$/)) {
        if (!analyticsVariables.eVars[key]) {
          analyticsVariables.eVars[key] = [];
        }

        // Add an entry for each rule that references this data element
        referencingRules.forEach((rule) => {
          if (
            !entryExists(
              analyticsVariables.eVars[key],
              rule.name,
              valueStr,
              rule.id
            )
          ) {
            analyticsVariables.eVars[key].push({
              ruleName: rule.name,
              value: valueStr,
              ruleId: rule.id,
            });
          }
        });

        // If no referencing rules found, fall back to data element name
        if (
          referencingRules.length === 0 &&
          !entryExists(analyticsVariables.eVars[key], deName, valueStr, null)
        ) {
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

        // Add an entry for each rule that references this data element
        referencingRules.forEach((rule) => {
          if (
            !entryExists(
              analyticsVariables.props[key],
              rule.name,
              valueStr,
              rule.id
            )
          ) {
            analyticsVariables.props[key].push({
              ruleName: rule.name,
              value: valueStr,
              ruleId: rule.id,
            });
          }
        });

        // If no referencing rules found, fall back to data element name
        if (
          referencingRules.length === 0 &&
          !entryExists(analyticsVariables.props[key], deName, valueStr, null)
        ) {
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

        // Add an entry for each rule that references this data element
        referencingRules.forEach((rule) => {
          if (
            !entryExists(
              analyticsVariables.events[key],
              rule.name,
              valueStr,
              rule.id
            )
          ) {
            analyticsVariables.events[key].push({
              ruleName: rule.name,
              value: valueStr,
              ruleId: rule.id,
            });
          }
        });

        // If no referencing rules found, fall back to data element name
        if (
          referencingRules.length === 0 &&
          !entryExists(analyticsVariables.events[key], deName, valueStr, null)
        ) {
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
    ];

    // Get rules from sessionStorage
    const rulesValue = sessionStorage.getItem('_satellite._container.rules');
    const rules = rulesValue ? JSON.parse(rulesValue) : [];

    // Find rules that reference this data element
    const referencingRules = rules.filter((rule) => {
      const ruleStr = JSON.stringify(rule);
      return (
        ruleStr.includes(`%${deName}%`) ||
        ruleStr.includes(`_satellite.getVar("${deName}")`)
      );
    });

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

            // Add an entry for each rule that references this data element
            referencingRules.forEach((rule) => {
              if (
                !entryExists(
                  analyticsVariables.eVars[key],
                  rule.name,
                  valueStr,
                  rule.id
                )
              ) {
                analyticsVariables.eVars[key].push({
                  ruleName: rule.name,
                  value: valueStr,
                  ruleId: rule.id,
                });
              }
            });

            // If no referencing rules found, fall back to data element name
            if (
              referencingRules.length === 0 &&
              !entryExists(
                analyticsVariables.eVars[key],
                deName,
                valueStr,
                null
              )
            ) {
              analyticsVariables.eVars[key].push({
                ruleName: deName,
                value: valueStr,
              });
            }
          } else if (pathObj.type === 'props' && key.match(/^prop\d+$/)) {
            if (!analyticsVariables.props[key]) {
              analyticsVariables.props[key] = [];
            }

            // Add an entry for each rule that references this data element
            referencingRules.forEach((rule) => {
              if (
                !entryExists(
                  analyticsVariables.props[key],
                  rule.name,
                  valueStr,
                  rule.id
                )
              ) {
                analyticsVariables.props[key].push({
                  ruleName: rule.name,
                  value: valueStr,
                  ruleId: rule.id,
                });
              }
            });

            // If no referencing rules found, fall back to data element name
            if (
              referencingRules.length === 0 &&
              !entryExists(
                analyticsVariables.props[key],
                deName,
                valueStr,
                null
              )
            ) {
              analyticsVariables.props[key].push({
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
  function entryExists(mappings, ruleName, value, ruleId) {
    return mappings.some(
      (item) =>
        item.ruleName === ruleName &&
        item.value === value &&
        (ruleId ? item.ruleId === ruleId : true)
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

      // Get rules from sessionStorage for the Rule Name column
      const rulesValue = sessionStorage.getItem('_satellite._container.rules');
      const rules = rulesValue ? JSON.parse(rulesValue) : [];

      // Create a map of rule IDs to rule names
      const ruleNameMap = {};
      rules.forEach((rule) => {
        ruleNameMap[rule.id] = rule.name;
        // Debug log to check each rule
        console.log(`Adding rule to map: ${rule.name}, ID: ${rule.id}`);
      });

      // Debug log to check the rule IDs in the map
      console.log('Rule ID to Name Map:', ruleNameMap);

      // Add rows to table
      mappings.forEach((item) => {
        // Debug log to check each mapping item
        console.log('Mapping item:', item);

        // Create unique key for this entry
        const entryKey = `${item.ruleName}|${item.value}`;

        // Skip if we've already processed this combination
        if (processedEntries.has(entryKey)) {
          return;
        }

        // Mark as processed
        processedEntries.add(entryKey);

        const row = mappingsTable.insertRow();

        // Column #1: Rule Name
        const cellRuleName = row.insertCell(0);

        // For Column #1, use the rule name directly from the rule object
        let displayRuleName = item.ruleName;

        // If we have a rule ID and it exists in the map, use that name
        if (item.ruleId && ruleNameMap[item.ruleId]) {
          // Use the rule name from the rule object (e.g., "[AA-WebSDK] Flight Schedule Form Start")
          displayRuleName = ruleNameMap[item.ruleId];
          console.log(
            `Using rule name for Column #1: ${displayRuleName}, ID: ${item.ruleId}`
          );
        } else {
          console.log(
            `No rule ID found or not in map, using: ${displayRuleName}, ID: ${item.ruleId}`
          );

          // Try to find the rule by name in the rules array
          const matchingRule = rules.find(
            (rule) => rule.name === item.ruleName
          );
          if (matchingRule) {
            displayRuleName = matchingRule.name;
            console.log(`Found rule by name: ${displayRuleName}`);
          }
        }

        cellRuleName.innerHTML = `<span class="badge badge-primary">${displayRuleName}</span>`;

        // Column #2: Data Element Value
        const cellDataElement = row.insertCell(1);
        cellDataElement.textContent = item.value;

        // Column #3: View Details Button
        const cellViewDetails = row.insertCell(2);

        if (item.ruleId) {
          // Create a button to view rule details
          const viewButton = document.createElement('button');
          viewButton.className = 'btn btn-sm btn-primary';
          viewButton.textContent = 'View Details';

          // Get the rule name for the link
          let ruleName = item.ruleName;
          if (ruleNameMap[item.ruleId]) {
            ruleName = ruleNameMap[item.ruleId];
          }

          // Set up the click event to navigate to the rule details page
          viewButton.onclick = function () {
            // Navigate to the rule details page using the rule name parameter
            window.location.href = `ruleforVariable.html?rulename=${encodeURIComponent(
              ruleName
            )}&variableName=${encodeURIComponent(
              selectedVariable
            )}&variableType=${encodeURIComponent(currentVariableType)}`;

            // Log for debugging
            console.log(`Navigating to rule details for rule: ${ruleName}`);
          };

          cellViewDetails.appendChild(viewButton);
        } else {
          // If we have the rule name but not the ID, try to find the rule
          const matchingRule = rules.find(
            (rule) => rule.name === item.ruleName
          );
          if (matchingRule) {
            // Create a button to view rule details
            const viewButton = document.createElement('button');
            viewButton.className = 'btn btn-sm btn-primary';
            viewButton.textContent = 'View Details';

            // Set up the click event to navigate to the rule details page
            viewButton.onclick = function () {
              // Navigate to the rule details page using the rule name parameter
              window.location.href = `ruleforVariable.html?rulename=${encodeURIComponent(
                matchingRule.name
              )}&variableName=${encodeURIComponent(
                selectedVariable
              )}&variableType=${encodeURIComponent(currentVariableType)}`;

              // Log for debugging
              console.log(
                `Navigating to rule details for rule: ${matchingRule.name}`
              );
            };

            cellViewDetails.appendChild(viewButton);
          } else {
            // If no rule is available
            cellViewDetails.textContent = 'No details available';
          }
        }
      });
    } else {
      mappingCount.textContent = '(0)';
      noMappingsMessage.style.display = 'block';
      mappingsTable.innerHTML = '';
    }
  }

  // Function to process rules with sendEvent actions
  function processSendEventRules(rules) {
    rules.forEach((rule) => {
      // Debug log to check each rule
      console.log('Processing rule:', rule.name, 'ID:', rule.id);

      if (rule.actions) {
        rule.actions.forEach((action) => {
          if (
            action.modulePath &&
            action.modulePath.includes(
              'adobe-alloy/dist/lib/actions/sendEvent/index.js'
            )
          ) {
            console.log(
              `Found sendEvent action in rule: ${rule.name}, ID: ${rule.id}`
            );

            // Process the sendEvent action - pass the actual rule name and ID from the rule object
            // The rule name will be used for Column #1 in the UI
            processSendEventAction(rule.name, action, rule.id);
          }
        });
      }
    });
  }

  // Function to process a sendEvent action
  function processSendEventAction(ruleName, action, ruleId) {
    try {
      if (!action.settings || !action.settings.xdm) {
        return;
      }

      // Debug log to check the ruleId
      console.log(
        `Processing sendEvent action for rule: ${ruleName}, ID: ${ruleId}`
      );

      // The XDM object can be a data element reference or an object
      let xdmValue = action.settings.xdm;

      if (
        typeof xdmValue === 'string' &&
        xdmValue.startsWith('%') &&
        xdmValue.endsWith('%')
      ) {
        // This is a data element reference
        const deName = xdmValue.substring(1, xdmValue.length - 1);

        // Add this to eVars for now (we can refine this later)
        const eVarName = 'XDM: ' + deName;

        if (!analyticsVariables.eVars[eVarName]) {
          analyticsVariables.eVars[eVarName] = [];
        }

        if (
          !entryExists(
            analyticsVariables.eVars[eVarName],
            ruleName,
            deName,
            ruleId
          )
        ) {
          // Store the rule ID to be used for looking up the actual rule name in updateUI
          analyticsVariables.eVars[eVarName].push({
            ruleName: ruleName, // This is the actual rule name from the rule object
            value: deName,
            ruleId: ruleId,
          });
        }
      } else if (typeof xdmValue === 'object') {
        // This is an inline XDM object
        // Process each property in the XDM object
        for (const key in xdmValue) {
          if (xdmValue.hasOwnProperty(key)) {
            const value = xdmValue[key];
            const eVarName = 'XDM: ' + key;

            if (!analyticsVariables.eVars[eVarName]) {
              analyticsVariables.eVars[eVarName] = [];
            }

            const valueStr =
              typeof value === 'string' ? value : JSON.stringify(value);

            if (
              !entryExists(
                analyticsVariables.eVars[eVarName],
                ruleName,
                valueStr,
                ruleId
              )
            ) {
              // Store the rule ID to be used for looking up the actual rule name in updateUI
              analyticsVariables.eVars[eVarName].push({
                ruleName: ruleName, // This is the actual rule name from the rule object
                value: valueStr,
                ruleId: ruleId,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(
        `Error processing sendEvent action for ${ruleName}:`,
        error
      );
    }
  }
});
