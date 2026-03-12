/**
 * Enhanced Rule Details Page
 * This file provides enhanced functionality for displaying rule details with inline custom code
 * Completely separate from the main ruledetails.js to avoid conflicts
 */

// Enhanced modal function specifically for rule details
function showEnhancedSourceModal(title, content) {
  // Create modal overlay
  var modalOverlay = document.createElement('div');
  modalOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 9999;
    display: flex;
    justify-content: center;
    align-items: center;
  `;
  
  // Create modal content
  var modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background-color: white;
    border-radius: 8px;
    padding: 20px;
    max-width: 80%;
    max-height: 80%;
    overflow: auto;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  `;
  
  // Create header
  var header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    border-bottom: 1px solid #eee;
    padding-bottom: 10px;
  `;
  
  var titleElement = document.createElement('h4');
  titleElement.textContent = title;
  titleElement.style.margin = '0';
  header.appendChild(titleElement);
  
  // Create button container
  var buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    gap: 10px;
  `;
  
  // Copy button
  var copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy';
  copyBtn.className = 'btn btn-sm btn-outline-primary';
  copyBtn.onclick = function() {
    navigator.clipboard.writeText(content);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
    }, 2000);
  };
  buttonContainer.appendChild(copyBtn);
  
  // Go back button
  var goBackBtn = document.createElement('button');
  goBackBtn.textContent = 'Go Back';
  goBackBtn.className = 'btn btn-sm btn-outline-secondary';
  goBackBtn.onclick = function() {
    document.body.removeChild(modalOverlay);
  };
  buttonContainer.appendChild(goBackBtn);
  
  header.appendChild(buttonContainer);
  modalContent.appendChild(header);
  
  // Create content area
  var contentArea = document.createElement('div');
  contentArea.style.cssText = `
    font-family: monospace;
    font-size: 12px;
    white-space: pre-wrap;
    word-wrap: break-word;
    background-color: #f8f9fa;
    padding: 15px;
    border-radius: 4px;
    border: 1px solid #dee2e6;
    max-height: 400px;
    overflow-y: auto;
  `;
  contentArea.textContent = content;
  modalContent.appendChild(contentArea);
  
  modalOverlay.appendChild(modalContent);
  document.body.appendChild(modalOverlay);
  
  // Close modal when clicking outside
  modalOverlay.addEventListener('click', function(e) {
    if (e.target === modalOverlay) {
      document.body.removeChild(modalOverlay);
    }
  });
}

