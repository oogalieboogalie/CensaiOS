// YorWare CAD agent tools (spec 13): read_cad_part and edit_cad_part read a
// CAD window off the board and save only the fields they change.
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { __resetWorkspaceHubForTests } from '../server/collaboration/workspaceHub.js';
import { codePatch, paramKey, readCad, recipeHash, runRecord } from '../src/lib/yorware/cadModel.js';
import { recipeById } from '../src/lib/yorware/cadRecipes.js';

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
const pool = {
  connect: jest.fn(async () => ({ release: jest.fn(), query: jest.fn(runQuery) })),
  query: jest.fn(runQuery),
};
const requireWorkspaceMember = jest.fn(async () => ({ id: 'workspace-a', role: 'member' }));
const getSubAgentById = jest.fn(async () => null);

jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/memory.js', () => ({ getSubAgentById, getAgent: jest.fn(async () => null) }));

const { handleCadTool } = await import('../server/tools/handlers/cad.js');
const { TOOL_DEFINITIONS } = await import('../server/tools/definitions.js');
const { listToolCatalog } = await import('../server/tools/catalog.js');
const { CAPABILITY_TO_TOOLS } = await import('../server/tools/rbac/capabilities.js');

const context = { workspaceId: 'workspace-a', userId: 7 };
const code = recipeById('bracket').code;

beforeEach(() => {
  __resetWorkspaceHubForTests();
  jest.clearAllMocks();
  canvasValue = { wins: [
    { id: 'cad-1', kind: 'yorCad', title: 'Wall bracket', x: 0, y: 0, w: 1120, h: 720, ...codePatch(code) },
    { id: 'doc-1', kind: 'doc', title: 'Notes', text: 'hi', x: 0, y: 0, w: 10, h: 10 },
  ] };
  canvasRevision = 3;
  getSubAgentById.mockResolvedValue(null);
});
afterEach(() => __resetWorkspaceHubForTests());

const cadWin = () => canvasValue.wins[0];

test('read_cad_part gives the recipe, the sizes and how the last build went', async () => {
  let out = await handleCadTool('atlas', 'read_cad_part', { window_id: 'cad-1' }, context);
  expect(out).toContain('CAD part "Wall bracket"');
  expect(out).toContain('not built since the last change');
  expect(out).toContain("every one uses the recipe's own value");
  expect(out).toContain('function main(r, p)');
  cadWin().cadRun = runRecord({ ok: true, size: [50, 40, 50], volume: 15200, bodies: [{ name: 'Bracket' }] }, recipeHash(code, {}));
  out = await handleCadTool('atlas', 'read_cad_part', { window_id: 'cad-1' }, context);
  expect(out).toContain('Last build: OK. 50 × 40 × 50 mm, 15.2 cm³, bodies: Bracket.');
  cadWin().cadRun = runRecord({ ok: false, error: 'The recipe needs main' }, recipeHash(code, {}));
  out = await handleCadTool('atlas', 'read_cad_part', { window_id: 'cad-1' }, context);
  expect(out).toContain('Last build: FAILED. The recipe needs main');
});

test('edit_cad_part changes sizes and the recipe, saving only those fields', async () => {
  const out = await handleCadTool('atlas', 'edit_cad_part', { window_id: 'cad-1', params: { width: 80, holes: 3 } }, context);
  expect(out).toMatch(/Done: set width to 80, set holes to 3 in "Wall bracket"/);
  expect(readCad(cadWin()).values).toEqual({ width: 80, holes: 3 });
  expect(canvasRevision).toBe(4);
  const read = await handleCadTool('atlas', 'read_cad_part', { window_id: 'cad-1' }, context);
  expect(read).toContain('width = 80, holes = 3');
  const next = recipeById('knob').code;
  await handleCadTool('atlas', 'edit_cad_part', { window_id: 'cad-1', code: next, params: { width: null } }, context);
  expect(cadWin().cadCode).toBe(next);
  expect(cadWin()[paramKey('width')]).toBeNull();
});

test('edit_cad_part refuses broken recipes, bad sizes, other windows and reviewers', async () => {
  await expect(handleCadTool('atlas', 'edit_cad_part', { window_id: 'cad-1', code: 'function main( {' }, context)).resolves.toMatch(/^Error: The recipe has a typing mistake/);
  await expect(handleCadTool('atlas', 'edit_cad_part', { window_id: 'cad-1', code: 'const x = 1;' }, context)).resolves.toMatch(/needs a function called main/);
  await expect(handleCadTool('atlas', 'edit_cad_part', { window_id: 'cad-1', params: { 'a.b': 1 } }, context)).resolves.toMatch(/^Error: "a.b" is not a size/);
  await expect(handleCadTool('atlas', 'edit_cad_part', { window_id: 'cad-1' }, context)).resolves.toMatch(/^Error: Give a new recipe/);
  await expect(handleCadTool('atlas', 'read_cad_part', { window_id: 'doc-1' }, context)).resolves.toMatch(/^Error: That window is not a CAD part/);
  getSubAgentById.mockResolvedValue({ permission: 'reviewer' });
  await expect(handleCadTool('scout-1', 'edit_cad_part', { window_id: 'cad-1', params: { width: 9 } }, context)).resolves.toMatch(/reviewer sub-agents cannot change CAD parts/);
  expect(canvasRevision).toBe(3);
});

test('the CAD tools are defined, catalogued, and changes need approval', () => {
  for (const name of ['read_cad_part', 'edit_cad_part']) {
    expect(TOOL_DEFINITIONS.find((tool) => tool.function.name === name)).toBeDefined();
    expect(readFileSync('server/tools/handlers/index.js', 'utf8')).toContain(`'${name}': handleCadTool`);
  }
  expect(listToolCatalog().tools.find((tool) => tool.name === 'edit_cad_part')).toMatchObject({ risk: 'write' });
  expect(CAPABILITY_TO_TOOLS['canvas.cad.read']).toEqual(['read_cad_part']);
  expect(CAPABILITY_TO_TOOLS['canvas.cad']).toEqual(['edit_cad_part']);
});
