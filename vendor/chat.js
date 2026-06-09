(function () {
  'use strict';

  var TS_PROXY_URL = 'https://ihn2pz2dbcktbxvn36g6pfptda0jfnri.lambda-url.us-east-1.on.aws/';

  // ── State ──────────────────────────────────────────────────────────────────
  var conversationHistory = []; // { role, content } pairs sent to Lambda
  var displayMessages     = []; // { role, text } for session restore
  var isLoading           = false;
  var consentGiven        = false;

  var CHAT_HISTORY_KEY  = 'ts_chat_history';
  var CHAT_MESSAGES_KEY = 'ts_chat_messages';
  var BETA_LIMIT        = 10;

  // ── Client-side answer cache ───────────────────────────────────────────────
  // Keyed by (question + property scan token). Prevents duplicate LLM calls
  // for repeated questions and is invalidated automatically when the extension
  // rescans a new property (ts_scan_token changes).
  var _answerCache      = {};  // { [key]: { answer, queryId } }
  var _answerCacheToken = null;

  function _getScanToken() {
    return (sessionStorage.getItem('ts_scan_token') || '') +
      '|' + (sessionStorage.getItem('launch_property_name') || '') +
      '|' + (sessionStorage.getItem('launch_property_environment') || '') +
      '|' + (sessionStorage.getItem('dataelement-length') || '');
  }

  function lookupAnswerCache(question) {
    var token = _getScanToken();
    if (token !== _answerCacheToken) {
      _answerCache = {};
      _answerCacheToken = token;
    }
    return _answerCache[question.trim().toLowerCase()] || null;
  }

  function storeAnswerCache(question, answer, queryId) {
    var token = _getScanToken();
    if (token !== _answerCacheToken) {
      _answerCache = {};
      _answerCacheToken = token;
    }
    _answerCache[question.trim().toLowerCase()] = { answer: answer, queryId: queryId || null };
  }
  // Persistent beta count stored in localStorage, keyed by userId + propertyKey
  function betaCountKey(session, propKey) {
    return 'ts_beta_count_' + (session.userId || '') + '_' + (propKey || '');
  }
  function getBetaCount(session, propKey) {
    try { return parseInt(localStorage.getItem(betaCountKey(session, propKey)) || '0', 10); } catch (e) { return 0; }
  }
  function setBetaCount(session, propKey, n) {
    try { localStorage.setItem(betaCountKey(session, propKey), n); } catch (e) {}
  }

  function saveChatState() {
    try {
      sessionStorage.setItem(CHAT_HISTORY_KEY,  JSON.stringify(conversationHistory));
      sessionStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(displayMessages));
    } catch (e) {}
  }

  function loadChatState() {
    try {
      var h = sessionStorage.getItem(CHAT_HISTORY_KEY);
      var m = sessionStorage.getItem(CHAT_MESSAGES_KEY);
      if (h) conversationHistory = JSON.parse(h);
      if (m) displayMessages     = JSON.parse(m);
    } catch (e) {}
  }

  function clearChatState() {
    try {
      sessionStorage.removeItem(CHAT_HISTORY_KEY);
      sessionStorage.removeItem(CHAT_MESSAGES_KEY);
    } catch (e) {}
  }

  function updateLimitBar(isAdmin, used) {
    var bar = document.getElementById('chat-limit-bar');
    if (!bar) return;
    if (isAdmin) { bar.style.display = 'none'; return; }
    var remaining = BETA_LIMIT - (used || 0);
    bar.style.display = 'block';
    bar.className = remaining <= 2 ? (remaining <= 0 ? 'block' : 'warn') : '';
    if (remaining <= 0) {
      bar.textContent = '0 / ' + BETA_LIMIT + ' questions left (beta)';
      btnSend.disabled = true;
      chatInput.disabled = true;
      chatInput.placeholder = 'Beta question limit reached for this property.';
    } else {
      bar.textContent = remaining + ' / ' + BETA_LIMIT + ' questions left (beta)';
    }
  }

  function restoreChatHistory() {
    if (!displayMessages.length) return;
    displayMessages.forEach(function (m) {
      if (m.role === 'user') {
        appendBubble('user', esc(m.text));
      } else {
        appendBubble('assistant', renderMarkdownLite(m.text), false, m.queryId || null);
      }
    });
  }

  // ── DOM refs ───────────────────────────────────────────────────────────────
  var authGate       = document.getElementById('auth-gate');
  var noPropGate     = document.getElementById('no-property-gate');
  var chatBody       = document.getElementById('chat-body');
  var inputArea      = document.getElementById('chat-input-area');
  var emptyState     = document.getElementById('empty-state');
  var chatInput      = document.getElementById('chat-input');
  var btnSend        = document.getElementById('btn-send');
  var headerProp     = document.getElementById('chat-header-prop');
  var limitNote      = document.getElementById('chat-limit-note');
  var signinError    = document.getElementById('signin-error');
  var betaBanner     = document.getElementById('beta-banner');
  var betaBannerClose = document.getElementById('beta-banner-close');

  if (betaBannerClose) {
    betaBannerClose.addEventListener('click', function () {
      betaBanner.style.display = 'none';
      try { sessionStorage.setItem('ts_beta_banner_dismissed', '1'); } catch (e) {}
    });
  }
  var btnSignin      = document.getElementById('btn-signin');

  // ── Lambda call ────────────────────────────────────────────────────────────
  function callLambda(body) {
    return fetch(TS_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || 'Request failed (' + res.status + ')');
          err.responseData = data;
          throw err;
        }
        return data;
      });
    });
  }

  // ── Property context builder ───────────────────────────────────────────────
  function stripComponent(c) {
    var mp = (c && c.modulePath) || '';
    return {
      extension: mp.split('/')[0] || (c && c.module) || 'unknown',
      type:      (mp.split('/').pop() || '').replace('.js', '') || (c && c.type) || 'unknown'
    };
  }

  function hasCustomCode(comps) {
    return (Array.isArray(comps) ? comps : []).some(function (c) {
      return c && c.settings && (c.settings.source || c.settings.code || c.settings.customCode);
    });
  }

  function buildChatContext() {
    var propName = sessionStorage.getItem('launch_property_name') || '';
    var propEnv  = sessionStorage.getItem('launch_property_environment') || 'Production';
    var propHostname = sessionStorage.getItem('scan_hostname') || '';
    var propUrl  = propHostname ? 'https://' + propHostname : '';

    var rulesRaw, deRaw, extRaw;
    try {
      rulesRaw = JSON.parse(sessionStorage.getItem(
        '_satellite._container.rules') || 'null');
    } catch(e) { rulesRaw = null; }
    if (!rulesRaw) {
      try {
        var _sc = window._satellite && window._satellite._container;
        rulesRaw = (_sc && _sc.rules) || null;
      } catch(e) {}
    }

    try {
      deRaw = JSON.parse(sessionStorage.getItem(
        '_satellite._container.dataElements') || 'null');
    } catch(e) { deRaw = null; }
    if (!deRaw) {
      try {
        var _sc2 = window._satellite && window._satellite._container;
        deRaw = (_sc2 && _sc2.dataElements) || null;
      } catch(e) {}
    }

    try {
      extRaw = JSON.parse(sessionStorage.getItem(
        '_satellite._container.extension') || 'null');
    } catch(e) { extRaw = null; }
    if (!extRaw) {
      try {
        var _sc3 = window._satellite && window._satellite._container;
        extRaw = (_sc3 && _sc3.extensions) || null;
      } catch(e) {}
    }

    var rulesArr = Array.isArray(rulesRaw)
      ? rulesRaw
      : (rulesRaw && typeof rulesRaw === 'object' ? Object.values(rulesRaw) : []);

    // Cap at 200 data elements
    var DE_CAP = 200;
    var deKeys = deRaw && typeof deRaw === 'object' ? Object.keys(deRaw) : [];
    var totalDE = deKeys.length;
    var deKeySet = deKeys.reduce(function (s, k) { s[k] = true; return s; }, {});

    // Pre-compute direct DE-to-DE reference map for all DEs
    var deDirectRefs = {};
    deKeys.forEach(function (name) {
      var d = deRaw[name] || {};
      var refs = [];
      if (d.settings) {
        var settingsStr = JSON.stringify(d.settings);
        var matches = settingsStr.match(/%([^%\n\r]{1,100})%/g) || [];
        var seen = {};
        matches.forEach(function (m) {
          var ref = m.slice(1, -1);
          if (deKeySet[ref] && ref !== name && !seen[ref]) {
            seen[ref] = true;
            refs.push(ref);
          }
        });
      }
      deDirectRefs[name] = refs;
    });

    // Transitive closure: all DEs reachable from a given DE (cycle-safe)
    function getAllDeRefs(deName, visited) {
      if (visited[deName]) return;
      visited[deName] = true;
      (deDirectRefs[deName] || []).forEach(function (ref) { getAllDeRefs(ref, visited); });
    }

    // Reverse DE map: for each DE, which other DEs directly reference it in their settings
    var deReversedRefs = {};
    deKeys.forEach(function (name) {
      (deDirectRefs[name] || []).forEach(function (ref) {
        if (!deReversedRefs[ref]) deReversedRefs[ref] = [];
        deReversedRefs[ref].push(name);
      });
    });

    // Name variants: for each DE, which other DEs have a name that contains this DE's name as a substring
    var deNameVariants = {};
    var deKeysLower = deKeys.map(function(k) { return k.toLowerCase(); });
    deKeys.forEach(function (name, i) {
      var nl = deKeysLower[i];
      var variants = deKeys.filter(function(other, j) {
        return j !== i && deKeysLower[j] !== nl && deKeysLower[j].indexOf(nl) !== -1;
      });
      if (variants.length) deNameVariants[name] = variants;
    });

    // Global direct rule refs: which rules directly reference each DE (not via another DE)
    var deDirectRuleRefs = {};

    // Cap at 150 rules to avoid token overrun on large properties
    var RULE_CAP = 150;
    var totalRules = rulesArr.length;
    var rules = rulesArr.slice(0, RULE_CAP).map(function (r) {
      var comps = [].concat(r.events || [], r.conditions || [], r.actions || []);
      var ruleName = r.name || r.id || 'Unnamed';

      // Collect direct DE references from all component settings
      var directRuleRefs = {};
      comps.forEach(function (c) {
        if (c && c.settings) {
          var s = JSON.stringify(c.settings);
          var m = s.match(/%([^%\n\r]{1,100})%/g) || [];
          m.forEach(function (tok) {
            var ref = tok.slice(1, -1);
            if (deKeySet[ref]) {
              directRuleRefs[ref] = true;
              // Record which rules directly reference each DE
              if (!deDirectRuleRefs[ref]) deDirectRuleRefs[ref] = [];
              if (deDirectRuleRefs[ref].indexOf(ruleName) === -1) deDirectRuleRefs[ref].push(ruleName);
            }
          });
        }
      });

      // Expand to full transitive closure (rule → XDM DE → CRM Campaign ID etc.)
      var transitiveRefs = {};
      Object.keys(directRuleRefs).forEach(function (ref) {
        transitiveRefs[ref] = true;
        var visited = {};
        getAllDeRefs(ref, visited);
        Object.keys(visited).forEach(function (t) { transitiveRefs[t] = true; });
      });

      var entry = {
        name:          ruleName,
        events:        (r.events     || []).map(stripComponent),
        conditions:    (r.conditions || []).map(stripComponent),
        actions:       (r.actions    || []).map(stripComponent),
        hasCustomCode: hasCustomCode(comps)
      };
      var deRefs = Object.keys(transitiveRefs);
      if (deRefs.length) entry.dataElementRefs = deRefs;
      var directRefs = Object.keys(directRuleRefs);
      if (directRefs.length) entry.directDataElementRefs = directRefs;
      return entry;
    });

    // Build used-DE set from all rules' transitive refs (rules already computed above)
    var usedDeSet = {};
    rules.forEach(function (r) {
      (r.dataElementRefs || []).forEach(function (name) { usedDeSet[name] = true; });
    });

    var dataElements = deKeys.slice(0, DE_CAP).map(function (name) {
      var d  = deRaw[name] || {};
      var mp = d.modulePath || '';
      var entry = {
        name:            name,
        extension:       mp.split('/')[0] || 'unknown',
        type:            (mp.split('/').pop() || '').replace('.js', '') || 'unknown',
        storageDuration: d.storageDuration || null,
        hasCustomCode:   !!(d.settings && (d.settings.source || d.settings.code || d.settings.customCode)),
        usedInRules:     !!usedDeSet[name]
      };
      // Forward: DEs this DE directly references in its own settings
      if (deDirectRefs[name] && deDirectRefs[name].length) entry.references = deDirectRefs[name];
      // Reverse: other DEs that directly reference this DE in their settings
      if (deReversedRefs[name] && deReversedRefs[name].length) entry.referencedByDEs = deReversedRefs[name];
      // Rules that reference this DE directly (not via another DE)
      if (deDirectRuleRefs[name] && deDirectRuleRefs[name].length) entry.directlyUsedInRules = deDirectRuleRefs[name];
      // Other DEs whose name contains this DE's name as a substring (e.g. "CRM Campaign ID (utm_campaign)")
      if (deNameVariants[name] && deNameVariants[name].length) entry.nameVariants = deNameVariants[name];
      return entry;
    });

    // Recursive helper: collect all rules that use startDE, with the full dependency path.
    // path is the chain of intermediate DEs between startDE and the rule.
    // Cycle-safe via visited set.
    function getRuleUsagePaths(startName) {
      var results = [];
      var visited = {};
      function traverse(deName, pathSoFar) {
        if (visited[deName]) return;
        visited[deName] = true;
        (deDirectRuleRefs[deName] || []).forEach(function(ruleName) {
          results.push({ rule: ruleName, path: pathSoFar.slice() });
        });
        (deReversedRefs[deName] || []).forEach(function(parentName) {
          traverse(parentName, pathSoFar.concat([parentName]));
        });
      }
      traverse(startName, []);
      // Sort shortest path first so direct refs win deduplication
      results.sort(function(a, b) { return a.path.length - b.path.length; });
      return results;
    }

    // Pre-compute ruleUsageSummary for each DE — direct, transitive (N hops), and via name-variants
    dataElements.forEach(function(de) {
      var name = de.name;

      // Collect all rule usage paths, deduplicating by rule (shortest/most-direct path wins)
      var usagePaths = getRuleUsagePaths(name);
      var seenRules  = {};
      var direct     = [];
      var transitive = [];

      usagePaths.forEach(function(u) {
        if (seenRules[u.rule]) return;
        seenRules[u.rule] = true;
        if (u.path.length === 0) {
          direct.push(u.rule);
        } else {
          // Chain: "name → hop1 → hop2 → … → directDE" (path holds hops after name)
          transitive.push({ rule: u.rule, via: name + ' → ' + u.path.join(' → ') });
        }
      });

      // Via name variants — also traversed recursively so multi-hop variant chains work.
      // A rule already in direct/transitive is not repeated here.
      var viaVariants = [];
      (deNameVariants[name] || []).forEach(function(variantName) {
        var variantPaths = getRuleUsagePaths(variantName);
        variantPaths.forEach(function(u) {
          if (seenRules[u.rule]) return; // already covered above
          if (viaVariants.some(function(v) { return v.rule === u.rule; })) return;
          var chainParts = [variantName].concat(u.path); // e.g. ["Campaign ID", "XDM_formSuccess_websdk"]
          viaVariants.push({ rule: u.rule, variant: variantName, via: chainParts.join(' → ') });
        });
      });

      var summary = {};
      if (direct.length)      summary.direct         = direct;
      if (transitive.length)  summary.transitive      = transitive;
      if (viaVariants.length) summary.viaNameVariants = viaVariants;

      if (Object.keys(summary).length) {
        de.ruleUsageSummary = summary;

        // Pre-formatted verbatim string for the AI
        var lines = [];
        direct.forEach(function(r) { lines.push('- ' + r); });
        transitive.forEach(function(t) { lines.push('- ' + t.rule + '  (' + t.via + ')'); });
        viaVariants.forEach(function(v) { lines.push('- ' + v.rule + '  (' + v.via + ')'); });
        var total = lines.length;
        de.ruleUsageText = total + ' rule' + (total !== 1 ? 's' : '') + ' reference' + (total === 1 ? 's' : '') + ' this data element:\n' + lines.join('\n');
      }

      // Pre-formatted answer for "which data elements reference this DE?" questions
      var parentDEs = deReversedRefs[name] || [];
      if (parentDEs.length) {
        de.deUsageText = parentDEs.length + ' data element' + (parentDEs.length !== 1 ? 's' : '') + ' reference' + (parentDEs.length === 1 ? 's' : '') + ' this data element:\n' + parentDEs.map(function(p) { return '- ' + p; }).join('\n');
      } else {
        de.deUsageText = 'No other data elements reference this data element.';
      }
    });

    var extensions = [];
    if (extRaw && typeof extRaw === 'object') {
      extensions = Object.keys(extRaw).map(function (key) {
        var e = extRaw[key] || {};
        return {
          name:        key,
          displayName: e.displayName || key,
          hasSettings: !!(e.settings && Object.keys(e.settings).length > 0)
        };
      });
    }

    // Pre-computed unused lists for accurate AI responses
    var unusedDataElements = dataElements.filter(function(de) { return !de.usedInRules; }).map(function(de) { return de.name; });

    var ctx = {
      property:             { name: propName, environment: propEnv, url: propUrl },
      rules:                rules,
      dataElements:         dataElements,
      extensions:           extensions,
      unusedDataElements:   unusedDataElements,
      unusedDataElementCount: unusedDataElements.length,
      data_note:    'All rules shown are from the deployed container and are active. Disabled rules are excluded from the deployed library and are not visible here. Custom code content is not included — only component metadata is available. Each data element has a usedInRules flag indicating whether it is referenced (directly or transitively) in at least one rule.'
    };
    if (totalRules > RULE_CAP) ctx.note_rules = 'Truncated to ' + RULE_CAP + ' of ' + totalRules + ' total rules.';
    if (totalDE   > DE_CAP)   ctx.note_de    = 'Truncated to ' + DE_CAP   + ' of ' + totalDE   + ' total data elements.';
    return ctx;
  }

  function hasPropertyData() {
    return !!(sessionStorage.getItem('launch_property_name') &&
              sessionStorage.getItem('launch_property_name') !== 'No Launch Code');
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  function esc(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Convert "-" bullet lists and double newlines to basic HTML
  function renderMarkdownLite(text) {
    var lines = text.split('\n');
    var html  = '';
    var inList = false;
    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<hr style="border:none;border-top:1px solid rgba(0,0,0,0.1);margin:10px 0;">';
      } else if (trimmed.match(/^[-*]\s+/)) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + esc(trimmed.replace(/^[-*]\s+/, '')) + '</li>';
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        if (trimmed === '') {
          html += '<br>';
        } else {
          html += esc(trimmed) + ' ';
        }
      }
    });
    if (inList) html += '</ul>';
    return html;
  }

  function appendBubble(role, htmlContent, isError, queryId) {
    emptyState.style.display = 'none';
    var row = document.createElement('div');
    row.className = 'msg-row ' + role;
    var bubble = document.createElement('div');
    bubble.className = 'msg-bubble' + (isError ? ' error-text' : '');
    bubble.innerHTML = htmlContent;

    if (role === 'assistant' && !isError) {
      var footer = document.createElement('div');
      footer.className = 'msg-bubble-footer';

      // Feedback buttons (left side)
      var fbWrap = document.createElement('div');
      fbWrap.className = 'msg-feedback';
      if (queryId) {
        fbWrap.innerHTML =
          '<span class="msg-feedback-label">Helpful?</span>' +
          '<button class="msg-fb-btn" data-rating="positive" title="Yes, helpful"><i class="fas fa-thumbs-up"></i></button>' +
          '<button class="msg-fb-btn" data-rating="negative" title="Not helpful"><i class="fas fa-thumbs-down"></i></button>';
        fbWrap.querySelectorAll('.msg-fb-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            submitChatFeedback(queryId, btn.getAttribute('data-rating'), fbWrap);
          });
        });
      }
      footer.appendChild(fbWrap);

      // Copy button (right side)
      var copyBtn = document.createElement('button');
      copyBtn.className = 'msg-copy-btn';
      copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
      copyBtn.addEventListener('click', function () {
        var clone = bubble.cloneNode(true);
        var f = clone.querySelector('.msg-bubble-footer');
        if (f) f.remove();
        var text = (clone.innerText || clone.textContent).trim();
        navigator.clipboard.writeText(text).then(function () {
          copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
          setTimeout(function () { copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy'; }, 2000);
        }).catch(function () {});
      });
      footer.appendChild(copyBtn);

      bubble.appendChild(footer);
    }

    row.appendChild(bubble);
    chatBody.appendChild(row);
    chatBody.scrollTop = chatBody.scrollHeight;
    return row;
  }

  function submitChatFeedback(queryId, rating, container) {
    var auth = window.parent.TagScannerAuth || window.TagScannerAuth;
    var session = auth ? auth.getSession() : null;
    if (!session) return;

    // Optimistic UI update
    var btns = container.querySelectorAll('.msg-fb-btn');
    btns.forEach(function (b) {
      b.disabled = true;
      b.classList.toggle('voted-positive', b.getAttribute('data-rating') === 'positive' && rating === 'positive');
      b.classList.toggle('voted-negative', b.getAttribute('data-rating') === 'negative' && rating === 'negative');
    });

    callLambda({
      type: 'feedback', sessionToken: session.sessionToken,
      queryId: queryId, rating: rating
    }).catch(function () {
      // revert on error
      btns.forEach(function (b) { b.disabled = false; b.className = 'msg-fb-btn'; });
    });
  }

  function showThinking() {
    var row = document.createElement('div');
    row.id = 'thinking-row';
    row.className = 'msg-row assistant';
    row.innerHTML = '<div class="msg-bubble thinking-bubble"><span></span><span></span><span></span></div>';
    chatBody.appendChild(row);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function removeThinking() {
    var el = document.getElementById('thinking-row');
    if (el) el.remove();
  }

  // ── UI deflection — redirect questions the UI already answers, saving tokens ──

  // Helpers to read counts directly from sessionStorage
  function _deCount() {
    try { var d = JSON.parse(sessionStorage.getItem('_satellite._container.dataElements') || 'null'); return d && typeof d === 'object' ? Object.keys(d).length : null; } catch(e) { return null; }
  }
  function _ruleCount() {
    try { var r = JSON.parse(sessionStorage.getItem('_satellite._container.rules') || 'null'); return Array.isArray(r) ? r.length : (r && typeof r === 'object' ? Object.keys(r).length : null); } catch(e) { return null; }
  }
  function _extCount() {
    try { var e = JSON.parse(sessionStorage.getItem('_satellite._container.extension') || 'null'); return e && typeof e === 'object' ? Object.keys(e).length : null; } catch(e) { return null; }
  }

  var UI_DEFLECTIONS = [
    {
      // Must be before the generic "how many data elem" entry — catches all word orderings
      patterns: [
        /unused\s+data\s+elem/i,
        /data\s+elem\w*\s+(that\s+are\s+|which\s+are\s+)?not\s+used/i,
        /orphan\w*\s+data\s+elem/i,
        /data\s+elem\w*\s+(are\s+)?(unused|not\s+in\s+use|not\s+used)/i,
        /how\s+many\s+data\s+elem\w*\s+are\s+(unused|not\s+used|not\s+in\s+use)/i,
        /how\s+many\s+(of\s+the\s+)?data\s+elem\w*\s+(is|are)\s+(unused|not\s+used)/i
      ],
      message:  function() { return 'The <strong>Unused Data Elements</strong> list is already in your <strong>Summary tab → Unused Data Elements</strong> section — no AI needed for this one!'; }
    },
    {
      // Must be before the generic "how many rules" entry
      patterns: [
        /unused\s+rules/i,
        /rules\s+(that\s+are\s+|which\s+are\s+)?not\s+used/i,
        /orphan\w*\s+rules/i,
        /rules\s+(are\s+)?(unused|not\s+in\s+use|not\s+used)/i,
        /how\s+many\s+rules\s+are\s+(unused|not\s+used|not\s+in\s+use)/i
      ],
      message:  function() { return 'The <strong>Unused Rules</strong> list is already in your <strong>Summary tab → Unused Rules</strong> section — no AI needed for this one!'; }
    },
    {
      // Must be before the generic "how many ext" entry
      patterns: [
        /unused\s+ext/i,
        /ext\w*\s+(that\s+are\s+|which\s+are\s+)?not\s+used/i,
        /ext\w*\s+(are\s+)?(unused|not\s+in\s+use|not\s+used)/i,
        /how\s+many\s+ext\w*\s+are\s+(unused|not\s+used|not\s+in\s+use)/i
      ],
      message:  function() { return 'The <strong>Unused Extensions</strong> list is already in your <strong>Summary tab → Unused Extensions</strong> section — no AI needed for this one!'; }
    },
    {
      // Anchored: only fires for bare "how many rules" — not "how many rules have X"
      patterns: [/^how\s+many\s+rules(\s*(are\s+there|in\s+(this|the)\s+property|total|in\s+total|do\s+(you|i|we)\s+have))?\s*\??$/i],
      message:  function() { var n = _ruleCount(); return n !== null ? 'This property has <strong>' + n + ' rules</strong>. See them all in the <strong>Rules tab</strong>.' : null; }
    },
    {
      // Anchored: only fires for bare "how many data elements" — not "how many data elements have X"
      patterns: [/^how\s+many\s+data\s+elem\w*(\s*(are\s+there|in\s+(this|the)\s+property|total|in\s+total|do\s+(you|i|we)\s+have))?\s*\??$/i],
      message:  function() { var n = _deCount(); return n !== null ? 'This property has <strong>' + n + ' data elements</strong>. See them all in the <strong>Data Elements tab</strong>.' : null; }
    },
    {
      // Anchored: only fires for bare "how many extensions" — not "how many extensions have X"
      patterns: [/^how\s+many\s+ext\w*(\s*(are\s+there|in\s+(this|the)\s+property|total|in\s+total|do\s+(you|i|we)\s+have|are\s+installed))?\s*\??$/i],
      message:  function() { var n = _extCount(); return n !== null ? 'This property has <strong>' + n + ' extensions</strong> installed. See them all in the <strong>Extensions tab</strong>.' : null; }
    },
    {
      patterns: [
        /(?:where|how)\s+(?:can|do)\s+(?:i|we)\s+(?:see|find|view|access)\s+(?:the\s+)?rules/i,
        /which\s+(?:tab|page|section|panel)\s+(?:has|shows?)\s+rules/i
      ],
      message:  function() { return 'See the <strong>Rules tab</strong> for the browsable list.'; }
    },
    {
      patterns: [
        /(?:where|how)\s+(?:can|do)\s+(?:i|we)\s+(?:see|find|view|access)\s+(?:the\s+)?data\s+elem/i,
        /which\s+(?:tab|page|section|panel)\s+(?:has|shows?)\s+data\s+elem/i
      ],
      message:  function() { return 'See the <strong>Data Elements tab</strong> for the browsable list.'; }
    },
    {
      patterns: [
        /(?:where|how)\s+(?:can|do)\s+(?:i|we)\s+(?:see|find|view|access)\s+(?:the\s+)?ext/i,
        /which\s+(?:tab|page|section|panel)\s+(?:has|shows?)\s+ext/i
      ],
      message:  function() { return 'See the <strong>Extensions tab</strong> for the browsable list.'; }
    },
    {
      patterns: [/custom\s+code\s+in\s+(all\s+)?(data\s+elem|rules|the\s+prop)/i, /list\s+(all\s+)?custom\s+code/i, /show\s+(all\s+)?custom\s+code/i, /which\s+(data\s+elem|rules)\s+have\s+custom\s+code/i],
      message:  function() { return 'The <strong>Custom Code tab</strong> shows all custom code across every data element and rule in one place — with a built-in code viewer.'; }
    },
    {
      patterns: [/relation\w*\s+(between|diagram|map|graph)/i, /how\s+(do\s+|are\s+)?(rules|data\s+elem|ext)\w*\s+(connect|relate|depend|link)/i, /depend\w*\s+(graph|map|diagram)/i, /visual\w*\s+(map|graph)\s+of/i],
      message:  function() { return 'The <strong>Relationship Diagram tab</strong> shows a visual map of how rules, data elements, and extensions connect and depend on each other.'; }
    },
    {
      patterns: [/execution\s+(order|flow|sequence)/i, /what\s+(order|sequence)\s+do\s+rules\s+fire/i, /rule\s+(firing\s+)?(order|sequence|flow)/i, /component\s+(flow|overview)/i, /which\s+rules?\s+fire\s+(first|in\s+order|on\s+(page\s+load|dom\s+ready))/i],
      message:  function() { return 'The <strong>Flow tab</strong> (inside Components Overview) shows the visual execution flow of rules and components on the page.'; }
    },
    {
      patterns: [/analytics\s+variable\s+mapping/i, /s\.(prop|evar|event|pagename|campaign|channel)\b/i, /evar\d+|prop\d+/i, /which\s+(s\.prop|evar|analytics\s+var)/i],
      message:  function() { return 'The <strong>Analytics Variables tab</strong> shows the full s.prop, eVar, and event variable mappings for this property.'; }
    },
    {
      patterns: [/xdm\s+(object|mapping|schema|field)\b/i, /xdm\s+variable\s+mapping/i, /web\s+sdk\s+(field|mapping|schema)/i],
      message:  function() { return 'The <strong>XDM tab</strong> shows the full XDM object schema mapping for this property.'; }
    }
  ];

  var TOPIC_SIGNALS = [
    'tag','rule','data element','extension','adobe','launch','dtm','satellite',
    'analytics','xdm','evar','prop','event','beacon','tracking','pixel',
    'publish','library','deploy','container','condition','action','trigger',
    'variable','aep','experience platform','web sdk','alloy','at.js','target',
    'audience manager','aam','ecid','mcid','visitor id','custom code','javascript',
    'pageview','page view','click','link','direct call','sequence','order',
    'enabled','disabled','paused','active','unused','bloat','performance',
    'property','workspace','environment','host','staging','production'
  ];

  function checkUIDeflect(question) {
    var q = question.trim();
    for (var i = 0; i < UI_DEFLECTIONS.length; i++) {
      var d = UI_DEFLECTIONS[i];
      for (var j = 0; j < d.patterns.length; j++) {
        if (d.patterns[j].test(q)) {
          var msg = d.message();
          if (msg) return msg; // null means count unavailable — fall through to AI
        }
      }
    }
    // Off-topic gate: if no relevance signal found, don't burn tokens
    var ql = q.toLowerCase();
    var hasSignal = TOPIC_SIGNALS.some(function(s) { return ql.indexOf(s) !== -1; });
    if (!hasSignal && q.length > 0) {
      return "I'm specialized in Adobe Tags and digital analytics. For general questions, please use a different assistant.";
    }
    return null;
  }

  // ── Send message ───────────────────────────────────────────────────────────
  function sendMessage(question) {
    question = question.trim();
    if (!question || isLoading) return;

    var session = window.parent.TagScannerAuth
      ? window.parent.TagScannerAuth.getSession()
      : (window.TagScannerAuth ? window.TagScannerAuth.getSession() : null);
    if (!session) { showAuthGate(); return; }

    // Deflect questions the UI already answers — zero tokens consumed
    var deflectMsg = checkUIDeflect(question);
    console.log('[Ask AI] Stage 1 — UI deflection:',
      deflectMsg ? 'DEFLECTED' : 'pass-through',
      deflectMsg ? '| msg: ' + deflectMsg.slice(0, 100) : '');
    if (deflectMsg) {
      chatInput.value = '';
      chatInput.style.height = '';
      btnSend.disabled = true;
      appendBubble('user', esc(question));
      appendBubble('assistant', '<span class="deflect-msg"><i class="fas fa-lightbulb" style="color:#f59e0b;margin-right:6px"></i>' + deflectMsg + '</span>');
      displayMessages.push({ role: 'user', text: question });
      displayMessages.push({ role: 'assistant', text: deflectMsg.replace(/<[^>]+>/g, '') });
      saveChatState();
      return;
    }

    // Consent check — only on first send
    var consentPromise = consentGiven
      ? Promise.resolve(true)
      : (window.parent.TagScannerAuth || window.TagScannerAuth).requireExplainConsent();

    consentPromise.then(function (granted) {
      if (!granted) return;
      consentGiven = true;
      // Beta limit check for non-admin users (client-side guard; server enforces authoritatively)
      if (!session.isAdmin) {
        var propKey = (sessionStorage.getItem('launch_property_name') || '') + '#' + (sessionStorage.getItem('launch_property_environment') || '');
        if (getBetaCount(session, propKey) >= BETA_LIMIT) {
          updateLimitBar(false, BETA_LIMIT);
          return;
        }
      }
      doSend(question, session);
    });
  }

  // ── Keyword search pre-processor ─────────────────────────────────────────────
  // Detects name-filter queries and injects pre-computed match lists into
  // propertyContext so the AI doesn't have to search the array itself.
  function injectKeywordMatches(question, propertyContext) {
    var QO = "['\"\\u2018\\u2019\\u201C\\u201D]";  // opening quote chars (straight + curly)
    var QC = "['\"\\u2018\\u2019\\u201C\\u201D]";  // closing quote chars (straight + curly)
    var patterns = [
      /(?:contain(?:s|ing)?|have|with|reference(?:s)?)\s+(?:the\s+)?(?:word|keyword|term|string)\s+['"]?([a-zA-Z0-9_\-\s\.]+?)['"]?\s*(?:\?|$)/i,
      // "contain the word 'X'" — explicitly handles "the word" prefix before quoted keyword
      new RegExp('(?:have|contain(?:ing)?|with|for|about)\\s+(?:the\\s+)?(?:word\\s+|keyword\\s+)?' + QO + '([a-zA-Z0-9_\\-\\s\\.]+?)' + QC + '\\s*(?:\\?|$)', 'i'),
      /(?:have|contain(?:ing)?|with|for|about)\s+(?:the\s+)?(?:keyword\s+)?['"]?([a-zA-Z0-9_\-\s\.]+?)['"]?\s*(?:\?|$)/i,
      /(?:keyword|find|search(?:ing\s+for)?)\s+['"]?([a-zA-Z0-9_\-\s\.]+?)['"]?\s*(?:\?|$)/i,
      /(?:named?|called)\s+['"]?([a-zA-Z0-9_\-\s\.]+?)['"]?\s*(?:\?|$)/i,
      /data\s+elements?\s+(?:for|with|contain(?:ing)?|about|related\s+to)\s+['"]?([a-zA-Z0-9_\-\s\.]+?)['"]?\s*(?:\?|$)/i,
      /(?:how\s+many|which|list)\s+data\s+elements?\s+(?:have|contain|include|with)\s+['"]?([a-zA-Z0-9_\-\s\.]+?)['"]?\s*(?:\?|$)/i,
      new RegExp(QO + '([a-zA-Z0-9_\\-\\s\\.]{2,})' + QC, 'i')
    ];

    var keyword = null;
    for (var i = 0; i < patterns.length; i++) {
      var match = question.match(patterns[i]);
      if (match && match[1] && match[1].trim().length >= 2) {
        keyword = match[1].trim();
        break;
      }
    }

    if (!keyword) return propertyContext;

    var lowerKeyword = keyword.toLowerCase();

    var matchingDEs = [];
    var dataElements = (propertyContext && propertyContext.dataElements) || [];
    for (var j = 0; j < dataElements.length; j++) {
      var de = dataElements[j];
      if (de && de.name && de.name.toLowerCase().indexOf(lowerKeyword) !== -1) {
        matchingDEs.push(de.name);
      }
    }

    var matchingRules = [];
    var rules = (propertyContext && propertyContext.rules) || [];
    for (var k = 0; k < rules.length; k++) {
      var rule = rules[k];
      if (rule && rule.name && rule.name.toLowerCase().indexOf(lowerKeyword) !== -1) {
        matchingRules.push(rule.name);
      }
    }

    var reverseDePatterns = [
      /which\s+data\s+elements?\s+(?:contains?\s+)?references?\s+to\s+['"]?([a-zA-Z0-9_\-\s\.]+?)['"]?\s*(?:data\s+element)?\s*\??$/i,
      /which\s+(?:data\s+elements?|de)\s+references?\s+['"]?([a-zA-Z0-9_\-\s\.]+?)['"]?\s*\??$/i,
      /what\s+(?:data\s+elements?\s+)?references?\s+['"]?([a-zA-Z0-9_\-\s\.]+?)['"]?\s*(?:data\s+element)?\s*\??$/i,
      /parent\s+(?:of|for)\s+['"]?([a-zA-Z0-9_\-\s\.]+?)['"]?\s*\??$/i,
      /which\s+(?:data\s+elements?|de)\s+(?:has|have|contains?)\s+['"]?([a-zA-Z0-9_\-\s\.]+?)['"]?\s+in\s+(?:it|them)\s*\??$/i,
      /which\s+(?:data\s+elements?|de)\s+has\s+['"]?([a-zA-Z0-9_\-\s\.]+?)['"]?\s+in\s+it\s*\??$/i,
      /what\s+references?\s+(?:the\s+)?['"]?([a-zA-Z0-9_\-\s\.]+?)['"]?\s*\??$/i
    ];
    var reverseDeKeyword = null;
    for (var r = 0; r < reverseDePatterns.length; r++) {
      var rm = question.match(reverseDePatterns[r]);
      if (rm && rm[1] && rm[1].trim().length >= 2) {
        reverseDeKeyword = rm[1].trim().toLowerCase();
        break;
      }
    }
    var reverseDeResult = null;
    if (reverseDeKeyword) {
      var targetDE = null;
      for (var d = 0; d < dataElements.length; d++) {
        if (dataElements[d].name &&
            dataElements[d].name.toLowerCase() === reverseDeKeyword) {
          targetDE = dataElements[d];
          break;
        }
      }
      if (!targetDE) {
        for (var d2 = 0; d2 < dataElements.length; d2++) {
          if (dataElements[d2].name &&
              dataElements[d2].name.toLowerCase().indexOf(reverseDeKeyword) !== -1) {
            targetDE = dataElements[d2];
            break;
          }
        }
      }
      if (targetDE) {
        reverseDeResult = {
          targetDE:        targetDE.name,
          referencedByDEs: targetDE.referencedByDEs || [],
          deUsageText:     targetDE.deUsageText || ''
        };
      }
    }

    if (matchingDEs.length === 0 && matchingRules.length === 0 && !reverseDeResult) {
      return propertyContext;
    }

    return Object.assign({}, propertyContext, {
      _keywordMatches: {
        keyword:           keyword,
        matchingDEs:       matchingDEs,
        matchingRules:     matchingRules,
        matchingDECount:   matchingDEs.length,
        matchingRuleCount: matchingRules.length,
        reverseDeResult:   reverseDeResult
      }
    });
  }

  // ── Pre-flight local resolver ─────────────────────────────────────────────
  // Answers deterministic queries without calling Lambda.
  // Returns a plain-text answer string, or null to fall through to Lambda.
  function resolveLocally(question, propertyContext) {
    var q = question.trim().toLowerCase();
    var rules = (propertyContext && propertyContext.rules) || [];
    var des = (propertyContext && propertyContext.dataElements) || [];
    var exts = (propertyContext && propertyContext.extensions) || [];
    var unused = (propertyContext && propertyContext.unusedDataElements) || [];
    var unusedCount = (propertyContext && propertyContext.unusedDataElementCount) || unused.length;
    var km = propertyContext && propertyContext._keywordMatches;

    // ── Keyword matches already pre-computed ───────────────────────────────
    if (km && km.reverseDeResult) {
      var rd = km.reverseDeResult;
      if (rd.referencedByDEs && rd.referencedByDEs.length === 0) {
        return '"' + rd.targetDE + '" is not directly referenced by any other data element.';
      }
      if (rd.referencedByDEs && rd.referencedByDEs.length > 0) {
        var lines = ['"' + rd.targetDE + '" is directly referenced by:'];
        rd.referencedByDEs.forEach(function(deName) {
          lines.push('- ' + deName + ' (Data Element)');
        });
        var ruleLines = [];
        rd.referencedByDEs.forEach(function(deName) {
          var parentDE = des.find(function(d) { return d.name === deName; });
          if (parentDE && parentDE.ruleUsageSummary) {
            var rs = parentDE.ruleUsageSummary;
            (rs.direct || []).forEach(function(r) {
              if (ruleLines.indexOf(r) === -1) ruleLines.push(r);
            });
            (rs.transitive || []).forEach(function(t) {
              if (ruleLines.indexOf(t.rule) === -1) ruleLines.push(t.rule);
            });
          }
        });
        if (ruleLines.length > 0) {
          lines.push('');
          lines.push('These data elements feed into the following rules:');
          ruleLines.forEach(function(r) { lines.push('- ' + r + ' (Rule)'); });
        }
        return lines.join('\n');
      }
    }

    if (km && !km.reverseDeResult) {
      if (km.matchingDEs.length === 0 && km.matchingRules.length === 0) {
        return 'No data elements or rules found containing "' + km.keyword + '".';
      }
      var totalMatches = km.matchingDECount + km.matchingRuleCount;
      var klines = [totalMatches + ' match' + (totalMatches === 1 ? '' : 'es') + ':'];
      km.matchingDEs.forEach(function(n) { klines.push('- ' + n + ' (Data Element)'); });
      km.matchingRules.forEach(function(n) { klines.push('- ' + n + ' (Rule)'); });
      return klines.join('\n');
    }

    // ── Direct substring search for "the word X" phrasing ──────────
    var wordMatch = q.match(/(?:contain(?:s|ing)?|have|with|reference(?:s)?|include(?:s)?|mention(?:s)?)\s+(?:the\s+)?(?:word|keyword|term|string|text|name)\s+['"]([a-zA-Z0-9_\-\s\.]+?)['"]|(?:contain(?:s|ing)?|have|with|reference(?:s)?|include(?:s)?|mention(?:s)?)\s+(?:the\s+)?(?:word|keyword|term|string|text|name)\s+([a-zA-Z0-9_\-\s\.]+?)(?:\s|$|\?)/i);
    var capturedKeyword = (wordMatch && wordMatch[1]) ||
                          (wordMatch && wordMatch[2]);
    if (capturedKeyword && capturedKeyword.trim().length >= 2) {
      var kw = capturedKeyword.trim().toLowerCase();
      var kwDEs = [];
      des.forEach(function(de) {
        if (de.name && de.name.toLowerCase().indexOf(kw) !== -1) {
          kwDEs.push(de.name);
        }
      });
      if (kwDEs.length === 0) {
        return 'No data elements found containing "' + capturedKeyword + '".';
      }
      var kwlines = [kwDEs.length + ' data element' +
        (kwDEs.length === 1 ? '' : 's') + ' contain "' +
        capturedKeyword + '":'];
      kwDEs.forEach(function(n) {
        kwlines.push('- ' + n + ' (Data Element)');
      });
      return kwlines.join('\n');
    }

    // ── Rule count ─────────────────────────────────────────────────────────
    var asksRules = /rules/.test(q) && /how many/.test(q);
    var asksDEs = /data elements|des\b/.test(q) && /how many/.test(q);

    if (asksRules && asksDEs) {
      var combined = [rules.length + ' rules and ' + des.length + ' data elements.\n'];
      combined.push(rules.length + ' rules:');
      rules.forEach(function(r) { combined.push('- ' + r.name + ' (Rule)'); });
      combined.push('');
      combined.push(des.length + ' data elements. See the Data Elements tab for the full list.');
      return combined.join('\n');
    }

    if (asksRules && !asksDEs) {
      var rlines = [rules.length + ' rules:'];
      rules.forEach(function(r) { rlines.push('- ' + r.name + ' (Rule)'); });
      return rlines.join('\n');
    }

    if (asksDEs && !asksRules) {
      return des.length + ' data elements. See the Data Elements tab for the full list.';
    }

    // ── DE count ───────────────────────────────────────────────────────────
    if (/^how many data elements/.test(q) || /^how many des/.test(q)) {
      return des.length + ' data elements in this property.';
    }

    // ── Unused DEs ─────────────────────────────────────────────────────────
    if (/unused data elements/.test(q) || /which d.*elements.*unused/.test(q) || /unused des/.test(q)) {
      if (unused.length === 0) return 'No unused data elements found.';
      var ulines = [unusedCount + ' unused data element' + (unusedCount === 1 ? '' : 's') + ':'];
      unused.forEach(function(n) { ulines.push('- ' + n + ' (Data Element)'); });
      return ulines.join('\n');
    }

    // ── Extensions ─────────────────────────────────────────────────────────
    if (/which extensions/.test(q) || /list.*extensions/.test(q) || /what extensions/.test(q)) {
      if (exts.length === 0) return 'No extensions found in this property.';
      var elines = [exts.length + ' extensions:'];
      exts.forEach(function(e) { elines.push('- ' + (e.displayName || e.name) + ' (Extension)'); });
      return elines.join('\n');
    }

    // ── Custom code DEs ────────────────────────────────────────────────────
    if (/data elements.*custom code/.test(q) || /which des.*custom code/.test(q) || /how many.*custom code/.test(q) || /custom code.*data elements/.test(q)) {
      var ccDEs = des.filter(function(d) { return d.hasCustomCode; });
      if (ccDEs.length === 0) return 'No data elements with custom code found.';
      var cclines = [ccDEs.length + ' data element' + (ccDEs.length === 1 ? '' : 's') + ' with custom code:'];
      ccDEs.forEach(function(d) { cclines.push('- ' + d.name + ' (Data Element)'); });
      return cclines.join('\n');
    }

    // ── Custom code rules ──────────────────────────────────────────────────
    if (/rules.*custom code/.test(q) || /which rules.*custom code/.test(q) || /how many rules.*custom code/.test(q) || /custom code.*rules/.test(q)) {
      var ccRules = rules.filter(function(r) { return r.hasCustomCode; });
      if (ccRules.length === 0) return 'No rules with custom code found.';
      var ccrlines = [ccRules.length + ' rule' + (ccRules.length === 1 ? '' : 's') + ' with custom code:'];
      ccRules.forEach(function(r) { ccrlines.push('- ' + r.name + ' (Rule)'); });
      return ccrlines.join('\n');
    }

    // ── List all data elements ────────────────────────────────────
    if (/^(?:list|show|give|get|generate|display|print)(?:\s+me)?(?:\s+(?:all|the|every))?\s+(?:the\s+)?data\s+elements?/i.test(q) ||
        /^(?:what|which)\s+(?:are\s+)?(?:all|the)\s+data\s+elements?/i.test(q) ||
        /^(?:can\s+you\s+)?(?:list|show|generate)\s+(?:the\s+)?(?:full\s+)?(?:list\s+of\s+)?data\s+elements?/i.test(q) ||
        /data\s+elements?\s+(?:configured|loading|on\s+(?:my\s+)?website)/i.test(q)) {
      if (/(?:grouped?|categorize|organize|sort|arrange|order)\s+by/i.test(q) ||
          /by\s+(?:extension|type|category|usage|name)/i.test(q)) {
        return null;
      }
      if (des.length === 0) return 'No data elements found in this property.';
      var allDElines = [des.length + ' data elements:'];
      des.forEach(function(d) {
        allDElines.push('- ' + d.name + ' (Data Element)');
      });
      return allDElines.join('\n');
    }

    // ── List all rules ─────────────────────────────────────────────
    if (/^(?:list|show|give|get|generate|display|print)(?:\s+me)?(?:\s+(?:all|the|every))?\s+(?:the\s+)?rules?/i.test(q) ||
        /^(?:what|which)\s+(?:are\s+)?(?:all|the)\s+rules?/i.test(q) ||
        /^(?:can\s+you\s+)?(?:list|show|generate)\s+(?:the\s+)?(?:full\s+)?(?:list\s+of\s+)?rules?/i.test(q)) {
      if (/(?:grouped?|categorize|organize|sort|arrange|order)\s+by/i.test(q) ||
          /by\s+(?:extension|type|category|usage|name)/i.test(q)) {
        return null;
      }
      if (rules.length === 0) return 'No rules found in this property.';
      var allRlines = [rules.length + ' rules:'];
      rules.forEach(function(r) {
        allRlines.push('- ' + r.name + ' (Rule)');
      });
      return allRlines.join('\n');
    }

    // ── List all extensions ────────────────────────────────────────
    if (/^(?:list|show|give|get|generate|display|print)(?:\s+me)?(?:\s+(?:all|the|every))?\s+(?:the\s+)?extensions?/i.test(q) ||
        /^(?:what|which)\s+(?:are\s+)?(?:all|the)\s+extensions?/i.test(q) ||
        /^(?:can\s+you\s+)?(?:list|show|generate)\s+(?:the\s+)?(?:full\s+)?(?:list\s+of\s+)?extensions?/i.test(q)) {
      if (/(?:grouped?|categorize|organize|sort|arrange|order)\s+by/i.test(q) ||
          /by\s+(?:extension|type|category|usage|name)/i.test(q)) {
        return null;
      }
      if (exts.length === 0) return 'No extensions found in this property.';
      var allElines = [exts.length + ' extensions:'];
      exts.forEach(function(e) {
        allElines.push('- ' + (e.displayName || e.name) + ' (Extension)');
      });
      return allElines.join('\n');
    }

    // ── Usage stats summary ────────────────────────────────────────
    if (/(?:usage|utilization)\s+(?:stats|statistics|summary|insights|overview)/i.test(q) ||
        /how\s+many\s+(?:data\s+elements?\s+)?(?:are\s+)?(?:used|unused)/i.test(q) ||
        /(?:total|overall)\s+(?:and\s+)?(?:used|unused)\s+data\s+elements?/i.test(q) ||
        /data\s+elements?\s+(?:configured|on\s+(?:my\s+)?website)\s+and\s+how\s+many/i.test(q)) {
      var usedCount = des.filter(function(d) {
        return d.usedInRules;
      }).length;
      return des.length + ' total data elements: ' + usedCount +
             ' used in rules, ' + unusedCount + ' unused.';
    }

    return null; // not deterministic — send to LLM
  }

  function doSend(question, session) {
    console.log('[Ask AI] ──────────────────────────────────');
    console.log('[Ask AI] Question:', question.slice(0, 200));
    console.log('[Ask AI] History depth:', conversationHistory.length);
    isLoading = true;
    btnSend.disabled = true;
    chatInput.value  = '';
    chatInput.style.height = '';

    var _tsA = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
    if (_tsA) {
      _tsA.track('Ask AI:Question', {
        pageName: 'TagScanner:Ask AI',
        events:   'event2',
        v5:       'Ask AI',
        v8:       question.slice(0, 255),
        c2:       'Ask AI'
      });
    }

    appendBubble('user', esc(question));
    displayMessages.push({ role: 'user', text: question });

    // Cache check — only for first-turn standalone questions
    var _isFreshTurn = conversationHistory.length === 0;
    if (_isFreshTurn) {
      var cached = lookupAnswerCache(question);
      if (cached) {
        appendBubble('assistant', renderMarkdownLite(cached.answer), false, cached.queryId);
        displayMessages.push({ role: 'assistant', text: cached.answer, queryId: cached.queryId });
        var _propCtxCache = buildChatContext();
        _propCtxCache = injectKeywordMatches(question, _propCtxCache);
        conversationHistory.push({ role: 'user',      content: JSON.stringify({ property_context: _propCtxCache, question: question }) });
        conversationHistory.push({ role: 'assistant', content: cached.answer });
        if (conversationHistory.length > 8) conversationHistory = conversationHistory.slice(-8);
        saveChatState();
        isLoading = false;
        btnSend.disabled = false;
        chatInput.focus();
        return;
      }
    }

    showThinking();

    var propertyContext = buildChatContext();
    console.log('[Ask AI] Stage 2 — buildChatContext:',
      'rules:', (propertyContext.rules || []).length,
      '| DEs:', (propertyContext.dataElements || []).length,
      '| extensions:', (propertyContext.extensions || []).length,
      '| data_note:', !!(propertyContext.data_note));
    propertyContext = injectKeywordMatches(question, propertyContext);
    var km = propertyContext._keywordMatches;
    console.log('[Ask AI] Stage 3 — injectKeywordMatches:',
      km ? ('keyword: "' + km.keyword + '"' +
            ' | matchingDEs: ' + km.matchingDECount +
            ' | matchingRules: ' + km.matchingRuleCount +
            ' | reverseDE: ' + (km.reverseDeResult ?
              km.reverseDeResult.targetDE : 'none')) : 'no matches');

    var localAnswer = resolveLocally(question, propertyContext);
    console.log('[Ask AI] Stage 4 — resolveLocally:',
      localAnswer ? 'RESOLVED locally' : 'pass to Lambda',
      localAnswer ? '| answer length: ' + localAnswer.length : '');
    if (localAnswer) {
      removeThinking();
      appendBubble('assistant', renderMarkdownLite(localAnswer));
      displayMessages.push({ role: 'assistant', text: localAnswer });
      if (_isFreshTurn) storeAnswerCache(question, localAnswer, null);
      conversationHistory.push({ role: 'user',      content: JSON.stringify({ property_context: propertyContext, question: question }) });
      conversationHistory.push({ role: 'assistant', content: localAnswer });
      if (conversationHistory.length > 8) conversationHistory = conversationHistory.slice(-8);
      saveChatState();
      isLoading = false;
      btnSend.disabled = false;
      chatInput.focus();
      return;
    }

    var deNames = (propertyContext.dataElements || [])
      .map(function(de){ return de.name; });
    console.log('[Ask AI] Stage 5 — propertyContext DEs:',
      deNames.length, 'total');
    console.log('[Ask AI] DEs containing "campaign":',
      deNames.filter(function(n){
        return n.toLowerCase().indexOf('campaign') > -1;
      }));

    callLambda({
      type:                'chat',
      sessionToken:        session.sessionToken,
      clientId:            (function(){ try { return sessionStorage.getItem('ts_device_id') || ''; } catch(e){ return ''; } }()),
      question:            question,
      propertyContext:     propertyContext,
      conversationHistory: conversationHistory
    })
    .then(function (data) {
      console.log('[Ask AI] Stage 6 — Lambda response:',
        'fromCache:', !!data.fromCache,
        '| tokens:', JSON.stringify(data.tokens),
        '| answer length:', (data.answer || '').length);
      removeThinking();
      var answer = data.answer || '';
      var qId = data.queryId || null;
      if (_tsA) {
        _tsA.track('Ask AI:Answer', {
          pageName: 'TagScanner:Ask AI',
          events:   'event3',
          v5:       'Ask AI',
          c2:       'Ask AI'
        });
      }
      appendBubble('assistant', renderMarkdownLite(answer), false, qId);
      displayMessages.push({ role: 'assistant', text: answer, queryId: qId });
      if (_isFreshTurn) storeAnswerCache(question, answer, qId);

      // Update history for follow-up questions
      conversationHistory.push({ role: 'user',      content: JSON.stringify({ property_context: propertyContext, question: question }) });
      conversationHistory.push({ role: 'assistant', content: answer });
      // Keep last 8 messages (4 exchanges)
      if (conversationHistory.length > 8) conversationHistory = conversationHistory.slice(-8);

      if (!session.isAdmin && typeof data.chatCount === 'number') {
        if (typeof data.chatLimit === 'number') BETA_LIMIT = data.chatLimit;
        var pKey = (sessionStorage.getItem('launch_property_name') || '') + '#' + (sessionStorage.getItem('launch_property_environment') || '');
        setBetaCount(session, pKey, data.chatCount);
        updateLimitBar(false, data.chatCount);
      }
      saveChatState();
    })
    .catch(function (err) {
      removeThinking();
      var msg = err.message || 'Something went wrong.';
      var responseData = err.responseData || {};
      var _tsA_c = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
      if (msg.indexOf('Beta question limit reached') > -1) {
        if (typeof responseData.chatLimit === 'number') BETA_LIMIT = responseData.chatLimit;
        var pKey2 = (sessionStorage.getItem('launch_property_name') || '') + '#' + (sessionStorage.getItem('launch_property_environment') || '');
        var s2 = window.parent.TagScannerAuth ? window.parent.TagScannerAuth.getSession() : (window.TagScannerAuth ? window.TagScannerAuth.getSession() : null);
        if (s2) setBetaCount(s2, pKey2, BETA_LIMIT);
        updateLimitBar(false, BETA_LIMIT);
        appendBubble('assistant', '<span class="error-text">Beta question limit reached for this property (' + BETA_LIMIT + '/' + BETA_LIMIT + ').</span>');
        if (_tsA_c) _tsA_c.track('Chat:Limit:Beta', { pageName: 'TagScanner:Ask AI', events: 'event14', v9: 'Beta Limit Reached', c2: 'Ask AI' });
      } else if (msg.indexOf('Daily AI request limit') > -1) {
        limitNote.style.display = 'block';
        appendBubble('assistant', '<span class="error-text">Daily AI limit reached. Try again tomorrow.</span>');
        if (_tsA_c) _tsA_c.track('Chat:Limit:Daily', { pageName: 'TagScanner:Ask AI', events: 'event14', v9: 'Daily Limit Reached', c2: 'Ask AI' });
      } else if (msg.indexOf('temporarily disabled') > -1) {
        appendBubble('assistant', '<span class="error-text"><strong>AI features are temporarily unavailable.</strong><br>Our AI service has been paused for the day. To report this or get help, email <a href="mailto:tagscannerfeedback@gmail.com" style="color:inherit;text-decoration:underline">tagscannerfeedback@gmail.com</a>.</span>');
        if (_tsA_c) _tsA_c.track('Chat:Error:Disabled', { pageName: 'TagScanner:Ask AI', events: 'event8', v9: 'AI Disabled', c2: 'Ask AI' });
      } else {
        appendBubble('assistant', '<span class="error-text">Error: ' + esc(msg) + '</span>');
        if (_tsA_c) _tsA_c.track('Chat:Error', { pageName: 'TagScanner:Ask AI', events: 'event8', v9: msg.slice(0, 100), c2: 'Ask AI' });
      }
    })
    .finally(function () {
      isLoading = false;
      btnSend.disabled = false;
      chatInput.focus();
    });
  }

  // ── Auth gate ──────────────────────────────────────────────────────────────
  function showAuthGate() {
    authGate.style.display    = 'flex';
    chatBody.style.display    = 'none';
    inputArea.style.display   = 'none';
  }

  function showChatUI() {
    authGate.style.display    = 'none';
    noPropGate.style.display  = 'none';
    chatBody.style.display    = 'flex';
    inputArea.style.display   = 'block';
    var tsA = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
    if (tsA) tsA.page('TagScanner:Ask AI', { events: 'event12' });
  }

  function showNoPropGate() {
    authGate.style.display    = 'none';
    noPropGate.style.display  = 'flex';
    chatBody.style.display    = 'none';
    inputArea.style.display   = 'none';
  }

  btnSignin.addEventListener('click', function () {
    btnSignin.disabled    = true;
    btnSignin.textContent = 'Signing in…';
    signinError.style.display = 'none';

    var auth = window.parent.TagScannerAuth || window.TagScannerAuth;
    auth.signInWithGoogle()
      .then(function () {
        // Notify parent sidebar to flip Sign In → Sign Out
        if (window.parent && window.parent.TagScannerSidebar) {
          window.parent.TagScannerSidebar.refreshAuthState();
        }
        init();
      })
      .catch(function (e) {
        signinError.textContent   = e.message || 'Sign-in failed.';
        signinError.style.display = 'block';
        btnSignin.disabled        = false;
        btnSignin.innerHTML       = '<i class="fas fa-sign-in-alt"></i> Sign in with Google';
      });
  });

  // ── Input behaviour ────────────────────────────────────────────────────────
  chatInput.addEventListener('input', function () {
    // Auto-grow
    this.style.height = '';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    btnSend.disabled = !this.value.trim() || isLoading;
  });

  chatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!btnSend.disabled) sendMessage(chatInput.value);
    }
  });

  btnSend.addEventListener('click', function () {
    sendMessage(chatInput.value);
  });

  // Suggestion chips
  document.querySelectorAll('.chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      chatInput.value = chip.textContent;
      chatInput.dispatchEvent(new Event('input'));
      chatInput.focus();
    });
  });


  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    var auth = window.parent.TagScannerAuth || window.TagScannerAuth;
    if (!auth) { showAuthGate(); return; }

    var session = auth.getSession();
    if (!session) { showAuthGate(); return; }

    if (!hasPropertyData()) { showNoPropGate(); return; }

    var propName = sessionStorage.getItem('launch_property_name') || 'Unknown Property';
    var propEnv  = sessionStorage.getItem('launch_property_environment') || 'Production';
    headerProp.textContent = propName + ' · ' + propEnv;

    showChatUI();
    loadChatState();
    restoreChatHistory();

    // Show beta banner + limit bar for non-admin users
    if (!session.isAdmin) {
      var propKey = propName + '#' + propEnv;
      var dismissed = sessionStorage.getItem('ts_beta_banner_dismissed');
      if (!dismissed && betaBanner) betaBanner.style.display = 'block';
      // Seed bar with locally cached count while we fetch the live limit
      updateLimitBar(false, getBetaCount(session, propKey));
      // Fetch the global limit set by admin and refresh the bar with the live value
      callLambda({ type: 'chatConfig', sessionToken: session.sessionToken })
        .then(function (cfg) {
          if (typeof cfg.chat_question_limit === 'number') {
            BETA_LIMIT = cfg.chat_question_limit;
            var betaLimitEl = document.getElementById('beta-limit-value');
            if (betaLimitEl) betaLimitEl.textContent = BETA_LIMIT;
            updateLimitBar(false, getBetaCount(session, propKey));
          }
        })
        .catch(function () {});
    }
  }

  init();

  // Re-check auth when the session is written by another frame (e.g. sidebar sign-in)
  window.addEventListener('storage', function (e) {
    if (e.key === 'tagscanner_session') {
      init();
    }
  });
})();
