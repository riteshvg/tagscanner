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
 *   BEDROCK_MODEL_ID  (default: amazon.nova-lite-v1:0)
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

const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require('@aws-sdk/client-bedrock-runtime');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
  BatchWriteCommand,
} = require('@aws-sdk/lib-dynamodb');
const {
  SNSClient,
  PublishCommand: SNSPublishCommand,
} = require('@aws-sdk/client-sns');
const nodeCrypto = require('node:crypto');

// ── Config ────────────────────────────────────────────────────────────────────

const SNS_TOPIC_ARN = (process.env.SNS_TOPIC_ARN || '').trim();
const ALERT_PCT = 0.75; // send alert when daily cost crosses this fraction of the limit

const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'amazon.nova-lite-v1:0';
const CHAT_PROMPT_VERSION = 'v22';
const ENABLE_LOCAL_RESOLUTION =
  (process.env.ENABLE_LOCAL_RESOLUTION || 'true').toLowerCase() === 'true';
const REGION =
  process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-east-1';
const USERS_TABLE = (process.env.USERS_TABLE || 'tagscanner_users').trim();
const SESSIONS_TABLE = (
  process.env.SESSIONS_TABLE || 'tagscanner_sessions'
).trim();
const QUERIES_TABLE = (
  process.env.QUERIES_TABLE || 'tagscanner_queries'
).trim();
const ALLOWLIST = (process.env.ALLOWED_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

const MAX_TOKENS_EXPLAIN = 1000;
const MAX_TOKENS_CHAT = 2500;

function computeScanTokens(payload) {
  const rules = (payload && payload.rules && payload.rules.total) || 0;
  const de =
    (payload && payload.data_elements && payload.data_elements.total) || 0;
  return Math.min(4000, Math.max(2500, 2500 + rules * 10 + de * 5));
}

const bedrockClient = new BedrockRuntimeClient({ region: REGION });

const ddbClient = new DynamoDBClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);
const snsClient = SNS_TOPIC_ARN ? new SNSClient({ region: REGION }) : null;

// ── Rate limiting (DynamoDB-backed, global across all Lambda instances) ──────

const RATE_TABLE = (process.env.RATE_TABLE || 'tagscanner_ratelimits').trim();
const CONFIG_TABLE = (process.env.CONFIG_TABLE || 'tagscanner_config').trim();
const SCAN_CACHE_TABLE = (
  process.env.SCAN_CACHE_TABLE || 'tagscanner_scan_cache'
).trim();
const EXPLAIN_CACHE_TABLE = (
  process.env.EXPLAIN_CACHE_TABLE || 'tagscanner_explain_cache'
).trim();
const CHAT_CACHE_TABLE = (
  process.env.CHAT_CACHE_TABLE || 'tagscanner_chat_cache'
).trim();
const FEEDBACK_TABLE = (
  process.env.FEEDBACK_TABLE || 'tagscanner_feedback'
).trim();
const QUERIES_PROPERTY_INDEX = 'propertyKey-createdAt-index';
const DAILY_CAP = parseInt(process.env.DAILY_REQUEST_CAP || '20', 10);
const DEFAULT_COST_LIMIT = parseFloat(
  process.env.DEFAULT_COST_LIMIT_USD || '5.00',
);

// Cost rates — Nova Lite vs Claude Haiku (explain + chat only)
const isNovaModel = MODEL_ID.includes('amazon.nova');
const COST_INPUT_PER_TOKEN = isNovaModel ? 0.06 / 1e6 : 1.0 / 1e6;
const COST_OUTPUT_PER_TOKEN = isNovaModel ? 0.24 / 1e6 : 5.0 / 1e6;
// Pricing reference (as of 2025):
// Amazon Nova Lite:  $0.06/M input,  $0.24/M output
// Amazon Nova Micro: $0.035/M input, $0.14/M output
// Claude Haiku 3.5:  $1.00/M input,  $5.00/M output
// Claude Sonnet 4.6: $3.00/M input, $15.00/M output (scan only)

// Anthropic API Claude Sonnet 4.6 pricing (scan only)
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
const SCAN_MODEL_ID = 'claude-sonnet-4-6';
const COST_SCAN_INPUT_PER_TOKEN = 3.0 / 1e6; // $3.00 per 1M input tokens
const COST_SCAN_OUTPUT_PER_TOKEN = 15.0 / 1e6; // $15.00 per 1M output tokens

// Returns true if the caller should be blocked.
// Uses a DynamoDB item with a TTL of 24 h and an atomic counter.
async function isRateLimited(userId) {
  const windowKey = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const pk = userId + '#' + windowKey;
  const ttl = Math.floor(Date.now() / 1000) + 25 * 60 * 60; // expire after 25 h

  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: RATE_TABLE,
        Key: { pk },
        UpdateExpression:
          'SET #c = if_not_exists(#c, :zero) + :one, #ttl = if_not_exists(#ttl, :ttl)',
        ExpressionAttributeNames: { '#c': 'count', '#ttl': 'ttl' },
        ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':ttl': ttl },
        ReturnValues: 'ALL_NEW',
      }),
    );
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
    const result = await ddb.send(
      new GetCommand({ TableName: RATE_TABLE, Key: { pk } }),
    );
    return result.Item ? result.Item.count || 0 : 0;
  } catch (err) {
    console.error('getChatBetaCount error:', err.message);
    return 0;
  }
}

async function incrementChatBetaCount(userId, propertyKey) {
  const pk = 'chatbeta#' + userId + '#' + propertyKey;
  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: RATE_TABLE,
        Key: { pk },
        UpdateExpression: 'ADD #c :one',
        ExpressionAttributeNames: { '#c': 'count' },
        ExpressionAttributeValues: { ':one': 1 },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return result.Attributes.count || 0;
  } catch (err) {
    console.error('incrementChatBetaCount error:', err.message);
    return 0;
  }
}

async function getUserChatLimitOverride(userId) {
  try {
    const result = await ddb.send(
      new GetCommand({ TableName: USERS_TABLE, Key: { userId } }),
    );
    if (!result.Item) return null;
    return typeof result.Item.chat_limit_override === 'number'
      ? result.Item.chat_limit_override
      : null;
  } catch (err) {
    return null;
  }
}

// ── AI kill-switch helpers ────────────────────────────────────────────────────

async function getAIConfig() {
  try {
    const result = await ddb.send(
      new GetCommand({ TableName: CONFIG_TABLE, Key: { pk: 'global' } }),
    );
    if (!result.Item)
      return {
        ai_enabled: true,
        disabled_reason: '',
        cost_limit_usd: DEFAULT_COST_LIMIT,
        chat_question_limit: BETA_CHAT_LIMIT,
      };
    return {
      ai_enabled: result.Item.ai_enabled !== false,
      disabled_reason: result.Item.disabled_reason || '',
      cost_limit_usd:
        typeof result.Item.cost_limit_usd === 'number'
          ? result.Item.cost_limit_usd
          : DEFAULT_COST_LIMIT,
      chat_question_limit:
        typeof result.Item.chat_question_limit === 'number'
          ? result.Item.chat_question_limit
          : BETA_CHAT_LIMIT,
    };
  } catch (err) {
    console.error('getAIConfig error:', err.message);
    return {
      ai_enabled: true,
      disabled_reason: '',
      cost_limit_usd: 5.0,
      chat_question_limit: BETA_CHAT_LIMIT,
    };
  }
}

async function getTodayCost() {
  const windowKey = new Date().toISOString().slice(0, 10);
  try {
    const result = await ddb.send(
      new GetCommand({
        TableName: CONFIG_TABLE,
        Key: { pk: 'cost#' + windowKey },
      }),
    );
    return result.Item && typeof result.Item.cost_usd === 'number'
      ? result.Item.cost_usd
      : 0;
  } catch (err) {
    console.error('getTodayCost error:', err.message);
    return 0;
  }
}

// Atomically increments today's cost; returns the new daily total.
async function trackCost(inputTokens, outputTokens, inputRate, outputRate) {
  const windowKey = new Date().toISOString().slice(0, 10);
  const inRate = inputRate !== undefined ? inputRate : COST_INPUT_PER_TOKEN;
  const outRate = outputRate !== undefined ? outputRate : COST_OUTPUT_PER_TOKEN;
  const cost = inputTokens * inRate + outputTokens * outRate;
  const ttl = Math.floor(Date.now() / 1000) + 8 * 24 * 60 * 60; // keep 8 days
  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: CONFIG_TABLE,
        Key: { pk: 'cost#' + windowKey },
        UpdateExpression:
          'ADD cost_usd :cost SET #ttl = if_not_exists(#ttl, :ttl)',
        ExpressionAttributeNames: { '#ttl': 'ttl' },
        ExpressionAttributeValues: { ':cost': cost, ':ttl': ttl },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return (result.Attributes && result.Attributes.cost_usd) || 0;
  } catch (err) {
    console.error('trackCost error:', err.message);
    return 0;
  }
}

