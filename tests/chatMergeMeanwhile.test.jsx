/**
 * @jest-environment jsdom
 */
// Sam asks, and Pat writes in the same chat while the answer is still on its
// way. The question, Pat's message and the answer all stay.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { ChatWindow } from '../src/components/ChatWindow.jsx';
import { GroupChatWindow } from '../src/components/GroupChatWindow.jsx';
import { pendingAppLog } from '../src/lib/appLog/browserLog.js';
import { landChatReply, mergeChatReply } from '../src/components/chat/landChatReply.js';

const QUESTION = 'Sam Example: what should we ship first?';
const OTHER = 'Pat Example: check the gate too.';
const ANSWER = 'Ship the chat merge first.';

function jsonResponse(body, status = 200) {
  return {
    ok: status < 400,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
  };
}

function Board({ box, initial, kind }) {
  const [win, setWin] = React.useState(initial);
  box.win = win;
  box.add = (message) => setWin((current) => ({ ...current, msgs: [...(current.msgs || []), message] }));
  const onUpdate = React.useCallback((patch) => {
    setWin((current) => ({ ...current, ...patch }));
  }, []);
  if (kind === 'group') return <GroupChatWindow win={win} onUpdate={onUpdate} />;
  return (
    <ChatWindow win={win} onUpdate={onUpdate} allWins={[]} canvasGroups={[]} currentProject={null} isActive />
  );
}

async function ask(text) {
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: text } });
  await act(async () => { fireEvent.click(screen.getByLabelText('Send message')); });
}

beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
});

afterEach(() => { delete global.fetch; });

describe('merge a reply onto the chat as it is now', () => {
  test('keeps a message written while the answer was on its way', () => {
    const started = [{ from: 'me', text: QUESTION, at: '1' }];
    const live = [...started, { from: 'me', text: OTHER, at: '2' }];
    const { msgs, kept } = mergeChatReply(live, started, { from: 'atlas', text: ANSWER, at: '3' });
    expect(kept).toBe(1);
    expect(msgs.map((m) => m.text)).toEqual([QUESTION, OTHER, ANSWER]);
  });

  test('keeps the question when the live chat has not caught up yet', () => {
    const started = [{ from: 'me', text: QUESTION, at: '1' }];
    const before = pendingAppLog().length;
    const setMsgs = (next) => next([]);
    landChatReply(setMsgs, started, { from: 'atlas', text: ANSWER, at: '3' }, 'win-quiet');
    expect(pendingAppLog().length).toBe(before);
  });

  test('logs the window and how many messages were kept, never the words', () => {
    const started = [{ from: 'me', text: QUESTION, at: '1' }];
    const live = [...started, { from: 'me', text: OTHER, at: '2' }];
    let stored = live;
    const setMsgs = (next) => { stored = next(stored); };
    landChatReply(setMsgs, started, [{ from: 'atlas', text: ANSWER }, { from: 'genesis', text: 'And the tests.' }], 'win-pure');
    expect(stored.map((m) => m.text)).toEqual([QUESTION, OTHER, ANSWER, 'And the tests.']);
    const line = pendingAppLog().find((entry) => entry.message.includes('win-pure'));
    expect(line).toMatchObject({
      level: 'info',
      where: 'chat',
      message: 'chat: reply landed in window win-pure, kept 1 message written meanwhile',
    });
    expect(line.message).not.toContain(QUESTION);
    expect(line.message).not.toContain(OTHER);
    expect(line.message).not.toContain(ANSWER);
  });
});

describe('one chat, two people', () => {
  test('a one-to-one chat keeps the question, the other message and the answer', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    global.fetch = jest.fn(async (url) => {
      if (String(url) === '/api/chat') {
        await gate;
        return jsonResponse({ text: ANSWER, tools: [] });
      }
      return jsonResponse([]);
    });
    const box = {};
    render(<Board box={box} kind="chat" initial={{ id: 'chat-sam-pat', kind: 'chat', agentId: 'atlas', msgs: [] }} />);
    await ask(QUESTION);
    expect(await screen.findByText(QUESTION)).toBeInTheDocument();

    await act(async () => { box.add({ from: 'me', text: OTHER, at: '2026-10-21T08:00:00Z' }); });
    expect(await screen.findByText(OTHER)).toBeInTheDocument();

    await act(async () => { release(); });
    expect(await screen.findByText(ANSWER)).toBeInTheDocument();
    expect(screen.getByText(QUESTION)).toBeInTheDocument();
    expect(screen.getByText(OTHER)).toBeInTheDocument();
    expect(box.win.msgs.map((m) => m.text)).toEqual([QUESTION, OTHER, ANSWER]);
    const line = pendingAppLog().find((entry) => entry.message.includes('chat-sam-pat'));
    expect(line.message).toBe('chat: reply landed in window chat-sam-pat, kept 1 message written meanwhile');
    expect(line.message).not.toContain(QUESTION);
  });

  test('a stopped reply keeps the message written meanwhile', async () => {
    global.fetch = jest.fn((url, init) => {
      if (String(url) !== '/api/chat') return Promise.resolve(jsonResponse([]));
      return new Promise((resolve, reject) => {
        const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        if (init?.signal?.aborted) { abort(); return; }
        init?.signal?.addEventListener('abort', abort, { once: true });
      });
    });
    const box = {};
    render(<Board box={box} kind="chat" initial={{ id: 'chat-stop', kind: 'chat', agentId: 'atlas', msgs: [] }} />);
    await ask(QUESTION);
    expect(await screen.findByLabelText('Stop reply')).toBeInTheDocument();
    await act(async () => { box.add({ from: 'me', text: OTHER, at: '2026-10-21T08:01:00Z' }); });
    expect(await screen.findByText(OTHER)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByLabelText('Stop reply')); });
    await waitFor(() => expect(box.win.msgs.map((m) => m.text)).toEqual([QUESTION, OTHER, '(stopped before replying)']));
    expect(box.win.msgs[2].stopped).toBe(true);
    expect(screen.getByText(QUESTION)).toBeInTheDocument();
    expect(screen.getByText(OTHER)).toBeInTheDocument();
    expect(screen.getByText('(stopped before replying)')).toBeInTheDocument();
  });

  test('a group chat keeps a message sent while the group is answering', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    global.fetch = jest.fn(async (url) => {
      if (String(url) === '/api/group-chat') {
        await gate;
        return jsonResponse({ replies: [{ agentId: 'atlas', text: ANSWER }] });
      }
      return jsonResponse([]);
    });
    const box = {};
    render(<Board box={box} kind="group" initial={{ id: 'group-sam-pat', members: ['atlas', 'genesis'], msgs: [] }} />);
    await ask(QUESTION);
    expect(await screen.findByText(QUESTION)).toBeInTheDocument();

    await act(async () => { box.add({ from: 'me', text: OTHER }); });
    expect(await screen.findByText(OTHER)).toBeInTheDocument();

    await act(async () => { release(); });
    expect(await screen.findByText(ANSWER)).toBeInTheDocument();
    expect(screen.getByText(QUESTION)).toBeInTheDocument();
    expect(screen.getByText(OTHER)).toBeInTheDocument();
    expect(box.win.msgs.map((m) => m.text)).toEqual([QUESTION, OTHER, ANSWER]);
    const line = pendingAppLog().find((entry) => entry.message.includes('group-sam-pat'));
    expect(line.message).toBe('chat: reply landed in window group-sam-pat, kept 1 message written meanwhile');
  });
});
