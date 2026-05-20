/**
 * TagScanner AI Proxy — AWS Lambda (CommonJS)
 *
 * Runtime : Node.js 20.x  |  Handler: index.handler
 * Timeout : 30 s  |  Memory: 256 MB
 *
 * IAM role needs:
 *   bedrock:InvokeModel on *
 *   dynamodb:PutItem / GetItem / UpdateItem / Query / Scan / BatchWriteItem on arn:aws:dynamodb:*:*:table/tagscanner_*
 *
 * DynamoDB tables to create (all in same region as Lambda):
 *   tagscanner_users       — PK: userId (String)
 *   tagscanner_sessions    — PK: sessionToken (String)  [enable TTL on "expiresAt"]
 *   tagscanner_queries     — PK: userId (String), SK: queryId (String)
 *   tagscanner_ratelimits  — PK: pk (String)            [enable TTL on "ttl"]
 *   tagscanner_config      — PK: pk (String)            [enable TTL on "ttl"]
 *     Items:
 *       { pk: "global", ai_enabled: true, disabled_reason: "", cost_limit_usd: 5.00 }
 *       { pk: "cost#YYYY-MM-DD", cost_usd: 0.00, ttl: <epoch> }
 *   tagscanner_scan_cache    — PK: cache_key (String)     [enable TTL on "ttl"]
 *   tagscanner_explain_cache — PK: code_hash (String)    [enable TTL on "ttl"]
 *   tagscanner_feedback      — PK: feedbackId (String)
 *
 * Environment variables:
 *   BEDROCK_MODEL_ID  (default: us.anthropic.claude-3-5-haiku-20241022-v1:0)
 *   BEDROCK_REGION    (default: us-east-1)
 *   USERS_TABLE       (default: tagscanner_users)
 *   SESSIONS_TABLE    (default: tagscanner_sessions)
 *   QUERIES_TABLE     (default: tagscanner_queries)
 *   RATE_TABLE             (default: tagscanner_ratelimits)   — PK: pk (String), enable TTL on "ttl"
 *   CONFIG_TABLE           (default: tagscanner_config)       — PK: pk (String), enable TTL on "ttl"
 *   SCAN_CACHE_TABLE       (default: tagscanner_scan_cache)   — PK: cache_key (String), enable TTL on "ttl"
 *   DAILY_REQUEST_CAP      (default: 20)    — max AI requests per user per day
 *   DEFAULT_COST_LIMIT_USD (default: 5.00)  — daily cost cap used before admin sets one via dashboard
 *   ADMIN_EMAIL            (required for /users endpoint — set to your email, lowercase)
 *   ALLOWED_EMAILS         (optional comma-separated allowlist)
 */

'use strict';

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { DynamoDBClient }                           = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, ScanCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { SNSClient, PublishCommand: SNSPublishCommand } = require('@aws-sdk/client-sns');
const nodeCrypto = require('node:crypto');

// ── Config ────────────────────────────────────────────────────────────────────

const SNS_TOPIC_ARN  = (process.env.SNS_TOPIC_ARN || '').trim();
const ALERT_PCT      = 0.75; // send alert when daily cost crosses this fraction of the limit

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
const MAX_TOKENS_CHAT    = 2500;

const bedrockClient = new BedrockRuntimeClient({ region: REGION });

const ddbClient  = new DynamoDBClient({ region: REGION });
const ddb        = DynamoDBDocumentClient.from(ddbClient);
const snsClient  = SNS_TOPIC_ARN ? new SNSClient({ region: REGION }) : null;

// ── Rate limiting (DynamoDB-backed, global across all Lambda instances) ──────

const RATE_TABLE        = (process.env.RATE_TABLE        || 'tagscanner_ratelimits').trim();
const CONFIG_TABLE      = (process.env.CONFIG_TABLE      || 'tagscanner_config').trim();
const SCAN_CACHE_TABLE    = (process.env.SCAN_CACHE_TABLE    || 'tagscanner_scan_cache').trim();
const EXPLAIN_CACHE_TABLE = (process.env.EXPLAIN_CACHE_TABLE || 'tagscanner_explain_cache').trim();
const FEEDBACK_TABLE      = (process.env.FEEDBACK_TABLE      || 'tagscanner_feedback').trim();
const QUERIES_PROPERTY_INDEX = 'propertyKey-createdAt-index';
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

// ── Beta chat limit (persistent, per user per property) ──────────────────────

const BETA_CHAT_LIMIT = 10;

async function getChatBetaCount(userId, propertyKey) {
  const pk = 'chatbeta#' + userId + '#' + propertyKey;
  try {
    const result = await ddb.send(new GetCommand({ TableName: RATE_TABLE, Key: { pk } }));
    return result.Item ? (result.Item.count || 0) : 0;
  } catch (err) {
    console.error('getChatBetaCount error:', err.message);
    return 0;
  }
}

async function incrementChatBetaCount(userId, propertyKey) {
  const pk = 'chatbeta#' + userId + '#' + propertyKey;
  try {
    const result = await ddb.send(new UpdateCommand({
      TableName:                 RATE_TABLE,
      Key:                       { pk },
      UpdateExpression:          'ADD #c :one',
      ExpressionAttributeNames:  { '#c': 'count' },
      ExpressionAttributeValues: { ':one': 1 },
      ReturnValues:              'ALL_NEW'
    }));
    return result.Attributes.count || 0;
  } catch (err) {
    console.error('incrementChatBetaCount error:', err.message);
    return 0;
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

async function publishSNSAlert(subject, message) {
  if (!snsClient || !SNS_TOPIC_ARN) return;
  try {
    await snsClient.send(new SNSPublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Subject:  subject.slice(0, 100),
      Message:  message
    }));
  } catch (err) {
    console.error('publishSNSAlert error:', err.message);
  }
}

