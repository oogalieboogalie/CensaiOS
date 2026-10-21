import { jest } from '@jest/globals';

// The board: Atlas (chat) and a Research window.
const board = [
  { id: 'w-atlas', kind: 'chat', agentId: 'atlas', x: 0, y: 0, w: 400, h: 300 },
  { id: 'w-rs', kind: 'research', title: 'Research', x: 800, y: 0, w: 760, h: 620 },
];
const placeHelpCard = jest.fn(async (_ws, input) => ({ id: input.id }));
const settleHelpCard = jest.fn(async () => true);
const patchHelpCard = jest.fn(async () => true);
const readHelpCard = jest.fn(async () => ({ toLabel: 'Research', status: 'completed', result: 'done' }));
const askResearch = jest.fn(async () => ({ answer: 'Acme is in Austin [1].', sources: [{ n: 1, title: 'About Acme', url: 'https://acme.example' }] }));
const researchDeps = jest.fn(async () => ({ tavily: null }));

jest.unstable_mockModule('../server/collab/liveDoc.js', () => ({
  openCanvasDocReader: async () => ({ doc: {}, close: async () => {} }),
  transactCanvasDoc: async () => false,
}));
jest.unstable_mockModule('../server/agent-registry/helpCards.js', () => ({
  readDocWindows: () => board, placeHelpCard, settleHelpCard, patchHelpCard, readHelpCard,
}));
jest.unstable_mockModule('../server/research/deps.js', () => ({ researchDeps }));
jest.unstable_mockModule('../server/research/service.js', () => ({ askResearch }));

const { listBoardHelpers, requestBoardHelp, boardHelpStatus, isBoardRequestId } = await import('../server/agent-registry/boardHelp.js');
const { listBoardAgents, searchBoardAgents } = await import('../src/lib/agentNetwork/boardAgents.js');

const scope = { workspaceId: 'ws-a', userId: 7 };

test('the Research window is on the network as a web research helper', async () => {
  const agents = listBoardAgents(board);
  const research = agents.find((a) => a.windowId === 'w-rs');
  expect(research).toMatchObject({ executor: 'research', name: 'Research', abilities: ['web research', 'citations'] });
  expect(searchBoardAgents(agents, 'web research').map((a) => a.windowId)).toEqual(['w-rs']);
  const helpers = await listBoardHelpers('ws-a', 'find facts on the web', 5);
  expect(helpers).toEqual([expect.objectContaining({ card_id: 'window:w-rs', kind: 'web_research' })]);
});

test('an agent asks Research and gets the answer with its sources', async () => {
  const out = await requestBoardHelp(scope, {
    cardId: 'window:w-rs', task: 'Where is Acme based?', fromWindowId: 'w-atlas', fromLabel: 'Atlas', waitSeconds: 10,
  });
  expect(researchDeps).toHaveBeenCalledWith(scope, { tavily: 'optional' });
  expect(askResearch).toHaveBeenCalledWith(scope, 'Where is Acme based?', { tavily: null });
  expect(placeHelpCard).toHaveBeenCalledWith('ws-a', expect.objectContaining({ executor: 'research', toWindowId: 'w-rs' }));
  expect(out.request_id).toMatch(/^research:/);
  expect(out.status).toBe('completed');
  expect(out.result).toBe('Acme is in Austin [1].\n\nSources:\n[1] About Acme https://acme.example');
  expect(isBoardRequestId(out.request_id)).toBe(true);
  const id = out.request_id.slice('research:'.length);
  await boardHelpStatus(scope, out.request_id);
  expect(readHelpCard).toHaveBeenCalledWith('ws-a', `help-research-${id}`);
});
