/**
 * TagScanner — optional deep scan: fetch HTTPS bundle URLs from library JSON
 * (rule components, data element custom code, extension config) and scan body text
 * for %DE% and _satellite.getVar(...) patterns via TagScannerDataElementRefs.
 *
 * Separate from the default snapshot workflow; failures are isolated per URL.
 */
(function (global) {
  'use strict';

  var MAX_BYTES = 2 * 1024 * 1024;
  var DEFAULT_TIMEOUT_MS = 25000;

  function isHttpsUrl(s) {
    return typeof s === 'string' && /^https:\/\//i.test(s.trim());
  }

  function mergeJob(jobs, url, ctx) {
    if (!isHttpsUrl(url)) return;
    var u = url.trim();
    if (!jobs[u]) jobs[u] = { contexts: [] };
    jobs[u].contexts.push(ctx);
  }

  function walkExtensionForSources(o, extKey, jobs, depth) {
    if (depth > 14 || o == null) return;
    if (typeof o === 'string') {
      if (isHttpsUrl(o) && /\.js(\?|#|$)/i.test(o)) {
        mergeJob(jobs, o, { kind: 'extension', extKey: extKey });
      }
      return;
    }
    if (Array.isArray(o)) {
      for (var i = 0; i < o.length; i++) walkExtensionForSources(o[i], extKey, jobs, depth + 1);
      return;
    }
    if (typeof o === 'object') {
      var src = o.source;
      if (typeof src === 'string' && isHttpsUrl(src)) {
        mergeJob(jobs, src, { kind: 'extension', extKey: extKey });
      }
      for (var k in o) {
        if (Object.prototype.hasOwnProperty.call(o, k)) {
          walkExtensionForSources(o[k], extKey, jobs, depth + 1);
        }
      }
    }
  }

  /**
   * Collect unique HTTPS URLs and why we care about each.
   * @returns {object} map url -> { contexts: Array<{kind,ruleName?,deKey?,extKey?}> }
   */
  function harvestJobs(rulesArray, dataElements, extensionsObj) {
    var jobs = Object.create(null);
    var ra = rulesArray || [];
    for (var r = 0; r < ra.length; r++) {
      var rule = ra[r];
      var ruleNm = rule.name || rule.id || 'Rule ' + (r + 1);
      ['events', 'conditions', 'actions'].forEach(function (part) {
        var arr = rule[part];
        if (!Array.isArray(arr)) return;
        for (var j = 0; j < arr.length; j++) {
          var comp = arr[j];
          var st = comp && comp.settings;
          var src = st && typeof st.source === 'string' ? st.source : '';
          if (isHttpsUrl(src)) {
            mergeJob(jobs, src, { kind: 'rule', ruleName: ruleNm });
          }
        }
      });
    }
    var des = dataElements || {};
    for (var deKey in des) {
      if (!Object.prototype.hasOwnProperty.call(des, deKey)) continue;
      var de = des[deKey];
      var dsrc = de && de.settings && typeof de.settings.source === 'string' ? de.settings.source : '';
      if (isHttpsUrl(dsrc)) {
        mergeJob(jobs, dsrc, { kind: 'dataElement', deKey: deKey });
      }
    }
    if (extensionsObj && typeof extensionsObj === 'object') {
      for (var extKey in extensionsObj) {
        if (!Object.prototype.hasOwnProperty.call(extensionsObj, extKey)) continue;
        walkExtensionForSources(extensionsObj[extKey], extKey, jobs, 0);
      }
    }
    return jobs;
  }

  function fetchBundleText(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var ctrl = new AbortController();
      var t = setTimeout(function () {
        ctrl.abort();
      }, timeoutMs || DEFAULT_TIMEOUT_MS);
      fetch(url, { signal: ctrl.signal, credentials: 'omit', cache: 'no-store' })
        .then(function (res) {
          clearTimeout(t);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.arrayBuffer();
        })
        .then(function (buf) {
          var truncated = buf.byteLength > MAX_BYTES;
          var slice = truncated ? buf.slice(0, MAX_BYTES) : buf;
          var text = new TextDecoder('utf-8', { fatal: false }).decode(slice);
          resolve({ text: text, truncated: truncated });
        })
        .catch(function (e) {
          clearTimeout(t);
          reject(e);
        });
    });
  }

  function addUnique(arr, v) {
    if (arr.indexOf(v) === -1) arr.push(v);
  }

  /**
   * @param {object} opts
   * @param {Array} opts.rulesArray
   * @param {object} opts.dataElements
   * @param {object} opts.extensionsObj
   * @param {function(object)} [opts.onProgress] — { phase, index, total, url? }
   * @param {number} [opts.timeoutMs]
   * @returns {Promise<{ errors: Array, hostedDeToRuleNames: object, hostedDErefsFromDE: object, hostedDErefsFromExt: object, stats: object }>}
   */
  function run(opts) {
    var rulesArray = opts.rulesArray || [];
    var dataElements = opts.dataElements || {};
    var extensionsObj = opts.extensionsObj || {};
    var onProgress = opts.onProgress || function () {};
    var timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

    var collectLiteral =
      global.TagScannerDataElementRefs &&
      typeof global.TagScannerDataElementRefs.collectLiteralRefsFromJsonString === 'function'
        ? global.TagScannerDataElementRefs.collectLiteralRefsFromJsonString.bind(
            global.TagScannerDataElementRefs
          )
        : function () {
            return {};
          };

    var jobs = harvestJobs(rulesArray, dataElements, extensionsObj);
    var urls = Object.keys(jobs);
    var errors = [];
    var hostedDeToRuleNames = Object.create(null);
    var hostedDErefsFromDE = Object.create(null);
    var hostedDErefsFromExt = Object.create(null);
    var bytesRead = 0;
    var fetchedOk = 0;

    function noteRule(deName, ruleNm) {
      if (!hostedDeToRuleNames[deName]) hostedDeToRuleNames[deName] = [];
      addUnique(hostedDeToRuleNames[deName], ruleNm);
    }
    function noteDE(deName, srcDe) {
      if (!hostedDErefsFromDE[deName]) hostedDErefsFromDE[deName] = [];
      addUnique(hostedDErefsFromDE[deName], srcDe);
    }
    function noteExt(deName, extKey) {
      if (!hostedDErefsFromExt[deName]) hostedDErefsFromExt[deName] = [];
      addUnique(hostedDErefsFromExt[deName], extKey);
    }

    var idx = 0;

    function processNext() {
      if (idx >= urls.length) {
        return Promise.resolve({
          errors: errors,
          hostedDeToRuleNames: hostedDeToRuleNames,
          hostedDErefsFromDE: hostedDErefsFromDE,
          hostedDErefsFromExt: hostedDErefsFromExt,
          stats: {
            urlsTotal: urls.length,
            fetchedOk: fetchedOk,
            bytesRead: bytesRead
          }
        });
      }
      var url = urls[idx];
      idx++;
      onProgress({ phase: 'fetch', index: idx, total: urls.length, url: url });
      return fetchBundleText(url, timeoutMs)
        .then(function (got) {
          fetchedOk++;
          bytesRead += got.text.length;
          var refs = collectLiteral(got.text);
          var refNames = Object.keys(refs);
          var contexts = jobs[url].contexts;
          for (var ri = 0; ri < refNames.length; ri++) {
            var refDe = refNames[ri];
            if (!refDe) continue;
            for (var ci = 0; ci < contexts.length; ci++) {
              var ctx = contexts[ci];
              if (ctx.kind === 'rule') noteRule(refDe, ctx.ruleName);
              else if (ctx.kind === 'dataElement') noteDE(refDe, ctx.deKey);
              else if (ctx.kind === 'extension') noteExt(refDe, ctx.extKey);
            }
          }
          return processNext();
        })
        .catch(function (e) {
          errors.push({ url: url, message: (e && e.message) || String(e) });
          return processNext();
        });
    }

    if (urls.length === 0) {
      onProgress({ phase: 'done', index: 0, total: 0 });
      return Promise.resolve({
        errors: [],
        hostedDeToRuleNames: hostedDeToRuleNames,
        hostedDErefsFromDE: hostedDErefsFromDE,
        hostedDErefsFromExt: hostedDErefsFromExt,
        stats: { urlsTotal: 0, fetchedOk: 0, bytesRead: 0 }
      });
    }

    onProgress({ phase: 'start', index: 0, total: urls.length });
    return processNext().then(function (result) {
      onProgress({ phase: 'done', index: urls.length, total: urls.length });
      return result;
    });
  }

  global.TagScannerDeepScanHosted = {
    run: run,
    harvestJobs: harvestJobs
  };
})(typeof window !== 'undefined' ? window : this);
