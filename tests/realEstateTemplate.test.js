import { jest } from '@jest/globals';
import * as Y from 'yjs';
import { loadRealEstateModules, REAL_ESTATE_MODULE_IDS } from '../server/templates/realEstate/modules.js';
import { buildRealEstateBoard } from '../server/templates/realEstate/board.js';
import { REAL_ESTATE_AGENTS } from '../server/templates/realEstate/agents.js';
import { applyBoardTemplate, BOARD_TEMPLATES, templateModelChoice } from '../server/templates/index.js';
import { appendInDoc, appendToTemplateWindow, findTemplateWindow } from '../server/realEstate/boardWrites.js';
import { snapshotToDoc, docToSnapshot } from '../server/collab/seedFromSnapshot.js';
import { layoutTemplateBoard, templateAgentsOnBoard, contentEdge } from '../src/lib/templates/boardTemplates.js';
import { withGroupDefaultHotkeys } from '../src/lib/groupHotkeys.js';
import { TOOL_DEFINITIONS } from '../server/tools/definitions.js';
import { TOOL_REGISTRY } from '../server/tools/handlers/index.js';
import { validateV3 } from '../src/lib/modules/manifestV3Checks.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { handleRealEstateTool } from '../server/tools/handlers/realEstate.js';

const AGENT_IDS = { listingWriter: 'lw-1', marketAnalyst: 'ma-1', transactionCoordinator: 'tc-1', followUp: 'fu-1' };

function fakeCreateAgent() {
  return jest.fn(async (parentId, input) => ({
    id: `${input.name.toLowerCase().replace(/\W+/g, '-')}-${parentId}`,
    name: input.name,
    model_provider: input.modelProvider,
    model_name: input.modelName,
    tool_scopes: input.toolScopes,
  }));
}

