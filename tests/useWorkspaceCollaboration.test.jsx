/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaceCollaboration } from '../src/app/hooks/useWorkspaceCollaboration.js';

class MockSocket {
  static instances = [];
  static reset() { MockSocket.instances = []; }
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.handlers = {};
    MockSocket.instances.push(this);
  }
  addEventListener(type, fn) {
    (this.handlers[type] = this.handlers[type] || []).push(fn);
  }
  emit(type, event) {
    (this.handlers[type] || []).forEach(fn => fn(event));
  }
  send() {}
  close() { this.emit('close', {}); }
}

const PROPS = {
  enabled: true,
  workspaceId: 'ws-1',
  wins: [],
  revision: 0,
  onAuthoritativeCommit: () => {},
  activeId: null,
};

function setup() {
  MockSocket.reset();
  jest.useFakeTimers();
  global.WebSocket = MockSocket;
  return renderHook(({ workspaceId }) => useWorkspaceCollaboration({ ...PROPS, workspaceId }), {
    initialProps: { workspaceId: 'ws-1' },
  });
}

function teardown() {
  jest.useRealTimers();
  delete global.WebSocket;
}

function failAllOpen() {
  // Close every socket the hook creates until it stops creating new ones.
  for (let i = 0; i < 30; i++) {
    const pending = MockSocket.instances.filter(s => !s.dead);
    if (pending.length === 0) break;
    act(() => {
      for (const s of pending) {
        s.dead = true;
        s.emit('close', {});
      }
    });
    act(() => { jest.advanceTimersByTime(30_000); });
  }
}

test('permanently rejected endpoint stops retrying and reports error', () => {
  const { result, unmount } = setup();
  failAllOpen();
  // Initial attempt + 19 reconnects, then the breaker trips — not infinite.
  expect(MockSocket.instances.length).toBe(20);
  expect(result.current.status).toBe('error');
  expect(result.current.notices.some(n => n.kind === 'error')).toBe(true);
  // Even after a long wait, no further attempts.
  act(() => { jest.advanceTimersByTime(300_000); });
  expect(MockSocket.instances.length).toBe(20);
  unmount();
  teardown();
});

test('transient failures still recover once a socket opens', () => {
  const { result, unmount } = setup();
  // Two fast failures...
  act(() => { MockSocket.instances[0].emit('close', {}); });
  act(() => { jest.advanceTimersByTime(1000); });
  act(() => { MockSocket.instances[1].emit('close', {}); });
  act(() => { jest.advanceTimersByTime(1000); });
  expect(MockSocket.instances.length).toBe(3);
  // ...then a good connection resets the failure count.
  act(() => {
    MockSocket.instances[2].emit('open', {});
    MockSocket.instances[2].emit('message', { data: JSON.stringify({ type: 'collaboration.ready', participants: [] }) });
  });
  expect(result.current.status).toBe('live');
  // A later drop reconnects again (breaker count was reset by the open).
  act(() => { MockSocket.instances[2].emit('close', {}); });
  act(() => { jest.advanceTimersByTime(1000); });
  expect(MockSocket.instances.length).toBe(4);
  unmount();
  teardown();
});

test('workspace change resets the breaker and reconnects', () => {
  const { result, rerender, unmount } = setup();
  failAllOpen();
  expect(result.current.status).toBe('error');
  act(() => { rerender({ workspaceId: 'ws-2' }); });
  expect(MockSocket.instances.length).toBe(21);
  expect(MockSocket.instances[20].url).toContain('workspaceId=ws-2');
  unmount();
  teardown();
});
