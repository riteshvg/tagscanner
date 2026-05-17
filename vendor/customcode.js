document.addEventListener('DOMContentLoaded', function () {
  var customCodeContainer = document.getElementById('customCodeContainer');
  var searchInput = document.getElementById('searchInput');
  var de_value = sessionStorage.getItem('_satellite._container.dataElements');

  if (de_value) {
    const dataElements = JSON.parse(de_value);
    const customCodeElements = [];

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

    // Define specific names to search for
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

    // Find all data elements with custom code
    for (const key in dataElements) {
      if (dataElements.hasOwnProperty(key)) {
        const dataElement = dataElements[key];

        // Check if this is a custom code data element
        if (
          dataElement.modulePath &&
          (dataElement.modulePath ===
            'core/modules/data-element/custom-code.js' ||
            dataElement.modulePath.includes('custom-code'))
        ) {
          let code = dataElement.settings && dataElement.settings.source
            ? dataElement.settings.source
            : 'No code found';
          
          // Clean URLs in the code
          if (code.includes('.min.js')) {
            code = cleanCustomCodeUrl(code);
          }
          
          // Search for specific names in the code
          const foundNames = searchForNamesInCode(code, searchNames);
          
          customCodeElements.push({
            name: key,
            code: code,
            type: 'Custom Code',
            extension: dataElement.modulePath.split('/')[0],
            foundNames: foundNames
          });
        }

        // Also check for JavaScript variable type which might contain code
        if (
          dataElement.modulePath &&
          dataElement.modulePath.includes('javascript-variable')
        ) {
          let code = dataElement.settings && dataElement.settings.path
            ? dataElement.settings.path
            : 'No path found';
          
          // Clean URLs in the code
          if (code.includes('.min.js')) {
            code = cleanCustomCodeUrl(code);
          }
          
          // Search for specific names in the code
          const foundNames = searchForNamesInCode(code, searchNames);
          
          customCodeElements.push({
            name: key,
            code: code,
            type: 'JavaScript Variable',
            extension: dataElement.modulePath.split('/')[0],
            foundNames: foundNames
          });
        }
      }
    }

    // Display the custom code elements
    displayCustomCodeElements(customCodeElements);

    // Add search functionality
    searchInput.addEventListener('keyup', function () {
      const searchTerm = this.value.toLowerCase();
      displayCustomCodeElements(customCodeElements, searchTerm);
    });
  }

  // Hide the loader
  var set_display = document.getElementById('set_display');
  set_display.style = 'display: none;';

  // Function to display custom code elements
  function displayCustomCodeElements(elements, searchTerm = '') {
    customCodeContainer.innerHTML = '';

    if (elements.length === 0) {
      customCodeContainer.innerHTML =
        '<div class="alert alert-info">No custom code data elements found.</div>';
      return;
    }

    const filteredElements = searchTerm
      ? elements.filter(
          (el) =>
            el.name.toLowerCase().includes(searchTerm) ||
            el.code.toLowerCase().includes(searchTerm) ||
            el.foundNames.some(name => name.toLowerCase().includes(searchTerm))
        )
      : elements;

    if (filteredElements.length === 0) {
      customCodeContainer.innerHTML =
        '<div class="alert alert-info">No matching data elements found.</div>';
      return;
    }

    filteredElements.forEach((element) => {
      const codeContainer = document.createElement('div');
      codeContainer.className = 'code-container';

      const codeHeader = document.createElement('div');
      codeHeader.className = 'code-header';

      const codeTitle = document.createElement('div');
      codeTitle.className = 'code-title';
      codeTitle.textContent =
        element.name + ' (' + element.type + ' - ' + element.extension + ')';

      // Add found names display if any
      if (element.foundNames && element.foundNames.length > 0) {
        const foundNamesDiv = document.createElement('div');
        foundNamesDiv.style.cssText = 'margin-top: 5px; font-size: 12px; color: #28a745;';
        foundNamesDiv.innerHTML = '<strong>Found:</strong> ' + element.foundNames.join(', ');
        codeTitle.appendChild(foundNamesDiv);
      }

      const copyButton = document.createElement('button');
      copyButton.className = 'btn btn-sm btn-primary';
      copyButton.style.marginLeft = '8px';
      copyButton.innerHTML = '<i class="fa fa-copy"></i> Copy Code';
      copyButton.onclick = function () {
        navigator.clipboard
          .writeText(element.code)
          .then(() => {
            copyButton.innerHTML = '<i class="fa fa-check"></i> Copied!';
            setTimeout(() => {
              copyButton.innerHTML = '<i class="fa fa-copy"></i> Copy Code';
            }, 2000);
          })
          .catch((err) => {
            console.error('Failed to copy: ', err);
          });
      };

      const explainButton = document.createElement('button');
      explainButton.className = 'btn btn-sm btn-secondary';
      explainButton.style.marginLeft = '8px';
      explainButton.textContent = 'Explain with AI';

      const explanationDiv = document.createElement('div');
      explanationDiv.style.cssText =
        'margin-top: 10px; font-size: 14px; color: #343a40; display: none;';

      explainButton.onclick = async function () {
        if (explainButton.disabled) {
          return;
        }

        explainButton.disabled = true;
        const originalText = explainButton.textContent;
        explainButton.textContent = 'Explaining...';

        const explanation = await explainCustomCodeWithAI(element.code, {
          name: element.name,
          type: element.type,
          extension: element.extension,
          source: 'data-element-custom-code',
        });

        explanationDiv.textContent = explanation;
        explanationDiv.style.display = 'block';

        explainButton.textContent = originalText;
        explainButton.disabled = false;
      };

      codeHeader.appendChild(codeTitle);
      codeHeader.appendChild(explainButton);
      codeHeader.appendChild(copyButton);

      const pre = document.createElement('pre');
      pre.textContent = element.code;

      codeContainer.appendChild(codeHeader);
      codeContainer.appendChild(pre);
      codeContainer.appendChild(explanationDiv);

      customCodeContainer.appendChild(codeContainer);
    });

    // Add export functionality
    const downloadButton =
      document.getElementsByClassName('download-button')[0];
    if (downloadButton) {
      downloadButton.innerHTML = '';
      const downloadLink = document.createElement('a');
      downloadLink.download = 'custom_code_data_elements.csv';

      // Create CSV content
      const ccPropName = sessionStorage.getItem('launch_property_name') || '';
      let csvContent = '"Exported by TagScanner v2.5.4 — Adobe Tags (Launch) Inspector"\r\n' +
        '"Property: ' + ccPropName.replace(/"/g, '""') + ' | Generated: ' + new Date().toLocaleString() + '"\r\n' +
        '"tagscannerfeedback@gmail.com — Provided as-is. No affiliation with Adobe."\r\n\r\n' +
        'Data Element Name,Type,Extension,Found Names,Code\n';
      filteredElements.forEach((element) => {
        // Escape quotes in the code
        const escapedCode = element.code.replace(/"/g, '""');
        const foundNames = element.foundNames ? element.foundNames.join('; ') : '';
        csvContent += `"${element.name}","${element.type}","${element.extension}","${foundNames}","${escapedCode}"\n`;
      });

      const blob = new Blob([csvContent], { type: 'text/csv' });
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.style.color = 'black';
      downloadLink.innerHTML = 'Export CSV File ';
      downloadLink.style.textAlign = 'right';
      downloadButton.appendChild(downloadLink);
    }
  }
});
