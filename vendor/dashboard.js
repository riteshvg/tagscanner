(function () {
  'use strict';

  var TS_PROXY_URL  = 'https://ihn2pz2dbcktbxvn36g6pfptda0jfnri.lambda-url.us-east-1.on.aws/';
  var COMPANY_KEY   = 'tagscanner_dashboard_company';

  // AWS Bedrock on-demand pricing — Claude 3.5 Haiku
  var COST_INPUT_PER_TOKEN  = 0.80 / 1e6;   // $0.80 per 1M input tokens
  var COST_OUTPUT_PER_TOKEN = 4.00 / 1e6;   // $4.00 per 1M output tokens

  var barChartInstance      = null;
  var doughnutChartInstance = null;
  var aiCurrentConfig       = null;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function relativeTime(iso) {
    var ms   = Date.now() - new Date(iso).getTime();
    var secs = Math.floor(ms / 1000);
    if (secs < 60)  return 'just now';
    var mins = Math.floor(secs / 60);
    if (mins < 60)  return mins + 'm ago';
    var hrs  = Math.floor(mins / 60);
    if (hrs  < 24)  return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  function formatCost(usd) {
    if (usd === 0)   return '$0.00';
    if (usd < 0.001) return '$' + usd.toFixed(6);
    if (usd < 0.01)  return '$' + usd.toFixed(4);
    if (usd < 1)     return '$' + usd.toFixed(3);
    return '$' + usd.toFixed(2);
  }

  function formatTokens(n) {
    return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);
  }

  function initials(name) {
    var parts = (name || '').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (parts[0] || '?')[0].toUpperCase();
  }

  // ── Lambda call ───────────────────────────────────────────────────────────

  async function callLambda(body) {
    var res = await fetch(TS_PROXY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    });
    var data = await res.json().catch(function () { return { error: 'Invalid response' }; });
    if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
    return data;
  }

  // ── State toggling ────────────────────────────────────────────────────────

  function showState(state) {
    document.getElementById('loadingState').style.display     = (state === 'loading')    ? 'flex'  : 'none';
    document.getElementById('loginGate').style.display        = (state === 'login')      ? 'flex'  : 'none';
    document.getElementById('restrictedState').style.display  = (state === 'restricted') ? 'flex'  : 'none';
    document.getElementById('dashboardContent').style.display = (state === 'dashboard')  ? 'block' : 'none';
  }

  function showError(msg) {
    document.getElementById('errorText').textContent = msg;
    document.getElementById('errorBanner').style.display = 'block';
  }

  // ── Profile card ──────────────────────────────────────────────────────────

  function renderProfile(session, userData) {
    var name    = (userData && userData.name)    || session.name    || '';
    var email   = (userData && userData.email)   || session.email   || '';
    var picture = (userData && userData.picture) || session.picture || '';

    document.getElementById('profileName').textContent  = name;
    document.getElementById('profileEmail').textContent = email;

    var avatar   = document.getElementById('profileAvatar');
    var initEl   = document.getElementById('profileInitials');

    function showInitials() {
      avatar.style.display = 'none';
      initEl.textContent   = initials(name || email);
      initEl.style.display = 'flex';
    }

    if (picture) {
      avatar.src           = picture;
      avatar.alt           = name;
      avatar.style.display = 'block';
      initEl.style.display = 'none';
      // Fallback: Google avatar URLs are blocked by Chrome extension CSP
      avatar.onerror = showInitials;
    } else {
      showInitials();
    }

    renderCompany();
  }

  function renderCompany() {
    var company    = localStorage.getItem(COMPANY_KEY) || '';
    var displayEl  = document.getElementById('profileCompanyDisplay');
    if (company) {
      displayEl.className   = 'profile-company';
      displayEl.textContent = company;
    } else {
      displayEl.className   = 'profile-company-empty';
      displayEl.textContent = 'No company set';
    }
  }

  // Company inline edit
  document.getElementById('btnEditCompany').addEventListener('click', function () {
    var current   = localStorage.getItem(COMPANY_KEY) || '';
    var input     = document.getElementById('profileCompanyInput');
    var saveBtn   = document.getElementById('btnSaveCompany');
    var editBtn   = document.getElementById('btnEditCompany');
    var displayEl = document.getElementById('profileCompanyDisplay');
    input.value        = current;
    displayEl.style.display = 'none';
    editBtn.style.display   = 'none';
    input.style.display     = '';
    saveBtn.style.display   = '';
    input.focus();
  });

  function saveCompany() {
    var input     = document.getElementById('profileCompanyInput');
    var saveBtn   = document.getElementById('btnSaveCompany');
    var editBtn   = document.getElementById('btnEditCompany');
    var displayEl = document.getElementById('profileCompanyDisplay');
    var val = input.value.trim();
    if (val) {
      localStorage.setItem(COMPANY_KEY, val);
    } else {
      localStorage.removeItem(COMPANY_KEY);
    }
    input.style.display     = 'none';
    saveBtn.style.display   = 'none';
    displayEl.style.display = '';
    editBtn.style.display   = '';
    renderCompany();
  }

  document.getElementById('btnSaveCompany').addEventListener('click', saveCompany);
  document.getElementById('profileCompanyInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter')  saveCompany();
    if (e.key === 'Escape') {
      document.getElementById('profileCompanyInput').style.display  = 'none';
      document.getElementById('btnSaveCompany').style.display        = 'none';
      document.getElementById('profileCompanyDisplay').style.display = '';
      document.getElementById('btnEditCompany').style.display        = '';
    }
  });

  // ── Stats ─────────────────────────────────────────────────────────────────

  function computeStats(items) {
    var totalScans = 0, totalExplains = 0, feedbackCount = 0;
    var inAll = 0, outAll = 0, inScan = 0, outScan = 0, inExplain = 0, outExplain = 0;

    items.forEach(function (q) {
      var ti = (q.tokens && q.tokens.input)  || 0;
      var to = (q.tokens && q.tokens.output) || 0;
      if (q.feedback) feedbackCount++;
      inAll  += ti; outAll += to;
      if (q.type === 'scan')    { totalScans++;    inScan    += ti; outScan    += to; }
      if (q.type === 'explain') { totalExplains++; inExplain += ti; outExplain += to; }
    });

    return {
      total: items.length, totalScans: totalScans, totalExplains: totalExplains,
      feedbackPct: items.length > 0 ? Math.round((feedbackCount / items.length) * 100) : 0,
      totalInput: inAll, totalOutput: outAll, totalTokens: inAll + outAll,
      scanInput: inScan, scanOutput: outScan,
      explainInput: inExplain, explainOutput: outExplain
    };
  }

  function renderStats(stats) {
    document.getElementById('statTotal').textContent    = stats.total;
    document.getElementById('statScans').textContent    = stats.totalScans;
    document.getElementById('statExplains').textContent = stats.totalExplains;
    document.getElementById('statFeedback').textContent = stats.feedbackPct + '%';
    document.getElementById('statTokens').textContent   = formatTokens(stats.totalTokens);
    document.getElementById('statTokensSub').textContent =
      formatTokens(stats.totalInput) + ' in / ' + formatTokens(stats.totalOutput) + ' out';
  }

  // ── Cost ──────────────────────────────────────────────────────────────────

  function renderCost(stats) {
    var totalCost   = stats.totalInput   * COST_INPUT_PER_TOKEN  + stats.totalOutput   * COST_OUTPUT_PER_TOKEN;
    var scanCost    = stats.scanInput    * COST_INPUT_PER_TOKEN  + stats.scanOutput    * COST_OUTPUT_PER_TOKEN;
    var explainCost = stats.explainInput * COST_INPUT_PER_TOKEN  + stats.explainOutput * COST_OUTPUT_PER_TOKEN;
    var avgCost     = stats.total > 0 ? totalCost / stats.total : 0;

    document.getElementById('costTotal').textContent   = formatCost(totalCost);
    document.getElementById('costAvg').textContent     = formatCost(avgCost);
    document.getElementById('costScan').textContent    = formatCost(scanCost);
    document.getElementById('costExplain').textContent = formatCost(explainCost);

    document.getElementById('costScanTokens').textContent =
      stats.scanInput || stats.scanOutput
        ? formatTokens(stats.scanInput) + ' in / ' + formatTokens(stats.scanOutput) + ' out'
        : 'no scans yet';
    document.getElementById('costExplainTokens').textContent =
      stats.explainInput || stats.explainOutput
        ? formatTokens(stats.explainInput) + ' in / ' + formatTokens(stats.explainOutput) + ' out'
        : 'no explains yet';
  }

  // ── Day bucketing ─────────────────────────────────────────────────────────

  function bucketByDay(items) {
    var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var labels = [], keys = [], counts = {};
    var now = new Date();
    for (var i = 6; i >= 0; i--) {
      var d   = new Date(now);
      d.setDate(d.getDate() - i);
      var m   = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      var key = d.getFullYear() + '-' + m + '-' + day;
      labels.push(i === 0 ? 'Today' : (DAY_NAMES[d.getDay()] + ' ' + d.getDate()));
      keys.push(key);
      counts[key] = 0;
    }
    items.forEach(function (q) {
      if (!q.createdAt) return;
      var d   = new Date(q.createdAt);
      var m   = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      var key = d.getFullYear() + '-' + m + '-' + day;
      if (Object.prototype.hasOwnProperty.call(counts, key)) counts[key]++;
    });
    return { labels: labels, data: keys.map(function (k) { return counts[k]; }) };
  }

  // ── Bar chart ─────────────────────────────────────────────────────────────

  function renderBarChart(items) {
    var ctx      = document.getElementById('barChart').getContext('2d');
    var bucketed = bucketByDay(items);
    if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }
    barChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: bucketed.labels,
        datasets: [{
          label: 'Queries', data: bucketed.data,
          backgroundColor: 'rgba(78,115,223,0.45)', borderColor: 'rgba(78,115,223,1)', borderWidth: 1
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, legend: { display: false },
        scales: {
          xAxes: [{ gridLines: { display: false }, ticks: { fontSize: 10 } }],
          yAxes: [{ ticks: { beginAtZero: true, precision: 0, fontSize: 10 }, gridLines: { color: '#f0f0f0' } }]
        },
        tooltips: {
          mode: 'index', intersect: false,
          callbacks: { label: function (item) { return item.yLabel + ' ' + (item.yLabel === 1 ? 'query' : 'queries'); } }
        }
      }
    });
  }

  // ── Doughnut chart ────────────────────────────────────────────────────────

  function renderDoughnutChart(stats) {
    var ctx     = document.getElementById('doughnutChart').getContext('2d');
    var hasData = (stats.totalScans + stats.totalExplains) > 0;
    if (doughnutChartInstance) { doughnutChartInstance.destroy(); doughnutChartInstance = null; }
    doughnutChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels:   hasData ? ['Scans', 'Explains'] : ['No data'],
        datasets: [{
          data:            hasData ? [stats.totalScans, stats.totalExplains] : [1],
          backgroundColor: hasData ? ['#4e73df', '#1cc88a'] : ['#e5e7eb'],
          borderWidth: hasData ? 2 : 0, borderColor: '#fff'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutoutPercentage: 68,
        legend: { display: true, position: 'bottom', labels: { fontSize: 10, padding: 12, boxWidth: 12 } },
        tooltips: {
          callbacks: {
            label: function (item, d) {
              if (!hasData) return 'No data yet';
              var val   = d.datasets[0].data[item.index];
              var total = d.datasets[0].data.reduce(function (a, b) { return a + b; }, 0);
              return d.labels[item.index] + ': ' + val + ' (' + Math.round((val / total) * 100) + '%)';
            }
          }
        }
      }
    });
  }

  // ── Recent activity ───────────────────────────────────────────────────────

  function renderActivity(items) {
    var container = document.getElementById('activityList');
    var recent    = items.slice(0, 5);
    if (!recent.length) {
      container.innerHTML =
        '<div class="empty-state"><i class="fas fa-history"></i>' +
        'No activity yet. Run a scan or explain code to see it here.</div>';
      return;
    }
    container.innerHTML = recent.map(function (q) {
      var bc  = q.type === 'scan' ? 'badge-scan' : 'badge-explain';
      var bl  = q.type === 'scan' ? 'Scan'       : 'Explain';
      var dc  = q.feedback === 'positive' ? 'positive' : q.feedback === 'negative' ? 'negative' : 'none';
      var dt  = q.feedback === 'positive' ? 'Positive feedback'
              : q.feedback === 'negative' ? 'Negative feedback' : 'No feedback yet';
      return '<div class="activity-row">' +
        '<span class="type-badge ' + bc + '">' + bl + '</span>' +
        '<span class="activity-summary" title="' + esc(q.requestSummary || '') + '">' + esc(q.requestSummary || '—') + '</span>' +
        '<span class="activity-time">' + relativeTime(q.createdAt) + '</span>' +
        '<div class="feedback-dot ' + dc + '" title="' + dt + '"></div>' +
        '</div>';
    }).join('');
  }

  // ── Users table ───────────────────────────────────────────────────────────

  var USER_PAGE_SIZE = 10;
  var usersCurrentPage = 0;
  var usersAllData = [];

  async function fetchAndRenderUsers(session) {
    var wrap = document.getElementById('usersTableWrap');
    try {
      var data  = await callLambda({ type: 'users', sessionToken: session.sessionToken });
      usersAllData = data.users || [];
      document.getElementById('userCount').textContent = usersAllData.length + ' registered';
      usersCurrentPage = 0;
      renderUsersPage();
    } catch (err) {
      wrap.innerHTML = '<div class="users-table-loading" style="color:#ef4444"><i class="fas fa-exclamation-circle" style="margin-right:6px"></i>Could not load users: ' + esc(err.message) + '</div>';
    }
  }

  function renderUsersPage() {
    var wrap       = document.getElementById('usersTableWrap');
    var pagination = document.getElementById('usersPagination');
    var totalPages = Math.ceil(usersAllData.length / USER_PAGE_SIZE) || 1;
    var start      = usersCurrentPage * USER_PAGE_SIZE;
    var pageUsers  = usersAllData.slice(start, start + USER_PAGE_SIZE);

    renderUsersTable(pageUsers, wrap);

    // Update pagination
    var showing = usersAllData.length
      ? (start + 1) + '–' + Math.min(start + USER_PAGE_SIZE, usersAllData.length) + ' of ' + usersAllData.length + ' users'
      : '';
    document.getElementById('usersPaginationInfo').textContent = showing;
    document.getElementById('usersPageIndicator').textContent  = 'Page ' + (usersCurrentPage + 1) + ' of ' + totalPages;
    document.getElementById('usersPrevBtn').disabled = usersCurrentPage === 0;
    document.getElementById('usersNextBtn').disabled = usersCurrentPage >= totalPages - 1;
    pagination.style.display = usersAllData.length > USER_PAGE_SIZE ? '' : 'none';

    // Scroll back to top of table on page change
    var scrollWrap = document.querySelector('.users-table-scroll');
    if (scrollWrap) scrollWrap.scrollTop = 0;
  }

  function userInitials(name, email) {
    var src = (name || email || '?').trim().split(/\s+/);
    if (src.length >= 2) return (src[0][0] + src[src.length - 1][0]).toUpperCase();
    return src[0][0].toUpperCase();
  }

  function renderUsersTable(users, wrap) {
    if (!users.length) {
      wrap.innerHTML = '<div class="users-table-loading">No users found. Sign out and back in to register.</div>';
      return;
    }

    var rows = users.map(function (u) {
      var s         = u.stats || {};
      var name      = esc(u.name  || '—');
      var email     = esc(u.email || '—');
      var joined    = u.createdAt  ? new Date(u.createdAt).toLocaleDateString()  : '—';
      var lastActive = s.lastActive ? relativeTime(s.lastActive) : (u.lastLoginAt ? relativeTime(u.lastLoginAt) : '—');

      var avatarHtml = u.picture
        ? '<img class="user-avatar-sm" src="' + esc(u.picture) + '" alt="" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'inline-flex\'">' +
          '<span class="user-initials-sm" style="display:none">' + userInitials(u.name, u.email) + '</span>'
        : '<span class="user-initials-sm">' + userInitials(u.name, u.email) + '</span>';

      // Activity badges
      var activityHtml = s.totalQueries
        ? '<span style="font-size:11px;font-weight:600;color:#1f2937">' + s.totalQueries + '</span>' +
          '<span style="font-size:10px;color:#9ca3af;margin-left:4px">(' + (s.totalScans || 0) + ' scans · ' + (s.totalExplains || 0) + ' explains)</span>'
        : '<span style="font-size:11px;color:#d1d5db">—</span>';

      // Properties list — show up to 2, rest in tooltip
      var props = s.properties || [];
      var propsHtml;
      if (!props.length) {
        propsHtml = '<span style="font-size:11px;color:#d1d5db">—</span>';
      } else {
        var visible = props.slice(0, 2).map(function (p) {
          return '<span style="display:inline-block;font-size:10px;background:#eff4ff;color:#3730a3;border:1px solid #c7d7fd;border-radius:4px;padding:1px 6px;margin:1px 2px 1px 0;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis" title="' + esc(p) + '">' + esc(p) + '</span>';
        }).join('');
        var extra = props.length > 2
          ? '<span style="font-size:10px;color:#6b7280;cursor:default" title="' + esc(props.join(', ')) + '">+' + (props.length - 2) + ' more</span>'
          : '';
        propsHtml = visible + extra;
      }

      // Tokens
      var totalTok = (s.totalInputTokens || 0) + (s.totalOutputTokens || 0);
      var tokHtml  = totalTok
        ? '<span style="font-size:11px;font-weight:600;color:#1f2937">' + formatTokens(totalTok) + '</span>' +
          '<br><span style="font-size:10px;color:#9ca3af">' + formatTokens(s.totalInputTokens || 0) + ' in / ' + formatTokens(s.totalOutputTokens || 0) + ' out</span>'
        : '<span style="font-size:11px;color:#d1d5db">—</span>';

      return '<tr>' +
        '<td><div class="user-name-cell">' + avatarHtml + '<span style="font-size:12px;font-weight:500">' + name + '</span></div></td>' +
        '<td style="white-space:nowrap">' + email +
          '<button class="copy-btn" data-copy="' + email + '" title="Copy email"><i class="fas fa-copy"></i></button>' +
        '</td>' +
        '<td>' + activityHtml + '</td>' +
        '<td>' + propsHtml + '</td>' +
        '<td style="font-size:11px;color:#374151;white-space:nowrap">' + lastActive + '</td>' +
        '<td>' + tokHtml + '</td>' +
        '<td style="font-size:11px;color:#6b7280;white-space:nowrap">' + joined + '</td>' +
        '</tr>';
    }).join('');

    wrap.innerHTML =
      '<table class="users-table">' +
        '<thead><tr>' +
          '<th>User</th>' +
          '<th>Email</th>' +
          '<th>Activity</th>' +
          '<th>Properties Scanned</th>' +
          '<th>Last Active</th>' +
          '<th>Tokens Used</th>' +
          '<th>Joined</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>';

    wrap.querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var text = btn.getAttribute('data-copy');
        navigator.clipboard.writeText(text).then(function () {
          btn.innerHTML = '<i class="fas fa-check"></i>';
          setTimeout(function () { btn.innerHTML = '<i class="fas fa-copy"></i>'; }, 1500);
        }).catch(function () {});
      });
    });
  }

  // ── AI Controls ──────────────────────────────────────────────────────────

  async function fetchAndRenderAIControl(session) {
    var loadingEl = document.getElementById('aiControlLoading');
    var contentEl = document.getElementById('aiControlContent');
    try {
      var data = await callLambda({ type: 'config', sessionToken: session.sessionToken });
      aiCurrentConfig = data;
      loadingEl.style.display = 'none';
      contentEl.style.display = '';
      renderAIControl(data);
    } catch (err) {
      loadingEl.innerHTML =
        '<span style="color:#ef4444"><i class="fas fa-exclamation-circle" style="margin-right:5px"></i>' +
        esc(err.message) + '</span>';
    }
  }

  function renderAIControl(config) {
    var dot         = document.getElementById('aiStatusDot');
    var label       = document.getElementById('aiStatusLabel');
    var toggleBtn   = document.getElementById('aiToggleBtn');
    var reasonWrap  = document.getElementById('aiDisabledReasonWrap');
    var reasonEl    = document.getElementById('aiDisabledReason');
    var todayEl     = document.getElementById('aiTodayCost');
    var limitEl     = document.getElementById('aiCostLimitDisplay');
    var fillEl      = document.getElementById('aiProgressFill');
    var pctEl       = document.getElementById('aiProgressPct');
    var limitInput  = document.getElementById('aiCostLimitInput');

    var enabled = config.ai_enabled !== false;
    dot.className      = 'ai-status-dot ' + (enabled ? 'enabled' : 'disabled');
    label.textContent  = enabled ? 'AI Enabled' : 'AI Disabled';
    toggleBtn.textContent = enabled ? 'Disable AI' : 'Enable AI';
    toggleBtn.className   = 'ai-toggle-btn ' + (enabled ? 'btn-disable' : 'btn-enable');

    if (!enabled && config.disabled_reason) {
      reasonEl.textContent   = config.disabled_reason;
      reasonWrap.style.display = '';
    } else {
      reasonWrap.style.display = 'none';
    }

    var limit       = typeof config.cost_limit_usd === 'number' ? config.cost_limit_usd : 5;
    var todayCost   = config.today_cost_usd || 0;
    todayEl.textContent = formatCost(todayCost);
    limitEl.textContent = formatCost(limit);
    limitInput.value    = limit.toFixed(2);

    var pct = limit > 0 ? Math.min(100, Math.round((todayCost / limit) * 100)) : 0;
    fillEl.style.width = pct + '%';
    fillEl.className   = 'ai-progress-fill' + (pct >= 100 ? ' danger' : pct >= 75 ? ' warn' : '');
    pctEl.textContent  = pct + '%';
  }

  document.getElementById('aiToggleBtn').addEventListener('click', async function () {
    var btn   = this;
    var errEl = document.getElementById('aiControlError');
    if (!aiCurrentConfig) return;
    errEl.style.display = 'none';

    var newEnabled = !aiCurrentConfig.ai_enabled;
    var reason = '';
    if (!newEnabled) {
      var typed = window.prompt('Reason for disabling AI (optional):');
      if (typed === null) return; // cancelled
      reason = typed.trim() || 'Manually disabled by admin.';
    }

    btn.disabled = true;
    try {
      var session = window.TagScannerAuth && window.TagScannerAuth.getSession();
      await callLambda({
        type: 'setConfig', sessionToken: session.sessionToken,
        ai_enabled: newEnabled, disabled_reason: newEnabled ? '' : reason
      });
      aiCurrentConfig.ai_enabled       = newEnabled;
      aiCurrentConfig.disabled_reason  = newEnabled ? '' : reason;
      renderAIControl(aiCurrentConfig);
    } catch (err) {
      errEl.textContent   = err.message;
      errEl.style.display = '';
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('aiSaveLimitBtn').addEventListener('click', async function () {
    var btn   = this;
    var errEl = document.getElementById('aiControlError');
    errEl.style.display = 'none';
    var val = parseFloat(document.getElementById('aiCostLimitInput').value);
    if (isNaN(val) || val < 0.5) {
      errEl.textContent   = 'Enter a valid limit (minimum $0.50).';
      errEl.style.display = '';
      return;
    }
    btn.disabled = true;
    try {
      var session = window.TagScannerAuth && window.TagScannerAuth.getSession();
      await callLambda({ type: 'setConfig', sessionToken: session.sessionToken, cost_limit_usd: val });
      if (aiCurrentConfig) { aiCurrentConfig.cost_limit_usd = val; renderAIControl(aiCurrentConfig); }
    } catch (err) {
      errEl.textContent   = err.message;
      errEl.style.display = '';
    } finally {
      btn.disabled = false;
    }
  });

  // ── Zero-state ────────────────────────────────────────────────────────────

  function renderZeroState() {
    var zero = { total: 0, totalScans: 0, totalExplains: 0, feedbackPct: 0,
                 totalInput: 0, totalOutput: 0, totalTokens: 0,
                 scanInput: 0, scanOutput: 0, explainInput: 0, explainOutput: 0 };
    renderStats(zero);
    renderBarChart([]);
    renderDoughnutChart(zero);
    renderCost(zero);
    renderActivity([]);
  }

  // ── Main init ─────────────────────────────────────────────────────────────

  async function init() {
    showState('loading');

    var session = window.TagScannerAuth && window.TagScannerAuth.getSession();
    if (!session) { showState('login'); return; }

    // Server-side admin gate — config endpoint 403s non-admins
    try {
      await callLambda({ type: 'config', sessionToken: session.sessionToken });
    } catch (err) {
      showState('restricted');
      return;
    }

    try {
      var data  = await callLambda({ type: 'history', sessionToken: session.sessionToken, limit: 50 });
      var items = data.items || [];
      var stats = computeStats(items);

      renderProfile(session, data.user);
      renderStats(stats);
      renderBarChart(items);
      renderDoughnutChart(stats);
      renderCost(stats);
      renderActivity(items);
      showState('dashboard');
      fetchAndRenderUsers(session);
      fetchAndRenderAIControl(session);

    } catch (err) {
      renderProfile(session, null);
      renderZeroState();
      showError('Could not load dashboard data: ' + (err.message || 'Unknown error') + '. Try reloading.');
      showState('dashboard');
      fetchAndRenderUsers(session);
      fetchAndRenderAIControl(session);
    }
  }

  // ── Sign-in ───────────────────────────────────────────────────────────────

  document.getElementById('btnSignIn').addEventListener('click', async function () {
    var btn   = document.getElementById('btnSignIn');
    var errEl = document.getElementById('signinError');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    errEl.style.display = 'none';
    try {
      await window.TagScannerAuth.signInWithGoogle();
      init();
    } catch (err) {
      errEl.textContent   = err.message || 'Sign-in failed. Please try again.';
      errEl.style.display = 'block';
      btn.disabled        = false;
      btn.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" style="flex-shrink:0">' +
        '<path fill="#4285F4" d="M47.53 24.56c0-1.6-.14-3.14-.4-4.62H24v8.73h13.2c-.57 3.03-2.3 5.59-4.9 7.32v6.08h7.93c4.64-4.28 7.3-10.58 7.3-17.51z"/>' +
        '<path fill="#34A853" d="M24 48c6.66 0 12.24-2.21 16.32-5.98l-7.93-6.08c-2.2 1.47-5.01 2.34-8.39 2.34-6.45 0-11.91-4.35-13.86-10.21H2.08v6.28C6.14 42.62 14.43 48 24 48z"/>' +
        '<path fill="#FBBC05" d="M10.14 28.07A14.42 14.42 0 0 1 9.6 24c0-1.41.24-2.78.54-4.07v-6.28H2.08A23.98 23.98 0 0 0 0 24c0 3.88.93 7.55 2.08 10.35l8.06-6.28z"/>' +
        '<path fill="#EA4335" d="M24 9.52c3.63 0 6.88 1.25 9.44 3.7l7.08-7.08C36.23 2.19 30.65 0 24 0 14.43 0 6.14 5.38 2.08 13.65l8.06 6.28C12.09 13.87 17.55 9.52 24 9.52z"/>' +
        '</svg> Continue with Google';
    }
  });

  // ── Sign-out (restricted page) ────────────────────────────────────────────

  document.getElementById('btnRestrictedSignOut').addEventListener('click', function () {
    window.TagScannerAuth.signOut();
    location.reload();
  });

  // ── Sign-out (dashboard) ──────────────────────────────────────────────────

  document.getElementById('btnSignOut').addEventListener('click', function () {
    window.TagScannerAuth.signOut();
    if (barChartInstance)      { barChartInstance.destroy();      barChartInstance = null; }
    if (doughnutChartInstance) { doughnutChartInstance.destroy(); doughnutChartInstance = null; }
    // Full reload — clears all in-memory state and shows login gate from scratch
    location.reload();
  });

  // ── Users pagination ──────────────────────────────────────────────────────

  document.getElementById('usersPrevBtn').addEventListener('click', function () {
    if (usersCurrentPage > 0) { usersCurrentPage--; renderUsersPage(); }
  });

  document.getElementById('usersNextBtn').addEventListener('click', function () {
    var totalPages = Math.ceil(usersAllData.length / USER_PAGE_SIZE);
    if (usersCurrentPage < totalPages - 1) { usersCurrentPage++; renderUsersPage(); }
  });

  // ── Boot ──────────────────────────────────────────────────────────────────

  init();

})();
