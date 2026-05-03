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

      var ruleNames = Object.keys(v).filter(function (k) { return k !== 'dataelement'; });
      var deList = v.dataelement && Array.isArray(v.dataelement) ? v.dataelement : [];

      if (ruleNames.length === 0 && deList.length === 0) {
        var empty = document.createElement('p');
        empty.style.cssText = 'margin:0;color:#6b7280;font-size:13px;';
        empty.textContent = 'Not used in any rule or data element.';
        wrap.appendChild(empty);
        return wrap;
      }

      // ── Rules section ──────────────────────────────────────────────────────
      if (ruleNames.length > 0) {
        var ruleLabel = document.createElement('div');
        ruleLabel.className = 'ext-expanded-section-label';
        ruleLabel.innerHTML = '<i class="fas fa-wrench"></i> Rules (' + ruleNames.length + ')';
        wrap.appendChild(ruleLabel);

        var scrollWrap = document.createElement('div');
        scrollWrap.className = 'ext-expanded-table-scroll';

        var tbl = document.createElement('table');
        tbl.className = 'ext-expanded-table';
        tbl.innerHTML = '<thead><tr><th>Rule Name</th><th>Events</th><th>Has Conditions</th></tr></thead><tbody></tbody>';
        var tbody = tbl.querySelector('tbody');

        ruleNames.forEach(function (ruleName) {
          var r = v[ruleName];
          var eventNames = Array.isArray(r.events) && r.events.length ? r.events.join(', ') : '—';
          var row = document.createElement('tr');
          row.innerHTML =
            '<td>' + (ruleName || '—') + '</td>' +
            '<td>' + eventNames + '</td>' +
            '<td>' + (r.conditions ? 'Yes' : '—') + '</td>';
          tbody.appendChild(row);
        });

        scrollWrap.appendChild(tbl);
        wrap.appendChild(scrollWrap);
      }

      // ── Data Elements section ───────────────────────────────────────────────
      if (deList.length > 0) {
        var deLabel = document.createElement('div');
        deLabel.className = 'ext-expanded-section-label';
        deLabel.innerHTML = '<i class="fas fa-database"></i> Data Elements (' + deList.length + ')';
        wrap.appendChild(deLabel);

        var deChips = document.createElement('div');
        deChips.className = 'ext-de-list';
        deList.forEach(function (item) {
          var chip = document.createElement('span');
          chip.className = 'ext-de-chip';
          chip.textContent = item.name || item.path || '—';
          deChips.appendChild(chip);
        });
        wrap.appendChild(deChips);
      }

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
      tr.setAttribute('data-search-text', ((displayName || '') + ' ' + key).toLowerCase());

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
      var nameSpan = document.createElement('span');
      nameSpan.textContent = displayName || key;
      nameSpan.title = 'Click to view full composition';
      nameSpan.style.cursor = 'pointer';
      nameSpan.addEventListener('click', (function (k, vv, extData) {
        return function (e) { e.stopPropagation(); showExtModal(k, vv, extData); };
      })(key, v, ext));
      tdName.appendChild(nameSpan);
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
      var total = dataRows.length;
      if (visibleRows.length === total) {
        countEl.textContent = '';
      } else if (visibleRows.length === 0) {
        countEl.textContent = 'No extensions match.';
      } else {
        countEl.textContent = 'Showing ' + (start + 1) + '–' + Math.min(end, visibleRows.length) + ' of ' + visibleRows.length + ' extension' + (visibleRows.length !== 1 ? 's' : '');
      }
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
      return '"' + String(val == null ? '' : val).replace(/"/g, '""') + '"';
    }
    var headers = ['#', 'Extension Key', 'Display Name', 'Has Custom Settings', 'Settings Summary', 'Rules Used In', 'Rule Count', 'Data Elements Used In', 'Data Element Count', 'Size (KB)'];
    var keys = Object.keys(extObj).sort();
    var csvLines = [headers.map(toCsvCell).join(',')];
    keys.forEach(function (key, index) {
      var ext = extObj[key] || {};
      var displayName = ext.displayName || key;
      var sizeKb = getSizeKb(ext);
      var hasSettings = (ext.settings && Object.keys(ext.settings).length > 0) ? 'true' : 'false';
      var settingsSummary = '';
      try {
        if (ext.settings && typeof ext.settings === 'object') {
          var sj = JSON.stringify(ext.settings);
          settingsSummary = sj.length > 1000 ? sj.slice(0, 1000) + '\u2026[truncated]' : sj;
        }
      } catch (e) {}
      var v = value_obj[key] || {};
      var ruleNames = [];
      Object.keys(v).forEach(function (k) {
        if (k === 'dataelement') return;
        ruleNames.push(k);
      });
      var deNames = (v.dataelement && Array.isArray(v.dataelement)) ? v.dataelement.map(function (d) { return d.name || ''; }).filter(Boolean) : [];
      csvLines.push([
        index + 1, key, displayName, hasSettings, settingsSummary,
        ruleNames.join('; '), ruleNames.length,
        deNames.join('; '), deNames.length,
        sizeKb.toFixed(2)
      ].map(toCsvCell).join(','));
    });
    var csvContent = '\uFEFF' + csvLines.join('\r\n');
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.download = 'extensions_export.csv';
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Extension detail modal ──────────────────────────────────────────────

  function initExtModal() {
    if (document.getElementById('extCompModal')) return;
    var overlay = document.createElement('div');
    overlay.id = 'extCompModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;overflow-y:auto;padding:24px 16px;box-sizing:border-box;';
    var box = document.createElement('div');
    box.style.cssText = 'background:#1e1e2e;border-radius:12px;max-width:740px;margin:0 auto;padding:28px 32px;position:relative;color:#cdd6f4;font-family:inherit;box-shadow:0 20px 60px rgba(0,0,0,.6);';
    var closeBtn = document.createElement('button');
    closeBtn.id = 'extCompModalClose';
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:absolute;top:16px;right:20px;background:none;border:none;color:#cdd6f4;font-size:20px;cursor:pointer;line-height:1;padding:0;';
    closeBtn.addEventListener('click', function () { overlay.style.display = 'none'; });
    var body = document.createElement('div');
    body.id = 'extCompModalBody';
    box.appendChild(closeBtn);
    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.style.display = 'none'; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') overlay.style.display = 'none'; });
  }

  function openExtModal(titleText, buildFn) {
    initExtModal();
    var overlay = document.getElementById('extCompModal');
    var body = document.getElementById('extCompModalBody');
    if (!overlay || !body) return;
    body.innerHTML = '';
    var title = document.createElement('h2');
    title.style.cssText = 'margin:0 0 20px;font-size:18px;color:#cba6f7;word-break:break-all;padding-right:32px;';
    title.textContent = titleText;
    body.appendChild(title);
    buildFn(body);
    overlay.style.display = 'block';
  }

  function extCdmSection(parent, label, iconClass) {
    var sec = document.createElement('div');
    sec.style.cssText = 'margin-bottom:20px;';
    var hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:13px;font-weight:700;color:#89b4fa;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;display:flex;align-items:center;gap:6px;';
    var icon = document.createElement('i');
    icon.className = 'fas ' + iconClass;
    hdr.appendChild(icon);
    hdr.appendChild(document.createTextNode(' ' + label));
    sec.appendChild(hdr);
    parent.appendChild(sec);
    return sec;
  }

  function extCdmRow(parent, label, value) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:12px;margin-bottom:6px;font-size:13px;';
    var lbl = document.createElement('span');
    lbl.style.cssText = 'color:#6c7086;min-width:150px;flex-shrink:0;';
    lbl.textContent = label;
    var val = document.createElement('span');
    val.style.cssText = 'color:#cdd6f4;word-break:break-all;';
    val.textContent = value;
    row.appendChild(lbl);
    row.appendChild(val);
    parent.appendChild(row);
  }

  function extCdmChips(parent, items) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    items.forEach(function (label) {
      var chip = document.createElement('span');
      chip.style.cssText = 'background:#313244;border:1px solid #45475a;border-radius:6px;padding:3px 10px;font-size:12px;color:#cdd6f4;white-space:nowrap;';
      chip.textContent = label;
      wrap.appendChild(chip);
    });
    parent.appendChild(wrap);
  }

  function extCdmEmpty(parent, msg) {
    var p = document.createElement('p');
    p.style.cssText = 'color:#6c7086;font-size:13px;margin:0;';
    p.textContent = msg;
    parent.appendChild(p);
  }

  function showExtModal(key, v, ext) {
    var displayName = (ext && ext.displayName) ? ext.displayName : key;
    openExtModal(displayName + ' — Extension Details', function (body) {

      // ── Extension Details ────────────────────────────────────────────────
      var detailSec = extCdmSection(body, 'Extension Details', 'fa-puzzle-piece');
      extCdmRow(detailSec, 'Extension Key', key);
      extCdmRow(detailSec, 'Display Name', displayName);
      extCdmRow(detailSec, 'Size', getSizeKb(ext).toFixed(2) + ' KB');
      var hasSettings = ext && ext.settings && Object.keys(ext.settings).length > 0;
      extCdmRow(detailSec, 'Has Custom Settings', hasSettings ? 'Yes' : 'No');

      // ── Settings ─────────────────────────────────────────────────────────
      if (hasSettings) {
        var settingsSec = extCdmSection(body, 'Settings', 'fa-sliders-h');
        var pre = document.createElement('pre');
        pre.style.cssText = 'background:#11111b;border-radius:6px;padding:12px;font-size:11px;overflow-x:auto;max-height:160px;color:#a6e3a1;margin:0;';
        try { pre.textContent = JSON.stringify(ext.settings, null, 2); } catch (e) { pre.textContent = String(ext.settings); }
        settingsSec.appendChild(pre);
      }

      // ── Rules ────────────────────────────────────────────────────────────
      var ruleNames = Object.keys(v).filter(function (k) { return k !== 'dataelement'; });
      var rulesSec = extCdmSection(body, 'Used in Rules (' + ruleNames.length + ')', 'fa-wrench');
      if (ruleNames.length === 0) {
        extCdmEmpty(rulesSec, 'Not used in any rule.');
      } else {
        var scrollWrap = document.createElement('div');
        scrollWrap.style.cssText = 'overflow-x:auto;border-radius:6px;border:1px solid #313244;';
        var tbl = document.createElement('table');
        tbl.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
        var thead = document.createElement('thead');
        var hRow = document.createElement('tr');
        ['Rule Name', 'Events', 'Has Actions', 'Has Conditions'].forEach(function (txt) {
          var th = document.createElement('th');
          th.style.cssText = 'text-align:left;padding:8px 12px;background:#181825;color:#89b4fa;font-weight:600;border-bottom:1px solid #313244;';
          th.textContent = txt;
          hRow.appendChild(th);
        });
        thead.appendChild(hRow);
        tbl.appendChild(thead);
        var tbody = document.createElement('tbody');
        ruleNames.forEach(function (ruleName, ri) {
          var r = v[ruleName];
          var eventNames = Array.isArray(r.events) && r.events.length ? r.events.join(', ') : '—';
          var tr = document.createElement('tr');
          tr.style.cssText = ri % 2 === 0 ? 'background:#1e1e2e;' : 'background:#181825;';
          [ruleName, eventNames, r.rule ? 'Yes' : '—', r.conditions ? 'Yes' : '—'].forEach(function (cellText) {
            var td = document.createElement('td');
            td.style.cssText = 'padding:7px 12px;color:#cdd6f4;border-bottom:1px solid #313244;word-break:break-word;';
            td.textContent = cellText;
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        scrollWrap.appendChild(tbl);
        rulesSec.appendChild(scrollWrap);
      }

      // ── Data Elements ─────────────────────────────────────────────────────
      var deList = v.dataelement && Array.isArray(v.dataelement) ? v.dataelement : [];
      var deSec = extCdmSection(body, 'Data Elements (' + deList.length + ')', 'fa-database');
      if (deList.length === 0) {
        extCdmEmpty(deSec, 'Not used in any data element.');
      } else {
        extCdmChips(deSec, deList.map(function (d) { return d.name || d.path || '—'; }));
      }
    });
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

    // Search — debounced, searches display name + extension key
    function _debounceExt(fn, ms) {
      var t; return function () { clearTimeout(t); var a = arguments, c = this; t = setTimeout(function () { fn.apply(c, a); }, ms); };
    }
    var searchInput = document.getElementById('extensionSearchInput');
    if (searchInput) {
      var _extTbody = document.getElementById('extension_details') && document.getElementById('extension_details').querySelector('tbody');
      searchInput.addEventListener('input', _debounceExt(function () {
        var term = (searchInput.value || '').trim().toLowerCase();
        if (_extTbody) {
          _extTbody.querySelectorAll('tr').forEach(function (tr) {
            var haystack = tr.getAttribute('data-search-text') || tr.getAttribute('data-display-name') || '';
            if (!term || haystack.indexOf(term) !== -1) tr.classList.remove('search-hidden');
            else tr.classList.add('search-hidden');
          });
          currentPage = 1;
          showPage(1);
        }
      }, 220));
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
