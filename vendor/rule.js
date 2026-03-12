var rule_details_node = document.getElementById('rule_details');
if (rule_details_node) {
  try {
  var rule = sessionStorage.getItem('_satellite._container.rules');
  var obj = null;
  if (rule && typeof rule === 'string' && rule.trim() !== '') {
    try {
      obj = JSON.parse(rule);
    } catch (parseErr) {
      console.error('Invalid rules JSON:', parseErr);
    }
  }

  // Create thead and tbody elements
  var thead = document.createElement('thead');
  var tbody = document.createElement('tbody');

  // Define all headers (6 columns; Size at end)
  var headers = [
    { text: 'ID #', tooltip: 'Rule number in sequential order' },
    { text: 'Rule Name', tooltip: 'Name of the rule in your Adobe Tags property' },
    { text: 'Events', tooltip: 'Event types that trigger this rule' },
    { text: 'Conditions', tooltip: 'Conditions for this rule (includes custom code)' },
    { text: 'Actions', tooltip: 'Actions performed by this rule (includes custom code)' },
    { text: 'Size (KB)', tooltip: 'Approximate rule size in kilobytes (from rule data)' }
  ];
  var headerRow = document.createElement('tr');
  headers.forEach((header, index) => {
    var th = document.createElement('th');
    th.innerHTML = `${header.text} &nbsp;<i class="fa fa-info-circle" style="font-size: 16px" title="${header.tooltip}"></i>`;
    th.classList.add('sortable');
    if (index === 0) th.classList.add('rule-col-id');
    // Add click handler for sorting
    th.addEventListener('click', function () {
      sortTable(index);
    });
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  // Handle different data structures
  let rulesArray = [];
  if (Array.isArray(obj)) {
    rulesArray = obj;
  } else if (typeof obj === 'object' && obj !== null) {
    // If it's an object, try to find an array of rules
    if (obj.rules && Array.isArray(obj.rules)) {
      rulesArray = obj.rules;
    } else {
      // Convert object to array
      rulesArray = Object.values(obj).filter(item => typeof item === 'object' && item !== null);
    }
  }

  console.log('Processed rules array:', rulesArray);

  // Helper function to escape code for use in onclick handlers
  function escapeCode(code) {
    if (!code || typeof code !== 'string') return '';
    return code.replace(/'/g, "\\'")
               .replace(/"/g, '&quot;')
               .replace(/\n/g, '\\n')
               .replace(/\r/g, '\\r');
  }

  // Helper function to create a badge element
  function createBadge(text, type) {
    const badge = document.createElement('span');
    badge.className = type + '-badge';
    badge.textContent = text;
    return badge;
  }

  // Helper function to create a view code button
  function createCodeButton(title, code, index) {
    const button = document.createElement('button');
    button.className = 'code-button';
    button.innerHTML = '<span class="code-icon">📝</span> View Code';
    button.title = title;
    button.onclick = function(e) {
      e.stopPropagation();
      const escapedCode = escapeCode(code);
      showCodeModal(title, code);
    };
    return button;
  }

  // Helper: compute rule size in KB (use rule.size if provided by API, else approximate from JSON)
  function getRuleSizeKb(rule) {
    if (rule == null) return 0;
    if (typeof rule.size === 'number' && rule.size >= 0) return rule.size / 1024;
    try {
      var json = JSON.stringify(rule);
      if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).length / 1024;
      if (typeof Blob !== 'undefined') return new Blob([json]).size / 1024;
      return (json.length * 2) / 1024; // UTF-16 surrogate estimate
    } catch (e) { return 0; }
  }

  // Helper: icon-only display for Events/Conditions/Actions columns (click expands row to show details)
  function createRuleColumnIcon(iconClass, arr, label, rowTr) {
    var hasData = arr && Array.isArray(arr) && arr.length > 0;
    var count = hasData ? arr.length : 0;
    var span = document.createElement('span');
    span.className = 'rule-col-icon ' + (hasData ? 'rule-col-icon-has' : 'rule-col-icon-empty');
    span.title = (hasData ? label + ': ' + count : 'No ' + label.toLowerCase()) + ' (click to show details)';
    var icon = document.createElement('i');
    icon.className = 'fas ' + iconClass;
    span.appendChild(icon);
    if (hasData && count > 1) {
      var countSpan = document.createElement('span');
      countSpan.className = 'rule-col-icon-count';
      countSpan.textContent = count;
      span.appendChild(countSpan);
    }
    if (rowTr) {
      span.onclick = function (e) {
        e.stopPropagation();
        var expandIcon = rowTr.querySelector('.expand-icon');
        if (expandIcon) toggleExpand(expandIcon, rowTr._rowIndex);
      };
    }
    return span;
  }

  // Helper function to render conditions with badges and custom code
  function renderConditionsColumn(rule, customCodeConditions) {
    const wrapper = document.createElement('div');
    wrapper.className = 'items-wrapper';
    
    if (!rule.conditions || !Array.isArray(rule.conditions) || rule.conditions.length === 0) {
      const noneText = document.createElement('span');
      noneText.className = 'none-text';
      noneText.textContent = 'None';
      wrapper.appendChild(noneText);
      return wrapper;
    }

    // Extract condition names/types for badges
    const conditionTypes = [];
    rule.conditions.forEach((condition, index) => {
      let conditionName = 'Unknown Condition';
      
      if (condition.modulePath) {
        const pathParts = condition.modulePath.split('/');
        const fileName = pathParts[pathParts.length - 1];
        conditionName = fileName.replace('.js', '');
      } else if (condition.name) {
        conditionName = condition.name;
      } else if (condition.type) {
        conditionName = condition.type;
      }
      
      conditionTypes.push(conditionName);
      wrapper.appendChild(createBadge(conditionName, 'condition'));
    });

    // Add count badge if multiple
    if (conditionTypes.length > 1) {
      const countBadge = document.createElement('span');
      countBadge.className = 'count-badge';
      countBadge.textContent = '×' + conditionTypes.length;
      wrapper.appendChild(countBadge);
    }

    // Add custom code button if exists
    if (customCodeConditions && customCodeConditions.length > 0) {
      customCodeConditions.forEach((codeObj, index) => {
        const code = typeof codeObj === 'string' ? codeObj : codeObj.code;
        if (code && code.trim()) {
          const buttonTitle = customCodeConditions.length > 1 
            ? `Custom Code - Condition ${index + 1}`
            : 'Custom Code - Condition';
          wrapper.appendChild(createCodeButton(buttonTitle, code, index));
        }
      });
    }

    return wrapper;
  }

  // Helper function to render actions with badges and custom code
  function renderActionsColumn(rule, customCodeActions) {
    const wrapper = document.createElement('div');
    wrapper.className = 'items-wrapper';
    
    if (!rule.actions || !Array.isArray(rule.actions) || rule.actions.length === 0) {
      const noneText = document.createElement('span');
      noneText.className = 'none-text';
      noneText.textContent = 'None';
      wrapper.appendChild(noneText);
      return wrapper;
    }

    // Extract action names for badges
    const actionTypes = [];
    rule.actions.forEach((action) => {
      let actionName = 'Unknown Action';
      
      if (action.modulePath) {
        const pathParts = action.modulePath.split('/');
        const fileName = pathParts[pathParts.length - 1];
        let displayName = fileName.replace('.js', '');
        
        // Use the same logic as existing code to determine display name
        if (action.modulePath.includes('adobe-analytics/src/lib/actions/setVariables.js')) {
          displayName = 'SetVariable';
        } else if (action.modulePath.includes('adobe-analytics/src/lib/actions/updateVariables.js')) {
          displayName = 'UpdateVariable';
        } else if (action.modulePath.includes('adobe-alloy/')) {
          if (action.modulePath.includes('sendEvent')) displayName = 'WebSDK Send Event';
          else if (action.modulePath.includes('sendBeacon')) displayName = 'WebSDK Send Beacon';
          else if (action.modulePath.includes('setConsent')) displayName = 'WebSDK Set Consent';
          else if (action.modulePath.includes('setVariables')) displayName = 'WebSDK SetVariable';
          else if (action.modulePath.includes('updateVariables')) displayName = 'WebSDK Update Variable';
        }
        
        actionName = displayName;
      } else if (action.name) {
        actionName = action.name;
      } else if (action.type) {
        actionName = action.type;
      }
      
      actionTypes.push(actionName);
      wrapper.appendChild(createBadge(actionName, 'action'));
    });

    // Add count badge if multiple
    if (actionTypes.length > 1) {
      const countBadge = document.createElement('span');
      countBadge.className = 'count-badge';
      countBadge.textContent = '×' + actionTypes.length;
      wrapper.appendChild(countBadge);
    }

    // Add custom code button if exists
    if (customCodeActions && customCodeActions.length > 0) {
      customCodeActions.forEach((codeObj, index) => {
        const code = typeof codeObj === 'string' ? codeObj : (codeObj.code || '');
        if (code && code.trim()) {
          const buttonTitle = customCodeActions.length > 1
            ? `Custom Code - Action ${index + 1} (${codeObj.actionName || 'Action'})`
            : `Custom Code - Action (${codeObj.actionName || 'Action'})`;
          wrapper.appendChild(createCodeButton(buttonTitle, code, index));
        }
      });
    }

    return wrapper;
  }

  for (let i = 0; i < rulesArray.length; i++) {
    const rule = rulesArray[i];
    console.log(`Processing rule ${i}:`, rule);

    const tr = document.createElement('tr');
    tr.classList.add('data-displayed');
    tr._rowIndex = i;

    // ID # (1-indexed)
    var tdId = document.createElement('td');
    tdId.classList.add('rule-col-id');
    tdId.style.textAlign = 'center';
    tdId.style.fontWeight = '600';
    tdId.textContent = i + 1;
    tr.appendChild(tdId);

    // Rule Name with chevron (click expands row only; no link, no navigation)
    var tdName = document.createElement('td');
    tdName.classList.add('rule-name-cell');
    tdName.style.cursor = 'pointer';
    const ruleName = rule.name || rule.id || `Rule ${i + 1}`;
    var ruleNameExpandIcon = document.createElement('span');
    ruleNameExpandIcon.className = 'expand-icon';
    ruleNameExpandIcon.textContent = '▶';
    ruleNameExpandIcon.style.marginRight = '8px';
    ruleNameExpandIcon.style.display = 'inline-block';
    ruleNameExpandIcon.style.transition = 'transform 0.3s ease';
    var ruleNameSpan = document.createElement('span');
    ruleNameSpan.textContent = ruleName.replaceAll(',', '');
    ruleNameSpan.classList.add('rule-name-text');
    tdName.appendChild(ruleNameExpandIcon);
    tdName.appendChild(ruleNameSpan);
    tdName.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      var expandIcon = tr.querySelector('.expand-icon');
      if (expandIcon) toggleExpand(expandIcon, tr._rowIndex);
      return false;
    };
    tr.appendChild(tdName);

    // Rule Event(s) – icon only (click to expand details)
    var tdEvents = document.createElement('td');
    tdEvents.appendChild(createRuleColumnIcon('fa-bolt', rule.events, 'Events', tr));
    tr.appendChild(tdEvents);

    // Rule Condition(s) - will be populated after custom code extraction
    var tdConds = document.createElement('td');
    // Store reference for later update
    tr._tdConds = tdConds;
    tr.appendChild(tdConds);

    // Rule Action(s)
    var tdActions = document.createElement('td');
    console.log(`Rule ${i} actions:`, rule.actions);
    if (rule.actions && Array.isArray(rule.actions)) {
      // Extract action information with better debugging
      const actionInfo = rule.actions.map((action, actionIndex) => {
        console.log(`Action ${actionIndex}:`, action);
        let actionDescription = '';

        // Check for action type
        if (action.type) {
          actionDescription += action.type;
        }

        // Check for action name
        if (action.name) {
          actionDescription = action.name;
        }

        // Check for action settings
        if (action.settings) {
          if (action.settings.actionName) {
            actionDescription = action.settings.actionName;
          }
          if (action.settings.actionType) {
            actionDescription = action.settings.actionType + (actionDescription ? ` (${actionDescription})` : '');
          }
          if (action.settings.track) {
            actionDescription += ` - ${action.settings.track}`;
          }
          if (action.settings.eventName) {
            actionDescription += ` - ${action.settings.eventName}`;
          }
          if (action.settings.variable) {
            actionDescription += ` - ${action.settings.variable}`;
          }
        }

        // Check for modulePath to identify action type
        if (action.modulePath) {
          const pathParts = action.modulePath.split('/');
          const fileName = pathParts[pathParts.length - 1];
          let displayName = fileName.replace('.js', '');

          // Check for specific Adobe Analytics actions
          if (action.modulePath.includes('adobe-analytics/src/lib/actions/setVariables.js')) {
            displayName = 'Adobe Analytics SetVariable';
          } else if (action.modulePath.includes('adobe-analytics/src/lib/actions/updateVariables.js')) {
            displayName = 'Adobe Analytics UpdateVariable';
          } else if (action.modulePath.includes('adobe-alloy/') && action.modulePath.includes('sendEvent')) {
            displayName = 'WebSDK Send Event';
          } else if (action.modulePath.includes('adobe-alloy/') && action.modulePath.includes('sendBeacon')) {
            displayName = 'WebSDK Send Beacon';
          } else if (action.modulePath.includes('adobe-alloy/') && action.modulePath.includes('setConsent')) {
            displayName = 'WebSDK Set Consent';
          } else if (action.modulePath.includes('adobe-alloy/') && action.modulePath.includes('getData')) {
            displayName = 'WebSDK Get Data';
          } else if (action.modulePath.includes('adobe-alloy/') && action.modulePath.includes('setCustomerIds')) {
            displayName = 'WebSDK Set Customer IDs';
          } else if (action.modulePath.includes('adobe-alloy/') && action.modulePath.includes('setDebug')) {
            displayName = 'WebSDK Set Debug';
          } else if (action.modulePath.includes('adobe-alloy/') && action.modulePath.includes('setIdentityMap')) {
            displayName = 'WebSDK Set Identity Map';
          } else if (action.modulePath.includes('adobe-alloy/') && action.modulePath.includes('setTimestamp')) {
            displayName = 'WebSDK Set Timestamp';
          } else if (action.modulePath.includes('adobe-alloy/') && action.modulePath.includes('setUserId')) {
            displayName = 'WebSDK Set User ID';
          } else if (action.modulePath.includes('adobe-alloy/') && action.modulePath.includes('setViewport')) {
            displayName = 'WebSDK Set Viewport';
          } else if (action.modulePath.includes('adobe-alloy/') && action.modulePath.includes('setWorkflow')) {
            displayName = 'WebSDK Set Workflow';
          } else if (action.modulePath.includes('adobe-alloy/') && action.modulePath.includes('setWorkflowState')) {
            displayName = 'WebSDK Set Workflow State';
          } else if (action.modulePath.includes('adobe-alloy/') && action.modulePath.includes('setVariables')) {
            displayName = 'WebSDK SetVariable';
          } else if (action.modulePath.includes('adobe-alloy/') && action.modulePath.includes('updateVariables')) {
            displayName = 'WebSDK Update Variable';
          } else if (displayName === 'index') {
            // For other index.js files, check the full path to determine the correct name
            if (action.modulePath.includes('sendEvent')) {
              if (action.modulePath.includes('adobe-alloy/')) {
                displayName = 'WebSDK Send Event';
              } else {
                displayName = 'Send Event';
              }
            } else if (action.modulePath.includes('sendBeacon')) {
              if (action.modulePath.includes('adobe-alloy/')) {
                displayName = 'WebSDK Send Beacon';
              } else {
                displayName = 'Send Beacon';
              }
            } else if (action.modulePath.includes('setConsent')) {
              if (action.modulePath.includes('adobe-alloy/')) {
                displayName = 'WebSDK Set Consent';
              } else {
                displayName = 'Set Consent';
              }
            } else if (action.modulePath.includes('getData')) {
              if (action.modulePath.includes('adobe-alloy/')) {
                displayName = 'WebSDK Get Data';
              } else {
                displayName = 'Get Data';
              }
            } else if (action.modulePath.includes('setCustomerIds')) {
              if (action.modulePath.includes('adobe-alloy/')) {
                displayName = 'WebSDK Set Customer IDs';
              } else {
                displayName = 'Set Customer IDs';
              }
            } else if (action.modulePath.includes('setDebug')) {
              if (action.modulePath.includes('adobe-alloy/')) {
                displayName = 'WebSDK Set Debug';
              } else {
                displayName = 'Set Debug';
              }
            } else if (action.modulePath.includes('setIdentityMap')) {
              if (action.modulePath.includes('adobe-alloy/')) {
                displayName = 'WebSDK Set Identity Map';
              } else {
                displayName = 'Set Identity Map';
              }
            } else if (action.modulePath.includes('setTimestamp')) {
              if (action.modulePath.includes('adobe-alloy/')) {
                displayName = 'WebSDK Set Timestamp';
              } else {
                displayName = 'Set Timestamp';
              }
            } else if (action.modulePath.includes('setUserId')) {
              if (action.modulePath.includes('adobe-alloy/')) {
                displayName = 'WebSDK Set User ID';
              } else {
                displayName = 'Set User ID';
              }
            } else if (action.modulePath.includes('setViewport')) {
              if (action.modulePath.includes('adobe-alloy/')) {
                displayName = 'WebSDK Set Viewport';
              } else {
                displayName = 'Set Viewport';
              }
            } else if (action.modulePath.includes('setWorkflow')) {
              if (action.modulePath.includes('adobe-alloy/')) {
                displayName = 'WebSDK Set Workflow';
              } else {
                displayName = 'Set Workflow';
              }
            } else if (action.modulePath.includes('setWorkflowState')) {
              if (action.modulePath.includes('adobe-alloy/')) {
                displayName = 'WebSDK Set Workflow State';
              } else {
                displayName = 'Set Workflow State';
              }
            } else if (action.modulePath.includes('setVariables')) {
              if (action.modulePath.includes('adobe-alloy/')) {
                displayName = 'WebSDK SetVariable';
              } else {
                displayName = 'Adobe Analytics SetVariable';
              }
            } else if (action.modulePath.includes('updateVariables')) {
              if (action.modulePath.includes('adobe-alloy/')) {
                displayName = 'WebSDK Update Variable';
              } else {
                displayName = 'Adobe Analytics UpdateVariable';
              }
            } else {
              displayName = 'UpdateVariable'; // Default fallback
            }
          }

          // Always use the specific action type if we found one, otherwise append to existing description
          if (displayName && (displayName.includes('Adobe Analytics') || displayName.includes('WebSDK'))) {
            actionDescription = displayName;
          } else if (fileName && !actionDescription.includes(displayName)) {
            actionDescription = displayName + (actionDescription ? ` (${actionDescription})` : '');
          }
        }

        // If still no description, try to extract from any available property
        if (!actionDescription) {
          if (action.actionType) actionDescription = action.actionType;
          else if (action.actionName) actionDescription = action.actionName;
          else if (action.track) actionDescription = `track ${action.track}`;
          else actionDescription = 'Unknown Action';
        }

        return actionDescription;
      });

      // Create the display content
      const actionDetails = actionInfo.join(', ');

      // Check if any action has code content
      let actionCodeContents = [];
      console.log('Checking for action code content...');
      console.log('Total actions to check:', rule.actions.length);

      for (let actionIndex = 0; actionIndex < rule.actions.length; actionIndex++) {
        const action = rule.actions[actionIndex];
        console.log(`\n=== Checking action ${actionIndex} ===`);
        console.log(`Action ${actionIndex} modulePath:`, action.modulePath);
        console.log(`Action ${actionIndex} name:`, action.name);
        console.log(`Action ${actionIndex} settings:`, action.settings);

        // Check for custom code using the correct path: actions → settings → source
        if (action.settings && action.settings.source && typeof action.settings.source === 'string') {
          console.log(`Action ${actionIndex} has settings.source:`, action.settings.source.substring(0, 100) + '...');
          const source = action.settings.source;
          // Filter out URLs - only show actual JavaScript code
          if (source && !source.startsWith('http') && !source.startsWith('@http') && !source.includes('assets.adobedtm.com')) {
            console.log(`Action ${actionIndex} has valid custom code (not URL)`);
            console.log(`Full custom code length:`, source.length);
            console.log(`Full custom code preview:`, source.substring(0, 200) + '...');
            actionCodeContents.push({
              index: actionIndex,
              code: source,
              actionName: action.name || `Action ${actionIndex + 1}`
            });
            console.log(`Added action ${actionIndex} to actionCodeContents. Total now:`, actionCodeContents.length);
          } else {
            console.log(`Action ${actionIndex} source was filtered out (URL detected):`, source.substring(0, 50) + '...');
          }
        } else {
          console.log(`Action ${actionIndex} has no settings.source or it's not a string`);
          if (action.settings) {
            console.log(`Action ${actionIndex} settings keys:`, Object.keys(action.settings));
            // Check for other possible code locations
            if (action.settings.code) {
              console.log(`Action ${actionIndex} has settings.code:`, action.settings.code.substring(0, 100) + '...');
            }
            if (action.settings.script) {
              console.log(`Action ${actionIndex} has settings.script:`, action.settings.script.substring(0, 100) + '...');
            }
            if (action.settings.customCode) {
              console.log(`Action ${actionIndex} has settings.customCode:`, action.settings.customCode.substring(0, 100) + '...');
            }
            if (action.settings.body) {
              console.log(`Action ${actionIndex} has settings.body:`, action.settings.body.substring(0, 100) + '...');
            }
            if (action.settings.content) {
              console.log(`Action ${actionIndex} has settings.content:`, action.settings.content.substring(0, 100) + '...');
            }
          }

          // Check if this is a custom code action by modulePath (but exclude actions named "customCode")
          if (action.modulePath && (
            action.modulePath.includes('customCode') ||
            action.modulePath.includes('custom-code') ||
            action.modulePath.includes('custom') ||
            action.modulePath.includes('script')
          )) {
            // Skip if the action name is exactly "customCode" to avoid cluttering the interface
            const actionName = action.name || '';
            const settingsActionName = action.settings && action.settings.actionName ? action.settings.actionName : '';

            if (actionName.toLowerCase() === 'customcode' ||
              settingsActionName.toLowerCase() === 'customcode' ||
              actionName.toLowerCase() === 'custom code' ||
              settingsActionName.toLowerCase() === 'custom code') {
              console.log(`Action ${actionIndex} is named "customCode" - skipping Show More functionality to reduce clutter`);
            } else {
              console.log(`Action ${actionIndex} appears to be a custom code action by modulePath:`, action.modulePath);
              // Try to find any string content in settings that might be code
              if (action.settings) {
                for (const [key, value] of Object.entries(action.settings)) {
                  if (typeof value === 'string' && value.length > 10 &&
                    !value.startsWith('http') && !value.includes('assets.adobedtm.com')) {
                    console.log(`Action ${actionIndex} has potential code in settings.${key}:`, value.substring(0, 100) + '...');
                    actionCodeContents.push({
                      index: actionIndex,
                      code: value,
                      actionName: action.name || `Action ${actionIndex + 1} (${key})`
                    });
                    console.log(`Added action ${actionIndex} from ${key} to actionCodeContents. Total now:`, actionCodeContents.length);
                  }
                }
              }
            }
          }
        }
      }

      console.log('Final actionCodeContents:', actionCodeContents.length > 0 ? `${actionCodeContents.length} found` : 'None');
      if (actionCodeContents.length > 0) {
        console.log('Action code contents:', actionCodeContents.map((item, i) => `${i + 1}. ${item.actionName} (${item.code.length} chars)`));
      }

      // Store actionCodeContents for later rendering
      tr._actionCodeContents = actionCodeContents;
    } else {
      tr._actionCodeContents = [];
    }
    
    // Rule Action(s) - will be populated after custom code extraction  
    var tdActions = document.createElement('td');
    // Store reference for later update
    tr._tdActions = tdActions;
    // Note: tdActions will be appended later after Custom Code (Condition)

    // Custom Code (Condition)
    var tdCustomCodeCond = document.createElement('td');
    let customCodeCondContent = '';
    let customCodeCondUrls = [];

    // Helper function to detect if content is actual custom code
    function isActualCustomCode(content) {
      if (!content || typeof content !== 'string') return false;

      console.log('Checking if content is actual custom code:', content.substring(0, 100) + '...');

      // URLs ARE valid custom code sources in Adobe Tags (external code)
      if (content.startsWith('http') || content.startsWith('@http') || content.includes('assets.adobedtm.com')) {
        console.log('Found valid external code URL');
        return true;
      }

      // Filter out function definitions (like function generateUUID() {...} or function(){...})
      if (content.trim().startsWith('function') && content.includes('(') && content.includes(')')) {
        console.log('Filtered out: Function definition detected');
        return false;
      }

      // Filter out simple variable assignments or basic statements
      const trimmed = content.trim();
      if (trimmed.startsWith('let ') || trimmed.startsWith('var ') || trimmed.startsWith('const ')) {
        // Only consider it custom code if it contains more complex logic
        if (!trimmed.includes('{') && !trimmed.includes('if') && !trimmed.includes('for') && !trimmed.includes('while')) {
          console.log('Filtered out: Simple variable assignment');
          return false;
        }
      }

      // Must contain actual JavaScript logic (not just function definitions)
      const isActualCode = content.includes('{') || content.includes('if') || content.includes('for') ||
        content.includes('while') || content.includes('return') || content.includes('console.') ||
        content.includes('_satellite.') || content.includes('dataLayer.') || content.includes('gtag.') ||
        content.includes('fbq.') || content.includes('analytics.') || content.includes('ga.') ||
        content.length > 50; // If it's longer than 50 chars, it's likely actual code

      console.log('isActualCustomCode result:', isActualCode);
      return isActualCode;
    }

    // Helper function to extract function body from minified code
    function extractFunctionBody(code) {
      if (!code || typeof code !== 'string') return code;

      console.log('Extracting function body from:', code.substring(0, 100) + '...');

      // Look for function(){...} pattern
      const functionMatch = code.match(/function\(\)\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/);
      if (functionMatch) {
        const functionBody = functionMatch[1];
        console.log('Extracted function body:', functionBody);

        // Beautify the extracted function body to make it readable
        let beautified = functionBody
          // Replace let e=!1 with let returnVal = false
          .replace(/let\s+(\w+)=\!1/g, 'let $1 = false')
          // Replace let e=!0 with let returnVal = true  
          .replace(/let\s+(\w+)=\!0/g, 'let $1 = true')
          // Replace undefined==typeof with typeof === "undefined"
          .replace(/undefined==typeof\s+(\w+)/g, 'typeof $1 === "undefined"')
          // Replace &&(e=!0) with && (e = true)
          .replace(/&&\(([^)]+)\)/g, '&& ($1)')
          // Replace ||(e=!1) with || (e = false)
          .replace(/\|\|\(([^)]+)\)/g, '|| ($1)')
          // Add spaces around operators
          .replace(/([^=!<>])=([^=])/g, '$1 = $2')
          .replace(/([^=!<>])==([^=])/g, '$1 == $2')
          .replace(/([^=!<>])!=([^=])/g, '$1 != $2')
          .replace(/([^=!<>])!==([^=])/g, '$1 !== $2')
          .replace(/([^=!<>])===([^=])/g, '$1 === $2')
          // Add spaces around logical operators
          .replace(/([^&])&([^&])/g, '$1 && $2')
          .replace(/([^|])\|([^|])/g, '$1 || $2')
          // Add spaces around comparison operators
          .replace(/([^<>])>([^=])/g, '$1 > $2')
          .replace(/([^<>])<([^=])/g, '$1 < $2')
          .replace(/([^<>])>=/g, '$1 >= ')
          .replace(/([^<>])<=/g, '$1 <= ')
          // Add spaces around arithmetic operators
          .replace(/([^+\-*/])+([^+])/g, '$1 + $2')
          .replace(/([^+\-*/])-([^-])/g, '$1 - $2')
          .replace(/([^+\-*/])\*([^*])/g, '$1 * $2')
          .replace(/([^+\-*/])\/([^/])/g, '$1 / $2')
          // Add line breaks after semicolons
          .replace(/;/g, ';\n  ')
          // Add line breaks after return statements
          .replace(/return\s+([^;]+);/g, 'return $1;\n  ')
          // Clean up multiple spaces
          .replace(/\s+/g, ' ')
          .trim();

        console.log('Beautified function body:', beautified);
        return beautified;
      }

      // If no function wrapper found, return the code as-is
      console.log('No function wrapper found, returning code as-is');
      return code;
    }

    // Helper function to detect if code is minified
    function isMinifiedCode(content) {
      if (!content || typeof content !== 'string') return false;

      // Check for minified code characteristics
      const minifiedPatterns = [
        /function\(\)\{[^}]*\}/, // function(){...} without spaces
        /let\s+\w+=\![01]/, // let e=!1 or let e=!0
        /[^=]=[^=]/, // single character variable names
        /[^a-zA-Z]\w{1,2}[^a-zA-Z]/, // very short variable names
        /"[^"]*"\+[^+]*\+/, // concatenated strings without spaces
        /undefined==typeof/, // minified typeof checks
        /&&\([^)]+\)/, // minified logical operations
        /return\s+[^;]+,[^;]+/ // multiple return statements on one line
      ];

      return minifiedPatterns.some(pattern => pattern.test(content));
    }

    // Helper function to beautify minified code
    function beautifyMinifiedCode(content) {
      if (!content || typeof content !== 'string') return content;

      console.log('Attempting to beautify minified code...');

      // Basic beautification for common minified patterns
      let beautified = content;

      // Replace common minified patterns with more readable versions
      beautified = beautified
        // Replace let e=!1 with let returnVal = false
        .replace(/let\s+(\w+)=\!1/g, 'let $1 = false')
        // Replace let e=!0 with let returnVal = true  
        .replace(/let\s+(\w+)=\!0/g, 'let $1 = true')
        // Replace undefined==typeof with typeof === "undefined"
        .replace(/undefined==typeof\s+(\w+)/g, 'typeof $1 === "undefined"')
        // Replace &&(e=!0) with && (e = true)
        .replace(/&&\(([^)]+)\)/g, '&& ($1)');

      // Try to format the function structure
      if (beautified.includes('function(){')) {
        beautified = beautified
          .replace(/function\(\)\{/g, 'function() {\n  ')
          .replace(/\}$/g, '\n}')
          .replace(/;/g, ';\n  ')
          .replace(/,\s*([^,]+)$/g, ',\n  $1');
      }

      console.log('Beautified code:', beautified);
      return beautified;
    }

    // Helper function to de-minify function code to make it more readable
    function deMinifyFunction(code) {
      if (!code || typeof code !== 'string') return code;

      console.log('Attempting to de-minify function:', code.substring(0, 100) + '...');

      let deMinified = code;

      // Handle the most common minified patterns first
      deMinified = deMinified
        // Convert return !0 to return false
        .replace(/return\s*\!0/g, 'return false')
        .replace(/return\s*\!1/g, 'return true')
        .replace(/return\s*\!\+0/g, 'return false')
        .replace(/return\s*\!\+1/g, 'return true')

        // Convert other boolean literals
        .replace(/(?<!return\s)\!0/g, 'false')
        .replace(/(?<!return\s)\!1/g, 'true')
        .replace(/(?<!return\s)\!\+0/g, 'false')
        .replace(/(?<!return\s)\!\+1/g, 'true')

        // Convert variable assignments
        .replace(/let\s+(\w+)=\!0/g, 'let $1 = true')
        .replace(/let\s+(\w+)=\!1/g, 'let $1 = false')
        .replace(/var\s+(\w+)=\!0/g, 'var $1 = true')
        .replace(/var\s+(\w+)=\!1/g, 'var $1 = false')
        .replace(/const\s+(\w+)=\!0/g, 'const $1 = true')
        .replace(/const\s+(\w+)=\!1/g, 'const $1 = false')

        // Convert comparison operators
        .replace(/undefined==typeof\s+(\w+)/g, 'typeof $1 === "undefined"')
        .replace(/typeof\s+(\w+)==="undefined"/g, 'typeof $1 === "undefined"')
        .replace(/typeof\s+(\w+)==="string"/g, 'typeof $1 === "string"')
        .replace(/typeof\s+(\w+)==="number"/g, 'typeof $1 === "number"')
        .replace(/typeof\s+(\w+)==="object"/g, 'typeof $1 === "object"')

        // Convert logical operators
        .replace(/&&\(([^)]+)\)/g, '&& ($1)')
        .replace(/\|\|\(([^)]+)\)/g, '|| ($1)')
        .replace(/!\(([^)]+)\)/g, '!($1)');

      // Format function structure if it's a simple function
      if (deMinified.includes('function(){')) {
        deMinified = deMinified
          .replace(/function\(\)\{/g, 'function() {\n  ')
          .replace(/\}$/g, '\n}');
      }

      // Clean up the result
      deMinified = deMinified.trim();

      console.log('De-minified result:', deMinified.substring(0, 100) + '...');
      return deMinified;
    }

    // Helper function to try to find original source code
    function findOriginalSource(settings) {
      if (!settings) return null;

      console.log('Searching for original source in settings:', Object.keys(settings));

      // Priority order for finding original source
      const sourceProperties = [
        'originalSource',
        'sourceCode',
        'code',
        'customCode',
        'script',
        'javascript',
        'jsCode',
        'source',
        'userCode',
        'inputCode',
        'editorCode'
      ];

      // First, try to find non-minified code
      for (const prop of sourceProperties) {
        if (settings[prop] && typeof settings[prop] === 'string') {
          const code = settings[prop];
          console.log(`Checking ${prop}:`, code.substring(0, 100) + '...');
          // Prefer non-minified code
          if (!isMinifiedCode(code)) {
            console.log(`Found original source in ${prop}`);
            return code;
          }
        }
      }

      // Check for codeEditor.source which might contain the original
      if (settings.codeEditor && settings.codeEditor.source) {
        const editorSource = settings.codeEditor.source;
        console.log('Checking codeEditor.source:', editorSource.substring(0, 100) + '...');
        if (!isMinifiedCode(editorSource)) {
          console.log('Found original source in codeEditor.source');
          return editorSource;
        }
      }

      // Check for other nested properties that might contain original code
      const nestedProps = ['customSetup', 'editor', 'config', 'input', 'userInput', 'codeEditor', 'customCode'];
      for (const nestedProp of nestedProps) {
        if (settings[nestedProp] && typeof settings[nestedProp] === 'object') {
          console.log(`Checking nested property: ${nestedProp}`, Object.keys(settings[nestedProp]));
          for (const prop of sourceProperties) {
            if (settings[nestedProp][prop] && typeof settings[nestedProp][prop] === 'string') {
              const code = settings[nestedProp][prop];
              console.log(`Checking ${nestedProp}.${prop}:`, code.substring(0, 100) + '...');
              if (!isMinifiedCode(code)) {
                console.log(`Found original source in ${nestedProp}.${prop}`);
                return code;
              }
            }
          }
        }
      }

      // Check for function properties that might have original source
      if (settings.source && typeof settings.source === 'function') {
        const func = settings.source;
        console.log('Checking function properties for original source');

        // Check if the function has any properties that might contain original source
        for (const prop of sourceProperties) {
          if (func[prop] && typeof func[prop] === 'string') {
            const code = func[prop];
            console.log(`Checking function.${prop}:`, code.substring(0, 100) + '...');
            if (!isMinifiedCode(code)) {
              console.log(`Found original source in function.${prop}`);
              return code;
            }
          }
        }

        // Check for other common function properties
        const funcProps = ['originalCode', 'userCode', 'inputCode', 'editorCode', 'rawCode'];
        for (const prop of funcProps) {
          if (func[prop] && typeof func[prop] === 'string') {
            const code = func[prop];
            console.log(`Checking function.${prop}:`, code.substring(0, 100) + '...');
            if (!isMinifiedCode(code)) {
              console.log(`Found original source in function.${prop}`);
              return code;
            }
          }
        }
      }

      // If all code is minified, return the first available source
      for (const prop of sourceProperties) {
        if (settings[prop] && typeof settings[prop] === 'string') {
          console.log(`Found minified source in ${prop}, but no original found`);
          return settings[prop];
        }
      }

      // Also check codeEditor.source even if minified
      if (settings.codeEditor && settings.codeEditor.source) {
        console.log('Found minified source in codeEditor.source, but no original found');
        return settings.codeEditor.source;
      }

      return null;
    }

    // Helper function to clean up URLs (remove .min from .min.js files)
    function cleanCustomCodeUrl(url) {
      if (typeof url === 'string' && url.includes('.min.js')) {
        return url.replace('.min.js', '.js');
      }
      return url;
    }

    // Helper function to search for specific names in JavaScript content
    function searchForNamesInCode(code, searchNames) {
      if (!code || !searchNames || searchNames.length === 0) return [];

      const foundNames = [];
      const codeLower = code.toLowerCase();

      searchNames.forEach(name => {
        const nameLower = name.toLowerCase();
        if (codeLower.includes(nameLower)) {
          foundNames.push(name);
        }
      });

      return foundNames;
    }

    // Helper function to extract a human-readable summary from code
    function extractCodeSummary(code) {
      if (!code || typeof code !== 'string') return 'No summary available';

      const summary = {
        checks: [],
        variables: [],
        operators: []
      };

      // Extract variable references (e.g., digitalData.page.category, event.detail)
      const variablePatterns = [
        /(\w+\.\w+(?:\.\w+)*)/g,  // Matches: digitalData.page.category
        /(\w+\?\.\w+(?:\?\.\w+)*)/g  // Matches: e?.detail?.eventInfo
      ];

      variablePatterns.forEach(pattern => {
        const matches = code.match(pattern);
        if (matches) {
          matches.forEach(match => {
            // Filter out common JavaScript keywords and short variables
            if (match.length > 3 && !['return', 'function', 'typeof', 'undefined'].includes(match)) {
              // Clean up optional chaining
              const cleaned = match.replace(/\?/g, '');
              if (!summary.variables.includes(cleaned)) {
                summary.variables.push(cleaned);
              }
            }
          });
        }
      });

      // Extract property names being checked (last part of dot notation)
      const propertyMatches = code.match(/\.(\w+)/g);
      if (propertyMatches) {
        propertyMatches.forEach(match => {
          const prop = match.substring(1); // Remove the dot
          if (prop.length > 2 && !summary.checks.includes(prop)) {
            summary.checks.push(prop);
          }
        });
      }

      // Detect comparison operators
      if (code.includes('===')) summary.operators.push('strict equality');
      if (code.includes('!==')) summary.operators.push('strict inequality');
      if (code.includes('==') && !code.includes('===')) summary.operators.push('equality');
      if (code.includes('!=') && !code.includes('!==')) summary.operators.push('inequality');
      if (code.includes('&&')) summary.operators.push('AND');
      if (code.includes('||')) summary.operators.push('OR');
      if (code.includes('!') && !code.includes('!=')) summary.operators.push('NOT');

      // Build the summary text
      let summaryText = '';

      if (summary.checks.length > 0) {
        // Limit to top 5 most relevant checks
        const topChecks = summary.checks.slice(0, 5);
        summaryText += `Checks: ${topChecks.join(', ')}`;
      }

      if (summary.variables.length > 0) {
        // Limit to top 3 most relevant variables
        const topVars = summary.variables.slice(0, 3);
        if (summaryText) summaryText += ' | ';
        summaryText += `Variables: ${topVars.join(', ')}`;
      }

      if (summary.operators.length > 0) {
        if (summaryText) summaryText += ' | ';
        summaryText += `Logic: ${[...new Set(summary.operators)].join(', ')}`;
      }

      return summaryText || 'Custom condition logic';
    }

    // Helper function to generate a plain English description of what the code does
    function generateCodeDescription(code) {
      if (!code || typeof code !== 'string') return 'Custom validation logic';

      // Remove function wrapper if present
      let cleanCode = code;
      const functionMatch = code.match(/^function\s*\([^)]*\)\s*\{([\s\S]*)\}$/);
      if (functionMatch && functionMatch[1]) {
        cleanCode = functionMatch[1].trim();
      }

      // Detect return statement patterns
      const hasReturn = cleanCode.includes('return');
      const hasNegation = cleanCode.match(/^return\s*!/);

      let description = '';

      // Check if it's validating page/event properties
      if (cleanCode.includes('pageId') || cleanCode.includes('page.')) {
        description += 'Validates page properties';
      }

      // Check if it's validating events
      if (cleanCode.includes('event') || cleanCode.includes('?.detail')) {
        if (description) description += ' and ';
        description += 'checks event data';
      }

      // Check if it's validating data layer
      if (cleanCode.includes('digitalData') || cleanCode.includes('dataLayer')) {
        if (description) description += ' and ';
        description += 'validates data layer values';
      }

      // Check if it's validating transaction/commerce data
      if (cleanCode.includes('transaction') || cleanCode.includes('purchase') || cleanCode.includes('PNR')) {
        if (description) description += ' and ';
        description += 'verifies transaction data';
      }

      // Check if it's validating user data
      if (cleanCode.includes('user') || cleanCode.includes('customer') || cleanCode.includes('userId')) {
        if (description) description += ' and ';
        description += 'checks user information';
      }

      // Detect specific comparison patterns
      const comparisons = [];

      // Check for equality comparisons
      const equalityMatches = cleanCode.match(/"([^"]+)"\s*===\s*(\w+(?:\.\w+)*)|(\w+(?:\.\w+)*)\s*===\s*"([^"]+)"/g);
      if (equalityMatches) {
        equalityMatches.slice(0, 2).forEach(match => {
          const valueMatch = match.match(/"([^"]+)"/);
          if (valueMatch) {
            comparisons.push(`equals "${valueMatch[1]}"`);
          }
        });
      }

      // Check for inequality comparisons
      const inequalityMatches = cleanCode.match(/"([^"]+)"\s*!==\s*(\w+(?:\.\w+)*)|(\w+(?:\.\w+)*)\s*!==\s*"([^"]+)"/g);
      if (inequalityMatches) {
        inequalityMatches.slice(0, 2).forEach(match => {
          const valueMatch = match.match(/"([^"]+)"/);
          if (valueMatch) {
            comparisons.push(`not "${valueMatch[1]}"`);
          }
        });
      }

      // Add comparison details if found
      if (comparisons.length > 0) {
        description += ` (${comparisons.slice(0, 2).join(', ')})`;
      }

      // Add logic type
      if (cleanCode.includes('&&') && cleanCode.includes('||')) {
        description += ' using complex AND/OR logic';
      } else if (cleanCode.includes('&&')) {
        description += ' using AND logic';
      } else if (cleanCode.includes('||')) {
        description += ' using OR logic';
      }

      // Indicate if it's a negated return (returns false when conditions match)
      if (hasNegation) {
        description = 'Returns false when: ' + description;
      } else if (hasReturn) {
        description = 'Returns true when: ' + description;
      } else {
        description = 'Executes: ' + description;
      }

      // Fallback if no description was generated
      if (!description || description.includes('undefined')) {
        description = 'Custom condition that validates specific criteria';
      }

      return description;
    }

    // Helper function to beautify/format code for better readability
    function beautifyCode(code) {
      if (!code || typeof code !== 'string') return code;

      let beautified = code;

      // Remove function wrapper if present and extract body
      const functionMatch = beautified.match(/^function\s*\([^)]*\)\s*\{([\s\S]*)\}$/);
      if (functionMatch && functionMatch[1]) {
        beautified = functionMatch[1].trim();
      }

      // Replace minified boolean values
      beautified = beautified
        .replace(/!0/g, 'false')
        .replace(/!1/g, 'true');

      // Add spaces around operators
      beautified = beautified
        .replace(/([^=!<>])===([^=])/g, '$1 === $2')
        .replace(/([^=!<>])!==([^=])/g, '$1 !== $2')
        .replace(/([^=!<>])==([^=])/g, '$1 == $2')
        .replace(/([^=!<>])!=([^=])/g, '$1 != $2')
        .replace(/&&/g, ' && ')
        .replace(/\|\|/g, ' || ');

      // Add line breaks for better readability
      beautified = beautified
        .replace(/;\s*/g, ';\n  ')
        .replace(/\{/g, '{\n  ')
        .replace(/\}/g, '\n}')
        .replace(/return\s+/g, 'return ');

      // Clean up extra spaces
      beautified = beautified
        .replace(/\s+/g, ' ')
        .replace(/\s+\n/g, '\n')
        .replace(/\n\s+\n/g, '\n');

      return beautified.trim();
    }

    // Define specific names to search for in custom code conditions
    const searchNames = [
      "Target | Base Call | all AEM pages",
      "Adobe Target",
      "AEM pages",
      "Base Call",
      "Target Call",
      "Adobe Analytics",
      "Google Analytics",
      "Facebook Pixel",
      "Google Tag Manager",
      "Data Layer"
    ];

    // Helper function to fetch source code from URL or container data
    async function fetchSourceCode(url) {
      try {
        // First, check if we can get the data from _satellite._container instead of fetching
        if (window._satellite && window._satellite._container) {
          // Try to find the source code in the container data
          const containerData = window._satellite._container;

          // Check if we have rules data
          if (containerData.rules) {
            // Look through all rules for custom code that matches the URL
            for (const rule of containerData.rules) {
              if (rule.conditions) {
                for (const condition of rule.conditions) {
                  if (condition.settings && condition.settings.source) {
                    // Check if this condition's source matches what we're looking for
                    if (typeof condition.settings.source === 'function') {
                      const functionString = condition.settings.source.toString();

                      // Extract function body for cleaner display
                      const bodyMatch = functionString.match(/function\s*\([^)]*\)\s*\{([\s\S]*)\}$/);
                      if (bodyMatch && bodyMatch[1]) {
                        const extractedCode = bodyMatch[1].trim();
                        return extractedCode;
                      } else {
                        return functionString;
                      }
                    } else if (typeof condition.settings.source === 'string') {
                      return condition.settings.source;
                    }
                  }
                }
              }

              if (rule.actions) {
                for (const action of rule.actions) {
                  if (action.settings && action.settings.source) {
                    // Check if this action's source matches what we're looking for
                    if (typeof action.settings.source === 'function') {
                      const functionString = action.settings.source.toString();

                      // Extract function body for cleaner display
                      const bodyMatch = functionString.match(/function\s*\([^)]*\)\s*\{([\s\S]*)\}$/);
                      if (bodyMatch && bodyMatch[1]) {
                        const extractedCode = bodyMatch[1].trim();
                        return extractedCode;
                      } else {
                        return functionString;
                      }
                    } else if (typeof action.settings.source === 'string') {
                      return action.settings.source;
                    }
                  }
                }
              }
            }
          }
        }

        // If we get here, we need to fetch from URL
        console.log('Attempting to fetch from URL:', url);

        // Fallback to original URL fetching logic if container data doesn't have what we need
        const response = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          headers: {
            'Accept': 'text/plain,text/javascript,*/*'
          }
        });

        console.log('Fetch response status:', response.status, response.statusText);

        if (response.ok) {
          const content = await response.text();
          console.log('Fetched content length:', content.length);

          // Remove license comments if present
          let cleanedContent = content.replace(/\/\/.*license.*\n/g, '');

          // Try multiple patterns to handle different formats
          let match = cleanedContent.match(/_satellite\.__registerScript\([^,]+,\s*(["'`])([\s\S]*?)\1\s*\)/);
          if (match && match[2]) {
            // Unescape the JavaScript string
            let sourceCode = match[2]
              .replace(/\\n/g, '\n')
              .replace(/\\"/g, '"')
              .replace(/\\'/g, "'")
              .replace(/\\\\/g, '\\')
              .replace(/\\t/g, '\t')
              .replace(/\\r/g, '\r');
            // Remove trailing semicolon if present
            sourceCode = sourceCode.replace(/;\s*$/, '');
            console.log('Successfully extracted source code, length:', sourceCode.length);
            return sourceCode.trim();
          }

          // If no wrapper found, return the content as-is
          console.log('No _satellite.__registerScript wrapper found, returning raw content');
          return content;
        }
        console.log('Response not ok, returning null');
        return null;
      } catch (error) {
        console.log('Error in fetchSourceCode:', error);
        return null;
      }
    }

    if (rule.conditions && Array.isArray(rule.conditions)) {
      console.log('Checking conditions for rule:', rule.name || rule.id, 'Conditions:', rule.conditions);
      const customCodeConditions = [];
      const extractedFunctionBodies = [];

      for (let cond of rule.conditions) {
        console.log('=== PROCESSING CONDITION ===');
        console.log('Condition:', cond);
        console.log('Condition modulePath:', cond.modulePath);
        console.log('Condition settings:', cond.settings);

        // Debug: Log the actual source content
        if (cond.settings && cond.settings.source) {
          console.log('Condition source type:', typeof cond.settings.source);
          if (typeof cond.settings.source === 'function') {
            console.log('Condition source function:', cond.settings.source.toString());
            console.log('Function name:', cond.settings.source.name);
            console.log('Function length:', cond.settings.source.length);
            console.log('Function constructor:', cond.settings.source.constructor.name);
          } else {
            console.log('Condition source string:', cond.settings.source);
          }
        }

        // Check for custom code conditions - only the standard customCode.js module
        if (cond.modulePath && cond.modulePath.includes('customCode.js')) {
          console.log('Found customCode.js condition');
          console.log('Full condition settings:', JSON.stringify(cond.settings, null, 2));

          // Debug: Log all properties in the condition to see what's available
          if (cond.settings) {
            console.log('All condition settings properties:', Object.keys(cond.settings));
            for (const key in cond.settings) {
              if (typeof cond.settings[key] === 'string') {
                console.log(`Property ${key} (string):`, cond.settings[key].substring(0, 200) + '...');
              } else if (typeof cond.settings[key] === 'object') {
                console.log(`Property ${key} (object):`, JSON.stringify(cond.settings[key], null, 2));
              } else if (typeof cond.settings[key] === 'function') {
                console.log(`Property ${key} (function):`, cond.settings[key].toString());
              }
            }
          }

          // Look for the ACTUAL original source code, not the minified version
          console.log('=== SEARCHING FOR ORIGINAL SOURCE CODE ===');
          console.log('Rule:', rule.name || rule.id);

          // Check if there's a different property that contains the original code
          let originalCode = null;

          // Check for common properties that might contain the original code
          const possibleOriginalProps = [
            'originalSource',
            'sourceCode',
            'userCode',
            'inputCode',
            'rawCode',
            'uncompiledCode',
            'code',
            'customCode'
          ];

          for (const prop of possibleOriginalProps) {
            if (cond.settings[prop] && typeof cond.settings[prop] === 'string') {
              const testCode = cond.settings[prop];
              console.log(`Checking ${prop}:`, testCode.substring(0, 200) + '...');

              // If this looks like readable code (not minified), use it
              if (!isMinifiedCode(testCode)) {
                console.log(`FOUND ORIGINAL SOURCE in ${prop}!`);
                originalCode = testCode;
                break;
              }
            }
          }

          // If no original found, check nested objects
          if (!originalCode) {
            const nestedProps = ['codeEditor', 'customSetup', 'editor', 'config', 'input'];
            for (const nestedProp of nestedProps) {
              if (cond.settings[nestedProp] && typeof cond.settings[nestedProp] === 'object') {
                console.log(`Checking nested object ${nestedProp}:`, Object.keys(cond.settings[nestedProp]));
                for (const prop of possibleOriginalProps) {
                  if (cond.settings[nestedProp][prop] && typeof cond.settings[nestedProp][prop] === 'string') {
                    const testCode = cond.settings[nestedProp][prop];
                    console.log(`Checking ${nestedProp}.${prop}:`, testCode.substring(0, 200) + '...');
                    if (!isMinifiedCode(testCode)) {
                      console.log(`FOUND ORIGINAL SOURCE in ${nestedProp}.${prop}!`);
                      originalCode = testCode;
                      break;
                    }
                  }
                }
                if (originalCode) break;
              }
            }
          }

          // If we found original code, use it; otherwise fall back to extracting from minified
          if (originalCode) {
            console.log('Using original source code:', originalCode);
            extractedFunctionBodies.push({
              rule: rule.name || rule.id,
              originalSource: originalCode,
              functionBody: originalCode // Use the original code as-is
            });
          } else if (cond.settings && cond.settings.source) {
            console.log('No original source found, attempting to de-minify code');
            console.log('Minified source:', cond.settings.source);

            let deMinifiedCode = cond.settings.source;
            if (typeof cond.settings.source === 'string' && isMinifiedCode(cond.settings.source)) {
              deMinifiedCode = deMinifyFunction(cond.settings.source);
            } else if (typeof cond.settings.source === 'function') {
              const functionString = cond.settings.source.toString();
              if (isMinifiedCode(functionString)) {
                deMinifiedCode = deMinifyFunction(functionString);
              } else {
                deMinifiedCode = functionString;
              }
            }

            extractedFunctionBodies.push({
              rule: rule.name || rule.id,
              originalSource: cond.settings.source,
              functionBody: deMinifiedCode
            });

            // Use the de-minified code for display
            if (deMinifiedCode && deMinifiedCode !== cond.settings.source) {
              console.log('Using de-minified code for display');
              originalCode = deMinifiedCode;
            }
          }

          console.log('=== END SEARCHING FOR ORIGINAL SOURCE CODE ===');

          // Extract the actual JavaScript code from the source property
          let source = null;

          if (cond.settings && cond.settings.source) {
            if (typeof cond.settings.source === 'function') {
              // First, try to find original source code in the function object or settings
              console.log('Function object properties:', Object.keys(cond.settings.source));
              console.log('Function object:', cond.settings.source);

              // Check if the function has any properties that might contain original source
              let originalSource = null;
              if (cond.settings.source.originalSource) {
                originalSource = cond.settings.source.originalSource;
                console.log('Found originalSource property:', originalSource);
              } else if (cond.settings.source.sourceCode) {
                originalSource = cond.settings.source.sourceCode;
                console.log('Found sourceCode property:', originalSource);
              } else if (cond.settings.source.code) {
                originalSource = cond.settings.source.code;
                console.log('Found code property:', originalSource);
              }

              // Convert function to string
              const functionString = cond.settings.source.toString();
              console.log('Raw function string:', functionString);
              console.log('Function type:', typeof cond.settings.source);
              console.log('Function constructor:', cond.settings.source.constructor.name);

              // Prefer original source if available and not minified
              if (originalSource && typeof originalSource === 'string' && !isMinifiedCode(originalSource)) {
                source = originalSource;
                console.log('Using original source:', source);
              } else {
                // Check if the function itself is the custom code (not minified)
                if (!isMinifiedCode(functionString)) {
                  console.log('Function is not minified, extracting body...');
                  console.log('Full function string:', functionString);

                  // Extract the function body for cleaner display
                  const bodyMatch = functionString.match(/function\s*\([^)]*\)\s*\{([\s\S]*)\}$/);
                  if (bodyMatch && bodyMatch[1]) {
                    source = bodyMatch[1].trim();
                    console.log('Extracted function body as custom code:', source);
                  } else {
                    // Try alternative regex patterns
                    const altMatch = functionString.match(/\{([\s\S]*)\}/);
                    if (altMatch && altMatch[1]) {
                      source = altMatch[1].trim();
                      console.log('Extracted function body with alternative pattern:', source);
                    } else {
                      // Fallback to full function string
                      source = functionString;
                      console.log('Using full function string as custom code:', source);
                    }
                  }
                } else {
                  // Use the full function string
                  source = functionString;
                  console.log('Using full function string:', source);

                  // Try to de-minify the function to make it more readable
                  console.log('Function appears to be minified, attempting to de-minify');
                  const deMinified = deMinifyFunction(functionString);
                  if (deMinified && deMinified !== functionString) {
                    source = deMinified;
                    console.log('Using de-minified function:', source);
                  }
                }
              }
            } else if (typeof cond.settings.source === 'string') {
              source = cond.settings.source;
              console.log('Source is already a string:', source);

              // Try to de-minify if it appears to be minified
              if (isMinifiedCode(source)) {
                console.log('String source appears to be minified, attempting to de-minify');
                const deMinified = deMinifyFunction(source);
                if (deMinified && deMinified !== source) {
                  source = deMinified;
                  console.log('Using de-minified string source:', source);
                }
              }
            }
          }

          // If we still don't have source, try the helper function
          if (!source) {
            source = findOriginalSource(cond.settings);
          }

          console.log('Source found:', source ? 'Yes' : 'No');
          if (source && source.trim()) {
            console.log('Found custom code in condition:', source.substring(0, 100) + '...');

            // For functions, use the content directly - don't treat as URL
            if (typeof cond.settings.source === 'function') {
              console.log('Using function content directly from container data');

              // Search for specific names in the code
              const foundNames = searchForNamesInCode(source, searchNames);
              if (foundNames.length > 0) {
                console.log('Found names in custom code condition:', foundNames);
              }

              // Store the actual custom code directly
              customCodeConditions.push({
                code: source,
                foundNames: foundNames
              });

              console.log('=== STORED CUSTOM CODE ===');
              console.log('Source that was stored:', source);
              console.log('Source type:', typeof source);
              console.log('Source length:', source.length);
              console.log('=== END STORED CUSTOM CODE ===');

              // Don't add URLs for function-based custom code - use direct content
              console.log('Function-based custom code - using direct content, not URLs');

              // Clear any URLs since we're using direct content
              if (customCodeCondUrls.length > 0) {
                console.log('Clearing customCodeCondUrls for function-based custom code');
                customCodeCondUrls.length = 0;
              }
            } else {
              // For string sources, check if it's a URL
              let cleanedSource = source;
              if (source.includes('.min.js')) {
                cleanedSource = cleanCustomCodeUrl(source);
              }

              // Search for specific names in the code
              const foundNames = searchForNamesInCode(cleanedSource, searchNames);
              if (foundNames.length > 0) {
                console.log('Found names in custom code condition:', foundNames);
              }

              // Store the actual custom code instead of module path
              customCodeConditions.push({
                code: cleanedSource,
                foundNames: foundNames
              });

              // Check if it's a URL that can be fetched
              if (source.startsWith('http') || source.startsWith('@http') || source.includes('assets.adobedtm.com')) {
                customCodeCondUrls.push(cleanCustomCodeUrl(source));
              }
            }
          } else {
            console.log('No source found in customCode.js condition');
          }

          // Use the original code we found earlier if available
          if (originalCode) {
            console.log('Using original code for display:', originalCode);

            // Clean URLs in the original code
            let cleanedOriginalCode = originalCode;
            if (originalCode.includes('.min.js')) {
              cleanedOriginalCode = cleanCustomCodeUrl(originalCode);
            }

            // Search for specific names in the original code
            const foundNames = searchForNamesInCode(cleanedOriginalCode, searchNames);
            if (foundNames.length > 0) {
              console.log('Found names in original code:', foundNames);
            }

            // Replace any existing minified code with the original
            const originalIndex = customCodeConditions.findIndex(condition => {
              const code = typeof condition === 'string' ? condition : condition.code;
              return isMinifiedCode(code);
            });
            if (originalIndex !== -1) {
              customCodeConditions[originalIndex] = {
                code: cleanedOriginalCode,
                foundNames: foundNames
              };
            } else {
              customCodeConditions.push({
                code: cleanedOriginalCode,
                foundNames: foundNames
              });
            }
          } else if (cond.settings && cond.settings.source) {
            // If no original code found, try to de-minify the function
            console.log('Attempting to de-minify function for display');
            let deMinifiedCode = cond.settings.source;

            if (typeof cond.settings.source === 'string' && isMinifiedCode(cond.settings.source)) {
              deMinifiedCode = deMinifyFunction(cond.settings.source);
            } else if (typeof cond.settings.source === 'function') {
              const functionString = cond.settings.source.toString();
              if (isMinifiedCode(functionString)) {
                deMinifiedCode = deMinifyFunction(functionString);
              } else {
                deMinifiedCode = functionString;
              }
            }

            if (deMinifiedCode && deMinifiedCode !== cond.settings.source) {
              console.log('Using de-minified code for display:', deMinifiedCode);

              // Clean URLs in the de-minified code
              let cleanedDeMinifiedCode = deMinifiedCode;
              if (deMinifiedCode.includes('.min.js')) {
                cleanedDeMinifiedCode = cleanCustomCodeUrl(deMinifiedCode);
              }

              // Search for specific names in the de-minified code
              const foundNames = searchForNamesInCode(cleanedDeMinifiedCode, searchNames);
              if (foundNames.length > 0) {
                console.log('Found names in de-minified code:', foundNames);
              }

              customCodeConditions.push({
                code: cleanedDeMinifiedCode,
                foundNames: foundNames
              });
            } else {
              console.log('Using original code for display');

              // Clean URLs in the original source
              let cleanedSource = cond.settings.source;
              if (cond.settings.source.includes('.min.js')) {
                cleanedSource = cleanCustomCodeUrl(cond.settings.source);
              }

              // Search for specific names in the original source
              const foundNames = searchForNamesInCode(cleanedSource, searchNames);
              if (foundNames.length > 0) {
                console.log('Found names in original source:', foundNames);
              }

              customCodeConditions.push({
                code: cleanedSource,
                foundNames: foundNames
              });
            }
          }
        }
        // Check for external code conditions
        else if (cond.settings && cond.settings.isExternal && cond.settings.source) {
          console.log('Found external code condition');
          let source = cond.settings.source;

          // Extract function body if source is a function
          if (typeof source === 'function') {
            const functionString = source.toString();
            console.log('External function string:', functionString);

            // Try to find original source in the function object first
            let originalSource = null;
            if (source.originalSource) {
              originalSource = source.originalSource;
            } else if (source.sourceCode) {
              originalSource = source.sourceCode;
            } else if (source.code) {
              originalSource = source.code;
            }

            if (originalSource && typeof originalSource === 'string' && !isMinifiedCode(originalSource)) {
              source = originalSource;
              console.log('Using original source for external condition:', source);
            } else {
              // Use the full function string and try to de-minify
              source = functionString;
              if (isMinifiedCode(functionString)) {
                console.log('External function appears to be minified, attempting to de-minify');
                const deMinified = deMinifyFunction(functionString);
                if (deMinified && deMinified !== functionString) {
                  source = deMinified;
                  console.log('Using de-minified external function:', source);
                }
              }
            }
          }

          if (source && source.trim()) {
            console.log('Found custom code in external condition:', source.substring(0, 100) + '...');

            // Clean URLs in the source code
            let cleanedSource = source;
            if (source.includes('.min.js')) {
              cleanedSource = cleanCustomCodeUrl(source);
            }

            // Search for specific names in the code
            const foundNames = searchForNamesInCode(cleanedSource, searchNames);
            if (foundNames.length > 0) {
              console.log('Found names in external condition:', foundNames);
            }

            // Store the actual custom code instead of module path
            customCodeConditions.push({
              code: cleanedSource,
              foundNames: foundNames
            });

            // Check if it's a URL that can be fetched
            if (source.startsWith('http') || source.startsWith('@http') || source.includes('assets.adobedtm.com')) {
              customCodeCondUrls.push(cleanCustomCodeUrl(source));
            }
          }
        }
        // Check for custom setup conditions
        else if (cond.settings && cond.settings.customSetup && cond.settings.customSetup.source) {
          console.log('Found custom setup condition');
          let source = cond.settings.customSetup.source;

          // Extract function body if source is a function
          if (typeof source === 'function') {
            const functionString = source.toString();
            console.log('Custom setup function string:', functionString);

            // Try to find original source in the function object first
            let originalSource = null;
            if (source.originalSource) {
              originalSource = source.originalSource;
            } else if (source.sourceCode) {
              originalSource = source.sourceCode;
            } else if (source.code) {
              originalSource = source.code;
            }

            if (originalSource && typeof originalSource === 'string' && !isMinifiedCode(originalSource)) {
              source = originalSource;
              console.log('Using original source for custom setup condition:', source);
            } else {
              // Use the full function string and try to de-minify
              source = functionString;
              if (isMinifiedCode(functionString)) {
                console.log('Custom setup function appears to be minified, attempting to de-minify');
                const deMinified = deMinifyFunction(functionString);
                if (deMinified && deMinified !== functionString) {
                  source = deMinified;
                  console.log('Using de-minified custom setup function:', source);
                }
              }
            }
          }

          if (source && source.trim()) {
            console.log('Found custom code in custom setup condition:', source.substring(0, 100) + '...');

            // Clean URLs in the source code
            let cleanedSource = source;
            if (source.includes('.min.js')) {
              cleanedSource = cleanCustomCodeUrl(source);
            }

            // Search for specific names in the code
            const foundNames = searchForNamesInCode(cleanedSource, searchNames);
            if (foundNames.length > 0) {
              console.log('Found names in custom setup condition:', foundNames);
            }

            // Store the actual custom code instead of module path
            customCodeConditions.push({
              code: cleanedSource,
              foundNames: foundNames
            });

            // Check if it's a URL that can be fetched
            if (source.startsWith('http') || source.startsWith('@http') || source.includes('assets.adobedtm.com')) {
              customCodeCondUrls.push(cleanCustomCodeUrl(source));
            }
          }
        }
        // Check if the condition itself contains custom code
        else if (cond.source) {
          console.log('Found direct source in condition');
          let source = cond.source;

          // Extract function body if source is a function
          if (typeof source === 'function') {
            const functionString = source.toString();
            const bodyMatch = functionString.match(/function\s*\([^)]*\)\s*\{([\s\S]*)\}$/);
            if (bodyMatch && bodyMatch[1]) {
              source = bodyMatch[1].trim();
            } else {
              const fallbackMatch = functionString.match(/\{([\s\S]*)\}/);
              if (fallbackMatch && fallbackMatch[1]) {
                source = fallbackMatch[1].trim();
              }
            }
          }

          if (source && source.trim()) {
            console.log('Found custom code in direct source condition:', source.substring(0, 100) + '...');

            // Clean URLs in the source code
            let cleanedSource = source;
            if (source.includes('.min.js')) {
              cleanedSource = cleanCustomCodeUrl(source);
            }

            // Search for specific names in the code
            const foundNames = searchForNamesInCode(cleanedSource, searchNames);
            if (foundNames.length > 0) {
              console.log('Found names in direct source condition:', foundNames);
            }

            // Store the actual custom code instead of module path
            customCodeConditions.push({
              code: cleanedSource,
              foundNames: foundNames
            });

            // Check if it's a URL that can be fetched
            if (source.startsWith('http') || source.startsWith('@http') || source.includes('assets.adobedtm.com')) {
              customCodeCondUrls.push(cleanCustomCodeUrl(source));
            }
          }
        }
        // Check for custom code in other possible locations
        else if (cond.customCode) {
          console.log('Found customCode property in condition');
          let source = cond.customCode;

          // Extract function body if source is a function
          if (typeof source === 'function') {
            const functionString = source.toString();
            const bodyMatch = functionString.match(/function\s*\([^)]*\)\s*\{([\s\S]*)\}$/);
            if (bodyMatch && bodyMatch[1]) {
              source = bodyMatch[1].trim();
            } else {
              const fallbackMatch = functionString.match(/\{([\s\S]*)\}/);
              if (fallbackMatch && fallbackMatch[1]) {
                source = fallbackMatch[1].trim();
              }
            }
          }

          if (source && source.trim()) {
            console.log('Found custom code in customCode property condition:', source.substring(0, 100) + '...');

            // Clean URLs in the source code
            let cleanedSource = source;
            if (source.includes('.min.js')) {
              cleanedSource = cleanCustomCodeUrl(source);
            }

            // Search for specific names in the code
            const foundNames = searchForNamesInCode(cleanedSource, searchNames);
            if (foundNames.length > 0) {
              console.log('Found names in customCode property condition:', foundNames);
            }

            // Store the actual custom code instead of module path
            customCodeConditions.push({
              code: cleanedSource,
              foundNames: foundNames
            });

            // Check if it's a URL that can be fetched
            if (source.startsWith('http') || source.startsWith('@http') || source.includes('assets.adobedtm.com')) {
              customCodeCondUrls.push(cleanCustomCodeUrl(source));
            }
          }
        }
        else if (cond.code) {
          console.log('Found code property in condition');
          let source = cond.code;

          // Extract function body if source is a function
          if (typeof source === 'function') {
            const functionString = source.toString();
            const bodyMatch = functionString.match(/function\s*\([^)]*\)\s*\{([\s\S]*)\}$/);
            if (bodyMatch && bodyMatch[1]) {
              source = bodyMatch[1].trim();
            } else {
              const fallbackMatch = functionString.match(/\{([\s\S]*)\}/);
              if (fallbackMatch && fallbackMatch[1]) {
                source = fallbackMatch[1].trim();
              }
            }
          }

          if (source && source.trim()) {
            console.log('Found custom code in code property condition:', source.substring(0, 100) + '...');

            // Clean URLs in the source code
            let cleanedSource = source;
            if (source.includes('.min.js')) {
              cleanedSource = cleanCustomCodeUrl(source);
            }

            // Search for specific names in the code
            const foundNames = searchForNamesInCode(cleanedSource, searchNames);
            if (foundNames.length > 0) {
              console.log('Found names in code property condition:', foundNames);
            }

            // Store the actual custom code instead of module path
            customCodeConditions.push({
              code: cleanedSource,
              foundNames: foundNames
            });

            // Check if it's a URL that can be fetched
            if (source.startsWith('http') || source.startsWith('@http') || source.includes('assets.adobedtm.com')) {
              customCodeCondUrls.push(cleanCustomCodeUrl(source));
            }
          }
        }
      }

      // Process custom code conditions and keep all unique codes
      if (customCodeConditions.length > 0) {
        const allFoundNames = [];
        const uniqueCodes = [];
        const seenCodes = new Set();

        customCodeConditions.forEach(condition => {
          let codeToAdd;
          if (typeof condition === 'string') {
            codeToAdd = condition;
          } else {
            // Add found names to the collection
            if (condition.foundNames && condition.foundNames.length > 0) {
              allFoundNames.push(...condition.foundNames);
            }
            codeToAdd = condition.code;
          }

          // Only add unique codes to avoid repetition
          if (!seenCodes.has(codeToAdd)) {
            uniqueCodes.push(codeToAdd);
            seenCodes.add(codeToAdd);
          }
        });

        // Store all unique codes for multiple buttons
        customCodeCondContent = uniqueCodes;
        console.log('=== FINAL CUSTOM CODE CONTENT ===');
        console.log('Final customCodeCondContent (array):', customCodeCondContent);
        console.log('Number of unique codes found:', uniqueCodes.length);
        console.log('=== END FINAL CUSTOM CODE CONTENT ===');

        // Log all found names
        if (allFoundNames.length > 0) {
          const uniqueNames = [...new Set(allFoundNames)];
          console.log('All found names in custom code conditions:', uniqueNames);
        }
      }

      // Log all extracted function bodies
      if (extractedFunctionBodies.length > 0) {
        console.log('=== ALL EXTRACTED FUNCTION BODIES ===');
        extractedFunctionBodies.forEach((item, index) => {
          console.log(`\n--- Function Body ${index + 1} ---`);
          console.log('Rule:', item.rule);
          console.log('Original Source:', item.originalSource);
          console.log('Extracted Function Body:', item.functionBody);
        });
        console.log('=== END ALL EXTRACTED FUNCTION BODIES ===');
      }
    }

    console.log('Final custom code condition content:', customCodeCondContent ? 'Found' : 'None');
    console.log('Custom code condition URLs:', customCodeCondUrls);
    console.log('Number of custom code condition URLs:', customCodeCondUrls.length);

    // Populate conditions column – icon only (click to expand details)
    const customCodeConditionsArray = Array.isArray(customCodeCondContent) ? customCodeCondContent : [];
    tr._tdConds.innerHTML = '';
    tr._tdConds.appendChild(createRuleColumnIcon('fa-filter', rule.conditions, 'Conditions', tr));

    // Actions (moved here to match new column order)
    tr.appendChild(tdActions);

    // Size (KB) – at end of row
    var sizeKb = getRuleSizeKb(rule);
    var tdSize = document.createElement('td');
    tdSize.textContent = sizeKb.toFixed(2) + ' KB';
    tdSize.setAttribute('data-sort-value', String(sizeKb));
    tdSize.className = 'rule-size-cell';
    tr.appendChild(tdSize);

    // Custom Code (Action)
    var tdCustomCodeAction = document.createElement('td');
    let customCodeActions = [];

    if (rule.actions && Array.isArray(rule.actions)) {
      console.log('Checking actions for rule:', rule.name || rule.id, 'Actions:', rule.actions);

      for (let action of rule.actions) {
        console.log('Checking action:', action);

        // Only process actual custom code actions, not clearVariables, updateVariables, setVariables
        const isCustomCodeAction = action.modulePath && (
          action.modulePath.includes('customCode') ||
          action.modulePath.includes('custom-code') ||
          action.modulePath.includes('custom') ||
          action.modulePath.includes('script')
        );

        // Skip if it's not a custom code action
        if (!isCustomCodeAction) {
          console.log('Skipping non-custom code action:', action.modulePath);
          continue;
        }

        // Skip if the action name is exactly "customCode" to avoid cluttering
        const actionName = action.name || '';
        const settingsActionName = action.settings && action.settings.actionName ? action.settings.actionName : '';

        if (actionName.toLowerCase() === 'customcode' ||
          settingsActionName.toLowerCase() === 'customcode' ||
          actionName.toLowerCase() === 'custom code' ||
          settingsActionName.toLowerCase() === 'custom code') {
          console.log('Skipping action named "customCode" to reduce clutter');
          continue;
        }

        // Helper function to extract custom code from various sources
        function extractCustomCode(source) {
          if (!source) return null;

          let customCode = null;

          // Check if source is a function (actual custom code)
          if (typeof source === 'function') {
            console.log('Action source is a function, extracting code...');
            const functionString = source.toString();

            // Extract function body for cleaner display
            const bodyMatch = functionString.match(/function\s*\([^)]*\)\s*\{([\s\S]*)\}$/);
            if (bodyMatch && bodyMatch[1]) {
              customCode = bodyMatch[1].trim();
            } else {
              // Try alternative regex patterns
              const altMatch = functionString.match(/\{([\s\S]*)\}/);
              if (altMatch && altMatch[1]) {
                customCode = altMatch[1].trim();
              } else {
                customCode = functionString;
              }
            }
            console.log('Extracted custom code from function:', customCode.substring(0, 100) + '...');
          }
          // Check if source is a string (could be URL or actual code)
          else if (typeof source === 'string') {
            // If it looks like actual code (not a URL), use it directly
            if (!source.startsWith('http') && !source.startsWith('@http') && !source.includes('assets.adobedtm.com')) {
              console.log('Action source appears to be actual code, not URL');
              customCode = source;
            } else {
              console.log('Action source appears to be a URL, will try to find in _satellite._container');
              // Try to find this code in _satellite._container
              if (window._satellite && window._satellite._container) {
                const containerData = window._satellite._container;
                if (containerData.rules) {
                  for (const containerRule of containerData.rules) {
                    if (containerRule.actions) {
                      for (const containerAction of containerRule.actions) {
                        if (containerAction.settings && containerAction.settings.source) {
                          // Check if this action's source matches what we're looking for
                          if (typeof containerAction.settings.source === 'function') {
                            const functionString = containerAction.settings.source.toString();
                            const bodyMatch = functionString.match(/function\s*\([^)]*\)\s*\{([\s\S]*)\}$/);
                            if (bodyMatch && bodyMatch[1]) {
                              customCode = bodyMatch[1].trim();
                              break;
                            }
                          } else if (typeof containerAction.settings.source === 'string') {
                            // Check if this is the same URL we're looking for
                            if (containerAction.settings.source === source) {
                              customCode = containerAction.settings.source;
                              break;
                            }
                          }
                        }
                      }
                      if (customCode) break;
                    }
                  }
                }
              }

              // If still no custom code found, try to fetch from the URL
              if (!customCode && source.includes('.min.js')) {
                console.log('Attempting to fetch minified source content');
                // Store the URL to be processed by the fetchSourceCode function
                customCode = source;
              }
            }
          }

          return customCode;
        }

        // Helper function to handle minified source files
        function handleMinifiedSource(source) {
          if (typeof source === 'string' && source.includes('.min.js')) {
            console.log('Found minified source, will try to extract from container data');

            // Remove .min from the URL to get the unminified version
            const unminifiedUrl = source.replace('.min.js', '.js');
            console.log('Unminified URL:', unminifiedUrl);

            // For now, return the unminified URL to be processed by the container data lookup
            // The fetchSourceCode function will be called later if needed
            return unminifiedUrl;
          }
          return source;
        }

        // Check for custom code in various possible locations
        let customCode = null;

        // 1. Check action.settings.source (primary location)
        if (action.settings && action.settings.source) {
          console.log('Found action with source:', action.settings.source);
          customCode = extractCustomCode(action.settings.source);

          // Handle minified source files
          if (!customCode && typeof action.settings.source === 'string' && action.settings.source.includes('.min.js')) {
            const unminifiedUrl = handleMinifiedSource(action.settings.source);
            if (unminifiedUrl && typeof unminifiedUrl === 'string') {
              // Try to find the unminified version in container data
              if (window._satellite && window._satellite._container) {
                const containerData = window._satellite._container;
                if (containerData.rules) {
                  for (const containerRule of containerData.rules) {
                    if (containerRule.actions) {
                      for (const containerAction of containerRule.actions) {
                        if (containerAction.settings && containerAction.settings.source) {
                          if (typeof containerAction.settings.source === 'string' &&
                            containerAction.settings.source.includes(unminifiedUrl.replace('.js', ''))) {
                            customCode = containerAction.settings.source;
                            break;
                          }
                        }
                      }
                      if (customCode) break;
                    }
                  }
                }
              }
            }
          }
        }

        // 2. Check action.settings.customCode
        if (!customCode && action.settings && action.settings.customCode) {
          console.log('Found action with customCode:', action.settings.customCode);
          customCode = extractCustomCode(action.settings.customCode);
        }

        // 3. Check action.settings.code
        if (!customCode && action.settings && action.settings.code) {
          console.log('Found action with code:', action.settings.code);
          customCode = extractCustomCode(action.settings.code);
        }

        // 4. Check action.settings.script
        if (!customCode && action.settings && action.settings.script) {
          console.log('Found action with script:', action.settings.script);
          customCode = extractCustomCode(action.settings.script);
        }

        // 5. Check action.settings.customSetup.source
        if (!customCode && action.settings && action.settings.customSetup && action.settings.customSetup.source) {
          console.log('Found action with customSetup.source:', action.settings.customSetup.source);
          customCode = extractCustomCode(action.settings.customSetup.source);
        }

        // 6. Check action.customCode (root level)
        if (!customCode && action.customCode) {
          console.log('Found action with root level customCode:', action.customCode);
          customCode = extractCustomCode(action.customCode);
        }

        // 7. Check action.settings.body
        if (!customCode && action.settings && action.settings.body) {
          console.log('Found action with body:', action.settings.body);
          customCode = extractCustomCode(action.settings.body);
        }

        // 8. Check action.settings.content
        if (!customCode && action.settings && action.settings.content) {
          console.log('Found action with content:', action.settings.content);
          customCode = extractCustomCode(action.settings.content);
        }

        // 9. Check for any string properties in settings that might contain code
        if (!customCode && action.settings) {
          for (const [key, value] of Object.entries(action.settings)) {
            if (typeof value === 'string' && value.length > 10 &&
              !value.startsWith('http') && !value.includes('assets.adobedtm.com') &&
              (value.includes('function') || value.includes('var ') || value.includes('let ') ||
                value.includes('const ') || value.includes('if ') || value.includes('for ') ||
                value.includes('while ') || value.includes('return ') || value.includes('document.') ||
                value.includes('console.') || value.includes('=>'))) {
              console.log(`Found potential code in settings.${key}:`, value.substring(0, 100) + '...');
              customCode = value;
              break;
            }
          }
        }

        if (customCode && customCode.trim()) {
          console.log('Found custom code in action:', customCode.substring(0, 100) + '...');
          customCodeActions.push({
            code: customCode,
            actionName: action.name || action.id || 'Unknown Action'
          });
        }
      }

    }

    // Populate actions column – icon only (click to expand details)
    const actionCodeContentsForRendering = tr._actionCodeContents || [];
    const customCodeActionsForRendering = customCodeActions || [];
    const allActionCustomCode = [...actionCodeContentsForRendering, ...customCodeActionsForRendering];
    tr._tdActions.innerHTML = '';
    tr._tdActions.appendChild(createRuleColumnIcon('fa-cogs', rule.actions, 'Actions', tr));

    // Store rule data and custom code refs for expandable row
    tr._ruleData = rule;
    tr._customCodeConditions = typeof customCodeConditionsArray !== 'undefined' ? customCodeConditionsArray : [];
    tr._customCodeActions = allActionCustomCode || [];

    tbody.appendChild(tr);
  }

  // Append thead and tbody to the table
  rule_details_node.appendChild(thead);
  rule_details_node.appendChild(tbody);
  rule_details_node.rulesArray = rulesArray;

  // Ensure rule name cell clicks never navigate (capture phase, before any other handler)
  rule_details_node.addEventListener('click', function (e) {
    var cell = e.target && e.target.closest && e.target.closest('td.rule-name-cell');
    if (cell) {
      e.preventDefault();
      e.stopPropagation();
      var tr = cell.closest('tr');
      if (tr && tr._rowIndex !== undefined) {
        var expandIcon = tr.querySelector('.expand-icon');
        if (expandIcon) toggleExpand(expandIcon, tr._rowIndex);
      }
      return false;
    }
  }, true);

  // Pagination variables
  const rowsPerPage = 15;
  let currentPage = parseInt(sessionStorage.getItem('rulesCurrentPage')) || 1;
  const rows = Array.from(tbody.getElementsByTagName('tr'));
  let totalPages = Math.ceil(rows.length / rowsPerPage) || 1;

  // Update page info and "Showing X of Y rules"
  const updatePageInfo = () => {
    document.getElementById('currentPage').textContent = currentPage;
    document.getElementById('totalPages').textContent = totalPages;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = totalPages === 0 || currentPage >= totalPages;
    sessionStorage.setItem('rulesCurrentPage', currentPage);

    var countEl = document.getElementById('rulesCountInfo');
    if (countEl) {
      var allRows = Array.from(tbody.getElementsByTagName('tr'));
      var visibleRows = allRows.filter(function (r) { return !r.classList.contains('search-hidden'); });
      var visibleCount = visibleRows.length;
      var start = (currentPage - 1) * rowsPerPage;
      var end = Math.min(start + rowsPerPage, visibleCount);
      if (visibleCount === 0) {
        countEl.textContent = 'No rules match.';
      } else {
        countEl.textContent = 'Showing ' + (start + 1) + '\u2013' + end + ' of ' + visibleCount + ' rule' + (visibleCount !== 1 ? 's' : '');
      }
    }
  };

  // Show rows for current page
  const showPage = (page) => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;

    // Get all rows and hide them first
    const allRows = Array.from(tbody.getElementsByTagName('tr'));
    allRows.forEach((row) => {
      row.style.display = 'none';
    });

    // Get visible rows (not hidden by search)
    const visibleRows = allRows.filter(
      (row) => !row.classList.contains('search-hidden')
    );

    // Update total pages based on visible rows
    totalPages = Math.ceil(visibleRows.length / rowsPerPage) || 1;

    // Show only the rows for current page
    visibleRows.slice(start, end).forEach((row) => {
      row.style.display = '';
    });

    updatePageInfo();
  };

  // Add event listeners for pagination
  document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      showPage(currentPage);
    }
  });

  document.getElementById('nextPage').addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      showPage(currentPage);
    }
  });

  // Initialize with saved page or first page
  showPage(currentPage);

  // Add search functionality
  const searchInput = document.getElementById('ruleSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      const searchTerm = this.value.toLowerCase();
      rows.forEach((row) => {
        // Get the second cell (Rule Name) since first cell is now ID #
        const ruleNameCell = row.querySelectorAll('td')[1];
        if (ruleNameCell && ruleNameCell.textContent.toLowerCase().includes(searchTerm)) {
          row.classList.remove('search-hidden');
        } else {
          row.classList.add('search-hidden');
        }
      });
      // Reset to first page on search
      currentPage = 1;
      showPage(currentPage);
    });
  }

  } catch (e) {
    console.error('Rules page error:', e);
    var errDiv = document.createElement('div');
    errDiv.className = 'alert alert-warning';
    errDiv.style.padding = '16px';
    errDiv.style.marginTop = '12px';
    errDiv.textContent = 'Unable to load rules. ' + (e && e.message ? e.message : 'Please load a property first.');
    rule_details_node.appendChild(errDiv);
  } finally {
    var set_display = document.getElementById('set_display');
    if (set_display) set_display.style.display = 'none';
  }
} else {
  var set_display = document.getElementById('set_display');
  if (set_display) set_display.style.display = 'none';
}

