/** @jest-environment jsdom */
// A model Pat picks for an agent made on the board (with the agent designer,
// not a built-in one) reaches Sam's open copy of its chat at once, and is
// still there after a reload. The server's agent list holds only the
// built-in agents, so each browser fetches the board's own agents one by one
// (src/lib/agentStore.js): when the board says an agent changed, and again
// after laying in the board's own copies when it opens the board, since the
// model is kept with the agent on the server and the board's copy can be
// older. All people, agents and models are made up.
import React from 'react';
import { jest } from '@jest/globals';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';

// What the server keeps for each agent; Pat's saves change it.
const server = {};
const getAgents = jest.fn(async () => [{ id: 'atlas', name: 'Atlas', model_provider: 'openai', model_name: 'gpt-4o' }]);
const getAgent = jest.fn(async (id) => (server[id] ? { ...server[id] } : null));
const saveAgent = jest.fn(async (agent) => agent);
jest.unstable_mockModule('../src/lib/api.js', () => ({ api: { getAgents, getAgent, saveAgent } }));

const store = await import('../src/lib/agentStore.js');
const { followAgentChanges, useAgentChanges } = await import('../src/lib/collaboration/agentChanges.js');
const { emitBoardEvent } = await import('../src/lib/collaboration/boardEvents.js');
const { useModelCapabilities } = await import('../src/components/chat/useModelCapabilities.js');
const { ModelChip } = await import('../src/components/chat/ModelChip.jsx');

/** An agent made with the agent designer, as the server keeps it. */
const madeUp = (id, model = 'gpt-4o') => ({
  id, name: `Made-up ${id}`, model_provider: 'openai', model_name: model, system_prompt: 'Made-up instructions',
});
/** The same agent as the board keeps it (extraAgents), with what only the board knows. */
const boardCopy = (id) => ({ ...madeUp(id), agentType: 'core', glyph: 'M' });
/** Pat's browser saved `model` for the agent; Sam's does not know yet. */
const patPicks = (id, model) => { server[id] = { ...server[id], model_provider: 'xai', model_name: model }; };
const changed = (agentId) => ({ type: 'agent.changed', agentId, clientId: 'made-up-pat-browser' });
const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

/** Sam's chip in Sam's open copy of the agent's chat. */
function SamsChip({ id }) {
  const agent = React.useSyncExternalStore(store.subscribe, () => store.getAgentById(id));
  const capabilities = useModelCapabilities(agent, { demoMode: true });
  return <ModelChip capabilities={capabilities} provider={agent.model_provider} />;
}
const chip = () => screen.getByTestId('chat-capabilities').textContent;

beforeEach(() => {
  getAgents.mockClear();
  getAgent.mockClear();
});

test("a model Pat picks for the board's own agent reaches Sam's open chip once the board says so, with no reload", async () => {
  const id = 'made-up-helper';
  server[id] = madeUp(id);
  // Sam's browser opened the board with its own copy of the agent.
  store.addAgent(boardCopy(id));
  const stop = followAgentChanges();
  render(<SamsChip id={id} />);
  expect(chip()).toContain('gpt-4o');
  patPicks(id, 'grok-4');
  await act(async () => { emitBoardEvent(changed(id)); });
  await waitFor(() => expect(chip()).toContain('grok-4'));
  // What only the board knows about the agent stays.
  expect(store.getAgentById(id)).toEqual(expect.objectContaining({ agentType: 'core', glyph: 'M', model_provider: 'xai' }));
  stop();
});

test('two quick changes the board says as one both reach Sam; built-in agents come only through the list', async () => {
  const [writer, looker] = ['made-up-writer', 'made-up-looker'];
  for (const id of [writer, looker]) {
    server[id] = madeUp(id);
    store.addAgent(boardCopy(id));
  }
  const stop = followAgentChanges();
  patPicks(writer, 'grok-4');
  patPicks(looker, 'grok-3');
  // The board says only the latest change one browser makes within a quarter second.
  await act(async () => { emitBoardEvent(changed(looker)); });
  await waitFor(() => expect(store.getAgentById(writer).model_name).toBe('grok-4'));
  expect(store.getAgentById(looker).model_name).toBe('grok-3');
  expect(getAgents).toHaveBeenCalledTimes(1);
  const fetched = getAgent.mock.calls.map(([id]) => id);
  expect(fetched).toEqual(expect.arrayContaining([writer, looker]));
  expect(fetched).not.toContain('atlas');
  expect(fetched).not.toContain('censai');
  stop();
});

