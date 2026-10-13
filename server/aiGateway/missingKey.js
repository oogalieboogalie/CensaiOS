// "No key" is not a passing outage, so a chat must never answer it with
// "try again shortly". These errors carry code MODEL_KEY_MISSING and the
// provider whose key is missing (null when no AI is set up at all), so the
// chat window can ask for that key right where the person is typing.

export const MODEL_KEY_MISSING = 'MODEL_KEY_MISSING';
export const MODEL_KEY_REJECTED = 'MODEL_KEY_REJECTED';

export const KEY_PROVIDER_NAMES = Object.freeze({
  anthropic: 'Claude (Anthropic)',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  google: 'Google Gemini',
  moonshot: 'Moonshot (Kimi)',
  opencode: 'OpenCode Zen',
  xai: 'xAI (Grok)',
  cohere: 'Cohere',
  zai: 'Z.ai',
});

const PROVIDER_ALIASES = { claude: 'anthropic', kimi: 'moonshot', 'google-native': 'google', grok: 'xai' };

// The setup messages server logs and older callers already rely on.
const SETUP_MESSAGES = {
  cohere: 'Cohere API key is missing. Set COHERE_API_KEY, COHERE_PAID_API_KEY, or COHERE_NON_COMMERCIAL_KEY, or configure a personal Cohere key.',
  openrouter: 'OpenRouter API key is missing. Please set OPENROUTER_API_KEY in your .env file or configure a personal API key.',
  openai: 'OpenAI API key is missing. Set OPENAI_API_KEY in your .env file or add a personal OpenAI key in Settings → Vault.',
  moonshot: 'Moonshot API key is missing. Please set MOONSHOT_API_KEY in your .env file or configure a personal API key.',
  opencode: 'OpenCode Zen API key is missing. Please set OPENCODE_API_KEY in your .env file or configure a personal key in Settings → Vault.',
  zai: 'Z.ai API key is missing. Set ZAI_API_KEY in your .env file or add a personal Z.ai key in Settings → Vault.',
  google: 'Google Gemini API key is missing. Set GEMINI_API_KEY in your .env file or add a personal Gemini key in Settings → Vault.',
  xai: 'xAI API key is missing. Set XAI_API_KEY in your .env file or add a personal xAI key in Settings → Vault.',
  anthropic: 'Anthropic API key is missing. Add your Anthropic key in Settings → Vault or set ANTHROPIC_API_KEY in your .env file.',
};

export function keyProviderFor(provider) {
  const id = String(provider || '').trim().toLowerCase();
  const normalized = PROVIDER_ALIASES[id] || id;
  return KEY_PROVIDER_NAMES[normalized] ? normalized : null;
}

/** What the person reads in the chat: which key is missing, in plain words. */
export function missingKeyMessage(provider) {
  const name = KEY_PROVIDER_NAMES[keyProviderFor(provider)];
  return name
    ? `This chat runs on ${name}, and no ${name} key is saved yet. Paste your key to send your message.`
    : 'No AI is set up for this chat yet. Paste a key from Claude, OpenAI or OpenRouter to send your message.';
}

/** What the person reads when the provider turned the saved key down. */
export function rejectedKeyMessage(provider) {
  const name = KEY_PROVIDER_NAMES[keyProviderFor(provider)] || 'The AI provider';
  return `${name} did not accept the saved key. Paste a working key to send your message.`;
}

/** A provider's 401 means the key is wrong: say so, and name whose key. */
export function tagRejectedKey(error, provider) {
  const keyProvider = keyProviderFor(provider);
  if (error?.name !== 'ChatCompletionHttpError' || error.status !== 401 || !keyProvider) return error;
  return Object.assign(error, { code: MODEL_KEY_REJECTED, statusCode: 400, keyProvider });
}

export function missingKeyError(provider, { message = null, cause = null } = {}) {
  const keyProvider = keyProviderFor(provider);
  const error = new Error(message || SETUP_MESSAGES[keyProvider] || missingKeyMessage(keyProvider));
  error.code = MODEL_KEY_MISSING;
  error.statusCode = 400;
  error.keyProvider = keyProvider;
  if (cause) error.cause = cause;
  return error;
}

/**
 * Throws MODEL_KEY_MISSING when a provider that needs a key has none.
 * "ollama" is the local placeholder key, never a real one for a cloud provider.
 */
export function assertProviderKey(provider, apiKey) {
  const keyProvider = keyProviderFor(provider);
  if ((!apiKey || apiKey === 'ollama') && SETUP_MESSAGES[keyProvider]) {
    throw missingKeyError(keyProvider);
  }
}

export function isLocalBaseUrl(baseUrl) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)(:|\/|$)/i.test(String(baseUrl || ''));
}

const UNREACHABLE_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ECONNRESET', 'EAI_AGAIN']);

/**
 * The default model runs on this computer (Ollama). When nothing answers
 * there, the person has no AI set up: ask for a key instead of a retry.
 */
export function localModelUnreachableError(error, baseUrl) {
  if (!isLocalBaseUrl(baseUrl) || error?.name === 'AbortError') return null;
  const code = error?.cause?.code || error?.code;
  const unreachable = UNREACHABLE_CODES.has(code) || (error?.name === 'TypeError' && /fetch failed/i.test(error?.message || ''));
  return unreachable ? missingKeyError(null, { cause: error }) : null;
}