async function publishSNSAlert(subject, message) {
  if (!snsClient || !SNS_TOPIC_ARN) return;
  try {
    await snsClient.send(
      new SNSPublishCommand({
        TopicArn: SNS_TOPIC_ARN,
        Subject: subject.slice(0, 100),
        Message: message,
      }),
    );
  } catch (err) {
    console.error('publishSNSAlert error:', err.message);
  }
}

// Sends a 75% threshold alert once per day (deduped via RATE_TABLE).
async function sendCostThresholdAlert(newCost, limit) {
  const windowKey = new Date().toISOString().slice(0, 10);
  const alertKey = 'alert_75pct#' + windowKey;
  const ttl = Math.floor(Date.now() / 1000) + 25 * 60 * 60;

  try {
    const existing = await ddb.send(
      new GetCommand({ TableName: RATE_TABLE, Key: { pk: alertKey } }),
    );
    if (existing.Item) return; // already sent today
    await ddb.send(
      new PutCommand({ TableName: RATE_TABLE, Item: { pk: alertKey, ttl } }),
    );
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
      'To raise or lower the limit, use the TagScanner dashboard.',
    ].join('\n'),
  );
}

async function autoDisableAI(reason) {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: CONFIG_TABLE,
        Key: { pk: 'global' },
        UpdateExpression: 'SET #en = :f, disabled_reason = :dr',
        ExpressionAttributeNames: { '#en': 'ai_enabled' },
        ExpressionAttributeValues: { ':f': false, ':dr': reason },
      }),
    );
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: 'ai_auto_disabled',
        reason,
      }),
    );
    await publishSNSAlert(
      'TagScanner AI Auto-Disabled — Cost Limit Reached',
      [
        'TagScanner AI has been automatically disabled.',
        '',
        'Reason: ' + reason,
        '',
        'Re-enable via the TagScanner dashboard when ready.',
      ].join('\n'),
    );
  } catch (err) {
    console.error('autoDisableAI error:', err.message);
  }
}

// ── Adobe Analytics server-side tracking ─────────────────────────────────────

const AA_RSID = 'ageo1xxsintagscanner';
const AA_TRACKING_SERVER = 'adobeintriteshgupta.sc.omtrdc.net';
const AA_ENDPOINT = `https://${AA_TRACKING_SERVER}/b/ss/${AA_RSID}/0`;
const AA_APP_VERSION = '2.5.7';

function hashEmailSync(email) {
  if (!email) return '';
  return nodeCrypto
    .createHash('sha256')
    .update(email.toLowerCase().trim())
    .digest('hex');
}

// Fire-and-forget GET hit to the Adobe Analytics Data Insertion API.
// Called after each meaningful server event; never awaited so it cannot
// add latency or break the main response path.
function trackAA(params) {
  try {
    const base = {
      // ── Required ─────────────────────────────────────────────────────────
      ce: 'UTF-8', // character encoding
      g: 'https://tagscanner-lambda', // pageURL placeholder for server-side hits
      ts: new Date().toISOString(), // ISO 8601 timestamp
      // ── Recommended ──────────────────────────────────────────────────────
      ch: 'TagScanner', // site section / channel
      // ── Custom dimensions ─────────────────────────────────────────────────
      v4: AA_APP_VERSION, // eVar4: app version
    };
    const merged = Object.assign({}, base, params);
    if (merged.pev2 && !merged.v9) merged.v9 = merged.pev2;
    if (merged.pageName && !merged.v11) merged.v11 = merged.pageName;
    const qs = Object.keys(merged)
      .map(
        (k) =>
          encodeURIComponent(k) +
          '=' +
          encodeURIComponent(merged[k] != null ? merged[k] : ''),
      )
      .join('&');
    fetch(`${AA_ENDPOINT}?${qs}`, { method: 'GET' }).catch(() => {});
  } catch (_) {}
}

// ── CORS ──────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const resp = (status, body) => ({
  statusCode: status,
  headers: CORS_HEADERS,
  body: JSON.stringify(body),
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

// ── Bedrock invocation ────────────────────────────────────────────────────────

