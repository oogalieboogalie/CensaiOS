/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ImageWindow } from '../src/components/ImageWindow.jsx';

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({}),
    })
  );
});

afterEach(cleanup);

test('renders ImageWindow empty state when no file attached', async () => {
  const win = { id: 'w-img-empty', kind: 'image' };
  const onUpdate = jest.fn();

  await act(async () => {
    render(<ImageWindow win={win} onUpdate={onUpdate} />);
  });

  expect(screen.getByText('Image')).toBeInTheDocument();
  expect(screen.getByText('No picture yet')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open Files' })).toBeNull();
});

test('renders attached image and toggles fitMode on click', async () => {
  const win = { id: 'w-img-1', kind: 'image', fileName: 'arch.png', filePath: '/docs/arch.png', fitMode: 'fit' };
  const onUpdate = jest.fn();

  await act(async () => {
    render(<ImageWindow win={win} onUpdate={onUpdate} />);
  });

  expect(screen.getByText('arch.png')).toBeInTheDocument();
  const toggleBtn = screen.getByRole('button', { name: 'fit' });
  expect(toggleBtn).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(toggleBtn);
  });

  expect(onUpdate).toHaveBeenCalledWith({ fitMode: 'fill' });
  expect(screen.getByRole('button', { name: 'fill' })).toBeInTheDocument();
});

test('the empty state opens Files when the board can spawn windows', async () => {
  const onSpawn = jest.fn();
  await act(async () => {
    render(<ImageWindow win={{ id: 'w-img-open', kind: 'image' }} onUpdate={jest.fn()} onSpawn={onSpawn} />);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open Files' }));
  expect(onSpawn).toHaveBeenCalledWith('files');
});
