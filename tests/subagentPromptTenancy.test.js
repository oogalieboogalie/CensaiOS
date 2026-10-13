import { jest } from '@jest/globals';

const resolveAuthorizedWorkspaceProject = jest.fn(async () => ({
  id: 'project-owner', name: 'Owner Project', path: 'C:/owner-project', repo: null,
}));
const readProjectBrief = jest.fn(async () => 'OWNER BRIEF');

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn() } }));
jest.unstable_mockModule('../server/workspaces/projectAccess.js', () => ({ resolveAuthorizedWorkspaceProject }));
jest.unstable_mockModule('../server/workspaces.js', () => ({ readProjectBrief }));

const { buildSubAgentSystemPrompt } = await import('../server/routes/chat/prompts.js');

describe('sub-agent prompt project tenancy', () => {
  const sub = {
    id: 'builder-owner', name: 'Builder', parent_id: 'atlas', permission: 'worker',
    project_id: 'project-owner', workspace_id: 'workspace-owner',
  };

  beforeEach(() => jest.clearAllMocks());

  test('loads a project brief only through the matching authorized workspace', async () => {
    const prompt = await buildSubAgentSystemPrompt(sub, { workspaceId: 'workspace-owner', userId: 7 });
    expect(resolveAuthorizedWorkspaceProject).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      workspaceId: 'workspace-owner', agentId: 'atlas', projectIdentifier: 'project-owner',
    }));
    expect(prompt).toContain('OWNER BRIEF');
  });

  test('does not resolve or include a project from another workspace', async () => {
    const prompt = await buildSubAgentSystemPrompt(sub, { workspaceId: 'workspace-other', userId: 8 });
    expect(resolveAuthorizedWorkspaceProject).not.toHaveBeenCalled();
    expect(readProjectBrief).not.toHaveBeenCalled();
    expect(prompt).not.toContain('OWNER BRIEF');
    expect(prompt).toContain('not bound to a project');
  });
});
