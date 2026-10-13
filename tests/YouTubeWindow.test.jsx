/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { YouTubeWindow } from '../src/components/YouTubeWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

beforeEach(() => {
  useWorkspaceStore.setState({ workspaceId: 'ws-yt-1' });
});

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

test('renders YouTubeWindow and loads a video from URL input', async () => {
  const onUpdate = jest.fn();
  const win = { id: 'yt-win-1', url: '' };

  await act(async () => {
    render(<YouTubeWindow win={win} onUpdate={onUpdate} />);
  });

  // Verify heading label, subtitle and empty state text
  expect(screen.getByText('YouTube')).toBeTruthy();
  expect(screen.getByText('Select Video')).toBeTruthy();
  expect(screen.getByText(/Paste a YouTube video, playlist, or shorts URL/i)).toBeTruthy();

  // Find URL input and type a valid YouTube URL
  const input = screen.getByPlaceholderText('https://www.youtube.com/watch?v=...');
  fireEvent.change(input, { target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } });

  // Click Load Video button
  const loadBtn = screen.getByRole('button', { name: 'Load Video' });
  await act(async () => {
    fireEvent.click(loadBtn);
  });

  // Verify onUpdate was called with parsed embed URL
  expect(onUpdate).toHaveBeenCalledWith({
    url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    youtubeTitle: expect.any(String),
  });
});
