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
        if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
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
    var propUrl  = sessionStorage.getItem('launch_page_url') || '';

    var rulesRaw, deRaw, extRaw;
    try { rulesRaw = JSON.parse(sessionStorage.getItem('_satellite._container.rules') || 'null'); } catch(e) { rulesRaw = null; }
    try { deRaw    = JSON.parse(sessionStorage.getItem('_satellite._container.dataElements') || 'null'); } catch(e) { deRaw = null; }
    try { extRaw   = JSON.parse(sessionStorage.getItem('_satellite._container.extension') || 'null'); } catch(e) { extRaw = null; }

    var rulesArr = Array.isArray(rulesRaw)
      ? rulesRaw
      : (rulesRaw && typeof rulesRaw === 'object' ? Object.values(rulesRaw) : []);

    // Cap at 150 rules to avoid token overrun on large properties
    var RULE_CAP = 150;
    var totalRules = rulesArr.length;
    var rules = rulesArr.slice(0, RULE_CAP).map(function (r) {
      var comps = [].concat(r.events || [], r.conditions || [], r.actions || []);
      return {
        name:          r.name || r.id || 'Unnamed',
        events:        (r.events     || []).map(stripComponent),
        conditions:    (r.conditions || []).map(stripComponent),
        actions:       (r.actions    || []).map(stripComponent),
        hasCustomCode: hasCustomCode(comps)
      };
    });

    // Cap at 200 data elements
    var DE_CAP = 200;
    var deKeys = deRaw && typeof deRaw === 'object' ? Object.keys(deRaw) : [];
    var totalDE = deKeys.length;
    var dataElements = deKeys.slice(0, DE_CAP).map(function (name) {
      var d  = deRaw[name] || {};
      var mp = d.modulePath || '';
      return {
        name:            name,
        extension:       mp.split('/')[0] || 'unknown',
        type:            (mp.split('/').pop() || '').replace('.js', '') || 'unknown',
        storageDuration: d.storageDuration || null,
        hasCustomCode:   !!(d.settings && (d.settings.source || d.settings.code || d.settings.customCode))
      };
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

    var ctx = {
      property:     { name: propName, environment: propEnv, url: propUrl },
      rules:        rules,
      dataElements: dataElements,
      extensions:   extensions,
      data_note:    'All rules shown are from the deployed container and are active. Disabled rules are excluded from the deployed library and are not visible here. Custom code content is not included — only component metadata is available.'
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
      if (trimmed.match(/^[-*]\s+/)) {
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

  // ── Send message ───────────────────────────────────────────────────────────
  function sendMessage(question) {
    question = question.trim();
    if (!question || isLoading) return;

    var session = window.parent.TagScannerAuth
      ? window.parent.TagScannerAuth.getSession()
      : (window.TagScannerAuth ? window.TagScannerAuth.getSession() : null);
    if (!session) { showAuthGate(); return; }

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

  function doSend(question, session) {
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
        c2:       'Ask AI'
      });
    }

    appendBubble('user', esc(question));
    displayMessages.push({ role: 'user', text: question });
    showThinking();

    var propertyContext = buildChatContext();

    callLambda({
      type:                'chat',
      sessionToken:        session.sessionToken,
      question:            question,
      propertyContext:     propertyContext,
      conversationHistory: conversationHistory
    })
    .then(function (data) {
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

      // Update history for follow-up questions
      conversationHistory.push({ role: 'user',      content: JSON.stringify({ property_context: propertyContext, question: question }) });
      conversationHistory.push({ role: 'assistant', content: answer });
      // Keep last 8 messages (4 exchanges)
      if (conversationHistory.length > 8) conversationHistory = conversationHistory.slice(-8);

      if (!session.isAdmin && typeof data.chatCount === 'number') {
        var pKey = (sessionStorage.getItem('launch_property_name') || '') + '#' + (sessionStorage.getItem('launch_property_environment') || '');
        setBetaCount(session, pKey, data.chatCount);
        updateLimitBar(false, data.chatCount);
      }
      saveChatState();
    })
    .catch(function (err) {
      removeThinking();
      var msg = err.message || 'Something went wrong.';
      if (msg.indexOf('Beta question limit reached') > -1) {
        var pKey2 = (sessionStorage.getItem('launch_property_name') || '') + '#' + (sessionStorage.getItem('launch_property_environment') || '');
        var s2 = window.parent.TagScannerAuth ? window.parent.TagScannerAuth.getSession() : (window.TagScannerAuth ? window.TagScannerAuth.getSession() : null);
        if (s2) setBetaCount(s2, pKey2, BETA_LIMIT);
        updateLimitBar(false, BETA_LIMIT);
        appendBubble('assistant', '<span class="error-text">Beta question limit reached for this property (10/10).</span>');
      } else if (msg.indexOf('Daily AI request limit') > -1) {
        limitNote.style.display = 'block';
        appendBubble('assistant', '<span class="error-text">Daily AI limit reached. Try again tomorrow.</span>');
      } else if (msg.indexOf('temporarily disabled') > -1) {
        appendBubble('assistant', '<span class="error-text">AI features are temporarily unavailable.</span>');
      } else {
        appendBubble('assistant', '<span class="error-text">Error: ' + esc(msg) + '</span>');
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
      updateLimitBar(false, getBetaCount(session, propKey));
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
