document.addEventListener('DOMContentLoaded', function () {
  var customCodeContainer = document.getElementById('customCodeContainer');
  var searchInput = document.getElementById('searchInput');
  var de_value = sessionStorage.getItem('_satellite._container.dataElements');

  if (de_value) {
    const dataElements = JSON.parse(de_value);
    const customCodeElements = [];

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
          customCodeElements.push({
            name: key,
            code:
              dataElement.settings && dataElement.settings.source
                ? dataElement.settings.source
                : 'No code found',
            type: 'Custom Code',
            extension: dataElement.modulePath.split('/')[0],
          });
        }

        // Also check for JavaScript variable type which might contain code
        if (
          dataElement.modulePath &&
          dataElement.modulePath.includes('javascript-variable')
        ) {
          customCodeElements.push({
            name: key,
            code:
              dataElement.settings && dataElement.settings.path
                ? dataElement.settings.path
                : 'No path found',
            type: 'JavaScript Variable',
            extension: dataElement.modulePath.split('/')[0],
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
            el.code.toLowerCase().includes(searchTerm)
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

      const copyButton = document.createElement('button');
      copyButton.className = 'btn btn-sm btn-primary';
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

      codeHeader.appendChild(codeTitle);
      codeHeader.appendChild(copyButton);

      const pre = document.createElement('pre');
      pre.textContent = element.code;

      codeContainer.appendChild(codeHeader);
      codeContainer.appendChild(pre);

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
      let csvContent = 'Data Element Name,Type,Extension,Code\n';
      filteredElements.forEach((element) => {
        // Escape quotes in the code
        const escapedCode = element.code.replace(/"/g, '""');
        csvContent += `"${element.name}","${element.type}","${element.extension}","${escapedCode}"\n`;
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
