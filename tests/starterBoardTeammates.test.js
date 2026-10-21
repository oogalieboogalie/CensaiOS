import { jest } from '@jest/globals';
import * as Y from 'yjs';
import { AGENT_TEAM_AGENTS, buildAgentTeamBoard } from '../server/templates/starters/agentTeam.js';
import { buildSmallBusinessBoard } from '../server/templates/starters/smallBusiness.js';
import { layoutTemplateBoard } from '../src/lib/templates/boardTemplates.js';
import { STARTER_BOARD_TOOL_NAMES } from '../server/tools/rbac/familyBaseline.js';
import { onLogRecord } from '../server/logger.js';
import { CANVAS_ROOT } from '../server/collab/ySchema.js';
import { valueToY } from '../server/collab/seedFromSnapshot.js';
import * as discovery from '../server/agent-registry/discovery.js';

// Two boards, each its own canvas. Discover and ask must stay on one board.
const docs = new Map();

jest.unstable_mockModule('../server/collab/liveDoc.js', () => ({
  openCanvasDocReader: async (workspaceId) => {
    const doc = docs.get(String(workspaceId));
    return doc ? { doc, close: async () => {} } : null;
  },
  transactCanvasDoc: async (workspaceId, mutate) => {
    const doc = docs.get(String(workspaceId));
    if (!doc) return false;
    doc.transact(() => mutate(doc));
    return true;
  },
}));

jest.unstable_mockModule('../server/agent-registry/discovery.js', () => ({
  ...discovery,
  discoverAgents: async (_pool, input) => ({ query: input?.query || '', items: [] }),
}));

const { handleAgentNetworkTool } = await import('../server/tools/handlers/agentNetwork.js');
const { __setBoardTeammateRunnerForTests } = await import('../server/agent-registry/boardAgentAsk.js');
const { readDocWindows } = await import('../server/agent-registry/helpCards.js');

const teamIds = { lead: 'lead-1', researcher: 'researcher-1', builder: 'builder-1', critic: 'critic-1' };
const otherIds = { salesHelper: 'sales-1', officeManager: 'office-1' };
const team = buildAgentTeamBoard({ agents: teamIds, makeId: () => 'team' });
const other = buildSmallBusinessBoard({ agents: otherIds, makeId: () => 'other' });
const scope = { userId: 7 };

function seed(workspaceId, windows) {
  const doc = new Y.Doc();
  const map = new Y.Map();
  doc.getMap(CANVAS_ROOT).set('windows', map);
  for (const win of windows) map.set(win.id, valueToY(win));
  docs.set(workspaceId, doc);
  return doc;
}

beforeEach(() => {
  docs.clear();
  seed('ws-team', layoutTemplateBoard(team).windows);
  seed('ws-other', layoutTemplateBoard(other).windows);
  __setBoardTeammateRunnerForTests(async ({ agentId, task }) => {
    if (agentId !== 'researcher-1') throw new Error('asked the wrong teammate');
    return `Stand-in answer for ${task}`;
  });
});

afterAll(() => {
  __setBoardTeammateRunnerForTests(null);
});

test('the Lead on a fresh Agent Team board can find and ask teammates, and nobody from another board', () => {
  const lead = AGENT_TEAM_AGENTS.find((agent) => agent.key === 'lead');
  expect(lead.tools).toEqual(expect.arrayContaining(['discover_agents', 'request_agent_help']));
  expect(lead.tools).toEqual(expect.arrayContaining([...STARTER_BOARD_TOOL_NAMES]));
});

test('discover_agents returns this board\'s other agents and nothing from another board', async () => {
  const found = JSON.parse(await handleAgentNetworkTool('lead-1', 'discover_agents', { query: '' }, { ...scope, workspaceId: 'ws-team' }));
  expect(found.board_helpers.map((helper) => helper.name)).toEqual(['Builder', 'Critic', 'Researcher']);
  expect(found.board_helpers.map((helper) => helper.kind)).toEqual(['board_agent', 'board_agent', 'board_agent']);
  expect(found.board_helpers.every((helper) => helper.card_id.startsWith('window:'))).toBe(true);

  const elsewhere = JSON.parse(await handleAgentNetworkTool('sales-1', 'discover_agents', { query: '' }, { ...scope, workspaceId: 'ws-other' }));
  const names = (elsewhere.board_helpers || []).map((helper) => helper.name);
  expect(names).toEqual(expect.arrayContaining(['Office Manager']));
  for (const name of ['Lead', 'Researcher', 'Builder', 'Critic']) expect(names).not.toContain(name);
});

test('an ask to the Researcher gets an answer back and both chats show it', async () => {
  const lines = [];
  const stop = onLogRecord((record) => {
    if (record.namespace === 'board-help') lines.push(record.message);
  });
  const found = JSON.parse(await handleAgentNetworkTool('lead-1', 'discover_agents', { query: '' }, { ...scope, workspaceId: 'ws-team' }));
  const researcher = found.board_helpers.find((helper) => helper.name === 'Researcher');
  const out = JSON.parse(await handleAgentNetworkTool('lead-1', 'request_agent_help', {
    card_id: researcher.card_id,
    task: 'Find three competitors',
    wait_seconds: 10,
  }, { ...scope, workspaceId: 'ws-team', windowId: team.windowIds.lead }));
  stop();

  expect(out).toMatchObject({ agent: 'Researcher', status: 'completed', result: 'Stand-in answer for Find three competitors' });
  expect(lines).toEqual(['Lead asked Researcher: answered']);

  const wins = readDocWindows(docs.get('ws-team'));
  const researcherChat = wins.find((win) => win.id === team.windowIds.researcher);
  expect(researcherChat.msgs[0]).toMatchObject({
    text: 'Find three competitors',
    helpRequest: { fromLabel: 'Lead' },
  });
  expect(researcherChat.msgs[1].text).toBe('Stand-in answer for Find three competitors');
  const leadChat = wins.find((win) => win.id === team.windowIds.lead);
  expect(leadChat.msgs.map((msg) => msg.text)).toEqual([
    'Find three competitors',
    'Help from Researcher:\n\nStand-in answer for Find three competitors',
  ]);
  const otherWins = readDocWindows(docs.get('ws-other'));
  expect(otherWins.every((win) => !Array.isArray(win.msgs) || win.msgs.every((msg) => !msg.helpRequest))).toBe(true);
});
