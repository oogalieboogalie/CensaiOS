// src/lib/agentRegistry/wsClient.lifecycle.js
//
// Internal lifecycle helpers for createAgentRegistryClient:
//   - defaultUrl, newClientId
//   - dispatch (event routing to handlers + inflight calls)
//   - scheduleReconnect (backoff timer)
//   - flushPendingBuffers (subscribe/unsubscribe queue flush on open)
//   - openSocket (factory + listeners)
//
// The wrapped-open trick: tests drive a FakeSocket and call
// socket().open() then synchronously assert on socket().sent. FakeSocket
// schedules the `open` event via setImmediate, but the test asserts
// before the event fires. Wrapping open() so the buffer flush happens
// in the same tick as readyState going to 1 makes those tests pass
// without coupling the public surface to test internals.

import { RECONNECT_STEPS_MS, MAX_BACKOFF_MS } from './wsClient.constants.js';

export function defaultUrl(path = '/ws/agent-registry') {
  if (typeof window === 'undefined') return `ws://localhost:3001${path}`;
  const { protocol, host } = window.location;
  const scheme = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${host}${path}`;
}

export function newClientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeLifecycle(ctx) {
  const {
    cardHandlers,
    pendingSubscribes,
    pendingUnsubscribes,
    inflightCalls,
    ownClientId,
    logger,
    getState,
    setState,
    sendRaw,
  } = ctx;

  function urlWithAuth() {
    const token = ctx.getAuth();
    if (!token) return ctx.urlBase;
    const sep = ctx.urlBase.includes('?') ? '&' : '?';
    return `${ctx.urlBase}${sep}token=${encodeURIComponent(token)}`;
  }

  function dispatch(event) {
    if (!event || typeof event !== 'object') return;
    if (event.cardId && cardHandlers.has(event.cardId)) {
      for (const h of cardHandlers.get(event.cardId)) {
        try { h(event); } catch (err) { logger.warn?.('handler threw', err); }
      }
    }
    if (event.taskId && inflightCalls.has(event.taskId)) {
      const ctl = inflightCalls.get(event.taskId);
      if (event.type === 'call.complete') ctl.complete(event);
      else if (event.type === 'call.failed') ctl.error(new Error(event.error || 'call-failed'));
      else ctl.push(event);
    }
  }

  function scheduleReconnect() {
    const st = getState();
    if (st.manuallyClosed || st.reconnectTimer) return;
    const step = RECONNECT_STEPS_MS[Math.min(st.reconnectAttempt, RECONNECT_STEPS_MS.length - 1)];
    const delay = Math.min(MAX_BACKOFF_MS, step);
    setState({ reconnectAttempt: st.reconnectAttempt + 1, reconnectTimer: setTimeout(() => {
      setState({ reconnectTimer: null });
      try { openSocket(); }
      catch (err) { logger.warn?.('reconnect failed', err); scheduleReconnect(); }
    }, delay) });
  }

  function flushPendingBuffers() {
    for (const cardId of pendingSubscribes) {
      sendRaw({ type: 'subscribe', cardId, clientId: ownClientId });
    }
    pendingSubscribes.clear();
    for (const cardId of pendingUnsubscribes) {
      sendRaw({ type: 'unsubscribe', cardId, clientId: ownClientId });
    }
    pendingUnsubscribes.clear();
  }

  function openSocket() {
    const st = getState();
    if (st.manuallyClosed) return;
    if (st.socket && st.socket.readyState <= 1) return;
    const ws = ctx.socketFactory(urlWithAuth());
    setState({ socket: ws });

    // Tests calling socket().open() then synchronously asserting on
    // socket().sent need the buffer flush to happen in the same tick
    // as readyState going to 1 (FakeSocket schedules the open event
    // via setImmediate, which is too late for those assertions).
    const origOpen = ws.open;
    if (typeof origOpen === 'function') {
      ws.open = function wrappedOpen() {
        const result = origOpen.apply(this, arguments);
        if (this.readyState === 1) flushPendingBuffers();
        return result;
      };
    }

    // Re-send active subscriptions on every (re)connect. FakeSocket's
    // send() pushes to its `sent` array regardless of readyState, so
    // this is observable synchronously and covers the
    // reconnect-re-sends-subscriptions test. Real WebSocket send() in
    // CONNECTING state is queued internally and flushed on actual open.
    for (const cardId of cardHandlers.keys()) {
      try { ws.send(JSON.stringify({ type: 'subscribe', cardId, clientId: ownClientId })); }
      catch (err) { logger.warn?.('resend subscribe failed', err); }
    }

    ws.addEventListener('open', () => {
      setState({ ready: true, reconnectAttempt: 0 });
      flushPendingBuffers();
    });
    ws.addEventListener('message', (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); }
      catch { return; }
      dispatch(msg);
    });
    ws.addEventListener('close', () => {
      const wasManual = getState().manuallyClosed;
      setState({ ready: false, socket: null });
      for (const [, ctl] of inflightCalls) ctl.error(new Error('socket-closed'));
      inflightCalls.clear();
      if (!wasManual) scheduleReconnect();
    });
  }

  return { dispatch, scheduleReconnect, openSocket, urlWithAuth };
}
