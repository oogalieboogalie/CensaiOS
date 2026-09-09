/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { useSettingsWindow } from '../src/app/hooks/useSettingsWindow.js';
import { CollaborationPresence } from '../src/components/CollaborationPresence.jsx';
import { normalizeSettingsTab, SETTINGS_TABS } from '../src/components/theme/settingsTabs.js';

test('settings use four plain-language sections', () => {
  expect(SETTINGS_TABS).toEqual([
    { id: 'appearance', label: 'Appearance' },
    { id: 'workspace', label: 'Canvas' },
    { id: 'sharing', label: 'Sharing' },
    { id: 'vault', label: 'AI keys' },
  ]);
  expect(normalizeSettingsTab('sharing')).toBe('sharing');
  expect(normalizeSettingsTab('unknown')).toBe('appearance');
});

test('live presence provides a direct route to sharing settings', () => {
  const onShare = jest.fn();
  render(
    <CollaborationPresence
      collaboration={{ status: 'live', participants: [] }}
      onShare={onShare}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));
  expect(onShare).toHaveBeenCalledTimes(1);
});

test('sharing reuses an existing Settings window and selects the requested tab', () => {
  const onUpdate = jest.fn();
  const setActiveId = jest.fn();
  const spawnAt = jest.fn();
  const { result } = renderHook(() => useSettingsWindow({
    wins: [{ id: 'settings-1', kind: 'appearance' }],
    spawnAt,
    setActiveId,
    onUpdate,
  }));

  act(() => result.current('sharing'));
  expect(onUpdate).toHaveBeenCalledWith('settings-1', expect.objectContaining({
    settingsTab: 'sharing', settingsRequestId: expect.any(String), title: 'Settings',
  }));
  expect(setActiveId).toHaveBeenCalledWith('settings-1');
  expect(spawnAt).not.toHaveBeenCalled();
});
