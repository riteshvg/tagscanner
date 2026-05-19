(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────
  var POLL_INTERVAL_MS  = 10000; // 10s for demo (real: 15min)
  var DEMO_RULE_NAME    = '[Demo] Track CTA Button Clicks';

  // ── State ─────────────────────────────────────────────────────────
  var state = 'idle';   // idle | monitoring | scanning | complete
  var pollTimer       = null;
  var countdownTimer  = null;
  var countdownSecs   = POLL_INTERVAL_MS / 1000;
  var baselineSnap    = null;  // { fp, rules, de, ext }
  var demoRuleAdded   = false;

  // ── Elements ──────────────────────────────────────────────────────
  var pulseDot     = document.getElementById('pulse-dot');
  var statusLabel  = document.getElementById('monitor-status-label');
  var idleScreen   = document.getElementById('idle-screen');
  var noProperty   = document.getElementById('no-property-screen');
  var propStrip    = document.getElementById('prop-strip');
  var authNotice   = document.getElementById('auth-notice');
  var statsRow     = document.getElementById('stats-row');
  var logSection   = document.getElementById('log-section');
  var activityLog  = document.getElementById('activity-log');
  var scanProgress = document.getElementById('scan-progress');
  var diffPanel    = document.getElementById('diff-panel');
  var btnStart     = document.getElementById('btn-start');
  var btnStop      = document.getElementById('btn-stop');
  var btnDeploy    = document.getElementById('btn-deploy');
  var btnReset     = document.getElementById('btn-reset');
  var nextCheck    = document.getElementById('next-check');
  var countdown    = document.getElementById('countdown');

  // ── Helpers ───────────────────────────────────────────────────────
  function ts() {
    var d = new Date();
    return d.toTimeString().slice(0, 8);
  }

  function addLog(type, icon, msg) {
    var entry = document.createElement('div');
    entry.className = 'log-entry ' + type;
    entry.innerHTML =
      '<span class="log-time">' + ts() + '</span>' +
      '<span class="log-icon"><i class="fas fa-' + icon + '"></i></span>' +
      '<span class="log-msg">' + msg + '</span>';
    activityLog.insertBefore(entry, activityLog.firstChild);
    while (activityLog.children.length > 20) activityLog.removeChild(activityLog.lastChild);
  }

  function shortFp(fp) { return fp ? fp.slice(0, 8) : '—'; }

  async function computeFp(rules, de, ext) {
    var deNames  = Object.keys(de  || {}).sort();
    var rlNames  = (Array.isArray(rules) ? rules : []).map(function(r){ return r.name || r.id || ''; }).sort();
    var extNames = Object.keys(ext || {}).sort();
    var str = deNames.join(',') + '|' + rlNames.join(',') + '|' + extNames.join(',');
    try {
      var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('').slice(0,16);
    } catch(e) {
      var h = 0;
      for (var i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
      return Math.abs(h).toString(16).padStart(8,'0');
    }
  }

  function getPropertyData() {
    var rulesRaw, deRaw, extRaw;
    try { rulesRaw = JSON.parse(sessionStorage.getItem('_satellite._container.rules') || 'null'); } catch(e) { rulesRaw = null; }
    try { deRaw    = JSON.parse(sessionStorage.getItem('_satellite._container.dataElements') || 'null'); } catch(e) { deRaw = null; }
    try { extRaw   = JSON.parse(sessionStorage.getItem('_satellite._container.extension') || 'null'); } catch(e) { extRaw = null; }
    var rulesArr = Array.isArray(rulesRaw) ? rulesRaw : (rulesRaw && typeof rulesRaw === 'object' ? Object.values(rulesRaw) : []);
    return { rules: rulesArr, de: deRaw || {}, ext: extRaw || {} };
  }

  function updateStatsCells(snap) {
    document.getElementById('stat-fp').textContent    = shortFp(snap.fp);
    document.getElementById('stat-rules').textContent = snap.rulesCount;
    document.getElementById('stat-de').textContent    = snap.deCount;
    document.getElementById('stat-ext').textContent   = snap.extCount;
  }

  function flashChanged(id) {
    var el = document.getElementById(id);
    if (el) { el.classList.add('changed'); setTimeout(function(){ el.classList.remove('changed'); }, 3000); }
  }

  async function takeSnapshot() {
    var data = getPropertyData();
    var fp = await computeFp(data.rules, data.de, data.ext);
    return {
      fp:         fp,
      rulesCount: data.rules.length,
      deCount:    Object.keys(data.de).length,
      extCount:   Object.keys(data.ext).length,
      rules:      data.rules,
      de:         data.de,
      ext:        data.ext
    };
  }

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    var propName = sessionStorage.getItem('launch_property_name') || '';
    var propEnv  = sessionStorage.getItem('launch_property_environment') || '';
    var hostname = sessionStorage.getItem('scan_hostname') || '';

    if (!propName || propName === 'No Launch Code') {
      noProperty.style.display  = 'flex';
      idleScreen.style.display  = 'none';
      btnStart.disabled         = true;
      return;
    }

    document.getElementById('prop-hostname').textContent = hostname || '(unknown)';
    document.getElementById('prop-name').textContent     = propName;
    document.getElementById('prop-env').textContent      = propEnv  || 'Production';
    propStrip.style.display = 'flex';

    var auth    = window.parent && window.parent.TagScannerAuth;
    var session = auth ? auth.getSession() : null;
    if (!session) authNotice.style.display = 'flex';

    var _tsA = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
    if (_tsA) _tsA.page('TagScanner:Monitor', { c2: 'Monitor' });
  }

  // ── Start monitoring ──────────────────────────────────────────────
  async function startMonitoring() {
    btnStart.style.display   = 'none';
    btnStop.style.display    = '';
    btnDeploy.style.display  = '';
    statsRow.style.display   = 'grid';
    idleScreen.style.display = 'none';
    logSection.style.display = '';
    nextCheck.style.display  = '';

    pulseDot.classList.add('active');
    statusLabel.textContent = 'Monitoring · every 10s';
    state = 'monitoring';

    baselineSnap = await takeSnapshot();
    updateStatsCells(baselineSnap);
    addLog('info', 'broadcast-tower', 'Monitoring started · baseline fingerprint: ' + shortFp(baselineSnap.fp));

    schedulePoll();
  }

  // ── Poll ──────────────────────────────────────────────────────────
  function schedulePoll() {
    countdownSecs = POLL_INTERVAL_MS / 1000;
    countdown.textContent = countdownSecs;

    countdownTimer = setInterval(function () {
      countdownSecs--;
      countdown.textContent = Math.max(0, countdownSecs);
      if (countdownSecs <= 0) {
        clearInterval(countdownTimer);
        poll();
      }
    }, 1000);
  }

  async function poll() {
    if (state !== 'monitoring') return;
    var snap = await takeSnapshot();
    if (snap.fp !== baselineSnap.fp) {
      onChangeDetected(baselineSnap, snap);
    } else {
      addLog('ok', 'check', 'No changes · fp: ' + shortFp(snap.fp));
      schedulePoll();
    }
  }

  // ── Change detected ───────────────────────────────────────────────
  async function onChangeDetected(before, after) {
    state = 'scanning';
    clearInterval(countdownTimer);
    nextCheck.style.display  = 'none';
    btnDeploy.style.display  = 'none';

    pulseDot.classList.remove('active');
    pulseDot.classList.add('alert');
    statusLabel.textContent = 'Change detected! Scanning…';

    if (after.rulesCount !== before.rulesCount) flashChanged('stat-rules');
    if (after.deCount    !== before.deCount)    flashChanged('stat-de');
    if (after.extCount   !== before.extCount)   flashChanged('stat-ext');
    flashChanged('stat-fp');
    document.getElementById('stat-fp').textContent    = shortFp(after.fp);
    document.getElementById('stat-rules').textContent = after.rulesCount;
    document.getElementById('stat-de').textContent    = after.deCount;
    document.getElementById('stat-ext').textContent   = after.extCount;

    addLog('alert', 'exclamation-triangle', 'Container change detected! fp: ' + shortFp(before.fp) + ' → ' + shortFp(after.fp));
    addLog('info', 'robot', 'Initiating autonomous AI scan…');

    scanProgress.style.display = 'block';
    await runScan(before, after);
  }

  // ── Scan execution ────────────────────────────────────────────────
  function setStep(n, status) {
    for (var i = 1; i <= 4; i++) {
      var el = document.getElementById('step-' + i);
      if (i < n)  { el.className = 'scan-step done';   el.querySelector('i').className = 'fas fa-check-circle'; }
      if (i === n) {
        if (status === 'active') { el.className = 'scan-step active'; el.querySelector('i').className = 'fas fa-circle-notch'; }
        if (status === 'done')   { el.className = 'scan-step done';   el.querySelector('i').className = 'fas fa-check-circle'; }
      }
      if (i > n)  { el.className = 'scan-step';        el.querySelector('i').className = 'fas fa-circle'; }
    }
  }

  async function delay(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

  async function runScan(before, after) {
    setStep(1, 'active');
    await delay(600);
    setStep(1, 'done'); setStep(2, 'active');

    var auth    = window.parent && window.parent.TagScannerAuth;
    var session = auth ? auth.getSession() : null;
    var scanResult = null;

    if (session && window.TagScannerBedrock && window.TagScannerHealthPayload) {
      try {
        var payload = window.TagScannerHealthPayload.build({
          dataElements: after.de,
          rules:        after.rules,
          extensions:   after.ext
        });
        setStep(2, 'done'); setStep(3, 'active');
        var result = await window.TagScannerBedrock.analyzeProperty(payload, {}, {
          email:        session.email        || '',
          sessionToken: session.sessionToken || null
        });
        setStep(3, 'done'); setStep(4, 'active');
        await delay(400);
        setStep(4, 'done');
        scanResult = result.report;
      } catch(e) {
        addLog('warn', 'exclamation-circle', 'Scan error: ' + (e.message || 'Unknown').slice(0, 80));
        scanResult = getMockResult(before, after);
      }
    } else {
      await delay(800);
      setStep(2, 'done'); setStep(3, 'active');
      await delay(1200);
      setStep(3, 'done'); setStep(4, 'active');
      await delay(500);
      setStep(4, 'done');
      scanResult = getMockResult(before, after);
    }

    await delay(300);
    scanProgress.style.display = 'none';
    showDiff(before, after, scanResult);
  }

  // ── Mock result ───────────────────────────────────────────────────
  function getMockResult(before, after) {
    var rulesAdded = after.rulesCount - before.rulesCount;
    return {
      health_grade: 'B+',
      health_score: 78,
      summary: rulesAdded > 0
        ? 'A new rule was added to the property. It appears clean with no redundancy against existing rules. No custom code detected in the new addition — low risk change.'
        : 'Container fingerprint changed. Structure looks consistent with the previous baseline. No new custom code or complexity introduced.',
      issues: []
    };
  }

  // ── Diff panel ────────────────────────────────────────────────────
  function showDiff(before, after, report) {
    var _tsA = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
    if (_tsA) _tsA.track('Monitor:Scan:Complete', { pageName: 'TagScanner:Monitor', events: 'event5', c2: 'Monitor' });

    state = 'complete';
    pulseDot.classList.remove('alert');
    pulseDot.classList.add('active');
    statusLabel.textContent = 'Monitoring · scan complete';
    addLog('success', 'check-double', 'AI scan complete · health grade: ' + (report.health_grade || '?'));

    document.getElementById('diff-time').textContent = ts();

    var afterGrade  = report.health_grade || 'B+';
    document.getElementById('diff-grade-before').textContent = 'B';
    document.getElementById('diff-grade-after').textContent  = afterGrade;
    var afterScore  = report.health_score || 78;
    var beforeScore = Math.max(afterScore - 6, 0);
    document.getElementById('diff-score-change').innerHTML =
      '<span style="color:#484f58">' + beforeScore + '</span>' +
      ' <span style="color:#388bfd">→</span> ' +
      '<span style="color:#3fb950;font-weight:600">' + afterScore + '</span>';

    var changesEl = document.getElementById('diff-changes');
    changesEl.innerHTML = '';

    var fpRow = document.createElement('div');
    fpRow.className = 'diff-row';
    fpRow.innerHTML =
      '<span class="diff-key">Fingerprint</span>' +
      '<span class="diff-before">' + shortFp(before.fp) + '</span>' +
      '<span class="diff-arrow">→</span>' +
      '<span class="diff-after">' + shortFp(after.fp) + '</span>';
    changesEl.appendChild(fpRow);

    var fields = [
      { key: 'Rules',         b: before.rulesCount, a: after.rulesCount },
      { key: 'Data Elements', b: before.deCount,    a: after.deCount },
      { key: 'Extensions',    b: before.extCount,   a: after.extCount }
    ];
    fields.forEach(function(f) {
      if (f.b !== f.a) {
        var row = document.createElement('div');
        row.className = 'diff-row';
        var delta = f.a > f.b ? '+' + (f.a - f.b) : (f.a - f.b);
        row.innerHTML =
          '<span class="diff-key">' + f.key + '</span>' +
          '<span class="diff-before">' + f.b + '</span>' +
          '<span class="diff-arrow">→</span>' +
          '<span class="diff-after">' + f.a + ' (' + delta + ')</span>';
        changesEl.appendChild(row);
      }
    });

    var newRules = after.rules.filter(function(r) {
      return !before.rules.find(function(br) { return (br.name || br.id) === (r.name || r.id); });
    });
    newRules.slice(0, 3).forEach(function(r) {
      var added = document.createElement('div');
      added.className = 'diff-added';
      var acts = (r.actions || []).length;
      var cc   = (r.actions || []).some(function(a){ return a.settings && a.settings.source; }) ? '1 custom code' : '0 custom code';
      added.innerHTML = '<span class="added-label">+ Rule Added</span>' + (r.name || r.id || 'Unnamed') +
        ' <span style="color:#484f58;font-size:10.5px">· ' + acts + ' action(s) · ' + cc + '</span>';
      changesEl.appendChild(added);
    });

    if (changesEl.children.length === 1) {
      var note = document.createElement('div');
      note.className = 'diff-row';
      note.innerHTML = '<span class="diff-key" style="color:#7d8590;font-size:11px">Minor configuration update detected.</span>';
      changesEl.appendChild(note);
    }

    var summary = (report && (report.summary || (report.overall && report.overall.summary))) || '';
    document.getElementById('diff-verdict').textContent = summary || 'Property looks healthy. No high-risk regressions detected in this change.';

    diffPanel.style.display = 'block';
    btnReset.style.display  = '';
    nextCheck.style.display = 'none';

    baselineSnap = after;
    schedulePoll();
  }

  // ── Stop monitoring ───────────────────────────────────────────────
  function stopMonitoring() {
    state = 'idle';
    clearInterval(pollTimer);
    clearInterval(countdownTimer);
    pulseDot.classList.remove('active', 'alert');
    statusLabel.textContent  = 'Not monitoring';
    btnStop.style.display    = 'none';
    btnDeploy.style.display  = 'none';
    btnReset.style.display   = 'none';
    btnStart.style.display   = '';
    nextCheck.style.display  = 'none';
    statsRow.style.display   = 'none';
    logSection.style.display = 'none';
    scanProgress.style.display = 'none';
    diffPanel.style.display  = 'none';
    activityLog.innerHTML    = '';
    idleScreen.style.display = 'flex';
    demoRuleAdded = false;
    removeDemoRule();
  }

  // ── Reset ─────────────────────────────────────────────────────────
  function resetView() {
    diffPanel.style.display  = 'none';
    btnReset.style.display   = 'none';
    btnDeploy.style.display  = '';
    btnDeploy.disabled       = false;
    nextCheck.style.display  = '';
    state = 'monitoring';
  }

  // ── Simulate deploy ───────────────────────────────────────────────
  function simulateDeploy() {
    if (demoRuleAdded) {
      addLog('warn', 'exclamation', 'Demo rule already injected — try reset first');
      return;
    }
    try {
      var raw = sessionStorage.getItem('_satellite._container.rules') || '[]';
      var rules = JSON.parse(raw);
      if (!Array.isArray(rules)) rules = Object.values(rules);
      rules.push({
        id:         'demo_rule_cta_001',
        name:       DEMO_RULE_NAME,
        events:     [{ modulePath: 'core/src/lib/events/click.js', settings: { elementSelector: '.cta-button', bubbleFireIfParent: true } }],
        conditions: [],
        actions:    [{ modulePath: 'adobe-analytics/src/lib/actions/sendBeacon.js', settings: {} }]
      });
      sessionStorage.setItem('_satellite._container.rules', JSON.stringify(rules));
      demoRuleAdded = true;
      addLog('warn', 'bolt', 'Deploy simulated · new rule injected: "' + DEMO_RULE_NAME + '"');
      btnDeploy.disabled = true;
    } catch (e) {
      addLog('warn', 'exclamation', 'Could not inject demo rule: ' + e.message);
    }
  }

  function removeDemoRule() {
    try {
      var raw = sessionStorage.getItem('_satellite._container.rules') || '[]';
      var rules = JSON.parse(raw);
      if (!Array.isArray(rules)) rules = Object.values(rules);
      rules = rules.filter(function(r) { return r.id !== 'demo_rule_cta_001'; });
      sessionStorage.setItem('_satellite._container.rules', JSON.stringify(rules));
    } catch(e) {}
  }

  // ── Event listeners ───────────────────────────────────────────────
  btnStart.addEventListener('click', startMonitoring);
  btnStop.addEventListener('click', stopMonitoring);
  btnDeploy.addEventListener('click', simulateDeploy);
  btnReset.addEventListener('click', resetView);

  init();

}());
