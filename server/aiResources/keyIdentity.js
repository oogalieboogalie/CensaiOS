// Which key paid for a call, without ever keeping the key.
//
// A key is known by a short one-way fingerprint (the first 16 hex characters
// of its SHA-256) plus its last four characters, which is all the AI
// resources window ever shows. The fingerprint lets the meter tell two keys
// for the same provider apart; it cannot be turned back into the key.

import crypto from 'crypto';

const PROVIDER_LABELS = Object.freeze({
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  google: 'Google (Gemini)',
  xai: 'xAI (Grok)',
  moonshot: 'Moonshot (Kimi)',
  zai: 'Z.ai (GLM)',
  cohere: 'Cohere',
  opencode: 'OpenCode Zen',
  tavily: 'Tavily',
  elevenlabs: 'ElevenLabs',
  figma: 'Figma',
  github: 'GitHub',
  langsmith: 'LangSmith',
  googlecloud: 'Google Cloud',
  ebay: 'eBay',
  ollama: 'Ollama (on your computer)',
});

export function providerLabel(provider) {
  const id = String(provider || '').toLowerCase();
  return PROVIDER_LABELS[id] || (id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Unknown');
}

/** { id, last4 } for a key, or null when there is no key. */
export function keyIdentity(provider, apiKey) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key) return null;
  const fingerprint = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
  return { id: `${String(provider || 'unknown').toLowerCase()}:${fingerprint}`, last4: key.slice(-4) };
}

/** What the window prints for a key: never more than the last four characters. */
export function maskedKey(last4) {
  return last4 ? `••••${last4}` : '••••';
}
