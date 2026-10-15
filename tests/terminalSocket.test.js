import { jest } from '@jest/globals';
import { openTerminalSocket, reconnectDelay } from '../src/components/terminal/terminalSocket.js';

class FakeSocket {
  static all = [];
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; this.listeners = {}; FakeSocket.all.push(this); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(type, event = {}) { (this.listeners[type] || []).forEach((fn) => fn(event)); }
  open() { this.readyState = 1; this.emit('open'); }
  drop() { this.readyState = 3; this.emit('close'); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.drop(); }
}

function fakeWindow() {
  const listeners = {};
  const doc = { visibilityState: 'visible', addEventListener: jest.fn(), removeEventListener: jest.fn() };
  return {
    document: doc,
    addEventListener: (t, fn) => { listeners[t] = fn; },
    removeEventListener: (t) => { delete listeners[t]; },
    fire: (t) => listeners[t]?.(),
  };
}

beforeEach(() => { FakeSocket.all = []; jest.useFakeTimers(); });
afterEach(() => jest.useRealTimers());

test('a dropped connection says so once and reconnects on its own', () => {
  const events = [];
  const link = openTerminalSocket('ws://x/api/terminal', {
    onOpen: (re) => events.push(['open', re]),
    onDrop: (attempt) => events.push(['drop', attempt]),
  }, { WebSocketImpl: FakeSocket, win: fakeWindow() });
  FakeSocket.all[0].open();
  FakeSocket.all[0].drop();
  expect(FakeSocket.all).toHaveLength(1);
  jest.advanceTimersByTime(reconnectDelay(0));
  expect(FakeSocket.all).toHaveLength(2);
  FakeSocket.all[1].drop(); // server still down
  jest.advanceTimersByTime(reconnectDelay(1));
  FakeSocket.all[2].open();
  expect(events).toEqual([['open', false], ['drop', 0], ['drop', 1], ['open', true]]);
  link.send({ type: 'input', data: 'ls\r' });
  expect(FakeSocket.all[2].sent).toEqual([{ type: 'input', data: 'ls\r' }]);
  link.close();
});

test('waits are capped and coming back online retries right away', () => {
  expect(reconnectDelay(50)).toBe(15000);
  const win = fakeWindow();
  const link = openTerminalSocket('ws://x', {}, { WebSocketImpl: FakeSocket, win });
  FakeSocket.all[0].drop();
  expect(link.isWaiting()).toBe(true);
  win.fire('online');
  expect(FakeSocket.all).toHaveLength(2);
  link.close();
});

test('a program that ended waits for Enter instead of looping', () => {
  const onExit = jest.fn();
  const link = openTerminalSocket('ws://x', { onExit }, { WebSocketImpl: FakeSocket, win: fakeWindow() });
  FakeSocket.all[0].open();
  FakeSocket.all[0].emit('message', { data: JSON.stringify({ type: 'exit', code: 0 }) });
  FakeSocket.all[0].drop();
  jest.advanceTimersByTime(60000);
  expect(FakeSocket.all).toHaveLength(1);
  expect(onExit).toHaveBeenCalled();
  link.reconnectNow();
  expect(FakeSocket.all).toHaveLength(2);
  link.close();
});

test('closing the window stops all retries', () => {
  const link = openTerminalSocket('ws://x', {}, { WebSocketImpl: FakeSocket, win: fakeWindow() });
  link.close();
  jest.advanceTimersByTime(60000);
  expect(FakeSocket.all).toHaveLength(1);
});

test('signed-out check reads the session, and stays quiet when the server is down', async () => {
  const { stillSignedIn } = await import('../src/components/terminal/terminalSocket.js');
  const reply = (body) => async () => ({ ok: true, json: async () => body });
  expect(await stillSignedIn(reply({ authenticated: false }))).toBe(false);
  expect(await stillSignedIn(reply({ authenticated: true }))).toBe(true);
  expect(await stillSignedIn(async () => { throw new Error('down'); })).toBe(true);
});
