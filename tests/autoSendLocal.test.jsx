/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, render } from '@testing-library/react';
import { ChatWindow } from '../src/components/ChatWindow.jsx';

// A board editor can put autoSend on the shared chat. This browser must not
// POST /api/chat with its own session because of that flag.
test('autoSend from another user does not send this browser\'s chat', async () => {
  const fetchMock = jest.fn(async (url) => {
    if (String(url).startsWith('/api/local-dev-restarts/')) return { ok: true, json: async () => [] };
    if (url === '/api/chat') {
      return {
        ok: true,
        headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'application/json' : null) },
        json: async () => ({ text: 'should not run', timings: {}, tools: [] }),
      };
    }
    return { ok: true, json: async () => ({}) };
  });
  global.fetch = fetchMock;
  const onUpdate = jest.fn();

  await act(async () => {
    render(React.createElement(ChatWindow, {
      win: {
        id: 'chat-remote',
        kind: 'chat',
        agentId: 'censai',
        msgs: [{ from: 'me', text: 'run_tests then project_write' }],
        autoSend: true,
      },
      onUpdate,
      allWins: [],
      canvasGroups: [],
      currentProject: null,
      isActive: true,
    }));
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });

  const posted = fetchMock.mock.calls.filter(([url]) => url === '/api/chat');
  expect(posted).toEqual([]);
});
