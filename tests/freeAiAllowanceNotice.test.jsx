/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { ChatWindow } from '../src/components/ChatWindow.jsx';
import { FreeAiAllowanceNotice } from '../src/components/chat/FreeAiAllowanceNotice.jsx';
import { getFreeAiAllowanceStatus } from '../src/lib/api/freeAiAllowance.js';
import { useWorkspaceStore } from '../src/lib/store.js';

const originalWorkspaceId = useWorkspaceStore.getState().workspaceId;

function response(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(payload),
  };
}

function enabledStatus({ remaining = 5, byok = false, shared = 32, minute = 7 } = {}) {
  return {
    enabled: true,
    provider: 'openrouter',
    model: 'openrouter/free',
    allowance: {
      user: { remaining, resetsAt: '2026-07-14T00:00:00.000Z' },
      shared: { remaining: shared, resetsAt: '2026-07-14T00:00:00.000Z' },
      minute: { remaining: minute, resetsAt: '2026-07-13T18:01:00.000Z' },
    },
    byok: { provider: 'openrouter', configured: byok },
  };
}

beforeEach(() => {
  global.fetch = jest.fn();
  act(() => useWorkspaceStore.setState({ workspaceId: null }));
});

afterEach(() => cleanup());

afterAll(() => {
  act(() => useWorkspaceStore.setState({ workspaceId: originalWorkspaceId }));
  delete global.fetch;
});

test('client and component refuse a missing workspace without fetching', async () => {
  await expect(getFreeAiAllowanceStatus(' ')).rejects.toMatchObject({
    code: 'workspace_required',
  });
  render(<FreeAiAllowanceNotice workspaceId={null} refreshKey={0} />);
  expect(screen.queryByTestId('free-ai-allowance')).not.toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
});

test('dark status renders nothing and scopes the request URL', async () => {
  global.fetch.mockResolvedValue(response({ enabled: false }));
  render(<FreeAiAllowanceNotice workspaceId="workspace / active" refreshKey={0} />);
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/ai/free-tier/status?workspaceId=workspace+%2F+active'
  ));
  await act(async () => {});
  expect(screen.queryByTestId('free-ai-allowance')).not.toBeInTheDocument();
});

test('shows effective requests, UTC reset, provider, model, and BYOK escape hatch', async () => {
  global.fetch.mockResolvedValue(response(enabledStatus()));
  render(<FreeAiAllowanceNotice workspaceId="workspace-active" refreshKey={0} />);

  const notice = await screen.findByTestId('free-ai-allowance');
  expect(notice).toHaveTextContent('5 free AI requests available');
  expect(notice).toHaveTextContent('Jul 14, 12:00 AM UTC');
  expect(notice).toHaveTextContent('OpenRouter · openrouter/free');
  expect(notice).toHaveTextContent('No OpenRouter key is saved for this account');
  expect(notice).toHaveTextContent('Add your OpenRouter key in Settings');
  expect(notice).not.toHaveTextContent('messages');
});

test('reports the exact-user OpenRouter key state without claiming it was used', async () => {
  global.fetch.mockResolvedValue(response(enabledStatus({ byok: true })));
  render(<FreeAiAllowanceNotice workspaceId="workspace-active" refreshKey={0} />);

  const notice = await screen.findByTestId('free-ai-allowance');
  expect(notice).toHaveTextContent('Your OpenRouter key is saved for this account');
  expect(notice).toHaveTextContent('5 free AI requests available');
});

test('zero allowance names the OpenRouter key Settings escape hatch', async () => {
  global.fetch.mockResolvedValue(response(enabledStatus({ remaining: 0 })));
  render(<FreeAiAllowanceNotice workspaceId="workspace-active" refreshKey={0} />);

  const notice = await screen.findByTestId('free-ai-allowance');
  expect(notice).toHaveTextContent('0 free AI requests left today');
  expect(notice).toHaveTextContent('Add an OpenRouter key in Settings to keep working');
  expect(notice).toHaveTextContent('Jul 14, 12:00 AM UTC');
});

test('does not overstate availability when the shared pool is exhausted', async () => {
  global.fetch.mockResolvedValue(response(enabledStatus({ shared: 0 })));
  render(<FreeAiAllowanceNotice workspaceId="workspace-active" refreshKey={0} />);

  const notice = await screen.findByTestId('free-ai-allowance');
  expect(notice).toHaveTextContent('Free AI is temporarily at capacity');
  expect(notice).not.toHaveTextContent('5 free AI requests available');
});

test.each([
  ['safe 503', () => Promise.resolve(response({ message: 'database password leaked' }, {
    ok: false,
    status: 503,
  }))],
  ['fetch failure', () => Promise.reject(new Error('socket internals leaked'))],
])('shows one compact honest notice for %s', async (_label, result) => {
  global.fetch.mockImplementation(result);
  render(<FreeAiAllowanceNotice workspaceId="workspace-active" refreshKey={0} />);

  const notice = await screen.findByTestId('free-ai-allowance');
  expect(notice).toHaveTextContent('Free AI allowance is temporarily unavailable.');
  expect(notice).not.toHaveTextContent(/password|socket|database/i);
});

test('discards an in-flight result from the previous workspace', async () => {
  let resolvePrevious;
  global.fetch
    .mockImplementationOnce(() => new Promise(resolve => { resolvePrevious = resolve; }))
    .mockResolvedValueOnce(response(enabledStatus({ remaining: 2 })));
  const { rerender } = render(
    <FreeAiAllowanceNotice workspaceId="workspace-previous" refreshKey={0} />
  );
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

  rerender(<FreeAiAllowanceNotice workspaceId="workspace-current" refreshKey={0} />);
  expect(await screen.findByText('2 free AI requests available')).toBeInTheDocument();
  await act(async () => resolvePrevious(response(enabledStatus({ remaining: 7 }))));
  expect(screen.queryByText('7 free AI requests available')).not.toBeInTheDocument();
});

test('refreshes after its settled-chat key changes', async () => {
  global.fetch
    .mockResolvedValueOnce(response(enabledStatus({ remaining: 5 })))
    .mockResolvedValueOnce(response(enabledStatus({ remaining: 4 })));
  const { rerender } = render(
    <FreeAiAllowanceNotice workspaceId="workspace-active" refreshKey={0} />
  );
  expect(await screen.findByText('5 free AI requests available')).toBeInTheDocument();

  rerender(<FreeAiAllowanceNotice workspaceId="workspace-active" refreshKey={1} />);
  expect(await screen.findByText('4 free AI requests available')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('ChatWindow places the allowance immediately above the input', async () => {
  act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-active' }));
  global.fetch.mockImplementation(url => {
    if (url.startsWith('/api/ai/free-tier/status')) {
      return Promise.resolve(response(enabledStatus()));
    }
    if (url.startsWith('/api/local-dev-restarts/notifications')) {
      return Promise.resolve(response([]));
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  render(<ChatWindow
    win={{ id: 'chat-one', agentId: 'censai', msgs: [] }}
    onUpdate={jest.fn()}
    allWins={[]}
    canvasGroups={[]}
    currentProject={null}
    isActive
  />);

  const notice = await screen.findByTestId('free-ai-allowance');
  const input = screen.getByLabelText('Message');
  expect(notice.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
