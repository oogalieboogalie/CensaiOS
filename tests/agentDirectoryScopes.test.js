import { jest } from '@jest/globals';
import path from 'path';

const mockGetSubAgentById = jest.fn();
const mockGetAgent = jest.fn();
const mockCreateSubAgent = jest.fn();
const mockGetProject = jest.fn();
const mockGetSubAgents = jest.fn(() => Promise.resolve([]));
const mockUpdateSubAgent = jest.fn((id, patch) => Promise.resolve({ id, ...patch }));
const mockResolveAuthorizedWorkspaceProject = jest.fn();
const scope = { workspaceId: 'workspace-1', userId: 7 };

const mockRunnerClient = {
  fsRead: jest.fn(async () => 'file content'),
  fsWrite: jest.fn(async () => true),
  fsList: jest.fn(async () => [{ name: 'file.js', isDirectory: false }]),
};

jest.unstable_mockModule('../server/memory.js', () => ({
  getSubAgentById: mockGetSubAgentById,
  getAgent: mockGetAgent,
  createSubAgent: mockCreateSubAgent,
  getSubAgents: mockGetSubAgents,
  updateSubAgent: mockUpdateSubAgent,
  deleteSubAgent: jest.fn(() => Promise.resolve()),
  scratchpadWrite: jest.fn(() => Promise.resolve()),
  scratchpadRead: jest.fn(() => Promise.resolve()),
  scratchpadClear: jest.fn(() => Promise.resolve()),
  createAgentTask: jest.fn(() => Promise.resolve({ id: 'task-123', title: 'task' })),
}));

jest.unstable_mockModule('../server/runner/client.js', () => ({
  runnerClient: mockRunnerClient,
}));

jest.unstable_mockModule('../server/operational-intelligence/provenance.js', () => ({
  recordProvenance: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../server/workspaces.js', () => ({
  getProject: mockGetProject,
  getProjectByName: jest.fn(() => null),
  getProjectByRepoOrPath: jest.fn(() => null),
  isGithubProject: jest.fn(() => false),
  ensureSubAgentBranch: jest.fn(async () => 'branch-name'),
  mirrorSubAgentToDisk: jest.fn(async () => {}),
  removeSubAgentFromDisk: jest.fn(async () => {}),
}));
jest.unstable_mockModule('../server/workspaces/projectAccess.js', () => ({
  resolveAuthorizedWorkspaceProject: mockResolveAuthorizedWorkspaceProject,
}));

const { handleLocalTool } = await import('../server/tools/handlers/local.js');
const { handleSubagentTool } = await import('../server/tools/handlers/subagents.js');