// Sends a 75% threshold alert once per day (deduped via RATE_TABLE).
async function sendCostThresholdAlert(newCost, limit) {
  const windowKey = new Date().toISOString().slice(0, 10);
  const alertKey  = 'alert_75pct#' + windowKey;
  const ttl       = Math.floor(Date.now() / 1000) + 25 * 60 * 60;

  try {
    const existing = await ddb.send(new GetCommand({ TableName: RATE_TABLE, Key: { pk: alertKey } }));
    if (existing.Item) return; // already sent today
    await ddb.send(new PutCommand({ TableName: RATE_TABLE, Item: { pk: alertKey, ttl } }));
  } catch (err) {
    console.error('sendCostThresholdAlert dedup error:', err.message);
  }

  const pct = Math.round((newCost / limit) * 100);
  await publishSNSAlert(
    'TagScanner Cost Alert — ' + pct + '% of daily budget used',
    [
      'TagScanner Bedrock cost alert',
      '',
      'Date:          ' + windowKey,
      'Current spend: $' + newCost.toFixed(4),
      'Daily limit:   $' + limit.toFixed(2),
      'Usage:         ' + pct + '%',
      '',
      'AI will be auto-disabled when spend reaches $' + limit.toFixed(2) + '.',
      'To raise or lower the limit, use the TagScanner dashboard.'
    ].join('\n')
  );
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
    await publishSNSAlert(
      'TagScanner AI Auto-Disabled — Cost Limit Reached',
      ['TagScanner AI has been automatically disabled.', '', 'Reason: ' + reason,
       '', 'Re-enable via the TagScanner dashboard when ready.'].join('\n')
    );
  } catch (err) {
    console.error('autoDisableAI error:', err.message);
  }
}

// ── Adobe Analytics server-side tracking ─────────────────────────────────────

const AA_RSID            = 'ageo1xxsintagscanner';
const AA_TRACKING_SERVER = 'adobeintriteshgupta.sc.omtrdc.net';
const AA_ENDPOINT        = `https://${AA_TRACKING_SERVER}/b/ss/${AA_RSID}/0`;
const AA_APP_VERSION     = '2.5.4';

