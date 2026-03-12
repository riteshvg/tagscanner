var de_details_node = document.getElementById('dataelement_details');
if (de_details_node) {
  var de_value = sessionStorage.getItem('_satellite._container.dataElements');
  if (!de_value || de_value.trim() === '') {
    de_details_node.innerHTML = '<tbody><tr><td colspan="8" style="text-align:center;padding:20px">No data elements found.</td></tr></tbody>';
  } else {
    const dataElements = JSON.parse(de_value);

  // --- Helpers ---
  function stringContainsDERef(str, deName) {
    if (!str || typeof str !== 'string') return false;
    const value = '%' + deName + '%';
    const check1 = '_satellite.getVar("' + deName + '")';
    const check2 = "_satellite.getVar('" + deName + "')";
    return str.indexOf(value) > -1 || str.indexOf(check1) > -1 || str.indexOf(check2) > -1;
  }

  function getDataTypeLabel(modulePath) {
    if (!modulePath) return 'N/A';
    let type = modulePath;
    if (modulePath.indexOf('dataElements') > -1) type = modulePath.split('dataElements/')[1] || type;
    else if (modulePath.indexOf('data_elements') > -1) type = modulePath.split('data_elements/')[1] || type;
    const file = (type.split('/').pop() || '').replace('.js', '') || (type.split('.js')[0] || '');
    const lower = file.toLowerCase();
    const labelMap = {
      'javascript-variable': 'JavaScript Variable',
      'javascriptvariable': 'JavaScript Variable',
      'custom-code': 'Custom Code',
      'customcode': 'Custom Code',
      'computedstate': 'Computed State',
      'computed-state': 'Computed State',
      'cookie': 'Cookie',
      'dom-attribute': 'DOM Attribute',
      'domattribute': 'DOM Attribute',
      'local-storage': 'Local Storage',
      'localstorage': 'Local Storage',
      'session-storage': 'Session Storage',
      'sessionstorage': 'Session Storage',
      'constant': 'Constant',
      'index': 'Custom Code',
      'querystring': 'Query String',
      'query-string': 'Query String',
      'url': 'URL',
      'xdmobject': 'XDM Object',
      'xdm-object': 'XDM Object',
      'element-attribute': 'Element Attribute',
      'elementattribute': 'Element Attribute',
      'merge': 'Merge',
      'random-number': 'Random Number',
      'randombumber': 'Random Number',
      'form-element': 'Form Element',
      'formelement': 'Form Element',
      'script': 'Script',
      'dataelement': 'Data Element',
      'data-element': 'Data Element'
    };
    return labelMap[lower] || labelMap[file] || (file.charAt(0).toUpperCase() + file.slice(1)) || file || 'N/A';
  }

  function getExtensionLabel(modulePath) {
    if (!modulePath) return 'N/A';
    const first = modulePath.split('/')[0];
    const map = {
      'core': 'Core',
      'adobe-alloy': 'Web SDK',
      'gcoe-adobe-client-data-layer': 'ACDL',
      'data-layer-manager-search-discovery': 'DataLayer Manager',
      'adobe-mcid': 'ECID Service',
      'sdi-toolkit': 'SDI Toolkit',
      'common-web-sdk-plugins': 'Common Web SDK Plugin'
    };
    return map[first] || first;
  }

  // Normalize rules to array
  let rulesArray = [];
  try {
    var rulesRaw = sessionStorage.getItem('_satellite._container.rules');
    if (rulesRaw) {
      var rulesObj = JSON.parse(rulesRaw);
      if (Array.isArray(rulesObj)) rulesArray = rulesObj;
      else if (rulesObj && typeof rulesObj === 'object') {
        if (Array.isArray(rulesObj.rules)) rulesArray = rulesObj.rules;
        else rulesArray = Object.values(rulesObj).filter(function (item) { return item && typeof item === 'object'; });
      }
    }
  } catch (e) { rulesArray = []; }

  // Extensions: object keyed by extension id
  let extensionsObj = {};
  try {
    var extRaw = sessionStorage.getItem('_satellite._container.extension');
    if (extRaw) extensionsObj = JSON.parse(extRaw);
    if (!extensionsObj || typeof extensionsObj !== 'object') extensionsObj = {};
  } catch (e) { extensionsObj = {}; }

  // Build usage for each data element
  var deNames = Object.keys(dataElements);
  var rowsData = [];

  for (var idx = 0; idx < deNames.length; idx++) {
    var key = deNames[idx];
    var de = dataElements[key];
    var value = '%' + key + '%';
    var check_de1 = '_satellite.getVar("' + key + '")';
    var check_de2 = "_satellite.getVar('" + key + "')";

    var ruleNames = [];
    for (var r = 0; r < rulesArray.length; r++) {
      var rule = rulesArray[r];
      var actionStr = JSON.stringify(rule.actions || []);
      var conditionStr = JSON.stringify(rule.conditions || []);
      var eventStr = JSON.stringify(rule.events || []);
      var ruleName = rule.name || rule.id || 'Rule ' + (r + 1);
      if (stringContainsDERef(actionStr, key) || stringContainsDERef(conditionStr, key) || stringContainsDERef(eventStr, key) || eventStr.indexOf(key) > -1) {
        ruleNames.push(ruleName);
      }
    }

    var extensionNames = [];
    for (var extKey in extensionsObj) {
      if (extensionsObj.hasOwnProperty(extKey)) {
        var extStr = JSON.stringify(extensionsObj[extKey]);
        if (stringContainsDERef(extStr, key)) {
          extensionNames.push(extensionsObj[extKey].displayName || extKey);
        }
      }
    }

    var otherDENames = [];
    for (var otherKey in dataElements) {
      if (dataElements.hasOwnProperty(otherKey) && otherKey !== key) {
        var otherStr = JSON.stringify(dataElements[otherKey].settings || dataElements[otherKey]);
        if (stringContainsDERef(otherStr, key)) {
          otherDENames.push(otherKey);
        }
      }
    }

    var modulePath = de.modulePath || '';
    var typeLabel = getDataTypeLabel(modulePath);
    var extensionLabel = getExtensionLabel(modulePath);
    var size = new Blob([JSON.stringify(de)]).size;

    rowsData.push({
      name: key,
      typeLabel: typeLabel,
      extensionLabel: extensionLabel,
      rulesCount: ruleNames.length,
      ruleNames: ruleNames,
      extensionsCount: extensionNames.length,
      extensionNames: extensionNames,
      dataElementsCount: otherDENames.length,
      dataElementNames: otherDENames,
      sizeKb: (size / 1000).toFixed(2)
    });
  }

  // Table header with icons (same style as Rules page)
  var thead = document.createElement('thead');
  var headerRow = document.createElement('tr');
  var headers = [
    { text: 'ID #', tooltip: 'Row number', colClass: 'de-col-id' },
    { text: 'Data Element Name', tooltip: 'Name of the data element in your Adobe Tags property' },
    { text: 'Type', tooltip: 'The data element type (e.g. JavaScript Variable, Custom Code, Cookie)' },
    { text: 'Used in Rules', tooltip: 'Number of rules where this data element is used' },
    { text: 'Used in Extensions', tooltip: 'Number of extensions that reference this data element' },
    { text: 'Used in Data Elements', tooltip: 'Number of other data elements that reference this data element' },
    { text: 'Size (KB)', tooltip: 'Size of the data element configuration in kilobytes' }
  ];
  headers.forEach(function (h) {
    var th = document.createElement('th');
    th.textContent = h.text;
    th.title = h.tooltip || '';
    if (h.colClass) th.classList.add(h.colClass);
    th.classList.add('sortable');
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  var tbody = document.createElement('tbody');

  for (var i = 0; i < rowsData.length; i++) {
    var row = rowsData[i];

    var tr = document.createElement('tr');
    tr.classList.add('data-displayed');
    tr._rowIndex = i;
    tr._detailData = { deName: row.name, ruleNames: row.ruleNames, extensionNames: row.extensionNames, dataElementNames: row.dataElementNames, extensionLabel: row.extensionLabel };

    var tdId = document.createElement('td');
    tdId.className = 'de-col-id';
    tdId.style.textAlign = 'center';
    tdId.style.fontWeight = '600';
    tdId.appendChild(document.createTextNode(String(i + 1)));
    tr.appendChild(tdId);

    var tdName = document.createElement('td');
    tdName.className = 'de-name-cell de-name-cell-clickable';
    tdName.style.cursor = 'pointer';
    var nameExpandIcon = document.createElement('span');
    nameExpandIcon.className = 'expand-icon';
    nameExpandIcon.textContent = '▶';
    nameExpandIcon.style.marginRight = '8px';
    nameExpandIcon.style.display = 'inline-block';
    nameExpandIcon.style.transition = 'transform 0.3s ease';
    nameExpandIcon.onclick = function (e) {
      e.stopPropagation();
      var trEl = this.closest('tr');
      if (trEl && trEl._rowIndex !== undefined) toggleDEExpand(this, trEl._rowIndex);
    };
    var nameSpan = document.createElement('span');
    nameSpan.className = 'de-name-text';
    nameSpan.textContent = row.name;
    tdName.appendChild(nameExpandIcon);
    tdName.appendChild(nameSpan);
    tdName.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      var expandIcon = tr.querySelector('.expand-icon');
      if (expandIcon) toggleDEExpand(expandIcon, tr._rowIndex);
      return false;
    };
    tr.appendChild(tdName);

    var tdType = document.createElement('td');
    var typeWrap = document.createElement('span');
    typeWrap.className = 'de-cell-with-icon';
    typeWrap.innerHTML = '<i class="fas fa-tag de-cell-icon"></i> ';
    typeWrap.appendChild(document.createTextNode(row.typeLabel));
    tdType.appendChild(typeWrap);
    tr.appendChild(tdType);

    var tdRules = document.createElement('td');
    tdRules.style.textAlign = 'center';
    var rulesWrap = document.createElement('span');
    rulesWrap.className = 'de-col-icon ' + (row.rulesCount > 0 ? 'de-col-icon-has' : 'de-col-icon-empty');
    rulesWrap.title = row.rulesCount + ' rule(s)';
    rulesWrap.innerHTML = '<i class="fas fa-wrench"></i> <span class="de-col-icon-count">' + row.rulesCount + '</span>';
    tdRules.appendChild(rulesWrap);
    if (row.rulesCount < 1) tr.classList.add('rule-0'); else tr.classList.add('rule-1');
    tr.appendChild(tdRules);

    var tdExt = document.createElement('td');
    tdExt.style.textAlign = 'center';
    var extWrap = document.createElement('span');
    extWrap.className = 'de-col-icon ' + (row.extensionsCount > 0 ? 'de-col-icon-has' : 'de-col-icon-empty');
    extWrap.title = row.extensionsCount + ' extension(s)';
    extWrap.innerHTML = '<i class="fas fa-puzzle-piece"></i> <span class="de-col-icon-count">' + row.extensionsCount + '</span>';
    tdExt.appendChild(extWrap);
    tr.appendChild(tdExt);

    var tdDE = document.createElement('td');
    tdDE.style.textAlign = 'center';
    var deWrap = document.createElement('span');
    deWrap.className = 'de-col-icon ' + (row.dataElementsCount > 0 ? 'de-col-icon-has' : 'de-col-icon-empty');
    deWrap.title = row.dataElementsCount + ' data element(s)';
    deWrap.innerHTML = '<i class="fas fa-sitemap"></i> <span class="de-col-icon-count">' + row.dataElementsCount + '</span>';
    tdDE.appendChild(deWrap);
    tr.appendChild(tdDE);

    var tdSize = document.createElement('td');
    var sizeWrap = document.createElement('span');
    sizeWrap.className = 'de-cell-with-icon';
    sizeWrap.innerHTML = '<i class="fas fa-weight-hanging de-cell-icon"></i> ';
    sizeWrap.appendChild(document.createTextNode(row.sizeKb));
    tdSize.appendChild(sizeWrap);
    tr.appendChild(tdSize);

    tbody.appendChild(tr);
  }

  de_details_node.appendChild(thead);
  de_details_node.appendChild(tbody);

  // Ensure data element name cell clicks never navigate (capture phase)
  de_details_node.addEventListener('click', function (e) {
    var cell = e.target && e.target.closest && e.target.closest('td.de-name-cell-clickable');
    if (cell) {
      e.preventDefault();
      e.stopPropagation();
      var tr = cell.closest('tr');
      if (tr && tr._rowIndex !== undefined) {
        var expandIcon = tr.querySelector('.expand-icon');
        if (expandIcon) toggleDEExpand(expandIcon, tr._rowIndex);
      }
      return false;
    }
  }, true);

  // Expandable row: show which rules, extensions, and data elements use this DE
  function toggleDEExpand(icon, rowIndex) {
    var mainRows = Array.from(tbody.querySelectorAll('tr.data-displayed'));
    var currentRow = mainRows[rowIndex];
    if (!currentRow) return;
    var next = currentRow.nextElementSibling;
    if (next && next.classList.contains('expandable-row')) {
      next.classList.toggle('active');
      icon.classList.toggle('expanded');
      var rowIcons = currentRow.querySelectorAll('.expand-icon');
      for (var si = 0; si < rowIcons.length; si++) {
        if (rowIcons[si] !== icon) rowIcons[si].classList.toggle('expanded');
      }
      return;
    }
    var data = currentRow._detailData;
    if (!data) return;

    var td = document.createElement('td');
    td.colSpan = 7;
    td.style.padding = '12px';
    td.style.backgroundColor = '#f8f9fa';
    td.style.border = '1px solid #ddd';

    var wrap = document.createElement('div');
    wrap.className = 'expanded-content expanded-content-columns';

    function addSection(title, iconClass, items, options) {
      var section = document.createElement('div');
      section.className = 'expanded-section expanded-section-column';
      var h = document.createElement('h4');
      var sectionIcon = document.createElement('i');
      sectionIcon.className = 'section-icon fas ' + iconClass;
      h.appendChild(sectionIcon);
      h.appendChild(document.createTextNode(title));
      section.appendChild(h);
      var ul = document.createElement('ul');
      ul.className = 'expanded-detail-list';
      if (items.length === 0) {
        var li = document.createElement('li');
        li.appendChild(document.createElement('i')).className = 'item-icon fas fa-chevron-right';
        li.appendChild(document.createTextNode('None'));
        ul.appendChild(li);
      } else {
        items.forEach(function (item) {
          var li = document.createElement('li');
          var itemIcon = document.createElement('i');
          itemIcon.className = 'item-icon fas fa-chevron-right';
          li.appendChild(itemIcon);
          if (options && options.onRuleClick) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'rule-usage-link';
            btn.textContent = item;
            btn.onclick = function () { options.onRuleClick(item); };
            li.appendChild(btn);
          } else if (options && options.onDEClick) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'rule-usage-link';
            btn.textContent = item;
            btn.onclick = function () { options.onDEClick(item); };
            li.appendChild(btn);
          } else if (options && typeof options.linkTemplate === 'function') {
            var href = options.linkTemplate(item);
            if (href) {
              var link = document.createElement('a');
              link.href = href;
              link.target = 'iframe2';
              link.textContent = item;
              li.appendChild(link);
            } else {
              li.appendChild(document.createTextNode(item));
            }
          } else {
            li.appendChild(document.createTextNode(item));
          }
          ul.appendChild(li);
        });
      }
      section.appendChild(ul);
      wrap.appendChild(section);
    }

    var deName = data.deName || '';
    if (data.extensionLabel) {
      var extSection = document.createElement('div');
      extSection.className = 'expanded-section expanded-section-column';
      var extH = document.createElement('h4');
      extH.innerHTML = '<i class="section-icon fas fa-puzzle-piece"></i> Extension';
      extSection.appendChild(extH);
      var extP = document.createElement('p');
      extP.style.margin = '0';
      extP.style.fontSize = '13px';
      extP.style.color = '#5a5c69';
      extP.textContent = data.extensionLabel;
      extSection.appendChild(extP);
      wrap.appendChild(extSection);
    }
    addSection('Rules (' + data.ruleNames.length + ')', 'fa-gavel', data.ruleNames, { onRuleClick: function (ruleName) { openRuleUsageModal(ruleName, deName); } });
    addSection('Extensions (' + data.extensionNames.length + ')', 'fa-puzzle-piece', data.extensionNames, null);
    addSection('Data Elements (' + data.dataElementNames.length + ')', 'fa-database', data.dataElementNames, { onDEClick: function (otherDEName) { openDEUsageModal(otherDEName, deName); } });

    td.appendChild(wrap);
    var newExpandableRow = document.createElement('tr');
    newExpandableRow.className = 'expandable-row active';
    newExpandableRow.appendChild(td);
    tbody.insertBefore(newExpandableRow, currentRow.nextSibling);
    icon.classList.add('expanded');
    var rowIcons = currentRow.querySelectorAll('.expand-icon');
    for (var si = 0; si < rowIcons.length; si++) {
      if (rowIcons[si] !== icon) rowIcons[si].classList.add('expanded');
    }
  }

  // --- Modal: how data element is used in a rule (Rules-tab style) ---
  function getRulesArray() {
    try {
      var raw = sessionStorage.getItem('_satellite._container.rules');
      if (!raw) return [];
      var o = JSON.parse(raw);
      if (Array.isArray(o)) return o;
      if (o && typeof o === 'object') {
        if (Array.isArray(o.rules)) return o.rules;
        return Object.values(o).filter(function (item) { return item && typeof item === 'object'; });
      }
      return [];
    } catch (e) { return []; }
  }

  function eventLabel(ev) {
    if (ev.modulePath && ev.modulePath.indexOf('directCall') !== -1) {
      return (ev.settings && ev.settings.identifier) ? 'Direct Call: ' + ev.settings.identifier : 'Direct Call';
    }
    if (ev.modulePath) return ev.modulePath.split('/').pop().replace('.js', '');
    return ev.name || ev.type || 'Event';
  }

  function conditionLabel(c) {
    if (c.modulePath) return c.modulePath.split('/').pop().replace('.js', '');
    return c.name || c.type || 'Condition';
  }

  function actionLabel(a) {
    if (!a.modulePath) return a.name || a.type || 'Action';
    var path = a.modulePath;
    var name = path.split('/').pop().replace('.js', '');
    if (name === 'index') {
      if (path.indexOf('adobe-alloy') !== -1) {
        if (path.indexOf('sendEvent') !== -1) return 'WebSDK Send Event';
        if (path.indexOf('sendBeacon') !== -1) return 'WebSDK Send Beacon';
        if (path.indexOf('setConsent') !== -1) return 'WebSDK Set Consent';
        if (path.indexOf('setVariables') !== -1) return 'WebSDK Set Variables';
        if (path.indexOf('updateVariables') !== -1) return 'WebSDK Update Variable';
      }
      if (path.indexOf('adobe-analytics') !== -1) {
        if (path.indexOf('setVariables') !== -1) return 'Set Variables';
        if (path.indexOf('updateVariables') !== -1) return 'Update Variables';
      }
      return 'Action';
    }
    return name;
  }

  function getEventSummary(ev) {
    if (!ev || !ev.settings || typeof ev.settings !== 'object') return eventLabel(ev);
    var s = ev.settings;
    if (ev.modulePath && ev.modulePath.indexOf('directCall') !== -1) {
      return s.identifier ? 'Direct Call: ' + s.identifier : 'Direct Call';
    }
    var target = '';
    if (s.selector && typeof s.selector === 'string' && s.selector.trim()) target = s.selector.trim();
    else if (s.elementId && typeof s.elementId === 'string' && s.elementId.trim()) target = '#' + s.elementId.replace(/^#/, '').trim();
    else if (s.elementClasses && typeof s.elementClasses === 'string' && s.elementClasses.trim()) target = '.' + s.elementClasses.replace(/^\s*\./, '').trim().replace(/\s+/g, '.');
    else if (s.elementTag && typeof s.elementTag === 'string' && s.elementTag.trim()) target = s.elementTag.trim();
    var eventName = (s.eventName || s.eventType || s.trigger || '').toString().trim();
    if (target && eventName) return eventName + ' on ' + target;
    if (target) return eventLabel(ev) + ' on ' + target;
    if (eventName) return eventName;
    return eventLabel(ev);
  }

  function escapeHtml(str) {
    if (str == null) return '';
    var s = String(str);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function highlightDEInText(text, deName) {
    if (!deName || text == null) return escapeHtml(String(text));
    var escaped = escapeHtml(String(text));
    var patterns = [
      '%' + deName + '%',
      '_satellite.getVar("' + deName + '")',
      "_satellite.getVar('" + deName + "')"
    ];
    for (var i = 0; i < patterns.length; i++) {
      var pe = escapeHtml(patterns[i]);
      escaped = escaped.split(pe).join('<mark class="de-highlight">' + pe + '</mark>');
    }
    return escaped;
  }

  function highlightDEInCode(code, deName) {
    if (!deName || code == null) return escapeHtml(String(code));
    var escaped = escapeHtml(String(code));
    var patterns = [
      '%' + deName + '%',
      '_satellite.getVar("' + deName + '")',
      "_satellite.getVar('" + deName + "')"
    ];
    for (var i = 0; i < patterns.length; i++) {
      var pe = escapeHtml(patterns[i]);
      escaped = escaped.split(pe).join('<mark class="de-highlight">' + pe + '</mark>');
    }
    return escaped;
  }

  function openRuleUsageModal(ruleName, deName) {
    var rulesArray = getRulesArray();
    var rule = null;
    for (var i = 0; i < rulesArray.length; i++) {
      if (rulesArray[i].name === ruleName || rulesArray[i].id === ruleName) {
        rule = rulesArray[i];
        break;
      }
    }
    if (!rule) {
      if (document.getElementById('ruleUsageModalTitle')) document.getElementById('ruleUsageModalTitle').textContent = 'Rule not found';
      if (document.getElementById('ruleUsageModalBody')) document.getElementById('ruleUsageModalBody').innerHTML = '<p>Rule "' + (ruleName || '') + '" was not found.</p>';
      var modal = document.getElementById('ruleUsageModal');
      if (modal) modal.classList.add('show');
      return;
    }

    var events = rule.events && Array.isArray(rule.events) ? rule.events : [];
    var conditions = rule.conditions && Array.isArray(rule.conditions) ? rule.conditions : [];
    var actions = rule.actions && Array.isArray(rule.actions) ? rule.actions : [];

    var usedEvents = events.filter(function (ev) { return stringContainsDERef(JSON.stringify(ev), deName); });
    var usedConditions = conditions.filter(function (c) { return stringContainsDERef(JSON.stringify(c), deName); });
    var usedActions = actions.filter(function (a) { return stringContainsDERef(JSON.stringify(a), deName); });

    document.getElementById('ruleUsageModalTitle').textContent = 'Data element "' + deName + '" used in rule "' + (rule.name || ruleName) + '"';
    var body = document.getElementById('ruleUsageModalBody');
    body.innerHTML = '';

    function addUsageBlock(parent, label, detailText, viewContent, viewTitle, deNameForHighlight) {
      var block = document.createElement('div');
      block.className = 'de-usage-block';
      var labelEl = document.createElement('div');
      labelEl.className = 'label';
      if (deNameForHighlight) {
        labelEl.innerHTML = highlightDEInText(label, deNameForHighlight);
      } else {
        labelEl.textContent = label;
      }
      block.appendChild(labelEl);
      if (detailText) {
        var detail = document.createElement('div');
        detail.className = 'detail';
        if (deNameForHighlight) {
          detail.innerHTML = highlightDEInText(detailText, deNameForHighlight);
        } else {
          detail.textContent = detailText;
        }
        block.appendChild(detail);
      }
      if (viewContent != null) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-view';
        btn.textContent = 'View ' + (viewTitle || 'details');
        btn.onclick = function () { showDECodeModal(viewTitle || 'Details', viewContent, deName); };
        block.appendChild(btn);
      }
      parent.appendChild(block);
    }

    function addSectionToModal(title, iconClass, items, getLabel, getSummary, getViewContent) {
      var section = document.createElement('div');
      section.className = 'usage-section';
      var h4 = document.createElement('h4');
      var icon = document.createElement('i');
      icon.className = 'fas ' + (iconClass || 'fa-circle');
      h4.appendChild(icon);
      h4.appendChild(document.createTextNode(title));
      section.appendChild(h4);
      if (items.length === 0) {
        addUsageBlock(section, 'None', '', null, null, null);
      } else {
        items.forEach(function (item) {
          var lbl = getLabel(item);
          var summary = getSummary ? getSummary(item) : '';
          var viewContent = getViewContent ? getViewContent(item) : null;
          var viewTitle = lbl;
          addUsageBlock(section, lbl, summary, viewContent, viewTitle, deName);
        });
      }
      body.appendChild(section);
    }

    addSectionToModal('Events', 'fa-bolt', usedEvents, eventLabel, getEventSummary, function (ev) {
      return ev.settings ? JSON.stringify(ev.settings, null, 2) : null;
    });
    addSectionToModal('Conditions', 'fa-filter', usedConditions, conditionLabel, null, function (c) {
      return c.settings ? JSON.stringify(c.settings, null, 2) : null;
    });
    addSectionToModal('Actions', 'fa-cogs', usedActions, actionLabel, null, function (a) {
      return a.settings ? JSON.stringify(a.settings, null, 2) : null;
    });

    document.getElementById('ruleUsageModal').classList.add('show');
  }

  function showDECodeModal(title, code, deNameForHighlight) {
    var modal = document.getElementById('deCodeModal');
    var titleEl = document.getElementById('deCodeModalTitle');
    var contentEl = document.getElementById('deCodeModalContent');
    var copyBtn = document.getElementById('deCodeModalCopyBtn');
    if (modal && titleEl && contentEl) {
      titleEl.textContent = title;
      var rawCode = code != null ? String(code) : '';
      if (deNameForHighlight) {
        contentEl.innerHTML = highlightDEInCode(rawCode, deNameForHighlight);
      } else {
        contentEl.textContent = rawCode;
      }
      modal.classList.add('show');
      if (copyBtn) {
        copyBtn._currentCode = rawCode;
        copyBtn.onclick = function () {
          var text = copyBtn._currentCode != null ? copyBtn._currentCode : contentEl.innerText;
          if (!text) return;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
              copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied';
              setTimeout(function () { copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy'; }, 2000);
            });
          } else {
            try {
              var ta = document.createElement('textarea');
              ta.value = text;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
              copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied';
              setTimeout(function () { copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy'; }, 2000);
            } catch (e) {}
          }
        };
      }
    }
  }

  function openDEUsageModal(otherDEName, currentDeName) {
    var deRaw = sessionStorage.getItem('_satellite._container.dataElements');
    var dataElements = {};
    try {
      if (deRaw) dataElements = JSON.parse(deRaw);
    } catch (e) {}
    var otherDE = dataElements[otherDEName];
    if (!otherDE) {
      document.getElementById('deUsageModalTitle').textContent = 'Data element not found';
      document.getElementById('deUsageModalBody').innerHTML = '<p>Data element "' + escapeHtml(otherDEName || '') + '" was not found.</p>';
      document.getElementById('deUsageModal').classList.add('show');
      return;
    }

    document.getElementById('deUsageModalTitle').textContent = 'Data element "' + currentDeName + '" used in data element "' + otherDEName + '"';
    var body = document.getElementById('deUsageModalBody');
    body.innerHTML = '';

    var typeLabel = getDataTypeLabel(otherDE.modulePath || '');
    var extensionLabel = getExtensionLabel(otherDE.modulePath || '');
    var settingsJson = otherDE.settings ? JSON.stringify(otherDE.settings, null, 2) : '{}';

    var section = document.createElement('div');
    section.className = 'usage-section';
    var h4 = document.createElement('h4');
    var icon = document.createElement('i');
    icon.className = 'fas fa-database';
    h4.appendChild(icon);
    h4.appendChild(document.createTextNode('Referenced in configuration'));
    section.appendChild(h4);

    var block = document.createElement('div');
    block.className = 'de-usage-block';
    var labelEl = document.createElement('div');
    labelEl.className = 'label';
    labelEl.innerHTML = escapeHtml(otherDEName) + ' (' + escapeHtml(typeLabel) + ' \u2013 ' + escapeHtml(extensionLabel) + ')';
    block.appendChild(labelEl);
    var detail = document.createElement('div');
    detail.className = 'detail';
    detail.innerHTML = highlightDEInText('This data element references "' + currentDeName + '" in its settings. View full configuration below to see the highlighted usage.', currentDeName);
    block.appendChild(detail);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-view';
    btn.textContent = 'View full settings';
    btn.onclick = function () { showDECodeModal('Settings: ' + otherDEName, settingsJson, currentDeName); };
    block.appendChild(btn);
    section.appendChild(block);
    body.appendChild(section);

    var linkWrap = document.createElement('p');
    linkWrap.style.marginTop = '16px';
    linkWrap.style.fontSize = '14px';
    var detailLink = document.createElement('a');
    detailLink.href = 'dedetails.html?dename=' + encodeURIComponent(otherDEName);
    detailLink.target = 'iframe2';
    detailLink.textContent = 'Open full data element details \u2192';
    detailLink.style.color = '#27c5c1';
    linkWrap.appendChild(detailLink);
    body.appendChild(linkWrap);

    document.getElementById('deUsageModal').classList.add('show');
  }

  // Pagination
  const rowsPerPage = 15;
  let currentPage = parseInt(sessionStorage.getItem('dataElementsCurrentPage')) || 1;
  let totalPages = Math.ceil(rowsData.length / rowsPerPage);

  function updatePageInfo() {
    var mainRows = Array.from(tbody.querySelectorAll('tr.data-displayed'));
    var visibleMain = mainRows.filter(function (r) { return !r.classList.contains('search-hidden'); });
    totalPages = Math.max(1, Math.ceil(visibleMain.length / rowsPerPage));
    document.getElementById('currentPage').textContent = currentPage;
    document.getElementById('totalPages').textContent = totalPages;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage >= totalPages;
    sessionStorage.setItem('dataElementsCurrentPage', currentPage);
  }

  function showPage(page) {
    var allRows = Array.from(tbody.querySelectorAll('tr'));
    var mainRows = allRows.filter(function (r) { return r.classList.contains('data-displayed'); });
    var expandableRows = allRows.filter(function (r) { return r.classList.contains('expandable-row'); });
    var visibleMain = mainRows.filter(function (r) { return !r.classList.contains('search-hidden'); });

    mainRows.forEach(function (r) { r.style.display = 'none'; });
    expandableRows.forEach(function (r) { r.style.display = 'none'; });

    totalPages = Math.max(1, Math.ceil(visibleMain.length / rowsPerPage));
    var start = (page - 1) * rowsPerPage;
    var end = start + rowsPerPage;
    var toShow = visibleMain.slice(start, end);
    toShow.forEach(function (r) {
      r.style.display = '';
      var next = r.nextElementSibling;
      if (next && next.classList.contains('expandable-row')) next.style.display = '';
    });
    updatePageInfo();
  }

  document.getElementById('prevPage').addEventListener('click', function () {
    if (currentPage > 1) { currentPage--; showPage(currentPage); }
  });
  document.getElementById('nextPage').addEventListener('click', function () {
    if (currentPage < totalPages) { currentPage++; showPage(currentPage); }
  });
  showPage(currentPage);

  var searchInput = document.getElementById('dataElementSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      var term = this.value.toLowerCase().trim();
      var mainRows = Array.from(tbody.querySelectorAll('tr.data-displayed'));
      mainRows.forEach(function (row) {
        var nameCell = row.querySelector('.de-name-cell');
        var nameEl = nameCell && nameCell.querySelector('.de-name-text');
        var name = (nameEl ? nameEl.textContent : (nameCell ? nameCell.textContent : '')).toLowerCase();
        if (name.indexOf(term) > -1) row.classList.remove('search-hidden');
        else row.classList.add('search-hidden');
      });
      currentPage = 1;
      showPage(1);
    });
  }
  }

  // Optional sort (by column index) – can be wired to header clicks like rule.js
}

