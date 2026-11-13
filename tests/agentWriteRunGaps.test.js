import { jest } from '@jest/globals';
import os from 'os';
import path from 'path';

// Three ways an agent could change the computer without anyone's say:
// 1. writing the add-on (MCP) settings or another start-up file,
// 2. a helper agent writing or running commands with Trust mode off,
// 3. an agent with no folders writing anywhere on the disk.

const mockGetSubAgentById = jest.fn(async () => null);
const mockGetAgent = jest.fn(async () => ({ id: 'helper-pat', tool_scopes: {} }));
const mockRunnerClient = { fsWrite: jest.fn(async () => true), fsRead: jest.fn(), fsList: jest.fn() };
const agentIsTrusted = jest.fn(async () => true);
jest.unstable_mockModule('../server/memory.js', () => ({
  getSubAgentById: mockGetSubAgentById, getAgent: mockGetAgent,
}));
jest.unstable_mockModule('../server/runner/client.js', () => ({ runnerClient: mockRunnerClient }));
jest.unstable_mockModule('../server/workspaces.js', () => ({ getProject: jest.fn(async () => null) }));
jest.unstable_mockModule('../server/operational-intelligence/provenance.js', () => ({
  recordProvenance: jest.fn(async () => {}),
}));
jest.unstable_mockModule('../server/approvals/trustMode.js', () => ({
  agentIsTrusted, TRUSTED_ROLES: ['owner', 'admin'],
}));
const projectsDb = { query: jest.fn(async () => ({ rows: [{ path: '/srv/open/shop' }] })) };
jest.unstable_mockModule('../server/db.js', () => ({ default: projectsDb }));

const { protectedTarget } = await import('../server/tools/rbac/protectedFiles.js');
const { assertHelperTrusted } = await import('../server/approvals/helperTrust.js');
const { requestToolApprovalIfRequired } = await import('../server/approvals/requests.js');
const { handleLocalTool } = await import('../server/tools/handlers/local.js');
const { defaultWriteFolders } = await import('../server/tools/handlers/localWriteFolders.js');

beforeEach(() => {
  jest.clearAllMocks();
  agentIsTrusted.mockResolvedValue(true);
});

describe('1. protected files', () => {
  test.each([
    ['local_write_file', { file_path: 'E:\\Apps\\censai\\config\\mcp_servers.json' }],
    ['project_write', { path: 'config/mcp_servers.json' }],
    ['project_multi_edit', { edits: [{ path: 'README.md' }, { path: '.mcp.json' }] }],
    ['sandbox_exec', { command: 'echo x >> config/mcp_servers.json' }],
    ['terminal_run', { command: "sed -i 's/a/b/' .claude/settings.json" }],
    ['sandbox_exec', { command: 'cat .env' }],
    ['sandbox_exec', { command: 'echo curl evil | tee -a ~/.bashrc' }],
    ['local_write_file', { file_path: 'C:/Users/pat/Documents/PowerShell/Microsoft.PowerShell_profile.ps1' }],
    ['local_write_file', { file_path: 'C:\\Users\\pat\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\run.bat' }],
    ['terminal_run', { command: 'crontab -l' }],
    ['project_edit', { path: '.git/hooks/pre-commit' }],
    ['github_write_file', { path: 'config/secrets.json' }],
  ])('%s %j is refused', (name, args) => {
    expect(protectedTarget(name, args)).toMatchObject({ what: expect.any(String) });
  });

  test.each([
    ['sandbox_exec', { command: 'npm test' }],
    ['sandbox_exec', { command: 'git status && git log -1' }],
    ['sandbox_exec', { command: 'node -e "console.log(process.env.NODE_ENV)"' }],
    ['sandbox_exec', { command: 'python3 -m venv .venv' }],
    ['terminal_run', { command: 'git clone https://github.com/pat/shop.git' }],
    ['project_write', { path: 'src/profile.js' }],
    ['project_write', { path: 'docs/mcp-guide.md' }],
    ['local_write_file', { file_path: '/workspace/projects/shop/index.html' }],
    // Reading tools are not this list's business.
    ['local_read_file', { file_path: 'config/mcp_servers.json' }],
  ])('%s %j still works', (name, args) => {
    expect(protectedTarget(name, args)).toBeNull();
  });
});