const CHAT_SYSTEM_PROMPT = `You are an expert Adobe Tags (Launch / Data Collection) consultant embedded in the TagScanner Chrome extension. You have deep knowledge of tag management best practices, Adobe Experience Platform, data governance, and JavaScript performance.

CORE RULE — answer the question asked and stop. Do not add observations, recommendations, governance notes, or best-practice commentary unless the user explicitly asks for it. Length is determined by the completeness of the answer, not by thoroughness for its own sake.

Tone: direct and technically precise. No filler phrases ("Great question!", "Certainly!", "Absolutely!"). No hedging language unless genuinely uncertain. Write like a senior consultant who respects the user's time.

━━━ WHAT YOU DO ━━━

Your primary mission is to help Adobe Tags implementers understand and improve their deployed property by:
- Answering factual questions about rules, data elements, and extensions present in the property
- Identifying unused components, configuration risks, and implementation health issues
- Explaining what specific components do and how they interact with each other
- Guiding implementers toward cleaner, more maintainable tag implementations

━━━ OPERATIONAL CONTEXT ━━━

- You operate as a read-only advisor inside a Chrome extension running in the user's own browser
- Users are Adobe Tags implementers — developers, analysts, or tag managers — working on properties they own or manage
- You are advisory only: you cannot deploy changes, modify rules, publish containers, or access any Adobe system
- Property names, rule names, and data element names are proprietary implementation details — use them only to answer the question at hand, do not repeat them unnecessarily
- The property_context does not contain end-user personal data; if any appears (e.g. a hardcoded value in a custom code snippet), do not repeat, store, or elaborate on it
- When uncertain whether a recommendation is safe to make, default to flagging the risk rather than prescribing a specific action

━━━ INPUT FORMAT ━━━

You will receive a JSON object with two fields:
- "property_context": a structured summary of the user's Tags property
- "question": the user's natural language question about their property

━━━ PROPERTY CONTEXT FIELD REFERENCE — use these fields, in this order of preference ━━━

property_context.property
  name, environment, url — basic property metadata

property_context.rules[]
  name — rule name
  events[] — trigger type + extension
  conditions[] — condition type + extension (metadata only, no logic)
  actions[] — action type + extension (metadata only, no logic)
  hasCustomCode — boolean
  dataElementRefs[] — TRANSITIVE list of all DE names this rule depends on (any depth)
  directDataElementRefs[] — DIRECT %TOKEN% references only (one hop)

property_context.dataElements[]
  name, extension, type, storageDuration, hasCustomCode
  usedInRules — boolean: true if this DE appears in any rule's transitive dependency set
  references[] — DE names this DE directly references via %TOKEN% syntax
  referencedByDEs[] — DE names that directly reference this DE
  directlyUsedInRules[] — rule names that reference this DE directly
  ruleUsageSummary — pre-computed usage breakdown:
    direct[] — rules that reference this DE directly
    transitive[] — objects: { rule, via[] } — rules that reach this DE through a chain; via[] is the full intermediate path
    viaNameVariants[] — objects: { rule, variant, via[] } — rules that reach this DE via a name-substring match
  ruleUsageText — pre-formatted prose describing all rule usage; USE THIS as the basis for "where is this DE used" answers
  deUsageText — always present; describes this DE's usage from the DE perspective
  nameVariants[] — other DE names that contain this DE's name as a case-insensitive substring

property_context.extensions[]
  name, displayName, hasSettings

property_context.unusedDataElements[] — names of all DEs where usedInRules === false
property_context.unusedDataElementCount — count of unused DEs
property_context.data_note — always surface this before any counts or lists
property_context.note_rules — present only when rules are truncated; always surface before listing rules
property_context.note_de — present only when DEs are truncated; always surface before listing DEs

━━━ CRITICAL DATA LIMITATIONS — read in order, highest risk first ━━━

1. NEVER infer or guess what a data element returns, does, or checks based on its name alone. Only its type and extension are available. Only state what property_context explicitly shows.

2. NEVER infer or guess what a rule condition checks or what an action does based on its name alone. Only component type metadata is available.

3. NEVER compare installed extension versions against current release versions. You have no marketplace access. State only what version is installed.

4. NEVER state definitively that a component "does not exist." property_context is read from the DEPLOYED container only. DISABLED rules are excluded. If a component is not present, say it is not visible in the deployed container.

5. The "enabled" field on rules is not reliable. All rules present in the context are active by definition.

6. Custom code content is not included — only the hasCustomCode boolean. If asked about code inside a component, say it is not available.

7. If data_note, note_rules, or note_de are present, always surface them before giving counts or lists.

8. unusedDataElements is pre-computed and authoritative. Never recompute it from the dataElements array.

9. ruleUsageSummary and ruleUsageText are pre-computed and authoritative for all DE usage questions. Never attempt to recompute DE-to-rule relationships manually.

━━━ MISSING OR MALFORMED CONTEXT ━━━

If property_context is missing, empty, or lacks the fields needed to answer, respond:
"I can't see your property data right now — try refreshing the page and opening TagScanner again."

━━━ DEPENDENCY QUERY RESOLUTION ━━━

For all questions about where a component is used, what depends on it, or what it depends on — always use the pre-computed fields. Never compute dependency chains manually.

FINDING WHERE A DE IS USED
Use ruleUsageText as the primary source. It is pre-formatted and covers direct use, transitive chains, and name-variant matches. Structure your answer as:
- Direct use: rules in ruleUsageSummary.direct[]
- Via chain: rules in ruleUsageSummary.transitive[], show the full via[] path for each: "Rule A (via DE Y → DE Z)"
- Via name match: rules in ruleUsageSummary.viaNameVariants[], note it is a name-substring match, not a confirmed reference
If ruleUsageText is present, use it as your basis and do not contradict it.

FINDING WHICH DE REFERENCES A GIVEN DE — "which data element references X?" / "which DE contains X?" / "what references X?"
This is a DE-to-DE reference query, not a rule query. Answer in this order:

1. Look up X in dataElements[]. Find its referencedByDEs[] — these are the DEs that directly reference X via %TOKEN% syntax.
2. If referencedByDEs[] is empty, say X is not directly referenced by any other data element.
3. If referencedByDEs[] has entries, list them as the primary answer — these are the parent DEs.
4. For each parent DE, show which rules use it via its ruleUsageSummary — these are the rules that indirectly depend on X through the chain.
5. Format the complete answer exactly as:

   "[X] is directly referenced by:
   - [Parent DE 1] (Data Element)
   - [Parent DE 2] (Data Element)

   These data elements feed into the following rules:
   - [Rule A] (Rule)
   - [Rule B] (Rule)"

   If property_context._keywordMatches.reverseDeResult is present, use reverseDeResult.referencedByDEs[] as the authoritative parent DE list. For each parent DE, look up that DE in dataElements[] and use its ruleUsageSummary to build the rules list.

   Do not add a summary paragraph after the lists.
   Do not repeat information already shown in the lists.
   Stop after the rules list.
   If referencedByDEs[] is empty, respond:
   "[X] is not directly referenced by any other data element."

Never skip the parent DE layer and jump straight to rules. The rules are secondary context, not the answer to the question.

OUTPUT FORMAT FOR ALL DEPENDENCY / REFERENCE ANSWERS
When a response lists more than one item, prefix each item with its component type in parentheses so the user knows what they are looking at:

- [Component Name] (Data Element)
- [Component Name] (Rule)
- [Component Name] (Extension)

Single-item answers do not need the type prefix if the type is already clear from the prose context.

FINDING WHAT A RULE DEPENDS ON
Use dataElementRefs[] for the full transitive set. Use directDataElementRefs[] for direct references only. If the user asks "what DEs does Rule X need?", list dataElementRefs[]. If they ask "what DEs does Rule X directly reference?", list directDataElementRefs[].

IMPACT ANALYSIS — "what breaks if I delete X?"
1. Find the DE named X in dataElements[]
2. List its referencedByDEs[] — these DEs break directly
3. For each DE in referencedByDEs[], check their ruleUsageSummary to find which rules are affected
4. List the full blast radius: broken DEs and affected rules, with chain paths

REVERSE TRAVERSAL — "what does DE X depend on?"
Use references[] on DE X for direct dependencies. For each DE in references[], check their references[] recursively to find the full upstream chain. Report the full chain.

CHAIN DEPTH
Count hops from DE X through references[] recursively to find max depth. Report the longest chain and its path.

━━━ EXACT vs PARTIAL NAME MATCHING ━━━

SUBSTRING SEARCH — DEFAULT FOR ALL NAME-FILTER QUERIES
If property_context._keywordMatches is present for this question, treat matchingDEs[] and matchingRules[] as the authoritative complete match list. Report the count and list every name. Do not search independently.

When no _keywordMatches is present and a user asks which/how many components contain a word or keyword,
follow these steps in order:

STEP 1 — FLAT ARRAY SCAN FIRST, ALWAYS
Before doing anything else, scan the complete dataElements[] array from index 0 to the end. Check every single entry. For each entry, check whether the entry's name field contains the search word as a case-insensitive substring. Build a complete match list from this scan.

This scan is mandatory and must not be shortcut, skipped, or replaced by traversing dependency structures. It must cover:
- DEs with usedInRules: true AND usedInRules: false
- DEs with references AND DEs with no references
- DEs that appear in ruleUsageSummary AND DEs that do not
- DEs with referencedByDEs entries AND completely isolated DEs
- DEs at the start, middle, or end of dependency chains

STEP 2 — REPORT THE COMPLETE MATCH LIST
List every DE found in step 1. Never omit a match because it is unused, isolated, or does not appear in any dependency structure.

CRITICAL — NEVER INVENT COMPONENT NAMES
If the scan finds zero matches, respond:
"No data elements found containing '[keyword]'."

Do not suggest component names that "might" exist.
Do not list examples from other properties.
Do not fabricate plausible-sounding names.
Only list components that actually appear in
property_context.dataElements[].

STEP 3 — THEN ANSWER THE QUESTION
After listing all matches, answer whatever was asked.

SUBSTRING RULES
- Case-insensitive: "campaign" matches "Campaign", "CAMPAIGN", "S_Campaign"
- Token-agnostic: match anywhere in the name regardless of separators (spaces, underscores, dashes, brackets)
- No prefix requirement: "Campaign ID" must match even though "campaign" is at the start
- No suffix requirement: "UTM Campaign" must match even though "campaign" is at the end
- No adjacency requirement: "Form Name - Campaign - On Page Load" must match even though "campaign" is surrounded by dashes and spaces

Example substring matching:
- Keyword "page" matches: "pageName", "Page URL", "Previous Page"
- Keyword "email" matches: "Email Address", "Hashed Email", "CRM_Email_ID"
- If zero matches found, respond: "No data elements found containing '[keyword]'."

Never return a count without listing every matched component.

Exact match: user provides a full quoted name or asks "is there a [exact name]".
- If found: use it.
- If not found: say it is not visible in the deployed container. Do not fuzzy match silently.

Name variant awareness: check nameVariants[] when a DE is not found by exact match — a DE with a similar name may exist. Surface it as a possible match, never as a confirmed one.

Never silently pick the closest match. Always surface ambiguity.

━━━ SCOPE ━━━

You answer questions about the user's Adobe Tags property and general Adobe Tags / AEP knowledge (e.g. how data layers work, what XDM is, best practices).

Never reject questions that use shorthand like "DE" (data element), "rule", or "extension". Never reject "where is X used?", "what references X?", "which DE has X?", "which rules use X?", or any question that names a component or asks about dependencies — these are always in scope regardless of phrasing.

If a question is completely unrelated to Adobe Tags, tag management, or digital analytics, respond:
"That's outside what I can help with here — I'm focused on your Adobe Tags property. Ask me about your rules, data elements, extensions, or implementation health."

━━━ MULTI-TURN CONTEXT ━━━

- Use only the property_context from the CURRENT message for all factual lookups
- Prior turns are for conversational continuity only — never carry forward component names, counts, or findings from earlier turns
- If the user references a component from a prior turn, re-validate it against the current property_context before responding. If it is no longer present, say so.

━━━ OUTPUT FORMAT ━━━

Match format to question type. If a question spans multiple types, lead with the factual answer, then the diagnostic finding — never reversed.

- Factual lookup ("how many rules?", "which extensions?"): count first, then a "-" list of every matching name. Never answer a count without listing what was counted.
- Dependency / usage ("where is DE X used?"): use ruleUsageText as basis; structure as direct → transitive (with via path) → name variants
- Impact analysis ("what breaks if I delete X?"): blast radius list — broken DEs first, then affected rules, with chain paths
- Diagnostic ("any unused components?", "rules without conditions?"): finding → impact → what to address (only if asked)
- Explanation ("what does this rule do?"): what it does → how it works → what it feeds
- Health / risk ("biggest risks?"): ranked "-" list, lead each item with severity or component name
- Follow-up ("why?", "explain that"): answer only what was asked, re-validate against current property_context
- Grouped views ("DEs by extension", "rules by trigger"): use a markdown table with columns for the grouping key and items. Example:
  | Extension | Data Elements | Count |
  |-----------|---------------|-------|
  | core | pageName, pageURL | 2 |

━━━ HOW TO RESPOND ━━━

1. Answer directly and accurately from the current message's property_context only.
2. Reason internally — never show intermediate reasoning steps. Output only the conclusion.
3. Never reference internal field names (property_context, ruleUsageSummary, data_note, JSON keys). Use plain language: "your property", "the data I can see".
4. When listing items, use a "-" bulleted list. Keep lists scannable.
5. NEVER truncate a list. Show all items regardless of length. Never add "... and N more".
6. If property_context does not contain enough information to answer, say so — do not guess or fabricate. NEVER invent component names, counts, or field values. Only state what property_context explicitly shows. If a component is not in the array, it does not exist in the deployed container — do not suggest it "might" exist or list it as an example.
7. Return plain text only — no JSON, no markdown code blocks.`;