// Add proper null checks for the download button
var download_button = document.getElementsByClassName('download-button');
if (download_button && download_button.length > 0) {
  var table = document.getElementById('rule_details');
  if (table) {
    var csv = [];
    var rows = table.querySelectorAll('tr');
    if (rows && rows.length > 0) {
      for (var i = 0; i < rows.length; i++) {
        var row = [],
          cols = rows[i].querySelectorAll('td, th');

        for (var j = 0; j < cols.length; j++) row.push(cols[j].innerText);

        csv.push(row.join(','));
      }
      // Download CSV file
      downloadCSV(csv.join('\n'), 'rules.csv');
    }
  }
}

function downloadCSV(csv, filename) {
  // Function is now empty to remove CSV export link from the rule page
}
var set_display = document.getElementById('set_display');
if (set_display) {
  set_display.style = 'display: none;';
}

// Add null checks before adding event listeners
const applyFilter = document.getElementById('apply-filter');
if (applyFilter) {
  applyFilter.addEventListener('click', openNav);
}

const closeBtn = document.getElementById('apply-filter-closebtn');
if (closeBtn) {
  closeBtn.addEventListener('click', closeNav);
}

const closeBtn2 = document.getElementById('apply-filter-closebtn2');
if (closeBtn2) {
  closeBtn2.addEventListener('click', closeNav2);
}

