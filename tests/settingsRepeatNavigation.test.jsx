/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { api } from '../src/lib/api.js';
import { useSettingsWindow } from '../src/app/hooks/useSettingsWindow.js';
import { useThemePanel } from '../src/components/theme/useThemePanel.js';

test('repeating Share emits a fresh request even when the requested tab is unchanged', () => {
  const onUpdate = jest.fn();
  const { result } = renderHook(() => useSettingsWindow({
    wins: [{ id: 'settings-1', kind: 'appearance' }],
    spawnAt: jest.fn(),
    setActiveId: jest.fn(),
    onUpdate,
  }));

  act(() => {
    result.current('sharing');
    result.current('sharing');
  });
  const first = onUpdate.mock.calls[0][1].settingsRequestId;
  const second = onUpdate.mock.calls[1][1].settingsRequestId;
  expect(first).not.toBe(second);
});

test('a fresh request reselects Sharing after the user browses another settings tab', async () => {
  const presetRequest = jest.spyOn(api, 'getThemeCustomPresets').mockResolvedValue([]);
  const { result, rerender } = renderHook(
    ({ requestId }) => useThemePanel('sharing', requestId),
    { initialProps: { requestId: 'share-1' } },
  );

  act(() => result.current.setTab('workspace'));
  expect(result.current.tab).toBe('workspace');
  rerender({ requestId: 'share-2' });
  expect(result.current.tab).toBe('sharing');
  await waitFor(() => expect(presetRequest).toHaveBeenCalledTimes(1));
});
