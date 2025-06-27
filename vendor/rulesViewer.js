// Function to extract rules directly
function extractRules() {
  try {
    const rulesValue = sessionStorage.getItem('_satellite._container.rules');

    if (!rulesValue) {
      console.error('Rules data not found in sessionStorage');
      return null;
    }

    return JSON.parse(rulesValue);
  } catch (error) {
    console.error('Error extracting rules:', error);
    return null;
  }
}

// Mock data for testing
const mockRules = [
  {
    id: 'RL1234',
    name: 'Page Load Rule',
    enabled: true,
    events: [{ type: 'pageBottom' }],
    actions: [{ type: 'customCode' }, { type: 'setVariable' }],
  },
  {
    id: 'RL5678',
    name: 'Click Tracking',
    enabled: true,
    events: [{ type: 'click' }],
    actions: [{ type: 'trackEvent' }],
  },
  {
    id: 'RL9012',
    name: 'Form Submit',
    enabled: false,
    events: [{ type: 'submit' }],
    actions: [],
  },
];

// Function to display the rules in the DOM
function displayRules(useMockData = false) {
  const statusElement = document.getElementById('status');
  const outputElement = document.getElementById('rulesOutput');
  const tableBodyElement = document.getElementById('rulesTableBody');
  const debugElement = document.getElementById('debugContent');

  // Clear previous output
  statusElement.innerHTML = '';
  statusElement.className = '';
  outputElement.innerHTML = '';
  tableBodyElement.innerHTML = '';
  debugElement.innerHTML = '';

  // Get the rules
  let rules;
  if (useMockData) {
    rules = mockRules;
    debugElement.innerHTML += '<p><strong>Using mock data</strong></p>';
  } else {
    // Try to get rules from sessionStorage
    try {
      const rulesValue = sessionStorage.getItem('_satellite._container.rules');
      debugElement.innerHTML +=
        '<p>SessionStorage keys: ' +
        Object.keys(sessionStorage).join(', ') +
        '</p>';

      if (rulesValue) {
        debugElement.innerHTML += '<p>Raw rules value exists: Yes</p>';
        debugElement.innerHTML +=
          '<p>Raw rules value length: ' + rulesValue.length + '</p>';
        debugElement.innerHTML +=
          '<p>First 100 chars: ' +
          rulesValue
            .substring(0, 100)
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;') +
          '...</p>';

        try {
          rules = JSON.parse(rulesValue);
          debugElement.innerHTML += '<p>Successfully parsed JSON</p>';
        } catch (parseError) {
          debugElement.innerHTML +=
            '<p>Error parsing JSON: ' + parseError.message + '</p>';
          rules = null;
        }
      } else {
        debugElement.innerHTML += '<p>Raw rules value exists: No</p>';
        rules = null;
      }
    } catch (error) {
      debugElement.innerHTML +=
        '<p>Error accessing sessionStorage: ' + error.message + '</p>';
      rules = null;
    }
  }

  // Debug info about rules object
  if (rules === null) {
    debugElement.innerHTML += '<p>Rules object: null</p>';
  } else {
    debugElement.innerHTML += '<p>Rules object type: ' + typeof rules + '</p>';

    if (Array.isArray(rules)) {
      debugElement.innerHTML += '<p>Is array: Yes</p>';
      debugElement.innerHTML += '<p>Array length: ' + rules.length + '</p>';
      if (rules.length > 0) {
        debugElement.innerHTML +=
          '<p>First item type: ' + typeof rules[0] + '</p>';
        debugElement.innerHTML +=
          '<p>First item keys: ' + Object.keys(rules[0]).join(', ') + '</p>';
      }
    } else if (typeof rules === 'object') {
      debugElement.innerHTML += '<p>Is array: No</p>';
      const keys = Object.keys(rules);
      debugElement.innerHTML += '<p>Object keys: ' + keys.join(', ') + '</p>';

      if (keys.length > 0) {
        const firstKey = keys[0];
        debugElement.innerHTML +=
          '<p>First property type: ' + typeof rules[firstKey] + '</p>';
        if (typeof rules[firstKey] === 'object' && rules[firstKey] !== null) {
          debugElement.innerHTML +=
            '<p>First property keys: ' +
            Object.keys(rules[firstKey]).join(', ') +
            '</p>';
        }
      }
    }
  }

  if (rules) {
    // Success - display the rules
    statusElement.innerHTML =
      'Rules successfully retrieved' +
      (useMockData ? ' (MOCK DATA)' : '') +
      '!';
    statusElement.className = 'success';

    // Format the rules object as a pretty-printed JSON string for JSON view
    const formattedRules = JSON.stringify(rules, null, 2);
    outputElement.textContent = formattedRules;

    // Populate the table with rule data
    populateRulesTable(rules);
  } else {
    // Error - display error message
    statusElement.innerHTML =
      'Unable to retrieve rules' +
      (useMockData ? ' (even with mock data)' : '') +
      '. Check debug panel for details.';
    statusElement.className = 'error';

    // If we couldn't get real data, use mock data as fallback
    if (!useMockData) {
      debugElement.innerHTML +=
        '<p><strong>Falling back to mock data</strong></p>';
      displayRules(true);
      return;
    }
  }
}

