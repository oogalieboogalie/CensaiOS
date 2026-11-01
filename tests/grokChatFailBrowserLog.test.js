/** @jest-environment jsdom */
// When a Grok chat on someone's own Grok sign-in fails, the board's own lines
// for it in the app log keep the error's code, never Grok's words, which the
// chat shows the person (src/lib/chat/grokSignin.js), and the same goes for
// the sign-in's own lines (src/components/chat/useGrokSource.js). The folder,
// words and code are made up.
import { TextDecoder, TextEncoder } from 'util';
import { jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';

if (!global.TextDecoder) global.TextDecoder = TextDecoder;

const logToApp = jest.fn();
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({ logFailure: () => {}, logToApp }));
const { sendGrokSigninMessage } = await import('../src/lib/chat/grokSignin.js');
const { useGrokSource } = await import('../src/components/chat/useGrokSource.js');

const GROK_WORDS = 'Grok stopped: Made-up trouble reading /home/made-up-person/made-up-plans/notes.txt';

function answers(res) {
  global.fetch = jest.fn(async () => res);
}
function stream(lines) {
  const bytes = new TextEncoder().encode(lines.map((l) => JSON.stringify(l)).join('\n'));
  let done = false;
  return {
    ok: true,
    headers: { get: () => 'application/x-ndjson' },
    body: { getReader: () => ({ read: async () => (done ? { done: true } : ((done = true), { done: false, value: bytes })) }) },
  };
}

beforeEach(() => logToApp.mockClear());

test("a failed turn's line in the app log keeps its code, and the chat still gets Grok's words", async () => {
  answers(stream([{ type: 'error', error: { message: GROK_WORDS, code: 'GROK_CHAT_FAILED' } }]));
  await expect(sendGrokSigninMessage([{ from: 'me', text: 'Made-up question' }]))
    .rejects.toMatchObject({ code: 'GROK_CHAT_FAILED', message: GROK_WORDS });
  expect(logToApp).toHaveBeenCalledWith('warn', 'Grok sign-in chat failed: GROK_CHAT_FAILED', { detail: '' });
  expect(JSON.stringify(logToApp.mock.calls)).not.toMatch(/made-up-plans|Made-up trouble/);
});

test('a refused turn is logged with its status, not the words the server answered', async () => {
  answers({
    ok: false,
    status: 409,
    headers: { get: () => 'application/json' },
    json: async () => ({ error: GROK_WORDS, code: 'GROK_SIGNIN_REQUIRED' }),
  });
  await expect(sendGrokSigninMessage([{ from: 'me', text: 'Made-up question' }]))
    .rejects.toMatchObject({ code: 'GROK_SIGNIN_REQUIRED' });
  expect(logToApp).toHaveBeenCalledWith('warn', 'Grok sign-in chat failed: GROK_SIGNIN_REQUIRED', { detail: 'status 409' });
  expect(JSON.stringify(logToApp.mock.calls)).not.toMatch(/made-up-plans|Made-up trouble/);
});

test("the Grok sign-in's own lines in the app log keep codes and counts, never what Grok printed", async () => {
  const TROUBLE = 'Made-up trouble in /home/made-up-person/made-up-plans';
  const PRINTED = ['Made-up words from Grok at /home/made-up-person/made-up-plans', 'Made-up code: WXYZ-0000'];
  const answer = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const server = {
    status: answer(500, { error: TROUBLE, code: 'GROK_STATUS_FAILED' }),
    login: answer(200, { login: { running: true, url: null, lines: PRINTED } }),
    logout: answer(500, { error: TROUBLE }),
  };
  global.fetch = jest.fn(async (url) => server[url.split('/').pop()]);
  const { result, unmount } = renderHook(() => useGrokSource({ win: { id: 'made-up-window' }, onUpdate: () => {}, provider: 'xai' }));
  await waitFor(() => expect(logToApp).toHaveBeenCalledWith('warn', 'Grok sign-in status could not be read', { detail: 'GROK_STATUS_FAILED' }));
  // Grok printed no link yet: the log counts its lines.
  await act(async () => { await result.current.signIn(); });
  expect(logToApp).toHaveBeenCalledWith('warn', 'Grok sign-in printed no link yet', { detail: '2 lines' });
  // A refused sign-in: the person reads the words, the log keeps the code.
  server.login = answer(500, { error: TROUBLE, code: 'GROK_LOGIN_FAILED' });
  await act(async () => { await result.current.signIn(); });
  expect(result.current.error).toBe(TROUBLE);
  expect(logToApp).toHaveBeenCalledWith('warn', 'Grok sign-in could not start', { detail: 'GROK_LOGIN_FAILED' });
  await act(async () => { await result.current.signOut(); });
  expect(logToApp).toHaveBeenCalledWith('warn', 'Grok sign-out failed', { detail: 'Error' });
  unmount();
  expect(JSON.stringify(logToApp.mock.calls)).not.toMatch(/made-up-plans|Made-up words|WXYZ-0000/);
});
