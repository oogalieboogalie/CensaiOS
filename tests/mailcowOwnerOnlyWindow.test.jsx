/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MailcowWindow } from '../src/components/MailcowWindow.jsx';
import { mailcowErrorText, readMailcowResult } from '../src/components/mailcow/mailcowResult.js';

// What a teammate who isn't this computer's owner sees in the Mailcow window:
// that Mailcow is set up and whose it is, not the server's raw errors, and
// the window never asks for the owner's lists.

const answer = (status, body) => ({ ok: status < 400, status, json: async () => body });

afterEach(() => { delete global.fetch; });

test('a teammate sees "owner only" and the window never asks for the lists', async () => {
  const fetchMock = jest.fn(async (url) => {
    if (url === '/api/mailcow/health') return answer(200, { configured: true, ownerOnly: true });
    throw new Error(`Unexpected fetch: ${url}`);
  });
  global.fetch = fetchMock;

  render(<MailcowWindow win={{ id: 'mailcow', title: 'Mailcow' }} onUpdate={jest.fn()} />);

  await waitFor(() => expect(screen.getByTestId('mailcow-owner-only')).toBeInTheDocument());
  expect(screen.getByText(/Only this computer's owner account can see and change/)).toBeInTheDocument();
  expect(screen.queryByText('Connection Failed')).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/mailcow/health']);
});

test("the server's owner-only refusal reads as plain words, not a raw error", async () => {
  const refusal = answer(403, { error: "Only this computer's owner can do this.", reason: 'owner-only', code: 'computer_owner_only' });
  const err = await readMailcowResult(refusal, { method: 'DELETE', path: '/api/mailcow/mailboxes' }).catch((e) => e);
  expect(err.status).toBe(403);
  expect(mailcowErrorText(err)).toBe("This needs this computer's owner account, and you're signed in with a different account.");
});

test('a refused delete is no longer taken for a success', async () => {
  await expect(readMailcowResult(answer(403, { error: 'no' }))).rejects.toThrow();
  await expect(readMailcowResult(answer(200, [{ type: 'error', msg: 'Mailcow said no' }]))).rejects.toThrow('Mailcow said no');
  await expect(readMailcowResult(answer(200, [{ type: 'success' }]))).resolves.toEqual([{ type: 'success' }]);
});
