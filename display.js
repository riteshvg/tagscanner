// display.js – landing page (loader hidden on load; no snapshot)
document.addEventListener('DOMContentLoaded', function () {
  var set_display = document.getElementById('set_display');
  if (set_display) set_display.style.display = 'none';

  var exportBtn = document.getElementById('export-all-csv-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportFullCSV);
});

function exportFullCSV() {
  function cell(v) {
    return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  }
  function row(arr) { return arr.map(cell).join(','); }

  function safeJson(key) {
    try { return JSON.parse(sessionStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; }
  }

  var rules = safeJson('_satellite._container.rules');
  var dataElements = safeJson('_satellite._container.dataElements');
  var extensions = safeJson('_satellite._container.extension');

  var lines = ['﻿'];

  // ── Rules ──────────────────────────────────────────────────────────────────
  lines.push(row(['=== RULES ===']));
  lines.push(row(['Rule Name', 'Enabled', 'Events', 'Conditions', 'Actions', 'Has Custom Code', 'Size (KB)']));
  var ruleList = Array.isArray(rules) ? rules : Object.values(rules);
  ruleList.forEach(function (rule) {
    var events = (rule.events || []).map(function (e) {
      return (e.modulePath || '').split('/').pop() || '';
    }).filter(Boolean).join('; ');
    var conditions = (rule.conditions || []).length;
    var actions = (rule.actions || []).length;
    var hasCode = (rule.actions || []).some(function (a) {
      return a.settings && (a.settings.source || a.settings.code);
    }) || (rule.conditions || []).some(function (c) {
      return c.settings && (c.settings.source || c.settings.code);
    });
    var sizeKb = (typeof rule.size === 'number') ? (rule.size / 1024).toFixed(2) : '';
    lines.push(row([rule.name || '', rule.enabled !== false ? 'true' : 'false',
      events, conditions, actions, hasCode ? 'true' : 'false', sizeKb]));
  });

  lines.push('');

  // ── Data Elements ──────────────────────────────────────────────────────────
  lines.push(row(['=== DATA ELEMENTS ===']));
  lines.push(row(['Data Element Name', 'Type', 'Extension', 'Storage Duration', 'Default Value', 'Clean Text', 'Force Lowercase', 'Size (KB)']));
  Object.keys(dataElements).forEach(function (name) {
    var de = dataElements[name] || {};
    var type = (de.modulePath || '').split('/').pop() || '';
    var ext = (de.modulePath || '').split('/')[0] || '';
    var settings = de.settings || {};
    var sizeKb = (typeof de.size === 'number') ? (de.size / 1024).toFixed(2) : '';
    lines.push(row([name, type, ext,
      de.storageDuration || '', settings.defaultValue || '',
      de.cleanText ? 'true' : 'false', de.forceLowerCase ? 'true' : 'false',
      sizeKb]));
  });

  lines.push('');

  // ── Extensions ─────────────────────────────────────────────────────────────
  lines.push(row(['=== EXTENSIONS ===']));
  lines.push(row(['Extension Key', 'Display Name', 'Has Settings', 'Settings Summary', 'Size (KB)']));
  Object.keys(extensions).sort().forEach(function (key) {
    var ext = extensions[key] || {};
    var displayName = ext.displayName || key;
    var hasSettings = (ext.settings && Object.keys(ext.settings).length > 0) ? 'true' : 'false';
    var settingsSummary = '';
    try {
      if (ext.settings) {
        var sj = JSON.stringify(ext.settings);
        settingsSummary = sj.length > 1000 ? sj.slice(0, 1000) + '…[truncated]' : sj;
      }
    } catch (e) {}
    var sizeKb = (typeof ext.size === 'number') ? (ext.size / 1024).toFixed(2) : '';
    lines.push(row([key, displayName, hasSettings, settingsSummary, sizeKb]));
  });

  var csvContent = lines.join('\r\n');
  var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  var a = document.createElement('a');
  a.download = 'tagscanner_full_export.csv';
  a.href = URL.createObjectURL(blob);
  a.click();
  URL.revokeObjectURL(a.href);
}
