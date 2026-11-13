/** @jest-environment jsdom */
// The other places that save an agent with another model tell the board too,
// once the save went through, so teammates' open copies of the chat show it at
// once: Auto-pick before a message goes out, and the agent designer's edit.
// (The model chip is in tests/agentChangeFollow.test.jsx, the agent's own
// window in tests/agentWindowSaveTruth.test.jsx.) A failed save tells no one.
// All people and models are made up.
import { jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';

const agent = { id: 'atlas', name: 'Atlas', role: 'Made-up role', model_provider: 'openai', model_name: 'gpt-4o' };
const saveAgent = jest.fn();
const updateAgentConfig = jest.fn();
const getUserKeys = jest.fn(async () => [{ provider: 'xai', hasKey: true }]);
const getToolCatalog = jest.fn(async () => ({ tools: [], categories: [] }));
const updateAgent = jest.fn();
const autoPickModel = jest.fn(() => ({
  changed: true, provider: 'xai', model: 'grok-4', family: 'made-up', strength: 'made-up', why: 'Made-up reason.',
}));
jest.unstable_mockModule('../src/lib/api.js', () => ({ api: { saveAgent, updateAgentConfig, getUserKeys, getToolCatalog } }));
jest.unstable_mockModule('../src/lib/agentStore.js', () => ({
  getAgentById: jest.fn(() => agent), getAgents: jest.fn(() => [agent]), addAgent: jest.fn(), updateAgent,
}));
jest.unstable_mockModule('../src/lib/modelStrengths/autoPick.js', () => ({ autoPickModel, runsOfKind: () => [] }));

const { resetLivePresenceSenders, setLivePresenceSenders } = await import('../src/lib/collaboration/liveText.js');
const { useAutoPick } = await import('../src/components/chat/useAutoPick.js');
const { useAgentDesigner } = await import('../src/components/windows/agentDesigner/useAgentDesigner.js');

let told;

beforeEach(() => {
  jest.clearAllMocks();
  told = [];
  resetLivePresenceSenders();
  setLivePresenceSenders({ sendAgent: (payload) => { told.push(payload); return true; } });
});

test('Auto-pick switching the model tells the board once the save went through, and a failed save tells no one', async () => {
  let finishSave;
  saveAgent.mockImplementationOnce(() => new Promise((resolve) => { finishSave = () => resolve({ ok: true }); }));
  const onUpdate = jest.fn();
  const { result } = renderHook(() => useAutoPick({ win: { id: 'made-up-chat', autoModel: true }, onUpdate, agent }));
  await waitFor(() => expect(getUserKeys).toHaveBeenCalled());
  let sending;
  act(() => { sending = result.current.beforeSend('A made-up question'); });
  expect(saveAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'atlas', model_provider: 'xai', model_name: 'grok-4' }));
  expect(told).toEqual([]);
  await act(async () => { finishSave(); await sending; });
  expect(updateAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'atlas', model_name: 'grok-4' }));
  expect(told).toEqual([{ type: 'agent.changed', agentId: 'atlas' }]);

  saveAgent.mockRejectedValueOnce(new Error('made-up save failure'));
  await act(async () => { await result.current.beforeSend('A made-up question'); });
  expect(told).toHaveLength(1);
  expect(onUpdate).toHaveBeenLastCalledWith({ autoPick: expect.objectContaining({ keep: true }) });
});

test("the agent designer's edit tells the board once it is saved, and a failed save tells no one", async () => {
  updateAgentConfig.mockImplementationOnce(async (id, payload) => ({ ...payload, id }));
  const { result } = renderHook(() => useAgentDesigner({ id: 'made-up-designer', agentId: 'atlas' }, jest.fn(), jest.fn(), [agent], []));
  await waitFor(() => expect(getToolCatalog).toHaveBeenCalled());
  act(() => { result.current.setProvider('xai'); result.current.setModel('grok-4'); });
  await act(async () => { await result.current.createAgent(); });
  expect(updateAgentConfig).toHaveBeenCalledWith('atlas', expect.objectContaining({ model_provider: 'xai', model_name: 'grok-4' }));
  expect(told).toEqual([{ type: 'agent.changed', agentId: 'atlas' }]);

  updateAgentConfig.mockRejectedValueOnce(new Error('made-up save failure'));
  await act(async () => { await result.current.createAgent(); });
  expect(told).toHaveLength(1);
  expect(result.current.status).toBe('made-up save failure');
});
