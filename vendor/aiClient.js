// Simple AI client for explaining custom code.
// Update AI_EXPLAIN_CUSTOM_CODE_ENDPOINT to point to your backend.

const AI_EXPLAIN_CUSTOM_CODE_ENDPOINT =
  'https://your-backend.example.com/ai/explain-custom-code';

/**
 * Request an AI explanation for a piece of custom code.
 * @param {string} code - The code snippet to explain.
 * @param {Object} [metadata] - Optional context like name/type/extension.
 * @returns {Promise<string>} - Explanation text or a user-friendly error.
 */
async function explainCustomCodeWithAI(code, metadata) {
  if (!code || typeof code !== 'string') {
    return 'No custom code available to explain.';
  }

  if (!AI_EXPLAIN_CUSTOM_CODE_ENDPOINT) {
    return 'AI explanation service is not configured.';
  }

  try {
    const response = await fetch(AI_EXPLAIN_CUSTOM_CODE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        metadata: metadata || {},
      }),
    });

    if (!response.ok) {
      return 'Unable to get AI explanation right now.';
    }

    const data = await response.json();

    if (data && typeof data.explanation === 'string' && data.explanation.trim()) {
      return data.explanation.trim();
    }

    // Fallback if backend shape is different
    if (data && typeof data.message === 'string') {
      return data.message.trim();
    }

    return 'AI did not return a usable explanation.';
  } catch (error) {
    console.error('Error while calling AI explanation endpoint:', error);
    return 'An error occurred while requesting AI explanation.';
  }
}

