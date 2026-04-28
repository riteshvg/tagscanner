/**
 * TagScanner AI Proxy — AWS Lambda (CommonJS)
 *
 * Runtime : Node.js 20.x  |  Handler: index.handler
 * Timeout : 30 s  |  Memory: 256 MB
 *
 * IAM role needs:
 *   bedrock:InvokeModel on *
 *   dynamodb:PutItem / GetItem / UpdateItem / Query / Scan on arn:aws:dynamodb:*:*:table/tagscanner_*
 *
 * DynamoDB tables to create (all in same region as Lambda):
 *   tagscanner_users      — PK: userId (String)
 *   tagscanner_sessions   — PK: sessionToken (String)  [enable TTL on "expiresAt"]
 *   tagscanner_queries    — PK: userId (String), SK: queryId (String)
 *   tagscanner_ratelimits — PK: pk (String)            [enable TTL on "ttl"]
 *   tagscanner_config     — PK: pk (String)            [enable TTL on "ttl"]
 *     Items:
 *       { pk: "global", ai_enabled: true, disabled_reason: "", cost_limit_usd: 5.00 }
 *       { pk: "cost#YYYY-MM-DD", cost_usd: 0.00, ttl: <epoch> }
 *
 * Environment variables:
 *   BEDROCK_MODEL_ID  (default: us.anthropic.claude-3-5-haiku-20241022-v1:0)
 *   BEDROCK_REGION    (default: us-east-1)
 *   USERS_TABLE       (default: tagscanner_users)
 *   SESSIONS_TABLE    (default: tagscanner_sessions)
 *   QUERIES_TABLE     (default: tagscanner_queries)
 *   RATE_TABLE             (default: tagscanner_ratelimits)  — PK: pk (String), enable TTL on "ttl"
 *   CONFIG_TABLE           (default: tagscanner_config)      — PK: pk (String), enable TTL on "ttl"
 *   DAILY_REQUEST_CAP      (default: 20)    — max AI requests per user per day
 *   DEFAULT_COST_LIMIT_USD (default: 5.00)  — daily cost cap used before admin sets one via dashboard
 *   ADMIN_EMAIL            (required for /users endpoint — set to your email, lowercase)
 *   ALLOWED_EMAILS         (optional comma-separated allowlist)
 */

'use strict';

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { DynamoDBClient }                           = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// ── Config ────────────────────────────────────────────────────────────────────

