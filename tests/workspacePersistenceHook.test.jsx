/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { jest } from '@jest/globals';

const persistWorkspaceWithPrewarm = jest.fn();
const writeWorkspaceDraft = jest.fn();
const clearWorkspaceDraft = jest.fn();
const downloadWorkspaceSnapshot = jest.fn();

jest.unstable_mockModule('../src/lib/projectPrewarm.js', () => ({ persistWorkspaceWithPrewarm }));
jest.unstable_mockModule('../src/lib/api/workspaceAuthority.js', () => ({
  clearWorkspaceDraft, writeWorkspaceDraft,
}));
jest.unstable_mockModule('../src/lib/api.js', () => ({
  api: { downloadWorkspaceSnapshot },
}));

const { useWorkspacePersistence } = await import('../src/app/hooks/useWorkspacePersistence.js');

describe('workspace autosave revision boundary', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => jest.useRealTimers());

  test('does not save the unchanged boot payload, then drafts and saves the first edit', async () => {
    persistWorkspaceWithPrewarm.mockResolvedValue({ revision: 3 });
    const onRevision = jest.fn();
    const { rerender, result } = renderHook(
      ({ workspace }) => useWorkspacePersistence({
        enabled: true, workspace, revision: 2, onRevision,
      }),
      { initialProps: { workspace: { wins: [] } } },
    );

    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(persistWorkspaceWithPrewarm).not.toHaveBeenCalled();

    rerender({ workspace: { wins: [{ id: 'one' }] } });
    expect(writeWorkspaceDraft).toHaveBeenCalledWith({ wins: [{ id: 'one' }] }, 2);
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(persistWorkspaceWithPrewarm).toHaveBeenCalledWith(expect.objectContaining({
      workspace: { wins: [{ id: 'one' }] }, expectedRevision: 2,
    }));
    expect(onRevision).toHaveBeenCalledWith(3);
    expect(result.current.status).toBe('saved');
  });

  test('conflict blocks silent retries and keeps explicit recovery actions', async () => {
    persistWorkspaceWithPrewarm.mockRejectedValue(Object.assign(new Error('Workspace changed'), {
      code: 'workspace_revision_conflict',
    }));
    const { rerender, result } = renderHook(
      ({ workspace }) => useWorkspacePersistence({
        enabled: true, workspace, revision: 4, onRevision: jest.fn(),
      }),
      { initialProps: { workspace: { wins: [] } } },
    );
    rerender({ workspace: { wins: [{ id: 'mine' }] } });
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(result.current.status).toBe('conflict');
    expect(persistWorkspaceWithPrewarm).toHaveBeenCalledTimes(1);

    rerender({ workspace: { wins: [{ id: 'mine' }, { id: 'later' }] } });
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(persistWorkspaceWithPrewarm).toHaveBeenCalledTimes(1);
    act(() => result.current.download());
    expect(downloadWorkspaceSnapshot).toHaveBeenCalledWith(
      { wins: [{ id: 'mine' }, { id: 'later' }] }, 'draft',
    );
  });

  test('a non-conflict failure degrades and retries in the background', async () => {
    persistWorkspaceWithPrewarm
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ revision: 6 });
    const onRevision = jest.fn();
    const { rerender, result } = renderHook(
      ({ workspace }) => useWorkspacePersistence({
        enabled: true, workspace, revision: 5, onRevision,
      }),
      { initialProps: { workspace: { wins: [] } } },
    );
    rerender({ workspace: { wins: [{ id: 'retry' }] } });
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
    });
    // No fullscreen, no block: degraded with the draft preserved locally.
    expect(result.current.status).toBe('degraded');
    expect(persistWorkspaceWithPrewarm).toHaveBeenCalledTimes(1);
    // First backoff rung (5s) retries on its own and recovers.
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(persistWorkspaceWithPrewarm).toHaveBeenCalledTimes(2);
    expect(onRevision).toHaveBeenCalledWith(6);
    expect(result.current.status).toBe('saved');
  });

  test('manual retry fires immediately and backoff continues on repeat failure', async () => {
    persistWorkspaceWithPrewarm.mockRejectedValue(new Error('still offline'));
    const { rerender, result } = renderHook(
      ({ workspace }) => useWorkspacePersistence({
        enabled: true, workspace, revision: 5, onRevision: jest.fn(),
      }),
      { initialProps: { workspace: { wins: [] } } },
    );
    rerender({ workspace: { wins: [{ id: 'retry' }] } });
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe('degraded');
    await act(async () => {
      result.current.retry();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(persistWorkspaceWithPrewarm).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('degraded');
    // Backoff was rescheduled after the manual attempt failed too.
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(persistWorkspaceWithPrewarm).toHaveBeenCalledTimes(3);
  });

  test('adopts an idle remote revision as the baseline without echo-saving it', async () => {
    const onRevision = jest.fn();
    const { rerender, result } = renderHook(
      ({ workspace }) => useWorkspacePersistence({
        enabled: true, workspace, revision: 1, onRevision,
      }),
      { initialProps: { workspace: { wins: [{ id: 'old' }] } } },
    );

    act(() => {
      expect(result.current.adoptExternal({ wins: [{ id: 'remote' }] }, 2)).toBe(true);
    });
    rerender({ workspace: { wins: [{ id: 'remote' }] } });
    await act(async () => { jest.advanceTimersByTime(2000); });

    expect(onRevision).toHaveBeenCalledWith(2);
    expect(clearWorkspaceDraft).toHaveBeenCalled();
    expect(persistWorkspaceWithPrewarm).not.toHaveBeenCalled();
    expect(result.current.status).toBe('saved');
  });

  test('refuses a remote revision while local edits are unsaved', () => {
    const { rerender, result } = renderHook(
      ({ workspace }) => useWorkspacePersistence({
        enabled: true, workspace, revision: 1, onRevision: jest.fn(),
      }),
      { initialProps: { workspace: { wins: [] } } },
    );
    rerender({ workspace: { wins: [{ id: 'local' }] } });
    act(() => {
      expect(result.current.adoptExternal({ wins: [{ id: 'remote' }] }, 2)).toBe(false);
    });
    expect(result.current.status).toBe('conflict');
  });
});
