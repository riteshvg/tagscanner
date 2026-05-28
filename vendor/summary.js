document.addEventListener('DOMContentLoaded', function () {
  console.log('Summary page loading...');

  // Move the tour button to the header at the beginning
  const summaryHeader = document.querySelector(
    'div[style="background-color: #4e73df"] h5'
  );
  if (summaryHeader) {
    const tourButton = document.createElement('button');
    tourButton.innerHTML = '<i class="fas fa-question-circle"></i> Tour Guide';
    tourButton.className = 'btn btn-sm btn-info ml-2';
    tourButton.style.float = 'right';
    tourButton.addEventListener('click', function () {
      startTour();
    });
    summaryHeader.appendChild(tourButton);
  }

  // Get data from sessionStorage
  const de_value = sessionStorage.getItem('_satellite._container.dataElements');
  const rule_value = sessionStorage.getItem('_satellite._container.rules');
  const extension_value = sessionStorage.getItem(
    '_satellite._container.extension'
  );

  if (!de_value || !rule_value) {
    // On the scan page, skip the no-data error and try to show a cached report instead
    if (document.getElementById('aiSectionBody')) {
      document.getElementById('set_display').style.display = 'none';
      var _cached = loadCachedAIReport();
      if (_cached && _cached.report) {
        renderHealthReport(_cached.report, _cached.tokens, _cached.costUsd, true, _cached.ts, null);
        showAIState('report');
      } else {
        showAIState('prompt');
      }
      return;
    }
    document.getElementById('set_display').style.display = 'none';
    document.querySelector('.container-fluid').innerHTML =
      '<div class="alert alert-danger mt-4">No data found. Please refresh the website and reload the extension.</div>';
    return;
  }

  var _tsA = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
  if (_tsA) _tsA.page('TagScanner:Summary', { events: 'event12' });

  // Remove all h6 headers from component lists
  const headers = document.querySelectorAll('.component-list h6');
  headers.forEach((header) => {
    header.style.display = 'none';
  });

  try {
    function normalizeToObjectMap(raw, getKey) {
      if (!raw) return {};
      // If already an object map, return it
      if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
      // If array, convert to map using getKey
      if (Array.isArray(raw)) {
        return raw.reduce((acc, item, idx) => {
          const k = (item && typeof item === 'object') ? (getKey(item) || '') : '';
          const key = k || String(idx);
          acc[key] = item;
          return acc;
        }, {});
      }
      return {};
    }

    const dataElementsRaw = JSON.parse(de_value);
    const dataElements = normalizeToObjectMap(dataElementsRaw, (de) => de.name || de.id);
    const rulesRaw = JSON.parse(rule_value);
    const rules = Array.isArray(rulesRaw)
      ? rulesRaw
      : rulesRaw && Array.isArray(rulesRaw.rules)
        ? rulesRaw.rules
        : rulesRaw && typeof rulesRaw === 'object'
          ? Object.values(rulesRaw).filter(
              (item) => item && typeof item === 'object'
            )
          : [];
    let extensionsRaw = extension_value ? JSON.parse(extension_value) : {};
    let extensions = normalizeToObjectMap(extensionsRaw, (ext) => ext.name || ext.displayName || ext.id);
    if (typeof extensions !== 'object' || extensions === null) extensions = {};

    console.log('Data elements parsed:', Object.keys(dataElements).length);
    console.log('Rules parsed:', rules.length);
    console.log('Extensions parsed:', Object.keys(extensions).length);

    // Initialize usage tracking
    const usageData = {
      dataElements: {},
      rules: {},
      extensions: {},
    };

    function getCustomCodeStringsFromComponent(comp) {
      const out = [];
      if (!comp || typeof comp !== 'object') return out;
      // Common places custom code lives in Launch components
      try {
        if (comp.settings) {
          if (typeof comp.settings.source === 'string') out.push(comp.settings.source);
          if (typeof comp.settings.script === 'string') out.push(comp.settings.script);
          if (typeof comp.settings.customCode === 'string') out.push(comp.settings.customCode);
          if (typeof comp.settings.code === 'string') out.push(comp.settings.code);
        }
        if (typeof comp.source === 'string') out.push(comp.source);
      } catch (e) {}
      return out.filter(Boolean);
    }

    function markExtensionsUsedFromCustomCode(codeStr, ruleNameOrId) {
      if (!codeStr || typeof codeStr !== 'string') return;
      // Heuristic: turbine APIs are the common way to call extensions from custom code.
      // We look for extension keys inside turbine.getExtensionSettings('extKey') or turbine.getSharedModule('extKey', ...)
      const extKeys = Object.keys(usageData.extensions);
      if (!extKeys.length) return;
      const lower = codeStr.toLowerCase();
      extKeys.forEach((extKey) => {
        const k = String(extKey || '').toLowerCase();
        if (!k) return;
        // Require both "turbine" and the extension key to reduce false positives.
        if (lower.indexOf('turbine') === -1) return;
        // Match common call patterns
        const hasKey =
          lower.indexOf("turbine.getextensionsettings('" + k + "')") > -1 ||
          lower.indexOf('turbine.getextensionsettings(\"' + k + '\")') > -1 ||
          lower.indexOf("turbine.getsharedmodule('" + k + "'") > -1 ||
          lower.indexOf('turbine.getsharedmodule(\"' + k + '\"') > -1;
        if (hasKey && usageData.extensions[extKey]) {
          usageData.extensions[extKey].used = true;
          if (ruleNameOrId) usageData.extensions[extKey].usedInRules.push(ruleNameOrId);
        }
      });
    }

    // Calculate size function
    const calculateSize = (obj) => {
      let size = new Blob([JSON.stringify(obj)]).size;
      return Number((size / 1000).toFixed(2)); // Size in KB
    };

    // Returns true if a data element is implemented as custom code.
    // Custom-code DEs may be called from page-level JS (_satellite.getVar) in
    // contexts we cannot scan, so they should never be flagged as "unused".
    function deHasCustomCode(de) {
      if (!de) return false;
      if (de.modulePath && de.modulePath.indexOf('custom-code') > -1) return true;
      if (de.settings && (de.settings.source || de.settings.customCode)) return true;
      return false;
    }

    // Returns true if any component (event/condition/action) in the rule
    // contains custom code. Such rules may be triggered via _satellite.track()
    // from outside the property, so they should not be flagged as "unused".
    function ruleHasCustomCode(rule) {
      if (!rule) return false;
      var comps = [].concat(rule.events || [], rule.conditions || [], rule.actions || []);
      return comps.some(function (comp) {
        if (comp.modulePath && comp.modulePath.indexOf('custom-code') > -1) return true;
        if (comp.settings && (comp.settings.customCode || comp.settings.source)) return true;
        return false;
      });
    }

    // Initialize all extensions as unused and calculate their sizes
    let totalExtSize = 0;
    let unusedExtSize = 0;

    Object.keys(extensions).forEach((extName) => {
      const size = calculateSize(extensions[extName]);
      totalExtSize += size;

      usageData.extensions[extName] = {
        name: extensions[extName].displayName || extName,
        used: false,
        usedInRules: [],
        usedInDataElements: [],
        size: size,
      };
    });

    // Initialize all data elements as unused and calculate their sizes
    let totalDeSize = 0;
    let unusedDeSize = 0;

    Object.keys(dataElements).forEach((deName) => {
      const size = calculateSize(dataElements[deName]);
      totalDeSize += size;

      usageData.dataElements[deName] = {
        used: false,
        hasCustomCode: deHasCustomCode(dataElements[deName]),
        usedInRules: [],
        usedInDataElements: [],
        size: size,
      };

      // Check if this data element uses an extension
      if (dataElements[deName].modulePath) {
        const modulePath = dataElements[deName].modulePath.split('/')[0];
        if (usageData.extensions[modulePath]) {
          usageData.extensions[modulePath].used = true;
          usageData.extensions[modulePath].usedInDataElements.push(deName);
        }
      }
    });

    // Initialize all rules as unused and calculate their sizes
    let totalRuleSize = 0;
    let unusedRuleSize = 0;

    rules.forEach((rule, ruleIndex) => {
      const size = calculateSize(rule);
      totalRuleSize += size;
      const ruleKey = rule.id || rule.name || 'rule-' + ruleIndex;

      usageData.rules[ruleKey] = {
        name: rule.name || rule.id || 'Rule ' + (ruleIndex + 1),
        used: false,
        hasEvents: false,
        hasCustomCode: ruleHasCustomCode(rule),
        size: size,
      };

      // Rules with events are considered "used" as they can be triggered
      if (rule.events && rule.events.length > 0) {
        usageData.rules[ruleKey].used = true;
        usageData.rules[ruleKey].hasEvents = true;

        // Check if rule events use extensions
        rule.events.forEach((event) => {
          if (event.modulePath) {
            const modulePath = event.modulePath.split('/')[0];
            if (usageData.extensions[modulePath]) {
              usageData.extensions[modulePath].used = true;
              usageData.extensions[modulePath].usedInRules.push(
                rule.name || ruleKey
              );
            }
          }
        });
      }

      // Check if rule conditions use extensions
      if (rule.conditions && rule.conditions.length > 0) {
        rule.conditions.forEach((condition) => {
          if (condition.modulePath) {
            const modulePath = condition.modulePath.split('/')[0];
            if (usageData.extensions[modulePath]) {
              usageData.extensions[modulePath].used = true;
              usageData.extensions[modulePath].usedInRules.push(
                rule.name || ruleKey
              );
            }
          }
        });
      }

      // Check if rule actions use extensions
      if (rule.actions && rule.actions.length > 0) {
        rule.actions.forEach((action) => {
          if (action.modulePath) {
            const modulePath = action.modulePath.split('/')[0];
            if (usageData.extensions[modulePath]) {
              usageData.extensions[modulePath].used = true;
              usageData.extensions[modulePath].usedInRules.push(
                rule.name || ruleKey
              );
            }
          }
          // Also scan custom code in actions for turbine-based extension usage
          getCustomCodeStringsFromComponent(action).forEach((s) => {
            markExtensionsUsedFromCustomCode(s, rule.name || ruleKey);
          });
        });
      }
    });

    // Match dataelement.js: same DE reference detection as the Data Elements tab
    function stringContainsDERef(str, deName) {
      if (!str || typeof str !== 'string' || !deName) return false;
      const value = '%' + deName + '%';
      const check1 = '_satellite.getVar("' + deName + '")';
      const check2 = "_satellite.getVar('" + deName + "')";
      return (
        str.indexOf(value) > -1 ||
        str.indexOf(check1) > -1 ||
        str.indexOf(check2) > -1
      );
    }

    function markDataElementUsedInRule(deName, ruleName) {
      const entry = usageData.dataElements[deName];
      if (!entry) return;
      entry.used = true;
      if (ruleName && !entry.usedInRules.includes(ruleName)) {
        entry.usedInRules.push(ruleName);
      }
    }

    rules.forEach((rule, ruleIndex) => {
      const ruleName = rule.name || rule.id || 'Rule ' + (ruleIndex + 1);
      if (
        typeof window !== 'undefined' &&
        window.TagScannerDataElementRefs &&
        window.TagScannerDataElementRefs.getDENamesReferencedInRule
      ) {
        window.TagScannerDataElementRefs
          .getDENamesReferencedInRule(rule, dataElements)
          .forEach((deName) => {
            markDataElementUsedInRule(deName, ruleName);
          });
      } else {
        Object.keys(dataElements).forEach((deName) => {
          const actionStr = JSON.stringify(rule.actions || []);
          const conditionStr = JSON.stringify(rule.conditions || []);
          const eventStr = JSON.stringify(rule.events || []);
          if (
            stringContainsDERef(actionStr, deName) ||
            stringContainsDERef(conditionStr, deName) ||
            stringContainsDERef(eventStr, deName) ||
            eventStr.indexOf(deName) > -1
          ) {
            markDataElementUsedInRule(deName, ruleName);
          }
        });
      }
    });

    function jsonMentionsDE(str, deName) {
      if (
        typeof window !== 'undefined' &&
        window.TagScannerDataElementRefs &&
        window.TagScannerDataElementRefs.jsonMentionsDataElement
      ) {
        return window.TagScannerDataElementRefs.jsonMentionsDataElement(str, deName);
      }
      return stringContainsDERef(str, deName);
    }

    Object.keys(dataElements).forEach((deName) => {
      Object.keys(extensions).forEach((extKey) => {
        const extStr = JSON.stringify(extensions[extKey]);
        if (jsonMentionsDE(extStr, deName)) {
          usageData.dataElements[deName].used = true;
        }
      });
    });

    Object.keys(dataElements).forEach((deName) => {
      Object.keys(dataElements).forEach((otherKey) => {
        if (otherKey === deName) return;
        const other = dataElements[otherKey];
        const otherStr = JSON.stringify(other.settings || other);
        if (jsonMentionsDE(otherStr, deName)) {
          usageData.dataElements[deName].used = true;
          const entry = usageData.dataElements[deName];
          if (!entry.usedInDataElements.includes(otherKey)) {
            entry.usedInDataElements.push(otherKey);
          }
        }
      });
    });

    // Count unused components and their sizes.
    // Exclude items that contain custom code — they may be called from page-level
    // JavaScript (_satellite.getVar / _satellite.track) which we cannot scan.
    const unusedDataElements = Object.keys(usageData.dataElements).filter(
      (deName) => !usageData.dataElements[deName].used && !usageData.dataElements[deName].hasCustomCode
    );

    unusedDataElements.forEach((deName) => {
      unusedDeSize += usageData.dataElements[deName].size;
    });

    const unusedRules = Object.keys(usageData.rules).filter(
      (ruleId) => !usageData.rules[ruleId].used && !usageData.rules[ruleId].hasCustomCode
    );

    unusedRules.forEach((ruleId) => {
      unusedRuleSize += usageData.rules[ruleId].size;
    });

    // Count unused extensions
    const unusedExtensions = Object.keys(usageData.extensions).filter(
      (extName) => !usageData.extensions[extName].used
    );

    unusedExtensions.forEach((extName) => {
      unusedExtSize += usageData.extensions[extName].size;
    });

    // Update the UI
    document.getElementById('total-de-count').textContent =
      Object.keys(dataElements).length;
    document.getElementById('unused-de-count').textContent =
      unusedDataElements.length;

    document.getElementById('total-rule-count').textContent = rules.length;
    document.getElementById('unused-rule-count').textContent =
      unusedRules.length;

    // Add size information to the UI
    const deCardBody = document.querySelector(
      '.data-element-card .summary-card-body'
    );
    const ruleCardBody = document.querySelector(
      '.rule-card .summary-card-body'
    );

    const deSizeInfo = document.createElement('div');
    deSizeInfo.className = 'text-center mt-3';
    const deTotalCount = Object.keys(dataElements).length;
    const deUnusedPct =
      deTotalCount > 0
        ? Math.round((unusedDataElements.length / deTotalCount) * 100)
        : 0;
    deSizeInfo.innerHTML = `
      <div class="unused-label">You save</div>
      <div class="unused-count">${unusedDeSize.toFixed(2)} KB - (${deUnusedPct}%)</div>
      <div class="unused-label">of <strong>${totalDeSize.toFixed(
        2
      )}</strong> KB total if the following data elements are disabled.</div>
    `;
    deCardBody.querySelector('.row').after(deSizeInfo);

    const ruleSizeInfo = document.createElement('div');
    ruleSizeInfo.className = 'text-center mt-3';
    ruleSizeInfo.innerHTML = `
      <div class="unused-label">You save</div>
      <div class="unused-count">${unusedRuleSize.toFixed(2)} KB - (${
      rules.length > 0
        ? Math.round((unusedRules.length / rules.length) * 100)
        : 0
    }%)</div>
      <div class="unused-label">of ${totalRuleSize.toFixed(
        2
      )} KB total if the rules are disabled.</div>
    `;
    ruleCardBody.querySelector('.row').after(ruleSizeInfo);

    // ── Unused components quick-list (always-visible static section) ─────────
    (function renderUnusedSummary() {
      var section  = document.getElementById('unusedSummarySection');
      if (!section) return;

      var deList   = document.getElementById('unusedDeQuickList');
      var ruleList = document.getElementById('unusedRuleQuickList');
      var extList  = document.getElementById('unusedExtQuickList');
      var deBadge  = document.getElementById('unusedDeCountBadge');
      var ruleBadge = document.getElementById('unusedRuleCountBadge');
      var extBadge = document.getElementById('unusedExtCountBadge');
      var pillsEl  = document.getElementById('unusedStatsPills');
      var divider  = document.getElementById('tsAiDivider');

      var totalDe  = Object.keys(dataElements).length;
      var totalRl  = rules ? rules.length : 0;
      var totalExt = Object.keys(extensions).length;
      var unusedDe = unusedDataElements.length;
      var unusedRl = unusedRules.length;
      var unusedEx = unusedExtensions.length;

      if (deBadge)  deBadge.textContent  = unusedDe;
      if (ruleBadge) ruleBadge.textContent = unusedRl;
      if (extBadge) extBadge.textContent  = unusedEx;

      // Stats pills
      if (pillsEl) {
        var deColor  = unusedDe > 0 ? 'red'    : 'green';
        var rlColor  = unusedRl > 0 ? 'orange' : 'green';
        var extColor = unusedEx > 0 ? 'orange' : 'green';
        pillsEl.innerHTML = [
          '<div class="ts-stat-pill"><span class="ts-stat-pill-num blue">'  + totalDe  + '</span> Data Elements</div>',
          '<div class="ts-stat-pill"><span class="ts-stat-pill-num ' + deColor  + '">' + unusedDe + '</span> Unused DEs</div>',
          '<div class="ts-stat-pill"><span class="ts-stat-pill-num blue">'  + totalRl  + '</span> Rules</div>',
          '<div class="ts-stat-pill"><span class="ts-stat-pill-num ' + rlColor  + '">' + unusedRl + '</span> Unused Rules</div>',
          '<div class="ts-stat-pill"><span class="ts-stat-pill-num blue">'  + totalExt + '</span> Extensions</div>',
          '<div class="ts-stat-pill"><span class="ts-stat-pill-num ' + extColor + '">' + unusedEx + '</span> Unused Ext</div>',
        ].join('');
      }

      // Unused DE list
      if (deList) {
        if (unusedDe === 0) {
          deList.innerHTML = '<div class="ts-unused-empty"><i class="fas fa-check-circle"></i>None — all data elements are referenced.</div>';
        } else {
          deList.innerHTML = unusedDataElements.map(function(deName) {
            var size = usageData.dataElements[deName] ? usageData.dataElements[deName].size : '';
            return '<div class="ts-unused-row">' +
              '<span class="ts-unused-row-name">' + deName.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</span>' +
              (size !== '' ? '<span class="ts-unused-row-size">' + size + ' KB</span>' : '') +
              '</div>';
          }).join('');
        }
      }

      // Unused Rule list
      if (ruleList) {
        if (unusedRl === 0) {
          ruleList.innerHTML = '<div class="ts-unused-empty"><i class="fas fa-check-circle"></i>None — all rules are active.</div>';
        } else {
          ruleList.innerHTML = unusedRules.map(function(ruleId) {
            var entry = usageData.rules[ruleId];
            var name  = entry ? (entry.name || ruleId) : ruleId;
            var size  = entry ? entry.size : '';
            return '<div class="ts-unused-row">' +
              '<span class="ts-unused-row-name">' + name.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</span>' +
              (size !== '' ? '<span class="ts-unused-row-size">' + size + ' KB</span>' : '') +
              '</div>';
          }).join('');
        }
      }

      // Unused Extension list
      if (extList) {
        if (unusedEx === 0) {
          extList.innerHTML = '<div class="ts-unused-empty"><i class="fas fa-check-circle"></i>None — all extensions are referenced.</div>';
        } else {
          extList.innerHTML = unusedExtensions.map(function(extKey) {
            var entry = usageData.extensions[extKey];
            var name  = entry ? (entry.name || extKey) : extKey;
            var size  = entry ? entry.size : '';
            return '<div class="ts-unused-row">' +
              '<span class="ts-unused-row-name">' + name.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</span>' +
              (size !== '' ? '<span class="ts-unused-row-size">' + size + ' KB</span>' : '') +
              '</div>';
          }).join('');
        }
      }

      // ── Copy-table buttons ──────────────────────────────────────────────────
      function makeTSV(headers, rows) {
        return [headers.join('\t')]
          .concat(rows.map(function(r) { return r.join('\t'); }))
          .join('\n');
      }

      function attachCopyBtn(btnId, buildRows) {
        var btn = document.getElementById(btnId);
        if (!btn) return;
        btn.addEventListener('click', function () {
          var tsv = buildRows();
          navigator.clipboard.writeText(tsv).then(function () {
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            btn.classList.add('copied');
            setTimeout(function () {
              btn.innerHTML = '<i class="fas fa-copy"></i> Copy';
              btn.classList.remove('copied');
            }, 1800);
          }).catch(function () {
            // fallback for older contexts
            var ta = document.createElement('textarea');
            ta.value = tsv;
            ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            btn.classList.add('copied');
            setTimeout(function () {
              btn.innerHTML = '<i class="fas fa-copy"></i> Copy';
              btn.classList.remove('copied');
            }, 1800);
          });
        });
      }

      attachCopyBtn('copyDeTableBtn', function () {
        if (unusedDe === 0) return 'No unused data elements';
        return makeTSV(['Data Element', 'Size (KB)'], unusedDataElements.map(function (deName) {
          var size = usageData.dataElements[deName] ? usageData.dataElements[deName].size : '';
          return [deName, size];
        }));
      });

      attachCopyBtn('copyRuleTableBtn', function () {
        if (unusedRl === 0) return 'No unused rules';
        return makeTSV(['Rule', 'Size (KB)'], unusedRules.map(function (ruleId) {
          var entry = usageData.rules[ruleId];
          var name  = entry ? (entry.name || ruleId) : ruleId;
          var size  = entry ? entry.size : '';
          return [name, size];
        }));
      });

      attachCopyBtn('copyExtTableBtn', function () {
        if (unusedEx === 0) return 'No unused extensions';
        return makeTSV(['Extension', 'Size (KB)'], unusedExtensions.map(function (extKey) {
          var entry = usageData.extensions[extKey];
          var name  = entry ? (entry.name || extKey) : extKey;
          var size  = entry ? entry.size : '';
          return [name, size];
        }));
      });

      section.style.display = '';
      if (divider) divider.style.display = '';
    })();

    // Property details: use sessionStorage when set by popup, otherwise fallbacks
    const propertyName = sessionStorage.getItem('launch_property_name') || 'Unknown Property';
    const propertyEnvironment = sessionStorage.getItem('launch_property_environment') || 'Production';
    const tagScannerVersion = sessionStorage.getItem('tagScanner_version') || '2.3.0';
    const summaryGenerated = new Date().toLocaleString();

    const deCount = Object.keys(dataElements).length;
    const ruleCount = rules.length;
    const extCount = Object.keys(extensions).length;
    const totalComponents = deCount + ruleCount + extCount;
    const totalSizeKb = (totalDeSize + totalRuleSize + totalExtSize).toFixed(2);

    // Create property details card (values from already-computed counts)
    const propertyDetailsCard = document.createElement('div');
    propertyDetailsCard.className = 'card shadow mb-4 summary-card property-details-card';
    propertyDetailsCard.innerHTML =
      '<div class="summary-card-header" style="background-color: #36b9cc;">' +
        '<i class="fas fa-info-circle mr-2"></i> Property Details' +
      '</div>' +
      '<div class="summary-card-body">' +
        '<div class="row mb-3"><div class="col-md-4"><strong>Property Name:</strong></div><div class="col-md-8">' + propertyName + '</div></div>' +
        '<div class="row mb-3"><div class="col-md-4"><strong>Environment:</strong></div><div class="col-md-8">' + propertyEnvironment + '</div></div>' +
        '<div class="row mb-3"><div class="col-md-4"><strong>Summary Generated:</strong></div><div class="col-md-8">' + summaryGenerated + '</div></div>' +
        '<div class="row mb-3"><div class="col-md-4"><strong>Data Elements:</strong></div><div class="col-md-8">' + deCount + ' total (' + unusedDataElements.length + ' unused)</div></div>' +
        '<div class="row mb-3"><div class="col-md-4"><strong>Rules:</strong></div><div class="col-md-8">' + ruleCount + ' total (' + unusedRules.length + ' unused)</div></div>' +
        '<div class="row mb-3"><div class="col-md-4"><strong>Extensions:</strong></div><div class="col-md-8">' + extCount + ' total (' + unusedExtensions.length + ' unused)</div></div>' +
        '<div class="row mb-3"><div class="col-md-4"><strong>Total Components:</strong></div><div class="col-md-8">' + totalComponents + '</div></div>' +
        '<div class="row mb-3"><div class="col-md-4"><strong>Total Size:</strong></div><div class="col-md-8">' + totalSizeKb + ' KB</div></div>' +
        '<div class="row"><div class="col-md-4"><strong>TagScanner Version:</strong></div><div class="col-md-8">' + tagScannerVersion + '</div></div>' +
      '</div>';

    // Create copy button for property details card
    const propDetailsCopyButton = document.createElement('div');
    propDetailsCopyButton.innerHTML = `<i class="fas fa-copy mr-1"></i> Copy Details`;
    propDetailsCopyButton.className = 'btn btn-sm btn-outline-light';
    propDetailsCopyButton.style.fontSize = '0.8rem';
    propDetailsCopyButton.style.cursor = 'pointer';
    propDetailsCopyButton.style.float = 'right';
    propDetailsCopyButton.style.marginTop = '-2px';
    propDetailsCopyButton.addEventListener('click', function () {
      copyCardToClipboard(
        propertyDetailsCard.querySelector('.summary-card-body'),
        'Property Details'
      );
    });

    // Add button to the card header
    propertyDetailsCard
      .querySelector('.summary-card-header')
      .appendChild(propDetailsCopyButton);

    // Create extension card and add it to the UI
    const extensionCard = document.createElement('div');
    extensionCard.className = 'card shadow mb-4 summary-card extension-card';
    extensionCard.innerHTML = `
      <div class="summary-card-header" style="background-color: #4e73df;">
        <i class="fas fa-puzzle-piece mr-2"></i> Extensions
      </div>
      <div class="summary-card-body">
        <div class="row">
          <div class="col-md-6 text-center">
            <div class="unused-count" id="unused-ext-count">${
              unusedExtensions.length
            }</div>
            <div class="unused-label">Unused</div>
          </div>
          <div class="col-md-6 text-center">
            <div class="unused-count" id="total-ext-count">${
              Object.keys(extensions).length
            }</div>
            <div class="unused-label">Total</div>
          </div>
        </div>
        <div class="component-list">
          <h6 class="mt-3">Unused Extensions:</h6>
          <ul id="unused-ext-list">
            ${unusedExtensions
              .map(
                (extName) => `<li>${usageData.extensions[extName].name}</li>`
              )
              .join('')}
          </ul>
        </div>
      </div>
    `;

    // Reorganize the card layout
    const dataElementCard = document.querySelector('.data-element-card');
    const ruleCard = document.querySelector('.rule-card');
    const parentRow = dataElementCard.parentNode.parentNode;

    // Clear the original layout
    parentRow.innerHTML = '';

    // Create first row with data element card and rule card
    const firstRow = document.createElement('div');
    firstRow.className = 'row mt-4';

    const deCol = document.createElement('div');
    deCol.className = 'col-md-6';
    deCol.appendChild(dataElementCard);

    const ruleCol = document.createElement('div');
    ruleCol.className = 'col-md-6';
    ruleCol.appendChild(ruleCard);

    firstRow.appendChild(deCol);
    firstRow.appendChild(ruleCol);

    // Create second row with extension card and property details card
    const secondRow = document.createElement('div');
    secondRow.className = 'row mt-2';

    const extCol = document.createElement('div');
    extCol.className = 'col-md-6';
    extCol.appendChild(extensionCard);

    const propertyCol = document.createElement('div');
    propertyCol.className = 'col-md-6';
    propertyCol.appendChild(propertyDetailsCard);

    secondRow.appendChild(extCol);
    secondRow.appendChild(propertyCol);

    // Add the rows to the parent container (hidden — AI section only)
    const container = parentRow.parentNode;
    firstRow.style.display  = 'none';
    secondRow.style.display = 'none';
    container.appendChild(firstRow);
    container.appendChild(secondRow);

    // Add extension size information
    const extCardBody = extensionCard.querySelector('.summary-card-body');
    const extSizeInfo = document.createElement('div');
    extSizeInfo.className = 'text-center mt-3';
    const extTotalCount = Object.keys(extensions).length;
    const extUnusedPct =
      extTotalCount > 0
        ? Math.round((unusedExtensions.length / extTotalCount) * 100)
        : 0;
    extSizeInfo.innerHTML = `
      <div class="unused-label">You save</div>
      <div class="unused-count">${unusedExtSize.toFixed(2)} KB - (${extUnusedPct}%)</div>
      <div class="unused-label">of ${totalExtSize.toFixed(
        2
      )} KB total if the extensions are disabled.</div>
    `;
    extCardBody.querySelector('.row').after(extSizeInfo);

    // Replace the unordered list with a table for data elements
    const unusedDeList = document.getElementById('unused-de-list');
    const deParent = unusedDeList.parentNode;

    // Create table element with reduced size
    const deTable = document.createElement('table');
    deTable.className = 'table table-bordered mt-3 tablesorter';
    deTable.id = 'de-table';

    // Create table element for rules
    const ruleTable = document.createElement('table');
    ruleTable.className = 'table table-sm table-bordered mt-3 tablesorter';
    ruleTable.id = 'rule-table';
    ruleTable.style.fontSize = '0.75rem';

    // Create table element for extensions
    const extTable = document.createElement('table');
    extTable.className = 'table table-sm table-bordered mt-3 tablesorter';
    extTable.id = 'ext-table';
    extTable.style.fontSize = '0.75rem';

    // Copy table to clipboard
    // Add copy button after the table
    const deCopyButton = document.createElement('div');
    deCopyButton.innerHTML = `<i class="fas fa-copy mr-1"></i> Copy Table`;
    deCopyButton.className = 'btn btn-sm btn-outline-light';
    deCopyButton.style.fontSize = '0.8rem';
    deCopyButton.style.cursor = 'pointer';
    deCopyButton.style.float = 'right';
    deCopyButton.style.marginTop = '-2px';
    deCopyButton.addEventListener('click', function () {
      copyTableToClipboard(deTable, 'Data Elements');
    });
    // Add button to the data element card header
    document
      .querySelector('.data-element-card .summary-card-header')
      .appendChild(deCopyButton);

    // Create table header
    const deTableHead = document.createElement('thead');
    deTableHead.innerHTML = `
      <tr>
        <th>Data Element Name</th>
        <th>Size (KB)</th>
      </tr>
    `;
    deTable.appendChild(deTableHead);

    // Create table body
    const deTableBody = document.createElement('tbody');
    unusedDataElements.forEach((deName) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      const sizeCell = document.createElement('td');

      nameCell.textContent = deName;
      sizeCell.textContent = usageData.dataElements[deName].size;
      sizeCell.setAttribute(
        'data-sort-value',
        usageData.dataElements[deName].size
      ); // For proper numeric sorting
      sizeCell.style.textAlign = 'right';

      row.appendChild(nameCell);
      row.appendChild(sizeCell);
      deTableBody.appendChild(row);
    });
    deTable.appendChild(deTableBody);

    // Replace the list with the table
    deParent.removeChild(unusedDeList);

    // Create a scrollable container for the table
    const deTableContainer = document.createElement('div');
    //deTableContainer.style.maxHeight = '200px';
    deTableContainer.style.overflowY = 'auto';
    deTableContainer.style.marginBottom = '10px';
    deTableContainer.appendChild(deTable);

    deParent.appendChild(deTableContainer);

    // Do the same for rules
    const unusedRuleList = document.getElementById('unused-rule-list');
    const ruleParent = unusedRuleList.parentNode;

    // Add copy button after the table
    const ruleCopyButton = document.createElement('div');
    ruleCopyButton.innerHTML = `<i class="fas fa-copy mr-1"></i> Copy Table`;
    ruleCopyButton.className = 'btn btn-sm btn-outline-light';
    ruleCopyButton.style.fontSize = '0.8rem';
    ruleCopyButton.style.cursor = 'pointer';
    ruleCopyButton.style.float = 'right';
    ruleCopyButton.style.marginTop = '-2px';
    ruleCopyButton.addEventListener('click', function () {
      copyTableToClipboard(ruleTable, 'Rules');
    });
    // Add button to the rule card header
    document
      .querySelector('.rule-card .summary-card-header')
      .appendChild(ruleCopyButton);

    // Create table header
    const ruleTableHead = document.createElement('thead');
    ruleTableHead.innerHTML = `
      <tr>
        <th>Rule Name</th>
        <th>Size (KB)</th>
      </tr>
    `;
    ruleTable.appendChild(ruleTableHead);

    // Create table body
    const ruleTableBody = document.createElement('tbody');
    unusedRules.forEach((ruleId) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      const sizeCell = document.createElement('td');

      nameCell.textContent = usageData.rules[ruleId].name;
      sizeCell.textContent = usageData.rules[ruleId].size;
      sizeCell.setAttribute('data-sort-value', usageData.rules[ruleId].size); // For proper numeric sorting
      sizeCell.style.textAlign = 'right';

      row.appendChild(nameCell);
      row.appendChild(sizeCell);
      ruleTableBody.appendChild(row);
    });
    ruleTable.appendChild(ruleTableBody);

    // Replace the list with the table
    ruleParent.removeChild(unusedRuleList);

    // Create a scrollable container for the table
    const ruleTableContainer = document.createElement('div');
    ruleTableContainer.style.maxHeight = '200px';
    ruleTableContainer.style.overflowY = 'auto';
    ruleTableContainer.style.marginBottom = '10px';
    ruleTableContainer.appendChild(ruleTable);

    ruleParent.appendChild(ruleTableContainer);

    // Do the same for extensions
    const unusedExtList = document.getElementById('unused-ext-list');
    const unusedExtContainer = unusedExtList.parentNode;

    // Add copy button after the table
    const extCopyButton = document.createElement('div');
    extCopyButton.innerHTML = `<i class="fas fa-copy mr-1"></i> Copy Table`;
    extCopyButton.className = 'btn btn-sm btn-outline-light';
    extCopyButton.style.fontSize = '0.8rem';
    extCopyButton.style.cursor = 'pointer';
    extCopyButton.style.float = 'right';
    extCopyButton.style.marginTop = '-2px';
    extCopyButton.addEventListener('click', function () {
      copyTableToClipboard(extTable, 'Extensions');
    });
    // Add button to the extension card header
    document
      .querySelector('.extension-card .summary-card-header')
      .appendChild(extCopyButton);

    // Create table header
    const extTableHead = document.createElement('thead');
    extTableHead.innerHTML = `
      <tr>
        <th>Extension Name</th>
        <th>Size (KB)</th>
      </tr>
    `;
    extTable.appendChild(extTableHead);

    // Create table body
    const extTableBody = document.createElement('tbody');
    unusedExtensions.forEach((extName) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      const sizeCell = document.createElement('td');

      nameCell.textContent = usageData.extensions[extName].name;
      sizeCell.textContent = usageData.extensions[extName].size;
      sizeCell.setAttribute(
        'data-sort-value',
        usageData.extensions[extName].size
      ); // For proper numeric sorting
      sizeCell.style.textAlign = 'right';

      row.appendChild(nameCell);
      row.appendChild(sizeCell);
      extTableBody.appendChild(row);
    });
    extTable.appendChild(extTableBody);

    // Replace the list with the table
    unusedExtContainer.removeChild(unusedExtList);

    // Create a scrollable container for the table
    const extTableContainer = document.createElement('div');
    extTableContainer.style.maxHeight = '200px';
    extTableContainer.style.overflowY = 'auto';
    extTableContainer.style.marginBottom = '10px';
    extTableContainer.appendChild(extTable);

    unusedExtContainer.appendChild(extTableContainer);

    // Initialize tablesorter
    setTimeout(() => {
      try {
        $('#de-table').tablesorter({
          theme: 'blue',
          widgets: ['zebra'],
          headers: {
            1: { sorter: 'digit' }, // Ensure the size column is sorted as numbers
          },
        });

        $('#rule-table').tablesorter({
          theme: 'blue',
          widgets: ['zebra'],
          headers: {
            1: { sorter: 'digit' }, // Ensure the size column is sorted as numbers
          },
        });

        $('#ext-table').tablesorter({
          theme: 'blue',
          widgets: ['zebra'],
          headers: {
            1: { sorter: 'digit' }, // Ensure the size column is sorted as numbers
          },
        });

        console.log('Tables initialized with sorting capability');
      } catch (error) {
        console.error('Error initializing tablesorter:', error);
      }
    }, 100);

    // Set up print-friendly section for PDF generation
    const today = new Date();
    const dateStr = today.toLocaleDateString();
    const timeStr = today.toLocaleTimeString();

    document.getElementById('print-title').textContent = 'Adobe Tags | Summary';
    document.getElementById(
      'print-property'
    ).textContent = `Property: ${propertyName}`;
    document.getElementById(
      'print-date'
    ).textContent = `Generated: ${dateStr} ${timeStr}`;

    // Add property environment to print section
    const printEnv = document.createElement('p');
    printEnv.id = 'print-environment';
    printEnv.textContent = `Environment: ${propertyEnvironment}`;
    document.getElementById('print-date').after(printEnv);

    // Add summary stats
    const printStats = document.createElement('p');
    printStats.id = 'print-stats';
    printStats.textContent = `Total Components: ${
      Object.keys(dataElements).length +
      rules.length +
      Object.keys(extensions).length
    } | Total Size: ${(totalDeSize + totalRuleSize + totalExtSize).toFixed(
      2
    )} KB`;
    printEnv.after(printStats);

    // Add TagScanner version
    const printVersion = document.createElement('p');
    printVersion.id = 'print-version';
    printVersion.textContent = `TagScanner Version: 2.3.0`;
    printStats.after(printVersion);

    document.getElementById(
      'print-de-summary'
    ).textContent = `Total Data Elements: ${
      Object.keys(dataElements).length
    } (${totalDeSize.toFixed(2)} KB)
       Unused Data Elements: ${
         unusedDataElements.length
       } (${unusedDeSize.toFixed(2)} KB - ${deUnusedPct}%)`;

    document.getElementById('print-rule-summary').textContent = `Total Rules: ${
      rules.length
    } (${totalRuleSize.toFixed(2)} KB)
       Unused Rules: ${unusedRules.length} (${unusedRuleSize.toFixed(2)} KB - ${
      rules.length > 0
        ? Math.round((unusedRules.length / rules.length) * 100)
        : 0
    }%)`;

    // Update print section to include extensions
    const printSection = document.getElementById('print-section');

    // Create extensions header
    const extHeader = document.createElement('h2');
    extHeader.className = 'print-header';
    extHeader.textContent = 'Unused Extensions';

    // Create extensions summary
    const extSummary = document.createElement('p');
    extSummary.id = 'print-ext-summary';
    extSummary.textContent = `Total Extensions: ${
      Object.keys(extensions).length
    } (${totalExtSize.toFixed(2)} KB)
       | Unused Extensions: ${unusedExtensions.length} (${unusedExtSize.toFixed(
      2
    )} KB - ${extTotalCount > 0 ? Math.round((unusedExtensions.length / extTotalCount) * 100) : 0}%)`;

    // Create extensions table
    const extPrintTable = document.createElement('table');
    extPrintTable.className = 'print-table';
    extPrintTable.id = 'print-ext-table';

    const extPrintThead = document.createElement('thead');
    extPrintThead.innerHTML = `
      <tr>
        <th>Extension Name</th>
        <th>Size (KB)</th>
      </tr>
    `;

    const extPrintTbody = document.createElement('tbody');
    extPrintTbody.id = 'print-ext-tbody';

    extPrintTable.appendChild(extPrintThead);
    extPrintTable.appendChild(extPrintTbody);

    // Insert before recommendations
    const recommendationsHeader = document.querySelector(
      '#print-section h2:last-of-type'
    );
    printSection.insertBefore(extHeader, recommendationsHeader);
    printSection.insertBefore(extSummary, recommendationsHeader);
    printSection.insertBefore(extPrintTable, recommendationsHeader);

    document.getElementById(
      'print-total-savings'
    ).textContent = `Total Potential Size Savings: ${(
      unusedDeSize +
      unusedRuleSize +
      unusedExtSize
    ).toFixed(2)} KB`;

    // Populate data element table
    const deTbody = document.getElementById('print-de-tbody');
    unusedDataElements.forEach((deName) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      const sizeCell = document.createElement('td');

      nameCell.textContent = deName;
      sizeCell.textContent = `${usageData.dataElements[deName].size} KB`;

      row.appendChild(nameCell);
      row.appendChild(sizeCell);
      deTbody.appendChild(row);
    });

    // Populate rule table
    const ruleTbody = document.getElementById('print-rule-tbody');
    unusedRules.forEach((ruleId) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      const sizeCell = document.createElement('td');

      nameCell.textContent = usageData.rules[ruleId].name;
      sizeCell.textContent = `${usageData.rules[ruleId].size} KB`;

      row.appendChild(nameCell);
      row.appendChild(sizeCell);
      ruleTbody.appendChild(row);
    });

    // Populate extension table
    var printExtTbody = document.getElementById('print-ext-tbody');
    if (printExtTbody) {
      unusedExtensions.forEach((extName) => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        const sizeCell = document.createElement('td');
        nameCell.textContent = usageData.extensions[extName].name;
        sizeCell.textContent = `${usageData.extensions[extName].size} KB`;
        row.appendChild(nameCell);
        row.appendChild(sizeCell);
        printExtTbody.appendChild(row);
      });
    }

    // Add recommendations
    const recommendationsList = document.getElementById(
      'print-recommendations'
    );

    const rec1 = document.createElement('li');
    rec1.textContent = `Consider removing unused data elements to save approximately ${unusedDeSize.toFixed(
      2
    )} KB.`;
    recommendationsList.appendChild(rec1);

    const rec2 = document.createElement('li');
    rec2.textContent = `Review unused rules to potentially save ${unusedRuleSize.toFixed(
      2
    )} KB.`;
    recommendationsList.appendChild(rec2);

    // Add extension recommendation if there are unused extensions
    if (unusedExtensions.length > 0) {
      const extRec = document.createElement('li');
      extRec.textContent = `Consider disabling unused extensions to save approximately ${unusedExtSize.toFixed(
        2
      )} KB.`;
      recommendationsList.appendChild(extRec);
    }

    const rec3 = document.createElement('li');
    rec3.textContent =
      'Regularly audit your Adobe Tags implementation to maintain optimal performance.';
    recommendationsList.appendChild(rec3);

    const rec4 = document.createElement('li');
    rec4.textContent =
      'Check if any unused components are planned for future use before removing them.';
    recommendationsList.appendChild(rec4);

    const rec5 = document.createElement('li');
    rec5.textContent =
      'Please test the recommendations extensively in lower environment before pushing to Production. TagScanner cannot be held liable for any issues or bugs in your implementation.';
    recommendationsList.appendChild(rec5);

    // Set up PDF download using print functionality
    var downloadBtn = document.getElementById('download-pdf');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', function () {
        var _tsA2 = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
        if (_tsA2) _tsA2.track('Export:PDF', { pageName: 'TagScanner:Summary', events: 'event4', v5: 'PDF', c2: 'Export' });
        window.print();
      });
    }

    // Initialize AI scan section only on scan.html (where #aiSectionBody exists)
    if (document.getElementById('aiSectionBody')) {
      initAIScanSection({
        dataElements:       dataElements,
        rules:              rules,
        extensions:         extensions,
        usageData:          usageData,
        unusedDataElements: unusedDataElements,
        unusedRules:        unusedRules,
        unusedExtensions:   unusedExtensions,
        sizes: {
          totalDeSize:    totalDeSize,
          totalRuleSize:  totalRuleSize,
          totalExtSize:   totalExtSize,
          unusedDeSize:   unusedDeSize,
          unusedRuleSize: unusedRuleSize,
          unusedExtSize:  unusedExtSize
        }
      });
    }

    // Hide loading spinner
    document.getElementById('set_display').style.display = 'none';

    // Note: Tour is now handled by tour-initializer.js and only starts when user clicks "Take a Tour" button
    // This prevents conflicts between auto-starting tour and manual tour
  } catch (error) {
    console.error('Error analyzing component usage:', error);
    document.getElementById('set_display').style.display = 'none';
    document.querySelector(
      '.container-fluid'
    ).innerHTML = `<div class="alert alert-danger mt-4">Error analyzing component usage: ${error.message}</div>`;
  }

  // Remove "Unused Data Elements" and "Unused Rules" headers
  setTimeout(() => {
    // Find and remove the h6 headers
    const headers = document.querySelectorAll('.component-list h6');
    headers.forEach((header) => {
      if (
        header.textContent.includes('Unused Data Elements') ||
        header.textContent.includes('Unused Rules') ||
        header.textContent.includes('Unused Extensions')
      ) {
        header.style.display = 'none';
      }
    });
  }, 1000);
});

