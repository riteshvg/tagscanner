// TagScanner — AI Client
// Routes all model calls through the TagScanner Lambda proxy.
(function (global) {
  'use strict';

  const TS_PROXY_URL =
    'https://ihn2pz2dbcktbxvn36g6pfptda0jfnri.lambda-url.us-east-1.on.aws/';

  // ── System Prompt ────────────────────────────────────────────────────────────

  const SYSTEM_PROMPT = `You are an expert Adobe Tags (Launch / Data Collection) implementation auditor with deep knowledge of tag management best practices, performance optimization, and data governance.

You will receive a JSON payload with health metrics for a data collection property. Analyze it and return ONLY a valid JSON object — no markdown fences, no text outside the JSON.

Required response structure:
{
  "health_score": <integer 0-100>,
  "health_grade": "<A|B|C|D|F>",
  "executive_summary": "<2-3 sentences in plain English describing the overall property health>",
  "category_scores": {
    "rules": <0-100>,
    "data_elements": <0-100>,
    "extensions": <0-100>,
    "performance": <0-100>
  },
  "critical_issues": [
    { "title": "<short title>", "description": "<what is wrong>", "impact": "<business/technical impact>", "fix": "<specific actionable fix>" }
  ],
  "warnings": [
    { "title": "<short title>", "description": "<what needs attention>", "recommendation": "<what to do>" }
  ],
  "quick_wins": [
    { "title": "<short title>", "description": "<what to do>", "estimated_savings_kb": <number> }
  ],
  "top_recommendations": ["<ranked action 1>", "<ranked action 2>", "<ranked action 3>", "<ranked action 4>", "<ranked action 5>"],
  "cleanup_impact": {
    "rules_kb": <number>,
    "data_elements_kb": <number>,
    "total_kb": <number>,
    "total_pct": <number>
  }
}

Scoring rubric:
- 90-100 → A: Clean, well-maintained, minimal unused components
- 80-89  → B: Mostly healthy, minor cleanup needed
- 70-79  → C: Notable issues, unused components accumulating
- 60-69  → D: Significant bloat or structural problems
- < 60   → F: Critical issues — high unused %, likely affecting page performance

Factor in: unused component %, custom code prevalence, rules without conditions (fire-on-all), extension bloat, deep DE dependency chains, and property size.
If user_context.concern is set, weight your analysis toward that concern.`;

  // ── Code Explain ─────────────────────────────────────────────────────────────

  const EXPLAIN_SYSTEM_PROMPT = `You are an Adobe Tags (Launch / Data Collection) implementation expert and senior JavaScript developer.

You will receive a JSON object with "code" (the custom code string) and "metadata" (component name and type). Analyze thoroughly and return ONLY a valid JSON object — no markdown fences, no text outside JSON.

Required structure:
{
  "purpose": "<1 sentence: what this code does and why it exists>",
  "how_it_works": ["<step 1>", "<step 2>", ...],
  "data_sources": [
    { "kind": "adobeDataLayer|digitalData|window|cookie|localStorage|sessionStorage|url|satellite|dom", "path": "<exact path accessed>", "description": "<brief: what data this retrieves>" }
  ],
  "return_type": "<string|number|boolean|object|array|void|conditional>",
  "return_description": "<1 sentence: what is returned and under what conditions>",
  "risks": [
    { "severity": "low|medium|high", "issue": "<what can go wrong>", "fix": "<actionable fix>" }
  ],
  "tags_context": "<1 sentence: how this fits into Adobe Tags — what rule or variable it feeds>"
}

Rules: Keep purpose to 1 sentence. Limit how_it_works to 4 steps max, each under 15 words. Be specific about paths. If code is minified, note it as a medium risk.`;

  // ── Proxy helper ─────────────────────────────────────────────────────────────

  async function callProxy(proxyUrl, body) {
    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res
      .json()
      .catch(() => ({ error: 'Invalid proxy response' }));
    if (!res.ok) throw new Error(data.error || 'Proxy error ' + res.status);
    return data;
  }

  async function explainCode(code, metadata, config) {
    const data = await callProxy(TS_PROXY_URL, {
      type:        'explain',
      sessionToken: config.sessionToken || null,
      clientId:     config.clientId     || '',
      email:        config.email        || '',
      code:         code,
      metadata:     metadata            || {},
      propertyKey:  config.propertyKey  || null,
    });
    return {
      explanation:  data.explanation,
      inputTokens:  data.tokens?.input  || 0,
      outputTokens: data.tokens?.output || 0,
      queryId:      data.queryId        || null,
      cached:       data.cached         || false,
      cached_at:    data.cached_at      || null,
      cached_by:    data.cached_by      || null,
      model:        data.model          || 'Claude 3.5 Haiku',
    };
  }

  function renderBedrockCodeExplanation(json) {
    const esc = (s) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const parts = [];
    const sec = (content) => '<div style="margin-top:12px;padding-top:10px;border-top:1px solid #eef0f5">' + content + '</div>';
    const heading = (icon, label) =>
      '<div class="de-analysis-heading" style="margin-bottom:6px"><i class="fas fa-' + icon + '"></i>' + label + '</div>';

    // ── Purpose ───────────────────────────────────────────────────────────────
    if (json.purpose) {
      parts.push('<p class="de-analysis-prose">' + esc(json.purpose) + '</p>');
    }
    if (json.tags_context) {
      parts.push(
        '<div style="font-size:11.5px;color:#6b7280;margin-top:6px;padding:4px 8px;background:#f8f9fb;border-radius:4px;line-height:1.45">' +
        '<i class="fas fa-tag" style="font-size:10px;margin-right:5px;color:#9ca3af"></i>' +
        esc(json.tags_context) + '</div>',
      );
    }

    // ── How it works ─────────────────────────────────────────────────────────
    if (json.how_it_works && json.how_it_works.length) {
      const steps = json.how_it_works
        .map(
          (s, i) =>
            '<li style="margin-bottom:5px;font-size:12.5px;color:#374151;display:flex;align-items:flex-start;gap:8px">' +
            '<span style="color:#4e73df;font-weight:700;font-size:11px;min-width:16px;flex-shrink:0;padding-top:2px">' +
            (i + 1) + '.</span>' +
            '<span style="line-height:1.5">' + esc(s) + '</span>' +
            '</li>',
        )
        .join('');
      parts.push(
        sec(
          heading('list-ol', 'How it works') +
          '<ol style="margin:0;padding-left:0;list-style:none">' + steps + '</ol>',
        ),
      );
    }

    // ── Data flow ─────────────────────────────────────────────────────────────
    const sources = json.data_sources || [];
    const kindColors = {
      adobeDataLayer: '#27c5c1',
      digitalData: '#4e73df',
      window: '#8b5cf6',
      cookie: '#f59e0b',
      localStorage: '#10b981',
      sessionStorage: '#10b981',
      url: '#f97316',
      satellite: '#6b7280',
      dom: '#ef4444',
    };
    if (sources.length || json.return_type) {
      const srcItems =
        sources
          .map((src) => {
            const color = kindColors[src.kind] || '#6b7280';
            return (
              '<div class="de-flow-item" style="border-left-color:' + color + '">' +
              '<div class="de-flow-item-header">' +
              '<span class="de-flow-label" style="margin-bottom:0;flex-shrink:0">' + esc(src.kind || '') + '</span>' +
              '<code style="font-family:\'SFMono-Regular\',Consolas,monospace;font-size:11px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1">' + esc(src.path || '') + '</code>' +
              '</div>' +
              (src.description ? '<div class="de-flow-desc">' + esc(src.description) + '</div>' : '') +
              '</div>'
            );
          })
          .join('') ||
        '<div class="de-flow-none">No external sources detected</div>';

      const retItem =
        '<div class="de-flow-item" style="border-left-color:#4e73df">' +
        '<div class="de-flow-item-header">' +
        '<span class="de-flow-label" style="margin-bottom:0;font-size:11px;font-weight:700;color:#4e73df;background:#e8f0fe;padding:1px 6px;border-radius:3px;text-transform:uppercase">' +
        esc(json.return_type || 'unknown') + '</span>' +
        '</div>' +
        '<div class="de-flow-desc">' + esc(json.return_description || '') + '</div>' +
        '</div>';

      parts.push(
        sec(
          heading('exchange-alt', 'Data flow') +
          '<div class="de-analysis-flow">' +
            '<div class="de-flow-col"><div class="de-flow-label">Reads from</div>' + srcItems + '</div>' +
            '<div class="de-flow-arrow">&rarr;</div>' +
            '<div class="de-flow-col"><div class="de-flow-label">Returns</div>' + retItem + '</div>' +
          '</div>',
        ),
      );
    }

    // ── Risks ─────────────────────────────────────────────────────────────────
    const risks = json.risks || [];
    if (risks.length) {
      const sevColors = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
      const sevBg    = { high: '#fef2f2', medium: '#fffbeb', low: '#f0fdf4' };
      const sevLabels = { high: 'High', medium: 'Medium', low: 'Low' };
      const riskItems = risks
        .map((r) => {
          const color = sevColors[r.severity] || '#6b7280';
          const bg    = sevBg[r.severity]    || '#f9fafb';
          return (
            '<div class="de-risk-item" style="border-left-color:' + color + ';background:' + bg + '">' +
            '<div class="de-risk-text">' +
            '<span style="font-size:10px;font-weight:700;text-transform:uppercase;color:' + color + ';margin-right:6px">' +
            esc(sevLabels[r.severity] || r.severity) + '</span>' +
            esc(r.issue || '') +
            '</div>' +
            (r.fix
              ? '<div class="de-risk-fix"><i class="fas fa-wrench" style="margin-right:4px"></i>' + esc(r.fix) + '</div>'
              : '') +
            '</div>'
          );
        })
        .join('');
      parts.push(sec(heading('exclamation-triangle', 'Potential risks') + riskItems));
    }

    return parts.join('');
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  async function analyzeProperty(healthPayload, userContext, config) {
    const data = await callProxy(TS_PROXY_URL, {
      type: 'scan',
      sessionToken: config.sessionToken || null,
      clientId:     config.clientId     || '',
      email:        config.email        || '',
      payload:      healthPayload,
      userContext:  userContext         || {},
      fingerprint:  config.fingerprint  || null,
    });
    if (!data.report) {
      throw new Error('Proxy response missing report. Got: ' + JSON.stringify(data).slice(0, 300));
    }
    return {
      report:    data.report,
      tokens:    data.tokens   || {},
      cost_usd:  0,
      queryId:   data.queryId  || null,
      cached:    data.cached   || false,
      cached_at: data.cached_at || null,
      cached_by: data.cached_by || null,
    };
  }

  global.TagScannerBedrock = {
    analyzeProperty,
    explainCode,
    renderBedrockCodeExplanation,
  };
})(typeof window !== 'undefined' ? window : this);
