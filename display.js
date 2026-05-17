// display.js – landing page
document.addEventListener('DOMContentLoaded', function () {
  var loader = document.getElementById('set_display');
  if (loader) loader.style.display = 'none';

  var exportBtn = document.getElementById('export-all-csv-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportFullXlsx);
});

// ── Helpers ────────────────────────────────────────────────────────────────

function safeJson(key) {
  try { return JSON.parse(sessionStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; }
}

function extFromPath(modulePath) {
  return modulePath ? modulePath.split('/')[0] : '';
}

function typeFromPath(modulePath) {
  if (!modulePath) return '';
  var parts = modulePath.split('/');
  var fn = parts[parts.length - 1].replace(/\.js$/, '');
  if ((fn === 'index' || fn === '') && parts.length > 2) {
    fn = parts[parts.length - 2];
  }
  return fn.replace(/([A-Z])/g, ' $1').trim();
}

function delegateId(modulePath) {
  if (!modulePath) return '';
  var parts = modulePath.split('/');
  var ext = parts[0] || '';
  var libIdx = parts.indexOf('lib');
  if (libIdx === -1) return modulePath;
  var typeMap = { actions: 'actions', events: 'events', conditions: 'conditions', dataElements: 'data-elements' };
  var type = typeMap[parts[libIdx + 1]] || (parts[libIdx + 1] || '');
  var rest = parts.slice(libIdx + 2);
  var comp = rest.length > 0 ? rest[rest.length - 1].replace(/\.js$/, '') : '';
  if (comp === 'index' && rest.length > 1) comp = rest[rest.length - 2];
  var kebab = comp.replace(/([A-Z])/g, function (m) { return '-' + m.toLowerCase(); });
  if (kebab.charAt(0) === '-') kebab = kebab.slice(1);
  return ext + '::' + type + '::' + kebab;
}

function compName(comp, fallback) {
  if (!comp) return fallback;
  if (comp.name) return comp.name;
  return typeFromPath(comp.modulePath) || fallback;
}

function codeSnippet(comp) {
  var src = comp && comp.settings && (comp.settings.source || comp.settings.code);
  if (!src || typeof src !== 'string') return '';
  var s = src.trim();
  return s.length > 500 ? s.slice(0, 500) + '…[truncated]' : s;
}

function settingsStr(settings) {
  if (!settings || typeof settings !== 'object') return '';
  try {
    var copy = Object.assign({}, settings);
    if (typeof copy.source === 'string') delete copy.source;
    if (typeof copy.code === 'string') delete copy.code;
    var j = JSON.stringify(copy);
    return j === '{}' ? '' : (j.length > 1000 ? j.slice(0, 1000) + '…' : j);
  } catch (e) { return ''; }
}

function sizeKb(obj) {
  if (obj && typeof obj.size === 'number') return parseFloat((obj.size / 1024).toFixed(2));
  return '';
}

// ── Sheet builders ─────────────────────────────────────────────────────────

function buildRulesSheet(rulesRaw) {
  var ruleList = [];
  if (Array.isArray(rulesRaw)) ruleList = rulesRaw;
  else if (rulesRaw && typeof rulesRaw === 'object') {
    ruleList = (rulesRaw.rules && Array.isArray(rulesRaw.rules))
      ? rulesRaw.rules
      : Object.values(rulesRaw).filter(function (r) { return r && typeof r === 'object'; });
  }

  var rows = [['Rule Name', 'Enabled', 'Component Type', 'Component Name',
               'Delegate Descriptor', 'Extension', 'Order in Rule',
               'Has Custom Code', 'Code Snippet', 'Other Settings']];

  ruleList.forEach(function (rule) {
    var name = rule.name || rule.id || 'Unknown';
    var enabled = rule.enabled !== false ? 'Yes' : 'No';

    function addComps(arr, typeName) {
      if (!arr || !arr.length) return;
      arr.forEach(function (comp, i) {
        var hasCode = !!(comp.settings && (comp.settings.source || comp.settings.code));
        rows.push([
          name, enabled, typeName,
          compName(comp, typeName),
          delegateId(comp.modulePath),
          extFromPath(comp.modulePath),
          i + 1,
          hasCode ? 'Yes' : 'No',
          codeSnippet(comp),
          settingsStr(comp.settings)
        ]);
      });
    }

    addComps(rule.events, 'Event');
    addComps(rule.conditions, 'Condition');
    addComps(rule.actions, 'Action');

    // Rule with no components still gets one summary row
    if ((!rule.events || !rule.events.length) &&
        (!rule.conditions || !rule.conditions.length) &&
        (!rule.actions || !rule.actions.length)) {
      rows.push([name, enabled, '(no components)', '', '', '', '', '', '', '']);
    }
  });

  return rows;
}

function buildDataElementsSheet(de) {
  var rows = [['#', 'Name', 'Type', 'Extension', 'Storage Duration',
               'Default Value', 'Clean Text', 'Force Lowercase',
               'Has Custom Code', 'Code Snippet', 'Settings', 'Size (KB)']];
  var i = 1;
  Object.keys(de).forEach(function (name) {
    var d = de[name] || {};
    var hasCode = !!(d.settings && (d.settings.source || d.settings.code));
    rows.push([
      i++, name,
      typeFromPath(d.modulePath),
      extFromPath(d.modulePath),
      d.storageDuration || '',
      (d.settings && d.settings.defaultValue) || '',
      d.cleanText ? 'Yes' : 'No',
      d.forceLowerCase ? 'Yes' : 'No',
      hasCode ? 'Yes' : 'No',
      codeSnippet(d),
      settingsStr(d.settings),
      sizeKb(d)
    ]);
  });
  return rows;
}

function buildExtensionsSheet(ext) {
  var rows = [['#', 'Extension Key', 'Display Name', 'Has Settings', 'Settings Summary', 'Size (KB)']];
  var i = 1;
  Object.keys(ext).sort().forEach(function (key) {
    var e = ext[key] || {};
    var hasSettings = !!(e.settings && Object.keys(e.settings).length > 0);
    var summary = '';
    try {
      if (e.settings) {
        var j = JSON.stringify(e.settings);
        summary = j.length > 1000 ? j.slice(0, 1000) + '…[truncated]' : j;
      }
    } catch (er) {}
    rows.push([i++, key, e.displayName || key, hasSettings ? 'Yes' : 'No', summary, sizeKb(e)]);
  });
  return rows;
}

// ── Column width auto-fit ──────────────────────────────────────────────────

function autoWidth(ws, data) {
  if (!data || !data.length) return;
  var cols = data[0].length;
  var widths = [];
  for (var c = 0; c < cols; c++) {
    var max = 10;
    data.forEach(function (row) {
      var v = row[c];
      var len = v == null ? 0 : String(v).length;
      if (len > max) max = len;
    });
    widths.push({ wch: Math.min(max + 2, 60) });
  }
  ws['!cols'] = widths;
}

// ── Main export ────────────────────────────────────────────────────────────

function exportFullXlsx() {
  if (typeof XLSX === 'undefined') {
    alert('Excel library not loaded. Please reload the page and try again.');
    return;
  }

  var rules = safeJson('_satellite._container.rules');
  var de    = safeJson('_satellite._container.dataElements');
  var ext   = safeJson('_satellite._container.extension');

  var hasData = (Array.isArray(rules) ? rules.length : Object.keys(rules).length) > 0
             || Object.keys(de).length > 0
             || Object.keys(ext).length > 0;

  if (!hasData) {
    alert('No property data found. Please load a property first.');
    return;
  }

  try {
    var rulesData = buildRulesSheet(rules);
    var deData    = buildDataElementsSheet(de);
    var extData   = buildExtensionsSheet(ext);

    var wb = XLSX.utils.book_new();

    var ws1 = XLSX.utils.aoa_to_sheet(rulesData);
    autoWidth(ws1, rulesData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Rules');

    var ws2 = XLSX.utils.aoa_to_sheet(deData);
    autoWidth(ws2, deData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Data Elements');

    var ws3 = XLSX.utils.aoa_to_sheet(extData);
    autoWidth(ws3, extData);
    XLSX.utils.book_append_sheet(wb, ws3, 'Extensions');

    var exportPropName = sessionStorage.getItem('launch_property_name') || '';
    var wsAbout = XLSX.utils.aoa_to_sheet([
      ['TagScanner', 'Adobe Tags (Launch) Inspector'],
      ['Version', '2.5.4'],
      ['', ''],
      ['Property', exportPropName],
      ['Generated', new Date().toLocaleString()],
      ['', ''],
      ['Disclaimer', 'Provided as-is. No affiliation or endorsement from Adobe.'],
      ['Feedback', 'tagscannerfeedback@gmail.com'],
    ]);
    wsAbout['!cols'] = [{ wch: 14 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsAbout, 'About');

    // Use XLSX.write + manual blob download — more reliable in extension iframes
    // than XLSX.writeFile which may use an internal path that doesn't fire from nested frames
    var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'tagscanner_export.xlsx';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (e) {
    console.error('TagScanner export error:', e);
    alert('Export failed: ' + e.message);
  }
}
