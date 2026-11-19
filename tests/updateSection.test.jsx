/**
 * @jest-environment jsdom
 */
// Settings > Canvas > Update censaiOS (src/components/theme/UpdateSection.jsx):
// the browser's way to ask for an update, the same panel the desktop tray opens.
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

const status = jest.fn();
jest.unstable_mockModule('../src/lib/appUpdate/api.js', () => ({ appUpdateApi: { status } }));

const { UpdateSection } = await import('../src/components/theme/UpdateSection.jsx');
const { TRAY_UPDATE_EVENT } = await import('../src/lib/appUpdate/trayFlow.js');

async function show() {
  render(<UpdateSection />);
  await act(async () => {});
}

describe('Settings: Update censaiOS', () => {
  test('shows the running version and opens the update panel', async () => {
    status.mockResolvedValue({ running: 'abcdef1234567890', watching: true });
    const heard = jest.fn();
    window.addEventListener(TRAY_UPDATE_EVENT, heard);
    await show();
    expect(screen.getByText('This computer runs version abcdef1.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check for an update' }));
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener(TRAY_UPDATE_EVENT, heard);
  });

  test('is not shown to someone who cannot update this copy', async () => {
    status.mockRejectedValue(Object.assign(new Error('no'), { status: 403 }));
    await show();
    expect(screen.queryByTestId('update-section')).toBeNull();
  });

  test('says so when the computer cannot be asked', async () => {
    status.mockRejectedValue(Object.assign(new Error('down'), { status: 500 }));
    await show();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not ask this computer about updates.');
  });

  test('is not shown on a copy that does not update itself', async () => {
    status.mockResolvedValue({ running: null, watching: false });
    await show();
    expect(screen.queryByTestId('update-section')).toBeNull();
  });
});
