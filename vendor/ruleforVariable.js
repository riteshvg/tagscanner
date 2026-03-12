var rule_details_node = document.getElementById('rule_details');
var rule_title_node = document.getElementById('rule_title');
var summary_tab = document.getElementById('summary-tab');
var events_tab = document.getElementById('events-tab');
var actions_tab = document.getElementById('actions-tab');
var source = 'variable_mapping'; // Indicate this is from variable mapping

// Add console logs to verify tab containers are found
console.log('Summary tab found:', summary_tab);
console.log('Events tab found:', events_tab);
console.log('Actions tab found:', actions_tab);

// Add CSS styles for the actions table
(function addStyles() {
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    .actions-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 14px;
    }
    
    .actions-table th, .actions-table td {
      border: 1px solid #ddd;
      padding: 8px 12px;
      text-align: left;
    }
    
    .actions-table th {
      background-color: #f2f2f2;
      font-weight: bold;
    }
    
    .actions-table tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    
    .actions-table tr:hover {
      background-color: #f0f0f0;
    }
    
    .actions-table details {
      cursor: pointer;
    }
    
    .actions-table pre {
      max-width: 500px;
      max-height: 300px;
      overflow: auto;
      background-color: #f8f8f8;
      padding: 10px;
      border-radius: 4px;
      margin-top: 8px;
    }
    
    /* Syntax highlighting styles */
    .string { color: #008000; }
    .number { color: #0000ff; }
    .boolean { color: #b22222; }
    .null { color: #808080; }
    .key { color: #a52a2a; }
    
    /* Code copy button styles */
    .code-container {
      position: relative;
    }
    
    .copy-button {
      position: absolute;
      top: 5px;
      right: 5px;
      background-color: #f0f0f0;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 12px;
      cursor: pointer;
      z-index: 10;
      transition: background-color 0.2s;
    }
    
    .copy-button:hover {
      background-color: #e0e0e0;
    }
    
    .copy-button.copied {
      background-color: #4CAF50;
      color: white;
    }
    
    .code-label {
      display: block;
      font-weight: bold;
      margin-bottom: 5px;
      color: #666;
    }
    
    .custom-code-block {
      background-color: #272822;
      color: #f8f8f2;
      padding: 12px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      position: relative;
      max-height: 300px;
      overflow: auto;
      margin-top: 10px;
      line-height: 1.5;
    }
    
    .custom-code-block .js-keyword {
      color: #f92672;
      font-weight: bold;
    }
    
    .custom-code-block .js-string {
      color: #a6e22e;
    }
    
    .custom-code-block .js-comment {
      color: #75715e;
      font-style: italic;
    }
    
    .custom-code-block .js-number {
      color: #ae81ff;
    }
    
    .custom-code-block .js-function {
      color: #66d9ef;
      font-style: italic;
    }
    
    .custom-code-block .js-operator {
      color: #f92672;
    }
    
    .custom-code-block .js-variable {
      color: #f8f8f2;
    }
    
    /* Replace with CSS that allows full display: */
    .preview-value {
      white-space: pre-wrap;
      word-break: break-word;
      max-height: none;
      overflow: visible;
    }
  `;
  document.head.appendChild(styleElement);
})();

// Add loading indicator
function showLoading() {
  rule_details_node.innerHTML =
    '<div class="loading">Loading rule details...</div>';
}

function clearLoading() {
  // Find and remove the loading message if it exists
  const loadingElement = rule_details_node.querySelector('.loading');
  if (loadingElement) {
    loadingElement.remove();
  }
}

function showError(message) {
  rule_details_node.innerHTML = `<div class="error">${message}</div>`;
}

function syntaxHighlight(json) {
  if (typeof json != 'string') {
    json = JSON.stringify(json, undefined, 2);
  }
  json = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    function (match) {
      var cls = 'number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'key';
        } else {
          cls = 'string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'boolean';
      } else if (/null/.test(match)) {
        cls = 'null';
      }
      return '<span class="' + cls + '">' + match + '</span>';
    }
  );
}

/**
 * Extracts extension name from modulePath
 * @param {string} modulePath - The full module path
 * @returns {string} - Extension name
 */
function getExtensionFromPath(modulePath) {
  if (!modulePath) return 'Unknown';

  // Common patterns for extension extraction
  const patterns = [
    // Pattern for Adobe extensions like adobe-analytics, adobe-alloy
    /\/?(adobe-[^\/]+)\//i,
    // Pattern for core extension
    /\/?(core)\//i,
    // Fallback pattern to get first directory
    /\/([^\/]+)\//,
  ];

  for (const pattern of patterns) {
    const match = modulePath.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return 'Unknown';
}

/**
 * Gets action name from modulePath
 * @param {string} modulePath - The full module path
 * @returns {string} - Action name
 */
function getActionNameFromPath(modulePath) {
  if (!modulePath) return 'Unknown';

  // Check for specific Adobe Analytics actions first
  if (modulePath.includes('adobe-analytics/src/lib/actions/setVariables.js')) {
    return 'Set Variable';
  } else if (modulePath.includes('adobe-analytics/src/lib/actions/updateVariables.js')) {
    return 'Update Variable';
  } else if (modulePath.includes('adobe-analytics/src/lib/actions/sendBeacon.js')) {
    return 'Send Beacon';
  } else if (modulePath.includes('adobe-analytics/src/lib/actions/clearVariables.js')) {
    return 'Clear Variables';
  }

  // Extract the file name without extension
  const fileName = modulePath.split('/').pop().replace('.js', '');

  // Handle special cases for index.js files
  if (fileName === 'index') {
    if (modulePath.includes('setVariables')) {
      return 'Set Variable';
    } else if (modulePath.includes('updateVariables')) {
      return 'Update Variable';
    }
  }

  // Convert camelCase or kebab-case to readable format
  return fileName
    .replace(/([A-Z])/g, ' $1') // Convert camelCase
    .replace(/-/g, ' ') // Convert kebab-case
    .replace(/^./, function (str) {
      return str.toUpperCase();
    }); // Capitalize first letter
}

/**
 * Checks if a settings object contains custom JavaScript code
 * @param {Object} settings - The settings object to check
 * @returns {Object|null} - Object with code and path if found, null otherwise
 */
function findCustomCode(settings) {
  if (!settings) return null;

  // Common property names that might contain custom code
  const customCodeProps = [
    'source',
    'code',
    'script',
    'customCode',
    'javascript',
    'jsCode',
  ];

  // JavaScript identification patterns
  const jsPatterns = [
    /function\s+\w+\s*\(/i, // function declarations
    /\bvar\s+\w+/i, // var declarations
    /\blet\s+\w+/i, // let declarations
    /\bconst\s+\w+/i, // const declarations
    /return\s+[^;]*/i, // return statements
    /document\.\w+/i, // DOM manipulation
    /\$\(.*\)\.\w+/i, // jQuery
    /new\s+\w+\(/i, // constructor calls
    /if\s*\(.+\)\s*\{/i, // if statements
    /for\s*\(.+\)\s*\{/i, // for loops
    /while\s*\(.+\)\s*\{/i, // while loops
    /\[\w+\].forEach\(/i, // array methods
    /console\.log\(/i, // console logging
    /=>\s*\{/i, // arrow functions
  ];

  // Helper function to check if text is likely JavaScript
  function isLikelyJavaScript(text) {
    if (typeof text !== 'string') return false;

    // Quick check for common JS identifiers
    return jsPatterns.some((pattern) => pattern.test(text));
  }

  // Direct property check
  for (const prop of customCodeProps) {
    if (
      settings[prop] &&
      typeof settings[prop] === 'string' &&
      isLikelyJavaScript(settings[prop])
    ) {
      return {
        code: settings[prop],
        path: prop,
      };
    }
  }

  // Core custom code action from custom code extension
  if (
    settings.customCode &&
    typeof settings.customCode === 'string' &&
    isLikelyJavaScript(settings.customCode)
  ) {
    return {
      code: settings.customCode,
      path: 'customCode',
    };
  }

  // Check if there's a 'codeEditor' property that might contain 'source'
  if (
    settings.codeEditor &&
    settings.codeEditor.source &&
    typeof settings.codeEditor.source === 'string' &&
    isLikelyJavaScript(settings.codeEditor.source)
  ) {
    return {
      code: settings.codeEditor.source,
      path: 'codeEditor.source',
    };
  }

  // Recursive check in nested objects (one level deep for performance)
  for (const key in settings) {
    if (settings[key] && typeof settings[key] === 'object') {
      for (const prop of customCodeProps) {
        if (
          settings[key][prop] &&
          typeof settings[key][prop] === 'string' &&
          isLikelyJavaScript(settings[key][prop])
        ) {
          return {
            code: settings[key][prop],
            path: `${key}.${prop}`,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Apply syntax highlighting to JavaScript code
 * @param {string} code - The JavaScript code to highlight
 * @returns {string} - HTML with syntax highlighting
 */
function highlightJavaScript(code) {
  if (!code) return '';

  // Escape HTML entities first
  let highlightedCode = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Keywords
  const keywords = [
    'var',
    'let',
    'const',
    'function',
    'return',
    'if',
    'else',
    'for',
    'while',
    'do',
    'switch',
    'case',
    'break',
    'continue',
    'new',
    'try',
    'catch',
    'throw',
    'finally',
    'typeof',
    'instanceof',
    'in',
    'of',
    'class',
    'extends',
    'super',
    'import',
    'export',
    'default',
    'null',
    'undefined',
    'true',
    'false',
    'this',
    'async',
    'await',
    'yield',
  ];

  // Create a regex to match all keywords with word boundaries
  const keywordRegex = new RegExp('\\b(' + keywords.join('|') + ')\\b', 'g');

  // Apply highlighting
  highlightedCode = highlightedCode
    // Keywords
    .replace(keywordRegex, '<span class="js-keyword">$1</span>')

    // Strings (double quotes)
    .replace(/"([^"\\]|\\.)*"/g, '<span class="js-string">$&</span>')

    // Strings (single quotes)
    .replace(/'([^'\\]|\\.)*'/g, '<span class="js-string">$&</span>')

    // Template literals (backticks)
    .replace(/`([^`\\]|\\.)*`/g, '<span class="js-string">$&</span>')

    // Comments (single-line)
    .replace(/\/\/[^\n]*/g, '<span class="js-comment">$&</span>')

    // Comments (multi-line) - this is a simplification, might not work for all cases
    .replace(/\/\*[\s\S]*?\*\//g, '<span class="js-comment">$&</span>')

    // Numbers
    .replace(/\b(\d+(\.\d+)?)\b/g, '<span class="js-number">$1</span>')

    // Function calls
    .replace(
      /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
      '<span class="js-function">$1</span>('
    )

    // Operators (simplified)
    .replace(/([=+\-*/%<>&|!?:\.]+)/g, '<span class="js-operator">$1</span>');

  return highlightedCode;
}

/**
 * Creates a copy button for code
 * @param {string} code - The code to copy
 * @returns {HTMLButtonElement} - The copy button
 */
function createCopyButton(code) {
  const button = document.createElement('button');
  button.className = 'copy-button';
  button.textContent = 'Copy Code';

  button.addEventListener('click', function () {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        // Visual feedback
        button.textContent = 'Copied!';
        button.classList.add('copied');

        // Reset after 2 seconds
        setTimeout(() => {
          button.textContent = 'Copy Code';
          button.classList.remove('copied');
        }, 2000);
      })
      .catch((err) => {
        console.error('Failed to copy: ', err);
        button.textContent = 'Copy failed';

        // Reset after 2 seconds
        setTimeout(() => {
          button.textContent = 'Copy Code';
        }, 2000);
      });
  });

  return button;
}

// After the actions processing loop, add a dedicated function to process WebSDK components
// This will be a new function to be called during rule processing

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
    webSDKHeader.innerHTML = 'Web SDK - Update Variable (Data)';
    containerNode.appendChild(webSDKHeader);

    // Create container for the table
    var tableContainer = document.createElement('div');
    tableContainer.style.cssText = 'margin-bottom: 20px; padding: 0;';

    // Check for data configuration - prioritize 'data' property for this function
    let extractedData = null;

    // First check for 'data' property (this is typically for the first WebSDK action)
    if (action.settings.data) {
      let dataData = action.settings.data;
      
      if (typeof dataData === 'string' && dataData.includes('%')) {
        // Handle data element reference
        const dataElementName = dataData.replace(/%/g, '');
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
              
              // Add info about the data element source
              const infoElement = document.createElement('div');
              infoElement.style.cssText =
                'margin-bottom: 15px; padding: 10px; background-color: #f0f7ff; border-left: 4px solid #0066cc; border-radius: 4px;';
              infoElement.innerHTML = `<strong>Data Source:</strong> Data Element "${dataElementName}"`;
              containerNode.appendChild(infoElement);
            }
          }
        } catch (e) {
          console.error('Error extracting data element:', e);
        }
      } else {
        extractedData = dataData;
        
        // Add info about using data property
        const infoElement = document.createElement('div');
        infoElement.style.cssText =
          'margin-bottom: 15px; padding: 10px; background-color: #f0f7ff; border-left: 4px solid #0066cc; border-radius: 4px;';
        infoElement.innerHTML = `<strong>Data Source:</strong> Using "data" property`;
        containerNode.appendChild(infoElement);
      }
    }
    
    // If no data found, check for XDM property as fallback
    if (!extractedData && action.settings.xdm) {
      let xdmData = action.settings.xdm;
      
      if (typeof xdmData === 'string' && xdmData.includes('%')) {
        // Handle data element reference
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
              
              // Add info about the data element source
              const infoElement = document.createElement('div');
              infoElement.style.cssText =
                'margin-bottom: 15px; padding: 10px; background-color: #f0f7ff; border-left: 4px solid #0066cc; border-radius: 4px;';
              infoElement.innerHTML = `<strong>Data Source:</strong> Data Element "${dataElementName}" (XDM)`;
              containerNode.appendChild(infoElement);
            }
          }
        } catch (e) {
          console.error('Error extracting data element:', e);
        }
      } else {
        extractedData = xdmData;
        
        // Add info about using XDM property
        const infoElement = document.createElement('div');
        infoElement.style.cssText =
          'margin-bottom: 15px; padding: 10px; background-color: #f0f7ff; border-left: 4px solid #0066cc; border-radius: 4px;';
        infoElement.innerHTML = `<strong>Data Source:</strong> Using "xdm" property`;
        containerNode.appendChild(infoElement);
      }
    }

    // If we still have no data, just continue without showing an error message
    if (!extractedData) {
      // Don't show error message, just continue processing
    }

    // Create table for XDM paths
    var xdmTable = document.createElement('table');
    xdmTable.className = 'actions-table';

    // Create header row
    var headerRow = document.createElement('tr');
    ['XDM Path', 'Value Type', 'Preview', 'Actions'].forEach((header) => {
      var th = document.createElement('th');
      th.textContent = header;
      headerRow.appendChild(th);
    });
    xdmTable.appendChild(headerRow);

    // Function to process XDM paths recursively and add to table
    function addXDMPathsToTable(obj, parentPath = '') {
      if (!obj || typeof obj !== 'object') return;

      // Handle arrays and objects
      if (Array.isArray(obj)) {
        // For arrays, we'll show the length and allow expansion
        const row = document.createElement('tr');

        // Path cell
        const pathCell = document.createElement('td');
        pathCell.textContent = parentPath || 'root';
        row.appendChild(pathCell);

        // Type cell
        const typeCell = document.createElement('td');
        typeCell.textContent = 'Array[' + obj.length + ']';
        row.appendChild(typeCell);

        // Preview cell - show first few items
        const previewCell = document.createElement('td');
        if (obj.length > 0) {
          if (typeof obj[0] === 'object' && obj[0] !== null) {
            previewCell.textContent = '[Object]';
          } else {
            previewCell.textContent =
              JSON.stringify(obj.slice(0, 2)) + (obj.length > 2 ? '...' : '');
          }
        } else {
          previewCell.textContent = '[]';
        }
        row.appendChild(previewCell);

        // Actions cell
        const actionsCell = document.createElement('td');
        const viewButton = document.createElement('button');
        viewButton.textContent = 'View Full Path';
        viewButton.style.cssText =
          'padding: 3px 8px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; cursor: pointer;';
        viewButton.onclick = function () {
          showFullPathModal(parentPath, obj);
        };
        actionsCell.appendChild(viewButton);
        row.appendChild(actionsCell);

        xdmTable.appendChild(row);

        // Process array items separately (if not primitive)
        obj.forEach((item, index) => {
          if (item && typeof item === 'object') {
            addXDMPathsToTable(item, `${parentPath}[${index}]`);
          }
        });
      } else {
        // For objects, we'll add each property
        Object.keys(obj).forEach((key) => {
          const currentPath = parentPath ? `${parentPath}.${key}` : key;
          const value = obj[key];

          if (value === null || typeof value !== 'object') {
            // Add simple value row
            const row = document.createElement('tr');

            // Path cell
            const pathCell = document.createElement('td');
            pathCell.textContent = currentPath;
            row.appendChild(pathCell);

            // Type cell
            const typeCell = document.createElement('td');
            typeCell.textContent = value === null ? 'null' : typeof value;
            row.appendChild(typeCell);

            // Preview cell
            const previewCell = document.createElement('td');
            previewCell.textContent = value;
            row.appendChild(previewCell);

            // Actions cell
            const actionsCell = document.createElement('td');
            const copyButton = document.createElement('button');
            copyButton.textContent = 'Copy Path';
            copyButton.style.cssText =
              'padding: 3px 8px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; cursor: pointer; margin-right: 5px;';
            copyButton.onclick = function () {
              navigator.clipboard.writeText(currentPath);
              copyButton.textContent = 'Copied!';
              setTimeout(() => {
                copyButton.textContent = 'Copy Path';
              }, 1500);
            };
            actionsCell.appendChild(copyButton);
            row.appendChild(actionsCell);

            xdmTable.appendChild(row);
          } else {
            // Add nested object row
            const row = document.createElement('tr');

            // Path cell
            const pathCell = document.createElement('td');
            pathCell.textContent = currentPath;
            row.appendChild(pathCell);

            // Type cell
            const typeCell = document.createElement('td');
            typeCell.textContent = Array.isArray(value) ? 'Array' : 'Object';
            row.appendChild(typeCell);

            // Preview cell
            const previewCell = document.createElement('td');
            if (Array.isArray(value)) {
              previewCell.textContent = `[${value.length} items]`;
            } else {
              const keys = Object.keys(value);
              previewCell.textContent = `{${keys.slice(0, 3).join(', ')}${
                keys.length > 3 ? '...' : ''
              }}`;
            }
            row.appendChild(previewCell);

            // Actions cell
            const actionsCell = document.createElement('td');
            const viewButton = document.createElement('button');
            viewButton.textContent = 'View Full Path';
            viewButton.style.cssText =
              'padding: 3px 8px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; cursor: pointer;';
            viewButton.onclick = function () {
              showFullPathModal(currentPath, value);
            };
            actionsCell.appendChild(viewButton);
            row.appendChild(actionsCell);

            xdmTable.appendChild(row);

            // Recursively process nested objects
            addXDMPathsToTable(value, currentPath);
          }
        });
      }
    }

    // Function to show modal with full path data
    function showFullPathModal(path, data) {
      const modal = document.createElement('div');
      modal.style.cssText =
        'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000; display: flex; justify-content: center; align-items: center;';

      const content = document.createElement('div');
      content.style.cssText =
        'background: white; padding: 20px; border-radius: 5px; max-width: 80%; max-height: 80%; overflow: auto; position: relative;';

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      closeBtn.style.cssText =
        'position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 20px; cursor: pointer;';
      closeBtn.onclick = function () {
        document.body.removeChild(modal);
      };

      const title = document.createElement('h4');
      title.textContent = 'Full XDM Path: ' + path;

      const pre = document.createElement('pre');
      pre.innerHTML = syntaxHighlight(JSON.stringify(data, null, 2));
      pre.style.cssText = 'max-height: 60vh; overflow: auto;';

      content.appendChild(closeBtn);
      content.appendChild(title);
      content.appendChild(pre);
      modal.appendChild(content);
      document.body.appendChild(modal);
    }

    // Process XDM object
    addXDMPathsToTable(extractedData);

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

