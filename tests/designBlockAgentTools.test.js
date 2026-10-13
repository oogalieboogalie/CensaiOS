import { jest } from '@jest/globals';
import { __resetWorkspaceHubForTests } from '../server/collaboration/workspaceHub.js';

let canvasValue;
let canvasRevision;
async function runQuery(sql, params = []) {
  const statement = String(sql);
  if (statement.includes('SELECT value, revision')) return { rows: [{ value: canvasValue, revision: canvasRevision }] };
  if (statement.includes('UPDATE workspace_client_state')) {
    canvasValue = JSON.parse(params[2]);
    canvasRevision += 1;
    return { rows: [{ revision: canvasRevision, updated_at: new Date().toISOString() }] };
  }
  return { rows: [] };
}
const clientQuery = jest.fn(runQuery);
const pool = {
  connect: jest.fn(async () => ({ release: jest.fn(), query: clientQuery })),
  query: jest.fn(runQuery),
};
const requireWorkspaceMember = jest.fn(async () => ({ id: 'workspace-a', role: 'member' }));
const getSubAgentById = jest.fn(async () => null);

jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/memory.js', () => ({ getSubAgentById, getAgent: jest.fn(async () => null) }));

const { handleCanvasCollaborationTool } = await import('../server/tools/handlers/canvas.js');
const { TOOL_DEFINITIONS } = await import('../server/tools/definitions.js');
const { listToolCatalog } = await import('../server/tools/catalog.js');
const { AGENT_CAPABILITY_MODULES } = await import('../src/data/agent-capability-modules.js');
const { CAPABILITY_TO_TOOLS } = await import('../server/tools/rbac/capabilities.js');

const context = { workspaceId: 'workspace-a', userId: 7 };
const heroBlock = {
  id: 'block-1', kind: 'designBlock', title: 'Hero', x: 0, y: 0, w: 1440, h: 900,
  source: '<main data-name="Hero">Ship designs</main>', sourceType: 'html', view: 'render', bare: true,
  figma: { fileKey: 'AbC123xyz', nodeId: '1:2', fileName: 'Landing Page', url: 'https://www.figma.com/design/AbC123xyz/Landing-Page' },
};

beforeEach(() => {
  __resetWorkspaceHubForTests();
  jest.clearAllMocks();
  canvasValue = { wins: [heroBlock, { id: 'doc-1', kind: 'doc', title: 'Notes', text: 'hi' }] };
  canvasRevision = 4;
  getSubAgentById.mockResolvedValue(null);
});
afterEach(() => __resetWorkspaceHubForTests());

test('canvas_read_design returns the block code and where it came from', async () => {
  const result = await handleCanvasCollaborationTool('atlas', 'canvas_read_design', { window_id: 'block-1' }, context);
  expect(result).toContain('Design "Hero" — html, 1440×900');
  expect(result).toContain('Imported from Figma (Landing Page, node 1:2)');
  expect(result).toContain('<main data-name="Hero">Ship designs</main>');
});

test('canvas_update_design swaps the code, keeps the old code for Undo and shows the live code', async () => {
  const result = await handleCanvasCollaborationTool('atlas', 'canvas_update_design', {
    window_id: 'block-1', source: '<main data-name="Hero" style="background:#111">Ship faster</main>',
  }, context);
  expect(result).toMatch(/Updated the design "Hero" on the shared canvas \(revision 5\)/);
  expect(canvasValue.wins[0]).toMatchObject({
    source: '<main data-name="Hero" style="background:#111">Ship faster</main>',
    previousSource: heroBlock.source,
    sourceType: 'html',
    view: 'live',
    bare: true,
    figma: heroBlock.figma,
    editedBy: { type: 'agent', id: 'atlas' },
  });
  expect(requireWorkspaceMember).toHaveBeenCalledWith(pool, expect.objectContaining({ roles: ['owner', 'admin', 'member'] }));
});

test('only design blocks can be edited, and empty or oversized code is refused', async () => {
  await expect(handleCanvasCollaborationTool('atlas', 'canvas_update_design', { window_id: 'doc-1', source: 'x' }, context))
    .resolves.toMatch(/^Error: That window is not a design block/);
  await expect(handleCanvasCollaborationTool('atlas', 'canvas_update_design', { window_id: 'block-1', source: '   ' }, context))
    .resolves.toMatch(/^Error: source must contain/);
  await expect(handleCanvasCollaborationTool('atlas', 'canvas_update_design', { window_id: 'block-1', source: 'x'.repeat(256 * 1024 + 1) }, context))
    .resolves.toMatch(/^Error: source must contain/);
  await expect(handleCanvasCollaborationTool('atlas', 'canvas_update_design', { window_id: 'block-1', source: '<p>x</p>', source_type: 'php' }, context))
    .resolves.toMatch(/^Error: source_type must be one of/);
  expect(canvasRevision).toBe(4);
  expect(canvasValue.wins[0].source).toBe(heroBlock.source);
});

test('reviewer sub-agents cannot edit designs', async () => {
  getSubAgentById.mockResolvedValue({ permission: 'reviewer' });
  const result = await handleCanvasCollaborationTool('scout-1', 'canvas_update_design', { window_id: 'block-1', source: '<p>x</p>' }, context);
  expect(result).toMatch(/reviewer sub-agents cannot edit designs/);
  expect(canvasRevision).toBe(4);
});

test('the design tools are defined, catalogued, and reading is autonomous while rewriting needs approval', () => {
  for (const name of ['canvas_read_design', 'canvas_update_design']) {
    expect(TOOL_DEFINITIONS.find(tool => tool.function.name === name)).toBeDefined();
  }
  expect(listToolCatalog().tools.find(tool => tool.name === 'canvas_update_design')).toMatchObject({ risk: 'write', category: 'Coordination' });
  const module = AGENT_CAPABILITY_MODULES.find(entry => entry.id === 'canvas-designer');
  expect(module).toMatchObject({ capabilityId: 'canvas.design', mode: 'execute_with_approval', risk: 'write' });
  expect(CAPABILITY_TO_TOOLS['canvas.design']).toEqual(['canvas_update_design']);
  expect(CAPABILITY_TO_TOOLS['canvas.design.read']).toEqual(['canvas_read_design']);
});