// Function to populate the rules table
function populateRulesTable(rules) {
  const tableBody = document.getElementById('rulesTableBody');
  const debugElement = document.getElementById('debugContent');

  debugElement.innerHTML += '<p>Starting to populate table...</p>';

  // Handle different data structures
  let processableRules = rules;

  // If rules is not an array, try to find an array inside it
  if (!Array.isArray(rules)) {
    debugElement.innerHTML +=
      '<p>Rules is not an array, searching for arrays inside...</p>';

    // Check if it's an object with a property that might be our rules array
    if (typeof rules === 'object' && rules !== null) {
      // Common property names that might contain rules
      const possibleArrayProps = ['rules', 'data', 'items', 'rulesList'];

      // First check for properties we know might contain rules
      for (const prop of possibleArrayProps) {
        if (Array.isArray(rules[prop]) && rules[prop].length > 0) {
          debugElement.innerHTML +=
            '<p>Found array in property: ' + prop + '</p>';
          processableRules = rules[prop];
          break;
        }
      }

      // If we didn't find in known properties, check all properties
      if (!Array.isArray(processableRules)) {
        for (const key in rules) {
          if (Array.isArray(rules[key]) && rules[key].length > 0) {
            debugElement.innerHTML +=
              '<p>Found array in property: ' + key + '</p>';
            processableRules = rules[key];
            break;
          }
        }
      }

      // If we still don't have an array, try to convert the object to an array
      if (!Array.isArray(processableRules)) {
        debugElement.innerHTML +=
          '<p>Converting object to array of values...</p>';
        const tempArray = [];
        for (const key in rules) {
          if (typeof rules[key] === 'object' && rules[key] !== null) {
            // Add the key as id if the object doesn't have one
            if (!rules[key].id) {
              rules[key].id = key;
            }
            tempArray.push(rules[key]);
          }
        }
        if (tempArray.length > 0) {
          processableRules = tempArray;
          debugElement.innerHTML +=
            '<p>Created array with ' + tempArray.length + ' items</p>';
        }
      }
    }
  }

  // If we have an array, process it
  if (Array.isArray(processableRules)) {
    debugElement.innerHTML +=
      '<p>Processing array with ' + processableRules.length + ' items</p>';

    processableRules.forEach((rule, index) => {
      // Skip if rule is not an object
      if (typeof rule !== 'object' || rule === null) {
        debugElement.innerHTML +=
          '<p>Skipping item ' + index + ' because it is not an object</p>';
        return;
      }

      const row = document.createElement('tr');

      // Rule Name
      const nameCell = document.createElement('td');
      nameCell.textContent = rule.name || 'Unnamed Rule';
      row.appendChild(nameCell);

      // Details Button
      const detailsCell = document.createElement('td');
      const detailsBtn = document.createElement('button');
      detailsBtn.textContent = 'View Details';
      detailsBtn.style.padding = '5px 10px';
      detailsBtn.style.fontSize = '12px';

      detailsBtn.addEventListener('click', function () {
        // Toggle details section
        const detailsId = `rule-details-${rule.id || index}`;
        let detailsSection = document.getElementById(detailsId);

        if (detailsSection) {
          detailsSection.remove();
        } else {
          detailsSection = document.createElement('div');
          detailsSection.id = detailsId;
          detailsSection.className = 'rule-details';

          // Create a formatted display of the rule details
          const detailsPre = document.createElement('pre');
          detailsPre.textContent = JSON.stringify(rule, null, 2);
          detailsSection.appendChild(detailsPre);

          // Insert after the current row
          row.parentNode.insertBefore(detailsSection, row.nextSibling);
        }
      });

      detailsCell.appendChild(detailsBtn);
      row.appendChild(detailsCell);

      tableBody.appendChild(row);
    });
  } else {
    debugElement.innerHTML +=
      '<p>Could not find or create an array of rules to display</p>';

    // As a last resort, create a single row with a message
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent =
      'No rules found in the expected format. Check the JSON view or debug panel for details.';
    cell.style.textAlign = 'center';
    cell.style.padding = '20px';
    row.appendChild(cell);
    tableBody.appendChild(row);
  }

  debugElement.innerHTML +=
    '<p>Table population complete. Row count: ' +
    tableBody.children.length +
    '</p>';
}

// Initialize the page when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function () {
  // Show debug panel by default
  document.getElementById('debug').classList.remove('hidden');

  // Toggle between table and JSON views
  document
    .getElementById('tableViewBtn')
    .addEventListener('click', function () {
      document.getElementById('tableView').classList.remove('hidden');
      document.getElementById('jsonView').classList.add('hidden');
      this.classList.add('active');
      document.getElementById('jsonViewBtn').classList.remove('active');
    });

  document.getElementById('jsonViewBtn').addEventListener('click', function () {
    document.getElementById('jsonView').classList.remove('hidden');
    document.getElementById('tableView').classList.add('hidden');
    this.classList.add('active');
    document.getElementById('tableViewBtn').classList.remove('active');
  });

  // Toggle debug panel
  document
    .getElementById('toggleDebugBtn')
    .addEventListener('click', function () {
      const debugPanel = document.getElementById('debug');
      if (debugPanel.classList.contains('hidden')) {
        debugPanel.classList.remove('hidden');
        this.textContent = 'Hide Debug Panel';
      } else {
        debugPanel.classList.add('hidden');
        this.textContent = 'Show Debug Panel';
      }
    });

  // Add event listener to the refresh button
  document.getElementById('refreshBtn').addEventListener('click', function () {
    displayRules(false);
  });

  // Add event listener to the mock data button
  document.getElementById('mockDataBtn').addEventListener('click', function () {
    displayRules(true);
  });

  // Try to display rules
  displayRules(false);
});