const MODEL_ID       = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-3-5-haiku-20241022-v1:0';
const REGION         = process.env.BEDROCK_REGION   || process.env.AWS_REGION || 'us-east-1';
const USERS_TABLE    = (process.env.USERS_TABLE    || 'tagscanner_users').trim();
const SESSIONS_TABLE = (process.env.SESSIONS_TABLE || 'tagscanner_sessions').trim();
const QUERIES_TABLE  = (process.env.QUERIES_TABLE  || 'tagscanner_queries').trim();
const ALLOWLIST      = (process.env.ALLOWED_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
const ADMIN_EMAIL    = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

const MAX_TOKENS_SCAN    = 1500;
const MAX_TOKENS_EXPLAIN = 1000;

const bedrockClient = new BedrockRuntimeClient({ region: REGION });

const ddbClient = new DynamoDBClient({ region: REGION });
const ddb       = DynamoDBDocumentClient.from(ddbClient);

// ── Rate limiting (DynamoDB-backed, global across all Lambda instances) ──────

const RATE_TABLE        = (process.env.RATE_TABLE        || 'tagscanner_ratelimits').trim();
const CONFIG_TABLE      = (process.env.CONFIG_TABLE      || 'tagscanner_config').trim();
const DAILY_CAP         = parseInt(process.env.DAILY_REQUEST_CAP  || '20', 10);
const DEFAULT_COST_LIMIT = parseFloat(process.env.DEFAULT_COST_LIMIT_USD || '5.00');

// AWS Bedrock Claude 3.5 Haiku on-demand pricing
const COST_INPUT_PER_TOKEN  = 0.80 / 1e6;   // $0.80 per 1M input tokens
const COST_OUTPUT_PER_TOKEN = 4.00 / 1e6;   // $4.00 per 1M output tokens

// Returns true if the caller should be blocked.
// Uses a DynamoDB item with a TTL of 24 h and an atomic counter.
async function isRateLimited(userId) {
  const windowKey = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const pk        = userId + '#' + windowKey;
  const ttl       = Math.floor(Date.now() / 1000) + 25 * 60 * 60; // expire after 25 h

  try {
    const result = await ddb.send(new UpdateCommand({
      TableName:                 RATE_TABLE,
      Key:                       { pk },
      UpdateExpression:          'SET #c = if_not_exists(#c, :zero) + :one, #ttl = if_not_exists(#ttl, :ttl)',
      ExpressionAttributeNames:  { '#c': 'count', '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':ttl': ttl },
      ReturnValues:              'ALL_NEW'
    }));
    return (result.Attributes.count || 0) > DAILY_CAP;
  } catch (err) {
    // If the rate-limit table is unavailable, fail open (don't block the user)
    console.error('isRateLimited error:', err.message);
    return false;
  }
}

// ── AI kill-switch helpers ────────────────────────────────────────────────────

async function getAIConfig() {
  try {
    const result = await ddb.send(new GetCommand({ TableName: CONFIG_TABLE, Key: { pk: 'global' } }));
    if (!result.Item) return { ai_enabled: true, disabled_reason: '', cost_limit_usd: DEFAULT_COST_LIMIT };
    return {
      ai_enabled:      result.Item.ai_enabled !== false,
      disabled_reason: result.Item.disabled_reason || '',
      cost_limit_usd:  typeof result.Item.cost_limit_usd === 'number' ? result.Item.cost_limit_usd : DEFAULT_COST_LIMIT
    };
  } catch (err) {
    console.error('getAIConfig error:', err.message);
    return { ai_enabled: true, disabled_reason: '', cost_limit_usd: 5.00 };
  }
}

async function getTodayCost() {
  const windowKey = new Date().toISOString().slice(0, 10);
  try {
    const result = await ddb.send(new GetCommand({ TableName: CONFIG_TABLE, Key: { pk: 'cost#' + windowKey } }));
    return (result.Item && typeof result.Item.cost_usd === 'number') ? result.Item.cost_usd : 0;
  } catch (err) {
    console.error('getTodayCost error:', err.message);
    return 0;
  }
}

// Atomically increments today's cost; returns the new daily total.
async function trackCost(inputTokens, outputTokens) {
  const windowKey = new Date().toISOString().slice(0, 10);
  const cost = inputTokens * COST_INPUT_PER_TOKEN + outputTokens * COST_OUTPUT_PER_TOKEN;
  const ttl  = Math.floor(Date.now() / 1000) + 8 * 24 * 60 * 60; // keep 8 days
  try {
    const result = await ddb.send(new UpdateCommand({
      TableName:                 CONFIG_TABLE,
      Key:                       { pk: 'cost#' + windowKey },
      UpdateExpression:          'ADD cost_usd :cost SET #ttl = if_not_exists(#ttl, :ttl)',
      ExpressionAttributeNames:  { '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':cost': cost, ':ttl': ttl },
      ReturnValues:              'ALL_NEW'
    }));
    return (result.Attributes && result.Attributes.cost_usd) || 0;
  } catch (err) {
    console.error('trackCost error:', err.message);
    return 0;
  }
}

async function autoDisableAI(reason) {
  try {
    await ddb.send(new UpdateCommand({
      TableName:                 CONFIG_TABLE,
      Key:                       { pk: 'global' },
      UpdateExpression:          'SET #en = :f, disabled_reason = :dr',
      ExpressionAttributeNames:  { '#en': 'ai_enabled' },
      ExpressionAttributeValues: { ':f': false, ':dr': reason }
    }));
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'ai_auto_disabled', reason }));
  } catch (err) {
    console.error('autoDisableAI error:', err.message);
  }
}

