import { jest } from '@jest/globals';

const mockGetSubAgentById = jest.fn();
const mockGetAgent = jest.fn();

jest.unstable_mockModule('../server/memory.js', () => ({
  getSubAgentById: mockGetSubAgentById,
  getAgent: mockGetAgent,
}));

const mockGetProject = jest.fn();
const mockGetProjectByName = jest.fn();
const mockGetProjectByRepoOrPath = jest.fn();
const mockListProjects = jest.fn();
const mockOpenProject = jest.fn();
const mockResolveAuthorizedWorkspaceProject = jest.fn();

jest.unstable_mockModule('../server/workspaces.js', () => ({
  getProject: mockGetProject,
  getProjectByName: mockGetProjectByName,
  getProjectByRepoOrPath: mockGetProjectByRepoOrPath,
  listProjects: mockListProjects,
  openProject: mockOpenProject,
}));
jest.unstable_mockModule('../server/workspaces/projectAccess.js', () => ({
  resolveAuthorizedWorkspaceProject: mockResolveAuthorizedWorkspaceProject,
}));

const mockQuery = jest.fn();
jest.unstable_mockModule('../server/db.js', () => {
  const mockPool = {
    query: mockQuery,
    connect: jest.fn(),
    on: jest.fn(),
    end: jest.fn(),
  };
  return {
    default: mockPool,
    createDbPool: () => mockPool
  };
});

// Import modules under test after mock registration
const { resolveProjectForCall } = await import('../server/tools/helpers.js');
const { filterToolsForAgent } = await import('../server/tools/definitions.js');

describe('Sub-Agent Project Decoupling and Custom Tool Scopes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSubAgentById.mockReset();
    mockGetAgent.mockReset();
    mockGetProject.mockReset();
    mockGetProjectByName.mockReset();
    mockGetProjectByRepoOrPath.mockReset();
    mockListProjects.mockReset();
    mockOpenProject.mockReset();
    mockResolveAuthorizedWorkspaceProject.mockReset();
    mockQuery.mockReset();
  });

  describe('resolveProjectForCall for sub-agents', () => {
    test('Case A: sub-agent bound to a project in DB', async () => {
      mockGetSubAgentById.mockResolvedValue({ id: 'sub-1', project_id: 'proj-db' });
      const mockProject = { id: 'proj-db', name: 'Project DB' };
      mockResolveAuthorizedWorkspaceProject.mockResolvedValue(mockProject);

      const result = await resolveProjectForCall('sub-1', null, { workspaceId: 'workspace-1' });
      expect(result.project).toEqual(mockProject);
      expect(result.isSubAgent).toBe(true);
    });

    test('Case B: unbound sub-agent resolves via task context project ID', async () => {
      mockGetSubAgentById.mockResolvedValue({ id: 'sub-1', project_id: null });
      mockQuery.mockResolvedValue({ rows: [{ project_id: 'proj-task', project: null }] });

      const mockProject = { id: 'proj-task', name: 'Project Task' };
      mockResolveAuthorizedWorkspaceProject.mockResolvedValue(mockProject);

      const result = await resolveProjectForCall('sub-1', null, { workspaceId: 'workspace-1', agentTaskId: 'task-123' });
      expect(result.project).toEqual(mockProject);
      expect(result.isSubAgent).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('SELECT project_id'), ['task-123']);
    });

    test('Case C: unbound sub-agent resolves via task context project name', async () => {
      mockGetSubAgentById.mockResolvedValue({ id: 'sub-1', project_id: null });
      mockQuery.mockResolvedValue({ rows: [{ project_id: null, project: 'proj-name' }] });

      const mockProject = { id: 'proj-resolved', name: 'proj-name' };
      mockResolveAuthorizedWorkspaceProject.mockResolvedValue(mockProject);

      const result = await resolveProjectForCall('sub-1', null, { workspaceId: 'workspace-1', agentTaskId: 'task-123' });
      expect(result.project).toEqual(mockProject);
      expect(result.isSubAgent).toBe(true);
    });

    test('Case D: unbound scoped sub-agent does not fall back to a global project', async () => {
      mockGetSubAgentById.mockResolvedValue({ id: 'sub-1', project_id: null });
      mockResolveAuthorizedWorkspaceProject.mockRejectedValue(new Error('projectId is required'));

      await expect(resolveProjectForCall('sub-1', null, { workspaceId: 'workspace-1' }))
        .rejects.toThrow('projectId is required');
      expect(mockListProjects).not.toHaveBeenCalled();
    });

    test('Case E: unbound sub-agent resolves using explicit projectName argument', async () => {
      mockGetSubAgentById.mockResolvedValue({ id: 'sub-1', project_id: null });

      const mockProject = { id: 'proj-explicit', name: 'Explicit Project' };
      mockResolveAuthorizedWorkspaceProject.mockResolvedValue(mockProject);

      const result = await resolveProjectForCall('sub-1', 'proj-explicit', { workspaceId: 'workspace-1' });
      expect(result.project).toEqual(mockProject);
      expect(result.isSubAgent).toBe(true);
    });
  });

  describe('filterToolsForAgent with custom tool scopes', () => {
    test('filters tools to custom scopes if defined', async () => {
      const customScopes = { mode: 'custom', tools: ['remember', 'web_search'] };
      mockGetSubAgentById.mockResolvedValue({ id: 'sub-1', permission: 'worker', tool_scopes: customScopes });
      mockQuery.mockResolvedValue({ rows: [] }); // capability lookup

      const tools = await filterToolsForAgent('sub-1', { workspaceId: 'workspace-1', userId: 7 });
      const names = tools.map(t => t.function.name);
      
      expect(names).toContain('remember');
      expect(names).not.toContain('run_tests');
    });

    test('fails closed when scoped registry lookup fails', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockGetSubAgentById.mockRejectedValue(new Error('registry offline'));
      const tools = await filterToolsForAgent('sub-1', { workspaceId: 'workspace-1', userId: 7 });
      const names = tools.map(tool => tool.function.name);
      expect(names).toEqual(expect.arrayContaining(['search_tools', 'get_tool']));
      expect(names).not.toContain('local_read_file');
      expect(names).not.toContain('run_tests');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Failed closed'), 'registry offline');
      warn.mockRestore();
    });
  });
});
