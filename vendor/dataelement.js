var _tsA_de = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
if (_tsA_de) _tsA_de.page('TagScanner:Data Elements', { events: 'event12' });

var de_details_node = document.getElementById('dataelement_details');
var dataElementsExportRows = null; // filled when table is built, used by Export CSV
if (de_details_node) {
  var de_value = sessionStorage.getItem('_satellite._container.dataElements');
  if (!de_value || de_value.trim() === '') {
    de_details_node.innerHTML = '<tbody><tr><td colspan="6" style="text-align:center;padding:20px">No data elements found.</td></tr></tbody>';
  } else {
    let dataElements;
    try { dataElements = JSON.parse(de_value); } catch (_parseErr) {
      if (_tsA_de) _tsA_de.track('Error:Parse:DataElements', { pageName: 'TagScanner:Data Elements', events: 'event15', v9: 'Parse Error: DEs', c2: 'Data Elements' });
      de_details_node.innerHTML = '<tbody><tr><td colspan="6" style="text-align:center;padding:20px">Error loading data elements.</td></tr></tbody>';
    }
    if (dataElements) {

  // --- Helpers ---
  function isHttpUrl(str) {
    return typeof str === 'string' && /^https?:\/\//i.test(str.trim());
  }

  function stripFunctionWrapper(source) {
    if (typeof source !== 'string') return '';
    var trimmed = source.trim();
    var wrappedFn = trimmed.match(/^function\s*\([^)]*\)\s*\{([\s\S]*)\}$/);
    if (wrappedFn && wrappedFn[1]) return wrappedFn[1].trim();
    return trimmed;
  }

  function looksLikeCode(str) {
    if (typeof str !== 'string') return false;
    var s = str.trim();
    if (!s) return false;
    return /[;{}()=]|\breturn\b|\bif\b|\bvar\b|\blet\b|\bconst\b/.test(s);
  }

  function collectStringCandidatesDeep(obj, out, depth) {
    if (!obj || depth > 8) return;
    if (typeof obj === 'string') {
      out.push(obj);
      return;
    }
    if (typeof obj === 'function') {
      out.push(obj.toString());
      return;
    }
    if (Array.isArray(obj)) {
      for (var ai = 0; ai < obj.length; ai++) collectStringCandidatesDeep(obj[ai], out, depth + 1);
      return;
    }
    if (typeof obj === 'object') {
      var keyPriority = ['source', 'code', 'customCode', 'sourceCode', 'script'];
      for (var kp = 0; kp < keyPriority.length; kp++) {
        var k = keyPriority[kp];
        if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
        var v = obj[k];
        if (typeof v === 'string') out.push(v);
        else if (typeof v === 'function') out.push(v.toString());
      }
      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          collectStringCandidatesDeep(obj[key], out, depth + 1);
        }
      }
    }
  }

  function getDECustomCodeInfo(de) {
    if (!de || typeof de !== 'object') {
      return { kind: 'none', text: '', hasCode: false };
    }

    var runtimeSource = de.settings && de.settings.source;
    if (typeof runtimeSource === 'function') {
      var fnBody = stripFunctionWrapper(runtimeSource.toString());
      if (fnBody) return { kind: 'inline', text: fnBody, hasCode: true };
    } else if (typeof runtimeSource === 'string' && runtimeSource.trim()) {
      var normalized = stripFunctionWrapper(runtimeSource);
      if (isHttpUrl(normalized)) return { kind: 'url', text: normalized, hasCode: true };
      return { kind: 'inline', text: normalized, hasCode: true };
    }

    // Fallback: scan payload object for recoverable code-like strings.
    var candidates = [];
    collectStringCandidatesDeep(de, candidates, 0);
    var bestInline = '';
    var bestUrl = '';
    for (var ci = 0; ci < candidates.length; ci++) {
      var cand = stripFunctionWrapper(String(candidates[ci] || ''));
      if (!cand) continue;
      if (!bestUrl && isHttpUrl(cand)) bestUrl = cand;
      if (looksLikeCode(cand) && cand.length > bestInline.length) bestInline = cand;
    }
    if (bestInline) return { kind: 'inline', text: bestInline, hasCode: true };
    if (bestUrl) return { kind: 'url', text: bestUrl, hasCode: true };
    return { kind: 'none', text: '', hasCode: false };
  }

  function fetchHostedCode(url) {
    return fetch(url, { credentials: 'omit', cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    });
  }

  function analyzeCodeWithoutAI(code) {
    var src = String(code || '');
    if (!src.trim()) return '<p style="color:#888;font-style:italic;margin:0">No code available to analyze.</p>';

    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function has(re) { return re.test(src); }
    function count(re) { return (src.match(re)||[]).length; }

    // Minification check
    var lines = src.split(/\r?\n/);
    var nonEmpty = lines.filter(function(l){ return l.trim(); });
    var avgLineLen = nonEmpty.length ? Math.round(src.length / nonEmpty.length) : src.length;
    var maybeMinified = (nonEmpty.length <= 2 && src.length > 500) || avgLineLen > 220;

    // Return value extraction
    var returnMatches = [];
    var returnRe = /\breturn\s+([^\n;{}]{1,120})/g, rm;
    while ((rm = returnRe.exec(src)) !== null) {
      var rv = rm[1].trim();
      if (rv && rv !== 'null' && rv !== 'undefined' && rv !== "''" && rv !== '""')
        returnMatches.push(rv.length > 90 ? rv.slice(0,90) + '…' : rv);
      if (returnMatches.length >= 3) break;
    }

    // Return type inference
    var returnType = 'unknown';
    if (has(/\breturn\s+(true|false|!![^;{]{0,40})/)) returnType = 'boolean';
    else if (has(/\breturn\s+['"`]/) || has(/\.toString\s*\(\)/) || has(/\breturn\s+String\s*\(/)) returnType = 'string';
    else if (has(/\breturn\s+(parseInt|parseFloat|Number)\s*\(/)) returnType = 'number';
    else if (has(/\breturn\s+\[/)) returnType = 'array';
    else if (has(/\breturn\s+\{/) || has(/\breturn\s+new\s+Object/)) returnType = 'object';
    else if (has(/\breturn\s+new\s+Promise/) || has(/async\s+function|\bawait\s+/)) returnType = 'Promise';
    else if (returnMatches.length > 2) returnType = 'conditional';
    else if (returnMatches.length > 0) returnType = 'value';

    // Source extraction — granular by category
    var ddPaths = [], ddSeen = {};
    var ddRe = /\b(digitalData(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*){1,6})/g, ddm;
    while ((ddm = ddRe.exec(src)) !== null) {
      if (!ddSeen[ddm[1]] && ddPaths.length < 8) { ddSeen[ddm[1]] = true; ddPaths.push(ddm[1]); }
    }

    var adlPaths = [], adlSeen = {};
    var adlRe = /\b(adobeDataLayer(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*){1,5})/g, adlm;
    while ((adlm = adlRe.exec(src)) !== null) {
      if (!adlSeen[adlm[1]] && adlPaths.length < 6) { adlSeen[adlm[1]] = true; adlPaths.push(adlm[1]); }
    }

    var dlPaths = [], dlSeen = {};
    var dlRe = /\b(dataLayer(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*){1,5})/g, dlm;
    while ((dlm = dlRe.exec(src)) !== null) {
      if (!dlSeen[dlm[1]] && dlPaths.length < 6) { dlSeen[dlm[1]] = true; dlPaths.push(dlm[1]); }
    }

    var winPaths = [], winSeen = {};
    var winRe = /\b(window\.[a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*){0,4})/g, wm;
    while ((wm = winRe.exec(src)) !== null) {
      if (!winSeen[wm[1]] && winPaths.length < 6) { winSeen[wm[1]] = true; winPaths.push(wm[1]); }
    }

    var docLocReads = [], docLocSeen = {};
    var docLocRe = /\b(document\.(?:title|referrer|URL)|location\.(?:href|pathname|search|hash|origin|hostname))\b/g, dlcm;
    while ((dlcm = docLocRe.exec(src)) !== null) {
      if (!docLocSeen[dlcm[1]] && docLocReads.length < 6) { docLocSeen[dlcm[1]] = true; docLocReads.push(dlcm[1]); }
    }

    var deRefs = [];
    var satRe = /_satellite\.getVar\s*\(\s*['"]([^'"]+)['"]\s*\)/g, sm;
    while ((sm = satRe.exec(src)) !== null) { if (deRefs.indexOf(sm[1]) === -1) deRefs.push(sm[1]); }
    var pctRe = /%([^%\s]{1,60})%/g, pm2;
    while ((pm2 = pctRe.exec(src)) !== null) { if (deRefs.indexOf(pm2[1]) === -1) deRefs.push(pm2[1]); }

    var urlParamKeys = [];
    var upRe = /(?:searchParams\.get|URLSearchParams[^)]*)\s*\(\s*['"]([^'"]{1,40})['"]\s*\)|\.get\s*\(\s*['"]([^'"]{1,40})['"]\s*\)/g, up;
    while ((up = upRe.exec(src)) !== null) {
      var upKey = up[1] || up[2];
      if (upKey && urlParamKeys.indexOf(upKey) === -1) urlParamKeys.push(upKey);
    }
    var hasUrlSearch = has(/location\.search/) && urlParamKeys.length === 0;

    var storageKeys = [];
    var stRe = /(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\s*\(\s*['"]([^'"]{1,60})['"]/g, st;
    while ((st = stRe.exec(src)) !== null) {
      var stEntry = (src.substring(st.index, st.index + 13).indexOf('session') >= 0 ? 'session' : 'local') + ':' + st[1];
      if (storageKeys.indexOf(stEntry) === -1) storageKeys.push(stEntry);
    }

    var cookieKeys = [];
    var ckRe = /getCookie\s*\(\s*['"]([^'"]{1,60})['"]\s*\)|cookie\.(?:get|read)\s*\(\s*['"]([^'"]{1,60})['"]/g, ck;
    while ((ck = ckRe.exec(src)) !== null) {
      var ckName = ck[1] || ck[2];
      if (ckName && cookieKeys.indexOf(ckName) === -1) cookieKeys.push(ckName);
    }
    var hasCookieRead = has(/document\.cookie/);

    var networkCalls = count(/\bfetch\s*\(|\bXMLHttpRequest\b|\.sendBeacon\s*\(/g);
    var returnCount = count(/\breturn\b/g);

    // ---- PROSE SUMMARY ----
    var proseParts = [];
    if (ddPaths.length) proseParts.push('reads from the <strong>Adobe data layer</strong> (<code>digitalData</code>)');
    if (adlPaths.length) proseParts.push('reads from the <strong>ECMA data layer</strong> (<code>adobeDataLayer</code>)');
    if (dlPaths.length) proseParts.push('reads from <strong>dataLayer</strong>');
    if (winPaths.length) proseParts.push('reads from <strong>window</strong> globals');
    if (deRefs.length) {
      var depLabel = deRefs.length === 1 ? 'data element <code>' + esc(deRefs[0]) + '</code>' : deRefs.length + ' other Tags data elements';
      proseParts.push('depends on ' + depLabel);
    }
    if (urlParamKeys.length) proseParts.push('extracts <code>' + urlParamKeys.slice(0,2).map(esc).join('</code>, <code>') + '</code> from the URL query string');
    else if (hasUrlSearch) proseParts.push('parses the URL query string');
    if (storageKeys.length) proseParts.push('reads from browser storage');
    if (hasCookieRead || cookieKeys.length) proseParts.push('reads browser cookies');
    if (docLocReads.length) proseParts.push('reads ' + docLocReads.slice(0,2).map(function(d){ return '<code>' + esc(d) + '</code>'; }).join(', '));
    if (networkCalls > 0) proseParts.push('makes ' + networkCalls + ' async network call' + (networkCalls > 1 ? 's' : ''));

    var outcomeParts = [];
    if (returnMatches.length) {
      var typeStr = (returnType !== 'unknown' && returnType !== 'value') ? ' (' + returnType + ')' : '';
      outcomeParts.push('returns a value' + typeStr);
    }

    var proseHtml;
    if (proseParts.length || outcomeParts.length) {
      var sentence = 'This code ' + proseParts.join(', ');
      if (outcomeParts.length) sentence += (proseParts.length ? ', and ' : 'This code ') + outcomeParts.join(' and ');
      proseHtml = sentence + '.';
    } else {
      proseHtml = 'Short utility code — no named data source patterns detected.';
    }

    // ---- DATA FLOW ----
    var flowSources = [];
    ddPaths.slice(0,4).forEach(function(p){ flowSources.push({ label: p, color: '#27c5c1', tag: 'digitalData' }); });
    adlPaths.slice(0,3).forEach(function(p){ flowSources.push({ label: p, color: '#3498db', tag: 'adobeDataLayer' }); });
    dlPaths.slice(0,3).forEach(function(p){ flowSources.push({ label: p, color: '#2ecc71', tag: 'dataLayer' }); });
    winPaths.slice(0,3).forEach(function(p){ flowSources.push({ label: p, color: '#8e44ad', tag: 'window' }); });
    deRefs.slice(0,4).forEach(function(r){ flowSources.push({ label: r, color: '#4e73df', tag: 'Tags DE' }); });
    urlParamKeys.slice(0,3).forEach(function(k){ flowSources.push({ label: '?' + k + '=', color: '#1abc9c', tag: 'URL param' }); });
    if (hasUrlSearch) flowSources.push({ label: 'location.search', color: '#1abc9c', tag: 'URL' });
    storageKeys.slice(0,3).forEach(function(k){ var p = k.split(':'); flowSources.push({ label: p[1], color: '#9b59b6', tag: p[0] + 'Storage' }); });
    cookieKeys.slice(0,3).forEach(function(k){ flowSources.push({ label: k, color: '#e67e22', tag: 'cookie' }); });
    if (hasCookieRead && !cookieKeys.length) flowSources.push({ label: 'document.cookie', color: '#e67e22', tag: 'cookie' });
    docLocReads.slice(0,3).forEach(function(d){ flowSources.push({ label: d, color: '#95a5a6', tag: 'browser' }); });

    var retTypeColors = { string:'#27ae60', number:'#e67e22', boolean:'#e74c3c', object:'#3498db', array:'#1abc9c', Promise:'#f39c12', conditional:'#8e44ad', value:'#5a5c69', unknown:'#aaa' };

    // ---- DEBUG COMMANDS ----
    var debugCmds = [];
    ddPaths.slice(0,4).forEach(function(p){ debugCmds.push({ label: p, cmd: p }); });
    adlPaths.slice(0,3).forEach(function(p){ debugCmds.push({ label: p, cmd: p }); });
    dlPaths.slice(0,2).forEach(function(p){ debugCmds.push({ label: p, cmd: p }); });
    winPaths.slice(0,2).forEach(function(p){ debugCmds.push({ label: p, cmd: p }); });
    deRefs.slice(0,4).forEach(function(r){ debugCmds.push({ label: 'DE: ' + r, cmd: '_satellite.getVar("' + r.replace(/"/g,'\\"') + '")' }); });
    urlParamKeys.slice(0,3).forEach(function(k){ debugCmds.push({ label: '?' + k + '=', cmd: 'new URLSearchParams(location.search).get("' + k.replace(/"/g,'\\"') + '")' }); });
    storageKeys.slice(0,3).forEach(function(k){ var p = k.split(':'); var store = p[0]==='session'?'sessionStorage':'localStorage'; debugCmds.push({ label: store+': '+p[1], cmd: store+'.getItem("'+p[1].replace(/"/g,'\\"')+'")' }); });
    cookieKeys.slice(0,3).forEach(function(k){ debugCmds.push({ label: 'cookie: '+k, cmd: 'document.cookie.split("; ").find(r=>r.startsWith("'+k.replace(/"/g,'\\"')+'="))?.split("=")[1]' }); });
    if (hasCookieRead && !cookieKeys.length) debugCmds.push({ label: 'All cookies', cmd: 'document.cookie' });
    docLocReads.slice(0,3).forEach(function(d){ debugCmds.push({ label: d, cmd: d }); });
    if (networkCalls > 0) debugCmds.push({ label: 'Network calls', cmd: '// Open DevTools → Network tab → reload to inspect outbound requests' });

    // ---- RISK FLAGS ----
    var risks = [];
    if (/\b\w+\.\w+\.\w+\.\w+/.test(src) && !has(/&&|\?\.|\?\?/)) {
      risks.push({ sev: 'error', icon: 'fa-exclamation-triangle', text: 'Deep property chain without null guards — throws <code>TypeError</code> if any level is <code>undefined</code>.', fix: 'Use optional chaining: <code>digitalData?.page?.pageInfo?.pageName</code>' });
    }
    if (!has(/\btry\s*\{/) && src.length > 80) {
      risks.push({ sev: 'warn', icon: 'fa-shield-alt', text: 'No <code>try/catch</code> — uncaught errors silently break this DE and all rules that use it.', fix: 'Wrap in <code>try { … } catch(e) { return undefined; }</code>' });
    }
    if (returnCount > 2) {
      risks.push({ sev: 'info', icon: 'fa-code-branch', text: returnCount + ' return paths — verify every branch returns the same type.', fix: 'Add a final <code>return undefined;</code> so no path falls through accidentally.' });
    }
    if (has(/\beval\s*\(/)) {
      risks.push({ sev: 'error', icon: 'fa-skull-crossbones', text: '<code>eval()</code> detected — blocked by CSP on most production pages.', fix: 'Replace with <code>JSON.parse()</code> or a safe dynamic function.' });
    }
    if (has(/document\.write\s*\(/)) {
      risks.push({ sev: 'error', icon: 'fa-ban', text: '<code>document.write()</code> breaks async pages and is deprecated.', fix: 'Use <code>document.createElement()</code> + <code>appendChild()</code>.' });
    }
    if (maybeMinified) {
      risks.push({ sev: 'info', icon: 'fa-compress-alt', text: 'Code appears minified — analysis may be incomplete.', fix: 'Use the Format button above to restore readability.' });
    }
    if (networkCalls > 0) {
      risks.push({ sev: 'warn', icon: 'fa-wifi', text: networkCalls + ' network call(s) — adds async latency; DE value may be <code>undefined</code> when rule fires.', fix: 'Cache in <code>sessionStorage</code> or move I/O to a rule action.' });
    }
    if (has(/\bsetTimeout\s*\(|\bsetInterval\s*\(/)) {
      risks.push({ sev: 'warn', icon: 'fa-clock', text: 'Timer inside a data element — value may not be ready when the rule fires.', fix: 'Return synchronously, or use a custom event rule to defer execution.' });
    }
    if (has(/console\.log\s*\(|console\.debug\s*\(/)) {
      risks.push({ sev: 'info', icon: 'fa-terminal', text: '<code>console.log</code>/<code>debug</code> found — remove before production.', fix: 'Guard with <code>if (window._debug) console.log(…)</code> or remove.' });
    }

    // ---- BUILD HTML ----
    var sevBg = { error:'#fdecea', warn:'#fff8e1', info:'#f0f4ff' };
    var sevBorder = { error:'#f5c2be', warn:'#ffe082', info:'#c5d5f8' };
    var sevColor = { error:'#c0392b', warn:'#b7770d', info:'#3a5bc7' };
    var sevIconColor = { error:'#c0392b', warn:'#e67e22', info:'#4e73df' };

    var html = '';

    // Section 1: Prose
    html += '<div class="de-analysis-section">';
    html += '<div class="de-analysis-heading"><i class="fas fa-align-left"></i> What This Code Does</div>';
    html += '<p class="de-analysis-prose">' + proseHtml + '</p>';
    html += '</div>';

    // Section 2: Data Flow
    if (flowSources.length || returnMatches.length) {
      html += '<div class="de-analysis-section">';
      html += '<div class="de-analysis-heading"><i class="fas fa-exchange-alt"></i> Data Flow</div>';
      html += '<div class="de-analysis-flow">';

      html += '<div class="de-flow-col">';
      html += '<div class="de-flow-label">Reads from</div>';
      if (flowSources.length) {
        flowSources.forEach(function(fi){
          html += '<div class="de-flow-item" style="border-left:3px solid '+fi.color+'">';
          html += '<span class="de-flow-type" style="background:'+fi.color+'22;color:'+fi.color+'">'+esc(fi.tag)+'</span>';
          html += '<code>'+esc(fi.label)+'</code></div>';
        });
      } else {
        html += '<div class="de-flow-item de-flow-none">no named sources detected</div>';
      }
      html += '</div>';

      html += '<div class="de-flow-arrow"><i class="fas fa-arrow-right"></i></div>';

      html += '<div class="de-flow-col">';
      html += '<div class="de-flow-label">Returns</div>';
      if (returnMatches.length) {
        var rtColor = retTypeColors[returnType] || '#5a5c69';
        if (returnType !== 'unknown' && returnType !== 'value') {
          html += '<div class="de-flow-item" style="border-left:3px solid '+rtColor+'">';
          html += '<span class="de-flow-type" style="background:'+rtColor+'22;color:'+rtColor+'">'+esc(returnType)+'</span></div>';
        }
        returnMatches.slice(0,2).forEach(function(r){
          html += '<div class="de-flow-item" style="border-left:3px solid #e3e6f0">';
          html += '<code class="de-flow-ret" title="'+esc(r)+'">'+esc(r)+'</code></div>';
        });
      } else {
        html += '<div class="de-flow-item de-flow-none">void / side effects only</div>';
      }
      html += '</div>';

      html += '</div></div>';
    }

    // Section 3: Debug in Browser Console
    if (debugCmds.length) {
      html += '<div class="de-analysis-section">';
      html += '<div class="de-analysis-heading"><i class="fas fa-terminal"></i> Debug in Browser Console</div>';
      html += '<div class="de-debug-hint">Paste into DevTools Console on the target page to inspect each source live:</div>';
      html += '<div class="de-debug-list">';
      debugCmds.forEach(function(cmd){
        var isComment = cmd.cmd.charAt(0) === '/';
        html += '<div class="de-debug-cmd'+(isComment?' de-debug-cmd-comment':'')+'">';
        html += '<span class="de-debug-label" title="'+esc(cmd.label)+'">'+esc(cmd.label)+'</span>';
        html += '<div class="de-debug-code-wrap">';
        html += '<code class="de-debug-code">'+esc(cmd.cmd)+'</code>';
        if (!isComment) {
          html += '<button class="de-debug-copy" title="Copy to clipboard" type="button" onclick="(function(btn){var c=btn.closest(\'.de-debug-cmd\').querySelector(\'.de-debug-code\');var t=document.createElement(\'textarea\');t.value=c.textContent;document.body.appendChild(t);t.select();document.execCommand(\'copy\');document.body.removeChild(t);btn.innerHTML=\'<i class=\\"fas fa-check\\" style=\\"color:#27c5c1\\"></i>\';setTimeout(function(){btn.innerHTML=\'<i class=\\"fas fa-copy\\"></i>\';},1500);})(this)"><i class="fas fa-copy"></i></button>';
        }
        html += '</div></div>';
      });
      html += '</div></div>';
    }

    // Section 4: Risk Flags
    if (risks.length) {
      html += '<div class="de-analysis-section">';
      html += '<div class="de-analysis-heading" style="color:#c0392b"><i class="fas fa-exclamation-triangle"></i> Risk Flags</div>';
      risks.forEach(function(r){
        var bg = sevBg[r.sev]||'#f8f9fa', border = sevBorder[r.sev]||'#e3e6f0';
        var col = sevColor[r.sev]||'#5a5c69', ic = sevIconColor[r.sev]||'#5a5c69';
        html += '<div class="de-risk-item" style="background:'+bg+';border:1px solid '+border+';border-left:3px solid '+col+'">';
        html += '<div class="de-risk-text"><i class="fas '+r.icon+'" style="color:'+ic+';margin-right:6px"></i><span style="color:'+col+'">'+r.text+'</span></div>';
        if (r.fix) html += '<div class="de-risk-fix"><i class="fas fa-wrench" style="margin-right:5px;color:#888"></i>'+r.fix+'</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    if (!proseParts.length && !outcomeParts.length && !flowSources.length && !debugCmds.length && !risks.length) {
      html += '<p style="color:#888;font-style:italic;margin:0">No patterns detected. Code may be too minimal or use uncommon structures.</p>';
    }

    return html;
  }

  function stringContainsDERef(str, deName) {
    if (!str || typeof str !== 'string') return false;
    const value = '%' + deName + '%';
    const check1 = '_satellite.getVar("' + deName + '")';
    const check2 = "_satellite.getVar('" + deName + "')";
    return str.indexOf(value) > -1 || str.indexOf(check1) > -1 || str.indexOf(check2) > -1;
  }

  function deRefInSerializedJson(str, deName) {
    if (!str || !deName) return false;
    if (window.TagScannerDataElementRefs && window.TagScannerDataElementRefs.jsonMentionsDataElement) {
      return window.TagScannerDataElementRefs.jsonMentionsDataElement(str, deName);
    }
    return stringContainsDERef(str, deName);
  }

  function componentReferencesDEInRule(component, deName) {
    if (!component) return false;
    var s = JSON.stringify(component);
    if (window.TagScannerDataElementRefs && window.TagScannerDataElementRefs.jsonMentionsDataElement) {
      if (window.TagScannerDataElementRefs.jsonMentionsDataElement(s, deName)) return true;
    } else if (stringContainsDERef(s, deName)) {
      return true;
    }
    if (component.settings && typeof component.settings.name === 'string' && component.settings.name === deName) {
      var mp = String(component.modulePath || '');
      if (mp.indexOf('dataElementChange') !== -1 || mp.indexOf('data_element_change') !== -1) return true;
    }
    return false;
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
  var deNames = Object.keys(dataElements).sort(function (a, b) {
    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
  });
  var rowsData = [];

  function isComponentDisabled(obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (obj.enabled === false) return true;
    if (obj.disabled === true) return true;
    if (obj.isEnabled === false) return true;
    if (typeof obj.status === 'string' && obj.status.toLowerCase() === 'disabled') return true;
    if (typeof obj.state === 'string' && obj.state.toLowerCase() === 'disabled') return true;
    return false;
  }

  var deToRuleNames = Object.create(null);
  for (var r = 0; r < rulesArray.length; r++) {
    var ruleItem = rulesArray[r];
    var ruleNm = ruleItem.name || ruleItem.id || 'Rule ' + (r + 1);
    var refs;
    if (window.TagScannerDataElementRefs && window.TagScannerDataElementRefs.getDENamesReferencedInRule) {
      refs = window.TagScannerDataElementRefs.getDENamesReferencedInRule(ruleItem, dataElements);
    } else {
      var actionStr0 = JSON.stringify(ruleItem.actions || []);
      var conditionStr0 = JSON.stringify(ruleItem.conditions || []);
      var eventStr0 = JSON.stringify(ruleItem.events || []);
      refs = [];
      for (var di = 0; di < deNames.length; di++) {
        var dk = deNames[di];
        if (
          stringContainsDERef(actionStr0, dk) ||
          stringContainsDERef(conditionStr0, dk) ||
          stringContainsDERef(eventStr0, dk) ||
          eventStr0.indexOf(dk) > -1
        ) {
          refs.push(dk);
        }
      }
    }
    for (var ri = 0; ri < refs.length; ri++) {
      var dn = refs[ri];
      if (!deToRuleNames[dn]) deToRuleNames[dn] = [];
      if (deToRuleNames[dn].indexOf(ruleNm) === -1) deToRuleNames[dn].push(ruleNm);
    }
  }

  for (var idx = 0; idx < deNames.length; idx++) {
    var key = deNames[idx];
    var de = dataElements[key];

    var ruleNames = deToRuleNames[key] ? deToRuleNames[key].slice() : [];

    var extensionNames = [];
    for (var extKey in extensionsObj) {
      if (extensionsObj.hasOwnProperty(extKey)) {
        var extStr = JSON.stringify(extensionsObj[extKey]);
        if (deRefInSerializedJson(extStr, key)) {
          extensionNames.push(extensionsObj[extKey].displayName || extKey);
        }
      }
    }

    var otherDENames = [];
    for (var otherKey in dataElements) {
      if (dataElements.hasOwnProperty(otherKey) && otherKey !== key) {
        var otherStr = JSON.stringify(dataElements[otherKey].settings || dataElements[otherKey]);
        if (deRefInSerializedJson(otherStr, key)) {
          otherDENames.push(otherKey);
        }
      }
    }

    var modulePath = de.modulePath || '';
    var typeLabel = getDataTypeLabel(modulePath);
    var extensionLabel = getExtensionLabel(modulePath);
    var customCodeInfo = getDECustomCodeInfo(de);

    rowsData.push({
      name: key,
      disabled: isComponentDisabled(de),
      typeLabel: typeLabel,
      extensionLabel: extensionLabel,
      rulesCount: ruleNames.length,
      ruleNames: ruleNames,
      baseRuleNames: ruleNames.slice(),
      extensionsCount: extensionNames.length,
      extensionNames: extensionNames,
      baseExtensionNames: extensionNames.slice(),
      dataElementsCount: otherDENames.length,
      dataElementNames: otherDENames,
      baseDataElementNames: otherDENames.slice(),
      deepScanRuleNames: [],
      deepScanExtensionNames: [],
      deepScanDataElementNames: [],
      customCodeInfo: customCodeInfo
    });
  }
  dataElementsExportRows = rowsData;

  function deepScanOnlyInMerged(merged, base) {
    var out = [];
    (merged || []).forEach(function (x) {
      if (base.indexOf(x) === -1) out.push(x);
    });
    return out;
  }

  function updateDEUsageWrap(wrap, total, baseLen, deepList, singular, plural) {
    if (!wrap) return;
    var deepCount = deepList && deepList.length ? deepList.length : 0;
    wrap.classList.remove('de-col-icon-deep-hint');
    if (total > 0 && deepCount > 0) {
      wrap.classList.add('de-col-icon-deep-hint');
      wrap.title =
        total +
        ' ' +
        plural +
        ' — ' +
        baseLen +
        ' from library JSON, ' +
        deepCount +
        ' from deep scan (hosted code)';
    } else {
      wrap.title = total + ' ' + (total === 1 ? singular : plural);
    }
  }

  // Table header with icons (same style as Rules page)
  var thead = document.createElement('thead');
  var headerRow = document.createElement('tr');
  var headers = [
    { text: 'ID #', tooltip: 'Row number', colClass: 'de-col-id' },
    { text: 'Data Element Name', tooltip: 'Name of the data element in your Adobe Tags property' },
    { text: 'Used in Rules', tooltip: 'Number of rules where this data element is used' },
    { text: 'Used in Extensions', tooltip: 'Number of extensions that reference this data element' },
    { text: 'Used in Data Elements', tooltip: 'Number of other data elements that reference this data element' },
    { text: 'Custom Code', tooltip: 'Sort to group data elements with custom code, then click icon to view' }
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
    tr.setAttribute('data-search-text', (row.name + ' ' + (row.extensionLabel || '')).toLowerCase());
    tr._detailData = {
      deName: row.name,
      ruleNames: row.ruleNames,
      extensionNames: row.extensionNames,
      dataElementNames: row.dataElementNames,
      extensionLabel: row.extensionLabel,
      deepScanRuleNames: row.deepScanRuleNames,
      deepScanExtensionNames: row.deepScanExtensionNames,
      deepScanDataElementNames: row.deepScanDataElementNames
    };

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
    nameSpan.title = 'Click to view full composition';
    nameSpan.style.cursor = 'pointer';
    nameSpan.addEventListener('click', (function (r) {
      return function (e) { e.stopPropagation(); showDEModal(r); };
    })(row));
    tdName.appendChild(nameExpandIcon);
    tdName.appendChild(nameSpan);
    if (row.disabled === true) {
      var disabledBadge = document.createElement('span');
      disabledBadge.className = 'component-disabled-badge';
      disabledBadge.textContent = 'Disabled';
      tdName.appendChild(disabledBadge);
      tr.classList.add('component-disabled');
    }
    tdName.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      var expandIcon = tr.querySelector('.expand-icon');
      if (expandIcon) toggleDEExpand(expandIcon, tr._rowIndex);
      return false;
    };
    tr.appendChild(tdName);

    var tdRules = document.createElement('td');
    tdRules.style.textAlign = 'center';
    var rulesWrap = document.createElement('span');
    rulesWrap.className = 'de-col-icon ' + (row.rulesCount > 0 ? 'de-col-icon-has' : 'de-col-icon-empty');
    updateDEUsageWrap(rulesWrap, row.rulesCount, row.baseRuleNames.length, row.deepScanRuleNames, 'rule', 'rules');
    rulesWrap.innerHTML = '<i class="fas fa-wrench"></i> <span class="de-col-icon-count">' + row.rulesCount + '</span>';
    tdRules.appendChild(rulesWrap);
    if (row.rulesCount < 1) tr.classList.add('rule-0'); else tr.classList.add('rule-1');
    tr.appendChild(tdRules);

    var tdExt = document.createElement('td');
    tdExt.style.textAlign = 'center';
    var extWrap = document.createElement('span');
    extWrap.className = 'de-col-icon ' + (row.extensionsCount > 0 ? 'de-col-icon-has' : 'de-col-icon-empty');
    updateDEUsageWrap(extWrap, row.extensionsCount, row.baseExtensionNames.length, row.deepScanExtensionNames, 'extension', 'extensions');
    extWrap.innerHTML = '<i class="fas fa-puzzle-piece"></i> <span class="de-col-icon-count">' + row.extensionsCount + '</span>';
    tdExt.appendChild(extWrap);
    tr.appendChild(tdExt);

    var tdDE = document.createElement('td');
    tdDE.style.textAlign = 'center';
    var deWrap = document.createElement('span');
    deWrap.className = 'de-col-icon ' + (row.dataElementsCount > 0 ? 'de-col-icon-has' : 'de-col-icon-empty');
    updateDEUsageWrap(deWrap, row.dataElementsCount, row.baseDataElementNames.length, row.deepScanDataElementNames, 'data element', 'data elements');
    deWrap.innerHTML = '<i class="fas fa-sitemap"></i> <span class="de-col-icon-count">' + row.dataElementsCount + '</span>';
    tdDE.appendChild(deWrap);
    tr.appendChild(tdDE);

    var tdCode = document.createElement('td');
    tdCode.style.minWidth = '72px';
    tdCode.style.textAlign = 'center';
    var codeInfo = row.customCodeInfo || { kind: 'none', text: '', hasCode: false };
    tdCode.setAttribute('data-sort-value', codeInfo.hasCode ? '1' : '0');
    var sortToken = document.createElement('span');
    sortToken.textContent = codeInfo.hasCode ? 'Yes' : 'No';
    sortToken.style.position = 'absolute';
    sortToken.style.left = '-9999px';
    sortToken.style.width = '1px';
    sortToken.style.height = '1px';
    sortToken.style.overflow = 'hidden';
    tdCode.appendChild(sortToken);
    var codeBtn = document.createElement('button');
    codeBtn.type = 'button';
    codeBtn.className = 'btn';
    codeBtn.style.border = 'none';
    codeBtn.style.background = 'transparent';
    codeBtn.style.padding = '0';
    codeBtn.style.lineHeight = '1';
    codeBtn.style.fontSize = '18px';
    codeBtn.innerHTML = '<i class="fas fa-code"></i>';

    if (!codeInfo.hasCode) {
      codeBtn.disabled = true;
      codeBtn.title = 'No custom code available';
      codeBtn.style.color = '#c4c7cf';
      codeBtn.style.cursor = 'not-allowed';
    } else {
      codeBtn.title = 'View custom code';
      codeBtn.style.color = '#27c5c1';
      codeBtn.style.cursor = 'pointer';
      codeBtn.onclick = function (deName, ci, btnRef, extLabel) {
        return function () {
          if (!ci || !ci.hasCode) return;
          if (ci.kind === 'url') {
            var iconEl = btnRef.querySelector('i');
            btnRef.disabled = true;
            if (iconEl) iconEl.className = 'fas fa-spinner fa-spin';
            fetchHostedCode(ci.text)
              .then(function (txt) {
                showDECodeModal('Custom code: ' + deName, txt, null, extLabel);
              })
              .catch(function (e) {
                showDECodeModal(
                  'Hosted custom code URL: ' + deName,
                  'Failed to fetch hosted script.\nURL: ' + ci.text + '\n\nError: ' + ((e && e.message) || String(e)),
                  null,
                  extLabel
                );
              })
              .then(function () {
                btnRef.disabled = false;
                if (iconEl) iconEl.className = 'fas fa-code';
              });
            return;
          }
          showDECodeModal('Custom code: ' + deName, ci.text, null, extLabel);
        };
      }(row.name, codeInfo, codeBtn, row.extensionLabel);
    }
    tdCode.appendChild(codeBtn);
    tr.appendChild(tdCode);

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
    var currentRow = null;
    for (var qri = 0; qri < mainRows.length; qri++) {
      if (mainRows[qri]._rowIndex === rowIndex) {
        currentRow = mainRows[qri];
        break;
      }
    }
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
    td.colSpan = 6;
    td.style.padding = '12px';
    td.style.backgroundColor = '#f8f9fa';
    td.style.border = '1px solid #ddd';
    td.style.textAlign = 'left';

    var outer = document.createElement('div');
    outer.className = 'expanded-content';
    var columnsWrap = document.createElement('div');
    columnsWrap.className = 'expanded-content-columns';

    function addSection(title, iconClass, items, options) {
      var deepScanItems = options && options.deepScanItems ? options.deepScanItems : [];
      function isDeepScanItem(item) {
        return deepScanItems.indexOf(item) > -1;
      }
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
      if (items.length > 10) {
        ul.style.maxHeight = '264px';
        ul.style.overflowY = 'auto';
        ul.style.border = '1px solid #e3e6f0';
        ul.style.borderRadius = '4px';
        ul.style.paddingRight = '4px';
      }
      if (items.length === 0) {
        var li = document.createElement('li');
        li.appendChild(document.createElement('i')).className = 'item-icon fas fa-chevron-right';
        li.appendChild(document.createTextNode('None'));
        ul.appendChild(li);
      } else {
        items.forEach(function (item) {
          var li = document.createElement('li');
          if (isDeepScanItem(item)) li.classList.add('de-detail-item-deep-scan');
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
      columnsWrap.appendChild(section);
    }

    var deName = data.deName || '';
    var deepR = data.deepScanRuleNames && data.deepScanRuleNames.length;
    var deepE = data.deepScanExtensionNames && data.deepScanExtensionNames.length;
    var deepD = data.deepScanDataElementNames && data.deepScanDataElementNames.length;
    if (deepR || deepE || deepD) {
      var leg = document.createElement('p');
      leg.className = 'de-deep-scan-legend';
      leg.innerHTML =
        '<span class="de-legend-swatch de-legend-swatch-deep" aria-hidden="true"></span><strong>Orange highlight</strong>: seen only in fetched hosted files (deep scan). ' +
        '<span class="de-legend-swatch de-legend-swatch-lib" aria-hidden="true"></span>Other rows: from library JSON only.';
      outer.appendChild(leg);
    }
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
      columnsWrap.appendChild(extSection);
    }
    addSection('Rules (' + data.ruleNames.length + ')', 'fa-gavel', data.ruleNames, {
      onRuleClick: function (ruleName) { openRuleUsageModal(ruleName, deName); },
      deepScanItems: data.deepScanRuleNames || []
    });
    addSection('Extensions (' + data.extensionNames.length + ')', 'fa-puzzle-piece', data.extensionNames, {
      deepScanItems: data.deepScanExtensionNames || []
    });
    addSection('Data Elements (' + data.dataElementNames.length + ')', 'fa-database', data.dataElementNames, {
      onDEClick: function (otherDEName) { openDEUsageModal(otherDEName, deName); },
      deepScanItems: data.deepScanDataElementNames || []
    });

    outer.appendChild(columnsWrap);
    td.appendChild(outer);
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

  function collectHttpsSourcesFromRule(rule) {
    var out = [];
    if (!rule) return out;
    function pushPart(partLabel, arr, labelFn) {
      if (!Array.isArray(arr)) return;
      for (var hi = 0; hi < arr.length; hi++) {
        var comp = arr[hi];
        var src = comp && comp.settings && typeof comp.settings.source === 'string' ? comp.settings.source.trim() : '';
        if (/^https:\/\//i.test(src)) {
          out.push({
            part: partLabel,
            componentLabel: labelFn(comp),
            url: src
          });
        }
      }
    }
    pushPart('Event', rule.events, eventLabel);
    pushPart('Condition', rule.conditions, conditionLabel);
    pushPart('Action', rule.actions, actionLabel);
    return out;
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

    var usedEvents = events.filter(function (ev) { return componentReferencesDEInRule(ev, deName); });
    var usedConditions = conditions.filter(function (c) { return componentReferencesDEInRule(c, deName); });
    var usedActions = actions.filter(function (a) { return componentReferencesDEInRule(a, deName); });

    document.getElementById('ruleUsageModalTitle').textContent = 'Data element "' + deName + '" used in rule "' + (rule.name || ruleName) + '"';
    var body = document.getElementById('ruleUsageModalBody');
    body.innerHTML = '';

    var hostedSources = collectHttpsSourcesFromRule(rule);
    var noJsonUsage =
      usedEvents.length === 0 && usedConditions.length === 0 && usedActions.length === 0;
    if (noJsonUsage) {
      var warn = document.createElement('div');
      warn.className = 'alert alert-warning small';
      warn.style.marginBottom = '14px';
      warn.innerHTML =
        '<strong>No match in rule JSON.</strong> This data element was not found in this rule\u2019s events, conditions, or actions ' +
        'as stored in the library (including inline custom code fields). ' +
        'If you ran a <strong>deep scan</strong>, the reference may exist only inside a <strong>hosted</strong> bundle URL below.';
      body.appendChild(warn);
      if (hostedSources.length > 0) {
        var hsSection = document.createElement('div');
        hsSection.className = 'usage-section';
        var hsH = document.createElement('h4');
        hsH.innerHTML = '<i class="fas fa-cloud-download-alt"></i> Hosted code URLs on this rule';
        hsSection.appendChild(hsH);
        var hsP = document.createElement('p');
        hsP.className = 'small text-muted';
        hsP.style.marginBottom = '10px';
        hsP.textContent =
          'These components load JavaScript from the network. TagScanner searches those files during a deep scan; open a link to inspect the bundle in the browser.';
        hsSection.appendChild(hsP);
        var hsUl = document.createElement('ul');
        hsUl.className = 'expanded-detail-list';
        hsUl.style.marginBottom = '0';
        for (var hsi = 0; hsi < hostedSources.length; hsi++) {
          var hs = hostedSources[hsi];
          var hLi = document.createElement('li');
          hLi.style.flexDirection = 'column';
          hLi.style.alignItems = 'flex-start';
          var line1 = document.createElement('div');
          line1.style.fontWeight = '600';
          line1.style.fontSize = '13px';
          line1.textContent = hs.part + ': ' + hs.componentLabel;
          hLi.appendChild(line1);
          var link = document.createElement('a');
          link.href = hs.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = hs.url.length > 120 ? hs.url.slice(0, 117) + '\u2026' : hs.url;
          link.title = hs.url;
          link.style.fontSize = '12px';
          link.style.wordBreak = 'break-all';
          link.style.marginTop = '4px';
          hLi.appendChild(link);
          hsUl.appendChild(hLi);
        }
        hsSection.appendChild(hsUl);
        body.appendChild(hsSection);
      } else {
        var noUrl = document.createElement('p');
        noUrl.className = 'small text-muted';
        noUrl.textContent =
          'This rule has no HTTPS hosted bundle URLs in its configuration JSON, so there is nothing further to show here.';
        body.appendChild(noUrl);
      }
    }

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

    if (!noJsonUsage) {
      addSectionToModal('Events', 'fa-bolt', usedEvents, eventLabel, getEventSummary, function (ev) {
        return ev.settings ? JSON.stringify(ev.settings, null, 2) : null;
      });
      addSectionToModal('Conditions', 'fa-filter', usedConditions, conditionLabel, null, function (c) {
        return c.settings ? JSON.stringify(c.settings, null, 2) : null;
      });
      addSectionToModal('Actions', 'fa-cogs', usedActions, actionLabel, null, function (a) {
        return a.settings ? JSON.stringify(a.settings, null, 2) : null;
      });
    } else {
      var jsonSummary = document.createElement('p');
      jsonSummary.className = 'small text-muted';
      jsonSummary.style.marginTop = hostedSources.length ? '12px' : '0';
      jsonSummary.textContent =
        'Events, conditions, and actions in this rule\u2019s library JSON do not reference this data element.';
      body.appendChild(jsonSummary);
    }

    document.getElementById('ruleUsageModal').classList.add('show');
  }

  function showDECodeModal(title, code, deNameForHighlight, extension) {
    var _deExtension = extension || '';
    var modal = document.getElementById('deCodeModal');
    var titleEl = document.getElementById('deCodeModalTitle');
    var contentEl = document.getElementById('deCodeModalContent');
    var copyBtn = document.getElementById('deCodeModalCopyBtn');
    if (modal && titleEl && contentEl) {
      titleEl.textContent = title;
      var rawCode = code != null ? String(code) : '';

      function setCodeContent(src) {
        if (deNameForHighlight) {
          contentEl.innerHTML = highlightDEInCode(src, deNameForHighlight);
        } else {
          contentEl.textContent = src;
        }
      }

      setCodeContent(rawCode);

      // Format with Prettier if available; update display and copy target on success
      if (rawCode && typeof prettier !== 'undefined' && typeof prettierPlugins !== 'undefined') {
        prettier.format(rawCode, {
          parser: 'babel',
          plugins: [prettierPlugins.babel, prettierPlugins.estree],
          printWidth: 80,
          tabWidth: 2,
          singleQuote: true,
          semi: true,
        }).then(function (formatted) {
          setCodeContent(formatted);
          if (copyBtn) copyBtn._currentCode = formatted;
        }).catch(function () { /* not valid JS — keep raw */ });
      }

      var modalBody = contentEl.parentElement;
      var explainBox = document.getElementById('deCodeModalExplainBox');
      if (!explainBox && modalBody) {
        explainBox = document.createElement('div');
        explainBox.id = 'deCodeModalExplainBox';
        explainBox.className = 'de-explain-panel';
        explainBox.style.marginTop = '12px';
        explainBox.style.display = 'none';
        modalBody.appendChild(explainBox);
      }

      var footer = copyBtn && copyBtn.parentElement ? copyBtn.parentElement : null;
      var explainBtn = document.getElementById('deCodeModalExplainBtn');
      if (!explainBtn && footer) {
        explainBtn = document.createElement('button');
        explainBtn.type = 'button';
        explainBtn.id = 'deCodeModalExplainBtn';
        explainBtn.className = 'btn btn-sm btn-secondary mr-2';
        explainBtn.innerHTML = '<i class="fas fa-lightbulb"></i> Explain';
        footer.insertBefore(explainBtn, copyBtn);
      }

      if (explainBtn) {
        explainBtn.onclick = async function () {
          if (!explainBox) return;
          if (window.TagScannerAuth && window.TagScannerAuth.requireExplainConsent) {
            var consented = await window.TagScannerAuth.requireExplainConsent();
            if (!consented) return;
          }
          explainBtn.disabled = true;
          var originalHtml = explainBtn.innerHTML;
          explainBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Explaining...';
          try {
            var session = window.TagScannerAuth && window.TagScannerAuth.getSession();
            if (window.TagScannerBedrock && window.TagScannerBedrock.explainCode) {
              if (!session) {
                explainBox.innerHTML = window.TagScannerAuth.renderSignInBox(
                  'Sign in to use AI Explain',
                  'AI-powered code explanation requires a Google account.'
                );
                explainBox.style.display = 'block';
                window.TagScannerAuth.attachSignInBox(explainBox, function () {
                  explainBox.innerHTML = '';
                  explainBox.style.display = 'none';
                  explainBtn.click();
                });
                return;
              }
              try {
                var dePropKey = (sessionStorage.getItem('launch_property_name') || '') + '#' +
                                (sessionStorage.getItem('launch_property_environment') || 'Production');
                var brResult = await window.TagScannerBedrock.explainCode(
                  rawCode, { name: title || '', type: 'dataElement', extension: _deExtension || '' },
                  { email: session.email, sessionToken: session.sessionToken, propertyKey: dePropKey }
                );
                explainBox.innerHTML = window.TagScannerBedrock.renderBedrockCodeExplanation(brResult.explanation);
                if (brResult.cached && brResult.cached_by) {
                  var deCachedAt = brResult.cached_at ? new Date(brResult.cached_at).toLocaleString() : '';
                  var deByStr    = brResult.cached_by.name || brResult.cached_by.email || 'unknown';
                  var deNotice   = document.createElement('div');
                  deNotice.style.cssText = 'display:flex;align-items:flex-start;gap:8px;background:#eff6ff;border:1px solid #bfdbfe;border-left:4px solid #3b82f6;border-radius:6px;padding:9px 12px;margin-bottom:12px;font-size:12px;color:#1e40af';
                  deNotice.innerHTML = '<i class="fas fa-info-circle" style="font-size:13px;margin-top:1px;flex-shrink:0"></i><div><strong style="display:block;margin-bottom:2px">Cached Explanation</strong><span style="color:#374151">Generated on ' + deCachedAt + ' by ' + deByStr + '. Same code — no new AI call needed.</span></div>';
                  explainBox.insertBefore(deNotice, explainBox.firstChild);
                }
                var deModelNote = document.createElement('div');
                deModelNote.style.cssText = 'margin-top:14px;padding-top:8px;border-top:1px solid #f3f4f6;font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:5px';
                deModelNote.innerHTML = '<i class="fas fa-microchip" style="font-size:10px;color:#c4b5fd"></i>Generated by <strong style="color:#6b7280;margin-left:3px">' + (brResult.model || 'Claude 3.5 Haiku') + '</strong>';
                explainBox.appendChild(deModelNote);
                if (brResult.queryId) {
                  var deFbWrap = document.createElement('div');
                  deFbWrap.className = 'de-explain-feedback';
                  deFbWrap.innerHTML =
                    '<span class="de-explain-feedback-label">Helpful?</span>' +
                    '<button class="de-fb-btn" data-rating="positive" title="Yes, helpful"><i class="fas fa-thumbs-up"></i></button>' +
                    '<button class="de-fb-btn" data-rating="negative" title="Not helpful"><i class="fas fa-thumbs-down"></i></button>';
                  explainBox.appendChild(deFbWrap);
                  deFbWrap.querySelectorAll('.de-fb-btn').forEach(function (fbBtn) {
                    fbBtn.addEventListener('click', function () {
                      var auth = window.TagScannerAuth;
                      var sess = auth ? auth.getSession() : null;
                      if (!sess) return;
                      var allBtns = deFbWrap.querySelectorAll('.de-fb-btn');
                      allBtns.forEach(function (b) { b.disabled = true; });
                      var r = fbBtn.getAttribute('data-rating');
                      allBtns.forEach(function (b) {
                        b.classList.toggle('voted-positive', b.getAttribute('data-rating') === 'positive' && r === 'positive');
                        b.classList.toggle('voted-negative', b.getAttribute('data-rating') === 'negative' && r === 'negative');
                      });
                      window.TagScannerBedrock.submitFeedback(brResult.queryId, r, { sessionToken: sess.sessionToken })
                        .catch(function () {
                          allBtns.forEach(function (b) { b.disabled = false; b.className = 'de-fb-btn'; });
                        });
                    });
                  });
                }
                explainBox.style.display = 'block';
                return;
              } catch(bedrockErr) {
                console.warn('Bedrock explain failed, falling back to static analysis:', bedrockErr);
                explainBox.innerHTML = '<div style="padding:8px;color:#ef4444;font-size:12px"><i class="fas fa-exclamation-circle" style="margin-right:5px"></i>' + (bedrockErr.message || 'AI explain failed') + '</div>';
                explainBox.style.display = 'block';
                return;
              }
            }
            // Fallback: Ollama / backend / static analysis
            var aiExplanation = null;
            if (typeof getAIExplanationOrNull === 'function') {
              aiExplanation = await getAIExplanationOrNull(rawCode, { title: title || '' });
            } else if (typeof explainCustomCodeWithAI === 'function') {
              var fallbackAI = await explainCustomCodeWithAI(rawCode, { title: title || '' });
              if (fallbackAI && fallbackAI.indexOf('AI explanation is unavailable') === -1) {
                aiExplanation = { text: fallbackAI, model: null };
              }
            }
            if (aiExplanation) {
              explainBox.innerHTML = '<pre class="code-block" style="margin:0;background:transparent;border:none;padding:0">' +
                aiExplanation.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
              if (aiExplanation.model) {
                var deAiModelNote = document.createElement('div');
                deAiModelNote.style.cssText = 'margin-top:14px;padding-top:8px;border-top:1px solid #f3f4f6;font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:5px';
                deAiModelNote.innerHTML = '<i class="fas fa-microchip" style="font-size:10px;color:#c4b5fd"></i>Generated by <strong style="color:#6b7280;margin-left:3px">' + aiExplanation.model + '</strong>';
                explainBox.appendChild(deAiModelNote);
              }
            } else {
              explainBox.innerHTML = analyzeCodeWithoutAI(rawCode);
            }
            explainBox.style.display = 'block';
          } finally {
            explainBtn.disabled = false;
            explainBtn.innerHTML = originalHtml;
          }
        };
      }
      if (explainBox) {
        explainBox.style.display = 'none';
        explainBox.innerHTML = '';
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

    document.getElementById('deUsageModalTitle').textContent = 'Referenced by: ' + otherDEName;
    var body = document.getElementById('deUsageModalBody');
    body.innerHTML = '';

    var typeLabel = getDataTypeLabel(otherDE.modulePath || '');
    var extensionLabel = getExtensionLabel(otherDE.modulePath || '');
    var settingsJson = otherDE.settings ? JSON.stringify(otherDE.settings, null, 2) : '{}';

    // Compact info row: type/extension badges + actions
    var card = document.createElement('div');
    card.className = 'de-ref-card';

    var meta = document.createElement('div');
    meta.className = 'de-ref-meta';
    meta.innerHTML =
      '<span class="de-ref-badge de-ref-badge-type">' + escapeHtml(typeLabel) + '</span>' +
      '<span class="de-ref-badge de-ref-badge-ext">' + escapeHtml(extensionLabel) + '</span>';
    card.appendChild(meta);

    var actions = document.createElement('div');
    actions.className = 'de-ref-actions';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-view';
    btn.innerHTML = '<i class="fas fa-code" style="margin-right:5px"></i>View Settings';
    btn.onclick = function () { showDECodeModal('Settings: ' + otherDEName, settingsJson, currentDeName); };
    actions.appendChild(btn);

    card.appendChild(actions);
    body.appendChild(card);

    document.getElementById('deUsageModal').classList.add('show');
  }

  // Pagination
  const rowsPerPage = 15;
  let currentPage = parseInt(sessionStorage.getItem('dataElementsCurrentPage')) || 1;
  let totalPages = Math.ceil(rowsData.length / rowsPerPage);

  function rowMatchesDeTableFilter(row, filterId) {
    if (!filterId || filterId === 'all') return true;
    var baseUnused =
      row.baseRuleNames.length === 0 &&
      row.baseExtensionNames.length === 0 &&
      row.baseDataElementNames.length === 0;
    var mergedUnused =
      row.rulesCount === 0 && row.extensionsCount === 0 && row.dataElementsCount === 0;
    var dr = (row.deepScanRuleNames && row.deepScanRuleNames.length) || 0;
    var de = (row.deepScanExtensionNames && row.deepScanExtensionNames.length) || 0;
    var dd = (row.deepScanDataElementNames && row.deepScanDataElementNames.length) || 0;
    var hasDeep = dr + de + dd > 0;
    if (filterId === 'unused-library') return baseUnused;
    if (filterId === 'unused-merged') return mergedUnused;
    if (filterId === 'deep-scan') return hasDeep;
    return true;
  }

  function syncDeTableFilterClasses() {
    var filterInputs = document.querySelectorAll('input[name="deTableFilter"]');
    var filterId = 'all';
    for (var fi = 0; fi < filterInputs.length; fi++) {
      if (filterInputs[fi].checked) {
        filterId = filterInputs[fi].value;
        break;
      }
    }
    var mainRows = Array.from(tbody.querySelectorAll('tr.data-displayed'));
    for (var mi = 0; mi < mainRows.length; mi++) {
      var tr = mainRows[mi];
      var ix = tr._rowIndex;
      if (ix === undefined) continue;
      var show = rowMatchesDeTableFilter(rowsData[ix], filterId);
      if (show) tr.classList.remove('de-filter-hidden');
      else tr.classList.add('de-filter-hidden');
    }
  }

  function applyDeTableFilter(options) {
    options = options || {};
    var resetPage = options.resetPage !== false;
    var filterInputs = document.querySelectorAll('input[name="deTableFilter"]');
    var filterId = 'all';
    for (var fi = 0; fi < filterInputs.length; fi++) {
      if (filterInputs[fi].checked) {
        filterId = filterInputs[fi].value;
        break;
      }
    }
    try {
      sessionStorage.setItem('dataElementsTableFilter', filterId);
    } catch (eStore) {}
    syncDeTableFilterClasses();
    if (resetPage) currentPage = 1;
    var mainRows = Array.from(tbody.querySelectorAll('tr.data-displayed'));
    var visibleMain = mainRows.filter(function (r) {
      return !r.classList.contains('search-hidden') && !r.classList.contains('de-filter-hidden');
    });
    var maxPage = Math.max(1, Math.ceil(visibleMain.length / rowsPerPage));
    if (currentPage > maxPage) currentPage = maxPage;
    showPage(currentPage);
  }

  function updatePageInfo() {
    var mainRows = Array.from(tbody.querySelectorAll('tr.data-displayed'));
    var visibleMain = mainRows.filter(function (r) {
      return !r.classList.contains('search-hidden') && !r.classList.contains('de-filter-hidden');
    });
    totalPages = Math.max(1, Math.ceil(visibleMain.length / rowsPerPage));
    document.getElementById('currentPage').textContent = currentPage;
    document.getElementById('totalPages').textContent = totalPages;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage >= totalPages;
    sessionStorage.setItem('dataElementsCurrentPage', currentPage);

    var countEl = document.getElementById('deCountInfo');
    if (countEl) {
      var visibleCount = visibleMain.length;
      var start = (currentPage - 1) * rowsPerPage;
      var end = Math.min(start + rowsPerPage, visibleCount);
      if (visibleCount === 0) {
        countEl.textContent = 'No data elements match.';
      } else {
        countEl.textContent = 'Showing ' + (start + 1) + '–' + end + ' of ' + visibleCount + ' data element' + (visibleCount !== 1 ? 's' : '');
      }
    }
  }

  function showPage(page) {
    var allRows = Array.from(tbody.querySelectorAll('tr'));
    var mainRows = allRows.filter(function (r) { return r.classList.contains('data-displayed'); });
    var expandableRows = allRows.filter(function (r) { return r.classList.contains('expandable-row'); });
    var visibleMain = mainRows.filter(function (r) {
      return !r.classList.contains('search-hidden') && !r.classList.contains('de-filter-hidden');
    });

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

  function mergeUniqueDELists(base, extra) {
    var out = base.slice();
    (extra || []).forEach(function (x) {
      if (out.indexOf(x) === -1) out.push(x);
    });
    return out;
  }

  function deepScanExtDisplayLabel(extKey) {
    var ex = extensionsObj[extKey];
    return ex && ex.displayName ? ex.displayName : extKey;
  }

  var deepScanApplied = false;

  function refreshDEUsageCellsFromRowsData() {
    var mainRows = Array.from(tbody.querySelectorAll('tr.data-displayed'));
    for (var ri = 0; ri < mainRows.length; ri++) {
      var tr = mainRows[ri];
      var ix = tr._rowIndex;
      if (ix === undefined) continue;
      var row = rowsData[ix];
      tr._detailData = {
        deName: row.name,
        ruleNames: row.ruleNames,
        extensionNames: row.extensionNames,
        dataElementNames: row.dataElementNames,
        extensionLabel: row.extensionLabel,
        deepScanRuleNames: row.deepScanRuleNames,
        deepScanExtensionNames: row.deepScanExtensionNames,
        deepScanDataElementNames: row.deepScanDataElementNames
      };
      var nextRow = tr.nextElementSibling;
      if (nextRow && nextRow.classList.contains('expandable-row')) {
        nextRow.remove();
        var expIcon = tr.querySelector('.expand-icon');
        if (expIcon) expIcon.classList.remove('expanded');
      }
      var cntRules = row.rulesCount;
      var tdRules = tr.cells[3];
      if (tdRules) {
        var rulesWrap = tdRules.querySelector('.de-col-icon');
        if (rulesWrap) {
          rulesWrap.className = 'de-col-icon ' + (cntRules > 0 ? 'de-col-icon-has' : 'de-col-icon-empty');
          updateDEUsageWrap(rulesWrap, cntRules, row.baseRuleNames.length, row.deepScanRuleNames, 'rule', 'rules');
          var spR = rulesWrap.querySelector('.de-col-icon-count');
          if (spR) spR.textContent = String(cntRules);
        }
      }
      tr.classList.remove('rule-0', 'rule-1');
      tr.classList.add(cntRules < 1 ? 'rule-0' : 'rule-1');

      var cntExt = row.extensionsCount;
      var tdExt = tr.cells[4];
      if (tdExt) {
        var extWrap = tdExt.querySelector('.de-col-icon');
        if (extWrap) {
          extWrap.className = 'de-col-icon ' + (cntExt > 0 ? 'de-col-icon-has' : 'de-col-icon-empty');
          updateDEUsageWrap(extWrap, cntExt, row.baseExtensionNames.length, row.deepScanExtensionNames, 'extension', 'extensions');
          var spE = extWrap.querySelector('.de-col-icon-count');
          if (spE) spE.textContent = String(cntExt);
        }
      }

      var cntDe = row.dataElementsCount;
      var tdDe = tr.cells[5];
      if (tdDe) {
        var deWrap = tdDe.querySelector('.de-col-icon');
        if (deWrap) {
          deWrap.className = 'de-col-icon ' + (cntDe > 0 ? 'de-col-icon-has' : 'de-col-icon-empty');
          updateDEUsageWrap(deWrap, cntDe, row.baseDataElementNames.length, row.deepScanDataElementNames, 'data element', 'data elements');
          var spD = deWrap.querySelector('.de-col-icon-count');
          if (spD) spD.textContent = String(cntDe);
        }
      }
    }
    dataElementsExportRows = rowsData;
    syncDeTableFilterClasses();
    var mainRowsAfter = Array.from(tbody.querySelectorAll('tr.data-displayed'));
    var visibleAfter = mainRowsAfter.filter(function (r) {
      return !r.classList.contains('search-hidden') && !r.classList.contains('de-filter-hidden');
    });
    var maxPg = Math.max(1, Math.ceil(visibleAfter.length / rowsPerPage));
    if (currentPage > maxPg) currentPage = maxPg;
    updatePageInfo();
    showPage(currentPage);
  }

  function applyDeepScanMerge(result) {
    for (var wi = 0; wi < rowsData.length; wi++) {
      var row = rowsData[wi];
      var k = row.name;
      var extraRules = result.hostedDeToRuleNames[k] || [];
      var extraDE = result.hostedDErefsFromDE[k] || [];
      var extraExtKeys = result.hostedDErefsFromExt[k] || [];
      var extraExtLabels = extraExtKeys.map(deepScanExtDisplayLabel);
      row.ruleNames = mergeUniqueDELists(row.baseRuleNames, extraRules);
      row.dataElementNames = mergeUniqueDELists(row.baseDataElementNames, extraDE);
      row.extensionNames = mergeUniqueDELists(row.baseExtensionNames, extraExtLabels);
      row.rulesCount = row.ruleNames.length;
      row.dataElementsCount = row.dataElementNames.length;
      row.extensionsCount = row.extensionNames.length;
      row.deepScanRuleNames = deepScanOnlyInMerged(row.ruleNames, row.baseRuleNames);
      row.deepScanExtensionNames = deepScanOnlyInMerged(row.extensionNames, row.baseExtensionNames);
      row.deepScanDataElementNames = deepScanOnlyInMerged(row.dataElementNames, row.baseDataElementNames);
    }
    deepScanApplied = true;
    refreshDEUsageCellsFromRowsData();
    if (typeof $ !== 'undefined' && $('#dataelement_details').length) {
      try {
        $('#dataelement_details').trigger('update');
      } catch (eDeep) {}
    }
  }

  function resetDeepScanMerge() {
    for (var wi = 0; wi < rowsData.length; wi++) {
      var row = rowsData[wi];
      row.ruleNames = row.baseRuleNames.slice();
      row.dataElementNames = row.baseDataElementNames.slice();
      row.extensionNames = row.baseExtensionNames.slice();
      row.rulesCount = row.ruleNames.length;
      row.dataElementsCount = row.dataElementNames.length;
      row.extensionsCount = row.extensionNames.length;
      row.deepScanRuleNames = [];
      row.deepScanExtensionNames = [];
      row.deepScanDataElementNames = [];
    }
    deepScanApplied = false;
    refreshDEUsageCellsFromRowsData();
  }

  var deepScanRunBtn = document.getElementById('deDeepScanRunBtn');
  var deepScanResetBtn = document.getElementById('deDeepScanResetBtn');
  var deepScanStatus = document.getElementById('deDeepScanStatus');
  var deepScanErrorsEl = document.getElementById('deDeepScanErrors');
  if (deepScanRunBtn && window.TagScannerDeepScanHosted) {
    deepScanRunBtn.addEventListener('click', function () {
      var jobsPreview = window.TagScannerDeepScanHosted.harvestJobs(
        rulesArray,
        dataElements,
        extensionsObj
      );
      var urlCount = Object.keys(jobsPreview).length;
      if (urlCount === 0) {
        if (deepScanStatus) {
          deepScanStatus.textContent =
            'No HTTPS bundle URLs were found in rules, data elements, or extension configuration for this library.';
        }
        if (deepScanErrorsEl) {
          deepScanErrorsEl.style.display = 'none';
          deepScanErrorsEl.textContent = '';
        }
        return;
      }
      deepScanRunBtn.disabled = true;
      if (deepScanResetBtn) deepScanResetBtn.disabled = true;
      if (deepScanErrorsEl) {
        deepScanErrorsEl.style.display = 'none';
        deepScanErrorsEl.textContent = '';
      }
      if (deepScanStatus) {
        deepScanStatus.textContent = 'Starting deep scan (' + urlCount + ' unique URL' + (urlCount === 1 ? '' : 's') + ')…';
      }
      window.TagScannerDeepScanHosted
        .run({
          rulesArray: rulesArray,
          dataElements: dataElements,
          extensionsObj: extensionsObj,
          onProgress: function (ev) {
            if (!deepScanStatus || ev.phase !== 'fetch') return;
            deepScanStatus.textContent =
              'Fetching bundle ' + ev.index + ' of ' + ev.total + '…';
          }
        })
        .then(function (result) {
          applyDeepScanMerge(result);
          if (deepScanResetBtn) deepScanResetBtn.disabled = false;
          var st = result.stats || {};
          var errN = (result.errors && result.errors.length) || 0;
          var msg =
            'Deep scan finished. Fetched ' +
            st.fetchedOk +
            ' of ' +
            st.urlsTotal +
            ' URL(s)';
          if (errN) msg += ' (' + errN + ' failed)';
          msg += '. Table counts now include matches inside those files (where found).';
          if (deepScanStatus) deepScanStatus.textContent = msg;
          if (deepScanErrorsEl && result.errors && result.errors.length) {
            deepScanErrorsEl.style.display = 'block';
            deepScanErrorsEl.textContent = result.errors
              .map(function (er) {
                return er.url + '\n  ' + er.message;
              })
              .join('\n\n');
          }
        })
        .catch(function (e) {
          if (deepScanStatus) {
            deepScanStatus.textContent =
              'Deep scan failed: ' + ((e && e.message) || String(e));
          }
        })
        .then(function () {
          deepScanRunBtn.disabled = false;
          if (deepScanResetBtn) deepScanResetBtn.disabled = !deepScanApplied;
        });
    });
  }
  if (deepScanResetBtn) {
    deepScanResetBtn.addEventListener('click', function () {
      resetDeepScanMerge();
      if (deepScanStatus) {
        deepScanStatus.textContent = 'Restored library-only counts (hosted bundles not included).';
      }
      if (deepScanErrorsEl) {
        deepScanErrorsEl.style.display = 'none';
        deepScanErrorsEl.textContent = '';
      }
      deepScanResetBtn.disabled = true;
    });
  }

  document.getElementById('prevPage').addEventListener('click', function () {
    if (currentPage > 1) { currentPage--; showPage(currentPage); }
  });
  document.getElementById('nextPage').addEventListener('click', function () {
    if (currentPage < totalPages) { currentPage++; showPage(currentPage); }
  });

  var savedTableFilter = null;
  try {
    savedTableFilter = sessionStorage.getItem('dataElementsTableFilter');
  } catch (eFilt) {}
  if (savedTableFilter) {
    var radsRestore = document.querySelectorAll('input[name="deTableFilter"]');
    for (var rir = 0; rir < radsRestore.length; rir++) {
      if (radsRestore[rir].value === savedTableFilter) {
        radsRestore[rir].checked = true;
        break;
      }
    }
  }
  syncDeTableFilterClasses();
  var mainRowsInit = Array.from(tbody.querySelectorAll('tr.data-displayed'));
  var visibleInit = mainRowsInit.filter(function (r) {
    return !r.classList.contains('search-hidden') && !r.classList.contains('de-filter-hidden');
  });
  var maxPgInit = Math.max(1, Math.ceil(visibleInit.length / rowsPerPage));
  if (currentPage > maxPgInit) currentPage = maxPgInit;
  showPage(currentPage);

  var filterRadios = document.querySelectorAll('input[name="deTableFilter"]');
  for (var fr = 0; fr < filterRadios.length; fr++) {
    filterRadios[fr].addEventListener('change', function () {
      applyDeTableFilter({ resetPage: true });
    });
  }

  // Search — debounced, multi-field (DE name + extension label)
  function _debounceDe(fn, ms) {
    var t; return function () { clearTimeout(t); var a = arguments, c = this; t = setTimeout(function () { fn.apply(c, a); }, ms); };
  }
  var allDeRows = Array.from(tbody.querySelectorAll('tr.data-displayed'));
  var searchInput = document.getElementById('dataElementSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', _debounceDe(function () {
      var term = this.value.toLowerCase().trim();
      allDeRows.forEach(function (row) {
        var haystack = row.getAttribute('data-search-text') || '';
        if (!term || haystack.indexOf(term) > -1) row.classList.remove('search-hidden');
        else row.classList.add('search-hidden');
      });
      currentPage = 1;
      showPage(1);
    }, 220));
  }
  } // if (dataElements)
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
    var rows = dataElementsExportRows;
    if (!rows || rows.length === 0) {
      alert('No data elements to export. Load a property first.');
      return;
    }
    var _tsA = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
    if (_tsA) _tsA.track('Export:CSV:Data Elements', { pageName: 'TagScanner:Data Elements', events: 'event4', v5: 'CSV', c2: 'Export' });
    function toCsvCell(val) {
      return '"' + String(val == null ? '' : val).replace(/"/g, '""') + '"';
    }
    var deRaw = {};
    try {
      var rawStr = sessionStorage.getItem('_satellite._container.dataElements');
      if (rawStr) deRaw = JSON.parse(rawStr) || {};
    } catch (e) {}
    var headers = ['#', 'Data Element Name', 'Type', 'Extension', 'Module Path', 'Storage Duration', 'Default Value', 'Clean Text', 'Force Lowercase', 'Settings JSON', 'Custom Code', 'Used in Rules', 'Used in Extensions', 'Used in Data Elements'];
    var csvLines = [headers.map(toCsvCell).join(',')].concat(
      rows.map(function (r, i) {
        var raw = deRaw[r.name] || {};
        var s = raw.settings || {};
        var mp = raw.modulePath || '';
        var extName = mp ? mp.split('/')[0] : (r.extensionLabel || '');
        var storageDuration = s.storeDuration || s.storageDuration || s.storage_duration || '';
        var defaultValue = (s.defaultValue !== undefined) ? s.defaultValue : '';
        var cleanText = (s.cleanText !== undefined) ? (s.cleanText ? 'true' : 'false') : '';
        var forceLower = (s.forceLowerCase !== undefined) ? (s.forceLowerCase ? 'true' : 'false') : '';
        var settingsJson = '';
        try {
          var scopy = Object.assign({}, s);
          if (typeof scopy.source === 'function') scopy.source = '[function]';
          if (typeof scopy.source === 'string' && scopy.source.length > 500) scopy.source = scopy.source.slice(0, 500) + '\u2026[truncated]';
          var sj = JSON.stringify(scopy);
          settingsJson = sj.length > 2000 ? sj.slice(0, 2000) + '\u2026[truncated]' : sj;
        } catch (e) {}
        var info = r.customCodeInfo || { kind: 'none', text: '' };
        var codeExport = info.kind === 'url' ? 'Hosted URL: ' + info.text : (info.text || '');
        var ruleNames = (r.ruleNames || []).join('; ');
        var extNames = (r.extensionNames || []).join('; ');
        var deNames = (r.dataElementNames || []).join('; ');
        return [i + 1, r.name, r.typeLabel, extName, mp, storageDuration, defaultValue, cleanText, forceLower, settingsJson, codeExport, ruleNames, extNames, deNames].map(toCsvCell).join(',');
      })
    );
    var dePropName = sessionStorage.getItem('launch_property_name') || '';
    var brandingPrefix = [
      '"Exported by TagScanner v2.5.6 \u2014 Adobe Tags (Launch) Inspector"',
      '"Property: ' + dePropName.replace(/"/g, '""') + ' | Generated: ' + new Date().toLocaleString() + '"',
      '"tagscannerfeedback@gmail.com \u2014 Provided as-is. No affiliation with Adobe."',
      '',
    ].join('\r\n');
    var csvContent = '\uFEFF' + brandingPrefix + '\r\n' + csvLines.join('\r\n');
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.download = 'dataelements_export.csv';
    a.href = window.URL.createObjectURL(blob);
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

// ── Component Detail Modal ─────────────────────────────────────────────────
function initCompModal() {
  if (document.getElementById('comp-detail-modal')) return document.getElementById('comp-detail-modal');
  var overlay = document.createElement('div');
  overlay.id = 'comp-detail-modal';
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;align-items:center;justify-content:center;';
  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:10px;max-width:860px;width:93%;max-height:84vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.35);';
  var hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:14px 20px;background:#4e73df;border-radius:10px 10px 0 0;flex-shrink:0;gap:10px;';
  var tag = document.createElement('span');
  tag.id = 'cdm-type-tag';
  tag.style.cssText = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;background:rgba(255,255,255,0.22);color:white;padding:2px 9px;border-radius:10px;white-space:nowrap;';
  var titleText = document.createElement('span');
  titleText.id = 'cdm-title';
  titleText.style.cssText = 'color:white;font-size:15px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  var closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'background:none;border:none;color:white;font-size:26px;cursor:pointer;line-height:1;padding:0;opacity:0.8;flex-shrink:0;';
  closeBtn.textContent = '×';
  closeBtn.onclick = function () { overlay.style.display = 'none'; };
  hdr.appendChild(tag); hdr.appendChild(titleText); hdr.appendChild(closeBtn);
  var body = document.createElement('div');
  body.id = 'cdm-body';
  body.style.cssText = 'overflow-y:auto;padding:20px 24px;flex:1;';
  box.appendChild(hdr); box.appendChild(body);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.style.display = 'none'; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') overlay.style.display = 'none'; });
  return overlay;
}
function openCompModal(typeTag, name, buildFn) {
  var overlay = initCompModal();
  document.getElementById('cdm-type-tag').textContent = typeTag;
  document.getElementById('cdm-title').textContent = name;
  var body = document.getElementById('cdm-body');
  body.innerHTML = '';
  buildFn(body);
  overlay.style.display = 'flex';
}
function cdmSection(label, iconClass, accent) {
  var sec = document.createElement('div');
  sec.style.cssText = 'margin-bottom:20px;';
  var hdr = document.createElement('div');
  hdr.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:' + accent + ';margin-bottom:8px;display:flex;align-items:center;gap:6px;padding-bottom:5px;border-bottom:2px solid ' + accent + '33;';
  var ico = document.createElement('i'); ico.className = 'fas ' + iconClass;
  hdr.appendChild(ico); hdr.appendChild(document.createTextNode(' ' + label));
  sec.appendChild(hdr);
  return sec;
}
function cdmRow(label, value) {
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-bottom:6px;font-size:13px;';
  var lbl = document.createElement('span');
  lbl.style.cssText = 'font-weight:600;color:#6b7280;min-width:130px;flex-shrink:0;';
  lbl.textContent = label;
  var val = document.createElement('span');
  val.style.cssText = 'color:#2d3748;';
  val.textContent = value || '—';
  row.appendChild(lbl); row.appendChild(val);
  return row;
}
function cdmChips(items) {
  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:4px 0;';
  items.forEach(function (item) {
    var chip = document.createElement('span');
    chip.style.cssText = 'font-size:11.5px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:12px;padding:2px 10px;';
    chip.textContent = item;
    wrap.appendChild(chip);
  });
  return wrap;
}
function cdmEmpty(msg) {
  var p = document.createElement('p');
  p.style.cssText = 'color:#9ca3af;font-size:12px;font-style:italic;margin:4px 0 0;';
  p.textContent = msg || 'None';
  return p;
}

function showDEModal(row) {
  var extLabel = row.extensionLabel || '';
  var typeLabel = (function (mp) {
    if (!mp) return '';
    var parts = mp.split('/'); var fn = parts[parts.length - 1].replace('.js', '');
    if (fn === 'index' && parts.length > 2) fn = parts[parts.length - 2];
    return fn.replace(/([A-Z])/g, ' $1').trim();
  })(row.modulePath || '');

  openCompModal('Data Element', row.name, function (body) {
    var infoSec = cdmSection('Details', 'fa-info-circle', '#4e73df');
    infoSec.appendChild(cdmRow('Type', typeLabel));
    infoSec.appendChild(cdmRow('Extension', extLabel));
    infoSec.appendChild(cdmRow('Storage Duration', row.storageDuration || ''));
    infoSec.appendChild(cdmRow('Default Value', row.settings && row.settings.defaultValue || ''));
    infoSec.appendChild(cdmRow('Clean Text', row.cleanText ? 'Yes' : 'No'));
    infoSec.appendChild(cdmRow('Force Lowercase', row.forceLowerCase ? 'Yes' : 'No'));
    body.appendChild(infoSec);

    var code = row.settings && (row.settings.source || row.settings.code);
    if (code && typeof code === 'string' && code.trim()) {
      var codeSec = cdmSection('Custom Code', 'fa-code', '#059669');
      var pre = document.createElement('pre');
      pre.style.cssText = 'font-family:monospace;font-size:10.5px;background:#1e1e1e;color:#d4d4d4;padding:10px 12px;border-radius:6px;max-height:180px;overflow:auto;white-space:pre-wrap;word-break:break-word;margin:0;';
      var trimmed = code.trim();
      pre.textContent = trimmed.length > 600 ? trimmed.slice(0, 600) + '…' : trimmed;
      codeSec.appendChild(pre);
      body.appendChild(codeSec);
    }

    var ruleNames = row.ruleNames || [];
    var ruleSec = cdmSection('Used in Rules (' + ruleNames.length + ')', 'fa-wrench', '#d97706');
    if (ruleNames.length === 0) { ruleSec.appendChild(cdmEmpty()); }
    else { ruleSec.appendChild(cdmChips(ruleNames)); }
    body.appendChild(ruleSec);

    var extNames = row.extensionNames || [];
    var extSec = cdmSection('Referenced by Extensions (' + extNames.length + ')', 'fa-puzzle-piece', '#7c3aed');
    if (extNames.length === 0) { extSec.appendChild(cdmEmpty()); }
    else { extSec.appendChild(cdmChips(extNames)); }
    body.appendChild(extSec);

    var deNames = row.dataElementNames || [];
    var deSec = cdmSection('Referenced by Data Elements (' + deNames.length + ')', 'fa-sitemap', '#0891b2');
    if (deNames.length === 0) { deSec.appendChild(cdmEmpty()); }
    else { deSec.appendChild(cdmChips(deNames)); }
    body.appendChild(deSec);
  });
}
