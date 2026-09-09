// tests/wsClient.test.js
//
// Browser-side client tests for src/lib/agentRegistry/wsClient.js.
// Node's `WebSocket` global is not defined under Jest's node
// environment, so the client is driven through a fake socket
// factory. The fake is a tiny event-emitter that mimics the
// `readyState` + addEventListener shape of the WebSocket API.

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

const { createAgentRegistryClient } = await import('../src/lib/agentRegistry/wsClient.js');

function FakeSocket() {
  const emitter = new EventEmitter();
  emitter.readyState = 0; // CONNECTING
  emitter.sent = [];
  emitter.url = null;
  emitter.OPEN = 1;
  emitter.CONNECTING = 0;
  emitter.CLOSING = 2;
  emitter.CLOSED = 3;
  emitter.addEventListener = (type, fn) => emitter.on(type, fn);
  emitter.removeEventListener = (type, fn) => emitter.off(type, fn);
  emitter.open = function open() {
    this.readyState = 1;
    setImmediate(() => this.emit('open'));
  };
  emitter.receive = function receive(msg) {
    if (process.env.WS_CLIENT_DEBUG) process.stderr.write(`[sock] receive ${msg.type}\n`);
    this.emit('message', { data: JSON.stringify(msg) });
  };
  emitter.fail = function fail() {
    this.emit('close');
  };
  emitter.send = function send(raw) {
    this.sent.push(JSON.parse(raw));
  };
  emitter.close = function close() {
    this.readyState = 3;
    setImmediate(() => this.emit('close'));
  };
  return emitter;
}

function makeClient(opts = {}) {
  let lastSocket = null;
  const factory = (url) => {
    const sock = new FakeSocket();
    sock.url = url;
    lastSocket = sock;
    sockets.push(sock);
    return sock;
  };
  const client = createAgentRegistryClient({ socketFactory: factory, ...opts });
  return { client, socket: () => lastSocket, sockets };
}

const sockets = [];
afterEach(() => {
  for (const s of sockets.splice(0)) {
    try { s.close(); } catch { /* ignored */ }
  }
});

