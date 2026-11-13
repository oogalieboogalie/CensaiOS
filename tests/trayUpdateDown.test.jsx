/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

const flow = {
  open: true,
  phase: 'shown',
  status: null,
  inFlight: null,
  error: '',
  updaterDown: false,
  waitFor: null,
  bringUpdaterUp: jest.fn(),
  close: jest.fn(),
  restart: jest.fn(),
  wait: jest.fn(),
  stopWaiting: jest.fn(),
};

jest.unstable_mockModule('../src/lib/appUpdate/useTrayUpdate.js', () => ({
  useTrayUpdate: () => flow,
}));

const { TrayUpdatePanel } = await import('../src/components/TrayUpdatePanel.jsx');

function shown(over) {
  Object.assign(flow, {
    open: true, phase: 'shown', status: null, inFlight: null, error: '', updaterDown: false, waitFor: null,
  }, over);
  flow.bringUpdaterUp.mockClear();
  flow.close.mockClear();
  return render(<TrayUpdatePanel />);
}

describe('the update panel when someone is still using censaiOS', () => {
  test('says the automatic install waits, and Update now stays', () => {
    shown({
      status: { ready: { commit: 'b'.repeat(40), changes: [] }, watching: true, inUse: true },
      inFlight: { changes: [], agents: [] },
    });
    expect(screen.getByText('Update ready, restarts when you are done')).toBeInTheDocument();
    expect(screen.getByText('Update now')).toBeInTheDocument();
  });
});

describe('the update panel when the updater is not running', () => {
  test('one button starts it', () => {
    shown({ updaterDown: true });
    expect(screen.getByText('The updater is not running.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('start-updater'));
    expect(flow.bringUpdaterUp).toHaveBeenCalled();
    expect(screen.queryByText('Restart now')).toBeNull();
    expect(screen.queryByText('Update now')).toBeNull();
  });

  test('any other problem still says what went wrong', () => {
    shown({ error: "You're signed out. Sign in again to update censaiOS." });
    expect(screen.getByRole('alert')).toHaveTextContent("You're signed out");
    expect(screen.queryByTestId('start-updater')).toBeNull();
    expect(screen.queryByText('censaiOS is up to date.')).toBeNull();
  });
});
