import {
  deriveCanvasProjectMemberships,
  resolveWorkspaceProject,
} from '../src/lib/projectPrewarm.js';

describe('canvas project membership derivation', () => {
  test('collects visible and attached agents once in stable order', () => {
    expect(deriveCanvasProjectMemberships({
      wins: [
        { kind: 'chat', agentId: 'architect' },
        { kind: 'files', attachedAgents: ['atlas', 'architect'] },
        { kind: 'workflowFoundry', agentId: 'censai' },
      ],
      canvasGroups: [{ attachedAgents: ['echo', 'atlas'] }],
    })).toEqual([
      { agentId: 'architect', permission: 'work' },
      { agentId: 'atlas', permission: 'work' },
      { agentId: 'censai', permission: 'work' },
      { agentId: 'echo', permission: 'work' },
    ]);
  });

  test('saved workspace project wins over the legacy process-wide fallback', () => {
    const saved = { projectId: 'project-saved', name: 'Saved project' };
    const legacy = { projectId: 'project-global', name: 'Global project' };
    expect(resolveWorkspaceProject({ currentProject: saved }, legacy)).toBe(saved);
    expect(resolveWorkspaceProject({}, legacy)).toBe(legacy);
  });
});