// Enhanced WebSDK component processing with inline code display
function processEnhancedWebSDKComponent(action, containerNode) {
  if (!action || !action.settings) {
    return;
  }

  try {
    // Create a dedicated section for Web SDK
    var webSDKHeader = document.createElement('h3');
    webSDKHeader.innerHTML = 'Web SDK - Update Variable (Data)';
    containerNode.appendChild(webSDKHeader);

    // Create container for the table
    var tableContainer = document.createElement('div');
    tableContainer.style.cssText = 'margin-bottom: 20px; padding: 0;';

    // Prepare data for each column
    var evars = Array.isArray(action.settings.eVars) ? action.settings.eVars : [];
    var props = Array.isArray(action.settings.props) ? action.settings.props : [];
    var additionalProps = Array.isArray(action.settings.additionalProperties) ? action.settings.additionalProperties : [];
    // Fallback: try to extract from action.settings if not arrays
    if (!evars.length && action.settings.eVar) evars = [action.settings.eVar];
    if (!props.length && action.settings.prop) props = [action.settings.prop];
    if (!additionalProps.length && action.settings.additionalProperty) additionalProps = [action.settings.additionalProperty];

    // Custom Code
    let customCode = null;
    if (action.settings.customCode) {
      customCode = action.settings.customCode;
    } else if (action.settings.source) {
      customCode = action.settings.source;
    } else if (action.settings.code) {
      customCode = action.settings.code;
    } else if (action.settings.script) {
      customCode = action.settings.script;
    }

    // Create table
    var sdkTable = document.createElement('table');
    sdkTable.className = 'actions-table';
    var headerRow = document.createElement('tr');
    ['Evars', 'Props', 'Additional Property', 'Custom Code'].forEach((header) => {
      var th = document.createElement('th');
      th.textContent = header;
      headerRow.appendChild(th);
    });
    sdkTable.appendChild(headerRow);

    var dataRow = document.createElement('tr');

    // Evars cell
    var tdEvars = document.createElement('td');
    if (evars.length) {
      var btn = document.createElement('button');
      btn.textContent = 'View Source';
      btn.className = 'btn btn-sm btn-outline-secondary';
      btn.onclick = function() {
        const evarsData = evars.map(e => {
          if (typeof e === 'object') {
            return `${e.name || ''} | ${e.action || 'Set'} | ${e.value || ''}`.trim();
          } else {
            return String(e);
          }
        }).join('\n');
        showEnhancedSourceModal('Evars', evarsData);
      };
      tdEvars.appendChild(btn);
    } else {
      tdEvars.textContent = 'N/A';
    }
    dataRow.appendChild(tdEvars);

    // Props cell
    var tdProps = document.createElement('td');
    if (props.length) {
      var btn = document.createElement('button');
      btn.textContent = 'View Source';
      btn.className = 'btn btn-sm btn-outline-secondary';
      btn.onclick = function() {
        const propsData = props.map(p => {
          if (typeof p === 'object') {
            return `${p.name || ''} | ${p.action || 'Set'} | ${p.value || ''}`.trim();
          } else {
            return String(p);
          }
        }).join('\n');
        showEnhancedSourceModal('Props', propsData);
      };
      tdProps.appendChild(btn);
    } else {
      tdProps.textContent = 'N/A';
    }
    dataRow.appendChild(tdProps);

    // Additional Property cell
    var tdAddProp = document.createElement('td');
    if (additionalProps.length) {
      var btn = document.createElement('button');
      btn.textContent = 'View Source';
      btn.className = 'btn btn-sm btn-outline-secondary';
      btn.onclick = function() {
        const addPropsData = additionalProps.map(ap => {
          if (typeof ap === 'object') {
            return `${ap.name || ap.property || ''} | ${ap.action || 'Set'} | ${ap.value || ''}`.trim();
          } else {
            return String(ap);
          }
        }).join('\n');
        showEnhancedSourceModal('Additional Property', addPropsData);
      };
      tdAddProp.appendChild(btn);
    } else {
      tdAddProp.textContent = 'N/A';
    }
    dataRow.appendChild(tdAddProp);

    // Custom Code cell
    var tdCustomCode = document.createElement('td');
    if (customCode) {
      var btn = document.createElement('button');
      btn.textContent = 'View Source';
      btn.className = 'btn btn-sm btn-outline-secondary';
      btn.onclick = function() {
        const codeToShow = typeof customCode === 'function' ? customCode.toString() : customCode;
        showEnhancedSourceModal('Custom Code', codeToShow);
      };
      tdCustomCode.appendChild(btn);
    } else {
      tdCustomCode.textContent = 'N/A';
    }
    dataRow.appendChild(tdCustomCode);

    sdkTable.appendChild(dataRow);
    tableContainer.appendChild(sdkTable);
    containerNode.appendChild(tableContainer);
  } catch (e) {
    console.error('Error processing Web SDK configuration:', e);
    const errorMsg = document.createElement('div');
    errorMsg.className = 'error';
    errorMsg.textContent = 'Error processing WebSDK data: ' + e.message;
    containerNode.appendChild(errorMsg);
  }
}

