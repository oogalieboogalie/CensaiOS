/** @jest-environment jsdom */
// Stream Viewer: links people actually paste (a YouTube live or Shorts link,
// a Twitch past broadcast, a channel link ending in "/") turn into a player.
import React from 'react';
import { jest } from '@jest/globals';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StreamWindow } from '../src/components/StreamWindow.jsx';

afterEach(cleanup);

function load(link) {
  const onUpdate = jest.fn();
  render(<StreamWindow win={{ id: 'w', kind: 'stream' }} onUpdate={onUpdate} />);
  fireEvent.change(screen.getByPlaceholderText('Twitch or YouTube URL...'), { target: { value: link } });
  fireEvent.click(screen.getByRole('button', { name: 'Load Stream' }));
  cleanup();
  return new URL(onUpdate.mock.calls[0][0].src);
}

test('YouTube live and Shorts links become the embed player', () => {
  expect(load('https://www.youtube.com/live/jfKfPfyJRdk?si=abc').pathname).toBe('/embed/jfKfPfyJRdk');
  expect(load('https://youtube.com/shorts/dQw4w9WgXcQ').pathname).toBe('/embed/dQw4w9WgXcQ');
});

test('Twitch channel with a trailing slash and a past broadcast', () => {
  expect(load('https://www.twitch.tv/xqc/').searchParams.get('channel')).toBe('xqc');
  const vod = load('https://www.twitch.tv/videos/2345678901');
  expect(vod.searchParams.get('video')).toBe('2345678901');
  expect(vod.searchParams.get('channel')).toBeNull();
});
