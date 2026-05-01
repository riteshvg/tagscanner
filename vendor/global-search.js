(function () {
  'use strict';

  var data = { rules: [], dataElements: {} };
  var debounceTimer = null;
  var activeType = 'all';

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ── Data loading ─────────────────────────────────────────────────────────────

  function loadData() {
    try {
      var rulesRaw = sessionStorage.getItem('_satellite._container.rules');
      var deRaw    = sessionStorage.getItem('_satellite._container.dataElements');
      data.rules        = rulesRaw ? JSON.parse(rulesRaw) : [];
      data.dataElements = deRaw    ? JSON.parse(deRaw)    : {};
    } catch (e) {
      data.rules = []; data.dataElements = {};
    }
  }

  // ── Code context extraction ───────────────────────────────────────────────────
  // Returns an array of {lineNum, text, isHit} objects for lines around each match.

  function getCodeContext(source, term) {
    var lines     = source.split('\n');
    var termLower = term.toLowerCase();
    var CONTEXT   = 2; // lines above/below each match

    // Collect all matching line indices
    var hitSet = {};
    lines.forEach(function (line, i) {
      if (line.toLowerCase().includes(termLower)) hitSet[i] = true;
    });

    if (!Object.keys(hitSet).length) return [];

    // Build visible line ranges (merge overlapping windows)
    var visible = {};
    Object.keys(hitSet).forEach(function (idx) {
      idx = parseInt(idx, 10);
      for (var j = Math.max(0, idx - CONTEXT); j <= Math.min(lines.length - 1, idx + CONTEXT); j++) {
        visible[j] = true;
      }
    });

    var result = [];
    var sorted = Object.keys(visible).map(Number).sort(function (a, b) { return a - b; });
    var prev = null;
    sorted.forEach(function (i) {
      if (prev !== null && i > prev + 1) result.push(null); // gap marker
      result.push({ lineNum: i + 1, text: lines[i], isHit: !!hitSet[i] });
      prev = i;
    });
    return result;
  }

  // Render a code context block as HTML (XSS-safe)
  function renderCodeBlock(contextLines, term) {
    if (!contextLines.length) return '';
    var re = new RegExp('(' + escapeRegExp(term) + ')', 'gi');
    var rows = contextLines.map(function (row) {
      if (row === null) {
        return '<tr><td class="ln">…</td><td class="lc"></td></tr>';
      }
      var escapedLine = esc(row.text).replace(re, function (_, m) {
        return '<span class="hl">' + esc(m) + '</span>';
      });
      return '<tr' + (row.isHit ? ' class="hit"' : '') + '>' +
        '<td class="ln">' + row.lineNum + '</td>' +
        '<td class="lc">' + escapedLine + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="cs-code"><table>' + rows + '</table></div>';
  }

  // ── Search ───────────────────────────────────────────────────────────────────

  function search(term) {
    var results = [];
    var termLower = term.toLowerCase();

    if (activeType === 'all' || activeType === 'rule') {
      data.rules.forEach(function (rule) {
        var matches = [];

        // Conditions
        (rule.conditions || []).forEach(function (cond, idx) {
          var src = cond.settings && (cond.settings.source || (cond.settings.customSetup && cond.settings.customSetup.source));
          if (src && src.toLowerCase().includes(termLower)) {
            matches.push({ label: 'Condition ' + (idx + 1), source: src });
          }
        });

        // Actions
        (rule.actions || []).forEach(function (action, idx) {
          var src = action.settings && (action.settings.source || (action.settings.customSetup && action.settings.customSetup.source));
          if (src && src.toLowerCase().includes(termLower)) {
            matches.push({ label: 'Action ' + (idx + 1), source: src });
          }
        });

        if (matches.length) {
          results.push({ type: 'rule', name: rule.name || rule.id, matches: matches });
        }
      });
    }

    if (activeType === 'all' || activeType === 'de') {
      Object.entries(data.dataElements).forEach(function (entry) {
        var name = entry[0], config = entry[1];
        var src = config.settings && config.settings.source;
        if (src && src.toLowerCase().includes(termLower)) {
          results.push({ type: 'de', name: name, matches: [{ label: 'Custom Code', source: src }] });
        }
      });
    }

    return results;
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  var TYPE_ICON  = { rule: 'fa-wrench',   de: 'fa-database',   ext: 'fa-plug' };
  var TYPE_BADGE = { rule: 'badge-rule',  de: 'badge-de',      ext: 'badge-ext' };
  var TYPE_LABEL = { rule: 'Rule',        de: 'Data Element',  ext: 'Extension' };
  var MAX_MATCH_BLOCKS = 3; // max code blocks shown per card

  function render(results, term) {
    var countEl  = document.getElementById('csCount');
    var resultsEl = document.getElementById('csResults');

    countEl.textContent = results.length
      ? results.length + ' result' + (results.length === 1 ? '' : 's')
      : '';

    if (!results.length) {
      resultsEl.innerHTML =
        '<div class="cs-state"><i class="fas fa-search"></i>' +
        '<p>No custom code contains <strong>' + esc(term) + '</strong>.</p></div>';
      return;
    }

    resultsEl.innerHTML = results.map(function (r) {
      var icon  = TYPE_ICON[r.type]  || 'fa-question-circle';
      var badge = TYPE_BADGE[r.type] || '';
      var label = TYPE_LABEL[r.type] || r.type;

      var header =
        '<div class="cs-card-header">' +
          '<i class="fas ' + icon + ' cs-card-icon"></i>' +
          '<span class="cs-card-name">' + esc(r.name) + '</span>' +
          '<span class="cs-type-badge ' + badge + '">' + label + '</span>' +
        '</div>';

      var shown = r.matches.slice(0, MAX_MATCH_BLOCKS);
      var blocks = shown.map(function (m) {
        var ctx = getCodeContext(m.source, term);
        return '<div class="cs-match">' +
          '<div class="cs-match-label">' + esc(m.label) + '</div>' +
          renderCodeBlock(ctx, term) +
          '</div>';
      }).join('');

      var extra = r.matches.length > MAX_MATCH_BLOCKS
        ? '<div class="cs-more-matches">+ ' + (r.matches.length - MAX_MATCH_BLOCKS) + ' more match' + (r.matches.length - MAX_MATCH_BLOCKS === 1 ? '' : 'es') + ' in this component</div>'
        : '';

      return '<div class="cs-card">' + header + blocks + extra + '</div>';
    }).join('');
  }

  // ── Filter pills ──────────────────────────────────────────────────────────────

  function setActivePill(value) {
    activeType = value;
    ['all', 'rule', 'de'].forEach(function (v) {
      var el = document.getElementById('pill-' + v);
      if (el) el.classList.toggle('active', v === value);
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    loadData();

    var input = document.getElementById('csInput');

    // Live search with debounce
    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      var term = input.value.trim();
      if (!term) {
        document.getElementById('csCount').textContent = '';
        document.getElementById('csResults').innerHTML =
          '<div class="cs-state"><i class="fas fa-code"></i>' +
          '<p>Type to search custom code across all rules and data elements.</p></div>';
        return;
      }
      debounceTimer = setTimeout(function () {
        render(search(term), term);
      }, 250);
    });

    // Filter pills
    document.querySelectorAll('input[name="csType"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        setActivePill(radio.value);
        var term = input.value.trim();
        if (term) render(search(term), term);
      });
    });

    // Press / to focus
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== input) {
        e.preventDefault();
        input.focus();
      }
    });

    input.focus();
  });
})();
