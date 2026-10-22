import { jest } from '@jest/globals';

// The board: Atlas (chat), a Claude Code console and a ready module.
const board = [
  { id: 'w-atlas', kind: 'chat', agentId: 'atlas', x: 0, y: 0, w: 400, h: 300 },
  { id: 'w-cli', kind: 'agentConsole', cli: 'claudecode', folder: '/repo', x: 1000, y: 0, w: 400, h: 300 },
  { id: 'w-mod', kind: 'module', status: 'ready', title: 'Price checker', request: 'Check prices', x: 0, y: 800, w: 400, h: 300 },
  { id: 'w-lh', kind: 'leadHound', x: 1000, y: 800, w: 820, h: 640 },
];
const tasks = new Map();
const manager = { tasks, start: jest.fn(async () => ({ id: 't1' })) };
const placeHelpCard = jest.fn(async (_ws, input) => ({ id: input.id }));
const settleHelpCard = jest.fn(async () => true);
const patchHelpCard = jest.fn(async () => true);
const readHelpCard = jest.fn(async () => null);
const askModule = jest.fn(async () => 'Prices look fine.');
const runLeadHound = jest.fn(async (brief) => ({
  brief, leads: [{ company: 'Bright Smiles', fitScore: 92, url: 'https://brightsmiles.example', why_fit: 'Phones overflow.', sequence: [] }],
}));
const assertSystemAdmin = jest.fn(async () => ({ userId: 7, role: 'admin' }));
let mode = 'local_desktop';

jest.unstable_mockModule('../server/collab/liveDoc.js', () => ({
  openCanvasDocReader: async () => ({ doc: {}, close: async () => {} }),
  transactCanvasDoc: async () => false,
}));
jest.unstable_mockModule('../server/agent-registry/helpCards.js', () => ({
  readDocWindows: () => board, placeHelpCard, settleHelpCard, patchHelpCard, readHelpCard,
}));
jest.unstable_mockModule('../server/cli-agents/index.js', () => ({ getCliTaskManager: () => manager }));
jest.unstable_mockModule('../server/cli-agents/folders.js', () => ({
  allowedRoots: async () => [{ path: '/repo', current: true }],
  assertAllowedFolder: async (folder) => folder,
}));
jest.unstable_mockModule('../server/security/systemAdmin.js', () => ({ assertSystemAdmin }));
jest.unstable_mockModule('../server/modules/ask.js', () => ({ askModule }));
jest.unstable_mockModule('../server/routes/agents/leadhound.js', () => ({ createCompleter: () => async () => '' }));
jest.unstable_mockModule('../server/leadhound/tavily.js', () => ({
  resolveTavilyKey: async () => ({ apiKey: 'tvly-x', source: 'byok' }),
  createTavilyClient: () => ({}),
}));
jest.unstable_mockModule('../server/leadhound/pipeline.js', () => ({ runLeadHound }));
jest.unstable_mockModule('../server/middleware/runtimeMode.js', () => ({ localFilesystemAllowed: () => mode !== 'cloud_saas' }));

const {
  listBoardHelpers, requestBoardHelp, boardHelpStatus, isBoardRequestId, __setBoardHelpSleepForTests,
} = await import('../server/agent-registry/boardHelp.js');
const { __setBoardTeammateRunnerForTests } = await import('../server/agent-registry/boardAgentAsk.js');

const scope = { workspaceId: 'ws-a', userId: 7 };

beforeEach(() => {
  jest.clearAllMocks();
  tasks.clear();
  mode = 'local_desktop';
  __setBoardHelpSleepForTests(async () => {});
  __setBoardTeammateRunnerForTests(async ({ agentId, task }) => `answer for ${agentId}: ${task}`);
});

afterEach(() => {
  __setBoardTeammateRunnerForTests(null);
});

test('the chat agents, coding CLIs and modules on the board are listed with window card ids', async () => {
  const helpers = await listBoardHelpers('ws-a', '', 5);
  expect(helpers.map((h) => [h.card_id, h.kind])).toEqual(expect.arrayContaining([
    ['window:w-atlas', 'board_agent'], ['window:w-cli', 'coding_cli'], ['window:w-mod', 'module'], ['window:w-lh', 'lead_finder'],
  ]));
  expect(helpers).toHaveLength(4);
});

test('a search by what an agent knows finds the family agent with that role', async () => {
  const helpers = await listBoardHelpers('ws-a', 'backend', 5);
  expect(helpers[0]).toMatchObject({ card_id: 'window:w-atlas', name: 'Atlas' });
  expect(helpers[0].description).toMatch(/backend/i);
});