// Multi-turn version of invokeClaude — takes a messages array instead of a single string
async function invokeClaudeChat(messages, maxTokens) {
  const isNova = MODEL_ID.includes('amazon.nova');
  let bodyObj;

  if (isNova) {
    bodyObj = {
      system: [{ text: CHAT_SYSTEM_PROMPT }],
      messages: messages.map((m) => ({
        role: m.role,
        content: [{ text: m.content }],
      })),
      inferenceConfig: { max_new_tokens: maxTokens, temperature: 0.3 },
    };
  } else {
    bodyObj = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      temperature: 0.3,
      system: CHAT_SYSTEM_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
  }

  const cmd = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: Buffer.from(JSON.stringify(bodyObj)),
  });

  const raw = await bedrockClient.send(cmd);
  const data = JSON.parse(Buffer.from(raw.body).toString());

  const text = isNova
    ? (data.output &&
        data.output.message &&
        data.output.message.content &&
        data.output.message.content[0] &&
        data.output.message.content[0].text) ||
      ''
    : (data.content && data.content[0] && data.content[0].text) || '';

  return {
    text,
    inputTokens: isNova
      ? (data.usage && data.usage.inputTokens) || 0
      : (data.usage && data.usage.input_tokens) || 0,
    outputTokens: isNova
      ? (data.usage && data.usage.outputTokens) || 0
      : (data.usage && data.usage.output_tokens) || 0,
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
  const cleanHistory = (
    Array.isArray(conversationHistory) ? conversationHistory : []
  )
    .slice(-MAX_HISTORY)
    .filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string',
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, 3000) }));

  const propertyName =
    (propertyContext.property && propertyContext.property.name) || 'Unknown';
  const environment =
    (propertyContext.property && propertyContext.property.environment) || '';
  const propertyKey = propertyName + (environment ? '#' + environment : '');
  const siteUrl =
    (propertyContext.property && propertyContext.property.url) || '';

  // Beta limit — skip for admin; apply global config limit (or per-user override if set)
  const isAdminUser =
    ADMIN_EMAIL && session.email.toLowerCase() === ADMIN_EMAIL;
  const limitOverride = isAdminUser
    ? -1
    : await getUserChatLimitOverride(identity.userId);
  const globalLimit = aiConfig.chat_question_limit || BETA_CHAT_LIMIT;
  const effectiveLimit =
    limitOverride === -1
      ? Infinity
      : limitOverride > 0
        ? limitOverride
        : globalLimit;
  const betaCount =
    effectiveLimit === Infinity
      ? 0
      : await getChatBetaCount(identity.userId, propertyKey);
  if (effectiveLimit !== Infinity && betaCount >= effectiveLimit) {
    return resp(429, {
      error:
        'Beta question limit reached for this property (' +
        effectiveLimit +
        '/' +
        effectiveLimit +
        '). The limit resets when the beta period ends.',
      betaLimitReached: true,
      chatCount: betaCount,
      chatLimit: effectiveLimit,
    });
  }

  // Cache check — only for standalone (first-turn) questions with no prior history
  // PROMPT_VERSION: bump this string whenever CHAT_SYSTEM_PROMPT changes to bust stale cache entries
  let chatCacheKey = null;
  if (cleanHistory.length === 0) {
    const ctxHash = nodeCrypto
      .createHash('sha256')
      .update(JSON.stringify(propertyContext))
      .digest('hex')
      .slice(0, 16);
    chatCacheKey =
      'chat#' +
      nodeCrypto
        .createHash('sha256')
        .update(
          question.trim().toLowerCase() +
            '|' +
            propertyKey +
            '|' +
            ctxHash +
            '|' +
            CHAT_PROMPT_VERSION,
        )
        .digest('hex')
        .slice(0, 16);

    const cached = await getChatCache(chatCacheKey);
    if (cached && cached.answer) {
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          userId: identity.userId,
          type: 'chat_cache_hit',
          chatCacheKey,
        }),
      );
      const queryId = await logQuery(
        identity.userId,
        identity.email,
        session.name,
        'chat',
        'Chat: ' + question.trim().slice(0, 120),
        { input: 0, output: 0 },
        { question: question.trim(), answer: cached.answer },
        propertyKey,
        siteUrl,
        clientId,
      );
      return resp(200, {
        answer: cached.answer,
        tokens: { input: 0, output: 0 },
        queryId: queryId || null,
        fromCache: true,
        enableLocalResolution: ENABLE_LOCAL_RESOLUTION,
      });
    }
  }

  // Current user turn embeds property context + question
  const userPayload = JSON.stringify({
    property_context: propertyContext,
    question: question.trim().slice(0, 1000),
  });

  const messages = [...cleanHistory, { role: 'user', content: userPayload }];

  trackAA({
    vid: identity.userId,
    pageName: 'TagScanner:Ask AI',
    pe: 'lnk_o',
    pev2: 'Ask AI:Question',
    events: 'event2',
    v1: propertyName,
    v2: environment,
    v3: isAdminUser ? 'admin' : 'user',
    v5: 'Ask AI',
    v7: hashEmailSync(identity.email),
    v8: question.trim().slice(0, 255),
  });
  const result = await invokeClaudeChat(messages, MAX_TOKENS_CHAT);

  const [queryId, newDayCost] = await Promise.all([
    logQuery(
      identity.userId,
      identity.email,
      session.name,
      'chat',
      'Chat: ' + question.trim().slice(0, 120),
      { input: result.inputTokens, output: result.outputTokens },
      { question: question.trim(), answer: result.text },
      propertyKey,
      siteUrl,
      clientId,
    ),
    trackCost(result.inputTokens, result.outputTokens),
  ]);

  // Populate cache for future first-turn requests with the same question + property
  if (chatCacheKey) {
    putChatCache(
      chatCacheKey,
      result.text,
      { input: result.inputTokens, output: result.outputTokens },
      propertyKey,
    ).catch(() => {});
  }

  // Increment beta count (fire-and-forget for non-unlimited users)
  let newBetaCount = betaCount;
  if (effectiveLimit !== Infinity) {
    newBetaCount = await incrementChatBetaCount(identity.userId, propertyKey);
  }

  if (newDayCost >= aiConfig.cost_limit_usd * ALERT_PCT) {
    sendCostThresholdAlert(newDayCost, aiConfig.cost_limit_usd).catch(() => {});
  }
  if (newDayCost > aiConfig.cost_limit_usd) {
    autoDisableAI(
      'Daily cost limit of $' +
        aiConfig.cost_limit_usd.toFixed(2) +
        ' reached.',
    ).catch(() => {});
  }

  trackAA({
    vid: identity.userId,
    pageName: 'TagScanner:Ask AI',
    pe: 'lnk_o',
    pev2: 'Ask AI:Answer',
    events: 'event3',
    v1: propertyName,
    v2: environment,
    v3: isAdminUser ? 'admin' : 'user',
    v5: 'Ask AI',
    v7: hashEmailSync(identity.email),
  });
  return resp(200, {
    answer: result.text,
    tokens: { input: result.inputTokens, output: result.outputTokens },
    queryId: queryId || null,
    chatCount: effectiveLimit === Infinity ? null : newBetaCount,
    chatLimit: effectiveLimit === Infinity ? null : effectiveLimit,
    enableLocalResolution: ENABLE_LOCAL_RESOLUTION,
  });
}

async function invokeClaude(systemPrompt, userMessage, maxTokens) {
  const isNova = MODEL_ID.includes('amazon.nova');
  let bodyObj;

  if (isNova) {
    bodyObj = {
      system: [{ text: systemPrompt }],
      messages: [{ role: 'user', content: [{ text: userMessage }] }],
      inferenceConfig: { max_new_tokens: maxTokens, temperature: 0.3 },
    };
  } else {
    bodyObj = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    };
  }

  const cmd = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: Buffer.from(JSON.stringify(bodyObj)),
  });

  const raw = await bedrockClient.send(cmd);
  const data = JSON.parse(Buffer.from(raw.body).toString());

  const text = isNova
    ? (data.output &&
        data.output.message &&
        data.output.message.content &&
        data.output.message.content[0] &&
        data.output.message.content[0].text) ||
      ''
    : (data.content && data.content[0] && data.content[0].text) || '';

  return {
    text,
    inputTokens: isNova
      ? (data.usage && data.usage.inputTokens) || 0
      : (data.usage && data.usage.input_tokens) || 0,
    outputTokens: isNova
      ? (data.usage && data.usage.outputTokens) || 0
      : (data.usage && data.usage.output_tokens) || 0,
  };
}

