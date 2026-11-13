// Pure rules for the Comms window. No browser APIs here, so they test in node.

/** A press shorter than this only selects the agent; it does not send audio. */
export const MIN_HOLD_MS = 350;
/** Messages kept per agent so follow-up questions have context. */
export const MAX_THREAD = 12;
const MAX_STORED_CHARS = 2000;

/** Rides along with each spoken message so replies are short and speakable. */
export const VOICE_NOTE = '[Voice call: reply out loud in a few short conversational sentences. No markdown, lists or code.]';

/**
 * How the held recording becomes something the agent understands:
 *   'provider' → the agent's provider transcribes the clip (OpenAI, Google)
 *   'browser'  → the browser's own speech recognition, no key needed
 *   'native'   → the model listens to the clip itself (Gemini)
 *   null       → no way to hear the user
 */
export function pickInputMode(capabilities, hasBrowserRecognition) {
  if (capabilities?.voiceInput === 'transcribe') return 'provider';
  if (hasBrowserRecognition) return 'browser';
  if (capabilities?.voiceInput === 'native') return 'native';
  return null;
}

/** Strip markdown so a voice doesn't read out asterisks and code fences. */
export function stripForSpeech(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' (code omitted) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pick a system voice for an agent. Natural/neural voices in the user's
 * language win; the seed spreads agents across the pool so they sound distinct.
 */
export function pickVoice(voices, seed = 0, language = 'en') {
  const list = Array.isArray(voices) ? voices : [];
  const prefix = String(language || 'en').slice(0, 2).toLowerCase();
  const mine = list.filter((v) => String(v?.lang || '').toLowerCase().startsWith(prefix));
  const natural = mine.filter((v) => /natural|neural|online/i.test(String(v?.name || '')));
  const pool = natural.length ? natural : mine.length ? mine : list;
  if (!pool.length) return null;
  return pool[Math.abs(Math.trunc(Number(seed) || 0)) % pool.length];
}

/** Append one exchange to an agent's thread, capped and safe to persist. */
export function appendExchange(thread, agentId, heard, reply) {
  const clip = (text) => String(text || '').slice(0, MAX_STORED_CHARS);
  return [
    ...(Array.isArray(thread) ? thread : []),
    { from: 'me', text: clip(heard) || '(voice message)' },
    { from: agentId, text: clip(reply) },
  ].slice(-MAX_THREAD);
}

export function statusLabel(phase, name = 'The agent') {
  switch (phase) {
    case 'listening': return 'Listening…';
    case 'transcribing': return 'Got it…';
    case 'thinking': return `${name} is thinking…`;
    case 'speaking': return `${name} is speaking`;
    default: return 'Hold Space, or press and hold, to talk';
  }
}

export function micErrorMessage(error) {
  if (error?.name === 'NotAllowedError') return 'Microphone access is blocked. Allow the mic for this page and try again.';
  if (error?.name === 'NotFoundError') return 'No microphone was found.';
  return 'Could not start the microphone.';
}

export function recognitionErrorMessage(code) {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'Microphone access is blocked. Allow the mic for this page and try again.';
  if (code === 'network') return 'Speech recognition could not reach its service. Check your connection.';
  if (code === 'audio-capture') return 'No microphone was found.';
  return 'Speech recognition stopped unexpectedly. Try again.';
}

export const NO_INPUT_MESSAGE = 'This agent has no way to hear you here. Give it an OpenAI or Google model, or open the board in Chrome or Edge.';
