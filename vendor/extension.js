(function () {
  'use strict';

  var ROWS_PER_PAGE = 9999;
  var currentPage = 1;
  var builtExtensionCount = 0; // set in buildTable so footer count is correct regardless of DOM
  var value_obj = {}; // extension key -> { [ruleName]: { rule, events, conditions }, dataelement?: [{ name, path }] }

  function isComponentDisabled(obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (obj.enabled === false) return true;
    if (obj.disabled === true) return true;
    if (obj.isEnabled === false) return true;
    if (typeof obj.status === 'string' && obj.status.toLowerCase() === 'disabled') return true;
    if (typeof obj.state === 'string' && obj.state.toLowerCase() === 'disabled') return true;
    return false;
  }

  function getExtensionObject() {
    var raw = sessionStorage.getItem('_satellite._container.extension');
    if (!raw || raw.trim() === '') return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function getRulesArray() {
    var raw = sessionStorage.getItem('_satellite._container.rules');
    if (!raw || raw.trim() === '') return [];
    try {
      var o = JSON.parse(raw);
      return Array.isArray(o) ? o : (o && o.rules && Array.isArray(o.rules) ? o.rules : []);
    } catch (e) {
      return [];
    }
  }

  function getDataElementsObject() {
    var raw = sessionStorage.getItem('_satellite._container.dataElements');
    if (!raw || raw.trim() === '') return {};
    try {
      var o = JSON.parse(raw);
      return typeof o === 'object' && o !== null ? o : {};
    } catch (e) {
      return {};
    }
  }

  function buildUsageMap() {
    var rules = getRulesArray();
    var de_obj = getDataElementsObject();
    var extObjForKeys = getExtensionObject() || {};
    var extKeys = Object.keys(extObjForKeys);

    function getCustomCodeStringsFromComponent(comp) {
      var out = [];
      if (!comp || typeof comp !== 'object') return out;
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

    function findExtensionRefsInCustomCode(codeStr) {
      if (!codeStr || typeof codeStr !== 'string') return [];
      var lower = codeStr.toLowerCase();
      if (lower.indexOf('turbine') === -1) return [];
      var hits = [];
      for (var i = 0; i < extKeys.length; i++) {
        var extKey = extKeys[i];
        var k = String(extKey || '').toLowerCase();
        if (!k) continue;
        var hasKey =
          lower.indexOf("turbine.getextensionsettings('" + k + "')") > -1 ||
          lower.indexOf('turbine.getextensionsettings(\"' + k + '\")') > -1 ||
          lower.indexOf("turbine.getsharedmodule('" + k + "'") > -1 ||
          lower.indexOf('turbine.getsharedmodule(\"' + k + '\"') > -1;
        if (hasKey) hits.push(extKey);
      }
      return hits;
    }

    function getEventDisplayName(ev) {
      if (!ev) return 'Event';
      if (ev.type) return ev.type;
      if (ev.name) return ev.name;
      if (ev.modulePath) return ev.modulePath.split('/').pop().replace(/\.js$/, '') || 'Event';
      return 'Event';
    }

    // Per extension: track which RULES use it (by rule name) in action/event/condition.
    // Structure: value_obj[extKey][ruleName] = { rule, events: [names], conditions }; value_obj[extKey].dataelement = [ { name, path } ]
    rules.forEach(function (rule) {
      var ruleName = rule.name || rule.id || 'Unnamed Rule';
      if (rule.actions) {
        rule.actions.forEach(function (action) {
          if (action.modulePath) {
            var extKey = action.modulePath.split('/')[0];
            value_obj[extKey] = value_obj[extKey] || {};
            if (!value_obj[extKey][ruleName]) value_obj[extKey][ruleName] = { rule: false, events: [], conditions: false };
            value_obj[extKey][ruleName].rule = true;
          }
          // Custom code can invoke other extensions via turbine.* APIs
          getCustomCodeStringsFromComponent(action).forEach(function (s) {
            findExtensionRefsInCustomCode(s).forEach(function (k) {
              value_obj[k] = value_obj[k] || {};
              if (!value_obj[k][ruleName]) value_obj[k][ruleName] = { rule: false, events: [], conditions: false };
              value_obj[k][ruleName].rule = true;
            });
          });
        });
      }
      if (rule.events) {
        rule.events.forEach(function (ev) {
          if (ev.modulePath) {
            var extKey = ev.modulePath.split('/')[0];
            value_obj[extKey] = value_obj[extKey] || {};
            if (!value_obj[extKey][ruleName]) value_obj[extKey][ruleName] = { rule: false, events: [], conditions: false };
            value_obj[extKey][ruleName].events.push(getEventDisplayName(ev));
          }
          getCustomCodeStringsFromComponent(ev).forEach(function (s) {
            findExtensionRefsInCustomCode(s).forEach(function (k) {
              value_obj[k] = value_obj[k] || {};
              if (!value_obj[k][ruleName]) value_obj[k][ruleName] = { rule: false, events: [], conditions: false };
              value_obj[k][ruleName].events.push(getEventDisplayName(ev));
            });
          });
        });
      }
      if (rule.conditions) {
        rule.conditions.forEach(function (cond) {
          if (cond.modulePath) {
            var extKey = cond.modulePath.split('/')[0];
            value_obj[extKey] = value_obj[extKey] || {};
            if (!value_obj[extKey][ruleName]) value_obj[extKey][ruleName] = { rule: false, events: [], conditions: false };
            value_obj[extKey][ruleName].conditions = true;
          }
          getCustomCodeStringsFromComponent(cond).forEach(function (s) {
            findExtensionRefsInCustomCode(s).forEach(function (k) {
              value_obj[k] = value_obj[k] || {};
              if (!value_obj[k][ruleName]) value_obj[k][ruleName] = { rule: false, events: [], conditions: false };
              value_obj[k][ruleName].conditions = true;
            });
          });
        });
      }
    });

    // Data elements: list of { name, path } per extension (for details page); count = array length
    Object.keys(de_obj).forEach(function (key) {
      var item = de_obj[key];
      if (item && item.modulePath) {
        var extKey = item.modulePath.split('/')[0];
        value_obj[extKey] = value_obj[extKey] || {};
        if (!value_obj[extKey].dataelement) value_obj[extKey].dataelement = [];
        value_obj[extKey].dataelement.push({ name: key, path: item.modulePath });
      }
    });

    try {
      sessionStorage.setItem('_satellite._extension', JSON.stringify(value_obj));
    } catch (e) {}
  }

  function getSizeKb(extObj) {
    if (!extObj) return 0;
    try {
      var len = new Blob([JSON.stringify(extObj)]).size;
      return Number((len / 1000).toFixed(2));
    } catch (e) {
      return 0;
    }
  }

  function buildTable(extObj) {
    var table = document.getElementById('extension_details');
    if (!table) return;

    // Remove any existing thead/tbody so count and rows come from this build only
    table.querySelectorAll('thead').forEach(function (el) { el.remove(); });
    table.querySelectorAll('tbody').forEach(function (el) { el.remove(); });

    var thead = document.createElement('thead');
    var headerRow = document.createElement('tr');
    var headers = [
      { text: 'ID #', tooltip: 'Extension number', className: 'ext-col-id' },
      { text: 'Extension Name', tooltip: 'Activated extensions in the Adobe Tags property' },
      { text: 'Actions', tooltip: 'Extension used as part of an Action' },
      { text: 'Events', tooltip: 'Extension used to trigger an Event' },
      { text: 'Conditions', tooltip: 'Extension used in a Condition' },
      { text: 'Data Elements', tooltip: 'Extension used to create a Data Element' },
      { text: 'Size (KB)', tooltip: 'Approximate extension size' }
    ];
    headers.forEach(function (h, idx) {
      var th = document.createElement('th');
      th.className = h.className || '';
      th.innerHTML = h.text + ' &nbsp;<i class="fa fa-info-circle" style="font-size: 14px" title="' + (h.tooltip || '') + '"></i>';
      if (idx > 0) th.classList.add('sortable');
      th.setAttribute('data-col', String(idx));
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    function makeIconCell(count, iconClass, title) {
      var td = document.createElement('td');
      td.style.textAlign = 'center';
      td.setAttribute('data-sort-value', String(count));
      var span = document.createElement('span');
      span.className = 'ext-col-icon ' + (count > 0 ? 'ext-col-icon-has' : 'ext-col-icon-empty');
      span.title = title;
      span.innerHTML = '<i class="fas ' + iconClass + '"></i> <span class="ext-col-icon-count">' + count + '</span>';
      td.appendChild(span);
      return td;
    }

    function buildExpandableContent(extKey, v) {
      var wrap = document.createElement('div');
      wrap.className = 'ext-expanded-content';

      var scrollWrap = document.createElement('div');
      scrollWrap.className = 'ext-expanded-table-scroll';

      var tbl = document.createElement('table');
      tbl.className = 'ext-expanded-table';
      tbl.innerHTML = '<thead><tr><th>Rules</th><th>Events</th><th>Data Elements</th><th>Conditions</th></tr></thead><tbody></tbody>';
      var tbody = tbl.querySelector('tbody');

      var ruleNames = Object.keys(v).filter(function (k) { return k !== 'dataelement'; });
      ruleNames.forEach(function (ruleName) {
        var r = v[ruleName];
        var eventNames = Array.isArray(r.events) && r.events.length ? r.events.join(', ') : '—';
        var row = document.createElement('tr');
        row.innerHTML =
          '<td>' + (ruleName || '—') + '</td>' +
          '<td>' + eventNames + '</td>' +
          '<td>—</td>' +
          '<td>' + (r.conditions ? 'Yes' : '—') + '</td>';
        tbody.appendChild(row);
      });

      var deList = v.dataelement && Array.isArray(v.dataelement) ? v.dataelement : [];
      deList.forEach(function (item) {
        var row = document.createElement('tr');
        row.innerHTML = '<td>—</td><td>—</td><td>' + (item.name || item.path || '—') + '</td><td>—</td>';
        tbody.appendChild(row);
      });

      if (tbody.querySelectorAll('tr').length === 0) {
        var empty = document.createElement('tr');
        empty.innerHTML = '<td colspan="4">Not used in any rule or data element.</td>';
        tbody.appendChild(empty);
      }

      scrollWrap.appendChild(tbl);
      wrap.appendChild(scrollWrap);
      return wrap;
    }

    var tbody = document.createElement('tbody');
    var keys = Object.keys(extObj).sort();
    builtExtensionCount = keys.length;
    keys.forEach(function (key, index) {
      var ext = extObj[key];
      var displayName = (ext && ext.displayName) ? ext.displayName : key;
      var sizeKb = getSizeKb(ext);
      var v = value_obj[key] || {};

      var actions = 0, events = 0, conditions = 0;
      Object.keys(v).forEach(function (k) {
        if (k === 'dataelement') return;
        var r = v[k];
        if (r && typeof r === 'object') {
          if (r.rule) actions++;
          if (Array.isArray(r.events)) events += r.events.length;
          else if (r.events) events++;
          if (r.conditions) conditions++;
        }
      });
      var deCount = (v.dataelement && Array.isArray(v.dataelement)) ? v.dataelement.length : 0;

      var tr = document.createElement('tr');
      tr.classList.add('data-displayed');
      tr._rowIndex = index;
      tr._extKey = key;
      tr._detailData = v;
      tr.setAttribute('data-ext-key', key);
      tr.setAttribute('data-display-name', (displayName || '').toLowerCase());

      var tdId = document.createElement('td');
      tdId.className = 'ext-col-id';
      tdId.style.textAlign = 'center';
      tdId.style.fontWeight = '600';
      tdId.textContent = String(index + 1);
      tr.appendChild(tdId);

      var tdName = document.createElement('td');
      tdName.className = 'ext-name-cell';
      tdName.style.cursor = 'pointer';
      var expandIcon = document.createElement('span');
      expandIcon.className = 'ext-expand-icon';
      expandIcon.textContent = '\u25B6';
      expandIcon.style.cursor = 'pointer';
      expandIcon.style.marginRight = '8px';
      expandIcon.setAttribute('aria-label', 'Expand details');
      expandIcon.onclick = function (e) {
        e.stopPropagation();
        toggleExpand(expandIcon, index);
      };
      tdName.appendChild(expandIcon);
      tdName.appendChild(document.createTextNode(displayName || key));
      if (isComponentDisabled(ext)) {
        var disabledBadge = document.createElement('span');
        disabledBadge.className = 'component-disabled-badge';
        disabledBadge.textContent = 'Disabled';
        tdName.appendChild(disabledBadge);
        tr.classList.add('component-disabled');
      }
      tdName.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleExpand(expandIcon, index);
      };
      tr.appendChild(tdName);

      tr.appendChild(makeIconCell(actions, 'fa-cogs', 'Used in rule actions'));
      tr.appendChild(makeIconCell(events, 'fa-bolt', 'Used in rule events'));
      tr.appendChild(makeIconCell(conditions, 'fa-filter', 'Used in rule conditions'));
      tr.appendChild(makeIconCell(deCount, 'fa-database', 'Used in data elements'));

      var tdSize = document.createElement('td');
      tdSize.className = 'ext-size-cell';
      tdSize.textContent = sizeKb.toFixed(2);
      tdSize.setAttribute('data-sort-value', String(sizeKb));
      tr.appendChild(tdSize);

      tbody.appendChild(tr);

      var expandTd = document.createElement('td');
      expandTd.colSpan = 7;
      expandTd.appendChild(buildExpandableContent(key, v));
      var expandTr = document.createElement('tr');
      expandTr.className = 'expandable-row';
      expandTr.appendChild(expandTd);
      tbody.appendChild(expandTr);
    });
    table.appendChild(tbody);
  }

  function toggleExpand(icon, rowIndex) {
    var currentRow = icon.closest('tr');
    if (!currentRow || currentRow.classList.contains('expandable-row')) return;
    var expandableRow = currentRow.nextElementSibling;
    if (!expandableRow || !expandableRow.classList.contains('expandable-row')) return;
    expandableRow.classList.toggle('active');
    icon.classList.toggle('expanded', expandableRow.classList.contains('active'));
  }

  function updatePageInfo() {
    var tbody = document.getElementById('extension_details') && document.getElementById('extension_details').querySelector('tbody');
    if (!tbody) return;
    var allRows = Array.from(tbody.querySelectorAll('tr'));
    var dataRows = allRows.filter(function (r) { return !r.classList.contains('expandable-row'); });
    var visibleRows = dataRows.filter(function (r) { return !r.classList.contains('search-hidden'); });
    var totalPages = Math.ceil(visibleRows.length / ROWS_PER_PAGE) || 1;
    var start = (currentPage - 1) * ROWS_PER_PAGE;
    var end = Math.min(start + ROWS_PER_PAGE, visibleRows.length);

    document.getElementById('currentPage').textContent = currentPage;
    document.getElementById('totalPages').textContent = totalPages;
    document.getElementById('prevPage').disabled = currentPage <= 1;
    document.getElementById('nextPage').disabled = totalPages === 0 || currentPage >= totalPages;

    var countEl = document.getElementById('extCountInfo');
    if (countEl) {
      if (visibleRows.length === 0) countEl.textContent = 'No extensions match.';
      else countEl.textContent = 'Showing ' + (start + 1) + '\u2013' + end + ' of ' + builtExtensionCount + ' extension' + (builtExtensionCount !== 1 ? 's' : '');
    }
  }

  function showPage(page) {
    var tbody = document.getElementById('extension_details') && document.getElementById('extension_details').querySelector('tbody');
    if (!tbody) return;
    var allRows = Array.from(tbody.querySelectorAll('tr'));
    allRows.forEach(function (row) { row.style.display = 'none'; });
    var dataRows = allRows.filter(function (row) { return !row.classList.contains('expandable-row'); });
    var visibleRows = dataRows.filter(function (row) { return !row.classList.contains('search-hidden'); });
    var totalPages = Math.ceil(visibleRows.length / ROWS_PER_PAGE) || 1;
    currentPage = Math.max(1, Math.min(page, totalPages));
    var start = (currentPage - 1) * ROWS_PER_PAGE;
    var end = start + ROWS_PER_PAGE;
    visibleRows.slice(start, end).forEach(function (row) {
      row.style.display = '';
      var next = row.nextElementSibling;
      if (next && next.classList.contains('expandable-row')) next.style.display = '';
    });
    updatePageInfo();
  }

  function sortTable(columnIndex) {
    var table = document.getElementById('extension_details');
    if (!table) return;
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var allRows = Array.from(tbody.querySelectorAll('tr'));
    var rows = allRows.filter(function (r) { return !r.classList.contains('expandable-row'); });
    var isAsc = table.getAttribute('data-sort-ext-' + columnIndex) !== 'asc';
    table.setAttribute('data-sort-ext-' + columnIndex, isAsc ? 'asc' : 'desc');

    rows.sort(function (a, b) {
      var cellA = a.cells[columnIndex];
      var cellB = b.cells[columnIndex];
      var valA = cellA && cellA.getAttribute('data-sort-value');
      var valB = cellB && cellB.getAttribute('data-sort-value');
      if (valA != null && valB != null) {
        var numA = parseFloat(valA);
        var numB = parseFloat(valB);
        if (!isNaN(numA) && !isNaN(numB)) return isAsc ? numA - numB : numB - numA;
      }
      var textA = (cellA && cellA.textContent) || '';
      var textB = (cellB && cellB.textContent) || '';
      return isAsc ? (textA || '').localeCompare(textB || '') : (textB || '').localeCompare(textA || '');
    });
    rows.forEach(function (row) {
      tbody.appendChild(row);
      var next = row.nextElementSibling;
      if (next && next.classList.contains('expandable-row')) tbody.appendChild(next);
    });
    currentPage = 1;
    showPage(1);
  }

  function exportCSV() {
    var extObj = getExtensionObject();
    if (!extObj || Object.keys(extObj).length === 0) {
      alert('No extensions to export. Load a property first.');
      return;
    }
    buildUsageMap();
    function toCsvCell(val) {
      return '"' + String(val).replace(/"/g, '""') + '"';
    }
    var headers = ['ID #', 'Extension Name', 'Actions', 'Events', 'Conditions', 'Data Elements', 'Size (KB)'];
    var keys = Object.keys(extObj).sort();
    var csvLines = [headers.map(toCsvCell).join(',')];
    keys.forEach(function (key, index) {
      var ext = extObj[key];
      var displayName = (ext && ext.displayName) ? ext.displayName : key;
      var sizeKb = getSizeKb(ext);
      var v = value_obj[key] || {};
      var actions = 0, events = 0, conditions = 0;
      Object.keys(v).forEach(function (k) {
        if (k === 'dataelement') return;
        var r = v[k];
        if (r && typeof r === 'object') {
          if (r.rule) actions++;
          if (Array.isArray(r.events)) events += r.events.length;
          else if (r.events) events++;
          if (r.conditions) conditions++;
        }
      });
      var deCount = (v.dataelement && Array.isArray(v.dataelement)) ? v.dataelement.length : 0;
      csvLines.push([index + 1, displayName, actions, events, conditions, deCount, sizeKb.toFixed(2)].map(toCsvCell).join(','));
    });
    var csvContent = '\uFEFF' + csvLines.join('\r\n');
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.download = 'extensions_export.csv';
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function init() {
    var extMain = document.getElementById('ext-main');
    var noData = document.getElementById('no-data-alert');
    var loader = document.getElementById('set_display');

    var extObj = getExtensionObject();
    if (!extObj || Object.keys(extObj).length === 0) {
      loader.style.display = 'none';
      if (noData) noData.style.display = 'block';
      return;
    }

    buildUsageMap();
    buildTable(extObj);
    loader.style.display = 'none';
    if (extMain) extMain.style.display = 'block';

    var payloadEl = document.getElementById('ext-payload-source');
    var keysEl = document.getElementById('ext-keys-list');
    var keyListEl = document.getElementById('ext-storage-key');
    if (payloadEl) payloadEl.style.display = 'block';
    if (keyListEl) keyListEl.textContent = "sessionStorage['_satellite._container.extension']";
    if (keysEl) {
      var keys = Object.keys(extObj).sort();
      keysEl.textContent = keys.length ? keys.join(', ') : '(none)';
    }

    showPage(1);

    var searchInput = document.getElementById('extensionSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        var term = (searchInput.value || '').trim().toLowerCase();
        var tbody = document.getElementById('extension_details') && document.getElementById('extension_details').querySelector('tbody');
        if (tbody) {
          tbody.querySelectorAll('tr').forEach(function (tr) {
            var name = tr.getAttribute('data-display-name') || '';
            if (!term || name.indexOf(term) !== -1) tr.classList.remove('search-hidden');
            else tr.classList.add('search-hidden');
          });
          currentPage = 1;
          showPage(1);
        }
      });
    }

    var prevBtn = document.getElementById('prevPage');
    var nextBtn = document.getElementById('nextPage');
    if (prevBtn) prevBtn.addEventListener('click', function () { if (currentPage > 1) showPage(currentPage - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { showPage(currentPage + 1); });

    var downloadArea = document.querySelector('.ext-page-header .download-button');
    if (downloadArea) {
      downloadArea.innerHTML = '';
      var exportBtn = document.createElement('button');
      exportBtn.className = 'btn btn-success btn-sm';
      exportBtn.innerHTML = '<i class="fas fa-file-csv"></i> Export CSV';
      exportBtn.onclick = exportCSV;
      downloadArea.appendChild(exportBtn);
    }

    var table = document.getElementById('extension_details');
    if (table) {
      table.querySelectorAll('thead th.sortable').forEach(function (th, i) {
        var col = parseInt(th.getAttribute('data-col'), 10);
        if (isNaN(col)) col = i;
        th.addEventListener('click', function () { sortTable(col); });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
