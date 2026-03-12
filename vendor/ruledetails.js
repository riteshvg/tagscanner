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
    // Create a dedicated section for Web SDK action
    var actionDiv = document.createElement('div');
    actionDiv.style.cssText = 'margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 4px; background-color: #f9f9f9;';

    // Create header with action type
    var header = document.createElement('h4');
    header.textContent = getWebSDKHeaderText(action);
    header.style.margin = '0 0 10px 0';
    actionDiv.appendChild(header);

    // Create View Source button
    var viewSourceBtn = document.createElement('button');
    viewSourceBtn.textContent = 'View Source';
    viewSourceBtn.className = 'btn btn-sm btn-outline-primary';
    viewSourceBtn.style.marginBottom = '10px';
    actionDiv.appendChild(viewSourceBtn);

    // Extract data for the modal
    let extractedData = null;
    let customCode = null;

    // Check for XDM data first
    if (action.settings.xdm) {
      extractedData = action.settings.xdm;
    } else if (action.settings.data) {
      extractedData = action.settings.data;
    }

    // Check for custom code
    if (action.settings.customCode) {
      customCode = action.settings.customCode;
    } else if (action.settings.source) {
      customCode = action.settings.source;
    } else if (action.settings.code) {
      customCode = action.settings.code;
    }

    // Handle data element references
    if (typeof extractedData === 'string' && extractedData.includes('%')) {
      const dataElementName = extractedData.replace(/%/g, '');
      try {
        const de_value = sessionStorage.getItem('_satellite._container.dataElements');
        if (de_value) {
          const dataElements = JSON.parse(de_value);
          if (dataElements[dataElementName] && dataElements[dataElementName].settings) {
            extractedData = dataElements[dataElementName].settings.data;
          }
        }
      } catch (e) {
        console.error('Error extracting data element:', e);
      }
    }

    // Set up the View Source button click handler
    viewSourceBtn.onclick = function() {
      let html = '<div style="font-family: Arial, sans-serif;">';
      html += `<h4 style="color: #333; margin-bottom: 20px;">${getWebSDKHeaderText(action)}</h4>`;
      
      // Show the extracted data structure
      if (extractedData) {
        html += '<h5 style="color: #007bff; margin-top: 20px; margin-bottom: 10px;">Configuration</h5>';
        html += '<div style="background-color: #f8f9fa; border: 1px solid #ccc; padding: 15px; border-radius: 4px; font-family: monospace; white-space: pre-wrap;">';
        html += JSON.stringify(extractedData, null, 2);
        html += '</div>';
      }

      // Show custom code if available
      if (customCode) {
        html += '<h5 style="color: #007bff; margin-top: 20px; margin-bottom: 10px;">Custom Code</h5>';
        html += '<div style="background-color: #f8f9fa; border: 1px solid #ccc; padding: 10px; border-radius: 4px; font-family: monospace; white-space: pre-wrap;">';
        html += customCode;
        html += '</div>';
      }

      html += '</div>';
      
      // Create plain text version for copy/paste
      let plain = `${getWebSDKHeaderText(action)}\n\n`;
      if (extractedData) {
        plain += 'Configuration:\n';
        plain += JSON.stringify(extractedData, null, 2);
        plain += '\n\n';
      }
      if (customCode) {
        plain += 'Custom Code:\n';
        plain += customCode;
      }

      // Show the modal
      showSourceModal(getWebSDKHeaderText(action), html, plain, {
        customCode: customCode,
        context: getWebSDKHeaderText(action),
        source: 'rule-websdk-action',
      });
    };

    containerNode.appendChild(actionDiv);
  } catch (e) {
    console.error('Error processing Web SDK component:', e);
    const errorMsg = document.createElement('div');
    errorMsg.className = 'error';
    errorMsg.textContent = 'Error processing WebSDK data: ' + e.message;
    containerNode.appendChild(errorMsg);
  }
}

