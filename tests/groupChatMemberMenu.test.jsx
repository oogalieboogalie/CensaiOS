/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { GroupChatWindow } from '../src/components/GroupChatWindow.jsx';

test('member editor toggles and dismisses from outside or Escape', () => {
  render(<GroupChatWindow win={{ id: 'group-chat', members: ['architect'] }} onUpdate={jest.fn()} />);
  const trigger = screen.getByRole('button', { name: 'Edit' });

  fireEvent.click(trigger);
  expect(screen.getByRole('menu')).toBeInTheDocument();
  fireEvent.click(trigger);
  expect(screen.queryByRole('menu')).toBeNull();

  fireEvent.click(trigger);
  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole('menu')).toBeNull();

  fireEvent.click(trigger);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
});
