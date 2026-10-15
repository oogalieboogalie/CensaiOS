import { jest } from '@jest/globals';
import { applyBoardTemplate, BOARD_TEMPLATES } from '../server/templates/index.js';
import { buildDeveloperBoard, DEVELOPER_AGENTS } from '../server/templates/starters/developer.js';
import { buildCreativeBoard, CREATIVE_AGENTS } from '../server/templates/starters/creative.js';
import { buildSmallBusinessBoard, SMALL_BUSINESS_AGENTS } from '../server/templates/starters/smallBusiness.js';
import { buildCodeWorkspaceBoard, CODE_WORKSPACE_AGENTS } from '../server/templates/starters/codeWorkspace.js';
import { buildAgentTeamBoard, AGENT_TEAM_AGENTS } from '../server/templates/starters/agentTeam.js';
import { findTemplateWindow } from '../server/realEstate/boardWrites.js';
import { layoutTemplateBoard } from '../src/lib/templates/boardTemplates.js';
import { TOOL_DEFINITIONS } from '../server/tools/definitions.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { WORK_COVERS } from '../src/components/covers/coversWork.jsx';

const STARTERS = [
  { id: 'developer', build: buildDeveloperBoard, agents: DEVELOPER_AGENTS, groups: ['Code', 'Plan', 'Run and review', 'Team Chat'] },
  { id: 'creative-studio', build: buildCreativeBoard, agents: CREATIVE_AGENTS, groups: ['Brief', 'Design', 'Video', 'Plan and share'] },
  { id: 'code-workspace', build: buildCodeWorkspaceBoard, agents: CODE_WORKSPACE_AGENTS, groups: ['Editor', 'Preview', 'Source control', 'Notes'] },
  { id: 'agent-team', build: buildAgentTeamBoard, agents: AGENT_TEAM_AGENTS, groups: ['Team room', 'Agents', 'Workflows', 'Directory'] },
  { id: 'small-business', build: buildSmallBusinessBoard, agents: SMALL_BUSINESS_AGENTS, groups: ['Customers', 'Money', 'This week', 'Team Chat'] },
];

const idsFor = (agents) => Object.fromEntries(agents.map(agent => [agent.key, `${agent.key}-1`]));
const KINDS = new Set(WINDOW_MANIFESTS.map(m => m.kind));

describe.each(STARTERS)('$id starter board', ({ id, build, agents, groups }) => {
  test('lays out four groups on F1 to F4 with every window a real, placed window', () => {
    const board = build({ agents: idsFor(agents), makeId: () => 't1' });
    expect(board.templateId).toBe(id);
    expect(board.groups.map(g => g.label)).toEqual(groups);
    expect(Object.keys(board.hotkeys)).toEqual(['1', '2', '3', '4']);
    expect(board.windows.every(w => w.groupId)).toBe(true);
    for (const win of board.windows) expect(KINDS.has(win.kind)).toBe(true);
    expect(board.windows.every(w => /^[a-zA-Z0-9._:-]{1,96}$/.test(w.id))).toBe(true);
    expect(new Set(board.windows.map(w => w.id)).size).toBe(board.windows.length);
    // Every agent has its own chat, and the board has a Team Chat agents can post in.
    expect(board.windows.filter(w => w.kind === 'chat').map(w => w.agentId).sort()).toEqual(agents.map(a => `${a.key}-1`).sort());
    expect(findTemplateWindow(board.windows, 'teamChat').kind).toBe('groupChat');
  });

  test('its agents only have tools that exist, and none can send, merge or deploy', () => {
    for (const agent of agents) {
      for (const tool of agent.tools) expect(TOOL_DEFINITIONS.some(d => d.function.name === tool)).toBe(true);
      expect(agent.tools.some(t => /send|mail|merge|submit|write_file|delete/.test(t))).toBe(false);
      expect(agent.starters.length).toBeGreaterThan(0);
    }
  });

  test('is listed with its groups described, in the Add menu with a cover', () => {
    const meta = BOARD_TEMPLATES.find(t => t.id === id);
    expect(meta.groups).toEqual(groups);
    for (const group of groups) expect(meta.groupContents[group]).toBeTruthy();
    const item = buildAddSections({}).find(s => s.id === 'boards').items.find(i => i.action.id === id);
    expect(item).toBeTruthy();
    expect(WORK_COVERS[item.cover]).toBeTruthy();
  });

  test('creates its agents on the board and returns the board', async () => {
    const createAgent = jest.fn(async (parentId, input) => ({ id: `${input.name}-sub`, name: input.name }));
    const board = await applyBoardTemplate(id, { scope: { userId: 1, workspaceId: 'ws' }, createAgent });
    expect(createAgent).toHaveBeenCalledTimes(agents.length);
    expect(createAgent.mock.calls[0][1]).toMatchObject({ permission: 'worker', toolScopes: { mode: 'custom' } });
    expect(board.agents.map(a => a.name)).toEqual(agents.map(a => a.name));
    expect(board.windows.find(w => w.kind === 'chat').agentId).toMatch(/-sub$/);
  });
});

test('the client fills editors the server only names with their blank starter documents', () => {
  const creative = buildCreativeBoard({ agents: idsFor(CREATIVE_AGENTS), makeId: () => 'c1' });
  const business = buildSmallBusinessBoard({ agents: idsFor(SMALL_BUSINESS_AGENTS), makeId: () => 'b1' });
  const { windows } = layoutTemplateBoard({ ...creative, groups: [...creative.groups], windows: [...creative.windows, ...business.windows] });
  const vector = windows.find(w => w.kind === 'creativeVector');
  expect(vector.title).toBe('Artwork');
  expect(Object.keys(vector).length).toBeGreaterThan(Object.keys(creative.windows.find(w => w.kind === 'creativeVector')).length + 5);
  expect(windows.find(w => w.kind === 'officeSheets').officeBook).toBeTruthy();
  expect(windows.find(w => w.kind === 'teleprompter').text).toMatch(/Welcome to your studio/);
});

test('the Agent Team room has all four agents answering in turn', () => {
  const board = buildAgentTeamBoard({ agents: idsFor(AGENT_TEAM_AGENTS), makeId: () => 'a1' });
  expect(findTemplateWindow(board.windows, 'teamChat').members).toEqual(['lead-1', 'researcher-1', 'builder-1', 'critic-1']);
  // The team room is the hand-off; nobody can start outside agents with write tools.
  for (const agent of AGENT_TEAM_AGENTS) expect(agent.tools).not.toEqual(expect.arrayContaining(['request_agent_help']));
});

test('starter boards come first; the Real Estate Team is still there', () => {
  expect(BOARD_TEMPLATES.map(t => t.id)).toEqual(['developer', 'code-workspace', 'creative-studio', 'agent-team', 'small-business', 'real-estate-team']);
});
