(function () {
  'use strict';

  var STORAGE_KEYS = { endpoint: 'aiReport_azureEndpoint', key: 'aiReport_azureKey', deployment: 'aiReport_azureDeployment' };
  var lastReport = null;

  function getStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) return 'chrome';
    return 'local';
  }

  function loadConfig(cb) {
    if (getStorage() === 'chrome') {
      chrome.storage.local.get([STORAGE_KEYS.endpoint, STORAGE_KEYS.key, STORAGE_KEYS.deployment], function (vals) {
        cb({
          endpoint: vals[STORAGE_KEYS.endpoint] || '',
          key: vals[STORAGE_KEYS.key] || '',
          deployment: vals[STORAGE_KEYS.deployment] || ''
        });
      });
    } else {
      cb({
        endpoint: localStorage.getItem(STORAGE_KEYS.endpoint) || '',
        key: localStorage.getItem(STORAGE_KEYS.key) || '',
        deployment: localStorage.getItem(STORAGE_KEYS.deployment) || ''
      });
    }
  }

  function saveConfig(config, cb) {
    if (getStorage() === 'chrome') {
      var o = {};
      o[STORAGE_KEYS.endpoint] = config.endpoint || '';
      o[STORAGE_KEYS.key] = config.key || '';
      o[STORAGE_KEYS.deployment] = config.deployment || '';
      chrome.storage.local.set(o, cb || function () {});
    } else {
      localStorage.setItem(STORAGE_KEYS.endpoint, config.endpoint || '');
      localStorage.setItem(STORAGE_KEYS.key, config.key || '');
      localStorage.setItem(STORAGE_KEYS.deployment, config.deployment || '');
      if (cb) cb();
    }
  }

  function buildPropertyPayload() {
    var rulesStr = sessionStorage.getItem('_satellite._container.rules');
    var deStr = sessionStorage.getItem('_satellite._container.dataElements');
    var extStr = sessionStorage.getItem('_satellite._container.extension');
    var propName = sessionStorage.getItem('launch_property_name') || 'Unknown Property';
    var env = sessionStorage.getItem('launch_property_environment') || '';

    var rules = [];
    var dataElements = [];
    var extensions = [];

    if (rulesStr) {
      try {
        var r = JSON.parse(rulesStr);
        var arr = Array.isArray(r) ? r : (r && r.rules ? r.rules : []);
        arr.forEach(function (rule) {
          var events = (rule.events || []).map(function (e) { return e.type || e.modulePath || 'event'; });
          var conds = (rule.conditions || []).map(function (c) {
            var n = c.modulePath ? c.modulePath.split('/').pop() : (c.type || c.name || 'condition');
            if (c.settings && c.settings.source && typeof c.settings.source === 'string' && c.settings.source.length > 100) {
              n += ' (has custom code: ' + c.settings.source.substring(0, 200) + '...)';
            }
            return n;
          });
          var actions = (rule.actions || []).map(function (a) {
            var n = a.modulePath ? a.modulePath.split('/').pop() : (a.type || a.name || 'action');
            if (a.settings && a.settings.source && typeof a.settings.source === 'string' && a.settings.source.length > 100) {
              n += ' (has custom code: ' + a.settings.source.substring(0, 200) + '...)';
            }
            return n;
          });
          rules.push({ name: rule.name || rule.id || 'Unnamed', events: events, conditions: conds, actions: actions });
        });
      } catch (e) { rules = [{ error: String(e.message) }]; }
    }

    if (deStr) {
      try {
        var de = JSON.parse(deStr);
        var names = typeof de === 'object' && !Array.isArray(de) ? Object.keys(de) : [];
        names.forEach(function (name) {
          var item = de[name];
          var type = (item && item.modulePath) ? item.modulePath.split('/').pop() : (item && item.type) || 'unknown';
          dataElements.push({ name: name, type: type });
        });
      } catch (e) { dataElements = [{ error: String(e.message) }]; }
    }

    if (extStr) {
      try {
        var ext = JSON.parse(extStr);
        if (typeof ext === 'object') extensions = Object.keys(ext);
      } catch (e) {}
    }

    return {
      propertyName: propName,
      environment: env,
      rulesCount: rules.length,
      rules: rules,
      dataElementsCount: dataElements.length,
      dataElements: dataElements,
      extensions: extensions
    };
  }

  function validateConnection(config, onDone) {
    if (!config.endpoint || !config.key || !config.deployment) {
      onDone(new Error('Endpoint, API key, and deployment name are required.'));
      return;
    }
    var endpoint = (config.endpoint || '').replace(/\/$/, '');
    var deployment = (config.deployment || '').trim();
    var url = endpoint + '/openai/deployments/' + encodeURIComponent(deployment) + '/chat/completions?api-version=2024-02-15-preview';
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': config.key || '' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        max_tokens: 10,
        temperature: 0
      })
    })
      .then(function (res) {
        if (res.ok) {
          return res.json().then(function (data) {
            if (data.choices && data.choices[0]) {
              onDone(null);
            } else {
              onDone(new Error('Unexpected response format.'));
            }
          });
        }
        return res.text().then(function (text) {
          var errMsg = res.status + ' ' + res.statusText;
          try {
            var errBody = JSON.parse(text);
            if (errBody.error && errBody.error.message) errMsg = errBody.error.message;
          } catch (e) {
            if (text && text.length < 200) errMsg = text;
          }
          onDone(new Error(errMsg));
        });
      })
      .catch(function (err) {
        onDone(err && err.message ? err : new Error('Network or request failed.'));
      });
  }

  function showValidationResult(success, message) {
    var el = document.getElementById('validation-msg');
    if (!el) return;
    el.style.display = 'block';
    var cls = 'alert mb-0 ';
    if (success === null) cls += 'alert-info';
    else cls += success ? 'alert-success' : 'alert-danger';
    el.className = cls;
    el.textContent = message;
    el.setAttribute('role', 'status');
  }

  function callAzureOpenAI(config, payload, onSuccess, onError) {
    var endpoint = (config.endpoint || '').replace(/\/$/, '');
    var deployment = (config.deployment || 'gpt-4').trim();
    var url = endpoint + '/openai/deployments/' + encodeURIComponent(deployment) + '/chat/completions?api-version=2024-02-15-preview';
    var body = {
      messages: [
        {
          role: 'system',
          content: 'You are an expert auditor for Adobe Experience Platform Tags (Launch). Your job is to EVALUATE and ANALYZE the property, not to describe or repeat its contents.\n\n' +
            'CRITICAL: Do not regurgitate what is in the property. Do NOT write inventory-style text (e.g. "The property has X rules, Y data elements, Z extensions" or listing rule names for the sake of listing). Do NOT simply restate the JSON. Instead: identify patterns, risks, gaps, redundancies, anti-patterns, and quality issues. Every section must add evaluative insight or actionable judgment.\n\n' +
            'Use these exact section headers: "## Summary", "## Grade", "## Health", "## Issues", "## Next Steps".\n\n' +
            'EVALUATION FRAMEWORK (Max 100 points): Accessibility (10), File Size (10), Tag Structure (15), Adobe Solution Implementation (20), Performance (15), Error Handling (10), Data Layer Usage (10), Compliance (10), Best Practices (10).\n\n' +
            'Summary: 2-4 sentences of ANALYTICAL overview—what the setup suggests (e.g. maturity, risk areas, strengths), not a count of components.\n' +
            'Grade: A single score (e.g. 72/100) and letter grade (A–F) with a one-sentence justification tied to the framework.\n' +
            'Health: Assessment of implementation health in 2-4 sentences—what is working well and what is concerning, with reasoning.\n' +
            'Issues: Only real problems. For each: (1) what is wrong and why it matters, (2) one concrete example from the data (rule/condition/action name or code snippet), (3) brief justification. Align to framework categories. Do not list or describe components that are fine. If something is borderline, explain the risk. For references use search terms only (e.g. "Adobe Experience League Data Layer Best Practices"), never invent URLs.\n' +
            'Next Steps: Prioritized, specific actions (e.g. "Consolidate rules X and Y"; "Replace hardcoded values in rule Z with data elements"). Reference the same examples where relevant. Avoid generic advice—tie each step to this property.'
        },
        {
          role: 'user',
          content: 'Use the property data below only as INPUT for your audit. Do not repeat or list it back. Evaluate it: score it against the framework, call out real issues with evidence, and give targeted next steps. JSON:\n\n' + JSON.stringify(payload, null, 2)
        }
      ],
      max_tokens: 2000,
      temperature: 0.3
    };

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.key || ''
      },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        if (!res.ok) return res.text().then(function (t) { throw new Error(res.status + ' ' + res.statusText + ': ' + t); });
        return res.json();
      })
      .then(function (data) {
        var text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (text) onSuccess(text); else onError(new Error('No response content'));
      })
      .catch(onError);
  }

  function renderReport(text) {
    var out = document.getElementById('report-output');
    out.innerHTML = '';
    var parts = text.split(/(##\s*\w+[^\n]*)/g);
    var current = document.createElement('div');
    current.className = 'report-section';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (/^##\s/.test(p)) {
        current = document.createElement('div');
        current.className = 'report-section';
        var h = document.createElement('h6');
        h.textContent = p.replace(/^##\s*/, '').trim();
        current.appendChild(h);
        out.appendChild(current);
      } else if (p.trim()) {
        var pre = document.createElement('pre');
        pre.textContent = p.trim();
        current.appendChild(pre);
      }
    }
    document.getElementById('download-pdf').disabled = false;
    lastReport = text;
  }

  function downloadPDF() {
    if (!lastReport) return;
    var propName = sessionStorage.getItem('launch_property_name') || 'Adobe Tags Property';
    var JsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (JsPDF) {
      try {
        var doc = new JsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
        var margin = 40;
        var y = 40;
        var pageW = doc.internal.pageSize.getWidth();
        var maxW = pageW - margin * 2;
        doc.setFontSize(16);
        doc.text('AI Property Report: ' + propName, margin, y);
        y += 24;
        doc.setFontSize(10);
        doc.text('Generated by TagScanner – ' + new Date().toLocaleString(), margin, y);
        y += 20;
        var lines = doc.splitTextToSize(lastReport.replace(/##\s*/g, '\n## '), maxW);
        doc.setFontSize(10);
        for (var i = 0; i < lines.length; i++) {
          if (y > doc.internal.pageSize.getHeight() - 40) {
            doc.addPage();
            y = 40;
          }
          var line = lines[i];
          if (line.indexOf('## ') === 0) {
            doc.setFont(undefined, 'bold');
            doc.text(line.replace(/^##\s*/, ''), margin, y);
            doc.setFont(undefined, 'normal');
          } else {
            doc.text(line, margin, y);
          }
          y += 14;
        }
        doc.save('TagScanner-AI-Report-' + (propName.replace(/[^a-z0-9]/gi, '-') || 'property') + '.pdf');
        return;
      } catch (e) {
        console.warn('jsPDF failed, falling back to print:', e);
      }
    }
    var html = '<!DOCTYPE html><html><head><title>AI Property Report - ' + propName + '</title></head>' +
      '<body style="font-family:sans-serif;padding:24px;max-width:800px;">' +
      '<h1>AI Property Report: ' + propName + '</h1><p>Generated by TagScanner – ' + new Date().toLocaleString() + '</p>' +
      '<pre style="white-space:pre-wrap;word-wrap:break-word;">' +
      lastReport.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre></body></html>';
    var blob    = new Blob([html], { type: 'text/html' });
    var blobUrl = URL.createObjectURL(blob);
    var win     = window.open(blobUrl, '_blank');
    if (win) {
      win.focus();
      setTimeout(function () { win.print(); URL.revokeObjectURL(blobUrl); }, 500);
    }
  }

  function init() {
    var rulesStr = sessionStorage.getItem('_satellite._container.rules');
    var deStr = sessionStorage.getItem('_satellite._container.dataElements');
    if (!rulesStr && !deStr) {
      document.getElementById('no-data-alert').style.display = 'block';
      return;
    }
    document.getElementById('report-main').style.display = 'block';

    loadConfig(function (config) {
      document.getElementById('azure-endpoint').value = config.endpoint;
      document.getElementById('azure-key').value = config.key;
      document.getElementById('azure-deployment').value = config.deployment;
    });

    document.getElementById('config-toggle').addEventListener('click', function () {
      var body = document.getElementById('config-body');
      var chevron = document.getElementById('config-chevron');
      if (body.style.display === 'none') {
        body.style.display = 'block';
        chevron.className = 'fas fa-chevron-down';
      } else {
        body.style.display = 'none';
        chevron.className = 'fas fa-chevron-right';
      }
    });

    document.getElementById('save-config').addEventListener('click', function () {
      var config = {
        endpoint: document.getElementById('azure-endpoint').value.trim(),
        key: document.getElementById('azure-key').value.trim(),
        deployment: document.getElementById('azure-deployment').value.trim()
      };
      if (!config.endpoint || !config.key || !config.deployment) {
        showValidationResult(false, 'Please fill in Endpoint, API key, and Deployment name before saving.');
        return;
      }
      saveConfig(config, function () {
        var msg = document.getElementById('config-saved-msg');
        msg.style.display = 'inline';
        setTimeout(function () { msg.style.display = 'none'; }, 2000);
        showValidationResult(null, 'Validating connection…');
        validateConnection(config, function (err) {
          if (err) {
            showValidationResult(false, 'Connection failed: ' + (err.message || String(err)));
          } else {
            showValidationResult(true, 'Connection successful. Your Azure OpenAI settings are valid.');
          }
        });
      });
    });

    document.getElementById('validate-config').addEventListener('click', function () {
      var config = {
        endpoint: document.getElementById('azure-endpoint').value.trim(),
        key: document.getElementById('azure-key').value.trim(),
        deployment: document.getElementById('azure-deployment').value.trim()
      };
      if (!config.endpoint || !config.key || !config.deployment) {
        showValidationResult(false, 'Please fill in Endpoint, API key, and Deployment name.');
        return;
      }
      showValidationResult(null, 'Validating…');
      var btn = document.getElementById('validate-config');
      btn.disabled = true;
      validateConnection(config, function (err) {
        btn.disabled = false;
        if (err) {
          showValidationResult(false, 'Validation failed: ' + (err.message || String(err)));
        } else {
          showValidationResult(true, 'Connection successful. Your Azure OpenAI settings are valid.');
        }
      });
    });

    document.getElementById('generate-report').addEventListener('click', function () {
      var btn = document.getElementById('generate-report');
      var config = {
        endpoint: document.getElementById('azure-endpoint').value.trim(),
        key: document.getElementById('azure-key').value.trim(),
        deployment: document.getElementById('azure-deployment').value.trim()
      };
      if (!config.endpoint || !config.key || !config.deployment) {
        alert('Please set Azure OpenAI endpoint, API key, and deployment name.');
        return;
      }
      saveConfig(config);
      var output = document.getElementById('report-output');
      output.innerHTML = '<p><span class="loader-ai"></span> Generating report…</p>';
      btn.disabled = true;
      var payload = buildPropertyPayload();
      callAzureOpenAI(
        config,
        payload,
        function (text) {
          btn.disabled = false;
          renderReport(text);
        },
        function (err) {
          btn.disabled = false;
          output.innerHTML = '<p class="text-danger">Error: ' + (err.message || String(err)) + '</p>';
        }
      );
    });

    document.getElementById('download-pdf').addEventListener('click', downloadPDF);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