// Function to define and start the tour - DEPRECATED
// This function is no longer used as tours are now handled by tour-initializer.js
// Keeping for reference but not called anywhere
function startTour() {
  console.log('startTour function called - this should not happen');
  // Tour functionality moved to tour-initializer.js
}

// Add function to copy table to clipboard
function copyTableToClipboard(table, componentType) {
  // Show processing message
  const message = document.createElement('div');
  message.textContent = 'Processing...';
  message.style.color = '#666';
  message.style.marginTop = '5px';
  message.style.marginBottom = '8px';
  message.style.fontSize = '12px';
  message.style.textAlign = 'center';
  table.parentNode.insertBefore(message, table);

  // Take screenshot of table
  html2canvas(table).then((canvas) => {
    // Try to copy to clipboard
    canvas.toBlob((blob) => {
      try {
        // For modern browsers
        navigator.clipboard
          .write([new ClipboardItem({ 'image/png': blob })])
          .then(() => {
            message.textContent = `✓ ${componentType} copied to clipboard!`;
            message.style.color = 'green';
            setTimeout(() => message.remove(), 3000);
          })
          .catch((err) => {
            // Fallback for clipboard API failure
            message.textContent =
              '× Error: Please right-click the image below and copy it';
            message.style.color = 'red';

            // Show the canvas as fallback
            canvas.style.maxWidth = '100%';
            canvas.style.border = '1px solid #ddd';
            canvas.style.marginTop = '10px';
            message.parentNode.insertBefore(canvas, message.nextSibling);
          });
      } catch (e) {
        // Fallback for browsers without clipboard API
        message.textContent =
          '× Please right-click the image below and copy it';
        message.style.color = 'red';

        // Show the canvas as fallback
        canvas.style.maxWidth = '100%';
        canvas.style.border = '1px solid #ddd';
        canvas.style.marginTop = '10px';
        message.parentNode.insertBefore(canvas, message.nextSibling);
      }
    });
  });
}

