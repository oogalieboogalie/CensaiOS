/** @jest-environment jsdom */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useChat } from '../src/components/chat/useChat.js';

// A "your dev server restarted" note used to be added to the conversation
// as it was when the chat window first opened, so every message sent since
// then disappeared the moment the note arrived.

let notes = [];
beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  notes = [];
  global.fetch = async (url) => {
    const path = String(url);
    if (path.startsWith('/api/local-dev-restarts/notifications')) {
      const body = notes; notes = [];
      return { ok: true, status: 200, json: async () => body };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
});

function useBoardChat() {
  const [win, setWin] = React.useState({ id: 'chat-1', type: 'chat', agentId: 'atlas', msgs: [] });
  const onUpdate = React.useCallback((patch) => setWin((w) => ({ ...w, ...patch })), []);
  const chat = useChat({ win, onUpdate, allWins: [win], canvasGroups: [], isActive: true });
  return { win, onUpdate, chat };
}

test('a restart note keeps the messages already in the chat', async () => {
  const { result } = renderHook(() => useBoardChat());
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  act(() => {
    result.current.onUpdate({ msgs: [
      { from: 'me', text: 'Make the header black', at: '2026-10-21T07:00:00Z' },
      { from: 'atlas', text: 'Done: the header is black now.', at: '2026-10-21T07:00:05Z' },
    ] });
  });
  notes = [{ id: 9, completion_message: 'Your dev server restarted.' }];
  await act(async () => { await new Promise((r) => setTimeout(r, 3300)); });
  await waitFor(() => expect(result.current.win.msgs.some((m) => m.localDevRestartId === 9)).toBe(true), { timeout: 2000 });
  expect(result.current.win.msgs.map((m) => m.text)).toEqual([
    'Make the header black',
    'Done: the header is black now.',
    'Your dev server restarted.',
  ]);
}, 10000);
