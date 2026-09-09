/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import {
  WORKSPACE_DRAFT_KEY,
  clearWorkspaceDraft,
  deleteWorkspaceAuthoritatively,
  loadWorkspaceAuthoritatively,
  saveWorkspaceAuthoritatively,
  writeWorkspaceDraft,
} from '../src/lib/api/workspaceAuthority.js';

const WORKSPACE_KEY = 'homebase.workspace.v1';

function response(status, body) {
  return { status, ok: status >= 200 && status < 300, json: jest.fn().mockResolvedValue(body) };
}

describe('server-authoritative workspace client', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn();
  });

  test('server value wins over a newer browser timestamp and refreshes the cache', async () => {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ wins: ['local'], updatedAt: '2099-01-01T00:00:00Z' }));
    fetch.mockResolvedValue(response(200, {
      value: { wins: ['server'], updatedAt: '2026-01-01T00:00:00Z' },
      workspaceId: 'workspace-1',
      revision: 7,
    }));

    await expect(loadWorkspaceAuthoritatively()).resolves.toEqual({
      status: 'ready',
      value: { wins: ['server'], updatedAt: '2026-01-01T00:00:00Z' },
      workspaceId: 'workspace-1',
      revision: 7,
    });
    expect(JSON.parse(localStorage.getItem(WORKSPACE_KEY)).wins).toEqual(['server']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('404 is empty only without recovery material', async () => {
    fetch.mockResolvedValueOnce(response(404, {}));
    await expect(loadWorkspaceAuthoritatively()).resolves.toEqual({
      status: 'ready', value: null, revision: 0, workspaceId: null,
    });

    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ wins: ['legacy'] }));
    fetch.mockResolvedValueOnce(response(404, {}));
    await expect(loadWorkspaceAuthoritatively()).resolves.toEqual(expect.objectContaining({
      status: 'restore_required', value: { wins: ['legacy'] }, revision: 0,
    }));
  });

  test('loads an explicitly shared workspace without mixing in another local cache', async () => {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ workspaceId: 'workspace-old', wins: ['old'] }));
    fetch.mockResolvedValue(response(200, {
      value: { workspaceId: 'workspace-shared', wins: ['shared'] },
      workspaceId: 'workspace-shared',
      revision: 3,
    }));

    await expect(loadWorkspaceAuthoritatively({ workspaceId: 'workspace-shared' }))
      .resolves.toMatchObject({
        status: 'ready', workspaceId: 'workspace-shared', revision: 3,
        value: { workspaceId: 'workspace-shared', wins: ['shared'] },
      });
    expect(fetch.mock.calls[0][0]).toContain('workspaceId=workspace-shared');
  });

  test('network failure never degrades into an empty workspace', async () => {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ wins: ['safe'] }));
    fetch.mockRejectedValue(new Error('offline'));
    const result = await loadWorkspaceAuthoritatively();
    expect(result).toEqual(expect.objectContaining({
      status: 'unavailable', cachedValue: { wins: ['safe'] },
    }));
    expect(result.error.message).toMatch(/could not be reached/i);
  });

  test('server timeout aborts into recovery instead of blank initialization', async () => {
    jest.useFakeTimers();
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ wins: ['timeout-safe'] }));
    fetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const pending = loadWorkspaceAuthoritatively({ timeoutMs: 25 });
    jest.advanceTimersByTime(25);
    await expect(pending).resolves.toEqual(expect.objectContaining({
      status: 'unavailable', cachedValue: { wins: ['timeout-safe'] },
    }));
    jest.useRealTimers();
  });

  test('an unequal draft pauses load until the user chooses', async () => {
    writeWorkspaceDraft({ wins: ['draft'] }, 2);
    fetch.mockResolvedValue(response(200, {
      value: { wins: ['server'] }, workspaceId: 'workspace-1', revision: 3,
    }));
    await expect(loadWorkspaceAuthoritatively()).resolves.toEqual(expect.objectContaining({
      status: 'draft_required',
      value: { wins: ['server'] },
      draft: expect.objectContaining({ value: { wins: ['draft'] }, baseRevision: 2 }),
      revision: 3,
    }));
  });

  test('save sends the expected revision and clears the separate draft only on success', async () => {
    writeWorkspaceDraft({ wins: ['draft'] }, 4);
    fetch.mockResolvedValue(response(200, { ok: true, workspaceId: 'workspace-1', revision: 5 }));
    const saved = await saveWorkspaceAuthoritatively({ wins: ['next'] }, 4);
    const request = JSON.parse(fetch.mock.calls[0][1].body);
    expect(request.expectedRevision).toBe(4);
    expect(request.value.wins).toEqual(['next']);
    expect(saved.revision).toBe(5);
    expect(localStorage.getItem(WORKSPACE_DRAFT_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(WORKSPACE_KEY)).wins).toEqual(['next']);
  });

  test('conflict is typed and preserves recovery state', async () => {
    writeWorkspaceDraft({ wins: ['mine'] }, 4);
    fetch.mockResolvedValue(response(409, { error: 'Workspace changed since it was loaded' }));
    await expect(saveWorkspaceAuthoritatively({ wins: ['mine'] }, 4)).rejects.toMatchObject({
      code: 'workspace_revision_conflict', status: 409,
    });
    expect(JSON.parse(localStorage.getItem(WORKSPACE_DRAFT_KEY)).value).toEqual({ wins: ['mine'] });
    clearWorkspaceDraft();
  });

  test('reset clears recovery only after a matching server revision', async () => {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ wins: ['safe'] }));
    writeWorkspaceDraft({ wins: ['draft'] }, 2);
    fetch.mockResolvedValueOnce(response(409, { error: 'Workspace changed since it was loaded' }));
    await expect(deleteWorkspaceAuthoritatively(2)).rejects.toMatchObject({
      code: 'workspace_revision_conflict',
    });
    expect(localStorage.getItem(WORKSPACE_KEY)).not.toBeNull();
    expect(localStorage.getItem(WORKSPACE_DRAFT_KEY)).not.toBeNull();

    fetch.mockResolvedValueOnce(response(200, { ok: true, removed: true, revision: 3 }));
    await expect(deleteWorkspaceAuthoritatively(3)).resolves.toMatchObject({ removed: true });
    expect(localStorage.getItem(WORKSPACE_KEY)).toBeNull();
    expect(localStorage.getItem(WORKSPACE_DRAFT_KEY)).toBeNull();
  });
});
