/** @jest-environment jsdom */
// A model Pat picks in a chat reaches Sam's open copy at once: Pat's browser
// tells the board once the agent is saved, and Sam's fetches the agents again
// when the board says so (src/lib/collaboration/agentChanges.js), so Sam's
// model chip shows the new model with no reload. The relay between the two
// is in tests/agentChangeRelay.test.js. All people and models are made up.
import React from 'react';
import { jest } from '@jest/globals';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';

const SAVED = { id: 'atlas', name: 'Atlas', model_provider: 'openai', model_name: 'gpt-4o' };
let saved = { ...SAVED };
const getAgents = jest.fn(async () => [{ ...saved }]);
const saveAgent = jest.fn(async (agent) => agent);
jest.unstable_mockModule('../src/lib/api.js', () => ({ api: { getAgents, saveAgent } }));

const { getAgentById, initializeAgents, subscribe, updateAgent } = await import('../src/lib/agentStore.js');
const { followAgentChanges, useAgentChanges } = await import('../src/lib/collaboration/agentChanges.js');
const { emitBoardEvent } = await import('../src/lib/collaboration/boardEvents.js');
const { resetLivePresenceSenders, setLivePresenceSenders } = await import('../src/lib/collaboration/liveText.js');
const { useChatActions } = await import('../src/components/chat/useChatActions.js');
const { useModelCapabilities } = await import('../src/components/chat/useModelCapabilities.js');
const { ModelChip } = await import('../src/components/chat/ModelChip.jsx');

const CHANGED = { type: 'agent.changed', agentId: 'atlas', clientId: 'made-up-pat-browser' };

/** Sam's chip in Sam's open copy of the chat, from the agent this browser holds. */
function SamsChip() {
  const agent = React.useSyncExternalStore(subscribe, () => getAgentById('atlas'));
  const capabilities = useModelCapabilities(agent, { demoMode: true });
  return <ModelChip capabilities={capabilities} provider={agent.model_provider} />;
}
const chip = () => screen.getByTestId('chat-capabilities').textContent;

beforeEach(async () => {
  saved = { ...SAVED };
  await initializeAgents();
  getAgents.mockClear();
  saveAgent.mockClear();
  resetLivePresenceSenders();
});

test("Pat's pick reaches Sam's open chip once the board says so, with no reload", async () => {
  const stop = followAgentChanges();
  render(<SamsChip />);
  expect(chip()).toContain('gpt-4o');
  // Pat's browser saved grok-4; Sam's browser does not know yet.
  saved = { ...saved, model_provider: 'xai', model_name: 'grok-4' };
  expect(chip()).toContain('gpt-4o');
  await act(async () => { emitBoardEvent(CHANGED); });
  await waitFor(() => expect(chip()).toContain('grok-4'));
  expect(getAgents).toHaveBeenCalledTimes(1);
  stop();
  await act(async () => { emitBoardEvent(CHANGED); });
  expect(getAgents).toHaveBeenCalledTimes(1);
});

test('changes said while the agents are being fetched make one more fetch, not one each', async () => {
  let release;
  getAgents.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve([{ ...saved }]); }));
  const stop = followAgentChanges();
  for (let said = 0; said < 5; said += 1) emitBoardEvent(CHANGED);
  expect(getAgents).toHaveBeenCalledTimes(1);
  saved = { ...saved, model_provider: 'xai', model_name: 'grok-4' };
  await act(async () => { release(); });
  await waitFor(() => expect(getAgents).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(getAgentById('atlas').model_name).toBe('grok-4'));
  stop();
});

test("Pat's own save while the agents are being fetched makes one more fetch, so an older answer never stays", async () => {
  let release;
  getAgents.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const stop = followAgentChanges();
  emitBoardEvent(CHANGED);
  // That fetch will answer with the agent from before Pat's save below.
  const before = { ...saved };
  saved = { ...saved, model_provider: 'xai', model_name: 'grok-4' };
  updateAgent({ ...saved });
  await act(async () => { release([before]); });
  await waitFor(() => expect(getAgents).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(getAgentById('atlas').model_name).toBe('grok-4'));
  stop();
});

test('a board back from a dropped connection fetches the agents once, for changes said while it was away', async () => {
  const { rerender, unmount } = renderHook(({ status }) => useAgentChanges(true, status), { initialProps: { status: 'connecting' } });
  rerender({ status: 'live' });
  // The first time the board is live, startup has just fetched the agents.
  expect(getAgents).not.toHaveBeenCalled();
  rerender({ status: 'reconnecting' });
  saved = { ...saved, model_provider: 'xai', model_name: 'grok-4' };
  await act(async () => { rerender({ status: 'live' }); });
  await waitFor(() => expect(getAgentById('atlas').model_name).toBe('grok-4'));
  expect(getAgents).toHaveBeenCalledTimes(1);
  unmount();
  await act(async () => { emitBoardEvent(CHANGED); });
  expect(getAgents).toHaveBeenCalledTimes(1);
});

test('a board not shared live follows no changes and fetches nothing', async () => {
  const { rerender, unmount } = renderHook(({ status }) => useAgentChanges(false, status), { initialProps: { status: 'live' } });
  rerender({ status: 'reconnecting' });
  rerender({ status: 'live' });
  await act(async () => { emitBoardEvent(CHANGED); });
  expect(getAgents).not.toHaveBeenCalled();
  unmount();
});

test("Pat's pick is told to the board only once it is saved, and a failed save tells no one", async () => {
  const told = [];
  setLivePresenceSenders({ sendAgent: (payload) => { told.push(payload); return true; } });
  const props = { win: { id: 'made-up-chat' }, agent: getAgentById('atlas'), msgs: [], setMsgs: () => {}, send: () => {}, sending: false };
  const { result } = renderHook(() => useChatActions(props));
  let finishSave;
  saveAgent.mockImplementationOnce((agent) => new Promise((resolve) => { finishSave = () => resolve(agent); }));
  let picking;
  act(() => { picking = result.current.selectModel('xai', 'grok-4'); });
  expect(saveAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'atlas', model_provider: 'xai', model_name: 'grok-4' }));
  expect(told).toEqual([]);
  await act(async () => { finishSave(); await picking; });
  expect(told).toEqual([{ type: 'agent.changed', agentId: 'atlas' }]);

  saveAgent.mockRejectedValueOnce(new Error('made-up save failure'));
  await act(async () => { await result.current.selectModel('openai', 'gpt-4o'); });
  expect(told).toHaveLength(1);
  expect(result.current.modelStatus).toMatch(/^Could not switch/);
});
