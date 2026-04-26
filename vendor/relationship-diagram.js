document.addEventListener('DOMContentLoaded', function () {
  console.log('Relationship Diagram loading...');

  // Get data from sessionStorage
  const de_value = sessionStorage.getItem('_satellite._container.dataElements');
  const rule_value = sessionStorage.getItem('_satellite._container.rules');

  if (!de_value || !rule_value) {
    document.getElementById('set_display').style.display = 'none';
    document.getElementById('detailsContent').innerHTML =
      '<div class="alert alert-danger">No data found. Please go to the main page and load a website first.</div>';
    return;
  }

  try {
    const dataElements = JSON.parse(de_value);
    const rules = JSON.parse(rule_value);

    console.log('Data elements parsed:', Object.keys(dataElements).length);
    console.log('Rules parsed:', Object.keys(rules).length);

    // Hide loading spinner
    document.getElementById('set_display').style.display = 'none';

    // Initialize the relationships map
    const relationships = {
      ruleToDataElement: {}, // rule -> data elements it uses
      dataElementToRule: {}, // data element -> rules that use it
      dataElementToDataElement: {}, // data element -> data elements it references
    };

    // Populate the rules list initially
    populateRulesList(rules);

    // Set up tab switching
    document.getElementById('rulesTab').addEventListener('click', function () {
      document.getElementById('rulesTab').classList.add('active');
      document.getElementById('dataElementsTab').classList.remove('active');
      document.getElementById('listHeader').textContent = 'Rules';
      populateRulesList(rules);
    });

    document
      .getElementById('dataElementsTab')
      .addEventListener('click', function () {
        document.getElementById('dataElementsTab').classList.add('active');
        document.getElementById('rulesTab').classList.remove('active');
        document.getElementById('listHeader').textContent = 'Data Elements';
        populateDataElementsList(dataElements);
      });

    // Set up search functionality
    document
      .getElementById('searchInput')
      .addEventListener('input', function (e) {
        const searchTerm = e.target.value.toLowerCase();

        if (document.getElementById('rulesTab').classList.contains('active')) {
          populateRulesList(rules, searchTerm);
        } else {
          populateDataElementsList(dataElements, searchTerm);
        }
      });

    // Analyze rules to find data element references
    analyzeRelationships(rules, dataElements);

    // Function to populate the rules list
    function populateRulesList(rules, searchTerm = '') {
      const itemsList = document.getElementById('itemsList');
      itemsList.innerHTML = '';

      Object.keys(rules).forEach((key) => {
        const rule = rules[key];

        if (searchTerm && !rule.name.toLowerCase().includes(searchTerm)) {
          return;
        }

        const listItem = document.createElement('div');
        listItem.className = 'list-item';
        listItem.textContent = rule.name;
        listItem.dataset.id = key;
        listItem.dataset.type = 'rule';

        listItem.addEventListener('click', function () {
          // Remove active class from all items
          document.querySelectorAll('.list-item').forEach((item) => {
            item.classList.remove('active');
          });

          // Add active class to clicked item
          this.classList.add('active');

          // Show relationships for this rule
          showRuleRelationships(key, rule.name);
        });

        itemsList.appendChild(listItem);
      });

      if (itemsList.children.length === 0) {
        itemsList.innerHTML =
          '<div class="no-data-message">No matching rules found</div>';
      }
    }

    // Function to populate the data elements list
    function populateDataElementsList(dataElements, searchTerm = '') {
      const itemsList = document.getElementById('itemsList');
      itemsList.innerHTML = '';

      Object.keys(dataElements).forEach((key) => {
        if (searchTerm && !key.toLowerCase().includes(searchTerm)) {
          return;
        }

        const listItem = document.createElement('div');
        listItem.className = 'list-item';
        listItem.textContent = key;
        listItem.dataset.id = key;
        listItem.dataset.type = 'dataElement';

        // Add an indicator if the data element has custom code
        const hasCustomCode =
          dataElements[key].settings && dataElements[key].settings.customJS;
        if (hasCustomCode) {
          listItem.innerHTML = `${key} <span class="badge badge-warning">Custom Code</span>`;
        }

        listItem.addEventListener('click', function () {
          // Remove active class from all items
          document.querySelectorAll('.list-item').forEach((item) => {
            item.classList.remove('active');
          });

          // Add active class to clicked item
          this.classList.add('active');

          // Show relationships for this data element
          showDataElementRelationships(key);
        });

        itemsList.appendChild(listItem);
      });

      if (itemsList.children.length === 0) {
        itemsList.innerHTML =
          '<div class="no-data-message">No matching data elements found</div>';
      }
    }

    // Function to analyze relationships between rules and data elements
    function analyzeRelationships(rules, dataElements) {
      // Initialize relationship maps
      Object.keys(rules).forEach((ruleKey) => {
        relationships.ruleToDataElement[ruleKey] = new Set();
      });

      Object.keys(dataElements).forEach((deKey) => {
        relationships.dataElementToRule[deKey] = new Set();
        relationships.dataElementToDataElement[deKey] = new Set();
      });

      Object.keys(rules).forEach((ruleKey) => {
        const rule = rules[ruleKey];
        if (
          typeof window !== 'undefined' &&
          window.TagScannerDataElementRefs &&
          window.TagScannerDataElementRefs.getDENamesReferencedInRule
        ) {
          window.TagScannerDataElementRefs
            .getDENamesReferencedInRule(rule, dataElements)
            .forEach((deName) => {
              relationships.ruleToDataElement[ruleKey].add(deName);
              relationships.dataElementToRule[deName]?.add(ruleKey);
            });
        } else {
          if (rule.actions && rule.actions.length) {
            rule.actions.forEach((action) => {
              findDataElementReferences(action, ruleKey, dataElements);
            });
          }
          if (rule.conditions && rule.conditions.length) {
            rule.conditions.forEach((condition) => {
              findDataElementReferences(condition, ruleKey, dataElements);
            });
          }
          if (rule.events && rule.events.length) {
            rule.events.forEach((event) => {
              findDataElementReferences(event, ruleKey, dataElements);
            });
          }
        }
      });

      Object.keys(dataElements).forEach((deKey) => {
        const de = dataElements[deKey];
        if (!de || !de.settings) return;
        if (
          typeof window !== 'undefined' &&
          window.TagScannerDataElementRefs &&
          window.TagScannerDataElementRefs.collectLiteralRefsFromJsonString
        ) {
          const lit = window.TagScannerDataElementRefs.collectLiteralRefsFromJsonString(
            JSON.stringify(de.settings)
          );
          Object.keys(lit).forEach((name) => {
            if (name !== deKey && dataElements[name]) {
              relationships.dataElementToDataElement[deKey].add(name);
            }
          });
        } else {
          findDataElementReferencesInDataElement(
            de.settings,
            deKey,
            dataElements
          );
        }
      });
    }

    // Function to find data element references in an object
    function findDataElementReferences(obj, ruleKey, dataElements) {
      if (!obj) return;

      // If it's a string, check for data element syntax
      if (typeof obj === 'string') {
        if (obj.indexOf('%') > -1) {
          const dataElementName = obj.replaceAll('%', '');
          if (dataElementName && dataElementName.trim() !== '') {
            // Add to relationships
            relationships.ruleToDataElement[ruleKey].add(dataElementName);
            relationships.dataElementToRule[dataElementName]?.add(ruleKey);
          }
        }
        return;
      }

      // If it's not an object, return
      if (typeof obj !== 'object') return;

      // If it's an array, process each item
      if (Array.isArray(obj)) {
        obj.forEach((item) =>
          findDataElementReferences(item, ruleKey, dataElements)
        );
        return;
      }

      // Process object properties
      for (const key in obj) {
        // Check if the key itself contains a data element reference
        if (typeof key === 'string' && key.indexOf('%') > -1) {
          const dataElementName = key.replaceAll('%', '');
          if (dataElementName && dataElementName.trim() !== '') {
            // Add to relationships
            relationships.ruleToDataElement[ruleKey].add(dataElementName);
            relationships.dataElementToRule[dataElementName]?.add(ruleKey);
          }
        }

        // Check the value
        findDataElementReferences(obj[key], ruleKey, dataElements);
      }
    }

    // Function to find data element references in a data element
    function findDataElementReferencesInDataElement(obj, deKey, dataElements) {
      if (!obj) return;

      // If it's a string, check for data element syntax
      if (typeof obj === 'string') {
        if (obj.indexOf('%') > -1) {
          const dataElementName = obj.replaceAll('%', '');
          if (dataElementName && dataElementName.trim() !== '') {
            // Add to relationships
            relationships.dataElementToDataElement[deKey].add(dataElementName);
          }
        }
        return;
      }

      // If it's not an object, return
      if (typeof obj !== 'object') return;

      // If it's an array, process each item
      if (Array.isArray(obj)) {
        obj.forEach((item) =>
          findDataElementReferencesInDataElement(item, deKey, dataElements)
        );
        return;
      }

      // Process object properties
      for (const key in obj) {
        // Check the value
        findDataElementReferencesInDataElement(obj[key], deKey, dataElements);
      }
    }

    // Function to show relationships for a rule
    function showRuleRelationships(ruleKey, ruleName) {
      const detailsTitle = document.getElementById('detailsTitle');
      const detailsContent = document.getElementById('detailsContent');

      detailsTitle.textContent = `Rule: ${ruleName}`;

      // Get data elements used by this rule
      const dataElementsUsed = Array.from(
        relationships.ruleToDataElement[ruleKey] || []
      );

      if (dataElementsUsed.length === 0) {
        detailsContent.innerHTML = `
          <div class="alert alert-info">
            This rule does not use any data elements.
          </div>
        `;
        return;
      }

      // Build the content
      let content = `
        <div class="card mb-4">
          <div class="card-header">
            <h5 class="mb-0">Data Elements Used by This Rule</h5>
          </div>
          <div class="card-body">
            <ul class="list-group">
      `;

      dataElementsUsed.forEach((deKey) => {
        const de = dataElements[deKey];
        const hasCustomCode = de && de.settings && de.settings.customJS;

        content += `
          <li class="list-group-item">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <span class="${
                  hasCustomCode ? 'custom-code-node' : 'data-element-node'
                }">
                  <i class="fas fa-database"></i> ${deKey}
                </span>
                ${
                  hasCustomCode
                    ? '<span class="badge badge-warning ml-2">Custom Code</span>'
                    : ''
                }
              </div>
              <button class="btn btn-sm btn-primary view-details-btn" data-id="${deKey}" data-type="dataElement">
                View Details
              </button>
            </div>
          </li>
        `;
      });

      content += `
            </ul>
          </div>
        </div>
      `;

      detailsContent.innerHTML = content;

      // Add event listeners to the "View Details" buttons
      document.querySelectorAll('.view-details-btn').forEach((btn) => {
        btn.addEventListener('click', function () {
          const id = this.dataset.id;
          const type = this.dataset.type;

          if (type === 'dataElement') {
            window.location.href = `dedetails.html?dename=${id}`;
          }
        });
      });
    }

    // Function to show relationships for a data element
    function showDataElementRelationships(deKey) {
      const detailsTitle = document.getElementById('detailsTitle');
      const detailsContent = document.getElementById('detailsContent');

      detailsTitle.textContent = `Data Element: ${deKey}`;

      // Get rules that use this data element
      const rulesUsingThis = Array.from(
        relationships.dataElementToRule[deKey] || []
      );

      // Get data elements referenced by this data element
      const dataElementsReferenced = Array.from(
        relationships.dataElementToDataElement[deKey] || []
      );

      // Build the content
      let content = '';

      // Show data element details
      const de = dataElements[deKey];
      const hasCustomCode = de && de.settings && de.settings.customJS;

      content += `
        <div class="card mb-4">
          <div class="card-header">
            <h5 class="mb-0">Data Element Details</h5>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-6">
                <p><strong>Type:</strong> ${
                  de.cleanText || de.type || 'Unknown'
                }</p>
                <p><strong>Extension:</strong> ${getExtensionName(de)}</p>
              </div>
              <div class="col-md-6">
                <p><strong>Has Custom Code:</strong> ${
                  hasCustomCode ? 'Yes' : 'No'
                }</p>
                <p><strong>Used in Rules:</strong> ${rulesUsingThis.length}</p>
              </div>
            </div>
            ${
              hasCustomCode
                ? `
              <div class="mt-3">
                <h6>Custom Code:</h6>
                <pre class="bg-light p-3" style="max-height: 200px; overflow-y: auto;">${de.settings.customJS}</pre>
              </div>
            `
                : ''
            }
            <div class="mt-3">
              <a href="dedetails.html?dename=${deKey}" class="btn btn-primary">View Full Details</a>
            </div>
          </div>
        </div>
      `;

      // Show rules that use this data element
      content += `
        <div class="card mb-4">
          <div class="card-header">
            <h5 class="mb-0">Rules Using This Data Element (${rulesUsingThis.length})</h5>
          </div>
          <div class="card-body">
      `;

      if (rulesUsingThis.length === 0) {
        content += `
          <div class="alert alert-info">
            This data element is not used by any rules.
          </div>
        `;
      } else {
        content += `<ul class="list-group">`;

        rulesUsingThis.forEach((ruleKey) => {
          const rule = rules[ruleKey];

          content += `
            <li class="list-group-item">
              <div class="d-flex justify-content-between align-items-center">
                <span class="rule-node">
                  <i class="fas fa-wrench"></i> ${rule.name}
                </span>
                <button class="btn btn-sm btn-primary view-rule-btn" data-id="${ruleKey}">
                  View Rule
                </button>
              </div>
            </li>
          `;
        });

        content += `</ul>`;
      }

      content += `
          </div>
        </div>
      `;

      // Show data elements referenced by this data element
      content += `
        <div class="card mb-4">
          <div class="card-header">
            <h5 class="mb-0">Data Elements Referenced by This Data Element (${dataElementsReferenced.length})</h5>
          </div>
          <div class="card-body">
      `;

      if (dataElementsReferenced.length === 0) {
        content += `
          <div class="alert alert-info">
            This data element does not reference any other data elements.
          </div>
        `;
      } else {
        content += `<ul class="list-group">`;

        dataElementsReferenced.forEach((referencedDeKey) => {
          const referencedDe = dataElements[referencedDeKey];
          const hasCustomCode =
            referencedDe &&
            referencedDe.settings &&
            referencedDe.settings.customJS;

          content += `
            <li class="list-group-item">
              <div class="d-flex justify-content-between align-items-center">
                <div>
                  <span class="${
                    hasCustomCode ? 'custom-code-node' : 'data-element-node'
                  }">
                    <i class="fas fa-database"></i> ${referencedDeKey}
                  </span>
                  ${
                    hasCustomCode
                      ? '<span class="badge badge-warning ml-2">Custom Code</span>'
                      : ''
                  }
                </div>
                <button class="btn btn-sm btn-primary view-details-btn" data-id="${referencedDeKey}" data-type="dataElement">
                  View Details
                </button>
              </div>
            </li>
          `;
        });

        content += `</ul>`;
      }

      content += `
          </div>
        </div>
      `;

      detailsContent.innerHTML = content;

      // Add event listeners to the "View Details" buttons
      document.querySelectorAll('.view-details-btn').forEach((btn) => {
        btn.addEventListener('click', function () {
          const id = this.dataset.id;
          const type = this.dataset.type;

          if (type === 'dataElement') {
            window.location.href = `dedetails.html?dename=${id}`;
          }
        });
      });

      // Add event listeners to the "View Rule" buttons
      document.querySelectorAll('.view-rule-btn').forEach((btn) => {
        btn.addEventListener('click', function () {
          const id = this.dataset.id;

          // Find the rule in the list and click it
          const ruleItems = document.querySelectorAll(
            '.list-item[data-type="rule"]'
          );
          for (const item of ruleItems) {
            if (item.dataset.id === id) {
              // Switch to rules tab first
              document.getElementById('rulesTab').click();

              // Wait for the list to be populated
              setTimeout(() => {
                // Find the rule again after the list has been repopulated
                const ruleItem = document.querySelector(
                  `.list-item[data-type="rule"][data-id="${id}"]`
                );
                if (ruleItem) {
                  ruleItem.click();
                  ruleItem.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                  });
                }
              }, 100);

              break;
            }
          }
        });
      });
    }

    // Helper function to get extension name
    function getExtensionName(dataElement) {
      if (!dataElement) return 'Unknown';

      if (dataElement.modulePath) {
        if (dataElement.modulePath.includes('adobe-analytics')) {
          return 'Adobe Analytics';
        } else if (dataElement.modulePath.includes('adobe-mcid')) {
          return 'Experience Cloud ID Service';
        } else if (dataElement.modulePath.includes('adobe-target')) {
          return 'Adobe Target';
        } else if (dataElement.modulePath.includes('adobe-alloy')) {
          return 'Web SDK';
        } else if (dataElement.modulePath.includes('core')) {
          return 'Core';
        }
      }

      return dataElement.extension || 'Unknown';
    }
  } catch (error) {
    console.error('Error processing data:', error);
    document.getElementById('set_display').style.display = 'none';
    document.getElementById(
      'detailsContent'
    ).innerHTML = `<div class="alert alert-danger">Error processing data: ${error.message}</div>`;
  }
});