async function invokeAnthropicDirect(systemPrompt, userMessage, maxTokens) {
  if (!ANTHROPIC_API_KEY)
    throw new Error('ANTHROPIC_API_KEY is not configured.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: SCAN_MODEL_ID,
      max_tokens: maxTokens,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      'Anthropic API error ' +
        res.status +
        ': ' +
        ((err.error && err.error.message) || res.statusText),
    );
  }
  const data = await res.json();
  return {
    text: (data.content && data.content[0] && data.content[0].text) || '',
    inputTokens: (data.usage && data.usage.input_tokens) || 0,
    outputTokens: (data.usage && data.usage.output_tokens) || 0,
  };
}

function parseJSON(text) {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/g, '')
    .trim();
  return JSON.parse(cleaned);
}

function randomId(len) {
  return Math.random()
    .toString(36)
    .slice(2, 2 + len);
}

// ── DynamoDB helpers ──────────────────────────────────────────────────────────

async function getSession(sessionToken) {
  if (!sessionToken) return null;
  try {
    const result = await ddb.send(
      new GetCommand({
        TableName: SESSIONS_TABLE,
        Key: { sessionToken },
      }),
    );
    const session = result.Item;
    if (!session) return null;
    if (session.expiresAt < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch (err) {
    console.error('getSession error:', err.message);
    return null;
  }
}

async function logQuery(
  userId,
  email,
  userName,
  type,
  requestSummary,
  tokens,
  resultJson,
  propertyKey,
  siteUrl,
  clientId,
) {
  const queryId = new Date().toISOString() + '#' + randomId(8);
  let siteHostname = '';
  try {
    siteHostname = siteUrl ? new URL(siteUrl).hostname : '';
  } catch (_) {}
  try {
    await ddb.send(
      new PutCommand({
        TableName: QUERIES_TABLE,
        Item: {
          userId,
          queryId,
          type,
          email,
          userName: userName || '',
          clientId: clientId || '',
          propertyKey: propertyKey || '',
          siteUrl: siteUrl || '',
          siteHostname: siteHostname,
          requestSummary,
          tokens: tokens || {},
          resultJson: resultJson || null,
          hasResult: resultJson ? true : false,
          feedback: null,
          feedbackText: null,
          createdAt: new Date().toISOString(),
        },
      }),
    );
    return queryId;
  } catch (err) {
    console.error('logQuery error:', err.message);
    return null;
  }
}

// ── Scan cache helpers ────────────────────────────────────────────────────────

async function getCachedScan(cacheKey) {
  try {
    const result = await ddb.send(
      new GetCommand({
        TableName: SCAN_CACHE_TABLE,
        Key: { cache_key: cacheKey },
      }),
    );
    return result.Item || null;
  } catch (err) {
    console.error('getCachedScan error:', err.message);
    return null;
  }
}

async function putCachedScan(
  cacheKey,
  report,
  tokens,
  email,
  name,
  propertyName,
  environment,
) {
  const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30-day cleanup TTL
  try {
    await ddb.send(
      new PutCommand({
        TableName: SCAN_CACHE_TABLE,
        Item: {
          cache_key: cacheKey,
          report: report,
          tokens: tokens,
          cached_at: new Date().toISOString(),
          cached_by_email: email,
          cached_by_name: name || email,
          property_name: propertyName,
          environment: environment,
          ttl: ttl,
        },
      }),
    );
  } catch (err) {
    console.error('putCachedScan error:', err.message);
  }
}

// ── Explain cache helpers ─────────────────────────────────────────────────────

async function getExplainCache(codeHash) {
  try {
    const result = await ddb.send(
      new GetCommand({
        TableName: EXPLAIN_CACHE_TABLE,
        Key: { code_hash: codeHash },
      }),
    );
    return result.Item || null;
  } catch (err) {
    console.error('getExplainCache error:', err.message);
    return null;
  }
}

async function putExplainCache(
  codeHash,
  explanation,
  tokens,
  email,
  name,
  componentName,
  componentType,
  propertyKey,
) {
  const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  try {
    await ddb.send(
      new PutCommand({
        TableName: EXPLAIN_CACHE_TABLE,
        Item: {
          code_hash: codeHash,
          explanation: explanation,
          tokens: tokens,
          cached_at: new Date().toISOString(),
          cached_by_email: email,
          cached_by_name: name || email,
          component_name: componentName || '',
          component_type: componentType || '',
          property_key: propertyKey || '',
          ttl: ttl,
        },
      }),
    );
  } catch (err) {
    console.error('putExplainCache error:', err.message);
  }
}

// ── Chat cache helpers (keyed on question + property context hash) ────────────

async function getChatCache(cacheKey) {
  try {
    const result = await ddb.send(
      new GetCommand({
        TableName: CHAT_CACHE_TABLE,
        Key: { cache_key: cacheKey },
      }),
    );
    return result.Item || null;
  } catch (err) {
    console.error('getChatCache error:', err.message);
    return null;
  }
}

async function putChatCache(cacheKey, answer, tokens, propertyKey) {
  const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7-day TTL
  try {
    await ddb.send(
      new PutCommand({
        TableName: CHAT_CACHE_TABLE,
        Item: {
          cache_key: cacheKey,
          answer: answer,
          tokens: tokens,
          cached_at: new Date().toISOString(),
          property_key: propertyKey || '',
          ttl: ttl,
        },
      }),
    );
  } catch (err) {
    console.error('putChatCache error:', err.message);
  }
}

// ── Detail handler ────────────────────────────────────────────────────────────

async function handleDetail(body) {
  const { sessionToken, queryId, ownerId } = body;
  const session = await getSession(sessionToken);
  if (!session)
    return resp(401, {
      error: 'Invalid or expired session. Please sign in again.',
    });
  if (!queryId) return resp(400, { error: 'Missing queryId.' });

  // ownerId lets admin fetch another user's query result
  if (
    ownerId &&
    (!ADMIN_EMAIL || session.email.toLowerCase() !== ADMIN_EMAIL)
  ) {
    return resp(403, { error: 'Admin access required.' });
  }
  const lookupUserId = ownerId || session.userId;

  try {
    const result = await ddb.send(
      new GetCommand({
        TableName: QUERIES_TABLE,
        Key: { userId: lookupUserId, queryId },
      }),
    );
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
  if (!googleAccessToken)
    return resp(400, { error: 'Missing googleAccessToken' });

  // Rate-limit auth attempts by IP to prevent token-grinding
  if (sourceIp && (await isRateLimited('auth#' + sourceIp))) {
    return resp(429, {
      error: 'Too many sign-in attempts. Please try again later.',
    });
  }

  // Verify token + get profile from Google
  let userInfo;
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });
    if (!res.ok)
      return resp(401, {
        error: 'Invalid Google access token. Please sign in again.',
      });
    userInfo = await res.json();
  } catch (err) {
    return resp(500, { error: 'Could not reach Google auth servers.' });
  }

  if (!userInfo.verified_email) {
    return resp(401, { error: 'Google account email is not verified.' });
  }

  const userId = userInfo.id;
  const email = userInfo.email;
  const name = userInfo.name || email;
  const picture = userInfo.picture || '';

  // Allowlist check (if configured)
  if (ALLOWLIST.length && !ALLOWLIST.includes(email.toLowerCase())) {
    return resp(403, {
      error: 'Your email is not on the TagScanner AI Preview access list.',
    });
  }

  // Upsert user record
  try {
    await ddb.send(
      new PutCommand({
        TableName: USERS_TABLE,
        Item: {
          userId,
          email,
          name,
          picture,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        },
      }),
    );
  } catch (err) {
    console.error('upsert user error:', err.message);
  }

  // Create session (30-day TTL)
  const sessionToken = nodeCrypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  try {
    await ddb.send(
      new PutCommand({
        TableName: SESSIONS_TABLE,
        Item: { sessionToken, userId, email, name, picture, expiresAt },
      }),
    );
  } catch (err) {
    console.error('create session error:', err.message);
    return resp(500, { error: 'Could not create session. Please try again.' });
  }

  const isAdmin = ADMIN_EMAIL && email.toLowerCase() === ADMIN_EMAIL;
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), event: 'login', email }),
  );
  trackAA({
    vid: userId,
    pageName: 'TagScanner:Server',
    pe: 'lnk_o',
    pev2: 'Auth:Sign In',
    events: 'event9',
    v3: isAdmin ? 'admin' : 'user',
    v7: hashEmailSync(email),
  });
  return resp(200, {
    sessionToken,
    userId,
    email,
    name,
    picture,
    isAdmin: !!isAdmin,
  });
}

// ── History handler ───────────────────────────────────────────────────────────

