import { jest } from '@jest/globals';

// When a name fits more than one project, the answer that names the choices
// has to reach the agent. Made-up projects: acme/shop and beta/shop.
const { projectChoiceError } = await import('../server/workspaces/projectIdentity.js');

const ACME = { id: 'shared-shop', name: 'shop', repo: 'acme/shop', path: null };
const BETA = { id: 'shared-shop-0a1b2c3d', name: 'shop', repo: 'beta/shop', path: null };

const mockGetProject = jest.fn();
const mockGetProjectByName = jest.fn();
const mockGetProjectByRepoOrPath = jest.fn();
const mockOnBoard = jest.fn();
const mockCreateSubAgent = jest.fn();

jest.unstable_mockModule('../server/memory.js', () => ({
  getSubAgentById: jest.fn(async () => null),
  getAgent: jest.fn(async () => ({ id: 'censai' })),
  createSubAgent: mockCreateSubAgent,
  getSubAgents: jest.fn(async () => []),
  updateSubAgent: jest.fn(),
  deleteSubAgent: jest.fn(),
  createAgentTask: jest.fn(),
  scratchpadWrite: jest.fn(),
  scratchpadRead: jest.fn(),
  scratchpadClear: jest.fn(),
}));
jest.unstable_mockModule('../server/workspaces.js', () => ({
  getProject: mockGetProject,
  getProjectByName: mockGetProjectByName,
  getProjectByRepoOrPath: mockGetProjectByRepoOrPath,
  listProjects: jest.fn(async () => [ACME, BETA]),
  openProject: jest.fn(),
  isGithubProject: jest.fn(() => true),
  ensureSubAgentBranch: jest.fn(),
  mirrorSubAgentToDisk: jest.fn(),
  removeSubAgentFromDisk: jest.fn(),
}));
jest.unstable_mockModule('../server/workspaces/projectAccess.js', () => ({
  resolveAuthorizedWorkspaceProject: mockOnBoard,
}));
jest.unstable_mockModule('../server/db.js', () => ({
  default: {
    query: jest.fn(async (sql) => {
      const text = String(sql);
      if (text.includes('workspace_members') || text.includes('FROM workspaces')) {
        return { rows: [{ id: 'made-up-board', name: 'Board', role: 'owner', tenant_id: null }] };
      }
      return { rows: [{ role: 'admin' }] };
    }),
    on: jest.fn(),
    end: jest.fn(),
  },
}));

const { handleSubagentTool } = await import('../server/tools/handlers/subagents.js');
const { resolveProjectForCall } = await import('../server/tools/helpers.js');

const priorMode = process.env.CENSAI_MODE;
beforeEach(() => {
  jest.clearAllMocks();
  process.env.CENSAI_MODE = 'local_desktop';
});
afterAll(() => {
  if (priorMode === undefined) delete process.env.CENSAI_MODE;
  else process.env.CENSAI_MODE = priorMode;
});

describe('making a helper for a project whose name fits two', () => {
  const board = { workspaceId: 'made-up-board', userId: 7 };

  test('the agent is told the choices, not to open another project', async () => {
    mockOnBoard.mockRejectedValue(projectChoiceError('shop', [ACME, BETA]));
    const answer = await handleSubagentTool('censai', 'create_sub_agent', { name: 'Scout', project: 'shop' }, board);
    expect(answer).toMatch(/More than one project is called "shop".*acme\/shop.*beta\/shop/);
    expect(answer).not.toMatch(/open_project/);
    expect(mockCreateSubAgent).not.toHaveBeenCalled();
  });

  test('a project that is really not there still says so', async () => {
    mockOnBoard.mockRejectedValue(new Error('made-up failure'));
    const answer = await handleSubagentTool('censai', 'create_sub_agent', { name: 'Scout', project: 'orchard' }, board);
    expect(answer).toBe('No authorized project named "orchard" found. Use open_project first.');
  });
});

describe('a project named off a board', () => {
  test('by its id it is that project, even when a repo elsewhere ends in the same word', async () => {
    const odd = { id: 'shop', name: 'made-up-old-row', repo: null, path: '/made-up/old' };
    mockGetProject.mockResolvedValue(odd);
    mockGetProjectByName.mockResolvedValue(null);
    mockGetProjectByRepoOrPath.mockResolvedValue(ACME);

    const { project } = await resolveProjectForCall('censai', 'shop', {});
    expect(project.id).toBe('shop');
    expect(mockGetProjectByRepoOrPath).not.toHaveBeenCalled();
    expect(mockGetProjectByName).not.toHaveBeenCalled();
  });

  test('a bare name that is a folder project and also the last word of another repo is asked back', async () => {
    const folder = { id: 'made-up-folder', name: 'shop', repo: null, path: '/made-up/shop' };
    mockGetProject.mockResolvedValue(null);
    mockGetProjectByName.mockResolvedValue(folder);
    mockGetProjectByRepoOrPath.mockResolvedValue({ ...ACME, name: 'Acme store' });
    await expect(resolveProjectForCall('censai', 'shop', {})).rejects.toMatchObject({ code: 'PROJECT_NAME_NEEDED' });
  });

  test('a name nobody has lists what is here and how to add another, by repo or folder', async () => {
    mockGetProject.mockResolvedValue(null);
    mockGetProjectByName.mockResolvedValue(null);
    mockGetProjectByRepoOrPath.mockResolvedValue(null);
    await expect(resolveProjectForCall('censai', 'orchard', {})).rejects.toThrow(
      /No shared project matching "orchard"\. Available projects: "shop" \(acme\/shop\), "shop" \(beta\/shop\)\. If it is one of these, call again with its repo, its folder or its id\. To add a different one, use open_project with its repo \(owner\/name\) or its folder/
    );
  });
});