test('an agent asks a coding CLI: a console task starts and the card waits on its approval', async () => {
  manager.start.mockImplementationOnce(async () => {
    tasks.set('t1', { id: 't1', status: 'needs_approval' });
    return { id: 't1' };
  });
  const out = await requestBoardHelp(scope, {
    cardId: 'window:w-cli', task: 'Fix the failing test', fromWindowId: 'w-atlas', requesterAgentId: 'atlas', fromLabel: 'Atlas', waitSeconds: 30,
  });
  expect(assertSystemAdmin).toHaveBeenCalledWith({ session: { userId: 7 } });
  expect(manager.start).toHaveBeenCalledWith(expect.objectContaining({
    cli: 'claudecode', folder: '/repo', user: { userId: 7, name: 'Atlas' },
    prompt: expect.stringContaining('Fix the failing test'),
  }));
  expect(placeHelpCard).toHaveBeenCalledWith('ws-a', expect.objectContaining({
    id: 'help-cli-t1', executor: 'cli', fromWindowId: 'w-atlas', toWindowId: 'w-cli', awaitingTool: true,
    request: { cliTaskId: 't1', task: 'Fix the failing test', status: 'working' },
  }));
  // The idle console on the board now shows that task, with its approval.
  expect(patchHelpCard).toHaveBeenCalledWith('ws-a', 'w-cli', { taskId: 't1' });
  // A step waiting for a person ends the wait; the answer reaches the chat later.
  expect(out).toMatchObject({ request_id: 'cli:t1', agent: 'Claude Code', status: 'needs approval' });
  expect(settleHelpCard).toHaveBeenCalledWith('ws-a', { id: 'help-cli-t1' }, expect.objectContaining({ status: 'needs approval' }));
});

test('a finished CLI task comes back as the answer', async () => {
  tasks.set('t2', { id: 't2', status: 'done', summary: 'Fixed the test.' });
  expect(await boardHelpStatus(scope, 'cli:t2')).toEqual({ request_id: 'cli:t2', status: 'completed', result: 'Fixed the test.', error: null });
  expect(await boardHelpStatus(scope, 'cli:gone')).toMatchObject({ status: 'failed' });
});

test('coding CLIs stay off on cloud installs and for non-admins', async () => {
  mode = 'cloud_saas';
  await expect(requestBoardHelp(scope, { cardId: 'window:w-cli', task: 'x' })).rejects.toThrow(/desktop install/);
  mode = 'local_desktop';
  assertSystemAdmin.mockRejectedValueOnce(new Error('System administrator access is required.'));
  await expect(requestBoardHelp(scope, { cardId: 'window:w-cli', task: 'x' })).rejects.toThrow(/administrator/);
  expect(manager.start).not.toHaveBeenCalled();
});

test('an agent asks a module and gets its answer in the same call', async () => {
  const out = await requestBoardHelp(scope, {
    cardId: 'window:w-mod', task: 'Is $40 fair?', fromWindowId: 'w-atlas', requesterAgentId: 'atlas', fromLabel: 'Atlas', waitSeconds: 10,
  });
  expect(askModule).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, workspaceId: 'ws-a', moduleName: 'Price checker' }));
  expect(out).toMatchObject({ agent: 'Price checker', status: 'completed', result: 'Prices look fine.' });
  expect(isBoardRequestId(out.request_id)).toBe(true);
  const cardId = placeHelpCard.mock.calls[0][1].id;
  expect(patchHelpCard).toHaveBeenCalledWith('ws-a', cardId, { status: 'completed', result: 'Prices look fine.', error: null });
  expect(settleHelpCard).toHaveBeenCalledWith('ws-a', { id: cardId }, expect.objectContaining({ status: 'completed' }));
});

test('unknown windows and empty tasks are refused, and a chat agent on the board answers', async () => {
  await expect(requestBoardHelp(scope, { cardId: 'window:nope', task: 'x' })).rejects.toThrow(/not on the board/);
  await expect(requestBoardHelp(scope, { cardId: 'window:w-mod', task: '  ' })).rejects.toThrow(/Describe the task/);
  const out = await requestBoardHelp(scope, {
    cardId: 'window:w-atlas', task: 'Summarise the board', fromWindowId: 'w-cli', fromLabel: 'Claude Code', waitSeconds: 5,
  });
  expect(out).toMatchObject({ agent: 'atlas', status: 'completed', result: 'answer for atlas: Summarise the board' });
  expect(out.request_id).toMatch(/^board:/);
  expect(isBoardRequestId(out.request_id)).toBe(true);
});

test('an agent asks LeadHound: the hunt fills the LeadHound window and the leads come back', async () => {
  const out = await requestBoardHelp(scope, {
    cardId: 'window:w-lh', task: 'Sell: AI receptionists\nMarket: dental practices', fromWindowId: 'w-atlas', fromLabel: 'Atlas', waitSeconds: 30,
  });
  expect(runLeadHound).toHaveBeenCalledWith(expect.objectContaining({ business: 'AI receptionists', market: 'dental practices' }), expect.anything());
  expect(placeHelpCard).toHaveBeenCalledWith('ws-a', expect.objectContaining({ executor: 'leadhound', toWindowId: 'w-lh' }));
  expect(patchHelpCard).toHaveBeenCalledWith('ws-a', 'w-lh', { leadHound: expect.objectContaining({ hunting: true }) });
  expect(patchHelpCard).toHaveBeenCalledWith('ws-a', 'w-lh', { leadHound: expect.objectContaining({ result: expect.objectContaining({ ok: true }) }) });
  expect(out).toMatchObject({ agent: 'LeadHound', status: 'completed', result: expect.stringContaining('Bright Smiles** (fit 92)') });
});
