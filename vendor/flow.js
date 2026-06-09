(function () {

  function generateFlowSkeleton() {
    // Pill geometry
    var PH = 26, RX = 13;

    // Column x anchors
    var DEX = 55,  DIV1 = 310;
    var RUX = 325, DIV2 = 592;
    var EXX = 610;

    // DE pills  [y, width]
    var de = [[65,165],[99,140],[133,175],[167,150],[201,160],[235,135]];
    // Rule pills [y, width]
    var ru = [[75,170],[135,155],[195,165],[245,145]];
    // Ext pills  [y, width]
    var ex = [[100,170],[178,155],[248,165]];

    function cy(y) { return y + RX; }
    function rx(x, w) { return x + w; }

    // Links: [fromColRight, fromIdx, toColLeft, toIdx]
    var deToRu = [[0,0],[0,1],[2,0],[2,2],[4,2],[5,3]];
    var ruToEx  = [[0,0],[1,0],[2,1],[2,2],[3,2]];

    var parts = [];

    parts.push('<svg width="100%" viewBox="0 0 900 320" preserveAspectRatio="xMidYMid meet" style="display:block;overflow:visible">');

    // Column dividers
    parts.push('<line x1="' + DIV1 + '" y1="18" x2="' + DIV1 + '" y2="292" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4 4"/>');
    parts.push('<line x1="' + DIV2 + '" y1="18" x2="' + DIV2 + '" y2="292" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4 4"/>');

    // Column header labels
    var labelStyle = 'font-size="11" font-weight="600" letter-spacing="1" font-family="system-ui,sans-serif"';
    parts.push('<text x="' + DEX + '" y="38" ' + labelStyle + ' fill="#0d9488">DATA ELEMENTS</text>');
    parts.push('<text x="' + RUX + '" y="38" ' + labelStyle + ' fill="#2563eb">RULES</text>');
    parts.push('<text x="' + EXX + '" y="38" ' + labelStyle + ' fill="#64748b">EXTENSIONS</text>');

    // Links DE → Rule
    deToRu.forEach(function(pair, i) {
      var x1 = rx(DEX, de[pair[0]][1]), y1 = cy(de[pair[0]][0]);
      var x2 = RUX,                     y2 = cy(ru[pair[1]][0]);
      var cpx = (x1 + x2) / 2;
      parts.push('<path class="fsl" d="M' + x1 + ',' + y1 + ' C' + cpx + ',' + y1 + ' ' + cpx + ',' + y2 + ' ' + x2 + ',' + y2 + '"'
        + ' fill="none" stroke="#cbd5e1" stroke-width="1.5" style="animation-delay:' + (i * 0.15) + 's"/>');
    });

    // Links Rule → Ext
    ruToEx.forEach(function(pair, i) {
      var x1 = rx(RUX, ru[pair[0]][1]), y1 = cy(ru[pair[0]][0]);
      var x2 = EXX,                     y2 = cy(ex[pair[1]][0]);
      var cpx = (x1 + x2) / 2;
      parts.push('<path class="fsl" d="M' + x1 + ',' + y1 + ' C' + cpx + ',' + y1 + ' ' + cpx + ',' + y2 + ' ' + x2 + ',' + y2 + '"'
        + ' fill="none" stroke="#cbd5e1" stroke-width="1.5" style="animation-delay:' + (i * 0.15 + 0.3) + 's"/>');
    });

    // DE pills (mint teal)
    de.forEach(function(p, i) {
      parts.push('<rect class="fsp" x="' + DEX + '" y="' + p[0] + '" width="' + p[1] + '" height="' + PH + '" rx="' + RX + '"'
        + ' fill="#a7f3d0" style="animation-delay:' + (i * 0.1) + 's"/>');
    });

    // Rule pills (sky blue)
    ru.forEach(function(p, i) {
      parts.push('<rect class="fsp" x="' + RUX + '" y="' + p[0] + '" width="' + p[1] + '" height="' + PH + '" rx="' + RX + '"'
        + ' fill="#bfdbfe" style="animation-delay:' + (i * 0.1 + 0.2) + 's"/>');
    });

    // Ext pills (slate gray)
    ex.forEach(function(p, i) {
      parts.push('<rect class="fsp" x="' + EXX + '" y="' + p[0] + '" width="' + p[1] + '" height="' + PH + '" rx="' + RX + '"'
        + ' fill="#e2e8f0" style="animation-delay:' + (i * 0.1 + 0.4) + 's"/>');
    });

    // Hint text
    parts.push('<text x="450" y="312" text-anchor="middle" font-size="12" fill="#94a3b8" font-family="system-ui,sans-serif">'
      + 'Search for a component above to explore its connections'
      + '</text>');

    parts.push('</svg>');
    return parts.join('');
  }

  var NODE_HEIGHT = 28;
  var NODE_WIDTH = 16;
  var NODE_GAP = 8;
  var COLUMN_GAP = 100;
  var HORIZ_PADDING = 24;
  var VERT_PADDING = 52;

  function getRulesArray() {
    // Try sessionStorage first (populated by TagScanner scan)
    var raw = sessionStorage.getItem('_satellite._container.rules');
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.rules)) return parsed.rules;
        if (parsed && typeof parsed === 'object') return Object.values(parsed);
      } catch (e) {}
    }
    // Fallback: read directly from container
    try {
      var container = window._satellite && window._satellite._container;
      if (!container) return [];
      var rules = container.rules;
      if (!rules) return [];
      if (Array.isArray(rules)) return rules;
      if (Array.isArray(rules.rules)) return rules.rules;
      return Object.values(rules);
    } catch (e) { return []; }
  }

  function getDataElements() {
    // Try sessionStorage first
    var raw = sessionStorage.getItem('_satellite._container.dataElements');
    if (raw) {
      try { return JSON.parse(raw) || {}; } catch (e) {}
    }
    // Fallback: read directly from container
    try {
      var container = window._satellite && window._satellite._container;
      return (container && container.dataElements) || {};
    } catch (e) { return {}; }
  }

  function getExtensions() {
    // Try sessionStorage first (note: singular 'extension' key)
    var raw = sessionStorage.getItem('_satellite._container.extension');
    if (raw) {
      try { return JSON.parse(raw) || {}; } catch (e) {}
    }
    // Fallback: read directly from container
    // Container stores extensions as an object keyed by extension name
    try {
      var container = window._satellite && window._satellite._container;
      return (container && container.extensions) || {};
    } catch (e) { return {}; }
  }

  function getAnalyticsVariables() {
    // Primary: read from localStorage key written by
    // dataElementListCombined.js after its full 5-technique
    // extraction (trackerProperties, custom code, XDM traversal,
    // canonical XDM paths, sendEvent scanning).
    // localStorage is used (not sessionStorage) because both pages
    // run in separate tabs of the same extension origin.
    var raw = localStorage.getItem('ts_analytics_variables');
    if (raw) {
      try { return JSON.parse(raw) || {}; } catch(e) {}
    }
    // Fallback: return null — flow.js will use its own
    // partial extraction from buildRelationships()
    return null;
  }

  function stringContainsDERef(str, deName) {
    if (!str || typeof str !== 'string') return false;
    var v = '%' + deName + '%';
    var c1 = '_satellite.getVar("' + deName + '")';
    var c2 = "_satellite.getVar('" + deName + "')";
    return str.indexOf(v) > -1 || str.indexOf(c1) > -1 || str.indexOf(c2) > -1;
  }

  function extractExtensionId(modulePath) {
    if (!modulePath || typeof modulePath !== 'string') return null;
    var parts = modulePath.split('/');
    return parts[0] || null;
  }

  function buildRelationships(rulesArray, dataElements, extensions) {
    var ruleToDataElement = {};
    var dataElementToRule = {};
    var ruleToExtension = {};
    var extensionToRule = {};

    var deKeys = Object.keys(dataElements);

    rulesArray.forEach(function (rule, rIdx) {
      var ruleName = rule.name || rule.id || 'Rule ' + (rIdx + 1);
      ruleToDataElement[ruleName] = {};
      ruleToExtension[ruleName] = {};

      if (typeof window !== 'undefined' && window.TagScannerDataElementRefs && window.TagScannerDataElementRefs.getDENamesReferencedInRule) {
        window.TagScannerDataElementRefs.getDENamesReferencedInRule(rule, dataElements).forEach(function (deName) {
          ruleToDataElement[ruleName][deName] = (ruleToDataElement[ruleName][deName] || 0) + 1;
          dataElementToRule[deName] = dataElementToRule[deName] || {};
          dataElementToRule[deName][ruleName] = (dataElementToRule[deName][ruleName] || 0) + 1;
        });
      } else {
        function scanForDE(obj) {
          if (!obj) return;
          if (typeof obj === 'string') {
            deKeys.forEach(function (deName) {
              if (stringContainsDERef(obj, deName)) {
                ruleToDataElement[ruleName][deName] = (ruleToDataElement[ruleName][deName] || 0) + 1;
                dataElementToRule[deName] = dataElementToRule[deName] || {};
                dataElementToRule[deName][ruleName] = (dataElementToRule[deName][ruleName] || 0) + 1;
              }
            });
            return;
          }
          if (Array.isArray(obj)) {
            obj.forEach(scanForDE);
            return;
          }
          if (typeof obj === 'object') {
            Object.keys(obj).forEach(function (k) { scanForDE(obj[k]); });
          }
        }

        scanForDE(rule.events);
        scanForDE(rule.conditions);
        scanForDE(rule.actions);
      }

      function scanForExt(items) {
        if (!items || !Array.isArray(items)) return;
        items.forEach(function (item) {
          var extId = item && item.modulePath ? extractExtensionId(item.modulePath) : null;
          if (extId) {
            ruleToExtension[ruleName][extId] = (ruleToExtension[ruleName][extId] || 0) + 1;
            extensionToRule[extId] = extensionToRule[extId] || {};
            extensionToRule[extId][ruleName] = (extensionToRule[extId][ruleName] || 0) + 1;
          }
        });
      }

      scanForExt(rule.events);
      scanForExt(rule.conditions);
      scanForExt(rule.actions);
    });

    // ── Analytics variable layer ──────────────────────────────────────
    var ruleToVars = {};   // ruleName → [{ varId, label }]
    var varToRules = {};   // varId → [ruleName]
    var deToVars   = {};   // deName → [{ varId, label }]
    var varMeta    = {};   // varId → { label, type: 'evar'|'prop'|'event'|'xdm' }

    function registerVar(varId, label, type) {
      if (!varMeta[varId]) varMeta[varId] = { label: label, type: type };
    }
    function linkRuleVar(rName, varId) {
      if (!ruleToVars[rName]) ruleToVars[rName] = [];
      if (!ruleToVars[rName].find(function(v){ return v.varId === varId; }))
        ruleToVars[rName].push({ varId: varId });
      if (!varToRules[varId]) varToRules[varId] = [];
      if (varToRules[varId].indexOf(rName) === -1) varToRules[varId].push(rName);
    }
    function linkDEVar(deName, varId) {
      if (!deToVars[deName]) deToVars[deName] = [];
      if (!deToVars[deName].find(function(v){ return v.varId === varId; }))
        deToVars[deName].push({ varId: varId });
    }
    function extractToken(val) {
      if (!val || typeof val !== 'string') return null;
      var m = val.match(/^%([^%]+)%$/);
      return m ? m[1] : null;
    }
    // Extracts eVar/prop/event keys at any nesting depth
    // Mirrors dataElementListXDM.js processXDMPath logic
    function extractVarsFromData(obj, rName, sourceDEName) {
      if (!obj || typeof obj !== 'object') return;
      Object.keys(obj).forEach(function(key) {
        var val = obj[key];
        if (/^eVar\d+$/.test(key) || /^prop\d+$/.test(key) || /^event\d+$/.test(key)) {
          var type = /^eVar/.test(key) ? 'evar'
                   : /^prop/.test(key) ? 'prop' : 'event';
          var varId = 'var_' + key;
          registerVar(varId, key, type);
          linkRuleVar(rName, varId);
          var deRef = extractToken(typeof val === 'string' ? val : '');
          if (deRef) linkDEVar(deRef, varId);
          if (sourceDEName) linkDEVar(sourceDEName, varId);
        } else if (val && typeof val === 'object') {
          extractVarsFromData(val, rName, sourceDEName);
        }
      });
    }

    // Walks settings.xdm — handles three shapes:
    // (a) string token: settings.xdm = "%xdmObject - travellerPage%"
    // (b) object with %token% keys: { "%xdmObject - travellerPage%": true }
    // (c) direct nested XDM object with eVar/prop keys
    function walkXDM(obj, rName) {
      // Case A — settings.xdm is a plain string token reference
      if (typeof obj === 'string') {
        var deName = extractToken(obj);
        if (deName) {
          var xdmDE = dataElements[deName];
          if (xdmDE && xdmDE.settings && xdmDE.settings.data) {
            extractVarsFromData(xdmDE.settings.data, rName, deName);
          }
        }
        return;
      }

      if (!obj || typeof obj !== 'object') return;

      Object.keys(obj).forEach(function(key) {
        var val = obj[key];

        // Case B — key is a %token% reference to an XDM Object DE
        var deName = extractToken(key);
        if (deName) {
          var xdmDE = dataElements[deName];
          if (xdmDE && xdmDE.settings && xdmDE.settings.data) {
            extractVarsFromData(xdmDE.settings.data, rName, deName);
          }
          return;
        }

        // Case C — direct XDM object with nested eVar/prop keys
        if (val && typeof val === 'object') {
          extractVarsFromData(val, rName, null);
        } else if (typeof val === 'string') {
          if (/^eVar\d+$/.test(key) || /^prop\d+$/.test(key) || /^event\d+$/.test(key)) {
            var type = /^eVar/.test(key) ? 'evar'
                     : /^prop/.test(key) ? 'prop' : 'event';
            var varId = 'var_' + key;
            registerVar(varId, key, type);
            linkRuleVar(rName, varId);
            var de = extractToken(val);
            if (de) linkDEVar(de, varId);
          }
        }
      });
    }

    rulesArray.forEach(function(rule) {
      var rName = rule.name;
      var components = (rule.events || [])
        .concat(rule.conditions || [])
        .concat(rule.actions   || []);

      components.forEach(function(c) {
        if (!c || !c.settings) return;
        var mp = c.modulePath || '';

        // Adobe Analytics Set Variables
        if (mp.indexOf('adobe-analytics/src/lib/actions/setVariables.js') > -1) {
          var tp = c.settings.trackerProperties || {};
          (tp.eVars || []).forEach(function(ev) {
            if (!ev.name) return;
            var vid = 'var_' + ev.name;
            registerVar(vid, ev.name, 'evar');
            linkRuleVar(rName, vid);
            var de = extractToken(ev.value);
            if (de) linkDEVar(de, vid);
          });
          (tp.props || []).forEach(function(p) {
            if (!p.name) return;
            var vid = 'var_' + p.name;
            registerVar(vid, p.name, 'prop');
            linkRuleVar(rName, vid);
            var de = extractToken(p.value);
            if (de) linkDEVar(de, vid);
          });
          (tp.events || []).forEach(function(e) {
            if (!e.name) return;
            var vid = 'var_' + e.name;
            registerVar(vid, e.name, 'event');
            linkRuleVar(rName, vid);
          });
          ['pageName','pageURL','campaign'].forEach(function(f) {
            if (!tp[f]) return;
            var vid = 'var_' + f;
            registerVar(vid, f, 'prop');
            linkRuleVar(rName, vid);
            var de = extractToken(tp[f]);
            if (de) linkDEVar(de, vid);
          });
        }

        // ── Alloy updateVariable ──────────────────────────────────
        // updateVariable stores analytics mappings directly in
        // action.settings.data.__adobe.analytics as eVar/prop/event
        // keys with %token% or inline values
        if (mp.indexOf('updateVariable') > -1) {
          var uvData = c.settings && c.settings.data;
          if (uvData && uvData.__adobe && uvData.__adobe.analytics) {
            var aa = uvData.__adobe.analytics;
            Object.keys(aa).forEach(function(key) {
              var val = aa[key];
              if (val === null || val === undefined) return;
              var strVal = String(val);

              if (/^eVar\d+$/.test(key)) {
                var varId = 'var_' + key;
                registerVar(varId, key, 'evar');
                linkRuleVar(rName, varId);
                var de = extractToken(strVal);
                if (de) linkDEVar(de, varId);

              } else if (/^prop\d+$/.test(key)) {
                var varId = 'var_' + key;
                registerVar(varId, key, 'prop');
                linkRuleVar(rName, varId);
                var de = extractToken(strVal);
                if (de) linkDEVar(de, varId);

              } else if (key === 'events' &&
                         typeof val === 'string' && val.length > 0) {
                // Split comma-separated: "event1,event4,event10"
                val.split(',').forEach(function(evtRaw) {
                  var evtName = evtRaw.trim().split('=')[0].trim();
                  if (!evtName) return;
                  var varId = 'var_' + evtName;
                  registerVar(varId, evtName, 'event');
                  linkRuleVar(rName, varId);
                });

              } else if (key === 'campaign') {
                var varId = 'var_campaign';
                registerVar(varId, 'campaign', 'prop');
                linkRuleVar(rName, varId);
                var de = extractToken(strVal);
                if (de) linkDEVar(de, varId);

              } else if (key === 'products') {
                var varId = 'var_products';
                registerVar(varId, 'products', 'products');
                linkRuleVar(rName, varId);
                var de = extractToken(strVal);
                if (de) linkDEVar(de, varId);
              }
            });
          }
        }

        // Web SDK sendEvent XDM
        if (mp.indexOf('sendEvent') > -1 || mp.indexOf('web-sdk') > -1) {

          // Handle plain string token: settings.xdm = "%xdmObject - travellerPage%"
          function resolveXDMToken(val, rName) {
            if (!val) return;
            // Case A — plain string token e.g. "%xdmObject - travellerPage%"
            if (typeof val === 'string') {
              var deName = extractToken(val);
              if (deName && dataElements[deName]) {
                var xdmDE = dataElements[deName];
                // Link the XDM DE to this rule
                if (!dataElementToRule[deName]) dataElementToRule[deName] = {};
                dataElementToRule[deName][rName] = (dataElementToRule[deName][rName] || 0) + 1;
                if (!ruleToDataElement[rName]) ruleToDataElement[rName] = {};
                ruleToDataElement[rName][deName] = (ruleToDataElement[rName][deName] || 0) + 1;
                // Traverse the DE's settings.data for eVar/prop/event keys
                if (xdmDE.settings && xdmDE.settings.data) {
                  extractVarsFromData(xdmDE.settings.data, rName, deName);
                }
              }
            }
            // Case B — object with token keys: { "%xdmObject%": true }
            else if (typeof val === 'object') {
              walkXDM(val, rName);
            }
          }

          resolveXDMToken(c.settings.xdm,  rName);
          resolveXDMToken(c.settings.data, rName);
        }
      });
    });

    // ── Register XDM Object DEs as browseable entries ──────────────
    Object.keys(dataElements).forEach(function(deName) {
      var de = dataElements[deName];
      if (!de || !de.modulePath) return;
      if (de.modulePath.indexOf('xdmObject') === -1) return;
      if (!de.settings || !de.settings.data) return;

      var varId = 'xdmde_' + deName;
      registerVar(varId, deName, 'xdmde');

      Object.keys(ruleToDataElement).forEach(function(rName) {
        if (ruleToDataElement[rName][deName]) {
          linkRuleVar(rName, varId);
        }
      });
    });

    return {
      ruleToDataElement: ruleToDataElement,
      dataElementToRule: dataElementToRule,
      ruleToExtension:   ruleToExtension,
      extensionToRule:   extensionToRule,
      ruleToVars:        ruleToVars,
      varToRules:        varToRules,
      deToVars:          deToVars,
      varMeta:           varMeta
    };
  }

  function buildFlowData(rels, extensions, containsFilter) {
    var DE = [];
    var R = [];
    var Ext = [];

    function matchFilter(name) {
      if (!containsFilter || !containsFilter.trim()) return true;
      return (name || '').toLowerCase().indexOf(containsFilter.toLowerCase().trim()) > -1;
    }

    Object.keys(rels.dataElementToRule).forEach(function (deName) {
      if (!matchFilter(deName)) return;
      var total = 0;
      Object.keys(rels.dataElementToRule[deName]).forEach(function (r) {
        total += rels.dataElementToRule[deName][r];
      });
      DE.push({ id: 'de_' + deName, name: deName, type: 'de', total: total });
    });

    Object.keys(rels.ruleToDataElement).forEach(function (ruleName) {
      if (!matchFilter(ruleName)) return;
      var totalIn = 0, totalOut = 0;
      Object.keys(rels.ruleToDataElement[ruleName]).forEach(function (de) {
        totalIn += rels.ruleToDataElement[ruleName][de];
      });
      Object.keys(rels.ruleToExtension[ruleName] || {}).forEach(function (extId) {
        totalOut += rels.ruleToExtension[ruleName][extId];
      });
      R.push({ id: 'rule_' + ruleName, name: ruleName, type: 'rule', total: totalIn + totalOut });
    });

    Object.keys(rels.extensionToRule).forEach(function (extId) {
      var displayName = (extensions[extId] && extensions[extId].displayName) ? extensions[extId].displayName : extId;
      if (!matchFilter(displayName) && !matchFilter(extId)) return;
      var total = 0;
      Object.keys(rels.extensionToRule[extId]).forEach(function (r) {
        total += rels.extensionToRule[extId][r];
      });
      Ext.push({ id: 'ext_' + extId, name: displayName, type: 'ext', total: total });
    });

    DE.sort(function (a, b) { return b.total - a.total; });
    R.sort(function (a, b) { return b.total - a.total; });
    Ext.sort(function (a, b) { return b.total - a.total; });

    var nodes = [];
    var nodeById = {};
    DE.forEach(function (n, i) {
      nodes.push(n);
      n.column = 0;
      n.index = i;
      nodeById[n.id] = n;
    });
    R.forEach(function (n, i) {
      nodes.push(n);
      n.column = 1;
      n.index = i;
      nodeById[n.id] = n;
    });
    Ext.forEach(function (n, i) {
      nodes.push(n);
      n.column = 2;
      n.index = i;
      nodeById[n.id] = n;
    });

    var linkMap = {};
    function addLink(source, target, value, label) {
      var key = source + '|' + target;
      if (!linkMap[key]) linkMap[key] = { source: source, target: target, value: 0, labels: [] };
      linkMap[key].value += value;
      if (label && linkMap[key].labels.indexOf(label) === -1) linkMap[key].labels.push(label);
    }

    Object.keys(rels.dataElementToRule).forEach(function (deName) {
      if (!matchFilter(deName)) return;
      var srcId = 'de_' + deName;
      Object.keys(rels.dataElementToRule[deName]).forEach(function (ruleName) {
        if (!matchFilter(ruleName)) return;
        var tgtId = 'rule_' + ruleName;
        if (nodeById[srcId] && nodeById[tgtId]) {
          addLink(srcId, tgtId, rels.dataElementToRule[deName][ruleName], deName + ' \u2192 ' + ruleName);
        }
      });
    });
    Object.keys(rels.ruleToExtension).forEach(function (ruleName) {
      if (!matchFilter(ruleName)) return;
      var srcId = 'rule_' + ruleName;
      Object.keys(rels.ruleToExtension[ruleName]).forEach(function (extId) {
        var tgtId = 'ext_' + extId;
        if (nodeById[srcId] && nodeById[tgtId]) {
          var extName = (extensions[extId] && extensions[extId].displayName) ? extensions[extId].displayName : extId;
          addLink(srcId, tgtId, rels.ruleToExtension[ruleName][extId], ruleName + ' \u2192 ' + extName);
        }
      });
    });

    var links = Object.keys(linkMap).map(function (k) {
      var l = linkMap[k];
      return { source: l.source, target: l.target, value: l.value, label: l.labels.length ? l.labels[0] + (l.labels.length > 1 ? ' (+' + (l.labels.length - 1) + ')' : '') : '', labelCount: l.labels.length };
    });

    return { nodes: nodes, links: links, nodeById: nodeById };
  }

  function buildFlowDataForSelection(rels, extensions, selectedType, selectedKey) {
    var DE = [], R = [], Ext = [];
    var nodeById = {};
    var linkMap = {};

    function addLink(source, target, value, label) {
      var key = source + '|' + target;
      if (!linkMap[key]) linkMap[key] = { source: source, target: target, value: 0, labels: [] };
      linkMap[key].value += value;
      if (label && linkMap[key].labels.indexOf(label) === -1) linkMap[key].labels.push(label);
    }

    function addNode(list, id, name, type, total) {
      var n = { id: id, name: name, type: type, total: total || 0 };
      list.push(n);
      nodeById[id] = n;
    }

    if (selectedType === 'de') {
      var deName = selectedKey;
      if (!rels.dataElementToRule[deName]) return { nodes: [], links: [], nodeById: {} };
      addNode(DE, 'de_' + deName, deName, 'de');
      var rulesUsed = Object.keys(rels.dataElementToRule[deName]);
      rulesUsed.forEach(function (r) {
        addNode(R, 'rule_' + r, r, 'rule');
        addLink('de_' + deName, 'rule_' + r, rels.dataElementToRule[deName][r], deName + ' \u2192 ' + r);
      });
      var extIds = {};
      rulesUsed.forEach(function (r) {
        Object.keys(rels.ruleToExtension[r] || {}).forEach(function (eid) {
          extIds[eid] = true;
        });
      });
      Object.keys(extIds).forEach(function (eid) {
        var disp = (extensions[eid] && extensions[eid].displayName) ? extensions[eid].displayName : eid;
        addNode(Ext, 'ext_' + eid, disp, 'ext');
      });
      rulesUsed.forEach(function (r) {
        Object.keys(rels.ruleToExtension[r] || {}).forEach(function (eid) {
          if (extIds[eid]) addLink('rule_' + r, 'ext_' + eid, rels.ruleToExtension[r][eid], r + ' \u2192 ' + ((extensions[eid] && extensions[eid].displayName) ? extensions[eid].displayName : eid));
        });
      });
    } else if (selectedType === 'rule') {
      var ruleName = selectedKey;
      var hasDE = rels.ruleToDataElement[ruleName];
      var hasExt = rels.ruleToExtension[ruleName];
      if (!hasDE && !hasExt) return { nodes: [], links: [], nodeById: {} };
      if (hasDE) {
        Object.keys(hasDE).forEach(function (de) {
          addNode(DE, 'de_' + de, de, 'de');
          addLink('de_' + de, 'rule_' + ruleName, hasDE[de], de + ' \u2192 ' + ruleName);
        });
      }
      addNode(R, 'rule_' + ruleName, ruleName, 'rule');
      if (hasExt) {
        Object.keys(hasExt).forEach(function (eid) {
          var disp = (extensions[eid] && extensions[eid].displayName) ? extensions[eid].displayName : eid;
          addNode(Ext, 'ext_' + eid, disp, 'ext');
          addLink('rule_' + ruleName, 'ext_' + eid, hasExt[eid], ruleName + ' \u2192 ' + disp);
        });
      }
    } else if (selectedType === 'ext') {
      var extId = selectedKey;
      if (!rels.extensionToRule[extId]) return { nodes: [], links: [], nodeById: {} };
      var rulesUsed = Object.keys(rels.extensionToRule[extId]);
      var deSet = {};
      rulesUsed.forEach(function (r) {
        Object.keys(rels.ruleToDataElement[r] || {}).forEach(function (de) {
          deSet[de] = true;
        });
      });
      Object.keys(deSet).forEach(function (de) {
        addNode(DE, 'de_' + de, de, 'de');
      });
      rulesUsed.forEach(function (r) {
        addNode(R, 'rule_' + r, r, 'rule');
        Object.keys(rels.ruleToDataElement[r] || {}).forEach(function (de) {
          addLink('de_' + de, 'rule_' + r, rels.ruleToDataElement[r][de], de + ' \u2192 ' + r);
        });
        addLink('rule_' + r, 'ext_' + extId, rels.extensionToRule[extId][r], r + ' \u2192 ' + ((extensions[extId] && extensions[extId].displayName) ? extensions[extId].displayName : extId));
      });
      var disp = (extensions[extId] && extensions[extId].displayName) ? extensions[extId].displayName : extId;
      addNode(Ext, 'ext_' + extId, disp, 'ext');
    }

    // ── Variable selected — reverse mapping ────────────────────────
    // Show: all rules that set this variable + all DEs that feed it
    // Uses addNode/addLink so the standard assembly and var-layer section
    // below pick everything up naturally.
    else if (selectedType === 'var') {
      var varId   = selectedKey;
      var varInfo = (rels.varMeta || {})[varId];
      if (!varInfo) return { nodes: [], links: [], nodeById: {} };

      var rulesForVar = (rels.varToRules || {})[varId] || [];
      if (!rulesForVar.length) return { nodes: [], links: [], nodeById: {} };

      // Add each rule that sets this variable into R so the var-layer
      // section below finds it and adds the Rule→Var edges automatically
      rulesForVar.forEach(function(rName) {
        if (!nodeById['rule_' + rName]) addNode(R, 'rule_' + rName, rName, 'rule');

        // DEs referenced by this rule
        var deRefs = (rels.ruleToDataElement || {})[rName] || {};
        Object.keys(deRefs).forEach(function(deName) {
          if (!nodeById['de_' + deName]) addNode(DE, 'de_' + deName, deName, 'de');
          addLink('de_' + deName, 'rule_' + rName, deRefs[deName],
                  deName + ' → ' + rName);
        });

        // Extensions used by this rule
        var extRefs = (rels.ruleToExtension || {})[rName] || {};
        Object.keys(extRefs).forEach(function(extId) {
          var extDisp = (extensions[extId] && extensions[extId].displayName)
                        ? extensions[extId].displayName : extId;
          if (!nodeById['ext_' + extId]) addNode(Ext, 'ext_' + extId, extDisp, 'ext');
          addLink('rule_' + rName, 'ext_' + extId, extRefs[extId],
                  rName + ' → ' + extDisp);
        });
      });

      // Also add DEs that directly supply this variable (deToVars mapping)
      // DE→Var edges are added by the var-layer section below
      var deToVarsMap = rels.deToVars || {};
      Object.keys(deToVarsMap).forEach(function(deName) {
        var deVarIds = deToVarsMap[deName].map(function(v){ return v.varId; });
        if (deVarIds.indexOf(varId) > -1 && !nodeById['de_' + deName]) {
          addNode(DE, 'de_' + deName, deName, 'de');
        }
      });
    }

    var nodes = [];
    DE.forEach(function (n, i)  { n.column = 0; n.index = i; nodes.push(n); });
    R.forEach(function (n, i)   { n.column = 1; n.index = i; nodes.push(n); });
    Ext.forEach(function (n, i) { n.column = 2; n.index = i; nodes.push(n); });

    var links = Object.keys(linkMap).map(function (k) {
      var l = linkMap[k];
      return { source: l.source, target: l.target, value: l.value, label: l.labels.length ? l.labels[0] : '' };
    });

    return { nodes: nodes, links: links, nodeById: nodeById };
  }

  function showNodeConnectionsModal(node, rels, extensions) {
    var modal = document.getElementById('flowNodeModal');
    var titleEl = document.getElementById('flowNodeModalTitle');
    var bodyEl = document.getElementById('flowNodeModalBody');
    if (!modal || !titleEl || !bodyEl) return;

    var isAggregate = node.isAggregate;
    var type = node.type;
    var name = node.name;
    var id = node.id;

    if (isAggregate) {
      titleEl.textContent = name;
      bodyEl.innerHTML = '<p class="text-muted mb-0">This group represents multiple items. Use the <strong>Contains</strong> filter to see specific items.</p>';
    } else if (type === 'rule') {
      titleEl.textContent = 'Rule: ' + name;
      var deMap = rels.ruleToDataElement[name] || {};
      var extMap = rels.ruleToExtension[name] || {};
      var deList = Object.keys(deMap).sort();
      var extList = Object.keys(extMap).map(function (extId) {
        var disp = (extensions[extId] && extensions[extId].displayName) ? extensions[extId].displayName : extId;
        return { id: extId, name: disp, count: extMap[extId] };
      });
      var html = '';
      if (deList.length) {
        html += '<h6 class="mt-2 mb-1"><i class="fas fa-database text-info mr-1"></i>Data elements used (' + deList.length + ')</h6><ul class="list-group list-group-flush mb-3">';
        deList.forEach(function (de) {
          html += '<li class="list-group-item d-flex justify-content-between align-items-center">' + escapeHtml(de) + ' <span class="badge badge-primary">' + (deMap[de] || 0) + '</span></li>';
        });
        html += '</ul>';
      }
      if (extList.length) {
        html += '<h6 class="mt-2 mb-1"><i class="fas fa-puzzle-piece text-secondary mr-1"></i>Extensions used (' + extList.length + ')</h6><ul class="list-group list-group-flush">';
        extList.forEach(function (e) {
          html += '<li class="list-group-item d-flex justify-content-between align-items-center">' + escapeHtml(e.name) + ' <span class="badge badge-secondary">' + e.count + '</span></li>';
        });
        html += '</ul>';
      }
      if (!html) html = '<p class="text-muted mb-0">No data elements or extensions linked in this flow.</p>';
      bodyEl.innerHTML = html;
    } else if (type === 'de') {
      titleEl.textContent = 'Data element: ' + name;
      var ruleMap = rels.dataElementToRule[name] || {};
      var ruleList = Object.keys(ruleMap).sort();
      if (ruleList.length) {
        bodyEl.innerHTML = '<h6 class="mt-0 mb-1"><i class="fas fa-gavel text-primary mr-1"></i>Used in rules (' + ruleList.length + ')</h6><ul class="list-group list-group-flush">' +
          ruleList.map(function (r) {
            return '<li class="list-group-item d-flex justify-content-between align-items-center">' + escapeHtml(r) + ' <span class="badge badge-primary">' + (ruleMap[r] || 0) + '</span></li>';
          }).join('') + '</ul>';
      } else {
        bodyEl.innerHTML = '<p class="text-muted mb-0">Not used in any rules in this flow.</p>';
      }
    } else if (type === 'ext') {
      var extId = id.replace(/^ext_/, '');
      titleEl.textContent = 'Extension: ' + name;
      var ruleMap = rels.extensionToRule[extId] || {};
      var ruleList = Object.keys(ruleMap).sort();
      if (ruleList.length) {
        bodyEl.innerHTML = '<h6 class="mt-0 mb-1"><i class="fas fa-gavel text-primary mr-1"></i>Used in rules (' + ruleList.length + ')</h6><ul class="list-group list-group-flush">' +
          ruleList.map(function (r) {
            return '<li class="list-group-item d-flex justify-content-between align-items-center">' + escapeHtml(r) + ' <span class="badge badge-primary">' + (ruleMap[r] || 0) + '</span></li>';
          }).join('') + '</ul>';
      } else {
        bodyEl.innerHTML = '<p class="text-muted mb-0">Not used in any rules in this flow.</p>';
      }
    }

    modal.classList.add('show');
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
    var backdrop = document.getElementById('flowModalBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'flowModalBackdrop';
      backdrop.className = 'flow-modal-backdrop';
      backdrop.addEventListener('click', closeFlowNodeModal);
      document.body.appendChild(backdrop);
    }
    backdrop.style.display = 'block';
    document.addEventListener('keydown', flowModalEscapeHandler);
  }

  function flowModalEscapeHandler(e) {
    if (e.key === 'Escape') closeFlowNodeModal();
  }

  function closeFlowNodeModal() {
    var modal = document.getElementById('flowNodeModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    var backdrop = document.getElementById('flowModalBackdrop');
    if (backdrop) backdrop.style.display = 'none';
    document.removeEventListener('keydown', flowModalEscapeHandler);
    if (typeof clearFlowSelection === 'function') clearFlowSelection();
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function render(container, flowData, width, height, rels, extensions) {
    if (!flowData || !flowData.nodes.length) {
      container.innerHTML = '<div class="flow-empty">No flow data. Load a property from the main page first.</div>';
      return;
    }

    var nodes = flowData.nodes;
    var links = flowData.links;
    var nodeById = flowData.nodeById;

    var padding = { top: VERT_PADDING, right: HORIZ_PADDING, bottom: VERT_PADDING, left: HORIZ_PADDING };
    var chartWidth = width - padding.left - padding.right;
    var colWidth = (chartWidth - 2 * COLUMN_GAP) / 3;
    var col0X = padding.left;
    var col1X = padding.left + colWidth + COLUMN_GAP;
    var col2X = padding.left + 2 * (colWidth + COLUMN_GAP);
    var colXPositions = [col0X, col1X, col2X];

    var cols = [[], [], []];
    nodes.forEach(function (n) {
      if (!cols[n.column]) cols[n.column] = [];
      cols[n.column].push(n);
    });
    cols.forEach(function (col, c) {
      var x = c === 0 ? col0X : c === 1 ? col1X : col2X;
      col.forEach(function (n, i) {
        n.x = x;
        n.y = padding.top + i * (NODE_HEIGHT + NODE_GAP);
        n.width = NODE_WIDTH;
        n.height = NODE_HEIGHT;
      });
    });

    var maxVal = 1;
    links.forEach(function (l) {
      if (l.value > maxVal) maxVal = l.value;
    });
    var strokeScale = d3.scaleLinear().domain([0, maxVal]).range([3, 20]).clamp(true);

    container.innerHTML = '';
    var svg = d3.select(container).append('svg').attr('width', width).attr('height', height);

    var g = svg.append('g');
    var selectedNodeId = null;

    function getConnectedSet(id) {
      var set = {};
      if (!id) return set;
      set[id] = true;
      links.forEach(function (l) {
        if (l.source === id || l.target === id) {
          set[l.source] = true;
          set[l.target] = true;
        }
      });
      return set;
    }

    function applySelection() {
      var connected = getConnectedSet(selectedNodeId);
      g.selectAll('.flow-node').each(function () {
        var id = this.getAttribute('data-node-id');
        var dim = selectedNodeId && !connected[id];
        var sel = id === selectedNodeId;
        d3.select(this).classed('dimmed', dim).classed('selected', sel);
      });
      g.selectAll('.flow-link').each(function () {
        var src = this.getAttribute('data-source');
        var tgt = this.getAttribute('data-target');
        var dim = selectedNodeId && (!connected[src] && !connected[tgt]);
        d3.select(this).classed('dimmed', dim);
      });
    }

    function clearSelection() {
      selectedNodeId = null;
      applySelection();
    }

    g.append('rect')
      .attr('class', 'flow-bg')
      .attr('x', 0).attr('y', 0).attr('width', width).attr('height', height)
      .attr('fill', 'transparent')
      .style('cursor', 'default')
      .on('click', clearSelection);

    var colBandWidth = colWidth + COLUMN_GAP;
    colXPositions.forEach(function (cx) {
      g.append('rect')
        .attr('class', 'flow-column-bg')
        .attr('x', cx)
        .attr('y', padding.top)
        .attr('width', colWidth)
        .attr('height', height - padding.top - padding.bottom);
    });

    var dividerXs = [col0X + colWidth, col1X + colWidth, col2X + colWidth];
    dividerXs.forEach(function(dx) {
      g.append('line').attr('class', 'flow-column-divider').attr('x1', dx).attr('y1', padding.top).attr('x2', dx).attr('y2', height - padding.bottom);
    });

    var linkGroup = g.append('g').attr('class', 'flow-links');
    function linkPath(src, tgt) {
      var x0 = src.x + src.width;
      var y0 = src.y + src.height / 2;
      var x1 = tgt.x;
      var y1 = tgt.y + tgt.height / 2;
      var dx = (x1 - x0) * 0.4;
      return 'M' + x0 + ',' + y0 + ' C' + (x0 + dx) + ',' + y0 + ' ' + (x1 - dx) + ',' + y1 + ' ' + x1 + ',' + y1;
    }

    links.forEach(function (link) {
      var src = nodeById[link.source];
      var tgt = nodeById[link.target];
      if (!src || !tgt) return;
      var stroke = strokeScale(link.value);
      linkGroup.append('path')
        .attr('d', linkPath(src, tgt))
        .attr('class', 'flow-link')
        .attr('data-source', link.source)
        .attr('data-target', link.target)
        .attr('stroke', '#64748b')
        .attr('stroke-width', stroke)
        .attr('stroke-linecap', 'round')
        .attr('fill', 'none')
        .attr('data-label', link.label)
        .on('mouseover', function () {
          var label = link.label;
          var tip = document.getElementById('flowTooltip');
          if (tip) {
            tip.textContent = label + ' (' + link.value + ')';
            tip.style.display = 'block';
          }
        })
        .on('mouseout', function () {
          var tip = document.getElementById('flowTooltip');
          if (tip) tip.style.display = 'none';
        });
    });

    var nodeGroup = g.append('g').attr('class', 'flow-nodes');
    nodes.forEach(function (n) {
      var varTypes = { evar: true, prop: true, event: true, xdm: true };
      var nodeClass = n.type === 'de'   ? 'de-node'
                    : n.type === 'rule' ? 'rule-node'
                    : varTypes[n.type]  ? 'var-node var-' + n.type + '-node'
                    : 'ext-node';
      var gr = nodeGroup.append('g').attr('class', 'flow-node ' + nodeClass).attr('data-node-id', n.id).attr('transform', 'translate(' + n.x + ',' + n.y + ')');
      gr.append('rect')
        .attr('class', 'flow-node-hit')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', colBandWidth)
        .attr('height', n.height)
        .attr('fill', 'transparent');
      gr.append('rect').attr('class', 'flow-node-pill').attr('width', n.width).attr('height', n.height);
      gr.append('text')
        .attr('class', 'flow-node-label')
        .attr('x', n.width + 8)
        .attr('y', n.height / 2)
        .attr('dy', '0.35em')
        .text(n.name.length > 28 ? n.name.substring(0, 26) + '…' : n.name);
      gr.style('cursor', 'pointer').on('click', function (e) {
        e.stopPropagation();
        selectedNodeId = n.id;
        applySelection();
        showNodeConnectionsModal(n, rels || {}, extensions || {});
      });
    });

    var colLabels = ['Data Elements', 'Rules', 'Extensions'];
    colXPositions.forEach(function (x, i) {
      g.append('text').attr('class', 'flow-column-label').attr('x', x).attr('y', padding.top - 10).attr('text-anchor', 'start').text(colLabels[i]);
    });

    window.clearFlowSelection = clearSelection;
  }

  function run() {
    var _tsA = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
    if (_tsA) _tsA.page('TagScanner:Flow', { events: 'event12' });

    var loader = document.getElementById('flowLoader');
    var container = document.getElementById('flowChart');
    var searchInput = document.getElementById('flowSearch');
    var searchList = document.getElementById('flowSearchList');
    var clearBtn = document.getElementById('flowSearchClear');

    if (!container) return;

    var rulesArray = getRulesArray();
    var dataElements = getDataElements();
    var extensions = getExtensions();

    loader.style.display = 'none';

    if (!rulesArray.length && !Object.keys(dataElements).length) {
      container.innerHTML = '<div class="flow-empty">No data found. Please load a website from the main page first.</div>';
      return;
    }

    var rels = buildRelationships(rulesArray, dataElements, extensions);
    console.log('[Flow] rules:', rulesArray.length,
      '| DEs:', Object.keys(dataElements).length,
      '| varMeta keys:', Object.keys(rels.varMeta||{}).length,
      '| ruleToVars keys:', Object.keys(rels.ruleToVars||{}).length);

    // ── TEMP DIAGNOSTIC ──────────────────────────────────
    var _actionTypeCounts = {};
    var _ccActionCount = 0;
    var _svRuleCount = 0;
    var _uvRuleCount = 0;
    rulesArray.forEach(function(r) {
      (r.actions || []).forEach(function(a) {
        if (!a.modulePath) return;
        var key = a.modulePath.split('/').pop();
        _actionTypeCounts[key] = (_actionTypeCounts[key] || 0) + 1;
        if (a.settings && a.settings.source) _ccActionCount++;
        if (a.modulePath.indexOf('setVariables') > -1) {
          _svRuleCount++;
          if (_svRuleCount === 1) {
            console.log('[DIAG] First setVariables trackerProperties:',
              JSON.stringify(a.settings && a.settings.trackerProperties, null, 2).slice(0, 800));
          }
        }
        if (a.modulePath.indexOf('updateVariable') > -1) _uvRuleCount++;
      });
    });
    console.log('[DIAG] Total rules:', rulesArray.length);
    console.log('[DIAG] Action types:', JSON.stringify(_actionTypeCounts));
    console.log('[DIAG] setVariables rules:', _svRuleCount);
    console.log('[DIAG] updateVariable rules:', _uvRuleCount);
    console.log('[DIAG] custom code actions:', _ccActionCount);
    console.log('[DIAG] varMeta count:', Object.keys(rels.varMeta || {}).length);
    // ── END DIAGNOSTIC ───────────────────────────────────

    var optionsList = [];
    Object.keys(rels.dataElementToRule).sort().forEach(function (name) {
      optionsList.push({ value: '[Data Element] ' + name, type: 'de', key: name });
    });
    Object.keys(rels.ruleToDataElement).sort().forEach(function (name) {
      optionsList.push({ value: '[Rule] ' + name, type: 'rule', key: name });
    });
    Object.keys(rels.extensionToRule).sort().forEach(function (extId) {
      var disp = (extensions[extId] && extensions[extId].displayName) ? extensions[extId].displayName : extId;
      optionsList.push({ value: '[Extension] ' + disp, type: 'ext', key: extId });
    });
    // Analytics variables — eVars, props, events, XDM fields
    var varMeta = rels.varMeta || {};
    var evarOpts  = [];
    var propOpts  = [];
    var eventOpts = [];
    var xdmOpts   = [];
    Object.keys(varMeta).sort().forEach(function(varId) {
      var meta = varMeta[varId];
      if (meta.type === 'evar')  evarOpts.push({ value: '[eVar] '  + meta.label, type: 'var', key: varId });
      if (meta.type === 'prop')  propOpts.push({ value: '[prop] '  + meta.label, type: 'var', key: varId });
      if (meta.type === 'event') eventOpts.push({ value: '[event] ' + meta.label, type: 'var', key: varId });
      if (meta.type === 'xdm')  xdmOpts.push({ value: '[XDM] '   + meta.label, type: 'var', key: varId });
    });
    optionsList = optionsList
      .concat(evarOpts)
      .concat(propOpts)
      .concat(eventOpts)
      .concat(xdmOpts);

    if (searchList) {
      optionsList.forEach(function (opt) {
        var op = document.createElement('option');
        op.value = opt.value;
        searchList.appendChild(op);
      });
    }

    // ── Mode toggle ───────────────────────────────────────────────────
    var modeSwitch        = document.getElementById('flowModeSwitch');
    var componentControls = document.getElementById('flowComponentControls');
    var variableControls  = document.getElementById('flowVariableControls');
    var chartWrapper      = document.querySelector('.flow-chart-wrapper');
    var varMapEl          = document.getElementById('flowVariableMap');

    // ── Variable map — split panel ────────────────────────────────────

    function numSort(a, b) {
      return (parseInt(a.replace(/\D/g,''), 10) || 0) -
             (parseInt(b.replace(/\D/g,''), 10) || 0);
    }

    function renderVariableMap() {
      var listEl   = document.getElementById('flowVarListInner');
      var detailEl = document.getElementById('flowVarDetailInner');
      if (!listEl || !detailEl) return;

      var storedVars = getAnalyticsVariables();
      var hasStored  = storedVars && (
        Object.keys(storedVars.eVars  || {}).length > 0 ||
        Object.keys(storedVars.props  || {}).length > 0 ||
        Object.keys(storedVars.events || {}).length > 0
      );

      if (hasStored) {
        buildVarList(listEl, storedVars, detailEl);
      } else {
        buildVarListFromMeta(listEl, detailEl);
      }
    }

    function buildVarList(listEl, storedVars, detailEl) {
      var groups = [
        { key: 'eVars',    title: 'eVars',    type: 'evar'     },
        { key: 'props',    title: 'Props',    type: 'prop'     },
        { key: 'events',   title: 'Events',   type: 'event'    },
        { key: 'products', title: 'Products', type: 'products' }
      ];
      var html = '';
      groups.forEach(function(g) {
        var vars = storedVars[g.key] || {};
        var keys = Object.keys(vars).sort(numSort);
        if (!keys.length) return;
        html += '<div class="var-list-section-title">' +
                g.title + ' (' + keys.length + ')</div>';
        keys.forEach(function(varName) {
          html += '<div class="var-list-item" ' +
                  'data-var="' + varName + '" ' +
                  'data-type="' + g.type + '">' +
                  '<span class="var-list-name">' + varName + '</span>' +
                  '<span class="var-list-pill ' + g.type + '">' +
                  g.type.toUpperCase() + '</span>' +
                  '</div>';
        });
      });
      if (!html) {
        html = '<div style="padding:20px;color:#94a3b8;font-size:12px">' +
               'No variables found</div>';
      }
      listEl.innerHTML = html;

      if (listEl._varClickHandler) {
        listEl.removeEventListener('click', listEl._varClickHandler);
      }
      listEl._varClickHandler = function(e) {
        var item = e.target.closest('.var-list-item');
        if (!item) return;
        listEl.querySelectorAll('.var-list-item').forEach(function(el) {
          el.classList.remove('active');
        });
        item.classList.add('active');
        var varName  = item.dataset.var;
        var type     = item.dataset.type;
        var groupKey = type === 'evar' ? 'eVars'
                     : type === 'prop' ? 'props'
                     : type === 'products' ? 'products' : 'events';
        var entries = (storedVars[groupKey] || {})[varName] || [];
        renderVarDetail(detailEl, varName, type, entries);
      };
      listEl.addEventListener('click', listEl._varClickHandler);
    }

    function buildVarListFromMeta(listEl, detailEl) {
      var varMeta    = rels.varMeta    || {};
      var varToRules = rels.varToRules || {};

      // Build reverse index: varId → [deName] from deToVars
      var varToDEs = {};
      Object.keys(rels.deToVars || {}).forEach(function(deName) {
        (rels.deToVars[deName] || []).forEach(function(v) {
          if (!varToDEs[v.varId]) varToDEs[v.varId] = [];
          if (varToDEs[v.varId].indexOf(deName) === -1) {
            varToDEs[v.varId].push(deName);
          }
        });
      });

      // Build entries with proper %token% values
      // Each entry is one rule × DE combination
      function buildEntries(varId) {
        var rules = varToRules[varId] || [];
        var des   = varToDEs[varId]   || [];
        var entries = [];
        var seen = {};

        if (des.length > 0) {
          // Cross rules × DEs — find which rule uses which DE
          // via ruleToDataElement to make connected pairs
          rules.forEach(function(rName) {
            var ruleDEs = Object.keys(
              (rels.ruleToDataElement || {})[rName] || {}
            );
            var matched = des.filter(function(d) {
              return ruleDEs.indexOf(d) > -1;
            });
            if (matched.length > 0) {
              matched.forEach(function(deName) {
                var k = rName + '||%' + deName + '%';
                if (!seen[k]) {
                  seen[k] = true;
                  entries.push({
                    ruleName: rName,
                    value:    '%' + deName + '%',
                    ruleId:   ''
                  });
                }
              });
            } else {
              // Rule sets this var but no DE match — custom code
              var k = rName + '||';
              if (!seen[k]) {
                seen[k] = true;
                entries.push({ ruleName: rName, value: '', ruleId: '' });
              }
            }
          });
        } else {
          // No DEs mapped — all rules use custom code or inline
          rules.forEach(function(rName) {
            var k = rName + '||';
            if (!seen[k]) {
              seen[k] = true;
              entries.push({ ruleName: rName, value: '', ruleId: '' });
            }
          });
        }
        return entries;
      }

      // Build variable list grouped by type
      var groups = {
        evar: [], prop: [], event: [],
        products: [], xdm: [], xdmde: []
      };
      Object.keys(varMeta).sort(numSort).forEach(function(varId) {
        var meta = varMeta[varId];
        if (groups[meta.type]) groups[meta.type].push(varId);
      });

      var groupTitles = {
        evar:     'eVars',
        prop:     'Props',
        event:    'Events',
        products: 'Products',
        xdm:      'XDM Fields',
        xdmde:    'XDM Objects'
      };

      var html = '';
      ['evar', 'prop', 'event', 'products', 'xdm', 'xdmde'].forEach(function(type) {
        var ids = groups[type];
        if (!ids.length) return;
        html += '<div class="var-list-section-title">' +
                groupTitles[type] + ' (' + ids.length + ')</div>';
        ids.forEach(function(varId) {
          var meta = varMeta[varId];
          html += '<div class="var-list-item" ' +
                  'data-varid="' + varId + '" ' +
                  'data-type="' + type + '">' +
                  '<span class="var-list-name">' + meta.label + '</span>' +
                  '<span class="var-list-pill ' + type + '">' +
                  (type === 'xdmde' ? 'XDM OBJ' : type.toUpperCase()) + '</span>' +
                  '</div>';
        });
      });

      listEl.innerHTML = html ||
        '<div style="padding:20px;color:#94a3b8;font-size:12px">' +
        'No variables found in this property.</div>';

      // Click handler
      if (listEl._varClickHandler) {
        listEl.removeEventListener('click', listEl._varClickHandler);
      }
      listEl._varClickHandler = function(e) {
        var item = e.target.closest('.var-list-item');
        if (!item) return;
        listEl.querySelectorAll('.var-list-item').forEach(function(el) {
          el.classList.remove('active');
        });
        item.classList.add('active');
        var varId  = item.dataset.varid;
        var type   = item.dataset.type;
        var meta   = varMeta[varId] || {};
        var entries = buildEntries(varId);
        renderVarDetail(detailEl, meta.label, type, entries);
      };
      listEl.addEventListener('click', listEl._varClickHandler);
    }

    function renderVarDetail(detailEl, varName, type, entries) {

      // ── Helper: get human-readable trigger label from rule name ──
      function getRuleMeta(ruleName) {
        var rule = null;
        for (var i = 0; i < rulesArray.length; i++) {
          if (rulesArray[i].name === ruleName) { rule = rulesArray[i]; break; }
        }
        if (!rule) return { trigger: 'Unknown', conditions: 0 };
        var trigger = 'Unknown';
        if (rule.events && rule.events[0] && rule.events[0].modulePath) {
          var mp = rule.events[0].modulePath;
          trigger = mp.split('/').pop().replace('.js', '');
          // Friendly labels
          var labels = {
            'dom-ready':       'DOM Ready',
            'library-loaded':  'Library Loaded',
            'window-loaded':   'Window Loaded',
            'direct-call':     'Direct Call',
            'click':           'Click',
            'custom-event':    'Custom Event',
            'data-pushed':     'Data Pushed',
            'history-change':  'History Change',
            'enter-viewport':  'Enter Viewport',
            'element-exists':  'Element Exists',
            'scroll-depth':    'Scroll Depth'
          };
          trigger = labels[trigger] || trigger;
          if (trigger === 'Direct Call' && rule.events[0].settings &&
              rule.events[0].settings.identifier) {
            trigger += ' (' + rule.events[0].settings.identifier + ')';
          }
        }
        return {
          trigger:    trigger,
          conditions: (rule.conditions || []).length
        };
      }

      // ── Helper: get DE type label and storage duration ────────────
      function getDEMeta(deName) {
        var de = dataElements[deName];
        if (!de) return null;
        var mp = de.modulePath || '';
        var typeLabel = mp.split('/').pop().replace('.js', '');
        var typeMap = {
          'javascript-variable': 'JS Variable',
          'custom-code':         'Custom Code',
          'cookie':              'Cookie',
          'dom-attribute':       'DOM Attribute',
          'local-storage-item':  'Local Storage',
          'session-storage-item':'Session Storage',
          'query-string-parameter': 'Query String',
          'constant':            'Constant',
          'random-number':       'Random Number'
        };
        typeLabel = typeMap[typeLabel] || typeLabel;
        // XDM Object
        if (mp.indexOf('xdmObject') > -1) typeLabel = 'XDM Object';
        // Alloy variable
        if (mp.indexOf('variable/index') > -1) typeLabel = 'Alloy Variable';
        var s = de.settings || {};
        var dur = s.storeDuration || s.storageDuration ||
                  s.storage_duration || '';
        var durMap = {
          'pageview': 'Pageview',
          'session':  'Session',
          'visitor':  'Visitor',
          'none':     'None'
        };
        dur = durMap[dur] || dur;
        return { typeLabel: typeLabel, duration: dur };
      }

      // ── XDM Object DE — special rendering path ────────────────────
      if (type === 'xdmde') {
        var html = '';
        html += '<div class="var-detail-name">' + varName + '</div>';
        html += '<span class="var-detail-pill xdmde">XDM OBJECT</span>';

        var xdmDE = dataElements[varName];
        if (xdmDE && xdmDE.settings && xdmDE.settings.data) {
          var fieldRows = [];

          function collectXDMFields(obj, path) {
            if (!obj || typeof obj !== 'object') return;
            Object.keys(obj).forEach(function(key) {
              var val = obj[key];
              var fp  = path ? path + '.' + key : key;
              if (/^eVar\d+$/.test(key) || /^prop\d+$/.test(key) ||
                  /^event\d+$/.test(key)) {
                fieldRows.push({
                  field: key,
                  path:  fp,
                  value: typeof val === 'string' ? val : JSON.stringify(val)
                });
              } else if (val && typeof val === 'object') {
                collectXDMFields(val, fp);
              }
            });
          }
          collectXDMFields(xdmDE.settings.data, '');

          if (fieldRows.length > 0) {
            html += '<div class="var-detail-section-title">' +
                    'Analytics fields mapped in this XDM Object</div>';
            html += '<div class="var-detail-chain">';
            fieldRows.forEach(function(row) {
              var tokenMatch = row.value.match(/^%([^%]+)%$/);
              html += '<div class="var-detail-chain-row">';
              html += '<span class="var-chain-rule" ' +
                      'style="background:#fef9c3;border-color:#fde047;' +
                      'color:#854d0e" title="' + row.field + '">' +
                      row.field + '</span>';
              html += '<span class="var-chain-arrow">→</span>';
              if (tokenMatch) {
                var deMeta = getDEMeta(tokenMatch[1]);
                html += '<span class="var-chain-de" title="' +
                        tokenMatch[1] + '">◆ ' + tokenMatch[1] +
                        (deMeta ? '<span style="display:block;font-size:10px;' +
                        'font-weight:400;color:#4ead7a;margin-top:1px">' +
                        deMeta.typeLabel +
                        (deMeta.duration ? ' · ' + deMeta.duration : '') +
                        '</span>' : '') +
                        '</span>';
              } else {
                html += '<span class="var-chain-inline">' +
                        row.value + '</span>';
              }
              html += '</div>';
            });
            html += '</div>';

            var rulesUsing = ((rels.varToRules || {})['xdmde_' + varName] || []).slice();
            if (rulesUsing.length === 0) {
              Object.keys(rels.ruleToDataElement || {}).forEach(
                function(rName) {
                  if ((rels.ruleToDataElement[rName] || {})[varName]) {
                    if (rulesUsing.indexOf(rName) === -1) {
                      rulesUsing.push(rName);
                    }
                  }
                }
              );
            }
            if (rulesUsing.length > 0) {
              html += '<div class="var-detail-section-title">' +
                      'Used by these rules</div>';
              html += '<div class="var-detail-chain">';
              rulesUsing.forEach(function(rName) {
                var rm = getRuleMeta(rName);
                html += '<div class="var-detail-chain-row">';
                html += '<span class="var-chain-rule" title="' + rName + '">' +
                        '⚡ ' + rName +
                        '<span style="display:block;font-size:10px;' +
                        'font-weight:400;color:#6b91d9;margin-top:1px">' +
                        '⏱ ' + rm.trigger +
                        (rm.conditions > 0 ? ' · ' + rm.conditions +
                        ' condition' + (rm.conditions > 1 ? 's' : '') :
                        ' · no conditions') +
                        '</span></span>';
                html += '</div>';
              });
              html += '</div>';
            }
          } else {
            html += '<div class="var-detail-no-sources">' +
                    'No Analytics field mappings found in this XDM Object.</div>';
          }
        } else {
          html += '<div class="var-detail-no-sources">' +
                  'XDM Object settings not readable from the deployed container.</div>';
        }

        detailEl.innerHTML = html;
        return;
      }

      // ── Build chains (rule → DE) and inline values ────────────────
      var chains  = [];
      var inlines = [];
      var seen    = {};

      entries.forEach(function(e) {
        if (!e.ruleName) return;
        var key = e.ruleName + '||' + (e.value || '');
        if (seen[key]) return;
        seen[key] = true;

        var m     = e.value && e.value.match(/^%([^%]+)%$/);
        var isXDM = e.value && e.value.indexOf('XDM: ') === 0;

        var ruleMeta = getRuleMeta(e.ruleName);

        if (m) {
          var deMeta = getDEMeta(m[1]);
          chains.push({
            rule:      e.ruleName,
            ruleMeta:  ruleMeta,
            de:        m[1],
            deMeta:    deMeta,
            via:       'de'
          });
        } else if (isXDM) {
          var xdmName = e.value.replace('XDM: ', '');
          var xdmMeta = getDEMeta(xdmName);
          chains.push({
            rule:      e.ruleName,
            ruleMeta:  ruleMeta,
            de:        xdmName,
            deMeta:    xdmMeta,
            via:       'xdm'
          });
        } else if (e.value) {
          inlines.push({
            rule:     e.ruleName,
            ruleMeta: ruleMeta,
            value:    e.value
          });
        } else {
          chains.push({
            rule:     e.ruleName,
            ruleMeta: ruleMeta,
            de:       null,
            deMeta:   null,
            via:      null
          });
        }
      });

      // ── Conflict detection ─────────────────────────────────────────
      var totalSources = chains.length + inlines.length;

      var uniqueValues = {};
      chains.forEach(function(c) {
        var val = c.de ? ('%' + c.de + '%') : '__custom__';
        uniqueValues[val] = (uniqueValues[val] || 0) + 1;
      });
      inlines.forEach(function(iv) {
        uniqueValues[iv.value] = (uniqueValues[iv.value] || 0) + 1;
      });
      var distinctValues = Object.keys(uniqueValues).length;
      var hasConflict = distinctValues > 1;

      // ── Render ─────────────────────────────────────────────────────
      var html = '';
      html += '<div class="var-detail-name">' + varName + '</div>';
      html += '<span class="var-detail-pill ' + type + '">' +
              type.toUpperCase() + '</span>';

      // Conflict warning
      if (hasConflict) {
        var conflictValues = Object.keys(uniqueValues);
        html += '<div style="margin:10px 0 4px;padding:8px 12px;' +
                'background:#fef9c3;border:1px solid #fde047;' +
                'border-radius:6px;font-size:12px;color:#854d0e">' +
                '⚠ Set to ' + distinctValues + ' different values ' +
                'across ' + totalSources + ' rules — ' +
                'verify execution order: ' +
                conflictValues.map(function(v) {
                  return v === '__custom__' ? 'custom code' : v;
                }).join(', ') +
                '</div>';
      }

      // Chain rows
      if (chains.length > 0) {
        html += '<div class="var-detail-section-title">' +
                'Rule → Data Element → ' + varName + '</div>';
        html += '<div class="var-detail-chain">';

        chains.forEach(function(c) {
          html += '<div class="var-detail-chain-row">';

          // Rule cell with trigger badge
          html += '<span class="var-chain-rule" title="' + c.rule + '">' +
                  '⚡ ' + c.rule +
                  '<span style="display:block;font-size:10px;' +
                  'font-weight:400;color:#6b91d9;margin-top:1px">' +
                  '⏱ ' + c.ruleMeta.trigger +
                  (c.ruleMeta.conditions > 0
                    ? ' · ' + c.ruleMeta.conditions + ' condition' +
                      (c.ruleMeta.conditions > 1 ? 's' : '')
                    : ' · no conditions') +
                  '</span></span>';

          if (c.de) {
            // DE reference resolved from %token%
            html += '<span class="var-chain-arrow">→</span>';
            var deIcon  = c.via === 'xdm' ? '🔷' : '◆';
            var deExtra = '';
            if (c.deMeta) {
              deExtra = '<span style="display:block;font-size:10px;' +
                        'font-weight:400;color:#4ead7a;margin-top:1px">' +
                        c.deMeta.typeLabel +
                        (c.deMeta.duration
                          ? ' · ' + c.deMeta.duration : '') +
                        '</span>';
            }
            html += '<span class="var-chain-de" title="' + c.de + '">' +
                    deIcon + ' ' + c.de + deExtra + '</span>';
          } else {
            // Value set via custom code — source not statically readable
            html += '<span class="var-chain-arrow">→</span>';
            var noSourceLabel = (type === 'event')
              ? 'Fired directly — no data element source'
              : 'Custom code — value set at runtime';
            html += '<span class="var-chain-inline" ' +
                    'style="color:#94a3b8;font-style:italic;' +
                    'border-style:dashed">' +
                    noSourceLabel +
                    '</span>';
          }

          html += '</div>';
        });

        html += '</div>';
      }

      // Inline value rows
      if (inlines.length > 0) {
        html += '<div class="var-detail-section-title">' +
                'Hardcoded values</div>';
        html += '<div class="var-detail-chain">';
        inlines.forEach(function(iv) {
          html += '<div class="var-detail-chain-row">';
          html += '<span class="var-chain-rule" title="' + iv.rule + '">' +
                  '⚡ ' + iv.rule +
                  '<span style="display:block;font-size:10px;' +
                  'font-weight:400;color:#6b91d9;margin-top:1px">' +
                  '⏱ ' + iv.ruleMeta.trigger +
                  (iv.ruleMeta.conditions > 0
                    ? ' · ' + iv.ruleMeta.conditions + ' condition' +
                      (iv.ruleMeta.conditions > 1 ? 's' : '')
                    : ' · no conditions') +
                  '</span></span>';
          html += '<span class="var-chain-arrow">→</span>';
          html += '<span class="var-chain-inline">' +
                  iv.value + '</span>';
          html += '</div>';
        });
        html += '</div>';
      }

      if (chains.length === 0 && inlines.length === 0) {
        html += '<div class="var-detail-no-sources">' +
                'No sources mapped for this variable.</div>';
      }

      detailEl.innerHTML = html;
    }

    function switchToComponentMode() {
      if (componentControls) componentControls.style.display = '';
      if (variableControls)  variableControls.style.display  = 'none';
      if (chartWrapper)      chartWrapper.style.display      = '';
      if (varMapEl)          varMapEl.classList.remove('active');
      var infoEl = document.getElementById('flowVarInfo');
      if (infoEl) infoEl.style.display = 'none';
      var betaEl = document.getElementById('flowVarMapBeta');
      if (betaEl) betaEl.style.display = 'none';
    }

    function switchToVariableMode() {
      if (componentControls) componentControls.style.display = 'none';
      if (variableControls)  variableControls.style.display  = '';
      if (chartWrapper)      chartWrapper.style.display      = 'none';
      if (varMapEl)          varMapEl.classList.add('active');
      var infoEl = document.getElementById('flowVarInfo');
      if (infoEl) infoEl.style.display = 'block';
      var betaEl = document.getElementById('flowVarMapBeta');
      if (betaEl) betaEl.style.display = 'inline';
      renderVariableMap();
    }

    var varInfoToggle = document.getElementById('flowVarInfoToggle');
    if (varInfoToggle) {
      varInfoToggle.addEventListener('click', function() {
        this.classList.toggle('open');
        var body = document.getElementById('flowVarInfoBody');
        if (body) body.classList.toggle('open');
      });
    }

    if (modeSwitch) {
      modeSwitch.addEventListener('change', function() {
        if (this.checked) {
          switchToVariableMode();
        } else {
          switchToComponentMode();
        }
      });
    }

    var tooltip = document.createElement('div');
    tooltip.id = 'flowTooltip';
    tooltip.style.cssText = 'position:fixed;display:none;background:#333;color:#fff;padding:6px 10px;border-radius:4px;font-size:12px;z-index:9999;pointer-events:none;';
    document.body.appendChild(tooltip);

    function updateTooltipPosition(e) {
      var t = document.getElementById('flowTooltip');
      if (t && t.style.display === 'block') {
        t.style.left = (e.pageX + 10) + 'px';
        t.style.top = (e.pageY + 10) + 'px';
      }
    }
    document.addEventListener('mousemove', updateTooltipPosition);

    function findSelection() {
      var val = (searchInput && searchInput.value) ? searchInput.value.trim() : '';
      if (!val) return null;
      return optionsList.filter(function (o) { return o.value === val; })[0] || null;
    }

    function redraw() {
      var sel = findSelection();
      var flowData;
      if (!sel) {
        flowData = { nodes: [], links: [], nodeById: {} };
      } else {
        flowData = buildFlowDataForSelection(rels, extensions, sel.type, sel.key);
      }
      var w = Math.max(container.clientWidth || 900, container.getBoundingClientRect().width || 900);
      var h = Math.max(400, (flowData.nodes.length ? Math.max(flowData.nodes.filter(function (n) { return n.column === 0; }).length, flowData.nodes.filter(function (n) { return n.column === 1; }).length, flowData.nodes.filter(function (n) { return n.column === 2; }).length) * (NODE_HEIGHT + NODE_GAP) + VERT_PADDING * 2 + 24 : 400));
      if (!flowData.nodes.length) {
        container.innerHTML = generateFlowSkeleton();
      } else {
        render(container, flowData, w, h, rels, extensions);
      }
      if (clearBtn) clearBtn.style.display = sel ? 'inline-block' : 'none';
    }

    var closeBtn = document.getElementById('flowNodeModalClose');
    if (closeBtn) closeBtn.addEventListener('click', closeFlowNodeModal);
    document.getElementById('flowNodeModal').addEventListener('click', function (e) {
      if (e.target === this) closeFlowNodeModal();
    });

    redraw();
    if (searchInput) {
      searchInput.addEventListener('input', redraw);
      searchInput.addEventListener('change', redraw);
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (searchInput) searchInput.value = '';
        redraw();
        searchInput.focus();
      });
    }
    window.addEventListener('resize', function () {
      var sel = findSelection();
      if (sel) redraw();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