describe('Agent Directory Scopes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('local tools allow access when no directory scopes are defined', async () => {
    mockGetSubAgentById.mockResolvedValue(null);
    mockGetAgent.mockResolvedValue({
      id: 'test-agent',
      tool_scopes: {},
    });

    const readRes = await handleLocalTool('test-agent', 'local_read_file', { file_path: 'src/components/App.jsx' });
    expect(readRes).toBe('file content');
    expect(mockRunnerClient.fsRead).toHaveBeenCalled();
  });

  test('local tools enforce allowed directory scopes', async () => {
    mockGetSubAgentById.mockResolvedValue({
      id: 'sub-agent',
      tool_scopes: {
        scopes: {
          local: {
            paths: ['src/components', 'server/routes'],
          },
        },
      },
    });

    // Access within allowed path (relative) should succeed
    const allowedRelativeRes = await handleLocalTool('sub-agent', 'local_read_file', { file_path: 'src/components/App.jsx' }, scope);
    expect(allowedRelativeRes).toBe('file content');

    // Access within allowed path (absolute) should succeed
    const absoluteAllowedPath = path.resolve('server/routes/chat.js');
    const allowedAbsoluteRes = await handleLocalTool('sub-agent', 'local_read_file', { file_path: absoluteAllowedPath }, scope);
    expect(allowedAbsoluteRes).toBe('file content');

    // Access outside allowed path (e.g. package.json) should be rejected
    const restrictedRes = await handleLocalTool('sub-agent', 'local_read_file', { file_path: 'package.json' }, scope);
    expect(restrictedRes).toContain('Access restricted by agent\'s directory scopes');

    // Access outside allowed path (absolute) should be rejected
    const absoluteRestrictedPath = path.resolve('package.json');
    const restrictedAbsoluteRes = await handleLocalTool('sub-agent', 'local_read_file', { file_path: absoluteRestrictedPath }, scope);
    expect(restrictedAbsoluteRes).toContain('Access restricted by agent\'s directory scopes');
  });

  test('local tools fail closed when directory scope lookup fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetSubAgentById.mockRejectedValue(new Error('registry offline'));
    const result = await handleLocalTool(
      'sub-agent', 'local_read_file', { file_path: 'package.json' }, scope,
    );
    expect(result).toContain('Unable to verify agent directory scopes');
    expect(mockRunnerClient.fsRead).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Failed to load agent scopes'), 'registry offline');
    warn.mockRestore();
  });

  test('sub-agents inherit directory scopes from parent agent', async () => {
    mockGetSubAgentById.mockResolvedValue(null);
    mockGetAgent.mockResolvedValue({
      id: 'parent-agent',
      tool_scopes: {
        scopes: {
          local: {
            paths: ['src/components'],
          },
        },
      },
    });

    mockCreateSubAgent.mockImplementation((parentId, data) => Promise.resolve({
      id: `child-${parentId}`,
      name: data.name,
      tool_scopes: data.tool_scopes,
      permission: data.permission,
    }));

    const result = await handleSubagentTool('parent-agent', 'create_sub_agent', {
      name: 'child-agent',
      role: 'Helper sub-agent',
      permission: 'worker',
      force_new: true,
    }, scope);

    expect(result).toContain('Created sub-agent "child-agent"');
    expect(mockCreateSubAgent).toHaveBeenCalledWith('parent-agent', expect.objectContaining({
      tool_scopes: expect.objectContaining({
        scopes: {
          local: {
            paths: ['src/components'],
          },
        },
      }),
    }), scope);
  });

  test('local tools dynamically bind to project path if agent is bound to a project', async () => {
    mockGetSubAgentById.mockResolvedValue({
      id: 'sub-agent-with-project',
      project_id: 'project-123',
      tool_scopes: {
        scopes: {
          local: {
            paths: ['src/components'],
          },
        },
      },
    });
    mockGetProject.mockResolvedValue({
      id: 'project-123',
      name: 'Test Project',
      path: 'server/routes',
    });

    // Access within the explicitly allowed path (src/components) should succeed
    const explicitlyAllowedRes = await handleLocalTool('sub-agent-with-project', 'local_read_file', { file_path: 'src/components/App.jsx' }, scope);
    expect(explicitlyAllowedRes).toBe('file content');

    // Access within the dynamically bound project path (server/routes) should also succeed
    const projectPathRes = await handleLocalTool('sub-agent-with-project', 'local_read_file', { file_path: 'server/routes/chat.js' }, scope);
    expect(projectPathRes).toBe('file content');

    // Access outside of both should fail
    const restrictedRes = await handleLocalTool('sub-agent-with-project', 'local_read_file', { file_path: 'package.json' }, scope);
    expect(restrictedRes).toContain('Access restricted by agent\'s directory scopes');
  });

  test('create_sub_agent updates project binding if sub-agent already exists with different project', async () => {
    mockGetSubAgents.mockResolvedValue([
      {
        id: 'builder-parent-agent',
        name: 'Builder',
        class: 'builder',
        permission: 'worker',
        project_id: 'old-project-id',
        specialty: 'Surgical coding',
      }
    ]);
    mockResolveAuthorizedWorkspaceProject.mockResolvedValue({
      id: 'new-project-id',
      name: 'New Project',
    });

    const result = await handleSubagentTool('parent-agent', 'create_sub_agent', {
      name: 'Builder',
      project: 'new-project-id',
    }, scope);

    expect(result).toContain('already exists. Bound to project "New Project" (updated)');
    expect(mockUpdateSubAgent).toHaveBeenCalledWith('builder-parent-agent', { project_id: 'new-project-id' }, scope);
  });

  test('create_sub_agent inherits parent project ID if no project is specified', async () => {
    mockGetSubAgentById.mockResolvedValue({
      id: 'parent-agent',
      project_id: 'parent-project-123',
    });
    mockGetSubAgents.mockResolvedValue([]);
    mockCreateSubAgent.mockResolvedValue({
      id: 'new-sub-agent-id',
      name: 'ChildSpecialist',
      permission: 'worker',
      project_id: 'parent-project-123',
    });

    const result = await handleSubagentTool('parent-agent', 'create_sub_agent', {
      name: 'ChildSpecialist',
    }, scope);

    expect(result).toContain('Created sub-agent "ChildSpecialist"');
    expect(mockCreateSubAgent).toHaveBeenCalledWith(
      'parent-agent',
      expect.objectContaining({
        projectId: 'parent-project-123',
      }),
      scope,
    );
  });
});