function hashEmailSync(email) {
  if (!email) return '';
  return nodeCrypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

// Fire-and-forget GET hit to the Adobe Analytics Data Insertion API.
// Called after each meaningful server event; never awaited so it cannot
// add latency or break the main response path.
function trackAA(params) {
  try {
    const base = {
      // ── Required ─────────────────────────────────────────────────────────
      ce:  'UTF-8',                                  // character encoding
      g:   'https://tagscanner-lambda',              // pageURL placeholder for server-side hits
      ts:  new Date().toISOString(),                // ISO 8601 timestamp
      // ── Recommended ──────────────────────────────────────────────────────
      ch:  'TagScanner',                            // site section / channel
      // ── Custom dimensions ─────────────────────────────────────────────────
      v4:  AA_APP_VERSION,                          // eVar4: app version
    };
    const merged = Object.assign({}, base, params);
    if (merged.pev2 && !merged.v9) merged.v9 = merged.pev2;
    if (merged.pageName && !merged.v11) merged.v11 = merged.pageName;
    const qs = Object.keys(merged)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(merged[k] != null ? merged[k] : ''))
      .join('&');
    fetch(`${AA_ENDPOINT}?${qs}`, { method: 'GET' }).catch(() => {});
  } catch (_) {}
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

const CHAT_SYSTEM_PROMPT = `You are an expert Adobe Tags (Launch / Data Collection) consultant embedded in the TagScanner Chrome extension. You have deep knowledge of tag management best practices, Adobe Experience Platform, data governance, and JavaScript performance.

You will receive a JSON object with two fields:
- "property_context": a structured summary of the user's Tags property (rules, data elements, extensions, property metadata)
- "question": the user's natural language question about their property

Critical data limitations you must know:
- The property_context is read from the DEPLOYED Tags container (window._satellite._container) in the browser. It only reflects what is published and active.
- DISABLED rules are excluded from the deployed container — they are never published to the browser. You cannot see them, count them, or list them. If asked about disabled rules, explain this clearly.
- The "enabled" status of rules is not a reliable field. All rules present in the context are active by definition.
- Custom code content is not included — only metadata (name, type, extension). If asked about the code inside a component, say it is not available.
- If property_context includes a "data_note" field, treat it as a system constraint and surface it in your answer.

How to respond:
1. Answer directly and accurately from the data in property_context. Never invent or guess rule names, extension names, or data element names.
2. Be concise — give the factual answer and stop. Do not add observations, recommendations, governance notes, or best-practice commentary unless the user explicitly asks for it.
3. When listing items, use a "-" bulleted list. Keep lists scannable.
5. NEVER truncate a list mid-item. If the complete list is very long (>60 items), show all items — do not abbreviate or add "... and N more". The user is inspecting their property and needs the complete data.
6. If the property_context does not contain enough information to answer, say so clearly — do not guess or fabricate.
7. Do NOT return JSON. Return plain text only.
8. Tone: friendly and professional, like a senior consultant. Avoid filler phrases like "Great question!" or "Certainly!".`;

// Multi-turn version of invokeClaude — takes a messages array instead of a single string
async function invokeClaudeChat(messages, maxTokens) {
  const isNova = MODEL_ID.startsWith('amazon.nova');
  let bodyObj;

  if (isNova) {
    bodyObj = {
      system: [{ text: CHAT_SYSTEM_PROMPT }],
      messages: messages.map(m => ({ role: m.role, content: [{ text: m.content }] })),
      inferenceConfig: { max_new_tokens: maxTokens, temperature: 0.3 }
    };
  } else {
    bodyObj = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      temperature: 0.3,
      system: CHAT_SYSTEM_PROMPT,
      messages: messages.map(m => ({ role: m.role, content: m.content }))
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

// ── Chat handler ──────────────────────────────────────────────────────────────

async function handleChat(body, session, identity, aiConfig, todayCost) {
  const { question, propertyContext, conversationHistory } = body;
  const clientId = body.clientId || '';

  if (!question || typeof question !== 'string' || !question.trim()) {
    return resp(400, { error: 'Missing question.' });
  }
  if (!propertyContext || typeof propertyContext !== 'object') {
    return resp(400, { error: 'Missing propertyContext.' });
  }

  // Build message history (last 4 exchanges = 8 messages max)
  const MAX_HISTORY = 8;
  const cleanHistory = (Array.isArray(conversationHistory) ? conversationHistory : [])
    .slice(-MAX_HISTORY)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 3000) }));

  const propertyName = (propertyContext.property && propertyContext.property.name) || 'Unknown';
  const environment  = (propertyContext.property && propertyContext.property.environment) || '';
  const propertyKey  = propertyName + (environment ? '#' + environment : '');
  const siteUrl      = (propertyContext.property && propertyContext.property.url) || '';

  // Beta limit — skip for admin
  const isAdminUser = ADMIN_EMAIL && session.email.toLowerCase() === ADMIN_EMAIL;
  const betaCount = isAdminUser ? 0 : await getChatBetaCount(identity.userId, propertyKey);
  if (!isAdminUser && betaCount >= BETA_CHAT_LIMIT) {
    return resp(429, {
      error: 'Beta question limit reached for this property (' + BETA_CHAT_LIMIT + '/' + BETA_CHAT_LIMIT + '). The limit resets when the beta period ends.',
      betaLimitReached: true,
      chatCount: betaCount
    });
  }

  // Cache check — only for standalone (first-turn) questions with no prior history
  let chatCacheKey = null;
  if (cleanHistory.length === 0) {
    const ctxHash = nodeCrypto.createHash('sha256').update(JSON.stringify(propertyContext)).digest('hex').slice(0, 8);
    chatCacheKey = 'chat#' + nodeCrypto.createHash('sha256')
      .update(question.trim().toLowerCase() + '|' + propertyKey + '|' + ctxHash)
      .digest('hex').slice(0, 16);

    const cached = await getChatCache(chatCacheKey);
    if (cached && cached.answer) {
      console.log(JSON.stringify({ ts: new Date().toISOString(), userId: identity.userId, type: 'chat_cache_hit', chatCacheKey }));
      const queryId = await logQuery(identity.userId, identity.email, session.name, 'chat',
        'Chat: ' + question.trim().slice(0, 120),
        { input: 0, output: 0 },
        { question: question.trim(), answer: cached.answer },
        propertyKey, siteUrl, clientId);
      return resp(200, { answer: cached.answer, tokens: { input: 0, output: 0 }, queryId: queryId || null, fromCache: true });
    }
  }

  // Current user turn embeds property context + question
  const userPayload = JSON.stringify({
    property_context: propertyContext,
    question: question.trim().slice(0, 500)
  });

  const messages = [...cleanHistory, { role: 'user', content: userPayload }];

  trackAA({ vid: identity.userId, pageName: 'TagScanner:Ask AI', pe: 'lnk_o', pev2: 'Ask AI:Question', events: 'event2', v1: propertyName, v2: environment, v3: isAdminUser ? 'admin' : 'user', v5: 'Ask AI', v7: hashEmailSync(identity.email), v8: question.trim().slice(0, 255) });
  const result = await invokeClaudeChat(messages, MAX_TOKENS_CHAT);

  const [queryId, newDayCost] = await Promise.all([
    logQuery(identity.userId, identity.email, session.name, 'chat',
      'Chat: ' + question.trim().slice(0, 120),
      { input: result.inputTokens, output: result.outputTokens },
      { question: question.trim(), answer: result.text },
      propertyKey, siteUrl, clientId),
    trackCost(result.inputTokens, result.outputTokens)
  ]);

  // Populate cache for future first-turn requests with the same question + property
  if (chatCacheKey) {
    putChatCache(chatCacheKey, result.text, { input: result.inputTokens, output: result.outputTokens }, propertyKey).catch(() => {});
  }

  // Increment beta count (fire-and-forget for non-admin)
  let newBetaCount = betaCount;
  if (!isAdminUser) {
    newBetaCount = await incrementChatBetaCount(identity.userId, propertyKey);
  }

  if (newDayCost >= aiConfig.cost_limit_usd * ALERT_PCT) {
    sendCostThresholdAlert(newDayCost, aiConfig.cost_limit_usd).catch(() => {});
  }
  if (newDayCost > aiConfig.cost_limit_usd) {
    autoDisableAI('Daily cost limit of $' + aiConfig.cost_limit_usd.toFixed(2) + ' reached.').catch(() => {});
  }

  trackAA({ vid: identity.userId, pageName: 'TagScanner:Ask AI', pe: 'lnk_o', pev2: 'Ask AI:Answer', events: 'event3', v1: propertyName, v2: environment, v3: isAdminUser ? 'admin' : 'user', v5: 'Ask AI', v7: hashEmailSync(identity.email) });
  return resp(200, {
    answer:    result.text,
    tokens:    { input: result.inputTokens, output: result.outputTokens },
    queryId:   queryId || null,
    chatCount: isAdminUser ? null : newBetaCount
  });
}

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

