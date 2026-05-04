// AI explainer client with open-source LLM support.
// Priority:
// 1) Local Ollama (Llama/OpenSeek/etc) via http://127.0.0.1:11434
// 2) Optional custom backend endpoint (legacy behavior)
// Configurable via localStorage:
// - aiExplain_provider: "auto" | "ollama" | "backend"
// - aiExplain_ollamaEndpoint: default "http://127.0.0.1:11434"
// - aiExplain_ollamaModel: default "llama3.1:8b"
// - aiExplain_backendEndpoint: optional custom endpoint

const DEFAULT_BACKEND_ENDPOINT = 'https://your-backend.example.com/ai/explain-custom-code';
const DEFAULT_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = 'llama3.1:8b';

function getExplainConfig() {
  var ls = typeof localStorage !== 'undefined' ? localStorage : null;
  var provider = (ls && ls.getItem('aiExplain_provider')) || 'auto';
  var ollamaEndpoint = (ls && ls.getItem('aiExplain_ollamaEndpoint')) || DEFAULT_OLLAMA_ENDPOINT;
  var ollamaModel = (ls && ls.getItem('aiExplain_ollamaModel')) || DEFAULT_OLLAMA_MODEL;
  var backendEndpoint = (ls && ls.getItem('aiExplain_backendEndpoint')) || DEFAULT_BACKEND_ENDPOINT;
  return {
    provider: String(provider || 'auto').toLowerCase(),
    ollamaEndpoint: String(ollamaEndpoint || '').replace(/\/+$/, ''),
    ollamaModel: String(ollamaModel || '').trim(),
    backendEndpoint: String(backendEndpoint || '').trim()
  };
}

function buildExplainPrompt(code, metadata) {
  var md = metadata || {};
  return [
    'You are a senior Adobe Tags/Launch implementation analyst.',
    'Explain this custom code for non-developers in plain language.',
    'Use exactly these sections:',
    '1) Purpose',
    '2) How it works (step-by-step)',
    '3) Inputs used',
    '4) Output / side effects',
    '5) Risks / caveats',
    '6) Suggested validation checklist',
    '',
    'Keep the explanation concise but meaningful. Mention unknowns when code is minified.',
    '',
    'Metadata:',
    JSON.stringify(md, null, 2),
    '',
    'Code:',
    code
  ].join('\n');
}

async function explainViaOllama(code, metadata, cfg) {
  var prompt = buildExplainPrompt(code, metadata);
  var response = await fetch(cfg.ollamaEndpoint + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.ollamaModel,
      prompt: prompt,
      stream: false
    })
  });
  if (!response.ok) throw new Error('Ollama HTTP ' + response.status);
  var data = await response.json();
  var text = data && typeof data.response === 'string' ? data.response.trim() : '';
  if (!text) throw new Error('Ollama returned empty explanation');
  return { text: text, model: cfg.ollamaModel };
}

async function explainViaBackend(code, metadata, cfg) {
  if (!cfg.backendEndpoint || cfg.backendEndpoint.indexOf('your-backend.example.com') > -1) {
    throw new Error('Backend endpoint not configured');
  }
  var response = await fetch(cfg.backendEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code, metadata: metadata || {} })
  });
  if (!response.ok) throw new Error('Backend HTTP ' + response.status);
  var data = await response.json();
  if (data && typeof data.explanation === 'string' && data.explanation.trim()) {
    return { text: data.explanation.trim(), model: 'Custom backend' };
  }
  if (data && typeof data.message === 'string' && data.message.trim()) {
    return { text: data.message.trim(), model: 'Custom backend' };
  }
  throw new Error('Backend returned no usable explanation');
}

/**
 * Best-effort AI explanation.
 * Returns null when no provider succeeds.
 */
async function getAIExplanationOrNull(code, metadata) {
  if (!code || typeof code !== 'string' || !code.trim()) return null;
  var cfg = getExplainConfig();
  var tried = [];

  async function tryOllama() {
    tried.push('ollama');
    return explainViaOllama(code, metadata, cfg);
  }
  async function tryBackend() {
    tried.push('backend');
    return explainViaBackend(code, metadata, cfg);
  }

  try {
    if (cfg.provider === 'ollama') return await tryOllama();
    if (cfg.provider === 'backend') return await tryBackend();
    // auto mode
    try {
      return await tryOllama();
    } catch (e1) {
      console.warn('Ollama explain failed, trying backend:', e1);
      return await tryBackend();
    }
  } catch (e) {
    console.warn('AI explanation unavailable. Tried:', tried.join(', '), e);
    return null;
  }
}

/**
 * Backward-compatible helper used by existing pages.
 * Returns user-friendly text even when AI is unavailable.
 */
async function explainCustomCodeWithAI(code, metadata) {
  if (!code || typeof code !== 'string' || !code.trim()) {
    return 'No custom code available to explain.';
  }
  var aiResult = await getAIExplanationOrNull(code, metadata);
  if (aiResult) return aiResult.text;
  return 'AI explanation is unavailable. To use local open-source models, run Ollama and set `aiExplain_ollamaModel` (e.g., llama3.1:8b or deepseek-r1) in localStorage.';
}