function closeNav2() {
  const overlay = document.getElementById('myNav');
  if (overlay) {
    overlay.style.width = '0%';
  }
}

/* Open when someone clicks on the span element */
function openNav() {
  const overlay = document.getElementById('myNav');
  if (overlay) {
    overlay.style.width = '30%';
    overlay.style.height = '60%';
  }
}

/* Close when someone clicks on the "x" symbol inside the overlay */
function closeNav() {
  const overlay = document.getElementById('myNav');
  if (!overlay) return;

  overlay.style.width = '0%';

  const conditionsFilter = document.getElementById('conditions-filter');
  const aaFilter = document.getElementById('aa-filter');
  const coreFilter = document.getElementById('core-filter');
  const websdkFilter = document.getElementById('websdk-filter');

  if (!conditionsFilter || !aaFilter || !coreFilter || !websdkFilter) return;

  var c = conditionsFilter.value;
  var aa = aaFilter.value;
  var core = coreFilter.value;
  var websdk = websdkFilter.value;

  var k = document.getElementsByClassName('data-displayed');
  let visibleRows = 0;
  for (i = 0; i < k.length; i++) {
    if (
      k[i].className.indexOf(c) < 0 ||
      k[i].className.indexOf(aa) < 0 ||
      k[i].className.indexOf(core) < 0 ||
      k[i].className.indexOf(websdk) < 0
    ) {
      k[i].style.display = 'none';
    } else {
      k[i].style.display = '';
      visibleRows++;
    }
  }

  // Reset to page 1 only when filtering
  currentPage = 1;
  totalPages = Math.ceil(visibleRows / rowsPerPage);
  sessionStorage.setItem('rulesCurrentPage', currentPage);
  showPage(1);
}