// ── CORS ──────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Content-Type':                 'application/json',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const resp = (status, body) => ({
  statusCode: status,
  headers: CORS_HEADERS,
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
Factor in unused %, custom code prevalence, rules without conditions, extension bloat, deep DE chains, property size.
If user_context.concern is set, weight your analysis toward that concern.`;

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
  const isNova = MODEL_ID.startsWith('amazon.nova');
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

  const raw  = await bedrockClient.send(cmd);
  const data = JSON.parse(Buffer.from(raw.body).toString());

  const text = isNova
    ? (data.output && data.output.message && data.output.message.content && data.output.message.content[0] && data.output.message.content[0].text || '')
    : (data.content && data.content[0] && data.content[0].text || '');

  return {
    text,
    inputTokens:  isNova ? (data.usage && data.usage.inputTokens  || 0) : (data.usage && data.usage.input_tokens  || 0),
    outputTokens: isNova ? (data.usage && data.usage.outputTokens || 0) : (data.usage && data.usage.output_tokens || 0)
  };
}

function parseJSON(text) {
  const cleaned = text
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/g, '').trim();
  return JSON.parse(cleaned);
}

function randomId(len) {
  return Math.random().toString(36).slice(2, 2 + len);
}

// ── DynamoDB helpers ──────────────────────────────────────────────────────────

async function getSession(sessionToken) {
  if (!sessionToken) return null;
  try {
    const result = await ddb.send(new GetCommand({
      TableName: SESSIONS_TABLE,
      Key: { sessionToken }
    }));
    const session = result.Item;
    if (!session) return null;
    if (session.expiresAt < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch (err) {
    console.error('getSession error:', err.message);
    return null;
  }
}

async function logQuery(userId, email, type, requestSummary, tokens, resultJson) {
  const queryId = new Date().toISOString() + '#' + randomId(8);
  try {
    await ddb.send(new PutCommand({
      TableName: QUERIES_TABLE,
      Item: {
        userId,
        queryId,
        type,
        email,
        requestSummary,
        tokens:      tokens     || {},
        resultJson:  resultJson || null,
        hasResult:   resultJson ? true : false,
        feedback:    null,
        feedbackText: null,
        createdAt:   new Date().toISOString()
      }
    }));
    return queryId;
  } catch (err) {
    console.error('logQuery error:', err.message);
    return null;
  }
}

// ── Detail handler ────────────────────────────────────────────────────────────

async function handleDetail(body) {
  const { sessionToken, queryId } = body;
  const session = await getSession(sessionToken);
  if (!session) return resp(401, { error: 'Invalid or expired session. Please sign in again.' });
  if (!queryId)  return resp(400, { error: 'Missing queryId.' });

  try {
    const result = await ddb.send(new GetCommand({
      TableName: QUERIES_TABLE,
      Key: { userId: session.userId, queryId }
    }));
    if (!result.Item) return resp(404, { error: 'Query not found.' });
    return resp(200, { item: result.Item });
  } catch (err) {
    console.error('detail error:', err.message);
    return resp(500, { error: 'Could not fetch query detail.' });
  }
}

// ── Auth handler ──────────────────────────────────────────────────────────────

async function handleAuth(body, sourceIp) {
  const { googleAccessToken } = body;
  if (!googleAccessToken) return resp(400, { error: 'Missing googleAccessToken' });

  // Rate-limit auth attempts by IP to prevent token-grinding
  if (sourceIp && await isRateLimited('auth#' + sourceIp)) {
    return resp(429, { error: 'Too many sign-in attempts. Please try again later.' });
  }

  // Verify token + get profile from Google
  let userInfo;
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
      headers: { 'Authorization': `Bearer ${googleAccessToken}` }
    });
    if (!res.ok) return resp(401, { error: 'Invalid Google access token. Please sign in again.' });
    userInfo = await res.json();
  } catch (err) {
    return resp(500, { error: 'Could not reach Google auth servers.' });
  }

  if (!userInfo.verified_email) {
    return resp(401, { error: 'Google account email is not verified.' });
  }

  const userId  = userInfo.id;
  const email   = userInfo.email;
  const name    = userInfo.name || email;
  const picture = userInfo.picture || '';

  // Allowlist check (if configured)
  if (ALLOWLIST.length && !ALLOWLIST.includes(email.toLowerCase())) {
    return resp(403, { error: 'Your email is not on the TagScanner AI Preview access list.' });
  }

  // Upsert user record
  try {
    await ddb.send(new PutCommand({
      TableName: USERS_TABLE,
      Item: { userId, email, name, picture, createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() }
    }));
  } catch (err) {
    console.error('upsert user error:', err.message);
  }

  // Create session (30-day TTL)
  const sessionToken = crypto.randomUUID();
  const expiresAt    = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  try {
    await ddb.send(new PutCommand({
      TableName: SESSIONS_TABLE,
      Item: { sessionToken, userId, email, name, picture, expiresAt }
    }));
  } catch (err) {
    console.error('create session error:', err.message);
    return resp(500, { error: 'Could not create session. Please try again.' });
  }

  console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'login', email }));
  return resp(200, { sessionToken, userId, email, name, picture });
}

// ── History handler ───────────────────────────────────────────────────────────

async function handleHistory(body) {
  const { sessionToken, limit, lastKey } = body;
  const session = await getSession(sessionToken);
  if (!session) return resp(401, { error: 'Invalid or expired session. Please sign in again.' });

  try {
    const params = {
      TableName: QUERIES_TABLE,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': session.userId },
      ScanIndexForward: false,
      Limit: Math.min(limit || 25, 50)
    };
    if (lastKey) params.ExclusiveStartKey = lastKey;

    const result = await ddb.send(new QueryCommand(params));
    return resp(200, {
      items:   result.Items || [],
      lastKey: result.LastEvaluatedKey || null,
      user:    { email: session.email, name: session.name, picture: session.picture }
    });
  } catch (err) {
    console.error('history error:', err.message);
    return resp(500, { error: 'Could not fetch history.' });
  }
}

// ── Feedback handler ──────────────────────────────────────────────────────────

async function handleFeedback(body) {
  const { sessionToken, queryId, rating, text } = body;
  const session = await getSession(sessionToken);
  if (!session) return resp(401, { error: 'Invalid or expired session.' });
  if (!queryId || !rating) return resp(400, { error: 'Missing queryId or rating.' });

  try {
    await ddb.send(new UpdateCommand({
      TableName: QUERIES_TABLE,
      Key: { userId: session.userId, queryId },
      UpdateExpression: 'SET feedback = :f, feedbackText = :t, feedbackAt = :at',
      ExpressionAttributeValues: {
        ':f':  rating,
        ':t':  text || '',
        ':at': new Date().toISOString()
      }
    }));
    return resp(200, { ok: true });
  } catch (err) {
    console.error('feedback error:', err.message);
    return resp(500, { error: 'Could not save feedback.' });
  }
}

// ── Users list (admin only) ───────────────────────────────────────────────────

async function handleUsers(body) {
  const { sessionToken } = body;
  const session = await getSession(sessionToken);
  if (!session) return resp(401, { error: 'Invalid or expired session.' });
  if (!ADMIN_EMAIL) return resp(500, { error: 'Admin access not configured.' });
  if (session.email.toLowerCase() !== ADMIN_EMAIL) return resp(403, { error: 'Admin access required.' });

  try {
    // Fetch users and queries in parallel
    const [usersResult, queriesResult] = await Promise.all([
      ddb.send(new ScanCommand({ TableName: USERS_TABLE })),
      ddb.send(new ScanCommand({
        TableName: QUERIES_TABLE,
        ProjectionExpression: 'userId, #t, requestSummary, createdAt, tokens',
        ExpressionAttributeNames: { '#t': 'type' }
      }))
    ]);

    // Aggregate per-user stats from queries
    const statsMap = {};
    for (const q of (queriesResult.Items || [])) {
      if (!statsMap[q.userId]) {
        statsMap[q.userId] = {
          totalQueries: 0, totalScans: 0, totalExplains: 0,
          properties: new Set(), lastActive: null,
          totalInputTokens: 0, totalOutputTokens: 0
        };
      }
      const s = statsMap[q.userId];
      s.totalQueries++;
      if (q.type === 'scan') {
        s.totalScans++;
        const match = (q.requestSummary || '').match(/^Property scan:\s*(.+)$/);
        if (match) s.properties.add(match[1].trim());
      } else if (q.type === 'explain') {
        s.totalExplains++;
      }
      if (!s.lastActive || q.createdAt > s.lastActive) s.lastActive = q.createdAt;
      s.totalInputTokens  += (q.tokens && q.tokens.input)  || 0;
      s.totalOutputTokens += (q.tokens && q.tokens.output) || 0;
    }

    // Merge stats into user records
    const users = (usersResult.Items || []).map(u => {
      const s = statsMap[u.userId];
      return Object.assign({}, u, {
        stats: s ? {
          totalQueries:      s.totalQueries,
          totalScans:        s.totalScans,
          totalExplains:     s.totalExplains,
          properties:        Array.from(s.properties),
          lastActive:        s.lastActive,
          totalInputTokens:  s.totalInputTokens,
          totalOutputTokens: s.totalOutputTokens
        } : null
      });
    });

    // Sort by last active (most recent first), fall back to lastLoginAt
    users.sort(function (a, b) {
      const aTime = (a.stats && a.stats.lastActive) || a.lastLoginAt || a.createdAt || '';
      const bTime = (b.stats && b.stats.lastActive) || b.lastLoginAt || b.createdAt || '';
      return bTime.localeCompare(aTime);
    });

    return resp(200, { users });
  } catch (err) {
    console.error('handleUsers error:', err.message);
    return resp(500, { error: err.message || 'Could not fetch users.' });
  }
}

// ── AI config read (admin only) ───────────────────────────────────────────────

async function handleConfig(body) {
  const { sessionToken } = body;
  const session = await getSession(sessionToken);
  if (!session) return resp(401, { error: 'Invalid or expired session.' });
  if (!ADMIN_EMAIL) return resp(500, { error: 'Admin access not configured.' });
  if (session.email.toLowerCase() !== ADMIN_EMAIL) return resp(403, { error: 'Admin access required.' });

  const [aiConfig, todayCost] = await Promise.all([getAIConfig(), getTodayCost()]);
  return resp(200, {
    ai_enabled:      aiConfig.ai_enabled,
    disabled_reason: aiConfig.disabled_reason,
    cost_limit_usd:  aiConfig.cost_limit_usd,
    today_cost_usd:  todayCost
  });
}

// ── AI config write (admin only) ──────────────────────────────────────────────

async function handleSetConfig(body) {
  const { sessionToken, ai_enabled, disabled_reason, cost_limit_usd } = body;
  const session = await getSession(sessionToken);
  if (!session) return resp(401, { error: 'Invalid or expired session.' });
  if (!ADMIN_EMAIL) return resp(500, { error: 'Admin access not configured.' });
  if (session.email.toLowerCase() !== ADMIN_EMAIL) return resp(403, { error: 'Admin access required.' });

  const setParts   = [];
  const attrNames  = {};
  const attrValues = {};

  if (typeof ai_enabled === 'boolean') {
    setParts.push('#en = :en');
    attrNames['#en']  = 'ai_enabled';
    attrValues[':en'] = ai_enabled;
  }
  if (typeof disabled_reason === 'string') {
    setParts.push('disabled_reason = :dr');
    attrValues[':dr'] = disabled_reason;
  }
  if (typeof cost_limit_usd === 'number' && cost_limit_usd >= 0.5) {
    setParts.push('cost_limit_usd = :cl');
    attrValues[':cl'] = cost_limit_usd;
  }
  if (!setParts.length) return resp(400, { error: 'Nothing to update.' });

  const params = {
    TableName:                 CONFIG_TABLE,
    Key:                       { pk: 'global' },
    UpdateExpression:          'SET ' + setParts.join(', '),
    ExpressionAttributeValues: attrValues
  };
  if (Object.keys(attrNames).length) params.ExpressionAttributeNames = attrNames;

  try {
    await ddb.send(new UpdateCommand(params));
    return resp(200, { ok: true });
  } catch (err) {
    console.error('handleSetConfig error:', err.message);
    return resp(500, { error: 'Could not update config.' });
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const method = (event.requestContext && event.requestContext.http && event.requestContext.http.method) || event.httpMethod || 'POST';
  if (method === 'OPTIONS') return resp(200, {});

  try {
    const body     = JSON.parse(event.body || '{}');
    const sourceIp = (event.requestContext && event.requestContext.http && event.requestContext.http.sourceIp) || null;
    const { type, sessionToken } = body;

    // ── Auth ────────────────────────────────────────────────────────────────
    if (type === 'auth') return handleAuth(body, sourceIp);

    // ── History ─────────────────────────────────────────────────────────────
    if (type === 'history') return handleHistory(body);

    // ── Detail ──────────────────────────────────────────────────────────────
    if (type === 'detail') return handleDetail(body);

    // ── Feedback ────────────────────────────────────────────────────────────
    if (type === 'feedback') return handleFeedback(body);

    // ── Users (admin) ───────────────────────────────────────────────────────
    if (type === 'users') return await handleUsers(body);

    // ── AI config (admin) ────────────────────────────────────────────────────
    if (type === 'config')    return handleConfig(body);
    if (type === 'setConfig') return handleSetConfig(body);

    // ── Scan / Explain — require a valid session ─────────────────────────────
    const session = await getSession(sessionToken);
    if (!session) {
      return resp(401, { error: 'Sign in with Google to use TagScanner AI.' });
    }
    const identity = { userId: session.userId, email: session.email };

    // Rate limit by userId
    if (await isRateLimited(identity.userId)) {
      return resp(429, { error: 'Daily AI request limit reached (' + DAILY_CAP + '/day). Try again tomorrow.' });
    }

    // Kill-switch: check if AI is enabled and daily cost is within limit
    const [aiConfig, todayCost] = await Promise.all([getAIConfig(), getTodayCost()]);
    if (!aiConfig.ai_enabled) {
      return resp(503, { error: 'AI features are temporarily disabled. Please check back later.' });
    }
    if (todayCost >= aiConfig.cost_limit_usd) {
      await autoDisableAI('Daily cost limit of $' + aiConfig.cost_limit_usd.toFixed(2) + ' reached. AI disabled automatically.');
      return resp(503, { error: 'AI features are temporarily disabled. Please check back later.' });
    }

    console.log(JSON.stringify({ ts: new Date().toISOString(), userId: identity.userId, type }));

    // ── Scan ─────────────────────────────────────────────────────────────────
    if (type === 'scan') {
      const { payload, userContext } = body;
      if (!payload) return resp(400, { error: 'Missing payload for scan.' });

      const userMsg = JSON.stringify({ user_context: userContext || {}, property_health: payload });
      const result  = await invokeClaude(SCAN_SYSTEM_PROMPT, userMsg, MAX_TOKENS_SCAN);
      const report  = parseJSON(result.text);

      const propertyName = (payload && payload.property && payload.property.name) || 'Unknown property';
      const [queryId, newDayCost] = await Promise.all([
        logQuery(identity.userId, identity.email, 'scan', 'Property scan: ' + propertyName,
          { input: result.inputTokens, output: result.outputTokens }, report),
        trackCost(result.inputTokens, result.outputTokens)
      ]);

      // Auto-disable if the new daily total now exceeds the limit
      if (newDayCost > aiConfig.cost_limit_usd) {
        autoDisableAI('Daily cost limit of $' + aiConfig.cost_limit_usd.toFixed(2) + ' reached. AI disabled automatically.').catch(() => {});
      }

      return resp(200, {
        report,
        tokens:  { input: result.inputTokens, output: result.outputTokens },
        queryId: queryId || null
      });
    }

    // ── Explain ───────────────────────────────────────────────────────────────
    if (type === 'explain') {
      const { code, metadata } = body;
      if (!code) return resp(400, { error: 'Missing code for explain.' });

      const userMsg     = JSON.stringify({ code, metadata: metadata || {} });
      const result      = await invokeClaude(EXPLAIN_SYSTEM_PROMPT, userMsg, MAX_TOKENS_EXPLAIN);
      const explanation = parseJSON(result.text);

      const componentName = (metadata && metadata.name) || 'unknown';
      const [queryId, newDayCost] = await Promise.all([
        logQuery(identity.userId, identity.email, 'explain',
          'Explain ' + (metadata && metadata.type || '') + ': ' + componentName,
          { input: result.inputTokens, output: result.outputTokens }, explanation),
        trackCost(result.inputTokens, result.outputTokens)
      ]);

      if (newDayCost > aiConfig.cost_limit_usd) {
        autoDisableAI('Daily cost limit of $' + aiConfig.cost_limit_usd.toFixed(2) + ' reached. AI disabled automatically.').catch(() => {});
      }

      return resp(200, {
        explanation,
        tokens:  { input: result.inputTokens, output: result.outputTokens },
        queryId: queryId || null
      });
    }

    return resp(400, { error: 'Invalid type. Use: auth, scan, explain, history, feedback.' });

  } catch (err) {
    console.error('Lambda error:', err);
    return resp(500, { error: err.message || 'Internal server error' });
  }
};
