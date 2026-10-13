/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

const getProjects = jest.fn().mockResolvedValue([]);
jest.unstable_mockModule('../src/lib/api.js', () => ({ api: { getProjects } }));

const { Chrome } = await import('../src/components/Chrome.jsx');
const { WindowStyleMenu } = await import('../src/components/windows/WindowStyleMenu.jsx');

test('the main file menu closes with Escape', () => {
  render(<Chrome onSpawn={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'File menu' }));
  expect(screen.getByText('Untitled')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByText('Untitled')).toBeNull();
});

test('the window style popover closes with Escape', () => {
  const onClose = jest.fn();
  render(<WindowStyleMenu
    win={{}}
    theme={{ hue: 220 }}
    onUpdate={jest.fn()}
    onClose={onClose}
    colorMenuRef={{ current: null }}
  />);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});
