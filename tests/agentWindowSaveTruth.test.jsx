/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';

const saveAgent = jest.fn();
const getToolCatalog = jest.fn();
const updateAgent = jest.fn();
const agent = {
  id: 'atlas',
  name: 'Atlas',
  role: 'Backend specialist',
  system_prompt: 'Original system',
  model_provider: 'openrouter',
  model_name: 'openrouter/free',
  tool_scopes: { tools: ['recall'] },
};
const systems = { atlas: 'Original system' };

jest.unstable_mockModule('../src/lib/api.js', () => ({
  api: { saveAgent, getToolCatalog },
}));
jest.unstable_mockModule('../src/lib/agentStore.js', () => ({
  getAgentById: jest.fn(() => agent),
  updateAgent,
}));
jest.unstable_mockModule('../src/components/Agents.jsx', () => ({
  AGENT_SYSTEMS: systems,
}));

const { useAgentWindow } = await import('../src/components/agent/useAgentWindow.js');

beforeEach(() => {
  jest.clearAllMocks();
  systems.atlas = 'Original system';
  getToolCatalog.mockResolvedValue({ tools: [], categories: [] });
});

test('a rejected save cannot mutate canvas, prompt defaults, or the local agent store', async () => {
  const onUpdate = jest.fn();
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  saveAgent.mockRejectedValue(Object.assign(new Error('Canonical family agents are product-owned and cannot be modified at runtime.'), {
    status: 409,
  }));
  const { result } = renderHook(() => useAgentWindow({ id: 'win-1', agentId: 'atlas' }, onUpdate));

  act(() => result.current.setDraft('False local prompt'));
  await act(async () => result.current.saveSystem());

  expect(onUpdate).not.toHaveBeenCalled();
  expect(updateAgent).not.toHaveBeenCalled();
  expect(systems.atlas).toBe('Original system');
  expect(result.current.saveStatus).toContain('Save failed');
  consoleError.mockRestore();
});

test('a successful server save commits the same state locally afterward', async () => {
  const onUpdate = jest.fn();
  saveAgent.mockResolvedValue({ ok: true });
  const { result } = renderHook(() => useAgentWindow({ id: 'win-2', agentId: 'atlas' }, onUpdate));

  await waitFor(() => expect(getToolCatalog).toHaveBeenCalled());
  act(() => result.current.setDraft('Verified prompt'));
  await act(async () => result.current.saveSystem());

  expect(saveAgent).toHaveBeenCalledWith(expect.objectContaining({ system_prompt: 'Verified prompt' }));
  expect(onUpdate).toHaveBeenCalledWith({ customSystem: 'Verified prompt' });
  expect(updateAgent).toHaveBeenCalledWith(expect.objectContaining({ system_prompt: 'Verified prompt' }));
  expect(systems.atlas).toBe('Verified prompt');
});