var download_button = document.getElementsByClassName('download-button');
if (download_button[0]) {
  download_button[0].innerHTML = '';
  var exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn-success btn-sm';
  exportBtn.innerHTML = '<i class="fas fa-file-csv"></i> Export CSV';
  exportBtn.onclick = function () {
    var csv = [];
    var rows = document.querySelectorAll('#dataelement_details tr:not(.expandable-row)');
    for (var i = 0; i < rows.length; i++) {
      var row = [];
      var cols = rows[i].querySelectorAll('td, th');
      for (var j = 0; j < cols.length; j++) row.push(cols[j].innerText);
      csv.push(row.join(','));
    }
    var csvFile = new Blob([csv.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.download = 'dataelements.csv';
    a.href = window.URL.createObjectURL(csvFile);
    a.click();
    window.URL.revokeObjectURL(a.href);
  };
  download_button[0].appendChild(exportBtn);
}

var set_display = document.getElementById('set_display');
if (set_display) set_display.style.display = 'none';

// Modal close functions in global scope so inline onclick and addEventListener work
function closeDERuleUsageModal() {
  var modal = document.getElementById('ruleUsageModal');
  if (modal) modal.classList.remove('show');
}
function closeDEDeUsageModal() {
  var modal = document.getElementById('deUsageModal');
  if (modal) modal.classList.remove('show');
}
function closeDECodeModal() {
  var modal = document.getElementById('deCodeModal');
  if (modal) modal.classList.remove('show');
}

// Attach close button listeners so cross works even when inline onclick fails (e.g. extension iframe)
function initDEModalCloseButtons() {
  var ruleModal = document.getElementById('ruleUsageModal');
  var deUsageModal = document.getElementById('deUsageModal');
  var codeModal = document.getElementById('deCodeModal');
  if (ruleModal) {
    var ruleClose = ruleModal.querySelector('.de-modal-close');
    if (ruleClose) ruleClose.addEventListener('click', closeDERuleUsageModal);
  }
  if (deUsageModal) {
    var deUsageClose = deUsageModal.querySelector('.de-modal-close');
    if (deUsageClose) deUsageClose.addEventListener('click', closeDEDeUsageModal);
  }
  if (codeModal) {
    var codeClose = codeModal.querySelector('.de-modal-close');
    if (codeClose) codeClose.addEventListener('click', closeDECodeModal);
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDEModalCloseButtons);
} else {
  initDEModalCloseButtons();
}
