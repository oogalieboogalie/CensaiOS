/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { resetWorkspaceAndReload } from '../src/components/theme/workspaceReset.js';

describe('appearance workspace reset', () => {
  test('passes the loaded revision and reloads only after deletion succeeds', async () => {
    const resetWorkspace = jest.fn().mockResolvedValue({ ok: true, removed: true });
    const reload = jest.fn();

    await resetWorkspaceAndReload({
      expectedRevision: 12,
      resetWorkspace,
      reload,
    });

    expect(resetWorkspace).toHaveBeenCalledWith(12);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('does not reload when authoritative deletion fails', async () => {
    const failure = new Error('Workspace changed since it was loaded');
    const resetWorkspace = jest.fn().mockRejectedValue(failure);
    const reload = jest.fn();

    await expect(resetWorkspaceAndReload({
      expectedRevision: 12,
      resetWorkspace,
      reload,
    })).rejects.toBe(failure);

    expect(reload).not.toHaveBeenCalled();
  });
});