// ── AI Health Analysis ──────────────────────────────────────────────────────

var AI_CACHE_VERSION = 1;
var _aiHealthData = null;

function getAICacheKey() {
  var p = sessionStorage.getItem('launch_property_name') || 'Unknown';
  var e = sessionStorage.getItem('launch_property_environment') || 'Production';
  return 'ts_health_' + p.replace(/[^a-z0-9]/gi, '_') + '_' + e.replace(/[^a-z0-9]/gi, '_');
}

function loadCachedAIReport() {
  try {
    // Try property-specific key first, fall back to the latest scan regardless of property
    var raw = localStorage.getItem(getAICacheKey()) || localStorage.getItem('ts_health_latest');
    if (!raw) return null;
    var obj = JSON.parse(raw);
    return (obj && obj.v === AI_CACHE_VERSION) ? obj : null;
  } catch (e) { return null; }
}

function saveCachedAIReport(report, tokens, costUsd, fingerprint) {
  try {
    var entry = JSON.stringify({
      v:           AI_CACHE_VERSION,
      ts:          Date.now(),
      report:      report,
      tokens:      tokens,
      costUsd:     costUsd,
      fingerprint: fingerprint || null
    });
    localStorage.setItem(getAICacheKey(), entry);
    localStorage.setItem('ts_health_latest', entry);
  } catch (e) {}
}