// Helper function to get WebSDK header text
function getWebSDKHeaderText(action) {
  if (action.modulePath && action.modulePath.includes('sendEvent')) {
    return 'Web SDK - Send Event';
  } else if (action.modulePath && action.modulePath.includes('setVariables')) {
    return 'Web SDK - Set Variables';
  } else if (action.modulePath && action.modulePath.includes('updateVariables')) {
    return 'Web SDK - Update Variables';
  } else if (action.modulePath && action.modulePath.includes('sendBeacon')) {
    return 'Web SDK - Send Beacon';
  } else if (action.modulePath && action.modulePath.includes('setConsent')) {
    return 'Web SDK - Set Consent';
  } else if (action.modulePath && action.modulePath.includes('getData')) {
    return 'Web SDK - Get Data';
  } else if (action.modulePath && action.modulePath.includes('setCustomerIds')) {
    return 'Web SDK - Set Customer IDs';
  } else if (action.modulePath && action.modulePath.includes('setDebug')) {
    return 'Web SDK - Set Debug';
  } else if (action.modulePath && action.modulePath.includes('setIdentityMap')) {
    return 'Web SDK - Set Identity Map';
  } else if (action.modulePath && action.modulePath.includes('setTimestamp')) {
    return 'Web SDK - Set Timestamp';
  } else if (action.modulePath && action.modulePath.includes('setUserId')) {
    return 'Web SDK - Set User ID';
  } else if (action.modulePath && action.modulePath.includes('setViewport')) {
    return 'Web SDK - Set Viewport';
  } else if (action.modulePath && action.modulePath.includes('setWorkflow')) {
    return 'Web SDK - Set Workflow';
  } else if (action.modulePath && action.modulePath.includes('setWorkflowState')) {
    return 'Web SDK - Set Workflow State';
  } else {
    return 'Web SDK Action';
  }
}

// Function to show WebSDK modal
function showWebSDKModal(action, title) {
  console.log('showWebSDKModal called with action:', action);
  console.log('Action settings:', action.settings);
  
  let extractedData = null;
  let customCode = null;

  // Check for XDM data first
  if (action.settings.xdm) {
    extractedData = action.settings.xdm;
    console.log('Found XDM data:', extractedData);
  } else if (action.settings.data) {
    extractedData = action.settings.data;
    console.log('Found data:', extractedData);
  }

  // Check for custom code in various possible locations
  if (action.settings.customCode) {
    customCode = action.settings.customCode;
    console.log('Found custom code in customCode:', customCode);
  } else if (action.settings.source) {
    customCode = action.settings.source;
    console.log('Found custom code in source:', customCode);
  } else if (action.settings.code) {
    customCode = action.settings.code;
    console.log('Found custom code in code:', customCode);
  } else if (action.settings.script) {
    customCode = action.settings.script;
    console.log('Found custom code in script:', customCode);
  }

  // Handle data element references
  if (typeof extractedData === 'string' && extractedData.includes('%')) {
    const dataElementName = extractedData.replace(/%/g, '');
    console.log('Found data element reference:', dataElementName);
    try {
      const de_value = sessionStorage.getItem('_satellite._container.dataElements');
      if (de_value) {
        const dataElements = JSON.parse(de_value);
        if (dataElements[dataElementName] && dataElements[dataElementName].settings) {
          extractedData = dataElements[dataElementName].settings.data;
          console.log('Resolved data element to:', extractedData);
        }
      }
    } catch (e) {
      console.error('Error extracting data element:', e);
    }
  }

  // If we still don't have data, try to get it from the action itself
  if (!extractedData && action.settings) {
    console.log('No data found, checking all action.settings properties...');
    for (const key in action.settings) {
      const value = action.settings[key];
      console.log(`Property ${key}:`, value, 'type:', typeof value);
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        extractedData = value;
        console.log('Using property as extracted data:', key, extractedData);
        break;
      }
    }
  }

  let html = '<div style="font-family: Arial, sans-serif;">';
  html += `<h4 style="color: #333; margin-bottom: 20px;">${title}</h4>`;
  
  // Show the extracted data structure
  if (extractedData) {
    html += '<h5 style="color: #007bff; margin-top: 20px; margin-bottom: 10px;">Configuration</h5>';
    html += '<div style="background-color: #f8f9fa; border: 1px solid #ccc; padding: 15px; border-radius: 4px; font-family: monospace; white-space: pre-wrap;">';
    html += JSON.stringify(extractedData, null, 2);
    html += '</div>';
  } else {
    html += '<p style="color: #666; font-style: italic;">No configuration data found for this action.</p>';
  }

  // Show custom code if available
  if (customCode) {
    html += '<h5 style="color: #007bff; margin-top: 20px; margin-bottom: 10px;">Custom Code</h5>';
    html += '<div style="background-color: #f8f9fa; border: 1px solid #ccc; padding: 10px; border-radius: 4px; font-family: monospace; white-space: pre-wrap;">';
    html += customCode;
    html += '</div>';
  } else {
    html += '<p style="color: #666; font-style: italic;">No custom code found for this action.</p>';
  }

  html += '</div>';
  
  // Create plain text version for copy/paste
  let plain = `${title}\n\n`;
  if (extractedData) {
    plain += 'Configuration:\n';
    plain += JSON.stringify(extractedData, null, 2);
    plain += '\n\n';
  }
  if (customCode) {
    plain += 'Custom Code:\n';
    plain += customCode;
  }

  console.log('Final HTML:', html);
  console.log('Final plain text:', plain);

  // Show the modal
  showSourceModal(title, html, plain, {
    customCode: customCode,
    context: title,
    source: 'rule-websdk-action',
  });
}