describe('createAgentRegistryClient', () => {
  test('connect opens a WebSocket to the configured URL', () => {
    const { client, socket } = makeClient();
    client.connect();
    const s = socket();
    expect(s.url).toContain('/ws/agent-registry');
    expect(s.readyState).toBe(0); // CONNECTING
  });

  test('connect appends the auth token when getAuth returns one', () => {
    const { client, socket } = makeClient({ getAuth: () => 't0k' });
    client.connect();
    expect(socket().url).toContain('token=t0k');
  });

  test('connect is idempotent — calling it twice does not open twice', () => {
    const { client, socket } = makeClient();
    client.connect();
    const first = socket();
    client.connect();
    expect(socket()).toBe(first);
  });

  test('subscribe sends a subscribe message and registers a handler', () => {
    const { client, socket } = makeClient();
    client.connect();
    socket().open();
    const handler = jest.fn();
    client.subscribe('agent:architect', handler);
    expect(socket().sent).toEqual([{ type: 'subscribe', cardId: 'agent:architect', clientId: expect.any(String) }]);
    socket().receive({ type: 'event', cardId: 'agent:architect', n: 1 });
    expect(handler).toHaveBeenCalledWith({ type: 'event', cardId: 'agent:architect', n: 1 });
  });

  test('unsubscribe returned function removes the handler and sends unsubscribe', () => {
    const { client, socket } = makeClient();
    client.connect();
    socket().open();
    const handler = jest.fn();
    const off = client.subscribe('agent:architect', handler);
    socket().sent.length = 0;
    off();
    expect(socket().sent[0]).toMatchObject({ type: 'unsubscribe', cardId: 'agent:architect' });
  });

  test('call yields events from the server stream via AsyncIterable', async () => {
    const { client, socket } = makeClient();
    client.connect();
    socket().open();
    const it = client.call('agent:architect', { msg: 'hi' });
    expect(socket().sent[0]).toMatchObject({ type: 'call', cardId: 'agent:architect', payload: { msg: 'hi' } });
    const taskId = socket().sent[0].taskId;

    socket().receive({ type: 'call.started', taskId });
    socket().receive({ type: 'call.event', taskId, stage: 'planning', progress: 25 });
    socket().receive({ type: 'call.complete', taskId, result: { ok: true } });

    const events = [];
    let r = await it.next();
    if (process.env.WS_CLIENT_DEBUG) process.stderr.write(`[test] first r=${JSON.stringify(r)}\n`);
    while (!r.done) {
      events.push(r.value);
      if (process.env.WS_CLIENT_DEBUG) process.stderr.write(`[test] pushed ${r.value?.type} events=${events.length}\n`);
      r = await it.next();
      if (process.env.WS_CLIENT_DEBUG) process.stderr.write(`[test] next r=${JSON.stringify(r)}\n`);
    }
    if (process.env.WS_CLIENT_DEBUG) process.stderr.write(`[test] final events.length=${events.length} last=${events[events.length-1]?.type}\n`);
    expect(events[0].type).toBe('call.started');
    expect(events[events.length - 1].type).toBe('call.complete');
  });

  test('call rejected on call.failed surfaces an error to the iterator', async () => {
    const { client, socket } = makeClient();
    client.connect();
    socket().open();
    const it = client.call('agent:architect', {});
    const taskId = socket().sent[0].taskId;
    socket().receive({ type: 'call.failed', taskId, error: 'not-allowed' });
    await expect(it.next()).rejects.toThrow('not-allowed');
  });

  test('reconnect: close triggers a delayed re-open with the same URL', async () => {
    const { client, socket } = makeClient();
    client.connect();
    socket().open();
    expect(socket().readyState).toBe(1);
    const initial = socket(); // capture before fail so the assertion is meaningful

    socket().fail(); // simulates abnormal close
    await new Promise((r) => setTimeout(r, 1100)); // first reconnect delay is 1s
    const next = socket();
    expect(next).not.toBe(initial);
    expect(next.url).toContain('/ws/agent-registry');
  });

  test('close() suppresses reconnect', async () => {
    // The shared `sockets` array can carry pending async reconnects
    // from the previous tests' afterEach (FakeSocket's close() defers
    // via setImmediate, and the reconnect timer is 1000ms — and
    // stale reconnects from even-earlier tests can fire during the
    // drain, creating a cascade). Drain twice: first to flush the
    // setImmediates, then to flush the reconnect timers they schedule.
    for (let i = 0; i < 3; i++) {
      sockets.length = 0;
      await new Promise((r) => setTimeout(r, 1100));
    }
    sockets.length = 0;

    const { client, socket } = makeClient();
    client.connect();
    socket().open();
    const before = sockets.length;
    client.close();
    socket().fail();
    await new Promise((r) => setTimeout(r, 1100));
    // No NEW factory call should have been made after the close.
    expect(sockets.length).toBe(before);
  });

  test('subscribe is buffered until the socket is open, then flushed', () => {
    const { client, socket } = makeClient();
    client.connect();
    // Do NOT open yet.
    client.subscribe('agent:architect', () => {});
    expect(socket().sent).toHaveLength(0);
    socket().open();
    expect(socket().sent).toEqual([{ type: 'subscribe', cardId: 'agent:architect', clientId: expect.any(String) }]);
  });

  test('reconnect re-sends active subscriptions', async () => {
    const { client, socket } = makeClient();
    client.connect();
    socket().open();
    client.subscribe('agent:architect', () => {});
    socket().sent.length = 0;
    socket().fail();
    await new Promise((r) => setTimeout(r, 1100));
    const next = socket();
    expect(next.sent).toEqual([{ type: 'subscribe', cardId: 'agent:architect', clientId: expect.any(String) }]);
  });

  test('throws when cardId is missing', () => {
    const { client } = makeClient();
    expect(() => client.subscribe('', () => {})).toThrow(TypeError);
    expect(() => client.call('', {})).toThrow(TypeError);
  });
});