// Enhanced Adobe Analytics configuration processing with inline code display
function processEnhancedAdobeAnalyticsConfig(action, containerNode) {
  if (!action || !action.settings || !action.settings.trackerProperties) {
    return;
  }

  // Create section header
  var aaHeader = document.createElement('h3');
  aaHeader.innerHTML = 'Adobe Analytics Configuration';
  containerNode.appendChild(aaHeader);

  // Create table
  var aaTable = document.createElement('table');
  aaTable.className = 'actions-table';
  var tr_default = document.createElement('tr');
  var th_evar_default = document.createElement('th');
  th_evar_default.innerHTML = 'eVars';
  var th_prop_default = document.createElement('th');
  th_prop_default.innerHTML = 'props';
  var th_events_default = document.createElement('th');
  th_events_default.innerHTML = 'events';
  var th_additional_default = document.createElement('th');
  th_additional_default.innerHTML = 'Additional Settings';
  var th_custom_code_default = document.createElement('th');
  th_custom_code_default.innerHTML = 'Custom Code';
  tr_default.appendChild(th_evar_default);
  tr_default.appendChild(th_prop_default);
  tr_default.appendChild(th_events_default);
  tr_default.appendChild(th_additional_default);
  tr_default.appendChild(th_custom_code_default);
  aaTable.appendChild(tr_default);

  var tr = document.createElement('tr');
  var td_evar = document.createElement('td');
  var td_prop = document.createElement('td');
  var td_events = document.createElement('td');
  var td_additional = document.createElement('td');
  var td_custom_code = document.createElement('td');

  // eVars
  if (action.settings.trackerProperties.eVars) {
    let evar_list = action.settings.trackerProperties.eVars;
    var viewSourceBtn = document.createElement('button');
    viewSourceBtn.textContent = 'View Source';
    viewSourceBtn.className = 'btn btn-sm btn-outline-secondary';
    viewSourceBtn.onclick = function() {
      const evarsData = evar_list.map(evar => `${evar.name} = ${evar.value}`).join('\n');
      showEnhancedSourceModal('eVars Configuration', evarsData);
    };
    td_evar.appendChild(viewSourceBtn);
  } else {
    td_evar.textContent = 'N/A';
  }
  tr.appendChild(td_evar);

  // props
  if (action.settings.trackerProperties.props) {
    let prop_list = action.settings.trackerProperties.props;
    var viewSourceBtn = document.createElement('button');
    viewSourceBtn.textContent = 'View Source';
    viewSourceBtn.className = 'btn btn-sm btn-outline-secondary';
    viewSourceBtn.onclick = function() {
      const propsData = prop_list.map(prop => `${prop.name} = ${prop.value}`).join('\n');
      showEnhancedSourceModal('Props Configuration', propsData);
    };
    td_prop.appendChild(viewSourceBtn);
  } else {
    td_prop.textContent = 'N/A';
  }
  tr.appendChild(td_prop);

  // events
  if (action.settings.trackerProperties.events) {
    let event_list = action.settings.trackerProperties.events;
    var viewSourceBtn = document.createElement('button');
    viewSourceBtn.textContent = 'View Source';
    viewSourceBtn.className = 'btn btn-sm btn-outline-secondary';
    viewSourceBtn.onclick = function() {
      const eventsData = event_list.map(ev => ev.name ? ev.name.replaceAll('%', '') : ev).join('\n');
      showEnhancedSourceModal('Events Configuration', eventsData);
    };
    td_events.appendChild(viewSourceBtn);
  } else {
    td_events.textContent = 'N/A';
  }
  tr.appendChild(td_events);

  // Additional Settings (pageName, pageURL, Campaign)
  let additionalSettings = [];
  if (action.settings && action.settings.trackerProperties) {
    const tp = action.settings.trackerProperties;
    if (tp.pageName) additionalSettings.push('Page Name: ' + tp.pageName);
    if (tp.pageURL) additionalSettings.push('Page URL: ' + tp.pageURL);
    if (tp.campaign) additionalSettings.push('Campaign: ' + tp.campaign);
  }
  if (additionalSettings.length > 0) {
    var viewSourceBtn = document.createElement('button');
    viewSourceBtn.textContent = 'View Source';
    viewSourceBtn.className = 'btn btn-sm btn-outline-secondary';
    viewSourceBtn.onclick = function() {
      showEnhancedSourceModal('Additional Settings', additionalSettings.join('\n'));
    };
    td_additional.appendChild(viewSourceBtn);
  } else {
    td_additional.textContent = 'N/A';
  }
  tr.appendChild(td_additional);

  // Custom Code
  let customCode = null;
  
  // Check for custom code in various locations
  if (action.settings.customSetup && action.settings.customSetup.source) {
    customCode = action.settings.customSetup.source;
  } else if (action.settings.customCode) {
    customCode = action.settings.customCode;
  } else if (action.settings.source) {
    customCode = action.settings.source;
  } else if (action.settings.code) {
    customCode = action.settings.code;
  } else if (action.settings.script) {
    customCode = action.settings.script;
  }
  
  // Also check if there's a customCode property at the root level
  if (!customCode && action.customCode) {
    customCode = action.customCode;
  }
  
  if (customCode) {
    // Create a container for the custom code display
    var customCodeContainer = document.createElement('div');
    customCodeContainer.style.cssText = 'margin-bottom: 10px;';
    
    // Display the actual code
    var codeDisplay = document.createElement('div');
    codeDisplay.style.cssText = `
      font-family: monospace;
      font-size: 11px;
      background-color: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      padding: 8px;
      margin-bottom: 5px;
      white-space: pre-wrap;
      word-wrap: break-word;
      max-height: 100px;
      overflow-y: auto;
    `;
    
    const codeToShow = typeof customCode === 'function' ? customCode.toString() : customCode;
    codeDisplay.textContent = codeToShow;
    customCodeContainer.appendChild(codeDisplay);
    
    // Add View Source button
    var viewSourceBtn = document.createElement('button');
    viewSourceBtn.textContent = 'View Source';
    viewSourceBtn.className = 'btn btn-sm btn-outline-secondary';
    viewSourceBtn.onclick = function() {
      showEnhancedSourceModal('Adobe Analytics Custom Code', codeToShow);
    };
    customCodeContainer.appendChild(viewSourceBtn);
    
    td_custom_code.appendChild(customCodeContainer);
  } else {
    td_custom_code.textContent = 'N/A';
  }
  tr.appendChild(td_custom_code);

  aaTable.appendChild(tr);
  containerNode.appendChild(aaTable);
}