async function logQuery(userId, email, userName, type, requestSummary, tokens, resultJson, propertyKey, siteUrl, clientId) {
  const queryId = new Date().toISOString() + '#' + randomId(8);
  let siteHostname = '';
  try { siteHostname = siteUrl ? new URL(siteUrl).hostname : ''; } catch (_) {}
  try {
    await ddb.send(new PutCommand({
      TableName: QUERIES_TABLE,
      Item: {
        userId,
        queryId,
        type,
        email,
        userName:      userName    || '',
        clientId:      clientId    || '',
        propertyKey:   propertyKey || '',
        siteUrl:       siteUrl     || '',
        siteHostname:  siteHostname,
        requestSummary,
        tokens:        tokens      || {},
        resultJson:    resultJson  || null,
        hasResult:     resultJson  ? true : false,
        feedback:      null,
        feedbackText:  null,
        createdAt:     new Date().toISOString()
      }
    }));
    return queryId;
  } catch (err) {
    console.error('logQuery error:', err.message);
    return null;
  }
}

// ── Scan cache helpers ────────────────────────────────────────────────────────

async function getCachedScan(cacheKey) {
  try {
    const result = await ddb.send(new GetCommand({ TableName: SCAN_CACHE_TABLE, Key: { cache_key: cacheKey } }));
    return result.Item || null;
  } catch (err) {
    console.error('getCachedScan error:', err.message);
    return null;
  }
}

async function putCachedScan(cacheKey, report, tokens, email, name, propertyName, environment) {
  const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30-day cleanup TTL
  try {
    await ddb.send(new PutCommand({
      TableName: SCAN_CACHE_TABLE,
      Item: {
        cache_key:       cacheKey,
        report:          report,
        tokens:          tokens,
        cached_at:       new Date().toISOString(),
        cached_by_email: email,
        cached_by_name:  name || email,
        property_name:   propertyName,
        environment:     environment,
        ttl:             ttl
      }
    }));
  } catch (err) {
    console.error('putCachedScan error:', err.message);
  }
}

// ── Explain cache helpers ─────────────────────────────────────────────────────

async function getExplainCache(codeHash) {
  try {
    const result = await ddb.send(new GetCommand({ TableName: EXPLAIN_CACHE_TABLE, Key: { code_hash: codeHash } }));
    return result.Item || null;
  } catch (err) {
    console.error('getExplainCache error:', err.message);
    return null;
  }
}

async function putExplainCache(codeHash, explanation, tokens, email, name, componentName, componentType, propertyKey) {
  const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  try {
    await ddb.send(new PutCommand({
      TableName: EXPLAIN_CACHE_TABLE,
      Item: {
        code_hash:       codeHash,
        explanation:     explanation,
        tokens:          tokens,
        cached_at:       new Date().toISOString(),
        cached_by_email: email,
        cached_by_name:  name || email,
        component_name:  componentName || '',
        component_type:  componentType || '',
        property_key:    propertyKey || '',
        ttl:             ttl
      }
    }));
  } catch (err) {
    console.error('putExplainCache error:', err.message);
  }
}

// ── Chat cache helpers (keyed on question + property context hash) ────────────

async function getChatCache(cacheKey) {
  try {
    const result = await ddb.send(new GetCommand({ TableName: SCAN_CACHE_TABLE, Key: { cache_key: cacheKey } }));
    return result.Item || null;
  } catch (err) {
    console.error('getChatCache error:', err.message);
    return null;
  }
}

async function putChatCache(cacheKey, answer, tokens, propertyKey) {
  const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7-day TTL
  try {
    await ddb.send(new PutCommand({
      TableName: SCAN_CACHE_TABLE,
      Item: {
        cache_key:   cacheKey,
        answer:      answer,
        tokens:      tokens,
        cached_at:   new Date().toISOString(),
        property_key: propertyKey || '',
        ttl:         ttl
      }
    }));
  } catch (err) {
    console.error('putChatCache error:', err.message);
  }
}

// ── Detail handler ────────────────────────────────────────────────────────────

