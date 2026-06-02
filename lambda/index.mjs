/**
 * TagScanner AI Proxy — AWS Lambda
 *
 * Deploy:
 *   Runtime : Node.js 20.x
 *   Handler : index.handler
 *   Timeout : 30 s   Memory: 256 MB
 *
 * IAM role needs:
 *   bedrock:InvokeModel on arn:aws:bedrock:<region>::foundation-model/*
 *
 * Environment variables:
 *   BEDROCK_MODEL_ID  (default: us.anthropic.claude-3-5-haiku-20241022-v1:0)
 *   BEDROCK_REGION    (default: us-east-1)
 *   ALLOWED_EMAILS    (optional comma-separated allowlist — leave blank to allow all)
 *
 * Expose via Lambda Function URL (Auth: NONE) — no API Gateway needed.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

// ── Config ────────────────────────────────────────────────────────────────────

const MODEL_ID  = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-3-5-haiku-20241022-v1:0';
const REGION    = process.env.BEDROCK_REGION   || process.env.AWS_REGION || 'us-east-1';
const ALLOWLIST = (process.env.ALLOWED_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

const MAX_TOKENS_SCAN    = 1500;
const MAX_TOKENS_EXPLAIN = 1000;

const client = new BedrockRuntimeClient({ region: REGION });

// ── Rate limiting (in-memory per warm instance, resets on cold start) ─────────

const rateMap   = new Map();   // email -> { count, windowStart }
const DAILY_CAP = 10;          // requests per 24 h per email
const WINDOW_MS = 24 * 60 * 60 * 1000;

function isRateLimited(email) {
  const now  = Date.now();
  const key  = email.toLowerCase().trim();
  const entry = rateMap.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    rateMap.set(key, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= DAILY_CAP) return true;
  entry.count++;
  return false;
}

// ── CORS ──────────────────────────────────────────────────────────────────────

const HEADERS = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':'Content-Type',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
};

const resp = (status, body) => ({
  statusCode: status,
  headers: HEADERS,
  body: JSON.stringify(body)
});

// ── System prompts ────────────────────────────────────────────────────────────

const SCAN_SYSTEM_PROMPT = `You are an expert Adobe Tags (Launch / Data Collection) implementation auditor with deep knowledge of tag management best practices, performance optimization, and data governance.

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

Scoring: 90-100 A, 80-89 B, 70-79 C, 60-69 D, <60 F.
Factor in unused %, custom code prevalence, rules without conditions, extension bloat, deep DE chains, property size.`;

const EXPLAIN_SYSTEM_PROMPT = `You are an Adobe Tags (Launch / Data Collection) implementation expert and senior JavaScript developer.

You will receive a JSON object with "code" (the custom code string) and "metadata" (component name and type). Analyze thoroughly and return ONLY a valid JSON object — no markdown fences, no text outside JSON.

Required structure:
{
  "purpose": "<1-2 sentence plain-English summary: what does this code do and why does it exist>",
  "how_it_works": ["<step 1>", "<step 2>", ...],
  "data_sources": [
    { "kind": "adobeDataLayer|digitalData|window|cookie|localStorage|sessionStorage|url|satellite|dom", "path": "<exact path accessed>", "description": "<what data this retrieves>" }
  ],
  "return_type": "<string|number|boolean|object|array|void|conditional>",
  "return_description": "<what is returned and under what conditions — include null/undefined cases>",
  "risks": [
    { "severity": "low|medium|high", "issue": "<what can go wrong>", "fix": "<specific actionable fix>" }
  ],
  "debug_commands": ["<exact copy-paste DevTools console command to inspect or validate this>"],
  "tags_context": "<how this fits into Adobe Tags — what rules likely use this, what analytics variable it feeds>"
}

Be specific about paths. If code is minified, note it as a medium risk.`;

// ── Bedrock invocation ────────────────────────────────────────────────────────

async function invokeClaude(systemPrompt, userMessage, maxTokens) {
  const isNova = MODEL_ID.includes('amazon.nova');
  let bodyObj;

  if (isNova) {
    bodyObj = {
      system: [{ text: systemPrompt }],
      messages: [{ role: 'user', content: [{ text: userMessage }] }],
      inferenceConfig: { max_new_tokens: maxTokens, temperature: 0.3 }
    };
  } else {
    bodyObj = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    };
  }

  const cmd = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: Buffer.from(JSON.stringify(bodyObj))
  });

  const raw  = await client.send(cmd);
  const data = JSON.parse(Buffer.from(raw.body).toString());

  const text = isNova
    ? (data.output?.message?.content?.[0]?.text || '')
    : (data.content?.[0]?.text || '');

  return {
    text,
    inputTokens:  isNova ? (data.usage?.inputTokens  || 0) : (data.usage?.input_tokens  || 0),
    outputTokens: isNova ? (data.usage?.outputTokens || 0) : (data.usage?.output_tokens || 0)
  };
}

function parseJSON(text) {
  const cleaned = text
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/g, '').trim();
  return JSON.parse(cleaned);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  // Preflight
  const method = event.requestContext?.http?.method || event.httpMethod || 'POST';
  if (method === 'OPTIONS') return resp(200, {});

  try {
    const body = JSON.parse(event.body || '{}');
    const { email, type, payload, userContext, code, metadata } = body;

    // ── Email validation ────────────────────────────────────────────────────
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return resp(400, { error: 'A valid email address is required to use TagScanner AI Preview.' });
    }

    // ── Allowlist check (if configured) ────────────────────────────────────
    if (ALLOWLIST.length && !ALLOWLIST.includes(email.toLowerCase().trim())) {
      return resp(403, { error: 'Your email is not on the TagScanner AI Preview access list.' });
    }

    // ── Rate limit ──────────────────────────────────────────────────────────
    if (isRateLimited(email)) {
      return resp(429, {
        error: `Daily limit of ${DAILY_CAP} AI requests reached for this email. Try again tomorrow.`
      });
    }

    // ── Log usage to CloudWatch (no PII beyond email) ───────────────────────
    console.log(JSON.stringify({ ts: new Date().toISOString(), email, type }));

    // ── Route ───────────────────────────────────────────────────────────────
    if (type === 'scan') {
      if (!payload) return resp(400, { error: 'Missing payload for scan.' });
      const userMsg = JSON.stringify({ user_context: userContext || {}, property_health: payload });
      const result  = await invokeClaude(SCAN_SYSTEM_PROMPT, userMsg, MAX_TOKENS_SCAN);
      const report  = parseJSON(result.text);
      return resp(200, {
        report,
        tokens: { input: result.inputTokens, output: result.outputTokens }
      });
    }

    if (type === 'explain') {
      if (!code) return resp(400, { error: 'Missing code for explain.' });
      const userMsg     = JSON.stringify({ code, metadata: metadata || {} });
      const result      = await invokeClaude(EXPLAIN_SYSTEM_PROMPT, userMsg, MAX_TOKENS_EXPLAIN);
      const explanation = parseJSON(result.text);
      return resp(200, {
        explanation,
        tokens: { input: result.inputTokens, output: result.outputTokens }
      });
    }

    return resp(400, { error: 'Invalid type. Use "scan" or "explain".' });

  } catch (err) {
    console.error('Lambda error:', err);
    return resp(500, { error: err.message || 'Internal server error' });
  }
};