// Main function to initialize enhanced rule details
function initializeEnhancedRuleDetails() {
  const actions_tab = document.getElementById('actions_tab');
  const rule_title_node = document.getElementById('rule_title');
  
  if (!actions_tab || !rule_title_node) {
    console.error('Required DOM elements not found');
    return;
  }

  // Clear existing content
  actions_tab.innerHTML = '';
  rule_title_node.innerHTML = '';

  try {
    const params = new URLSearchParams(window.location.search);
    let ruleName = params.get('rulename');

    if (!ruleName) {
      console.error('No rule name specified');
      return;
    }

    var rule_value = sessionStorage.getItem('_satellite._container.rules');
    if (!rule_value) {
      console.error('No rule data found in session storage');
      return;
    }

    const obj = JSON.parse(rule_value);
    let ruleFound = false;

    for (let i = 0; i < obj.length; i++) {
      if (obj[i].name == ruleName) {
        ruleFound = true;

        // Add the rule title
        var p = document.createElement('h2');
        p.innerHTML = 'Rule Name: ' + obj[i].name;
        rule_title_node.appendChild(p);

        // Display Actions section
        if (obj[i].actions && obj[i].actions.length > 0) {
          var actionsHeader = document.createElement('h3');
          actionsHeader.innerHTML = 'Actions';
          actions_tab.appendChild(actionsHeader);

          // Process Web SDK actions
          for (let j = 0; j < obj[i].actions.length; j++) {
            const action = obj[i].actions[j];
            if (action.modulePath.includes('adobe-alloy/')) {
              processEnhancedWebSDKComponent(action, actions_tab);
            }
          }

          // Process Adobe Analytics actions
          for (let j = 0; j < obj[i].actions.length; j++) {
            const action = obj[i].actions[j];
            
            if (
              action.modulePath.includes('adobe-analytics/') &&
              !action.modulePath.includes('sendBeacon.js') &&
              !action.modulePath.includes('clearVariables.js') &&
              action.settings &&
              action.settings.trackerProperties
            ) {
              const isSetVariablesAction = action.modulePath.includes('setVariables.js');
              const isUpdateVariablesAction = action.modulePath.includes('updateVariables.js');
              
              if (isSetVariablesAction || isUpdateVariablesAction) {
                processEnhancedAdobeAnalyticsConfig(action, actions_tab);
              }
            }
          }
        } else {
          var noActionsMsg = document.createElement('p');
          noActionsMsg.textContent = 'No actions defined for this rule.';
          actions_tab.appendChild(noActionsMsg);
        }

        break;
      }
    }

    if (!ruleFound) {
      console.error('Rule not found');
    }
  } catch (error) {
    console.error('Error processing rule:', error);
  }
}

// Export functions for use in other files
window.enhancedRuleDetails = {
  initialize: initializeEnhancedRuleDetails,
  showModal: showEnhancedSourceModal,
  processWebSDK: processEnhancedWebSDKComponent,
  processAdobeAnalytics: processEnhancedAdobeAnalyticsConfig
}; 