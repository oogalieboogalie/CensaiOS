// The chat's "add a key" card: which errors call for it and which providers
// it offers. Plain names here; the server sends the provider id.
import { BYOK_PROVIDERS } from '../byokProviders.js';

export const KEY_NEEDED_CODES = new Set(['MODEL_KEY_MISSING', 'MODEL_KEY_REJECTED', 'MODEL_ACCESS_PERSONAL_KEY_REQUIRED']);

// When no AI is set up at all, these three are offered, best first.
export const STARTER_KEY_PROVIDERS = ['anthropic', 'openai', 'openrouter'];

const SHORT_NAMES = { anthropic: 'Claude', openai: 'OpenAI', openrouter: 'OpenRouter' };

const GET_KEY_URLS = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  openrouter: 'https://openrouter.ai/keys',
  google: 'https://aistudio.google.com/apikey',
  xai: 'https://console.x.ai',
};

export function needsKey(error) {
  return Boolean(error && KEY_NEEDED_CODES.has(error.code));
}

export function keyProviderInfo(id) {
  const provider = BYOK_PROVIDERS.find(item => item.id === id) || { id, name: id, placeholder: 'key' };
  return {
    id: provider.id,
    name: provider.name,
    short: SHORT_NAMES[provider.id] || provider.name,
    placeholder: provider.placeholder,
    getKeyUrl: GET_KEY_URLS[provider.id] || null,
  };
}

/** The named provider alone when the server knows it; otherwise the starters. */
export function keyChoicesFor(keyProvider) {
  const known = BYOK_PROVIDERS.some(item => item.id === keyProvider);
  return (known ? [keyProvider] : STARTER_KEY_PROVIDERS).map(keyProviderInfo);
}
