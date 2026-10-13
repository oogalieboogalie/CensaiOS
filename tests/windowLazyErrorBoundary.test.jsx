/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { WindowLazyErrorBoundary } from '../src/components/windows/WindowLazyErrorBoundary.jsx';

describe('WindowLazyErrorBoundary', () => {
  test('contains lazy window load failures inside the window body', async () => {
    const LazyBrokenWindow = React.lazy(() => Promise.reject(new Error('chunk unavailable')));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      React.createElement(
        WindowLazyErrorBoundary,
        { win: { id: 'w1', kind: 'agent' }, type: 'agent' },
        React.createElement(
          React.Suspense,
          { fallback: React.createElement('div', null, 'loading window...') },
          React.createElement(LazyBrokenWindow)
        )
      )
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not load agent');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('chunk unavailable');

    consoleError.mockRestore();
  });
});
