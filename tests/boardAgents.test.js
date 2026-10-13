import { listBoardAgents, listHelpCards, searchBoardAgents } from '../src/lib/agentNetwork/boardAgents.js';

const records = {
  nexus: { id: 'nexus', name: 'Nexus', role: 'Databases', model_provider: 'openai', model_name: 'gpt-4o' },
  echo: { id: 'echo', name: 'Echo', role: 'Business brain', model_provider: 'ollama', model_name: 'llama3' },
};
const wins = [
  { id: 'c1', kind: 'chat', agentId: 'nexus', x: 0, y: 0, w: 400, h: 300 },
  { id: 'c2', kind: 'chat', agentId: 'echo', x: 600, y: 0, w: 400, h: 300 },
  { id: 'cli', kind: 'agentConsole', cli: 'codex', x: 0, y: 600, w: 640, h: 640 },
  { id: 'm1', kind: 'module', status: 'ready', manifest: { name: 'Tip calculator', description: 'Splits a bill' }, x: 0, y: 0, w: 1, h: 1 },
  { id: 'm2', kind: 'module', status: 'building', request: 'a timer', x: 0, y: 0, w: 1, h: 1 },
  { id: 'doc', kind: 'doc', x: 0, y: 0, w: 1, h: 1 },
  { id: 'h1', kind: 'agentHelp', toWindowId: 'c1', status: 'working', createdAt: '2026-10-08T10:00:00Z' },
  { id: 'h2', kind: 'agentHelp', toWindowId: 'c2', status: 'completed', createdAt: '2026-10-08T11:00:00Z' },
];
const agentFor = (id) => records[id] || null;

test('every agent window on the board is listed with what it can do and whether it is busy', () => {
  const agents = listBoardAgents(wins, { agentFor });
  expect(agents.map((a) => [a.windowId, a.executor, a.name, a.status])).toEqual([
    ['c1', 'network', 'Nexus', 'working'],
    ['c2', 'network', 'Echo', 'ready'],
    ['cli', 'cli', 'Codex', 'ready'],
    ['m1', 'module', 'Tip calculator', 'ready'],
  ]);
  const nexus = agents[0];
  expect(nexus.cardId).toBe('agent:nexus');
  expect(nexus.abilities).toEqual(expect.arrayContaining(['text', 'images']));
  expect(nexus.activeRequests).toBe(1);
  expect(agents[1].abilities).toEqual(['text']);
});

test('search ranks by what agents can do, using the server ranking', () => {
  const agents = listBoardAgents(wins, { agentFor });
  expect(searchBoardAgents(agents, 'databases').map((a) => a.windowId)).toEqual(['c1']);
  expect(searchBoardAgents(agents, 'fix a bug in the code').map((a) => a.windowId)).toEqual(['cli']);
  expect(searchBoardAgents(agents, 'read images').map((a) => a.windowId)).toEqual(['c1']);
  expect(searchBoardAgents(agents, '')).toHaveLength(4);
});

test('help cards are listed newest first', () => {
  expect(listHelpCards(wins).map((c) => c.id)).toEqual(['h2', 'h1']);
});

test('a Research window joins the directory as a web research helper', () => {
  const agents = listBoardAgents([...wins, { id: 'rs', kind: 'research', x: 0, y: 0, w: 1, h: 1 }], { agentFor });
  const research = agents.find((a) => a.windowId === 'rs');
  expect(research).toMatchObject({ executor: 'research', name: 'Research', status: 'ready' });
  expect(searchBoardAgents(agents, 'web research')[0].windowId).toBe('rs');
});

test('a LeadHound window is on the directory as a lead finder', () => {
  const agents = listBoardAgents([{ id: 'lh', kind: 'leadHound', x: 0, y: 0, w: 1, h: 1 }]);
  expect(agents).toEqual([expect.objectContaining({ windowId: 'lh', executor: 'leadhound', name: 'LeadHound', status: 'ready' })]);
  expect(searchBoardAgents(agents, 'find sales leads for my business')[0].windowId).toBe('lh');
  const busy = listBoardAgents([{ id: 'lh', kind: 'leadHound', leadHound: { hunting: true } }]);
  expect(busy[0].status).toBe('working');
});
