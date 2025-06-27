document.addEventListener('DOMContentLoaded', function () {
  console.log('Summary page loading...');

  // Move the tour button to the header at the beginning
  const summaryHeader = document.querySelector(
    'div[style="background-color: #4e73df"] h5'
  );
  if (summaryHeader) {
    const tourButton = document.createElement('button');
    tourButton.innerHTML = '<i class="fas fa-question-circle"></i> Tour Guide';
    tourButton.className = 'btn btn-sm btn-info ml-2';
    tourButton.style.float = 'right';
    tourButton.addEventListener('click', function () {
      startTour();
    });
    summaryHeader.appendChild(tourButton);
  }

  // Get data from sessionStorage
  const de_value = sessionStorage.getItem('_satellite._container.dataElements');
  const rule_value = sessionStorage.getItem('_satellite._container.rules');
  const extension_value = sessionStorage.getItem(
    '_satellite._container.extension'
  );

  if (!de_value || !rule_value) {
    document.getElementById('set_display').style.display = 'none';
    document.querySelector('.container-fluid').innerHTML =
      '<div class="alert alert-danger mt-4">No data found. Please refresh the website and reload the extension.</div>';
    return;
  }

  // Remove all h6 headers from component lists
  const headers = document.querySelectorAll('.component-list h6');
  headers.forEach((header) => {
    header.style.display = 'none';
  });

  try {
    const dataElements = JSON.parse(de_value);
    const rules = JSON.parse(rule_value);
    const extensions = extension_value ? JSON.parse(extension_value) : {};

    console.log('Data elements parsed:', Object.keys(dataElements).length);
    console.log('Rules parsed:', rules.length);
    console.log('Extensions parsed:', Object.keys(extensions).length);

    // Initialize usage tracking
    const usageData = {
      dataElements: {},
      rules: {},
      extensions: {},
    };

    // Calculate size function
    const calculateSize = (obj) => {
      let size = new Blob([JSON.stringify(obj)]).size;
      return Number((size / 1000).toFixed(2)); // Size in KB
    };

    // Initialize all extensions as unused and calculate their sizes
    let totalExtSize = 0;
    let unusedExtSize = 0;

    Object.keys(extensions).forEach((extName) => {
      const size = calculateSize(extensions[extName]);
      totalExtSize += size;

      usageData.extensions[extName] = {
        name: extensions[extName].displayName || extName,
        used: false,
        usedInRules: [],
        usedInDataElements: [],
        size: size,
      };
    });

    // Initialize all data elements as unused and calculate their sizes
    let totalDeSize = 0;
    let unusedDeSize = 0;

    Object.keys(dataElements).forEach((deName) => {
      const size = calculateSize(dataElements[deName]);
      totalDeSize += size;

      usageData.dataElements[deName] = {
        used: false,
        usedInRules: [],
        usedInDataElements: [],
        size: size,
      };

      // Check if this data element uses an extension
      if (dataElements[deName].modulePath) {
        const modulePath = dataElements[deName].modulePath.split('/')[0];
        if (usageData.extensions[modulePath]) {
          usageData.extensions[modulePath].used = true;
          usageData.extensions[modulePath].usedInDataElements.push(deName);
        }
      }
    });

    // Initialize all rules as unused and calculate their sizes
    let totalRuleSize = 0;
    let unusedRuleSize = 0;

    rules.forEach((rule) => {
      const size = calculateSize(rule);
      totalRuleSize += size;

      usageData.rules[rule.id] = {
        name: rule.name,
        used: false,
        hasEvents: false,
        size: size,
      };

      // Rules with events are considered "used" as they can be triggered
      if (rule.events && rule.events.length > 0) {
        usageData.rules[rule.id].used = true;
        usageData.rules[rule.id].hasEvents = true;

        // Check if rule events use extensions
        rule.events.forEach((event) => {
          if (event.modulePath) {
            const modulePath = event.modulePath.split('/')[0];
            if (usageData.extensions[modulePath]) {
              usageData.extensions[modulePath].used = true;
              usageData.extensions[modulePath].usedInRules.push(rule.name);
            }
          }
        });
      }

      // Check if rule conditions use extensions
      if (rule.conditions && rule.conditions.length > 0) {
        rule.conditions.forEach((condition) => {
          if (condition.modulePath) {
            const modulePath = condition.modulePath.split('/')[0];
            if (usageData.extensions[modulePath]) {
              usageData.extensions[modulePath].used = true;
              usageData.extensions[modulePath].usedInRules.push(rule.name);
            }
          }
        });
      }

      // Check if rule actions use extensions
      if (rule.actions && rule.actions.length > 0) {
        rule.actions.forEach((action) => {
          if (action.modulePath) {
            const modulePath = action.modulePath.split('/')[0];
            if (usageData.extensions[modulePath]) {
              usageData.extensions[modulePath].used = true;
              usageData.extensions[modulePath].usedInRules.push(rule.name);
            }
          }
        });
      }
    });

    // Function to find data element references in an object
    function findDataElementReferences(
      obj,
      ruleId,
      ruleName,
      dataElements,
      usageData
    ) {
      if (!obj) return;

      // If it's a string, check for data element syntax
      if (typeof obj === 'string') {
        // Check for %...% syntax
        if (obj.indexOf('%') > -1) {
          const matches = obj.match(/%([^%]+)%/g);
          if (matches) {
            matches.forEach((match) => {
              const dataElementName = match.replace(/%/g, '');
              if (dataElementName && dataElements[dataElementName]) {
                usageData.dataElements[dataElementName].used = true;
                usageData.dataElements[dataElementName].usedInRules.push(
                  ruleName
                );
              }
            });
          }
        }

        // Check for _satellite.getVar syntax
        if (obj.indexOf('_satellite.getVar') > -1) {
          const matches = obj.match(/_satellite\.getVar\(['"](.*?)['"]\)/g);
          if (matches) {
            matches.forEach((match) => {
              const dataElementName = match.replace(
                /_satellite\.getVar\(['"](.*?)['"]\)/,
                '$1'
              );
              if (dataElementName && dataElements[dataElementName]) {
                usageData.dataElements[dataElementName].used = true;
                usageData.dataElements[dataElementName].usedInRules.push(
                  ruleName
                );
              }
            });
          }
        }

        return;
      }

      // If it's not an object, return
      if (typeof obj !== 'object') return;

      // If it's an array, process each item
      if (Array.isArray(obj)) {
        obj.forEach((item) =>
          findDataElementReferences(
            item,
            ruleId,
            ruleName,
            dataElements,
            usageData
          )
        );
        return;
      }

      // Process object properties
      for (const key in obj) {
        // Skip if not own property
        if (!obj.hasOwnProperty(key)) continue;

        // Check if the key itself contains a data element reference
        if (typeof key === 'string' && key.indexOf('%') > -1) {
          const matches = key.match(/%([^%]+)%/g);
          if (matches) {
            matches.forEach((match) => {
              const dataElementName = match.replace(/%/g, '');
              if (dataElementName && dataElements[dataElementName]) {
                usageData.dataElements[dataElementName].used = true;
                usageData.dataElements[dataElementName].usedInRules.push(
                  ruleName
                );
              }
            });
          }
        }

        // Check the value
        findDataElementReferences(
          obj[key],
          ruleId,
          ruleName,
          dataElements,
          usageData
        );
      }
    }

    // Function to find data element references in data elements
    function findDataElementReferencesInDataElement(
      obj,
      sourceDeName,
      dataElements,
      usageData
    ) {
      if (!obj) return;

      // If it's a string, check for data element syntax
      if (typeof obj === 'string') {
        // Check for %...% syntax
        if (obj.indexOf('%') > -1) {
          const matches = obj.match(/%([^%]+)%/g);
          if (matches) {
            matches.forEach((match) => {
              const dataElementName = match.replace(/%/g, '');
              if (
                dataElementName &&
                dataElements[dataElementName] &&
                dataElementName !== sourceDeName
              ) {
                usageData.dataElements[dataElementName].used = true;
                usageData.dataElements[dataElementName].usedInDataElements.push(
                  sourceDeName
                );
              }
            });
          }
        }

        // Check for _satellite.getVar syntax
        if (obj.indexOf('_satellite.getVar') > -1) {
          const matches = obj.match(/_satellite\.getVar\(['"](.*?)['"]\)/g);
          if (matches) {
            matches.forEach((match) => {
              const dataElementName = match.replace(
                /_satellite\.getVar\(['"](.*?)['"]\)/,
                '$1'
              );
              if (
                dataElementName &&
                dataElements[dataElementName] &&
                dataElementName !== sourceDeName
              ) {
                usageData.dataElements[dataElementName].used = true;
                usageData.dataElements[dataElementName].usedInDataElements.push(
                  sourceDeName
                );
              }
            });
          }
        }

        return;
      }

      // If it's not an object, return
      if (typeof obj !== 'object') return;

      // If it's an array, process each item
      if (Array.isArray(obj)) {
        obj.forEach((item) =>
          findDataElementReferencesInDataElement(
            item,
            sourceDeName,
            dataElements,
            usageData
          )
        );
        return;
      }

      // Process object properties
      for (const key in obj) {
        // Skip if not own property
        if (!obj.hasOwnProperty(key)) continue;

        // Check if the key itself contains a data element reference
        if (typeof key === 'string' && key.indexOf('%') > -1) {
          const matches = key.match(/%([^%]+)%/g);
          if (matches) {
            matches.forEach((match) => {
              const dataElementName = match.replace(/%/g, '');
              if (
                dataElementName &&
                dataElements[dataElementName] &&
                dataElementName !== sourceDeName
              ) {
                usageData.dataElements[dataElementName].used = true;
                usageData.dataElements[dataElementName].usedInDataElements.push(
                  sourceDeName
                );
              }
            });
          }
        }

        // Check the value
        findDataElementReferencesInDataElement(
          obj[key],
          sourceDeName,
          dataElements,
          usageData
        );
      }
    }

    // Analyze data element usage in rules
    rules.forEach((rule) => {
      // Check rule actions
      if (rule.actions && rule.actions.length) {
        rule.actions.forEach((action) => {
          findDataElementReferences(
            action,
            rule.id,
            rule.name,
            dataElements,
            usageData
          );
        });
      }

      // Check rule conditions
      if (rule.conditions && rule.conditions.length) {
        rule.conditions.forEach((condition) => {
          findDataElementReferences(
            condition,
            rule.id,
            rule.name,
            dataElements,
            usageData
          );
        });
      }

      // Check rule events
      if (rule.events && rule.events.length) {
        rule.events.forEach((event) => {
          findDataElementReferences(
            event,
            rule.id,
            rule.name,
            dataElements,
            usageData
          );
        });
      }
    });

    // Analyze data element references in other data elements
    Object.keys(dataElements).forEach((deName) => {
      const de = dataElements[deName];
      if (de.settings) {
        findDataElementReferencesInDataElement(
          de.settings,
          deName,
          dataElements,
          usageData
        );
      }
    });

    // Count unused components and their sizes
    const unusedDataElements = Object.keys(usageData.dataElements).filter(
      (deName) => !usageData.dataElements[deName].used
    );

    unusedDataElements.forEach((deName) => {
      unusedDeSize += usageData.dataElements[deName].size;
    });

    const unusedRules = Object.keys(usageData.rules).filter(
      (ruleId) => !usageData.rules[ruleId].used
    );

    unusedRules.forEach((ruleId) => {
      unusedRuleSize += usageData.rules[ruleId].size;
    });

    // Count unused extensions
    const unusedExtensions = Object.keys(usageData.extensions).filter(
      (extName) => !usageData.extensions[extName].used
    );

    unusedExtensions.forEach((extName) => {
      unusedExtSize += usageData.extensions[extName].size;
    });

    // Update the UI
    document.getElementById('total-de-count').textContent =
      Object.keys(dataElements).length;
    document.getElementById('unused-de-count').textContent =
      unusedDataElements.length;

    document.getElementById('total-rule-count').textContent = rules.length;
    document.getElementById('unused-rule-count').textContent =
      unusedRules.length;

    // Add size information to the UI
    const deCardBody = document.querySelector(
      '.data-element-card .summary-card-body'
    );
    const ruleCardBody = document.querySelector(
      '.rule-card .summary-card-body'
    );

    const deSizeInfo = document.createElement('div');
    deSizeInfo.className = 'text-center mt-3';
    deSizeInfo.innerHTML = `
      <div class="unused-label">You save</div>
      <div class="unused-count">${unusedDeSize.toFixed(2)} KB - (${Math.round(
      (unusedDataElements.length / Object.keys(dataElements).length) * 100
    )}%) </div>
      <div class="unused-label">of <strong> ${totalDeSize.toFixed(
        2
      )}</strong> KB total if the following data elements are disabled.</div>
    `;
    deCardBody.querySelector('.row').after(deSizeInfo);

    const ruleSizeInfo = document.createElement('div');
    ruleSizeInfo.className = 'text-center mt-3';
    ruleSizeInfo.innerHTML = `
      <div class="unused-label">You save</div>
      <div class="unused-count">${unusedRuleSize.toFixed(2)} KB - (${
      rules.length > 0
        ? Math.round((unusedRules.length / rules.length) * 100)
        : 0
    }%)</div>
      <div class="unused-label">of ${totalRuleSize.toFixed(
        2
      )} KB total if the rules are disabled.</div>
    `;
    ruleCardBody.querySelector('.row').after(ruleSizeInfo);

    // Get property information from sessionStorage
    const propertyName =
      sessionStorage.getItem('launch_property_name') || 'Unknown Property';
    const propertyEnvironment =
      sessionStorage.getItem('launch_property_environment') || 'Production';
    const tagScannerVersion =
      sessionStorage.getItem('tagScanner_version') || '1.6.4';

    // Get current date and time for scan timestamp
    const scanDate = new Date();
    const scanDateStr = scanDate.toLocaleDateString();
    const scanTimeStr = scanDate.toLocaleTimeString();
    const scanTimestamp = `${scanDateStr} ${scanTimeStr}`;

    // Create property details card
    const propertyDetailsCard = document.createElement('div');
    propertyDetailsCard.className =
      'card shadow mb-4 summary-card property-details-card';
    propertyDetailsCard.innerHTML = `
      <div class="summary-card-header" style="background-color: #36b9cc;">
        <i class="fas fa-info-circle mr-2"></i> Property Details
      </div>
      <div class="summary-card-body">
        <div class="row mb-3">
          <div class="col-md-4">
            <strong>Property Name:</strong>
          </div>
          <div class="col-md-8">
            ${propertyName}
          </div>
        </div>
        <div class="row mb-3">
          <div class="col-md-4">
            <strong>Environment:</strong>
          </div>
          <div class="col-md-8">
            ${propertyEnvironment}
          </div>
        </div>
        <div class="row mb-3">
          <div class="col-md-4">
            <strong>Scan Date:</strong>
          </div>
          <div class="col-md-8">
            ${scanTimestamp}
          </div>
        </div>
        <div class="row mb-3">
          <div class="col-md-4">
            <strong>Data Elements:</strong>
          </div>
          <div class="col-md-8">
            ${Object.keys(dataElements).length} (${
      unusedDataElements.length
    } unused)
          </div>
        </div>
        <div class="row mb-3">
          <div class="col-md-4">
            <strong>Rules:</strong>
          </div>
          <div class="col-md-8">
            ${rules.length} (${unusedRules.length} unused)
          </div>
        </div>
        <div class="row mb-3">
          <div class="col-md-4">
            <strong>Extensions:</strong>
          </div>
          <div class="col-md-8">
            ${Object.keys(extensions).length} (${
      unusedExtensions.length
    } unused)
          </div>
        </div>
        <div class="row mb-3">
          <div class="col-md-4">
            <strong>Total Components:</strong>
          </div>
          <div class="col-md-8">
            ${
              Object.keys(dataElements).length +
              rules.length +
              Object.keys(extensions).length
            }
          </div>
        </div>
        <div class="row mb-3">
          <div class="col-md-4">
            <strong>Total Size:</strong>
          </div>
          <div class="col-md-8">
            ${(totalDeSize + totalRuleSize + totalExtSize).toFixed(2)} KB
          </div>
        </div>
        <div class="row">
          <div class="col-md-4">
            <strong>TagScanner Version:</strong>
          </div>
          <div class="col-md-8">
            1.6.4
          </div>
        </div>
      </div>
    `;

    // Create copy button for property details card
    const propDetailsCopyButton = document.createElement('div');
    propDetailsCopyButton.innerHTML = `<i class="fas fa-copy mr-1"></i> Copy Details`;
    propDetailsCopyButton.className = 'btn btn-sm btn-outline-light';
    propDetailsCopyButton.style.fontSize = '0.8rem';
    propDetailsCopyButton.style.cursor = 'pointer';
    propDetailsCopyButton.style.float = 'right';
    propDetailsCopyButton.style.marginTop = '-2px';
    propDetailsCopyButton.addEventListener('click', function () {
      copyCardToClipboard(
        propertyDetailsCard.querySelector('.summary-card-body'),
        'Property Details'
      );
    });

    // Add button to the card header
    propertyDetailsCard
      .querySelector('.summary-card-header')
      .appendChild(propDetailsCopyButton);

    // Create extension card and add it to the UI
    const extensionCard = document.createElement('div');
    extensionCard.className = 'card shadow mb-4 summary-card extension-card';
    extensionCard.innerHTML = `
      <div class="summary-card-header" style="background-color: #4e73df;">
        <i class="fas fa-puzzle-piece mr-2"></i> Extensions
      </div>
      <div class="summary-card-body">
        <div class="row">
          <div class="col-md-6 text-center">
            <div class="unused-count" id="unused-ext-count">${
              unusedExtensions.length
            }</div>
            <div class="unused-label">Unused</div>
          </div>
          <div class="col-md-6 text-center">
            <div class="unused-count" id="total-ext-count">${
              Object.keys(extensions).length
            }</div>
            <div class="unused-label">Total</div>
          </div>
        </div>
        <div class="component-list">
          <h6 class="mt-3">Unused Extensions:</h6>
          <ul id="unused-ext-list">
            ${unusedExtensions
              .map(
                (extName) => `<li>${usageData.extensions[extName].name}</li>`
              )
              .join('')}
          </ul>
        </div>
      </div>
    `;

    // Reorganize the card layout
    const dataElementCard = document.querySelector('.data-element-card');
    const ruleCard = document.querySelector('.rule-card');
    const parentRow = dataElementCard.parentNode.parentNode;

    // Clear the original layout
    parentRow.innerHTML = '';

    // Create first row with data element card and rule card
    const firstRow = document.createElement('div');
    firstRow.className = 'row mt-4';

    const deCol = document.createElement('div');
    deCol.className = 'col-md-6';
    deCol.appendChild(dataElementCard);

    const ruleCol = document.createElement('div');
    ruleCol.className = 'col-md-6';
    ruleCol.appendChild(ruleCard);

    firstRow.appendChild(deCol);
    firstRow.appendChild(ruleCol);

    // Create second row with extension card and property details card
    const secondRow = document.createElement('div');
    secondRow.className = 'row mt-2';

    const extCol = document.createElement('div');
    extCol.className = 'col-md-6';
    extCol.appendChild(extensionCard);

    const propertyCol = document.createElement('div');
    propertyCol.className = 'col-md-6';
    propertyCol.appendChild(propertyDetailsCard);

    secondRow.appendChild(extCol);
    secondRow.appendChild(propertyCol);

    // Add the rows to the parent container
    const container = parentRow.parentNode;
    container.appendChild(firstRow);
    container.appendChild(secondRow);

    // Add extension size information
    const extCardBody = extensionCard.querySelector('.summary-card-body');
    const extSizeInfo = document.createElement('div');
    extSizeInfo.className = 'text-center mt-3';
    extSizeInfo.innerHTML = `
      <div class="unused-label">You save</div>
      <div class="unused-count">${unusedExtSize.toFixed(2)} KB - (${Math.round(
      (unusedExtensions.length / Object.keys(extensions).length) * 100
    )}%)</div>
      <div class="unused-label">of ${totalExtSize.toFixed(
        2
      )} KB total if the extensions are disabled.</div>
    `;
    extCardBody.querySelector('.row').after(extSizeInfo);

    // Replace the unordered list with a table for data elements
    const unusedDeList = document.getElementById('unused-de-list');
    const deParent = unusedDeList.parentNode;

    // Create table element with reduced size
    const deTable = document.createElement('table');
    deTable.className = 'table table-bordered mt-3 tablesorter';
    deTable.id = 'de-table';

    // Create table element for rules
    const ruleTable = document.createElement('table');
    ruleTable.className = 'table table-sm table-bordered mt-3 tablesorter';
    ruleTable.id = 'rule-table';
    ruleTable.style.fontSize = '0.75rem';

    // Create table element for extensions
    const extTable = document.createElement('table');
    extTable.className = 'table table-sm table-bordered mt-3 tablesorter';
    extTable.id = 'ext-table';
    extTable.style.fontSize = '0.75rem';

    // Copy table to clipboard
    // Add copy button after the table
    const deCopyButton = document.createElement('div');
    deCopyButton.innerHTML = `<i class="fas fa-copy mr-1"></i> Copy Table`;
    deCopyButton.className = 'btn btn-sm btn-outline-light';
    deCopyButton.style.fontSize = '0.8rem';
    deCopyButton.style.cursor = 'pointer';
    deCopyButton.style.float = 'right';
    deCopyButton.style.marginTop = '-2px';
    deCopyButton.addEventListener('click', function () {
      copyTableToClipboard(deTable, 'Data Elements');
    });
    // Add button to the data element card header
    document
      .querySelector('.data-element-card .summary-card-header')
      .appendChild(deCopyButton);

    // Create table header
    const deTableHead = document.createElement('thead');
    deTableHead.innerHTML = `
      <tr>
        <th>Data Element Name</th>
        <th>Size (KB)</th>
      </tr>
    `;
    deTable.appendChild(deTableHead);

    // Create table body
    const deTableBody = document.createElement('tbody');
    unusedDataElements.forEach((deName) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      const sizeCell = document.createElement('td');

      nameCell.textContent = deName;
      sizeCell.textContent = usageData.dataElements[deName].size;
      sizeCell.setAttribute(
        'data-sort-value',
        usageData.dataElements[deName].size
      ); // For proper numeric sorting
      sizeCell.style.textAlign = 'right';

      row.appendChild(nameCell);
      row.appendChild(sizeCell);
      deTableBody.appendChild(row);
    });
    deTable.appendChild(deTableBody);

    // Replace the list with the table
    deParent.removeChild(unusedDeList);

    // Create a scrollable container for the table
    const deTableContainer = document.createElement('div');
    //deTableContainer.style.maxHeight = '200px';
    deTableContainer.style.overflowY = 'auto';
    deTableContainer.style.marginBottom = '10px';
    deTableContainer.appendChild(deTable);

    deParent.appendChild(deTableContainer);

    // Do the same for rules
    const unusedRuleList = document.getElementById('unused-rule-list');
    const ruleParent = unusedRuleList.parentNode;

    // Add copy button after the table
    const ruleCopyButton = document.createElement('div');
    ruleCopyButton.innerHTML = `<i class="fas fa-copy mr-1"></i> Copy Table`;
    ruleCopyButton.className = 'btn btn-sm btn-outline-light';
    ruleCopyButton.style.fontSize = '0.8rem';
    ruleCopyButton.style.cursor = 'pointer';
    ruleCopyButton.style.float = 'right';
    ruleCopyButton.style.marginTop = '-2px';
    ruleCopyButton.addEventListener('click', function () {
      copyTableToClipboard(ruleTable, 'Rules');
    });
    // Add button to the rule card header
    document
      .querySelector('.rule-card .summary-card-header')
      .appendChild(ruleCopyButton);

    // Create table header
    const ruleTableHead = document.createElement('thead');
    ruleTableHead.innerHTML = `
      <tr>
        <th>Rule Name</th>
        <th>Size (KB)</th>
      </tr>
    `;
    ruleTable.appendChild(ruleTableHead);

    // Create table body
    const ruleTableBody = document.createElement('tbody');
    unusedRules.forEach((ruleId) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      const sizeCell = document.createElement('td');

      nameCell.textContent = usageData.rules[ruleId].name;
      sizeCell.textContent = usageData.rules[ruleId].size;
      sizeCell.setAttribute('data-sort-value', usageData.rules[ruleId].size); // For proper numeric sorting
      sizeCell.style.textAlign = 'right';

      row.appendChild(nameCell);
      row.appendChild(sizeCell);
      ruleTableBody.appendChild(row);
    });
    ruleTable.appendChild(ruleTableBody);

    // Replace the list with the table
    ruleParent.removeChild(unusedRuleList);

    // Create a scrollable container for the table
    const ruleTableContainer = document.createElement('div');
    ruleTableContainer.style.maxHeight = '200px';
    ruleTableContainer.style.overflowY = 'auto';
    ruleTableContainer.style.marginBottom = '10px';
    ruleTableContainer.appendChild(ruleTable);

    ruleParent.appendChild(ruleTableContainer);

    // Do the same for extensions
    const unusedExtList = document.getElementById('unused-ext-list');
    const unusedExtContainer = unusedExtList.parentNode;

    // Add copy button after the table
    const extCopyButton = document.createElement('div');
    extCopyButton.innerHTML = `<i class="fas fa-copy mr-1"></i> Copy Table`;
    extCopyButton.className = 'btn btn-sm btn-outline-light';
    extCopyButton.style.fontSize = '0.8rem';
    extCopyButton.style.cursor = 'pointer';
    extCopyButton.style.float = 'right';
    extCopyButton.style.marginTop = '-2px';
    extCopyButton.addEventListener('click', function () {
      copyTableToClipboard(extTable, 'Extensions');
    });
    // Add button to the extension card header
    document
      .querySelector('.extension-card .summary-card-header')
      .appendChild(extCopyButton);

    // Create table header
    const extTableHead = document.createElement('thead');
    extTableHead.innerHTML = `
      <tr>
        <th>Extension Name</th>
        <th>Size (KB)</th>
      </tr>
    `;
    extTable.appendChild(extTableHead);

    // Create table body
    const extTableBody = document.createElement('tbody');
    unusedExtensions.forEach((extName) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      const sizeCell = document.createElement('td');

      nameCell.textContent = usageData.extensions[extName].name;
      sizeCell.textContent = usageData.extensions[extName].size;
      sizeCell.setAttribute(
        'data-sort-value',
        usageData.extensions[extName].size
      ); // For proper numeric sorting
      sizeCell.style.textAlign = 'right';

      row.appendChild(nameCell);
      row.appendChild(sizeCell);
      extTableBody.appendChild(row);
    });
    extTable.appendChild(extTableBody);

    // Replace the list with the table
    unusedExtContainer.removeChild(unusedExtList);

    // Create a scrollable container for the table
    const extTableContainer = document.createElement('div');
    extTableContainer.style.maxHeight = '200px';
    extTableContainer.style.overflowY = 'auto';
    extTableContainer.style.marginBottom = '10px';
    extTableContainer.appendChild(extTable);

    unusedExtContainer.appendChild(extTableContainer);

    // Initialize tablesorter
    setTimeout(() => {
      try {
        $('#de-table').tablesorter({
          theme: 'blue',
          widgets: ['zebra'],
          headers: {
            1: { sorter: 'digit' }, // Ensure the size column is sorted as numbers
          },
        });

        $('#rule-table').tablesorter({
          theme: 'blue',
          widgets: ['zebra'],
          headers: {
            1: { sorter: 'digit' }, // Ensure the size column is sorted as numbers
          },
        });

        $('#ext-table').tablesorter({
          theme: 'blue',
          widgets: ['zebra'],
          headers: {
            1: { sorter: 'digit' }, // Ensure the size column is sorted as numbers
          },
        });

        console.log('Tables initialized with sorting capability');
      } catch (error) {
        console.error('Error initializing tablesorter:', error);
      }
    }, 100);

    // Set up print-friendly section for PDF generation
    const today = new Date();
    const dateStr = today.toLocaleDateString();
    const timeStr = today.toLocaleTimeString();

    document.getElementById('print-title').textContent = 'Adobe Tags | Summary';
    document.getElementById(
      'print-property'
    ).textContent = `Property: ${propertyName}`;
    document.getElementById(
      'print-date'
    ).textContent = `Generated: ${dateStr} ${timeStr}`;

    // Add property environment to print section
    const printEnv = document.createElement('p');
    printEnv.id = 'print-environment';
    printEnv.textContent = `Environment: ${propertyEnvironment}`;
    document.getElementById('print-date').after(printEnv);

    // Add summary stats
    const printStats = document.createElement('p');
    printStats.id = 'print-stats';
    printStats.textContent = `Total Components: ${
      Object.keys(dataElements).length +
      rules.length +
      Object.keys(extensions).length
    } | Total Size: ${(totalDeSize + totalRuleSize + totalExtSize).toFixed(
      2
    )} KB`;
    printEnv.after(printStats);

    // Add TagScanner version
    const printVersion = document.createElement('p');
    printVersion.id = 'print-version';
    printVersion.textContent = `TagScanner Version: 1.6.4`;
    printStats.after(printVersion);

    document.getElementById(
      'print-de-summary'
    ).textContent = `Total Data Elements: ${
      Object.keys(dataElements).length
    } (${totalDeSize.toFixed(2)} KB)
       Unused Data Elements: ${
         unusedDataElements.length
       } (${unusedDeSize.toFixed(2)} KB - ${
      Object.keys(dataElements).length > 0
        ? Math.round(
            (unusedDataElements.length / Object.keys(dataElements).length) * 100
          )
        : 0
    }%)`;

    document.getElementById('print-rule-summary').textContent = `Total Rules: ${
      rules.length
    } (${totalRuleSize.toFixed(2)} KB)
       Unused Rules: ${unusedRules.length} (${unusedRuleSize.toFixed(2)} KB - ${
      rules.length > 0
        ? Math.round((unusedRules.length / rules.length) * 100)
        : 0
    }%)`;

    // Update print section to include extensions
    const printSection = document.getElementById('print-section');

    // Create extensions header
    const extHeader = document.createElement('h2');
    extHeader.className = 'print-header';
    extHeader.textContent = 'Unused Extensions';

    // Create extensions summary
    const extSummary = document.createElement('p');
    extSummary.id = 'print-ext-summary';
    extSummary.textContent = `Total Extensions: ${
      Object.keys(extensions).length
    } (${totalExtSize.toFixed(2)} KB)
       | Unused Extensions: ${unusedExtensions.length} (${unusedExtSize.toFixed(
      2
    )} KB - ${Math.round(
      (unusedExtensions.length / Object.keys(extensions).length) * 100
    )}%)`;

    // Create extensions table
    const extPrintTable = document.createElement('table');
    extPrintTable.className = 'print-table';
    extPrintTable.id = 'print-ext-table';

    const extPrintThead = document.createElement('thead');
    extPrintThead.innerHTML = `
      <tr>
        <th>Extension Name</th>
        <th>Size (KB)</th>
      </tr>
    `;

    const extPrintTbody = document.createElement('tbody');
    extPrintTbody.id = 'print-ext-tbody';

    extPrintTable.appendChild(extPrintThead);
    extPrintTable.appendChild(extPrintTbody);

    // Insert before recommendations
    const recommendationsHeader = document.querySelector(
      '#print-section h2:last-of-type'
    );
    printSection.insertBefore(extHeader, recommendationsHeader);
    printSection.insertBefore(extSummary, recommendationsHeader);
    printSection.insertBefore(extPrintTable, recommendationsHeader);

    document.getElementById(
      'print-total-savings'
    ).textContent = `Total Potential Size Savings: ${(
      unusedDeSize +
      unusedRuleSize +
      unusedExtSize
    ).toFixed(2)} KB`;

    // Populate data element table
    const deTbody = document.getElementById('print-de-tbody');
    unusedDataElements.forEach((deName) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      const sizeCell = document.createElement('td');

      nameCell.textContent = deName;
      sizeCell.textContent = `${usageData.dataElements[deName].size} KB`;

      row.appendChild(nameCell);
      row.appendChild(sizeCell);
      deTbody.appendChild(row);
    });

    // Populate rule table
    const ruleTbody = document.getElementById('print-rule-tbody');
    unusedRules.forEach((ruleId) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      const sizeCell = document.createElement('td');

      nameCell.textContent = usageData.rules[ruleId].name;
      sizeCell.textContent = `${usageData.rules[ruleId].size} KB`;

      row.appendChild(nameCell);
      row.appendChild(sizeCell);
      ruleTbody.appendChild(row);
    });

    // Populate extension table
    unusedExtensions.forEach((extName) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      const sizeCell = document.createElement('td');

      nameCell.textContent = usageData.extensions[extName].name;
      sizeCell.textContent = `${usageData.extensions[extName].size} KB`;

      row.appendChild(nameCell);
      row.appendChild(sizeCell);
      document.getElementById('print-ext-tbody').appendChild(row);
    });

    // Add recommendations
    const recommendationsList = document.getElementById(
      'print-recommendations'
    );

    const rec1 = document.createElement('li');
    rec1.textContent = `Consider removing unused data elements to save approximately ${unusedDeSize.toFixed(
      2
    )} KB.`;
    recommendationsList.appendChild(rec1);

    const rec2 = document.createElement('li');
    rec2.textContent = `Review unused rules to potentially save ${unusedRuleSize.toFixed(
      2
    )} KB.`;
    recommendationsList.appendChild(rec2);

    // Add extension recommendation if there are unused extensions
    if (unusedExtensions.length > 0) {
      const extRec = document.createElement('li');
      extRec.textContent = `Consider disabling unused extensions to save approximately ${unusedExtSize.toFixed(
        2
      )} KB.`;
      recommendationsList.appendChild(extRec);
    }

    const rec3 = document.createElement('li');
    rec3.textContent =
      'Regularly audit your Adobe Tags implementation to maintain optimal performance.';
    recommendationsList.appendChild(rec3);

    const rec4 = document.createElement('li');
    rec4.textContent =
      'Check if any unused components are planned for future use before removing them.';
    recommendationsList.appendChild(rec4);

    const rec5 = document.createElement('li');
    rec5.textContent =
      'Please test the recommendations extensively in lower environment before pushing to Production. TagScanner cannot be held liable for any issues or bugs in your implementation.';
    recommendationsList.appendChild(rec5);

    // Set up PDF download using print functionality
    document
      .getElementById('download-pdf')
      .addEventListener('click', function () {
        window.print();
      });

    // Hide loading spinner
    document.getElementById('set_display').style.display = 'none';

    // Check if this is the first visit and start tour if it is
    if (!localStorage.getItem('tagScannerTourShown')) {
      // Set a small delay to ensure UI is fully rendered
      setTimeout(function () {
        startTour();
        localStorage.setItem('tagScannerTourShown', 'true');
      }, 1000);
    }
  } catch (error) {
    console.error('Error analyzing component usage:', error);
    document.getElementById('set_display').style.display = 'none';
    document.querySelector(
      '.container-fluid'
    ).innerHTML = `<div class="alert alert-danger mt-4">Error analyzing component usage: ${error.message}</div>`;
  }

  // Remove "Unused Data Elements" and "Unused Rules" headers
  setTimeout(() => {
    // Find and remove the h6 headers
    const headers = document.querySelectorAll('.component-list h6');
    headers.forEach((header) => {
      if (
        header.textContent.includes('Unused Data Elements') ||
        header.textContent.includes('Unused Rules') ||
        header.textContent.includes('Unused Extensions')
      ) {
        header.style.display = 'none';
      }
    });
  }, 1000);
});

// Function to define and start the tour
function startTour() {
  introJs()
    .setOptions({
      steps: [
        {
          intro:
            'The summary page is an easier way to summarize the entire implementation and share with your team. This page is also print friendly. You can see the total size of your property, as well as the size of each component type.',
        },
        {
          element: document.querySelector('.property-details-card'),
          intro:
            'This section shows details about your Adobe Tags property, including name, environment, and total size.',
        },
        {
          element: document.querySelector('.extension-card'),
          intro:
            'This section shows all unused Extensions that are adding weight to your property.',
        },
        {
          element: document.querySelector('.rule-card'),
          intro:
            'This section shows all unused Rules that are adding weight to your property.',
        },
        {
          element: document.querySelector('.data-element-card'),
          intro:
            'This section shows all unused Data Elements that are adding weight to your property.',
        },
        {
          element: document.querySelector('.tablesorter'),
          intro: 'Click on any column header to sort the table by that column.',
        },
        {
          element: document.querySelector('#download-pdf'),
          intro:
            'Generate a PDF report that you can share with your team or stakeholders.',
        },
      ],
      exitOnOverlayClick: false,
      showBullets: true,
      showProgress: true,
    })
    .start();
}

// Add function to copy table to clipboard
function copyTableToClipboard(table, componentType) {
  // Show processing message
  const message = document.createElement('div');
  message.textContent = 'Processing...';
  message.style.color = '#666';
  message.style.marginTop = '5px';
  message.style.marginBottom = '8px';
  message.style.fontSize = '12px';
  message.style.textAlign = 'center';
  table.parentNode.insertBefore(message, table);

  // Take screenshot of table
  html2canvas(table).then((canvas) => {
    // Try to copy to clipboard
    canvas.toBlob((blob) => {
      try {
        // For modern browsers
        navigator.clipboard
          .write([new ClipboardItem({ 'image/png': blob })])
          .then(() => {
            message.textContent = `✓ ${componentType} copied to clipboard!`;
            message.style.color = 'green';
            setTimeout(() => message.remove(), 3000);
          })
          .catch((err) => {
            // Fallback for clipboard API failure
            message.textContent =
              '× Error: Please right-click the image below and copy it';
            message.style.color = 'red';

            // Show the canvas as fallback
            canvas.style.maxWidth = '100%';
            canvas.style.border = '1px solid #ddd';
            canvas.style.marginTop = '10px';
            message.parentNode.insertBefore(canvas, message.nextSibling);
          });
      } catch (e) {
        // Fallback for browsers without clipboard API
        message.textContent =
          '× Please right-click the image below and copy it';
        message.style.color = 'red';

        // Show the canvas as fallback
        canvas.style.maxWidth = '100%';
        canvas.style.border = '1px solid #ddd';
        canvas.style.marginTop = '10px';
        message.parentNode.insertBefore(canvas, message.nextSibling);
      }
    });
  });
}

// Function to copy card content to clipboard
function copyCardToClipboard(cardBody, cardType) {
  // Show processing message
  const message = document.createElement('div');
  message.textContent = 'Processing...';
  message.style.color = '#666';
  message.style.marginTop = '5px';
  message.style.marginBottom = '8px';
  message.style.fontSize = '12px';
  message.style.textAlign = 'center';
  cardBody.insertBefore(message, cardBody.firstChild);

  // Take screenshot of card body
  html2canvas(cardBody).then((canvas) => {
    // Try to copy to clipboard
    canvas.toBlob((blob) => {
      try {
        // For modern browsers
        navigator.clipboard
          .write([new ClipboardItem({ 'image/png': blob })])
          .then(() => {
            message.textContent = `✓ ${cardType} copied to clipboard!`;
            message.style.color = 'green';
            setTimeout(() => message.remove(), 3000);
          })
          .catch((err) => {
            // Fallback for clipboard API failure
            message.textContent =
              '× Error: Please right-click the image below and copy it';
            message.style.color = 'red';

            // Show the canvas as fallback
            canvas.style.maxWidth = '100%';
            canvas.style.border = '1px solid #ddd';
            canvas.style.marginTop = '10px';
            cardBody.insertBefore(canvas, message.nextSibling);
          });
      } catch (e) {
        // Fallback for browsers without clipboard API
        message.textContent =
          '× Please right-click the image below and copy it';
        message.style.color = 'red';

        // Show the canvas as fallback
        canvas.style.maxWidth = '100%';
        canvas.style.border = '1px solid #ddd';
        canvas.style.marginTop = '10px';
        cardBody.insertBefore(canvas, message.nextSibling);
      }
    });
  });
}
