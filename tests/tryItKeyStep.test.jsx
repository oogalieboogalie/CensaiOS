/**
 * @jest-environment jsdom
 */
// The try-it board has no log file, so the warning is checked on logToApp.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';

const logToApp = jest.fn();
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({
  logToApp,
  installBrowserLog: () => {},
  flushAppLog: () => {},
  pendingAppLog: () => [],
  formatArgs: (args) => args.join(' '),
}));

const mockApi = {
  getUserKeys: jest.fn(),
  setUserKey: jest.fn(),
  deleteUserKey: jest.fn(),
  listShareLinks: jest.fn(),
  createShareLink: jest.fn(),
  revokeShareLink: jest.fn(),
};
jest.unstable_mockModule('../src/lib/api.js', () => ({ api: mockApi }));

const { VaultSection } = await import('../src/components/theme/VaultSection.jsx');
const { QuickSharePanel } = await import('../src/components/guest/QuickSharePanel.jsx');
const { demoResponse } = await import('../src/lib/demo/demoApi.js');
const { KEY_LIST_UNREADABLE } = await import('../src/components/theme/readKeyList.js');

const LINE = 'Keys need your own censaiOS.';

async function showKeys(answer) {
  mockApi.getUserKeys.mockReset();
  if (answer instanceof Error) mockApi.getUserKeys.mockRejectedValue(answer);
  else mockApi.getUserKeys.mockResolvedValue(answer);
  const view = render(React.createElement(VaultSection));
  expect(await screen.findByText('OpenAI')).toBeInTheDocument();
  expect(screen.getByText('Cohere')).toBeInTheDocument();
  expect(screen.getByText('Anthropic (Claude)')).toBeInTheDocument();
  expect(screen.queryByText('Loading AI provider keys...')).toBeNull();
  return view;
}

beforeEach(() => {
  logToApp.mockClear();
  delete globalThis.__censaiDemo;
});

describe('try-it AI keys step', () => {
  test('the key list renders with {}, [] and an error answer', async () => {
    const emptyObject = await showKeys({});
    expect(logToApp).toHaveBeenCalledWith('warn', KEY_LIST_UNREADABLE, { where: 'vault' });
    expect(screen.queryByText(LINE)).toBeNull();
    emptyObject.unmount();

    logToApp.mockClear();
    const emptyList = await showKeys([]);
    expect(logToApp).not.toHaveBeenCalled();
    emptyList.unmount();

    logToApp.mockClear();
    const errorAnswer = await showKeys(new Error('Could not load keys'));
    expect(screen.queryByText('Could not load keys')).toBeNull();
    expect(logToApp).toHaveBeenCalledWith('warn', KEY_LIST_UNREADABLE, { where: 'vault' });
    errorAnswer.unmount();
  });

  test('AI keys on the try-it board shows the providers and the plain line', async () => {
    globalThis.__censaiDemo = true;
    const view = await showKeys({});
    expect(screen.getByText(LINE)).toBeInTheDocument();
    expect(logToApp).toHaveBeenCalledWith('warn', KEY_LIST_UNREADABLE, { where: 'vault' });
    view.unmount();
  });

  test('Share on the try-it board shows the plain line instead of an error', async () => {
    globalThis.__censaiDemo = true;
    mockApi.listShareLinks.mockRejectedValue(Object.assign(new Error('Request failed (HTTP 501)'), { status: 501 }));
    render(React.createElement(QuickSharePanel, { workspaceId: 'demo-board', onClose: () => {} }));
    expect(await screen.findByText(LINE)).toBeInTheDocument();
    expect(screen.getByText('Share this board')).toBeInTheDocument();
    expect(screen.queryByText(/Request failed/)).toBeNull();
    expect(screen.queryByText(/501/)).toBeNull();
  });

  test('Share off the try-it board still reports a real error', async () => {
    mockApi.listShareLinks.mockRejectedValue(Object.assign(new Error('Only the board owner can share it.'), { status: 403 }));
    render(React.createElement(QuickSharePanel, { workspaceId: 'board-1', onClose: () => {} }));
    expect(await screen.findByText('Only the board owner can share it.')).toBeInTheDocument();
    expect(screen.queryByText(LINE)).toBeNull();
  });

  test('turning a request down logs the feature and nothing else', async () => {
    // jsdom has no Response. This stub only needs status and json().
    if (typeof globalThis.Response !== 'function') {
      globalThis.Response = class Response {
        constructor(body, init = {}) { this.status = init.status ?? 200; this.bodyText = body; }
        async json() { return JSON.parse(this.bodyText); }
      };
    }
    const res = await demoResponse('/api/keys?email=visitor@try.censai.app');
    // Still an empty answer, so every other try-it window keeps opening.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(logToApp).toHaveBeenCalledWith('warn', 'try-it board turned down keys', { where: 'try-it' });
    expect(JSON.stringify(logToApp.mock.calls)).not.toMatch(/visitor@/);
  });
});
