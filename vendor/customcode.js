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
        if (explainButton.disabled) return;
        if (window.TagScannerAuth && window.TagScannerAuth.requireExplainConsent) {
          var consented = await window.TagScannerAuth.requireExplainConsent();
          if (!consented) return;
        }
        explainButton.disabled = true;
        const originalHtml = explainButton.innerHTML;
        explainButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Explaining…';
        try {
          var session = window.TagScannerAuth && window.TagScannerAuth.getSession();
          if (window.TagScannerBedrock && window.TagScannerBedrock.explainCode) {
            if (!session) {
              explanationDiv.innerHTML = window.TagScannerAuth.renderSignInBox(
                'Sign in to use AI Explain',
                'AI-powered code explanation requires a Google account.'
              );
              explanationDiv.style.display = 'block';
              window.TagScannerAuth.attachSignInBox(explanationDiv, function () {
                explanationDiv.innerHTML = '';
                explanationDiv.style.display = 'none';
                explainButton.click();
              });
              return;
            }
            try {
              var ccPropKey = (sessionStorage.getItem('launch_property_name') || '') + '#' +
                              (sessionStorage.getItem('launch_property_environment') || 'Production');
              var brResult = await window.TagScannerBedrock.explainCode(
                element.code,
                { name: element.name || '', type: element.type || 'customCode', extension: element.extension || '' },
                { email: session.email, sessionToken: session.sessionToken, propertyKey: ccPropKey }
              );
              explanationDiv.innerHTML = window.TagScannerBedrock.renderBedrockCodeExplanation(brResult.explanation);
              if (brResult.cached && brResult.cached_by) {
                var cachedAt = brResult.cached_at ? new Date(brResult.cached_at).toLocaleString() : '';
                var byStr    = brResult.cached_by.name || brResult.cached_by.email || 'unknown';
                var notice   = document.createElement('div');
                notice.style.cssText = 'display:flex;align-items:flex-start;gap:8px;background:#eff6ff;border:1px solid #bfdbfe;border-left:4px solid #3b82f6;border-radius:6px;padding:9px 12px;margin-bottom:12px;font-size:12px;color:#1e40af';
                notice.innerHTML = '<i class="fas fa-info-circle" style="font-size:13px;margin-top:1px;flex-shrink:0"></i><div><strong style="display:block;margin-bottom:2px">Cached Explanation</strong><span style="color:#374151">Generated on ' + cachedAt + ' by ' + byStr + '. Same code — no new AI call needed.</span></div>';
                explanationDiv.insertBefore(notice, explanationDiv.firstChild);
              }
              if (brResult.secretsRedacted > 0) {
                var redactNotice = document.createElement('div');
                redactNotice.style.cssText = 'display:flex;align-items:flex-start;gap:7px;background:#fefce8;border:1px solid #fde68a;border-left:3px solid #f59e0b;border-radius:5px;padding:7px 10px;margin-bottom:10px;font-size:11.5px;color:#92400e';
                redactNotice.innerHTML =
                  '<i class="fas fa-shield-alt" style="font-size:12px;margin-top:1px;flex-shrink:0;color:#d97706"></i>' +
                  '<span><strong>' + brResult.secretsRedacted + ' potential secret' + (brResult.secretsRedacted > 1 ? 's' : '') + ' redacted</strong> — values matching common secret patterns (API keys, tokens, passwords) were removed before sending to AI.</span>';
                explanationDiv.insertBefore(redactNotice, explanationDiv.firstChild);
              }
              var modelNote = document.createElement('div');
              modelNote.style.cssText = 'margin-top:14px;padding-top:8px;border-top:1px solid #f3f4f6;font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:5px';
              modelNote.innerHTML = '<i class="fas fa-microchip" style="font-size:10px;color:#c4b5fd"></i>Generated by <strong style="color:#6b7280;margin-left:3px">' + (brResult.model || 'Claude 3.5 Haiku') + '</strong>';
              explanationDiv.appendChild(modelNote);
              explanationDiv.style.display = 'block';
              return;
            } catch (bedrockErr) {
              explanationDiv.innerHTML = '<div style="padding:8px;color:#ef4444;font-size:12px"><i class="fas fa-exclamation-circle" style="margin-right:5px"></i>' + (bedrockErr.message || 'AI explain failed') + '</div>';
              explanationDiv.style.display = 'block';
              return;
            }
          }
          // Fallback: legacy plain-text explain
          const explanation = await explainCustomCodeWithAI(element.code, {
            name: element.name,
            type: element.type,
            extension: element.extension,
            source: 'data-element-custom-code',
          });
          explanationDiv.textContent = explanation;
          explanationDiv.style.display = 'block';
        } finally {
          explainButton.innerHTML = originalHtml;
          explainButton.disabled = false;
        }
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
      let csvContent = '"Exported by TagScanner v2.5.6 — Adobe Tags (Launch) Inspector"\r\n' +
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
      downloadLink.addEventListener('click', function () {
        var _tsA = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
        if (_tsA) _tsA.track('Export:CSV:Custom Code', { pageName: 'TagScanner:Data Elements', events: 'event4', v5: 'CSV', c2: 'Export' });
      });
      downloadButton.appendChild(downloadLink);
    }
  }
});
