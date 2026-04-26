/**
 * TagScanner — data element references inside rules (static analysis only).
 *
 * Detects:
 * - %Data Element Name% tokens anywhere in the rule JSON
 * - _satellite.getVar("name") / getVar('name') with optional whitespace (inline custom code, conditions, etc.)
 * - _satellite["getVar"]("name") / _satellite['getVar']('name') bracket form
 * - Normalizes curly quotes (U+2018/U+2019 etc.) before matching
 * - _satellite.getVar(`name`) when the template has no interpolation
 * - dataElementChange events where settings.name is the data element name
 * - Any string value under event/condition/action settings that exactly matches a data element
 *   name (e.g. Launch UI fields that store the DE key without % or getVar) — excludes obvious
 *   code/URL keys (source, customCode, script, …)
 * - Dynamic qsp_: getVar('qsp_' + …) resolved via URL Parameter Storage–style data elements when possible;
 *   if lookup cannot be parsed, all qsp_* names are treated as referenced (safe for “unused” reporting)
 *
 * Default snapshot scan does not fetch hosted bundle URLs; use the optional deep scan on the Data Elements page to analyze those files.
 */
(function (global) {
  'use strict';

  function normalizeQuotesForJsScan(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/\u2018/g, "'")
      .replace(/\u2019/g, "'")
      .replace(/\u201c/g, '"')
      .replace(/\u201d/g, '"');
  }

  function collectLiteralRefsFromJsonString(jsonStr) {
    if (!jsonStr || typeof jsonStr !== 'string') return {};
    var s = normalizeQuotesForJsScan(jsonStr);
    var refs = Object.create(null);
    var m;
    var rePct = /\%([^%]+)\%/g;
    while ((m = rePct.exec(s)) !== null) {
      if (m[1] && m[1].length > 0 && m[1].length < 500) refs[m[1]] = true;
    }
    var reGv = /_satellite\.getVar\s*\(\s*["']([^"']+)["']\s*\)/gi;
    while ((m = reGv.exec(s)) !== null) {
      if (m[1] && m[1].length > 0 && m[1].length < 500) refs[m[1]] = true;
    }
    var reGvBracketDq = /_satellite\[\s*"getVar"\s*\]\s*\(\s*"([^"]+)"\s*\)/gi;
    while ((m = reGvBracketDq.exec(s)) !== null) {
      if (m[1] && m[1].length > 0 && m[1].length < 500) refs[m[1]] = true;
    }
    var reGvBracketSq = /_satellite\[\s*'getVar'\s*\]\s*\(\s*'([^']+)'\s*\)/gi;
    while ((m = reGvBracketSq.exec(s)) !== null) {
      if (m[1] && m[1].length > 0 && m[1].length < 500) refs[m[1]] = true;
    }
    var reTpl = /_satellite\.getVar\s*\(\s*`([^`\\$]*)`\s*\)/g;
    while ((m = reTpl.exec(s)) !== null) {
      if (m[1] && m[1].length > 0 && m[1].length < 500) refs[m[1]] = true;
    }
    return refs;
  }

  /**
   * Scan every string leaf under event/condition/action settings (including nested objects).
   * Picks up getVar / %DE% inside settings.customCode etc. Skips obvious HTTPS bundle URLs.
   */
  function mergeRefsFromSettingsStringLeaves(rule, set) {
    function scan(val, key, depth) {
      if (depth > 14 || val == null) return;
      if (typeof val === 'string') {
        var t = val.trim();
        if (
          (key === 'source' || key === 'html' || key === 'customCode') &&
          /^https:\/\//i.test(t)
        ) {
          return;
        }
        var lit = collectLiteralRefsFromJsonString(val);
        var lk;
        for (lk in lit) {
          if (Object.prototype.hasOwnProperty.call(lit, lk)) set[lk] = true;
        }
        return;
      }
      if (Array.isArray(val)) {
        for (var i = 0; i < val.length; i++) scan(val[i], '', depth + 1);
        return;
      }
      if (typeof val === 'object') {
        for (var k in val) {
          if (!Object.prototype.hasOwnProperty.call(val, k)) continue;
          scan(val[k], k, depth + 1);
        }
      }
    }
    ['events', 'conditions', 'actions'].forEach(function (part) {
      var arr = rule && rule[part];
      if (!Array.isArray(arr)) return;
      for (var ci = 0; ci < arr.length; ci++) {
        var st = arr[ci] && arr[ci].settings;
        if (st != null && typeof st === 'object') scan(st, '', 0);
      }
    });
  }

  function hasDynamicQspPattern(ruleStr) {
    return (
      /_satellite\.getVar\s*\(\s*['"]qsp_['"]\s*\+/.test(ruleStr) ||
      /_satellite\.getVar\s*\(\s*`qsp_\$\{/.test(ruleStr)
    );
  }

  function extractQspSuffixesFromLookup(dataElements) {
    var suffixes = [];
    if (!dataElements || typeof dataElements !== 'object') return suffixes;
    for (var k in dataElements) {
      if (!Object.prototype.hasOwnProperty.call(dataElements, k)) continue;
      if (!/parameter\s*storage|url\s*parameter/i.test(k)) continue;
      var de = dataElements[k];
      var blob = JSON.stringify(de && de.settings != null ? de.settings : de);
      var re = /["']name["']\s*:\s*["']([^"']+)["']/g;
      var m;
      while ((m = re.exec(blob)) !== null) {
        if (m[1] && m[1].length > 0 && m[1].length < 256) suffixes.push(m[1]);
      }
    }
    return suffixes;
  }

  var SETTINGS_REF_EXCLUDE_KEYS =
    /^(source|customCode|script|code|html|css|url|href|selector|identifier|eventName|eventType|modulePath|googleAnalyticsValue)$/i;

  function markDataElementChangeNames(rule, set) {
    var evs = rule && rule.events;
    if (!Array.isArray(evs)) return;
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (!ev || !ev.settings || typeof ev.settings.name !== 'string' || !ev.settings.name) continue;
      var mp = String(ev.modulePath || '');
      if (mp.indexOf('dataElementChange') !== -1 || mp.indexOf('data_element_change') !== -1) {
        set[ev.settings.name] = true;
      }
    }
  }

  /**
   * Walk settings objects: any string equal to a top-level data element name counts as a ref.
   * Catches Launch fields that store the DE key as a plain string (custom code event, etc.).
   */
  function markExactDENamesInRuleComponentSettings(rule, dataElements, set) {
    if (!dataElements || typeof dataElements !== 'object') return;
    var deKeys = Object.create(null);
    for (var dk in dataElements) {
      if (Object.prototype.hasOwnProperty.call(dataElements, dk)) deKeys[dk] = true;
    }
    function walk(val, depth) {
      if (depth > 10 || val == null) return;
      if (typeof val === 'string') {
        if (val && deKeys[val]) set[val] = true;
        return;
      }
      if (Array.isArray(val)) {
        for (var ai = 0; ai < val.length; ai++) walk(val[ai], depth + 1);
        return;
      }
      if (typeof val !== 'object') return;
      for (var key in val) {
        if (!Object.prototype.hasOwnProperty.call(val, key)) continue;
        if (SETTINGS_REF_EXCLUDE_KEYS.test(key)) continue;
        walk(val[key], depth + 1);
      }
    }
    ['events', 'conditions', 'actions'].forEach(function (part) {
      var arr = rule && rule[part];
      if (!Array.isArray(arr)) return;
      for (var ci = 0; ci < arr.length; ci++) {
        var comp = arr[ci];
        if (comp && comp.settings != null && typeof comp.settings === 'object') {
          walk(comp.settings, 0);
        }
      }
    });
  }

  function objectContainsExactStringValueSkippingKeys(obj, target, excludeKeyRe, depth) {
    if (!target || depth > 10 || obj == null) return false;
    if (typeof obj === 'string') return obj === target;
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
        if (objectContainsExactStringValueSkippingKeys(obj[i], target, excludeKeyRe, depth + 1)) return true;
      }
      return false;
    }
    if (typeof obj !== 'object') return false;
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      if (excludeKeyRe.test(k)) continue;
      if (objectContainsExactStringValueSkippingKeys(obj[k], target, excludeKeyRe, depth + 1)) return true;
    }
    return false;
  }

  /**
   * @param {object} rule
   * @param {object} dataElements — full _satellite._container.dataElements map
   * @returns {string[]} unique data element names referenced by this rule (best effort)
   */
  function getDENamesReferencedInRule(rule, dataElements) {
    var set = Object.create(null);
    if (!rule) return [];

    var ruleStr = JSON.stringify(rule);
    var lit = collectLiteralRefsFromJsonString(ruleStr);
    var lk;
    for (lk in lit) {
      if (Object.prototype.hasOwnProperty.call(lit, lk)) set[lk] = true;
    }
    markDataElementChangeNames(rule, set);
    markExactDENamesInRuleComponentSettings(rule, dataElements, set);
    mergeRefsFromSettingsStringLeaves(rule, set);

    if (hasDynamicQspPattern(ruleStr)) {
      var sfx = extractQspSuffixesFromLookup(dataElements || {});
      if (sfx.length) {
        for (var j = 0; j < sfx.length; j++) {
          set['qsp_' + sfx[j]] = true;
        }
      } else if (dataElements && typeof dataElements === 'object') {
        for (var dk in dataElements) {
          if (Object.prototype.hasOwnProperty.call(dataElements, dk) && dk.indexOf('qsp_') === 0) {
            set[dk] = true;
          }
        }
      }
    }

    return Object.keys(set);
  }

  function ruleReferencesDataElement(rule, deName, dataElements) {
    if (!rule || !deName) return false;
    var names = getDENamesReferencedInRule(rule, dataElements);
    for (var i = 0; i < names.length; i++) {
      if (names[i] === deName) return true;
    }
    return false;
  }

  function jsonMentionsDataElement(jsonStr, deName) {
    if (!jsonStr || !deName) return false;
    if (collectLiteralRefsFromJsonString(jsonStr)[deName]) return true;
    try {
      var o = JSON.parse(jsonStr);
      return objectContainsExactStringValueSkippingKeys(o, deName, SETTINGS_REF_EXCLUDE_KEYS, 0);
    } catch (e) {
      return false;
    }
  }

  global.TagScannerDataElementRefs = {
    collectLiteralRefsFromJsonString: collectLiteralRefsFromJsonString,
    getDENamesReferencedInRule: getDENamesReferencedInRule,
    ruleReferencesDataElement: ruleReferencesDataElement,
    jsonMentionsDataElement: jsonMentionsDataElement
  };
})(typeof window !== 'undefined' ? window : this);
