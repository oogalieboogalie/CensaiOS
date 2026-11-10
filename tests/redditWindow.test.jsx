/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { RedditWindow } from '../src/components/windows/reddit/index.jsx';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { feedUrlFor } from '../shared/reddit/redditFeed.js';

if (typeof window.PointerEvent === 'undefined') window.PointerEvent = class PointerEvent extends MouseEvent {};

describe('Reddit window', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.__TAURI__;
    delete window.__TAURI_INTERNALS__;
  });

  test('is registered and listed under Media in the Add palette', () => {
    const manifest = WINDOW_MANIFESTS.find((m) => m.kind === 'reddit');
    expect(manifest).toMatchObject({
      label: 'Reddit',
      componentName: 'RedditWindow',
      embedMode: 'webview',
      defaultSize: { w: 420, h: 720 },
    });
    const media = buildAddSections({ manifests: WINDOW_MANIFESTS }).find((s) => s.label === 'Media');
    expect(media.items.some((i) => i.id === 'kind:reddit')).toBe(true);
  });

  test('web fallback loads a public feed and steps through posts', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        posts: [
          { id: 'p1', title: 'First', subreddit: 'pics', author: 'alma', score: 3, permalink: 'https://www.reddit.com/r/pics/comments/p1/', url: 'https://www.reddit.com/r/pics/comments/p1/', selftext: '', image: '', video: '', kind: 'link' },
          { id: 'p2', title: 'Second', subreddit: 'pics', author: 'alma', score: 9, permalink: 'https://www.reddit.com/r/pics/comments/p2/', url: 'https://www.reddit.com/r/pics/comments/p2/', selftext: '', image: '', video: '', kind: 'link' },
        ],
      }),
    }));
    await act(async () => {
      render(<RedditWindow win={{ id: 'r1', redditSource: { type: 'subreddit', subreddit: 'pics', sort: 'hot', name: 'r/pics' } }} onUpdate={jest.fn()} />);
    });
    expect(screen.getByTestId('reddit')).toHaveAttribute('data-mode', 'public');
    await waitFor(() => expect(screen.getByText('First')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next post' }));
    });
    expect(screen.getByText('Second')).toBeTruthy();
    expect(global.fetch.mock.calls[0][0]).toContain('/api/reddit/feed?');
  });

  test('category chips share a new source on the window', async () => {
    const onUpdate = jest.fn();
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ posts: [] }) }));
    await act(async () => {
      render(<RedditWindow win={{ id: 'r2' }} onUpdate={onUpdate} />);
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await act(async () => {
      fireEvent.click(screen.getByTestId('reddit-chips').querySelector('[data-category="science"]'));
    });
    expect(onUpdate).toHaveBeenCalledWith({
      redditSource: { type: 'subreddit', subreddit: 'science', sort: 'hot', name: 'r/science' },
    });
  });

  test('desktop native mode mounts the pane area for the feed URL', async () => {
    window.__TAURI__ = { core: { invoke: jest.fn(() => Promise.resolve()) } };
    await act(async () => {
      render(<RedditWindow win={{ id: 'r3', redditSource: { type: 'home', name: 'Home' } }} onUpdate={jest.fn()} />);
    });
    expect(screen.getByTestId('reddit')).toHaveAttribute('data-mode', 'native');
    expect(screen.getByTestId('reddit-native')).toBeTruthy();
    expect(feedUrlFor({ type: 'home' })).toBe('https://www.reddit.com/');
  });

  test('sources sheet accepts a typed subreddit', async () => {
    const onUpdate = jest.fn();
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ posts: [] }) }));
    await act(async () => {
      render(<RedditWindow win={{ id: 'r4' }} onUpdate={onUpdate} />);
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await act(async () => {
      fireEvent.click(screen.getByTitle('Choose feed'));
    });
    const input = await screen.findByLabelText('Subreddit or Reddit link');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'r/AskReddit' } });
      fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    });
    expect(onUpdate).toHaveBeenCalledWith({
      redditSource: { type: 'subreddit', subreddit: 'AskReddit', sort: 'hot', name: 'r/AskReddit' },
    });
  });

  test('shows the server block message instead of a blank feed', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        error: 'Reddit blocked the public feed from this server. Open the desktop app to view Reddit.',
        code: 'REDDIT_BLOCKED',
      }),
    }));
    await act(async () => {
      render(<RedditWindow win={{ id: 'r5', redditSource: { type: 'subreddit', subreddit: 'pics', sort: 'hot', name: 'r/pics' } }} onUpdate={jest.fn()} />);
    });
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('Reddit blocked the public feed from this server. Open the desktop app to view Reddit.');
    });
  });
});