/**
 * Processes Adobe Analytics data and displays it in a table format
 * @param {Object} action - The Analytics action object
 * @param {Element} containerNode - The DOM node to append content to
 */
function processAnalyticsComponent(action, containerNode) {
  // Skip certain Analytics actions
  if (
    action.modulePath &&
    (action.modulePath.includes(
      'adobe-analytics/src/lib/actions/sendBeacon.js'
    ) ||
      action.modulePath.includes(
        'adobe-analytics/src/lib/actions/clearVariables.js'
      ))
  ) {
    return;
  }

  // Continue with existing processing
  const actionDiv = document.createElement('div');
  actionDiv.className = 'analytics-action';
  actionDiv.style.marginBottom = '20px';

  if (!action || !action.settings || !action.settings.trackerProperties) {
    return; // No Analytics data to process
  }

  try {
    var analyticsHeader = document.createElement('h3');
    analyticsHeader.innerHTML = 'Adobe Analytics';
    containerNode.appendChild(analyticsHeader);

    var table = document.createElement('table');
    table.className = 'actions-table';
    var tr_default = document.createElement('tr');
    var th_evar_default = document.createElement('th');
    th_evar_default.innerHTML = 'eVars';
    var th_prop_default = document.createElement('th');
    th_prop_default.innerHTML = 'prop';
    var th_events_default = document.createElement('th');
    th_events_default.innerHTML = 'events';

    tr_default.appendChild(th_evar_default);
    tr_default.appendChild(th_prop_default);
    tr_default.appendChild(th_events_default);
    table.appendChild(tr_default);

    var tr = document.createElement('tr');
    var th_evar = document.createElement('td');
    var th_prop = document.createElement('td');
    var th_events = document.createElement('td');

    // Handle eVars
    if (action.settings.trackerProperties.eVars) {
      let evar_list = action.settings.trackerProperties.eVars;
      for (let ie = 0; ie < evar_list.length; ie++) {
        var evar_list_value = document.createElement('p');
        evar_list_value.innerHTML =
          evar_list[ie].name + '=' + evar_list[ie].value;
        evar_list_value.style.margin = '5px 0';
        th_evar.appendChild(evar_list_value);
      }
    } else {
      th_evar.innerHTML = 'N/A';
    }
    tr.appendChild(th_evar);

    // Handle props
    if (action.settings.trackerProperties.props) {
      let prop_list = action.settings.trackerProperties.props;
      for (let ie = 0; ie < prop_list.length; ie++) {
        var prop_list_value = document.createElement('p');
        prop_list_value.innerHTML =
          prop_list[ie].name + '=' + prop_list[ie].value;
        prop_list_value.style.margin = '5px 0';
        th_prop.appendChild(prop_list_value);
      }
    } else {
      th_prop.innerHTML = 'N/A';
    }
    tr.appendChild(th_prop);

    // Handle events
    if (action.settings.trackerProperties.events) {
      let event_list = action.settings.trackerProperties.events;
      for (let ie = 0; ie < event_list.length; ie++) {
        var event_list_value = document.createElement('p');
        event_list_value.innerHTML = event_list[ie].name.replaceAll('%', '');
        event_list_value.style.margin = '5px 0';
        th_events.appendChild(event_list_value);
      }
    } else {
      th_events.innerHTML = 'N/A';
    }
    tr.appendChild(th_events);
    table.appendChild(tr);

    containerNode.appendChild(table);
  } catch (e) {
    console.error('Error processing Analytics data:', e);
    const errorMsg = document.createElement('div');
    errorMsg.className = 'error';
    errorMsg.textContent = 'Error processing Analytics data: ' + e.message;
    containerNode.appendChild(errorMsg);
  }
}