async function handleDetail(body) {
  const { sessionToken, queryId, ownerId } = body;
  const session = await getSession(sessionToken);
  if (!session) return resp(401, { error: 'Invalid or expired session. Please sign in again.' });
  if (!queryId)  return resp(400, { error: 'Missing queryId.' });

  // ownerId lets property-scoped history views fetch another user's query result
  const lookupUserId = ownerId || session.userId;

  try {
    const result = await ddb.send(new GetCommand({
      TableName: QUERIES_TABLE,
      Key: { userId: lookupUserId, queryId }
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

  const isAdmin = ADMIN_EMAIL && email.toLowerCase() === ADMIN_EMAIL;
  console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'login', email }));
  trackAA({ vid: userId, pageName: 'TagScanner:Server', pe: 'lnk_o', pev2: 'Auth:Sign In', events: 'event9', v3: isAdmin ? 'admin' : 'user', v7: hashEmailSync(email) });
  return resp(200, { sessionToken, userId, email, name, picture, isAdmin: !!isAdmin });
}

// ── History handler ───────────────────────────────────────────────────────────

async function handleHistory(body) {
  const { sessionToken, limit, lastKey, propertyKey, ownerId } = body;
  const session = await getSession(sessionToken);
  if (!session) return resp(401, { error: 'Invalid or expired session. Please sign in again.' });

  // Admin can query any user's history by passing ownerId
  let targetUserId = session.userId;
  if (ownerId) {
    if (!ADMIN_EMAIL || session.email.toLowerCase() !== ADMIN_EMAIL) {
      return resp(403, { error: 'Admin access required.' });
    }
    targetUserId = ownerId;
  }

  try {
    let params;
    if (propertyKey) {
      // Property-scoped: query GSI — all users' activity for this property
      params = {
        TableName:                 QUERIES_TABLE,
        IndexName:                 QUERIES_PROPERTY_INDEX,
        KeyConditionExpression:    'propertyKey = :pk',
        ExpressionAttributeValues: { ':pk': propertyKey },
        ScanIndexForward:          false,
        Limit:                     Math.min(limit || 25, 50)
      };
    } else {
      // User-scoped (current user or admin-specified via ownerId)
      params = {
        TableName:                 QUERIES_TABLE,
        KeyConditionExpression:    'userId = :uid',
        ExpressionAttributeValues: { ':uid': targetUserId },
        ScanIndexForward:          false,
        Limit:                     Math.min(limit || 25, 100)
      };
    }
    if (lastKey) params.ExclusiveStartKey = lastKey;

    const result = await ddb.send(new QueryCommand(params));
    return resp(200, {
      items:       result.Items || [],
      lastKey:     result.LastEvaluatedKey || null,
      propertyKey: propertyKey || null,
      user:        { email: session.email, name: session.name, picture: session.picture }
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
    trackAA({ vid: session.userId, pageName: 'TagScanner:Ask AI', pe: 'lnk_o', pev2: 'Ask AI:Feedback:' + rating, events: 'event13', v5: 'Feedback', v6: rating, v7: hashEmailSync(session.email) });
    return resp(200, { ok: true });
  } catch (err) {
    console.error('feedback error:', err.message);
    return resp(500, { error: 'Could not save feedback.' });
  }
}

// ── General feedback (no auth required) ──────────────────────────────────────

async function isFeedbackRateLimited(sourceIp) {
  if (!sourceIp) return false;
  const pk  = 'fb#' + sourceIp + '#' + new Date().toISOString().slice(0, 10);
  const ttl = Math.floor(Date.now() / 1000) + 25 * 60 * 60;
  try {
    const result = await ddb.send(new UpdateCommand({
      TableName:                 RATE_TABLE,
      Key:                       { pk },
      UpdateExpression:          'SET #c = if_not_exists(#c, :zero) + :one, #ttl = if_not_exists(#ttl, :ttl)',
      ExpressionAttributeNames:  { '#c': 'count', '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':ttl': ttl },
      ReturnValues:              'ALL_NEW'
    }));
    return (result.Attributes.count || 0) > 5;
  } catch (err) {
    console.error('isFeedbackRateLimited error:', err.message);
    return false;
  }
}

async function handleGeneralFeedback(body, sourceIp) {
  const { name, email, rating, category, message } = body;
  if (!message || !String(message).trim()) return resp(400, { error: 'Message is required.' });

  if (await isFeedbackRateLimited(sourceIp)) {
    return resp(429, { error: 'Too many submissions. Please try again tomorrow.' });
  }

  const feedbackId = new Date().toISOString() + '-' + nodeCrypto.randomBytes(4).toString('hex');
  try {
    await ddb.send(new PutCommand({
      TableName: FEEDBACK_TABLE,
      Item: {
        feedbackId,
        name:        String(name    || '').trim().slice(0, 200),
        email:       String(email   || '').trim().toLowerCase().slice(0, 200),
        rating:      String(rating  || '').slice(0, 50),
        category:    String(category || 'General Feedback').slice(0, 100),
        message:     String(message).trim().slice(0, 5000),
        submittedAt: new Date().toISOString(),
        sourceIp:    sourceIp || null
      }
    }));
    return resp(200, { ok: true });
  } catch (err) {
    console.error('handleGeneralFeedback error:', err.message);
    return resp(500, { error: 'Could not save feedback.' });
  }
}

// ── Get all general feedback (admin only) ─────────────────────────────────────

async function handleGetFeedback(body) {
  const { sessionToken } = body;
  const session = await getSession(sessionToken);
  if (!session) return resp(401, { error: 'Invalid or expired session.' });
  if (!ADMIN_EMAIL) return resp(500, { error: 'Admin access not configured.' });
  if (session.email.toLowerCase() !== ADMIN_EMAIL) return resp(403, { error: 'Admin access required.' });

  try {
    const result = await ddb.send(new ScanCommand({ TableName: FEEDBACK_TABLE }));
    const items  = (result.Items || []).sort((a, b) =>
      (b.submittedAt || '').localeCompare(a.submittedAt || ''));
    return resp(200, { items });
  } catch (err) {
    console.error('handleGetFeedback error:', err.message);
    return resp(500, { error: err.message || 'Could not fetch feedback.' });
  }
}

// ── Admin: all chat questions across all users ────────────────────────────────

async function handleAdminQueries(body) {
  const { sessionToken } = body;
  const session = await getSession(sessionToken);
  if (!session) return resp(401, { error: 'Invalid or expired session.' });
  if (!ADMIN_EMAIL || session.email.toLowerCase() !== ADMIN_EMAIL)
    return resp(403, { error: 'Admin access required.' });

  try {
    const result = await ddb.send(new ScanCommand({
      TableName: QUERIES_TABLE,
      FilterExpression: '#t = :chat',
      ExpressionAttributeNames: { '#t': 'type' },
      ExpressionAttributeValues: { ':chat': 'chat' },
      ProjectionExpression: 'userId, queryId, email, userName, requestSummary, resultJson, feedback, feedbackText, createdAt, tokens, propertyKey'
    }));
    const items = (result.Items || []).sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || ''));
    return resp(200, { items });
  } catch (err) {
    console.error('handleAdminQueries error:', err.message);
    return resp(500, { error: err.message || 'Could not fetch questions.' });
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
        ProjectionExpression: 'userId, #t, requestSummary, createdAt, tokens, siteHostname, clientId, userName',
        ExpressionAttributeNames: { '#t': 'type' }
      }))
    ]);

    // Aggregate per-user stats from queries
    const statsMap = {};
    for (const q of (queriesResult.Items || [])) {
      if (!statsMap[q.userId]) {
        statsMap[q.userId] = {
          totalQueries: 0, totalScans: 0, totalExplains: 0, totalVisits: 0,
          properties: new Set(), sites: new Set(), lastActive: null,
          totalInputTokens: 0, totalOutputTokens: 0,
          clientId: q.clientId || '', userName: q.userName || ''
        };
      }
      const s = statsMap[q.userId];
      s.totalQueries++;
      if (q.type === 'visit') {
        s.totalVisits++;
        if (q.siteHostname) s.sites.add(q.siteHostname);
        const vMatch = (q.requestSummary || '').match(/^Visit:\s*(.+)$/);
        if (vMatch) s.properties.add(vMatch[1].trim());
      } else if (q.type === 'scan') {
        s.totalScans++;
        const match = (q.requestSummary || '').match(/^Property scan:\s*(.+)$/);
        if (match) s.properties.add(match[1].trim());
        if (q.siteHostname) s.sites.add(q.siteHostname);
      } else if (q.type === 'explain') {
        s.totalExplains++;
      }
      if (q.clientId) s.clientId = q.clientId;
      if (!s.lastActive || q.createdAt > s.lastActive) s.lastActive = q.createdAt;
      s.totalInputTokens  += (q.tokens && q.tokens.input)  || 0;
      s.totalOutputTokens += (q.tokens && q.tokens.output) || 0;
    }

    // Merge stats into user records (authenticated users from users table)
    const users = (usersResult.Items || []).map(u => {
      const s = statsMap[u.userId];
      return Object.assign({}, u, {
        emailHash: hashEmailSync(u.email || ''),
        stats: s ? {
          totalQueries:      s.totalQueries,
          totalScans:        s.totalScans,
          totalExplains:     s.totalExplains,
          totalVisits:       s.totalVisits || 0,
          properties:        Array.from(s.properties),
          sites:             Array.from(s.sites),
          lastActive:        s.lastActive,
          totalInputTokens:  s.totalInputTokens,
          totalOutputTokens: s.totalOutputTokens,
          clientId:          s.clientId || ''
        } : null
      });
    });

    // Add anonymous-only rows (anon#<clientId> keys, not in users table)
    const knownUserIds = new Set((usersResult.Items || []).map(u => u.userId));
    for (const [uid, s] of Object.entries(statsMap)) {
      if (!uid.startsWith('anon#') || knownUserIds.has(uid)) continue;
      users.push({
        userId:      uid,
        email:       '',
        name:        'Anonymous',
        picture:     '',
        createdAt:   s.lastActive || '',
        lastLoginAt: null,
        emailHash:   '',
        stats: {
          totalQueries:      s.totalQueries,
          totalScans:        s.totalScans,
          totalExplains:     s.totalExplains,
          totalVisits:       s.totalVisits || 0,
          properties:        Array.from(s.properties),
          sites:             Array.from(s.sites),
          lastActive:        s.lastActive,
          totalInputTokens:  s.totalInputTokens,
          totalOutputTokens: s.totalOutputTokens,
          clientId:          s.clientId || uid.slice(5)
        }
      });
    }

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

