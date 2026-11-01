// server/agentNetwork/relayLink.js
//
// The install's side of the relay. When CENSAI_AGENT_RELAY_URL is set,
// censaiOS keeps one request open to the relay ("anything for me?"),
// answers each call it gets exactly as if it had come in directly, and
// sends the answer back. Questions that arrived while this computer was
// off are waiting at the relay and are answered as soon as this starts.
// Off unless the setting names a relay; nothing is hosted by censaiOS.

import pool from '../db.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { getInstallSigner } from './installIdentity.js';
import { createRelayPass } from './relayPass.js';
import { relayAgentAddress } from './address.js';

const log = createLogger('agent-relay');
const WAIT_SECONDS = 25;
const MAX_BACKOFF_MS = 30_000;

export function relayUrlFromEnv(env = process.env) {
  const raw = String(env.CENSAI_AGENT_RELAY_URL || '').trim();
  if (!raw || raw === 'off') return null;
  try { return new URL(raw).origin; } catch { return null; }
}

function keyFrom(authorization) {
  const match = /^Bearer\s+(\S+)$/i.exec(String(authorization || '').trim());
  return match ? match[1] : null;
}

/**
 * deps.answer({ endpointId, kind, token, body, address, channel }) -> { status, body }
 * (routes/agentEndpointsPublic.js answerAgentCall).
 */
export function createRelayLink({ relayUrl, answer, getSigner = () => getInstallSigner(pool), fetchImpl = globalThis.fetch, sleep }) {
  const pause = sleep || ((ms) => new Promise((resolve) => { setTimeout(resolve, ms).unref?.(); }));
  const state = { relayUrl, installId: null, connected: false, lastSeenAt: null, answered: 0, lastError: null, running: false };

  async function headers() {
    const signer = await getSigner();
    state.installId = signer.installId;
    return { Authorization: `Bearer ${createRelayPass(signer, { relay: relayUrl })}` };
  }

  async function handle(call, auth) {
    const reply = await answer({
      endpointId: call.endpointId, kind: call.kind === 'mcp' ? 'mcp' : 'ask', token: keyFrom(call.authorization),
      body: call.body, address: 'relay', channel: 'relay',
    });
    await fetchImpl(`${relayUrl}/relay/v1/results/${encodeURIComponent(call.id)}`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: reply.status, body: reply.body ?? null }),
    });
    state.answered += 1;
  }

  /** One round: collect waiting calls (holding the request open) and answer them. */
  async function pollOnce({ wait = WAIT_SECONDS } = {}) {
    const auth = await headers();
    const res = await fetchImpl(`${relayUrl}/relay/v1/inbox?wait=${wait}`, { headers: auth });
    if (!res.ok) throw new Error(`relay said HTTP ${res.status}`);
    const { calls = [] } = await res.json();
    state.connected = true;
    state.lastSeenAt = new Date().toISOString();
    state.lastError = null;
    // Each call runs on its own so one slow agent does not hold up the rest.
    await Promise.allSettled(calls.map((call) => handle(call, auth).catch((error) => {
      log.warn('relayed call not answered', { callId: call.id, code: safeErrorCode(error) });
    })));
    return calls.length;
  }

  async function loop() {
    let backoff = 1000;
    while (state.running) {
      try {
        await pollOnce();
        backoff = 1000;
      } catch (error) {
        if (state.connected || !state.lastError) log.warn('relay unreachable, retrying', { code: safeErrorCode(error) });
        state.connected = false;
        state.lastError = error.message;
        await pause(backoff);
        backoff = Math.min(MAX_BACKOFF_MS, backoff * 2);
      }
    }
  }

  return {
    state,
    pollOnce,
    start() {
      if (state.running) return;
      state.running = true;
      loop();
    },
    stop() { state.running = false; },
    status() {
      return { url: relayUrl, installId: state.installId, connected: state.connected, lastSeenAt: state.lastSeenAt, answered: state.answered };
    },
    addressFor(endpointId) {
      return state.installId ? relayAgentAddress({ relayUrl, installId: state.installId, endpointId }) : null;
    },
  };
}

let current = null;

/** Start the link when a relay is configured. Never throws. */
export async function startRelayLink({ env = process.env } = {}) {
  const relayUrl = relayUrlFromEnv(env);
  if (!relayUrl || current) return current;
  const { answerAgentCall } = await import('../routes/agentEndpointsPublic.js');
  current = createRelayLink({ relayUrl, answer: (call) => answerAgentCall(call) });
  current.start();
  log.info('agent relay link on', { relay: relayUrl });
  return current;
}

/** What the Share panel shows: null when no relay is configured. */
export function relayLinkStatus() {
  return current ? current.status() : null;
}

export function relayAddressFor(endpointId) {
  return current ? current.addressFor(endpointId) : null;
}
