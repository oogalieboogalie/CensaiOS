// ═══════════════════════════════════════════════════════════════════
//  SPEECH (voice in / voice out)
//  Speech-to-text and text-to-speech through the agent's own provider, using
//  whichever key the chat would use (the user's vault key first).
//
//    openai  STT  POST {base}/audio/transcriptions  (gpt-4o-mini-transcribe)
//            TTS  POST {base}/audio/speech          (gpt-4o-mini-tts → mp3)
//    google  STT  generateContent on a Gemini flash model with the clip inline
//            TTS  generateContent on the Gemini TTS model → 24 kHz PCM, wrapped as WAV
// ═══════════════════════════════════════════════════════════════════

import { normalizeBaseUrl } from './providers.js';
import { createLogger } from '../logger.js';

export const speechLog = createLogger('ai');

export const SPEECH_TIMEOUT_MS = 60_000;
export const MAX_SPEECH_CHARS = 4000;
export const OPENAI_TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
export const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
export const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'alloy';
export const GEMINI_TRANSCRIBE_MODEL = process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-2.5-flash';
export const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
export const GEMINI_TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Kore';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export class SpeechError extends Error {
  constructor(message, code = 'SPEECH_FAILED', statusCode = 502) {
    super(message);
    this.name = 'SpeechError';
    this.code = code;
    this.statusCode = statusCode;
    this.status = statusCode;
  }
}

function speechFamily(provider) {
  const p = String(provider || '').toLowerCase();
  if (p === 'openai') return 'openai';
  if (p === 'google' || p === 'google-native') return 'google';
  return null;
}

export function supportsSpeech(provider) {
  return speechFamily(provider) !== null;
}

async function timedFetch(fetchImpl, url, init, timeoutMs = SPEECH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw new SpeechError('The speech request timed out.', 'SPEECH_TIMEOUT', 504);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function failure(res, label) {
  let detail = '';
  try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
  speechLog.warn(`${label} failed`, { status: res.status, detail });
  const status = res.status === 401 || res.status === 403 ? 401 : res.status === 429 ? 429 : 502;
  const message = status === 401
    ? `${label} was refused: check the API key in Settings → Vault.`
    : status === 429 ? `${label} is rate-limited. Try again in a minute.` : `${label} failed (${res.status}).`;
  return new SpeechError(message, status === 401 ? 'SPEECH_AUTH_FAILED' : 'SPEECH_FAILED', status);
}

function openAiBase(baseUrl) {
  const url = normalizeBaseUrl(baseUrl || '');
  return url.includes('api.openai.com') || /\/v1$/.test(url) ? url : 'https://api.openai.com/v1';
}

function extensionFor(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  return 'wav';
}

/**
 * Transcribe a recorded clip to text.
 * @param {{provider:string, apiKey:string, baseUrl?:string, audio:{mime:string, base64:string}, fetchImpl?:Function}} args
 * @returns {Promise<{text:string, model:string}>}
 */
export async function transcribeAudio({ provider, apiKey, baseUrl, audio, fetchImpl = fetch }) {
  const family = speechFamily(provider);
  if (!family) throw new SpeechError(`${provider || 'This provider'} has no speech-to-text API.`, 'SPEECH_UNSUPPORTED', 400);
  if (!apiKey) throw new SpeechError('No API key for speech-to-text. Add one in Settings → Vault.', 'SPEECH_KEY_REQUIRED', 403);
  if (!audio?.base64) throw new SpeechError('No audio was recorded.', 'SPEECH_EMPTY', 400);

  if (family === 'openai') {
    const form = new FormData();
    const bytes = Buffer.from(audio.base64, 'base64');
    form.append('file', new Blob([bytes], { type: audio.mime || 'audio/wav' }), `speech.${extensionFor(audio.mime)}`);
    form.append('model', OPENAI_TRANSCRIBE_MODEL);
    const res = await timedFetch(fetchImpl, `${openAiBase(baseUrl)}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) throw await failure(res, 'OpenAI transcription');
    const data = await res.json();
    return { text: String(data?.text || '').trim(), model: OPENAI_TRANSCRIBE_MODEL };
  }

  const res = await timedFetch(fetchImpl, `${GEMINI_BASE_URL}/models/${GEMINI_TRANSCRIBE_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: 'Transcribe this audio exactly. Reply with only the transcript, no commentary.' },
          { inlineData: { mimeType: audio.mime || 'audio/wav', data: audio.base64 } },
        ],
      }],
    }),
  });
  if (!res.ok) throw await failure(res, 'Gemini transcription');
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p?.text || '').join('').trim();
  return { text, model: GEMINI_TRANSCRIBE_MODEL };
}

/** Wrap raw little-endian 16-bit PCM in a WAV header. */
export function pcmToWav(pcm, { sampleRate = 24000, channels = 1, bitsPerSample = 16 } = {}) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function sampleRateFromMime(mime) {
  const match = /rate=(\d+)/i.exec(String(mime || ''));
  return match ? Number(match[1]) : 24000;
}

/** Strip markdown so the voice doesn't read out asterisks and code fences. */
export function speakableText(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' (code omitted) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SPEECH_CHARS);
}

/**
 * Read text aloud.
 * @returns {Promise<{mime:string, base64:string, model:string}>}
 */
export async function synthesizeSpeech({ provider, apiKey, baseUrl, text, voice, fetchImpl = fetch }) {
  const family = speechFamily(provider);
  if (!family) throw new SpeechError(`${provider || 'This provider'} has no text-to-speech API.`, 'SPEECH_UNSUPPORTED', 400);
  if (!apiKey) throw new SpeechError('No API key for text-to-speech. Add one in Settings → Vault.', 'SPEECH_KEY_REQUIRED', 403);
  const input = speakableText(text);
  if (!input) throw new SpeechError('Nothing to read aloud.', 'SPEECH_EMPTY', 400);

  if (family === 'openai') {
    const res = await timedFetch(fetchImpl, `${openAiBase(baseUrl)}/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: OPENAI_TTS_MODEL, voice: voice || OPENAI_TTS_VOICE, input, response_format: 'mp3' }),
    });
    if (!res.ok) throw await failure(res, 'OpenAI text-to-speech');
    const bytes = Buffer.from(await res.arrayBuffer());
    return { mime: 'audio/mpeg', base64: bytes.toString('base64'), model: OPENAI_TTS_MODEL };
  }

  const res = await timedFetch(fetchImpl, `${GEMINI_BASE_URL}/models/${GEMINI_TTS_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: input }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || GEMINI_TTS_VOICE } } },
      },
    }),
  });
  if (!res.ok) throw await failure(res, 'Gemini text-to-speech');
  const data = await res.json();
  const inline = (data?.candidates?.[0]?.content?.parts || []).find((p) => p?.inlineData?.data)?.inlineData;
  if (!inline) throw new SpeechError('Gemini returned no audio.', 'SPEECH_FAILED', 502);
  const mime = String(inline.mimeType || '');
  if (/wav|mpeg|mp3|ogg/i.test(mime)) {
    return { mime: mime.split(';')[0], base64: inline.data, model: GEMINI_TTS_MODEL };
  }
  const wav = pcmToWav(Buffer.from(inline.data, 'base64'), { sampleRate: sampleRateFromMime(mime) });
  return { mime: 'audio/wav', base64: wav.toString('base64'), model: GEMINI_TTS_MODEL };
}