// ── Test-data purge (admin only) ──────────────────────────────────────────────
//
// Scans each table and batch-deletes every item.  DynamoDB BatchWrite accepts
// up to 25 deletes per call, so we page through the full scan in chunks.
//
// Tables purged and why:
//   tagscanner_scan_cache    — fingerprint-keyed results; testers' cached scan
//                              would be served to real users of the same property
//   tagscanner_explain_cache — code-hash-keyed; tester explanations served to
//                              anyone explaining the same code snippet
//   tagscanner_ratelimits    — daily API quota + beta chat counts accumulated
//                              during testing; real users inherit tester counters
//   tagscanner_queries       — property-scoped history GSI exposes tester queries
//                              to other users scanning the same property (optional)

async function batchDeleteAll(tableName, pkAttr, skAttr) {
  let deleted = 0;
  let lastKey;
  const projAttrs = skAttr ? (pkAttr + ', ' + skAttr) : pkAttr;
  do {
    const scanResult = await ddb.send(new ScanCommand({
      TableName:            tableName,
      ProjectionExpression: projAttrs,
      ExclusiveStartKey:    lastKey
    }));
    const items = scanResult.Items || [];
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25);
      await ddb.send(new BatchWriteCommand({
        RequestItems: {
          [tableName]: chunk.map(item => ({ DeleteRequest: { Key: item } }))
        }
      }));
      deleted += chunk.length;
    }
    lastKey = scanResult.LastEvaluatedKey;
  } while (lastKey);
  return deleted;
}

