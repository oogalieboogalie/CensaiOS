// src/lib/agentRegistry/wsClient.js
//
// Browser-side client for the /ws/agent-registry endpoint. Owns the
// WebSocket lifecycle (connect / heartbeat / reconnect with backoff)
// and exposes a small surface that downstream UI (D4 RegistryWindow)
// can subscribe to without touching the wire protocol directly.
//
// Shape:
//   const client = createAgentRegistryClient({ url?, getAuth? });
//   client.connect();                    // idempotent
//   client.subscribe(cardId, handler);   // returns unsubscribe fn
//   client.call(cardId, payload, opts);  // returns AsyncIterable<event>
//   client.close();                      // clean shutdown, no reconnect
//
// Auth: cookies travel automatically with same-origin WebSockets.
// For cross-origin, a `getAuth` hook can return a token forwarded as
// a query-string param on the upgrade URL.
//
// Reconnect: 1s, 2s, 4s, 8s, capped at 30s. Reconnect only on
// abnormal closes; manual close() suppresses reconnection.
//
// Tests inject a `socketFactory` — see tests/wsClient.test.js.

import { makeLifecycle, newClientId, defaultUrl } from './wsClient.lifecycle.js';

/**
 * Create an agent-registry WS client.
 *   url:            explicit endpoint (default: same-origin /ws/agent-registry)
 *   getAuth:        () => token|null — appended as ?token= for cross-origin
 *   socketFactory:  (url) => WebSocket — tests inject a fake
 *   logger:         optional structured logger
 */
export function createAgentRegistryClient(opts = {}) {
  const urlBase = opts.url || defaultUrl();
  const getAuth = typeof opts.getAuth === 'function' ? opts.getAuth : () => null;
  const socketFactory = opts.socketFactory || ((u) => new WebSocket(u));
  const logger = opts.logger || console;
  const ownClientId = newClientId();

  // Mutable state in a single object so the lifecycle module can
  // read/write it through getState/setState.
  const state = {
    socket: null,
    manuallyClosed: false,
    reconnectAttempt: 0,
    reconnectTimer: null,
    ready: false,
  };
  const cardHandlers = new Map();   // cardId -> Set<handler>
  const inflightCalls = new Map();  // taskId -> AsyncIterable controller
  const pendingSubscribes = new Set();
  const pendingUnsubscribes = new Set();

  const sendRaw = (payload) => {
    if (!state.socket || state.socket.readyState !== 1) return false;
    try { state.socket.send(JSON.stringify(payload)); return true; }
    catch (err) { logger.warn?.('send failed', err); return false; }
  };

  const ctx = {
    urlBase,
    getAuth,
    socketFactory,
    ownClientId,
    logger,
    cardHandlers,
    pendingSubscribes,
    pendingUnsubscribes,
    inflightCalls,
    getState: () => state,
    setState: (patch) => Object.assign(state, patch),
    sendRaw,
  };

  const lifecycle = makeLifecycle(ctx);

  function createAsyncIterable(taskId) {
    const queue = [];
    let resolveNext = null;
    let rejectNext = null;
    let done = false;
    let pendingError = null;
    const flush = () => {
      if (rejectNext && pendingError) {
        const r = rejectNext; rejectNext = null; resolveNext = null;
        r(pendingError);
        return true;
      }
      if (resolveNext && queue.length) {
        const r = resolveNext; resolveNext = null; rejectNext = null;
        const v = queue.shift();
        r({ value: v, done: false });
        return true;
      }
      return false;
    };
    const ctl = {
      push(ev) { if (!done) queue.push(ev); flush(); },
      complete(final) {
        if (done) return;
        queue.push(final);
        done = true;
        flush();
      },
      error(err) {
        if (done) return;
        done = true;
        pendingError = err;
        flush();
      },
    };
    inflightCalls.set(taskId, ctl);
    return {
      [Symbol.asyncIterator]() { return this; },
      next() {
        if (queue.length) {
          const v = queue.shift();
          return Promise.resolve({ value: v, done: false });
        }
        if (done) {
          if (pendingError) {
            const err = pendingError; pendingError = null;
            return Promise.reject(err);
          }
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve, reject) => { resolveNext = resolve; rejectNext = reject; });
      },
      return() {
        done = true;
        inflightCalls.delete(taskId);
        if (rejectNext) { const r = rejectNext; rejectNext = null; r(new Error('iterator-closed')); }
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }

  return {
    connect() { state.manuallyClosed = false; lifecycle.openSocket(); },
    isReady() { return state.ready; },
    close() {
      state.manuallyClosed = true;
      if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; }
      for (const [, ctl] of inflightCalls) ctl.error(new Error('client-closed'));
      inflightCalls.clear();
      if (state.socket) { try { state.socket.close(); } catch { /* already closing */ } state.socket = null; }
    },
    subscribe(cardId, handler) {
      if (typeof cardId !== 'string' || !cardId) throw new TypeError('cardId required');
      if (typeof handler !== 'function') throw new TypeError('handler required');
      let bucket = cardHandlers.get(cardId);
      const wasEmpty = !bucket;
      if (!bucket) { bucket = new Set(); cardHandlers.set(cardId, bucket); }
      bucket.add(handler);
      pendingUnsubscribes.delete(cardId);
      // Use the socket's readyState (1=OPEN) rather than our `ready` flag —
      // `ready` only flips after the open event fires (async via setImmediate
      // in the test fake), but the socket is actually writable the moment
      // readyState goes to 1.
      if (state.socket && state.socket.readyState === 1) {
        if (wasEmpty) sendRaw({ type: 'subscribe', cardId, clientId: ownClientId });
      } else {
        if (wasEmpty) pendingSubscribes.add(cardId);
      }
      return () => {
        const b = cardHandlers.get(cardId);
        if (!b) return;
        b.delete(handler);
        if (b.size === 0) {
          cardHandlers.delete(cardId);
          pendingSubscribes.delete(cardId);
          if (state.socket && state.socket.readyState === 1) {
            sendRaw({ type: 'unsubscribe', cardId, clientId: ownClientId });
          } else {
            pendingUnsubscribes.add(cardId);
          }
        }
      };
    },
    call(cardId, payload, options) {
      if (typeof cardId !== 'string' || !cardId) throw new TypeError('cardId required');
      const taskId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `t-${Date.now()}`;
      const iterable = createAsyncIterable(taskId);
      sendRaw({ type: 'call', cardId, payload, options, taskId });
      return iterable;
    },
    _testOwnClientId: ownClientId,
  };
}
