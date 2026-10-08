import { jest } from '@jest/globals';

const spawnCanvasWindow = jest.fn();
const generateModule = jest.fn();
const commitModuleWindow = jest.fn();
const patchLiveModuleWindow = jest.fn(async () => true);
const requireWorkspaceMember = jest.fn(async () => ({}));

jest.unstable_mockModule('../server/db.js', () => ({ default: {} }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/memory.js', () => ({
  getAgent: async () => ({ model_provider: 'openrouter', model_name: 'some/model' }),
  getSubAgentById: async () => null,
}));
jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  resolveChatModelConfig: (o = {}) => ({ provider: o.modelProvider || 'default', model: o.modelName || 'default-model' }),
}));
jest.unstable_mockModule('../server/collaboration/workspaceMutations.js', () => ({ spawnCanvasWindow }));
jest.unstable_mockModule('../server/modules/generator.js', () => ({ generateModule }));
jest.unstable_mockModule('../server/modules/canvasModuleWindow.js', () => ({ commitModuleWindow, patchLiveModuleWindow }));

const { handleModuleTool } = await import('../server/tools/handlers/modules.js');
const { FAMILY_DEFAULT_TOOL_NAMES } = await import('../server/tools/rbac/familyBaseline.js');
const { TOOL_DEFINITIONS } = await import('../server/tools/definitions.js');

const ctx = { workspaceId: 'w1', userId: 7 };

beforeEach(() => {
  jest.clearAllMocks();
  spawnCanvasWindow.mockResolvedValue({ window: { id: 'win-1' }, revision: 3 });
  commitModuleWindow.mockResolvedValue({ revision: 4 });
});

test('make_module opens a building window, then fills it with the finished module', async () => {
  generateModule.mockImplementation(async ({ onDelta }) => {
    onDelta('```json', { attempt: 1, text: '```json' });
    return { manifest: { name: 'Habit tracker', size: { w: 520, h: 420 }, permissions: [] }, source: '<div>habits</div>', model: 'm' };
  });
  const out = await handleModuleTool('censai', 'make_module', { request: 'a habit tracker for my team' }, ctx);

  expect(requireWorkspaceMember).toHaveBeenCalledWith({}, expect.objectContaining({ workspaceId: 'w1', userId: 7, roles: ['owner', 'admin', 'member'] }));
  expect(spawnCanvasWindow).toHaveBeenCalledWith({}, expect.objectContaining({ kind: 'module', title: 'Habit tracker', request: 'a habit tracker for my team', agentId: 'censai' }));
  // The agent's own model builds it.
  expect(generateModule.mock.calls[0][0].config).toEqual({ provider: 'openrouter', model: 'some/model' });
  expect(patchLiveModuleWindow).toHaveBeenCalledWith('w1', 'win-1', expect.objectContaining({ buildPreview: '```json' }));
  const commit = commitModuleWindow.mock.calls[0][1];
  expect(commit).toMatchObject({ workspaceId: 'w1', windowId: 'win-1', actor: { id: 'censai', label: 'Censai' } });
  expect(commit.patch).toMatchObject({ status: 'ready', title: 'Habit tracker', source: '<div>habits</div>', w: 520, h: 420, versionIndex: 0 });
  expect(out).toMatch(/Built the "Habit tracker" module/);
});

test('a failed build leaves the window in its error state with the reason', async () => {
  generateModule.mockRejectedValue(new Error('The model did not return a working module'));
  const out = await handleModuleTool('censai', 'make_module', { request: 'asteroids' }, ctx);
  expect(commitModuleWindow.mock.calls[0][1].patch).toMatchObject({ status: 'error', error: 'The model did not return a working module' });
  expect(out).toMatch(/^Error: the module could not be built/);
});

test('every family agent can build modules, and the tool is declared once', () => {
  for (const tools of Object.values(FAMILY_DEFAULT_TOOL_NAMES)) expect(tools).toContain('make_module');
  expect(TOOL_DEFINITIONS.filter(t => t.function.name === 'make_module')).toHaveLength(1);
});

test('without a workspace or request it refuses', async () => {
  await expect(handleModuleTool('censai', 'make_module', { request: 'x' }, {})).rejects.toThrow(/signed-in workspace/);
  expect(await handleModuleTool('censai', 'make_module', { request: '  ' }, ctx)).toMatch(/^Error/);
  expect(spawnCanvasWindow).not.toHaveBeenCalled();
});

test('make_module from a chat window opens the module next to that chat', async () => {
  generateModule.mockResolvedValue({ manifest: { name: 'Timer', size: { w: 440, h: 520 }, permissions: [] }, source: '<div>t</div>', model: 'm' });
  await handleModuleTool('censai', 'make_module', { request: 'a timer' }, { ...ctx, windowId: 'chat-9' });
  expect(spawnCanvasWindow).toHaveBeenCalledWith({}, expect.objectContaining({ nearWindowId: 'chat-9' }));
});
