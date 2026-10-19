// Dictation for chats whose own provider has no speech-to-text (Claude,
// Grok). When the person has an OpenAI or Google key saved, the mic records
// a clip, that key turns it into text, and the text goes to the chat's own
// model. No saved key, no mic. The words are never logged.

import { getUserApiKeyConfig } from '../../security/userApiKeys.js';
import { speechLog } from '../../aiGateway/speech.js';

export const DICTATION_CHAT_PROVIDERS = new Set(['anthropic', 'xai']);
// Tried in this order; the first saved key wins.
const DICTATION_KEY_PROVIDERS = ['openai', 'google'];

/** { provider, apiKey } for the person's dictation key, or null. */
export async function findDictationKey(userId, provider, { lookup = getUserApiKeyConfig } = {}) {
  if (!userId || !DICTATION_CHAT_PROVIDERS.has(provider)) return null;
  for (const keyProvider of DICTATION_KEY_PROVIDERS) {
    try {
      const saved = await lookup(userId, keyProvider);
      if (saved?.apiKey) return { provider: keyProvider, apiKey: saved.apiKey };
    } catch {
      /* best effort: try the next key */
    }
  }
  return null;
}

/** Capabilities with the Dictate mic turned on when a dictation key exists. */
export function withDictation(capabilities, dictationKey) {
  if (!dictationKey || capabilities?.voiceInput) return capabilities;
  return { ...capabilities, voiceInput: 'transcribe', dictationProvider: dictationKey.provider };
}

/** One app log line per dictation: whose key, and worked or why not. */
export function logDictation({ chatProvider, keyProvider, ok, reason }) {
  const via = keyProvider === chatProvider ? `the ${keyProvider} key` : `the ${keyProvider} key for a ${chatProvider} chat`;
  if (ok) speechLog.info(`dictation: transcribed with ${via}`);
  else speechLog.warn(`dictation: failed with ${via}: ${String(reason || 'unknown error').slice(0, 200)}`);
}
