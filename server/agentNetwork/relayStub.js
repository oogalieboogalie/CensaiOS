// server/agentNetwork/relayStub.js
//
// A stand-in for the always-on relay: the reference for what a hosted
// relay must do, small enough to run next to two installs in a test. It
// holds nothing but a queue in memory. See docs/specs/06-agent-relay.md.
//
// Callers (another censaiOS, any app with an agent key):
//   POST /i/:install/api/mcp/agents/:id/ask   { message, request? }
//        install online  -> the install's answer (200, with its receipt)
//        install offline -> 202 { queued, callId, statusUrl }
//   POST /i/:install/api/mcp/agents/:id       MCP; online only (503 when off)
//   GET  /relay/v1/calls/:callId              same agent key -> where the call stands
// Installs (Authorization: Bearer crp1... relay pass, see relayPass.js):
//   GET  /relay/v1/inbox?wait=25              waiting calls, held open until one arrives
//   POST /relay/v1/results/:callId            { status, body } the answer for one call
// The relay never checks agent keys (only the install can) and never reads
// answers; it keeps a hash of the caller's key so only that caller can
// collect a queued answer.

import crypto from 'node:crypto';
import express from 'express';
import { verifyRelayPass } from './relayPass.js';
import { sha256Hex } from './canonical.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INSTALL = /^ci_[0-9a-f]{24}$/;
const ONLINE_GRACE_MS = 35_000;
const REDELIVER_AFTER_MS = 150_000;
const MAX_WAIT_SECONDS = 25;

export const RELAY_DEFAULTS = Object.freeze({
  holdMs: 20_000,          // how long a caller waits for an online install
  keepMs: 7 * 24 * 3600e3, // how long a queued or answered call is kept
  maxQueuedPerInstall: 200,
});

function bearer(req) {
  const match = /^Bearer\s+(\S+)$/i.exec(String(req.get('authorization') || '').trim());
  return match ? match[1] : null;
}

export function createRelayState({ now = () => Date.now(), options = RELAY_DEFAULTS } = {}) {
  const calls = new Map();
  const pollers = new Map();   // installId -> Set<() => void>
  const lastSeen = new Map();  // installId -> ms
  const answerWaiters = new Map(); // callId -> Set<(call) => void>

  const isOnline = (installId) => now() - (lastSeen.get(installId) || 0) < ONLINE_GRACE_MS;
  const wake = (map, key, arg) => { for (const fn of map.get(key) || []) fn(arg); map.delete(key); };

  function prune() {
    for (const [id, call] of calls) if (now() - call.createdAt > options.keepMs) calls.delete(id);
  }

  return {
    calls,
    isOnline,
    enqueue({ installId, endpointId, kind, authorization, body }) {
      prune();
      const queued = [...calls.values()].filter((c) => c.installId === installId && c.state !== 'answered');
      if (queued.length >= options.maxQueuedPerInstall) return null;
      const call = {
        id: `rc_${crypto.randomUUID()}`, installId, endpointId, kind, authorization, body,
        keyHash: sha256Hex(authorization), state: 'queued', createdAt: now(), deliveredAt: null, reply: null,
      };
      calls.set(call.id, call);
      wake(pollers, installId);
      return call;
    },
    /** Calls for an install, marked as being delivered. */
    take(installId) {
      lastSeen.set(installId, now());
      const out = [];
      for (const call of calls.values()) {
        if (call.installId !== installId || call.state === 'answered') continue;
        if (call.state === 'delivering' && now() - call.deliveredAt < REDELIVER_AFTER_MS) continue;
        call.state = 'delivering';
        call.deliveredAt = now();
        out.push(call);
      }
      return out;
    },
    /** Waits for a call to arrive; `onGone` registers a stop for a poller that hung up. */
    waitForCalls(installId, ms, onGone = () => {}) {
      return new Promise((resolve) => {
        const set = pollers.get(installId) || new Set();
        const done = () => { clearTimeout(timer); set.delete(done); resolve(); };
        const timer = setTimeout(done, ms);
        set.add(done);
        pollers.set(installId, set);
        onGone(done);
      });
    },
    answer(installId, callId, reply) {
      const call = calls.get(callId);
      if (!call || call.installId !== installId) return false;
      call.state = 'answered';
      call.reply = { status: Number(reply?.status) || 200, body: reply?.body ?? null, at: now() };
      call.authorization = null;
      call.body = null;
      wake(answerWaiters, callId, call);
      return true;
    },
    waitForAnswer(callId, ms) {
      return new Promise((resolve) => {
        const call = calls.get(callId);
        if (!call || call.state === 'answered') { resolve(call || null); return; }
        const set = answerWaiters.get(callId) || new Set();
        const done = (value) => { clearTimeout(timer); set.delete(done); resolve(value || calls.get(callId)); };
        const timer = setTimeout(() => done(null), ms);
        set.add(done);
        answerWaiters.set(callId, set);
      });
    },
  };
}