// Function to show Adobe Analytics modal
function showAdobeAnalyticsModal(actions) {
  let html = '<div style="font-family: Arial, sans-serif;">';
  html += '<h4 style="color: #333; margin-bottom: 20px;">Adobe Analytics Configuration</h4>';
  
  // Find Adobe Analytics actions
  let aaActions = actions.filter(action => 
    action.modulePath && action.modulePath.includes('adobe-analytics/')
  );

  if (aaActions.length > 0) {
    html += '<h5 style="color: #007bff; margin-top: 20px; margin-bottom: 10px;">Adobe Analytics Actions</h5>';
    html += '<div style="background-color: #f8f9fa; border: 1px solid #ccc; padding: 15px; border-radius: 4px; font-family: monospace; white-space: pre-wrap;">';
    html += JSON.stringify(aaActions, null, 2);
    html += '</div>';
  } else {
    html += '<p>No Adobe Analytics actions found.</p>';
  }

  html += '</div>';
  
  // Create plain text version for copy/paste
  let plain = 'Adobe Analytics Configuration\n\n';
  if (aaActions.length > 0) {
    plain += 'Adobe Analytics Actions:\n';
    plain += JSON.stringify(aaActions, null, 2);
  } else {
    plain += 'No Adobe Analytics actions found.';
  }

  // Show the modal
  showSourceModal('Adobe Analytics Configuration', html, plain);
}

