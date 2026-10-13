/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';

const loadWorkspaceAuthoritatively = jest.fn();
const getSession = jest.fn();
const getCurrentProject = jest.fn();
const setCurrentProject = jest.fn();

jest.unstable_mockModule('../src/lib/api.js', () => ({
  api: { loadWorkspaceAuthoritatively, getSession, getCurrentProject },
}));
jest.unstable_mockModule('../src/lib/agentStore.js', () => ({
  addAgent: jest.fn(), getAgentById: jest.fn(), updateAgent: jest.fn(),
  initializeAgents: jest.fn().mockResolvedValue(undefined),
}));
jest.unstable_mockModule('../src/lib/store.js', () => ({
  useWorkspaceStore: selector => selector({ setCurrentProject }),
}));

const { useAppBootstrap } = await import('../src/app/hooks/useAppBootstrap.js');

describe('app bootstrap workspace recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSession.mockResolvedValue({ authenticated: true, oauthConfigured: false });
    getCurrentProject.mockResolvedValue(null);
  });

  test('unavailable authority never becomes an initialized blank workspace', async () => {
    loadWorkspaceAuthoritatively.mockResolvedValue({
      status: 'unavailable', error: new Error('offline'), cachedValue: { wins: ['safe'] },
    });
    const { result } = renderHook(() => useAppBootstrap());
    await waitFor(() => expect(result.current.dataLoading).toBe(false));
    expect(result.current.initial).toBeNull();
    expect(result.current.isInitialized).toBe(false);
    expect(result.current.workspaceLoad.status).toBe('unavailable');
  });

  test('an explicit authoritative empty result is the only blank boot path', async () => {
    loadWorkspaceAuthoritatively.mockResolvedValue({
      status: 'ready', value: null, revision: 0, workspaceId: null,
    });
    const { result } = renderHook(() => useAppBootstrap());
    await waitFor(() => expect(result.current.dataLoading).toBe(false));
    expect(result.current.initial).toEqual(expect.any(Object));
    expect(result.current.workspaceRevision).toBe(0);
    expect(result.current.workspaceLoad.status).toBe('ready');
  });

  test('retry performs a new authoritative load without fabricating state between attempts', async () => {
    loadWorkspaceAuthoritatively
      .mockResolvedValueOnce({ status: 'unavailable', error: new Error('offline') })
      .mockResolvedValueOnce({ status: 'ready', value: { wins: [] }, revision: 2 });
    const { result } = renderHook(() => useAppBootstrap());
    await waitFor(() => expect(result.current.workspaceLoad.status).toBe('unavailable'));
    act(() => result.current.retryWorkspaceLoad());
    await waitFor(() => expect(result.current.workspaceLoad.status).toBe('ready'));
    expect(loadWorkspaceAuthoritatively).toHaveBeenCalledTimes(2);
    expect(result.current.workspaceRevision).toBe(2);
  });
});