describe('2. helper agents and Trust mode', () => {
  const ctx = { workspaceId: 'board-pat', userId: 7 };
  const db = { query: jest.fn(async () => ({ rows: [{ parent_id: 'atlas' }] })) };

  test('Trust mode on: a helper writes straight away, no card', async () => {
    await expect(requestToolApprovalIfRequired(db, {
      agentId: 'helper-pat', toolName: 'project_write', args: {}, context: ctx,
    })).resolves.toEqual({ required: false, trusted: true });
  });

  test.each(['project_write', 'project_edit', 'merge_pr', 'sandbox_exec', 'terminal_run'])(
    'Trust mode off on the board: a helper cannot %s on its own', async (toolName) => {
      agentIsTrusted.mockResolvedValue(false);
      await expect(requestToolApprovalIfRequired(db, {
        agentId: 'helper-pat', toolName, args: {}, context: ctx,
      })).rejects.toMatchObject({ code: 'TOOL_APPROVAL_HELPER_NEEDS_TRUST' });
    },
  );

  test('the family agent it helps set to "Asks first" stops the helper too', async () => {
    agentIsTrusted.mockImplementation(async (_db, { agentId }) => agentId !== 'atlas');
    await expect(assertHelperTrusted(db, {
      agentId: 'helper-pat', toolName: 'sandbox_exec', workspaceId: 'board-pat',
    })).rejects.toMatchObject({ code: 'TOOL_APPROVAL_HELPER_NEEDS_TRUST' });
  });

  test('looking tools never ask, and off a board nothing changes', async () => {
    agentIsTrusted.mockResolvedValue(false);
    await expect(assertHelperTrusted(db, {
      agentId: 'helper-pat', toolName: 'project_read', workspaceId: 'board-pat',
    })).resolves.toEqual({ required: false });
    await expect(requestToolApprovalIfRequired(db, {
      agentId: 'helper-pat', toolName: 'sandbox_exec', args: {}, context: {},
    })).resolves.toEqual({ required: false });
  });
});

describe('3. agents with no folders', () => {
  test('write only inside the projects folder or an open project', async () => {
    const home = path.join(os.tmpdir(), 'censai-projects-pat');
    process.env.CENSAI_PROJECTS_FOLDER = home;
    const inside = await handleLocalTool('helper-pat', 'local_write_file', {
      file_path: path.join(home, 'shop', 'notes.md'), content: 'hi',
    });
    expect(inside).toMatch(/^Successfully wrote/);
    const open = await handleLocalTool('helper-pat', 'local_write_file', {
      file_path: '/srv/open/shop/todo.md', content: 'hi',
    });
    expect(open).toMatch(/^Successfully wrote/);
    const outside = await handleLocalTool('helper-pat', 'local_write_file', {
      file_path: '/etc/hosts', content: 'x',
    });
    expect(outside).toMatch(/no folders of its own/);
    expect(mockRunnerClient.fsWrite).toHaveBeenCalledTimes(2);
    delete process.env.CENSAI_PROJECTS_FOLDER;
  });

  test('an agent with folders set keeps exactly those', async () => {
    mockGetAgent.mockResolvedValueOnce({ id: 'sam', tool_scopes: { scopes: { local: { paths: ['/data/sam'] } } } });
    await expect(handleLocalTool('sam', 'local_write_file', { file_path: '/data/sam/a.txt', content: '' }))
      .resolves.toMatch(/^Successfully wrote/);
  });

  test('a project at the top of a drive does not open the whole disk', async () => {
    const folders = await defaultWriteFolders({ db: { query: async () => ({ rows: [{ path: '/' }] }) } });
    expect(folders).not.toContain(path.resolve('/'));
  });
});