// Modify sortTable function to maintain page state
function sortTable(column) {
  var table = document.getElementById('rule_details');
  var allRows = Array.from(table.getElementsByTagName('tr')).slice(1); // Skip header row
  var rows = allRows.filter(function (r) { return !r.classList.contains('expandable-row'); });
  var isAscending = table.getAttribute('data-sort-' + column) !== 'asc';

  rows.sort((a, b) => {
    var cellA = a.cells[column];
    var cellB = b.cells[column];
    var aSort = cellA && cellA.getAttribute('data-sort-value');
    var bSort = cellB && cellB.getAttribute('data-sort-value');
    if (aSort != null && bSort != null) {
      var aNum = parseFloat(aSort);
      var bNum = parseFloat(bSort);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return isAscending ? aNum - bNum : bNum - aNum;
      }
    }
    var aValue = cellA ? cellA.textContent : '';
    var bValue = cellB ? cellB.textContent : '';
    if (!isNaN(aValue) && !isNaN(bValue)) {
      return isAscending ? aValue - bValue : bValue - aValue;
    }
    return isAscending
      ? (aValue || '').localeCompare(bValue || '')
      : (bValue || '').localeCompare(aValue || '');
  });

  // Update sort direction
  table.setAttribute('data-sort-' + column, isAscending ? 'asc' : 'desc');

  // Update sort indicators
  var headers = table.getElementsByTagName('th');
  for (var i = 0; i < headers.length; i++) {
    headers[i].classList.remove('sorted-asc', 'sorted-desc');
  }
  headers[column].classList.add(isAscending ? 'sorted-asc' : 'sorted-desc');

  // Reorder rows (move each rule row and its expandable detail row together)
  var tbody = table.getElementsByTagName('tbody')[0];
  rows.forEach(function (row) {
    tbody.appendChild(row);
    var next = row.nextElementSibling;
    if (next && next.classList.contains('expandable-row')) {
      tbody.appendChild(next);
    }
  });

  // Reset to page 1 only when sorting
  currentPage = 1;
  sessionStorage.setItem('rulesCurrentPage', currentPage);
  showPage(1);
}