function getUserInfo() {
  if (window.TagScannerAuth && window.TagScannerAuth.isSignedIn()) {
    return window.TagScannerAuth.getSession();
  }
  try {
    var raw = localStorage.getItem('tagscanner_user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function showAIModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.add('show');
}
function hideAIModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

function showAIState(state) {
  document.getElementById('aiScanPrompt').style.display      = (state === 'prompt')   ? '' : 'none';
  document.getElementById('aiScanning').style.display        = (state === 'scanning') ? '' : 'none';
  document.getElementById('aiReportContainer').style.display = (state === 'report')   ? '' : 'none';
}

function setAIScanError(msg) {
  var el = document.getElementById('aiScanPromptMsg');
  if (el) el.innerHTML = '<span style="color:#ef4444"><i class="fas fa-exclamation-circle" style="margin-right:6px"></i>' + escAIHtml(msg) + '</span>';
}

function escAIHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function initAIScanSection(healthData) {
  _aiHealthData = healthData;

  if (window.TagScannerAuth && !window.TagScannerAuth.isSignedIn()) {
    try { localStorage.removeItem('tagscanner_user'); } catch (e) {}
  }

  document.getElementById('googleSignInClose').addEventListener('click', function() { hideAIModal('googleSignInModal'); });
  document.getElementById('btnGoogleSignIn').addEventListener('click', handleGoogleSignIn);
  document.getElementById('btnRunAIScan').addEventListener('click', handleScanClick);

  var cached = loadCachedAIReport();
  if (cached && cached.report) {
    renderHealthReport(cached.report, cached.tokens, cached.costUsd, true, cached.ts, null);
    showAIState('report');
  } else {
    showAIState('prompt');
  }
}

async function handleScanClick() {
  if (window.TagScannerAuth && window.TagScannerAuth.requireExplainConsent) {
    var consented = await window.TagScannerAuth.requireExplainConsent();
    if (!consented) return;
  }
  var _tsA = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
  if (_tsA) _tsA.track('Summary:AI Scan', { pageName: 'TagScanner:Summary', events: 'event5', v5: 'Summary', c2: 'AI Scan' });
  var session = window.TagScannerAuth && window.TagScannerAuth.getSession();
  if (!session) {
    showAIModal('googleSignInModal');
    return;
  }
  runAIScan(session, {});
}

async function handleGoogleSignIn() {
  var btn = document.getElementById('btnGoogleSignIn');
  var errEl = document.getElementById('googleSignInError');
  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Signing in…';
  if (errEl) errEl.style.display = 'none';

  try {
    var session = await window.TagScannerAuth.signInWithGoogle();
    hideAIModal('googleSignInModal');
    runAIScan(session, {});
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || 'Sign-in failed. Please try again.';
      errEl.style.display = 'block';
    }
    btn.disabled = false;
    btn.innerHTML = '<svg width="17" height="17" viewBox="0 0 48 48"><path fill="#4285F4" d="M47.53 24.56c0-1.6-.14-3.14-.4-4.62H24v8.73h13.2c-.57 3.03-2.3 5.59-4.9 7.32v6.08h7.93c4.64-4.28 7.3-10.58 7.3-17.51z"/><path fill="#34A853" d="M24 48c6.66 0 12.24-2.21 16.32-5.98l-7.93-6.08c-2.2 1.47-5.01 2.34-8.39 2.34-6.45 0-11.91-4.35-13.86-10.21H2.08v6.28C6.14 42.62 14.43 48 24 48z"/><path fill="#FBBC05" d="M10.14 28.07A14.42 14.42 0 0 1 9.6 24c0-1.41.24-2.78.54-4.07v-6.28H2.08A23.98 23.98 0 0 0 0 24c0 3.88.93 7.55 2.08 10.35l8.06-6.28z"/><path fill="#EA4335" d="M24 9.52c3.63 0 6.88 1.25 9.44 3.7l7.08-7.08C36.23 2.19 30.65 0 24 0 14.43 0 6.14 5.38 2.08 13.65l8.06 6.28C12.09 13.87 17.55 9.52 24 9.52z"/></svg> Continue with Google';
  }
}

async function runAIScan(user, config) {
  showAIState('scanning');
  var session = window.TagScannerAuth && window.TagScannerAuth.getSession();
  var effectiveConfig = Object.assign({}, config, {
    email:        user.email || '',
    sessionToken: session ? session.sessionToken : null,
    clientId:     (function(){ try { return sessionStorage.getItem('ts_device_id') || ''; } catch(e){ return ''; } }())
  });
  try {
    if (window.TagScannerHealthPayload.computeFingerprint) {
      try {
        effectiveConfig.fingerprint = await window.TagScannerHealthPayload.computeFingerprint({
          dataElements: _aiHealthData.dataElements,
          rules:        _aiHealthData.rules,
          extensions:   _aiHealthData.extensions
        });
      } catch (e) {}
    }

    var payload = window.TagScannerHealthPayload.build({
      dataElements:       _aiHealthData.dataElements,
      rules:              _aiHealthData.rules,
      extensions:         _aiHealthData.extensions,
      usageData:          _aiHealthData.usageData,
      unusedDataElements: _aiHealthData.unusedDataElements,
      unusedRules:        _aiHealthData.unusedRules,
      unusedExtensions:   _aiHealthData.unusedExtensions,
      sizes:              _aiHealthData.sizes
    });
    var userContext = { email: user.email, role: user.role || '', concern: user.concern || '' };
    var result = await window.TagScannerBedrock.analyzeProperty(payload, userContext, effectiveConfig);
    if (result.queryId) {
      try { localStorage.setItem('tagscanner_last_query_id', result.queryId); } catch(e) {}
    }
    if (!result.cached) {
      saveCachedAIReport(result.report, result.tokens, result.cost_usd, effectiveConfig.fingerprint || null);
    }
    renderHealthReport(
      result.report, result.tokens, result.cost_usd,
      result.cached || false,
      result.cached_at ? new Date(result.cached_at).getTime() : Date.now(),
      result.cached_by || null
    );
    showAIState('report');
  } catch (err) {
    console.error('AI scan failed:', err);
    showAIState('prompt');
    var _errMsg = err.message || 'Unknown error';
    var _tsA = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
    if (_errMsg.indexOf('temporarily disabled') > -1) {
      var el = document.getElementById('aiScanPromptMsg');
      if (el) el.innerHTML = '<span style="color:#ef4444"><i class="fas fa-exclamation-circle" style="margin-right:6px"></i><strong>AI features are temporarily unavailable.</strong><br>Our AI service has been paused for the day. To report this or get help, email <a href="mailto:tagscannerfeedback@gmail.com" style="color:#ef4444;text-decoration:underline">tagscannerfeedback@gmail.com</a>.</span>';
      if (_tsA) _tsA.track('Summary:AI Scan:Disabled', { pageName: 'TagScanner:Summary', events: 'event8', v9: 'AI Disabled', c2: 'AI Scan' });
    } else {
      setAIScanError('Scan failed: ' + _errMsg);
      if (_tsA) _tsA.track('Summary:AI Scan:Error', { pageName: 'TagScanner:Summary', events: 'event8', v9: _errMsg.slice(0, 100), c2: 'AI Scan' });
    }
  }
}

function renderHealthReport(report, tokens, costUsd, fromCache, ts, cachedBy) {
  var container = document.getElementById('aiReportContainer');
  container.innerHTML = '';

  var score = (typeof report.health_score === 'number') ? report.health_score : 0;
  // Validate that grade matches score — correct client-side if AI is inconsistent
  var grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

  if (fromCache && cachedBy) {
    var cachedAtStr = ts ? new Date(ts).toLocaleString() : 'unknown time';
    var byStr = cachedBy.name
      ? escAIHtml(cachedBy.name) + ' &lt;' + escAIHtml(cachedBy.email || '') + '&gt;'
      : escAIHtml(cachedBy.email || 'unknown');
    var notice = document.createElement('div');
    notice.className = 'ai-cache-notice';
    notice.innerHTML =
      '<i class="fas fa-info-circle"></i>' +
      '<div><strong>Cached Analysis</strong><span>This report was originally generated on <strong>' + cachedAtStr + '</strong> by ' + byStr + '. ' +
      'The property composition has not changed since then — no new AI call was needed.</span></div>';
    container.appendChild(notice);
  }

  var meta = document.createElement('div');
  meta.className = 'ai-report-meta';
  var leftMeta = fromCache && cachedBy
    ? 'Served from cache · generated ' + (ts ? new Date(ts).toLocaleString() : '')
    : fromCache
      ? 'Cached · analyzed ' + (ts ? new Date(ts).toLocaleString() : '')
      : 'Just analyzed';
  meta.innerHTML = '<span>' + leftMeta + '</span>';
  container.appendChild(meta);

  var scoreRow = document.createElement('div');
  scoreRow.className = 'ai-score-row';
  var circle = document.createElement('div');
  circle.className = 'ai-score-circle ai-score-' + grade;
  circle.innerHTML = '<span class="ai-score-number">' + score + '</span><span class="ai-score-grade">Grade ' + escAIHtml(grade) + '</span>';
  scoreRow.appendChild(circle);
  var sumDiv = document.createElement('div');
  sumDiv.className = 'ai-executive-summary';
  sumDiv.textContent = report.executive_summary || '';
  scoreRow.appendChild(sumDiv);
  container.appendChild(scoreRow);


  var catScores = report.category_scores || {};
  var cats = [
    { key: 'rules',         label: 'Rules' },
    { key: 'data_elements', label: 'Data Elements' },
    { key: 'extensions',    label: 'Extensions' },
    { key: 'performance',   label: 'Performance' }
  ];
  var catGrid = document.createElement('div');
  catGrid.className = 'ai-category-scores';
  cats.forEach(function(cat) {
    var val = catScores[cat.key] || 0;
    var color = val >= 90 ? '#10b981' : val >= 80 ? '#3b82f6' : val >= 70 ? '#f59e0b' : val >= 60 ? '#f97316' : '#ef4444';
    var cell = document.createElement('div');
    cell.className = 'ai-cat-score';
    cell.innerHTML =
      '<div class="ai-cat-label">' + escAIHtml(cat.label) + '</div>' +
      '<div class="ai-cat-bar-wrap"><div class="ai-cat-bar" style="width:' + val + '%;background:' + color + '"></div></div>' +
      '<div class="ai-cat-value" style="color:' + color + '">' + val + '</div>';
    catGrid.appendChild(cell);
  });
  container.appendChild(catGrid);

  var critical = report.critical_issues || [];
  if (critical.length) {
    addAISubHeading(container, 'fas fa-exclamation-circle', 'Critical Issues');
    var grid = document.createElement('div');
    grid.className = 'ai-issues-grid';
    critical.forEach(function(issue) {
      var card = document.createElement('div');
      card.className = 'ai-issue-card ai-issue-critical';
      card.innerHTML =
        '<div class="ai-issue-title">' + escAIHtml(issue.title || '') + '</div>' +
        '<div class="ai-issue-body">' + escAIHtml(issue.description || '') + '</div>' +
        (issue.impact ? '<div class="ai-issue-fix" style="color:#92400e;background:rgba(245,158,11,0.08);border-radius:4px"><i class="fas fa-exclamation-circle" style="margin-right:4px;color:#f59e0b"></i>' + escAIHtml(issue.impact) + '</div>' : '') +
        (issue.fix ? '<div class="ai-issue-fix"><i class="fas fa-wrench"></i> ' + escAIHtml(issue.fix) + '</div>' : '');
      grid.appendChild(card);
    });
    container.appendChild(grid);
  }

  var warnings = report.warnings || [];
  if (warnings.length) {
    addAISubHeading(container, 'fas fa-exclamation-triangle', 'Warnings');
    var wgrid = document.createElement('div');
    wgrid.className = 'ai-issues-grid';
    warnings.forEach(function(w) {
      var card = document.createElement('div');
      card.className = 'ai-issue-card ai-issue-warning';
      card.innerHTML =
        '<div class="ai-issue-title">' + escAIHtml(w.title || '') + '</div>' +
        '<div class="ai-issue-body">' + escAIHtml(w.description || '') + '</div>' +
        (w.recommendation ? '<div class="ai-issue-fix"><i class="fas fa-lightbulb"></i> ' + escAIHtml(w.recommendation) + '</div>' : '');
      wgrid.appendChild(card);
    });
    container.appendChild(wgrid);
  }

  var wins = report.quick_wins || [];
  if (wins.length) {
    addAISubHeading(container, 'fas fa-bolt', 'Quick Wins');
    var wingrid = document.createElement('div');
    wingrid.className = 'ai-issues-grid';
    wins.forEach(function(win) {
      var card = document.createElement('div');
      card.className = 'ai-issue-card ai-issue-win';
      card.innerHTML =
        '<div class="ai-issue-title">' + escAIHtml(win.title || '') + '</div>' +
        '<div class="ai-issue-body">' + escAIHtml(win.description || '') + '</div>' +
        (win.estimated_savings_kb ? '<span class="ai-issue-savings">~' + win.estimated_savings_kb + ' KB saved</span>' : '');
      wingrid.appendChild(card);
    });
    container.appendChild(wingrid);
  }

  var recs = report.top_recommendations || [];
  if (recs.length) {
    addAISubHeading(container, 'fas fa-list-ol', 'Top Recommendations');
    var recsDiv = document.createElement('div');
    recs.forEach(function(rec, idx) {
      var card = document.createElement('div');
      card.className = 'ai-rec-card';
      var num = document.createElement('div');
      num.className = 'ai-rec-num';
      num.textContent = idx + 1;
      card.appendChild(num);
      var meta2 = inferRecMeta(rec);
      var body = document.createElement('div');
      body.className = 'ai-rec-body';
      body.innerHTML =
        '<i class="' + meta2.icon + '" style="margin-right:6px;color:' + meta2.color + '"></i>' +
        escAIHtml(rec) +
        '<br><span class="ai-rec-tag" style="background:' + meta2.tagBg + ';color:' + meta2.tagColor + '">' + meta2.label + '</span>';
      card.appendChild(body);
      recsDiv.appendChild(card);
    });
    container.appendChild(recsDiv);
  }

  // Use TagScanner's precisely computed sizes rather than AI-estimated values
  var realSizes = _aiHealthData && _aiHealthData.sizes;
  var realUnusedDe  = realSizes ? Math.round(realSizes.unusedDeSize  * 100) / 100 : null;
  var realUnusedRl  = realSizes ? Math.round(realSizes.unusedRuleSize * 100) / 100 : null;
  var realUnusedExt = realSizes ? Math.round(realSizes.unusedExtSize  * 100) / 100 : null;
  var realTotal     = realSizes ? Math.round((realSizes.unusedDeSize + realSizes.unusedRuleSize + realSizes.unusedExtSize) * 100) / 100 : null;
  var realTotalAll  = realSizes ? Math.round((realSizes.totalDeSize  + realSizes.totalRuleSize  + realSizes.totalExtSize)  * 100) / 100 : null;
  var realPct       = (realTotal !== null && realTotalAll > 0) ? Math.round((realTotal / realTotalAll) * 100) : null;

  if (realTotal !== null && realTotal > 0) {
    addAISubHeading(container, 'fas fa-tachometer-alt', 'Estimated Cleanup Impact');
    var impactDiv = document.createElement('div');
    impactDiv.style.cssText = 'background:#f8f9fc;border:1px solid #e3e6f0;border-radius:8px;padding:12px 16px;font-size:13px;color:#374151;';
    impactDiv.innerHTML =
      'Removing unused components could free <strong>' + realTotal + ' KB</strong>' +
      (realPct !== null ? ' (' + realPct + '% of total)' : '') + '. ' +
      'Rules: <strong>' + realUnusedRl + ' KB</strong>' +
      ' &nbsp;·&nbsp; Data Elements: <strong>' + realUnusedDe + ' KB</strong>' +
      (realUnusedExt > 0 ? ' &nbsp;·&nbsp; Extensions: <strong>' + realUnusedExt + ' KB</strong>' : '') + '.';
    container.appendChild(impactDiv);
  }

  if (fromCache && !cachedBy) {
    var footerRow = document.createElement('div');
    footerRow.style.cssText = 'text-align:right;margin-top:14px;padding-top:10px;border-top:1px solid #f3f4f6;font-size:11.5px;color:#9ca3af;';
    footerRow.innerHTML = '<button id="btnRescan" style="font-size:11.5px;color:#27c5c1;background:none;border:none;cursor:pointer;text-decoration:underline;padding:0;">Re-analyze</button>';
    container.appendChild(footerRow);

    document.getElementById('btnRescan').addEventListener('click', async function () {
      var cachedEntry = loadCachedAIReport();
      var storedFingerprint = cachedEntry && cachedEntry.fingerprint;
      var currentFingerprint;

      if (storedFingerprint && window.TagScannerHealthPayload && window.TagScannerHealthPayload.computeFingerprint) {
        try {
          currentFingerprint = await window.TagScannerHealthPayload.computeFingerprint({
            dataElements: _aiHealthData.dataElements,
            rules:        _aiHealthData.rules,
            extensions:   _aiHealthData.extensions
          });
        } catch (e) {}
      }

      var compositionUnchanged = currentFingerprint && storedFingerprint && currentFingerprint === storedFingerprint;
      var compositionChanged   = currentFingerprint && storedFingerprint && currentFingerprint !== storedFingerprint;

      if (compositionUnchanged) {
        var existing = document.getElementById('rescan-unchanged-notice');
        if (existing) { existing.remove(); return; }
        var noticeEl = document.createElement('div');
        noticeEl.id = 'rescan-unchanged-notice';
        noticeEl.style.cssText = 'margin-top:10px;padding:10px 12px;background:#fefce8;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:6px;font-size:12px;color:#92400e;text-align:left;';
        noticeEl.innerHTML =
          '<strong><i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>Property unchanged</strong>' +
          '<div style="margin-top:4px;">The data elements, rules, and extensions in this property have not changed since this report was generated.</div>' +
          '<div style="margin-top:8px;"><button id="btnRescanCancel" style="padding:4px 12px;font-size:12px;background:none;border:1px solid #fde68a;border-radius:4px;cursor:pointer;color:#92400e;">Cancel</button></div>';
        footerRow.appendChild(noticeEl);
        document.getElementById('btnRescanCancel').addEventListener('click', function () { noticeEl.remove(); });
        return;
      }

      if (compositionChanged) {
        var existingOverlay = document.getElementById('rescan-changed-overlay');
        if (existingOverlay) { existingOverlay.remove(); }
        var overlay = document.createElement('div');
        overlay.id = 'rescan-changed-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
        var modal = document.createElement('div');
        modal.style.cssText = 'background:#fff;border-radius:10px;padding:24px 28px;max-width:360px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.18);font-size:13px;color:#1e293b;text-align:left;';
        modal.innerHTML =
          '<div style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600;color:#1d4ed8;margin-bottom:10px;"><i class="fas fa-sync-alt"></i>Property has changed</div>' +
          '<div style="color:#374151;line-height:1.5;">The property composition has changed since this report was generated. Re-analyzing will reflect the latest state.</div>' +
          '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">' +
            '<button id="btnRescanCancel" style="padding:6px 16px;font-size:12px;background:none;border:1px solid #cbd5e1;border-radius:5px;cursor:pointer;color:#64748b;">Cancel</button>' +
            '<button id="btnRescanConfirm" style="padding:6px 16px;font-size:12px;background:#3b82f6;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:500;">Re-analyze</button>' +
          '</div>';
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        document.getElementById('btnRescanConfirm').addEventListener('click', function () { overlay.remove(); localStorage.removeItem(getAICacheKey()); localStorage.removeItem('ts_health_latest'); showAIState('prompt'); });
        document.getElementById('btnRescanCancel').addEventListener('click', function () { overlay.remove(); });
        overlay.addEventListener('click', function (e) { if (e.target === overlay) { overlay.remove(); } });
        return;
      }

      localStorage.removeItem(getAICacheKey()); localStorage.removeItem('ts_health_latest');
      showAIState('prompt');
    });
  }
}

function inferRecMeta(text) {
  var t = (text || '').toLowerCase();
  if (t.indexOf('unused') > -1 || t.indexOf('remov') > -1 || t.indexOf('clean') > -1 || t.indexOf('delet') > -1)
    return { icon: 'fas fa-trash-alt',       color: '#10b981', label: 'Cleanup',      tagBg: '#d1fae5', tagColor: '#065f46' };
  if (t.indexOf('custom code') > -1 || t.indexOf('hardcod') > -1 || t.indexOf('script') > -1)
    return { icon: 'fas fa-code',            color: '#8b5cf6', label: 'Custom Code',  tagBg: '#ede9fe', tagColor: '#5b21b6' };
  if (t.indexOf('condition') > -1 || t.indexOf('rule') > -1 || t.indexOf('event') > -1)
    return { icon: 'fas fa-wrench',          color: '#f59e0b', label: 'Rules',        tagBg: '#fef3c7', tagColor: '#92400e' };
  if (t.indexOf('extension') > -1)
    return { icon: 'fas fa-puzzle-piece',    color: '#4e73df', label: 'Extensions',   tagBg: '#dbeafe', tagColor: '#1e40af' };
  if (t.indexOf('performance') > -1 || t.indexOf('size') > -1 || t.indexOf('kb') > -1 || t.indexOf('load') > -1)
    return { icon: 'fas fa-tachometer-alt',  color: '#f97316', label: 'Performance',  tagBg: '#ffedd5', tagColor: '#9a3412' };
  if (t.indexOf('data element') > -1 || t.indexOf('variable') > -1)
    return { icon: 'fas fa-database',        color: '#27c5c1', label: 'Data Layer',   tagBg: '#ccfbf1', tagColor: '#065f46' };
  if (t.indexOf('audit') > -1 || t.indexOf('review') > -1 || t.indexOf('document') > -1)
    return { icon: 'fas fa-clipboard-check', color: '#6b7280', label: 'Governance',   tagBg: '#f3f4f6', tagColor: '#374151' };
  return   { icon: 'fas fa-lightbulb',       color: '#4e73df', label: 'Best Practice',tagBg: '#eff6ff', tagColor: '#1e40af' };
}

function addAISubHeading(container, iconClass, label) {
  var h = document.createElement('div');
  h.className = 'ai-sub-heading';
  h.innerHTML = '<i class="' + iconClass + '"></i> ' + escAIHtml(label);
  container.appendChild(h);
}