async function handlePurgeTestData(body) {
  const { sessionToken, tables } = body;
  const session = await getSession(sessionToken);
  if (!session) return resp(401, { error: 'Invalid or expired session.' });
  if (!ADMIN_EMAIL) return resp(500, { error: 'Admin access not configured.' });
  if (session.email.toLowerCase() !== ADMIN_EMAIL) return resp(403, { error: 'Admin access required.' });

  // Default: purge all four tables.  Caller can pass tables:[] to pick a subset.
  const ALL = ['scan_cache', 'explain_cache', 'rate_limits', 'queries'];
  const scope = Array.isArray(tables) && tables.length ? tables : ALL;

  const results = {};

  if (scope.includes('scan_cache')) {
    try {
      results.scan_cache = await batchDeleteAll(SCAN_CACHE_TABLE, 'cache_key');
    } catch (err) {
      results.scan_cache = 'ERROR: ' + err.message;
    }
  }

  if (scope.includes('explain_cache')) {
    try {
      results.explain_cache = await batchDeleteAll(EXPLAIN_CACHE_TABLE, 'code_hash');
    } catch (err) {
      results.explain_cache = 'ERROR: ' + err.message;
    }
  }

  if (scope.includes('rate_limits')) {
    try {
      results.rate_limits = await batchDeleteAll(RATE_TABLE, 'pk');
    } catch (err) {
      results.rate_limits = 'ERROR: ' + err.message;
    }
  }

  if (scope.includes('queries')) {
    try {
      results.queries = await batchDeleteAll(QUERIES_TABLE, 'userId', 'queryId');
    } catch (err) {
      results.queries = 'ERROR: ' + err.message;
    }
  }

  const ts = new Date().toISOString();
  console.log(JSON.stringify({ ts, event: 'purge_test_data', by: session.email, results }));
  return resp(200, { ok: true, purgedAt: ts, deletedCounts: results });
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

    // ── Feedback (query-level rating) ───────────────────────────────────────
    if (type === 'feedback') return handleFeedback(body);

    // ── General feedback form (no auth required) ─────────────────────────────
    if (type === 'generalFeedback') return handleGeneralFeedback(body, sourceIp);

    // ── Get general feedback (admin only) ────────────────────────────────────
    if (type === 'getFeedback') return await handleGetFeedback(body);

    // ── Admin: all chat questions ────────────────────────────────────────────
    if (type === 'adminQueries') return await handleAdminQueries(body);

    // ── Users (admin) ───────────────────────────────────────────────────────
    if (type === 'users') return await handleUsers(body);

    // ── AI config (admin) ────────────────────────────────────────────────────
    if (type === 'config')        return handleConfig(body);
    if (type === 'setConfig')     return handleSetConfig(body);
    if (type === 'purgeTestData') return handlePurgeTestData(body);

    // ── Session ping (auth-optional — attributes to real user if signed in) ───
    if (type === 'session_ping') {
      const { clientId, siteHostname, propertyName, environment } = body;
      if (!clientId || typeof clientId !== 'string' || clientId.length > 64) {
        return resp(200, { ok: true });
      }
      // If a valid sessionToken is included, attribute this visit to the real user
      let pingUserId   = 'anon#' + clientId;
      let pingEmail    = '';
      let pingUserName = 'Anonymous';
      if (sessionToken) {
        const pingSession = await getSession(sessionToken);
        if (pingSession) {
          pingUserId   = pingSession.userId;
          pingEmail    = pingSession.email  || '';
          pingUserName = pingSession.name   || '';
        }
      }
      const pingId = new Date().toISOString() + '#' + randomId(8);
      try {
        await ddb.send(new PutCommand({
          TableName: QUERIES_TABLE,
          Item: {
            userId:         pingUserId,
            queryId:        pingId,
            type:           'visit',
            email:          pingEmail,
            userName:       pingUserName,
            clientId:       clientId,
            propertyKey:    (propertyName || '') + '#' + (environment || ''),
            siteUrl:        siteHostname ? 'https://' + siteHostname : '',
            siteHostname:   siteHostname || '',
            requestSummary: 'Visit: ' + (propertyName || 'Unknown'),
            tokens:         {},
            resultJson:     null,
            hasResult:      false,
            feedback:       null,
            feedbackText:   null,
            createdAt:      new Date().toISOString()
          }
        }));
      } catch (_) {}
      return resp(200, { ok: true });
    }

    // ── Scan / Explain — require a valid session ─────────────────────────────
    const session = await getSession(sessionToken);
    if (!session) {
      return resp(401, { error: 'Sign in with Google to use TagScanner AI.' });
    }
    const identity = { userId: session.userId, email: session.email };

    // Cache checks — happen BEFORE rate limiting so cache hits are always free
    if (type === 'explain' && body.code) {
      const codeHash   = nodeCrypto.createHash('sha256').update((body.code || '').trim()).digest('hex').slice(0, 16);
      const cachedItem = await getExplainCache(codeHash);
      if (cachedItem) {
        console.log(JSON.stringify({ ts: new Date().toISOString(), userId: identity.userId, type: 'explain_cache_hit', codeHash }));
        return resp(200, {
          explanation: cachedItem.explanation,
          tokens:      { input: 0, output: 0 },
          queryId:     null,
          cached:      true,
          cached_at:   cachedItem.cached_at,
          cached_by:   { email: cachedItem.cached_by_email, name: cachedItem.cached_by_name }
        });
      }
    }

    if (type === 'scan' && body.fingerprint && body.payload) {
      const cp          = body.payload;
      const cpName      = (cp.property && cp.property.name)        || 'Unknown';
      const cpEnv       = (cp.property && cp.property.environment) || 'Production';
      const cacheKey    = cpName + '#' + cpEnv + '#' + body.fingerprint;
      const cachedItem  = await getCachedScan(cacheKey);
      if (cachedItem) {
        console.log(JSON.stringify({ ts: new Date().toISOString(), userId: identity.userId, type: 'scan_cache_hit', cacheKey }));
        return resp(200, {
          report:    cachedItem.report,
          tokens:    { input: 0, output: 0 },
          queryId:   null,
          cached:    true,
          cached_at: cachedItem.cached_at,
          cached_by: { email: cachedItem.cached_by_email, name: cachedItem.cached_by_name }
        });
      }
    }

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
      const { payload, userContext, fingerprint } = body;
      const clientId = body.clientId || '';
      if (!payload) return resp(400, { error: 'Missing payload for scan.' });

      const userMsg      = JSON.stringify({ user_context: userContext || {}, property_health: payload });
      const result       = await invokeClaude(SCAN_SYSTEM_PROMPT, userMsg, MAX_TOKENS_SCAN);
      const report       = parseJSON(result.text);
      const propertyName = (payload.property && payload.property.name)        || 'Unknown property';
      const environment  = (payload.property && payload.property.environment) || 'Production';
      const siteUrl      = (payload.property && payload.property.url)         || '';
      const propertyKey  = propertyName + '#' + environment;

      const [queryId, newDayCost] = await Promise.all([
        logQuery(identity.userId, identity.email, session.name, 'scan', 'Property scan: ' + propertyName,
          { input: result.inputTokens, output: result.outputTokens }, report, propertyKey, siteUrl, clientId),
        trackCost(result.inputTokens, result.outputTokens)
      ]);

      // Store in scan cache keyed by composition fingerprint
      if (fingerprint) {
        const cacheKey = propertyName + '#' + environment + '#' + fingerprint;
        putCachedScan(cacheKey, report, { input: result.inputTokens, output: result.outputTokens },
          identity.email, session.name, propertyName, environment).catch(() => {});
      }

      if (newDayCost >= aiConfig.cost_limit_usd * ALERT_PCT) {
        sendCostThresholdAlert(newDayCost, aiConfig.cost_limit_usd).catch(() => {});
      }
      if (newDayCost > aiConfig.cost_limit_usd) {
        autoDisableAI('Daily cost limit of $' + aiConfig.cost_limit_usd.toFixed(2) + ' reached. AI disabled automatically.').catch(() => {});
      }

      trackAA({ vid: identity.userId, pageName: 'TagScanner:Summary', pe: 'lnk_o', pev2: 'Summary:AI Scan', events: 'event5', v1: propertyName, v2: environment, v3: (ADMIN_EMAIL && session.email.toLowerCase() === ADMIN_EMAIL) ? 'admin' : 'user', v5: 'Summary', v7: hashEmailSync(identity.email) });
      return resp(200, {
        report,
        tokens:  { input: result.inputTokens, output: result.outputTokens },
        queryId: queryId || null,
        cached:  false
      });
    }

    // ── Explain ───────────────────────────────────────────────────────────────
    if (type === 'explain') {
      const { code, metadata, propertyKey } = body;
      const clientId = body.clientId || '';
      if (!code) return resp(400, { error: 'Missing code for explain.' });

      const userMsg     = JSON.stringify({ code, metadata: metadata || {} });
      const result      = await invokeClaude(EXPLAIN_SYSTEM_PROMPT, userMsg, MAX_TOKENS_EXPLAIN);
      const explanation = parseJSON(result.text);

      const componentName = (metadata && metadata.name) || 'unknown';
      const codeHash      = nodeCrypto.createHash('sha256').update((code || '').trim()).digest('hex').slice(0, 16);

      const [queryId, newDayCost] = await Promise.all([
        logQuery(identity.userId, identity.email, session.name, 'explain',
          'Explain ' + (metadata && metadata.type || '') + ': ' + componentName,
          { input: result.inputTokens, output: result.outputTokens }, explanation, propertyKey || '', undefined, clientId),
        trackCost(result.inputTokens, result.outputTokens)
      ]);

      putExplainCache(codeHash, explanation, { input: result.inputTokens, output: result.outputTokens },
        identity.email, session.name, componentName, metadata && metadata.type, propertyKey).catch(() => {});

      if (newDayCost >= aiConfig.cost_limit_usd * ALERT_PCT) {
        sendCostThresholdAlert(newDayCost, aiConfig.cost_limit_usd).catch(() => {});
      }
      if (newDayCost > aiConfig.cost_limit_usd) {
        autoDisableAI('Daily cost limit of $' + aiConfig.cost_limit_usd.toFixed(2) + ' reached. AI disabled automatically.').catch(() => {});
      }

      trackAA({ vid: identity.userId, pageName: 'TagScanner:Rules', pe: 'lnk_o', pev2: 'Code:Explain', events: 'event5', v1: propertyKey || '', v3: (ADMIN_EMAIL && session.email.toLowerCase() === ADMIN_EMAIL) ? 'admin' : 'user', v5: 'Explain', v7: hashEmailSync(identity.email) });
      return resp(200, {
        explanation,
        tokens:  { input: result.inputTokens, output: result.outputTokens },
        queryId: queryId || null
      });
    }

    // ── Chat ──────────────────────────────────────────────────────────────────
    if (type === 'chat') return handleChat(body, session, identity, aiConfig, todayCost);

    return resp(400, { error: 'Invalid type. Use: auth, scan, explain, chat, history, feedback.' });

  } catch (err) {
    console.error('Lambda error:', err);
    return resp(500, { error: err.message || 'Internal server error' });
  }
};