describe('Real Estate Team template', () => {
  test('ships five sealed modules with a valid manifest v3 label', async () => {
    const modules = await loadRealEstateModules();
    expect(Object.keys(modules)).toEqual([...REAL_ESTATE_MODULE_IDS]);
    for (const mod of Object.values(modules)) {
      expect(mod.manifest.name).toBeTruthy();
      expect(mod.manifest.manifest).toBe(3);
      expect(validateV3(mod.manifest)).toEqual([]);
      expect(mod.manifest.permissions).toContain('storage');
      for (const tool of mod.manifest.tools || []) expect(mod.source).toContain(`censai.tools.handle('${tool.name}'`);
      expect(mod.source).toMatch(/<script>[\s\S]*censai\.storage/);
      expect(mod.source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/); // tokens only
    }
    expect(modules['cma-sheet'].manifest.permissions).toEqual(['storage', 'agent']);
    expect(modules['deal-pipeline'].manifest.tools.map(t => t.name)).toEqual(['add_deal', 'move_deal', 'list_deals']);
  });

  test('builds four groups on F1 to F4 with every window placed in a group', async () => {
    const board = buildRealEstateBoard({ agents: AGENT_IDS, modules: await loadRealEstateModules(), makeId: () => 't1' });
    expect(board.groups.map(g => g.label)).toEqual(['Listings', 'Active Deals', 'Marketing', 'Team Chat']);
    expect(board.hotkeys).toEqual({ 1: 're-group-listings-t1', 2: 're-group-deals-t1', 3: 're-group-marketing-t1', 4: 're-group-team-t1' });
    expect(board.windows.every(w => w.groupId)).toBe(true);
    expect(board.windows.filter(w => w.kind === 'module')).toHaveLength(5);
    expect(board.windows.filter(w => w.kind === 'chat').map(w => w.agentId).sort()).toEqual(['fu-1', 'lw-1', 'ma-1', 'tc-1']);
    expect(findTemplateWindow(board.windows, 'teamChat').kind).toBe('groupChat');
    expect(findTemplateWindow(board.windows, 'outbox').drafts[0]).toMatchObject({ status: 'pending', agentId: 'fu-1' });
    expect(findTemplateWindow(board.windows, 'listingWriter').draftWindowId).toBe(board.windowIds.listingDraft);
    // Every window id is a valid canvas doc id.
    expect(board.windows.every(w => /^[a-zA-Z0-9._:-]{1,96}$/.test(w.id))).toBe(true);
  });

  test('creates the four agents with their own tools and, if asked, a local Ollama model', async () => {
    const createAgent = fakeCreateAgent();
    const board = await applyBoardTemplate('real-estate-team', {
      scope: { userId: 7, workspaceId: 'ws-1' },
      input: { models: 'ollama', ollamaModel: 'qwen2.5' },
      createAgent,
    });
    expect(createAgent).toHaveBeenCalledTimes(4);
    const [, first, scope] = createAgent.mock.calls[0];
    expect(scope).toEqual({ userId: 7, workspaceId: 'ws-1' });
    expect(first).toMatchObject({ name: 'Listing Writer', modelProvider: 'ollama', modelName: 'qwen2.5', permission: 'worker' });
    expect(first.toolScopes).toEqual({ mode: 'custom', tools: expect.arrayContaining(['fair_housing_check']) });
    expect(board.agents.map(a => a.name)).toEqual(REAL_ESTATE_AGENTS.map(a => a.name));
    expect(board.agents[0]).toMatchObject({ starters: expect.any(Array), description: expect.any(String), model_provider: 'ollama' });
    expect(BOARD_TEMPLATES.find(t => t.id === 'real-estate-team').modules).toHaveLength(5);
  });

  test('no agent can send: client messages only reach the Outbox', () => {
    for (const agent of REAL_ESTATE_AGENTS) {
      for (const tool of agent.tools) expect(TOOL_DEFINITIONS.some(d => d.function.name === tool)).toBe(true);
      expect(agent.tools.some(t => /send|mail|sms/.test(t))).toBe(false);
    }
    for (const name of ['fair_housing_check', 'post_team_chat', 'draft_client_message', 'deal_deadlines']) {
      expect(TOOL_REGISTRY[name]).toBe(handleRealEstateTool);
    }
  });

  test('defaults to the board model and refuses unknown templates', async () => {
    expect(templateModelChoice({})).toEqual({ modelProvider: null, modelName: null });
    expect(templateModelChoice({ models: 'ollama' })).toEqual({ modelProvider: 'ollama', modelName: 'llama3.1' });
    await expect(applyBoardTemplate('nope', { scope: {}, createAgent: fakeCreateAgent() })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('laying the template out on the canvas', () => {
  test('fits each window into its group tile, to the right of existing content', async () => {
    const board = await applyBoardTemplate('real-estate-team', { scope: {}, createAgent: fakeCreateAgent() });
    const existing = [{ id: 'x', x: 100, y: 50, w: 400, h: 300 }];
    const { windows, groups } = layoutTemplateBoard(board, { wins: existing, canvasGroups: [] });
    expect(contentEdge(existing)).toEqual({ right: 500, top: 50 });
    expect(Math.min(...groups.map(g => g.x))).toBeGreaterThanOrEqual(500);
    for (const win of windows) {
      const group = groups.find(g => g.id === win.groupId);
      expect(win.x).toBeGreaterThanOrEqual(group.x);
      expect(win.y).toBeGreaterThanOrEqual(group.y);
      expect(win.x + win.w).toBeLessThanOrEqual(group.x + group.w + 1);
      expect(win.y + win.h).toBeLessThanOrEqual(group.y + group.h + 1);
      expect(win.w).toBe(win.width);
    }
    expect(groups.every(g => g.root && g.hotkey && g.templateAgents.length === 4)).toBe(true);
    expect(templateAgentsOnBoard(groups)).toHaveLength(4);
  });

  test('group hotkeys fill free slots without overriding a person\'s own binding', () => {
    const groups = [{ id: 'g1', hotkey: '1' }, { id: 'g2', hotkey: '2' }, { id: 'g3' }];
    expect(withGroupDefaultHotkeys({}, groups)).toEqual({ 1: 'g1', 2: 'g2' });
    expect(withGroupDefaultHotkeys({ 1: 'mine' }, groups)).toEqual({ 1: 'mine', 2: 'g2' });
    expect(withGroupDefaultHotkeys({ 5: 'g2' }, groups)).toEqual({ 1: 'g1', 5: 'g2' });
  });
});

describe('agents writing to the board', () => {
  function teamBoard() {
    return { wins: [
      { id: 'w-team', kind: 'groupChat', templateRole: 'teamChat', x: 0, y: 0, w: 400, h: 400, msgs: [{ from: 'me', text: 'hi' }] },
      { id: 'w-out', kind: 'outbox', templateRole: 'outbox', x: 500, y: 0, w: 400, h: 400 },
    ] };
  }

  test('appends to the live doc without dropping existing messages', () => {
    const doc = snapshotToDoc(teamBoard());
    expect(appendInDoc(doc, 'teamChat', 'msgs', { from: 'tc-1', text: 'Inspection ends Friday' })).toBe('w-team');
    expect(appendInDoc(doc, 'outbox', 'drafts', { id: 'd1' })).toBe('w-out');
    expect(appendInDoc(doc, 'missing', 'msgs', {})).toBeNull();
    const wins = docToSnapshot(doc).wins;
    expect(wins.find(w => w.id === 'w-team').msgs.map(m => m.text)).toEqual(['hi', 'Inspection ends Friday']);
    expect(wins.find(w => w.id === 'w-out').drafts).toEqual([{ id: 'd1' }]);
  });

  test('also commits the append to the saved board', async () => {
    const value = teamBoard();
    const queries = [];
    const client = {
      query: jest.fn(async (sql, params) => {
        queries.push(sql.trim().split(/\s+/)[0]);
        if (sql.startsWith('SELECT')) return { rows: [{ value }] };
        if (sql.startsWith('UPDATE')) Object.assign(value, JSON.parse(params[2]));
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    const db = { connect: async () => client };
    const live = jest.fn(async (_ws, mutate) => { mutate(new Y.Doc()); return true; });
    const id = await appendToTemplateWindow(db, { workspaceId: 'ws', role: 'teamChat', field: 'msgs', item: { from: 'tc-1', text: 'x' } }, { live });
    expect(id).toBe('w-team');
    expect(queries).toEqual(['BEGIN', 'SELECT', 'UPDATE', 'COMMIT']);
    expect(value.wins[0].msgs).toHaveLength(2);
  });

  test('fair_housing_check explains each hit', async () => {
    const reply = await handleRealEstateTool('lw-1', 'fair_housing_check', { text: 'Ideal for empty nesters.' });
    expect(reply).toMatch(/rewrite before publishing/);
    expect(reply).toMatch(/"Ideal for empty nesters"/i);
    expect(await handleRealEstateTool('lw-1', 'fair_housing_check', { text: 'Two-car garage.' })).toMatch(/no risky words/);
  });
});

describe('sample deals', () => {
  test('the pipeline starts with a contract whose inspection is due soon', async () => {
    const { dueDeadlines } = await import('../server/realEstate/deadlines.js');
    const today = new Date(2026, 9, 7);
    const board = buildRealEstateBoard({ agents: AGENT_IDS, modules: await loadRealEstateModules(), today });
    const deals = findTemplateWindow(board.windows, 'dealPipeline').moduleData.deals;
    expect(deals[0]).toMatchObject({ client: 'Rivera', stage: 'Under contract', contractDate: '2026-09-29' });
    const due = dueDeadlines(deals, { today, daysAhead: 3 });
    expect(due.map(d => `${d.deadline}:${d.days}`)).toEqual(['Inspection period ends:2']);
  });
});

describe('Real Estate Team in the Add menu', () => {
  test('sits under Ready-made boards and is found by searching', () => {
    const boards = buildAddSections({}).find(s => s.id === 'boards');
    expect(boards.items).toContainEqual(expect.objectContaining({ label: 'Real Estate Team', action: { type: 'boardTemplate', id: 'real-estate-team' } }));
    const found = buildAddSections({ query: 'showings' }).find(s => s.id === 'boards');
    expect(found.items.map(i => i.label)).toEqual(['Real Estate Team']);
    expect(BOARD_TEMPLATES.map(t => t.id)).toContain('real-estate-team');
  });
});
