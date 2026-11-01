/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import {
  clearWorkspaceDraft,
  deleteWorkspaceAuthoritatively,
  loadWorkspaceAuthoritatively,
  readWorkspaceDraft,
  saveWorkspaceAuthoritatively,
  workspaceDraftKey,
  writeWorkspaceDraft,
} from '../src/lib/api/workspaceAuthority.js';

const WORKSPACE_KEY = 'homebase.workspace.v1';
const DRAFT_KEY = workspaceDraftKey('workspace-1');
const draftOf = (workspaceId) => JSON.parse(localStorage.getItem(workspaceDraftKey(workspaceId)));

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

  test('404 adopts the server workspace id instead of leaving the client to mint one', async () => {
    fetch.mockResolvedValueOnce(response(404, { value: null, workspaceId: 'user-1-default', revision: 0 }));
    await expect(loadWorkspaceAuthoritatively()).resolves.toEqual({
      status: 'ready', value: null, revision: 0, workspaceId: 'user-1-default',
    });

    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ wins: ['legacy'] }));
    fetch.mockResolvedValueOnce(response(404, { value: null, workspaceId: 'user-1-default', revision: 0 }));
    await expect(loadWorkspaceAuthoritatively()).resolves.toEqual(expect.objectContaining({
      status: 'restore_required', workspaceId: 'user-1-default',
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
    writeWorkspaceDraft({ workspaceId: 'workspace-1', wins: ['draft'] }, 2);
    fetch.mockResolvedValue(response(200, {
      value: { wins: ['server'] }, workspaceId: 'workspace-1', revision: 3,
    }));
    await expect(loadWorkspaceAuthoritatively()).resolves.toEqual(expect.objectContaining({
      status: 'draft_required',
      value: { wins: ['server'] },
      draft: expect.objectContaining({ value: { workspaceId: 'workspace-1', wins: ['draft'] }, baseRevision: 2 }),
      revision: 3,
    }));
    // Still kept: reloading again without choosing offers it again.
    expect(draftOf('workspace-1').value.wins).toEqual(['draft']);
  });

  test('a draft equal to the server copy holds nothing new: it is dropped and the board loads', async () => {
    writeWorkspaceDraft({ workspaceId: 'workspace-1', wins: [{ id: 'a', kind: 'chat', x: 1 }], penColor: 'red' }, 2);
    // The server keeps its own key order (jsonb) and stamps each save.
    fetch.mockResolvedValue(response(200, {
      value: { updatedAt: '2026-10-29T07:00:00.000Z', wins: [{ x: 1, id: 'a', kind: 'chat' }], penColor: 'red', workspaceId: 'workspace-1' },
      workspaceId: 'workspace-1',
      revision: 3,
    }));
    await expect(loadWorkspaceAuthoritatively()).resolves.toMatchObject({ status: 'ready', revision: 3 });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  test('a draft of settings alone goes once the server has them, however far behind its copy of the board is', async () => {
    writeWorkspaceDraft({
      workspaceId: 'workspace-1', wins: [], penColor: 'blue', groups: [{ id: 'g', label: 'Work' }],
    }, 2, { board: false });
    expect(draftOf('workspace-1').board).toBe(false);
    fetch.mockResolvedValue(response(200, {
      value: { groups: [{ label: 'Work', id: 'g' }], penColor: 'blue', updatedAt: '2026-10-29T07:00:00.000Z', wins: [{ id: 'closed a moment ago' }] },
      workspaceId: 'workspace-1',
      revision: 3,
    }));
    await expect(loadWorkspaceAuthoritatively()).resolves.toMatchObject({ status: 'ready' });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  test('a draft of settings the server never got is offered back', async () => {
    writeWorkspaceDraft({ workspaceId: 'workspace-1', wins: [], penColor: 'blue' }, 2, { board: false });
    fetch.mockResolvedValue(response(200, {
      value: { penColor: 'red', wins: [{ id: 'w' }] }, workspaceId: 'workspace-1', revision: 3,
    }));
    await expect(loadWorkspaceAuthoritatively()).resolves.toMatchObject({
      status: 'draft_required', draft: expect.objectContaining({ board: false, value: expect.objectContaining({ penColor: 'blue' }) }),
    });
    expect(draftOf('workspace-1').value.penColor).toBe('blue');
  });

  test('a draft is only ever offered on its own board, and another board leaves it alone', async () => {
    writeWorkspaceDraft({ workspaceId: 'workspace-2', wins: ['made elsewhere'] }, 2);
    fetch.mockResolvedValue(response(200, {
      value: { wins: ['server'] }, workspaceId: 'workspace-1', revision: 3,
    }));
    await expect(loadWorkspaceAuthoritatively({ workspaceId: 'workspace-1' })).resolves.toMatchObject({ status: 'ready' });
    expect(draftOf('workspace-2').value.wins).toEqual(['made elsewhere']);

    fetch.mockResolvedValue(response(200, {
      value: { wins: ['server'] }, workspaceId: 'workspace-2', revision: 4,
    }));
    await expect(loadWorkspaceAuthoritatively({ workspaceId: 'workspace-2' })).resolves.toMatchObject({
      status: 'draft_required', draft: expect.objectContaining({ value: { workspaceId: 'workspace-2', wins: ['made elsewhere'] } }),
    });
  });

  test('the old single draft for every board is dropped, never offered', async () => {
    localStorage.setItem('homebase.workspace.draft.v1', JSON.stringify({ value: { workspaceId: 'workspace-1', wins: ['old'] }, baseRevision: 1 }));
    fetch.mockResolvedValue(response(200, {
      value: { wins: ['server'] }, workspaceId: 'workspace-1', revision: 3,
    }));
    await expect(loadWorkspaceAuthoritatively()).resolves.toMatchObject({ status: 'ready' });
    expect(localStorage.getItem('homebase.workspace.draft.v1')).toBeNull();
  });

  test('a draft needs its board to be kept, and clearing one board keeps the others', () => {
    expect(writeWorkspaceDraft({ wins: ['no board named'] }, 1)).toBe(false);
    expect(writeWorkspaceDraft({ workspaceId: 'workspace-1', wins: ['one'] }, 1)).toBe(true);
    // Unless told otherwise, the board in a draft is part of what is unsaved.
    expect(draftOf('workspace-1').board).toBe(true);
    expect(writeWorkspaceDraft({ workspaceId: 'workspace-2', wins: ['two'] }, 1)).toBe(true);
    clearWorkspaceDraft('workspace-1');
    expect(readWorkspaceDraft('workspace-1')).toBeNull();
    expect(readWorkspaceDraft('workspace-2').value.wins).toEqual(['two']);
  });

  test('with the server down, recovery offers the board\'s own draft, or the newest one when the board is not known', async () => {
    localStorage.setItem(workspaceDraftKey('workspace-1'), JSON.stringify({ value: { wins: ['older'] }, savedAt: '2026-10-01T00:00:00.000Z' }));
    localStorage.setItem(workspaceDraftKey('workspace-2'), JSON.stringify({ value: { wins: ['newer'] }, savedAt: '2026-10-02T00:00:00.000Z' }));
    fetch.mockRejectedValue(new Error('offline'));
    expect((await loadWorkspaceAuthoritatively({ workspaceId: 'workspace-1' })).draft.value.wins).toEqual(['older']);
    expect((await loadWorkspaceAuthoritatively()).draft.value.wins).toEqual(['newer']);
  });

  test('save sends the expected revision and clears the separate draft only on success', async () => {
    writeWorkspaceDraft({ workspaceId: 'workspace-1', wins: ['draft'] }, 4);
    fetch.mockResolvedValue(response(200, { ok: true, workspaceId: 'workspace-1', revision: 5 }));
    const saved = await saveWorkspaceAuthoritatively({ workspaceId: 'workspace-1', wins: ['next'] }, 4);
    const request = JSON.parse(fetch.mock.calls[0][1].body);
    expect(request.expectedRevision).toBe(4);
    expect(request.value.wins).toEqual(['next']);
    expect(saved.revision).toBe(5);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(WORKSPACE_KEY)).wins).toEqual(['next']);
  });

  test('with the shared doc owning the board, the save carries only the settings', async () => {
    writeWorkspaceDraft({ workspaceId: 'workspace-1', wins: ['w'], penColor: 'red' }, 5);
    fetch.mockResolvedValue(response(200, { ok: true, workspaceId: 'workspace-1', revision: 6 }));
    await saveWorkspaceAuthoritatively({ workspaceId: 'workspace-1', wins: ['w'], canvasGroups: [], paths: [], links: [], dock: {}, penColor: 'red' }, 5, { canvasSource: 'yjs' });
    const request = JSON.parse(fetch.mock.calls[0][1].body);
    expect(request.canvasSource).toBe('yjs');
    expect(Object.keys(request.value).sort()).toEqual(['penColor', 'updatedAt', 'workspaceId']);
    // The local copy keeps everything.
    expect(JSON.parse(localStorage.getItem(WORKSPACE_KEY)).wins).toEqual(['w']);
    // Board edits in the draft are the shared doc's to confirm, so the save leaves the draft be.
    expect(draftOf('workspace-1').value.wins).toEqual(['w']);
  });

  test('a save can go out with a page that is closing', async () => {
    fetch.mockResolvedValue(response(200, { ok: true, workspaceId: 'workspace-1', revision: 6 }));
    await saveWorkspaceAuthoritatively({ workspaceId: 'workspace-1', penColor: 'blue' }, 5, { canvasSource: 'yjs', keepalive: true });
    await saveWorkspaceAuthoritatively({ workspaceId: 'workspace-1', penColor: 'blue' }, 6, { canvasSource: 'yjs' });
    expect(fetch.mock.calls.map(([, options]) => options.keepalive)).toEqual([true, false]);
  });

  test('conflict is typed and preserves recovery state', async () => {
    writeWorkspaceDraft({ workspaceId: 'workspace-1', wins: ['mine'] }, 4);
    fetch.mockResolvedValue(response(409, { error: 'Workspace changed since it was loaded' }));
    await expect(saveWorkspaceAuthoritatively({ workspaceId: 'workspace-1', wins: ['mine'] }, 4)).rejects.toMatchObject({
      code: 'workspace_revision_conflict', status: 409,
    });
    expect(draftOf('workspace-1').value).toEqual({ workspaceId: 'workspace-1', wins: ['mine'] });
  });

  test('reset clears recovery only after a matching server revision, and only for the reset board', async () => {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ wins: ['safe'] }));
    writeWorkspaceDraft({ workspaceId: 'workspace-1', wins: ['draft'] }, 2);
    writeWorkspaceDraft({ workspaceId: 'workspace-2', wins: ['other board'] }, 2);
    fetch.mockResolvedValueOnce(response(409, { error: 'Workspace changed since it was loaded' }));
    await expect(deleteWorkspaceAuthoritatively(2)).rejects.toMatchObject({
      code: 'workspace_revision_conflict',
    });
    expect(localStorage.getItem(WORKSPACE_KEY)).not.toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();

    fetch.mockResolvedValueOnce(response(200, { ok: true, workspaceId: 'workspace-1', removed: true, revision: 3 }));
    await expect(deleteWorkspaceAuthoritatively(3)).resolves.toMatchObject({ removed: true });
    expect(localStorage.getItem(WORKSPACE_KEY)).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(draftOf('workspace-2').value.wins).toEqual(['other board']);
  });
});
