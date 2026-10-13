/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StreamWindow } from '../src/components/StreamWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

beforeEach(() => {
  useWorkspaceStore.setState({ wins: [] });
  global.fetch = jest.fn();
});

afterEach(cleanup);

describe('StreamWindow', () => {
  test('renders without throwing and displays title and preset options', () => {
    const win = { id: 'w-stream', kind: 'stream' };
    const onUpdate = jest.fn();

    render(<StreamWindow win={win} onUpdate={onUpdate} />);

    expect(screen.getByText('Stream Viewer')).toBeInTheDocument();
    expect(screen.getByText('Select a stream')).toBeInTheDocument();
    expect(screen.getByText('YouTube: Lofi Girl')).toBeInTheDocument();
  });

  test('clicking preset button calls onUpdate with stream src', () => {
    const win = { id: 'w-stream', kind: 'stream' };
    const onUpdate = jest.fn();

    render(<StreamWindow win={win} onUpdate={onUpdate} />);

    const presetBtn = screen.getByText('YouTube: Lofi Girl');
    fireEvent.click(presetBtn);

    expect(onUpdate).toHaveBeenCalledWith({
      src: 'https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1',
    });
  });

  test('entering URL and clicking Load Stream calls onUpdate with parsed stream URL', () => {
    const win = { id: 'w-stream', kind: 'stream' };
    const onUpdate = jest.fn();

    render(<StreamWindow win={win} onUpdate={onUpdate} />);

    const input = screen.getByPlaceholderText('Twitch or YouTube URL...');
    fireEvent.change(input, { target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } });

    const loadBtn = screen.getByRole('button', { name: 'Load Stream' });
    fireEvent.click(loadBtn);

    expect(onUpdate).toHaveBeenCalledWith({
      src: 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1',
    });
  });

  test('renders iframe and Close Stream button when stream is active', () => {
    const srcUrl = 'https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1';
    const win = { id: 'w-stream', kind: 'stream', src: srcUrl };
    const onUpdate = jest.fn();

    render(<StreamWindow win={win} onUpdate={onUpdate} />);

    expect(screen.getByText('Watching')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: /Close Stream/ });
    expect(closeBtn).toBeInTheDocument();

    fireEvent.click(closeBtn);
    expect(onUpdate).toHaveBeenCalledWith({ src: '' });
  });
});
