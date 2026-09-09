import { jest } from '@jest/globals';

const syncCanvasProjectMemberships = jest.fn();
jest.unstable_mockModule('../src/lib/api/projectMemberships.js', () => ({ syncCanvasProjectMemberships }));
const { persistWorkspaceWithPrewarm } = await import('../src/lib/projectPrewarm.js');

describe('workspace save ownership versus derivative prewarm', () => {
  test('a successful authoritative save remains successful when prewarm fails', async () => {
    const api = { saveWorkspace: jest.fn().mockResolvedValue({ revision: 4 }) };
    syncCanvasProjectMemberships.mockRejectedValue(new Error('prewarm unavailable'));
    const result = await persistWorkspaceWithPrewarm({
      api,
      expectedRevision: 3,
      workspace: {
        workspaceId: 'workspace-1',
        currentProject: { projectId: 'project-1' },
        wins: [{ agentId: 'atlas' }],
        canvasGroups: [],
      },
    });
    expect(api.saveWorkspace).toHaveBeenCalledWith(expect.any(Object), 3);
    expect(result).toEqual(expect.objectContaining({
      revision: 4, prewarmSynced: false, prewarmError: 'prewarm unavailable',
    }));
  });
});