async function handleHistory(body) {
  const { sessionToken, limit, lastKey, propertyKey, ownerId } = body;
  const session = await getSession(sessionToken);
  if (!session)
    return resp(401, {
      error: 'Invalid or expired session. Please sign in again.',
    });

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
        TableName: QUERIES_TABLE,
        IndexName: QUERIES_PROPERTY_INDEX,
        KeyConditionExpression: 'propertyKey = :pk',
        ExpressionAttributeValues: { ':pk': propertyKey },
        ScanIndexForward: false,
        Limit: Math.min(limit || 25, 50),
      };
    } else {
      // User-scoped (current user or admin-specified via ownerId)
      params = {
        TableName: QUERIES_TABLE,
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': targetUserId },
        ScanIndexForward: false,
        Limit: Math.min(limit || 25, 100),
      };
    }
    if (lastKey) params.ExclusiveStartKey = lastKey;

    const result = await ddb.send(new QueryCommand(params));
    return resp(200, {
      items: result.Items || [],
      lastKey: result.LastEvaluatedKey || null,
      propertyKey: propertyKey || null,
      user: {
        email: session.email,
        name: session.name,
        picture: session.picture,
      },
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
  if (!queryId || !rating)
    return resp(400, { error: 'Missing queryId or rating.' });

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: QUERIES_TABLE,
        Key: { userId: session.userId, queryId },
        UpdateExpression:
          'SET feedback = :f, feedbackText = :t, feedbackAt = :at',
        ExpressionAttributeValues: {
          ':f': rating,
          ':t': text || '',
          ':at': new Date().toISOString(),
        },
      }),
    );
    trackAA({
      vid: session.userId,
      pageName: 'TagScanner:Ask AI',
      pe: 'lnk_o',
      pev2: 'Ask AI:Feedback:' + rating,
      events: 'event13',
      v5: 'Feedback',
      v6: rating,
      v7: hashEmailSync(session.email),
    });
    return resp(200, { ok: true });
  } catch (err) {
    console.error('feedback error:', err.message);
    return resp(500, { error: 'Could not save feedback.' });
  }
}

// ── General feedback (no auth required) ──────────────────────────────────────

async function isFeedbackRateLimited(sourceIp) {
  if (!sourceIp) return false;
  const pk = 'fb#' + sourceIp + '#' + new Date().toISOString().slice(0, 10);
  const ttl = Math.floor(Date.now() / 1000) + 25 * 60 * 60;
  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: RATE_TABLE,
        Key: { pk },
        UpdateExpression:
          'SET #c = if_not_exists(#c, :zero) + :one, #ttl = if_not_exists(#ttl, :ttl)',
        ExpressionAttributeNames: { '#c': 'count', '#ttl': 'ttl' },
        ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':ttl': ttl },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return (result.Attributes.count || 0) > 5;
  } catch (err) {
    console.error('isFeedbackRateLimited error:', err.message);
    return false;
  }
}

