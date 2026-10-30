/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// A Grok chat can run on the person's own Grok sign-in (their SuperGrok or
// Grok Heavy plan) instead of their xAI API key.
import React from 'react';
import { TextDecoder, TextEncoder } from 'util';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

if (!global.TextDecoder) global.TextDecoder = TextDecoder;

const { GrokSourceBar } = await import('../src/components/chat/GrokSourceBar.jsx');
const { useGrokSource } = await import('../src/components/chat/useGrokSource.js');
const { sendGrokSigninMessage, isGrokChat } = await import('../src/lib/chat/grokSignin.js');

function ndjson(lines) {
  const bytes = new TextEncoder().encode(lines.map((l) => JSON.stringify(l)).join('\n'));
  let done = false;
  return {
    ok: true,
    headers: { get: () => 'application/x-ndjson' },
    body: { getReader: () => ({ read: async () => (done ? { done: true } : ((done = true), { done: false, value: bytes })) }) },
  };
}

function mockServer({ installed = true, signedIn = false, login = null } = {}) {
  const calls = [];
  global.fetch = jest.fn(async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    if (url.endsWith('/status')) return { ok: true, json: async () => ({ installed, signedIn, login: null }) };
    if (url.endsWith('/login')) return { ok: true, json: async () => ({ login }) };
    if (url.endsWith('/chat')) {
      return ndjson([
        { type: 'delta', text: 'Hello from ' },
        { type: 'delta', text: 'your plan.' },
        { type: 'result', text: 'Hello from your plan.', grokSessionId: 'sess-42' },
      ]);
    }
    return { ok: true, json: async () => ({}) };
  });
  return calls;
}

let hook = null;
function Harness({ win, onUpdate, provider = 'xai' }) {
  hook = useGrokSource({ win, onUpdate, provider });
  return <GrokSourceBar grok={hook} />;
}

beforeEach(() => { hook = null; });

test('only Grok chats get the choice', () => {
  expect(isGrokChat('xai')).toBe(true);
  expect(isGrokChat('grok')).toBe(true);
  expect(isGrokChat('anthropic')).toBe(false);
});

test('signed out, the key is used until the person picks their sign-in', async () => {
  mockServer({ signedIn: false });
  const onUpdate = jest.fn();
  render(<Harness win={{ id: 'w1' }} onUpdate={onUpdate} />);
  await waitFor(() => expect(screen.getByRole('radio', { name: 'xAI key' })).toHaveAttribute('aria-checked', 'true'));
  expect(hook.sendVia).toBeNull();
  fireEvent.click(screen.getByRole('radio', { name: 'My Grok sign-in' }));
  expect(onUpdate).toHaveBeenCalledWith({ grokVia: 'signin', grokSessionId: null });
});

// The link xAI's `grok login --device-auth` (1.0.70) prints has the code in it
// already, and the page it opens only asks to confirm the code
// (tests/fixtures/cli-agents/standin-grok.mjs prints the same).
const LINK_WITH_CODE = 'https://accounts.x.ai/oauth2/device?user_code=WXYZ-4821';
const APPROVE = 'Approve with your Grok account. This box changes by itself when you are in.';
const steps = () => screen.getAllByRole('listitem').map((li) => li.textContent);