// Add Export CSV button for main rules table
var download_button = document.getElementsByClassName('download-button');
if (download_button && download_button.length > 0) {
  // Remove any previous export links
  download_button[0].innerHTML = '';
  var exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn-success btn-sm';
  exportBtn.innerHTML = '<i class="fas fa-file-csv"></i> Export CSV';
  exportBtn.onclick = function () {
    exportMainRulesTableToCSV();
  };
  download_button[0].appendChild(exportBtn);
}

function exportMainRulesTableToCSV() {
  var table = document.getElementById('rule_details');
  if (!table) {
    alert('No table found to export.');
    return;
  }
  // Get visible rows only (skip header row)
  var rows = Array.from(table.querySelectorAll('tr')).filter((row, idx) => row.offsetParent !== null && idx !== 0);
  // Get headers from the table and clean them up
  var headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim().replace(/\s+\u00a0.*/, ''));

  // Remove any existing WebSDK or AA columns to prevent duplication
  headers = headers.filter(header =>
    !header.toLowerCase().includes('websdk') &&
    !header.toLowerCase().includes('aa ') &&
    !header.toLowerCase().includes('adobe analytics')
  );

  // Add new columns for AA and WebSDK after 'Custom Code (Action)'
  var insertAfterIdx = headers.findIndex(h => h.toLowerCase().includes('custom code (action)'));
  var aaColumns = [
    'AA eVars',
    'AA Props',
    'AA Events',
    'AA Additional',
    'AA Custom Code'
  ];
  var websdkColumns = [
    'WebSDK Data',
    'WebSDK XDM'
  ];
  var newHeaders = headers.slice(0, insertAfterIdx + 1)
    .concat(aaColumns)
    .concat(websdkColumns)
    .concat(headers.slice(insertAfterIdx + 1));

  // Get rules data from sessionStorage
  var rulesRaw = sessionStorage.getItem('_satellite._container.rules');
  var rules = [];
  if (rulesRaw) {
    try {
      var obj = JSON.parse(rulesRaw);
      if (Array.isArray(obj)) rules = obj;
      else if (typeof obj === 'object' && obj !== null) {
        if (obj.rules && Array.isArray(obj.rules)) rules = obj.rules;
        else rules = Object.values(obj).filter(item => typeof item === 'object' && item !== null);
      }
    } catch (e) { rules = []; }
  }

  // Helper to extract custom code or source from a rule (for condition, action, or other fields)
  function extractAnySource(items) {
    if (!Array.isArray(items)) return '';
    let codeArr = [];

    items.forEach(item => {
      if (item && item.modulePath && item.modulePath.includes('customCode')) {
        let customCode = null;

        // Use the same logic as the rule table to extract custom code
        if (item.settings && item.settings.source) {
          customCode = extractCustomCodeFromSource(item.settings.source);
        } else if (item.settings && item.settings.code) {
          customCode = extractCustomCodeFromSource(item.settings.code);
        } else if (item.settings && item.settings.script) {
          customCode = extractCustomCodeFromSource(item.settings.script);
        } else if (item.settings && item.settings.customCode) {
          customCode = extractCustomCodeFromSource(item.settings.customCode);
        } else if (item.settings && item.settings.body) {
          customCode = extractCustomCodeFromSource(item.settings.body);
        } else if (item.settings && item.settings.content) {
          customCode = extractCustomCodeFromSource(item.settings.content);
        }

        // If no custom code found in specific properties, check all settings properties
        if (!customCode && item.settings) {
          for (const key in item.settings) {
            const value = item.settings[key];
            if (typeof value === 'string' && value.length > 10 &&
              !value.startsWith('http') && !value.includes('assets.adobedtm.com') &&
              (value.includes('function') || value.includes('var ') || value.includes('let ') ||
                value.includes('const ') || value.includes('if ') || value.includes('for ') ||
                value.includes('while ') || value.includes('return ') || value.includes('document.') ||
                value.includes('console.') || value.includes('=>'))) {
              customCode = value;
              break;
            }
          }
        }

        if (customCode && customCode.trim()) {
          codeArr.push(customCode);
        }
      }
    });

    return codeArr.join('\n---\n');
  }

  // Helper function to extract custom code from source (same logic as rule table)
  function extractCustomCodeFromSource(source) {
    if (!source) return null;

    // If source is a function, extract the function body
    if (typeof source === 'function') {
      const functionString = source.toString();
      const bodyMatch = functionString.match(/function\s*\([^)]*\)\s*\{([\s\S]*)\}$/);
      if (bodyMatch && bodyMatch[1]) {
        return bodyMatch[1].trim();
      } else {
        const fallbackMatch = functionString.match(/\{([\s\S]*)\}/);
        if (fallbackMatch && fallbackMatch[1]) {
          return fallbackMatch[1].trim();
        }
      }
      return functionString;
    }

    // If source is a string, check if it's actual code (not a URL)
    if (typeof source === 'string') {
      // If it looks like actual code (not a URL), use it directly
      if (!source.startsWith('http') && !source.startsWith('@http') && !source.includes('assets.adobedtm.com')) {
        return source;
      } else {
        // It's a URL, try to find the actual code in session storage
        return findCustomCodeInSessionStorage(source);
      }
    }

    return source;
  }

  // Helper function to extract actual custom code content from various sources
  function extractCustomCodeContent(source) {
    if (!source) return null;

    // If source is a function, extract the function body
    if (typeof source === 'function') {
      const functionString = source.toString();
      const bodyMatch = functionString.match(/function\s*\([^)]*\)\s*\{([\s\S]*)\}$/);
      if (bodyMatch && bodyMatch[1]) {
        return bodyMatch[1].trim();
      } else {
        const fallbackMatch = functionString.match(/\{([\s\S]*)\}/);
        if (fallbackMatch && fallbackMatch[1]) {
          return fallbackMatch[1].trim();
        }
      }
      return functionString;
    }

    // If source is a string, check if it's a URL or actual code
    if (typeof source === 'string') {
      // If it looks like actual code (not a URL), use it directly
      if (!source.startsWith('http') && !source.startsWith('@http') && !source.includes('assets.adobedtm.com')) {
        return source;
      } else {
        // It's a URL, try to find the actual code in session storage
        return findCustomCodeInSessionStorage(source);
      }
    }

    return source;
  }

  // Helper function to find custom code in session storage data
  function findCustomCodeInSessionStorage(url) {
    try {
      // Get rules data from session storage
      const rulesRaw = sessionStorage.getItem('_satellite._container.rules');
      if (!rulesRaw) return url; // Fallback to URL if no data

      const rules = JSON.parse(rulesRaw);

      // Look through all rules for custom code that matches the URL
      for (const rule of rules) {
        if (rule.conditions) {
          for (const condition of rule.conditions) {
            if (condition.settings && condition.settings.source) {
              if (typeof condition.settings.source === 'string' &&
                condition.settings.source.includes(url.replace('.min.js', ''))) {
                return extractCustomCodeContent(condition.settings.source);
              }
            }
          }
        }

        if (rule.actions) {
          for (const action of rule.actions) {
            if (action.settings && action.settings.source) {
              if (typeof action.settings.source === 'string' &&
                action.settings.source.includes(url.replace('.min.js', ''))) {
                return extractCustomCodeContent(action.settings.source);
              }
            }
          }
        }
      }

      // If not found, return the URL as fallback
      return url;
    } catch (e) {
      console.error('Error finding custom code in session storage:', e);
      return url; // Fallback to URL
    }
  }

  // Function to extract custom code using the exact same logic as the rule table
  function extractCustomCodeFromRuleTable(actions) {
    if (!Array.isArray(actions)) return '';

    let customCodeActions = [];

    actions.forEach(action => {
      if (action && action.modulePath && action.modulePath.includes('customCode')) {
        let customCode = null;

        // Check for custom code in various locations (same logic as rule table)
        if (action.settings && action.settings.source) {
          customCode = extractCustomCodeFromSource(action.settings.source);
        } else if (action.settings && action.settings.code) {
          customCode = extractCustomCodeFromSource(action.settings.code);
        } else if (action.settings && action.settings.script) {
          customCode = extractCustomCodeFromSource(action.settings.script);
        } else if (action.settings && action.settings.customCode) {
          customCode = extractCustomCodeFromSource(action.settings.customCode);
        } else if (action.settings && action.settings.body) {
          customCode = extractCustomCodeFromSource(action.settings.body);
        } else if (action.settings && action.settings.content) {
          customCode = extractCustomCodeFromSource(action.settings.content);
        }

        // If no custom code found in specific properties, check all settings properties (same logic as rule table)
        if (!customCode && action.settings) {
          for (const key in action.settings) {
            const value = action.settings[key];
            if (typeof value === 'string' && value.length > 10 &&
              !value.startsWith('http') && !value.includes('assets.adobedtm.com') &&
              (value.includes('function') || value.includes('var ') || value.includes('let ') ||
                value.includes('const ') || value.includes('if ') || value.includes('for ') ||
                value.includes('while ') || value.includes('return ') || value.includes('document.') ||
                value.includes('console.') || value.includes('=>'))) {
              customCode = value;
              break;
            }
          }
        }

        if (customCode && customCode.trim()) {
          customCodeActions.push({
            code: customCode,
            actionName: action.name || action.id || 'Unknown Action'
          });
        }
      }
    });

    // Return the actual code content, not URLs
    return customCodeActions.map(action => action.code).join('\n---\n');
  }

  // Helper to extract AA details from actions
  function extractAADetails(actions) {
    let aa = {
      eVars: '',
      props: '',
      events: '',
      additional: '',
      customCode: ''
    };
    if (!Array.isArray(actions)) return aa;
    for (let action of actions) {
      if (
        action.modulePath &&
        action.modulePath.includes('adobe-analytics/') &&
        !action.modulePath.includes('sendBeacon.js') &&
        !action.modulePath.includes('clearVariables.js') &&
        action.settings &&
        action.settings.trackerProperties
      ) {
        const tp = action.settings.trackerProperties;
        // eVars
        if (tp.eVars) {
          aa.eVars = (tp.eVars.map(e => (e.name || e) + (e.value ? ': ' + e.value : '')).join('\n'));
        }
        // props
        if (tp.props) {
          aa.props = (tp.props.map(p => (p.name || p) + (p.value ? ': ' + p.value : '')).join('\n'));
        }
        // events
        if (tp.events) {
          aa.events = (tp.events.map(ev => (ev.name ? ev.name.replaceAll('%', '') : ev)).join('\n'));
        }
        // Additional settings
        let additional = [];
        if (tp.pageName) additional.push('Page Name: ' + tp.pageName);
        if (tp.pageURL) additional.push('Page URL: ' + tp.pageURL);
        if (tp.campaign) {
          let campaignValue = tp.campaign;
          if (typeof tp.campaign === 'object') {
            // Extract the actual value from campaign object structure
            if (tp.campaign.value !== undefined) {
              campaignValue = tp.campaign.value;
            } else if (tp.campaign.type === 'value' && tp.campaign.value !== undefined) {
              campaignValue = tp.campaign.value;
            } else {
              // Fallback to stringify if we can't extract the value
              campaignValue = JSON.stringify(tp.campaign);
            }
          }
          additional.push('Campaign: ' + campaignValue);
        }
        // Any other campaign keys
        Object.keys(tp).forEach(key => {
          if (key.toLowerCase().includes('campaign') && tp[key] && tp[key] !== 'Value' && tp[key] !== 'value') {
            if (typeof tp[key] !== 'object') additional.push(`Campaign ${key}: ${tp[key]}`);
          }
        });
        aa.additional = additional.join('\n');
        // Custom code
        let customCode = '';
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
        } else if (action.customCode) {
          customCode = action.customCode;
        }
        aa.customCode = customCode;
        break; // Only one AA action per rule for CSV
      }
    }
    return aa;
  }

  // Helper to extract WebSDK details from actions (separate for Data and XDM)
  function extractWebSDKDetails(actions) {
    let wsData = {
      eventType: '',
      dataElements: '',
      customCode: '',
      eVars: '',
      props: '',
      events: '',
      contextData: '',
      additionalSettings: ''
    };

    let wsXdm = {
      eventType: '',
      dataElements: '',
      customCode: '',
      eVars: '',
      props: '',
      events: '',
      contextData: '',
      additionalSettings: ''
    };

    if (!Array.isArray(actions)) return { data: wsData, xdm: wsXdm };

    let dataActionFound = false;
    let xdmActionFound = false;

    let webSDKActionCount = 0;

    for (let action of actions) {
      if (action.modulePath && action.modulePath.includes('adobe-alloy/')) {
        webSDKActionCount++;

        // Determine if this is a Data or XDM action based on action number (like rule details page)
        const isXdmAction = webSDKActionCount === 2; // Second WebSDK action is XDM
        const isDataAction = webSDKActionCount === 1; // First WebSDK action is Data

        // Debug logging for action detection
        console.log('WebSDK Action Detection:', {
          actionName: action.name,
          actionNumber: webSDKActionCount,
          isDataAction: isDataAction,
          isXdmAction: isXdmAction,
          hasXdm: !!(action.settings && action.settings.xdm),
          hasData: !!(action.settings && action.settings.data)
        });

        // Process based on action number
        if (isDataAction && !dataActionFound) {
          // Process Data action (first WebSDK action)
          wsData = extractWebSDKActionData(action, 'data');
          dataActionFound = true;
          console.log('Found Data action (action #1):', action.name);
        } else if (isXdmAction && !xdmActionFound) {
          // Process XDM action (second WebSDK action)
          wsXdm = extractWebSDKActionData(action, 'xdm');
          xdmActionFound = true;
          console.log('Found XDM action (action #2):', action.name);
        }

        // Stop if we found both types
        if (dataActionFound && xdmActionFound) break;
      }
    }

    // Only use fallback if we haven't found either type
    if (!dataActionFound && !xdmActionFound) {
      for (let action of actions) {
        if (action.modulePath && action.modulePath.includes('adobe-alloy/')) {
          // Try to determine which type this action should be based on its structure
          const hasXdm = action.settings && action.settings.xdm;
          const hasData = action.settings && action.settings.data;

          console.log('Fallback Action Analysis:', {
            actionName: action.name,
            hasXdm: hasXdm,
            hasData: hasData,
            dataActionFound: dataActionFound,
            xdmActionFound: xdmActionFound
          });

          if (hasXdm && !hasData && !xdmActionFound) {
            // If it has XDM but no data, use it for XDM columns
            wsXdm = extractWebSDKActionData(action, 'xdm');
            xdmActionFound = true;
            console.log('Assigned action to XDM in fallback:', action.name);
          } else if (hasData && !hasXdm && !dataActionFound) {
            // If it has data but no XDM, use it for Data columns
            wsData = extractWebSDKActionData(action, 'data');
            dataActionFound = true;
            console.log('Assigned action to Data in fallback:', action.name);
          } else if (hasXdm && hasData && !xdmActionFound) {
            // If it has both, prioritize XDM for XDM columns
            wsXdm = extractWebSDKActionData(action, 'xdm');
            xdmActionFound = true;
            console.log('Assigned action with both XDM and Data to XDM in fallback:', action.name);
          } else if (hasData && !dataActionFound) {
            // If we still haven't found a data action, use this one
            wsData = extractWebSDKActionData(action, 'data');
            dataActionFound = true;
            console.log('Assigned remaining action to Data in fallback:', action.name);
          }

          // Don't break here - continue to process all actions
        }
      }
    }

    console.log('Final WebSDK Details Return:', {
      dataActionFound: dataActionFound,
      xdmActionFound: xdmActionFound,
      dataKeys: Object.keys(wsData),
      xdmKeys: Object.keys(wsXdm),
      dataSample: JSON.stringify(wsData).substring(0, 100),
      xdmSample: JSON.stringify(wsXdm).substring(0, 100)
    });

    return { data: wsData, xdm: wsXdm };
  }

  // Helper function to extract data from a single WebSDK action
  function extractWebSDKActionData(action, type) {
    let ws = {
      eventType: '',
      dataElements: '',
      customCode: '',
      eVars: '',
      props: '',
      events: '',
      contextData: '',
      additionalSettings: ''
    };

    // Event Type
    ws.eventType = action.settings && action.settings.type ? action.settings.type : '';

    // Use the same comprehensive data extraction as rule details page
    let extractedData = null;

    if (type === 'xdm') {
      // For XDM actions, ONLY use xdm data - no fallback to data property
      let xdmData = action.settings.xdm;

      console.log('XDM Action Debug:', {
        hasXdm: !!xdmData,
        xdmType: typeof xdmData,
        xdmData: xdmData
      });

      // Check if we have a data element reference instead of direct XDM object
      if (typeof xdmData === 'string' && xdmData.includes('%')) {
        const dataElementName = xdmData.replace(/%/g, '');
        console.log('XDM Data Element Name:', dataElementName);
        try {
          const de_value = sessionStorage.getItem('_satellite._container.dataElements');
          if (de_value) {
            const dataElements = JSON.parse(de_value);
            if (dataElements[dataElementName] && dataElements[dataElementName].settings) {
              extractedData = dataElements[dataElementName].settings.data;
              console.log('Extracted XDM from data element:', extractedData);
            } else {
              console.log('Data element not found or no settings:', dataElementName);
            }
          } else {
            console.log('No data elements found in session storage');
          }
        } catch (e) {
          console.error('Error extracting data element:', e);
        }
      } else if (typeof xdmData === 'object' && xdmData !== null) {
        extractedData = xdmData;
        console.log('Using direct XDM object:', extractedData);
      } else {
        console.log('XDM data is not a string with % or an object:', xdmData);
      }
    } else if (type === 'data') {
      // For Data actions, ONLY use data property - no fallback to xdm
      extractedData = action.settings.data;
    }

    // Only use fallback sources if we don't have data from the primary source
    if (!extractedData && action.settings) {
      // For XDM actions, don't fall back to data property
      // For Data actions, don't fall back to xdm property
      if (type === 'xdm') {
        // Only check for trackerProperties or other non-data sources for XDM
        if (action.settings.trackerProperties) {
          extractedData = action.settings.trackerProperties;
        }
      } else if (type === 'data') {
        // Only check for trackerProperties or other non-xdm sources for Data
        if (action.settings.trackerProperties) {
          extractedData = action.settings.trackerProperties;
        }
      }
    }

    // Debug logging
    console.log('WebSDK Action Debug:', {
      type: type,
      hasSettings: !!action.settings,
      hasXdm: !!(action.settings && action.settings.xdm),
      hasData: !!(action.settings && action.settings.data),
      xdmType: action.settings && action.settings.xdm ? typeof action.settings.xdm : 'undefined',
      extractedDataType: extractedData ? typeof extractedData : 'undefined',
      extractedDataKeys: extractedData ? Object.keys(extractedData) : [],
      actionSettingsKeys: action.settings ? Object.keys(action.settings) : []
    });

    // For both XDM and Data actions, return the actual data structure immediately
    if (type === 'xdm' || type === 'data') {
      // Return the extracted data directly instead of the processed structure
      console.log(`Returning ${type} data:`, extractedData);
      return extractedData || {};
    }

    // For other action types, continue with processing
    // Now extract eVars and props using the same logic as rule details page
    if (extractedData) {
      // Function to get all complete paths from an object (same as rule details)
      function getCompletePaths(obj, parentPath = '') {
        let paths = [];
        for (const key in obj) {
          const currentPath = parentPath ? `${parentPath}.${key}` : key;
          const value = obj[key];
          if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            paths = paths.concat(getCompletePaths(value, currentPath));
          } else {
            paths.push({ path: currentPath, value: value });
          }
        }
        return paths;
      }

      const completePaths = getCompletePaths(extractedData);

      // Extract eVars using the same filtering logic as rule details
      const evarPaths = completePaths.filter(({ path }) =>
        (path.includes('eVar') || path.includes('evar')) &&
        !path.includes('pageName') &&
        !path.includes('page_name') &&
        !path.includes('page') &&
        !(path.includes('_adobe.analytics.') && !path.includes('eVar'))
      );

      let evars = [];
      evarPaths.forEach(({ path, value }) => {
        const evarMatch = path.match(/eVar(\d+)/i);
        const evarName = evarMatch ? `eVar${evarMatch[1]}` : path;
        const val = Array.isArray(value) ? JSON.stringify(value) : value;
        evars.push(`${evarName}: ${val}`);
      });
      ws.eVars = evars.join('\n');

      // Extract props using the same filtering logic as rule details
      const propPaths = completePaths.filter(({ path }) =>
        path.includes('prop') || path.includes('_adobe.analytics.prop')
      );

      let props = [];
      propPaths.forEach(({ path, value }) => {
        const propMatch = path.match(/prop(\d+)/i);
        const propName = propMatch ? `prop${propMatch[1]}` : path;
        const val = Array.isArray(value) ? JSON.stringify(value) : value;
        props.push(`${propName}: ${val}`);
      });
      ws.props = props.join('\n');

      // Extract events
      let eventsData = [];
      // First check for traditional trackerProperties events
      if (action.settings && action.settings.trackerProperties && action.settings.trackerProperties.events) {
        const eventList = action.settings.trackerProperties.events;
        eventList.forEach(event => {
          const eventName = event.name ? event.name.replaceAll('%', '') : event;
          const eventValue = event.value ? event.value : '1';
          eventsData.push(`${eventName}: ${eventValue}`);
        });
      }

      // Check for events in data._adobe.analytics.events (string format)
      const analyticsEventsPath = completePaths.find(({ path }) =>
        path.includes('_adobe.analytics.events') || path.includes('analytics.events')
      );

      if (analyticsEventsPath && analyticsEventsPath.value) {
        const eventsString = analyticsEventsPath.value;
        const eventPairs = eventsString.split(',');

        eventPairs.forEach(eventPair => {
          if (eventPair.includes('=')) {
            const [eventName, eventValue] = eventPair.split('=');
            const cleanEventName = eventName.replaceAll('%', '');
            const cleanEventValue = eventValue ? eventValue.replaceAll('%', '') : '1';
            eventsData.push(`${cleanEventName}: ${cleanEventValue}`);
          } else {
            const cleanEventName = eventPair.replaceAll('%', '');
            eventsData.push(`${cleanEventName}: 1`);
          }
        });
      }

      // Capture all XDM events (event1to100, event101to200, etc.)
      const eventPaths = completePaths.filter(({ path }) =>
        path.includes('event') && path.includes('value')
      );

      eventPaths.forEach(({ path, value }) => {
        const pathParts = path.split('.');
        let eventName = '';

        for (let i = 0; i < pathParts.length; i++) {
          if (pathParts[i].startsWith('event') && pathParts[i] !== 'event1to100' &&
            pathParts[i] !== 'event101to200' && pathParts[i] !== 'event201to300' &&
            pathParts[i] !== 'event301to400' && pathParts[i] !== 'event401to500' &&
            pathParts[i] !== 'event501to600' && pathParts[i] !== 'event601to700' &&
            pathParts[i] !== 'event701to800' && pathParts[i] !== 'event801to900' &&
            pathParts[i] !== 'event901to1000') {
            eventName = pathParts[i];
            break;
          }
        }

        if (eventName && path.endsWith('.value')) {
          const eventValue = value !== null && value !== undefined ? value : '1';
          eventsData.push(`${eventName}: ${eventValue}`);
        }
      });

      ws.events = eventsData.join('\n');

      // Extract Context Data
      let contextDataRows = [];
      const contextDataPaths = completePaths.filter(({ path }) => {
        if (path.toLowerCase().includes('contextdata') || path.toLowerCase().includes('context_data')) {
          return true;
        }
        if (path.includes('commerce') || path.includes('Commerce')) {
          return true;
        }
        if (path.includes('list') || path.includes('List')) {
          return true;
        }
        if (path.includes('_experience') && !path.includes('event') && !path.includes('eVar') && !path.includes('prop')) {
          return true;
        }
        if (path.includes('internal') || path.includes('session') || path.includes('_id')) {
          return true;
        }
        return false;
      });

      contextDataPaths.forEach(({ path, value }) => {
        const pathParts = path.split('.');
        let propertyName = '';

        if (path.includes('commerce')) {
          for (let i = pathParts.length - 1; i >= 0; i--) {
            if (pathParts[i] === 'commerce' && i + 1 < pathParts.length) {
              propertyName = pathParts[i + 1];
              break;
            }
          }
          if (propertyName && pathParts[pathParts.length - 1] === 'value') {
            propertyName = `commerce.${propertyName}`;
          }
        } else {
          propertyName = pathParts[pathParts.length - 2] || pathParts[pathParts.length - 1];
          if (propertyName === 'value') {
            propertyName = pathParts[pathParts.length - 2] || 'Unknown';
          }
        }

        const val = Array.isArray(value) ? JSON.stringify(value) : value;
        contextDataRows.push(`${propertyName}: ${val}`);
      });

      ws.contextData = contextDataRows.join('\n');

      // Extract Additional Settings
      let addPropsData = [];
      const additionalProperties = completePaths.filter(({ path }) =>
        (path.includes('pageName') ||
          path.includes('page_name') ||
          path.includes('page') ||
          path.includes('_adobe.analytics.')) &&
        !path.includes('prop') && !path.includes('eVar') && !path.toLowerCase().includes('event') &&
        !path.includes('commerce') && !path.includes('list') && !path.includes('List') &&
        !path.toLowerCase().includes('contextdata') && !path.toLowerCase().includes('context_data')
      );

      additionalProperties.forEach(({ path, value }) => {
        let propertyName = '';
        if (path.includes('pageName')) {
          propertyName = 'pageName';
        } else if (path.includes('page_name')) {
          propertyName = 'page_name';
        } else if (path.includes('_adobe.analytics.')) {
          const propertyMatch = path.match(/_adobe\.analytics\.(.+)/);
          if (propertyMatch) {
            propertyName = propertyMatch[1];
          } else {
            propertyName = path;
          }
        } else {
          propertyName = path;
        }
        const val = Array.isArray(value) ? JSON.stringify(value) : value;
        addPropsData.push(`${propertyName}: ${val}`);
      });

      ws.additionalSettings = addPropsData.join('\n');
    }


    // Data Elements (flatten keys if present)
    if (action.settings && action.settings.data) {
      ws.dataElements = Object.keys(action.settings.data).join('\n');
    }
    // Custom Code
    if (action.settings && action.settings.customCode) {
      ws.customCode = action.settings.customCode;
    }

    return ws;
  }

  // Map visible rows to rule data for accurate code extraction
  var data = [newHeaders];
  rows.forEach((row, idx) => {
    var cells = Array.from(row.children);
    // Try to match rule by name (first cell, strip commas)
    var ruleName = cells[0]?.innerText?.replace(/,/g, '').trim();
    var rule = rules.find(r => (r.name || r.id || '').replace(/,/g, '').trim() === ruleName);
    var rowData = cells.map((cell, colIdx) => cell.innerText.trim());
    // Insert AA and WebSDK details after Custom Code (Action)
    if (rule) {
      var aa = extractAADetails(rule.actions);
      var ws = extractWebSDKDetails(rule.actions);
      var insertIdx = insertAfterIdx + 1;
      // Overwrite the Custom Code (Action) column with actual code
      var customCodeActionIdx = headers.findIndex(h => h.toLowerCase().includes('custom code (action)'));
      if (customCodeActionIdx !== -1) {
        // Extract actual custom code using the same logic as the rule table
        var customCode = extractCustomCodeFromRuleTable(rule.actions);
        rowData[customCodeActionIdx] = customCode;
      }

      // Insert AA and WebSDK columns
      rowData.splice(insertIdx, 0,
        aa.eVars, aa.props, aa.events, aa.additional, aa.customCode,
        JSON.stringify(ws.data), JSON.stringify(ws.xdm)
      );
    } else {
      // If rule not found, insert blanks
      var insertIdx = insertAfterIdx + 1;
      rowData.splice(insertIdx, 0,
        '', '', '', '', '', // AA columns
        '', ''  // WebSDK columns
      );
    }
    data.push(rowData);
  });

  // Convert to CSV string (with UTF-8 BOM for Excel compatibility)
  function toCsvRow(arr) {
    return arr.map(val => '"' + String(val).replace(/"/g, '""') + '"').join(',');
  }
  var csvContent = '\uFEFF' + data.map(toCsvRow).join('\r\n');
  // Download CSV file
  var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'rules_table_export.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// True if string looks like a Launch data element ID (e.g. DE + hex)
function looksLikeDataElementId(s) {
  return typeof s === 'string' && s.length > 10 && s.indexOf('DE') === 0 && /^DE[0-9a-f]+$/i.test(s);
}

// Get data element name by ID from Data Elements tab (sessionStorage)
function getDataElementNameById(dataElementId) {
  if (!dataElementId || typeof dataElementId !== 'string') return null;
  try {
    var raw = sessionStorage.getItem('_satellite._container.dataElements');
    if (!raw) return null;
    var dataElements = JSON.parse(raw);
    if (!dataElements) return null;
    // Array format (e.g. [ { id: 'DE...', name: '...' }, ... ])
    if (Array.isArray(dataElements)) {
      for (var i = 0; i < dataElements.length; i++) {
        var de = dataElements[i];
        var id = de && (de.id || de.dataElementId);
        if (id === dataElementId) {
          var name = de && typeof de.name === 'string' ? de.name : null;
          return name || (looksLikeDataElementId(id) ? null : id);
        }
      }
      return null;
    }
    // Object keyed by name or by id; value may have .id and .name
    if (typeof dataElements !== 'object') return null;
    for (var key in dataElements) {
      if (!Object.prototype.hasOwnProperty.call(dataElements, key)) continue;
      var de = dataElements[key];
      if (!de || typeof de !== 'object') continue;
      var id = de.id || de.dataElementId || de.extensionId;
      if (id !== dataElementId && key !== dataElementId) continue;
      var name = typeof de.name === 'string' ? de.name : null;
      // Prefer .name; use key only if key is not an ID (so key is the human-readable name)
      if (name) return name;
      if (!looksLikeDataElementId(key)) return key;
      return null;
    }
    return null;
  } catch (e) { return null; }
}

// Collect all %...% data element refs from a nested object (values only)
function collectDataElementRefs(obj, set) {
  if (!set) set = {};
  if (obj == null) return set;
  if (typeof obj === 'string') {
    var match = obj.match(/%([^%]+)%/g);
    if (match) for (var i = 0; i < match.length; i++) set[match[i]] = match[i].slice(1, -1);
    return set;
  }
  if (Array.isArray(obj)) {
    for (var j = 0; j < obj.length; j++) collectDataElementRefs(obj[j], set);
    return set;
  }
  if (typeof obj === 'object') {
    for (var key in obj)
      if (Object.prototype.hasOwnProperty.call(obj, key)) collectDataElementRefs(obj[key], set);
  }
  return set;
}

// Remove transforms (clear snippet) and resolve dataElementId to name for display
function cleanActionSettingsForDisplay(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  var out = {};
  for (var k in settings) {
    if (Object.prototype.hasOwnProperty.call(settings, k)) {
      if (k === 'transforms') {
        var t = settings.transforms;
        if (t && typeof t === 'object') {
          var allClear = true;
          for (var p in t) {
            if (Object.prototype.hasOwnProperty.call(t, p)) {
              if (!t[p] || t[p].clear !== true) { allClear = false; break; }
            }
          }
          if (allClear) continue; // skip transforms when it's only clear snippets
        }
      }
      out[k] = settings[k];
    }
  }
  if (out.dataElementId) {
    var name = getDataElementNameById(out.dataElementId);
    if (name) out.dataElementName = name;
  }
  // Add a summary of %...% data element refs used in data payload (human-readable)
  if (out.data && typeof out.data === 'object') {
    var refs = collectDataElementRefs(out.data, {});
    var refKeys = Object.keys(refs);
    if (refKeys.length > 0) {
      out._dataElementRefsUsed = refKeys.map(function (token) { return refs[token]; });
    }
  }
  return out;
}

// Modal functions for displaying custom code
function showCodeModal(title, code) {
  const modal = document.getElementById('codeModal');
  const modalTitle = document.getElementById('modalTitle');
  const codeContent = document.getElementById('codeContent');
  const copyBtn = document.getElementById('modalCopyBtn');

  if (modal && modalTitle && codeContent) {
    modalTitle.textContent = title;
    codeContent.textContent = code;
    modal.style.display = 'block';
    if (copyBtn) {
      copyBtn._currentCode = code;
      copyBtn.classList.remove('copied');
      copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
      copyBtn.onclick = function () {
        var text = copyBtn._currentCode != null ? copyBtn._currentCode : (codeContent ? codeContent.textContent : '');
        if (!text) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            copyBtn.classList.add('copied');
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied';
            setTimeout(function () {
              copyBtn.classList.remove('copied');
              copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
            }, 2000);
          }).catch(function () { fallbackCopy(text, copyBtn); });
        } else {
          fallbackCopy(text, copyBtn);
        }
      };
    }
  }
}

