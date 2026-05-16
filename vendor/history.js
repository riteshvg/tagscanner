(function () {
  'use strict';

  var TS_PROXY_URL = 'https://ihn2pz2dbcktbxvn36g6pfptda0jfnri.lambda-url.us-east-1.on.aws/';
  var currentFilter = 'all';
  var lastKey       = null;
  var allItems      = [];

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function relativeTime(iso) {
    var ms   = Date.now() - new Date(iso).getTime();
    var secs = Math.floor(ms / 1000);
    if (secs < 60)  return 'just now';
    var mins = Math.floor(secs / 60);
    if (mins < 60)  return mins + 'm ago';
    var hrs  = Math.floor(mins / 60);
    if (hrs  < 24)  return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    return days + 'd ago';
  }

  async function callLambda(body) {
    var res  = await fetch(TS_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await res.json().catch(function () { return { error: 'Invalid response' }; });
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  var propertyKey = (function () {
    var n = sessionStorage.getItem('launch_property_name') || '';
    var e = sessionStorage.getItem('launch_property_environment') || 'Production';
    return n ? n + '#' + e : null;
  })();

  async function loadHistory(append) {
    var session = window.TagScannerAuth && window.TagScannerAuth.getSession();
    if (!session) {
      document.getElementById('loading').style.display    = 'none';
      document.getElementById('signInPrompt').style.display = '';
      return;
    }

    document.getElementById('loading').style.display = '';
    try {
      var body = { type: 'history', sessionToken: session.sessionToken, limit: 25 };
      if (propertyKey) body.propertyKey = propertyKey;
      if (append && lastKey) body.lastKey = lastKey;

      var data = await callLambda(body);
      lastKey = data.lastKey || null;

      if (append) {
        allItems = allItems.concat(data.items || []);
      } else {
        allItems = data.items || [];
      }

      // Update user chip
      var chip = document.getElementById('userChip');
      if (chip && data.user) {
        chip.style.display = 'flex';
        chip.innerHTML =
          (data.user.picture ? '<img src="' + esc(data.user.picture) + '">' : '') +
          '<span>' + esc(data.user.name || data.user.email) + '</span>';
      }

      renderItems();

      document.getElementById('loadMoreBtn').style.display = lastKey ? '' : 'none';
    } catch (err) {
      document.getElementById('loading').innerHTML = '<span style="color:#ef4444">' + esc(err.message) + '</span>';
    } finally {
      document.getElementById('loading').style.display = 'none';
    }
  }

  function renderItems() {
    var filtered = currentFilter === 'all'
      ? allItems
      : allItems.filter(function (q) { return q.type === currentFilter; });

    var list = document.getElementById('historyList');
    var empty = document.getElementById('emptyState');

    if (!filtered.length) {
      list.style.display  = 'none';
      empty.style.display = '';
      return;
    }

    empty.style.display = 'none';
    list.style.display  = '';
    list.innerHTML = filtered.map(function (q) { return renderCard(q); }).join('');

    // Wire download buttons
    list.querySelectorAll('[data-download]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        handleDownload(
          btn.getAttribute('data-query-id'),
          btn.getAttribute('data-owner-id'),
          btn.getAttribute('data-query-type'),
          btn.getAttribute('data-query-summary'),
          btn
        );
      });
    });

    // Wire view-explain buttons
    list.querySelectorAll('[data-view-explain]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        handleViewExplanation(
          btn.getAttribute('data-query-id'),
          btn.getAttribute('data-owner-id'),
          btn
        );
      });
    });

    // Wire feedback buttons
    list.querySelectorAll('[data-vote]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var queryId = btn.getAttribute('data-query-id');
        var rating  = btn.getAttribute('data-vote');
        handleFeedbackVote(queryId, rating, btn);
      });
    });

    list.querySelectorAll('[data-submit-feedback]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var queryId  = btn.getAttribute('data-query-id');
        var inputEl  = document.getElementById('fb-text-' + queryId);
        var text     = inputEl ? inputEl.value.trim() : '';
        var rating   = btn.getAttribute('data-current-rating') || 'positive';
        handleFeedbackVote(queryId, rating, btn, text);
      });
    });
  }

  function renderCard(q) {
    var badgeClass = q.type === 'scan' ? 'badge-scan' : q.type === 'chat' ? 'badge-chat' : 'badge-explain';
    var badgeLabel = q.type === 'scan' ? 'Scan' : q.type === 'chat' ? 'Chat' : 'Explain';
    var feedbackHtml = '';

    if (q.feedback) {
      var votedPos = q.feedback === 'positive' ? 'voted-positive' : '';
      var votedNeg = q.feedback === 'negative' ? 'voted-negative' : '';
      feedbackHtml =
        '<div class="feedback-bar">' +
        '<span class="feedback-label">Your feedback:</span>' +
        '<button class="feedback-btn ' + votedPos + '" data-vote="positive" data-query-id="' + esc(q.queryId) + '"><i class="fas fa-thumbs-up"></i></button>' +
        '<button class="feedback-btn ' + votedNeg + '" data-vote="negative" data-query-id="' + esc(q.queryId) + '"><i class="fas fa-thumbs-down"></i></button>' +
        (q.feedbackText ? '<span style="font-size:11px;color:#6b7280;margin-left:4px">"' + esc(q.feedbackText) + '"</span>' : '') +
        '</div>';
    } else {
      feedbackHtml =
        '<div class="feedback-bar">' +
        '<span class="feedback-label">Helpful?</span>' +
        '<button class="feedback-btn" data-vote="positive" data-query-id="' + esc(q.queryId) + '"><i class="fas fa-thumbs-up"></i></button>' +
        '<button class="feedback-btn" data-vote="negative" data-query-id="' + esc(q.queryId) + '"><i class="fas fa-thumbs-down"></i></button>' +
        '<input id="fb-text-' + esc(q.queryId) + '" class="feedback-text-input" placeholder="Optional comment…" />' +
        '<button class="feedback-btn feedback-submit" data-submit-feedback data-query-id="' + esc(q.queryId) + '">Send</button>' +
        '</div>';
    }

    var tokensStr = '';
    if (q.tokens && (q.tokens.input || q.tokens.output)) {
      tokensStr = '<div class="query-tokens"><i class="fas fa-coins" style="margin-right:4px;font-size:10px"></i>' +
        q.tokens.input + ' in / ' + q.tokens.output + ' out tokens</div>';
    }

    var downloadBtn = q.hasResult
      ? '<button class="btn-download" data-download data-query-id="' + esc(q.queryId) + '" data-owner-id="' + esc(q.userId || '') + '" data-query-type="' + esc(q.type) + '" data-query-summary="' + esc(q.requestSummary || '') + '" title="Download result as PDF"><i class="fas fa-download"></i></button>'
      : '';

    var viewExplainBtn = (q.type === 'explain' && q.hasResult)
      ? '<button class="btn-view-explain" data-view-explain data-query-id="' + esc(q.queryId) + '" data-owner-id="' + esc(q.userId || '') + '" title="View explanation"><i class="fas fa-lightbulb"></i></button>'
      : '';

    var explainPanel = (q.type === 'explain' && q.hasResult)
      ? '<div id="explain-panel-' + esc(q.queryId) + '" class="history-explain-panel" style="display:none"></div>'
      : '';

    var userStr = (q.userName || q.email)
      ? '<div class="query-user"><i class="fas fa-user-circle"></i>' + esc(q.userName || q.email) + '</div>'
      : '';

    return '<div class="query-card" id="card-' + esc(q.queryId) + '">' +
      '<div class="query-card-header">' +
      '<div style="display:flex;align-items:center;gap:7px;flex:1;min-width:0">' +
      '<span class="query-type-badge ' + badgeClass + '">' + badgeLabel + '</span>' +
      '<span class="query-summary">' + esc(q.requestSummary || '') + '</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">' +
      viewExplainBtn +
      downloadBtn +
      '<span class="query-time">' + relativeTime(q.createdAt) + '</span>' +
      '</div>' +
      '</div>' +
      userStr +
      tokensStr +
      feedbackHtml +
      explainPanel +
      '</div>';
  }

  // ── View Explanation ─────────────────────────────────────────────────────

  async function handleViewExplanation(queryId, ownerId, btn) {
    var session = window.TagScannerAuth && window.TagScannerAuth.getSession();
    if (!session) return;

    var panel = document.getElementById('explain-panel-' + queryId);
    if (!panel) return;

    // Toggle: if already visible, hide it
    if (panel.style.display !== 'none') {
      panel.style.display = 'none';
      btn.classList.remove('active');
      btn.title = 'View explanation';
      return;
    }

    // If already loaded, just show
    if (panel.dataset.loaded) {
      panel.style.display = '';
      btn.classList.add('active');
      btn.title = 'Hide explanation';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
      var detailBody = { type: 'detail', sessionToken: session.sessionToken, queryId: queryId };
      if (ownerId && ownerId !== session.userId) detailBody.ownerId = ownerId;
      var data = await callLambda(detailBody);
      var result = data.item && data.item.resultJson;
      if (!result) throw new Error('No explanation stored for this entry.');

      var html = '';
      if (window.TagScannerBedrock && window.TagScannerBedrock.renderBedrockCodeExplanation) {
        html = window.TagScannerBedrock.renderBedrockCodeExplanation(result);
      } else {
        html = '<div style="padding:12px;font-size:13px;color:#374151"><strong>Purpose:</strong><br>' + esc(result.purpose || '') + '</div>';
      }

      var model = data.item && data.item.model;
      var footnote = model
        ? '<div style="margin-top:14px;padding-top:8px;border-top:1px solid #f3f4f6;font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:5px"><i class="fas fa-microchip" style="font-size:10px;color:#c4b5fd"></i>Generated by <strong style="color:#6b7280;margin-left:3px">' + esc(model) + '</strong></div>'
        : '';

      panel.innerHTML = html + footnote;
      panel.dataset.loaded = '1';
      panel.style.display = '';
      btn.classList.add('active');
      btn.title = 'Hide explanation';
    } catch (err) {
      panel.innerHTML = '<div style="padding:10px;color:#ef4444;font-size:12px"><i class="fas fa-exclamation-circle"></i> ' + esc(err.message || 'Failed to load explanation.') + '</div>';
      panel.style.display = '';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-lightbulb"></i>';
    }
  }

  async function handleFeedbackVote(queryId, rating, btn, text) {
    var session = window.TagScannerAuth && window.TagScannerAuth.getSession();
    if (!session) return;

    // Show text input after first click if no text yet
    var card     = document.getElementById('card-' + queryId);
    var inputEl  = document.getElementById('fb-text-' + queryId);
    var submitEl = card && card.querySelector('[data-submit-feedback]');

    if (!text && inputEl && inputEl.style.display === 'none') {
      inputEl.style.display  = 'inline-block';
      if (submitEl) {
        submitEl.style.display = 'inline-block';
        submitEl.setAttribute('data-current-rating', rating);
      }
      // Highlight the selected vote button
      card && card.querySelectorAll('[data-vote]').forEach(function (b) {
        b.classList.remove('voted-positive', 'voted-negative');
      });
      btn.classList.add(rating === 'positive' ? 'voted-positive' : 'voted-negative');
      return;
    }

    btn.disabled = true;
    try {
      await callLambda({
        type:         'feedback',
        sessionToken: session.sessionToken,
        queryId:      queryId,
        rating:       rating,
        text:         text || ''
      });
      // Update item in cache
      var item = allItems.find(function (q) { return q.queryId === queryId; });
      if (item) { item.feedback = rating; item.feedbackText = text || ''; }
      renderItems();
    } catch (err) {
      console.error('Feedback error:', err);
      btn.disabled = false;
    }
  }

  // ── Download ──────────────────────────────────────────────────────────────

  async function handleDownload(queryId, ownerId, type, summary, btn) {
    var session = window.TagScannerAuth && window.TagScannerAuth.getSession();
    if (!session) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
      var detailBody = { type: 'detail', sessionToken: session.sessionToken, queryId: queryId };
      if (ownerId && ownerId !== session.userId) detailBody.ownerId = ownerId;
      var data = await callLambda(detailBody);
      var result = data.item && data.item.resultJson;
      if (!result) throw new Error('No result stored for this entry.');

      var meta = {
        type:      type,
        summary:   summary,
        createdAt: data.item.createdAt,
        tokens:    data.item.tokens
      };

      var slug = (summary || type).replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 50);
      var filename = 'TagScanner-' + type + '-' + slug + '.pdf';
      var doc = generateReportPDF(result, meta);
      doc.save(filename);
    } catch (err) {
      alert(err.message || 'Download failed.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-download"></i>';
    }
  }

  function generateReportPDF(result, meta) {
    var JsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!JsPDF) throw new Error('PDF library not available.');

    var doc   = new JsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    var margin = 40;
    var pageW  = doc.internal.pageSize.getWidth();
    var pageH  = doc.internal.pageSize.getHeight();
    var maxW   = pageW - margin * 2;
    var y      = margin;

    function checkPage(needed) {
      if (y + (needed || 20) > pageH - margin) { doc.addPage(); y = margin; }
    }

    function addText(text, size, bold, color, indent) {
      var s = size || 10;
      doc.setFontSize(s);
      doc.setFont(undefined, bold ? 'bold' : 'normal');
      if (color) doc.setTextColor(color[0], color[1], color[2]);
      else doc.setTextColor(30, 30, 30);
      var lines = doc.splitTextToSize(String(text || ''), maxW - (indent || 0));
      checkPage(lines.length * s * 1.5 + 4);
      doc.text(lines, margin + (indent || 0), y);
      y += lines.length * s * 1.5;
    }

    function addSectionHeader(label) {
      checkPage(30);
      y += 10;
      doc.setFillColor(78, 115, 223);
      doc.roundedRect(margin, y - 13, maxW, 20, 2, 2, 'F');
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(label.toUpperCase(), margin + 8, y);
      doc.setTextColor(30, 30, 30);
      y += 12;
    }

    function gap(px) { y += (px || 8); }

    function autoTable(head, body, colStyles) {
      doc.autoTable({
        head:        [head],
        body:        body,
        startY:      y,
        margin:      { left: margin, right: margin },
        styles:      { fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
        headStyles:  { fillColor: [78, 115, 223], textColor: 255, fontStyle: 'bold' },
        columnStyles: colStyles || {}
      });
      y = doc.lastAutoTable.finalY + 6;
    }

    // ── Header banner ─────────────────────────────────────────────────────
    doc.setFillColor(26, 29, 35);
    doc.rect(0, 0, pageW, 54, 'F');
    doc.setFontSize(15);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('TagScanner', margin, 28);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(156, 163, 175);
    doc.text('Adobe Tags (Launch) Inspector', margin, 42);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(97, 218, 251);
    var typeLabel = meta.type === 'scan' ? 'Health Scan Report' : 'Code Explanation Report';
    doc.text(typeLabel, pageW - margin, 28, { align: 'right' });
    y = 70;

    // ── Meta row ──────────────────────────────────────────────────────────
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(107, 114, 128);
    var dateStr = meta.createdAt ? new Date(meta.createdAt).toLocaleString() : new Date().toLocaleString();
    doc.text('Analyzed: ' + dateStr + '   |   Exported: ' + new Date().toLocaleString(), margin, y);
    y += 13;
    if (meta.tokens) {
      doc.text('Tokens: ' + (meta.tokens.input || 0) + ' input / ' + (meta.tokens.output || 0) + ' output', margin, y);
      y += 13;
    }
    if (meta.summary) {
      doc.setTextColor(55, 65, 81);
      doc.setFont(undefined, 'bold');
      doc.text(meta.summary, margin, y);
      y += 13;
    }
    doc.setDrawColor(220, 222, 230);
    doc.line(margin, y, pageW - margin, y);
    y += 14;

    // ── Scan report ───────────────────────────────────────────────────────
    if (meta.type === 'scan') {
      var grade = result.health_grade || '?';
      var score = typeof result.health_score === 'number' ? result.health_score : 0;
      var gc    = grade === 'A' ? [16,185,129] : grade === 'B' ? [59,130,246] :
                  grade === 'C' ? [245,158,11] : grade === 'D' ? [249,115,22] : [239,68,68];

      // Score circle
      checkPage(80);
      var cx = margin + 34, cy = y + 30;
      doc.setDrawColor(gc[0], gc[1], gc[2]);
      doc.setLineWidth(2.5);
      doc.circle(cx, cy, 26, 'S');
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(gc[0], gc[1], gc[2]);
      doc.text(String(score), cx, cy + 2, { align: 'center' });
      doc.setFontSize(8);
      doc.text('Grade ' + grade, cx, cy + 13, { align: 'center' });

      // Executive summary beside circle
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(30, 30, 30);
      var sumLines = doc.splitTextToSize(result.executive_summary || '', maxW - 82);
      doc.text(sumLines, margin + 76, y + 8);
      y += Math.max(72, sumLines.length * 14 + 16);

      // Category scores
      addSectionHeader('Category Scores');
      gap(4);
      var cats = [
        { key: 'rules',         label: 'Rules' },
        { key: 'data_elements', label: 'Data Elements' },
        { key: 'extensions',    label: 'Extensions' },
        { key: 'performance',   label: 'Performance' }
      ];
      autoTable(
        ['Category', 'Score', 'Grade'],
        cats.map(function(c) {
          var v = (result.category_scores || {})[c.key] || 0;
          var g = v >= 90 ? 'A' : v >= 80 ? 'B' : v >= 70 ? 'C' : v >= 60 ? 'D' : 'F';
          return [c.label, v + '/100', g];
        }),
        { 0: { cellWidth: 200 }, 1: { cellWidth: 90, halign: 'center' }, 2: { cellWidth: 60, halign: 'center' } }
      );

      // Critical issues
      var critical = result.critical_issues || [];
      if (critical.length) {
        addSectionHeader('Critical Issues');
        gap(4);
        doc.autoTable({
          head:       [['Issue', 'Description', 'Fix']],
          body:       critical.map(function(i) { return [i.title || '', i.description || '', i.fix || '']; }),
          startY:     y,
          margin:     { left: margin, right: margin },
          styles:     { fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
          headStyles: { fillColor: [185, 28, 28], textColor: 255, fontStyle: 'bold' },
          columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 200 }, 2: { cellWidth: maxW - 310 } }
        });
        y = doc.lastAutoTable.finalY + 6;
      }

      // Warnings
      var warnings = result.warnings || [];
      if (warnings.length) {
        addSectionHeader('Warnings');
        gap(4);
        doc.autoTable({
          head:       [['Warning', 'Description', 'Recommendation']],
          body:       warnings.map(function(w) { return [w.title || '', w.description || '', w.recommendation || '']; }),
          startY:     y,
          margin:     { left: margin, right: margin },
          styles:     { fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
          headStyles: { fillColor: [146, 64, 14], textColor: 255, fontStyle: 'bold' },
          columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 200 }, 2: { cellWidth: maxW - 310 } }
        });
        y = doc.lastAutoTable.finalY + 6;
      }

      // Quick wins
      var wins = result.quick_wins || [];
      if (wins.length) {
        addSectionHeader('Quick Wins');
        gap(4);
        doc.autoTable({
          head:       [['Win', 'Description', 'Est. Savings']],
          body:       wins.map(function(w) { return [w.title || '', w.description || '', w.estimated_savings_kb ? '~' + w.estimated_savings_kb + ' KB' : '']; }),
          startY:     y,
          margin:     { left: margin, right: margin },
          styles:     { fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
          headStyles: { fillColor: [6, 95, 70], textColor: 255, fontStyle: 'bold' },
          columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 300 }, 2: { cellWidth: maxW - 410 } }
        });
        y = doc.lastAutoTable.finalY + 6;
      }

      // Top recommendations
      var recs = result.top_recommendations || [];
      if (recs.length) {
        addSectionHeader('Top Recommendations');
        gap(4);
        autoTable(
          ['#', 'Recommendation'],
          recs.map(function(r, i) { return [String(i + 1), r]; }),
          { 0: { cellWidth: 24, halign: 'center' } }
        );
      }

    // ── Explain report ────────────────────────────────────────────────────
    } else {
      addSectionHeader('Purpose');
      gap(4);
      addText(result.purpose || '', 10);
      gap(4);

      var steps = result.how_it_works || [];
      if (steps.length) {
        addSectionHeader('How It Works');
        gap(4);
        autoTable(
          ['Step', 'Description'],
          steps.map(function(s, i) { return [String(i + 1), s]; }),
          { 0: { cellWidth: 30, halign: 'center' } }
        );
      }

      var sources = result.data_sources || [];
      if (sources.length) {
        addSectionHeader('Data Sources');
        gap(4);
        autoTable(
          ['Kind', 'Path', 'Description'],
          sources.map(function(s) { return [s.kind || '', s.path || '', s.description || '']; }),
          { 0: { cellWidth: 90 }, 1: { cellWidth: 120 } }
        );
      }

      if (result.return_type || result.return_description) {
        addSectionHeader('Return Value');
        gap(4);
        addText('Type: ' + (result.return_type || 'unknown'), 9, true);
        gap(3);
        addText(result.return_description || '', 9);
        gap(4);
      }

      var risks = result.risks || [];
      if (risks.length) {
        addSectionHeader('Risks');
        gap(4);
        doc.autoTable({
          head:       [['Severity', 'Issue', 'Fix']],
          body:       risks.map(function(r) { return [(r.severity || '').toUpperCase(), r.issue || '', r.fix || '']; }),
          startY:     y,
          margin:     { left: margin, right: margin },
          styles:     { fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
          headStyles: { fillColor: [185, 28, 28], textColor: 255, fontStyle: 'bold' },
          columnStyles: { 0: { cellWidth: 60, halign: 'center' }, 1: { cellWidth: 190 }, 2: { cellWidth: maxW - 250 } }
        });
        y = doc.lastAutoTable.finalY + 6;
      }

      var cmds = result.debug_commands || [];
      if (cmds.length) {
        addSectionHeader('Debug Commands');
        gap(4);
        cmds.forEach(function(cmd) {
          doc.setFillColor(248, 249, 252);
          var lines = doc.splitTextToSize(cmd, maxW - 16);
          var boxH  = lines.length * 12 + 10;
          checkPage(boxH + 6);
          doc.roundedRect(margin, y - 2, maxW, boxH, 2, 2, 'F');
          doc.setFontSize(8);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(55, 65, 81);
          doc.text(lines, margin + 8, y + 8);
          y += boxH + 6;
        });
        gap(2);
      }

      if (result.tags_context) {
        addSectionHeader('Adobe Tags Context');
        gap(4);
        addText(result.tags_context, 10);
      }
    }

    // ── Page footers ──────────────────────────────────────────────────────
    var totalPages = doc.internal.getNumberOfPages();
    for (var pg = 1; pg <= totalPages; pg++) {
      doc.setPage(pg);
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(156, 163, 175);
      doc.text(
        'TagScanner  •  tagscannerfeedback@gmail.com  •  Page ' + pg + ' of ' + totalPages,
        pageW / 2, pageH - 18, { align: 'center' }
      );
    }

    return doc;
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  document.querySelectorAll('.filter-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter');
      renderItems();
    });
  });

  document.getElementById('loadMoreBtn').addEventListener('click', function () {
    loadHistory(true);
  });

  var btnSignIn = document.getElementById('btnSignIn');
  if (btnSignIn) {
    btnSignIn.addEventListener('click', async function () {
      if (!window.TagScannerAuth) return;
      var errEl = document.getElementById('signInError');
      btnSignIn.disabled = true;
      btnSignIn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in…';
      if (errEl) errEl.style.display = 'none';
      try {
        await window.TagScannerAuth.signInWithGoogle();
        document.getElementById('signInPrompt').style.display = 'none';
        loadHistory(false);
      } catch (err) {
        btnSignIn.disabled = false;
        btnSignIn.innerHTML = '<i class="fab fa-google"></i> Sign in with Google';
        if (errEl) {
          errEl.textContent = err.message || 'Sign-in failed. Please try again.';
          errEl.style.display = '';
        }
      }
    });
  }

  loadHistory(false);
})();
