(function () {
  'use strict';

  var data = { rules: [], dataElements: {}, extensions: {} };
  var debounceTimer = null;
  var activeType = 'all';

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function hlText(escapedText, term) {
    var re = new RegExp('(' + escapeRegExp(esc(term)) + ')', 'gi');
    return escapedText.replace(re, '<span class="hl">$1</span>');
  }

  // "adobe-analytics/src/lib/events/pageBottom.js" → "Page Bottom"
  function moduleName(modulePath) {
    if (!modulePath) return '';
    var parts = modulePath.split('/');
    return parts[parts.length - 1]
      .replace(/\.js$/, '')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, function (c) { return c.toUpperCase(); })
      .trim();
  }

  // "adobe-analytics/src/lib/events/pageBottom.js" → "Adobe Analytics"
  function extensionFromPath(modulePath) {
    if (!modulePath) return '';
    var id = modulePath.split('/')[0];
    return id.split('-').map(function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  function chip(cssClass, icon, text) {
    return '<span class="cs-chip ' + cssClass + '"><i class="fas ' + icon + '"></i>' + esc(text) + '</span>';
  }

  // ── Composition renderers ─────────────────────────────────────────────────────

  function ruleComposition(rule) {
    var chips = [];

    // Events
    var events = rule.events || [];
    if (events.length) {
      events.slice(0, 3).forEach(function (ev) {
        var name = moduleName(ev.modulePath) || 'Event';
        // Special case: Direct Call shows the identifier
        if (ev.settings && ev.settings.identifier) name = 'Direct Call: ' + ev.settings.identifier;
        chips.push(chip('chip-event', 'fa-bolt', name));
      });
      if (events.length > 3) chips.push(chip('chip-count', 'fa-bolt', '+' + (events.length - 3) + ' events'));
    }

    // Conditions / Actions counts
    var conds   = (rule.conditions || []).length;
    var actions = (rule.actions   || []).length;
    if (conds)   chips.push(chip('chip-count', 'fa-filter',    conds   + ' condition' + (conds   === 1 ? '' : 's')));
    if (actions) chips.push(chip('chip-count', 'fa-play-circle', actions + ' action'    + (actions === 1 ? '' : 's')));

    // Unique extensions used across all components
    var extSet = {};
    [].concat(rule.events || [], rule.conditions || [], rule.actions || []).forEach(function (c) {
      var e = extensionFromPath(c.modulePath);
      if (e) extSet[e] = true;
    });
    Object.keys(extSet).slice(0, 3).forEach(function (e) {
      chips.push(chip('chip-ext', 'fa-plug', e));
    });

    return chips.length
      ? '<div class="cs-composition">' + chips.join('') + '</div>'
      : '';
  }

  function deComposition(name, config) {
    var chips = [];
    var s     = config.settings || {};

    // Type from modulePath
    var typeName = moduleName(config.modulePath);
    if (typeName) chips.push(chip('chip-type', 'fa-tag', typeName));

    // Extension
    var extName = extensionFromPath(config.modulePath);
    if (extName) chips.push(chip('chip-ext', 'fa-plug', extName));

    // Storage duration
    var dur = s.storeDuration || s.storageDuration || s.storage_duration || '';
    if (dur) chips.push(chip('chip-info', 'fa-clock', dur));

    // The most useful "value" field depending on DE type
    var valuePriority = [
      s.path, s.name, s.attribute, s.elementSelector,
      s.queryParam, s.value, s.identifier
    ];
    for (var i = 0; i < valuePriority.length; i++) {
      var v = valuePriority[i];
      if (v && typeof v === 'string' && v.trim() && !v.includes('\n')) {
        var display = v.length > 40 ? v.slice(0, 40) + '…' : v;
        chips.push(chip('chip-info', 'fa-arrow-right', display));
        break;
      }
    }

    // Default value
    if (s.defaultValue !== undefined && s.defaultValue !== '') {
      chips.push(chip('chip-info', 'fa-circle-dot', 'default: ' + String(s.defaultValue).slice(0, 20)));
    }

    return chips.length
      ? '<div class="cs-composition">' + chips.join('') + '</div>'
      : '';
  }

  function extComposition(id, config) {
    var chips = [];

    // Version
    if (config.version) chips.push(chip('chip-version', 'fa-code-branch', 'v' + config.version));

    // Up to 4 non-empty, non-source settings
    var s = config.settings || {};
    var shown = 0;
    Object.keys(s).forEach(function (key) {
      if (shown >= 4) return;
      var val = s[key];
      if (!val || key === 'source' || typeof val === 'object') return;
      var display = String(val);
      if (!display.trim()) return;
      if (display.length > 36) display = display.slice(0, 36) + '…';
      chips.push(chip('chip-info', 'fa-gear', key + ': ' + display));
      shown++;
    });

    return chips.length
      ? '<div class="cs-composition">' + chips.join('') + '</div>'
      : '';
  }

  // ── Code context ─────────────────────────────────────────────────────────────

  function getCodeContext(source, term) {
    var lines     = source.split('\n');
    var termLower = term.toLowerCase();
    var CONTEXT   = 2;
    var hitSet    = {};
    lines.forEach(function (line, i) {
      if (line.toLowerCase().includes(termLower)) hitSet[i] = true;
    });
    if (!Object.keys(hitSet).length) return [];
    var visible = {};
    Object.keys(hitSet).forEach(function (idx) {
      idx = parseInt(idx, 10);
      for (var j = Math.max(0, idx - CONTEXT); j <= Math.min(lines.length - 1, idx + CONTEXT); j++) visible[j] = true;
    });
    var result = [];
    var sorted = Object.keys(visible).map(Number).sort(function (a, b) { return a - b; });
    var prev = null;
    sorted.forEach(function (i) {
      if (prev !== null && i > prev + 1) result.push(null);
      result.push({ lineNum: i + 1, text: lines[i], isHit: !!hitSet[i] });
      prev = i;
    });
    return result;
  }

  function renderCodeBlock(contextLines, term) {
    if (!contextLines.length) return '';
    var re   = new RegExp('(' + escapeRegExp(term) + ')', 'gi');
    var rows = contextLines.map(function (row) {
      if (row === null) return '<tr><td class="ln">…</td><td class="lc"></td></tr>';
      var line = esc(row.text).replace(re, function (_, m) { return '<span class="hl">' + esc(m) + '</span>'; });
      return '<tr' + (row.isHit ? ' class="hit"' : '') + '><td class="ln">' + row.lineNum + '</td><td class="lc">' + line + '</td></tr>';
    }).join('');
    return '<div class="cs-code"><table>' + rows + '</table></div>';
  }

  // ── Match renderers ───────────────────────────────────────────────────────────

  function renderMatch(m, term) {
    var kindTag = '<span class="cs-match-kind-tag kind-' + m.kind + '">' + m.kindLabel + '</span>';
    var body;
    if (m.kind === 'code') {
      body = renderCodeBlock(getCodeContext(m.source, term), term);
    } else if (m.kind === 'name') {
      body = '<div class="cs-name-match">' + hlText(esc(m.text), term) + '</div>';
    } else {
      var snippet = m.text.length > 120 ? m.text.slice(0, 120) + '…' : m.text;
      body = '<div class="cs-meta-match">' + hlText(esc(snippet), term) + '</div>';
    }
    return '<div class="cs-match"><div class="cs-match-label">' + kindTag + esc(m.label) + '</div>' + body + '</div>';
  }

  // ── Search ───────────────────────────────────────────────────────────────────

  function search(term) {
    var results   = [];
    var termLower = term.toLowerCase();

    if (activeType === 'all' || activeType === 'rule') {
      data.rules.forEach(function (rule) {
        var matches = [];

        if (rule.name && rule.name.toLowerCase().includes(termLower))
          matches.push({ kind: 'name', kindLabel: 'Name', label: 'Rule Name', text: rule.name });

        (rule.events || []).forEach(function (ev, i) {
          var name = moduleName(ev.modulePath) || 'Event';
          if (ev.settings && ev.settings.identifier) name = 'Direct Call: ' + ev.settings.identifier;
          if (name.toLowerCase().includes(termLower))
            matches.push({ kind: 'event', kindLabel: 'Event', label: 'Event ' + (i + 1), text: name });
        });

        (rule.conditions || []).forEach(function (cond, i) {
          var typeName = moduleName(cond.modulePath);
          if (typeName && typeName.toLowerCase().includes(termLower))
            matches.push({ kind: 'event', kindLabel: 'Type', label: 'Condition ' + (i + 1), text: typeName });
          var src = cond.settings && (cond.settings.source || (cond.settings.customSetup && cond.settings.customSetup.source));
          if (src && src.toLowerCase().includes(termLower))
            matches.push({ kind: 'code', kindLabel: 'Code', label: 'Condition ' + (i + 1) + ' — Custom Code', source: src });
        });

        (rule.actions || []).forEach(function (action, i) {
          var typeName = moduleName(action.modulePath);
          if (typeName && typeName.toLowerCase().includes(termLower))
            matches.push({ kind: 'event', kindLabel: 'Type', label: 'Action ' + (i + 1), text: typeName });
          var src = action.settings && (action.settings.source || (action.settings.customSetup && action.settings.customSetup.source));
          if (src && src.toLowerCase().includes(termLower))
            matches.push({ kind: 'code', kindLabel: 'Code', label: 'Action ' + (i + 1) + ' — Custom Code', source: src });
        });

        if (matches.length)
          results.push({ type: 'rule', name: rule.name || rule.id, matches: matches, raw: rule });
      });
    }

    if (activeType === 'all' || activeType === 'de') {
      Object.keys(data.dataElements).forEach(function (name) {
        var config  = data.dataElements[name];
        var matches = [];

        if (name.toLowerCase().includes(termLower))
          matches.push({ kind: 'name', kindLabel: 'Name', label: 'Data Element Name', text: name });

        var typeName = moduleName(config.modulePath);
        if (typeName && typeName.toLowerCase().includes(termLower))
          matches.push({ kind: 'event', kindLabel: 'Type', label: 'Type', text: typeName });

        var src = config.settings && config.settings.source;
        if (src && src.toLowerCase().includes(termLower))
          matches.push({ kind: 'code', kindLabel: 'Code', label: 'Custom Code', source: src });

        if (matches.length)
          results.push({ type: 'de', name: name, matches: matches, rawName: name, rawConfig: config });
      });
    }

    if (activeType === 'all' || activeType === 'ext') {
      Object.keys(data.extensions).forEach(function (id) {
        var config      = data.extensions[id];
        var displayName = config.displayName || id;
        var matches     = [];

        if (displayName.toLowerCase().includes(termLower) || id.toLowerCase().includes(termLower))
          matches.push({ kind: 'name', kindLabel: 'Name', label: 'Extension Name', text: displayName });

        var s = config.settings || {};
        Object.keys(s).forEach(function (key) {
          var val = String(s[key] == null ? '' : s[key]);
          if (val && val.toLowerCase().includes(termLower))
            matches.push({ kind: 'settings', kindLabel: 'Setting', label: key, text: val });
        });

        if (matches.length)
          results.push({ type: 'ext', name: displayName, matches: matches, rawId: id, rawConfig: config });
      });
    }

    return results;
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  var TYPE_ICON  = { rule: 'fa-wrench', de: 'fa-database', ext: 'fa-plug' };
  var TYPE_BADGE = { rule: 'badge-rule', de: 'badge-de',   ext: 'badge-ext' };
  var TYPE_LABEL = { rule: 'Rule',       de: 'Data Element', ext: 'Extension' };
  var MAX_BLOCKS = 4;

  function render(results, term) {
    var countEl   = document.getElementById('csCount');
    var resultsEl = document.getElementById('csResults');

    countEl.textContent = results.length
      ? results.length + ' result' + (results.length === 1 ? '' : 's') : '';

    if (!results.length) {
      resultsEl.innerHTML =
        '<div class="cs-state"><i class="fas fa-search"></i>' +
        '<p>No results for <strong>' + esc(term) + '</strong>.</p></div>';
      return;
    }

    resultsEl.innerHTML = results.map(function (r) {
      var icon  = TYPE_ICON[r.type]  || 'fa-question-circle';
      var badge = TYPE_BADGE[r.type] || '';
      var label = TYPE_LABEL[r.type] || r.type;

      var header =
        '<div class="cs-card-header">' +
          '<i class="fas ' + icon + ' cs-card-icon"></i>' +
          '<span class="cs-card-name">' + hlText(esc(r.name), term) + '</span>' +
          '<span class="cs-type-badge ' + badge + '">' + label + '</span>' +
        '</div>';

      // Composition strip
      var composition = '';
      if (r.type === 'rule') composition = ruleComposition(r.raw);
      if (r.type === 'de')   composition = deComposition(r.rawName, r.rawConfig);
      if (r.type === 'ext')  composition = extComposition(r.rawId, r.rawConfig);

      var shown  = r.matches.slice(0, MAX_BLOCKS);
      var blocks = shown.map(function (m) { return renderMatch(m, term); }).join('');
      var extra  = r.matches.length > MAX_BLOCKS
        ? '<div class="cs-more-matches">+ ' + (r.matches.length - MAX_BLOCKS) + ' more match' +
          (r.matches.length - MAX_BLOCKS === 1 ? '' : 'es') + '</div>' : '';

      return '<div class="cs-card">' + header + composition + blocks + extra + '</div>';
    }).join('');
  }

  // ── Filter pills ──────────────────────────────────────────────────────────────

  function setActivePill(value) {
    activeType = value;
    ['all', 'rule', 'de', 'ext'].forEach(function (v) {
      var el = document.getElementById('pill-' + v);
      if (el) el.classList.toggle('active', v === value);
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    loadData();

    var input     = document.getElementById('csInput');
    var resultsEl = document.getElementById('csResults');
    var countEl   = document.getElementById('csCount');
    var emptyState =
      '<div class="cs-state"><i class="fas fa-search"></i>' +
      '<p>Type to search across rules, data elements, and extensions.</p></div>';

    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      var term = input.value.trim();
      if (!term) { countEl.textContent = ''; resultsEl.innerHTML = emptyState; return; }
      debounceTimer = setTimeout(function () { render(search(term), term); }, 250);
    });

    document.querySelectorAll('input[name="csType"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        setActivePill(radio.value);
        var term = input.value.trim();
        if (term) render(search(term), term);
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
    });

    input.focus();
  });

  function loadData() {
    try {
      var rulesRaw = sessionStorage.getItem('_satellite._container.rules');
      var deRaw    = sessionStorage.getItem('_satellite._container.dataElements');
      var extRaw   = sessionStorage.getItem('_satellite._container.extension');
      data.rules        = rulesRaw ? JSON.parse(rulesRaw) : [];
      data.dataElements = deRaw    ? JSON.parse(deRaw)    : {};
      data.extensions   = extRaw   ? JSON.parse(extRaw)   : {};
    } catch (e) { data.rules = []; data.dataElements = {}; data.extensions = {}; }
  }
})();
