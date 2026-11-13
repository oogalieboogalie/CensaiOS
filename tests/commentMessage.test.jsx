/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CommentPanel } from '../src/components/comments/CommentPanel.jsx';
import { useCommentStore } from '../src/lib/comments/commentStore.js';

const comment = {
  id: 'c1',
  body: 'Bonjour',
  author: { name: 'Marie', kind: 'user' },
  createdAt: '2026-11-02T15:00:00.000Z',
  translation: null,
};

beforeEach(() => {
  useCommentStore.setState({
    mode: 'member',
    workspaceId: 'board',
    comments: [comment],
    agents: [],
    canComment: true,
    status: 'ready',
    error: '',
    tool: false,
    panelOpen: true,
    openThreadId: 'c1',
    draft: null,
  });
});

test('the open comment shows Translate and both directions, then the translation', async () => {
  global.fetch = jest.fn(async (url, init) => {
    expect(String(url)).toBe('/api/workspaces/board/comments/c1/translate');
    expect(JSON.parse(init.body).pair).toBe('fr-en');
    return {
      ok: true,
      json: async () => ({
        comment: { ...comment, translation: { pair: 'fr-en', text: 'Hello' } },
      }),
    };
  });
  render(<CommentPanel />);
  expect(screen.getByRole('button', { name: 'EN → FR' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'FR → EN' }));
  fireEvent.click(screen.getByRole('button', { name: 'Translate' }));
  expect(await screen.findByTestId('comment-translation')).toHaveTextContent('Hello');
  expect(screen.getByText('Bonjour')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Hide translation' }));
  expect(screen.queryByTestId('comment-translation')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show translation' }));
  expect(screen.getByTestId('comment-translation')).toHaveTextContent('Hello');
});

test('a missing model key is shown on the comment', async () => {
  global.fetch = jest.fn(async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: 'No AI is set up yet. Add a key in Settings → Vault.', code: 'MODEL_KEY_MISSING' }),
  }));
  render(<CommentPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Translate' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/Settings → Vault/);
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
});

test('a guest translate call stays on the guest comments path', async () => {
  useCommentStore.setState({ mode: 'guest', workspaceId: 'board' });
  global.fetch = jest.fn(async (url) => {
    expect(String(url)).toBe('/api/guest/comments/c1/translate');
    return { ok: true, json: async () => ({ comment: { ...comment, translation: { pair: 'en-fr', text: 'Hello' } } }) };
  });
  render(<CommentPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Translate' }));
  expect(await screen.findByTestId('comment-translation')).toHaveTextContent('Hello');
});