function fallbackCopy(text, copyBtn) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    if (copyBtn) {
      copyBtn.classList.add('copied');
      copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied';
      setTimeout(function () {
        copyBtn.classList.remove('copied');
        copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
      }, 2000);
    }
  } catch (e) { /* ignore */ }
  document.body.removeChild(ta);
}

function closeModal(event) {
  var modal = document.getElementById('codeModal');
  if (!modal) return;
  if (!event || event.target === modal || (event.target && event.target.classList && event.target.classList.contains('close'))) {
    modal.style.display = 'none';
  }
}

// Ensure close button and overlay work (inline onclick may not find closeModal in some contexts)
function initCodeModalClose() {
  var modal = document.getElementById('codeModal');
  if (!modal) return;
  var closeBtn = modal.querySelector('.close');
  if (closeBtn) {
    closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      modal.style.display = 'none';
    });
  }
  modal.addEventListener('click', function (e) {
    if (e.target === modal) modal.style.display = 'none';
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCodeModalClose);
} else {
  initCodeModalClose();
}

// Close modal on ESC key
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    var modal = document.getElementById('codeModal');
    if (modal && modal.style.display === 'block') {
      modal.style.display = 'none';
    }
  }
});

// Toggle expand: show rule details in a row below (expandable row)
function toggleExpand(icon, rowIndex) {
  const currentRow = icon.closest('tr');
  if (!currentRow) return;

  const expandableRow = currentRow.nextElementSibling;

  if (expandableRow && expandableRow.classList.contains('expandable-row')) {
    expandableRow.classList.toggle('active');
    icon.classList.toggle('expanded');
    var rowIcons = currentRow.querySelectorAll('.expand-icon');
    for (var si = 0; si < rowIcons.length; si++) {
      if (rowIcons[si] !== icon) rowIcons[si].classList.toggle('expanded');
    }
    return;
  }

  var rule = currentRow._ruleData;
  if (!rule) return;
  try {
    var customCodeConds = currentRow._customCodeConditions || [];
    var customCodeActions = currentRow._customCodeActions || [];

    function eventLabel(ev) {
      if (ev.modulePath && ev.modulePath.indexOf('directCall') !== -1) {
        return (ev.settings && ev.settings.identifier) ? 'Direct Call: ' + ev.settings.identifier : 'Direct Call';
      }
      if (ev.modulePath) return ev.modulePath.split('/').pop().replace('.js', '');
      return ev.name || ev.type || 'Event';
    }
    function conditionLabel(c) {
      if (c.modulePath) return c.modulePath.split('/').pop().replace('.js', '');
      return c.name || c.type || 'Condition';
    }
    function actionLabel(a) {
      if (a.modulePath) {
        var path = a.modulePath;
        var name = path.split('/').pop().replace('.js', '');
        // When path ends with index.js, "name" is "index" – derive label from full path
        if (name === 'index') {
          if (path.indexOf('adobe-alloy') !== -1) {
            if (path.indexOf('sendEvent') !== -1) return 'WebSDK Send Event';
            if (path.indexOf('sendBeacon') !== -1) return 'WebSDK Send Beacon';
            if (path.indexOf('setConsent') !== -1) return 'WebSDK Set Consent';
            if (path.indexOf('getData') !== -1) return 'WebSDK Get Data';
            if (path.indexOf('setCustomerIds') !== -1) return 'WebSDK Set Customer IDs';
            if (path.indexOf('setDebug') !== -1) return 'WebSDK Set Debug';
            if (path.indexOf('setIdentityMap') !== -1) return 'WebSDK Set Identity Map';
            if (path.indexOf('setTimestamp') !== -1) return 'WebSDK Set Timestamp';
            if (path.indexOf('setUserId') !== -1) return 'WebSDK Set User ID';
            if (path.indexOf('setViewport') !== -1) return 'WebSDK Set Viewport';
            if (path.indexOf('setWorkflow') !== -1) return 'WebSDK Set Workflow';
            if (path.indexOf('setWorkflowState') !== -1) return 'WebSDK Set Workflow State';
            if (path.indexOf('setVariables') !== -1) return 'WebSDK Set Variables';
            if (path.indexOf('updateVariables') !== -1) return 'WebSDK Update Variable';
          }
          if (path.indexOf('adobe-analytics') !== -1) {
            if (path.indexOf('setVariables') !== -1) return 'Set Variables';
            if (path.indexOf('updateVariables') !== -1) return 'Update Variables';
          }
          if (path.indexOf('sendEvent') !== -1) return 'Send Event';
          if (path.indexOf('sendBeacon') !== -1) return 'Send Beacon';
          if (path.indexOf('setConsent') !== -1) return 'Set Consent';
          if (path.indexOf('getData') !== -1) return 'Get Data';
          return 'Action';
        }
        if (path.indexOf('adobe-analytics') !== -1 && name === 'setVariables') return 'Set Variables';
        if (path.indexOf('adobe-analytics') !== -1 && name === 'updateVariables') return 'Update Variables';
        if (path.indexOf('adobe-alloy') !== -1) {
          if (path.indexOf('sendEvent') !== -1) return 'WebSDK Send Event';
          if (path.indexOf('sendBeacon') !== -1) return 'WebSDK Send Beacon';
          if (path.indexOf('updateVariables') !== -1) return 'WebSDK Update Variable';
          if (path.indexOf('setVariables') !== -1) return 'WebSDK Set Variables';
        }
        return name;
      }
      return a.name || a.type || 'Action';
    }

    // Simplified one-line event summary (no raw container dump)
    function getEventSummary(ev) {
      if (!ev) return '';
      var typeLabel = eventLabel(ev);
      if (!ev.settings || typeof ev.settings !== 'object') return typeLabel;
      var s = ev.settings;
      if (ev.modulePath && ev.modulePath.indexOf('directCall') !== -1) {
        return s.identifier ? 'Direct Call: ' + s.identifier : 'Direct Call';
      }
      var target = '';
      if (s.selector && typeof s.selector === 'string' && s.selector.trim()) {
        target = s.selector.trim();
      } else if (s.elementId && typeof s.elementId === 'string' && s.elementId.trim()) {
        target = '#' + s.elementId.replace(/^#/, '').trim();
      } else if (s.elementClasses && typeof s.elementClasses === 'string' && s.elementClasses.trim()) {
        target = '.' + s.elementClasses.replace(/^\s*\./, '').trim().replace(/\s+/g, '.');
      } else if (s.elementTag && typeof s.elementTag === 'string' && s.elementTag.trim()) {
        target = s.elementTag.trim();
      }
      var eventName = (s.eventName || s.eventType || s.trigger || '').toString().trim();
      if (target && eventName) return eventName + ' on ' + target;
      if (target) return typeLabel + ' on ' + target;
      if (eventName) return eventName;
      return typeLabel;
    }

    function getEventDetailText(ev) {
      if (!ev || !ev.settings) return '';
      var s = ev.settings;
      var parts = [];
      // Direct call: show identifier only (no selector)
      if (ev.modulePath && ev.modulePath.indexOf('directCall') !== -1) {
        if (s.identifier) parts.push('Identifier: ' + s.identifier);
        return parts.join(' \u00B7 ');
      }
      // CSS selector (most common for click / event-based rules)
      if (s.selector && typeof s.selector === 'string' && s.selector.trim()) {
        parts.push('Selector: ' + s.selector.trim());
      }
      // Element tag (e.g. "a", "button")
      if (s.elementTag && typeof s.elementTag === 'string') {
        var tag = s.elementTag.trim();
        if (tag) parts.push('Tag: ' + tag);
      }
      // Element ID
      if (s.elementId && typeof s.elementId === 'string') {
        var id = s.elementId.trim();
        if (id) parts.push('ID: #' + id.replace(/^#/, ''));
      }
      // Element class(es)
      if (s.elementClasses && typeof s.elementClasses === 'string') {
        var cls = s.elementClasses.trim();
        if (cls) parts.push('Class: .' + cls.replace(/^\s*\./, '').replace(/\s+/g, '.'));
      }
      // Event name/type (e.g. "click", "submit")
      if (s.eventName && typeof s.eventName === 'string') parts.push('Event: ' + s.eventName);
      else if (s.eventType && typeof s.eventType === 'string') parts.push('Event: ' + s.eventType);
      else if (s.trigger && typeof s.trigger === 'string') parts.push('Trigger: ' + s.trigger);
      return parts.join(' \u00B7 ');
    }

    function getConditionDetailText(cond) {
      if (!cond || !cond.settings) return '';
      var p = cond.settings;
      var path = (cond.modulePath || '').toLowerCase();
      if (path.indexOf('value-comparison') !== -1 || path.indexOf('valuecomparison') !== -1) {
        var left = p.leftOperand != null ? String(p.leftOperand) : (p.leftValue != null ? String(p.leftValue) : '');
        var right = p.rightOperand != null ? String(p.rightOperand) : (p.rightValue != null ? String(p.rightValue) : '');
        var op = p.comparisonOperator || p.operator || 'equals';
        if (!left && !right) return '';
        return left + ' \u2014 ' + op + ' \u2014 ' + right;
      }
      return '';
    }

    function getActionDetailText(action) {
      if (!action || !action.settings) return '';
      var s = action.settings;
      var path = (action.modulePath || '').toLowerCase();
      if (path.indexOf('sendevent') !== -1 || path.indexOf('send-event') !== -1) {
        var parts = [];
        if (s.type) parts.push('Type: ' + s.type);
        if (s.xdm) parts.push(typeof s.xdm === 'string' && s.xdm.indexOf('%') !== -1 ? 'XDM: ' + s.xdm : 'XDM data');
        else if (s.data) parts.push(typeof s.data === 'string' && s.data.indexOf('%') !== -1 ? 'Data: ' + s.data : 'Data');
        return parts.length ? parts.join(' \u00B7 ') : 'Send event';
      }
      if (path.indexOf('updatevariables') !== -1 || path.indexOf('setvariables') !== -1) {
        if (s.data || s.xdm) return 'Config attached';
        return '';
      }
      return '';
    }

    function addDetailBlock(parent, label, detailText, buttons) {
      var block = document.createElement('div');
      block.className = 'expanded-detail-item-block';
      var labelRow = document.createElement('div');
      labelRow.className = 'expanded-detail-item-label';
      var itemIcon = document.createElement('i');
      itemIcon.className = 'item-icon fas fa-chevron-right';
      labelRow.appendChild(itemIcon);
      labelRow.appendChild(document.createTextNode(label));
      block.appendChild(labelRow);
      if (detailText) {
        var detail = document.createElement('div');
        detail.className = 'expanded-detail-item-detail';
        detail.textContent = detailText;
        block.appendChild(detail);
      }
      if (buttons && buttons.length) {
        var btnWrap = document.createElement('div');
        btnWrap.className = 'expanded-detail-item-actions';
        buttons.forEach(function (b) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = b.className || 'btn-config';
          btn.title = b.title;
          if (b.ariaLabel) btn.setAttribute('aria-label', b.ariaLabel);
          if (b.iconClass) {
            var ic = document.createElement('i');
            ic.className = 'fas ' + b.iconClass;
            btn.appendChild(ic);
          } else if (b.text) btn.textContent = b.text;
          btn.onclick = b.onclick;
          btnWrap.appendChild(btn);
        });
        block.appendChild(btnWrap);
      }
      parent.appendChild(block);
    }

    function buildEventsSection() {
      var section = document.createElement('div');
      section.className = 'expanded-section expanded-section-column';
      var h4 = document.createElement('h4');
      var sectionIcon = document.createElement('i');
      sectionIcon.className = 'section-icon fas fa-bolt';
      h4.appendChild(sectionIcon);
      h4.appendChild(document.createTextNode('Events'));
      section.appendChild(h4);
      var events = rule.events && Array.isArray(rule.events) ? rule.events : [];
      if (events.length === 0) {
        addDetailBlock(section, 'None', '', []);
      } else {
        events.forEach(function (ev) {
          var lbl = eventLabel(ev);
          var summary = getEventSummary(ev);
          var detail = (summary && summary !== lbl) ? summary : '';
          var buttons = [];
          if (ev.settings && Object.keys(ev.settings).length > 0) {
            var settingsTitle = 'View event settings';
            var settingsJson = JSON.stringify(ev.settings, null, 2);
            buttons.push({ className: 'btn-config', title: settingsTitle, ariaLabel: settingsTitle, iconClass: 'fa-search', onclick: (function (j, t) { return function () { showCodeModal(t, j); }; })(settingsJson, settingsTitle) });
          }
          addDetailBlock(section, lbl, detail, buttons);
        });
      }
      return section;
    }

    function buildConditionsSection() {
      var section = document.createElement('div');
      section.className = 'expanded-section expanded-section-column';
      var h4 = document.createElement('h4');
      var sectionIcon = document.createElement('i');
      sectionIcon.className = 'section-icon fas fa-filter';
      h4.appendChild(sectionIcon);
      h4.appendChild(document.createTextNode('Conditions'));
      section.appendChild(h4);
      var conditions = rule.conditions && Array.isArray(rule.conditions) ? rule.conditions : [];
      var customCodeIdx = 0;
      if (conditions.length === 0) {
        addDetailBlock(section, 'None', '', []);
      } else {
        conditions.forEach(function (cond) {
          var lbl = conditionLabel(cond);
          var isCustomCode = cond.modulePath && (cond.modulePath.indexOf('customCode') !== -1 || cond.modulePath.indexOf('custom-code') !== -1);
          var buttons = [];
          if (isCustomCode && customCodeConds[customCodeIdx]) {
            var codeObj = customCodeConds[customCodeIdx];
            var code = typeof codeObj === 'string' ? codeObj : (codeObj.code || '');
            if (code && code.trim()) {
              var btnTitle = 'View condition code' + (customCodeConds.length > 1 ? ' ' + (customCodeIdx + 1) : '');
              buttons.push({ className: 'btn-code', title: btnTitle, ariaLabel: btnTitle, iconClass: 'fa-code', onclick: (function (c, t) { return function () { showCodeModal(t, c); }; })(code, btnTitle) });
              customCodeIdx++;
            }
          } else if (cond.settings && Object.keys(cond.settings).length > 0) {
            var settingsTitle = 'View condition settings';
            var settingsJson = JSON.stringify(cond.settings, null, 2);
            buttons.push({ className: 'btn-config', title: settingsTitle, ariaLabel: settingsTitle, iconClass: 'fa-search', onclick: (function (j, t) { return function () { showCodeModal(t, j); }; })(settingsJson, settingsTitle) });
          }
          addDetailBlock(section, lbl, '', buttons);
        });
      }
      return section;
    }

    function buildActionsSection() {
      var section = document.createElement('div');
      section.className = 'expanded-section expanded-section-column';
      var h4 = document.createElement('h4');
      var sectionIcon = document.createElement('i');
      sectionIcon.className = 'section-icon fas fa-cogs';
      h4.appendChild(sectionIcon);
      h4.appendChild(document.createTextNode('Actions'));
      section.appendChild(h4);
      var actions = rule.actions && Array.isArray(rule.actions) ? rule.actions : [];
      var customActionIdx = 0;
      if (actions.length === 0) {
        addDetailBlock(section, 'None', '', []);
      } else {
        actions.forEach(function (action) {
          var lbl = actionLabel(action);
          var path = (action.modulePath || '').toLowerCase();
          var isSendEvent = path.indexOf('sendevent') !== -1 || path.indexOf('send-event') !== -1;
          var isCustomCode = path.indexOf('customcode') !== -1 || path.indexOf('custom-code') !== -1;
          var buttons = [];
          if (isCustomCode && customCodeActions[customActionIdx]) {
            var codeObj = customCodeActions[customActionIdx];
            var code = typeof codeObj === 'string' ? codeObj : (codeObj.code || '');
            if (code && code.trim()) {
              var btnTitle = 'View action code' + (customCodeActions.length > 1 ? ' ' + (customActionIdx + 1) : '');
              buttons.push({ className: 'btn-code', title: btnTitle, ariaLabel: btnTitle, iconClass: 'fa-code', onclick: (function (c, t) { return function () { showCodeModal(t, c); }; })(code, btnTitle) });
              customActionIdx++;
            }
          } else if (isSendEvent && action.settings && (action.settings.xdm || action.settings.data)) {
            var config = {};
            if (action.settings.type) config.type = action.settings.type;
            if (action.settings.xdm) config.xdm = action.settings.xdm;
            if (action.settings.data) config.data = action.settings.data;
            var configTitle = 'View XDM/Config';
            var configJson = JSON.stringify(config, null, 2);
            buttons.push({ className: 'btn-config', title: configTitle, ariaLabel: configTitle, iconClass: 'fa-file-code', onclick: (function (j, t) { return function () { showCodeModal(t, j); }; })(configJson, configTitle) });
          } else if (action.settings && Object.keys(action.settings).length > 0) {
            var settingsTitle = 'View action settings';
            var cleaned = cleanActionSettingsForDisplay(action.settings);
            var settingsJson = JSON.stringify(cleaned, null, 2);
            buttons.push({ className: 'btn-config', title: settingsTitle, ariaLabel: settingsTitle, iconClass: 'fa-search', onclick: (function (j, t) { return function () { showCodeModal(t, j); }; })(settingsJson, settingsTitle) });
          }
          addDetailBlock(section, lbl, '', buttons);
        });
      }
      return section;
    }

    var eventsSection = buildEventsSection();
    var conditionsSection = buildConditionsSection();
    var actionsSection = buildActionsSection();

    var columnsWrapper = document.createElement('div');
    columnsWrapper.className = 'expanded-content-columns';
    columnsWrapper.appendChild(eventsSection);
    columnsWrapper.appendChild(conditionsSection);
    columnsWrapper.appendChild(actionsSection);

    var content = document.createElement('div');
    content.className = 'expanded-content';
    content.appendChild(columnsWrapper);

    var td = document.createElement('td');
    td.colSpan = 6;
    td.appendChild(content);

    var newExpandableRow = document.createElement('tr');
    newExpandableRow.className = 'expandable-row';
    newExpandableRow.appendChild(td);

    currentRow.parentNode.insertBefore(newExpandableRow, currentRow.nextSibling);
    newExpandableRow.classList.add('active');
    icon.classList.add('expanded');
    var rowIcons = currentRow.querySelectorAll('.expand-icon');
    for (var si = 0; si < rowIcons.length; si++) {
      if (rowIcons[si] !== icon) rowIcons[si].classList.add('expanded');
    }
  } catch (expandErr) {
    console.error('Error expanding rule details:', expandErr);
  }
}
