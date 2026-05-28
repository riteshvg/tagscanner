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
              explanationDiv.innerHTML =
                '<div style="padding:14px;text-align:center;background:#f8f9fc;border-radius:8px;border:1px solid #e3e6f0">' +
                '<div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:4px">Sign in to use AI Explain</div>' +
                '<div style="font-size:12px;color:#6b7280;margin-bottom:14px">AI-powered code explanation requires a Google account.</div>' +
                '<button class="cc-explain-signin-btn" style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:#fff;border:1px solid #d1d3e2;border-radius:6px;font-size:13px;font-weight:500;color:#374151;cursor:pointer">' +
                '<svg width="16" height="16" viewBox="0 0 48 48"><path fill="#4285F4" d="M47.53 24.56c0-1.6-.14-3.14-.4-4.62H24v8.73h13.2c-.57 3.03-2.3 5.59-4.9 7.32v6.08h7.93c4.64-4.28 7.3-10.58 7.3-17.51z"/><path fill="#34A853" d="M24 48c6.66 0 12.24-2.21 16.32-5.98l-7.93-6.08c-2.2 1.47-5.01 2.34-8.39 2.34-6.45 0-11.91-4.35-13.86-10.21H2.08v6.28C6.14 42.62 14.43 48 24 48z"/><path fill="#FBBC05" d="M10.14 28.07A14.42 14.42 0 0 1 9.6 24c0-1.41.24-2.78.54-4.07v-6.28H2.08A23.98 23.98 0 0 0 0 24c0 3.88.93 7.55 2.08 10.35l8.06-6.28z"/><path fill="#EA4335" d="M24 9.52c3.63 0 6.88 1.25 9.44 3.7l7.08-7.08C36.23 2.19 30.65 0 24 0 14.43 0 6.14 5.38 2.08 13.65l8.06 6.28C12.09 13.87 17.55 9.52 24 9.52z"/></svg>' +
                'Continue with Google</button>' +
                '<div class="cc-explain-signin-err" style="display:none;margin-top:8px;font-size:11px;color:#ef4444"></div>' +
                '</div>';
              explanationDiv.style.display = 'block';
              var signinBtn = explanationDiv.querySelector('.cc-explain-signin-btn');
              var signinErr = explanationDiv.querySelector('.cc-explain-signin-err');
              signinBtn.addEventListener('click', async function () {
                signinBtn.disabled = true;
                signinBtn.textContent = 'Signing in…';
                signinErr.style.display = 'none';
                try {
                  session = await window.TagScannerAuth.signInWithGoogle();
                  explanationDiv.innerHTML = '';
                  explanationDiv.style.display = 'none';
                  explainButton.click();
                } catch (authErr) {
                  signinErr.textContent = authErr.message || 'Sign-in failed. Please try again.';
                  signinErr.style.display = 'block';
                  signinBtn.disabled = false;
                  signinBtn.textContent = 'Try again';
                }
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