test('sign in shows the link and code from xAI\'s sign-in', async () => {
  const calls = mockServer({ signedIn: false, login: { running: true, url: 'https://accounts.x.ai/device', code: 'WXYZ-4821', lines: [] } });
  render(<Harness win={{ id: 'w1', grokVia: 'signin' }} onUpdate={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in to Grok' }));
  expect(await screen.findByRole('link', { name: 'https://accounts.x.ai/device' })).toHaveAttribute('target', '_blank');
  expect(screen.getByText('WXYZ-4821')).toBeInTheDocument();
  // A link without the code in it: the code has to be typed in on the page.
  expect(steps()).toEqual(['Open https://accounts.x.ai/device', 'Enter this code: WXYZ-4821', APPROVE]);
  expect(calls.some((c) => c.url.endsWith('/login') && c.method === 'POST')).toBe(true);
});

test('a link with the code in it asks to check the code on the page, not to type it', async () => {
  mockServer({ signedIn: false, login: { running: true, url: LINK_WITH_CODE, code: 'WXYZ-4821', lines: [] } });
  render(<Harness win={{ id: 'w1', grokVia: 'signin' }} onUpdate={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in to Grok' }));
  expect(await screen.findByRole('link', { name: LINK_WITH_CODE })).toHaveAttribute('href', LINK_WITH_CODE);
  expect(steps()).toEqual([`Open ${LINK_WITH_CODE}`, 'Check that the page shows this code: WXYZ-4821', APPROVE]);
  expect(screen.queryByText(/Enter this code/)).toBeNull();
});

test('the code shows once Grok prints it, and the box changes by itself once approved', async () => {
  jest.useFakeTimers();
  try {
    // A sign-in already under way (this chat was opened again meanwhile):
    // Grok has printed a link without the code, and prints the code later.
    const link = 'https://accounts.x.ai/oauth2/device';
    let server = { signedIn: false, login: { running: true, url: link, code: null, lines: [] } };
    global.fetch = jest.fn(async (url) => ({ ok: true, json: async () => (url.endsWith('/status') ? { installed: true, ...server } : {}) }));
    render(<Harness win={{ id: 'w1', grokVia: 'signin' }} onUpdate={jest.fn()} />);
    await screen.findByTestId('grok-signin-waiting');
    expect(steps()).toEqual([`Open ${link}`, APPROVE]);

    server = { ...server, login: { ...server.login, code: 'WXYZ-4821' } };
    await waitFor(() => expect(steps()).toEqual([`Open ${link}`, 'Enter this code: WXYZ-4821', APPROVE]), { timeout: 5000 });

    server = { signedIn: true, login: { ...server.login, running: false, ok: true } };
    await waitFor(() => expect(screen.getByText(/no API cost/)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.queryByTestId('grok-signin-waiting')).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('not installed says so and points to the key meanwhile', async () => {
  mockServer({ installed: false });
  render(<Harness win={{ id: 'w1', grokVia: 'signin' }} onUpdate={jest.fn()} />);
  expect(await screen.findByTestId('grok-not-installed')).toHaveTextContent(/pick "xAI key"/);
});

test('signed in, chats go through the sign-in and keep Grok\'s conversation', async () => {
  const calls = mockServer({ signedIn: true });
  const onUpdate = jest.fn();
  render(<Harness win={{ id: 'w1', grokSessionId: 'sess-41' }} onUpdate={onUpdate} />);
  await waitFor(() => expect(screen.getByRole('radio', { name: 'My Grok sign-in' })).toHaveAttribute('aria-checked', 'true'));
  expect(screen.getByText(/no API cost/)).toBeInTheDocument();
  const deltas = [];
  let reply;
  await act(async () => {
    reply = await hook.sendVia('agent-1', [{ from: 'me', text: 'Hi' }, { from: 'agent-1', text: 'Hey' }, { from: 'me', text: 'Plan?' }], { onDelta: (t) => deltas.push(t) });
  });
  expect(reply.text).toBe('Hello from your plan.');
  expect(deltas.join('')).toBe('Hello from your plan.');
  expect(onUpdate).toHaveBeenCalledWith({ grokSessionId: 'sess-42' });
  const sent = calls.find((c) => c.url.endsWith('/chat')).body;
  expect(sent).toEqual({ text: 'Plan?', sessionId: 'sess-41', history: [{ from: 'me', text: 'Hi' }, { from: 'agent', text: 'Hey' }] });
});

test('files stay on the key route for now', async () => {
  await expect(sendGrokSigninMessage([{ from: 'me', text: 'look', attachments: [{ name: 'a.png' }] }]))
    .rejects.toMatchObject({ code: 'GROK_TEXT_ONLY' });
});
