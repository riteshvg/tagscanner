/**
 * Analytics Variable Mapping
 * This script analyzes Adobe Analytics rules in Adobe Launch and maps them to eVars, props, and events
 */

document.addEventListener('DOMContentLoaded', function () {
  console.log('Analytics Variable Mapping page loading...');

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

    // Extract all analytics variables from rules
    extractAnalyticsVariables();
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

  // Function to extract all analytics variables from rules
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

    // Look for adobe-analytics/src/lib/actions/setVariables.js in rules
    console.log('Checking rules for adobe-analytics actions...');
    let foundAnalyticsRules = false;

    rules.forEach((rule) => {
      if (rule.actions) {
        rule.actions.forEach((action) => {
          // Check if this is an Analytics Set Variables action
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
              // Process direct variables in settings
              processAnalyticsRuleAction(rule.name, action);
            }
          }
        });
      }
    });

    // Process data elements to find which rules use each data element
    processDataElementRules(rules, dataElements);

    console.log('Analysis complete.');
    console.log(
      `Found ${Object.keys(analyticsVariables.eVars).length} eVars:`,
      Object.keys(analyticsVariables.eVars)
    );
    console.log(
      `Found ${Object.keys(analyticsVariables.props).length} props:`,
      Object.keys(analyticsVariables.props)
    );
    console.log(
      `Found ${Object.keys(analyticsVariables.events).length} events:`,
      Object.keys(analyticsVariables.events)
    );

    // If no variables were found, create sample data for testing
    if (
      Object.keys(analyticsVariables.eVars).length === 0 &&
      Object.keys(analyticsVariables.props).length === 0 &&
      Object.keys(analyticsVariables.events).length === 0 &&
      !foundAnalyticsRules
    ) {
      console.log(
        'No Analytics variables found. Creating sample data for testing.'
      );
      createSampleData();
    }

    // Populate the dropdown with the initial variable type (eVars)
    populateVariableDropdown();

    // Hide the loader
    loader.style.display = 'none';
  }

  // Function to create sample data for testing
  function createSampleData() {
    // Add sample eVars
    for (let i = 1; i <= 5; i++) {
      analyticsVariables.eVars[`eVar${i}`] = [
        {
          ruleName: 'Sample Analytics Rule',
          value: '%sample_data_element%',
        },
      ];
    }

    // Add sample props
    for (let i = 1; i <= 3; i++) {
      analyticsVariables.props[`prop${i}`] = [
        {
          ruleName: 'Sample Analytics Rule',
          value: '%sample_prop_data_element%',
        },
      ];
    }

    // Add sample events
    for (let i = 1; i <= 2; i++) {
      analyticsVariables.events[`event${i}`] = [
        {
          ruleName: 'Sample Analytics Rule',
          value: 'Direct Value',
        },
      ];
    }

    // Add sample rule references
    rulesByDataElement['sample_data_element'] = ['Sample Analytics Rule'];
    rulesByDataElement['sample_prop_data_element'] = ['Sample Analytics Rule'];
  }

  // Function to check if an entry already exists in the mappings array
  function entryExists(mappings, ruleName, value) {
    return mappings.some(
      (entry) => entry.ruleName === ruleName && entry.value === value
    );
  }

  // Function to process an Analytics rule action
  function processAnalyticsRuleAction(ruleName, action) {
    console.log(`Processing Analytics rule action in rule: ${ruleName}`);

    try {
      // Check if trackerProperties exists
      if (!action.settings.trackerProperties) {
        console.log(`No trackerProperties found in rule: ${ruleName}`);
        return;
      }

      // Process eVars
      if (action.settings.trackerProperties.eVars) {
        for (const eVarKey in action.settings.trackerProperties.eVars) {
          const eVarObj = action.settings.trackerProperties.eVars[eVarKey];

          // Get the variable name from the name property or use the key if not available
          const eVarName = eVarObj.name || eVarKey.replace(/^evar/i, 'eVar');

          if (!analyticsVariables.eVars[eVarName]) {
            analyticsVariables.eVars[eVarName] = [];
          }

          // Get the value property directly
          let value = eVarObj.value || '';

          // Make sure it's a string
          const valueStr =
            typeof value === 'string' ? value : JSON.stringify(value);

          // Add entry if it doesn't exist
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

          // Get the variable name from the name property or use the key if not available
          const propName = propObj.name || propKey.replace(/^prop/i, 'prop');

          if (!analyticsVariables.props[propName]) {
            analyticsVariables.props[propName] = [];
          }

          // Get the value property directly
          let value = propObj.value || '';

          // Make sure it's a string
          const valueStr =
            typeof value === 'string' ? value : JSON.stringify(value);

          // Add entry if it doesn't exist
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
        // Events could be handled differently depending on structure
        let eventsValue = action.settings.trackerProperties.events;

        if (typeof eventsValue === 'string') {
          // Split events string by commas and process each event
          const eventList = eventsValue.split(',').map((e) => e.trim());

          eventList.forEach((eventItem) => {
            // Extract the event name (might be "event1=value" format)
            const eventParts = eventItem.split('=');
            const eventName = eventParts[0].trim();

            if (eventName.match(/^event\d+$/)) {
              if (!analyticsVariables.events[eventName]) {
                analyticsVariables.events[eventName] = [];
              }

              let value = eventParts.length > 1 ? eventParts[1] : '';

              // Add entry if it doesn't exist
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
          // Handle object-based events configuration
          for (const eventKey in eventsValue) {
            const eventObj = eventsValue[eventKey];

            // Get the event name
            const eventName = eventObj.name || eventKey;

            if (eventName.match(/^event\d+$/)) {
              if (!analyticsVariables.events[eventName]) {
                analyticsVariables.events[eventName] = [];
              }

              // Get the value property directly
              let value = eventObj.value || '';

              // Make sure it's a string
              const valueStr =
                typeof value === 'string' ? value : JSON.stringify(value);

              // Add entry if it doesn't exist
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

  // Function to process data elements and find which rules use them
  function processDataElementRules(rules, dataElements) {
    console.log('Processing rules to find data element references...');

    // For each rule
    rules.forEach((rule) => {
      const ruleName = rule.name;

      // Convert the entire rule to a string to search for data element references
      const ruleStr = JSON.stringify(rule);

      // Method 1: Look for data element references in the format %dataElement%
      const deMatches = ruleStr.match(/%([^%]+)%/g);
      if (deMatches) {
        // Use a Set to track unique data element names
        const uniqueDataElements = new Set();

        deMatches.forEach((match) => {
          const deName = match.replace(/%/g, '');

          // Only process if we haven't seen this data element yet
          if (!uniqueDataElements.has(deName)) {
            uniqueDataElements.add(deName);

            // Add this rule to the data element's rule list
            if (!rulesByDataElement[deName]) {
              rulesByDataElement[deName] = [];
            }

            // Check if this rule is already in the list
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
        // Use a Set to track unique data element names
        const uniqueDataElements = new Set();

        getVarMatches.forEach((match) => {
          const deNameMatch = match.match(
            /_satellite\.getVar\(["']([^"']+)["']\)/
          );
          if (deNameMatch && deNameMatch[1]) {
            const deName = deNameMatch[1];

            // Only process if we haven't seen this data element yet
            if (!uniqueDataElements.has(deName)) {
              uniqueDataElements.add(deName);

              // Add this rule to the data element's rule list
              if (!rulesByDataElement[deName]) {
                rulesByDataElement[deName] = [];
              }

              // Check if this rule is already in the list
              if (!rulesByDataElement[deName].includes(ruleName)) {
                rulesByDataElement[deName].push(ruleName);
              }
            }
          }
        });
      }
    });
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
    // Update mappings table
    const mappingsTable = document
      .getElementById('mappingsTable')
      .getElementsByTagName('tbody')[0];
    const noMappingsMessage = document.getElementById('noMappingsMessage');
    const mappingCount = document.getElementById('mappingCount');

    if (mappings.length > 0) {
      noMappingsMessage.style.display = 'none';
      mappingsTable.innerHTML = '';

      // Sort mappings alphabetically by rule name
      mappings.sort((a, b) => {
        return a.ruleName.localeCompare(b.ruleName);
      });

      // Update count
      mappingCount.textContent = `(${mappings.length})`;

      // Create a map to track unique combinations to avoid duplicates
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

        // Data Element Value column - display only the value
        const cellDataElement = row.insertCell(1);
        cellDataElement.textContent = item.value;
      });
    } else {
      mappingCount.textContent = '(0)';
    }
  }
});