// Add a function to ensure tabs are properly initialized
function initializeTabs() {
  // Make sure tab switching works
  document.querySelectorAll('.tab-button').forEach((button) => {
    button.addEventListener('click', () => {
      console.log('Tab clicked:', button.getAttribute('data-tab'));

      // Remove active class from all buttons and content
      document.querySelectorAll('.tab-button').forEach((btn) => {
        btn.classList.remove('active');
      });
      document.querySelectorAll('.tab-content').forEach((content) => {
        content.classList.remove('active');
      });

      // Add active class to clicked button and corresponding content
      button.classList.add('active');
      const tabName = button.getAttribute('data-tab');
      const tabContent = document.getElementById(`${tabName}-tab`);
      if (tabContent) {
        tabContent.classList.add('active');
        console.log(`Activated tab: ${tabName}`);
      } else {
        console.error(`Tab content not found for: ${tabName}`);
      }
    });
  });
}

// Call the initialization function once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeTabs);

// Make sure all tab containers are correctly set up with proper CSS
function ensureTabsVisible() {
  // Make sure all tab content divs have the correct styling
  if (summary_tab)
    summary_tab.style.display = summary_tab.classList.contains('active')
      ? 'block'
      : 'none';
  if (events_tab)
    events_tab.style.display = events_tab.classList.contains('active')
      ? 'block'
      : 'none';
  if (actions_tab)
    actions_tab.style.display = actions_tab.classList.contains('active')
      ? 'block'
      : 'none';
}

