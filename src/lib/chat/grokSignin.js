// The Grok chat's "Use my Grok sign-in": the person's own Grok account
// (their SuperGrok or Grok Heavy plan) through xAI's Grok CLI, instead of an
// xAI API key. Server side: server/grokSignin/ and server/routes/grokSignin.js.
import { readChatStream } from '../chat.js';
import { ChatRequestError, chatResponseError } from '../chatErrors.js';
import { logToApp } from '../appLog/browserLog.js';
import { normalizeCapabilityProvider } from './modelCapabilities.js';

const BASE = '/api/cli-agents/grok-signin';

/** A chat whose model is Grok (xAI), so it can run on the person's own Grok sign-in. */
export function isGrokChat(provider) {
  return normalizeCapabilityProvider(provider) === 'xai';
}

async function json(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `Grok sign-in request failed (${res.status}).`), { code: body.code || null });
  return body;
}

export function fetchGrokStatus() {
  return json('/status');
}

export function startGrokSignIn() {
  return json('/login', { method: 'POST' });
}

export function grokSignOut() {
  return json('/logout', { method: 'POST' });
}

function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.from === 'me') return { text: String(m.text || '').trim(), index: i, hasFiles: Boolean(m.image || m.attachments?.length) };
  }
  return { text: '', index: -1, hasFiles: false };
}

/**
 * One chat turn on the person's Grok sign-in. Same shape as
 * sendMessageWithMeta, so useChat can use either. `conversationId` and the
 * board (`workspaceId`) name the chat; the server keeps each person's own
 * Grok conversation in it and hands their Grok the chat's messages it has
 * not seen yet.
 */
export async function sendGrokSigninMessage(messages, { conversationId = null, workspaceId = null, signal, onDelta, onStatusUpdate } = {}) {
  const last = lastUserText(messages);
  if (last.hasFiles) {
    throw new ChatRequestError('On your Grok sign-in this chat takes text only for now. Switch to "xAI key" above the box to send files or pictures.', { code: 'GROK_TEXT_ONLY' });
  }
  if (!last.text) throw new ChatRequestError('Type a message first.', { code: 'GROK_EMPTY' });
  // Error notes and stopped answers are left out: neither is an answer Grok gave in full.
  const history = messages.slice(0, last.index)
    .filter(m => !m.hidden && m.from !== 'system' && !m.error && !m.stopped && typeof m.text === 'string')
    .map(m => ({ from: m.from === 'me' ? 'me' : 'agent', text: m.text.slice(0, 8000) }));
  try {
    const res = await fetch(`${BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify({ text: last.text, history, chat: conversationId ? [workspaceId, conversationId].filter(Boolean).join('/') : null }),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) throw await chatResponseError(res);
    return await readChatStream(res, { onDelta, onStatusUpdate });
  } catch (err) {
    if (err?.name === 'AbortError') throw new ChatRequestError('Stopped.', { code: 'CHAT_ABORTED' });
    if (!(err instanceof ChatRequestError)) {
      throw new ChatRequestError('censaiOS could not reach Grok. Try again shortly.', { code: 'CHAT_NETWORK_ERROR', details: { cause: err?.message } });
    }
    if (err.code !== 'CHAT_ABORTED') logToApp('warn', `Grok sign-in chat failed: ${err.code}`, { detail: err.message });
    throw err;
  }
}
