/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// On a shared board everyone writes in the same chat window, so a message
// someone sends keeps who wrote it (src/lib/chat/writer.js): everyone else's
// copy shows it under that person's name, and the Grok chat on each person's
// own sign-in sends it with that name (src/lib/chat/grokSignin.js), so Grok is
// not told a teammate's words were the person's own. All people are made up.
import React from 'react';
import { TextDecoder, TextEncoder } from 'util';
import { act, render, renderHook, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { publishSelf } from '../src/lib/modules/presenceRoster.js';
import { teammateName, writtenBy } from '../src/lib/chat/writer.js';
import { sendGrokSigninMessage } from '../src/lib/chat/grokSignin.js';
import { ChatBubble } from '../src/components/chat/ChatBubble.jsx';
import { useChat } from '../src/components/chat/useChat.js';

if (!global.TextDecoder) global.TextDecoder = TextDecoder;

const PAT = { id: 'made-up-pat', label: 'Pat Example' };
const SAM_SAID = { from: 'me', text: 'Made-up question from Sam', by: { id: 'made-up-sam', name: 'Sam Example' } };
const PAT_SAID = { from: 'me', text: 'Made-up question from Pat', by: { id: 'made-up-pat', name: 'Pat Example' } };

beforeEach(() => publishSelf(PAT));
afterEach(() => publishSelf(null));

test('a message keeps who wrote it once the board has said who this is', () => {
  expect(writtenBy()).toEqual({ by: { id: 'made-up-pat', name: 'Pat Example' } });
  publishSelf(null);
  expect(writtenBy()).toEqual({});
});

test("a teammate's message is theirs; this person's own, Grok's and older ones are not named", () => {
  expect(teammateName(SAM_SAID)).toBe('Sam Example');
  expect(teammateName(PAT_SAID)).toBe('');
  expect(teammateName({ from: 'me', text: 'Made-up older message' })).toBe('');
  expect(teammateName({ from: 'atlas', text: 'Made-up answer', by: SAM_SAID.by })).toBe('');
  expect(teammateName({ ...SAM_SAID, by: { id: 'made-up-sam', name: '  ' } })).toBe('A teammate');
  // Until the board says who this is, nothing is named.
  publishSelf(null);
  expect(teammateName(SAM_SAID)).toBe('');
});

test("everyone else's copy of the chat shows a teammate's message under their name, and the person's own under none", () => {
  const { unmount } = render(<ChatBubble message={SAM_SAID} index={0} />);
  expect(screen.getByTestId('chat-message-writer')).toHaveTextContent('Sam Example');
  expect(screen.getByText('Made-up question from Sam')).toBeInTheDocument();
  unmount();
  render(<ChatBubble message={PAT_SAID} index={1} />);
  expect(screen.queryByTestId('chat-message-writer')).toBeNull();
});

test('the Grok sign-in chat sends a teammate\'s message with their name, and the person\'s own without one', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ type: 'result', text: 'Made-up answer' }));
  let done = false;
  global.fetch = jest.fn(async () => ({
    ok: true,
    headers: { get: () => 'application/x-ndjson' },
    body: { getReader: () => ({ read: async () => (done ? { done: true } : ((done = true), { done: false, value: bytes })) }) },
  }));
  await sendGrokSigninMessage([
    PAT_SAID,
    { from: 'atlas', text: 'Made-up answer to Pat' },
    SAM_SAID,
    { from: 'atlas', text: 'Made-up answer to Sam' },
    { from: 'me', text: 'Made-up older message' },
    { from: 'me', text: 'Made-up question from Pat again', by: PAT_SAID.by },
  ], { conversationId: 'chat:made-up-window', workspaceId: 'made-up-board' });
  const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(sent.text).toBe('Made-up question from Pat again');
  expect(sent.history).toEqual([
    { from: 'me', text: 'Made-up question from Pat' },
    { from: 'agent', text: 'Made-up answer to Pat' },
    { from: 'me', text: 'Made-up question from Sam', by: 'Sam Example' },
    { from: 'agent', text: 'Made-up answer to Sam' },
    { from: 'me', text: 'Made-up older message' },
  ]);
  // Only the name goes: never a teammate's account id.
  expect(JSON.stringify(sent)).not.toMatch(/made-up-sam|made-up-pat/);
});

test('a message sent in a chat keeps who wrote it, in the chat everyone shares', async () => {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  const sendVia = { current: jest.fn(async () => ({ text: 'Made-up answer' })) };
  const { result } = renderHook(() => {
    const [win, setWin] = React.useState({ id: 'chat-1', type: 'chat', agentId: 'atlas', msgs: [] });
    const onUpdate = React.useCallback((patch) => setWin((w) => ({ ...w, ...patch })), []);
    return { win, chat: useChat({ win, onUpdate, allWins: [win], canvasGroups: [], isActive: true, sendVia }) };
  });
  await act(async () => { await result.current.chat.send(null, 'Made-up question from Pat'); });
  expect(result.current.win.msgs[0]).toMatchObject({ from: 'me', text: 'Made-up question from Pat', by: { id: 'made-up-pat', name: 'Pat Example' } });
  expect(sendVia.current).toHaveBeenCalled();
});