// Add a direct function to switch tabs programmatically
function switchToTab(tabName) {
  console.log(`Programmatically switching to tab: ${tabName}`);

  // Get the tab button
  const tabButton = document.querySelector(
    `.tab-button[data-tab="${tabName}"]`
  );
  if (!tabButton) {
    console.error(`Tab button not found for: ${tabName}`);
    return;
  }

  // Remove active class from all buttons and content
  document.querySelectorAll('.tab-button').forEach((btn) => {
    btn.classList.remove('active');
  });
  document.querySelectorAll('.tab-content').forEach((content) => {
    content.classList.remove('active');
    content.style.display = 'none';
  });

  // Add active class to button and show content
  tabButton.classList.add('active');
  const tabContent = document.getElementById(`${tabName}-tab`);
  if (tabContent) {
    tabContent.classList.add('active');
    tabContent.style.display = 'block';
    console.log(`Tab ${tabName} activated`);
  } else {
    console.error(`Tab content not found for: ${tabName}`);
  }
}

// Self-executing function to contain all the main logic
(function () {
  if (rule_details_node) {
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
          p.innerHTML =
            'Rule Name: ' +
            obj[i].name +
            ' <span style="font-size: 16px; color: #666; font-weight: normal;">(Variable Mapping View)</span>';
          rule_title_node.appendChild(p);

          // --- SUMMARY TAB CONTENT ---

          // Create the summary content
          var summaryContent = document.createElement('div');
          summaryContent.className = 'rule-summary';
          summaryContent.style.cssText =
            'background-color: #f8f8f8; padding: 15px; border-radius: 5px;';

          // Calculate rule size
          const ruleSize = new Blob([JSON.stringify(obj[i])]).size;
          const ruleSizeKB = (ruleSize / 1024).toFixed(2);

          // Count events, conditions, and actions
          const eventCount = obj[i].events ? obj[i].events.length : 0;
          const conditionCount = obj[i].conditions
            ? obj[i].conditions.length
            : 0;
          const actionCount = obj[i].actions ? obj[i].actions.length : 0;

          // List extensions used
          const extensionsUsed = new Set();

          // Add extensions from events
          if (obj[i].events) {
            obj[i].events.forEach((event) => {
              const extension = getExtensionFromPath(event.modulePath);
              if (extension !== 'Unknown') {
                extensionsUsed.add(extension);
              }
            });
          }

          // Add extensions from conditions
          if (obj[i].conditions) {
            obj[i].conditions.forEach((condition) => {
              const extension = getExtensionFromPath(condition.modulePath);
              if (extension !== 'Unknown') {
                extensionsUsed.add(extension);
              }
            });
          }

          // Add extensions from actions
          if (obj[i].actions) {
            obj[i].actions.forEach((action) => {
              const extension = getExtensionFromPath(action.modulePath);
              if (extension !== 'Unknown') {
                extensionsUsed.add(extension);
              }
            });
          }

          // Create summary HTML
          summaryContent.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
              <div>
                <strong>Size:</strong> ${ruleSizeKB} KB
              </div>
              <div>
                <strong>Events:</strong> ${eventCount}
              </div>
              <div>
                <strong>Conditions:</strong> ${conditionCount}
              </div>
              <div>
                <strong>Actions:</strong> ${actionCount}
              </div>
              <div style="grid-column: 1 / -1;">
                <strong>Extensions Used:</strong> ${
                  Array.from(extensionsUsed).join(', ') || 'None'
                }
              </div>
              <div style="grid-column: 1 / -1;">
                <strong>Last Viewed:</strong> <span id="last-viewed-time">${new Date().toLocaleString()}</span>
              </div>
            </div>
            
            <!-- Add a JSON view of the rule -->
            <div style="margin-top: 20px;">
              <details>
                <summary style="cursor:pointer; font-weight:bold;">View Rule JSON</summary>
                <pre style="margin-top: 10px; max-height: 300px; overflow: auto;">${syntaxHighlight(
                  JSON.stringify(obj[i], null, 2)
                )}</pre>
              </details>
            </div>
          `;

          // Add the summary content to the summary tab
          summary_tab.appendChild(summaryContent);

          // --- EVENTS TAB CONTENT ---

          // Display Events section
          if (obj[i].events && obj[i].events.length > 0) {
            var eventsHeader = document.createElement('h3');
            eventsHeader.innerHTML = 'Events';
            events_tab.appendChild(eventsHeader);

            var eventsTable = document.createElement('table');
            eventsTable.className = 'actions-table';

            // Create header row
            var headerRow = document.createElement('tr');
            // Remove module path from headers
            ['Extension', 'Event Type', 'Settings'].forEach((header) => {
              var th = document.createElement('th');
              th.textContent = header;
              headerRow.appendChild(th);
            });
            eventsTable.appendChild(headerRow);

            // Add each event as a row
            for (let j = 0; j < obj[i].events.length; j++) {
              const event = obj[i].events[j];
              var eventRow = document.createElement('tr');

              // Extension cell
              var extensionCell = document.createElement('td');
              extensionCell.textContent = getExtensionFromPath(
                event.modulePath
              );
              eventRow.appendChild(extensionCell);

              // Event type cell
              var eventTypeCell = document.createElement('td');
              eventTypeCell.textContent = getActionNameFromPath(
                event.modulePath
              );
              eventRow.appendChild(eventTypeCell);

              // Create a table for the event settings
              if (event.settings) {
                const settingsKeys = Object.keys(event.settings);
                if (
                  settingsKeys.length === 1 &&
                  typeof event.settings[settingsKeys[0]] !== 'object'
                ) {
                  // If there's only one setting and it's not an object, display it directly
                  const settingValue = event.settings[settingsKeys[0]];
                  eventRow.innerHTML += `<br><strong>${settingsKeys[0]}:</strong> ${settingValue}`;
                } else {
                  // Create expandable settings section for multiple settings or object values
                  const settingsDetails = document.createElement('details');
                  const settingsSummary = document.createElement('summary');
                  settingsSummary.textContent = 'Settings';
                  settingsDetails.appendChild(settingsSummary);

                  const settingsTable = document.createElement('table');
                  settingsTable.className = 'settings-table';
                  settingsTable.style.width = '100%';
                  settingsTable.style.marginTop = '10px';

                  for (const key in event.settings) {
                    const row = settingsTable.insertRow();
                    const keyCell = row.insertCell(0);
                    const valueCell = row.insertCell(1);

                    keyCell.textContent = key;
                    keyCell.style.width = '200px';
                    keyCell.style.fontWeight = 'bold';

                    const value = event.settings[key];
                    if (typeof value === 'object' && value !== null) {
                      valueCell.innerHTML = `<pre>${syntaxHighlight(
                        JSON.stringify(value, null, 2)
                      )}</pre>`;
                    } else {
                      valueCell.textContent = value;
                    }
                  }

                  settingsDetails.appendChild(settingsTable);
                  eventRow.appendChild(settingsDetails);
                }
              }

              eventsTable.appendChild(eventRow);
            }
            events_tab.appendChild(eventsTable);
          } else {
            var noEventsMsg = document.createElement('p');
            noEventsMsg.textContent = 'No events defined for this rule.';
            events_tab.appendChild(noEventsMsg);
          }

          // --- ACTIONS TAB CONTENT ---

          // Display Actions section
          if (obj[i].actions && obj[i].actions.length > 0) {
            var actionsHeader = document.createElement('h3');
            actionsHeader.innerHTML = 'Actions';
            actions_tab.appendChild(actionsHeader);

            var actionsTable = document.createElement('table');
            actionsTable.className = 'actions-table';

            // Create header row
            var headerRow = document.createElement('tr');
            ['Extension', 'Action', 'Module Path', 'Source/Settings'].forEach(
              (header) => {
                var th = document.createElement('th');
                th.textContent = header;
                headerRow.appendChild(th);
              }
            );
            actionsTable.appendChild(headerRow);

            // Add each action as a row
            for (let j = 0; j < obj[i].actions.length; j++) {
              const action = obj[i].actions[j];
              var actionRow = document.createElement('tr');

              // Extension cell
              var extensionCell = document.createElement('td');
              extensionCell.textContent = getExtensionFromPath(
                action.modulePath
              );
              actionRow.appendChild(extensionCell);

              // Action name cell
              var actionNameCell = document.createElement('td');
              actionNameCell.textContent = getActionNameFromPath(
                action.modulePath
              );
              actionRow.appendChild(actionNameCell);

              // Module path cell
              var modulePathCell = document.createElement('td');
              modulePathCell.textContent = action.modulePath;
              actionRow.appendChild(modulePathCell);

              // Special handling for different action types based on module path
              var sourceCell = document.createElement('td');

              if (action.modulePath.includes('adobe-analytics/')) {
                processAnalyticsComponent(action, sourceCell);
              } else if (action.modulePath.includes('adobe-alloy/')) {
                processWebSDKComponent(action, sourceCell);
              } else if (action.settings) {
                // Default handling for other action types
                var details = document.createElement('details');
                var summary = document.createElement('summary');
                summary.textContent = 'View Settings';
                details.appendChild(summary);

                // Check for custom code
                const customCodeInfo = findCustomCode(action.settings);
                if (customCodeInfo) {
                  const codeContainer = document.createElement('div');
                  codeContainer.className = 'code-container';

                  const codeLabel = document.createElement('span');
                  codeLabel.textContent = 'Custom Code:';
                  codeLabel.style.fontWeight = 'bold';
                  codeContainer.appendChild(codeLabel);

                  const codeContent = document.createElement('div');
                  codeContent.innerHTML = highlightJavaScript(
                    customCodeInfo.code
                  );
                  codeContent.className = 'code-content';
                  codeContainer.appendChild(codeContent);

                  // Add copy button
                  const copyButton = createCopyButton(customCodeInfo.code);
                  codeContainer.appendChild(copyButton);

                  details.appendChild(codeContainer);
                } else {
                  // Format the JSON with syntax highlighting
                  var pre = document.createElement('pre');
                  pre.innerHTML = syntaxHighlight(
                    JSON.stringify(action.settings, null, 2)
                  );
                  details.appendChild(pre);
                }
                sourceCell.appendChild(details);
              } else {
                sourceCell.textContent = 'No settings';
              }
              actionRow.appendChild(sourceCell);

              actionsTable.appendChild(actionRow);
            }
            actions_tab.appendChild(actionsTable);
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

      // Show "No Data" message if no rule was found or no tables present
      if (!ruleFound || document.querySelectorAll('table').length < 1) {
        if (rule_details_node.childElementCount === 0) {
          var p = document.createElement('h4');
          p.innerHTML = ruleFound ? 'No Data' : 'Rule not found';
          rule_details_node.appendChild(p);
        }
      }

      // After all content is loaded, ensure tabs are visible
      ensureTabsVisible();

      // After we're done adding all content to the tabs, force a refresh of the tab display
      setTimeout(() => {
        // Force the active tab to refresh
        const activeTab = document.querySelector('.tab-button.active');
        if (activeTab) {
          const tabName = activeTab.getAttribute('data-tab');
          switchToTab(tabName);
          console.log('Refreshed active tab:', tabName);
        } else {
          // Default to summary tab if none is active
          switchToTab('summary');
          console.log('Defaulted to summary tab');
        }

        // Log the content of each tab for debugging
        console.log('Summary tab content:', summary_tab.innerHTML);
        console.log('Events tab content:', events_tab.innerHTML);
        console.log('Actions tab content:', actions_tab.innerHTML);
      }, 100);
    } catch (e) {
      console.error('Error processing rule:', e);
      showError('Error processing rule: ' + e.message);
    }
  }
})();
