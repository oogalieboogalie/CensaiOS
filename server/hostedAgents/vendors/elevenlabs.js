// ElevenLabs Agents: a voice agent on the person's ElevenLabs account. It
// has no plain request-and-reply text endpoint; a chat runs over a
// WebSocket in text-only mode. Each message opens one short conversation,
// with the recent chat handed over as context so it keeps the thread.
// Shapes from the official elevenlabs-python SDK and elevenlabs.io/docs
// (agents create/get, WebSocket API), checked 2026-10-18.

import WebSocket from 'ws';
import { HostedAgentError, vendorJson } from '../http.js';
import { pinnedLookup } from '../../security/publicAddress.js';
import { vendorAddress } from '../netGuard.js';

const BASE = () => process.env.HOSTED_ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io';
const LABEL = 'ElevenLabs';
const AGENT_ID = /^[A-Za-z0-9_-]{6,80}$/;
const REPLY_LIMIT_MS = 120_000;

/** The recent chat as one short note the agent reads before the new message. */
export function historyNote(history = []) {
  const lines = history.slice(-10).map((m) => `${m.who === 'person' ? 'Person' : 'You'}: ${String(m.text || '').slice(0, 600)}`);
  return lines.length ? `Earlier in this chat:\n${lines.join('\n')}` : '';
}

/** One text exchange over the conversation WebSocket. Resolves { text, conversationId }. */
export function talkOverSocket({ url, lookup = null, text, note, textOnly = true, WebSocketImpl = WebSocket, signal = null, limitMs = REPLY_LIMIT_MS, greetingWaitMs = 1500 }) {
  return new Promise((resolve, reject) => {
    // `lookup` pins the connection to the address already checked (see netGuard.js).
    const socket = lookup ? new WebSocketImpl(url, { lookup }) : new WebSocketImpl(url);
    let conversationId = null;
    let settled = false;
    let asked = false;
    let greetingTimer = null;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(greetingTimer);
      signal?.removeEventListener?.('abort', onAbort);
      try { socket.close(); } catch { /* already closed */ }
      fn(value);
    };
    const onAbort = () => finish(reject, Object.assign(new Error('Stopped.'), { code: 'CHAT_ABORTED' }));
    const timer = setTimeout(() => finish(reject, new HostedAgentError('ElevenLabs took too long to answer.', 504, 'HOSTED_AGENT_TIMEOUT')), limitMs);
    signal?.addEventListener?.('abort', onAbort, { once: true });
    const send = (obj) => socket.send(JSON.stringify(obj));
    const askNow = () => {
      if (asked) return;
      asked = true;
      clearTimeout(greetingTimer);
      if (note) send({ type: 'contextual_update', text: note });
      send({ type: 'user_message', text });
    };
    socket.on('open', () => send({
      type: 'conversation_initiation_client_data',
      ...(textOnly ? { conversation_config_override: { conversation: { text_only: true } } } : {}),
    }));
    socket.on('message', (raw) => {
      let event;
      try { event = JSON.parse(String(raw)); } catch { return; }
      if (event.type === 'ping') send({ type: 'pong', event_id: event.ping_event?.event_id });
      if (event.type === 'conversation_initiation_metadata') {
        conversationId = event.conversation_initiation_metadata_event?.conversation_id || null;
        // An agent with a first message greets first: wait briefly for it so
        // the greeting is never taken for the answer.
        greetingTimer = setTimeout(askNow, greetingWaitMs);
      }
      if (event.type === 'agent_response') {
        if (!asked) askNow();
        else finish(resolve, { text: String(event.agent_response_event?.agent_response || ''), conversationId });
      }
    });
    socket.on('close', () => finish(reject, Object.assign(
      new HostedAgentError('ElevenLabs closed the chat before answering.', 502, 'HOSTED_AGENT_VENDOR_STOPPED'),
      { beforeStart: !conversationId },
    )));
    socket.on('error', () => finish(reject, new HostedAgentError('Could not reach ElevenLabs. Check the internet connection.', 502, 'HOSTED_AGENT_UNREACHABLE')));
  });
}

export const elevenlabsVendor = {
  id: 'elevenlabs',
  label: 'ElevenLabs',
  product: 'ElevenLabs Agents',
  brand: 'elevenlabs',
  keyProvider: 'elevenlabs',
  keyLabel: 'ElevenLabs API key',
  billedBy: 'ElevenLabs',
  howTo: 'In ElevenLabs, open Agents, pick your agent and copy its agent id (under the agent name, or in the widget embed code). Or make a new one here.',
  refLabel: 'Agent id',
  refPlaceholder: 'Your ElevenLabs agent id',
  canCreate: true,

  normalize({ ref }) {
    const agent = String(ref || '').trim();
    if (!AGENT_ID.test(agent)) throw new HostedAgentError('Paste the ElevenLabs agent id.', 400, 'HOSTED_AGENT_BAD_REF');
    return { ref: agent, endpoint: null, settings: {} };
  },

  async describe({ ref, apiKey, fetchImpl }) {
    const agent = await vendorJson({ url: `${BASE()}/v1/convai/agents/${encodeURIComponent(ref)}`, headers: { 'xi-api-key': apiKey }, label: LABEL, fetchImpl, timeoutMs: 20_000 });
    const config = agent.conversation_config?.agent || {};
    return { name: agent.name || null, description: config.first_message ? `Opens with: ${config.first_message}` : null, instructions: config.prompt?.prompt || null };
  },

  async send({ ref, apiKey, text, history, fetchImpl, signal, WebSocketImpl }) {
    // The chat link comes from ElevenLabs' answer: it is checked like any address before connecting.
    const chatLink = async () => {
      const signed = await vendorJson({
        url: `${BASE()}/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(ref)}`,
        headers: { 'xi-api-key': apiKey }, label: LABEL, fetchImpl, signal, timeoutMs: 20_000,
      });
      const url = String(signed.signed_url || '');
      if (!/^wss?:\/\//.test(url)) throw new HostedAgentError('ElevenLabs did not open a chat.', 502, 'HOSTED_AGENT_BAD_ANSWER');
      const { addresses } = await vendorAddress(url, { label: LABEL });
      return { url, lookup: addresses ? pinnedLookup(addresses) : null };
    };
    const talk = { ...(await chatLink()), text, note: historyNote(history), signal, ...(WebSocketImpl ? { WebSocketImpl } : {}) };
    try {
      const reply = await talkOverSocket(talk);
      return { text: reply.text, thread: reply.conversationId };
    } catch (err) {
      // An agent that does not allow the text-only switch refuses at once: talk without it.
      if (!err?.beforeStart) throw err;
      const reply = await talkOverSocket({ ...talk, ...(await chatLink()), textOnly: false });
      return { text: reply.text, thread: reply.conversationId };
    }
  },

  async create({ name, voiceId, firstMessage, instructions, apiKey, fetchImpl }) {
    const made = await vendorJson({
      url: `${BASE()}/v1/convai/agents/create`, method: 'POST', headers: { 'xi-api-key': apiKey }, label: LABEL, fetchImpl, timeoutMs: 30_000,
      body: {
        name,
        conversation_config: {
          agent: { ...(firstMessage ? { first_message: firstMessage } : {}), language: 'en', prompt: { prompt: instructions } },
          ...(voiceId ? { tts: { voice_id: voiceId } } : {}),
        },
      },
    });
    if (!made.agent_id) throw new HostedAgentError('ElevenLabs did not make the agent.', 502, 'HOSTED_AGENT_BAD_ANSWER');
    return { ref: made.agent_id };
  },
};