test("after a reload the model Pat picked is still there, though the board's own copy still says the old one", async () => {
  const id = 'made-up-planner';
  server[id] = { ...madeUp(id), model_provider: 'xai', model_name: 'grok-4' };
  await jest.isolateModulesAsync(async () => {
    const page = await import('../src/lib/agentStore.js');
    expect(page.getAgentById(id)).toBeUndefined();
    const opening = page.applyBoardAgents([boardCopy(id)]);
    expect(page.getAgentById(id).model_name).toBe('gpt-4o');
    await opening;
    expect(page.getAgentById(id)).toEqual(expect.objectContaining({ model_provider: 'xai', model_name: 'grok-4', agentType: 'core' }));
  });
});

test("Pat's own pick while the agent is being fetched is never put back by the older answer", async () => {
  const id = 'made-up-editor';
  server[id] = madeUp(id);
  store.addAgent(boardCopy(id));
  let release;
  getAgent.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const fetching = store.refreshAgent(id);
  const before = { ...server[id] };
  // Pat picks grok-4 in this browser while that fetch is under way: saved, then shown.
  patPicks(id, 'grok-4');
  store.updateAgent({ ...store.getAgentById(id), model_provider: 'xai', model_name: 'grok-4' });
  const seen = [];
  const stopSeeing = store.subscribe(() => seen.push(store.getAgentById(id).model_name));
  release(before);
  await fetching;
  await waitFor(() => expect(getAgent).toHaveBeenCalledTimes(2));
  await settle();
  stopSeeing();
  expect(seen).not.toContain('gpt-4o');
  expect(store.getAgentById(id).model_name).toBe('grok-4');
});

test('changes said while an agent is being fetched make one more fetch, not one each', async () => {
  const id = 'made-up-runner';
  server[id] = madeUp(id);
  store.addAgent(boardCopy(id));
  let release;
  getAgent.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const first = store.refreshAgent(id);
  for (let said = 0; said < 5; said += 1) store.refreshAgent(id);
  expect(getAgent).toHaveBeenCalledTimes(1);
  patPicks(id, 'grok-4');
  release(madeUp(id));
  await first;
  await waitFor(() => expect(store.getAgentById(id).model_name).toBe('grok-4'));
  await settle();
  expect(getAgent).toHaveBeenCalledTimes(2);
});

test("an agent the server does not keep, or a fetch that fails, leaves the board's copy as it is", async () => {
  const gone = 'made-up-gone';
  store.addAgent(boardCopy(gone));
  await store.refreshAgent(gone);
  expect(store.getAgentById(gone)).toEqual(boardCopy(gone));
  const id = 'made-up-offline';
  server[id] = { ...madeUp(id), model_name: 'grok-4' };
  store.addAgent(boardCopy(id));
  getAgent.mockRejectedValueOnce(new Error('made-up network failure'));
  await store.refreshAgent(id);
  expect(store.getAgentById(id).model_name).toBe('gpt-4o');
  // A built-in agent is never fetched by itself: the list brings it.
  await store.refreshAgent('atlas');
  expect(getAgent.mock.calls.map(([asked]) => asked)).toEqual([gone, id]);
});

test('a chat naming an agent a teammate made since this browser opened the board fetches it, rather than stand in for another', async () => {
  const { useChatAgent } = await import('../src/components/chat/useChatAgent.js');
  const id = 'made-up-newcomer';
  server[id] = madeUp(id, 'gpt-4.1');
  const { result } = renderHook(() => useChatAgent(id));
  await waitFor(() => expect(result.current.id).toBe(id));
  expect(result.current).toEqual(expect.objectContaining({ name: 'Made-up made-up-newcomer', model_name: 'gpt-4.1' }));
  // One nobody keeps leaves the chat as it was, after one ask.
  const nobody = renderHook(() => useChatAgent('made-up-nobody'));
  await waitFor(() => expect(getAgent).toHaveBeenCalledWith('made-up-nobody'));
  expect(nobody.result.current.id).toBe(store.getAgents()[1].id);
});

test("a board back from a dropped connection fetches its own agents again, for changes said while it was away", async () => {
  const id = 'made-up-away';
  server[id] = madeUp(id);
  store.addAgent(boardCopy(id));
  const { rerender, unmount } = renderHook(({ status }) => useAgentChanges(true, status), { initialProps: { status: 'connecting' } });
  rerender({ status: 'live' });
  expect(getAgent).not.toHaveBeenCalled();
  rerender({ status: 'reconnecting' });
  patPicks(id, 'grok-4');
  await act(async () => { rerender({ status: 'live' }); });
  await waitFor(() => expect(store.getAgentById(id).model_name).toBe('grok-4'));
  unmount();
});
