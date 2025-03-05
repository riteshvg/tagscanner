var rule_details_node = document.getElementById('rule_details');
var rule_title_node = document.getElementById('rule_title');
var actions_tab = document.getElementById('actions-tab');

// Add loading indicator
function showLoading() {
  actions_tab.innerHTML = '<div class="loading">Loading rule details...</div>';
}

function clearLoading() {
  const loadingElement = actions_tab.querySelector('.loading');
  if (loadingElement) {
    loadingElement.remove();
  }
}

function showError(message) {
  actions_tab.innerHTML = `<div class="error">${message}</div>`;
}

/**
 * Processes WebSDK XDM data and displays it in a table format
 * @param {Object} action - The WebSDK action object
 * @param {Element} containerNode - The DOM node to append content to
 */
function processWebSDKComponent(action, containerNode) {
  if (!action || !action.settings) {
    return; // No data to process
  }

  try {
    // Create a dedicated section for Web SDK
    var webSDKHeader = document.createElement('h3');
    webSDKHeader.innerHTML = 'Web SDK Configuration';
    containerNode.appendChild(webSDKHeader);

    // Create container for the table
    var tableContainer = document.createElement('div');
    tableContainer.style.cssText = 'margin-bottom: 20px; padding: 0;';

    // First, let's handle data element references in XDM
    let xdmData = action.settings.xdm;
    let extractedData = null;

    // Check if we have a data element reference instead of direct XDM object
    if (typeof xdmData === 'string' && xdmData.includes('%')) {
      const dataElementName = xdmData.replace(/%/g, '');
      try {
        const de_value = sessionStorage.getItem(
          '_satellite._container.dataElements'
        );
        if (de_value) {
          const dataElements = JSON.parse(de_value);
          if (
            dataElements[dataElementName] &&
            dataElements[dataElementName].settings
          ) {
            extractedData = dataElements[dataElementName].settings.data;
          }
        }
      } catch (e) {
        console.error('Error extracting data element:', e);
      }
    } else {
      extractedData = xdmData;
    }

    // If we have no data at all, check if there's "data" property instead
    if (!extractedData && action.settings.data) {
      extractedData = action.settings.data;
    }

    // If we still have no data, show a message
    if (!extractedData) {
      const noDataMsg = document.createElement('div');
      noDataMsg.style.cssText =
        'padding: 10px; background-color: #fff8e1; border-left: 4px solid #ffc107; border-radius: 4px;';
      noDataMsg.innerHTML =
        '<strong>Note:</strong> No XDM or data configuration found for this Web SDK action.';
      containerNode.appendChild(noDataMsg);
      return;
    }

    // Create table for XDM paths
    var xdmTable = document.createElement('table');
    xdmTable.className = 'actions-table';

    // Create header row
    var headerRow = document.createElement('tr');
    ['XDM Path', 'Value'].forEach((header) => {
      var th = document.createElement('th');
      th.textContent = header;
      headerRow.appendChild(th);
    });
    xdmTable.appendChild(headerRow);

    // Function to get all complete paths from an object
    function getCompletePaths(obj, parentPath = '') {
      let paths = [];

      for (const key in obj) {
        const currentPath = parentPath ? `${parentPath}.${key}` : key;
        const value = obj[key];

        if (
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value)
        ) {
          // If it's an object, recurse deeper
          paths = paths.concat(getCompletePaths(value, currentPath));
        } else {
          // If it's a leaf node (complete path), add it
          paths.push({
            path: currentPath,
            value: value,
          });
        }
      }

      return paths;
    }

    // Get all complete paths
    const completePaths = getCompletePaths(extractedData);

    // Add each complete path to the table
    completePaths.forEach(({ path, value }) => {
      const row = document.createElement('tr');

      // Path cell
      const pathCell = document.createElement('td');
      pathCell.textContent = path;
      row.appendChild(pathCell);

      // Value cell
      const valueCell = document.createElement('td');
      valueCell.textContent = Array.isArray(value)
        ? JSON.stringify(value)
        : value;
      row.appendChild(valueCell);

      xdmTable.appendChild(row);
    });

    tableContainer.appendChild(xdmTable);
    containerNode.appendChild(tableContainer);
  } catch (e) {
    console.error('Error processing Web SDK XDM:', e);
    const errorMsg = document.createElement('div');
    errorMsg.className = 'error';
    errorMsg.textContent = 'Error processing WebSDK data: ' + e.message;
    containerNode.appendChild(errorMsg);
  }
}

// Self-executing function to contain all the main logic
(function () {
  if (actions_tab) {
    showLoading();

    try {
      const params = new URLSearchParams(window.location.search);
      let ruleName = params.get('rulename');

      if (!ruleName) {
        showError('No rule name specified');
        return;
      }

      var rule_value = sessionStorage.getItem('_satellite._container.rules');
      if (!rule_value) {
        showError('No rule data found in session storage');
        return;
      }

      // Clear the loading message
      clearLoading();

      const obj = JSON.parse(rule_value);
      let ruleFound = false;

      for (let i = 0; i < obj.length; i++) {
        if (obj[i].name == ruleName) {
          ruleFound = true;

          // Add the rule title to the title section
          var p = document.createElement('h2');
          p.innerHTML = 'Rule Name: ' + obj[i].name;
          rule_title_node.appendChild(p);

          // Display Actions section
          if (obj[i].actions && obj[i].actions.length > 0) {
            var actionsHeader = document.createElement('h3');
            actionsHeader.innerHTML = 'Actions';
            actions_tab.appendChild(actionsHeader);

            var actionsTable = document.createElement('table');
            actionsTable.className = 'actions-table';

            // Create header row
            var headerRow = document.createElement('tr');
            var th = document.createElement('th');
            th.textContent = 'Settings';
            headerRow.appendChild(th);
            actionsTable.appendChild(headerRow);

            // Add each action as a row
            for (let j = 0; j < obj[i].actions.length; j++) {
              const action = obj[i].actions[j];
              if (action.modulePath.includes('adobe-alloy/')) {
                var actionRow = document.createElement('tr');
                var sourceCell = document.createElement('td');
                processWebSDKComponent(action, sourceCell);
                actionRow.appendChild(sourceCell);
                actionsTable.appendChild(actionRow);
              }
            }

            // Only append the table if we found any Web SDK actions
            if (actionsTable.getElementsByTagName('tr').length > 1) {
              // More than just header
              actions_tab.appendChild(actionsTable);
            } else {
              var noWebSDKMsg = document.createElement('p');
              noWebSDKMsg.textContent =
                'No Web SDK actions found in this rule.';
              actions_tab.appendChild(noWebSDKMsg);
            }
          } else {
            var noActionsMsg = document.createElement('p');
            noActionsMsg.textContent = 'No actions defined for this rule.';
            actions_tab.appendChild(noActionsMsg);
          }

          break;
        }
      }

      // Update document title
      if (ruleName) {
        document.title = `Rule Details - ${ruleName}`;
      }

      // Show "No Data" message if no rule was found
      if (!ruleFound) {
        showError('Rule not found');
      }
    } catch (error) {
      console.error('Error processing rule:', error);
      showError('Error processing rule: ' + error.message);
    }
  }

  // Hide set display
  var set_display = document.getElementById('set_display');
  if (set_display) {
    set_display.style.display = 'none';
  }
})();
