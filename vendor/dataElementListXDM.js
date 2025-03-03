/**
 * XDM Analytics Variable Mapping
 * This script analyzes XDM data elements in Adobe Launch and maps them to eVars, props, and events
 */

document.addEventListener('DOMContentLoaded', function () {
  console.log('XDM Analytics Variable Mapping page loading...');

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

  // Store rule information
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

    // Extract all analytics variables from data elements and rules
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

  // Function to extract all analytics variables from XDM data elements
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

    // Check for data elements with adobe-alloy/dist/lib/dataElements/xdmObject/index.js
    let foundAlloySources = false;
    for (const deName in dataElements) {
      if (dataElements.hasOwnProperty(deName)) {
        const de = dataElements[deName];

        // Check if this is an XDM object data element
        if (
          de.modulePath &&
          de.modulePath.includes(
            'adobe-alloy/dist/lib/dataElements/xdmObject/index.js'
          )
        ) {
          console.log(`Found XDM object data element: ${deName}`);
          foundAlloySources = true;

          // Initialize the rule list for this data element
          if (!rulesByDataElement[deName]) {
            rulesByDataElement[deName] = [];
          }

          // Process this data element for XDM paths containing analytics variables
          processXDMDataElement(deName, de);
        }
      }
    }

    // Process rules to find which ones use each data element
    processRules(rules, dataElements);

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
      Object.keys(analyticsVariables.events).length === 0
    ) {
      console.log('No XDM variables found. Creating sample data for testing.');
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
          dataElement: 'Sample XDM Data Element',
        },
      ];
    }

    // Add sample props
    for (let i = 1; i <= 3; i++) {
      analyticsVariables.props[`prop${i}`] = [
        {
          dataElement: 'Sample XDM Data Element',
        },
      ];
    }

    // Add sample events
    for (let i = 1; i <= 2; i++) {
      analyticsVariables.events[`event${i}`] = [
        {
          dataElement: 'Sample XDM Data Element',
        },
      ];
    }
  }

  // Function to process an XDM data element
  function processXDMDataElement(deName, de) {
    console.log(`Processing XDM data element: ${deName}`);

    // Check if the data element has settings and data
    if (!de.settings || !de.settings.data) {
      console.log(`No data found in XDM data element settings: ${deName}`);
      return;
    }

    // Process the data for XDM paths containing analytics variables
    processXDMPath(deName, de.settings.data, '');

    // Process specific XDM paths that are commonly used for analytics variables
    processSpecificXDMPaths(deName, de.settings.data);
  }

  // Function to process rules and map them to data elements
  function processRules(rules, dataElements) {
    console.log('Processing rules to find data element references...');

    // For each rule
    rules.forEach((rule) => {
      const ruleName = rule.name;

      // Convert the entire rule to a string to search for data element references
      const ruleStr = JSON.stringify(rule);

      // Method 1: Look for data element references in the format %dataElement%
      const deMatches = ruleStr.match(/%([^%]+)%/g);
      if (deMatches) {
        // Create a Set to store unique data element names
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
        // Create a Set to store unique data element names
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

      // Method 3: Check for data element references in conditions
      if (rule.conditions) {
        const conditionsStr = JSON.stringify(rule.conditions);

        // Look for data element references in conditions
        for (const deName in dataElements) {
          // Check for exact matches of the data element name
          if (
            conditionsStr.includes(`"${deName}"`) ||
            conditionsStr.includes(`'${deName}'`) ||
            conditionsStr.includes(`%${deName}%`)
          ) {
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
      }
    });
  }

  // Function to process XDM paths recursively
  function processXDMPath(deName, obj, currentPath) {
    if (!obj || typeof obj !== 'object') return;

    // Check for eVars, props, and events in the current object
    for (const key in obj) {
      if (!obj.hasOwnProperty(key)) continue;

      // Check if this is an eVar
      if (key.match(/^eVar\d+$/)) {
        console.log(
          `Found eVar ${key} in data element ${deName} at path ${currentPath}`
        );

        if (!analyticsVariables.eVars[key]) {
          analyticsVariables.eVars[key] = [];
        }

        // Check if this data element already exists in the variable's mapping
        const exists = analyticsVariables.eVars[key].some(
          (item) => item.dataElement === deName
        );

        if (!exists) {
          analyticsVariables.eVars[key].push({
            dataElement: deName,
          });
        }
      }

      // Check if this is a prop
      if (key.match(/^prop\d+$/)) {
        console.log(
          `Found prop ${key} in data element ${deName} at path ${currentPath}`
        );

        if (!analyticsVariables.props[key]) {
          analyticsVariables.props[key] = [];
        }

        // Check if this data element already exists in the variable's mapping
        const exists = analyticsVariables.props[key].some(
          (item) => item.dataElement === deName
        );

        if (!exists) {
          analyticsVariables.props[key].push({
            dataElement: deName,
          });
        }
      }

      // Check if this is an event
      if (key.match(/^event\d+$/)) {
        console.log(
          `Found event ${key} in data element ${deName} at path ${currentPath}`
        );

        if (!analyticsVariables.events[key]) {
          analyticsVariables.events[key] = [];
        }

        // Check if this data element already exists in the variable's mapping
        const exists = analyticsVariables.events[key].some(
          (item) => item.dataElement === deName
        );

        if (!exists) {
          analyticsVariables.events[key].push({
            dataElement: deName,
          });
        }
      }

      // Recursively process nested objects
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const newPath = currentPath ? `${currentPath}.${key}` : key;
        processXDMPath(deName, obj[key], newPath);
      }
    }
  }

  // Function to process specific XDM paths that are commonly used
  function processSpecificXDMPaths(deName, data) {
    // Common XDM paths for analytics variables
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

    // Check each path
    xdmPaths.forEach((pathObj) => {
      const pathParts = pathObj.path.split('.');
      let currentObj = data;

      // Navigate through the path
      for (const part of pathParts) {
        if (currentObj && currentObj[part]) {
          currentObj = currentObj[part];
        } else {
          currentObj = null;
          break;
        }
      }

      // If we found the path, process the variables
      if (currentObj && typeof currentObj === 'object') {
        console.log(`Found XDM path ${pathObj.path} in data element ${deName}`);

        for (const key in currentObj) {
          if (!currentObj.hasOwnProperty(key)) continue;

          if (pathObj.type === 'eVars' && key.match(/^eVar\d+$/)) {
            console.log(
              `Found eVar ${key} in data element ${deName} at XDM path ${pathObj.path}`
            );

            if (!analyticsVariables.eVars[key]) {
              analyticsVariables.eVars[key] = [];
            }

            // Check if this data element already exists in the variable's mapping
            const exists = analyticsVariables.eVars[key].some(
              (item) => item.dataElement === deName
            );

            if (!exists) {
              analyticsVariables.eVars[key].push({
                dataElement: deName,
              });
            }
          } else if (pathObj.type === 'props' && key.match(/^prop\d+$/)) {
            console.log(
              `Found prop ${key} in data element ${deName} at XDM path ${pathObj.path}`
            );

            if (!analyticsVariables.props[key]) {
              analyticsVariables.props[key] = [];
            }

            // Check if this data element already exists in the variable's mapping
            const exists = analyticsVariables.props[key].some(
              (item) => item.dataElement === deName
            );

            if (!exists) {
              analyticsVariables.props[key].push({
                dataElement: deName,
              });
            }
          } else if (pathObj.type === 'events' && key.match(/^event\d+$/)) {
            console.log(
              `Found event ${key} in data element ${deName} at XDM path ${pathObj.path}`
            );

            if (!analyticsVariables.events[key]) {
              analyticsVariables.events[key] = [];
            }

            // Check if this data element already exists in the variable's mapping
            const exists = analyticsVariables.events[key].some(
              (item) => item.dataElement === deName
            );

            if (!exists) {
              analyticsVariables.events[key].push({
                dataElement: deName,
              });
            }
          }
        }
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

      // Sort mappings alphabetically by data element
      mappings.sort((a, b) => a.dataElement.localeCompare(b.dataElement));

      // Update count
      mappingCount.textContent = `(${mappings.length})`;

      // Create a map to track unique data element names to avoid duplicates
      const processedDataElements = new Set();

      // Add rows to table
      mappings.forEach((item) => {
        // Skip if we've already processed this data element
        if (processedDataElements.has(item.dataElement)) {
          return;
        }

        // Mark as processed
        processedDataElements.add(item.dataElement);

        // Get the rules for this data element
        const rules = rulesByDataElement[item.dataElement] || [];

        // Use a Set to ensure unique rule names
        const uniqueRules = [...new Set(rules)];

        // Create a row for each rule
        uniqueRules.forEach((ruleName) => {
          const row = mappingsTable.insertRow();

          // Rule column
          const cellRule = row.insertCell(0);
          cellRule.innerHTML = `<span class="badge badge-success">${ruleName}</span>`;

          // Data Element column
          const cellDataElement = row.insertCell(1);
          cellDataElement.innerHTML = `<span class="badge badge-primary">${item.dataElement}</span>`;
        });

        // If no rules found, still show the data element with "No rules found"
        if (uniqueRules.length === 0) {
          const row = mappingsTable.insertRow();

          // Rule column
          const cellRule = row.insertCell(0);
          cellRule.innerHTML =
            '<span class="variable-path">No rules found</span>';

          // Data Element column
          const cellDataElement = row.insertCell(1);
          cellDataElement.innerHTML = `<span class="badge badge-primary">${item.dataElement}</span>`;
        }
      });
    } else {
      mappingCount.textContent = '(0)';
    }
  }
});