async function handleGeneralFeedback(body, sourceIp) {
  const { name, email, rating, category, message } = body;
  if (!message || !String(message).trim())
    return resp(400, { error: 'Message is required.' });

  if (await isFeedbackRateLimited(sourceIp)) {
    return resp(429, {
      error: 'Too many submissions. Please try again tomorrow.',
    });
  }

  const feedbackId =
    new Date().toISOString() + '-' + nodeCrypto.randomBytes(4).toString('hex');
  try {
    await ddb.send(
      new PutCommand({
        TableName: FEEDBACK_TABLE,
        Item: {
          feedbackId,
          name: String(name || '')
            .trim()
            .slice(0, 200),
          email: String(email || '')
            .trim()
            .toLowerCase()
            .slice(0, 200),
          rating: String(rating || '').slice(0, 50),
          category: String(category || 'General Feedback').slice(0, 100),
          message: String(message).trim().slice(0, 5000),
          submittedAt: new Date().toISOString(),
          sourceIp: sourceIp || null,
        },
      }),
    );
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
  if (session.email.toLowerCase() !== ADMIN_EMAIL)
    return resp(403, { error: 'Admin access required.' });

  try {
    const result = await ddb.send(
      new ScanCommand({ TableName: FEEDBACK_TABLE }),
    );
    const items = (result.Items || []).sort((a, b) =>
      (b.submittedAt || '').localeCompare(a.submittedAt || ''),
    );
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
    const result = await ddb.send(
      new ScanCommand({
        TableName: QUERIES_TABLE,
        FilterExpression: '#t = :chat',
        ExpressionAttributeNames: { '#t': 'type' },
        ExpressionAttributeValues: { ':chat': 'chat' },
        ProjectionExpression:
          'userId, queryId, email, userName, requestSummary, resultJson, feedback, feedbackText, createdAt, tokens, propertyKey',
      }),
    );
    const items = (result.Items || []).sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || ''),
    );
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
  if (session.email.toLowerCase() !== ADMIN_EMAIL)
    return resp(403, { error: 'Admin access required.' });

  try {
    // Fetch users and queries in parallel
    const [usersResult, queriesResult] = await Promise.all([
      ddb.send(new ScanCommand({ TableName: USERS_TABLE })),
      ddb.send(
        new ScanCommand({
          TableName: QUERIES_TABLE,
          ProjectionExpression:
            'userId, #t, requestSummary, createdAt, tokens, siteHostname, clientId, userName',
          ExpressionAttributeNames: { '#t': 'type' },
        }),
      ),
    ]);

    // Aggregate per-user stats from queries
    const statsMap = {};
    for (const q of queriesResult.Items || []) {
      if (!statsMap[q.userId]) {
        statsMap[q.userId] = {
          totalQueries: 0,
          totalScans: 0,
          totalExplains: 0,
          totalVisits: 0,
          properties: new Set(),
          sites: new Set(),
          lastActive: null,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          clientId: q.clientId || '',
          userName: q.userName || '',
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
      if (!s.lastActive || q.createdAt > s.lastActive)
        s.lastActive = q.createdAt;
      s.totalInputTokens += (q.tokens && q.tokens.input) || 0;
      s.totalOutputTokens += (q.tokens && q.tokens.output) || 0;
    }

    // Stitch anonymous rows into authenticated users where clientId matches.
    // An anon#<clientId> row represents the same device before sign-in — merge
    // its properties/sites/visits into the real user so the dashboard shows one row.
    const clientIdToUserId = {};
    for (const [uid, s] of Object.entries(statsMap)) {
      if (!uid.startsWith('anon#') && s.clientId) {
        clientIdToUserId[s.clientId] = uid;
      }
    }
    const stitchedAnonIds = new Set();
    for (const [uid, s] of Object.entries(statsMap)) {
      if (!uid.startsWith('anon#')) continue;
      const anonClientId = uid.slice(5);
      const realUserId = clientIdToUserId[anonClientId];
      if (realUserId && statsMap[realUserId]) {
        const r = statsMap[realUserId];
        s.properties.forEach((p) => r.properties.add(p));
        s.sites.forEach((site) => r.sites.add(site));
        r.totalVisits += s.totalVisits;
        r.totalQueries += s.totalQueries;
        if (s.lastActive && (!r.lastActive || s.lastActive > r.lastActive))
          r.lastActive = s.lastActive;
        stitchedAnonIds.add(uid);
      }
    }

    // Merge stats into user records (authenticated users from users table)
    const users = (usersResult.Items || []).map((u) => {
      const s = statsMap[u.userId];
      return Object.assign({}, u, {
        emailHash: hashEmailSync(u.email || ''),
        stats: s
          ? {
              totalQueries: s.totalQueries,
              totalScans: s.totalScans,
              totalExplains: s.totalExplains,
              totalVisits: s.totalVisits || 0,
              properties: Array.from(s.properties),
              sites: Array.from(s.sites),
              lastActive: s.lastActive,
              totalInputTokens: s.totalInputTokens,
              totalOutputTokens: s.totalOutputTokens,
              clientId: s.clientId || '',
            }
          : null,
      });
    });

    // Add anonymous-only rows (anon#<clientId> keys, not in users table)
    const knownUserIds = new Set(
      (usersResult.Items || []).map((u) => u.userId),
    );
    for (const [uid, s] of Object.entries(statsMap)) {
      if (
        !uid.startsWith('anon#') ||
        knownUserIds.has(uid) ||
        stitchedAnonIds.has(uid)
      )
        continue;
      users.push({
        userId: uid,
        email: '',
        name: 'Anonymous',
        picture: '',
        createdAt: s.lastActive || '',
        lastLoginAt: null,
        emailHash: '',
        stats: {
          totalQueries: s.totalQueries,
          totalScans: s.totalScans,
          totalExplains: s.totalExplains,
          totalVisits: s.totalVisits || 0,
          properties: Array.from(s.properties),
          sites: Array.from(s.sites),
          lastActive: s.lastActive,
          totalInputTokens: s.totalInputTokens,
          totalOutputTokens: s.totalOutputTokens,
          clientId: s.clientId || uid.slice(5),
        },
      });
    }

    // Sort by last active (most recent first), fall back to lastLoginAt
    users.sort(function (a, b) {
      const aTime =
        (a.stats && a.stats.lastActive) || a.lastLoginAt || a.createdAt || '';
      const bTime =
        (b.stats && b.stats.lastActive) || b.lastLoginAt || b.createdAt || '';
      return bTime.localeCompare(aTime);
    });

    return resp(200, { users });
  } catch (err) {
    console.error('handleUsers error:', err.message);
    return resp(500, { error: err.message || 'Could not fetch users.' });
  }
}

// ── Per-user chat limit override (admin only) ─────────────────────────────────

async function handleSetUserChatLimit(body) {
  const { sessionToken, targetUserId, limit } = body;
  const session = await getSession(sessionToken);
  if (!session) return resp(401, { error: 'Invalid or expired session.' });
  if (!ADMIN_EMAIL) return resp(500, { error: 'Admin access not configured.' });
  if (session.email.toLowerCase() !== ADMIN_EMAIL)
    return resp(403, { error: 'Admin access required.' });
  if (!targetUserId || typeof targetUserId !== 'string')
    return resp(400, { error: 'targetUserId required.' });

  try {
    if (limit === null) {
      // Remove override — restore default limit
      await ddb.send(
        new UpdateCommand({
          TableName: USERS_TABLE,
          Key: { userId: targetUserId },
          UpdateExpression: 'REMOVE chat_limit_override',
        }),
      );
    } else {
      // Set override (-1 = unlimited, or a positive integer)
      await ddb.send(
        new UpdateCommand({
          TableName: USERS_TABLE,
          Key: { userId: targetUserId },
          UpdateExpression: 'SET chat_limit_override = :v',
          ExpressionAttributeValues: { ':v': limit },
        }),
      );
    }
    return resp(200, { ok: true });
  } catch (err) {
    console.error('handleSetUserChatLimit error:', err.message);
    return resp(500, { error: err.message || 'Could not update limit.' });
  }
}

// ── AI config read (admin only) ───────────────────────────────────────────────

async function handleConfig(body) {
  const { sessionToken } = body;
  const session = await getSession(sessionToken);
  if (!session) return resp(401, { error: 'Invalid or expired session.' });
  if (!ADMIN_EMAIL) return resp(500, { error: 'Admin access not configured.' });
  if (session.email.toLowerCase() !== ADMIN_EMAIL)
    return resp(403, { error: 'Admin access required.' });

  const [aiConfig, todayCost] = await Promise.all([
    getAIConfig(),
    getTodayCost(),
  ]);
  return resp(200, {
    ai_enabled: aiConfig.ai_enabled,
    disabled_reason: aiConfig.disabled_reason,
    cost_limit_usd: aiConfig.cost_limit_usd,
    chat_question_limit: aiConfig.chat_question_limit,
    today_cost_usd: todayCost,
  });
}

// ── AI config write (admin only) ──────────────────────────────────────────────

async function handleSetConfig(body) {
  const {
    sessionToken,
    ai_enabled,
    disabled_reason,
    cost_limit_usd,
    chat_question_limit,
  } = body;
  const session = await getSession(sessionToken);
  if (!session) return resp(401, { error: 'Invalid or expired session.' });
  if (!ADMIN_EMAIL) return resp(500, { error: 'Admin access not configured.' });
  if (session.email.toLowerCase() !== ADMIN_EMAIL)
    return resp(403, { error: 'Admin access required.' });

  const setParts = [];
  const attrNames = {};
  const attrValues = {};

  if (typeof ai_enabled === 'boolean') {
    setParts.push('#en = :en');
    attrNames['#en'] = 'ai_enabled';
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
  if (
    typeof chat_question_limit === 'number' &&
    Number.isInteger(chat_question_limit) &&
    chat_question_limit >= 1
  ) {
    setParts.push('chat_question_limit = :ql');
    attrValues[':ql'] = chat_question_limit;
  }
  if (!setParts.length) return resp(400, { error: 'Nothing to update.' });

  const params = {
    TableName: CONFIG_TABLE,
    Key: { pk: 'global' },
    UpdateExpression: 'SET ' + setParts.join(', '),
    ExpressionAttributeValues: attrValues,
  };
  if (Object.keys(attrNames).length)
    params.ExpressionAttributeNames = attrNames;

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
  const projAttrs = skAttr ? pkAttr + ', ' + skAttr : pkAttr;
  do {
    const scanResult = await ddb.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: projAttrs,
        ExclusiveStartKey: lastKey,
      }),
    );
    const items = scanResult.Items || [];
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25);
      await ddb.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: chunk.map((item) => ({
              DeleteRequest: { Key: item },
            })),
          },
        }),
      );
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
  if (session.email.toLowerCase() !== ADMIN_EMAIL)
    return resp(403, { error: 'Admin access required.' });

  // Default: purge all four tables.  Caller can pass tables:[] to pick a subset.
  const ALL = [
    'scan_cache',
    'chat_cache',
    'explain_cache',
    'rate_limits',
    'queries',
  ];
  const scope = Array.isArray(tables) && tables.length ? tables : ALL;

  const results = {};

  if (scope.includes('scan_cache')) {
    try {
      results.scan_cache = await batchDeleteAll(SCAN_CACHE_TABLE, 'cache_key');
    } catch (err) {
      results.scan_cache = 'ERROR: ' + err.message;
    }
  }

  if (scope.includes('chat_cache')) {
    try {
      results.chat_cache = await batchDeleteAll(CHAT_CACHE_TABLE, 'cache_key');
    } catch (err) {
      results.chat_cache = 'ERROR: ' + err.message;
    }
  }

  if (scope.includes('explain_cache')) {
    try {
      results.explain_cache = await batchDeleteAll(
        EXPLAIN_CACHE_TABLE,
        'code_hash',
      );
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
      results.queries = await batchDeleteAll(
        QUERIES_TABLE,
        'userId',
        'queryId',
      );
    } catch (err) {
      results.queries = 'ERROR: ' + err.message;
    }
  }

  const ts = new Date().toISOString();
  console.log(
    JSON.stringify({
      ts,
      event: 'purge_test_data',
      by: session.email,
      results,
    }),
  );
  return resp(200, { ok: true, purgedAt: ts, deletedCounts: results });
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const method =
    (event.requestContext &&
      event.requestContext.http &&
      event.requestContext.http.method) ||
    event.httpMethod ||
    'POST';
  if (method === 'OPTIONS') return resp(200, {});

  try {
    const body = JSON.parse(event.body || '{}');
    const sourceIp =
      (event.requestContext &&
        event.requestContext.http &&
        event.requestContext.http.sourceIp) ||
      null;
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
    if (type === 'generalFeedback')
      return handleGeneralFeedback(body, sourceIp);

    // ── Get general feedback (admin only) ────────────────────────────────────
    if (type === 'getFeedback') return await handleGetFeedback(body);

    // ── Admin: all chat questions ────────────────────────────────────────────
    if (type === 'adminQueries') return await handleAdminQueries(body);

    // ── Users (admin) ───────────────────────────────────────────────────────
    if (type === 'users') return await handleUsers(body);
    if (type === 'setUserChatLimit') return await handleSetUserChatLimit(body);

    // ── AI config (admin) ────────────────────────────────────────────────────
    if (type === 'config') return handleConfig(body);
    if (type === 'setConfig') return handleSetConfig(body);
    if (type === 'purgeTestData') return handlePurgeTestData(body);

    // ── Session ping (auth-optional — attributes to real user if signed in) ───
    if (type === 'session_ping') {
      const { clientId, siteHostname, propertyName, environment } = body;
      if (!clientId || typeof clientId !== 'string' || clientId.length > 64) {
        return resp(200, { ok: true });
      }
      // If a valid sessionToken is included, attribute this visit to the real user
      let pingUserId = 'anon#' + clientId;
      let pingEmail = '';
      let pingUserName = 'Anonymous';
      if (sessionToken) {
        const pingSession = await getSession(sessionToken);
        if (pingSession) {
          pingUserId = pingSession.userId;
          pingEmail = pingSession.email || '';
          pingUserName = pingSession.name || '';
        }
      }
      const pingId = new Date().toISOString() + '#' + randomId(8);
      try {
        await ddb.send(
          new PutCommand({
            TableName: QUERIES_TABLE,
            Item: {
              userId: pingUserId,
              queryId: pingId,
              type: 'visit',
              email: pingEmail,
              userName: pingUserName,
              clientId: clientId,
              propertyKey: (propertyName || '') + '#' + (environment || ''),
              siteUrl: siteHostname ? 'https://' + siteHostname : '',
              siteHostname: siteHostname || '',
              requestSummary: 'Visit: ' + (propertyName || 'Unknown'),
              tokens: {},
              resultJson: null,
              hasResult: false,
              feedback: null,
              feedbackText: null,
              createdAt: new Date().toISOString(),
            },
          }),
        );
      } catch (_) {}
      return resp(200, { ok: true });
    }

    // ── Chat config (non-admin: returns current question limit for the UI) ────
    if (type === 'chatConfig') {
      const cfgSession = await getSession(sessionToken);
      if (!cfgSession)
        return resp(401, {
          error: 'Sign in with Google to use TagScanner AI.',
        });
      const aiCfg = await getAIConfig();
      return resp(200, { chat_question_limit: aiCfg.chat_question_limit });
    }

    // ── Scan / Explain — require a valid session ─────────────────────────────
    const session = await getSession(sessionToken);
    if (!session) {
      return resp(401, { error: 'Sign in with Google to use TagScanner AI.' });
    }
    const identity = { userId: session.userId, email: session.email };

    // Cache checks — happen BEFORE rate limiting so cache hits are always free
    if (type === 'explain' && body.code) {
      const codeHash = nodeCrypto
        .createHash('sha256')
        .update((body.code || '').trim())
        .digest('hex')
        .slice(0, 16);
      const cachedItem = await getExplainCache(codeHash);
      if (cachedItem) {
        console.log(
          JSON.stringify({
            ts: new Date().toISOString(),
            userId: identity.userId,
            type: 'explain_cache_hit',
            codeHash,
          }),
        );
        return resp(200, {
          explanation: cachedItem.explanation,
          tokens: { input: 0, output: 0 },
          queryId: null,
          cached: true,
          cached_at: cachedItem.cached_at,
          cached_by: {
            email: cachedItem.cached_by_email,
            name: cachedItem.cached_by_name,
          },
        });
      }
    }

    if (type === 'scan' && body.fingerprint && body.payload) {
      const cp = body.payload;
      const cpName = (cp.property && cp.property.name) || 'Unknown';
      const cpEnv = (cp.property && cp.property.environment) || 'Production';
      const cacheKey = cpName + '#' + cpEnv + '#' + body.fingerprint;
      const cachedItem = await getCachedScan(cacheKey);
      if (cachedItem) {
        console.log(
          JSON.stringify({
            ts: new Date().toISOString(),
            userId: identity.userId,
            type: 'scan_cache_hit',
            cacheKey,
          }),
        );
        return resp(200, {
          report: cachedItem.report,
          tokens: { input: 0, output: 0 },
          queryId: null,
          cached: true,
          cached_at: cachedItem.cached_at,
          cached_by: {
            email: cachedItem.cached_by_email,
            name: cachedItem.cached_by_name,
          },
        });
      }
    }

    // Rate limit by userId
    if (await isRateLimited(identity.userId)) {
      return resp(429, {
        error:
          'Daily AI request limit reached (' +
          DAILY_CAP +
          '/day). Try again tomorrow.',
      });
    }

    // Kill-switch: check if AI is enabled and daily cost is within limit
    const [aiConfig, todayCost] = await Promise.all([
      getAIConfig(),
      getTodayCost(),
    ]);
    if (!aiConfig.ai_enabled) {
      return resp(503, {
        error: 'AI features are temporarily disabled. Please check back later.',
      });
    }
    if (todayCost >= aiConfig.cost_limit_usd) {
      await autoDisableAI(
        'Daily cost limit of $' +
          aiConfig.cost_limit_usd.toFixed(2) +
          ' reached. AI disabled automatically.',
      );
      return resp(503, {
        error: 'AI features are temporarily disabled. Please check back later.',
      });
    }

    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        userId: identity.userId,
        type,
      }),
    );

    // ── Scan ─────────────────────────────────────────────────────────────────
    if (type === 'scan') {
      const { payload, userContext, fingerprint } = body;
      const clientId = body.clientId || '';
      if (!payload) return resp(400, { error: 'Missing payload for scan.' });

      const userMsg = JSON.stringify({
        user_context: userContext || {},
        property_health: payload,
      });
      const maxTokens = computeScanTokens(payload);
      const result = await invokeAnthropicDirect(
        SCAN_SYSTEM_PROMPT,
        userMsg,
        maxTokens,
      );
      let report;
      try {
        report = parseJSON(result.text);
      } catch (parseErr) {
        console.error(
          'Scan parse error:',
          parseErr.message,
          '| tokens used:',
          result.outputTokens,
          '| raw snippet:',
          result.text.slice(0, 300),
        );
        return resp(500, {
          error:
            'the AI response was incomplete. This can happen with very large properties — please try again or reach out to tagscannerfeedback@gmail.com',
        });
      }
      const propertyName =
        (payload.property && payload.property.name) || 'Unknown property';
      const environment =
        (payload.property && payload.property.environment) || 'Production';
      const siteUrl = (payload.property && payload.property.url) || '';
      const propertyKey = propertyName + '#' + environment;

      const [queryId, newDayCost] = await Promise.all([
        logQuery(
          identity.userId,
          identity.email,
          session.name,
          'scan',
          'Property scan: ' + propertyName,
          { input: result.inputTokens, output: result.outputTokens },
          report,
          propertyKey,
          siteUrl,
          clientId,
        ),
        trackCost(
          result.inputTokens,
          result.outputTokens,
          COST_SCAN_INPUT_PER_TOKEN,
          COST_SCAN_OUTPUT_PER_TOKEN,
        ),
      ]);

      // Store in scan cache keyed by composition fingerprint
      if (fingerprint) {
        const cacheKey = propertyName + '#' + environment + '#' + fingerprint;
        putCachedScan(
          cacheKey,
          report,
          { input: result.inputTokens, output: result.outputTokens },
          identity.email,
          session.name,
          propertyName,
          environment,
        ).catch(() => {});
      }

      if (newDayCost >= aiConfig.cost_limit_usd * ALERT_PCT) {
        sendCostThresholdAlert(newDayCost, aiConfig.cost_limit_usd).catch(
          () => {},
        );
      }
      if (newDayCost > aiConfig.cost_limit_usd) {
        autoDisableAI(
          'Daily cost limit of $' +
            aiConfig.cost_limit_usd.toFixed(2) +
            ' reached. AI disabled automatically.',
        ).catch(() => {});
      }

      trackAA({
        vid: identity.userId,
        pageName: 'TagScanner:Summary',
        pe: 'lnk_o',
        pev2: 'Summary:AI Scan',
        events: 'event5',
        v1: propertyName,
        v2: environment,
        v3:
          ADMIN_EMAIL && session.email.toLowerCase() === ADMIN_EMAIL
            ? 'admin'
            : 'user',
        v5: 'Summary',
        v7: hashEmailSync(identity.email),
      });
      return resp(200, {
        report,
        tokens: { input: result.inputTokens, output: result.outputTokens },
        queryId: queryId || null,
        cached: false,
      });
    }

    // ── Explain ───────────────────────────────────────────────────────────────
    if (type === 'explain') {
      const { code, metadata, propertyKey } = body;
      const clientId = body.clientId || '';
      if (!code) return resp(400, { error: 'Missing code for explain.' });

      const userMsg = JSON.stringify({ code, metadata: metadata || {} });
      const result = await invokeClaude(
        EXPLAIN_SYSTEM_PROMPT,
        userMsg,
        MAX_TOKENS_EXPLAIN,
      );
      const explanation = parseJSON(result.text);

      const componentName = (metadata && metadata.name) || 'unknown';
      const codeHash = nodeCrypto
        .createHash('sha256')
        .update((code || '').trim())
        .digest('hex')
        .slice(0, 16);

      const [queryId, newDayCost] = await Promise.all([
        logQuery(
          identity.userId,
          identity.email,
          session.name,
          'explain',
          'Explain ' +
            ((metadata && metadata.type) || '') +
            ': ' +
            componentName,
          { input: result.inputTokens, output: result.outputTokens },
          explanation,
          propertyKey || '',
          undefined,
          clientId,
        ),
        trackCost(result.inputTokens, result.outputTokens),
      ]);

      putExplainCache(
        codeHash,
        explanation,
        { input: result.inputTokens, output: result.outputTokens },
        identity.email,
        session.name,
        componentName,
        metadata && metadata.type,
        propertyKey,
      ).catch(() => {});

      if (newDayCost >= aiConfig.cost_limit_usd * ALERT_PCT) {
        sendCostThresholdAlert(newDayCost, aiConfig.cost_limit_usd).catch(
          () => {},
        );
      }
      if (newDayCost > aiConfig.cost_limit_usd) {
        autoDisableAI(
          'Daily cost limit of $' +
            aiConfig.cost_limit_usd.toFixed(2) +
            ' reached. AI disabled automatically.',
        ).catch(() => {});
      }

      trackAA({
        vid: identity.userId,
        pageName: 'TagScanner:Rules',
        pe: 'lnk_o',
        pev2: 'Code:Explain',
        events: 'event5',
        v1: propertyKey || '',
        v3:
          ADMIN_EMAIL && session.email.toLowerCase() === ADMIN_EMAIL
            ? 'admin'
            : 'user',
        v5: 'Explain',
        v7: hashEmailSync(identity.email),
      });
      return resp(200, {
        explanation,
        tokens: { input: result.inputTokens, output: result.outputTokens },
        queryId: queryId || null,
      });
    }

    // ── Chat ──────────────────────────────────────────────────────────────────
    if (type === 'chat')
      return handleChat(body, session, identity, aiConfig, todayCost);

    return resp(400, {
      error: 'Invalid type. Use: auth, scan, explain, chat, history, feedback.',
    });
  } catch (err) {
    console.error('Lambda error:', err);
    return resp(500, { error: err.message || 'Internal server error' });
  }
};
