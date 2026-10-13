import { jest } from '@jest/globals';
import { __resetWorkspaceHubForTests } from '../server/collaboration/workspaceHub.js';

let canvasValue;
let canvasRevision;
const clientQuery = jest.fn(async (sql, params = []) => {
  const statement = String(sql);
  if (statement.includes('SELECT value, revision')) return { rows: [{ value: canvasValue, revision: canvasRevision }] };
  if (statement.includes('UPDATE workspace_client_state')) {
    canvasValue = JSON.parse(params[2]);
    canvasRevision += 1;
    return { rows: [{ revision: canvasRevision, updated_at: new Date().toISOString() }] };
  }
  return { rows: [] };
});
const pool = {
  connect: jest.fn(async () => ({ release: jest.fn(), query: clientQuery })),
  query: jest.fn(async () => ({ rows: [] })),
};
const requireWorkspaceMember = jest.fn(async () => ({ id: 'workspace-a', role: 'member' }));
const getSubAgentById = jest.fn(async () => null);

jest.unstable_mockModule('../server/db.js', () => ({
  default: pool,
  createDbPool: () => pool,
}));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/memory.js', () => ({
  getSubAgentById,
  getAgent: jest.fn(async () => null),
}));

const { handleCanvasCollaborationTool } = await import('../server/tools/handlers/canvas.js');

const context = { workspaceId: 'workspace-a', userId: 7 };

beforeEach(() => {
  __resetWorkspaceHubForTests();
  jest.clearAllMocks();
  canvasValue = { wins: [] };
  canvasRevision = 2;
  requireWorkspaceMember.mockResolvedValue({ id: 'workspace-a', role: 'member' });
  getSubAgentById.mockResolvedValue(null);
});
afterEach(() => __resetWorkspaceHubForTests());

test('project_preview wraps threejs source and opens an htmlPreview window', async () => {
  const result = await handleCanvasCollaborationTool('atlas', 'project_preview', {
    title: 'Spinning Cube',
    preview_type: 'threejs',
    content: 'const scene = new THREE.Scene();',
  }, context);

  expect(result).toMatch(/Projected threejs preview "Spinning Cube"/);
  expect(result).toMatch(/id: [0-9a-f-]{36}/);
  expect(canvasValue.wins).toHaveLength(1);
  expect(canvasValue.wins[0]).toMatchObject({
    kind: 'htmlPreview', title: 'Spinning Cube', previewType: 'threejs',
  });
  expect(canvasValue.wins[0].fileName).toBe('spinning-cube.html');
  expect(canvasValue.wins[0].html).toContain('type="importmap"');
  expect(canvasValue.wins[0].html).toContain('const scene = new THREE.Scene();');
});

test('project_preview defaults to html and rejects empty content without spawning', async () => {
  const result = await handleCanvasCollaborationTool('atlas', 'project_preview', {
    title: 'Empty', content: '   ',
  }, context);

  expect(result).toMatch(/^Error: /);
  expect(canvasValue.wins).toHaveLength(0);
});

test('reviewer sub-agents cannot project previews', async () => {
  getSubAgentById.mockResolvedValue({ permission: 'reviewer' });
  const result = await handleCanvasCollaborationTool('scout-1', 'project_preview', {
    title: 'Nope', preview_type: 'html', content: '<h1>x</h1>',
  }, context);

  expect(result).toMatch(/reviewer sub-agents cannot project previews/);
  expect(canvasValue.wins).toHaveLength(0);
});

test('project_preview requires an authenticated workspace context', async () => {
  await expect(handleCanvasCollaborationTool('atlas', 'project_preview', {
    title: 'No ctx', content: '<h1>x</h1>',
  }, {})).rejects.toThrow(/authenticated workspace context/);
});
