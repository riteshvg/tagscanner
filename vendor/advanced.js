(function () {
  'use strict';

  var clientIdEl = document.getElementById('adv-client-id');
  var clientSecretEl = document.getElementById('adv-client-secret');
  var imsOrgEl = document.getElementById('adv-ims-org');
  var scopeEl = document.getElementById('adv-scope');
  var rememberEl = document.getElementById('adv-remember-creds');
  var clearCredsBtn = document.getElementById('adv-clear-creds');
  var validateBtn = document.getElementById('adv-validate-btn');
  var validateMsg = document.getElementById('adv-validate-msg');
  var fetchOptionsSection = document.getElementById('fetch-options-section');
  var fetchBtn = document.getElementById('adv-fetch-btn');
  var resultsEl = document.getElementById('advanced-results');
  var companyEl = document.getElementById('adv-company');
  var propertyEl = document.getElementById('adv-property');

  if (!validateBtn || !validateMsg || !fetchOptionsSection || !fetchBtn || !resultsEl) return;

  var credentialsValid = false;
  var currentAccessToken = null;
  var currentClientId = null;
  var currentImsOrg = null;
  var currentCompanyId = null;
  var currentPropertyId = null;

  var IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';
  // Default, commonly used for Experience Platform / Reactor. If a credential uses different scopes,
  // user can paste the exact scope list from Adobe Developer Console.
  var DEFAULT_SCOPE = 'https://ims-na1.adobelogin.com/s/ent_dataservices';
  var REACTOR_BASE = 'https://reactor.adobe.io';

  var CREDS_KEY = 'tagscanner_advanced_creds_v1';

  function hasChromeStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  function loadSavedCreds() {
    if (hasChromeStorage()) {
      return new Promise(function (resolve) {
        chrome.storage.local.get([CREDS_KEY], function (res) {
          resolve(res && res[CREDS_KEY] ? res[CREDS_KEY] : null);
        });
      });
    }
    try {
      var raw = localStorage.getItem(CREDS_KEY);
      return Promise.resolve(raw ? JSON.parse(raw) : null);
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function saveCreds(creds) {
    if (hasChromeStorage()) {
      return new Promise(function (resolve) {
        var obj = {}; obj[CREDS_KEY] = creds;
        chrome.storage.local.set(obj, function () { resolve(); });
      });
    }
    try {
      localStorage.setItem(CREDS_KEY, JSON.stringify(creds));
    } catch (e) {}
    return Promise.resolve();
  }

  function clearCreds() {
    if (hasChromeStorage()) {
      return new Promise(function (resolve) {
        chrome.storage.local.remove([CREDS_KEY], function () { resolve(); });
      });
    }
    try {
      localStorage.removeItem(CREDS_KEY);
    } catch (e) {}
    return Promise.resolve();
  }

  function setValidateMsg(success, text) {
    validateMsg.className = 'validate-msg ' + (success ? 'success' : 'error');
    validateMsg.textContent = text;
  }

  function enableFetchSection(enable) {
    credentialsValid = enable;
    fetchOptionsSection.classList.toggle('ready', enable);
    fetchBtn.disabled = !enable;
    if (companyEl) companyEl.disabled = !enable;
    if (propertyEl) propertyEl.disabled = true;
  }

  function reactorFetch(path) {
    if (!currentAccessToken || !currentClientId || !currentImsOrg) return Promise.reject(new Error('Not authenticated.'));
    return fetch(REACTOR_BASE + path, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + currentAccessToken,
        'x-api-key': currentClientId,
        'x-gw-ims-org-id': currentImsOrg,
        'Content-Type': 'application/vnd.api+json',
        'Accept': 'application/vnd.api+json;revision=1'
      }
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error(res.status + ': ' + (t || res.statusText)); });
      return res.json();
    });
  }

  function setSelectOptions(selectEl, options, placeholder) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    var first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder || 'Select…';
    selectEl.appendChild(first);
    options.forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      selectEl.appendChild(o);
    });
  }

  function listCompanies() {
    return reactorFetch('/companies').then(function (json) {
      var data = (json && json.data) ? json.data : [];
      return data.map(function (c) {
        return { value: c.id, label: (c.attributes && c.attributes.name) ? c.attributes.name : c.id };
      });
    }).catch(function (err) {
      // Some orgs might not have companies accessible; allow flow with an informative message.
      resultsEl.innerHTML = '<div class="text-warning font-weight-bold mb-2"><i class="fas fa-exclamation-triangle mr-1"></i> Company list unavailable</div>' +
        '<div class="small text-muted">Reactor API returned an error when listing companies: ' + String(err.message || err) + '</div>';
      return [];
    });
  }

  function listProperties(companyId) {
    // Reactor API supports: GET /companies/{COMPANY_ID}/properties
    return reactorFetch('/companies/' + encodeURIComponent(companyId) + '/properties?page[size]=200').then(function (json) {
      var data = (json && json.data) ? json.data : [];
      return data.map(function (p) {
        return { value: p.id, label: (p.attributes && p.attributes.name) ? p.attributes.name : p.id };
      });
    });
  }

  function getTotalCount(path) {
    // Use page[size]=1 to minimize payload; read meta.pagination.total_count
    var join = path.indexOf('?') === -1 ? '?' : '&';
    return reactorFetch(path + join + 'page[size]=1').then(function (json) {
      var total = json && json.meta && json.meta.pagination ? json.meta.pagination.total_count : null;
      return (typeof total === 'number') ? total : 0;
    });
  }

  function formatCountsCard(title, rows) {
    var html = '<div class="mb-3"><div class="font-weight-bold text-primary">' + title + '</div>';
    html += '<div class="table-responsive"><table class="table table-sm table-bordered mb-0"><tbody>';
    rows.forEach(function (r) {
      html += '<tr><td style="width:60%">' + r.label + '</td><td style="text-align:right;font-weight:600">' + r.value + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
  }

  function isChecked(id) {
    var el = document.getElementById(id);
    return !!(el && el.checked);
  }

  function getAccessToken(clientId, clientSecret, scope) {
    var body =
      'client_id=' + encodeURIComponent(clientId) +
      '&client_secret=' + encodeURIComponent(clientSecret) +
      '&grant_type=client_credentials' +
      '&scope=' + encodeURIComponent(scope || DEFAULT_SCOPE);

    return fetch(IMS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          var hint = '';
          if (res.status === 400 && String(t || '').toLowerCase().indexOf('scope') !== -1) {
            hint = ' (Hint: paste the exact Scope(s) shown in Adobe Developer Console → OAuth Server-to-Server → “Generate access token” cURL.)';
          }
          throw new Error(res.status + ': ' + (t || res.statusText) + hint);
        });
      }
      return res.json();
    });
  }

  validateBtn.addEventListener('click', function () {
    var clientId = (clientIdEl && clientIdEl.value) ? clientIdEl.value.trim() : '';
    var clientSecret = (clientSecretEl && clientSecretEl.value) ? clientSecretEl.value.trim() : '';
    var imsOrg = (imsOrgEl && imsOrgEl.value) ? imsOrgEl.value.trim() : '';
    var scope = (scopeEl && scopeEl.value) ? scopeEl.value.trim() : '';

    if (!clientId || !clientSecret || !imsOrg) {
      setValidateMsg(false, 'Please fill in Client ID, Client Secret, and IMS Org ID.');
      enableFetchSection(false);
      return;
    }

    validateBtn.disabled = true;
    setValidateMsg(false, 'Requesting access token from Adobe IMS…');
    resultsEl.innerHTML = '<span class="text-muted">Working…</span>';

    getAccessToken(clientId, clientSecret, scope || undefined)
      .then(function (data) {
        var token = data && data.access_token;
        if (!token) {
          setValidateMsg(false, 'IMS did not return an access token.');
          enableFetchSection(false);
          return null;
        }
        currentAccessToken = token;
        currentClientId = clientId;
        currentImsOrg = imsOrg;
        setValidateMsg(false, 'Token received. Validating against Reactor API…');
        return fetch(REACTOR_BASE + '/companies', {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + token,
            'x-api-key': clientId,
            'x-gw-ims-org-id': imsOrg,
            'Content-Type': 'application/vnd.api+json',
            'Accept': 'application/vnd.api+json;revision=1'
          }
        });
      })
      .then(function (res) {
        if (!res) return;
        // Reactor docs note: you may get 404 if org has no companies; 403 is the real auth failure signal.
        if (res.ok || res.status === 404) {
          setValidateMsg(true, 'Access token generated and Reactor API validated. You can now choose what to fetch.');
          enableFetchSection(true);
          resultsEl.innerHTML =
            '<div class="text-success font-weight-bold mb-2"><i class="fas fa-check-circle mr-1"></i> Connected to Reactor API</div>' +
            '<div class="small text-muted">Token generated successfully. Next: choose what to fetch and click “Fetch selected”.</div>';

          // Persist creds only if user opted-in.
          if (rememberEl && rememberEl.checked) {
            saveCreds({
              clientId: clientId,
              clientSecret: clientSecret,
              imsOrg: imsOrg,
              scope: scope || '',
              savedAt: Date.now()
            });
          }

          // Populate companies dropdown (if available)
          if (companyEl) {
            companyEl.disabled = false;
            setSelectOptions(companyEl, [], 'Loading companies…');
            listCompanies().then(function (companies) {
              if (!companyEl) return;
              if (!companies || companies.length === 0) {
                setSelectOptions(companyEl, [], 'No companies available');
                companyEl.disabled = true;
                return;
              }
              setSelectOptions(companyEl, companies, 'Select a company…');
              if (companies.length === 1) {
                companyEl.value = companies[0].value;
                companyEl.dispatchEvent(new Event('change'));
              }
            });
          }
        } else {
          return res.text().then(function (t) {
            setValidateMsg(false, 'Reactor API validation failed: ' + res.status + ' – ' + (t ? t.substring(0, 200) : res.statusText));
            enableFetchSection(false);
          });
        }
      })
      .catch(function (err) {
        setValidateMsg(false, 'Error: ' + (err && err.message ? err.message : 'Network or CORS error.'));
        enableFetchSection(false);
      })
      .finally(function () {
        validateBtn.disabled = false;
      });
  });

  // Prefill from saved creds (opt-in storage)
  loadSavedCreds().then(function (c) {
    if (!c) return;
    if (clientIdEl && !clientIdEl.value) clientIdEl.value = c.clientId || '';
    if (clientSecretEl && !clientSecretEl.value) clientSecretEl.value = c.clientSecret || '';
    if (imsOrgEl && !imsOrgEl.value) imsOrgEl.value = c.imsOrg || '';
    if (scopeEl && !scopeEl.value) scopeEl.value = c.scope || '';
    if (rememberEl) rememberEl.checked = true;
  });

  if (clearCredsBtn) {
    clearCredsBtn.addEventListener('click', function () {
      clearCreds().then(function () {
        if (rememberEl) rememberEl.checked = false;
        setValidateMsg(true, 'Saved credentials cleared.');
      });
    });
  }

  if (companyEl && propertyEl) {
    companyEl.addEventListener('change', function () {
      var companyId = companyEl.value;
      currentCompanyId = companyId || null;
      currentPropertyId = null;
      propertyEl.disabled = true;
      setSelectOptions(propertyEl, [], companyId ? 'Loading properties…' : 'Select a company first…');
      if (!companyId) return;
      listProperties(companyId)
        .then(function (props) {
          setSelectOptions(propertyEl, props, 'Select a property…');
          propertyEl.disabled = false;
          if (props.length === 1) {
            propertyEl.value = props[0].value;
            propertyEl.dispatchEvent(new Event('change'));
          }
        })
        .catch(function (err) {
          setSelectOptions(propertyEl, [], 'Failed to load properties');
          propertyEl.disabled = true;
          resultsEl.innerHTML =
            '<div class="text-danger font-weight-bold mb-2"><i class="fas fa-times-circle mr-1"></i> Unable to load properties</div>' +
            '<div class="small text-muted">' + String(err.message || err) + '</div>';
        });
    });

    propertyEl.addEventListener('change', function () {
      currentPropertyId = propertyEl.value || null;
    });
  }

  fetchBtn.addEventListener('click', function () {
    if (!credentialsValid || !currentAccessToken || !currentClientId || !currentImsOrg) return;
    if (!currentPropertyId) {
      resultsEl.innerHTML = '<div class="text-warning font-weight-bold mb-2"><i class="fas fa-exclamation-triangle mr-1"></i> Select a property</div>' +
        '<div class="small text-muted">Choose a Company and Property first.</div>';
      return;
    }

    fetchBtn.disabled = true;
    resultsEl.innerHTML = '<span class="text-muted">Fetching…</span>';

    var propertyId = currentPropertyId;
    var promises = [];
    var out = { rules: {}, libraries: null, dataElements: null, extensions: null };

    if (isChecked('opt-libraries-count')) {
      promises.push(getTotalCount('/properties/' + encodeURIComponent(propertyId) + '/libraries').then(function (n) { out.libraries = n; }));
    }
    if (isChecked('opt-rules-total')) {
      promises.push(getTotalCount('/properties/' + encodeURIComponent(propertyId) + '/rules').then(function (n) { out.rules.total = n; }));
    }
    if (isChecked('opt-rules-enabled')) {
      promises.push(getTotalCount('/properties/' + encodeURIComponent(propertyId) + '/rules?filter[enabled]=true').then(function (n) { out.rules.enabled = n; }));
    }
    if (isChecked('opt-rules-disabled')) {
      promises.push(getTotalCount('/properties/' + encodeURIComponent(propertyId) + '/rules?filter[enabled]=false').then(function (n) { out.rules.disabled = n; }));
    }
    if (isChecked('opt-de-count')) {
      promises.push(getTotalCount('/properties/' + encodeURIComponent(propertyId) + '/data_elements').then(function (n) { out.dataElements = n; }));
    }
    if (isChecked('opt-ext-count')) {
      promises.push(getTotalCount('/properties/' + encodeURIComponent(propertyId) + '/extensions').then(function (n) { out.extensions = n; }));
    }

    Promise.all(promises)
      .then(function () {
        var html = '';
        html += '<div class="mb-2 small text-muted">Property: <span style="font-weight:600">' + (propertyEl ? propertyEl.options[propertyEl.selectedIndex].textContent : propertyId) + '</span></div>';
        if (out.libraries != null) {
          html += formatCountsCard('Libraries', [{ label: 'Total libraries', value: out.libraries }]);
        }
        var ruleRows = [];
        if (typeof out.rules.total === 'number') ruleRows.push({ label: 'Total rules', value: out.rules.total });
        if (typeof out.rules.enabled === 'number') ruleRows.push({ label: 'Enabled rules', value: out.rules.enabled });
        if (typeof out.rules.disabled === 'number') ruleRows.push({ label: 'Disabled rules', value: out.rules.disabled });
        if (ruleRows.length) html += formatCountsCard('Rules', ruleRows);
        var miscRows = [];
        if (out.dataElements != null) miscRows.push({ label: 'Total data elements', value: out.dataElements });
        if (out.extensions != null) miscRows.push({ label: 'Total extensions', value: out.extensions });
        if (miscRows.length) html += formatCountsCard('Data Elements & Extensions', miscRows);

        resultsEl.innerHTML = html || '<span class="text-muted">No options selected.</span>';
      })
      .catch(function (err) {
        resultsEl.innerHTML =
          '<div class="text-danger font-weight-bold mb-2"><i class="fas fa-times-circle mr-1"></i> Fetch failed</div>' +
          '<div class="small text-muted">' + String(err.message || err) + '</div>';
      })
      .finally(function () {
        fetchBtn.disabled = false;
      });
  });

  // Back link: ensure it targets the extension's iframe when opened from extension
  var backLink = document.getElementById('back-to-simple');
  if (backLink && window.name === 'iframe2') {
    backLink.target = 'iframe2';
  }
})();

