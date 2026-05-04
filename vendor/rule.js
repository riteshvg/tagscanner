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

  // Define all headers (7 columns; Custom Code then Size at end)
  var headers = [
    { text: 'ID #', tooltip: 'Rule number in sequential order' },
    { text: 'Rule Name', tooltip: 'Name of the rule in your Adobe Tags property' },
    { text: 'Events', tooltip: 'Event types that trigger this rule' },
    { text: 'Conditions', tooltip: 'Conditions for this rule' },
    { text: 'Actions', tooltip: 'Actions performed by this rule' },
    { text: 'Custom Code', tooltip: 'Custom code attached to conditions or actions in this rule' },
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

  function isComponentDisabled(obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (obj.enabled === false) return true;
    if (obj.disabled === true) return true;
    if (obj.isEnabled === false) return true;
    if (typeof obj.status === 'string' && obj.status.toLowerCase() === 'disabled') return true;
    if (typeof obj.state === 'string' && obj.state.toLowerCase() === 'disabled') return true;
    return false;
  }

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
    button.innerHTML = '<i class="fas fa-code"></i>';
    button.title = title;
    button.onclick = function(e) {
      e.stopPropagation();
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
    if (hasData && count >= 1) {
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

    return wrapper;
  }

  // Derive a human-readable label for any action object
  function deriveBadgeLabel(action) {
    if (!action) return 'Action';
    var path = action.modulePath || '';
    if (path) {
      if (path.includes('adobe-alloy')) {
        if (path.includes('sendEvent'))       return 'WebSDK Send Event';
        if (path.includes('sendBeacon'))      return 'WebSDK Send Beacon';
        if (path.includes('setConsent'))      return 'WebSDK Set Consent';
        if (path.includes('setVariables'))    return 'WebSDK Set Variables';
        if (path.includes('updateVariables')) return 'WebSDK Update Variables';
        if (path.includes('getData'))         return 'WebSDK Get Data';
        if (path.includes('setCustomerIds'))  return 'WebSDK Set Customer IDs';
        if (path.includes('setDebug'))        return 'WebSDK Set Debug';
        if (path.includes('setIdentityMap'))  return 'WebSDK Set Identity Map';
        if (path.includes('setTimestamp'))    return 'WebSDK Set Timestamp';
        if (path.includes('setUserId'))       return 'WebSDK Set User ID';
      }
      if (path.includes('adobe-analytics')) {
        if (path.includes('setVariables'))    return 'AA Set Variables';
        if (path.includes('updateVariables')) return 'AA Update Variables';
        if (path.includes('sendBeacon'))      return 'AA Send Beacon';
      }
      // Derive label from path: take the last non-index segment, convert camelCase
      var parts = path.replace(/\.js$/, '').split('/');
      var seg = parts[parts.length - 1];
      if (seg === 'index' && parts.length > 1) seg = parts[parts.length - 2];
      if (seg === 'customCode' || seg === 'custom-code') return 'Custom Code';
      return seg.replace(/-/g, ' ').replace(/([A-Z])/g, ' $1').replace(/\s+/g, ' ').trim() || 'Action';
    }
    return action.name || action.type || 'Action';
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
      var actionName = deriveBadgeLabel(action);
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
    ruleNameSpan.title = 'Click to view full composition';
    ruleNameSpan.style.cursor = 'pointer';
    ruleNameSpan.addEventListener('click', (function (r) {
      return function (e) { e.stopPropagation(); showRuleModal(r); };
    })(rule));
    tdName.appendChild(ruleNameExpandIcon);
    tdName.appendChild(ruleNameSpan);
    if (isComponentDisabled(rule)) {
      var disabledBadge = document.createElement('span');
      disabledBadge.className = 'component-disabled-badge';
      disabledBadge.textContent = 'Disabled';
      tdName.appendChild(disabledBadge);
      tr.classList.add('component-disabled');
    }
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
    if (rule.actions && Array.isArray(rule.actions)) {
      // Extract action information with better debugging
      const actionInfo = rule.actions.map((action, actionIndex) => {
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
          else actionDescription = deriveBadgeLabel(action);
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

    // Size (KB) – appended after Custom Code column below
    var sizeKb = getRuleSizeKb(rule);
    var tdSize = document.createElement('td');
    tdSize.textContent = sizeKb.toFixed(2) + ' KB';
    tdSize.setAttribute('data-sort-value', String(sizeKb));
    tdSize.className = 'rule-size-cell';

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
            actionName: action.name || action.id || deriveBadgeLabel(action)
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

    // Custom Code column – single centered button matching Data Elements style
    var tdCode = document.createElement('td');
    tdCode.style.minWidth = '72px';
    tdCode.style.textAlign = 'center';
    var allCustomCode = [];
    (tr._customCodeConditions || []).forEach(function (c) {
      var code = typeof c === 'string' ? c : (c.code || '');
      if (code && code.trim()) allCustomCode.push({ label: 'Condition', code: code });
    });
    (tr._customCodeActions || []).forEach(function (c) {
      var code = typeof c === 'string' ? c : (c.code || '');
      if (code && code.trim()) allCustomCode.push({ label: (typeof c === 'object' && c.actionName) ? c.actionName : 'Action', code: code });
    });
    var hasCode = allCustomCode.length > 0;
    tdCode.setAttribute('data-sort-value', hasCode ? '1' : '0');
    var codeSortToken = document.createElement('span');
    codeSortToken.textContent = hasCode ? 'Yes' : 'No';
    codeSortToken.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden';
    tdCode.appendChild(codeSortToken);
    var codeIconBtn = document.createElement('button');
    codeIconBtn.type = 'button';
    codeIconBtn.className = 'btn';
    codeIconBtn.style.cssText = 'border:none;background:transparent;padding:0;line-height:1;font-size:18px;';
    codeIconBtn.innerHTML = '<i class="fas fa-code"></i>';
    if (!hasCode) {
      codeIconBtn.disabled = true;
      codeIconBtn.title = 'No custom code in this rule';
      codeIconBtn.style.color = '#c4c7cf';
      codeIconBtn.style.cursor = 'not-allowed';
    } else {
      var snippetCount = allCustomCode.length;
      codeIconBtn.title = snippetCount === 1 ? 'View custom code' : 'View ' + snippetCount + ' custom code snippets';
      codeIconBtn.style.color = '#27c5c1';
      codeIconBtn.style.cursor = 'pointer';
      codeIconBtn.onclick = (function (codeItems, rName, btn) {
        return async function () {
          var origHtml = btn.innerHTML;
          btn.disabled = true;
          btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

          // Step 1: resolve hosted-file URLs to actual code
          var resolved = await Promise.all(codeItems.map(async function (item) {
            var code = (item.code || '').trim();
            if (code && (code.startsWith('http') || code.includes('assets.adobedtm.com'))) {
              try {
                var res = await fetch(code, { method: 'GET', mode: 'cors' });
                if (res.ok) code = await res.text();
              } catch (e) { /* keep URL as fallback */ }
            }
            return { label: item.label, code: code };
          }));

          btn.innerHTML = origHtml;
          btn.disabled = false;

          if (resolved.length === 1) {
            showCodeModal(resolved[0].label + ': ' + rName, resolved[0].code);
          } else {
            var combined = resolved.map(function (item, idx) {
              return '/* ---- ' + item.label + ' (' + (idx + 1) + ' of ' + resolved.length + ') ---- */\n' + item.code;
            }).join('\n\n');
            showCodeModal('Custom Code: ' + rName + ' (' + resolved.length + ' snippets)', combined);
          }
        };
      })(allCustomCode, rule.name || ('Rule ' + (i + 1)), codeIconBtn);
    }
    tdCode.appendChild(codeIconBtn);
    tr.appendChild(tdCode);

    // Size (KB) – appended last
    tr.appendChild(tdSize);

    // Build search index: rule name + every extension key used across components
    var _searchExts = [];
    function _collectExt(arr) {
      if (!arr) return;
      arr.forEach(function (c) {
        var k = c.modulePath ? c.modulePath.split('/')[0] : '';
        if (k && _searchExts.indexOf(k) === -1) _searchExts.push(k);
      });
    }
    _collectExt(rule.events); _collectExt(rule.conditions); _collectExt(rule.actions);
    tr.setAttribute('data-search-text', (ruleName + ' ' + _searchExts.join(' ')).toLowerCase());

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

  // Search — debounced, multi-field (rule name + extensions used)
  function _debounce(fn, ms) {
    var t; return function () { clearTimeout(t); var a = arguments, c = this; t = setTimeout(function () { fn.apply(c, a); }, ms); };
  }
  const searchInput = document.getElementById('ruleSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', _debounce(function () {
      const term = this.value.toLowerCase().trim();
      rows.forEach(function (row) {
        var haystack = row.getAttribute('data-search-text') || row.querySelectorAll('td')[1].textContent.toLowerCase();
        if (!term || haystack.includes(term)) row.classList.remove('search-hidden');
        else row.classList.add('search-hidden');
      });
      currentPage = 1;
      showPage(currentPage);
    }, 220));
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
  var rulesRaw = sessionStorage.getItem('_satellite._container.rules');
  var rulesArray = [];
  if (rulesRaw && rulesRaw.trim() !== '') {
    try {
      var obj = JSON.parse(rulesRaw);
      if (Array.isArray(obj)) rulesArray = obj;
      else if (obj && typeof obj === 'object')
        rulesArray = (obj.rules && Array.isArray(obj.rules)) ? obj.rules : Object.values(obj).filter(function (item) { return item && typeof item === 'object'; });
    } catch (e) {}
  }
  if (rulesArray.length === 0) {
    alert('No rules data to export. Load a property first.');
    return;
  }

  function ruleSizeKb(rule) {
    if (rule == null) return 0;
    if (typeof rule.size === 'number' && rule.size >= 0) return (rule.size / 1024).toFixed(2);
    try {
      var json = JSON.stringify(rule);
      var len = (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(json).length : (typeof Blob !== 'undefined' ? new Blob([json]).size : json.length * 2);
      return (len / 1024).toFixed(2);
    } catch (e) { return '0'; }
  }
  function eventSummary(ev) {
    if (!ev) return '';
    if (ev.type) return ev.type;
    if (ev.name) return ev.name;
    if (ev.modulePath) {
      var evH = hostBundleLabelFromModulePath(ev.modulePath);
      if (evH) return evH;
      return ev.modulePath.split('/').pop().replace(/\.js$/, '') || 'Event';
    }
    return 'Event';
  }
  function conditionSummary(c) {
    if (!c) return '';
    if (c.name) return c.name;
    if (c.modulePath) {
      var cH = hostBundleLabelFromModulePath(c.modulePath);
      if (cH) return cH;
      return c.modulePath.split('/').pop().replace(/\.js$/, '') || 'Condition';
    }
    return c.type || 'Condition';
  }
  function actionSummary(a) {
    if (!a) return '';
    if (a.name) return a.name;
    if (a.modulePath) {
      var aH = hostBundleLabelFromModulePath(a.modulePath);
      if (aH) return aH;
      var fn = a.modulePath.split('/').pop().replace(/\.js$/, '');
      if (fn === 'index' && a.modulePath.indexOf('sendEvent') !== -1) return 'WebSDK Send Event';
      if (fn === 'index' && a.modulePath.indexOf('setVariables') !== -1) return 'Adobe Analytics SetVariable';
      return fn || 'Action';
    }
    return a.type || 'Action';
  }

  function toCsvCell(val) {
    return '"' + String(val == null ? '' : val).replace(/"/g, '""') + '"';
  }

  function moduleToDelegateDescriptor(modulePath) {
    if (!modulePath) return '';
    var parts = modulePath.split('/');
    var extName = parts[0] || '';
    var libIdx = parts.indexOf('lib');
    if (libIdx === -1) return modulePath;
    var typePart = parts[libIdx + 1] || '';
    var typeMap = { actions: 'actions', events: 'events', conditions: 'conditions', dataElements: 'data-elements', data_elements: 'data-elements' };
    var type = typeMap[typePart] || typePart;
    var remaining = parts.slice(libIdx + 2);
    var compFile = '';
    if (remaining.length === 1) {
      compFile = remaining[0].replace(/\.js$/, '');
    } else if (remaining.length > 1) {
      var lastFile = remaining[remaining.length - 1].replace(/\.js$/, '');
      compFile = (lastFile === 'index') ? remaining[remaining.length - 2] : lastFile;
    }
    var kebab = compFile.replace(/([A-Z])/g, function (m) { return '-' + m.toLowerCase(); });
    if (kebab.charAt(0) === '-') kebab = kebab.slice(1);
    return extName + '::' + type + '::' + kebab;
  }

  function safeSettingsJson(settings) {
    if (!settings || typeof settings !== 'object') return '';
    try {
      var copy = Object.assign({}, settings);
      if (typeof copy.source === 'function') copy.source = '[function]';
      if (typeof copy.source === 'string' && copy.source.length > 500) copy.source = copy.source.slice(0, 500) + '\u2026[truncated]';
      var json = JSON.stringify(copy);
      return json.length > 2000 ? json.slice(0, 2000) + '\u2026[truncated]' : json;
    } catch (e) { return ''; }
  }

  function componentLabel(comp, type) {
    if (!comp) return type;
    if (comp.name) return comp.name;
    if (comp.modulePath) {
      var fn = comp.modulePath.split('/').pop().replace(/\.js$/, '');
      if (fn === 'index' && comp.modulePath.split('/').length > 3) {
        fn = comp.modulePath.split('/').slice(-2, -1)[0] || fn;
      }
      return fn.replace(/([A-Z])/g, ' $1').trim() || type;
    }
    return comp.type || type;
  }

  var headers = ['#', 'Rule Name', 'Component Type', 'Component Name', 'Delegate Descriptor ID', 'Component Order', 'Settings JSON'];
  var rows = [];
  var rowNum = 1;
  rulesArray.forEach(function (rule) {
    var ruleName = rule.name || rule.id || 'Unknown Rule';
    function addComponents(arr, typeName) {
      if (!arr || !Array.isArray(arr)) return;
      arr.forEach(function (comp, idx) {
        rows.push([
          rowNum++,
          ruleName,
          typeName,
          componentLabel(comp, typeName),
          moduleToDelegateDescriptor(comp.modulePath || ''),
          idx + 1,
          safeSettingsJson(comp.settings)
        ]);
      });
    }
    addComponents(rule.events, 'Event');
    addComponents(rule.conditions, 'Condition');
    addComponents(rule.actions, 'Action');
  });

  var csvLines = [headers.map(toCsvCell).join(',')].concat(rows.map(function (r) { return r.map(toCsvCell).join(','); }));
  var csvContent = '\uFEFF' + csvLines.join('\r\n');
  var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'rules_export.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
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

// Structured static analysis for custom code — returns HTML
function analyzeCodeWithoutAI(code) {
  var src = String(code || '');
  if (!src.trim()) return '<p style="color:#888;font-style:italic;margin:0">No code available to analyze.</p>';

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function has(re) { return re.test(src); }
  function count(re) { return (src.match(re)||[]).length; }

  var lines = src.split(/\r?\n/);
  var nonEmpty = lines.filter(function(l){ return l.trim(); });
  var avgLineLen = nonEmpty.length ? Math.round(src.length / nonEmpty.length) : src.length;
  var maybeMinified = (nonEmpty.length <= 2 && src.length > 500) || avgLineLen > 220;

  var returnMatches = [];
  var returnRe = /\breturn\s+([^\n;{}]{1,120})/g, rm;
  while ((rm = returnRe.exec(src)) !== null) {
    var rv = rm[1].trim();
    if (rv && rv !== 'null' && rv !== 'undefined' && rv !== "''" && rv !== '""')
      returnMatches.push(rv.length > 90 ? rv.slice(0,90) + '\u2026' : rv);
    if (returnMatches.length >= 3) break;
  }

  var returnType = 'unknown';
  if (has(/\breturn\s+(true|false|!![^;{]{0,40})/)) returnType = 'boolean';
  else if (has(/\breturn\s+['"`]/) || has(/\.toString\s*\(\)/) || has(/\breturn\s+String\s*\(/)) returnType = 'string';
  else if (has(/\breturn\s+(parseInt|parseFloat|Number)\s*\(/)) returnType = 'number';
  else if (has(/\breturn\s+\[/)) returnType = 'array';
  else if (has(/\breturn\s+\{/) || has(/\breturn\s+new\s+Object/)) returnType = 'object';
  else if (has(/\breturn\s+new\s+Promise/) || has(/async\s+function|\bawait\s+/)) returnType = 'Promise';
  else if (returnMatches.length > 2) returnType = 'conditional';
  else if (returnMatches.length > 0) returnType = 'value';

  var ddPaths = [], ddSeen = {};
  var ddRe = /\b(digitalData(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*){1,6})/g, ddm;
  while ((ddm = ddRe.exec(src)) !== null) {
    if (!ddSeen[ddm[1]] && ddPaths.length < 8) { ddSeen[ddm[1]] = true; ddPaths.push(ddm[1]); }
  }

  var adlPaths = [], adlSeen = {};
  var adlRe = /\b(adobeDataLayer(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*){1,5})/g, adlm;
  while ((adlm = adlRe.exec(src)) !== null) {
    if (!adlSeen[adlm[1]] && adlPaths.length < 6) { adlSeen[adlm[1]] = true; adlPaths.push(adlm[1]); }
  }

  var dlPaths = [], dlSeen = {};
  var dlRe = /\b(dataLayer(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*){1,5})/g, dlm;
  while ((dlm = dlRe.exec(src)) !== null) {
    if (!dlSeen[dlm[1]] && dlPaths.length < 6) { dlSeen[dlm[1]] = true; dlPaths.push(dlm[1]); }
  }

  var winPaths = [], winSeen = {};
  var winRe = /\b(window\.[a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*){0,4})/g, wm;
  while ((wm = winRe.exec(src)) !== null) {
    if (!winSeen[wm[1]] && winPaths.length < 6) { winSeen[wm[1]] = true; winPaths.push(wm[1]); }
  }

  var docLocReads = [], docLocSeen = {};
  var docLocRe = /\b(document\.(?:title|referrer|URL)|location\.(?:href|pathname|search|hash|origin|hostname))\b/g, dlcm;
  while ((dlcm = docLocRe.exec(src)) !== null) {
    if (!docLocSeen[dlcm[1]] && docLocReads.length < 6) { docLocSeen[dlcm[1]] = true; docLocReads.push(dlcm[1]); }
  }

  var deRefs = [];
  var satRe = /_satellite\.getVar\s*\(\s*['"]([^'"]+)['"]\s*\)/g, sm;
  while ((sm = satRe.exec(src)) !== null) { if (deRefs.indexOf(sm[1]) === -1) deRefs.push(sm[1]); }
  var pctRe = /%([^%\s]{1,60})%/g, pm2;
  while ((pm2 = pctRe.exec(src)) !== null) { if (deRefs.indexOf(pm2[1]) === -1) deRefs.push(pm2[1]); }

  var urlParamKeys = [];
  var upRe = /(?:searchParams\.get|URLSearchParams[^)]*)\s*\(\s*['"]([^'"]{1,40})['"]\s*\)|\.get\s*\(\s*['"]([^'"]{1,40})['"]\s*\)/g, up;
  while ((up = upRe.exec(src)) !== null) {
    var upKey = up[1] || up[2];
    if (upKey && urlParamKeys.indexOf(upKey) === -1) urlParamKeys.push(upKey);
  }
  var hasUrlSearch = has(/location\.search/) && urlParamKeys.length === 0;

  var storageKeys = [];
  var stRe = /(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\s*\(\s*['"]([^'"]{1,60})['"]/g, st;
  while ((st = stRe.exec(src)) !== null) {
    var stEntry = (src.substring(st.index, st.index + 13).indexOf('session') >= 0 ? 'session' : 'local') + ':' + st[1];
    if (storageKeys.indexOf(stEntry) === -1) storageKeys.push(stEntry);
  }

  var cookieKeys = [];
  var ckRe = /getCookie\s*\(\s*['"]([^'"]{1,60})['"]\s*\)|cookie\.(?:get|read)\s*\(\s*['"]([^'"]{1,60})['"]/g, ck;
  while ((ck = ckRe.exec(src)) !== null) {
    var ckName = ck[1] || ck[2];
    if (ckName && cookieKeys.indexOf(ckName) === -1) cookieKeys.push(ckName);
  }
  var hasCookieRead = has(/document\.cookie/);

  var networkCalls = count(/\bfetch\s*\(|\bXMLHttpRequest\b|\.sendBeacon\s*\(/g);
  var returnCount = count(/\breturn\b/g);
  var firesEvent = has(/_satellite\.track\s*\(|_satellite\.notify\s*\(/);
  var satelliteTrackNames = [];
  var satTrackRe = /_satellite\.track\s*\(\s*['"]([^'"]+)['"]/g, stm;
  while ((stm = satTrackRe.exec(src)) !== null) satelliteTrackNames.push(stm[1]);

  // ---- PROSE SUMMARY ----
  var proseParts = [];
  if (ddPaths.length) proseParts.push('reads from the <strong>Adobe data layer</strong> (<code>digitalData</code>)');
  if (adlPaths.length) proseParts.push('reads from the <strong>ECMA data layer</strong> (<code>adobeDataLayer</code>)');
  if (dlPaths.length) proseParts.push('reads from <strong>dataLayer</strong>');
  if (winPaths.length) proseParts.push('reads from <strong>window</strong> globals');
  if (deRefs.length) {
    var depLabel = deRefs.length === 1 ? 'data element <code>' + esc(deRefs[0]) + '</code>' : deRefs.length + ' Tags data elements';
    proseParts.push('depends on ' + depLabel);
  }
  if (urlParamKeys.length) proseParts.push('extracts <code>' + urlParamKeys.slice(0,2).map(esc).join('</code>, <code>') + '</code> from the URL query string');
  else if (hasUrlSearch) proseParts.push('parses the URL query string');
  if (storageKeys.length) proseParts.push('reads from browser storage');
  if (hasCookieRead || cookieKeys.length) proseParts.push('reads browser cookies');
  if (docLocReads.length) proseParts.push('reads ' + docLocReads.slice(0,2).map(function(d){ return '<code>' + esc(d) + '</code>'; }).join(', '));
  if (networkCalls > 0) proseParts.push('makes ' + networkCalls + ' async network call' + (networkCalls > 1 ? 's' : ''));

  var outcomeParts = [];
  if (firesEvent) {
    outcomeParts.push(satelliteTrackNames.length ? 'fires satellite event <code>' + esc(satelliteTrackNames[0]) + '</code>' : 'fires a satellite event');
  }
  if (returnMatches.length) {
    var typeStr = (returnType !== 'unknown' && returnType !== 'value') ? ' (' + returnType + ')' : '';
    outcomeParts.push('returns a value' + typeStr);
  }

  var proseHtml;
  if (proseParts.length || outcomeParts.length) {
    var sentence = proseParts.length ? 'This code ' + proseParts.join(', ') : '';
    if (outcomeParts.length) sentence += (proseParts.length ? ', and ' : 'This code ') + outcomeParts.join(' and ');
    proseHtml = sentence + '.';
  } else {
    proseHtml = 'Custom code — no named data source patterns detected. Review the code above for logic details.';
  }

  // ---- DATA FLOW ----
  var flowSources = [];
  ddPaths.slice(0,4).forEach(function(p){ flowSources.push({ label: p, color: '#27c5c1', tag: 'digitalData' }); });
  adlPaths.slice(0,3).forEach(function(p){ flowSources.push({ label: p, color: '#3498db', tag: 'adobeDataLayer' }); });
  dlPaths.slice(0,3).forEach(function(p){ flowSources.push({ label: p, color: '#2ecc71', tag: 'dataLayer' }); });
  winPaths.slice(0,3).forEach(function(p){ flowSources.push({ label: p, color: '#8e44ad', tag: 'window' }); });
  deRefs.slice(0,4).forEach(function(r){ flowSources.push({ label: r, color: '#4e73df', tag: 'Tags DE' }); });
  urlParamKeys.slice(0,3).forEach(function(k){ flowSources.push({ label: '?' + k + '=', color: '#1abc9c', tag: 'URL param' }); });
  if (hasUrlSearch) flowSources.push({ label: 'location.search', color: '#1abc9c', tag: 'URL' });
  storageKeys.slice(0,3).forEach(function(k){ var p = k.split(':'); flowSources.push({ label: p[1], color: '#9b59b6', tag: p[0]+'Storage' }); });
  cookieKeys.slice(0,3).forEach(function(k){ flowSources.push({ label: k, color: '#e67e22', tag: 'cookie' }); });
  if (hasCookieRead && !cookieKeys.length) flowSources.push({ label: 'document.cookie', color: '#e67e22', tag: 'cookie' });
  docLocReads.slice(0,3).forEach(function(d){ flowSources.push({ label: d, color: '#95a5a6', tag: 'browser' }); });

  var retTypeColors = { string:'#27ae60', number:'#e67e22', boolean:'#e74c3c', object:'#3498db', array:'#1abc9c', Promise:'#f39c12', conditional:'#8e44ad', value:'#5a5c69', unknown:'#aaa' };

  // ---- DEBUG COMMANDS ----
  var debugCmds = [];
  ddPaths.slice(0,4).forEach(function(p){ debugCmds.push({ label: p, cmd: p }); });
  adlPaths.slice(0,3).forEach(function(p){ debugCmds.push({ label: p, cmd: p }); });
  dlPaths.slice(0,2).forEach(function(p){ debugCmds.push({ label: p, cmd: p }); });
  winPaths.slice(0,2).forEach(function(p){ debugCmds.push({ label: p, cmd: p }); });
  deRefs.slice(0,4).forEach(function(r){ debugCmds.push({ label: 'DE: '+r, cmd: '_satellite.getVar("'+r.replace(/"/g,'\\"')+'")' }); });
  urlParamKeys.slice(0,3).forEach(function(k){ debugCmds.push({ label: '?'+k+'=', cmd: 'new URLSearchParams(location.search).get("'+k.replace(/"/g,'\\"')+'")' }); });
  storageKeys.slice(0,3).forEach(function(k){ var p=k.split(':'); var store=p[0]==='session'?'sessionStorage':'localStorage'; debugCmds.push({ label: store+': '+p[1], cmd: store+'.getItem("'+p[1].replace(/"/g,'\\"')+'")' }); });
  cookieKeys.slice(0,3).forEach(function(k){ debugCmds.push({ label: 'cookie: '+k, cmd: 'document.cookie.split("; ").find(r=>r.startsWith("'+k.replace(/"/g,'\\"')+'="))?.split("=")[1]' }); });
  if (hasCookieRead && !cookieKeys.length) debugCmds.push({ label: 'All cookies', cmd: 'document.cookie' });
  docLocReads.slice(0,3).forEach(function(d){ debugCmds.push({ label: d, cmd: d }); });
  if (satelliteTrackNames.length) {
    satelliteTrackNames.slice(0,2).forEach(function(n){ debugCmds.push({ label: 'Listen for event: '+n, cmd: '// In DevTools: _satellite.monitor = { ruleTriggered: function(r){console.log(r.rule.name);} }' }); });
  }
  if (networkCalls > 0) debugCmds.push({ label: 'Network calls', cmd: '// Open DevTools \u2192 Network tab \u2192 reload to inspect outbound requests' });

  // ---- RISK FLAGS ----
  var risks = [];
  if (/\b\w+\.\w+\.\w+\.\w+/.test(src) && !has(/&&|\?\.|\?\?/)) {
    risks.push({ sev: 'error', icon: 'fa-exclamation-triangle', text: 'Deep property chain without null guards \u2014 throws <code>TypeError</code> if any level is <code>undefined</code>.', fix: 'Use optional chaining: <code>digitalData?.page?.pageInfo?.pageName</code>' });
  }
  if (!has(/\btry\s*\{/) && src.length > 80) {
    risks.push({ sev: 'warn', icon: 'fa-shield-alt', text: 'No <code>try/catch</code> \u2014 uncaught errors silently break this rule.', fix: 'Wrap in <code>try { \u2026 } catch(e) { /* handle */ }</code>' });
  }
  if (returnCount > 2) {
    risks.push({ sev: 'info', icon: 'fa-code-branch', text: returnCount + ' return paths \u2014 verify every branch returns the same type.', fix: 'Add a final <code>return undefined;</code> so no path falls through.' });
  }
  if (has(/\beval\s*\(/)) {
    risks.push({ sev: 'error', icon: 'fa-skull-crossbones', text: '<code>eval()</code> detected \u2014 blocked by CSP on most production pages.', fix: 'Replace with <code>JSON.parse()</code> or a safe dynamic function.' });
  }
  if (has(/document\.write\s*\(/)) {
    risks.push({ sev: 'error', icon: 'fa-ban', text: '<code>document.write()</code> breaks async pages and is deprecated.', fix: 'Use <code>document.createElement()</code> + <code>appendChild()</code>.' });
  }
  if (maybeMinified) {
    risks.push({ sev: 'info', icon: 'fa-compress-alt', text: 'Code appears minified \u2014 analysis may be incomplete.', fix: 'Use the Format button above to restore readability.' });
  }
  if (networkCalls > 0) {
    risks.push({ sev: 'warn', icon: 'fa-wifi', text: networkCalls + ' network call(s) \u2014 adds async latency to every rule firing.', fix: 'Cache the result in <code>sessionStorage</code>, or move I/O to a dedicated rule action.' });
  }
  if (has(/\bsetTimeout\s*\(|\bsetInterval\s*\(/)) {
    risks.push({ sev: 'warn', icon: 'fa-clock', text: 'Timer inside rule code \u2014 async delay may cause race conditions.', fix: 'Use a custom event rule to defer execution until the value is ready.' });
  }
  if (has(/console\.log\s*\(|console\.debug\s*\(/)) {
    risks.push({ sev: 'info', icon: 'fa-terminal', text: '<code>console.log</code>/<code>debug</code> found \u2014 remove before production.', fix: 'Guard with <code>if (window._debug) console.log(\u2026)</code> or remove.' });
  }

  // ---- BUILD HTML ----
  var sevBg = { error:'#fdecea', warn:'#fff8e1', info:'#f0f4ff' };
  var sevBorder = { error:'#f5c2be', warn:'#ffe082', info:'#c5d5f8' };
  var sevColor = { error:'#c0392b', warn:'#b7770d', info:'#3a5bc7' };
  var sevIconColor = { error:'#c0392b', warn:'#e67e22', info:'#4e73df' };

  var html = '';

  // Section 1: Prose
  html += '<div class="de-analysis-section">';
  html += '<div class="de-analysis-heading"><i class="fas fa-align-left"></i> What This Code Does</div>';
  html += '<p class="de-analysis-prose">' + proseHtml + '</p>';
  html += '</div>';

  // Section 2: Data Flow
  if (flowSources.length || returnMatches.length) {
    html += '<div class="de-analysis-section">';
    html += '<div class="de-analysis-heading"><i class="fas fa-exchange-alt"></i> Data Flow</div>';
    html += '<div class="de-analysis-flow">';

    html += '<div class="de-flow-col">';
    html += '<div class="de-flow-label">Reads from</div>';
    if (flowSources.length) {
      flowSources.forEach(function(fi){
        html += '<div class="de-flow-item" style="border-left:3px solid '+fi.color+'">';
        html += '<span class="de-flow-type" style="background:'+fi.color+'22;color:'+fi.color+'">'+esc(fi.tag)+'</span>';
        html += '<code>'+esc(fi.label)+'</code></div>';
      });
    } else {
      html += '<div class="de-flow-item de-flow-none">no named sources detected</div>';
    }
    html += '</div>';

    html += '<div class="de-flow-arrow"><i class="fas fa-arrow-right"></i></div>';

    html += '<div class="de-flow-col">';
    html += '<div class="de-flow-label">Returns / Fires</div>';
    if (firesEvent && satelliteTrackNames.length) {
      html += '<div class="de-flow-item" style="border-left:3px solid #e74c3c">';
      html += '<span class="de-flow-type" style="background:#e74c3c22;color:#e74c3c">event</span>';
      html += '<code>'+esc(satelliteTrackNames[0])+'</code></div>';
    }
    if (returnMatches.length) {
      var rtColor = retTypeColors[returnType] || '#5a5c69';
      if (returnType !== 'unknown' && returnType !== 'value') {
        html += '<div class="de-flow-item" style="border-left:3px solid '+rtColor+'">';
        html += '<span class="de-flow-type" style="background:'+rtColor+'22;color:'+rtColor+'">'+esc(returnType)+'</span></div>';
      }
      returnMatches.slice(0,2).forEach(function(r){
        html += '<div class="de-flow-item" style="border-left:3px solid #e3e6f0">';
        html += '<code class="de-flow-ret" title="'+esc(r)+'">'+esc(r)+'</code></div>';
      });
    } else if (!firesEvent) {
      html += '<div class="de-flow-item de-flow-none">void / side effects only</div>';
    }
    html += '</div>';

    html += '</div></div>';
  }

  // Section 3: Debug in Browser Console
  if (debugCmds.length) {
    html += '<div class="de-analysis-section">';
    html += '<div class="de-analysis-heading"><i class="fas fa-terminal"></i> Debug in Browser Console</div>';
    html += '<div class="de-debug-hint">Paste into DevTools Console on the target page to inspect each source live:</div>';
    html += '<div class="de-debug-list">';
    debugCmds.forEach(function(cmd){
      var isComment = cmd.cmd.charAt(0) === '/';
      html += '<div class="de-debug-cmd'+(isComment?' de-debug-cmd-comment':'')+'">';
      html += '<span class="de-debug-label" title="'+esc(cmd.label)+'">'+esc(cmd.label)+'</span>';
      html += '<div class="de-debug-code-wrap">';
      html += '<code class="de-debug-code">'+esc(cmd.cmd)+'</code>';
      if (!isComment) {
        html += '<button class="de-debug-copy" title="Copy to clipboard" type="button" onclick="(function(btn){var c=btn.closest(\'.de-debug-cmd\').querySelector(\'.de-debug-code\');var t=document.createElement(\'textarea\');t.value=c.textContent;document.body.appendChild(t);t.select();document.execCommand(\'copy\');document.body.removeChild(t);btn.innerHTML=\'<i class=\\"fas fa-check\\" style=\\"color:#27c5c1\\"></i>\';setTimeout(function(){btn.innerHTML=\'<i class=\\"fas fa-copy\\"></i>\';},1500);})(this)"><i class="fas fa-copy"></i></button>';
      }
      html += '</div></div>';
    });
    html += '</div></div>';
  }

  // Section 4: Risk Flags
  if (risks.length) {
    html += '<div class="de-analysis-section">';
    html += '<div class="de-analysis-heading" style="color:#c0392b"><i class="fas fa-exclamation-triangle"></i> Risk Flags</div>';
    risks.forEach(function(r){
      var bg = sevBg[r.sev]||'#f8f9fa', border = sevBorder[r.sev]||'#e3e6f0';
      var col = sevColor[r.sev]||'#5a5c69', ic = sevIconColor[r.sev]||'#5a5c69';
      html += '<div class="de-risk-item" style="background:'+bg+';border:1px solid '+border+';border-left:3px solid '+col+'">';
      html += '<div class="de-risk-text"><i class="fas '+r.icon+'" style="color:'+ic+';margin-right:6px"></i><span style="color:'+col+'">'+r.text+'</span></div>';
      if (r.fix) html += '<div class="de-risk-fix"><i class="fas fa-wrench" style="margin-right:5px;color:#888"></i>'+r.fix+'</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  if (!proseParts.length && !outcomeParts.length && !flowSources.length && !debugCmds.length && !risks.length) {
    html += '<p style="color:#888;font-style:italic;margin:0">No patterns detected. Code may be too minimal or use uncommon structures.</p>';
  }

  return html;
}

// Modal functions for displaying custom code
function showCodeModal(title, code) {
  const modal = document.getElementById('codeModal');
  const modalTitle = document.getElementById('modalTitle');
  const codeContent = document.getElementById('codeContent');
  const copyBtn = document.getElementById('modalCopyBtn');

  if (modal && modalTitle && codeContent) {
    modalTitle.textContent = title;
    var rawCode = code != null ? String(code) : '';

    // Strip CDN license comment lines and backtick URL lines.
    rawCode = rawCode
      .replace(/^\/\/[^\n]*assets\.adobedtm\.com[^\n]*/gm, '')
      .replace(/^`[^\n`]*assets\.adobedtm\.com[^\n`]*`\s*\.\s*/gm, '')
      .trim();
    // Only extract from __registerScript wrapper when the ENTIRE rawCode is that call
    // (anchored ^ and $). Uses ((?:[^\\]|\\.)*?) to correctly skip over escaped quotes.
    var wrapperMatch = rawCode.match(/^_satellite\.__registerScript\s*\([^,]+,\s*(["'`])((?:[^\\]|\\.)*?)\1\s*,?\s*\)\s*;?\s*$/);
    if (wrapperMatch && wrapperMatch[2]) {
      rawCode = wrapperMatch[2]
        .replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
        .trim();
    }

    // Detect a single-line URL reference (AppMeasurement / hosted custom code on Adobe CDN)
    var trimmedCode = rawCode.trim();
    var isSingleUrl = /^https?:\/\/\S+\.js$/.test(trimmedCode);
    if (isSingleUrl) {
      var fetchUrl = trimmedCode;
      // Show loading state immediately, open modal
      codeContent.textContent = 'Fetching source code from CDN…';
      modal.style.display = 'block';
      if (copyBtn) copyBtn._currentCode = fetchUrl;

      (async function () {
        var extracted = null;
        try {
          var res = await fetch(fetchUrl, { method: 'GET', mode: 'cors', headers: { 'Accept': 'text/plain,text/javascript,*/*' } });
          if (res.ok) {
            var text = await res.text();
            // Strip leading license/source-map comment lines referencing the CDN URL
            text = text.replace(/^\/\/[^\n]*assets\.adobedtm\.com[^\n]*\n?/gm, '').trim();
            // Try to pull the inner code from _satellite.__registerScript("RC...", "…escaped…")
            // Allow optional trailing comma before closing paren: __registerScript(url, 'code',)
            var m = text.match(/_satellite\.__registerScript\([^,]+,\s*(["'`])([\s\S]*?)\1\s*,?\s*\)/);
            if (m && m[2]) {
              extracted = m[2]
                .replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\'/g, "'")
                .replace(/\\\\/g, '\\').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
                .replace(/;\s*$/, '').trim();
            } else {
              // No wrapper — show raw content (could be a plain script)
              extracted = text.trim();
            }
          }
        } catch (e) { /* network error */ }

        if (!extracted) {
          // Could not fetch — fall back to info card showing the URL
          codeContent.innerHTML =
            '<div style="background:#fff8f0;border:1px solid #fcd5a0;border-radius:8px;padding:14px 16px;">' +
              '<div style="font-weight:700;font-size:13px;color:#7a3e00;margin-bottom:8px;"><i class="fas fa-link" style="margin-right:6px;color:#e07b00;"></i>Hosted source file (could not fetch)</div>' +
              '<div style="word-break:break-all;"><a href="' + fetchUrl + '" target="_blank" rel="noopener noreferrer" style="font-size:11.5px;color:#1a73e8;font-family:monospace;">' + fetchUrl + '</a></div>' +
            '</div>';
          var eb = document.getElementById('ruleCodeModalExplainBtn');
          if (eb) eb.style.display = 'none';
          return;
        }

        // We have real code — show it and let Prettier + Explain work normally
        var eb = document.getElementById('ruleCodeModalExplainBtn');
        if (eb) eb.style.display = '';
        if (copyBtn) copyBtn._currentCode = extracted;
        codeContent.textContent = extracted;
        if (typeof prettier !== 'undefined' && typeof prettierPlugins !== 'undefined') {
          try {
            var formatted = await prettier.format(extracted, {
              parser: 'babel',
              plugins: [prettierPlugins.babel, prettierPlugins.estree],
              printWidth: 80, tabWidth: 2, singleQuote: true, semi: true
            });
            codeContent.textContent = formatted.trim();
            if (copyBtn) copyBtn._currentCode = formatted.trim();
          } catch (e) { /* keep unformatted */ }
        }
      })();
      return;
    }

    // Restore Explain button for regular inline code
    var explainBtnRestore = document.getElementById('ruleCodeModalExplainBtn');
    if (explainBtnRestore) explainBtnRestore.style.display = '';

    codeContent.textContent = rawCode;
    modal.style.display = 'block';

    // Format with Prettier if available
    if (rawCode && typeof prettier !== 'undefined' && typeof prettierPlugins !== 'undefined') {
      var prettierOpts = {
        parser: 'babel',
        plugins: [prettierPlugins.babel, prettierPlugins.estree],
        printWidth: 80,
        tabWidth: 2,
        singleQuote: true,
        semi: true,
      };

      function applyFormatted(text) {
        codeContent.textContent = text;
        if (copyBtn) copyBtn._currentCode = text;
      }

      // Try formatting the whole string first; if it fails (e.g. combined multi-snippet
      // isn't valid standalone JS), format each snippet individually and recombine.
      prettier.format(rawCode, prettierOpts)
        .then(function (formatted) { applyFormatted(formatted.trim()); })
        .catch(function () {
          // Split on snippet header lines: /* ---- Label (N of M) ---- */
          var headerRe = /(\/\* ---- .+? ---- \*\/)/;
          var parts = rawCode.split(/\n(?=\/\* ---- )/);
          if (parts.length <= 1) {
            // Single snippet — try wrapping in parens as a last resort
            prettier.format('(' + rawCode + ');', prettierOpts)
              .then(function (f) {
                // strip the wrapping parens/semicolon Prettier adds
                applyFormatted(f.replace(/^\s*\(/, '').replace(/\);\s*$/, '').trim());
              })
              .catch(function () { /* keep raw */ });
            return;
          }
          // Multi-snippet: format each piece independently
          Promise.all(parts.map(function (part) {
            var m = part.match(/^(\/\* ---- .+? ---- \*\/\n?)([\s\S]*)$/);
            if (!m) return Promise.resolve(part.trim());
            var header = m[1];
            var snippet = m[2].trim();
            return prettier.format(snippet, prettierOpts)
              .then(function (f) { return header + f.trim(); })
              .catch(function () {
                // Last-resort: wrap in parens
                return prettier.format('(' + snippet + ');', prettierOpts)
                  .then(function (f) {
                    return header + f.replace(/^\s*\(/, '').replace(/\);\s*$/, '').trim();
                  })
                  .catch(function () { return header + snippet; });
              });
          })).then(function (formatted) {
            applyFormatted(formatted.join('\n\n'));
          });
        });
    }

    // Explain box — added dynamically once, reused on subsequent opens
    var modalBody = codeContent.parentElement;
    var explainBox = document.getElementById('ruleCodeModalExplainBox');
    if (!explainBox && modalBody) {
      explainBox = document.createElement('div');
      explainBox.id = 'ruleCodeModalExplainBox';
      explainBox.className = 'de-explain-panel';
      explainBox.style.marginTop = '12px';
      explainBox.style.display = 'none';
      modalBody.appendChild(explainBox);
    }

    // Explain button — inserted once before copy button
    var footer = copyBtn && copyBtn.parentElement ? copyBtn.parentElement : null;
    var explainBtn = document.getElementById('ruleCodeModalExplainBtn');
    if (!explainBtn && footer) {
      explainBtn = document.createElement('button');
      explainBtn.type = 'button';
      explainBtn.id = 'ruleCodeModalExplainBtn';
      explainBtn.className = 'btn-explain';
      explainBtn.innerHTML = '<i class="fas fa-lightbulb"></i> Explain';
      footer.insertBefore(explainBtn, copyBtn);
    }

    if (explainBtn) {
      explainBtn.onclick = async function () {
        if (!explainBox) return;
        if (window.TagScannerAuth && window.TagScannerAuth.requireExplainConsent) {
          var consented = await window.TagScannerAuth.requireExplainConsent();
          if (!consented) return;
        }
        explainBtn.disabled = true;
        var origHtml = explainBtn.innerHTML;
        explainBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing\u2026';
        try {
          // Try Bedrock proxy — require OAuth session
          var session = window.TagScannerAuth && window.TagScannerAuth.getSession();
          if (!session) {
            explainBox.innerHTML = [
              '<div style="padding:18px;text-align:center;background:#f8f9fc;border-radius:8px;border:1px solid #e5e7eb">',
              '<div style="font-size:15px;font-weight:600;color:#1f2937;margin-bottom:6px"><i class="fas fa-lock" style="margin-right:7px;color:#6b7280"></i>Sign in to use AI Explain</div>',
              '<div style="font-size:12px;color:#6b7280;margin-bottom:14px">A free account is required to use AI-powered features.</div>',
              '<button class="rule-explain-signin-btn" style="display:inline-flex;align-items:center;gap:8px;padding:8px 18px;background:#fff;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-weight:500;color:#374151;cursor:pointer">',
              '<svg width="16" height="16" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/></svg>',
              'Continue with Google</button>',
              '<div class="rule-explain-signin-error" style="display:none;margin-top:10px;font-size:12px;color:#ef4444"></div>',
              '</div>'
            ].join('');
            explainBox.style.display = 'block';
            explainBtn.disabled = false;
            explainBtn.innerHTML = origHtml;
            var signinBtn = explainBox.querySelector('.rule-explain-signin-btn');
            signinBtn.addEventListener('click', async function () {
              signinBtn.disabled = true;
              signinBtn.textContent = 'Signing in\u2026';
              try {
                session = await window.TagScannerAuth.signInWithGoogle();
                explainBox.innerHTML = '';
                explainBox.style.display = 'none';
                explainBtn.click();
              } catch (authErr) {
                var errDiv = explainBox.querySelector('.rule-explain-signin-error');
                if (errDiv) { errDiv.style.display = 'block'; errDiv.textContent = authErr.message || 'Sign-in failed. Please try again.'; }
                signinBtn.disabled = false;
                signinBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/></svg> Continue with Google';
              }
            });
            return;
          }
          if (window.TagScannerBedrock && window.TagScannerBedrock.explainCode) {
            try {
              var propKey = (sessionStorage.getItem('launch_property_name') || '') + '#' +
                            (sessionStorage.getItem('launch_property_environment') || 'Production');
              var brResult = await window.TagScannerBedrock.explainCode(
                rawCode, { name: title || '', type: 'rule' },
                { email: session.email, sessionToken: session.sessionToken, propertyKey: propKey }
              );
              explainBox.innerHTML = window.TagScannerBedrock.renderBedrockCodeExplanation(brResult.explanation);
              if (brResult.cached && brResult.cached_by) {
                var rCachedAt = brResult.cached_at ? new Date(brResult.cached_at).toLocaleString() : '';
                var rByStr    = brResult.cached_by.name || brResult.cached_by.email || 'unknown';
                var rNotice   = document.createElement('div');
                rNotice.style.cssText = 'display:flex;align-items:flex-start;gap:8px;background:#eff6ff;border:1px solid #bfdbfe;border-left:4px solid #3b82f6;border-radius:6px;padding:9px 12px;margin-bottom:12px;font-size:12px;color:#1e40af';
                rNotice.innerHTML = '<i class="fas fa-info-circle" style="font-size:13px;margin-top:1px;flex-shrink:0"></i><div><strong style="display:block;margin-bottom:2px">Cached Explanation</strong><span style="color:#374151">Generated on ' + rCachedAt + ' by ' + rByStr + '. Same code — no new AI call needed.</span></div>';
                explainBox.insertBefore(rNotice, explainBox.firstChild);
              }
              var rModelNote = document.createElement('div');
              rModelNote.style.cssText = 'margin-top:14px;padding-top:8px;border-top:1px solid #f3f4f6;font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:5px';
              rModelNote.innerHTML = '<i class="fas fa-microchip" style="font-size:10px;color:#c4b5fd"></i>Generated by <strong style="color:#6b7280;margin-left:3px">' + (brResult.model || 'Claude 3.5 Haiku') + '</strong>';
              explainBox.appendChild(rModelNote);
              explainBox.style.display = 'block';
              return;
            } catch(bedrockErr) {
              console.warn('Bedrock explain failed, falling back to static analysis:', bedrockErr);
              explainBox.innerHTML = '<div style="padding:8px;color:#ef4444;font-size:12px"><i class="fas fa-exclamation-circle" style="margin-right:5px"></i>' + (bedrockErr.message || 'AI explain failed') + '</div>';
              explainBox.style.display = 'block';
              return;
            }
          }
          // Fallback: Ollama / backend / static analysis
          var aiExplanation = null;
          if (typeof getAIExplanationOrNull === 'function') {
            aiExplanation = await getAIExplanationOrNull(rawCode, { title: title || '' });
          } else if (typeof explainCustomCodeWithAI === 'function') {
            var fallbackAI = await explainCustomCodeWithAI(rawCode, { title: title || '' });
            if (fallbackAI && fallbackAI.indexOf('AI explanation is unavailable') === -1) {
              aiExplanation = { text: fallbackAI, model: null };
            }
          }
          if (aiExplanation) {
            explainBox.innerHTML = '<pre class="code-block" style="margin:0;background:transparent;border:none;padding:0">' +
              aiExplanation.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
            if (aiExplanation.model) {
              var rAiModelNote = document.createElement('div');
              rAiModelNote.style.cssText = 'margin-top:14px;padding-top:8px;border-top:1px solid #f3f4f6;font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:5px';
              rAiModelNote.innerHTML = '<i class="fas fa-microchip" style="font-size:10px;color:#c4b5fd"></i>Generated by <strong style="color:#6b7280;margin-left:3px">' + aiExplanation.model + '</strong>';
              explainBox.appendChild(rAiModelNote);
            }
          } else {
            explainBox.innerHTML = analyzeCodeWithoutAI(rawCode);
          }
          explainBox.style.display = 'block';
        } finally {
          explainBtn.disabled = false;
          explainBtn.innerHTML = origHtml;
        }
      };
    }

    // Reset explain panel on each open
    if (explainBox) {
      explainBox.style.display = 'none';
      explainBox.innerHTML = '';
    }

    if (copyBtn) {
      copyBtn._currentCode = rawCode;
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

// Production Launch libraries often replace modulePath with a full Adobe CDN URL to an RC*-source.min.js bundle.
function hostBundleLabelFromModulePath(path) {
  if (!path || typeof path !== 'string') return null;
  if (!/^https?:\/\//i.test(path)) return null;
  var m = path.match(/\/(RC[a-f0-9]{32})-source/i);
  if (m) return 'Hosted component (RC ' + m[1].slice(0, 8) + '…)';
  if (/assets\.adobedtm\.com/i.test(path) || /assets\.adobe\.com/i.test(path)) return 'Hosted component (Adobe CDN)';
  return null;
}

// Replace long Adobe CDN URLs in settings JSON shown in modals (readable summary; full URL is still on the wire in the library).
function shortenAdobeCdnUrlsInObject(obj, depth) {
  if (depth == null) depth = 0;
  if (depth > 12 || obj == null) return obj;
  if (typeof obj === 'string') {
    if (/^https?:\/\//i.test(obj) && (/assets\.adobedtm\.com/i.test(obj) || /assets\.adobe\.com/i.test(obj))) {
      var m = obj.match(/(RC[a-f0-9]{32})/i);
      return m
        ? '[Adobe hosted script — RC ' + m[1].slice(0, 10) + '…]'
        : '[Adobe hosted script]';
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    var arr = [];
    for (var i = 0; i < obj.length; i++) arr.push(shortenAdobeCdnUrlsInObject(obj[i], depth + 1));
    return arr;
  }
  if (typeof obj === 'object') {
    var o = {};
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k))
        o[k] = shortenAdobeCdnUrlsInObject(obj[k], depth + 1);
    }
    return o;
  }
  return obj;
}

function settingsJsonForModal(settings) {
  if (!settings || typeof settings !== 'object') return '{}';
  try {
    return JSON.stringify(shortenAdobeCdnUrlsInObject(JSON.parse(JSON.stringify(settings))), null, 2);
  } catch (e) {
    return JSON.stringify(settings, null, 2);
  }
}

// ── Component label helpers (module-scope, shared by expand rows and detail modal) ──
function eventLabel(ev) {
  if (ev.modulePath && ev.modulePath.indexOf('directCall') !== -1) {
    return (ev.settings && ev.settings.identifier) ? 'Direct Call: ' + ev.settings.identifier : 'Direct Call';
  }
  if (ev.modulePath) {
    var hostedEv = hostBundleLabelFromModulePath(ev.modulePath);
    if (hostedEv) return hostedEv;
    return ev.modulePath.split('/').pop().replace('.js', '');
  }
  return ev.name || ev.type || 'Event';
}
function conditionLabel(c) {
  if (c.modulePath) {
    var hostedC = hostBundleLabelFromModulePath(c.modulePath);
    if (hostedC) return hostedC;
    return c.modulePath.split('/').pop().replace('.js', '');
  }
  return c.name || c.type || 'Condition';
}
function actionLabel(a) {
  if (!a.modulePath) return a.name || a.type || 'Action';
  var path = a.modulePath;
  var hostedA = hostBundleLabelFromModulePath(path);
  if (hostedA) return hostedA;
  var name = path.split('/').pop().replace('.js', '');
  if (name === 'index') {
    if (path.indexOf('adobe-alloy') !== -1) {
      if (path.indexOf('sendEvent') !== -1) return 'WebSDK Send Event';
      if (path.indexOf('sendBeacon') !== -1) return 'WebSDK Send Beacon';
      if (path.indexOf('setConsent') !== -1) return 'WebSDK Set Consent';
      if (path.indexOf('getData') !== -1) return 'WebSDK Get Data';
      if (path.indexOf('setCustomerIds') !== -1) return 'WebSDK Set Customer IDs';
      if (path.indexOf('setDebug') !== -1) return 'WebSDK Set Debug';
      if (path.indexOf('setIdentityMap') !== -1) return 'WebSDK Set Identity Map';
      if (path.indexOf('setVariables') !== -1) return 'WebSDK Set Variables';
      if (path.indexOf('updateVariables') !== -1) return 'WebSDK Update Variable';
    }
    if (path.indexOf('adobe-analytics') !== -1) {
      if (path.indexOf('setVariables') !== -1) return 'Set Variables';
      if (path.indexOf('updateVariables') !== -1) return 'Update Variables';
    }
    if (path.indexOf('sendEvent') !== -1) return 'Send Event';
    if (path.indexOf('sendBeacon') !== -1) return 'Send Beacon';
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

// ── Detail modal (shared across component types) ───────────────────────────
function initCompModal() {
  if (document.getElementById('comp-detail-modal')) return document.getElementById('comp-detail-modal');
  var overlay = document.createElement('div');
  overlay.id = 'comp-detail-modal';
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;align-items:center;justify-content:center;';
  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:10px;max-width:860px;width:93%;max-height:84vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.35);';
  var hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:14px 20px;background:#4e73df;border-radius:10px 10px 0 0;flex-shrink:0;gap:10px;';
  var tag = document.createElement('span');
  tag.id = 'cdm-type-tag';
  tag.style.cssText = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;background:rgba(255,255,255,0.22);color:white;padding:2px 9px;border-radius:10px;white-space:nowrap;';
  var titleText = document.createElement('span');
  titleText.id = 'cdm-title';
  titleText.style.cssText = 'color:white;font-size:15px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  var closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'background:none;border:none;color:white;font-size:26px;cursor:pointer;line-height:1;padding:0;opacity:0.8;flex-shrink:0;';
  closeBtn.textContent = '×';
  closeBtn.onclick = function () { overlay.style.display = 'none'; };
  hdr.appendChild(tag); hdr.appendChild(titleText); hdr.appendChild(closeBtn);
  var body = document.createElement('div');
  body.id = 'cdm-body';
  body.style.cssText = 'overflow-y:auto;padding:20px 24px;flex:1;';
  box.appendChild(hdr); box.appendChild(body);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.style.display = 'none'; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') overlay.style.display = 'none'; });
  return overlay;
}
function openCompModal(typeTag, name, buildFn) {
  var overlay = initCompModal();
  document.getElementById('cdm-type-tag').textContent = typeTag;
  document.getElementById('cdm-title').textContent = name;
  var body = document.getElementById('cdm-body');
  body.innerHTML = '';
  buildFn(body);
  overlay.style.display = 'flex';
}
function cdmSection(label, iconClass, accent) {
  var sec = document.createElement('div');
  sec.style.cssText = 'margin-bottom:20px;';
  var hdr = document.createElement('div');
  hdr.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:' + accent + ';margin-bottom:8px;display:flex;align-items:center;gap:6px;padding-bottom:5px;border-bottom:2px solid ' + accent + '33;';
  var ico = document.createElement('i'); ico.className = 'fas ' + iconClass;
  hdr.appendChild(ico); hdr.appendChild(document.createTextNode(' ' + label));
  sec.appendChild(hdr);
  return sec;
}
function cdmCard(label, extKey, code, order, onViewCode) {
  var card = document.createElement('div');
  card.style.cssText = 'background:#f8f9fa;border:1px solid #e3e6f0;border-radius:6px;padding:10px 14px;margin-bottom:6px;';
  var top = document.createElement('div');
  top.style.cssText = 'display:flex;align-items:center;gap:8px;';
  if (order !== undefined) {
    var badge = document.createElement('span');
    badge.style.cssText = 'background:#6c757d;color:#fff;border-radius:50%;width:19px;height:19px;line-height:19px;text-align:center;font-size:10px;font-weight:700;flex-shrink:0;display:inline-block;';
    badge.textContent = order;
    top.appendChild(badge);
  }
  var nameEl = document.createElement('span');
  nameEl.style.cssText = 'font-weight:600;font-size:13px;color:#2d3748;flex:1;';
  nameEl.textContent = label;
  top.appendChild(nameEl);
  if (onViewCode) {
    var codeBtn = document.createElement('button');
    codeBtn.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:4px;border:1px solid #4e73df;color:#4e73df;background:white;cursor:pointer;white-space:nowrap;';
    codeBtn.textContent = 'View Code';
    codeBtn.onclick = onViewCode;
    top.appendChild(codeBtn);
  }
  card.appendChild(top);
  if (extKey) {
    var meta = document.createElement('div');
    meta.style.cssText = 'font-size:11.5px;color:#6b7280;margin-top:3px;display:flex;align-items:center;gap:4px;';
    var ico = document.createElement('i'); ico.className = 'fas fa-puzzle-piece';
    meta.appendChild(ico); meta.appendChild(document.createTextNode(extKey));
    card.appendChild(meta);
  }
  if (code) {
    var pre = document.createElement('pre');
    pre.style.cssText = 'font-family:monospace;font-size:10.5px;background:#1e1e1e;color:#d4d4d4;padding:8px 10px;border-radius:4px;margin:8px 0 0;max-height:110px;overflow:auto;white-space:pre-wrap;word-break:break-word;';
    pre.textContent = code.length > 350 ? code.slice(0, 350) + '…' : code;
    card.appendChild(pre);
  }
  return card;
}
function cdmChips(items) {
  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:4px 0;';
  items.forEach(function (item) {
    var chip = document.createElement('span');
    chip.style.cssText = 'font-size:11.5px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:12px;padding:2px 10px;';
    chip.textContent = item;
    wrap.appendChild(chip);
  });
  return wrap;
}
function cdmEmpty(msg) {
  var p = document.createElement('p');
  p.style.cssText = 'color:#9ca3af;font-size:12px;font-style:italic;margin:4px 0 0;';
  p.textContent = msg || 'None';
  return p;
}

function showRuleModal(rule) {
  function extKey(comp) { return comp.modulePath ? comp.modulePath.split('/')[0] : ''; }
  function codeOf(comp) {
    var src = comp.settings && (comp.settings.source || comp.settings.code);
    return (src && typeof src === 'string') ? src.trim() : '';
  }
  openCompModal('Rule', rule.name || 'Unknown', function (body) {
    var sections = [
      { label: 'Events', arr: rule.events || [], icon: 'fa-bolt', accent: '#e53e3e', labelFn: eventLabel },
      { label: 'Conditions', arr: rule.conditions || [], icon: 'fa-filter', accent: '#d97706', labelFn: conditionLabel },
      { label: 'Actions', arr: rule.actions || [], icon: 'fa-cogs', accent: '#3b82f6', labelFn: actionLabel }
    ];
    sections.forEach(function (s) {
      var sec = cdmSection(s.label + ' (' + s.arr.length + ')', s.icon, s.accent);
      if (s.arr.length === 0) { sec.appendChild(cdmEmpty()); }
      s.arr.forEach(function (comp, i) {
        var code = codeOf(comp);
        sec.appendChild(cdmCard(
          s.labelFn(comp),
          extKey(comp),
          code,
          i + 1,
          code ? function (c, lbl) { return function () { showCodeModal(lbl, c); }; }(code, s.labelFn(comp)) : null
        ));
      });
      body.appendChild(sec);
    });
  });
}

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

    // Simplified one-line event summary (no raw container dump)
    function getEventSummary(ev) {
      if (!ev) return '';
      var typeLabel = eventLabel(ev);
      if (!ev.settings || typeof ev.settings !== 'object') return typeLabel;
      var s = ev.settings;
      if (ev.modulePath && ev.modulePath.indexOf('directCall') !== -1) {
        return s.identifier ? 'Direct Call: ' + s.identifier : 'Direct Call';
      }
      if (s.name && typeof s.name === 'string' && s.name.trim()) {
        return typeLabel + ': ' + s.name.trim();
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
      if (s.name && typeof s.name === 'string' && s.name.trim()) parts.push('Data element / key: ' + s.name.trim());
      return parts.join(' \u00B7 ');
    }

    function getConditionDetailText(cond) {
      if (!cond || !cond.settings) return '';
      var p = cond.settings;
      var path = (cond.modulePath || '').toLowerCase();
      if (path.indexOf('value-comparison') !== -1 || path.indexOf('valuecomparison') !== -1) {
        var left = p.leftOperand != null ? String(p.leftOperand) : (p.leftValue != null ? String(p.leftValue) : '');
        var right = p.rightOperand != null ? String(p.rightOperand) : (p.rightValue != null ? String(p.rightValue) : '');
        var op = (p.comparison && p.comparison.operator) ? p.comparison.operator : (p.comparisonOperator || p.operator || 'equals');
        if (!left && !right) return '';
        return left + ' \u2014 ' + op + (right ? ' \u2014 ' + right : '');
      }
      if (path.indexOf('/variable') !== -1 || path.indexOf('variable.js') !== -1) {
        var vn = p.name != null ? String(p.name) : '';
        var vv = p.value != null ? String(p.value) : '';
        if (vn || vv) return (vn ? vn : '?') + (p.negate ? ' (negated)' : '') + (vv !== '' ? ' = ' + vv : '');
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
            var settingsJson = settingsJsonForModal(ev.settings);
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
          var condDetail = getConditionDetailText(cond);
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
            var settingsJson = settingsJsonForModal(cond.settings);
            buttons.push({ className: 'btn-config', title: settingsTitle, ariaLabel: settingsTitle, iconClass: 'fa-search', onclick: (function (j, t) { return function () { showCodeModal(t, j); }; })(settingsJson, settingsTitle) });
          }
          addDetailBlock(section, lbl, condDetail, buttons);
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
          var actionDetail = getActionDetailText(action);
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
            var configJson = settingsJsonForModal(config);
            buttons.push({ className: 'btn-config', title: configTitle, ariaLabel: configTitle, iconClass: 'fa-file-code', onclick: (function (j, t) { return function () { showCodeModal(t, j); }; })(configJson, configTitle) });
          } else if (action.settings && Object.keys(action.settings).length > 0) {
            var settingsTitle = 'View action settings';
            var cleaned = cleanActionSettingsForDisplay(action.settings);
            var settingsJson = settingsJsonForModal(cleaned);
            buttons.push({ className: 'btn-config', title: settingsTitle, ariaLabel: settingsTitle, iconClass: 'fa-search', onclick: (function (j, t) { return function () { showCodeModal(t, j); }; })(settingsJson, settingsTitle) });
          }
          addDetailBlock(section, lbl, actionDetail, buttons);
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
