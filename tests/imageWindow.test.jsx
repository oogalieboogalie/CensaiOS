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
  expect(screen.getByText('No image file attached.')).toBeInTheDocument();
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