function queuedReply(call, origin) {
  return {
    queued: true,
    callId: call.id,
    statusUrl: `${origin}/relay/v1/calls/${call.id}`,
    message: 'The agent\'s computer is off right now. Your question is waiting in line and is answered when censaiOS opens there again.',
  };
}

export function createRelayStub({ state = createRelayState(), options = RELAY_DEFAULTS } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  const origin = (req) => `${req.protocol}://${req.get('host')}`;

  app.get('/relay/v1/health', (_req, res) => res.json({ ok: true, relay: 'censaiOS relay stand-in', calls: state.calls.size }));

  const passFor = (req, res) => {
    const check = verifyRelayPass(bearer(req), { relay: origin(req) });
    if (!check.ok) { res.status(401).json({ error: `Relay pass refused: ${check.reason}.` }); return null; }
    return check.installId;
  };

  app.get('/relay/v1/inbox', async (req, res) => {
    const installId = passFor(req, res);
    if (!installId) return undefined;
    let ready = state.take(installId);
    if (!ready.length) {
      const wait = Math.min(MAX_WAIT_SECONDS, Math.max(0, Number(req.query.wait) || 0));
      if (wait) {
        // A computer that shut down mid-wait leaves a hung-up request behind;
        // handing it a call would lose the call until it is offered again.
        let gone = false;
        await state.waitForCalls(installId, wait * 1000, (stop) => {
          res.on('close', () => { gone = true; stop(); });
        });
        if (gone || res.writableEnded || req.socket.destroyed) return undefined;
        ready = state.take(installId);
      }
    }
    return res.json({
      calls: ready.map((c) => ({ id: c.id, kind: c.kind, endpointId: c.endpointId, authorization: c.authorization, body: c.body })),
    });
  });

  app.post('/relay/v1/results/:callId', (req, res) => {
    const installId = passFor(req, res);
    if (!installId) return undefined;
    if (!state.answer(installId, String(req.params.callId), req.body)) return res.status(404).json({ error: 'No such call for this install.' });
    return res.json({ ok: true });
  });

  app.get('/relay/v1/calls/:callId', (req, res) => {
    const call = state.calls.get(String(req.params.callId));
    const auth = req.get('authorization');
    if (!call || !auth || sha256Hex(auth) !== call.keyHash) return res.status(404).json({ error: 'No such call.' });
    if (call.state !== 'answered') return res.json({ callId: call.id, state: call.state, online: state.isOnline(call.installId) });
    return res.json({ callId: call.id, state: 'answered', status: call.reply.status, body: call.reply.body });
  });

  const forward = (kind) => async (req, res) => {
    const auth = req.get('authorization');
    if (!bearer(req)) return res.status(401).json({ error: 'A valid agent key is required.' });
    const { install, endpointId } = req.params;
    if (!INSTALL.test(install) || !UUID.test(endpointId)) return res.status(404).json({ error: 'Not a relay address.' });
    if (kind === 'mcp' && !state.isOnline(install)) {
      return res.status(503).json({ jsonrpc: '2.0', id: req.body?.id ?? null, error: { code: -32002, message: 'This agent\'s computer is off right now. Use its /ask address to leave a question in line.' } });
    }
    const call = state.enqueue({ installId: install, endpointId, kind, authorization: auth, body: req.body });
    if (!call) return res.status(429).json({ error: 'Too many questions are already waiting for this computer.' });
    const answered = state.isOnline(install) ? await state.waitForAnswer(call.id, options.holdMs) : null;
    if (answered?.state === 'answered') {
      if (answered.reply.body === null) return res.status(answered.reply.status).end();
      return res.status(answered.reply.status).json(answered.reply.body);
    }
    if (kind === 'mcp') return res.status(504).json({ jsonrpc: '2.0', id: req.body?.id ?? null, error: { code: -32003, message: 'The agent did not answer in time.' } });
    return res.status(202).json(queuedReply(call, origin(req)));
  };

  app.post('/i/:install/api/mcp/agents/:endpointId/ask', forward('ask'));
  app.post('/i/:install/api/mcp/agents/:endpointId', forward('mcp'));
  app.use((_req, res) => res.status(404).json({ error: 'Not a relay address.' }));
  return app;
}