// Function to show source modal
function showSourceModal(title, htmlContent, plainText, options) {
  // Create modal container
  var modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 1000;
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
    max-width: 90%;
    max-height: 90%;
    overflow: auto;
    position: relative;
  `;

  // Create modal header
  var modalHeader = document.createElement('div');
  modalHeader.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    border-bottom: 1px solid #eee;
    padding-bottom: 10px;
  `;

  var modalTitle = document.createElement('h3');
  modalTitle.textContent = title;
  modalTitle.style.margin = '0';
  modalHeader.appendChild(modalTitle);

  // Create close button
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #666;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  closeBtn.onclick = function() {
    document.body.removeChild(modal);
  };
  modalHeader.appendChild(closeBtn);

  modalContent.appendChild(modalHeader);

  // Add HTML content
  var contentDiv = document.createElement('div');
  contentDiv.innerHTML = htmlContent;
  modalContent.appendChild(contentDiv);

  var buttonsContainer = document.createElement('div');
  buttonsContainer.style.marginTop = '20px';
  buttonsContainer.style.display = 'flex';
  buttonsContainer.style.gap = '10px';

  // Add copy button
  var copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy All';
  copyBtn.className = 'btn btn-primary';
  copyBtn.onclick = function() {
    navigator.clipboard.writeText(plainText).then(function() {
      copyBtn.textContent = 'Copied!';
      setTimeout(function() {
        copyBtn.textContent = 'Copy All';
      }, 2000);
    }).catch(function(err) {
      console.error('Could not copy text: ', err);
      copyBtn.textContent = 'Copy Failed';
      setTimeout(function() {
        copyBtn.textContent = 'Copy All';
      }, 2000);
    });
  };
  buttonsContainer.appendChild(copyBtn);

  // Optional AI explain button if customCode is available
  var aiOptions = options || {};
  if (aiOptions.customCode && typeof explainCustomCodeWithAI === 'function') {
    var explainBtn = document.createElement('button');
    explainBtn.textContent = 'Explain Custom Code with AI';
    explainBtn.className = 'btn btn-secondary';

    var explanationDiv = document.createElement('div');
    explanationDiv.style.cssText =
      'margin-top: 15px; font-size: 14px; color: #343a40; display: none;';

    explainBtn.onclick = async function() {
      if (explainBtn.disabled) {
        return;
      }

      explainBtn.disabled = true;
      var originalText = explainBtn.textContent;
      explainBtn.textContent = 'Explaining...';

      var explanation = await explainCustomCodeWithAI(aiOptions.customCode, {
        context: aiOptions.context || title,
        source: aiOptions.source || 'rule-action-custom-code',
      });

      explanationDiv.textContent = explanation;
      explanationDiv.style.display = 'block';

      explainBtn.textContent = originalText;
      explainBtn.disabled = false;
    };

    buttonsContainer.appendChild(explainBtn);
    modalContent.appendChild(buttonsContainer);
    modalContent.appendChild(explanationDiv);
  } else {
    modalContent.appendChild(buttonsContainer);
  }

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Close modal when clicking outside
  modal.onclick = function(e) {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  };
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

            // Create the three action buttons exactly as they were before
            var action1Div = document.createElement('div');
            action1Div.style.cssText = 'margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 4px; background-color: #f9f9f9;';
            
            var header1 = document.createElement('h4');
            header1.textContent = 'Web SDK - Update Variable (Data)';
            header1.style.margin = '0 0 10px 0';
            action1Div.appendChild(header1);
            
            var viewSourceBtn1 = document.createElement('button');
            viewSourceBtn1.textContent = 'View Source';
            viewSourceBtn1.className = 'btn btn-sm btn-outline-primary';
            viewSourceBtn1.style.marginBottom = '10px';
            viewSourceBtn1.onclick = function() {
              // Find the first Web SDK action
              let firstWebSDKAction = null;
              for (let j = 0; j < obj[i].actions.length; j++) {
                if (obj[i].actions[j].modulePath && obj[i].actions[j].modulePath.includes('adobe-alloy/')) {
                  firstWebSDKAction = obj[i].actions[j];
                  break;
                }
              }
              console.log('First Web SDK action for Data:', firstWebSDKAction);
              showWebSDKModal(firstWebSDKAction, 'Web SDK - Update Variable (Data)');
            };
            action1Div.appendChild(viewSourceBtn1);
            actions_tab.appendChild(action1Div);

            var action2Div = document.createElement('div');
            action2Div.style.cssText = 'margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 4px; background-color: #f9f9f9;';
            
            var header2 = document.createElement('h4');
            header2.textContent = 'Web SDK - Update Variable (XDM)';
            header2.style.margin = '0 0 10px 0';
            action2Div.appendChild(header2);
            
            var viewSourceBtn2 = document.createElement('button');
            viewSourceBtn2.textContent = 'View Source';
            viewSourceBtn2.className = 'btn btn-sm btn-outline-primary';
            viewSourceBtn2.style.marginBottom = '10px';
            viewSourceBtn2.onclick = function() {
              // Find the second Web SDK action
              let secondWebSDKAction = null;
              let webSDKCount = 0;
              for (let j = 0; j < obj[i].actions.length; j++) {
                if (obj[i].actions[j].modulePath && obj[i].actions[j].modulePath.includes('adobe-alloy/')) {
                  webSDKCount++;
                  if (webSDKCount === 2) {
                    secondWebSDKAction = obj[i].actions[j];
                    break;
                  }
                }
              }
              console.log('Second Web SDK action for XDM:', secondWebSDKAction);
              showWebSDKModal(secondWebSDKAction, 'Web SDK - Update Variable (XDM)');
            };
            action2Div.appendChild(viewSourceBtn2);
            actions_tab.appendChild(action2Div);

            var action3Div = document.createElement('div');
            action3Div.style.cssText = 'margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 4px; background-color: #f9f9f9;';
            
            var header3 = document.createElement('h4');
            header3.innerHTML = 'Adobe Analytics Configuration';
            header3.style.margin = '0 0 10px 0';
            action3Div.appendChild(header3);
            
            var viewSourceBtn3 = document.createElement('button');
            viewSourceBtn3.textContent = 'View Source';
            viewSourceBtn3.className = 'btn btn-sm btn-outline-primary';
            viewSourceBtn3.style.marginBottom = '10px';
            viewSourceBtn3.onclick = function() {
              showAdobeAnalyticsModal(obj[i].actions);
            };
            action3Div.appendChild(viewSourceBtn3);
            actions_tab.appendChild(action3Div);
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
