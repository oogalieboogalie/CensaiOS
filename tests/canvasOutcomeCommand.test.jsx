/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { EmptyState } from '../src/components/canvas/CanvasEmptyState.jsx';

test('the primary outcome command opens Censai and begins the request immediately', () => {
  const onSpawn = jest.fn();
  render(<EmptyState onSpawn={onSpawn} />);
  fireEvent.change(screen.getByPlaceholderText('Tell Censai what you want done…'), {
    target: { value: 'Ship the beta onboarding flow' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Start with Censai' }));
  expect(onSpawn).toHaveBeenCalledWith('chat', {
    agentId: 'censai',
    msgs: [{
      from: 'me',
      text: expect.stringContaining('Ship the beta onboarding flow'),
    }],
    autoSend: true,
  });
});
